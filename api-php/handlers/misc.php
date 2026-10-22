<?php
// api-php/handlers/misc.php

route('GET', '/media-assets', function () {
    $total = query_one('SELECT COUNT(*) AS total FROM media_assets');
    $active = query_one("SELECT COUNT(*) AS total FROM media_assets WHERE status = 'active'");
    $unused = query_one("SELECT COUNT(*) AS total FROM media_assets WHERE status = 'unused'");
    $size = query_one('SELECT COALESCE(SUM(size_bytes), 0) AS total FROM media_assets');
    $bySegment = query(
        'SELECT segment, media_type, COUNT(*) AS total, COALESCE(SUM(size_bytes), 0) AS size_bytes
         FROM media_assets GROUP BY segment, media_type ORDER BY segment, media_type'
    );

    send_json(200, [
        'total' => (int)$total['total'],
        'active' => (int)$active['total'],
        'unused' => (int)$unused['total'],
        'size_bytes' => (int)$size['total'],
        'by_segment' => $bySegment,
    ]);
});

route('GET', '/jobs', function () {
    send_json(200, query(
        'SELECT id, type, title, status, message, progress, started_at, finished_at, created_at
         FROM system_jobs ORDER BY id DESC LIMIT 100'
    ));
});

route('GET', '/backups', function () {
    require_account();
    $config = require __DIR__ . '/../config.php';
    $backupDir = $config['backups_dir'];
    $files = [];
    if (is_dir($backupDir)) {
        foreach (scandir($backupDir) as $name) {
            if ($name === '.' || $name === '..') continue;
            $full = $backupDir . '/' . $name;
            $files[] = ['name' => $name, 'size_bytes' => filesize($full), 'modified_at' => date('c', filemtime($full))];
        }
    }
    send_json(200, $files);
});
