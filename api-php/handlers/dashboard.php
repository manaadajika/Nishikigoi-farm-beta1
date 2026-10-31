<?php
// api-php/handlers/dashboard.php

route('GET', '/status', function () {
    $checks = [
        ['koi', 'Data Ikan'],
        ['ponds', 'Data Kolam'],
        ['breeding_batches', 'Breeding'],
        ['farm_reports', 'Laporan'],
        ['accounts', 'Akun'],
    ];
    $results = [];
    $allOk = true;

    foreach ($checks as [$table, $label]) {
        try {
            query("SELECT 1 FROM `$table` LIMIT 1");
            $results[] = ['table' => $table, 'label' => $label, 'ok' => true];
        } catch (PDOException $e) {
            error_log('[nishikigoi-api] status check ' . $table . ': ' . $e->getMessage());
            $results[] = ['table' => $table, 'label' => $label, 'ok' => false];
            $allOk = false;
        }
    }

    send_json(200, [
        'ok' => true,
        'status' => $allOk ? 'ok' : 'warning',
        'checks' => $results,
    ]);
});

// Identitas Program: name, subtitle (print head), owner (footer) and the logo slots. The sign-in page needs all of them
// before anyone is logged in; nothing else is shown to visitors.
const BRAND_PUBLIC_KEYS = [
    'brand_name', 'brand_icon', 'brand_logo_light', 'brand_logo_dark', 'brand_favicon',
    'brand_app_icon', 'brand_app_icon_192', 'brand_subtitle', 'brand_owner',
];
// Slots holding an image: a pasted data: URL is stored as a file (app_settings.value is TEXT, a 512 px PNG does not fit).
const BRAND_IMAGE_KEYS = ['brand_icon', 'brand_logo_light', 'brand_logo_dark', 'brand_favicon', 'brand_app_icon', 'brand_app_icon_192'];

route('GET', '/app-settings', function () {
    $rows = query('SELECT `key`, value FROM app_settings');
    $settings = [];
    foreach ($rows as $row) $settings[$row['key']] = $row['value'];
    if (current_session_role() === null) {
        $settings = array_intersect_key($settings, array_flip(BRAND_PUBLIC_KEYS));
    }
    send_json(200, $settings);
});

// Web app manifest ("Install" / "Add to home screen"). Built from the Identitas Program settings; it has to be
// readable without a session because the browser fetches it without the app's headers.
route('GET', '/manifest', function () {
    $rows = query("SELECT `key`, value FROM app_settings WHERE `key` LIKE 'brand\_%'");
    $s = [];
    foreach ($rows as $row) $s[$row['key']] = trim((string)$row['value']);
    $name = ($s['brand_name'] ?? '') !== '' ? $s['brand_name'] : 'Nishikigoi';
    $big = ($s['brand_app_icon'] ?? '') ?: ($s['brand_icon'] ?? '');
    $small = ($s['brand_app_icon_192'] ?? '') ?: $big;
    $type = function (string $url): string {
        $ext = strtolower(pathinfo(parse_url($url, PHP_URL_PATH) ?: '', PATHINFO_EXTENSION));
        return ['webp' => 'image/webp', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg'][$ext] ?? 'image/png';
    };
    $icons = [];
    if ($small !== '' && !str_starts_with($small, 'data:')) $icons[] = ['src' => $small, 'sizes' => '192x192', 'type' => $type($small), 'purpose' => 'any'];
    if ($big !== '' && !str_starts_with($big, 'data:')) {
        $icons[] = ['src' => $big, 'sizes' => '512x512', 'type' => $type($big), 'purpose' => 'any'];
        $icons[] = ['src' => $big, 'sizes' => '512x512', 'type' => $type($big), 'purpose' => 'maskable'];
    }
    $manifest = [
        'name' => $name,
        'short_name' => mb_substr($name, 0, 12),
        'description' => ($s['brand_subtitle'] ?? '') !== '' ? $s['brand_subtitle'] : 'Manajemen koi farm',
        'start_url' => '/farm.html',
        'scope' => '/',
        'display' => 'standalone',
        'background_color' => '#0f172a',
        'theme_color' => '#0f172a',
        'icons' => $icons,
    ];
    http_response_code(200);
    header('Content-Type: application/manifest+json; charset=utf-8');
    header('Cache-Control: no-cache');
    echo json_encode($manifest, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
});

// /favicon.ico for every address the browser asks it from. A raw image opened in its own tab (right click, "Open image
// in new tab") has no <link rel="icon">, so the browser asks the server root for /favicon.ico; this returns the program's
// Favicon slot (or its Icon Program), the same icon the pages themselves show. Apache (.htaccess) and the Termux router
// send /favicon.ico here. Public: the browser asks without the app's session header.
route('GET', '/favicon', function () {
    $rows = query("SELECT `key`, value FROM app_settings WHERE `key` IN ('brand_favicon', 'brand_icon')");
    $s = [];
    foreach ($rows as $row) $s[$row['key']] = trim((string)$row['value']);
    $url = ($s['brand_favicon'] ?? '') ?: ($s['brand_icon'] ?? '');
    $file = null;   // path of the icon in the storage
    $bytes = null;
    if ($url !== '' && preg_match('#^/api/uploads/([A-Za-z0-9._/-]+)$#', $url, $m) && storage_safe_path($m[1])) {
        $bytes = storage_get($m[1]);
        if ($bytes !== null) $file = $m[1];
    }
    if ($file === null) {
        // nothing configured in Identitas Program: a neutral globe, like the browser's own default. It must be a real
        // image: a 404 would leave the icon the browser remembered from before showing up on every refresh.
        $globe = base64_decode('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');
        $etag = '"default-globe-1"';
        header('ETag: ' . $etag);
        header('Cache-Control: no-cache');
        if (($_SERVER['HTTP_IF_NONE_MATCH'] ?? '') === $etag) {
            http_response_code(304);
            exit;
        }
        http_response_code(200);
        header('Content-Type: image/png');
        header('Content-Length: ' . strlen($globe));
        echo $globe;
        exit;
    }
    $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
    $type = ['ico' => 'image/x-icon', 'png' => 'image/png', 'webp' => 'image/webp', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'svg' => 'image/svg+xml'][$ext] ?? 'image/png';
    // cheap to ask again on every page: the browser sends the ETag back and gets a 304 until the icon changes
    $etag = '"' . md5($file . '|' . strlen($bytes) . '|' . md5($bytes)) . '"';
    header('ETag: ' . $etag);
    header('Cache-Control: no-cache');
    if (($_SERVER['HTTP_IF_NONE_MATCH'] ?? '') === $etag) {
        http_response_code(304);
        exit;
    }
    http_response_code(200);
    header('Content-Type: ' . $type);
    header('Content-Length: ' . strlen($bytes));
    echo $bytes;
    exit;
});

route('PATCH', '/app-settings', function () {
    require_account();
    $body = read_json_body();
    require_once __DIR__ . '/../lib/uploads.php';
    $replacedFiles = [];
    foreach ($body as $key => $value) {
        if (in_array($key, BRAND_IMAGE_KEYS, true) && is_string($value) && str_starts_with($value, 'data:image/')) {
            try {
                $value = save_image_data($value, 'app-brand-icon');
            } catch (InvalidArgumentException $e) {
                send_error(422, 'Gambar tidak valid', $e->getMessage());
            }
            $body[$key] = $value;
        }
        if (in_array($key, BRAND_IMAGE_KEYS, true)) {
            $old = query_one('SELECT value FROM app_settings WHERE `key` = ?', [$key]);
            if ($old && str_starts_with((string)$old['value'], '/api/uploads/') && $old['value'] !== $value) $replacedFiles[] = $old['value'];
        }
        execute(
            'INSERT INTO app_settings (`key`, value) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE value = VALUES(value)',
            [$key, is_scalar($value) ? (string)$value : json_encode($value)]
        );
    }
    // an image that was replaced or removed leaves no orphan file behind (unless something else still uses it)
    if ($replacedFiles) delete_upload_files_if_unused($replacedFiles);
    // Ternakan of the fish that belong to a breeding session is the program name
    if (array_key_exists('brand_name', $body)) {
        koi_sync_session_links(db());
        koi_facets_cache_clear();
    }
    $rows = query('SELECT `key`, value FROM app_settings');
    $settings = [];
    foreach ($rows as $row) $settings[$row['key']] = $row['value'];
    send_json(200, ['ok' => true, 'settings' => $settings]);
});

// Theme Settings of the signed-in account (colour mode, colour scheme, font, base, radius). Kept per account in
// app_settings under "user_theme:<username>" so it follows the account to every browser and is part of the backup.
const THEME_KEYS = ['theme', 'theme-base', 'theme-font', 'theme-primary', 'theme-radius'];

route('GET', '/my-theme', function () {
    $session = require_account();
    $row = query_one('SELECT value FROM app_settings WHERE `key` = ?', ['user_theme:' . (string)($session['username'] ?? '')]);
    $theme = $row ? json_decode((string)$row['value'], true) : null;
    send_json(200, ['theme' => is_array($theme) ? $theme : null]);
});

route('PUT', '/my-theme', function () {
    $session = require_account();
    $body = read_json_body();
    $incoming = is_array($body['theme'] ?? null) ? $body['theme'] : [];
    $clean = [];
    foreach (THEME_KEYS as $key) {
        $value = $incoming[$key] ?? null;
        if (is_string($value) && preg_match('/^[a-z0-9_-]{1,32}$/i', $value)) $clean[$key] = $value;
    }
    execute(
        'INSERT INTO app_settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
        ['user_theme:' . (string)($session['username'] ?? ''), json_encode($clean)]
    );
    send_json(200, ['ok' => true, 'theme' => $clean]);
});

// "Pengaturan Cetak" (paper, orientation, margin, header...) is remembered per kind of print and shared by every account and
// device: one JSON map in app_settings under "print_settings" (part of the backup).
const PRINT_PAPERS = ['a4', 'f4', 'letter', 'legal', 'a5', 'custom'];

function print_settings_map(): array {
    $row = query_one("SELECT value FROM app_settings WHERE `key` = 'print_settings'");
    $map = $row ? json_decode((string)$row['value'], true) : null;
    return is_array($map) ? $map : [];
}

route('GET', '/print-settings', function () {
    require_account(false);
    send_json(200, ['settings' => print_settings_map()]);
});

route('PUT', '/print-settings', function () {
    require_account();
    $body = read_json_body();
    $key = (string)($body['key'] ?? '');
    $in = is_array($body['settings'] ?? null) ? $body['settings'] : [];
    if (!preg_match('/^[a-z0-9_.:-]{1,64}$/i', $key)) send_error(422, 'Kunci pengaturan cetak tidak valid');
    $clean = [
        'paper' => in_array($in['paper'] ?? '', PRINT_PAPERS, true) ? $in['paper'] : 'a4',
        'width' => max(0, min(300, (float)($in['width'] ?? 0))),
        'height' => max(0, min(300, (float)($in['height'] ?? 0))),
        'orientation' => ($in['orientation'] ?? '') === 'landscape' ? 'landscape' : 'portrait',
        'margin' => in_array($in['margin'] ?? '', ['normal', 'narrow', 'none', 'custom'], true) ? $in['margin'] : 'normal',
        'marginTop' => max(0, min(10, (float)($in['marginTop'] ?? 1))),
        'marginRight' => max(0, min(10, (float)($in['marginRight'] ?? 1))),
        'marginBottom' => max(0, min(10, (float)($in['marginBottom'] ?? 1))),
        'marginLeft' => max(0, min(10, (float)($in['marginLeft'] ?? 1))),
        'header' => ($in['header'] ?? true) !== false,
    ];
    $map = print_settings_map();
    $map[$key] = $clean;
    if (count($map) > 100) $map = array_slice($map, -100, null, true);
    execute(
        "INSERT INTO app_settings (`key`, value) VALUES ('print_settings', ?) ON DUPLICATE KEY UPDATE value = VALUES(value)",
        [json_encode($map)]
    );
    send_json(200, ['ok' => true, 'settings' => $map]);
});

route('GET', '/summary', function () {
    dashboard_cache_serve('summary');
    breeding_auto_reset_year();
    $ponds = query_one('SELECT COUNT(*) AS total FROM ponds');
    $koi = query_one('SELECT COUNT(*) AS total FROM koi WHERE archived_at IS NULL');
    $quarantine = query_one("SELECT COUNT(*) AS total FROM koi WHERE status = 'quarantine' AND archived_at IS NULL");
    // Dashboard breakdown. Archived fish are never counted. "Indukan" is parent_type 'indukan'; everything else is regular.
    $groups = query_one(
        "SELECT
            COALESCE(SUM(parent_type = 'indukan' AND status = 'active'), 0) AS breeders_active,
            COALESCE(SUM(parent_type = 'indukan' AND status = 'dead'), 0) AS breeders_dead,
            COALESCE(SUM(parent_type = 'indukan' AND status = 'active' AND gender = 'male'), 0) AS breeders_active_male,
            COALESCE(SUM(parent_type = 'indukan' AND status = 'active' AND gender = 'female'), 0) AS breeders_active_female,
            COALESCE(SUM(parent_type = 'indukan' AND status = 'active' AND (gender IS NULL OR gender NOT IN ('male', 'female'))), 0) AS breeders_active_unknown,
            COALESCE(SUM(parent_type = 'indukan' AND status = 'dead' AND gender = 'male'), 0) AS breeders_dead_male,
            COALESCE(SUM(parent_type = 'indukan' AND status = 'dead' AND gender = 'female'), 0) AS breeders_dead_female,
            COALESCE(SUM(parent_type = 'indukan' AND status = 'dead' AND (gender IS NULL OR gender NOT IN ('male', 'female'))), 0) AS breeders_dead_unknown,
            COALESCE(SUM((parent_type IS NULL OR parent_type <> 'indukan') AND status = 'dead'), 0) AS regular_dead,
            COALESCE(SUM((parent_type IS NULL OR parent_type <> 'indukan') AND status = 'dead' AND gender = 'male'), 0) AS regular_dead_male,
            COALESCE(SUM((parent_type IS NULL OR parent_type <> 'indukan') AND status = 'dead' AND gender = 'female'), 0) AS regular_dead_female,
            COALESCE(SUM((parent_type IS NULL OR parent_type <> 'indukan') AND status = 'dead' AND (gender IS NULL OR gender NOT IN ('male', 'female'))), 0) AS regular_dead_unknown,
            COALESCE(SUM((parent_type IS NULL OR parent_type <> 'indukan') AND status = 'dead' AND updated_at >= ?), 0) AS regular_dead_month
         FROM koi WHERE archived_at IS NULL",
        [date('Y-m-01')]
    );
    $archived = query_one('SELECT COUNT(*) AS total FROM koi WHERE archived_at IS NOT NULL');
    // Sold fish are counted in Data Ikan and in Archive (a sold fish is usually archived afterwards). "This month" = the day it left (archived_at, else its last edit).
    $soldRow = query_one(
        "SELECT COUNT(*) AS sold,
            COALESCE(SUM(gender = 'male'), 0) AS sold_male,
            COALESCE(SUM(gender = 'female'), 0) AS sold_female,
            COALESCE(SUM(gender IS NULL OR gender NOT IN ('male', 'female')), 0) AS sold_unknown,
            COALESCE(SUM(COALESCE(archived_at, updated_at) >= ?), 0) AS sold_month
         FROM koi WHERE status = 'sold'",
        [date('Y-m-01')]
    );
    send_json(200, [
        'ponds' => (int)$ponds['total'],
        'koi' => (int)$koi['total'],
        'archived' => (int)$archived['total'],
        'quarantine' => (int)$quarantine['total'],
        'breeders_active' => (int)$groups['breeders_active'],
        'breeders_dead' => (int)$groups['breeders_dead'],
        'breeders_active_male' => (int)$groups['breeders_active_male'],
        'breeders_active_female' => (int)$groups['breeders_active_female'],
        'breeders_active_unknown' => (int)$groups['breeders_active_unknown'],
        'breeders_dead_male' => (int)$groups['breeders_dead_male'],
        'breeders_dead_female' => (int)$groups['breeders_dead_female'],
        'breeders_dead_unknown' => (int)$groups['breeders_dead_unknown'],
        'sold' => (int)$soldRow['sold'],
        'sold_male' => (int)$soldRow['sold_male'],
        'sold_female' => (int)$soldRow['sold_female'],
        'sold_unknown' => (int)$soldRow['sold_unknown'],
        'regular_dead_month' => (int)$groups['regular_dead_month'],
        'sold_month' => (int)$soldRow['sold_month'],
        'regular_dead' => (int)$groups['regular_dead'],
        'regular_dead_male' => (int)$groups['regular_dead_male'],
        'regular_dead_female' => (int)$groups['regular_dead_female'],
        'regular_dead_unknown' => (int)$groups['regular_dead_unknown'],
    ]);
});

route('GET', '/account-sessions', function () {
    require_account();
    send_json(200, query(
        "SELECT
            account_sessions.id,
            account_sessions.account_id,
            account_sessions.username,
            COALESCE(accounts.name, account_sessions.name, account_sessions.username) AS name,
            COALESCE(accounts.role, account_sessions.role, '') AS role,
            account_sessions.remember_device,
            account_sessions.ip_address,
            account_sessions.user_agent,
            account_sessions.status,
            account_sessions.created_at,
            account_sessions.last_seen_at,
            account_sessions.expires_at,
            account_sessions.logged_out_at,
            TIMESTAMPDIFF(MINUTE, account_sessions.last_seen_at, NOW()) AS idle_minutes,
            CASE
              WHEN account_sessions.status = 'active'
                AND (account_sessions.expires_at IS NULL OR account_sessions.expires_at > NOW())
                AND account_sessions.last_seen_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
              THEN 'online'
              WHEN account_sessions.status = 'active'
                AND (account_sessions.expires_at IS NULL OR account_sessions.expires_at > NOW())
              THEN 'active'
              ELSE 'ended'
            END AS presence
         FROM account_sessions
         LEFT JOIN accounts ON accounts.id = account_sessions.account_id
         ORDER BY account_sessions.last_seen_at DESC
         LIMIT 80"
    ));
});
