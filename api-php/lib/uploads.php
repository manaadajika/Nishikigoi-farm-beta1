<?php
// api-php/lib/uploads.php
require_once __DIR__ . '/storage.php';

// Widths a thumbnail can have (GET /api/thumb/<width>/<path>), so the cache stays small.
const THUMBNAIL_WIDTHS = [120, 240, 480, 800];

// Extensions that must never be written into api-php/uploads/ (or restored
// into it from a ZIP) because Apache serves any existing file in that
// directory directly, bypassing the PHP router — an uploaded .php would
// execute as PHP, and an uploaded .svg/.html would execute script content
// in the app's own origin (stored XSS / session theft).
const DANGEROUS_UPLOAD_EXTENSIONS = ['php', 'php3', 'php4', 'php5', 'php7', 'phtml', 'pht', 'phar',
    'cgi', 'pl', 'py', 'sh', 'exe', 'asp', 'aspx', 'jsp', 'htaccess', 'htm', 'html',
    'svg', 'xhtml', 'shtml', 'xml'];

// Returns a safe extension for the given (untrusted) one: the lowercased
// extension itself if it's alphanumeric and not on the denylist, otherwise
// 'bin' so the file is neutered rather than rejected outright.
// Every /api/uploads/... URL still referenced anywhere in the data (plain columns and JSON text).
// media_assets is not a reliable register here (koi photos are not recorded in it), so the data
// itself is scanned, like the original Node server's cleanup did.
function referenced_upload_urls(): array {
    $tables = ['ponds', 'koi', 'koi_growth_logs', 'pond_note_history', 'pond_documentation',
        'farm_reports', 'breeding_batches', 'accounts', 'app_settings', 'system_notifications',
        'gallery_collections', 'gallery_images', 'form_drafts', 'sell_items', 'invoices', 'inventory_items', 'inventory_movements', 'post_images'];
    $used = [];
    foreach ($tables as $table) {
        foreach (query("SELECT * FROM `$table`") as $row) {
            // JSON columns are stored with escaped slashes (\/api\/uploads\/...); a URL never holds a backslash,
            // so drop them before matching or those photos would look unused
            $text = str_replace('\\', '', (string)json_encode($row, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
            if (preg_match_all('#/api/uploads/[A-Za-z0-9._/-]+#', $text, $m)) {
                foreach ($m[0] as $url) $used[$url] = true;
            }
        }
    }
    return $used;
}

// True while any farm data row exists (fish, ponds, reports, ...). Used as a sanity check before the
// "unused files" cleanup: with data present but no photo referenced, the scan itself is suspect.
function farm_data_exists(): bool {
    foreach (['koi', 'ponds', 'farm_reports', 'breeding_batches', 'pond_documentation', 'gallery_images',
              'sell_items', 'invoices', 'inventory_items'] as $table) {
        if ((int)(query_one("SELECT COUNT(*) AS n FROM `$table`")['n'] ?? 0) > 0) return true;
    }
    return false;
}

// Deletes every file in the storage that no data refers to (what "Hapus Semua Data" calls after the rows are gone, so
// the backup of an emptied system is really empty). Thumbnails (_thumbs/<width>/<path>.jpg) go with their original.
// Returns how many files and bytes went.
function purge_unreferenced_uploads(?string $uploadsDir = null): array {
    $used = referenced_upload_urls();
    $removed = 0;
    $bytes = 0;
    foreach (storage_list() as [$rel, $size]) {
        $original = $rel;
        if (preg_match('#^_thumbs/\d+/(.+)\.jpg$#', $rel, $m)) $original = $m[1];
        if (isset($used['/api/uploads/' . $original])) continue;
        if (storage_delete($rel)) {
            $removed++;
            $bytes += $size;
        }
    }
    return ['removed' => $removed, 'bytes' => $bytes];
}

// Every /api/uploads/... URL mentioned in the given rows (JSON columns included). Collected BEFORE a record is
// deleted, then passed to delete_upload_files_if_unused() so the photos/videos of a deleted record do not pile
// up in uploads/ (files still used by other records stay).
function upload_urls_in_rows(array $rows): array {
    $urls = [];
    foreach ($rows as $row) {
        if (!is_array($row)) continue;
        $text = str_replace('\\', '', (string)json_encode($row, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
        if (preg_match_all('#/api/uploads/[A-Za-z0-9._/-]+#', $text, $m)) {
            foreach ($m[0] as $url) $urls[$url] = true;
        }
    }
    return array_keys($urls);
}

// Upload URLs held by the gallery collection(s) that mirror one record (source_type: pond, breeding, report)
// and by the images inside them.
function gallery_upload_urls_for_source(string $sourceType, int $sourceId): array {
    $collections = query('SELECT * FROM gallery_collections WHERE source_type = ? AND source_id = ?', [$sourceType, $sourceId]);
    $rows = $collections;
    foreach ($collections as $collection) {
        foreach (query('SELECT * FROM gallery_images WHERE gallery_id = ?', [$collection['id']]) as $image) $rows[] = $image;
    }
    return upload_urls_in_rows($rows);
}

// Removes upload files that no data refers to any more (same idea as the original
// deleteUploadFilesIfUnused). Files still used elsewhere, e.g. the same photo in history, stay.
function delete_upload_files_if_unused(array $urls): int {
    $urls = array_values(array_unique(array_filter(array_map('strval', $urls))));
    if (!$urls) return 0;
    $used = referenced_upload_urls();
    $removed = 0;
    foreach ($urls as $url) {
        if (isset($used[$url]) || !str_starts_with($url, '/api/uploads/')) continue;
        $rel = substr($url, strlen('/api/uploads/'));
        if (!storage_safe_path($rel)) continue;
        if (storage_delete($rel)) {
            $removed++;
            foreach (THUMBNAIL_WIDTHS as $width) storage_delete('_thumbs/' . $width . '/' . $rel . '.jpg');
        }
    }
    return $removed;
}

// Returns the URL of an already stored upload (one of $existingUrls) whose bytes are identical to the
// incoming data URL, or null. Used by the ZIP import so importing the same package twice does not
// store every photo again. Only files under uploads/ are looked at; sizes are compared before hashing.
function upload_find_duplicate(string $dataUrl, array $existingUrls): ?string {
    if (!$existingUrls || !preg_match('#^data:[a-z]+/[a-z0-9.+-]+;base64,(.+)$#s', $dataUrl, $m)) return null;
    $buffer = base64_decode($m[1], true);
    if ($buffer === false) return null;
    $size = strlen($buffer);
    $hash = null;
    foreach (array_slice($existingUrls, 0, 500) as $url) {
        $url = (string)$url;
        if (!str_starts_with($url, '/api/uploads/')) continue;
        $rel = substr($url, strlen('/api/uploads/'));
        if (storage_size($rel) !== $size) continue;
        $hash = $hash ?? sha1($buffer);
        if (sha1((string)storage_get($rel)) === $hash) return $url;
    }
    return null;
}

// True when $url ("/api/uploads/...") points at a stored upload that exists (used when a ZIP/Excel mentions
// media that is already on the server, for example by its Galeri ID).
function upload_url_exists(string $url): bool {
    if (!str_starts_with($url, '/api/uploads/')) return false;
    return storage_exists(substr($url, strlen('/api/uploads/')));
}

function sanitize_upload_extension(string $ext): string {
    $ext = strtolower($ext);
    return (preg_match('/^[a-z0-9]{1,10}$/', $ext) && !in_array($ext, DANGEROUS_UPLOAD_EXTENSIONS, true)) ? $ext : 'bin';
}

function save_uploaded_file(string $fieldName, string $segment): array {
    if (!isset($_FILES[$fieldName]) || $_FILES[$fieldName]['error'] !== UPLOAD_ERR_OK) {
        send_error(400, "File '$fieldName' wajib diupload");
    }

    $file = $_FILES[$fieldName];
    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    // Deny executable/server-side extensions outright (the uploads dir is
    // web-accessible and Apache serves existing files directly, bypassing
    // this router — an uploaded .php would otherwise execute as PHP).
    $safeExt = sanitize_upload_extension($ext);
    $filename = date('Ymd_His') . '_' . bin2hex(random_bytes(6)) . '.' . $safeExt;

    $safeSegment = preg_replace('/[^a-z0-9_-]/i', '_', $segment);
    $rel = $safeSegment . '/' . $filename;
    try {
        storage_put_file($rel, $file['tmp_name']);
    } catch (Throwable $e) {
        send_error(500, 'Gagal menyimpan file upload');
    }

    $relativePath = 'uploads/' . $rel;
    $url = '/api/' . $relativePath;
    $sizeBytes = (int)filesize($file['tmp_name']);
    $mediaType = in_array($ext, ['mp4', 'mov', 'webm']) ? 'video' : 'image';

    execute(
        'INSERT INTO media_assets (url, file_path, segment, media_type, size_bytes, status) VALUES (?, ?, ?, ?, ?, ?)',
        [$url, $relativePath, $segment, $mediaType, $sizeBytes, 'active']
    );

    return ['url' => $url, 'file_path' => $relativePath, 'size_bytes' => $sizeBytes, 'media_type' => $mediaType];
}

// The frontend never posts multipart file uploads for images/videos — it
// reads the file client-side into a data: URL and posts JSON (see
// app/public/.../farm-koi.astro's uploadImage()). These mirror the original
// Node saveImageData()/saveVideoData()/getUploadSegment() exactly so the
// generated URLs and folder layout stay compatible.

function upload_sanitize_prefix(string $prefix, string $fallback = 'upload'): string {
    $safe = preg_replace('/^-+|-+$/', '', preg_replace('/[^a-z0-9_-]+/i', '-', trim($prefix)));
    $safe = substr($safe, 0, 80);
    return $safe !== '' ? $safe : $fallback;
}

function upload_segment_for_prefix(string $prefix): string {
    $clean = strtolower($prefix ?: 'misc');
    if (str_starts_with($clean, 'koi')) return 'koi';
    if (preg_match('/^\d{2}[a-z0-9]{4}(?:[-_]|$)/i', $clean)) return 'koi';
    if (str_starts_with($clean, 'gallery')) return 'gallery';
    if (str_starts_with($clean, 'pond-doc')) return 'ponds';
    if (str_starts_with($clean, 'breeding')) return 'breeding';
    if (str_contains($clean, 'report')) return 'reports';
    if (str_contains($clean, 'thumb')) return 'thumbnails';
    if (str_contains($clean, 'avatar') || str_contains($clean, 'account')) return 'accounts';
    if (str_contains($clean, 'video')) return 'videos';
    return 'misc';
}

function save_buffer_to_storage(string $buffer, string $prefix, string $extension): string {
    $safePrefix = upload_sanitize_prefix($prefix);
    $segment = upload_segment_for_prefix($prefix);
    $relativeDir = $segment . '/' . date('Y') . '/' . date('m');

    $filename = $safePrefix . '-' . sprintf(
        '%08x-%04x-%04x-%04x-%012x',
        random_int(0, 0xffffffff), random_int(0, 0xffff), random_int(0, 0xffff),
        random_int(0, 0xffff), random_int(0, 0xffffffffffff)
    ) . '-' . substr(str_shuffle('0123456789abcdefghijklmnopqrstuvwxyz'), 0, 6) . '.' . $extension;

    storage_put($relativeDir . '/' . $filename, $buffer);

    return '/api/uploads/' . $relativeDir . '/' . $filename;
}

function save_image_data(string $dataUrl, string $prefix): string {
    if (!preg_match('#^data:(image/(png|jpe?g|webp|gif));base64,(.+)$#s', $dataUrl, $m)) {
        throw new InvalidArgumentException('Format gambar tidak valid');
    }
    $extensions = ['image/jpeg' => 'jpg', 'image/jpg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif'];
    $buffer = base64_decode($m[3]);
    if ($buffer === false) {
        throw new InvalidArgumentException('Format gambar tidak valid');
    }
    return save_buffer_to_storage($buffer, $prefix, $extensions[$m[1]]);
}

function save_video_data(string $dataUrl, string $prefix): string {
    if (!preg_match('#^data:(video/(mp4|webm));base64,(.+)$#s', $dataUrl, $m)) {
        throw new InvalidArgumentException('Format video harus mp4 atau webm');
    }
    $extensions = ['video/mp4' => 'mp4', 'video/webm' => 'webm'];
    $buffer = base64_decode($m[3]);
    if ($buffer === false) {
        throw new InvalidArgumentException('Format video harus mp4 atau webm');
    }
    if (strlen($buffer) > 100 * 1024 * 1024) {
        throw new InvalidArgumentException('Ukuran video maksimal 100 MB');
    }
    return save_buffer_to_storage($buffer, $prefix, $extensions[$m[1]]);
}
