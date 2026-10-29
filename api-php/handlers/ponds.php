<?php
// api-php/handlers/ponds.php

// The Galeri collection of a pond ("Dokumentasi <kolam>"): always in step with the pond's active documentation.
function sync_pond_gallery(int $pondId): void {
    $pond = query_one('SELECT id, name FROM ponds WHERE id = ?', [$pondId]);
    $docs = $pond ? query("SELECT image_url, media_type, thumbnail_url, notes, created_at FROM pond_documentation WHERE pond_id = ? AND status = 'active' ORDER BY created_at, id", [$pondId]) : [];
    $media = array_map(fn($doc) => [
        'url' => $doc['image_url'], 'type' => $doc['media_type'] === 'video' ? 'video' : 'image',
        'thumbnail_url' => $doc['thumbnail_url'] ?: null, 'notes' => $doc['notes'] ?: null,
    ], $docs);
    $latest = $docs ? substr((string)end($docs)['created_at'], 0, 10) : null;
    sync_source_gallery('pond', $pondId, $pond !== null, $media, [
        'pond_id' => $pondId, 'title' => $pond ? 'Dokumentasi ' . $pond['name'] : '', 'segment_name' => 'Kolam',
        'gallery_date' => $latest, 'notes' => null,
    ]);
}

route('GET', '/ponds', function () {
    $ponds = query(
        'SELECT ponds.*, COUNT(koi.id) AS koi_count
         FROM ponds LEFT JOIN koi ON koi.pond_id = ponds.id AND koi.archived_at IS NULL
         GROUP BY ponds.id ORDER BY ponds.name'
    );
    $fish = query(
        'SELECT id, pond_id, code, name, variety, bloodline, farm_name, breeder, gender, parent_type,
                image_url, current_length_cm, current_weight_g, status, notes
         FROM koi WHERE pond_id IS NOT NULL AND archived_at IS NULL ORDER BY created_at DESC'
    );
    $byPond = [];
    foreach ($fish as $item) $byPond[(int)$item['pond_id']][] = $item;

    foreach ($ponds as &$pond) {
        $pond['fish'] = $byPond[(int)$pond['id']] ?? [];
    }
    send_json(200, $ponds);
});

route('POST', '/ponds', function () {
    require_account();
    $body = read_json_body();
    $name = trim($body['name'] ?? '');
    if ($name === '') send_error(400, 'Nama kolam wajib diisi');

    execute(
        'INSERT INTO ponds (name, location, status, unphotographed_fish_qty, notes) VALUES (?, ?, ?, ?, ?)',
        [$name, $body['location'] ?? null, $body['status'] ?? 'kosong', (int)($body['unphotographed_fish_qty'] ?? 0), $body['notes'] ?? null]
    );
    send_json(201, query_one('SELECT * FROM ponds WHERE id = LAST_INSERT_ID()'));
});

// Pengaturan Area: rename areas. `renames` is a list of {from, to}; all of them are applied together,
// so two areas can swap names. Every pond of the old area moves to the new one.
route('POST', '/ponds-rename-area', function () {
    require_account();
    $body = read_json_body();
    $renames = [];
    foreach ((array)($body['renames'] ?? []) as $entry) {
        if (!is_array($entry)) continue;
        $from = trim((string)($entry['from'] ?? ''));
        $to = trim((string)($entry['to'] ?? ''));
        if ($from === '' || $to === '' || $from === $to) continue;
        if (mb_strlen($to) > 100) send_error(400, 'Nama area maksimal 100 huruf');
        $renames[$from] = $to;
    }
    $targets = array_map('mb_strtolower', array_values($renames));
    if (count(array_unique($targets)) !== count($targets)) send_error(400, 'Nama area baru tidak boleh sama satu dengan lainnya');
    $moved = 0;
    if ($renames) {
        $pdo = db();
        $pdo->beginTransaction();
        try {
            // two steps through a temporary name so a swap (A to B and B to A) cannot collide
            $temps = [];
            $index = 0;
            foreach ($renames as $from => $to) {
                $temp = '__area_tmp_' . $index++ . '__';
                $moved += execute('UPDATE ponds SET location = ? WHERE location = ?', [$temp, $from])->rowCount();
                $temps[$temp] = $to;
            }
            foreach ($temps as $temp => $to) {
                execute('UPDATE ponds SET location = ? WHERE location = ?', [$to, $temp]);
            }
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
    }
    send_json(200, ['ok' => true, 'ponds' => $moved]);
});

route_pattern('GET', '#^/ponds/(\d+)$#', function (array $m) {
    $pond = query_one('SELECT * FROM ponds WHERE id = ?', [$m[1]]);
    if (!$pond) send_error(404, 'Kolam tidak ditemukan');
    send_json(200, $pond);
});

route_pattern('PATCH', '#^/ponds/(\d+)$#', function (array $m) {
    require_account();
    $body = read_json_body();
    $fields = [];
    $params = [];
    foreach (['name', 'location', 'status', 'unphotographed_fish_qty', 'notes', 'notes_date'] as $col) {
        if (array_key_exists($col, $body)) {
            $fields[] = "$col = ?";
            if ($col === 'unphotographed_fish_qty') {
                $params[] = (int)$body[$col];
            } elseif ($col === 'notes_date') {
                $date = trim((string)$body[$col]);
                if ($date !== '' && !koi_valid_partial_date($date)) {
                    send_error(422, 'Tanggal catatan tidak valid');
                }
                $params[] = $date !== '' ? $date : null;
            } else {
                $params[] = $body[$col];
            }
        }
    }
    if (!$fields) send_error(400, 'Tidak ada field untuk diupdate');

    $notesProvided = array_key_exists('notes', $body);
    $previousNotes = null;
    if ($notesProvided) {
        $existing = query_one('SELECT notes FROM ponds WHERE id = ?', [$m[1]]);
        if (!$existing) send_error(404, 'Kolam tidak ditemukan');
        $previousNotes = $existing['notes'];
    }

    $params[] = $m[1];
    execute('UPDATE ponds SET ' . implode(', ', $fields) . ' WHERE id = ?', $params);

    if ($notesProvided) {
        $prev = $previousNotes ?? '';
        $next = $body['notes'] ?? '';
        if ($prev !== $next) {
            execute(
                'INSERT INTO pond_note_history (pond_id, previous_notes, new_notes) VALUES (?, ?, ?)',
                [$m[1], $previousNotes, $body['notes'] ?? null]
            );
        }
    }

    $pond = query_one('SELECT * FROM ponds WHERE id = ?', [$m[1]]);
    if (!$pond) send_error(404, 'Kolam tidak ditemukan');
    if (array_key_exists('name', $body) && query_one("SELECT id FROM gallery_collections WHERE source_type = 'pond' AND source_id = ? LIMIT 1", [$m[1]])) sync_pond_gallery((int)$m[1]);
    send_json(200, ['ok' => true, 'pond' => $pond]);
});

route_pattern('DELETE', '#^/ponds/(\d+)$#', function (array $m) {
    require_account();
    require_once __DIR__ . '/../lib/uploads.php';
    $urls = array_merge(
        upload_urls_in_rows(query('SELECT * FROM pond_documentation WHERE pond_id = ?', [$m[1]])),
        gallery_upload_urls_for_source('pond', (int)$m[1])
    );
    execute("DELETE FROM gallery_collections WHERE source_type = 'pond' AND source_id = ?", [$m[1]]);
    execute('DELETE FROM ponds WHERE id = ?', [$m[1]]);
    $deletedFiles = delete_upload_files_if_unused($urls);
    send_json(200, ['ok' => true, 'deleted_files' => $deletedFiles]);
});

route_pattern('PATCH', '#^/ponds/(\d+)/unphotographed-fish$#', function (array $m) {
    require_account();
    $body = read_json_body();
    execute('UPDATE ponds SET unphotographed_fish_qty = ? WHERE id = ?', [(int)($body['qty'] ?? 0), $m[1]]);
    send_json(200, query_one('SELECT * FROM ponds WHERE id = ?', [$m[1]]));
});

route_pattern('GET', '#^/ponds/(\d+)/note-history$#', function (array $m) {
    send_json(200, query(
        'SELECT * FROM pond_note_history WHERE pond_id = ? ORDER BY created_at DESC',
        [$m[1]]
    ));
});

route_pattern('DELETE', '#^/ponds/(\d+)/note-history/(\d+)$#', function (array $m) {
    require_account();
    execute('DELETE FROM pond_note_history WHERE id = ? AND pond_id = ?', [$m[2], $m[1]]);
    send_json(200, ['ok' => true]);
});

// Every active documentation item of every pond in one request (used by the Data Kolam ZIP export).
route('GET', '/pond-documentation', function () {
    send_json(200, query(
        "SELECT id, pond_id, image_url, media_type, thumbnail_url, notes, created_at
         FROM pond_documentation WHERE status = 'active' ORDER BY pond_id, created_at, id"
    ));
});

route_pattern('GET', '#^/ponds/(\d+)/documentation$#', function (array $m) {
    send_json(200, query(
        "SELECT * FROM pond_documentation WHERE pond_id = ? AND status = 'active' ORDER BY created_at DESC",
        [$m[1]]
    ));
});

route_pattern('POST', '#^/ponds/(\d+)/documentation$#', function (array $m) {
    require_account();
    $pondId = (int)$m[1];
    $body = read_json_body();

    if (is_array($body['media'] ?? null)) {
        $mediaItems = $body['media'];
    } elseif (is_array($body['images'] ?? null)) {
        $mediaItems = array_map(function ($imageData) {
            return ['media_type' => 'image', 'image_data' => $imageData];
        }, $body['images']);
    } else {
        $mediaItems = [];
    }

    if (count($mediaItems) === 0) send_error(422, 'Minimal satu dokumentasi wajib dipilih');

    $pond = query_one('SELECT id FROM ponds WHERE id = ?', [$pondId]);
    if (!$pond) send_error(404, 'Kolam tidak ditemukan');

    // `skip_duplicates` (ZIP import): a file identical to one this pond already has is not added again.
    $skipDuplicates = !empty($body['skip_duplicates']);
    $existingUrls = $skipDuplicates
        ? array_column(query("SELECT image_url FROM pond_documentation WHERE pond_id = ? AND status = 'active'", [$pondId]), 'image_url')
        : [];
    $skipped = 0;
    $saved = [];
    db()->beginTransaction();
    try {
        foreach ($mediaItems as $media) {
            if (!is_array($media)) $media = [];
            $mediaType = (($media['media_type'] ?? '') === 'video' || !empty($media['video_data'])) ? 'video' : 'image';
            // Mention of media that already exists on the server (for example from the Galeri): no upload, same file.
            $mention = trim((string)($media['image_url'] ?? ''));
            if ($mention !== '' && empty($media['image_data']) && empty($media['video_data'])) {
                if (!upload_url_exists($mention)) {
                    db()->rollBack();
                    send_error(422, 'Dokumentasi gagal ditambahkan', 'File ' . $mention . ' tidak ditemukan di server');
                }
                if ($skipDuplicates && in_array($mention, $existingUrls, true)) {
                    $skipped++;
                    continue;
                }
                $notes = trim((string)($media['notes'] ?? ''));
                execute(
                    'INSERT INTO pond_documentation (pond_id, image_url, media_type, thumbnail_url, display_name, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [$pondId, $mention, $mediaType, trim((string)($media['thumbnail_url'] ?? '')) ?: null, ($mediaType === 'video' ? 'Video' : 'Dokumentasi') . " Kolam $pondId", 'active', $notes !== '' ? $notes : null]
                );
                $saved[] = ['image_url' => $mention, 'media_type' => $mediaType];
                $existingUrls[] = $mention;
                continue;
            }
            if ($skipDuplicates) {
                $incoming = (string)($mediaType === 'video' ? ($media['video_data'] ?? $media['image_data'] ?? '') : ($media['image_data'] ?? ''));
                if (upload_find_duplicate($incoming, $existingUrls) !== null) {
                    $skipped++;
                    continue;
                }
            }
            try {
                if ($mediaType === 'video') {
                    $mediaUrl = save_video_data($media['video_data'] ?? $media['image_data'] ?? '', 'pond-doc-video');
                } else {
                    $mediaUrl = save_image_data($media['image_data'] ?? '', 'pond-doc');
                }
            } catch (InvalidArgumentException $e) {
                db()->rollBack();
                send_error(422, 'Dokumentasi gagal diupload', $e->getMessage());
            }
            $notes = trim((string)($media['notes'] ?? ''));

            execute(
                'INSERT INTO pond_documentation (pond_id, image_url, media_type, display_name, status, notes) VALUES (?, ?, ?, ?, ?, ?)',
                [$pondId, $mediaUrl, $mediaType, ($mediaType === 'video' ? 'Video' : 'Dokumentasi') . " Kolam $pondId", 'active', $notes !== '' ? $notes : null]
            );
            $saved[] = ['image_url' => $mediaUrl, 'media_type' => $mediaType];
            $existingUrls[] = $mediaUrl;
        }
        db()->commit();
    } catch (Throwable $e) {
        if (db()->inTransaction()) db()->rollBack();
        throw $e;
    }
    if ($saved) sync_pond_gallery($pondId);

    send_json(201, ['ok' => true, 'inserted' => count($saved), 'skipped' => $skipped, 'media' => $saved]);
});

route_pattern('PATCH', '#^/ponds/(\d+)/documentation/(\d+)$#', function (array $m) {
    require_account();
    $body = read_json_body();
    $notes = trim((string)($body['notes'] ?? ''));
    execute(
        "UPDATE pond_documentation SET notes = ? WHERE pond_id = ? AND id = ? AND status = 'active'",
        [$notes !== '' ? $notes : null, $m[1], $m[2]]
    );
    $doc = query_one('SELECT * FROM pond_documentation WHERE id = ? AND pond_id = ?', [$m[2], $m[1]]);
    if (!$doc) send_error(404, 'Dokumentasi tidak ditemukan');
    sync_pond_gallery((int)$m[1]);
    send_json(200, ['ok' => true]);
});

// Moves documentation (photo/video + its note) from this pond to another pond.
// Body: { target_pond_id, items: [{ id, notes? }] }. A note typed but not yet saved can ride along.
route_pattern('POST', '#^/ponds/(\d+)/documentation/move$#', function (array $m) {
    require_account();
    $body = read_json_body();
    $targetId = (int)($body['target_pond_id'] ?? 0);
    $items = is_array($body['items'] ?? null) ? $body['items'] : [];

    if ($targetId <= 0 || (string)$targetId === $m[1]) send_error(422, 'Kolam tujuan tidak valid');
    if (!$items) send_error(422, 'Pilih dokumentasi yang mau dipindah');
    if (!query_one('SELECT id FROM ponds WHERE id = ?', [$targetId])) send_error(404, 'Kolam tujuan tidak ditemukan');

    $moved = 0;
    db()->beginTransaction();
    try {
        foreach ($items as $item) {
            $docId = (int)(is_array($item) ? ($item['id'] ?? 0) : $item);
            if ($docId <= 0) continue;
            // The default display name ("Dokumentasi Kolam 12") carries the pond id, so keep it in step.
            // display_name goes first: UPDATE assigns left to right, so pond_id must still be the old one there.
            $set = "display_name = REPLACE(display_name, CONCAT(' Kolam ', pond_id), CONCAT(' Kolam ', ?)), pond_id = ?";
            $params = [$targetId, $targetId];
            if (is_array($item) && array_key_exists('notes', $item)) {
                $notes = trim((string)$item['notes']);
                $set .= ', notes = ?';
                $params[] = $notes !== '' ? $notes : null;
            }
            $params[] = $docId;
            $params[] = (int)$m[1];
            $moved += execute("UPDATE pond_documentation SET $set WHERE id = ? AND pond_id = ? AND status = 'active'", $params)->rowCount();
        }
        db()->commit();
    } catch (Throwable $e) {
        if (db()->inTransaction()) db()->rollBack();
        throw $e;
    }

    if ($moved) {
        sync_pond_gallery((int)$m[1]);
        sync_pond_gallery($targetId);
    }
    send_json(200, ['ok' => true, 'moved' => $moved]);
});

route_pattern('DELETE', '#^/ponds/(\d+)/documentation/(\d+)$#', function (array $m) {
    require_account();
    require_once __DIR__ . '/../lib/uploads.php';
    $urls = upload_urls_in_rows(query('SELECT * FROM pond_documentation WHERE id = ? AND pond_id = ?', [$m[2], $m[1]]));
    execute('DELETE FROM pond_documentation WHERE id = ? AND pond_id = ?', [$m[2], $m[1]]);
    sync_pond_gallery((int)$m[1]);
    $deletedFiles = delete_upload_files_if_unused($urls);
    send_json(200, ['ok' => true, 'deleted_files' => $deletedFiles]);
});
