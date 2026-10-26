<?php
// api-php/handlers/accounts.php

require_once __DIR__ . '/../lib/uploads.php';

// Avatar and background arrive as a pasted picture (data: URL) from the pages; the column only holds a short URL, so the picture
// goes to the storage and its /api/uploads/... URL is what is kept. A URL or an empty value passes through unchanged.
function account_store_image($value, string $prefix): ?string {
    $value = trim((string)($value ?? ''));
    if ($value === '') return null;
    if (!str_starts_with($value, 'data:')) return mb_substr($value, 0, 500);
    if (strlen($value) > 12 * 1024 * 1024) send_error(422, 'Gambar terlalu besar (maksimal 8 MB)');
    try {
        return save_image_data($value, $prefix);
    } catch (InvalidArgumentException $e) {
        send_error(422, 'Format gambar tidak valid');
    }
}

route('GET', '/accounts', function () {
    $session = require_account();
    $accounts = query('SELECT id, username, name, email, phone, role, status, avatar, cover FROM accounts ORDER BY created_at DESC');
    // only the Master Admin sees which accounts are locked out after too many wrong passwords (it is what the Unlock button is for)
    if (role_level($session['account_role'] ?? $session['role'] ?? null) >= 3) {
        $locked = array_flip(login_locked_usernames());
        foreach ($accounts as &$account) $account['locked'] = isset($locked[strtolower((string)$account['username'])]);
        unset($account);
    }
    send_json(200, $accounts);
});

route('POST', '/accounts', function () {
    require_account();
    $body = read_json_body();
    $username = trim($body['username'] ?? '');
    $name = trim($body['name'] ?? '');
    $password = (string)($body['password'] ?? '');

    if ($username === '' || $name === '' || $password === '') {
        send_error(400, 'Username, nama, dan password wajib diisi');
    }

    try {
        execute(
            'INSERT INTO accounts (username, name, email, phone, password, role, status, avatar) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [
                $username,
                $name,
                $body['email'] ?? null,
                trim((string)($body['phone'] ?? '')) ?: null,
                password_hash($password, PASSWORD_DEFAULT),
                $body['role'] ?? 'Operator',
                $body['status'] ?? 'Active',
                account_store_image($body['avatar'] ?? null, 'avatar'),
            ]
        );
    } catch (PDOException $e) {
        if (is_duplicate_error($e)) send_error(409, 'Username sudah dipakai');
        throw $e;
    }

    $account = query_one('SELECT * FROM accounts WHERE id = LAST_INSERT_ID()');
    send_json(201, sanitize_account($account));
});

route_pattern('GET', '#^/accounts/(\d+)$#', function (array $m) {
    require_account();
    $account = query_one('SELECT id, username, name, email, phone, role, status, avatar, cover FROM accounts WHERE id = ?', [$m[1]]);
    if (!$account) send_error(404, 'Akun tidak ditemukan');
    send_json(200, $account);
});

route_pattern('PATCH', '#^/accounts/(\d+)$#', function (array $m) {
    $session = require_account();
    $body = read_json_body();
    if (role_level($session['account_role'] ?? $session['role'] ?? null) < 3) {
        unset($body['role'], $body['status'], $body['username']);
    }
    $fields = [];
    $params = [];

    // pictures that are replaced or removed: their old files are deleted afterwards when nothing else uses them
    $old = query_one('SELECT avatar, cover FROM accounts WHERE id = ?', [$m[1]]) ?: [];
    foreach (['username', 'name', 'email', 'phone', 'role', 'status', 'avatar', 'cover'] as $col) {
        if (array_key_exists($col, $body)) {
            $fields[] = "$col = ?";
            $params[] = in_array($col, ['avatar', 'cover'], true) ? account_store_image($body[$col], $col === 'cover' ? 'account-cover' : 'avatar') : $body[$col];
        }
    }
    if (array_key_exists('password', $body) && $body['password'] !== '') {
        $fields[] = 'password = ?';
        $params[] = password_hash($body['password'], PASSWORD_DEFAULT);
    }
    if (!$fields) send_error(400, 'Tidak ada field untuk diupdate');

    $params[] = $m[1];
    try {
        execute('UPDATE accounts SET ' . implode(', ', $fields) . ' WHERE id = ?', $params);
    } catch (PDOException $e) {
        if (is_duplicate_error($e)) send_error(409, 'Username sudah dipakai');
        throw $e;
    }

    $account = query_one('SELECT id, username, name, email, phone, role, status, avatar, cover FROM accounts WHERE id = ?', [$m[1]]);
    if (!$account) send_error(404, 'Akun tidak ditemukan');
    $stale = [];
    foreach (['avatar', 'cover'] as $col) {
        if (array_key_exists($col, $body) && !empty($old[$col]) && $old[$col] !== $account[$col]) $stale[] = $old[$col];
    }
    if ($stale) delete_upload_files_if_unused($stale);
    send_json(200, $account);
});

// Master Admin: lift the login lockout of an account (forget its recent wrong passwords).
route_pattern('POST', '#^/accounts/(\d+)/unlock$#', function (array $m) {
    require_account();
    $account = query_one('SELECT username FROM accounts WHERE id = ?', [$m[1]]);
    if (!$account) send_error(404, 'Akun tidak ditemukan');
    login_unlock_username((string)$account['username']);
    send_json(200, ['ok' => true]);
});

route_pattern('DELETE', '#^/accounts/(\d+)$#', function (array $m) {
    require_account();
    execute('DELETE FROM accounts WHERE id = ?', [$m[1]]);
    send_json(200, ['ok' => true]);
});
