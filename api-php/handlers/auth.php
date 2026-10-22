<?php
// api-php/handlers/auth.php
require_once __DIR__ . '/../lib/auth.php';
require_once __DIR__ . '/../lib/security.php';

route('POST', '/auth/login', function () {
    $body = read_json_body();
    $username = trim($body['username'] ?? '');
    $password = (string)($body['password'] ?? '');
    $rememberDevice = (bool)($body['remember_device'] ?? false);

    if ($username === '' || $password === '') {
        send_error(400, 'Username dan password wajib diisi');
    }

    enforce_login_lockout($username);
    $account = query_one('SELECT * FROM accounts WHERE username = ?', [$username]);
    if (!$account && strpos($username, '@') !== false) {
        // the sign-in box says "Email atau username": an e-mail only counts when it belongs to exactly one account
        $byEmail = query('SELECT * FROM accounts WHERE LOWER(email) = LOWER(?) LIMIT 2', [$username]);
        if (count($byEmail) === 1) $account = $byEmail[0];
    }
    if (!$account || !password_verify($password, $account['password'])) {
        record_login_attempt($username, false);
        send_error(401, 'Username atau password salah');
    }
    if ($account['status'] !== 'Active') {
        record_login_attempt($username, false);
        send_error(403, 'Akun tidak aktif');
    }
    record_login_attempt($username, true);
    require_once __DIR__ . '/../lib/jobs.php';
    jobs_maybe_run_retention();

    $sessionId = create_account_session($account, $rememberDevice);
    send_json(200, ['account' => sanitize_account($account), 'session_id' => $sessionId]);
});

route('POST', '/auth/touch', function () {
    touch_account_session(get_request_session_id());
    send_json(200, ['ok' => true]);
});

route('POST', '/auth/logout', function () {
    $sessionId = get_request_session_id();
    if ($sessionId !== '') {
        execute(
            "UPDATE account_sessions SET status = 'ended', logged_out_at = NOW() WHERE id = ?",
            [$sessionId]
        );
    }
    send_json(200, ['ok' => true]);
});

// Master Admin: recent sign-in attempts (successful and failed) for spotting password guessing.
route('GET', '/login-history', function () {
    send_json(200, query(
        'SELECT id, username, ip_address, success, user_agent, created_at
         FROM login_attempts ORDER BY id DESC LIMIT 100'
    ));
});

// Master Admin: delete chosen rows (?ids=1,2,3) or everything (?all=1) from the sign-in history.
route('DELETE', '/login-history', function () {
    if (($_GET['all'] ?? '') === '1') {
        execute('DELETE FROM login_attempts');
        send_json(200, ['ok' => true]);
    }
    $ids = array_values(array_unique(array_filter(array_map('intval', explode(',', (string)($_GET['ids'] ?? ''))), fn($id) => $id > 0)));
    if (!$ids) send_error(400, 'Pilih riwayat yang akan dihapus.');
    execute('DELETE FROM login_attempts WHERE id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')', $ids);
    send_json(200, ['ok' => true, 'deleted' => count($ids)]);
});

// Master Admin: end another device's session (it must sign in again).
route_pattern('DELETE', '#^/account-sessions/([a-f0-9]{32})$#', function (array $m) {
    execute(
        "UPDATE account_sessions SET status = 'ended', logged_out_at = NOW() WHERE id = ? AND status = 'active'",
        [$m[1]]
    );
    send_json(200, ['ok' => true]);
});

// Public sign-up (the sign-up page). Anybody can ask for an account, but it is created as a Viewer that is
// NOT active: a Master Admin must switch it to Active in Master Akun before it can sign in.
route('POST', '/auth/register', function () {
    $body = read_json_body();
    $name = mb_substr(trim((string)($body['name'] ?? '')), 0, 255);
    $username = strtolower(trim((string)($body['username'] ?? '')));
    $password = (string)($body['password'] ?? '');
    $email = trim((string)($body['email'] ?? ''));
    $phone = trim((string)($body['phone'] ?? ''));

    if ($name === '' || $username === '' || $password === '') {
        send_error(400, 'Nama, username, dan kata sandi wajib diisi');
    }
    if (!preg_match('/^[a-z0-9._-]{3,50}$/', $username)) {
        send_error(400, 'Username 3-50 karakter: huruf kecil, angka, titik, strip, atau garis bawah');
    }
    if (strlen($password) < 6) {
        send_error(400, 'Kata sandi minimal 6 karakter');
    }
    if ($email !== '' && (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 255)) {
        send_error(400, 'Format alamat email tidak valid');
    }
    if ($phone !== '' && !preg_match('/^[0-9+()\-\s]{6,25}$/', $phone)) {
        send_error(400, 'Nomor telepon hanya boleh berisi angka, spasi, +, -, dan tanda kurung (6-25 karakter)');
    }

    // Keep a flood of requests from filling Master Akun with pending accounts.
    $recent = query_one("SELECT COUNT(*) AS n FROM accounts WHERE status = 'Inactive' AND role = 'Viewer' AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)");
    if ($recent && (int)$recent['n'] >= 20) {
        send_error(429, 'Terlalu banyak pendaftaran baru. Coba lagi nanti atau hubungi Master Admin.');
    }

    try {
        execute(
            'INSERT INTO accounts (username, name, email, phone, password, role, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [$username, $name, $email !== '' ? $email : null, $phone !== '' ? $phone : null, password_hash($password, PASSWORD_DEFAULT), 'Viewer', 'Inactive']
        );
    } catch (PDOException $e) {
        if (is_duplicate_error($e)) send_error(409, 'Username sudah dipakai');
        throw $e;
    }
    send_json(201, ['ok' => true, 'status' => 'Inactive']);
});
