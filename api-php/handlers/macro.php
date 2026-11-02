<?php
// api-php/handlers/macro.php — Edit Masal from an Excel/ZIP file for Breeding, Laporan and Data Kolam (and the kanban cards of a pond).
// (Data Ikan has its own, handlers/koi_macro.php.) The page reads the file and sends the changes; the rules are the same everywhere:
//   - only the fields in "patch" change, the rest of the record stays as it is
//   - an id (Kode Batch, Nama Kolam, ID Kanban) that does not exist is skipped: nothing is created, nothing is deleted
//   - one transaction, and the old values are kept 30 days so the whole edit can be undone
//
//   POST /macro/{entity}/apply          {source, rows:[{key, patch:{field: value}}]}
//   GET  /macro/{entity}/batches        the batches of the last 30 days
//   POST /macro/batches/{id}/undo       gives the old values back (a field that was changed again later is left alone)

const MACRO_ENTITIES = [
    'breeding' => [
        'table' => 'breeding_batches', 'key' => 'batch_code', 'label' => 'Breeding',
        'fields' => [
            'session_name' => 'text', 'breeding_date' => 'date!', 'spawning_started_at' => 'date', 'fish_separated_at' => 'date', 'larva_released_at' => 'date',
            'spawning_method' => ['alami', 'stripping'], 'status' => ['planning', 'proses', 'completed', 'failed'],
            'fry_count' => 'int', 'egg_weight_g' => 'decimal', 'notes' => 'text', 'officer_name' => 'text', 'pond_entries' => 'places',
        ],
    ],
    'reports' => [
        'table' => 'farm_reports', 'key' => 'batch_code', 'label' => 'Laporan',
        'fields' => [
            'report_date' => 'date!', 'report_title' => 'text', 'dominant_variety' => 'text', 'origin_location' => 'text', 'destination_location' => 'text',
            'average_length_cm' => 'decimal', 'notes' => 'text',
        ],
    ],
    'ponds' => [
        'table' => 'ponds', 'key' => 'name', 'label' => 'Data Kolam',
        'fields' => ['location' => 'text', 'status' => ['kosong', 'active', 'perbaikan']],
    ],
    'kanban' => [
        'table' => 'pond_kanban', 'key' => 'id', 'label' => 'Kanban Kolam',
        'fields' => ['title' => 'text', 'body' => 'text', 'note_date' => 'date', 'color' => 'color', 'qty' => 'qty'],
    ],
];

function macro_entity(string $name): array {
    if (!isset(MACRO_ENTITIES[$name])) send_error(404, 'Edit masal tidak dikenal.');
    return MACRO_ENTITIES[$name];
}

// the stored form of one value; '' means "empty the field" for the kinds that can be empty
function macro_clean(string $field, $kind, $value) {
    if (is_array($kind)) {
        if (!in_array((string)$value, $kind, true)) send_error(422, "Isian $field tidak valid: " . (string)$value);
        return (string)$value;
    }
    $text = is_string($value) ? trim($value) : $value;
    switch ($kind) {
        case 'text':
            return $text === null ? null : (string)$text;
        case 'date!':
            $date = koi_clean_partial_date($text, $field);
            if ($date === null) send_error(422, "Isian $field tidak boleh kosong.");
            return $date;
        case 'date':
            return koi_clean_partial_date($text, $field);
        case 'int':
        case 'qty':
            if ($text === null || $text === '') { if ($kind === 'qty') send_error(422, 'Qty tidak boleh kosong.'); return null; }
            if (!preg_match('/^\d{1,9}$/', (string)$text)) send_error(422, "Isian $field harus angka bulat: " . (string)$text);
            return (int)$text;
        case 'decimal':
            if ($text === null || $text === '') return null;
            if (!is_numeric($text)) send_error(422, "Isian $field harus angka: " . (string)$text);
            return (string)$text;
        case 'color':
            $c = strtolower((string)$text);
            if ($c !== '' && !preg_match('/^#[0-9a-f]{6}$/', $c)) send_error(422, "Warna tidak valid: " . (string)$text);
            return $c;
    }
    return $text;
}

function macro_same($a, $b): bool {
    if ($a === null) $a = '';
    if ($b === null) $b = '';
    if (is_numeric($a) && is_numeric($b) && (string)$a !== '' && (string)$b !== '') return (float)$a === (float)$b;
    return (string)$a === (string)$b;
}

// "Lokasi Breeding": a list of names; each one is a pond of Data Kolam or an area of Data Kolam
function macro_places(array $names): array {
    $entries = [];
    foreach ($names as $name) {
        $name = trim((string)$name);
        if ($name === '') continue;
        $pond = query_one('SELECT id, name FROM ponds WHERE name = ? LIMIT 1', [$name]);
        if ($pond) { $entries[] = ['pond_id' => (string)$pond['id'], 'label' => $pond['name'], 'notes' => '']; continue; }
        $area = query_one("SELECT location FROM ponds WHERE location = ? AND location <> '' LIMIT 1", [$name]);
        if ($area) { $entries[] = ['pond_id' => '', 'label' => $area['location'], 'area' => $area['location'], 'notes' => '']; continue; }
        send_error(422, "Lokasi Breeding tidak ditemukan di Data Kolam: $name");
    }
    return $entries;
}

route_pattern('POST', '#^/macro/(breeding|reports|ponds|kanban)/apply$#', function (array $m) {
    $session = require_account();
    $config = macro_entity($m[1]);
    $body = read_json_body();
    $rows = is_array($body['rows'] ?? null) ? $body['rows'] : [];
    if (!$rows) send_error(400, 'Tidak ada perubahan untuk disimpan.');
    if (count($rows) > 3000) send_error(400, 'Maksimal 3000 baris per edit masal.');
    $actor = mb_substr(trim((string)($session['name'] ?? '')) ?: (string)($session['username'] ?? ''), 0, 100);
    $table = $config['table'];
    $keyColumn = $config['key'];
    $fields = $config['fields'];

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $changes = [];
        $unchanged = 0;
        $missing = [];
        $pondsToSync = [];
        foreach ($rows as $row) {
            if (!is_array($row)) continue;
            $key = trim((string)($row['key'] ?? ''));
            $patch = is_array($row['patch'] ?? null) ? $row['patch'] : [];
            $current = $key === '' ? null : query_one("SELECT * FROM `$table` WHERE `$keyColumn` = ? LIMIT 1 FOR UPDATE", [$key]);
            if (!$current) { $missing[] = $key; continue; }

            $sets = [];
            $params = [];
            $before = [];
            $after = [];
            foreach ($patch as $field => $value) {
                if (!isset($fields[$field])) continue;
                $kind = $fields[$field];
                if ($kind === 'places') {
                    $entries = macro_places(is_array($value) ? $value : []);
                    $newJson = json_encode($entries, JSON_UNESCAPED_UNICODE);
                    $newPond = null;
                    foreach ($entries as $entry) { if ($entry['pond_id'] !== '') { $newPond = (int)$entry['pond_id']; break; } }
                    if (macro_same($current['pond_entries'], $newJson)) continue;
                    $sets[] = 'pond_entries = ?'; $params[] = $newJson;
                    $sets[] = 'pond_id = ?'; $params[] = $newPond;
                    $before['pond_entries'] = $current['pond_entries']; $after['pond_entries'] = $newJson;
                    $before['pond_id'] = $current['pond_id']; $after['pond_id'] = $newPond;
                    continue;
                }
                $clean = macro_clean($field, $kind, $value);
                if (macro_same($current[$field], $clean)) continue;
                $sets[] = "`$field` = ?";
                $params[] = $kind === 'qty' ? (int)$clean : $clean;
                $before[$field] = $current[$field];
                $after[$field] = $clean;
            }
            if (!$sets) { $unchanged++; continue; }
            if ($m[1] === 'breeding') { $sets[] = 'last_update_date = ?'; $params[] = date('Y-m-d'); }
            $params[] = $current['id'];
            execute("UPDATE `$table` SET " . implode(', ', $sets) . ' WHERE id = ?', $params);
            if ($m[1] === 'kanban') {
                $pondsToSync[(int)$current['pond_id']] = true;
                if (array_key_exists('qty', $before)) {
                    execute(
                        'INSERT INTO pond_kanban_qty_log (kanban_id, delta, qty_after, log_date, notes, actor) VALUES (?, ?, ?, CURDATE(), ?, ?)',
                        [$current['id'], (int)$after['qty'] - (int)$before['qty'], (int)$after['qty'], 'Edit masal', $actor]
                    );
                }
            }
            $label = $m[1] === 'kanban' ? trim((string)$current['title']) . ' #' . $current['id'] : (string)$current[$keyColumn];
            $changes[] = ['id' => (int)$current['id'], 'code' => $label, 'before' => $before, 'after' => $after];
        }
        foreach (array_keys($pondsToSync) as $pondId) pond_kanban_sync_notes($pondId);
        $batchId = null;
        if ($changes) {
            execute(
                'INSERT INTO koi_macro_batches (entity, actor, source, row_count, changes) VALUES (?, ?, ?, ?, ?)',
                [$m[1], $actor, mb_substr((string)($body['source'] ?? 'Excel'), 0, 120), count($changes), json_encode($changes, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]
            );
            $batchId = (int)$pdo->lastInsertId();
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    send_json(200, ['ok' => true, 'batch_id' => $batchId, 'updated' => count($changes), 'unchanged' => $unchanged, 'missing' => $missing]);
});

route_pattern('GET', '#^/macro/(breeding|reports|ponds|kanban)/batches$#', function (array $m) {
    require_account();
    execute('DELETE FROM koi_macro_batches WHERE created_at < (NOW() - INTERVAL 30 DAY)');
    send_json(200, ['items' => query('SELECT id, created_at, actor, source, row_count, undone_at FROM koi_macro_batches WHERE entity = ? ORDER BY id DESC LIMIT 30', [$m[1]])]);
});

route_pattern('POST', '#^/macro/batches/(\d+)/undo$#', function (array $m) {
    $session = require_account();
    $batch = query_one('SELECT * FROM koi_macro_batches WHERE id = ?', [$m[1]]);
    if (!$batch || $batch['entity'] === 'koi') send_error(404, 'Edit masal tidak ditemukan.');
    if ($batch['undone_at']) send_error(409, 'Edit masal ini sudah dibatalkan.');
    $config = macro_entity($batch['entity']);
    $changes = json_decode((string)$batch['changes'], true);
    if (!is_array($changes)) send_error(500, 'Catatan edit masal rusak.');
    $actor = mb_substr(trim((string)($session['name'] ?? '')) ?: (string)($session['username'] ?? ''), 0, 100);
    $table = $config['table'];
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $restored = 0;
        $skipped = 0;
        $pondsToSync = [];
        foreach ($changes as $change) {
            $id = (int)$change['id'];
            $fields = array_keys($change['before'] ?? []);
            if (!$fields) continue;
            $now = query_one("SELECT * FROM `$table` WHERE id = ? FOR UPDATE", [$id]);
            if (!$now) { $skipped++; continue; }
            $sets = [];
            $params = [];
            foreach ($fields as $field) {
                if (!macro_same($now[$field] ?? null, $change['after'][$field] ?? null)) { $skipped++; continue; }
                $sets[] = "`$field` = ?";
                $params[] = $change['before'][$field];
                $restored++;
                if ($batch['entity'] === 'kanban' && $field === 'qty') {
                    execute(
                        'INSERT INTO pond_kanban_qty_log (kanban_id, delta, qty_after, log_date, notes, actor) VALUES (?, ?, ?, CURDATE(), ?, ?)',
                        [$id, (int)$change['before']['qty'] - (int)$now['qty'], (int)$change['before']['qty'], 'Edit masal dibatalkan', $actor]
                    );
                }
            }
            if ($sets) {
                $params[] = $id;
                execute("UPDATE `$table` SET " . implode(', ', $sets) . ' WHERE id = ?', $params);
                if ($batch['entity'] === 'kanban') $pondsToSync[(int)$now['pond_id']] = true;
            }
        }
        foreach (array_keys($pondsToSync) as $pondId) pond_kanban_sync_notes($pondId);
        execute('UPDATE koi_macro_batches SET undone_at = NOW() WHERE id = ?', [$m[1]]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    send_json(200, ['ok' => true, 'restored' => $restored, 'skipped' => $skipped]);
});
