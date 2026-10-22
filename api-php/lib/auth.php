<?php
// api-php/lib/auth.php

function get_request_session_id(): string {
    return trim($_SERVER['HTTP_X_KOI_SESSION'] ?? '');
}

function create_account_session(array $account, bool $rememberDevice): string {
    $sessionId = bin2hex(random_bytes(16));
    $days = $rememberDevice ? 7 : 1;
    $expiresAt = date('Y-m-d H:i:s', time() + $days * 86400);

    execute(
        'INSERT INTO account_sessions (id, account_id, username, name, role, remember_device, ip_address, user_agent, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
            $sessionId,
            $account['id'],
            $account['username'],
            $account['name'],
            $account['role'],
            $rememberDevice ? 1 : 0,
            $_SERVER['REMOTE_ADDR'] ?? null,
            $_SERVER['HTTP_USER_AGENT'] ?? null,
            $expiresAt,
        ]
    );

    return $sessionId;
}

function touch_account_session(string $sessionId): void {
    if ($sessionId === '') return;
    execute(
        "UPDATE account_sessions SET last_seen_at = NOW() WHERE id = ? AND status = 'active'",
        [$sessionId]
    );
}

// $touch = false lets background polling read data without counting as user activity.
function require_account(bool $touch = true): array {
    $sessionId = get_request_session_id();
    if ($sessionId === '') {
        send_error(401, 'Sesi tidak ditemukan');
    }

    $session = query_one(
        "SELECT account_sessions.*, accounts.role AS account_role
         FROM account_sessions
         LEFT JOIN accounts ON accounts.id = account_sessions.account_id
         WHERE account_sessions.id = ?
           AND account_sessions.status = 'active'
           AND (account_sessions.expires_at IS NULL OR account_sessions.expires_at > NOW())",
        [$sessionId]
    );

    if (!$session) {
        send_error(401, 'Sesi tidak valid atau kedaluwarsa');
    }

    if ($touch) touch_account_session($sessionId);
    return $session;
}

// Role of the current session, or null when nobody valid is logged in. Never sends an error.
function current_session_role(): ?string {
    $sessionId = get_request_session_id();
    if ($sessionId === '') return null;
    $session = query_one(
        "SELECT COALESCE(accounts.role, account_sessions.role) AS role
         FROM account_sessions
         LEFT JOIN accounts ON accounts.id = account_sessions.account_id
         WHERE account_sessions.id = ?
           AND account_sessions.status = 'active'
           AND (account_sessions.expires_at IS NULL OR account_sessions.expires_at > NOW())",
        [$sessionId]
    );
    return $session['role'] ?? null;
}

// Feedback notifications are for Master Admin only; everyone else must never see or change them.
function notifications_hide_feedback(): bool {
    return current_session_role() !== 'Master Admin';
}

// Role levels, same as the original Node server (api/src/server.js isWriteRequestAllowed).
// Viewer (and any unknown role) is level 0: it can read, but never change data.
function role_level(?string $role): int {
    $levels = ['Operator' => 1, 'Admin' => 2, 'Master Admin' => 3];
    return $levels[$role ?? ''] ?? 0;
}

// Minimum level needed to change data at $path. 0 = any logged-in account.
function required_write_level(string $path): int {
    foreach (['/feedback', '/messages', '/posts'] as $prefix) {
        if (str_starts_with($path, $prefix)) return 0;
    }
    foreach (['/app-settings', '/accounts', '/account-sessions', '/login-history', '/maintenance', '/jobs', '/notifications'] as $prefix) {
        if (str_starts_with($path, $prefix)) return 3;
    }
    foreach (['/ponds', '/breeding', '/farm-reports', '/drafts', '/sell', '/invoices', '/inventory'] as $prefix) {
        if (str_starts_with($path, $prefix)) return 1;
    }
    return 2; // koi, koi-images, gallery, images, videos and anything else
}

// Checked by index.php before any handler runs. The role comes from the session stored on the
// server, never from a header the browser sends, so hiding a button is not the only protection.
function enforce_role_access(string $method, string $path): void {
    if ($method === 'OPTIONS') return;
    if (in_array($path, ['/auth/login', '/auth/logout', '/auth/touch', '/auth/register'], true)) return;

    // POST /koi/page and /koi/batch only read (they take their filters/ids in the body)
    $isRead = $method === 'GET' || ($method === 'POST' && in_array($path, ['/koi/page', '/koi/batch'], true));
    $masterOnlyRead = in_array($path, ['/account-sessions', '/dashboard/account-sessions', '/login-history'], true);
    // Reads need a valid session too, except what the sign-in page and the file URLs need.
    // /app-settings returns only the brand name/icon when nobody is logged in (see its handler).
    // Uploaded files stay reachable by their long random URL, because <img> tags cannot send the session header.
    $publicRead = in_array($path, ['/health', '/ready', '/status', '/app-settings', '/manifest', '/favicon'], true) || str_starts_with($path, '/uploads/') || str_starts_with($path, '/uploads-v/') || str_starts_with($path, '/uploads-f/') || str_starts_with($path, '/thumb/');
    if ($isRead && !$masterOnlyRead && $publicRead) return;

    $role = current_session_role();
    if ($role === null) send_error(401, 'Sesi tidak valid atau kedaluwarsa');

    if ($masterOnlyRead) {
        if (role_level($role) < 3) send_error(403, 'Hanya Master Admin yang boleh melihat sesi dan riwayat login.');
        return;
    }
    if ($isRead) return; // any valid session may read
    // Everybody may save the Theme Settings of their own account (Viewer included).
    if ($path === '/my-theme') return;

    // Everyone may edit their own profile (My Account). The handler limits which fields change.
    if ($method === 'PATCH' && preg_match('#^/accounts/(\d+)$#', $path, $m)) {
        $own = query_one(
            "SELECT account_id FROM account_sessions WHERE id = ? AND status = 'active'",
            [get_request_session_id()]
        );
        if ($own && (string)$own['account_id'] === $m[1]) return;
    }

    $needed = required_write_level($path);
    // Pond area order (Data Kolam) is farm work, not program identity: Operator and up may save it.
    if ($method === 'PATCH' && $path === '/app-settings') {
        $keys = array_keys(read_json_body());
        if ($keys && !array_diff($keys, ['pond_area_order', 'pond_areas'])) $needed = 1;
    }
    if (role_level($role) < $needed) {
        $label = [1 => 'Operator', 2 => 'Admin', 3 => 'Master Admin'][$needed];
        send_error(403, "Akun $role tidak punya izin untuk mengubah data ini (minimal $label).");
    }
}

function sanitize_account(array $account): array {
    unset($account['password']);
    return $account;
}
