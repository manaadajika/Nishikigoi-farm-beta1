<?php
// api-php/handlers/jobs.php
//
// Background jobs (lib/jobs.php): start one, follow it, take its result. GET /jobs (the list of the Queue menu) is in misc.php.
// Everything here is for Master Admin: backups hold password hashes, restores replace the data.

require_once __DIR__ . '/../lib/jobs.php';

function jobs_require_master(): void {
    if (role_level(current_session_role()) < 3) send_error(403, 'Hanya Master Admin yang boleh menjalankan pekerjaan sistem.');
}

// Starts a job. Body: { "type": "backup" | "restore" | "cleanup" | "storage-migrate" | "thumbs-warm" | "sync-media", ...options }
//   restore: "upload" = the name returned by POST /jobs/upload
//   cleanup: "dry_run": true to only count
//   storage-migrate: "delete_local": true to remove each local file once it is safely in the bucket
route('POST', '/jobs', function () {
    jobs_require_master();
    $body = read_json_body();
    $type = (string)($body['type'] ?? '');
    if (!isset(JOB_TYPES[$type])) send_error(422, 'Jenis pekerjaan tidak dikenal');

    $payload = [];
    if ($type === 'restore' || $type === 'restore-accounts') {
        $name = basename((string)($body['upload'] ?? ''));
        $file = jobs_dir() . '/' . $name;
        if ($name === '' || !preg_match('/^upload-[a-f0-9]{16}\.zip$/', $name) || !is_file($file)) send_error(422, 'File backup belum diunggah');
        // refuse the obvious mistakes now, instead of failing in the background
        $zip = new ZipArchive();
        if ($zip->open($file) !== true) send_error(422, 'File ZIP tidak valid');
        $isSystem = $zip->locateName('nishikigoi-backup.json') !== false;
        $isAccount = $zip->locateName('nishikigoi-account-backup.json') !== false;
        $zip->close();
        // the two kinds of backup are told apart by the file inside; each restore refuses the other kind with a clear message
        if ($type === 'restore' && !$isSystem) send_error(422, $isAccount ? 'Ini backup akun (akun, setingan, dan tema). Pakai Restore dan biarkan program memilih jenisnya, atau Restore Akun.' : 'ZIP bukan backup Nishikigoi yang valid');
        if ($type === 'restore-accounts' && !$isAccount) send_error(422, $isSystem ? 'Ini backup sistem (data ikan dan media), bukan backup akun.' : 'ZIP bukan backup akun Nishikigoi yang valid');
        $payload['upload'] = $name;
    } elseif ($type === 'cleanup') {
        $payload['dry_run'] = !empty($body['dry_run']);
    } elseif ($type === 'storage-migrate') {
        if (storage_driver() !== 's3') send_error(409, "Atur 'storage_driver' => 's3' di config.local.php dulu.");
        $payload['delete_local'] = !empty($body['delete_local']);
    }

    // only one of the heavy kinds at a time: a second backup or restore while one is running would fight over the same data
    $busy = query_one("SELECT id FROM system_jobs WHERE type = ? AND status IN ('queued', 'running') AND (heartbeat_at IS NULL OR heartbeat_at > NOW() - INTERVAL " . JOB_STALE_SECONDS . ' SECOND) ORDER BY id DESC LIMIT 1', [$type]);
    if ($busy) send_json(200, ['id' => (int)$busy['id'], 'already_running' => true]);

    $id = job_enqueue($type, $payload);
    $started = job_spawn($id);
    send_json(202, ['id' => $id, 'worker_started' => $started]);
});

// Raw upload of a backup ZIP for a restore job (the file itself as the request body: no base64, nothing held in memory).
route('POST', '/jobs/upload', function () {
    jobs_require_master();
    $name = 'upload-' . bin2hex(random_bytes(8)) . '.zip';
    $target = jobs_dir() . '/' . $name;
    $in = fopen('php://input', 'rb');
    $out = fopen($target, 'wb');
    $size = $in && $out ? stream_copy_to_stream($in, $out) : 0;
    if ($in) fclose($in);
    if ($out) fclose($out);
    if (!$size) {
        @unlink($target);
        send_error(400, 'File backup kosong');
    }
    send_json(201, ['upload' => $name, 'size_bytes' => $size]);
});

route_pattern('GET', '#^/jobs/(\d+)$#', function (array $m) {
    $job = job_get((int)$m[1]);
    if (!$job) send_error(404, 'Pekerjaan tidak ditemukan');
    unset($job['payload']);
    send_json(200, $job);
});

// The page asks for this when the worker did not pick the job up (no process could be started): it runs in this request.
route_pattern('POST', '#^/jobs/(\d+)/run$#', function (array $m) {
    jobs_require_master();
    ignore_user_abort(true);
    set_time_limit(0);
    job_run((int)$m[1]);
    $job = job_get((int)$m[1]);
    if (!$job) send_error(404, 'Pekerjaan tidak ditemukan');
    unset($job['payload']);
    send_json(200, $job);
});

// The result file of a finished backup job.
route_pattern('GET', '#^/jobs/(\d+)/file$#', function (array $m) {
    jobs_require_master();
    $job = job_get((int)$m[1]);
    if (!$job || !in_array($job['type'], ['backup', 'backup-accounts'], true) || $job['status'] !== 'completed' || empty($job['result']['stored'])) send_error(404, 'File backup tidak tersedia');
    $path = jobs_dir() . '/' . basename((string)$job['result']['stored']);
    if (!is_file($path)) send_error(404, 'File backup sudah dihapus, buat backup lagi.');
    header('Content-Type: application/zip');
    header('Content-Disposition: attachment; filename="' . str_replace('"', '', (string)$job['result']['file']) . '"');
    header('Content-Length: ' . filesize($path));
    header('Cache-Control: no-store');
    readfile($path);
    exit;
});
