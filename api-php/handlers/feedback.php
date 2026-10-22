<?php
// api-php/handlers/feedback.php

const FEEDBACK_CATEGORIES = [
    'saran' => 'Saran',
    'masalah' => 'Masalah atau error',
    'lainnya' => 'Lainnya',
];
const FEEDBACK_MAX_IMAGES = 3;
const FEEDBACK_MAX_MESSAGE_LENGTH = 2000;

// Feedback goes to the notification list as type "feedback"; only Master Admin accounts can read it
// (see notifications.php). Images are stored like any other upload and registered as media assets
// so cleanup jobs keep them.
route('POST', '/feedback', function () {
    $session = require_account();
    $body = read_json_body();

    $senderName = trim((string)($body['name'] ?? ''));
    if ($senderName === '') send_error(422, 'Nama wajib diisi');
    if (mb_strlen($senderName) > 100) send_error(422, 'Nama maksimal 100 karakter');

    $message = trim((string)($body['message'] ?? ''));
    if ($message === '') send_error(422, 'Pesan feedback wajib diisi');
    if (mb_strlen($message) > FEEDBACK_MAX_MESSAGE_LENGTH) {
        send_error(422, 'Pesan maksimal ' . FEEDBACK_MAX_MESSAGE_LENGTH . ' karakter');
    }

    $category = (string)($body['category'] ?? 'saran');
    if (!isset(FEEDBACK_CATEGORIES[$category])) $category = 'lainnya';

    $rawImages = is_array($body['images'] ?? null) ? $body['images'] : [];
    if (count($rawImages) > FEEDBACK_MAX_IMAGES) {
        send_error(422, 'Gambar maksimal ' . FEEDBACK_MAX_IMAGES);
    }

    $images = [];
    foreach ($rawImages as $imageData) {
        try {
            $url = save_image_data((string)$imageData, 'feedback');
        } catch (InvalidArgumentException $e) {
            send_error(422, 'Gambar tidak valid', $e->getMessage());
        }
        $images[] = $url;
        $relative = substr($url, strlen('/api/'));
        $stored = substr($relative, strlen('uploads/'));
        execute(
            'INSERT INTO media_assets (url, file_path, segment, media_type, size_bytes, status) VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE status = VALUES(status)',
            [$url, $relative, basename(dirname($stored)), 'image', (int)storage_size($stored), 'active']
        );
    }

    $name = $senderName;   // the name the sender typed in the form
    $details = json_encode([
        'category' => $category,
        'category_label' => FEEDBACK_CATEGORIES[$category],
        'from_name' => $name,
        'from_username' => $session['username'] ?? '',
        'images' => $images,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    execute(
        "INSERT INTO system_notifications (type, title, message, status, actor, role, action, target_label, details)
         VALUES ('feedback', ?, ?, 'unread', ?, ?, 'feedback', ?, ?)",
        [
            'Feedback dari ' . $name,
            $message,
            $session['username'] ?? '',
            $session['account_role'] ?? ($session['role'] ?? ''),
            FEEDBACK_CATEGORIES[$category],
            $details,
        ]
    );

    send_json(201, ['ok' => true, 'images' => count($images)]);
});
