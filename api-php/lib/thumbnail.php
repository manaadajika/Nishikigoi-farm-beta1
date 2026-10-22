<?php
// api-php/lib/thumbnail.php
//
// Small copies of the photos for lists and menus (GET /api/thumb/<width>/<path>): a card in Data Ikan shows a 480 px wide JPEG of
// a few dozen KB instead of the 45-600 KB original. They are made the first time somebody asks, kept in the storage under
// _thumbs/<width>/<path>.jpg, and removed together with the original (see delete_upload_files_if_unused).

require_once __DIR__ . '/storage.php';

// JPEG bytes of the photo at $rel scaled to $width pixels wide (never enlarged), or null when it cannot be made
// (not an image, GD missing, unreadable, or too many pixels for the memory limit).
function thumbnail_generate(string $rel, int $width): ?string {
    if (!function_exists('imagecreatefromstring') || !function_exists('imagejpeg')) return null;
    $fetched = storage_fetch_to_file($rel);
    if (!$fetched) return null;
    [$path, $isTemp] = $fetched;
    try {
        $info = @getimagesize($path);
        if (!$info || ($info[0] * $info[1]) > 40000000) return null;
        $source = @imagecreatefromstring((string)file_get_contents($path));
        if (!$source) return null;

        // phones store the turn of a photo in EXIF instead of turning the pixels (needs the exif extension)
        if ($info[2] === IMAGETYPE_JPEG && function_exists('exif_read_data')) {
            $exif = @exif_read_data($path);
            $angle = [3 => 180, 6 => -90, 8 => 90][(int)($exif['Orientation'] ?? 1)] ?? 0;
            if ($angle !== 0) {
                $turned = imagerotate($source, $angle, 0);
                if ($turned) { imagedestroy($source); $source = $turned; }
            }
        }

        $sourceWidth = imagesx($source);
        $sourceHeight = imagesy($source);
        $ratio = min(1, $width / max(1, $sourceWidth));
        $targetWidth = max(1, (int)round($sourceWidth * $ratio));
        $targetHeight = max(1, (int)round($sourceHeight * $ratio));
        $target = imagecreatetruecolor($targetWidth, $targetHeight);
        imagefill($target, 0, 0, imagecolorallocate($target, 255, 255, 255));   // transparent PNG/WebP/GIF on white
        imagecopyresampled($target, $source, 0, 0, 0, 0, $targetWidth, $targetHeight, $sourceWidth, $sourceHeight);
        imageinterlace($target, true);
        ob_start();
        imagejpeg($target, null, 74);
        $bytes = (string)ob_get_clean();
        imagedestroy($source);
        imagedestroy($target);
        return $bytes !== '' ? $bytes : null;
    } finally {
        if ($isTemp) @unlink($path);
    }
}

// Path of the thumbnail in the storage
function thumbnail_path(string $rel, int $width): string {
    return '_thumbs/' . $width . '/' . $rel . '.jpg';
}
