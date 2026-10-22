<?php
// api-php/handlers/uploads.php
require_once __DIR__ . '/../lib/uploads.php';
require_once __DIR__ . '/../lib/thumbnail.php';

route('POST', '/koi-images', function () {
    require_account();
    $body = read_json_body();
    try {
        $prefix = upload_sanitize_prefix((string)($body['prefix'] ?? ''), 'koi');
        $url = save_image_data((string)($body['image_data'] ?? ''), $prefix);
        send_json(201, ['image_url' => $url]);
    } catch (InvalidArgumentException $e) {
        send_error(422, 'Gambar gagal diupload', $e->getMessage());
    }
});

route('POST', '/images', function () {
    require_account();
    $body = read_json_body();
    try {
        $prefix = strtolower(preg_replace('/[^a-z0-9-]/i', '', (string)($body['prefix'] ?? ''))) ?: 'image';
        // `dedupe_against`: URLs the caller already has; an identical file is not stored a second time.
        $duplicate = upload_find_duplicate((string)($body['image_data'] ?? ''), (array)($body['dedupe_against'] ?? []));
        if ($duplicate !== null) send_json(200, ['image_url' => $duplicate, 'duplicate' => true]);
        $url = save_image_data((string)($body['image_data'] ?? ''), $prefix);
        send_json(201, ['image_url' => $url]);
    } catch (InvalidArgumentException $e) {
        send_error(422, 'Gambar gagal diupload', $e->getMessage());
    }
});

route('POST', '/videos', function () {
    require_account();
    $body = read_json_body();
    try {
        $prefix = strtolower(preg_replace('/[^a-z0-9-]/i', '', (string)($body['prefix'] ?? ''))) ?: 'video';
        $duplicate = upload_find_duplicate((string)($body['video_data'] ?? ''), (array)($body['dedupe_against'] ?? []));
        if ($duplicate !== null) send_json(200, ['video_url' => $duplicate, 'video_thumbnail_url' => null, 'duplicate' => true]);
        $videoUrl = save_video_data((string)($body['video_data'] ?? ''), $prefix);
        $thumbnailUrl = !empty($body['thumbnail_data']) ? save_image_data((string)$body['thumbnail_data'], 'video-thumb') : null;
        send_json(201, ['video_url' => $videoUrl, 'video_thumbnail_url' => $thumbnailUrl]);
    } catch (InvalidArgumentException $e) {
        send_error(422, 'Video gagal diupload', $e->getMessage());
    }
});

// Sends a stored file: straight from the local folder, or (bucket) as a redirect to its public / CDN address when there is
// one, otherwise read from the bucket and passed on. $cache = the Cache-Control header.
function send_stored_file(string $rel, string $mime, string $cache): void {
    if (storage_driver() === 'local') {
        $path = realpath((string)storage_local_path($rel));
        $base = realpath(storage_config()['dir']);
        if ($path === false || $base === false || strpos($path, $base) !== 0 || !is_file($path)) send_error(404, 'File tidak ditemukan');
        // files never change under the same name: let the browser keep them (and ask cheaply with the ETag)
        $etag = '"' . md5($path . '|' . filemtime($path) . '|' . filesize($path)) . '"';
        header('ETag: ' . $etag);
        header('Cache-Control: ' . $cache);
        if (($_SERVER['HTTP_IF_NONE_MATCH'] ?? '') === $etag) {
            http_response_code(304);
            exit;
        }
        header('Content-Type: ' . ($mime !== '' ? $mime : (mime_content_type($path) ?: 'application/octet-stream')));
        header('Content-Length: ' . filesize($path));
        readfile($path);
        exit;
    }
    $public = storage_public_url($rel);
    if ($public !== null) {
        header('Cache-Control: public, max-age=3600');
        header('Location: ' . $public, true, 302);
        exit;
    }
    $size = storage_size($rel);
    if ($size === null) send_error(404, 'File tidak ditemukan');
    $etag = '"' . md5($rel . '|' . $size) . '"';
    header('ETag: ' . $etag);
    header('Cache-Control: ' . $cache);
    if (($_SERVER['HTTP_IF_NONE_MATCH'] ?? '') === $etag) {
        http_response_code(304);
        exit;
    }
    $bytes = storage_get($rel);
    if ($bytes === null) send_error(404, 'File tidak ditemukan');
    header('Content-Type: ' . ($mime !== '' ? $mime : storage_mime_for($rel)));
    header('Content-Length: ' . strlen($bytes));
    echo $bytes;
    exit;
}

function serve_upload_file(string $rel, bool $forceViewer): void {
    if (!storage_safe_path($rel) || !storage_exists($rel)) send_error(404, 'File tidak ditemukan');

    // An image opened as a page of its own (right click, "Open image in new tab") has no <link rel="icon">, and browsers
    // keep reusing an old /favicon.ico for it. Answer that navigation with a small branded page instead: the program's
    // icon and name in the tab, and the picture filling the screen. <img>, fetch and downloads ask for */* or image/*,
    // never text/html, so they still get the file itself (?raw=1 forces the file).
    $ext = strtolower(pathinfo($rel, PATHINFO_EXTENSION));
    $wantsPage = $forceViewer || strpos((string)($_SERVER['HTTP_ACCEPT'] ?? ''), 'text/html') !== false;
    if ($wantsPage && !isset($_GET['raw']) && in_array($ext, ['jpg', 'jpeg', 'png', 'webp', 'gif'], true)) {
        $s = [];
        foreach (query("SELECT `key`, value FROM app_settings WHERE `key` IN ('brand_name', 'brand_favicon', 'brand_icon')") as $row) $s[$row['key']] = trim((string)$row['value']);
        $brand = ($s['brand_name'] ?? '') !== '' ? $s['brand_name'] : 'Nishikigoi';
        $version = substr(md5(($s['brand_favicon'] ?? '') . '|' . ($s['brand_icon'] ?? '')), 0, 8);
        $h = fn(string $v): string => htmlspecialchars($v, ENT_QUOTES, 'UTF-8');
        $path = '/api/uploads/' . $rel;
        http_response_code(200);
        header('Content-Type: text/html; charset=utf-8');
        header('Cache-Control: no-cache');
        echo '<!doctype html><html lang="id"><head><meta charset="utf-8">' .
            '<meta name="viewport" content="width=device-width, initial-scale=1">' .
            '<title>' . $h(basename($rel)) . ' - ' . $h($brand) . '</title>' .
            '<link rel="icon" href="/api/favicon?v=' . $version . '"><link rel="shortcut icon" href="/api/favicon?v=' . $version . '">' .
            '<style>html,body{margin:0;height:100%;background:#0b0f14}img{display:block;width:100vw;height:100vh;object-fit:contain}</style>' .
            '</head><body><img src="' . $h($path) . '?raw=1" alt="' . $h(basename($rel)) . '"></body></html>';
        exit;
    }

    header('Vary: Accept');
    send_stored_file($rel, '', 'public, max-age=604800');
}

// Thumbnail of a photo: /api/thumb/<width>/<path>, made the first time it is asked (see lib/thumbnail.php).
function serve_thumbnail(int $width, string $rel): void {
    $ext = strtolower(pathinfo($rel, PATHINFO_EXTENSION));
    if (!in_array($width, THUMBNAIL_WIDTHS, true) || !storage_safe_path($rel)) send_error(404, 'File tidak ditemukan');
    if (!in_array($ext, ['jpg', 'jpeg', 'png', 'webp', 'gif'], true)) {
        header('Location: /api/uploads/' . $rel, true, 302);   // not a picture we can shrink: the file itself
        exit;
    }
    $thumb = thumbnail_path($rel, $width);
    if (!storage_exists($thumb)) {
        if (!storage_exists($rel)) send_error(404, 'File tidak ditemukan');
        $bytes = thumbnail_generate($rel, $width);
        if ($bytes === null) {
            header('Location: /api/uploads/' . $rel, true, 302);
            exit;
        }
        try {
            storage_put($thumb, $bytes);
        } catch (Throwable $e) {
            // the thumbnail could not be kept (storage trouble): still answer with it
            header('Content-Type: image/jpeg');
            header('Content-Length: ' . strlen($bytes));
            echo $bytes;
            exit;
        }
    }
    send_stored_file($thumb, 'image/jpeg', 'public, max-age=31536000, immutable');
}

route_pattern('GET', '#^/thumb/(\d+)/(.+)$#', function (array $m) {
    serve_thumbnail((int)$m[1], $m[2]);
});

route_pattern('GET', '#^/uploads/(.+)$#', function (array $m) {
    serve_upload_file($m[1], false);
});

// the Termux router sends branded-viewer navigations here (it cannot let a browser page request reach the static file)
route_pattern('GET', '#^/uploads-v/(.+)$#', function (array $m) {
    serve_upload_file($m[1], true);
});

// same file, but answered by PHP so it carries Vary: Accept (the static file server of Termux does not add it)
route_pattern('GET', '#^/uploads-f/(.+)$#', function (array $m) {
    serve_upload_file($m[1], false);
});
