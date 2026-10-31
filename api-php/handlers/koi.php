<?php
// api-php/handlers/koi.php

require_once __DIR__ . '/../lib/uploads.php';

// Mirrors the original Node app's generateKoiCode()/createKoiCode(): when the
// user leaves the code blank, auto-generate "{2-digit year}{4 random chars}"
// and retry until it's unique against $existingCodes (checked in-memory so a
// whole batch of blank codes doesn't collide with itself).
function generate_koi_code(): string {
    $characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    $random = '';
    for ($i = 0; $i < 4; $i++) {
        $random .= $characters[random_int(0, strlen($characters) - 1)];
    }
    return date('y') . $random;
}

// MySQL strict mode rejects '' for INT/DECIMAL/DATE columns (the frontend
// sends '' for "no pond selected" / empty number fields, not null/omitted).
function blank_to_null($value) {
    // a lone dash is how old spreadsheets write "no value"; MySQL rejects it for numeric and date columns
    if (is_string($value) && preg_match('/^\s*[-\x{2013}\x{2014}]*\s*$/u', $value)) return null;
    return ($value === '' || $value === null) ? null : $value;
}

function create_koi_code(string $requestedCode, array &$existingCodes): string {
    $code = strtoupper(trim($requestedCode));
    if ($code !== '') return $code;

    for ($attempt = 0; $attempt < 10; $attempt++) {
        $generated = generate_koi_code();
        if (!isset($existingCodes[$generated]) && !query_one('SELECT 1 FROM koi WHERE code = ?', [$generated])) {
            return $generated;
        }
    }
    throw new RuntimeException('Kode koi otomatis gagal dibuat');
}

// Default: only fish that are in the field. ?archived=1 returns only archived fish and
// ?include_archived=1 returns everything (used by pages that only need to look fish up).
route('GET', '/koi', function () {
    $where = 'WHERE koi.archived_at IS NULL';
    $order = 'koi.seq DESC, koi.id DESC';
    if (($_GET['include_archived'] ?? '') === '1') {
        $where = '';
    } elseif (($_GET['archived'] ?? '') === '1') {
        $where = 'WHERE koi.archived_at IS NOT NULL';
        $order = 'koi.archived_at DESC, koi.id DESC';
    }
    $rows = query(
        "SELECT koi.*, ponds.name AS pond_name, COALESCE(NULLIF(ponds.location, ''), NULLIF(koi.area, '')) AS pond_location,
                (SELECT growth_logs.length_cm FROM koi_growth_logs growth_logs
                 WHERE growth_logs.koi_id = koi.id
                 ORDER BY growth_logs.measured_at DESC, growth_logs.id DESC LIMIT 1) AS latest_length_cm
         FROM koi LEFT JOIN ponds ON ponds.id = koi.pond_id
         $where
         ORDER BY $order"
    );
    // every row carries its stored `seq` ("nomor urut", position in the list, movable) already
    send_json(200, $rows);
});

function archive_request_ids(): array {
    $body = read_json_body();
    $ids = array_values(array_unique(array_filter(
        array_map('intval', is_array($body['ids'] ?? null) ? $body['ids'] : []),
        fn ($id) => $id > 0
    )));
    if (!$ids) send_error(422, 'Pilih minimal satu ikan');
    return [$ids, $body];
}

// "Nomor urut" is the position of the fish in its list (Data Ikan or Archive) and can be set freely. A fish moved to a number that is
// already taken takes that place and the fish from there on shift one step, so the numbers stay 1..n without gaps or doubles.
route('POST', '/koi/move-seq', function () {
    require_account();
    $body = read_json_body();
    $id = (int)($body['id'] ?? 0);
    $target = (int)($body['seq'] ?? 0);
    if ($id <= 0) send_error(422, 'Ikan tidak dikenal');
    if ($target < 1) send_error(422, 'Nomor urut harus angka 1 atau lebih');
    if (!query_one('SELECT id FROM koi WHERE id = ?', [$id])) send_error(404, 'Ikan tidak ditemukan');
    db()->beginTransaction();
    try {
        koi_renumber();   // positions are 1..n before anything moves
        $row = query_one('SELECT seq, archived_at FROM koi WHERE id = ?', [$id]);
        $scope = $row['archived_at'] ? 'archived_at IS NOT NULL' : 'archived_at IS NULL';
        $count = (int)query_one("SELECT COUNT(*) AS c FROM koi WHERE $scope")['c'];
        $old = (int)$row['seq'];
        $new = min($target, $count);
        if ($new < $old) {
            execute("UPDATE koi SET seq = seq + 1, updated_at = updated_at WHERE $scope AND seq >= ? AND seq < ?", [$new, $old]);
        } elseif ($new > $old) {
            execute("UPDATE koi SET seq = seq - 1, updated_at = updated_at WHERE $scope AND seq > ? AND seq <= ?", [$old, $new]);
        }
        if ($new !== $old) execute('UPDATE koi SET seq = ?, updated_at = updated_at WHERE id = ?', [$new, $id]);
        db()->commit();
    } catch (Throwable $e) {
        if (db()->inTransaction()) db()->rollBack();
        throw $e;
    }
    send_json(200, ['ok' => true, 'id' => $id, 'seq' => $new, 'from' => $old, 'total' => $count, 'clamped' => $new !== $target]);
});

route('POST', '/koi/archive', function () {
    require_account();
    [$ids] = archive_request_ids();
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    // Remember the pond name as free text, then detach the fish from the pond list.
    $affected = execute(
        "UPDATE koi LEFT JOIN ponds ON ponds.id = koi.pond_id
         SET koi.archive_location = COALESCE(ponds.name, koi.archive_location),
             koi.pond_id = NULL,
             koi.seq = 0,
             koi.archived_at = NOW()
         WHERE koi.id IN ($placeholders) AND koi.archived_at IS NULL",
        $ids
    )->rowCount();
    if ($affected) { koi_renumber(); koi_facets_cache_clear(); }
    send_json(200, ['ok' => true, 'archived' => $affected]);
});

// One column changed for many fish at once (Edit Masal): the page sends the selected ids in chunks, one UPDATE per chunk.
route('POST', '/koi/bulk-update', function () {
    require_account();
    $body = read_json_body();
    $ids = array_values(array_unique(array_filter(array_map('intval', (array)($body['ids'] ?? [])), fn($id) => $id > 0)));
    $fields = is_array($body['fields'] ?? null) ? $body['fields'] : [];
    if (!$ids) send_error(400, 'Tidak ada ikan yang dipilih');
    if (count($ids) > 500) send_error(400, 'Maksimal 500 ikan per permintaan');

    $allowed = ['pond_id', 'area', 'variety', 'bloodline', 'farm_name', 'breeder', 'parent_info', 'gender', 'parent_type',
                'status', 'birth_date', 'purchase_date', 'purchase_price', 'sale_price', 'current_length_cm', 'notes'];
    $nullable = ['pond_id', 'area', 'birth_date', 'purchase_date', 'purchase_price', 'sale_price', 'current_length_cm'];
    $sets = [];
    $params = [];
    // moving fish to another pond leaves the same note line the old "Ganti masal lokasi kolam" wrote (only for fish that really move)
    if (!empty($body['relocation_note']) && array_key_exists('pond_id', $fields)) {
        $newPondId = blank_to_null($fields['pond_id']);
        $newName = $newPondId ? (string)(query_one('SELECT name FROM ponds WHERE id = ?', [$newPondId])['name'] ?? '') : '';
        if ($newPondId && $newName === '') send_error(400, 'Lokasi tidak ditemukan');
        $newName = $newName !== '' ? $newName : 'Tanpa Lokasi';
        // the relocation line goes on top, then a dashed line and a blank line, then the old note (same style as Catatan masal)
        $relocation = "CONCAT('[', ?, '] Relokasi Masal: Dipindah dari ', COALESCE(oldpond.name, 'Tanpa Lokasi'), ' ke ', ?, '.')";
        $sets[] = "koi.notes = IF(COALESCE(oldpond.name, 'Tanpa Lokasi') <> ?, IF(NULLIF(koi.notes, '') IS NULL, $relocation, CONCAT($relocation, CHAR(10), '-----------', CHAR(10), CHAR(10), koi.notes)), koi.notes)";
        $today = gmdate('Y-m-d');
        array_push($params, $newName, $today, $newName, $today, $newName);
    }
    // Area only (no pond chosen): fish whose pond already lies in that area keep the pond, the others lose it and keep just the area;
    // an empty area clears both, like the edit form does
    if (!empty($body['area_rule']) && array_key_exists('area', $fields)) {
        $area = trim((string)$fields['area']);
        unset($fields['area'], $fields['pond_id']);
        $sets[] = "koi.area = IF(? = '', NULL, IF(LOWER(COALESCE(oldpond.location, '')) = LOWER(?), NULL, ?))";
        array_push($params, $area, $area, $area);
        $sets[] = "koi.pond_id = IF(? = '', NULL, IF(LOWER(COALESCE(oldpond.location, '')) = LOWER(?), koi.pond_id, NULL))";
        array_push($params, $area, $area);
    }
    foreach ($fields as $col => $value) {
        if (!in_array($col, $allowed, true)) send_error(400, "Kolom tidak boleh diubah masal: $col");
        // Catatan masal in add mode: the new text goes on top, separated by a dashed line, above the note the fish already has (nothing is deleted)
        if ($col === 'notes' && !empty($body['notes_append'])) {
            $addition = trim((string)$value);
            if ($addition === '') send_error(400, 'Isi catatan terlebih dahulu');
            // new text on top, a dashed line and a blank line, then the old note (just the new text when there is no old note)
            $sets[] = "koi.notes = IF(NULLIF(koi.notes, '') IS NULL, ?, CONCAT(?, CHAR(10), '-----------', CHAR(10), CHAR(10), koi.notes))";
            array_push($params, $addition, $addition);
            continue;
        }
        $sets[] = "koi.$col = ?";
        $params[] = $col === 'birth_date' || $col === 'purchase_date' ? koi_clean_partial_date($value, $col === 'birth_date' ? 'Tanggal lahir' : 'Tanggal beli')
            : (in_array($col, $nullable, true) ? blank_to_null($value) : (string)$value);
    }
    if (!$sets) send_error(400, 'Tidak ada kolom untuk diubah');

    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $affected = execute('UPDATE koi LEFT JOIN ponds oldpond ON oldpond.id = koi.pond_id SET ' . implode(', ', $sets) . " WHERE koi.id IN ($placeholders)", array_merge($params, $ids))->rowCount();
    $linked = koi_sync_session_links(db(), $ids);
    koi_facets_cache_clear();
    // fish of a breeding session keep the Bloodline/Ternakan of their session; tell the page how many of the chosen fish that applies to
    $touchesLinked = (bool)array_intersect(['bloodline', 'farm_name'], array_keys($fields));
    send_json(200, ['ok' => true, 'updated' => $affected, 'requested' => count($ids), 'session_linked' => $touchesLinked ? $linked['checked'] : 0]);
});

// New automatic Kode Koi for the chosen fish (Aksi masal > Kode Koi). Each new code is checked against every fish (archived too);
// the change is written in the fish's Catatan so the old code can still be found.
route('POST', '/koi/regenerate-codes', function () {
    require_account();
    $body = read_json_body();
    $ids = array_values(array_unique(array_filter(array_map('intval', (array)($body['ids'] ?? [])), fn($id) => $id > 0)));
    if (!$ids) send_error(400, 'Tidak ada ikan yang dipilih');
    if (count($ids) > 200) send_error(400, 'Maksimal 200 ikan per permintaan');

    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $rows = query("SELECT id, code FROM koi WHERE id IN ($placeholders)", $ids);
    $existing = [];
    $changes = [];
    $today = gmdate('Y-m-d');

    db()->beginTransaction();
    try {
        foreach ($rows as $row) {
            $new = create_koi_code('', $existing);
            $existing[$new] = true;
            $note = "[$today] Kode Koi diganti otomatis: {$row['code']} -> $new.";
            execute("UPDATE koi SET code = ?, notes = IF(NULLIF(notes, '') IS NULL, ?, CONCAT(?, CHAR(10), '-----------', CHAR(10), CHAR(10), notes)) WHERE id = ?", [$new, $note, $note, $row['id']]);
            $changes[] = ['id' => (int)$row['id'], 'old' => $row['code'], 'new' => $new];
        }
        db()->commit();
    } catch (Throwable $e) {
        if (db()->inTransaction()) db()->rollBack();
        send_error(500, 'Kode baru gagal dibuat: ' . $e->getMessage());
    }
    send_json(200, ['ok' => true, 'updated' => count($changes), 'changes' => $changes]);
});

route('POST', '/koi/unarchive', function () {
    require_account();
    [$ids, $body] = archive_request_ids();
    $pondId = blank_to_null($body['pond_id'] ?? null);
    if ($pondId !== null) {
        $pondId = (int)$pondId;
        if (!query_one('SELECT id FROM ponds WHERE id = ?', [$pondId])) {
            send_error(422, 'Lokasi tidak ditemukan di daftar kolam');
        }
    }
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $affected = execute(
        "UPDATE koi SET archived_at = NULL, archive_location = NULL, pond_id = ?, seq = 0
         WHERE id IN ($placeholders) AND archived_at IS NOT NULL",
        array_merge([$pondId], $ids)
    )->rowCount();
    if ($affected) { koi_renumber(); koi_facets_cache_clear(); }
    send_json(200, ['ok' => true, 'restored' => $affected]);
});

// Main photo plus history photos of the given fish, used to clean up files after deleting them.
function koi_photo_urls(array $ids): array {
    if (!$ids) return [];
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $rows = query(
        "SELECT image_url FROM koi WHERE id IN ($placeholders) AND image_url IS NOT NULL
         UNION SELECT image_url FROM koi_growth_logs WHERE koi_id IN ($placeholders) AND image_url IS NOT NULL",
        array_merge($ids, $ids)
    );
    return array_column($rows, 'image_url');
}

// Permanent delete, limited to archived fish so it can never remove a fish that is in the field.
route('POST', '/koi/archive-delete', function () {
    require_account();
    [$ids] = archive_request_ids();
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $archivedIds = array_column(query("SELECT id FROM koi WHERE id IN ($placeholders) AND archived_at IS NOT NULL", $ids), 'id');
    $photoUrls = koi_photo_urls($archivedIds);
    $affected = execute("DELETE FROM koi WHERE id IN ($placeholders) AND archived_at IS NOT NULL", $ids)->rowCount();
    if ($affected) { koi_renumber(); koi_facets_cache_clear(); }
    $deletedFiles = delete_upload_files_if_unused($photoUrls);
    send_json(200, ['ok' => true, 'deleted' => $affected, 'deleted_files' => $deletedFiles]);
});

route('POST', '/koi', function () {
    require_account();
    $body = read_json_body();
    $items = $body['items'] ?? null;
    if (!is_array($items) || count($items) === 0) send_error(400, 'Data koi wajib diisi');

    // codes used in this request; the ones already in the database are checked one by one (the unique index has the last word)
    $existingCodes = [];

    $created = [];
    db()->beginTransaction();
    try {
        foreach ($items as $item) {
            if (!is_array($item)) send_error(400, 'Data koi tidak valid');
            try {
                $code = create_koi_code((string)($item['code'] ?? ''), $existingCodes);
            } catch (RuntimeException $e) {
                db()->rollBack();
                send_error(500, $e->getMessage());
            }
            $existingCodes[$code] = true;

            try {
                execute(
                    'INSERT INTO koi (pond_id, code, name, variety, farm_name, breeder, bloodline, gender, parent_type,
                                       image_url, birth_date, purchase_date, purchase_price, current_length_cm,
                                       current_weight_g, status, notes, sale_price, parent_info, area)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [
                        blank_to_null($item['pond_id'] ?? null), $code, $item['name'] ?? null, $item['variety'] ?? null,
                        $item['farm_name'] ?? null, $item['breeder'] ?? null, $item['bloodline'] ?? null,
                        $item['gender'] ?? 'unknown', $item['parent_type'] ?? 'non_indukan', $item['image_url'] ?? null,
                        koi_clean_partial_date($item['birth_date'] ?? null, 'Tanggal lahir'), koi_clean_partial_date($item['purchase_date'] ?? null, 'Tanggal beli'),
                        blank_to_null($item['purchase_price'] ?? null), blank_to_null($item['current_length_cm'] ?? null),
                        blank_to_null($item['current_weight_g'] ?? null), $item['status'] ?? 'active',
                        $item['notes'] ?? null, blank_to_null($item['sale_price'] ?? null), $item['parent_info'] ?? null,
                        blank_to_null($item['pond_id'] ?? null) ? null : blank_to_null($item['area'] ?? null),
                    ]
                );
            } catch (PDOException $e) {
                if (is_duplicate_error($e)) {
                    db()->rollBack();
                    send_error(409, "Kode koi sudah dipakai: $code");
                }
                throw $e;
            }
            $createdId = (int)db()->lastInsertId();
            koi_append_seq($createdId);
            koi_facets_cache_clear();
            koi_ensure_initial_history($createdId);
            koi_sync_session_links(db(), [$createdId]);
            $created[] = query_one('SELECT * FROM koi WHERE id = ?', [$createdId]);
        }
        db()->commit();
    } catch (Throwable $e) {
        if (db()->inTransaction()) db()->rollBack();
        throw $e;
    }

    send_json(201, $created);
});

route_pattern('GET', '#^/koi/(\d+)$#', function (array $m) {
    $koi = query_one(
        'SELECT koi.*, ponds.name AS pond_name FROM koi LEFT JOIN ponds ON ponds.id = koi.pond_id WHERE koi.id = ?',
        [$m[1]]
    );
    if (!$koi) send_error(404, 'Koi tidak ditemukan');
    send_json(200, $koi);
});

// Every fish with a main photo has at least one entry in History Progress Foto: the first photo is kept there as
// "Progress awal". Created with the fish, and for fish saved before this rule it is added the first time the history is read.
function koi_ensure_initial_history(int $koiId): void {
    $koi = query_one('SELECT image_url, current_length_cm, created_at FROM koi WHERE id = ?', [$koiId]);
    if (!$koi || trim((string)($koi['image_url'] ?? '')) === '') return;
    if (query_one('SELECT id FROM koi_growth_logs WHERE koi_id = ? AND image_url IS NOT NULL LIMIT 1', [$koiId])) return;
    execute(
        'INSERT INTO koi_growth_logs (koi_id, measured_at, length_cm, image_url, notes, sort_order) VALUES (?, ?, ?, ?, ?, 1)',
        [$koiId, substr((string)($koi['created_at'] ?? ''), 0, 10) ?: date('Y-m-d'), blank_to_null($koi['current_length_cm'] ?? null), $koi['image_url'], 'Progress awal']
    );
}

// Adds a photo to a fish's History Progress Foto as the newest entry, unless it is already there.
function koi_add_history_if_missing(int $koiId, string $imageUrl, $lengthCm, $weightG, string $notes): void {
    if ($imageUrl === '' || query_one('SELECT id FROM koi_growth_logs WHERE koi_id = ? AND image_url = ? LIMIT 1', [$koiId, $imageUrl])) return;
    execute(
        'INSERT INTO koi_growth_logs (koi_id, measured_at, length_cm, weight_g, image_url, notes, sort_order)
         SELECT ?, ?, ?, ?, ?, ?, COALESCE(MAX(sort_order) + 1, 1) FROM koi_growth_logs WHERE koi_id = ?',
        [$koiId, date('Y-m-d'), ($lengthCm === '' ? null : $lengthCm), ($weightG === '' ? null : $weightG), $imageUrl, $notes, $koiId]
    );
}

route_pattern('PATCH', '#^/koi/(\d+)$#', function (array $m) {
    require_account();
    $body = read_json_body();
    $cols = ['pond_id', 'code', 'name', 'variety', 'farm_name', 'breeder', 'bloodline', 'gender', 'parent_type',
             'image_url', 'birth_date', 'purchase_date', 'purchase_price', 'current_length_cm', 'current_weight_g',
             'status', 'notes', 'sale_price', 'parent_info', 'archive_location', 'area'];
    $fields = [];
    $params = [];
    $numericOrDateCols = ['pond_id', 'area', 'birth_date', 'purchase_date', 'purchase_price', 'current_length_cm', 'current_weight_g', 'sale_price'];
    foreach ($cols as $col) {
        if (array_key_exists($col, $body)) {
            $fields[] = "$col = ?";
            $params[] = $col === 'birth_date' || $col === 'purchase_date' ? koi_clean_partial_date($body[$col], $col === 'birth_date' ? 'Tanggal lahir' : 'Tanggal beli')
                : (in_array($col, $numericOrDateCols, true) ? blank_to_null($body[$col]) : $body[$col]);
        }
    }
    if (!$fields) send_error(400, 'Tidak ada field untuk diupdate');
    $params[] = $m[1];

    // Like the original updateKoi(): a new main photo keeps both photos in History Progress Foto,
    // the old one first and the new one as the latest (with the size sent in this update).
    $before = query_one('SELECT image_url, current_length_cm, current_weight_g FROM koi WHERE id = ?', [$m[1]]);
    $newImage = trim((string)($body['image_url'] ?? ''));
    $imageChanged = $before && $newImage !== '' && $newImage !== (string)$before['image_url'];
    if ($imageChanged && !empty($before['image_url'])) {
        koi_add_history_if_missing((int)$m[1], $before['image_url'], $before['current_length_cm'], $before['current_weight_g'], 'Progress sebelum update foto');
    }

    try {
        execute('UPDATE koi SET ' . implode(', ', $fields) . ' WHERE id = ?', $params);
    } catch (PDOException $e) {
        if (is_duplicate_error($e)) send_error(409, 'Kode koi sudah dipakai');
        throw $e;
    }
    koi_sync_session_links(db(), [(int)$m[1]]);
    if (array_intersect(array_keys($body), ['pond_id', 'variety', 'bloodline', 'farm_name', 'breeder', 'status', 'name', 'parent_info'])) koi_facets_cache_clear();

    if ($imageChanged) {
        $length = array_key_exists('current_length_cm', $body) ? blank_to_null($body['current_length_cm']) : $before['current_length_cm'];
        koi_add_history_if_missing((int)$m[1], $newImage, $length, null, 'Progress update foto');
    }

    $koi = query_one('SELECT * FROM koi WHERE id = ?', [$m[1]]);
    if (!$koi) send_error(404, 'Koi tidak ditemukan');
    send_json(200, $koi);
});

route_pattern('DELETE', '#^/koi/(\d+)$#', function (array $m) {
    require_account();
    $photoUrls = koi_photo_urls([(int)$m[1]]);
    execute('DELETE FROM koi WHERE id = ?', [$m[1]]);
    koi_renumber();
    koi_facets_cache_clear();
    $deletedFiles = delete_upload_files_if_unused($photoUrls);
    send_json(200, ['ok' => true, 'deleted_files' => $deletedFiles]);
});

route('POST', '/koi/merge', function () {
    require_account();
    $body = read_json_body();
    $targetId = (int)($body['target_id'] ?? 0);
    $rawSourceIds = is_array($body['source_ids'] ?? null) ? $body['source_ids'] : [];
    $sourceIds = [];
    foreach ($rawSourceIds as $sid) {
        $sid = (int)$sid;
        if ($sid > 0 && $sid !== $targetId && !in_array($sid, $sourceIds, true)) $sourceIds[] = $sid;
    }
    $orderedPhotos = is_array($body['ordered_photos'] ?? null) ? $body['ordered_photos'] : [];

    if (!$targetId || count($sourceIds) === 0) {
        send_error(422, 'Minimal pilih dua ikan dan tentukan ikan acuan.');
    }

    $selectedIds = array_merge([$targetId], $sourceIds);
    $placeholders = implode(',', array_fill(0, count($selectedIds), '?'));
    $selectedKoi = query("SELECT * FROM koi WHERE id IN ($placeholders)", $selectedIds);
    if (count($selectedKoi) !== count($selectedIds)) {
        send_error(404, 'Sebagian data ikan tidak ditemukan.');
    }

    db()->beginTransaction();
    try {
        $today = date('Y-m-d');
        $previewPhoto = null;

        $sourcePlaceholders = implode(',', array_fill(0, count($sourceIds), '?'));
        execute("UPDATE koi_growth_logs SET koi_id = ? WHERE koi_id IN ($sourcePlaceholders)", array_merge([$targetId], $sourceIds));

        $totalPhotos = count($orderedPhotos);
        foreach ($orderedPhotos as $index => $photo) {
            if (!is_array($photo)) $photo = [];
            $sortOrder = $totalPhotos - $index;
            $historyId = (int)($photo['history_id'] ?? 0);
            $imageUrl = trim((string)($photo['image_url'] ?? ''));
            $lengthCm = (isset($photo['length_cm']) && $photo['length_cm'] !== null && $photo['length_cm'] !== '') ? (float)$photo['length_cm'] : null;
            $weightG = (isset($photo['weight_g']) && $photo['weight_g'] !== null && $photo['weight_g'] !== '') ? (float)$photo['weight_g'] : null;
            $measuredAt = trim((string)($photo['measured_at'] ?? '')) ?: $today;
            $notes = trim((string)($photo['notes'] ?? '')) ?: null;

            // a photo that is already one of the kept fish's history entries (the merged fish's entries were moved to it above) is only re-ordered, never added twice
            $existingId = !$historyId && $imageUrl !== '' ? (int)(query_one('SELECT id FROM koi_growth_logs WHERE koi_id = ? AND image_url = ? ORDER BY id LIMIT 1', [$targetId, $imageUrl])['id'] ?? 0) : 0;
            if ($existingId) $historyId = $existingId;

            if ($historyId) {
                execute(
                    'UPDATE koi_growth_logs SET koi_id = ?, sort_order = ? WHERE id = ? AND koi_id = ?',
                    [$targetId, $sortOrder, $historyId, $targetId]
                );
            } elseif ($imageUrl !== '') {
                execute(
                    'INSERT INTO koi_growth_logs (koi_id, measured_at, length_cm, weight_g, image_url, notes, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [$targetId, $measuredAt, $lengthCm, $weightG, $imageUrl, $notes, $sortOrder]
                );
            }

            if ($imageUrl !== '' && !$previewPhoto) {
                $previewPhoto = ['image_url' => $imageUrl, 'length_cm' => $lengthCm, 'weight_g' => $weightG];
            }
        }

        if (!$previewPhoto) {
            $latestHistory = query_one(
                'SELECT image_url, length_cm, weight_g FROM koi_growth_logs
                 WHERE koi_id = ? AND image_url IS NOT NULL
                 ORDER BY sort_order DESC, measured_at DESC, created_at DESC, id DESC LIMIT 1',
                [$targetId]
            );
            $previewPhoto = $latestHistory ?: null;
        }

        if ($previewPhoto && !empty($previewPhoto['image_url'])) {
            execute(
                'UPDATE koi SET image_url = ?, current_length_cm = COALESCE(?, current_length_cm), current_weight_g = COALESCE(?, current_weight_g), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [$previewPhoto['image_url'], $previewPhoto['length_cm'] ?? null, $previewPhoto['weight_g'] ?? null, $targetId]
            );
        }

        // Note on the kept fish: a line saying what was merged, the notes of the merged fish (with their code), then a dashed line
        // and the old note below (same style as Catatan masal). The merged fish are deleted right after, so their notes would be lost otherwise.
        $mergedCodes = [];
        $mergedNotes = [];
        $keptNote = '';
        foreach ($selectedKoi as $koiRow) {
            if ((int)$koiRow['id'] === $targetId) {
                $keptNote = trim((string)($koiRow['notes'] ?? ''));
                continue;
            }
            $mergedCodes[] = (string)$koiRow['code'];
            $sourceNote = trim((string)($koiRow['notes'] ?? ''));
            if ($sourceNote !== '') $mergedNotes[] = "\u{2022} [{$koiRow['code']}] " . $sourceNote;
        }
        $mergeNote = "[$today] Gabung Data Ikan: " . implode(', ', $mergedCodes) . ' digabung ke ikan ini.';
        if ($mergedNotes) $mergeNote .= "\n\n" . implode("\n\n", $mergedNotes);
        $newNotes = $keptNote !== '' ? $mergeNote . "\n\n-----------\n\n" . $keptNote : $mergeNote;
        execute('UPDATE koi SET notes = ? WHERE id = ?', [$newNotes, $targetId]);

        execute("DELETE FROM koi WHERE id IN ($sourcePlaceholders)", $sourceIds);
        koi_renumber();
        koi_facets_cache_clear();
        db()->commit();
    } catch (Throwable $e) {
        db()->rollBack();
        throw $e;
    }

    $mergedKoi = query_one('SELECT * FROM koi WHERE id = ?', [$targetId]);
    send_json(200, ['ok' => true, 'koi' => $mergedKoi]);
});

// Photo history follows the original Node server (api/src/server.js):
// newest first (highest sort_order), and the newest photo is always the koi's main photo.
route_pattern('GET', '#^/koi/(\d+)/photo-history$#', function (array $m) {
    try {
        koi_ensure_initial_history((int)$m[1]);
    } catch (Throwable $e) {
        // reading the history must still work if the initial entry cannot be written
    }
    send_json(200, query(
        'SELECT id, koi_id, measured_at, length_cm, weight_g, image_url, notes, sort_order, created_at
         FROM koi_growth_logs
         WHERE koi_id = ? AND image_url IS NOT NULL
         ORDER BY sort_order DESC, measured_at DESC, created_at DESC, id DESC',
        [$m[1]]
    ));
});

route_pattern('POST', '#^/koi/(\d+)/photo-history$#', function (array $m) {
    require_account();
    $koiId = (int)$m[1];
    $body = read_json_body();
    $measuredAt = trim((string)($body['measured_at'] ?? '')) ?: date('Y-m-d');
    $imageUrl = trim((string)($body['image_url'] ?? ''));
    $rawLength = $body['length_cm'] ?? null;
    $lengthCm = ($rawLength !== null && $rawLength !== '' && is_numeric($rawLength)) ? (float)$rawLength : null;
    $notes = trim((string)($body['notes'] ?? ''));

    if ($imageUrl === '') send_error(422, 'Foto progress wajib diisi');

    $koi = query_one('SELECT image_url, current_length_cm FROM koi WHERE id = ? LIMIT 1', [$koiId]);
    if (!$koi) send_error(404, 'Ikan tidak ditemukan');

    db()->beginTransaction();
    try {
        $count = query_one('SELECT COUNT(*) AS total FROM koi_growth_logs WHERE koi_id = ? AND image_url IS NOT NULL', [$koiId]);
        // First progress photo: keep the current main photo in the history as "Progress awal".
        if ((int)($count['total'] ?? 0) === 0 && !empty($koi['image_url']) && $koi['image_url'] !== $imageUrl) {
            execute(
                'INSERT INTO koi_growth_logs (koi_id, measured_at, length_cm, image_url, notes, sort_order)
                 SELECT ?, ?, ?, ?, ?, COALESCE(MAX(sort_order) + 1, 1) FROM koi_growth_logs WHERE koi_id = ?',
                [$koiId, $measuredAt, $koi['current_length_cm'] ?: null, $koi['image_url'], 'Progress awal', $koiId]
            );
        }

        execute(
            'INSERT INTO koi_growth_logs (koi_id, measured_at, length_cm, image_url, notes, sort_order)
             SELECT ?, ?, ?, ?, ?, COALESCE(MAX(sort_order) + 1, 1) FROM koi_growth_logs WHERE koi_id = ?',
            [$koiId, $measuredAt, $lengthCm, $imageUrl, $notes !== '' ? $notes : null, $koiId]
        );
        $newId = (int)db()->lastInsertId();

        execute(
            'UPDATE koi SET image_url = ?, current_length_cm = COALESCE(?, current_length_cm), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [$imageUrl, $lengthCm, $koiId]
        );
        db()->commit();
    } catch (Throwable $e) {
        db()->rollBack();
        throw $e;
    }

    send_json(201, ['ok' => true, 'id' => $newId]);
});

route_pattern('POST', '#^/koi/(\d+)/photo-history/order$#', function (array $m) {
    require_account();
    $koiId = (int)$m[1];
    $body = read_json_body();
    $rawIds = is_array($body['ids'] ?? null) ? $body['ids'] : [];
    $ids = array_values(array_filter(array_map('intval', $rawIds), function ($id) { return $id > 0; }));

    if (count($ids) === 0) send_error(422, 'Urutan history foto wajib diisi');

    db()->beginTransaction();
    try {
        $total = count($ids);
        foreach ($ids as $index => $photoId) {
            execute('UPDATE koi_growth_logs SET sort_order = ? WHERE koi_id = ? AND id = ?', [$total - $index, $koiId, $photoId]);
        }

        $latestId = $ids[0];
        $latestHistory = query_one(
            'SELECT image_url, length_cm, weight_g FROM koi_growth_logs WHERE koi_id = ? AND id = ? LIMIT 1',
            [$koiId, $latestId]
        );

        if (!empty($latestHistory['image_url'])) {
            execute(
                'UPDATE koi SET image_url = ?, current_length_cm = COALESCE(?, current_length_cm), current_weight_g = COALESCE(?, current_weight_g), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [$latestHistory['image_url'], $latestHistory['length_cm'], $latestHistory['weight_g'], $koiId]
            );
        }
        db()->commit();
    } catch (Throwable $e) {
        db()->rollBack();
        throw $e;
    }

    send_json(200, ['ok' => true]);
});

route_pattern('PATCH', '#^/koi/(\d+)/photo-history/(\d+)$#', function (array $m) {
    require_account();
    $koiId = (int)$m[1];
    $historyId = (int)$m[2];
    $body = read_json_body();
    $raw = $body['length_cm'] ?? null;
    if ($raw !== null && $raw !== '' && !is_numeric($raw)) send_error(422, 'Ukuran progress tidak valid');
    $lengthCm = ($raw !== null && $raw !== '') ? (float)$raw : null;

    execute('UPDATE koi_growth_logs SET length_cm = ? WHERE koi_id = ? AND id = ?', [$lengthCm, $koiId, $historyId]);

    // Size of the main photo is also the fish's current size.
    $koi = query_one('SELECT image_url FROM koi WHERE id = ? LIMIT 1', [$koiId]);
    $history = query_one('SELECT image_url, length_cm FROM koi_growth_logs WHERE koi_id = ? AND id = ? LIMIT 1', [$koiId, $historyId]);
    if (!empty($history['image_url']) && ($koi['image_url'] ?? null) === $history['image_url']) {
        execute('UPDATE koi SET current_length_cm = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [$history['length_cm'], $koiId]);
    }

    send_json(200, ['ok' => true]);
});

route_pattern('DELETE', '#^/koi/(\d+)/photo-history/(\d+)$#', function (array $m) {
    require_account();
    $koiId = (int)$m[1];
    $historyId = (int)$m[2];
    $deleted = query_one('SELECT image_url FROM koi_growth_logs WHERE koi_id = ? AND id = ? LIMIT 1', [$koiId, $historyId]);
    // the first photo of a fish must not disappear by accident: at least one progress photo always stays
    $remaining = query_one('SELECT COUNT(*) AS n FROM koi_growth_logs WHERE koi_id = ? AND image_url IS NOT NULL', [$koiId]);
    if (!empty($deleted['image_url']) && (int)($remaining['n'] ?? 0) <= 1) {
        send_error(409, 'Foto progress terakhir tidak bisa dihapus. Tambahkan foto progress lain dulu, atau ganti foto utama.');
    }

    execute('DELETE FROM koi_growth_logs WHERE koi_id = ? AND id = ?', [$koiId, $historyId]);

    // Deleting the main photo: the newest remaining history photo becomes the main photo.
    $koi = query_one('SELECT image_url FROM koi WHERE id = ? LIMIT 1', [$koiId]);
    if (!empty($deleted['image_url']) && ($koi['image_url'] ?? null) === $deleted['image_url']) {
        $latest = query_one(
            'SELECT image_url, length_cm FROM koi_growth_logs
             WHERE koi_id = ? AND image_url IS NOT NULL
             ORDER BY sort_order DESC, measured_at DESC, created_at DESC, id DESC
             LIMIT 1',
            [$koiId]
        );
        execute(
            'UPDATE koi SET image_url = ?, current_length_cm = COALESCE(?, current_length_cm), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [$latest['image_url'] ?? null, $latest['length_cm'] ?? null, $koiId]
        );
    }

    $deletedFiles = delete_upload_files_if_unused([$deleted['image_url'] ?? null]);
    send_json(200, ['ok' => true, 'deleted_files' => $deletedFiles]);
});
