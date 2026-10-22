<?php
// api-php/handlers/gallery.php

// ---- Collections that follow another record (report, breeding session, pond documentation) ----------
// One collection per source (source_type + source_id) lists the source's media WITHOUT copying files.
// Every media row keeps its gallery_images.id for as long as its URL stays in the source, so an
// "ID Media" written in an Excel/ZIP stays valid after the source is edited.
// $media: [['url', 'type', 'thumbnail_url', 'notes']]; $collection: pond_id, title, segment_name, gallery_date, notes.
function normalize_source_media($raw): array {
    if (is_string($raw)) $raw = json_decode($raw, true);
    if (is_string($raw)) $raw = json_decode($raw, true);
    if (!is_array($raw)) return [];
    $out = [];
    foreach ($raw as $item) {
        if (!is_array($item)) continue;
        $url = trim((string)($item['url'] ?? $item['image_url'] ?? ''));
        if ($url === '') continue;
        $out[] = [
            'url' => $url,
            'type' => ($item['type'] ?? $item['media_type'] ?? 'image') === 'video' ? 'video' : 'image',
            'thumbnail_url' => trim((string)($item['thumbnail_url'] ?? '')) ?: null,
            'notes' => trim((string)($item['notes'] ?? '')) ?: null,
        ];
    }
    return $out;
}

function sync_source_gallery(string $sourceType, int $sourceId, bool $show, array $media, array $collection): ?int {
    $linked = query_one('SELECT id FROM gallery_collections WHERE source_type = ? AND source_id = ? LIMIT 1', [$sourceType, $sourceId]);
    if (!$show || !$media) {
        if ($linked) execute('DELETE FROM gallery_collections WHERE id = ?', [$linked['id']]);
        return null;
    }
    $values = [
        $collection['pond_id'] ?? null, $collection['title'] ?? '', $collection['segment_name'] ?? null,
        $collection['gallery_date'] ?? null, $collection['notes'] ?? null,
    ];
    if ($linked) {
        $galleryId = (int)$linked['id'];
        execute('UPDATE gallery_collections SET pond_id = ?, title = ?, segment_name = ?, gallery_date = ?, notes = ? WHERE id = ?', array_merge($values, [$galleryId]));
    } else {
        execute(
            'INSERT INTO gallery_collections (pond_id, title, segment_name, gallery_date, notes, source_type, source_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
            array_merge($values, [$sourceType, $sourceId])
        );
        $galleryId = (int)db()->lastInsertId();
    }

    $existing = [];
    foreach (query('SELECT id, image_url FROM gallery_images WHERE gallery_id = ? ORDER BY id', [$galleryId]) as $row) {
        $existing[$row['image_url']][] = (int)$row['id'];
    }
    $keep = [];
    foreach ($media as $index => $item) {
        $reuse = !empty($existing[$item['url']]) ? array_shift($existing[$item['url']]) : null;
        if ($reuse !== null) {
            execute('UPDATE gallery_images SET media_type = ?, thumbnail_url = ?, notes = ?, sort_order = ? WHERE id = ?',
                [$item['type'], $item['thumbnail_url'], $item['notes'], $index, $reuse]);
            $keep[] = $reuse;
        } else {
            execute('INSERT INTO gallery_images (gallery_id, image_url, media_type, thumbnail_url, notes, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
                [$galleryId, $item['url'], $item['type'], $item['thumbnail_url'], $item['notes'], $index]);
            $keep[] = (int)db()->lastInsertId();
        }
    }
    if ($keep) {
        $marks = implode(',', array_fill(0, count($keep), '?'));
        execute("DELETE FROM gallery_images WHERE gallery_id = ? AND id NOT IN ($marks)", array_merge([$galleryId], $keep));
    }
    return $galleryId;
}

function get_gallery_collections(): array {
    // Archived collections are included (archived_at set); the page shows them under "Arsip".
    $collections = query(
        "SELECT gallery_collections.*, ponds.name AS pond_name,
                farm_reports.batch_code AS report_batch_code, farm_reports.report_title AS report_title,
                breeding_batches.batch_code AS breeding_batch_code, breeding_batches.session_name AS breeding_session_name,
                source_ponds.name AS source_pond_name,
                source_invoices.invoice_no AS invoice_no, source_invoices.client_name AS invoice_client_name,
                source_sell.title AS sell_title
         FROM gallery_collections
         LEFT JOIN ponds ON ponds.id = gallery_collections.pond_id
         LEFT JOIN farm_reports ON gallery_collections.source_type = 'report' AND farm_reports.id = gallery_collections.source_id
         LEFT JOIN breeding_batches ON gallery_collections.source_type = 'breeding' AND breeding_batches.id = gallery_collections.source_id
         LEFT JOIN ponds AS source_ponds ON gallery_collections.source_type = 'pond' AND source_ponds.id = gallery_collections.source_id
         LEFT JOIN invoices AS source_invoices ON gallery_collections.source_type = 'invoice' AND source_invoices.id = gallery_collections.source_id
         LEFT JOIN sell_items AS source_sell ON gallery_collections.source_type = 'sell' AND source_sell.id = gallery_collections.source_id
         ORDER BY gallery_collections.gallery_date DESC, gallery_collections.created_at DESC"
    );
    $images = query('SELECT * FROM gallery_images ORDER BY sort_order ASC, id ASC');
    $byCollection = [];
    foreach ($images as $img) $byCollection[(int)$img['gallery_id']][] = $img;

    foreach ($collections as &$collection) {
        $collection['images'] = $byCollection[(int)$collection['id']] ?? [];
    }
    return $collections;
}

// Documentation that existed before ponds and breeding sessions followed the Galeri: put it there once
// (a marker in app_settings keeps this from running again; later changes are synced as they happen).
function backfill_gallery_sources_once(): void {
    if (query_one("SELECT value FROM app_settings WHERE `key` = 'gallery_sources_backfill'")) return;
    foreach (query("SELECT DISTINCT pond_id FROM pond_documentation WHERE status = 'active'") as $row) {
        sync_pond_gallery((int)$row['pond_id']);
    }
    foreach (query("SELECT id FROM breeding_batches WHERE media_entries IS NOT NULL AND media_entries NOT IN ('', '[]', 'null')") as $row) {
        sync_breeding_gallery((int)$row['id'], true);
    }
    execute("INSERT INTO app_settings (`key`, value) VALUES ('gallery_sources_backfill', ?) ON DUPLICATE KEY UPDATE value = VALUES(value)", [date('c')]);
}

route('GET', '/gallery', function () {
    backfill_gallery_sources_once();
    send_json(200, get_gallery_collections());
});

route('GET', '/gallery-sources', function () {
    send_json(200, query(
        "SELECT id, image_url, media_type, thumbnail_url, display_name, notes, pond_id, created_at
         FROM pond_documentation WHERE status = 'active' ORDER BY created_at DESC LIMIT 200"
    ));
});

// Normalize an incoming `images` array: each entry may carry an already
// uploaded image_url/video url directly, or base64 image_data/video_data/
// thumbnail_data (new media picked client-side) that needs to be persisted
// to disk first. Mirrors Node's normalizeGalleryImages().
function normalize_gallery_images($images): array {
    if (!is_array($images)) return [];
    $out = [];
    $index = 0;
    foreach ($images as $media) {
        if (!is_array($media)) continue;
        $hasImageUrl = !empty($media['image_url']);
        $hasImageData = !empty($media['image_data']);
        $hasVideoData = !empty($media['video_data']);
        if (!$hasImageUrl && !$hasImageData && !$hasVideoData) continue;

        $mediaType = ($media['media_type'] ?? '') === 'video' || $hasVideoData ? 'video' : 'image';

        if ($hasVideoData) {
            $mediaUrl = save_video_data($media['video_data'], 'gallery-video');
        } elseif ($hasImageData) {
            $mediaUrl = save_image_data($media['image_data'], 'gallery-image');
        } else {
            $mediaUrl = trim((string)($media['image_url'] ?? ''));
        }

        $thumbnailUrl = !empty($media['thumbnail_data'])
            ? save_image_data($media['thumbnail_data'], 'gallery-video-thumb')
            : trim((string)($media['thumbnail_url'] ?? ''));

        $out[] = [
            'image_url' => $mediaUrl,
            'media_type' => $mediaType,
            'thumbnail_url' => $thumbnailUrl !== '' ? $thumbnailUrl : null,
            'notes' => trim((string)($media['notes'] ?? '')) !== '' ? trim((string)$media['notes']) : null,
            'sort_order' => $index,
        ];
        $index++;
    }
    return $out;
}

// Shared create/update logic for a gallery collection, mirroring Node's
// saveGalleryCollection(). Returns the collection id.
function save_gallery_collection(array $body, $id = null) {
    $pondId = !empty($body['pond_id']) ? (int)$body['pond_id'] : null;
    $title = trim((string)($body['title'] ?? $body['display_name'] ?? ''));
    if ($title === '') $title = 'Gallery ' . date('d/m/Y');
    $segmentName = trim((string)($body['segment_name'] ?? ''));
    $galleryDate = trim((string)($body['gallery_date'] ?? '')) ?: date('Y-m-d');
    $notes = trim((string)($body['notes'] ?? ''));
    $sourceType = trim((string)($body['source_type'] ?? ''));
    $sourceId = !empty($body['source_id']) ? (int)$body['source_id'] : null;

    $images = normalize_gallery_images($body['images'] ?? []);
    if (count($images) === 0) send_error(400, 'Minimal satu foto/video wajib diisi');

    if (!$id && $sourceType !== '' && $sourceId !== null) {
        $existing = query_one(
            'SELECT id FROM gallery_collections WHERE source_type = ? AND source_id = ? LIMIT 1',
            [$sourceType, $sourceId]
        );
        if (!empty($existing['id'])) $id = (int)$existing['id'];
    }

    if ($id) {
        execute(
            'UPDATE gallery_collections SET pond_id = ?, title = ?, segment_name = ?, gallery_date = ?, notes = ?, source_type = ?, source_id = ? WHERE id = ?',
            [$pondId, $title, $segmentName !== '' ? $segmentName : null, $galleryDate ?: null, $notes !== '' ? $notes : null,
             $sourceType !== '' ? $sourceType : null, $sourceId, $id]
        );
        execute('DELETE FROM gallery_images WHERE gallery_id = ?', [$id]);
    } else {
        execute(
            'INSERT INTO gallery_collections (pond_id, title, segment_name, gallery_date, notes, source_type, source_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)',
            [$pondId, $title, $segmentName !== '' ? $segmentName : null, $galleryDate ?: null, $notes !== '' ? $notes : null,
             $sourceType !== '' ? $sourceType : null, $sourceId]
        );
        $id = (int)db()->lastInsertId();
    }

    foreach ($images as $image) {
        execute(
            'INSERT INTO gallery_images (gallery_id, image_url, media_type, thumbnail_url, notes, sort_order)
             VALUES (?, ?, ?, ?, ?, ?)',
            [$id, $image['image_url'], $image['media_type'], $image['thumbnail_url'], $image['notes'], $image['sort_order']]
        );
    }

    return $id;
}

route('POST', '/gallery', function () {
    require_account();
    $body = read_json_body();
    $collectionId = save_gallery_collection($body);
    send_json(201, query_one('SELECT * FROM gallery_collections WHERE id = ?', [$collectionId]));
});

route_pattern('GET', '#^/gallery/(\d+)$#', function (array $m) {
    $collection = query_one('SELECT * FROM gallery_collections WHERE id = ?', [$m[1]]);
    if (!$collection) send_error(404, 'Galeri tidak ditemukan');
    $collection['images'] = query('SELECT * FROM gallery_images WHERE gallery_id = ? ORDER BY sort_order ASC', [$m[1]]);
    send_json(200, $collection);
});

// Collections that follow another record (a report, a breeding session, a pond's documentation) are changed
// or removed from that record's own menu, never directly here.
function gallery_block_source_collection(int $id): void {
    $row = query_one(
        "SELECT gallery_collections.source_type, farm_reports.batch_code AS report_code, breeding_batches.batch_code AS breeding_code, ponds.name AS pond_name
         FROM gallery_collections
         LEFT JOIN farm_reports ON gallery_collections.source_type = 'report' AND farm_reports.id = gallery_collections.source_id
         LEFT JOIN breeding_batches ON gallery_collections.source_type = 'breeding' AND breeding_batches.id = gallery_collections.source_id
         LEFT JOIN ponds ON gallery_collections.source_type = 'pond' AND ponds.id = gallery_collections.source_id
         WHERE gallery_collections.id = ?",
        [$id]
    );
    if (!$row) return;
    if ($row['source_type'] === 'report') {
        send_error(409, 'Koleksi ini dibuat dari Laporan ' . ($row['report_code'] ?: '') . '. Ubah atau hapus lewat menu Laporan: buka laporannya, lalu lepas centang "Tampilkan media di Galeri" atau hapus laporannya.');
    }
    if ($row['source_type'] === 'breeding') {
        send_error(409, 'Koleksi ini dibuat dari Breeding ' . ($row['breeding_code'] ?: '') . '. Ubah atau hapus lewat menu Breeding: buka sesinya, lalu lepas centang "Tampilkan dokumentasi di Galeri" atau hapus sesinya.');
    }
    if ($row['source_type'] === 'sell') {
        send_error(409, 'Koleksi ini dibuat dari Katalog. Ubah atau hapus lewat menu Penjualan > Katalog: buka itemnya, lalu lepas centang "Tampilkan dokumentasi di Galeri" atau hapus itemnya.');
    }
    if ($row['source_type'] === 'invoice') {
        send_error(409, 'Koleksi ini dibuat dari Invoice. Ubah atau hapus lewat menu Penjualan > Invoice: buka invoicenya, lalu lepas centang "Tampilkan dokumentasi di Galeri" atau hapus invoicenya.');
    }
    if ($row['source_type'] === 'pond') {
        send_error(409, 'Koleksi ini adalah dokumentasi Kolam ' . ($row['pond_name'] ?: '') . '. Ubah atau hapus dokumentasinya lewat menu Data Kolam (Isi Kolam).');
    }
}

$galleryUpdateHandler = function (array $m) {
    require_account();
    $body = read_json_body();
    $existing = query_one('SELECT id FROM gallery_collections WHERE id = ?', [$m[1]]);
    if (!$existing) send_error(404, 'Galeri tidak ditemukan');
    gallery_block_source_collection((int)$m[1]);

    // When the edit form sends `images`, treat it like a full save (mirrors
    // Node's saveGalleryCollection: new base64 media gets uploaded, existing
    // gallery_images rows are replaced). Without `images`, fall back to a
    // plain field patch so partial updates (e.g. just notes) still work.
    if (array_key_exists('images', $body) && is_array($body['images'])) {
        $collectionId = save_gallery_collection($body, (int)$m[1]);
        send_json(200, query_one('SELECT * FROM gallery_collections WHERE id = ?', [$collectionId]));
    }

    $fields = [];
    $params = [];
    foreach (['title', 'segment_name', 'gallery_date', 'notes'] as $col) {
        if (array_key_exists($col, $body)) {
            $fields[] = "$col = ?";
            $params[] = $body[$col];
        }
    }
    if ($fields) {
        $params[] = $m[1];
        execute('UPDATE gallery_collections SET ' . implode(', ', $fields) . ' WHERE id = ?', $params);
    }
    $collection = query_one('SELECT * FROM gallery_collections WHERE id = ?', [$m[1]]);
    if (!$collection) send_error(404, 'Galeri tidak ditemukan');
    send_json(200, $collection);
};

route_pattern('PATCH', '#^/gallery/(\d+)$#', $galleryUpdateHandler);
route_pattern('PUT', '#^/gallery/(\d+)$#', $galleryUpdateHandler);

route_pattern('DELETE', '#^/gallery/(\d+)$#', function (array $m) {
    require_account();
    gallery_block_source_collection((int)$m[1]);
    require_once __DIR__ . '/../lib/uploads.php';
    $rows = query('SELECT * FROM gallery_collections WHERE id = ?', [$m[1]]);
    foreach (query('SELECT * FROM gallery_images WHERE gallery_id = ?', [$m[1]]) as $image) $rows[] = $image;
    $urls = upload_urls_in_rows($rows);
    execute('DELETE FROM gallery_collections WHERE id = ?', [$m[1]]);
    $deletedFiles = delete_upload_files_if_unused($urls);
    send_json(200, ['ok' => true, 'deleted_files' => $deletedFiles]);
});

// Archive / restore any collection (report collections too: it only hides them from the gallery).
route_pattern('POST', '#^/gallery/(\d+)/archive$#', function (array $m) {
    require_account();
    if (!query_one('SELECT id FROM gallery_collections WHERE id = ?', [$m[1]])) send_error(404, 'Galeri tidak ditemukan');
    execute('UPDATE gallery_collections SET archived_at = COALESCE(archived_at, NOW()) WHERE id = ?', [$m[1]]);
    send_json(200, ['ok' => true]);
});

route_pattern('POST', '#^/gallery/(\d+)/unarchive$#', function (array $m) {
    require_account();
    execute('UPDATE gallery_collections SET archived_at = NULL WHERE id = ?', [$m[1]]);
    send_json(200, ['ok' => true]);
});
