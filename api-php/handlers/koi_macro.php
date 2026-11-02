<?php
// api-php/handlers/koi_macro.php — Edit Masal Data Ikan from an Excel/ZIP file (the page reads the file and sends the changes here).
//
// POST /koi/macro-apply        {source, rows:[{id, code, patch:{field: value}}]}  -> changes only the fields in "patch", one transaction,
//                                records the old values as a batch so it can be undone
// GET  /koi/macro-batches      the batches of the last 30 days
// POST /koi/macro-batches/{id}/undo   gives the old values back, but only for a field that still holds what the batch wrote
//
// Nothing here creates or deletes a fish: an id that does not exist is skipped.

const KOI_MACRO_FIELDS = ['pond_id', 'area', 'name', 'variety', 'bloodline', 'farm_name', 'breeder', 'gender', 'parent_type', 'status',
                          'birth_date', 'purchase_date', 'purchase_price', 'sale_price', 'current_length_cm', 'notes'];
const KOI_MACRO_NUMERIC = ['pond_id', 'purchase_price', 'sale_price', 'current_length_cm'];
const KOI_MACRO_DATES = ['birth_date', 'purchase_date'];

const KOI_MACRO_CHOICES = [
    'gender' => ['male', 'female', 'unknown'],
    'parent_type' => ['indukan', 'non_indukan'],
    'status' => ['active', 'non_active', 'quarantine', 'sold', 'dead'],
];

function koi_macro_clean($field, $value) {
    if (isset(KOI_MACRO_CHOICES[$field]) && !in_array((string)$value, KOI_MACRO_CHOICES[$field], true)) {
        send_error(422, "Isian $field tidak valid: " . (string)$value);
    }
    if (in_array($field, KOI_MACRO_DATES, true)) return koi_clean_partial_date($value, $field === 'birth_date' ? 'Tanggal lahir' : 'Tanggal beli');
    if (in_array($field, KOI_MACRO_NUMERIC, true)) return blank_to_null($value);
    return $value === null ? null : (string)$value;
}

// the comparable text of a stored value (so 12.50 and "12.5" are the same)
function koi_macro_same($a, $b): bool {
    if ($a === null) $a = '';
    if ($b === null) $b = '';
    if (is_numeric($a) && is_numeric($b)) return (float)$a === (float)$b;
    return (string)$a === (string)$b;
}

route('POST', '/koi/macro-apply', function () {
    $session = require_account();
    $body = read_json_body();
    $rows = is_array($body['rows'] ?? null) ? $body['rows'] : [];
    if (!$rows) send_error(400, 'Tidak ada perubahan untuk disimpan.');
    if (count($rows) > 2000) send_error(400, 'Maksimal 2000 ikan per edit masal.');
    $actor = mb_substr(trim((string)($session['name'] ?? '')) ?: (string)($session['username'] ?? ''), 0, 100);
    $columns = implode(', ', array_map(fn($f) => "koi.$f", KOI_MACRO_FIELDS));

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $ids = [];
        $changes = [];
        $unchanged = 0;
        $missing = [];
        foreach ($rows as $row) {
            if (!is_array($row)) continue;
            $id = (int)($row['id'] ?? 0);
            $patch = is_array($row['patch'] ?? null) ? $row['patch'] : [];
            $current = $id > 0 ? query_one("SELECT koi.id, koi.code, $columns FROM koi WHERE koi.id = ? FOR UPDATE", [$id]) : null;
            if (!$current) { $missing[] = (string)($row['code'] ?? $id); continue; }

            $sets = [];
            $params = [];
            $before = [];
            foreach ($patch as $field => $value) {
                if (!in_array($field, KOI_MACRO_FIELDS, true)) continue;
                $clean = koi_macro_clean($field, $value);
                if ($field === 'area') {
                    // a fish with a pond has no area of its own
                    $pondAfter = array_key_exists('pond_id', $patch) ? koi_macro_clean('pond_id', $patch['pond_id']) : $current['pond_id'];
                    if ($pondAfter !== null && $pondAfter !== '') $clean = null;
                    else $clean = blank_to_null($clean);
                }
                if (koi_macro_same($current[$field], $clean)) continue;
                $sets[] = "$field = ?";
                $params[] = $clean;
                $before[$field] = $current[$field];
            }
            // a new pond makes the fish's own area empty
            if (array_key_exists('pond_id', $before) && !array_key_exists('area', $before) && koi_macro_clean('pond_id', $patch['pond_id']) !== null && $current['area'] !== null && $current['area'] !== '') {
                $sets[] = 'area = ?';
                $params[] = null;
                $before['area'] = $current['area'];
            }
            if (!$sets) { $unchanged++; continue; }
            $params[] = $id;
            execute('UPDATE koi SET ' . implode(', ', $sets) . ' WHERE id = ?', $params);
            $ids[] = $id;
            $changes[$id] = ['id' => $id, 'code' => $current['code'], 'before' => $before];
        }
        // fish of a breeding session keep the Bloodline / Ternakan of their session
        if ($ids) koi_sync_session_links($pdo, $ids);
        foreach ($changes as $id => &$change) {
            $now = query_one('SELECT ' . implode(', ', array_map(fn($f) => "koi.$f", array_keys($change['before']))) . ' FROM koi WHERE id = ?', [$id]);
            $change['after'] = $now ?: [];
            // fields the session rule put back to the old value are no change at all
            foreach (array_keys($change['before']) as $field) {
                if (koi_macro_same($change['before'][$field], $change['after'][$field] ?? null)) { unset($change['before'][$field], $change['after'][$field]); }
            }
        }
        unset($change);
        $changes = array_values(array_filter($changes, fn($c) => !empty($c['before'])));
        $batchId = null;
        if ($changes) {
            execute(
                'INSERT INTO koi_macro_batches (actor, source, row_count, changes) VALUES (?, ?, ?, ?)',
                [$actor, mb_substr((string)($body['source'] ?? 'Excel'), 0, 120), count($changes), json_encode($changes, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]
            );
            $batchId = (int)$pdo->lastInsertId();
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    koi_facets_cache_clear();
    send_json(200, ['ok' => true, 'batch_id' => $batchId, 'updated' => count($changes), 'unchanged' => $unchanged + (count($ids) - count($changes)), 'missing' => $missing]);
});

route('GET', '/koi/macro-batches', function () {
    require_account();
    execute('DELETE FROM koi_macro_batches WHERE created_at < (NOW() - INTERVAL 30 DAY)');
    $rows = query("SELECT id, created_at, actor, source, row_count, undone_at FROM koi_macro_batches WHERE entity = 'koi' ORDER BY id DESC LIMIT 30");
    send_json(200, ['items' => $rows]);
});

route_pattern('POST', '#^/koi/macro-batches/(\d+)/undo$#', function (array $m) {
    $session = require_account();
    $batch = query_one("SELECT * FROM koi_macro_batches WHERE id = ? AND entity = 'koi'", [$m[1]]);
    if (!$batch) send_error(404, 'Edit masal tidak ditemukan.');
    if ($batch['undone_at']) send_error(409, 'Edit masal ini sudah dibatalkan.');
    $changes = json_decode((string)$batch['changes'], true);
    if (!is_array($changes)) send_error(500, 'Catatan edit masal rusak.');
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $restored = 0;
        $skipped = 0;
        $ids = [];
        foreach ($changes as $change) {
            $id = (int)$change['id'];
            $fields = array_keys($change['before'] ?? []);
            if (!$fields) continue;
            $now = query_one('SELECT ' . implode(', ', array_map(fn($f) => "koi.$f", $fields)) . ' FROM koi WHERE id = ? FOR UPDATE', [$id]);
            if (!$now) { $skipped++; continue; }
            $sets = [];
            $params = [];
            foreach ($fields as $field) {
                // a field changed again after the batch is left alone
                if (!koi_macro_same($now[$field], $change['after'][$field] ?? null)) { $skipped++; continue; }
                $sets[] = "$field = ?";
                $params[] = $change['before'][$field];
                $restored++;
            }
            if ($sets) {
                $params[] = $id;
                execute('UPDATE koi SET ' . implode(', ', $sets) . ' WHERE id = ?', $params);
                $ids[] = $id;
            }
        }
        if ($ids) koi_sync_session_links($pdo, $ids);
        execute('UPDATE koi_macro_batches SET undone_at = NOW() WHERE id = ?', [$m[1]]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    koi_facets_cache_clear();
    send_json(200, ['ok' => true, 'restored' => $restored, 'skipped' => $skipped]);
});
