<?php
// api-php/lib/security.php
// Basic hardening: security headers, per-IP request limit, login lockout and login history.

const LOGIN_MAX_FAILS_PER_ACCOUNT = 5;   // wrong passwords for one username from one IP
const LOGIN_MAX_FAILS_PER_IP = 20;       // wrong passwords from one IP, any username
const LOGIN_LOCK_MINUTES = 15;
const API_MAX_REQUESTS_PER_MINUTE = 900; // per IP, all API calls (the app itself polls often)

// True when $ip is one of $list: exact addresses or CIDR ranges (10.0.0.0/8, fd00::/8).
function ip_in_list(string $ip, array $list): bool {
    $packed = @inet_pton($ip);
    if ($packed === false) return false;
    foreach ($list as $entry) {
        $entry = trim((string)$entry);
        if ($entry === '') continue;
        [$net, $bits] = array_pad(explode('/', $entry, 2), 2, null);
        $netPacked = @inet_pton($net);
        if ($netPacked === false || strlen($netPacked) !== strlen($packed)) continue;
        $bits = $bits === null ? strlen($packed) * 8 : (int)$bits;
        $bytes = intdiv($bits, 8);
        if ($bytes > 0 && substr($packed, 0, $bytes) !== substr($netPacked, 0, $bytes)) continue;
        $rest = $bits % 8;
        if ($rest > 0) {
            $mask = (0xFF << (8 - $rest)) & 0xFF;
            if ((ord($packed[$bytes]) & $mask) !== (ord($netPacked[$bytes]) & $mask)) continue;
        }
        return true;
    }
    return false;
}

function client_ip(): string {
    $remote = substr((string)($_SERVER['REMOTE_ADDR'] ?? 'unknown'), 0, 45);
    // X-Forwarded-For can be forged by the caller, so it is only read when the request really comes from a proxy of ours
    // ('trusted_proxies' in config.local.php: the load balancer / tunnel addresses). Then the visitor is the last address in the
    // chain that is not itself one of our proxies.
    $config = require __DIR__ . '/../config.php';
    $trusted = (array)($config['trusted_proxies'] ?? []);
    if ($trusted && ip_in_list($remote, $trusted)) {
        $chain = array_map('trim', explode(',', (string)($_SERVER['HTTP_X_FORWARDED_FOR'] ?? '')));
        for ($i = count($chain) - 1; $i >= 0; $i--) {
            if (!filter_var($chain[$i], FILTER_VALIDATE_IP)) break;
            if (!ip_in_list($chain[$i], $trusted)) return substr($chain[$i], 0, 45);
        }
    }
    return $remote;
}

function send_security_headers(): void {
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: SAMEORIGIN');
    header('Referrer-Policy: same-origin');
    header("Content-Security-Policy: frame-ancestors 'self'; object-src 'none'; base-uri 'self'");
    header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
    header('Cache-Control: no-store');
}

// Same-origin only. The app and its API are served from one origin, so no wildcard CORS.
function send_cors_headers(): void {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin === '') return;
    $host = $_SERVER['HTTP_HOST'] ?? '';
    $originHost = parse_url($origin, PHP_URL_HOST);
    $originPort = parse_url($origin, PHP_URL_PORT);
    $originAuthority = $originHost . ($originPort ? ':' . $originPort : '');
    if ($host !== '' && strcasecmp($originAuthority, $host) === 0) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
        header('Access-Control-Allow-Methods: GET, POST, PATCH, PUT, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, X-Koi-Session');
    }
}

function rate_limit_request(): void {
    $ip = client_ip();
    $window = (int)floor(time() / 60);
    // A shared counter (Redis / APCu) costs no database work per request; without one the database counts.
    $hits = cache_incr('ratelimit:' . $ip . ':' . $window, 120);
    if ($hits === null) {
        execute(
            'INSERT INTO api_rate_limits (ip, window_start, hits) VALUES (?, ?, 1)
             ON DUPLICATE KEY UPDATE hits = hits + 1',
            [$ip, $window]
        );
        $row = query_one('SELECT hits FROM api_rate_limits WHERE ip = ? AND window_start = ?', [$ip, $window]);
        $hits = $row ? (int)$row['hits'] : 0;
    }
    if ($hits > API_MAX_REQUESTS_PER_MINUTE) {
        header('Retry-After: 60');
        send_error(429, 'Terlalu banyak permintaan. Coba lagi sebentar.');
    }
    // Cheap housekeeping, about once in a hundred requests.
    if (random_int(1, 100) === 1) {
        execute('DELETE FROM api_rate_limits WHERE window_start < ?', [$window - 5]);
        execute('DELETE FROM login_attempts WHERE created_at < DATE_SUB(NOW(), INTERVAL 90 DAY)');
    }
}

function record_login_attempt(string $username, bool $success): void {
    execute(
        'INSERT INTO login_attempts (username, ip_address, success, user_agent) VALUES (?, ?, ?, ?)',
        [substr($username, 0, 100), client_ip(), $success ? 1 : 0, substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255)]
    );
}

// Usernames (lower case) that are locked out right now from at least one device.
function login_locked_usernames(): array {
    $rows = query(
        'SELECT LOWER(username) AS username FROM login_attempts
         WHERE success = 0 AND created_at > DATE_SUB(NOW(), INTERVAL ' . LOGIN_LOCK_MINUTES . ' MINUTE)
         GROUP BY ip_address, LOWER(username) HAVING COUNT(*) >= ' . LOGIN_MAX_FAILS_PER_ACCOUNT
    );
    return array_values(array_unique(array_column($rows, 'username')));
}

function login_unlock_username(string $username): void {
    execute(
        'DELETE FROM login_attempts WHERE success = 0 AND LOWER(username) = ? AND created_at > DATE_SUB(NOW(), INTERVAL ' . LOGIN_LOCK_MINUTES . ' MINUTE)',
        [strtolower($username)]
    );
}

function enforce_login_lockout(string $username): void {
    $ip = client_ip();
    $window = 'created_at > DATE_SUB(NOW(), INTERVAL ' . LOGIN_LOCK_MINUTES . ' MINUTE) AND success = 0';
    $pair = query_one("SELECT COUNT(*) AS n FROM login_attempts WHERE ip_address = ? AND username = ? AND $window", [$ip, substr($username, 0, 100)]);
    $byIp = query_one("SELECT COUNT(*) AS n FROM login_attempts WHERE ip_address = ? AND $window", [$ip]);
    if ((int)($pair['n'] ?? 0) >= LOGIN_MAX_FAILS_PER_ACCOUNT || (int)($byIp['n'] ?? 0) >= LOGIN_MAX_FAILS_PER_IP) {
        header('Retry-After: ' . (LOGIN_LOCK_MINUTES * 60));
        send_error(429, 'Terlalu banyak percobaan login yang gagal. Coba lagi dalam ' . LOGIN_LOCK_MINUTES . ' menit.');
    }
}
