<?php
// api-php/index.php

// PHP defaults to UTC (date.timezone unset in php.ini) but this MySQL server
// runs on the machine's local clock (Windows system tz, WIB/UTC+7) — without
// this, expires_at (written via PHP date()) and NOW() (MySQL) disagree by
// the UTC offset, causing account_sessions to expire hours earlier than
// intended (see require_account()'s "Sesi tidak valid atau kedaluwarsa").
date_default_timezone_set('Asia/Jakarta');

require_once __DIR__ . '/lib/db.php';
require_once __DIR__ . '/lib/response.php';

require_once __DIR__ . '/lib/security.php';

send_security_headers();
send_cors_headers();

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Optional access log. When NISHIKIGOI_ACCESS_LOG holds a file path (the Termux start.sh sets it), every API call
// appends one line when the request ends: time, status, method, path, visitor IP and device. The IP comes from the
// proxy header when the request arrives through a proxy or tunnel. The query string is never written.
$accessLogFile = getenv('NISHIKIGOI_ACCESS_LOG');
if ($accessLogFile && ($_SERVER['REQUEST_METHOD'] ?? '') !== 'OPTIONS') {
    register_shutdown_function(function () use ($accessLogFile) {
        $ip = trim(explode(',', (string)($_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? '-'))[0]);
        $ua = (string)($_SERVER['HTTP_USER_AGENT'] ?? '');
        $device = '-';
        foreach (['Android' => 'Android', 'iPhone' => 'iOS', 'iPad' => 'iOS', 'Windows' => 'Windows', 'Macintosh' => 'Mac', 'Linux' => 'Linux'] as $needle => $label) {
            if (stripos($ua, $needle) !== false) { $device = $label; break; }
        }
        $path = (string)parse_url((string)($_SERVER['REQUEST_URI'] ?? ''), PHP_URL_PATH);
        $line = date('H:i:s') . '  ' . http_response_code() . '  ' . ($_SERVER['REQUEST_METHOD'] ?? '-') . ' ' . $path . '  ' . $ip . '  ' . $device . "
";
        // keep the file small: start over once it passes 1 MB
        if (is_file($accessLogFile) && @filesize($accessLogFile) > 1048576) {
            @file_put_contents($accessLogFile, '');
        }
        @file_put_contents($accessLogFile, $line, FILE_APPEND | LOCK_EX);
    });
}

rate_limit_request();

// Slow request log: one line for every API call slower than 'slow_request_ms' (default 1000), in storage/logs/slow-<date>.log
// (outside the web root), to see which calls need work before users complain.
$requestStartedAt = microtime(true);
register_shutdown_function(function () use ($requestStartedAt) {
    $config = require __DIR__ . '/config.php';
    $limit = (int)($config['slow_request_ms'] ?? 1000);
    $ms = (microtime(true) - $requestStartedAt) * 1000;
    if ($limit <= 0 || $ms < $limit) return;
    $dir = (string)($config['logs_dir'] ?? (dirname(__DIR__) . '/storage/logs'));
    if (!is_dir($dir)) @mkdir($dir, 0775, true);
    $line = date('H:i:s') . '  ' . round($ms) . ' ms  ' . http_response_code() . '  ' . ($_SERVER['REQUEST_METHOD'] ?? '-') . ' '
        . (string)parse_url((string)($_SERVER['REQUEST_URI'] ?? ''), PHP_URL_PATH) . '  peak ' . round(memory_get_peak_usage(true) / 1048576, 1) . " MB\n";
    @file_put_contents($dir . '/slow-' . date('Ymd') . '.log', $line, FILE_APPEND | LOCK_EX);
});

$method = $_SERVER['REQUEST_METHOD'];
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
// Strip the /api prefix added by the rewrite rule so handlers match
// the exact same paths as the old server.js routes (e.g. "/koi").
$path = preg_replace('#^/api#', '', $path);
if ($path === '/favicon.ico') $path = '/favicon'; // the browser's own /favicon.ico request (Apache rewrite)
if ($path === '' ) $path = '/';

$exactRoutes = [];   // "METHOD /path" => callable
$patternRoutes = []; // ["method" => METHOD, "regex" => "#^...$#", "handler" => callable]

function route(string $method, string $path, callable $handler): void {
    global $exactRoutes;
    $exactRoutes["$method $path"] = $handler;
}

function route_pattern(string $method, string $regex, callable $handler): void {
    global $patternRoutes;
    $patternRoutes[] = ['method' => $method, 'regex' => $regex, 'handler' => $handler];
}

foreach (glob(__DIR__ . '/handlers/*.php') as $handlerFile) {
    require_once $handlerFile;
}

require_once __DIR__ . '/lib/auth.php';
enforce_role_access($method, $path);

// Any write (add, edit, delete, restore...) that succeeds drops the cached Dashboard answers, so the figures never lag behind the data.
if ($method !== 'GET' && $method !== 'HEAD' && $method !== 'OPTIONS') {
    register_shutdown_function(function () {
        if (http_response_code() < 400) cache_bump('dashboard');
    });
}

$key = "$method $path";
if (isset($exactRoutes[$key])) {
    try {
        $exactRoutes[$key]();
    } catch (Throwable $e) {
        error_log('[nishikigoi-api] ' . $e->getMessage());
        send_error(500, 'Terjadi kesalahan pada server.');
    }
    exit;
}

foreach ($patternRoutes as $route) {
    if ($route['method'] !== $method) continue;
    if (preg_match($route['regex'], $path, $matches)) {
        try {
            $route['handler']($matches);
        } catch (Throwable $e) {
            error_log('[nishikigoi-api] ' . $e->getMessage());
            send_error(500, 'Terjadi kesalahan pada server.');
        }
        exit;
    }
}

send_error(404, 'Not found');
