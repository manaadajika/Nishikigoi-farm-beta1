<?php
// api-php/bin/worker.php
//
// The background worker (see lib/jobs.php). Started by the program itself for each job:
//
//   php bin/worker.php --job=12      run job 12 (if it is still queued) and exit   <- what the program starts
//   php bin/worker.php --next        run the oldest queued job and exit
//   php bin/worker.php --loop        keep running: pick up queued jobs as they appear (Ctrl-C to stop)
//   php bin/worker.php --enqueue=<type> [--delete-local]   start a job from here and wait for it, for example
//                                    php bin/worker.php --enqueue=storage-migrate   (moves the local photos to the S3 bucket)
//
// Command line only: a web request to this file is refused.

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit;
}

date_default_timezone_set('Asia/Jakarta');
set_time_limit(0);
ini_set('memory_limit', '1G');
ini_set('display_errors', '1');
chdir(dirname(__DIR__));

require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/response.php';
require_once __DIR__ . '/../lib/jobs.php';

$options = getopt('', ['job:', 'next', 'loop', 'enqueue:', 'delete-local']);

if (isset($options['job'])) {
    job_run((int)$options['job']);
    exit(0);
}

if (isset($options['enqueue'])) {
    $type = (string)$options['enqueue'];
    if (!isset(JOB_TYPES[$type])) {
        fwrite(STDERR, 'Jenis pekerjaan tidak dikenal. Pilihan: ' . implode(', ', array_keys(JOB_TYPES)) . "\n");
        exit(1);
    }
    if ($type === 'storage-migrate' && storage_driver() !== 's3') {
        fwrite(STDERR, "Atur 'storage_driver' => 's3' (dan data bucket) di config.local.php dulu.
");
        exit(1);
    }
    $payload = [];
    if ($type === 'storage-migrate') $payload['delete_local'] = isset($options['delete-local']);
    if ($type === 'cleanup') $payload['dry_run'] = !isset($options['delete-local']);   // here "--delete-local" means "really delete"
    $id = job_enqueue($type, $payload);
    echo JOB_TYPES[$type] . " (pekerjaan $id)...\n";
    job_run($id);
    $job = job_get($id);
    echo ($job['status'] === 'completed' ? 'Selesai: ' : 'GAGAL: ') . $job['message'] . "\n";
    if (!empty($job['result']['errors'])) echo implode("\n", $job['result']['errors']) . "\n";
    exit($job['status'] === 'completed' ? 0 : 1);
}

if (isset($options['next'])) {
    $id = job_next_queued();
    if ($id !== null) job_run($id);
    exit(0);
}

if (isset($options['loop'])) {
    echo "Worker berjalan. Tekan Ctrl-C untuk berhenti.\n";
    while (true) {
        $id = job_next_queued();
        if ($id !== null) {
            echo date('H:i:s') . " pekerjaan $id\n";
            job_run($id);
        } else {
            sleep(2);
        }
    }
}

fwrite(STDERR, "Pakai: php bin/worker.php --job=<id> | --next | --loop\n");
exit(1);
