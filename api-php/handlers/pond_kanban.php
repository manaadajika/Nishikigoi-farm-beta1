<?php
// api-php/handlers/pond_kanban.php — Kanban catatan of a pond (Data Kolam > Formulir Kolam).
//
// A pond has any number of kanban cards side by side. Every card has a title, a note, a recording date, its own quantity ("Qty Kanban",
// separate from the pond's "Qty Manual") and a history of the additions/subtractions of that quantity. A deleted card is kept (deleted_at)
// and listed in "History Catatan", where it can be restored or removed for good.
// ponds.notes / ponds.notes_date stay in step with the active cards, so the pond list, the print and the Excel export keep working.

function pond_kanban_actor(array $session): string {
    return mb_substr(trim((string)($session['name'] ?? '')) ?: (string)($session['username'] ?? ''), 0, 100);
}

require_once __DIR__ . '/../lib/uploads.php';

// The colours a card can get (random from this list at first); a card with '' as colour follows the theme.
const POND_KANBAN_COLORS = ['#4263eb', '#1098ad', '#37b24d', '#f59f00', '#f76707', '#e03131', '#d6336c', '#ae3ec9', '#7048e8', '#868e96'];

function pond_kanban_random_color(): string {
    return POND_KANBAN_COLORS[random_int(0, count(POND_KANBAN_COLORS) - 1)];
}

// '' (theme) or #rrggbb
function pond_kanban_clean_color($value): string {
    $text = strtolower(trim((string)$value));
    if ($text === '') return '';
    if (!preg_match('/^#[0-9a-f]{6}$/', $text)) send_error(422, 'Warna tidak valid');
    return $text;
}

// The text of the active cards, one block per card: "Title (date)" and the note below it.
function pond_kanban_notes_text(int $pondId): array {
    $rows = query('SELECT title, body, note_date FROM pond_kanban WHERE pond_id = ? AND deleted_at IS NULL ORDER BY sort_order, id', [$pondId]);
    $blocks = [];
    $latest = null;
    foreach ($rows as $row) {
        $title = trim((string)$row['title']);
        $body = trim((string)$row['body']);
        $head = $title;
        if ($body === '' && $head === '') continue;
        $blocks[] = $head !== '' && $body !== '' ? $head . "\n" . $body : ($head !== '' ? $head : $body);
        if ($row['note_date'] && ($latest === null || $row['note_date'] > $latest)) $latest = $row['note_date'];
    }
    return [implode("\n\n", $blocks), $latest];
}

// "Qty Manual" of a pond is the total of the Qty Kanban of its active cards.
function pond_kanban_total_qty(int $pondId): int {
    return (int)(query_one('SELECT COALESCE(SUM(qty), 0) AS total FROM pond_kanban WHERE pond_id = ? AND deleted_at IS NULL', [$pondId])['total'] ?? 0);
}

function pond_kanban_sync_notes(int $pondId): void {
    [$text, $latest] = pond_kanban_notes_text($pondId);
    execute('UPDATE ponds SET notes = ?, notes_date = ?, unphotographed_fish_qty = ? WHERE id = ?', [$text, $latest, pond_kanban_total_qty($pondId), $pondId]);
}

function pond_kanban_has_cards(int $pondId): bool {
    return (bool)query_one('SELECT id FROM pond_kanban WHERE pond_id = ? LIMIT 1', [$pondId]);
}

// The quantity a card starts with when it takes over the pond's old Qty Manual; the history shows where it came from.
function pond_kanban_opening_qty(int $cardId, int $qty): void {
    if ($qty <= 0) return;
    execute('UPDATE pond_kanban SET qty = qty + ? WHERE id = ?', [$qty, $cardId]);
    $after = (int)(query_one('SELECT qty FROM pond_kanban WHERE id = ?', [$cardId])['qty'] ?? $qty);
    execute(
        "INSERT INTO pond_kanban_qty_log (kanban_id, delta, qty_after, log_date, notes, actor) VALUES (?, ?, ?, CURDATE(), 'Qty Manual sebelum kanban', 'Sistem')",
        [$cardId, $qty, $after]
    );
}

// An earlier version of the program took the Qty Manual into the cards, then undid it for a while: that undo ran once on its own and is
// kept here only for devices that still hold such cards. Once the undo has run (or when there is nothing to undo) the adoption below runs.
function pond_kanban_undo_adoption_once(): void {
    static $done = false;
    if ($done) return;
    $done = true;
    if (query_one("SELECT `key` FROM app_settings WHERE `key` = 'pond_kanban_qty_undo_v1'")) return;
    foreach (query("SELECT id, kanban_id, delta FROM pond_kanban_qty_log WHERE actor = 'Sistem' AND notes = 'Qty Manual sebelum kanban'") as $row) {
        execute('UPDATE pond_kanban SET qty = GREATEST(0, qty - ?) WHERE id = ?', [(int)$row['delta'], $row['kanban_id']]);
        execute('DELETE FROM pond_kanban_qty_log WHERE id = ?', [$row['id']]);
    }
    execute("INSERT INTO app_settings (`key`, value) VALUES ('pond_kanban_qty_undo_v1', ?) ON DUPLICATE KEY UPDATE value = VALUES(value)", [date('Y-m-d H:i:s')]);
}

// Once: every pond whose Qty Manual is not yet carried by a card gets it on its first card (Qty Manual is the total of the cards from now on).
function pond_kanban_adopt_all_once(): void {
    static $done = false;
    if ($done) return;
    $done = true;
    if (query_one("SELECT `key` FROM app_settings WHERE `key` = 'pond_kanban_qty_v2'")) return;
    foreach (query('SELECT id FROM ponds WHERE unphotographed_fish_qty > 0') as $row) {
        $pondId = (int)$row['id'];
        if (!pond_kanban_has_cards($pondId)) {
            pond_kanban_backfill($pondId);
        } elseif (pond_kanban_total_qty($pondId) === 0) {
            $first = query_one('SELECT id FROM pond_kanban WHERE pond_id = ? AND deleted_at IS NULL ORDER BY sort_order, id LIMIT 1', [$pondId]);
            $manual = (int)(query_one('SELECT unphotographed_fish_qty AS q FROM ponds WHERE id = ?', [$pondId])['q'] ?? 0);
            if ($first) {
                pond_kanban_opening_qty((int)$first['id'], $manual);
                pond_kanban_sync_notes($pondId);
            }
        }
    }
    execute("INSERT INTO app_settings (`key`, value) VALUES ('pond_kanban_qty_v2', ?) ON DUPLICATE KEY UPDATE value = VALUES(value)", [date('Y-m-d H:i:s')]);
}

// A pond that has notes from before the kanban existed (or from a restored older backup) and no card at all gets one card with them.
function pond_kanban_backfill(int $pondId): void {
    if (pond_kanban_has_cards($pondId)) return;
    $pond = query_one('SELECT notes, notes_date, unphotographed_fish_qty FROM ponds WHERE id = ?', [$pondId]);
    if (!$pond || (trim((string)$pond['notes']) === '' && (int)$pond['unphotographed_fish_qty'] <= 0)) return;
    execute(
        "INSERT INTO pond_kanban (pond_id, title, body, note_date, sort_order, color, created_by) VALUES (?, 'Catatan', ?, ?, 0, ?, 'Sistem')",
        [$pondId, $pond['notes'], $pond['notes_date'], pond_kanban_random_color()]
    );
    pond_kanban_opening_qty((int)db()->lastInsertId(), (int)$pond['unphotographed_fish_qty']);
}

// Notes that arrive the old way (PATCH /ponds/{id} with "notes": Excel import, older pages) go into the card called "Catatan".
function pond_kanban_apply_plain_notes(int $pondId, string $notes, ?string $date): void {
    pond_kanban_backfill($pondId);
    [$current] = pond_kanban_notes_text($pondId);
    if (trim($notes) === trim($current)) return;
    $card = query_one("SELECT id FROM pond_kanban WHERE pond_id = ? AND deleted_at IS NULL AND title = 'Catatan' ORDER BY sort_order, id LIMIT 1", [$pondId]);
    if ($card) {
        execute('UPDATE pond_kanban SET body = ?, note_date = COALESCE(?, note_date) WHERE id = ?', [$notes, $date, $card['id']]);
    } elseif (trim($notes) !== '') {
        $next = (int)(query_one('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM pond_kanban WHERE pond_id = ?', [$pondId])['n'] ?? 0);
        execute("INSERT INTO pond_kanban (pond_id, title, body, note_date, sort_order, color, created_by) VALUES (?, 'Catatan', ?, ?, ?, ?, 'Sistem')", [$pondId, $notes, $date, $next, pond_kanban_random_color()]);
    }
    pond_kanban_sync_notes($pondId);
}

// The pictures attached to a card: a JSON list of /api/uploads/... addresses.
function pond_kanban_images_of(array $card): array {
    $list = json_decode((string)($card['images'] ?? ''), true);
    return is_array($list) ? array_values(array_filter(array_map('strval', $list))) : [];
}

function pond_kanban_find(string $id): array {
    $card = query_one('SELECT * FROM pond_kanban WHERE id = ?', [$id]);
    if (!$card) send_error(404, 'Kanban tidak ditemukan');
    return $card;
}

route_pattern('GET', '#^/ponds/(\d+)/kanban$#', function (array $m) {
    $pondId = (int)$m[1];
    if (!query_one('SELECT id FROM ponds WHERE id = ?', [$pondId])) send_error(404, 'Kolam tidak ditemukan');
    pond_kanban_backfill($pondId);
    foreach (query('SELECT id FROM pond_kanban WHERE pond_id = ? AND color IS NULL', [$pondId]) as $row) {
        execute('UPDATE pond_kanban SET color = ? WHERE id = ?', [pond_kanban_random_color(), $row['id']]);
    }
    $cols = 'id, pond_id, title, body, note_date, qty, sort_order, color, images, created_by, deleted_at, deleted_by, created_at, updated_at';
    send_json(200, [
        'items' => query("SELECT $cols FROM pond_kanban WHERE pond_id = ? AND deleted_at IS NULL ORDER BY sort_order, id", [$pondId]),
        'deleted' => query("SELECT $cols FROM pond_kanban WHERE pond_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC, id DESC", [$pondId]),
    ]);
});

route_pattern('POST', '#^/ponds/(\d+)/kanban$#', function (array $m) {
    $session = require_account();
    $pondId = (int)$m[1];
    if (!query_one('SELECT id FROM ponds WHERE id = ?', [$pondId])) send_error(404, 'Kolam tidak ditemukan');
    $body = read_json_body();
    pond_kanban_backfill($pondId);
    $next = (int)(query_one('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM pond_kanban WHERE pond_id = ? AND deleted_at IS NULL', [$pondId])['n'] ?? 0);
    $date = array_key_exists('note_date', $body) ? koi_clean_partial_date($body['note_date'], 'Tanggal pencatatan') : date('Y-m-d');
    execute(
        'INSERT INTO pond_kanban (pond_id, title, body, note_date, sort_order, color, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [$pondId, mb_substr(trim((string)($body['title'] ?? '')), 0, 255), (string)($body['body'] ?? ''), $date, $next, array_key_exists('color', $body) ? pond_kanban_clean_color($body['color']) : pond_kanban_random_color(), pond_kanban_actor($session)]
    );
    $id = (int)db()->lastInsertId();
    pond_kanban_sync_notes($pondId);
    send_json(201, query_one('SELECT * FROM pond_kanban WHERE id = ?', [$id]));
});

route_pattern('POST', '#^/ponds/(\d+)/kanban/order$#', function (array $m) {
    require_account();
    $pondId = (int)$m[1];
    $body = read_json_body();
    $ids = array_values(array_filter(array_map('intval', (array)($body['ids'] ?? [])), fn($id) => $id > 0));
    $stmt = db()->prepare('UPDATE pond_kanban SET sort_order = ? WHERE id = ? AND pond_id = ? AND deleted_at IS NULL');
    foreach ($ids as $index => $id) $stmt->execute([$index, $id, $pondId]);
    pond_kanban_sync_notes($pondId);
    send_json(200, ['ok' => true]);
});

route_pattern('PATCH', '#^/ponds/kanban/(\d+)$#', function (array $m) {
    require_account();
    $card = pond_kanban_find($m[1]);
    $body = read_json_body();
    $fields = [];
    $params = [];
    if (array_key_exists('title', $body)) { $fields[] = 'title = ?'; $params[] = mb_substr(trim((string)$body['title']), 0, 255); }
    if (array_key_exists('body', $body)) { $fields[] = 'body = ?'; $params[] = (string)$body['body']; }
    if (array_key_exists('note_date', $body)) { $fields[] = 'note_date = ?'; $params[] = koi_clean_partial_date($body['note_date'], 'Tanggal pencatatan'); }
    if (array_key_exists('color', $body)) { $fields[] = 'color = ?'; $params[] = pond_kanban_clean_color($body['color']); }
    if (!$fields) send_error(400, 'Tidak ada field untuk diupdate');
    $params[] = $card['id'];
    execute('UPDATE pond_kanban SET ' . implode(', ', $fields) . ' WHERE id = ?', $params);
    if (!$card['deleted_at']) pond_kanban_sync_notes((int)$card['pond_id']);
    send_json(200, query_one('SELECT * FROM pond_kanban WHERE id = ?', [$card['id']]));
});

// Deleting puts the card in History Catatan; ?permanent=1 (only for a card that is already there) removes it for good.
route_pattern('DELETE', '#^/ponds/kanban/(\d+)$#', function (array $m) {
    $session = require_account();
    $card = pond_kanban_find($m[1]);
    if (($_GET['permanent'] ?? '') === '1') {
        if (!$card['deleted_at']) send_error(409, 'Hapus kanban dulu, baru bisa dihapus permanen dari History Catatan.');
        $files = pond_kanban_images_of($card);
        execute('DELETE FROM pond_kanban WHERE id = ?', [$card['id']]);
        $deleted = $files ? delete_upload_files_if_unused($files) : 0;
        send_json(200, ['ok' => true, 'permanent' => true, 'deleted_files' => $deleted]);
    }
    if (!$card['deleted_at']) {
        execute('UPDATE pond_kanban SET deleted_at = NOW(), deleted_by = ? WHERE id = ?', [pond_kanban_actor($session), $card['id']]);
        pond_kanban_sync_notes((int)$card['pond_id']);
    }
    send_json(200, ['ok' => true]);
});

route_pattern('POST', '#^/ponds/kanban/(\d+)/restore$#', function (array $m) {
    require_account();
    $card = pond_kanban_find($m[1]);
    if ($card['deleted_at']) {
        $next = (int)(query_one('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM pond_kanban WHERE pond_id = ? AND deleted_at IS NULL', [$card['pond_id']])['n'] ?? 0);
        execute('UPDATE pond_kanban SET deleted_at = NULL, deleted_by = NULL, sort_order = ? WHERE id = ?', [$next, $card['id']]);
        pond_kanban_sync_notes((int)$card['pond_id']);
    }
    send_json(200, query_one('SELECT * FROM pond_kanban WHERE id = ?', [$card['id']]));
});

// Qty Kanban: "delta" is the amount to add (positive) or subtract (negative); the history keeps the date, the amount and who did it.
route_pattern('POST', '#^/ponds/kanban/(\d+)/qty$#', function (array $m) {
    $session = require_account();
    $card = pond_kanban_find($m[1]);
    if ($card['deleted_at']) send_error(409, 'Kanban ini sudah dihapus.');
    $body = read_json_body();
    $delta = (int)($body['delta'] ?? 0);
    $setTo = array_key_exists('set', $body) && $body['set'] !== '' && $body['set'] !== null ? (int)$body['set'] : null;
    if ($setTo !== null) {
        if ($setTo < 0) send_error(422, 'Jumlah tidak boleh kurang dari 0.');
        $delta = $setTo - (int)$card['qty'];
        if ($delta === 0) send_json(200, ['kanban' => $card, 'pond_qty' => pond_kanban_total_qty((int)$card['pond_id'])]);
    }
    if ($delta === 0) send_error(422, 'Isi jumlah yang ditambah atau dikurangi.');
    $date = trim((string)($body['log_date'] ?? '')) ?: date('Y-m-d');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || !checkdate((int)substr($date, 5, 2), (int)substr($date, 8, 2), (int)substr($date, 0, 4))) send_error(422, 'Tanggal tidak valid');
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $fresh = query_one('SELECT qty FROM pond_kanban WHERE id = ? FOR UPDATE', [$card['id']]);
        $after = (int)$fresh['qty'] + $delta;
        if ($after < 0) {
            $pdo->rollBack();
            send_error(422, 'Jumlah tidak boleh kurang dari 0 (sekarang ' . (int)$fresh['qty'] . ').');
        }
        execute('UPDATE pond_kanban SET qty = ? WHERE id = ?', [$after, $card['id']]);
        execute(
            'INSERT INTO pond_kanban_qty_log (kanban_id, delta, qty_after, log_date, notes, actor) VALUES (?, ?, ?, ?, ?, ?)',
            [$card['id'], $delta, $after, $date, mb_substr(trim((string)($body['notes'] ?? '')), 0, 500) ?: null, pond_kanban_actor($session)]
        );
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    pond_kanban_sync_notes((int)$card['pond_id']);
    send_json(200, ['kanban' => query_one('SELECT * FROM pond_kanban WHERE id = ?', [$card['id']]), 'pond_qty' => pond_kanban_total_qty((int)$card['pond_id'])]);
});

route_pattern('GET', '#^/ponds/kanban/(\d+)/qty-log$#', function (array $m) {
    pond_kanban_find($m[1]);
    send_json(200, query('SELECT id, kanban_id, delta, qty_after, log_date, notes, actor, created_at FROM pond_kanban_qty_log WHERE kanban_id = ? ORDER BY log_date DESC, id DESC', [$m[1]]));
});

// Light list of the ponds (id, name, area) for the "Pindah" / "Pecah" choices of a card.
route('GET', '/ponds/options', function () {
    send_json(200, query("SELECT id, name, COALESCE(NULLIF(location, ''), 'Tanpa Area') AS location FROM ponds ORDER BY location, name"));
});

function pond_kanban_pond_name(int $pondId): string {
    return (string)(query_one('SELECT name FROM ponds WHERE id = ?', [$pondId])['name'] ?? ('#' . $pondId));
}

function pond_kanban_log_line(int $cardId, int $delta, int $after, string $note, string $actor): void {
    execute('INSERT INTO pond_kanban_qty_log (kanban_id, delta, qty_after, log_date, notes, actor) VALUES (?, ?, ?, CURDATE(), ?, ?)', [$cardId, $delta, $after, mb_substr($note, 0, 500), $actor]);
}

function pond_kanban_next_order(int $pondId): int {
    return (int)(query_one('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM pond_kanban WHERE pond_id = ? AND deleted_at IS NULL', [$pondId])['n'] ?? 0);
}

// Pindah: the whole card (title, note, date, Qty Kanban and its history) moves to another pond, at the end of its cards.
route_pattern('POST', '#^/ponds/kanban/(\d+)/move$#', function (array $m) {
    $session = require_account();
    $card = pond_kanban_find($m[1]);
    if ($card['deleted_at']) send_error(409, 'Kanban ini sudah dihapus.');
    $body = read_json_body();
    $target = (int)($body['pond_id'] ?? 0);
    if ($target <= 0 || !query_one('SELECT id FROM ponds WHERE id = ?', [$target])) send_error(422, 'Pilih kolam tujuan.');
    if ($target === (int)$card['pond_id']) send_error(422, 'Kanban sudah ada di kolam ini.');
    $from = (int)$card['pond_id'];
    $pdo = db();
    $pdo->beginTransaction();
    try {
        execute('UPDATE pond_kanban SET pond_id = ?, sort_order = ? WHERE id = ?', [$target, pond_kanban_next_order($target), $card['id']]);
        pond_kanban_log_line((int)$card['id'], 0, (int)$card['qty'], 'Dipindah dari kolam ' . pond_kanban_pond_name($from) . ' ke kolam ' . pond_kanban_pond_name($target), pond_kanban_actor($session));
        pond_kanban_sync_notes($from);
        pond_kanban_sync_notes($target);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    send_json(200, ['kanban' => query_one('SELECT * FROM pond_kanban WHERE id = ?', [$card['id']])]);
});

// Pecah: part of the Qty Kanban goes to a new card (same pond or another one) that gets a copy of the note and the date.
route_pattern('POST', '#^/ponds/kanban/(\d+)/split$#', function (array $m) {
    $session = require_account();
    $card = pond_kanban_find($m[1]);
    if ($card['deleted_at']) send_error(409, 'Kanban ini sudah dihapus.');
    $body = read_json_body();
    $amount = (int)($body['qty'] ?? 0);
    if ($amount < 1) send_error(422, 'Isi jumlah ikan yang dipisah (1 atau lebih).');
    if ($amount > (int)$card['qty']) send_error(422, 'Jumlah melebihi Qty kartu (sekarang ' . (int)$card['qty'] . ').');
    $target = (int)($body['pond_id'] ?? 0) ?: (int)$card['pond_id'];
    if (!query_one('SELECT id FROM ponds WHERE id = ?', [$target])) send_error(422, 'Kolam tujuan tidak ditemukan.');
    $title = mb_substr(trim((string)($body['title'] ?? '')), 0, 255);
    if ($title === '') $title = trim((string)$card['title']);
    $actor = pond_kanban_actor($session);
    $from = (int)$card['pond_id'];
    $where = $target === $from ? '' : ' (kolam ' . pond_kanban_pond_name($target) . ')';
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $fresh = query_one('SELECT qty FROM pond_kanban WHERE id = ? FOR UPDATE', [$card['id']]);
        if ((int)$fresh['qty'] < $amount) {
            $pdo->rollBack();
            send_error(422, 'Jumlah melebihi Qty kartu (sekarang ' . (int)$fresh['qty'] . ').');
        }
        $left = (int)$fresh['qty'] - $amount;
        execute('UPDATE pond_kanban SET qty = ? WHERE id = ?', [$left, $card['id']]);
        execute(
            'INSERT INTO pond_kanban (pond_id, title, body, note_date, qty, sort_order, color, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [$target, $title, $card['body'], $card['note_date'], $amount, pond_kanban_next_order($target), $card['color'] ?? pond_kanban_random_color(), $actor]
        );
        $newId = (int)$pdo->lastInsertId();
        pond_kanban_log_line((int)$card['id'], -$amount, $left, 'Dipecah ke kartu "' . $title . '"' . $where, $actor);
        pond_kanban_log_line($newId, $amount, $amount, 'Dipecah dari kartu "' . trim((string)$card['title']) . '"' . ($target === $from ? '' : ' (kolam ' . pond_kanban_pond_name($from) . ')'), $actor);
        pond_kanban_sync_notes($from);
        if ($target !== $from) pond_kanban_sync_notes($target);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    send_json(200, ['kanban' => query_one('SELECT * FROM pond_kanban WHERE id = ?', [$card['id']]), 'created' => query_one('SELECT * FROM pond_kanban WHERE id = ?', [$newId])]);
});

// Attach pictures: each one comes as a data URL (the page shrinks it first), is stored like every other upload and added to the card's list.
route_pattern('POST', '#^/ponds/kanban/(\d+)/images$#', function (array $m) {
    require_account();
    $card = pond_kanban_find($m[1]);
    if ($card['deleted_at']) send_error(409, 'Kanban ini sudah dihapus.');
    $body = read_json_body();
    $incoming = array_values(array_filter((array)($body['images'] ?? []), fn($data) => is_string($data) && $data !== ''));
    if (!$incoming) send_error(422, 'Pilih gambar yang dilampirkan.');
    $list = pond_kanban_images_of($card);
    foreach ($incoming as $data) {
        try {
            $list[] = save_image_data($data, 'pond-kanban');
        } catch (InvalidArgumentException $e) {
            send_error(422, 'Gambar tidak valid', $e->getMessage());
        }
    }
    execute('UPDATE pond_kanban SET images = ? WHERE id = ?', [json_encode($list, JSON_UNESCAPED_SLASHES), $card['id']]);
    send_json(200, query_one('SELECT * FROM pond_kanban WHERE id = ?', [$card['id']]));
});

// Remove one picture from a card; its file is deleted when nothing else (the Galeri, a documentation) still uses it.
route_pattern('POST', '#^/ponds/kanban/(\d+)/images/remove$#', function (array $m) {
    require_account();
    $card = pond_kanban_find($m[1]);
    $body = read_json_body();
    $url = trim((string)($body['url'] ?? ''));
    $list = pond_kanban_images_of($card);
    $left = array_values(array_filter($list, fn($item) => $item !== $url));
    if (count($left) === count($list)) send_error(404, 'Gambar tidak ditemukan di kanban ini.');
    execute('UPDATE pond_kanban SET images = ? WHERE id = ?', [$left ? json_encode($left, JSON_UNESCAPED_SLASHES) : null, $card['id']]);
    $deleted = delete_upload_files_if_unused([$url]);
    $row = query_one('SELECT * FROM pond_kanban WHERE id = ?', [$card['id']]);
    $row['deleted_files'] = $deleted;
    send_json(200, $row);
});

// Every active card of every pond (with the pond's name): the "Kanban" sheet of the Edit Masal file of Data Kolam.
route('GET', '/ponds/kanban-all', function () {
    send_json(200, ['items' => query(
        "SELECT k.id, k.pond_id, p.name AS pond_name, k.title, k.body, k.note_date, k.qty, k.color
         FROM pond_kanban k JOIN ponds p ON p.id = k.pond_id WHERE k.deleted_at IS NULL ORDER BY p.name, k.sort_order, k.id"
    )]);
});
