<?php
// api-php/handlers/messages.php
//
// One-to-one messages between accounts. Text and image attachments are encrypted on the server
// (AES-256-GCM) before they are stored, so the database and the storage folder never hold readable
// message content. Attachments live outside the web root and are only served after a session check.

const MESSAGE_MAX_TEXT = 5000;
const MESSAGE_MAX_IMAGES = 15;
const MESSAGE_MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MESSAGE_THREAD_LIMIT = 150;

function message_storage_dir(): string {
    $config = require __DIR__ . '/../config.php';
    return dirname($config['backups_dir']);
}

function message_key(): string {
    if (!extension_loaded('openssl') || !in_array('aes-256-gcm', openssl_get_cipher_methods(), true)) {
        send_error(500, 'Enkripsi pesan tidak tersedia', 'Ekstensi PHP openssl dengan aes-256-gcm dibutuhkan');
    }
    $dir = message_storage_dir();
    if (!is_dir($dir)) mkdir($dir, 0775, true);
    $file = $dir . '/.message-key';
    if (!is_file($file)) {
        file_put_contents($file, base64_encode(random_bytes(32)), LOCK_EX);
        @chmod($file, 0600);
    }
    $key = base64_decode((string)file_get_contents($file), true);
    if ($key === false || strlen($key) !== 32) {
        send_error(500, 'Kunci enkripsi pesan rusak', 'Periksa berkas .message-key di folder storage');
    }
    return $key;
}

function message_encrypt(string $plain): string {
    $iv = random_bytes(12);
    $tag = '';
    $cipher = openssl_encrypt($plain, 'aes-256-gcm', message_key(), OPENSSL_RAW_DATA, $iv, $tag, '', 16);
    if ($cipher === false) send_error(500, 'Pesan gagal dienkripsi');
    return $iv . $tag . $cipher;
}

function message_decrypt(string $blob): ?string {
    if (strlen($blob) < 28) return null;
    $plain = openssl_decrypt(substr($blob, 28), 'aes-256-gcm', message_key(), OPENSSL_RAW_DATA, substr($blob, 0, 12), substr($blob, 12, 16));
    return $plain === false ? null : $plain;
}

function message_text_from_db(?string $encoded): ?string {
    if ($encoded === null || $encoded === '') return null;
    $blob = base64_decode($encoded, true);
    return $blob === false ? null : message_decrypt($blob);
}

function message_attachment_path(string $id): string {
    $dir = message_storage_dir() . '/messages';
    if (!is_dir($dir)) mkdir($dir, 0775, true);
    return $dir . '/' . $id . '.enc';
}

function message_me(bool $touch = true): int {
    return (int) require_account($touch)['account_id'];
}

function message_partner_row(int $id): array {
    $partner = query_one("SELECT id, name, username, avatar, role FROM accounts WHERE id = ? AND status = 'Active'", [$id]);
    if (!$partner) send_error(404, 'Akun tidak ditemukan');
    return $partner;
}

route('GET', '/messages/users', function () {
    $me = message_me();
    $q = trim((string)($_GET['q'] ?? ''));
    $like = '%' . $q . '%';
    $rows = query(
        "SELECT id, name, username, avatar, role FROM accounts
         WHERE status = 'Active'
           AND (? = '' OR name LIKE ? OR username LIKE ? OR email LIKE ?)
         ORDER BY (id = ?) DESC, name LIMIT 30",
        [$q, $like, $like, $like, $me]
    );
    foreach ($rows as &$row) $row['is_me'] = (int)$row['id'] === $me;
    unset($row);
    send_json(200, $rows);
});

route('GET', '/messages/unread-count', function () {
    $me = message_me(false);
    $row = query_one(
        'SELECT COUNT(*) AS total FROM messages m
         LEFT JOIN message_conversation_prefs p ON p.account_id = m.recipient_id AND p.partner_id = m.sender_id
         WHERE m.recipient_id = ? AND m.read_at IS NULL AND m.deleted_at IS NULL AND m.id > IFNULL(p.cleared_before, 0) AND IFNULL(p.muted, 0) = 0',
        [$me]
    );
    $flagged = query_one(
        'SELECT COUNT(*) AS total FROM message_conversation_prefs p
         WHERE p.account_id = ? AND p.marked_unread = 1 AND p.muted = 0
           AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.sender_id = p.partner_id AND m.recipient_id = p.account_id
                           AND m.read_at IS NULL AND m.deleted_at IS NULL AND m.id > p.cleared_before)',
        [$me]
    );
    send_json(200, ['count' => (int)($row['total'] ?? 0) + (int)($flagged['total'] ?? 0)]);
});

route('GET', '/messages/conversations', function () {
    $me = message_me();
    $rows = query(
        "SELECT partner.id, partner.name, partner.username, partner.avatar, partner.role,
                m.id AS last_id, m.sender_id AS last_sender_id, m.body_enc, m.created_at AS last_at, m.deleted_at AS last_deleted_at,
                (SELECT COUNT(*) FROM message_attachments a WHERE a.message_id = m.id) AS attachment_count,
                (SELECT COUNT(*) FROM messages u WHERE u.sender_id = partner.id AND u.recipient_id = ? AND u.read_at IS NULL AND u.deleted_at IS NULL
                    AND u.id > IFNULL(pf.cleared_before, 0)) AS unread,
                IFNULL(pf.pinned, 0) AS pinned, IFNULL(pf.muted, 0) AS muted, IFNULL(pf.marked_unread, 0) AS marked_unread
         FROM (
             SELECT t.partner_id, MAX(t.id) AS last_id
             FROM (
                 SELECT x.id, IF(x.sender_id = ?, x.recipient_id, x.sender_id) AS partner_id
                 FROM messages x WHERE x.sender_id = ? OR x.recipient_id = ?
             ) t
             LEFT JOIN message_conversation_prefs xp ON xp.account_id = ? AND xp.partner_id = t.partner_id
             WHERE t.id > IFNULL(xp.cleared_before, 0)
             GROUP BY t.partner_id
         ) c
         JOIN messages m ON m.id = c.last_id
         JOIN accounts partner ON partner.id = c.partner_id
         LEFT JOIN message_conversation_prefs pf ON pf.account_id = ? AND pf.partner_id = partner.id
         ORDER BY IFNULL(pf.pinned, 0) DESC, m.id DESC",
        [$me, $me, $me, $me, $me, $me]
    );
    $out = [];
    foreach ($rows as $row) {
        if ($row['last_deleted_at']) {
            $preview = 'Pesan ini telah dihapus';
        } else {
            $text = message_text_from_db($row['body_enc']);
            $preview = $text !== null && $text !== '' ? mb_substr($text, 0, 80) : ((int)$row['attachment_count'] > 0 ? '[Gambar]' : '');
        }
        $out[] = [
            'id' => (int)$row['id'], 'name' => $row['name'], 'username' => $row['username'], 'avatar' => $row['avatar'], 'role' => $row['role'], 'is_me' => (int)$row['id'] === $me,
            'last_at' => $row['last_at'], 'last_from_me' => (int)$row['last_sender_id'] === $me, 'preview' => $preview,
            'deleted' => (bool)$row['last_deleted_at'], 'unread' => (int)$row['unread'],
            'pinned' => (bool)$row['pinned'], 'muted' => (bool)$row['muted'], 'marked_unread' => (bool)$row['marked_unread'],
        ];
    }
    send_json(200, $out);
});

route_pattern('GET', '#^/messages/thread/(\d+)$#', function (array $m) {
    $me = message_me();
    $partnerId = (int)$m[1];
    $partner = message_partner_row($partnerId);

    execute(
        'UPDATE messages SET read_at = NOW() WHERE sender_id = ? AND recipient_id = ? AND read_at IS NULL AND deleted_at IS NULL',
        [$partnerId, $me]
    );
    execute('UPDATE message_conversation_prefs SET marked_unread = 0 WHERE account_id = ? AND partner_id = ? AND marked_unread = 1', [$me, $partnerId]);
    $prefs = query_one('SELECT cleared_before FROM message_conversation_prefs WHERE account_id = ? AND partner_id = ?', [$me, $partnerId]);
    $cleared = (int)($prefs['cleared_before'] ?? 0);

    $rows = query(
        'SELECT id, sender_id, body_enc, created_at, read_at, deleted_at FROM messages
         WHERE ((sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)) AND id > ?
         ORDER BY id DESC LIMIT ' . MESSAGE_THREAD_LIMIT,
        [$me, $partnerId, $partnerId, $me, $cleared]
    );
    $rows = array_reverse($rows);

    $attachmentsByMessage = [];
    if ($rows) {
        $ids = array_column($rows, 'id');
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        foreach (query("SELECT id, message_id, mime, size_bytes FROM message_attachments WHERE message_id IN ($placeholders) ORDER BY id", $ids) as $attachment) {
            $attachmentsByMessage[(int)$attachment['message_id']][] = ['id' => $attachment['id'], 'mime' => $attachment['mime'], 'size' => (int)$attachment['size_bytes']];
        }
    }

    $messages = [];
    foreach ($rows as $row) {
        $deleted = (bool)$row['deleted_at'];
        $messages[] = [
            'id' => (int)$row['id'],
            'mine' => (int)$row['sender_id'] === $me,
            'text' => $deleted ? null : message_text_from_db($row['body_enc']),
            'attachments' => $deleted ? [] : ($attachmentsByMessage[(int)$row['id']] ?? []),
            'created_at' => $row['created_at'],
            'read' => (bool)$row['read_at'],
            'deleted' => $deleted,
        ];
    }
    $partner['is_me'] = $partnerId === $me;
    send_json(200, ['partner' => $partner, 'messages' => $messages]);
});

route('POST', '/messages/send', function () {
    $me = message_me();
    $body = read_json_body();
    $to = (int)($body['to'] ?? 0);
    message_partner_row($to);

    $text = trim((string)($body['body'] ?? ''));
    if (mb_strlen($text) > MESSAGE_MAX_TEXT) send_error(422, 'Pesan maksimal ' . MESSAGE_MAX_TEXT . ' karakter');
    $images = is_array($body['images'] ?? null) ? $body['images'] : [];
    if (count($images) > MESSAGE_MAX_IMAGES) send_error(422, 'Gambar maksimal ' . MESSAGE_MAX_IMAGES . ' per pesan');
    if ($text === '' && !$images) send_error(422, 'Tulis pesan atau pilih gambar');

    $decoded = [];
    foreach ($images as $dataUrl) {
        if (!preg_match('#^data:(image/(png|jpe?g|webp|gif));base64,(.+)$#s', (string)$dataUrl, $match)) {
            send_error(422, 'Format gambar tidak valid');
        }
        $bytes = base64_decode($match[3], true);
        if ($bytes === false || $bytes === '') send_error(422, 'Format gambar tidak valid');
        if (strlen($bytes) > MESSAGE_MAX_IMAGE_BYTES) send_error(422, 'Satu gambar maksimal 8 MB');
        $decoded[] = [$match[1] === 'image/jpg' ? 'image/jpeg' : $match[1], $bytes];
    }

    $written = [];
    $pdo = db();
    try {
        $pdo->beginTransaction();
        execute('INSERT INTO messages (sender_id, recipient_id, body_enc, read_at) VALUES (?, ?, ?, ' . ($to === $me ? 'NOW()' : 'NULL') . ')', [
            $me, $to, $text === '' ? null : base64_encode(message_encrypt($text)),
        ]);
        $messageId = (int)$pdo->lastInsertId();
        foreach ($decoded as [$mime, $bytes]) {
            $attachmentId = bin2hex(random_bytes(16));
            $path = message_attachment_path($attachmentId);
            file_put_contents($path, message_encrypt($bytes));
            $written[] = $path;
            execute('INSERT INTO message_attachments (id, message_id, mime, size_bytes) VALUES (?, ?, ?, ?)', [$attachmentId, $messageId, $mime, strlen($bytes)]);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        foreach ($written as $path) @unlink($path);
        throw $e;
    }
    send_json(201, ['ok' => true, 'id' => $messageId]);
});

route_pattern('DELETE', '#^/messages/(\d+)$#', function (array $m) {
    $me = message_me();
    $message = query_one('SELECT id, sender_id, deleted_at FROM messages WHERE id = ?', [$m[1]]);
    if (!$message || (int)$message['sender_id'] !== $me) send_error(404, 'Pesan tidak ditemukan');
    if (!$message['deleted_at']) {
        foreach (query('SELECT id FROM message_attachments WHERE message_id = ?', [$message['id']]) as $attachment) {
            @unlink(message_attachment_path($attachment['id']));
        }
        execute('DELETE FROM message_attachments WHERE message_id = ?', [$message['id']]);
        execute('UPDATE messages SET body_enc = NULL, deleted_at = NOW() WHERE id = ?', [$message['id']]);
    }
    send_json(200, ['ok' => true]);
});

route_pattern('GET', '#^/messages/attachments/([a-f0-9]{32})$#', function (array $m) {
    $me = message_me();
    $row = query_one(
        'SELECT a.mime, msg.sender_id, msg.recipient_id, msg.deleted_at
         FROM message_attachments a JOIN messages msg ON msg.id = a.message_id WHERE a.id = ?',
        [$m[1]]
    );
    if (!$row || $row['deleted_at'] || ((int)$row['sender_id'] !== $me && (int)$row['recipient_id'] !== $me)) {
        send_error(404, 'Gambar tidak ditemukan');
    }
    $path = message_attachment_path($m[1]);
    $plain = is_file($path) ? message_decrypt((string)file_get_contents($path)) : null;
    if ($plain === null) send_error(404, 'Gambar tidak ditemukan');
    header('Content-Type: ' . $row['mime']);
    header('Cache-Control: private, max-age=3600');
    header('X-Content-Type-Options: nosniff');
    echo $plain;
    exit;
});

// ---- options of one conversation, for the signed-in account only
function message_prefs_upsert(int $me, int $partnerId, array $fields): void {
    $allowed = ['pinned', 'muted', 'marked_unread', 'cleared_before'];
    $columns = [];
    $values = [];
    foreach ($fields as $name => $value) {
        if (!in_array($name, $allowed, true)) continue;
        $columns[] = $name;
        $values[] = (int)$value;
    }
    if (!$columns) return;
    $list = implode(', ', array_merge(['account_id', 'partner_id'], $columns));
    $marks = implode(', ', array_fill(0, 2 + count($columns), '?'));
    $update = implode(', ', array_map(fn($c) => "$c = VALUES($c)", $columns));
    execute("INSERT INTO message_conversation_prefs ($list) VALUES ($marks) ON DUPLICATE KEY UPDATE $update", array_merge([$me, $partnerId], $values));
}

route_pattern('POST', '#^/messages/conversations/(\d+)/prefs$#', function (array $m) {
    $me = message_me();
    $partnerId = (int)$m[1];
    if (!query_one('SELECT id FROM accounts WHERE id = ?', [$partnerId])) send_error(404, 'Akun tidak ditemukan');
    $body = read_json_body();
    $fields = [];
    foreach (['pinned', 'muted', 'marked_unread'] as $name) {
        if (array_key_exists($name, $body)) $fields[$name] = $body[$name] ? 1 : 0;
    }
    if (!empty($body['mark_read'])) {
        execute('UPDATE messages SET read_at = NOW() WHERE sender_id = ? AND recipient_id = ? AND read_at IS NULL AND deleted_at IS NULL', [$partnerId, $me]);
        $fields['marked_unread'] = 0;
    }
    if (!$fields) send_error(422, 'Tidak ada pengaturan yang diubah');
    message_prefs_upsert($me, $partnerId, $fields);
    send_json(200, ['ok' => true]);
});

// "Delete" removes the conversation from this account only: everything up to now is hidden here, the other person keeps it,
// and a new message brings the conversation back with only the new messages.
route_pattern('POST', '#^/messages/conversations/(\d+)/delete$#', function (array $m) {
    $me = message_me();
    $partnerId = (int)$m[1];
    if (!query_one('SELECT id FROM accounts WHERE id = ?', [$partnerId])) send_error(404, 'Akun tidak ditemukan');
    $last = query_one(
        'SELECT MAX(id) AS last_id FROM messages WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)',
        [$me, $partnerId, $partnerId, $me]
    );
    message_prefs_upsert($me, $partnerId, ['cleared_before' => (int)($last['last_id'] ?? 0), 'marked_unread' => 0]);
    send_json(200, ['ok' => true]);
});

// ---- profile of any account (name, role, ...): what the profile card shows when a name or picture is clicked.
// E-mail and phone are only for the account itself and for a Master Admin.
route_pattern('GET', '#^/messages/profile/(\d+)$#', function (array $m) {
    $session = require_account(false);
    $me = (int)$session['account_id'];
    $id = (int)$m[1];
    $row = query_one('SELECT id, name, username, avatar, cover, role, status, email, phone, created_at FROM accounts WHERE id = ?', [$id]);
    if (!$row) send_error(404, 'Akun tidak ditemukan');
    $seen = query_one("SELECT MAX(last_seen_at) AS last_seen FROM account_sessions WHERE account_id = ? AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW())", [$id]);
    $lastSeen = $seen['last_seen'] ?? null;
    $out = [
        'id' => $id, 'name' => $row['name'], 'username' => $row['username'], 'avatar' => $row['avatar'], 'cover' => $row['cover'], 'role' => $row['role'],
        'status' => $row['status'], 'joined_at' => $row['created_at'], 'last_seen_at' => $lastSeen,
        'online' => $lastSeen !== null && strtotime($lastSeen) > time() - 300,
        'is_me' => $id === $me, 'can_message' => $row['status'] === 'Active',
    ];
    if ($id === $me || ($session['account_role'] ?? '') === 'Master Admin') {
        $out['email'] = $row['email'];
        $out['phone'] = $row['phone'];
    }
    send_json(200, $out);
});
