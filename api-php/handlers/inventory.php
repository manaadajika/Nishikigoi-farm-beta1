<?php
// api-php/handlers/inventory.php
//
// Etc > Inventaris: things the farm buys. An item is either "habis_pakai" (consumable, refilled: feed, medicine, ...),
// "aset" (bought once: pump, net, ... and can be damaged) or "ikan" (a purchase of fish, optionally pointing at Data Ikan).
//
// The stock of an item is never typed in: it is calculated from its movements (the history), so it can never disagree
// with the history. Movement types:
//   masuk       stock + qty                      (a purchase: price, supplier, date, place)
//   keluar      stock - qty                      (used up / given away)
//   rusak       qty becomes damaged              (stock stays, "baik" goes down)
//   diperbaiki  qty becomes good again
//   pindah      only changes the last location
//   koreksi     signed qty, set from "stok sebenarnya" (stock take)

const INVENTORY_KINDS = ['habis_pakai', 'aset', 'ikan'];
const INVENTORY_MOVES = ['masuk', 'keluar', 'rusak', 'diperbaiki', 'pindah', 'koreksi'];

function inv_number($value, string $label, bool $allowNull = true) {
    if ($value === null || $value === '') {
        if ($allowNull) return null;
        send_error(400, "$label wajib diisi");
    }
    if (is_string($value)) {
        $text = trim(preg_replace('/^\s*rp\.?\s*/i', '', $value));
        $value = preg_match('/^-?\d+(\.\d+)?$/', $text) ? $text : str_replace(['.', ','], ['', '.'], $text);
    }
    if (!is_numeric($value)) send_error(400, "$label harus berupa angka");
    return round((float)$value, 2);
}

function inv_clean_date($value): string {
    $value = trim((string)$value);
    if ($value === '') return date('Y-m-d');
    return koi_clean_partial_date($value, 'Tanggal') ?? date('Y-m-d');
}

function inv_text($value, int $max): ?string {
    $text = trim((string)($value ?? ''));
    return $text === '' ? null : mb_substr($text, 0, $max);
}

function inv_image($value): ?string {
    $url = trim((string)($value ?? ''));
    if ($url === '') return null;
    if (!(str_starts_with($url, '/api/uploads/') || preg_match('#^https?://#i', $url))) return null;
    return mb_substr($url, 0, 500);
}

// Adds stock, damaged, good and the last purchase / location to every item (two queries for all items).
function inv_enrich(array $items): array {
    if (!$items) return [];
    $sums = [];
    foreach (query('SELECT item_id, type, SUM(qty) AS q, SUM(COALESCE(total_price, 0)) AS spent, COUNT(*) AS n FROM inventory_movements GROUP BY item_id, type') as $row) {
        $sums[(int)$row['item_id']][$row['type']] = $row;
    }
    $lastIn = [];
    foreach (query("SELECT m.* FROM inventory_movements m
                    JOIN (SELECT item_id, MAX(id) AS mid FROM inventory_movements WHERE type = 'masuk' GROUP BY item_id) x ON x.mid = m.id") as $row) {
        $lastIn[(int)$row['item_id']] = $row;
    }
    $lastPlace = [];
    foreach (query("SELECT m.item_id, m.location, m.movement_date FROM inventory_movements m
                    JOIN (SELECT item_id, MAX(id) AS mid FROM inventory_movements WHERE location IS NOT NULL AND location <> '' GROUP BY item_id) x ON x.mid = m.id") as $row) {
        $lastPlace[(int)$row['item_id']] = $row;
    }
    foreach ($items as &$item) {
        $id = (int)$item['id'];
        $q = fn(string $type) => (float)($sums[$id][$type]['q'] ?? 0);
        $stock = $q('masuk') - $q('keluar') + $q('koreksi');
        $damaged = max(0.0, min($stock, $q('rusak') - $q('diperbaiki')));
        $item['stock'] = round($stock, 2);
        $item['damaged'] = round($damaged, 2);
        $item['good'] = round($stock - $damaged, 2);
        $item['movement_count'] = array_sum(array_map(fn($row) => (int)$row['n'], $sums[$id] ?? []));
        $item['total_spent'] = round((float)($sums[$id]['masuk']['spent'] ?? 0), 2);
        $item['last_price'] = isset($lastIn[$id]['unit_price']) ? (float)$lastIn[$id]['unit_price'] : null;
        $item['last_in_date'] = $lastIn[$id]['movement_date'] ?? null;
        $item['last_supplier'] = $lastIn[$id]['supplier'] ?? null;
        $item['last_location'] = $lastPlace[$id]['location'] ?? null;
        $item['min_stock'] = $item['min_stock'] === null ? null : (float)$item['min_stock'];
        $item['monthly_need'] = $item['monthly_need'] === null ? null : (float)$item['monthly_need'];
        $item['needs_buy'] = $item['kind'] === 'habis_pakai' && $item['min_stock'] !== null && $stock <= $item['min_stock'];
    }
    unset($item);
    return $items;
}

function inv_item_or_404(int $id): array {
    $row = query_one('SELECT * FROM inventory_items WHERE id = ?', [$id]);
    if (!$row) send_error(404, 'Barang tidak ditemukan');
    return $row;
}

function inv_one(int $id): array {
    return inv_enrich([inv_item_or_404($id)])[0];
}

function inv_fields(array $body, bool $partial): array {
    $fields = [];
    if (!$partial || array_key_exists('name', $body)) {
        $name = trim((string)($body['name'] ?? ''));
        if ($name === '') send_error(400, 'Nama barang wajib diisi');
        $fields['name'] = mb_substr($name, 0, 200);
    }
    if (!$partial || array_key_exists('kind', $body)) {
        $kind = (string)($body['kind'] ?? 'habis_pakai');
        if (!in_array($kind, INVENTORY_KINDS, true)) send_error(400, 'Jenis harus habis pakai, aset, atau ikan');
        $fields['kind'] = $kind;
    }
    if (array_key_exists('category', $body)) $fields['category'] = inv_text($body['category'], 100);
    if (array_key_exists('unit', $body)) $fields['unit'] = inv_text($body['unit'], 30);
    if (array_key_exists('image_url', $body)) $fields['image_url'] = inv_image($body['image_url']);
    if (array_key_exists('min_stock', $body)) $fields['min_stock'] = inv_number($body['min_stock'], 'Stok minimum');
    if (array_key_exists('monthly_need', $body)) $fields['monthly_need'] = inv_number($body['monthly_need'], 'Kebutuhan per bulan');
    if (array_key_exists('notes', $body)) $fields['notes'] = inv_text($body['notes'], 2000);
    return $fields;
}

// Validates one movement against the current numbers of its item and returns the row to store.
function inv_movement_row(array $item, array $body): array {
    $type = (string)($body['type'] ?? '');
    if (!in_array($type, INVENTORY_MOVES, true)) send_error(400, 'Jenis catatan tidak dikenal');
    $now = inv_enrich([$item])[0];
    $qty = inv_number($body['qty'] ?? null, 'Jumlah');
    $price = inv_number($body['unit_price'] ?? null, 'Harga satuan');
    $location = inv_text($body['location'] ?? null, 200);
    $row = [
        'type' => $type,
        'qty' => 0.0,
        'unit_price' => null,
        'total_price' => null,
        'supplier' => inv_text($body['supplier'] ?? null, 200),
        'movement_date' => inv_clean_date($body['movement_date'] ?? ''),
        'location' => $location,
        'koi_ids' => null,
        'notes' => inv_text($body['notes'] ?? null, 1000),
    ];
    $unit = $item['unit'] ? ' ' . $item['unit'] : '';
    switch ($type) {
        case 'masuk':
            if ($qty === null || $qty <= 0) send_error(400, 'Jumlah pembelian harus lebih dari 0');
            $row['qty'] = $qty;
            $row['unit_price'] = $price;
            if ($price !== null) $row['total_price'] = round($qty * $price, 2);
            if (isset($body['total_price']) && $price === null) {
                $total = inv_number($body['total_price'], 'Total harga');
                if ($total !== null) {
                    $row['total_price'] = $total;
                    $row['unit_price'] = round($total / $qty, 2);
                }
            }
            if (!empty($body['koi_ids']) && is_array($body['koi_ids'])) {
                $ids = array_values(array_unique(array_filter(array_map('intval', $body['koi_ids']), fn($v) => $v > 0)));
                $row['koi_ids'] = $ids ? json_encode($ids) : null;
            }
            break;
        case 'keluar':
            if ($qty === null || $qty <= 0) send_error(400, 'Jumlah pemakaian harus lebih dari 0');
            if ($qty > $now['stock'] + 1e-9) send_error(422, 'Stok tidak cukup. Tersisa ' . $now['stock'] . $unit . '.');
            $row['qty'] = $qty;
            break;
        case 'rusak':
            if ($qty === null || $qty <= 0) send_error(400, 'Jumlah yang rusak harus lebih dari 0');
            if ($qty > $now['good'] + 1e-9) send_error(422, 'Hanya ' . $now['good'] . $unit . ' yang masih baik.');
            $row['qty'] = $qty;
            break;
        case 'diperbaiki':
            if ($qty === null || $qty <= 0) send_error(400, 'Jumlah yang diperbaiki harus lebih dari 0');
            if ($qty > $now['damaged'] + 1e-9) send_error(422, 'Hanya ' . $now['damaged'] . $unit . ' yang tercatat rusak.');
            $row['qty'] = $qty;
            break;
        case 'pindah':
            if ($location === null) send_error(400, 'Lokasi baru wajib diisi');
            break;
        case 'koreksi':
            $actual = inv_number($body['actual_stock'] ?? null, 'Stok sebenarnya', false);
            if ($actual < 0) send_error(400, 'Stok sebenarnya tidak boleh negatif');
            $delta = round($actual - $now['stock'], 2);
            if (abs($delta) < 0.005) send_error(422, 'Stok sudah sesuai dengan catatan.');
            $row['qty'] = $delta;
            break;
    }
    return $row;
}

function inv_insert_movement(int $itemId, array $row, ?string $by): int {
    execute(
        'INSERT INTO inventory_movements (item_id, type, qty, unit_price, total_price, supplier, movement_date, location, koi_ids, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [$itemId, $row['type'], $row['qty'], $row['unit_price'], $row['total_price'], $row['supplier'], $row['movement_date'], $row['location'], $row['koi_ids'], $row['notes'], $by]
    );
    execute('UPDATE inventory_items SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [$itemId]);
    return (int)db()->lastInsertId();
}

function inv_movements(int $itemId): array {
    $rows = query('SELECT * FROM inventory_movements WHERE item_id = ? ORDER BY movement_date DESC, id DESC', [$itemId]);
    foreach ($rows as &$row) {
        $ids = json_decode((string)($row['koi_ids'] ?? ''), true);
        $row['koi_ids'] = is_array($ids) ? array_map('intval', $ids) : [];
    }
    unset($row);
    return $rows;
}

route('GET', '/inventory', function () {
    $items = query('SELECT * FROM inventory_items WHERE archived_at IS NULL ORDER BY name');
    send_json(200, inv_enrich($items));
});

route_pattern('GET', '#^/inventory/(\d+)$#', function (array $m) {
    $item = inv_one((int)$m[1]);
    $item['movements'] = inv_movements((int)$m[1]);
    send_json(200, $item);
});

route('POST', '/inventory', function () {
    $session = require_account();
    $body = read_json_body();
    $fields = inv_fields($body, false);
    $fields['created_by'] = (string)($session['username'] ?? '') ?: null;
    $columns = array_keys($fields);
    execute(
        'INSERT INTO inventory_items (' . implode(', ', array_map(fn($c) => "`$c`", $columns)) . ') VALUES (' . implode(', ', array_fill(0, count($columns), '?')) . ')',
        array_values($fields)
    );
    $id = (int)db()->lastInsertId();
    // optional first purchase, entered together with the item
    $initial = is_array($body['initial'] ?? null) ? $body['initial'] : null;
    if ($initial && (($initial['qty'] ?? '') !== '' || ($initial['location'] ?? '') !== '')) {
        $item = inv_item_or_404($id);
        if (($initial['qty'] ?? '') !== '') {
            $row = inv_movement_row($item, array_merge($initial, ['type' => 'masuk']));
        } else {
            // only a place was given
            $row = inv_movement_row($item, ['type' => 'pindah', 'location' => $initial['location'], 'movement_date' => $initial['movement_date'] ?? '']);
        }
        inv_insert_movement($id, $row, $fields['created_by']);
    }
    send_json(201, inv_one($id));
});

$inventoryUpdate = function (array $m) {
    require_account();
    $id = (int)$m[1];
    $existing = inv_item_or_404($id);
    $fields = inv_fields(read_json_body(), true);
    if (!$fields) send_error(400, 'Tidak ada field untuk diupdate');
    $sets = implode(', ', array_map(fn($c) => "`$c` = ?", array_keys($fields)));
    execute("UPDATE inventory_items SET $sets WHERE id = ?", [...array_values($fields), $id]);
    if (array_key_exists('image_url', $fields) && !empty($existing['image_url']) && $existing['image_url'] !== $fields['image_url']) {
        require_once __DIR__ . '/../lib/uploads.php';
        delete_upload_files_if_unused([$existing['image_url']]);
    }
    send_json(200, inv_one($id));
};
route_pattern('PATCH', '#^/inventory/(\d+)$#', $inventoryUpdate);
route_pattern('PUT', '#^/inventory/(\d+)$#', $inventoryUpdate);

route_pattern('DELETE', '#^/inventory/(\d+)$#', function (array $m) {
    require_account();
    $id = (int)$m[1];
    $item = inv_item_or_404($id);
    execute('DELETE FROM inventory_movements WHERE item_id = ?', [$id]);
    execute('DELETE FROM inventory_items WHERE id = ?', [$id]);
    if (!empty($item['image_url'])) {
        require_once __DIR__ . '/../lib/uploads.php';
        delete_upload_files_if_unused([$item['image_url']]);
    }
    send_json(200, ['ok' => true]);
});

route_pattern('POST', '#^/inventory/(\d+)/movements$#', function (array $m) {
    $session = require_account();
    $id = (int)$m[1];
    $item = inv_item_or_404($id);
    $row = inv_movement_row($item, read_json_body());
    inv_insert_movement($id, $row, (string)($session['username'] ?? '') ?: null);
    $result = inv_one($id);
    $result['movements'] = inv_movements($id);
    send_json(201, $result);
});

// Undo one entry of the history, as long as the numbers that remain stay possible (no negative stock).
route_pattern('DELETE', '#^/inventory/(\d+)/movements/(\d+)$#', function (array $m) {
    require_account();
    $id = (int)$m[1];
    $item = inv_item_or_404($id);
    $movement = query_one('SELECT * FROM inventory_movements WHERE id = ? AND item_id = ?', [(int)$m[2], $id]);
    if (!$movement) send_error(404, 'Catatan tidak ditemukan');
    $stock = 0.0;
    $damaged = 0.0;
    foreach (query('SELECT id, type, qty FROM inventory_movements WHERE item_id = ? ORDER BY movement_date, id', [$id]) as $row) {
        if ((int)$row['id'] === (int)$m[2]) continue;
        $q = (float)$row['qty'];
        if ($row['type'] === 'masuk') $stock += $q;
        elseif ($row['type'] === 'keluar') $stock -= $q;
        elseif ($row['type'] === 'koreksi') $stock += $q;
        elseif ($row['type'] === 'rusak') $damaged += $q;
        elseif ($row['type'] === 'diperbaiki') $damaged -= $q;
        if ($stock < -1e-9 || $damaged < -1e-9 || $damaged > $stock + 1e-9) {
            send_error(409, 'Catatan ini tidak bisa dihapus karena catatan sesudahnya bergantung padanya (stok akan negatif). Hapus catatan yang lebih baru dulu.');
        }
    }
    execute('DELETE FROM inventory_movements WHERE id = ?', [(int)$m[2]]);
    execute('UPDATE inventory_items SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [$id]);
    $result = inv_one($id);
    $result['movements'] = inv_movements($id);
    send_json(200, $result);
});
