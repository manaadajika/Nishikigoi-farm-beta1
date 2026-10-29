<?php

// A date the person knew only in part: 2025-00-00 (only the year), 2025-03-00 (year and month), 2025-00-12 (year and day, month forgotten)
// or 2025-03-14 (the whole date).
function koi_valid_partial_date(string $date): bool {
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $date, $m)) return false;
    [$year, $month, $day] = [(int)$m[1], (int)$m[2], (int)$m[3]];
    if ($year < 1) return false;
    if ($month === 0) return $day <= 31;   // the day may be known when the month is not (2025-00-12)
    if ($month > 12) return false;
    return $day === 0 || checkdate($month, $day, $year);
}

// The date as saved: '' / null stay empty, a good date (whole or in part) is kept as YYYY-MM-DD, anything else is refused.
function koi_clean_partial_date($value, string $label = 'Tanggal'): ?string {
    $text = trim((string)($value ?? ''));
    if ($text === '') return null;
    $text = substr($text, 0, 10);
    if (!koi_valid_partial_date($text)) send_error(422, "$label tidak valid");
    return $text;
}

// [year, month, day] of such a date; a month or day that is not known is 0
function koi_date_parts(string $date): array {
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})/', $date, $m)) return [(int)date('Y'), (int)date('n'), (int)date('j')];
    return [(int)$m[1], (int)$m[2], (int)$m[3]];
}
// api-php/lib/response.php

function send_json(int $status, array $data): void {
    // the Dashboard answers are kept for a short while (dashboard_cache_serve): the first answer of a kind is stored here
    if ($status === 200 && !empty($GLOBALS['dashboard_cache_key'])) {
        cache_set($GLOBALS['dashboard_cache_key'], $data, DASHBOARD_CACHE_TTL);
        $GLOBALS['dashboard_cache_key'] = null;
    }
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    // Big list answers (Data Ikan, Data Kolam, ...) are polled every 20-30 seconds by every open page. A fingerprint of the
    // body lets the browser say "I already have this" and get an empty 304 instead of the whole list again.
    // The fingerprint comes from the body itself, so one account can never receive another account's cached answer.
    if ($status === 200 && ($_SERVER['REQUEST_METHOD'] ?? '') === 'GET' && strlen($json) >= 4096) {
        $etag = '"' . md5($json) . '"';
        header('ETag: ' . $etag);
        header('Cache-Control: private, no-cache');
        // Apache's gzip module appends "-gzip" to the tag it hands the browser, and proxies may add W/ ; compare the bare hash.
        $given = (string)($_SERVER['HTTP_IF_NONE_MATCH'] ?? '');
        foreach (explode(',', $given) as $candidate) {
            $candidate = preg_replace('/^(W\/)?"?|"?$|-(gzip|br|deflate)$/', '', trim($candidate));
            $candidate = preg_replace('/-(gzip|br|deflate)$/', '', $candidate);
            if ($candidate !== '' && hash_equals(md5($json), $candidate)) {
                http_response_code(304);
                exit;
            }
        }
    }
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    // PHP's own web server (Termux) does not compress; Apache already does. A list of 600 fish is 500 KB of text that
    // shrinks about twelve times, which is what makes the first load fast on a phone.
    if (PHP_SAPI === 'cli-server' && strlen($json) >= 1024 && function_exists('gzencode')
        && strpos((string)($_SERVER['HTTP_ACCEPT_ENCODING'] ?? ''), 'gzip') !== false) {
        $packed = gzencode($json, 5);
        if ($packed !== false) {
            header('Content-Encoding: gzip');
            header('Vary: Accept-Encoding');
            header('Content-Length: ' . strlen($packed));
            echo $packed;
            exit;
        }
    }
    echo $json;
    exit;
}

function send_error(int $status, string $message, ?string $detail = null): void {
    $body = ['error' => $message];
    if ($detail !== null) $body['detail'] = $detail;
    send_json($status, $body);
}

function read_json_body(): array {
    $raw = file_get_contents('php://input');
    if ($raw === '' || $raw === false) return [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}
