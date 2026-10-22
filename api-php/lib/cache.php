<?php
// api-php/lib/cache.php
//
// A small cache that several servers can share. What goes in it is only ever something that can be recomputed (lists of filter
// values, "the database schema is up to date", the request counters of the rate limit), so losing it is harmless.
//
// Driver ('cache_driver' in config.local.php, or the KOI_CACHE_DRIVER variable):
//   'file'  - files in the temp folder of this server (default; fine for one server)
//   'apcu'  - shared memory of this server (PHP apcu extension)
//   'redis' - a Redis server shared by every server ('redis_host', 'redis_port', 'redis_password', 'redis_db')
//   'auto'  - apcu when the extension is there, otherwise file
// With several servers behind a load balancer use 'redis': 'file' and 'apcu' are per server, so a list cleared on one server
// would stay stale on the others for its lifetime (a couple of minutes).
//
// A failing Redis never breaks the program: the call answers "not cached" and the work is simply done again.

function cache_config(): array {
    static $cfg = null;
    static $signature = null;
    $override = json_encode($GLOBALS['koi_cache_override'] ?? []);
    if ($signature !== $override) {
        $signature = $override;
        $cfg = null;
    }
    if ($cfg === null) {
        $config = require __DIR__ . '/../config.php';
        $config = array_replace($config, $GLOBALS['koi_cache_override'] ?? []);
        $driver = (string)($config['cache_driver'] ?? 'auto');
        if ($driver === 'auto') $driver = function_exists('apcu_fetch') && filter_var(ini_get('apc.enabled'), FILTER_VALIDATE_BOOLEAN) && (PHP_SAPI !== 'cli' || filter_var(ini_get('apc.enable_cli'), FILTER_VALIDATE_BOOLEAN)) ? 'apcu' : 'file';
        $cfg = [
            'driver' => in_array($driver, ['file', 'apcu', 'redis'], true) ? $driver : 'file',
            'prefix' => 'koi:' . (string)($config['db_name'] ?? '') . ':',
            'redis_host' => (string)($config['redis_host'] ?? '127.0.0.1'),
            'redis_port' => (int)($config['redis_port'] ?? 6379),
            'redis_password' => (string)($config['redis_password'] ?? ''),
            'redis_db' => (int)($config['redis_db'] ?? 0),
        ];
    }
    return $cfg;
}

function cache_driver(): string {
    return cache_config()['driver'];
}

// ---- Redis (RESP over a socket; only the few commands needed) -------------------------------------------------------------

function cache_redis_command(array $args) {
    static $sockets = [];     // one open connection per server address
    static $failedAt = [];
    $cfg = cache_config();
    $address = $cfg['redis_host'] . ':' . $cfg['redis_port'] . '/' . $cfg['redis_db'];
    if (!isset($sockets[$address])) {
        if (isset($failedAt[$address]) && microtime(true) - $failedAt[$address] < 5) return null;   // do not hammer a Redis that is down
        $socket = @stream_socket_client('tcp://' . $cfg['redis_host'] . ':' . $cfg['redis_port'], $errno, $errstr, 0.3);
        if (!$socket) {
            $failedAt[$address] = microtime(true);
            return null;
        }
        stream_set_timeout($socket, 0, 400000);
        if ($cfg['redis_password'] !== '') cache_redis_send($socket, ['AUTH', $cfg['redis_password']]);
        if ($cfg['redis_db'] > 0) cache_redis_send($socket, ['SELECT', (string)$cfg['redis_db']]);
        $sockets[$address] = $socket;
    }
    $reply = cache_redis_send($sockets[$address], $args);
    if ($reply === false) {   // the connection broke: forget it, the next call connects again
        @fclose($sockets[$address]);
        unset($sockets[$address]);
        $failedAt[$address] = microtime(true);
        return null;
    }
    return $reply;
}

function cache_redis_send($socket, array $args) {
    $out = '*' . count($args) . "\r\n";
    foreach ($args as $arg) $out .= '$' . strlen((string)$arg) . "\r\n" . $arg . "\r\n";
    if (@fwrite($socket, $out) === false) return false;
    return cache_redis_read($socket);
}

function cache_redis_read($socket) {
    $line = fgets($socket);
    if ($line === false || $line === '') return false;
    $type = $line[0];
    $rest = rtrim(substr($line, 1), "\r\n");
    switch ($type) {
        case '+': return $rest;
        case '-': return null;   // an error reply (wrong password, ...): treated as "no answer"
        case ':': return (int)$rest;
        case '$':
            $length = (int)$rest;
            if ($length < 0) return null;
            $data = '';
            while (strlen($data) < $length + 2) {
                $chunk = fread($socket, $length + 2 - strlen($data));
                if ($chunk === false || $chunk === '') return false;
                $data .= $chunk;
            }
            return substr($data, 0, $length);
        case '*':
            $count = (int)$rest;
            $items = [];
            for ($i = 0; $i < $count; $i++) $items[] = cache_redis_read($socket);
            return $items;
    }
    return false;
}

// ---- files ----------------------------------------------------------------------------------------------------------------

function cache_file_dir(): string {
    $dir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'koi_cache_' . md5(cache_config()['prefix']);
    if (!is_dir($dir)) @mkdir($dir, 0775, true);
    return $dir;
}

function cache_file_path(string $key): string {
    return cache_file_dir() . DIRECTORY_SEPARATOR . md5($key) . '.cache';
}

// ---- the API --------------------------------------------------------------------------------------------------------------

// The cached value (anything json can hold), or null.
function cache_get(string $key) {
    $cfg = cache_config();
    $full = $cfg['prefix'] . $key;
    switch ($cfg['driver']) {
        case 'redis':
            $raw = cache_redis_command(['GET', $full]);
            return is_string($raw) ? json_decode($raw, true) : null;
        case 'apcu':
            $value = apcu_fetch($full, $ok);
            return $ok ? $value : null;
        default:
            $path = cache_file_path($full);
            if (!is_file($path)) return null;
            $raw = @file_get_contents($path);
            if ($raw === false) return null;
            $pos = strpos($raw, "\n");
            if ($pos === false || (int)substr($raw, 0, $pos) < time()) return null;
            return json_decode(substr($raw, $pos + 1), true);
    }
}

function cache_set(string $key, $value, int $ttl): void {
    $cfg = cache_config();
    $full = $cfg['prefix'] . $key;
    $ttl = max(1, $ttl);
    switch ($cfg['driver']) {
        case 'redis':
            cache_redis_command(['SET', $full, json_encode($value), 'EX', (string)$ttl]);
            return;
        case 'apcu':
            apcu_store($full, $value, $ttl);
            return;
        default:
            @file_put_contents(cache_file_path($full), (time() + $ttl) . "\n" . json_encode($value), LOCK_EX);
    }
}

function cache_delete(string $key): void {
    $cfg = cache_config();
    $full = $cfg['prefix'] . $key;
    switch ($cfg['driver']) {
        case 'redis': cache_redis_command(['DEL', $full]); return;
        case 'apcu': apcu_delete($full); return;
        default: @unlink(cache_file_path($full));
    }
}

// Adds 1 to a counter that expires $ttl seconds after it was first created, and returns the new value (the request counters of
// the rate limit). Returns null when the driver cannot count (the caller then counts another way).
function cache_incr(string $key, int $ttl): ?int {
    $cfg = cache_config();
    $full = $cfg['prefix'] . $key;
    switch ($cfg['driver']) {
        case 'redis':
            $count = cache_redis_command(['INCR', $full]);
            if (!is_int($count)) return null;
            if ($count === 1) cache_redis_command(['EXPIRE', $full, (string)$ttl]);
            return $count;
        case 'apcu':
            $count = apcu_inc($full, 1, $ok, $ttl);
            if ($ok === false) { apcu_store($full, 1, $ttl); return 1; }
            return (int)$count;
        default:
            return null;   // file: counting under concurrency needs the database
    }
}

// Invalidation without scanning keys: a value stored under cache_ns('facets') in its key is dropped for good by cache_bump('facets').
function cache_ns(string $name): int {
    $version = cache_get('ns:' . $name);
    return is_int($version) ? $version : 0;   // 0 until the first bump: a bump (INCR from nothing gives 1) must change it
}

function cache_bump(string $name): void {
    $cfg = cache_config();
    if ($cfg['driver'] === 'redis') {
        cache_redis_command(['INCR', $cfg['prefix'] . 'ns:' . $name]);
        return;
    }
    cache_set('ns:' . $name, cache_ns($name) + 1, 86400 * 30);
}
