<?php
// bin/router.php — lets PHP's own web server (php -S) run the whole program from a fresh clone, with no Apache or Nginx.
// Used by bin/nishikigoi.php (nishikigoi start):  php -S 127.0.0.1:2000 -t app/public/Nishikigoi-beta/preview/dist bin/router.php
//
// It does what the Laragon/Apache setup does:
//   /api/...        -> api-php/index.php (the API)
//   /api/uploads/.. -> the stored photos and videos (served through the API, which also checks the path)
//   /sign-in        -> sign-in.html (pages are also opened without the .html)
//   everything else -> the static files of the site; an address that does not exist shows the program's own 404 page.

$repoRoot = dirname(__DIR__);
$siteRoot = $repoRoot . '/app/public/Nishikigoi-beta/preview/dist';
$apiRoot = $repoRoot . '/api-php';
$path = rawurldecode((string)parse_url((string)($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH));

// the browser asks /favicon.ico for raw images opened in a tab: answer with the program icon (API route /favicon)
if ($path === '/favicon.ico') {
    $_SERVER['REQUEST_URI'] = '/api/favicon';
    $path = '/api/favicon';
}

// Photos and videos: the API serves them (checks the path, adds cache headers, answers range requests for video). An image opened as a
// page of its own gets the branded viewer page, every other request gets the file.
if (strpos($path, '/api/uploads/') === 0) {
    $isImage = (bool)preg_match('/\.(jpe?g|png|webp|gif)$/i', $path);
    $wantsPage = $isImage && strpos((string)($_SERVER['HTTP_ACCEPT'] ?? ''), 'text/html') !== false && !isset($_GET['raw']);
    $_SERVER['REQUEST_URI'] = '/api/' . ($wantsPage ? 'uploads-v/' : 'uploads-f/') . substr($path, strlen('/api/uploads/'));
    $path = $_SERVER['REQUEST_URI'];
}

if ($path === '/api' || strpos($path, '/api/') === 0) {
    chdir($apiRoot);
    $_SERVER['SCRIPT_NAME'] = '/api/index.php';
    $_SERVER['SCRIPT_FILENAME'] = $apiRoot . '/index.php';
    require $apiRoot . '/index.php';
    return true;
}

$notFound = static function () use ($siteRoot) {
    http_response_code(404);
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store');
    $page = $siteRoot . '/assets/error.html';
    if (is_file($page)) readfile($page);
    else echo '404 - Halaman tidak ditemukan';
};
$sendPage = static function (string $file) {
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-cache');
    readfile($file);
};

if ($path === '/' || $path === '') {
    $home = $siteRoot . '/index.html';
    if (is_file($home)) { $sendPage($home); return true; }
    $notFound();
    return true;
}

$real = realpath($siteRoot . $path);
$root = realpath($siteRoot);
if ($real !== false && $root !== false && strpos($real, $root) === 0) {
    if (is_file($real)) return false;   // a static file: PHP's server sends it with the right type
}
// "/sign-in" -> sign-in.html
if (strpos($path, '..') === false && substr($path, -1) !== '/' && pathinfo($path, PATHINFO_EXTENSION) === '' && is_file($siteRoot . $path . '.html')) {
    $sendPage($siteRoot . $path . '.html');
    return true;
}
$notFound();
return true;
