<?php
// api-php/lib/storage.php
//
// Where uploaded photos and videos live. Everything that reads or writes a file under /api/uploads/ goes through here, so the
// program can keep them in the local folder (default, nothing changes) or in an S3-compatible bucket (AWS S3, MinIO,
// MinIO ...) just by a setting in config.local.php:
//
//   'storage_driver' => 's3',
//   's3_endpoint'    => 'https://s3.example.com',
//   's3_bucket'      => 'nishikigoi',
//   's3_region'      => 'auto',
//   's3_key'         => '...',  's3_secret' => '...',
//   's3_public_base' => 'https://media.example.com',   // optional: a public / CDN address of the bucket
//
// The URLs stored in the data stay /api/uploads/<path> in both cases (the data never has to change when the storage does).
// With s3_public_base set, /api/uploads/<path> answers with a redirect to <public_base>/<path>; without it the file is read
// from the bucket and sent through the server.
//
// A path here ("relative path") is what follows /api/uploads/, for example koi/2026/10/koi-....jpg. Thumbnails live under
// _thumbs/<width>/<path>.

function storage_config(): array {
    static $cfg = null;
    static $signature = null;
    // tests point the storage somewhere else: by this global, or (for the background worker) by the KOI_STORAGE_OVERRIDE variable
    if (!isset($GLOBALS['koi_storage_override']) && getenv('KOI_STORAGE_OVERRIDE')) {
        $GLOBALS['koi_storage_override'] = json_decode((string)getenv('KOI_STORAGE_OVERRIDE'), true) ?: [];
    }
    $override = json_encode($GLOBALS['koi_storage_override'] ?? []);
    if ($signature !== $override) {
        $signature = $override;
        $cfg = null;
    }
    if ($cfg === null) {
        $config = require __DIR__ . '/../config.php';
        $config = array_replace($config, $GLOBALS['koi_storage_override'] ?? []);
        $cfg = [
            'driver' => (string)($config['storage_driver'] ?? 'local') === 's3' ? 's3' : 'local',
            'dir' => (string)($config['uploads_dir'] ?? (__DIR__ . '/../uploads')),
            'endpoint' => rtrim((string)($config['s3_endpoint'] ?? ''), '/'),
            'bucket' => (string)($config['s3_bucket'] ?? ''),
            'region' => (string)($config['s3_region'] ?? 'auto'),
            'key' => (string)($config['s3_key'] ?? ''),
            'secret' => (string)($config['s3_secret'] ?? ''),
            'public_base' => rtrim((string)($config['s3_public_base'] ?? ''), '/'),
            'path_style' => ($config['s3_path_style'] ?? true) !== false,
        ];
    }
    return $cfg;
}

function storage_driver(): string {
    return storage_config()['driver'];
}

// A path that can only point inside the storage: letters, digits, . _ - and / between them, no "..".
function storage_safe_path(string $rel): bool {
    if ($rel === '' || strlen($rel) > 400 || $rel[0] === '/' || str_contains($rel, '..') || str_contains($rel, '//')) return false;
    return (bool)preg_match('#^[A-Za-z0-9._/-]+$#', $rel);
}

function storage_mime_for(string $rel): string {
    $map = ['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp', 'gif' => 'image/gif',
            'mp4' => 'video/mp4', 'webm' => 'video/webm', 'mov' => 'video/quicktime'];
    return $map[strtolower(pathinfo($rel, PATHINFO_EXTENSION))] ?? 'application/octet-stream';
}

// ---- local ---------------------------------------------------------------------------------------------------------------

function storage_local_path(string $rel): ?string {
    if (!storage_safe_path($rel)) return null;
    return storage_config()['dir'] . '/' . $rel;
}

// ---- S3 (Signature V4) ---------------------------------------------------------------------------------------------------

function s3_uri_encode(string $value, bool $keepSlash): string {
    $encoded = rawurlencode($value);
    return $keepSlash ? str_replace('%2F', '/', $encoded) : $encoded;
}

// Pure signing step (no network): returns the headers to send, including Authorization. $headers: lowercase name => value of
// the headers that take part in the signature besides host / x-amz-* (for example range, content-type).
function s3_sign(string $method, string $host, string $canonicalUri, array $query, array $headers, string $payloadHash,
                 string $accessKey, string $secretKey, string $region, ?string $amzDate = null, string $service = 's3'): array {
    $amzDate = $amzDate ?? gmdate('Ymd\THis\Z');
    $dateStamp = substr($amzDate, 0, 8);
    $headers = array_change_key_case($headers, CASE_LOWER);
    $headers['host'] = $host;
    $headers['x-amz-content-sha256'] = $payloadHash;
    $headers['x-amz-date'] = $amzDate;
    ksort($headers);

    $canonicalHeaders = '';
    foreach ($headers as $name => $value) $canonicalHeaders .= $name . ':' . trim(preg_replace('/\s+/', ' ', (string)$value)) . "\n";
    $signedHeaders = implode(';', array_keys($headers));

    ksort($query);
    $pairs = [];
    foreach ($query as $name => $value) $pairs[] = s3_uri_encode((string)$name, false) . '=' . s3_uri_encode((string)$value, false);
    $canonicalQuery = implode('&', $pairs);

    $canonicalRequest = implode("\n", [$method, $canonicalUri, $canonicalQuery, $canonicalHeaders, $signedHeaders, $payloadHash]);
    $scope = "$dateStamp/$region/$service/aws4_request";
    $stringToSign = implode("\n", ['AWS4-HMAC-SHA256', $amzDate, $scope, hash('sha256', $canonicalRequest)]);

    $signingKey = hash_hmac('sha256', 'aws4_request', hash_hmac('sha256', $service, hash_hmac('sha256', $region, hash_hmac('sha256', $dateStamp, 'AWS4' . $secretKey, true), true), true), true);
    $signature = hash_hmac('sha256', $stringToSign, $signingKey);
    $headers['authorization'] = "AWS4-HMAC-SHA256 Credential=$accessKey/$scope,SignedHeaders=$signedHeaders,Signature=$signature";
    return $headers;
}

// One request to the bucket. $body: string, or ['file' => path] to send a file without loading it. Returns [status, body, headers].
function s3_request(string $method, string $key, array $query = [], $body = '', array $extra = []): array {
    $cfg = storage_config();
    if ($cfg['endpoint'] === '' || $cfg['bucket'] === '' || $cfg['key'] === '' || $cfg['secret'] === '') {
        throw new RuntimeException('Penyimpanan S3 belum diatur lengkap di config.local.php');
    }
    $parts = parse_url($cfg['endpoint']);
    $scheme = $parts['scheme'] ?? 'https';
    $host = $parts['host'] . (isset($parts['port']) ? ':' . $parts['port'] : '');
    if ($cfg['path_style']) {
        $uri = '/' . $cfg['bucket'] . ($key !== '' ? '/' . s3_uri_encode($key, true) : '/');
    } else {
        $host = $cfg['bucket'] . '.' . $host;
        $uri = '/' . s3_uri_encode($key, true);
    }

    $isFile = is_array($body) && isset($body['file']);
    $payloadHash = $isFile ? (string)hash_file('sha256', $body['file']) : hash('sha256', (string)$body);
    $headers = s3_sign($method, $host, $uri, $query, $extra, $payloadHash, $cfg['key'], $cfg['secret'], $cfg['region']);

    $url = $scheme . '://' . $host . $uri . ($query ? '?' . implode('&', array_map(fn($n, $v) => s3_uri_encode((string)$n, false) . '=' . s3_uri_encode((string)$v, false), array_keys($query), $query)) : '');
    $sendHeaders = [];
    foreach ($headers as $name => $value) $sendHeaders[] = $name . ': ' . $value;
    $sendHeaders[] = 'Expect:';   // do not wait for a "100 Continue" before sending the body (some servers never send it: 1 s lost per upload)

    $responseHeaders = [];
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $sendHeaders,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 600,
        CURLOPT_CONNECTTIMEOUT => 15,
        CURLOPT_HEADERFUNCTION => function ($ch, $line) use (&$responseHeaders) {
            $pos = strpos($line, ':');
            if ($pos !== false) $responseHeaders[strtolower(trim(substr($line, 0, $pos)))] = trim(substr($line, $pos + 1));
            return strlen($line);
        },
    ]);
    if ($method === 'HEAD') curl_setopt($ch, CURLOPT_NOBODY, true);
    $handle = null;
    if ($isFile) {
        $handle = fopen($body['file'], 'rb');
        curl_setopt_array($ch, [CURLOPT_UPLOAD => true, CURLOPT_INFILE => $handle, CURLOPT_INFILESIZE => filesize($body['file'])]);
    } elseif ($body !== '' && $method !== 'GET' && $method !== 'HEAD') {
        curl_setopt($ch, CURLOPT_POSTFIELDS, (string)$body);
    }
    $response = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    if ($handle) fclose($handle);
    if ($response === false) throw new RuntimeException('Penyimpanan S3 tidak terjangkau: ' . $error);
    return [$status, (string)$response, $responseHeaders];
}

function s3_fail(string $what, int $status, string $body): RuntimeException {
    $message = preg_match('#<Message>(.*?)</Message>#s', $body, $m) ? trim($m[1]) : substr(trim($body), 0, 200);
    return new RuntimeException("Penyimpanan S3: $what gagal ($status) $message");
}

// ---- the storage API -----------------------------------------------------------------------------------------------------

function storage_put(string $rel, string $bytes): void {
    if (!storage_safe_path($rel)) throw new InvalidArgumentException('Nama file penyimpanan tidak valid');
    if (storage_driver() === 's3') {
        [$status, $body] = s3_request('PUT', $rel, [], $bytes, ['content-type' => storage_mime_for($rel)]);
        if ($status < 200 || $status >= 300) throw s3_fail('simpan file', $status, $body);
        return;
    }
    $path = storage_local_path($rel);
    $dir = dirname($path);
    if (!is_dir($dir)) mkdir($dir, 0775, true);
    if (file_put_contents($path, $bytes) === false) throw new RuntimeException('Gagal menyimpan file');
}

// Stores a file from disk without reading it all into memory.
function storage_put_file(string $rel, string $source): void {
    if (!storage_safe_path($rel)) throw new InvalidArgumentException('Nama file penyimpanan tidak valid');
    if (storage_driver() === 's3') {
        [$status, $body] = s3_request('PUT', $rel, [], ['file' => $source], ['content-type' => storage_mime_for($rel)]);
        if ($status < 200 || $status >= 300) throw s3_fail('simpan file', $status, $body);
        return;
    }
    $path = storage_local_path($rel);
    $dir = dirname($path);
    if (!is_dir($dir)) mkdir($dir, 0775, true);
    if (!copy($source, $path)) throw new RuntimeException('Gagal menyimpan file');
}

function storage_get(string $rel): ?string {
    if (!storage_safe_path($rel)) return null;
    if (storage_driver() === 's3') {
        [$status, $body] = s3_request('GET', $rel);
        if ($status === 404) return null;
        if ($status < 200 || $status >= 300) throw s3_fail('baca file', $status, $body);
        return $body;
    }
    $path = storage_local_path($rel);
    return is_file($path) ? (string)file_get_contents($path) : null;
}

// Size in bytes, or null when the file does not exist.
function storage_size(string $rel): ?int {
    if (!storage_safe_path($rel)) return null;
    if (storage_driver() === 's3') {
        [$status, , $headers] = s3_request('HEAD', $rel);
        if ($status === 404) return null;
        if ($status < 200 || $status >= 300) throw new RuntimeException("Penyimpanan S3: cek file gagal ($status)");
        return (int)($headers['content-length'] ?? 0);
    }
    $path = storage_local_path($rel);
    return is_file($path) ? (int)filesize($path) : null;
}

function storage_exists(string $rel): bool {
    return storage_size($rel) !== null;
}

function storage_delete(string $rel): bool {
    if (!storage_safe_path($rel)) return false;
    if (storage_driver() === 's3') {
        [$status] = s3_request('DELETE', $rel);
        return $status >= 200 && $status < 300;
    }
    $path = storage_local_path($rel);
    return is_file($path) && @unlink($path);
}

// Every stored file as [path, size], optionally below a prefix ("koi/"). Never loads the whole list at once.
function storage_list(string $prefix = ''): Generator {
    if (storage_driver() === 's3') {
        $token = null;
        do {
            $query = ['list-type' => '2', 'max-keys' => '1000'];
            if ($prefix !== '') $query['prefix'] = $prefix;
            if ($token !== null) $query['continuation-token'] = $token;
            [$status, $body] = s3_request('GET', '', $query);
            if ($status < 200 || $status >= 300) throw s3_fail('daftar file', $status, $body);
            $xml = @simplexml_load_string($body);
            if ($xml === false) throw new RuntimeException('Penyimpanan S3: daftar file tidak terbaca');
            foreach ($xml->Contents ?? [] as $item) {
                $key = (string)$item->Key;
                if ($key !== '' && substr($key, -1) !== '/' && basename($key) !== '.gitkeep') yield [$key, (int)$item->Size];
            }
            $token = ((string)($xml->IsTruncated ?? 'false')) === 'true' ? (string)$xml->NextContinuationToken : null;
        } while ($token !== null && $token !== '');
        return;
    }
    $base = realpath(storage_config()['dir']);
    if ($base === false) return;
    $root = $prefix !== '' ? $base . '/' . rtrim($prefix, '/') : $base;
    if (!is_dir($root)) return;
    $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS));
    foreach ($iterator as $file) {
        if (!$file->isFile() || $file->getFilename() === '.gitkeep') continue;
        yield [str_replace('\\', '/', substr($file->getPathname(), strlen($base) + 1)), (int)$file->getSize()];
    }
}

// Files of the local uploads folder as [path, size], even when the storage driver is a bucket (used to move them there).
function storage_local_list(): Generator {
    $base = realpath(storage_config()['dir']);
    if ($base === false) return;
    $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($base, FilesystemIterator::SKIP_DOTS));
    foreach ($iterator as $file) {
        if (!$file->isFile() || $file->getFilename() === '.gitkeep') continue;
        yield [str_replace('\\', '/', substr($file->getPathname(), strlen($base) + 1)), (int)$file->getSize()];
    }
}

// Address a browser can load the file from directly (public / CDN base), or null when the file has to pass through the server.
function storage_public_url(string $rel): ?string {
    $cfg = storage_config();
    if ($cfg['driver'] !== 's3' || $cfg['public_base'] === '' || !storage_safe_path($rel)) return null;
    return $cfg['public_base'] . '/' . s3_uri_encode($rel, true);
}

// Local copy to work on (thumbnails, ZIP backup): the file itself when local, otherwise a temp file the caller must delete.
// Returns [path, isTemp] or null when the file does not exist.
function storage_fetch_to_file(string $rel): ?array {
    if (storage_driver() === 'local') {
        $path = storage_local_path($rel);
        return $path !== null && is_file($path) ? [$path, false] : null;
    }
    $bytes = storage_get($rel);
    if ($bytes === null) return null;
    $tmp = tempnam(sys_get_temp_dir(), 'koi_dl_');
    file_put_contents($tmp, $bytes);
    return [$tmp, true];
}
