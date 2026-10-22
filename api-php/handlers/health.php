<?php
// api-php/handlers/health.php
require_once __DIR__ . '/../lib/cache.php';
require_once __DIR__ . '/../lib/storage.php';

route('GET', '/health', function () {
    send_json(200, ['ok' => true]);
});

// For a load balancer / monitor: 200 when this server can reach its database, 503 otherwise. No details, public.
route('GET', '/ready', function () {
    try {
        db()->query('SELECT 1')->fetchColumn();
        send_json(200, ['ready' => true]);
    } catch (Throwable $e) {
        send_json(503, ['ready' => false]);
    }
});

function health_timed(callable $fn): array {
    $start = microtime(true);
    try {
        $result = $fn();
        return ['ok' => true, 'ms' => round((microtime(true) - $start) * 1000, 1)] + (is_array($result) ? $result : []);
    } catch (Throwable $e) {
        return ['ok' => false, 'ms' => round((microtime(true) - $start) * 1000, 1), 'error' => mb_substr($e->getMessage(), 0, 200)];
    }
}

// What an operator wants to see at a glance (Master Admin): is everything reachable, how fast, how full, how big the tables are.
route('GET', '/health/detail', function () {
    if (role_level(current_session_role()) < 3) send_error(403, 'Hanya Master Admin yang boleh melihat kesehatan sistem.');
    $config = require __DIR__ . '/../config.php';

    $database = health_timed(function () use ($config) {
        $status = [];
        foreach (query("SHOW STATUS WHERE Variable_name IN ('Threads_connected', 'Uptime', 'Slow_queries')") as $row) $status[$row['Variable_name']] = (int)$row['Value'];
        $max = (int)(query_one("SHOW VARIABLES LIKE 'max_connections'")['Value'] ?? 0);
        $version = (string)(query_one('SELECT VERSION() AS v')['v'] ?? '');
        return [
            'version' => $version,
            'connections' => ($status['Threads_connected'] ?? 0) . ' dari ' . $max,
            'uptime_hours' => round(($status['Uptime'] ?? 0) / 3600, 1),
            'slow_queries_total' => $status['Slow_queries'] ?? 0,
            'persistent' => PHP_SAPI === 'cli-server' || !empty($config['db_persistent']),
        ];
    });
    $replica = ['configured' => !empty($config['db_read_host'])];
    if ($replica['configured']) {
        $replica += health_timed(function () {
            $lag = query_one('SHOW REPLICA STATUS');
            $lag = $lag ?: query_one('SHOW SLAVE STATUS');
            return ['lag_seconds' => $lag ? ($lag['Seconds_Behind_Source'] ?? $lag['Seconds_Behind_Master'] ?? null) : null];
        });
    }

    $cache = health_timed(function () {
        $key = 'health-ping';
        cache_set($key, 'pong', 5);
        if (cache_get($key) !== 'pong') throw new RuntimeException('cache tidak menjawab');
        return ['driver' => cache_driver()];
    });

    $storage = health_timed(function () {
        // a file name that cannot exist: asking for it proves the storage answers without touching anything
        storage_exists('_health/none.jpg');
        return ['driver' => storage_driver(), 'public_base' => storage_public_url('x.jpg') !== null];
    });

    $disk = [];
    foreach (['uploads' => (string)($config['uploads_dir'] ?? ''), 'backups' => (string)($config['backups_dir'] ?? '')] as $label => $dir) {
        $probe = $dir !== '' && is_dir($dir) ? $dir : dirname($dir);
        $free = is_dir($probe) ? @disk_free_space($probe) : false;
        $total = is_dir($probe) ? @disk_total_space($probe) : false;
        if ($free !== false && $total) $disk[$label] = ['free_mb' => (int)round($free / 1048576), 'used_percent' => (int)round(100 * (1 - $free / $total))];
    }

    $queue = query_one("SELECT SUM(status = 'queued') AS queued, SUM(status = 'running') AS running,
                               SUM(status = 'failed' AND created_at > NOW() - INTERVAL 1 DAY) AS failed_24h FROM system_jobs");

    $tables = array_map(fn($row) => ['table' => $row['TABLE_NAME'], 'rows' => (int)$row['TABLE_ROWS'], 'size_mb' => round(((int)$row['DATA_LENGTH'] + (int)$row['INDEX_LENGTH']) / 1048576, 2)],
        query('SELECT TABLE_NAME, TABLE_ROWS, DATA_LENGTH, INDEX_LENGTH FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY (DATA_LENGTH + INDEX_LENGTH) DESC LIMIT 8'));

    $slowToday = 0;
    $slowFile = rtrim((string)($config['logs_dir'] ?? (dirname(__DIR__, 2) . '/storage/logs')), '/\\') . '/slow-' . date('Ymd') . '.log';
    if (is_file($slowFile)) $slowToday = count(file($slowFile, FILE_SKIP_EMPTY_LINES));

    send_json(200, [
        'ok' => $database['ok'] && $cache['ok'] && $storage['ok'],
        'time' => date('c'),
        'php' => [
            'version' => PHP_VERSION,
            'sapi' => PHP_SAPI,
            'memory_limit' => ini_get('memory_limit'),
            'opcache' => function_exists('opcache_get_status') && (bool)@ini_get('opcache.enable'),
            'gd' => function_exists('imagecreatefromstring'),
        ],
        'database' => $database,
        'read_replica' => $replica,
        'cache' => $cache,
        'storage' => $storage,
        'disk' => $disk,
        'queue' => ['queued' => (int)$queue['queued'], 'running' => (int)$queue['running'], 'failed_24h' => (int)$queue['failed_24h']],
        'biggest_tables' => $tables,
        'slow_requests_today' => $slowToday,
    ]);
});
