<?php
// api-php/handlers/maintenance.php

require_once __DIR__ . '/../lib/uploads.php';
require_once __DIR__ . '/../lib/maintenance.php';

// Mirrors the original Node app's streaming protocol exactly: this is NOT
// a plain ZIP response. The body is newline-delimited JSON "event" lines
// (progress/compressing/result, or error) followed immediately — no
// delimiter — by the raw ZIP bytes once a "result" event has been sent.
// The frontend (downloadSystemBackup() in settings-master-account.astro)
// parses lines until it sees {"type":"result",...}, then switches to
// treating everything after that point as binary. A plain application/zip
// response (what this endpoint used to send) is silently unparseable by
// that client and always surfaces as "Backup gagal dibuat."
route('GET', '/maintenance/backup.zip', function () {
    require_account();

    header('Content-Type: application/x-nishikigoi-backup-stream');
    header('Cache-Control: no-store');
    while (ob_get_level() > 0) ob_end_flush();

    $emit = function (array $event) {
        echo json_encode($event) . "\n";
        flush();
    };

    $jobId = create_system_job('backup', 'Backup data', 'Backup sedang dibuat.', 10);
    try {
        [$tmpZip, $filename] = maintenance_build_backup_zip($emit);
        $emit(['type' => 'result', 'filename' => $filename]);
        readfile($tmpZip);
        unlink($tmpZip);
        finish_system_job($jobId, 'completed', 'Backup selesai.');
    } catch (Throwable $e) {
        finish_system_job($jobId, 'failed', $e->getMessage() ?: 'Backup gagal dibuat');
        $emit(['type' => 'error', 'message' => $e->getMessage() ?: 'Backup gagal dibuat']);
    }
    exit;
});

route('POST', '/maintenance/backup', function () {
    require_account();
    $config = require __DIR__ . '/../config.php';
    $backupDir = $config['backups_dir'];
    if (!is_dir($backupDir)) mkdir($backupDir, 0775, true);

    $filename = 'backup_' . date('Ymd_His') . '.json';
    file_put_contents($backupDir . '/' . $filename, json_encode(dump_all_tables(), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

    send_json(201, ['ok' => true, 'filename' => $filename]);
});

route('POST', '/maintenance/restore-zip', function () {
    require_account();
    $body = read_json_body();
    $backupData = (string)($body['backup_data'] ?? '');
    // Frontend sends a data: URL ("data:application/zip;base64,<...>"); strip
    // the prefix if present, same as the original Node restoreSystemBackup().
    $raw = strpos($backupData, ',') !== false ? substr($backupData, strpos($backupData, ',') + 1) : $backupData;
    if ($raw === '') {
        send_error(400, 'File backup kosong');
    }

    $zipBytes = base64_decode($raw, true);
    if ($zipBytes === false) {
        send_error(400, 'File ZIP tidak valid');
    }

    $tmpZipPath = tempnam(sys_get_temp_dir(), 'koi_restore_') . '.zip';
    file_put_contents($tmpZipPath, $zipBytes);
    unset($zipBytes, $raw, $backupData, $body);

    $jobId = create_system_job('restore', 'Restore backup sistem', 'Restore backup sedang berjalan.', 15);
    try {
        $result = maintenance_restore_zip_file($tmpZipPath);
    } catch (MaintenanceError $e) {
        @unlink($tmpZipPath);
        finish_system_job($jobId, 'failed', $e->getMessage());
        send_error($e->getCode() ?: 400, $e->getMessage());
    } catch (Throwable $e) {
        @unlink($tmpZipPath);
        finish_system_job($jobId, 'failed', $e->getMessage());
        throw $e;
    }
    @unlink($tmpZipPath);
    finish_system_job($jobId, 'completed', "Restore backup sistem selesai. {$result['restored_files']} file media dipulihkan.");

    send_json(200, ['ok' => true, 'restored_at' => date('c'), 'restored_files' => $result['restored_files']]);
});

route('POST', '/maintenance/restore', function () {
    require_account();
    $body = read_json_body();
    if (!isset($body['database']) || !is_array($body['database'])) {
        send_error(400, 'Body harus berisi field "database"');
    }
    $jobId = create_system_job('restore', 'Restore data', 'Restore sedang berjalan.', 10);
    try {
        restore_tables_from_dump($body['database']);
    } catch (Throwable $e) {
        finish_system_job($jobId, 'failed', $e->getMessage());
        throw $e;
    }
    finish_system_job($jobId, 'completed', 'Restore selesai.');
    send_json(200, ['ok' => true]);
});

// When the last backup was made and the last one restored (Master Akun shows them under Backup & Restore Sistem).
route('GET', '/maintenance/status', function () {
    require_account();
    send_json(200, maintenance_stamps());
});

route('POST', '/maintenance/clear-data', function () {
    require_account();
    $stamps = maintenance_stamps();   // the history of backups and restores outlives a clear
    execute('SET FOREIGN_KEY_CHECKS=0');
    foreach (MAINTENANCE_TABLES as $table) {
        if ($table === 'accounts' || $table === 'account_sessions') continue; // keep logins usable
        if ($table === 'system_jobs') continue; // keep the Queue history
        // the program's settings, brand identity and the accounts' themes belong to the account backup: clearing the data leaves them
        if ($table === 'app_settings') {
            execute('DELETE FROM app_settings WHERE `key` IN (' . implode(', ', array_fill(0, count(SYSTEM_SETTING_KEYS), '?')) . ')', SYSTEM_SETTING_KEYS);
            continue;
        }
        execute("DELETE FROM `$table`");
    }
    execute('DELETE FROM form_drafts');
    execute('SET FOREIGN_KEY_CHECKS=1');
    foreach ($stamps as $key => $value) maintenance_set_stamp($key, $value);
    koi_facets_cache_clear();
    // the rows are gone, so the photos and videos they pointed to are orphans: remove them too,
    // otherwise a backup of the "empty" system still carries every file
    require_once __DIR__ . '/../lib/uploads.php';
    $purged = purge_unreferenced_uploads();
    $jobId = create_system_job('maintenance', 'Clear data sistem', 'Clear data sedang berjalan.', 80);
    finish_system_job($jobId, 'completed', 'Clear data selesai. ' . $purged['removed'] . ' file media dihapus.');
    send_json(200, ['ok' => true, 'removed_files' => $purged['removed'], 'removed_bytes' => $purged['bytes']]);
});

// Gives every fish that has a main photo but no History Progress Foto its first entry ("Progress awal"), all at once.
// The same entry is otherwise added when a fish is created or when its history is opened (see handlers/koi.php).
route('POST', '/maintenance/complete-progress-photos', function () {
    require_account();
    $rows = query("SELECT k.id FROM koi k WHERE k.image_url IS NOT NULL AND k.image_url <> ''
                   AND NOT EXISTS (SELECT 1 FROM koi_growth_logs g WHERE g.koi_id = k.id AND g.image_url IS NOT NULL)");
    $jobId = create_system_job('maintenance', 'Lengkapi foto awal progress', 'Foto awal progress sedang dilengkapi.', 20);
    db()->beginTransaction();
    try {
        foreach ($rows as $row) koi_ensure_initial_history((int)$row['id']);
        db()->commit();
    } catch (Throwable $e) {
        if (db()->inTransaction()) db()->rollBack();
        finish_system_job($jobId, 'failed', $e->getMessage());
        throw $e;
    }
    finish_system_job($jobId, 'completed', count($rows) . ' ikan dilengkapi foto awal progressnya.');
    send_json(200, ['ok' => true, 'added' => count($rows)]);
});

route('POST', '/maintenance/cleanup-uploads', function () {
    require_account();
    $body = read_json_body();
    try {
        send_json(200, maintenance_cleanup_uploads(!empty($body['dry_run'])));
    } catch (MaintenanceError $e) {
        send_error($e->getCode() ?: 500, $e->getMessage());
    }
});

route('POST', '/maintenance/sync-media-assets', function () {
    require_account();
    send_json(200, maintenance_sync_media_assets());
});
