<?php
// api-php/handlers/breeding.php

// The collection of a breeding session in the Galeri ("Tampilkan dokumentasi di Galeri"): follows media_entries.
// $show: true/false = the user's choice, null = keep what exists (an existing collection is only refreshed).
function sync_breeding_gallery(int $batchId, ?bool $show): void {
    $linked = query_one("SELECT id FROM gallery_collections WHERE source_type = 'breeding' AND source_id = ? LIMIT 1", [$batchId]);
    if ($show === null) $show = (bool)$linked;
    $batch = $show ? query_one('SELECT * FROM breeding_batches WHERE id = ?', [$batchId]) : null;
    $media = $batch ? normalize_source_media($batch['media_entries']) : [];
    $ponds = $batch ? json_decode((string)$batch['pond_entries'], true) : null;
    if (is_string($ponds)) $ponds = json_decode($ponds, true);
    $pondId = is_array($ponds) && !empty($ponds[0]['pond_id']) ? (int)$ponds[0]['pond_id'] : ($batch && $batch['pond_id'] ? (int)$batch['pond_id'] : null);
    sync_source_gallery('breeding', $batchId, $show && $batch !== null, $media, [
        'pond_id' => $pondId,
        'title' => $batch ? trim('Breeding ' . ($batch['batch_code'] ?? '') . (!empty($batch['session_name']) ? ' - ' . $batch['session_name'] : '')) : '',
        'segment_name' => 'Breeding',
        'gallery_date' => $batch && $batch['breeding_date'] ? substr((string)$batch['breeding_date'], 0, 10) : null,
        'notes' => $batch ? ($batch['notes'] ?: null) : null,
    ]);
}

function breeding_gallery_choice(array $body): ?bool {
    if (!array_key_exists('show_in_gallery', $body)) return null;
    return filter_var($body['show_in_gallery'], FILTER_VALIDATE_BOOLEAN);
}

// Adds `parent_koi` ({koi_id: {code, image_url}}) to every batch so the cards can show parent photos
// without waiting for (or depending on) a second request to /koi. One query for all batches.
function breeding_attach_parent_koi(array $rows): array {
    $idsByRow = [];
    $all = [];
    foreach ($rows as $index => $row) {
        $ids = [];
        foreach (['male_parent_entries', 'female_parent_entries'] as $column) {
            $entries = json_decode((string)($row[$column] ?? ''), true);
            if (!is_array($entries)) continue;
            foreach ($entries as $entry) {
                if (is_array($entry) && isset($entry['koi_id']) && ctype_digit((string)$entry['koi_id'])) $ids[(int)$entry['koi_id']] = true;
            }
        }
        foreach (['male_koi_id', 'female_koi_id'] as $column) {
            if (!empty($row[$column])) $ids[(int)$row[$column]] = true;
        }
        $idsByRow[$index] = array_keys($ids);
        foreach ($ids as $id => $_) $all[$id] = true;
    }

    $koiById = [];
    foreach (array_chunk(array_keys($all), 400) as $chunk) {
        $placeholders = implode(',', array_fill(0, count($chunk), '?'));
        foreach (query("SELECT id, code, image_url FROM koi WHERE id IN ($placeholders)", $chunk) as $koi) {
            $koiById[(int)$koi['id']] = ['code' => $koi['code'], 'image_url' => $koi['image_url']];
        }
    }

    foreach ($rows as $index => $row) {
        $map = [];
        foreach ($idsByRow[$index] as $id) {
            if (isset($koiById[$id])) $map[(string)$id] = $koiById[$id];
        }
        $rows[$index]['parent_koi'] = (object)$map;
    }
    return $rows;
}

// Fish that became indukan only because a breeding session names them are remembered per calendar year (app_settings 'breeding_auto_indukan').
// When the year changes the count starts again: those fish go back to regular unless a session of the new year names them.
function breeding_auto_state(): array {
    $row = query_one("SELECT value FROM app_settings WHERE `key` = 'breeding_auto_indukan'");
    $state = $row ? json_decode((string)$row['value'], true) : null;
    return is_array($state) && isset($state['year']) ? ['year' => (int)$state['year'], 'ids' => array_map('intval', (array)($state['ids'] ?? [])), 'at' => (array)($state['at'] ?? [])] : ['year' => (int)date('Y'), 'ids' => [], 'at' => []];
}
function breeding_auto_save(array $state): void {
    execute("INSERT INTO app_settings (`key`, value) VALUES ('breeding_auto_indukan', ?) ON DUPLICATE KEY UPDATE value = VALUES(value)", [json_encode($state)]);
}
function breeding_auto_remember(array $ids): void {
    if (!$ids) return;
    breeding_auto_reset_year();
    $state = breeding_auto_state();
    $state['ids'] = array_values(array_unique(array_merge($state['ids'], $ids)));
    foreach ($ids as $id) if (!isset($state['at'][(string)$id])) $state['at'][(string)$id] = date('Y-m');   // the month it became indukan (Dashboard "indukan baru bulan ini")
    breeding_auto_save($state);
}
function breeding_auto_reset_year(): void {
    $state = breeding_auto_state();
    $year = (int)date('Y');
    if ($state['year'] >= $year) return;
    $keep = [];
    foreach (query('SELECT male_koi_id, female_koi_id, male_parent_entries, female_parent_entries FROM breeding_batches WHERE YEAR(breeding_date) = ?', [$year]) as $batch) {
        foreach (['male_parent_entries', 'female_parent_entries'] as $column) {
            $entries = json_decode((string)($batch[$column] ?? ''), true);
            if (is_array($entries)) foreach ($entries as $entry) if (is_array($entry) && !empty($entry['koi_id'])) $keep[(int)$entry['koi_id']] = true;
        }
        foreach (['male_koi_id', 'female_koi_id'] as $column) if ((int)($batch[$column] ?? 0) > 0) $keep[(int)$batch[$column]] = true;
    }
    $drop = array_values(array_diff($state['ids'], array_keys($keep)));
    if ($drop) {
        $marks = implode(',', array_fill(0, count($drop), '?'));
        execute("UPDATE koi SET parent_type = 'non_indukan' WHERE id IN ($marks) AND parent_type = 'indukan'", $drop);
        koi_facets_cache_clear();
    }
    $kept = array_values(array_intersect($state['ids'], array_keys($keep)));
    breeding_auto_save(['year' => $year, 'ids' => $kept, 'at' => array_intersect_key($state['at'], array_flip(array_map('strval', $kept)))]);
}

// A fish that is named as a parent (Indukan Betina / Indukan Jantan) in a breeding session is an indukan: a regular fish chosen there becomes one
// (parent_type = indukan) and is counted as such everywhere (Dashboard...). A fish whose gender is still unknown gets the gender of its side.
function breeding_promote_parents(array $batch): void {
    $ids = ['male' => [], 'female' => []];
    foreach (['male' => 'male_parent_entries', 'female' => 'female_parent_entries'] as $side => $column) {
        $entries = json_decode((string)($batch[$column] ?? ''), true);
        if (is_array($entries)) foreach ($entries as $entry) if (is_array($entry) && !empty($entry['koi_id'])) $ids[$side][(int)$entry['koi_id']] = true;
        $main = (int)($batch[$side . '_koi_id'] ?? 0);
        if ($main > 0) $ids[$side][$main] = true;
    }
    $all = array_keys($ids['male'] + $ids['female']);
    if (!$all) return;
    $marks = implode(',', array_fill(0, count($all), '?'));
    $fresh = array_column(query("SELECT id FROM koi WHERE id IN ($marks) AND (parent_type IS NULL OR parent_type <> 'indukan')", $all), 'id');
    $changed = $fresh ? execute("UPDATE koi SET parent_type = 'indukan' WHERE id IN ($marks) AND (parent_type IS NULL OR parent_type <> 'indukan')", $all)->rowCount() : 0;
    breeding_auto_remember(array_map('intval', $fresh));
    foreach (['male', 'female'] as $side) {
        $sideIds = array_keys($ids[$side]);
        if (!$sideIds) continue;
        $sideMarks = implode(',', array_fill(0, count($sideIds), '?'));
        $changed += execute("UPDATE koi SET gender = ? WHERE id IN ($sideMarks) AND (gender IS NULL OR gender NOT IN ('male', 'female'))", array_merge([$side], $sideIds))->rowCount();
    }
    if ($changed) koi_facets_cache_clear();
}

// One time, for the sessions that were saved before this rule existed (a marker in app_settings keeps it from running again).
function breeding_promote_existing_parents(): void {
    if (query_one("SELECT value FROM app_settings WHERE `key` = 'breeding_parents_backfill'")) return;
    foreach (query('SELECT male_koi_id, female_koi_id, male_parent_entries, female_parent_entries FROM breeding_batches') as $batch) breeding_promote_parents($batch);
    execute("INSERT INTO app_settings (`key`, value) VALUES ('breeding_parents_backfill', ?) ON DUPLICATE KEY UPDATE value = VALUES(value)", [date('c')]);
}

route('GET', '/breeding', function () {
    breeding_promote_existing_parents();
    breeding_auto_reset_year();
    send_json(200, breeding_attach_parent_koi(query(
        'SELECT breeding_batches.*,
                male.code AS male_koi_code, male.name AS male_koi_name, male.image_url AS male_koi_image_url,
                male.variety AS male_koi_variety, male.bloodline AS male_koi_bloodline,
                female.code AS female_koi_code, female.name AS female_koi_name, female.image_url AS female_koi_image_url,
                female.variety AS female_koi_variety, female.bloodline AS female_koi_bloodline,
                ponds.name AS pond_name,
                (SELECT gc.id FROM gallery_collections gc WHERE gc.source_type = \'breeding\' AND gc.source_id = breeding_batches.id LIMIT 1) AS gallery_id
         FROM breeding_batches
         LEFT JOIN koi AS male ON male.id = breeding_batches.male_koi_id
         LEFT JOIN koi AS female ON female.id = breeding_batches.female_koi_id
         LEFT JOIN ponds ON ponds.id = breeding_batches.pond_id
         ORDER BY breeding_batches.breeding_date DESC, breeding_batches.created_at DESC'
    )));
});

// Mirrors the original Node app's createBreedingCode(): format
// "BR{YY}{MM}{NN}" (2-digit year+month from breeding_date, 2-digit
// sequence within that month), auto-generated only when the caller
// leaves batch_code blank; retried against real collisions, not just
// a count-based guess.
function create_breeding_code(string $requestedCode, string $breedingDate): string {
    $code = strtoupper(trim($requestedCode));
    if ($code !== '') return $code;

    [$year, $month] = $breedingDate !== '' ? koi_date_parts($breedingDate) : [(int)date('Y'), (int)date('n')];
    // a session known only by its year (2025-00-00) is numbered by the year alone: BR2501 (the two wildcard characters keep it apart from BR250301)
    $prefix = 'BR' . substr((string)$year, -2) . ($month > 0 ? str_pad((string)$month, 2, '0', STR_PAD_LEFT) : '');

    $counter = query_one('SELECT COUNT(*) AS total FROM breeding_batches WHERE batch_code LIKE ?', [$prefix . ($month > 0 ? '%' : '__')]);
    $nextCount = (int)($counter['total'] ?? 0) + 1;

    for ($attempt = $nextCount; $attempt <= $nextCount + 20; $attempt++) {
        $generated = $prefix . str_pad((string)$attempt, 2, '0', STR_PAD_LEFT);
        $existing = query_one('SELECT id FROM breeding_batches WHERE batch_code = ?', [$generated]);
        if (!$existing) return $generated;
    }
    throw new RuntimeException('Kode batch otomatis gagal dibuat');
}

route('GET', '/breeding-next-code', function () {
    $date = $_GET['date'] ?? date('Y-m-d');
    try {
        $code = create_breeding_code('', $date);
    } catch (RuntimeException $e) {
        send_error(500, $e->getMessage());
    }
    send_json(200, ['batch_code' => $code]);
});

route('POST', '/breeding', function () {
    require_account();
    $body = read_json_body();
    // "Awal Pijah" is the date of the session: it fills breeding_date (batch code, ordering) as well
    $breedingDate = trim((string)($body['breeding_date'] ?? ''));
    if ($breedingDate === '') $breedingDate = trim((string)($body['spawning_started_at'] ?? ''));
    if ($breedingDate === '') send_error(400, 'Awal Pijah wajib diisi');
    $breedingDate = koi_clean_partial_date($breedingDate, 'Awal Pijah');
    foreach (['spawning_started_at' => 'Awal Pijah', 'fish_separated_at' => 'Akhir Pijah', 'larva_released_at' => 'Tanggal Release Larva', 'last_update_date' => 'Update Terakhir'] as $dateCol => $dateLabel) {
        if (array_key_exists($dateCol, $body)) $body[$dateCol] = koi_clean_partial_date($body[$dateCol], $dateLabel);
    }
    $spawningStart = blank_to_null($body['spawning_started_at'] ?? null) ?? $breedingDate;

    try {
        $batchCode = create_breeding_code((string)($body['batch_code'] ?? ''), $breedingDate);
    } catch (RuntimeException $e) {
        send_error(500, $e->getMessage());
    }

    $jsonCols = ['male_parent_entries', 'female_parent_entries', 'pond_entries', 'media_entries'];
    $encode = fn($k) => in_array($k, $jsonCols) && isset($body[$k]) ? json_encode($body[$k]) : ($body[$k] ?? null);

    try {
        execute(
            'INSERT INTO breeding_batches (batch_code, session_name, breeding_date, male_koi_id, female_koi_id,
                 male_parent_entries, female_parent_entries, pond_id, spawning_method, status, fry_count, notes,
                 video_url, video_thumbnail_url, pond_entries, egg_weight_g, media_entries,
                 spawning_started_at, fish_separated_at, officer_name, last_update_date, larva_released_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                $batchCode, $body['session_name'] ?? null, $breedingDate, blank_to_null($body['male_koi_id'] ?? null),
                blank_to_null($body['female_koi_id'] ?? null), $encode('male_parent_entries'), $encode('female_parent_entries'),
                blank_to_null($body['pond_id'] ?? null), $body['spawning_method'] ?? 'alami', $body['status'] ?? 'planning',
                blank_to_null($body['fry_count'] ?? null), $body['notes'] ?? null, $body['video_url'] ?? null,
                $body['video_thumbnail_url'] ?? null, $encode('pond_entries'), blank_to_null($body['egg_weight_g'] ?? null),
                $encode('media_entries'), $spawningStart,
                blank_to_null($body['fish_separated_at'] ?? null),
                blank_to_null(isset($body['officer_name']) ? mb_substr(trim((string)$body['officer_name']), 0, 255) : null),
                blank_to_null($body['last_update_date'] ?? null) ?? date('Y-m-d'),
                blank_to_null($body['larva_released_at'] ?? null),
            ]
        );
    } catch (PDOException $e) {
        if (is_duplicate_error($e)) send_error(409, 'Kode batch sudah dipakai');
        throw $e;
    }
    $createdId = (int)db()->lastInsertId();
    // New sessions with documentation go to the Galeri unless the user turned it off (default: Ya).
    sync_breeding_gallery($createdId, breeding_gallery_choice($body) ?? true);
    $created = query_one('SELECT * FROM breeding_batches WHERE id = ?', [$createdId]);
    if ($created) breeding_promote_parents($created);
    send_json(201, $created);
});

route_pattern('GET', '#^/breeding/(\d+)$#', function (array $m) {
    $batch = query_one('SELECT * FROM breeding_batches WHERE id = ?', [$m[1]]);
    if (!$batch) send_error(404, 'Batch breeding tidak ditemukan');
    send_json(200, $batch);
});

route_pattern('PATCH', '#^/breeding/(\d+)$#', function (array $m) {
    require_account();
    $body = read_json_body();
    $cols = ['batch_code', 'session_name', 'breeding_date', 'male_koi_id', 'female_koi_id', 'pond_id', 'spawning_method',
             'status', 'fry_count', 'notes', 'video_url', 'video_thumbnail_url', 'egg_weight_g',
             'male_parent_entries', 'female_parent_entries', 'pond_entries', 'media_entries',
             'spawning_started_at', 'fish_separated_at', 'officer_name', 'last_update_date', 'larva_released_at'];
    $jsonCols = ['male_parent_entries', 'female_parent_entries', 'pond_entries', 'media_entries'];
    $numericCols = ['male_koi_id', 'female_koi_id', 'pond_id', 'fry_count', 'egg_weight_g'];
    // an empty date box means "no date"; MySQL rejects '' for a DATE column
    $optionalDateCols = ['spawning_started_at', 'fish_separated_at', 'last_update_date', 'larva_released_at'];
    // Awal Pijah is also the session date
    if (!array_key_exists('breeding_date', $body) && trim((string)($body['spawning_started_at'] ?? '')) !== '') {
        $body['breeding_date'] = trim((string)$body['spawning_started_at']);
    }
    $fields = [];
    $params = [];
    foreach ($cols as $col) {
        if (array_key_exists($col, $body)) {
            $fields[] = "$col = ?";
            if (in_array($col, $jsonCols, true)) {
                $params[] = json_encode($body[$col]);
            } elseif ($col === 'officer_name') {
                $params[] = blank_to_null(mb_substr(trim((string)$body[$col]), 0, 255));
            } elseif (in_array($col, $optionalDateCols, true)) {
                $params[] = koi_clean_partial_date($body[$col], $col === 'fish_separated_at' ? 'Akhir Pijah' : ($col === 'larva_released_at' ? 'Tanggal Release Larva' : ($col === 'last_update_date' ? 'Update Terakhir' : 'Awal Pijah')));
            } elseif (in_array($col, $numericCols, true)) {
                $params[] = blank_to_null($body[$col]);
            } elseif ($col === 'breeding_date') {
                $params[] = koi_clean_partial_date($body[$col], 'Awal Pijah');
            } else {
                $params[] = $body[$col];
            }
        }
    }
    if ($fields && !array_key_exists('last_update_date', $body)) {
        $fields[] = 'last_update_date = ?';
        $params[] = date('Y-m-d');
    }
    $galleryChoice = breeding_gallery_choice($body);
    if (!$fields && $galleryChoice === null) send_error(400, 'Tidak ada field untuk diupdate');
    $params[] = $m[1];

    try {
        if ($fields) execute('UPDATE breeding_batches SET ' . implode(', ', $fields) . ' WHERE id = ?', $params);
    } catch (PDOException $e) {
        if (is_duplicate_error($e)) send_error(409, 'Kode batch sudah dipakai');
        throw $e;
    }

    $batch = query_one('SELECT * FROM breeding_batches WHERE id = ?', [$m[1]]);
    if (!$batch) send_error(404, 'Batch breeding tidak ditemukan');
    sync_breeding_gallery((int)$m[1], $galleryChoice);
    breeding_promote_parents($batch);
    send_json(200, $batch);
});

route_pattern('DELETE', '#^/breeding/(\d+)$#', function (array $m) {
    require_account();
    require_once __DIR__ . '/../lib/uploads.php';
    $urls = array_merge(
        upload_urls_in_rows([query_one('SELECT * FROM breeding_batches WHERE id = ?', [$m[1]])]),
        gallery_upload_urls_for_source('breeding', (int)$m[1])
    );
    execute("DELETE FROM gallery_collections WHERE source_type = 'breeding' AND source_id = ?", [$m[1]]);
    execute('DELETE FROM breeding_batches WHERE id = ?', [$m[1]]);
    $deletedFiles = delete_upload_files_if_unused($urls);
    send_json(200, ['ok' => true, 'deleted_files' => $deletedFiles]);
});
