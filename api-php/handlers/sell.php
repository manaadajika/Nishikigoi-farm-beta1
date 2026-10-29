<?php
// api-php/handlers/sell.php
//
// Sell menu: fish offered for sale. One item is a single fish, a package of several fish, or only a
// manual (combined) photo; koi_ids points at Data Ikan and media_entries holds manual photos/videos.
// Marking an item sold only changes the item here, Data Ikan is left alone.

const SELL_STATUSES = ['available', 'reserved', 'sold'];

function sell_decode_list($value): array {
    if (is_array($value)) return $value;
    $decoded = json_decode((string)$value, true);
    return is_array($decoded) ? $decoded : [];
}

function sell_clean_ids($value): array {
    $ids = [];
    foreach (sell_decode_list($value) as $id) {
        $id = (int)$id;
        if ($id > 0) $ids[$id] = $id;
    }
    return array_values($ids);
}

function sell_clean_media($value): array {
    $clean = [];
    foreach (sell_decode_list($value) as $entry) {
        if (!is_array($entry)) continue;
        $url = trim((string)($entry['url'] ?? $entry['image_url'] ?? ''));
        // only files this app stored (or an http(s) link), never javascript: or data: URLs
        if ($url === '' || !(str_starts_with($url, '/api/uploads/') || preg_match('#^https?://#i', $url))) continue;
        $thumb = trim((string)($entry['thumbnail_url'] ?? ''));
        if ($thumb !== '' && !(str_starts_with($thumb, '/api/uploads/') || preg_match('#^https?://#i', $thumb))) $thumb = '';
        $clean[] = [
            'type' => ($entry['type'] ?? $entry['media_type'] ?? 'image') === 'video' ? 'video' : 'image',
            'url' => $url,
            'thumbnail_url' => $thumb !== '' ? $thumb : $url,
            'name' => mb_substr((string)($entry['name'] ?? ''), 0, 200),
            'notes' => mb_substr((string)($entry['notes'] ?? ''), 0, 500),
        ];
    }
    return $clean;
}

// The collection of a catalog item in the Galeri ("Tampilkan dokumentasi di Galeri"): follows documentation_entries.
// $show: true/false = the user's choice, null = keep what exists (an existing collection is only refreshed).
function sync_sell_gallery(int $sellId, ?bool $show): void {
    $linked = query_one("SELECT id FROM gallery_collections WHERE source_type = 'sell' AND source_id = ? LIMIT 1", [$sellId]);
    if ($show === null) $show = (bool)$linked;
    $item = $show ? query_one('SELECT * FROM sell_items WHERE id = ?', [$sellId]) : null;
    $media = $item ? normalize_source_media($item['documentation_entries'] ?? '[]') : [];
    sync_source_gallery('sell', $sellId, $show && $item !== null, $media, [
        'pond_id' => null,
        'title' => $item ? trim('Katalog ' . $item['title']) : '',
        'segment_name' => 'Katalog',
        'gallery_date' => $item ? substr((string)($item['created_at'] ?: date('Y-m-d')), 0, 10) : null,
        'notes' => $item ? ($item['description'] ?: null) : null,
    ]);
}

function sell_gallery_choice(array $body): ?bool {
    if (!array_key_exists('show_in_gallery', $body)) return null;
    return filter_var($body['show_in_gallery'], FILTER_VALIDATE_BOOLEAN);
}

function sell_media_urls($value): array {
    $urls = [];
    foreach (sell_clean_media($value) as $entry) {
        $urls[] = $entry['url'];
        if ($entry['thumbnail_url'] !== '' && $entry['thumbnail_url'] !== $entry['url']) $urls[] = $entry['thumbnail_url'];
    }
    return $urls;
}

const SELL_SELECT = "SELECT sell_items.*,
        (SELECT gc.id FROM gallery_collections gc WHERE gc.source_type = 'sell' AND gc.source_id = sell_items.id LIMIT 1) AS gallery_id
    FROM sell_items";

function sell_clean_price($value) {
    $value = blank_to_null($value);
    if ($value === null) return null;
    if (is_string($value)) {
        $text = trim(preg_replace('/^\s*rp\.?\s*/i', '', $value));
        // "8475000" and "8475000.00" are plain numbers; "5.000.000" and "1,5" use Indonesian separators
        $value = preg_match('/^\d+(\.\d{1,2})?$/', $text) ? $text : str_replace(['.', ','], ['', '.'], $text);
    }
    if (!is_numeric($value) || (float)$value < 0) send_error(400, 'Harga harus berupa angka');
    return $value;
}

function sell_clean_date($value): ?string {
    $value = trim((string)blank_to_null($value));
    if ($value === '') return null;
    return koi_clean_partial_date($value, 'Tanggal terjual');
}

// Adds the fish of each item (code, name, photo, size, ...) so the page does not need a second request.
function sell_enrich(array $rows): array {
    $allIds = [];
    foreach ($rows as $row) {
        foreach (sell_clean_ids($row['koi_ids'] ?? '[]') as $id) $allIds[$id] = $id;
    }
    $koiById = [];
    if ($allIds) {
        $marks = implode(',', array_fill(0, count($allIds), '?'));
        foreach (query(
            "SELECT id, code, name, variety, bloodline, farm_name, gender, image_url, current_length_cm, status, sale_price, archived_at
             FROM koi WHERE id IN ($marks)",
            array_values($allIds)
        ) as $koi) {
            $koiById[(int)$koi['id']] = $koi;
        }
    }
    $items = [];
    foreach ($rows as $row) {
        $ids = sell_clean_ids($row['koi_ids'] ?? '[]');
        $koi = [];
        foreach ($ids as $id) {
            if (isset($koiById[$id])) $koi[] = $koiById[$id];
        }
        $media = sell_clean_media($row['media_entries'] ?? '[]');
        $row['koi_ids'] = $ids;
        $row['media_entries'] = $media;
        $row['documentation_entries'] = sell_clean_media($row['documentation_entries'] ?? '[]');
        $row['koi'] = $koi;
        $row['item_type'] = count($ids) > 1 ? 'package' : (count($ids) === 1 ? 'single' : 'photo');
        $items[] = $row;
    }
    return $items;
}

function sell_payload(array $body, bool $partial): array {
    $fields = [];
    if (!$partial || array_key_exists('title', $body)) {
        $title = trim((string)($body['title'] ?? ''));
        if ($title === '') send_error(400, 'Judul wajib diisi');
        $fields['title'] = mb_substr($title, 0, 200);
    }
    if (array_key_exists('price', $body)) $fields['price'] = sell_clean_price($body['price']);
    if (array_key_exists('status', $body)) {
        $status = (string)$body['status'];
        if (!in_array($status, SELL_STATUSES, true)) send_error(400, 'Status harus tersedia, dipesan, atau terjual');
        $fields['status'] = $status;
    }
    if (array_key_exists('description', $body)) $fields['description'] = trim((string)$body['description']) ?: null;
    if (array_key_exists('koi_ids', $body)) $fields['koi_ids'] = json_encode(sell_clean_ids($body['koi_ids']));
    if (array_key_exists('media_entries', $body)) {
        $fields['media_entries'] = json_encode(sell_clean_media($body['media_entries']), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
    if (array_key_exists('documentation_entries', $body)) {
        $fields['documentation_entries'] = json_encode(sell_clean_media($body['documentation_entries']), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
    if (array_key_exists('buyer', $body)) $fields['buyer'] = mb_substr(trim((string)$body['buyer']), 0, 150) ?: null;
    if (array_key_exists('sold_at', $body)) $fields['sold_at'] = sell_clean_date($body['sold_at']);
    return $fields;
}

route('GET', '/sell', function () {
    $rows = query(SELL_SELECT . " ORDER BY FIELD(sell_items.status, 'available', 'reserved', 'sold'), sell_items.id DESC");
    send_json(200, sell_enrich($rows));
});

route_pattern('GET', '#^/sell/(\d+)$#', function (array $m) {
    $row = query_one(SELL_SELECT . ' WHERE sell_items.id = ?', [$m[1]]);
    if (!$row) send_error(404, 'Item katalog tidak ditemukan');
    send_json(200, sell_enrich([$row])[0]);
});

route('POST', '/sell', function () {
    $session = require_account();
    $body = read_json_body();
    $fields = sell_payload($body, false);
    $fields += ['status' => 'available'];
    $fields['created_by'] = (string)($session['username'] ?? '') ?: null;
    // a sold item keeps the day it was marked sold
    if ($fields['status'] === 'sold' && empty($fields['sold_at'])) $fields['sold_at'] = date('Y-m-d');
    $columns = array_keys($fields);
    execute(
        'INSERT INTO sell_items (' . implode(', ', array_map(fn($c) => "`$c`", $columns)) . ') VALUES (' . implode(', ', array_fill(0, count($columns), '?')) . ')',
        array_values($fields)
    );
    $id = (int)db()->lastInsertId();
    sync_sell_gallery($id, sell_gallery_choice($body) ?? false);
    send_json(201, sell_enrich([query_one(SELL_SELECT . ' WHERE sell_items.id = ?', [$id])])[0]);
});

$sellUpdate = function (array $m) {
    require_account();
    $existing = query_one('SELECT * FROM sell_items WHERE id = ?', [$m[1]]);
    if (!$existing) send_error(404, 'Item katalog tidak ditemukan');
    $body = read_json_body();
    $fields = sell_payload($body, true);
    $galleryChoice = sell_gallery_choice($body);
    if (($fields['status'] ?? null) === 'sold' && !array_key_exists('sold_at', $fields) && empty($existing['sold_at'])) {
        $fields['sold_at'] = date('Y-m-d');
    }
    // going back to available or reserved clears the sold information unless it was sent explicitly
    if (isset($fields['status']) && $fields['status'] !== 'sold') {
        if (!array_key_exists('sold_at', $fields)) $fields['sold_at'] = null;
        if (!array_key_exists('buyer', $fields)) $fields['buyer'] = null;
    }
    if (!$fields && $galleryChoice === null) send_error(400, 'Tidak ada field untuk diupdate');
    if ($fields) {
        $sets = implode(', ', array_map(fn($c) => "`$c` = ?", array_keys($fields)));
        execute("UPDATE sell_items SET $sets WHERE id = ?", [...array_values($fields), $m[1]]);
    }
    // the Galeri collection follows the documentation (and the title in its name)
    sync_sell_gallery((int)$m[1], $galleryChoice);
    // files of removed photos or documentation go away only when nothing else uses them
    $dropped = [];
    foreach (['media_entries', 'documentation_entries'] as $column) {
        if (array_key_exists($column, $fields)) {
            $dropped = array_merge($dropped, array_diff(sell_media_urls($existing[$column] ?? '[]'), sell_media_urls($fields[$column])));
        }
    }
    $dropped = array_values(array_unique($dropped));
    if ($dropped) {
        require_once __DIR__ . '/../lib/uploads.php';
        delete_upload_files_if_unused($dropped);
    }
    send_json(200, sell_enrich([query_one(SELL_SELECT . ' WHERE sell_items.id = ?', [$m[1]])])[0]);
};
route_pattern('PATCH', '#^/sell/(\d+)$#', $sellUpdate);
route_pattern('PUT', '#^/sell/(\d+)$#', $sellUpdate);

route_pattern('DELETE', '#^/sell/(\d+)$#', function (array $m) {
    require_account();
    $row = query_one('SELECT media_entries, documentation_entries FROM sell_items WHERE id = ?', [$m[1]]);
    if (!$row) send_error(404, 'Item katalog tidak ditemukan');
    execute('DELETE FROM sell_items WHERE id = ?', [$m[1]]);
    execute("DELETE FROM gallery_collections WHERE source_type = 'sell' AND source_id = ?", [$m[1]]);
    // files of the manual photos and documentation go away only when nothing else uses them
    $urls = array_values(array_unique(array_merge(
        sell_media_urls($row['media_entries'] ?? '[]'),
        sell_media_urls($row['documentation_entries'] ?? '[]')
    )));
    if ($urls) {
        require_once __DIR__ . '/../lib/uploads.php';
        delete_upload_files_if_unused($urls);
    }
    send_json(200, ['ok' => true]);
});
