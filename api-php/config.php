<?php
// api-php/config.php
$config = [
    'db_host' => '127.0.0.1',
    'db_port' => 3306,
    'db_name' => 'nishikigoi_koi',
    'db_user' => 'root',
    'db_pass' => '',
    'uploads_dir' => __DIR__ . '/uploads',
    // Where photos/videos live: 'local' (the uploads folder, default) or 's3' (any S3-compatible bucket).
    // The s3_* settings (endpoint, bucket, region, key, secret, public base) go in config.local.php, see lib/storage.php.
    'storage_driver' => 'local',
    // Kept OUTSIDE api-php/ (the Apache document root for this app) — .htaccess
    // only rewrites requests for files that don't exist on disk, so anything
    // inside api-php/ is served as a raw static file with no auth check.
    // Backups contain full table dumps (password hashes, live session ids), so
    // this directory must never be reachable by URL.
    'backups_dir' => dirname(__DIR__) . '/storage/backups',
];

// Database login lives in config.local.php (not in git), so the password never gets pushed.
if (is_file(__DIR__ . '/config.local.php')) {
    $config = array_replace($config, require __DIR__ . '/config.local.php');
}

// Environment variables win over both files, so one image can run on many servers without a config file inside it
// (docker-compose.yml in deploy/ sets them). Names: KOI_<SETTING IN CAPITALS>, for example KOI_DB_HOST, KOI_DB_NAME, KOI_DB_USER,
// KOI_DB_PASS, KOI_DB_PERSISTENT, KOI_DB_READ_HOST, KOI_CACHE_DRIVER, KOI_REDIS_HOST, KOI_STORAGE_DRIVER, KOI_S3_ENDPOINT,
// KOI_S3_BUCKET, KOI_S3_KEY, KOI_S3_SECRET, KOI_S3_PUBLIC_BASE, KOI_TRUSTED_PROXIES (comma separated), KOI_UPLOADS_DIR, KOI_BACKUPS_DIR.
foreach ([
    'db_host', 'db_port', 'db_name', 'db_user', 'db_pass', 'db_persistent',
    'db_read_host', 'db_read_port', 'db_read_user', 'db_read_pass',
    'cache_driver', 'redis_host', 'redis_port', 'redis_password', 'redis_db',
    'storage_driver', 's3_endpoint', 's3_bucket', 's3_region', 's3_key', 's3_secret', 's3_public_base', 's3_path_style',
    'backup_media', 'php_cli', 'trusted_proxies', 'uploads_dir', 'backups_dir', 'logs_dir', 'slow_request_ms',
] as $setting) {
    $value = getenv('KOI_' . strtoupper($setting));
    if ($value === false || $value === '') continue;
    if (in_array($setting, ['db_port', 'db_read_port', 'redis_port', 'redis_db', 'slow_request_ms'], true)) $value = (int)$value;
    elseif (in_array($setting, ['db_persistent', 'backup_media', 's3_path_style'], true)) $value = filter_var($value, FILTER_VALIDATE_BOOLEAN);
    elseif ($setting === 'trusted_proxies') $value = array_values(array_filter(array_map('trim', explode(',', $value))));
    $config[$setting] = $value;
}

return $config;
