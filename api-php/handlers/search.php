<?php
// api-php/handlers/search.php
// Global search (navbar search box) and the value suggestions of text fields.
//
// GET /search?q=kata+kunci   -> hits from every menu, a few per menu, each with the page that opens it
// GET /suggestions           -> values already used in the data, per field kind (lokasi, kategori, satuan, ...)

function search_like(string $term): string {
    return '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $term) . '%';
}

// Every word must appear in at least one of the columns (so "kohaku pond 3" narrows down).
// Returns [sql condition, params].
function search_condition(array $terms, array $columns): array {
    $parts = [];
    $params = [];
    foreach ($terms as $term) {
        $ors = [];
        foreach ($columns as $column) {
            $ors[] = "$column LIKE ?";
            $params[] = search_like($term);
        }
        $parts[] = '(' . implode(' OR ', $ors) . ')';
    }
    return [implode(' AND ', $parts), $params];
}

function search_group(string $key, string $label, string $icon, array $rows): array {
    return ['key' => $key, 'label' => $label, 'icon' => $icon, 'items' => $rows];
}

route('GET', '/search', function () {
    require_account();
    $q = trim((string)($_GET['q'] ?? ''));
    if (mb_strlen($q) < 2) send_json(200, ['q' => $q, 'groups' => []]);
    $q = mb_substr($q, 0, 80);
    $terms = array_values(array_filter(preg_split('/\s+/u', $q), fn($t) => $t !== ''));
    $terms = array_slice($terms, 0, 5);
    $limit = max(1, min(8, (int)($_GET['limit'] ?? 5)));
    $fetch = $limit + 1; // one extra row tells the page there are more
    // Several fish codes (26G0DL 26ZTVY, also with commas): "any of these codes", same as the list search of Data Ikan.
    $rawTokens = preg_split('/[\s,;]+/u', $q, -1, PREG_SPLIT_NO_EMPTY);
    $isCodeList = count($rawTokens) >= 2 && !array_filter($rawTokens, fn($t) => !preg_match('/^\d{2}[A-Za-z0-9]{3,6}$/', $t));
    if ($isCodeList) {
        $rawTokens = array_slice(array_values(array_unique(array_map('strtoupper', $rawTokens))), 0, 60);
        $limit = 60;
        $fetch = 61;
    }
    $groups = [];
    $foundCodes = [];
    $add = function (string $key, string $label, string $icon, array $rows) use (&$groups, $limit) {
        if (!$rows) return;
        $more = count($rows) > $limit;
        $group = search_group($key, $label, $icon, array_slice($rows, 0, $limit));
        $group['more'] = $more;
        $groups[] = $group;
    };

    // Data Ikan (active) and Archive
    foreach ([['koi', 'Data Ikan', 'fish', 'IS NULL'], ['archive', 'Archive', 'archive', 'IS NOT NULL']] as [$key, $label, $icon, $cond]) {
        if ($isCodeList) {
            $where = 'UPPER(k.code) IN (' . implode(',', array_fill(0, count($rawTokens), '?')) . ')';
            $params = $rawTokens;
        } else {
            [$where, $params] = search_condition($terms, ['k.code', 'k.name', 'k.variety', 'k.bloodline', 'k.farm_name', 'k.breeder', 'k.parent_info', 'k.notes', 'p.name']);
        }
        $rows = query(
            "SELECT k.id, k.code, k.name, k.variety, k.bloodline, k.farm_name, k.current_length_cm, k.status, k.image_url, p.name AS pond_name
             FROM koi k LEFT JOIN ponds p ON p.id = k.pond_id
             WHERE k.archived_at $cond AND $where ORDER BY k.code LIMIT $fetch",
            $params
        );
        $items = [];
        foreach ($rows as $r) {
            $foundCodes[strtoupper((string)$r['code'])] = true;
            $size = (float)$r['current_length_cm'] > 0 ? rtrim(rtrim(number_format((float)$r['current_length_cm'], 1, ',', ''), '0'), ',') . ' cm' : '';
            $items[] = [
                'id' => (int)$r['id'],
                'title' => trim($r['code'] . ' ' . ($r['name'] ? '(' . $r['name'] . ')' : '')),
                'subtitle' => implode(' · ', array_filter([$r['variety'], $r['bloodline'], $size, $r['pond_name'] ? 'Kolam ' . $r['pond_name'] : ($key === 'archive' ? 'Diarsipkan' : ''), $r['farm_name']])),
                'image' => $r['image_url'] ?: null,
                'url' => 'farm-koi.html?' . ($key === 'archive' ? 'arsip=1&' : '') . 'cari=' . rawurlencode((string)$r['code']),
            ];
        }
        $add($key, $label, $icon, $items);
    }

    if ($isCodeList) {
        $missing = array_values(array_filter($rawTokens, fn($c) => !isset($foundCodes[$c])));
        send_json(200, ['q' => $q, 'groups' => $groups, 'mode' => 'codes', 'requested' => count($rawTokens), 'missing' => $missing]);
    }

    // Data Kolam
    [$where, $params] = search_condition($terms, ['name', 'location', 'notes', 'status']);
    $rows = query("SELECT id, name, location, status FROM ponds WHERE $where ORDER BY name LIMIT $fetch", $params);
    $add('ponds', 'Data Kolam', 'bowl', array_map(fn($r) => [
        'id' => (int)$r['id'], 'title' => (string)$r['name'],
        'subtitle' => (string)$r['location'],
        'url' => 'farm-ponds.html?open=' . (int)$r['id'],
    ], $rows));

    // Breeding
    [$where, $params] = search_condition($terms, ['batch_code', 'session_name', 'notes', 'status', 'spawning_method']);
    $rows = query("SELECT id, batch_code, session_name, breeding_date, status FROM breeding_batches WHERE $where ORDER BY breeding_date DESC, id DESC LIMIT $fetch", $params);
    $add('breeding', 'Breeding', 'dna-2', array_map(fn($r) => [
        'id' => (int)$r['id'], 'title' => trim(($r['session_name'] ?: 'Breeding') . ' ' . $r['batch_code']),
        'subtitle' => implode(' · ', array_filter([$r['breeding_date'] ? substr((string)$r['breeding_date'], 0, 10) : '', $r['status']])),
        'url' => 'farm-breeding.html?open=' . (int)$r['id'],
    ], $rows));

    // Laporan
    [$where, $params] = search_condition($terms, ['report_title', 'batch_code', 'report_type', 'dominant_variety', 'notes', 'origin_location', 'destination_location', 'reporter', 'result']);
    $rows = query("SELECT id, report_type, report_title, batch_code, report_date FROM farm_reports WHERE $where ORDER BY report_date DESC, id DESC LIMIT $fetch", $params);
    $add('reports', 'Laporan', 'report', array_map(fn($r) => [
        'id' => (int)$r['id'], 'title' => (string)($r['report_title'] ?: ($r['batch_code'] ?: 'Laporan #' . $r['id'])),
        'subtitle' => implode(' · ', array_filter([ucfirst((string)$r['report_type']), $r['report_date'] ? substr((string)$r['report_date'], 0, 10) : ''])),
        'url' => 'farm-reports.html?open=' . (int)$r['id'],
    ], $rows));

    // Katalog
    [$where, $params] = search_condition($terms, ['title', 'description', 'buyer', 'status']);
    $rows = query("SELECT id, title, price, status, buyer FROM sell_items WHERE $where ORDER BY id DESC LIMIT $fetch", $params);
    $add('sell', 'Katalog', 'tag', array_map(fn($r) => [
        'id' => (int)$r['id'], 'title' => (string)$r['title'],
        'subtitle' => implode(' · ', array_filter(['Rp ' . number_format((float)$r['price'], 0, ',', '.'), $r['status'], $r['buyer']])),
        'url' => 'farm-sell.html?open=' . (int)$r['id'],
    ], $rows));

    // Invoice
    [$where, $params] = search_condition($terms, ['invoice_no', 'title', 'client_name', 'client_contact', 'notes', 'items']);
    $rows = query("SELECT id, invoice_no, title, client_name, total, status FROM invoices WHERE $where ORDER BY invoice_date DESC, id DESC LIMIT $fetch", $params);
    $add('invoices', 'Invoice', 'file-invoice', array_map(fn($r) => [
        'id' => (int)$r['id'], 'title' => trim($r['invoice_no'] . ' ' . $r['client_name']),
        'subtitle' => implode(' · ', array_filter([$r['title'], 'Rp ' . number_format((float)$r['total'], 0, ',', '.'), $r['status'] === 'paid' ? 'Lunas' : 'Belum dibayar'])),
        'url' => 'farm-invoice.html?open=' . (int)$r['id'],
    ], $rows));

    // Inventaris (also finds an item by the place or shop of its history)
    [$where, $params] = search_condition($terms, ['i.name', 'i.category', 'i.notes', 'i.unit']);
    $histWhere = [];
    $histParams = [];
    foreach ($terms as $term) {
        $histWhere[] = '(m.location LIKE ? OR m.supplier LIKE ?)';
        $histParams[] = search_like($term);
        $histParams[] = search_like($term);
    }
    $rows = query(
        "SELECT i.id, i.name, i.category, i.kind, i.unit FROM inventory_items i
         WHERE i.archived_at IS NULL AND ($where OR EXISTS (SELECT 1 FROM inventory_movements m WHERE m.item_id = i.id AND " . implode(' AND ', $histWhere) . "))
         ORDER BY i.name LIMIT $fetch",
        array_merge($params, $histParams)
    );
    $kinds = ['habis_pakai' => 'Habis pakai', 'aset' => 'Aset', 'ikan' => 'Ikan'];
    $add('inventory', 'Inventaris', 'package', array_map(fn($r) => [
        'id' => (int)$r['id'], 'title' => (string)$r['name'],
        'subtitle' => implode(' · ', array_filter([$kinds[$r['kind']] ?? '', $r['category']])),
        'url' => 'farm-inventory.html?open=' . (int)$r['id'],
    ], $rows));

    // Galeri
    [$where, $params] = search_condition($terms, ['title', 'segment_name', 'notes']);
    $rows = query("SELECT id, title, segment_name, gallery_date FROM gallery_collections WHERE archived_at IS NULL AND $where ORDER BY gallery_date DESC, id DESC LIMIT $fetch", $params);
    $add('gallery', 'Galeri', 'photo', array_map(fn($r) => [
        'id' => (int)$r['id'], 'title' => (string)($r['title'] ?: 'Koleksi #' . $r['id']),
        'subtitle' => implode(' · ', array_filter([$r['segment_name'], $r['gallery_date'] ? substr((string)$r['gallery_date'], 0, 10) : ''])),
        'url' => 'farm-gallery.html?id=' . (int)$r['id'],
    ], $rows));

    send_json(200, ['q' => $q, 'groups' => $groups]);
});

// Values that were typed before, most used first. The page keeps them and offers them while typing in a field.
route('GET', '/suggestions', function () {
    require_account();
    $sources = [
        'variety' => [['koi', 'variety'], ['farm_reports', 'dominant_variety']],
        'bloodline' => [['koi', 'bloodline']],
        'farm' => [['koi', 'farm_name']],
        'breeder' => [['koi', 'breeder']],
        'location' => [['inventory_movements', 'location'], ['farm_reports', 'origin_location'], ['farm_reports', 'destination_location'], ['koi', 'archive_location'], ['ponds', 'location']],
        'category' => [['inventory_items', 'category']],
        'unit' => [['inventory_items', 'unit']],
        'supplier' => [['inventory_movements', 'supplier']],
        'client' => [['invoices', 'client_name']],
        'buyer' => [['sell_items', 'buyer']],
    ];
    $result = [];
    foreach ($sources as $key => $columns) {
        $counts = [];
        foreach ($columns as [$table, $column]) {
            foreach (query("SELECT TRIM($column) AS v, COUNT(*) AS n FROM $table WHERE $column IS NOT NULL AND TRIM($column) <> '' GROUP BY TRIM($column) LIMIT 400") as $row) {
                $value = (string)$row['v'];
                if (mb_strlen($value) > 120) continue;
                $lower = mb_strtolower($value);
                if (!isset($counts[$lower])) $counts[$lower] = ['v' => $value, 'n' => 0];
                $counts[$lower]['n'] += (int)$row['n'];
            }
        }
        usort($counts, fn($a, $b) => $b['n'] <=> $a['n'] ?: strcasecmp($a['v'], $b['v']));
        $result[$key] = array_slice(array_map(fn($c) => $c['v'], $counts), 0, 150);
    }
    send_json(200, $result);
});
