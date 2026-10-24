<?php
// api-php/handlers/dashboard_extra.php
// Extra figures for the Management Dashboard below the eight main cards. Archived fish are never counted.

require_once __DIR__ . '/../lib/maintenance.php';
require_once __DIR__ . '/../lib/cache.php';

// The Dashboard figures are the same for every account and cost a few dozen queries, while every open Dashboard asks again every 30 seconds.
// The answer of each kind is kept for 2 minutes in the shared cache (lib/cache.php) and dropped at once when any write succeeds (index.php),
// so the time only covers what changes without a request (30 day windows, the backup stamps written by the background worker).
const DASHBOARD_CACHE_TTL = 120;

// Sends the cached answer of $name and stops, or arms send_json() to store the answer that is about to be built.
function dashboard_cache_serve(string $name): void {
    $key = 'dash:' . cache_ns('dashboard') . ':' . $name;
    $hit = cache_get($key);
    if (is_array($hit)) send_json(200, $hit);
    $GLOBALS['dashboard_cache_key'] = $key;
}

route('GET', '/summary-extra', function () {
    require_account();
    dashboard_cache_serve('extra');
    $out = [];

    // growth of the collection: counted from the 1st of the current month (starts again at 0 on the 1st); the keys keep their old *_30d names
    $out['added_30d'] = (int)(query_one('SELECT COUNT(*) AS c FROM koi WHERE archived_at IS NULL AND created_at >= DATE_FORMAT(NOW(), "%Y-%m-01")')['c'] ?? 0);
    $out['archived_30d'] = (int)(query_one('SELECT COUNT(*) AS c FROM koi WHERE archived_at >= DATE_FORMAT(NOW(), "%Y-%m-01")')['c'] ?? 0);

    // indukan that are new this month: created as indukan this month, or turned into indukan this month by a breeding session
    $monthStart = date('Y-m-01');
    $newBreeders = (int)(query_one("SELECT COUNT(*) AS c FROM koi WHERE archived_at IS NULL AND parent_type = 'indukan' AND created_at >= ?", [$monthStart])['c'] ?? 0);
    $promoted = [];
    foreach (breeding_auto_state()['at'] as $id => $month) if ($month === date('Y-m')) $promoted[] = (int)$id;
    if ($promoted) {
        $marks = implode(',', array_fill(0, count($promoted), '?'));
        $newBreeders += (int)(query_one("SELECT COUNT(*) AS c FROM koi WHERE archived_at IS NULL AND parent_type = 'indukan' AND created_at < ? AND id IN ($marks)", array_merge([$monthStart], $promoted))['c'] ?? 0);
    }
    $out['new_breeders_month'] = $newBreeders;

    // data that still has to be completed
    $inc = query_one(
        "SELECT
            COALESCE(SUM(image_url IS NULL OR image_url = ''), 0) AS no_photo,
            COALESCE(SUM(pond_id IS NULL AND (area IS NULL OR area = '')), 0) AS no_place,
            COALESCE(SUM(current_length_cm IS NULL OR current_length_cm = 0), 0) AS no_size,
            COALESCE(SUM(gender IS NULL OR gender NOT IN ('male', 'female')), 0) AS no_gender,
            COALESCE(SUM(parent_type = 'indukan' AND (farm_name IS NULL OR TRIM(farm_name) = '')), 0) AS no_farm_breeder,
            COALESCE(SUM(parent_type IS NULL OR parent_type <> 'indukan'), 0) AS regular_total
         FROM koi WHERE archived_at IS NULL"
    );
    $out['incomplete'] = [
        'no_photo' => (int)$inc['no_photo'],
        'no_place' => (int)$inc['no_place'],
        'no_size' => (int)$inc['no_size'],
        'no_gender' => (int)$inc['no_gender'],
        'no_farm_breeder' => (int)$inc['no_farm_breeder'],
    ];
    $out['regular_total'] = (int)$inc['regular_total'];

    // active fish without a progress photo / entry in the last 30 days
    $out['no_progress_30d'] = (int)(query_one(
        "SELECT COUNT(*) AS c FROM koi k
         WHERE k.archived_at IS NULL AND k.status = 'active'
           AND NOT EXISTS (SELECT 1 FROM koi_growth_logs g WHERE g.koi_id = k.id AND g.measured_at >= (NOW() - INTERVAL 30 DAY))"
    )['c'] ?? 0);

    // ponds: empty ones and the fullest ones
    $ponds = query('SELECT p.id, p.name, COUNT(k.id) AS c FROM ponds p LEFT JOIN koi k ON k.pond_id = p.id AND k.archived_at IS NULL GROUP BY p.id, p.name');
    $empty = array_values(array_filter($ponds, fn($p) => (int)$p['c'] === 0));
    usort($empty, fn($a, $b) => strnatcasecmp((string)$a['name'], (string)$b['name']));
    $full = array_values(array_filter($ponds, fn($p) => (int)$p['c'] > 0));
    usort($full, fn($a, $b) => (int)$b['c'] <=> (int)$a['c'] ?: strnatcasecmp((string)$a['name'], (string)$b['name']));
    $out['ponds_empty'] = ['count' => count($empty), 'names' => array_map(fn($p) => (string)$p['name'], array_slice($empty, 0, 5))];
    $out['ponds_fullest'] = array_map(fn($p) => ['label' => (string)$p['name'], 'count' => (int)$p['c']], array_slice($full, 0, 5));

    // composition by variety / ternakan
    $top = function (string $column): array {
        return array_map(
            fn($r) => ['label' => (string)$r['label'], 'count' => (int)$r['c']],
            query("SELECT `$column` AS label, COUNT(*) AS c FROM koi WHERE archived_at IS NULL AND `$column` IS NOT NULL AND `$column` <> '' GROUP BY `$column` ORDER BY c DESC, label ASC LIMIT 5")
        );
    };
    $out['top_variety'] = $top('variety');
    $out['top_farm'] = $top('farm_name');
    $out['ponds_with_fish'] = count($full);
    $out['variety_distinct'] = (int)(query_one("SELECT COUNT(DISTINCT variety) AS c FROM koi WHERE archived_at IS NULL AND variety IS NOT NULL AND variety <> ''")['c'] ?? 0);
    $out['farm_distinct'] = (int)(query_one("SELECT COUNT(DISTINCT farm_name) AS c FROM koi WHERE archived_at IS NULL AND farm_name IS NOT NULL AND farm_name <> ''")['c'] ?? 0);

    // Spectrum size chart: the fixed ladder of sizes used for koi, largest first. A fish belongs to the step its size reaches
    // (13 - 15 cm = 13 up to just below 16, and so on); fish without a size are left out (they are in "Perlu dilengkapi").
    $steps = [
        [100, 'OVER 100 cm'], [96, '96 - 99 cm'], [91, '91 - 95 cm'], [86, '86 - 90 cm'], [81, '81 - 85 cm'], [76, '76 - 80 cm'], [71, '71 - 75 cm'],
        [66, '66 - 70 cm'], [61, '61 - 65 cm'], [56, '56 - 60 cm'], [51, '51 - 55 cm'], [46, '46 - 50 cm'], [41, '41 - 45 cm'], [36, '36 - 40 cm'],
        [31, '31 - 35 cm'], [26, '26 - 30 cm'], [21, '21 - 25 cm'], [16, '16 - 20 cm'], [13, '13 - 15 cm'], [0, 'Up To 12 cm'],
    ];
    $spread = array_map(fn($step) => ['label' => $step[1], 'count' => 0], $steps);
    foreach (query('SELECT current_length_cm FROM koi WHERE archived_at IS NULL AND current_length_cm > 0') as $r) {
        $size = (float)$r['current_length_cm'];
        foreach ($steps as $index => $step) {
            if ($size >= $step[0]) { $spread[$index]['count']++; break; }
        }
    }
    $out['size_spread'] = $spread;

    // latest activity of every menu (the card shows the newest 5)
    $out['recent'] = dashboard_activity_feed(5);

    // breeding in progress
    $breeding = ['proses' => 0, 'planning' => 0, 'avg_days' => null];
    foreach (query("SELECT status, COUNT(*) AS c, AVG(DATEDIFF(CURDATE(), COALESCE(spawning_started_at, breeding_date))) AS d FROM breeding_batches WHERE status IN ('proses', 'planning') GROUP BY status") as $r) {
        $breeding[$r['status']] = (int)$r['c'];
        if ($r['status'] === 'proses' && $r['d'] !== null) $breeding['avg_days'] = (int)round((float)$r['d']);
    }
    $out['breeding'] = $breeding;

    // active indukan that never appear in a breeding session
    $used = [];
    foreach (query('SELECT male_koi_id, female_koi_id, male_parent_entries, female_parent_entries FROM breeding_batches') as $b) {
        foreach (['male_koi_id', 'female_koi_id'] as $col) if (!empty($b[$col])) $used[(int)$b[$col]] = true;
        foreach (['male_parent_entries', 'female_parent_entries'] as $col) {
            $entries = json_decode((string)($b[$col] ?? ''), true);
            if (is_array($entries)) foreach ($entries as $e) if (is_array($e) && !empty($e['koi_id'])) $used[(int)$e['koi_id']] = true;
        }
    }
    $unused = ['male' => 0, 'female' => 0, 'unknown' => 0];
    $unusedPhotos = [];   // the first 6 of them that have a photo, shown on the card
    foreach (query("SELECT koi.id, koi.code, koi.name, koi.variety, koi.bloodline, koi.gender, koi.current_length_cm, koi.image_url, ponds.name AS pond_name FROM koi LEFT JOIN ponds ON ponds.id = koi.pond_id WHERE koi.archived_at IS NULL AND koi.parent_type = 'indukan' AND koi.status = 'active' ORDER BY koi.code") as $k) {
        if (isset($used[(int)$k['id']])) continue;
        $g = $k['gender'] === 'male' || $k['gender'] === 'female' ? $k['gender'] : 'unknown';
        $unused[$g]++;
        if (count($unusedPhotos) < 6 && (string)($k['image_url'] ?? '') !== '') $unusedPhotos[] = ['title' => trim((string)$k['code'] . ' ' . (string)($k['name'] ?: $k['variety'] ?: ''))] + summary_more_koi($k);
    }
    $out['unused_breeders'] = $unused;
    $out['unused_breeders_photos'] = $unusedPhotos;

    // value of all the fish in Data Ikan and Archive (only fish that have a price)
    $value = query_one("SELECT COALESCE(SUM(purchase_price), 0) AS buy, COALESCE(SUM(sale_price), 0) AS sale, COALESCE(SUM(purchase_price > 0), 0) AS buy_n, COALESCE(SUM(sale_price > 0), 0) AS sale_n FROM koi");
    // the 6 priciest fish that have a photo (Data Ikan and Archive), shown on the card
    $out['stock_photos'] = array_map(fn($r) => ['title' => trim((string)$r['code'] . ' ' . (string)($r['name'] ?: $r['variety'] ?: ''))] + summary_more_koi($r),
        query("SELECT koi.code, koi.name, koi.variety, koi.bloodline, koi.gender, koi.current_length_cm, koi.image_url, ponds.name AS pond_name FROM koi LEFT JOIN ponds ON ponds.id = koi.pond_id WHERE (koi.purchase_price > 0 OR koi.sale_price > 0) AND koi.image_url IS NOT NULL AND koi.image_url <> '' ORDER BY GREATEST(COALESCE(koi.purchase_price, 0), COALESCE(koi.sale_price, 0)) DESC, koi.code ASC LIMIT 6"));
    $out['stock_value'] = ['buy' => (float)$value['buy'], 'sale' => (float)$value['sale'], 'buy_n' => (int)$value['buy_n'], 'sale_n' => (int)$value['sale_n']];

    // fish added per month, last twelve months (months without fish are 0)
    $rows = [];
    foreach (query("SELECT DATE_FORMAT(created_at, '%Y-%m') AS m, COUNT(*) AS c FROM koi WHERE created_at >= DATE_FORMAT(NOW() - INTERVAL 11 MONTH, '%Y-%m-01') GROUP BY m") as $r) $rows[$r['m']] = (int)$r['c'];
    $months = [];
    for ($i = 11; $i >= 0; $i--) {
        $key = date('Y-m', strtotime("first day of -$i month"));
        $months[] = ['month' => $key, 'count' => $rows[$key] ?? 0];
    }
    $out['monthly'] = $months;

    // last backup
    $stamps = maintenance_stamps();
    $last = $stamps['last_backup_at'] ?? null;
    $out['last_backup'] = [
        'at' => $last ?: null,
        'days' => $last ? (int)floor((time() - strtotime((string)$last)) / 86400) : null,
    ];
    $lastAccount = $stamps['last_account_backup_at'] ?? null;
    $out['last_account_backup'] = [
        'at' => $lastAccount ?: null,
        'days' => $lastAccount ? (int)floor((time() - strtotime((string)$lastAccount)) / 86400) : null,
    ];

    send_json(200, $out);
});

// What a "selengkapnya" row needs to show the fish photo and open the usual zoom preview.
function summary_more_koi(array $r): array {
    return [
        'image' => (string)($r['image_url'] ?? ''),
        'koi' => [
            'code' => (string)($r['code'] ?? ''), 'name' => (string)($r['name'] ?? ''), 'variety' => (string)($r['variety'] ?? ''),
            'bloodline' => (string)($r['bloodline'] ?? ''), 'gender' => (string)($r['gender'] ?? ''),
            'current_length_cm' => isset($r['current_length_cm']) ? (float)$r['current_length_cm'] : null,
            'pond_name' => (string)($r['pond_name'] ?? ''),
        ],
    ];
}

// Latest activity of every menu, newest first: fish (new / edited / archived / progress photo), breeding, ponds and their documentation,
// reports, gallery, inventory, sales and invoices. Each source gives its own newest $limit rows; the merged list is cut to $limit.
function dashboard_activity_feed(int $limit): array {
    $limit = max(1, $limit);
    $items = [];
    $add = function (string $label, string $title, string $sub, $at, string $page, string $search, string $image = '', ?array $koi = null) use (&$items) {
        if (!$at) return;
        $time = strtotime((string)$at);
        if (!$time) return;
        $row = ['label' => $label, 'title' => $title, 'sub' => $sub, 'at' => date('Y-m-d H:i:s', $time), 'page' => $page, 'search' => $search, 'image' => $image, 'feed' => true];
        if ($koi) $row['koi'] = $koi;
        $items[] = $row;
    };
    $fish = fn(array $r) => summary_more_koi($r)['koi'];
    $name = fn(array $r) => trim((string)$r['code'] . ' ' . (string)($r['name'] ?: $r['variety'] ?: ''));
    // "new" when created and last edited are the same moment, otherwise "changed"; the later of the two is the time shown
    $when = function (array $r): array {
        $created = strtotime((string)$r['created_at']);
        $updated = strtotime((string)($r['updated_at'] ?: $r['created_at']));
        return [abs($updated - $created) <= 2, date('Y-m-d H:i:s', max($created, $updated))];
    };

    // fish: new, edited or archived. Fish changed together (a mass edit) within the same minute and of the same kind become one row.
    $fishCap = $limit * 12;
    $fishRows = query("SELECT koi.code, koi.name, koi.variety, koi.bloodline, koi.gender, koi.current_length_cm, koi.image_url, koi.created_at, koi.updated_at, koi.archived_at, ponds.name AS pond_name FROM koi LEFT JOIN ponds ON ponds.id = koi.pond_id ORDER BY GREATEST(koi.created_at, COALESCE(koi.updated_at, koi.created_at)) DESC, koi.id DESC LIMIT $fishCap");
    $groups = [];
    foreach ($fishRows as $r) {
        [$isNew, $at] = $when($r);
        $updated = strtotime((string)($r['updated_at'] ?: $r['created_at']));
        $archived = $r['archived_at'] ? strtotime((string)$r['archived_at']) : 0;
        $label = $archived && abs($updated - $archived) <= 2 ? 'Ikan diarsipkan' : ($isNew ? 'Ikan baru' : 'Ikan diedit');
        $key = $label . '|' . (int)floor(strtotime($at) / 60) . '|' . ($r['archived_at'] ? 1 : 0);
        if (!isset($groups[$key])) $groups[$key] = ['label' => $label, 'at' => $at, 'rows' => []];
        $groups[$key]['rows'][] = $r;
    }
    $months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    $lastKey = array_key_last($groups);
    foreach ($groups as $key => $g) {
        $first = $g['rows'][0];
        $page = $first['archived_at'] ? 'farm-koi.html?arsip=1' : 'farm-koi.html';
        $count = count($g['rows']);
        if ($count === 1) {
            $add($g['label'], $name($first), (string)($first['pond_name'] ?? ''), $g['at'], $page, (string)$first['code'], (string)($first['image_url'] ?? ''), $fish($first));
            continue;
        }
        // the last group may continue beyond the rows that were read
        $more = count($fishRows) >= $fishCap && $key === $lastKey ? '+' : '';
        $stamp = strtotime($g['at']);
        $day = date('Y', $stamp) . ' - [' . date('m', $stamp) . '] ' . $months[(int)date('n', $stamp) - 1] . ' - ' . (int)date('j', $stamp);
        $withPhoto = null;
        foreach ($g['rows'] as $r) if ((string)($r['image_url'] ?? '') !== '') { $withPhoto = $r; break; }
        $codes = array_slice(array_column($g['rows'], 'code'), 0, 4);
        $verb = $g['label'] === 'Ikan baru' ? 'ditambahkan' : ($g['label'] === 'Ikan diarsipkan' ? 'diarsipkan' : 'diedit');
        $add($g['label'], $count . $more . ' ikan ' . $verb, implode(', ', $codes) . ($count > 4 ? ' dan lainnya' : ''), $g['at'], $page, ($g['label'] === 'Ikan diedit' ? 'terakhir diedit:' : '') . $day, (string)($withPhoto['image_url'] ?? ''), $withPhoto ? $fish($withPhoto) : null);
    }
    // progress photos: new or changed; the photos of one fish saved or re-ordered in the same minute are one row
    $progress = [];
    foreach (query("SELECT g.created_at, g.updated_at, g.length_cm, g.image_url AS progress_image, koi.code, koi.name, koi.variety, koi.bloodline, koi.gender, koi.current_length_cm, koi.image_url, koi.archived_at, ponds.name AS pond_name FROM koi_growth_logs g JOIN koi ON koi.id = g.koi_id LEFT JOIN ponds ON ponds.id = koi.pond_id ORDER BY COALESCE(g.updated_at, g.created_at) DESC, g.id DESC LIMIT " . ($limit * 6)) as $r) {
        [$isNew, $at] = $when($r);
        $key = $r['code'] . '|' . ($isNew ? 'n' : 'c') . '|' . (int)floor(strtotime($at) / 60);
        if (isset($progress[$key])) { $progress[$key]['count']++; continue; }
        $progress[$key] = ['row' => $r, 'new' => $isNew, 'at' => $at, 'count' => 1];
    }
    foreach ($progress as $p) {
        $r = $p['row'];
        $size = (float)$r['length_cm'] > 0 ? rtrim(rtrim(number_format((float)$r['length_cm'], 1, ',', ''), '0'), ',') . ' cm' : '';
        $label = $p['new'] ? 'Foto progress' : 'Foto progress diubah';
        $add($label, $name($r), $p['count'] > 1 ? $p['count'] . ' foto' : $size, $p['at'], $r['archived_at'] ? 'farm-koi.html?arsip=1' : 'farm-koi.html', (string)$r['code'], (string)($r['progress_image'] ?: $r['image_url'] ?: ''), $fish($r));
    }
    // breeding
    foreach (query("SELECT b.batch_code, b.session_name, b.status, b.created_at, b.updated_at, COALESCE(NULLIF(f.image_url, ''), m.image_url) AS image_url FROM breeding_batches b LEFT JOIN koi f ON f.id = b.female_koi_id LEFT JOIN koi m ON m.id = b.male_koi_id ORDER BY GREATEST(b.created_at, COALESCE(b.updated_at, b.created_at)) DESC, b.id DESC LIMIT $limit") as $r) {
        [$isNew, $at] = $when($r);
        $add($isNew ? 'Breeding baru' : 'Breeding diubah', trim((string)$r['batch_code'] . ' ' . (string)$r['session_name']), (string)$r['status'], $at, 'farm-breeding.html', (string)$r['batch_code'], (string)($r['image_url'] ?? ''));
    }
    // ponds and their documentation
    foreach (query("SELECT name, created_at, updated_at FROM ponds ORDER BY GREATEST(created_at, COALESCE(updated_at, created_at)) DESC, id DESC LIMIT $limit") as $r) {
        [$isNew, $at] = $when($r);
        $add($isNew ? 'Kolam baru' : 'Kolam diubah', (string)$r['name'], '', $at, 'farm-ponds.html', (string)$r['name']);
    }
    foreach (query("SELECT d.display_name, d.image_url, d.media_type, d.thumbnail_url, d.created_at, d.updated_at, ponds.name AS pond_name FROM pond_documentation d LEFT JOIN ponds ON ponds.id = d.pond_id ORDER BY COALESCE(d.updated_at, d.created_at) DESC, d.id DESC LIMIT $limit") as $r) {
        $isImage = (string)($r['media_type'] ?? 'image') !== 'video';
        [$isNew, $at] = $when($r);
        $add($isNew ? 'Dokumentasi kolam' : 'Dokumentasi kolam diubah', (string)($r['pond_name'] ?: $r['display_name']), (string)($r['display_name'] ?? ''), $at, 'farm-ponds.html', (string)($r['pond_name'] ?? ''), $isImage ? (string)($r['image_url'] ?? '') : (string)($r['thumbnail_url'] ?? ''));
    }
    foreach (query("SELECT h.created_at, ponds.name AS pond_name FROM pond_note_history h LEFT JOIN ponds ON ponds.id = h.pond_id ORDER BY h.created_at DESC, h.id DESC LIMIT $limit") as $r) {
        $add('Catatan kolam diubah', (string)($r['pond_name'] ?? 'Kolam'), '', $r['created_at'], 'farm-ponds.html', (string)($r['pond_name'] ?? ''));
    }
    // reports and gallery
    $reportTypes = ['ikan_datang' => 'Laporan ikan datang', 'data_ulang' => 'Laporan data ulang', 'panen' => 'Laporan panen', 'kegiatan' => 'Laporan kegiatan'];
    foreach (query("SELECT report_type, report_title, batch_code, created_at, updated_at FROM farm_reports ORDER BY COALESCE(updated_at, created_at) DESC, id DESC LIMIT $limit") as $r) {
        $type = (string)$r['report_type'];
        $title = (string)($r['report_title'] ?: $r['batch_code'] ?: str_replace('_', ' ', $type));
        [$isNew, $at] = $when($r);
        $add(($reportTypes[$type] ?? 'Laporan ' . str_replace('_', ' ', $type)) . ($isNew ? '' : ' diubah'), $title, '', $at, 'farm-reports.html', (string)($r['report_title'] ?: $r['batch_code'] ?: ''));
    }
    foreach (query("SELECT gc.title AS collection, gi.image_url, gi.media_type, gi.thumbnail_url, gi.created_at FROM gallery_images gi JOIN gallery_collections gc ON gc.id = gi.gallery_id ORDER BY gi.created_at DESC, gi.id DESC LIMIT $limit") as $r) {
        $isImage = (string)($r['media_type'] ?? 'image') !== 'video';
        $add('Foto galeri', (string)$r['collection'], '', $r['created_at'], 'farm-gallery.html', (string)$r['collection'], $isImage ? (string)($r['image_url'] ?? '') : (string)($r['thumbnail_url'] ?? ''));
    }
    foreach (query("SELECT title, created_at, updated_at, archived_at, (SELECT gi.image_url FROM gallery_images gi WHERE gi.gallery_id = gallery_collections.id AND gi.media_type <> 'video' ORDER BY gi.sort_order, gi.id LIMIT 1) AS image_url FROM gallery_collections ORDER BY GREATEST(created_at, COALESCE(updated_at, created_at)) DESC, id DESC LIMIT $limit") as $r) {
        [$isNew, $at] = $when($r);
        $add($isNew ? 'Galeri baru' : 'Galeri diubah', (string)$r['title'], $r['archived_at'] ? 'Archive' : '', $at, 'farm-gallery.html', (string)$r['title'], (string)($r['image_url'] ?? ''));
    }
    // inventory, sales, invoices
    foreach (query("SELECT name, created_at, updated_at, image_url FROM inventory_items ORDER BY GREATEST(created_at, COALESCE(updated_at, created_at)) DESC, id DESC LIMIT $limit") as $r) {
        [$isNew, $at] = $when($r);
        $add($isNew ? 'Inventori baru' : 'Inventori diubah', (string)$r['name'], '', $at, 'farm-inventory.html', (string)$r['name'], (string)($r['image_url'] ?? ''));
    }
    foreach (query("SELECT m.type, m.qty, m.created_at, i.name, i.unit, i.image_url FROM inventory_movements m LEFT JOIN inventory_items i ON i.id = m.item_id ORDER BY m.created_at DESC, m.id DESC LIMIT $limit") as $r) {
        $qty = rtrim(rtrim(number_format((float)$r['qty'], 2, ',', ''), '0'), ',');
        $add('Stok ' . (string)$r['type'], (string)($r['name'] ?? 'Barang'), trim($qty . ' ' . (string)($r['unit'] ?? '')), $r['created_at'], 'farm-inventory.html', (string)($r['name'] ?? ''), (string)($r['image_url'] ?? ''));
    }
    foreach (query("SELECT title, status, buyer, created_at, updated_at FROM sell_items ORDER BY GREATEST(created_at, COALESCE(updated_at, created_at)) DESC, id DESC LIMIT $limit") as $r) {
        [$isNew, $at] = $when($r);
        $add($isNew ? 'Penjualan baru' : 'Penjualan diubah', (string)$r['title'], trim((string)$r['status'] . ((string)$r['buyer'] !== '' ? ' · ' . $r['buyer'] : '')), $at, 'farm-sell.html', (string)$r['title']);
    }
    foreach (query("SELECT invoice_no, title, client_name, status, created_at, updated_at FROM invoices ORDER BY GREATEST(created_at, COALESCE(updated_at, created_at)) DESC, id DESC LIMIT $limit") as $r) {
        [$isNew, $at] = $when($r);
        $add($isNew ? 'Invoice baru' : 'Invoice diubah', trim((string)$r['invoice_no'] . ' ' . ((string)$r['title'] ?: (string)$r['client_name'])), (string)$r['status'], $at, 'farm-invoice.html', (string)$r['invoice_no']);
    }

    usort($items, fn($a, $b) => strcmp($b['at'], $a['at']));
    return array_slice($items, 0, $limit);
}

// The longer lists behind the "Lihat selengkapnya" buttons of the extra cards.
route('GET', '/summary-more', function () {
    require_account();
    $kind = (string)($_GET['kind'] ?? '');
    $limit = 200;
    dashboard_cache_serve('more:' . $kind);

    if ($kind === 'recent') {
        send_json(200, ['title' => 'Aktivitas terbaru (50 terakhir)', 'rows' => dashboard_activity_feed(50)]);
    }

    if ($kind === 'no_progress') {
        $total = (int)(query_one("SELECT COUNT(*) AS c FROM koi k WHERE k.archived_at IS NULL AND k.status = 'active' AND NOT EXISTS (SELECT 1 FROM koi_growth_logs g WHERE g.koi_id = k.id AND g.measured_at >= (NOW() - INTERVAL 30 DAY))")['c'] ?? 0);
        // the ones waiting longest first: no progress entry at all, then the oldest last entry
        $rows = query(
            "SELECT k.code, k.name, k.variety, k.bloodline, k.gender, k.current_length_cm, k.image_url, ponds.name AS pond_name, (SELECT MAX(g2.measured_at) FROM koi_growth_logs g2 WHERE g2.koi_id = k.id) AS last_at
             FROM koi k LEFT JOIN ponds ON ponds.id = k.pond_id
             WHERE k.archived_at IS NULL AND k.status = 'active'
               AND NOT EXISTS (SELECT 1 FROM koi_growth_logs g WHERE g.koi_id = k.id AND g.measured_at >= (NOW() - INTERVAL 30 DAY))
             ORDER BY last_at IS NOT NULL, last_at ASC, k.code ASC LIMIT $limit"
        );
        send_json(200, [
            'title' => 'Tanpa foto progress 30 hari (' . $total . ')',
            'note' => $total > $limit ? "Menampilkan $limit ikan yang paling lama belum ada progress." : '',
            'rows' => array_map(fn($r) => [
                'title' => (string)$r['code'] . ' ' . (string)($r['name'] ?: $r['variety'] ?: ''),
                'sub' => ($r['pond_name'] ? $r['pond_name'] . ' · ' : '') . ($r['last_at'] ? 'progress terakhir ' : 'belum pernah ada progress'),
                'at_date' => $r['last_at'] ? substr((string)$r['last_at'], 0, 10) : '',
                'search' => (string)$r['code'],
                'page' => 'farm-koi.html',
            ] + summary_more_koi($r), $rows),
        ]);
    }

    if ($kind === 'unused_breeders') {
        $used = [];
        foreach (query('SELECT male_koi_id, female_koi_id, male_parent_entries, female_parent_entries FROM breeding_batches') as $b) {
            foreach (['male_koi_id', 'female_koi_id'] as $col) if (!empty($b[$col])) $used[(int)$b[$col]] = true;
            foreach (['male_parent_entries', 'female_parent_entries'] as $col) {
                $entries = json_decode((string)($b[$col] ?? ''), true);
                if (is_array($entries)) foreach ($entries as $e) if (is_array($e) && !empty($e['koi_id'])) $used[(int)$e['koi_id']] = true;
            }
        }
        $rows = [];
        foreach (query("SELECT koi.id, koi.code, koi.name, koi.variety, koi.bloodline, koi.gender, koi.current_length_cm, koi.image_url, ponds.name AS pond_name FROM koi LEFT JOIN ponds ON ponds.id = koi.pond_id WHERE koi.archived_at IS NULL AND koi.parent_type = 'indukan' AND koi.status = 'active' ORDER BY koi.code") as $k) {
            if (isset($used[(int)$k['id']])) continue;
            $gender = $k['gender'] === 'male' ? 'Male' : ($k['gender'] === 'female' ? 'Female' : 'Unknown');
            $rows[] = [
                'title' => (string)$k['code'] . ' ' . (string)($k['name'] ?: $k['variety'] ?: ''),
                'sub' => $gender . ($k['pond_name'] ? ' · ' . $k['pond_name'] : ''),
                'search' => (string)$k['code'],
                'page' => 'farm-koi.html',
            ] + summary_more_koi($k);
        }
        send_json(200, ['title' => 'Indukan aktif belum dipakai breeding (' . count($rows) . ')', 'rows' => array_slice($rows, 0, $limit)]);
    }

    // the lists behind the status cards at the top (the same fish the card counts)
    $statusCards = [
        'quarantine' => ['Karantina', "koi.status = 'quarantine' AND koi.archived_at IS NULL"],
        'sold' => ['Ikan terjual', "koi.status = 'sold'"],
        'breeders_dead' => ['Indukan mati', "koi.parent_type = 'indukan' AND koi.status = 'dead' AND koi.archived_at IS NULL"],
        'regular_dead' => ['Ikan reguler mati', "(koi.parent_type IS NULL OR koi.parent_type <> 'indukan') AND koi.status = 'dead' AND koi.archived_at IS NULL"],
    ];
    if (isset($statusCards[$kind])) {
        [$label, $where] = $statusCards[$kind];
        $total = (int)(query_one("SELECT COUNT(*) AS c FROM koi WHERE $where")['c'] ?? 0);
        $rows = query("SELECT koi.code, koi.name, koi.variety, koi.bloodline, koi.gender, koi.current_length_cm, koi.image_url, koi.parent_type, koi.archived_at, koi.updated_at, ponds.name AS pond_name FROM koi LEFT JOIN ponds ON ponds.id = koi.pond_id WHERE $where ORDER BY koi.updated_at DESC, koi.id DESC LIMIT $limit");
        $genders = ['male' => 'Male', 'female' => 'Female'];
        send_json(200, [
            'title' => $label . ' (' . $total . ')',
            'note' => $total > $limit ? "Menampilkan $limit ikan yang paling baru diubah." : '',
            'rows' => array_map(fn($r) => [
                'title' => (string)$r['code'] . ' ' . (string)($r['name'] ?: $r['variety'] ?: ''),
                'sub' => implode(' · ', array_filter([$genders[$r['gender']] ?? 'Unknown', $r['parent_type'] === 'indukan' ? 'Indukan' : '', $r['archived_at'] ? 'Archive' : '', (string)($r['pond_name'] ?? '')])),
                'at' => $r['updated_at'] ? date('Y-m-d H:i:s', strtotime((string)$r['updated_at'])) : '',
                'search' => (string)$r['code'],
                'page' => $r['archived_at'] ? 'farm-koi.html?arsip=1' : 'farm-koi.html',
            ] + summary_more_koi($r), $rows),
        ]);
    }

    if ($kind === 'stock_value') {
        // every fish with a price, in Data Ikan and in Archive, the most expensive first
        $total = (int)(query_one('SELECT COUNT(*) AS c FROM koi WHERE purchase_price > 0 OR sale_price > 0')['c'] ?? 0);
        $rows = query("SELECT koi.code, koi.name, koi.variety, koi.bloodline, koi.gender, koi.current_length_cm, koi.image_url, koi.purchase_price, koi.sale_price, koi.archived_at, ponds.name AS pond_name FROM koi LEFT JOIN ponds ON ponds.id = koi.pond_id WHERE koi.purchase_price > 0 OR koi.sale_price > 0 ORDER BY GREATEST(COALESCE(koi.purchase_price, 0), COALESCE(koi.sale_price, 0)) DESC, koi.code ASC LIMIT $limit");
        send_json(200, [
            'title' => 'Daftar harga ikan (' . $total . ')',
            'note' => $total > $limit ? "Menampilkan $limit ikan dengan harga tertinggi." : '',
            'rows' => array_map(fn($r) => [
                'title' => (string)$r['code'] . ' ' . (string)($r['name'] ?: $r['variety'] ?: ''),
                'sub' => implode(' · ', array_filter([$r['archived_at'] ? 'Archive' : '', (string)($r['pond_name'] ?? '')])),
                'buy' => (float)$r['purchase_price'],
                'sale' => (float)$r['sale_price'],
                'search' => (string)$r['code'],
                'page' => $r['archived_at'] ? 'farm-koi.html?arsip=1' : 'farm-koi.html',
            ] + summary_more_koi($r), $rows),
        ]);
    }

    if ($kind === 'ponds_empty' || $kind === 'ponds_all') {
        $ponds = query('SELECT p.name, COUNT(k.id) AS c FROM ponds p LEFT JOIN koi k ON k.pond_id = p.id AND k.archived_at IS NULL GROUP BY p.id, p.name');
        if ($kind === 'ponds_empty') {
            $ponds = array_values(array_filter($ponds, fn($p) => (int)$p['c'] === 0));
            usort($ponds, fn($a, $b) => strnatcasecmp((string)$a['name'], (string)$b['name']));
            send_json(200, ['title' => 'Kolam kosong (' . count($ponds) . ')', 'rows' => array_map(fn($p) => ['title' => (string)$p['name'], 'sub' => '', 'search' => (string)$p['name'], 'page' => 'farm-ponds.html'], array_slice($ponds, 0, $limit))]);
        }
        $ponds = array_values(array_filter($ponds, fn($p) => (int)$p['c'] > 0));
        usort($ponds, fn($a, $b) => (int)$b['c'] <=> (int)$a['c'] ?: strnatcasecmp((string)$a['name'], (string)$b['name']));
        send_json(200, ['title' => 'Kolam berisi ikan (' . count($ponds) . ')', 'rows' => array_map(fn($p) => ['title' => (string)$p['name'], 'sub' => '', 'count' => (int)$p['c'], 'search' => 'kolam:' . $p['name'], 'page' => 'farm-koi.html'], array_slice($ponds, 0, $limit))]);
    }

    if ($kind === 'variety' || $kind === 'farm') {
        $column = $kind === 'variety' ? 'variety' : 'farm_name';
        $field = $kind === 'variety' ? 'variety' : 'ternakan';
        $rows = query("SELECT `$column` AS label, COUNT(*) AS c FROM koi WHERE archived_at IS NULL AND `$column` IS NOT NULL AND `$column` <> '' GROUP BY `$column` ORDER BY c DESC, label ASC LIMIT $limit");
        send_json(200, ['title' => $kind === 'variety' ? 'Chart Variety' : 'Total Yield', 'rows' => array_map(fn($r) => ['title' => (string)$r['label'], 'sub' => '', 'count' => (int)$r['c'], 'search' => $field . ':' . $r['label'], 'page' => 'farm-koi.html'], $rows)]);
    }

    send_error(400, 'Jenis daftar tidak dikenal');
});
