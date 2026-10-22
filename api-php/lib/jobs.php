<?php
// api-php/lib/jobs.php
//
// Background jobs. Heavy work (a backup of thousands of photos, a restore, moving the photos to a bucket ...) must not run inside
// the web request: it would hold a server process for minutes (the Termux server handles one request at a time!), hit time and
// memory limits, and the page could only wait. Instead a request writes a row in system_jobs (status 'queued') and starts a
// separate PHP process, bin/worker.php, that runs the job and reports its progress in the same row, which is what the Queue menu
// shows. The page polls GET /api/jobs/<id>.
//
// How the worker is started: job_spawn() launches `php bin/worker.php --job=<id>` detached. Nothing has to be installed or
// kept running. If starting a process is not possible on a server (functions disabled), the page asks POST /api/jobs/<id>/run,
// which runs the job inside that request instead; a worker that is kept running (`php bin/worker.php --loop`) also works.

require_once __DIR__ . '/maintenance.php';

const JOB_TYPES = [
    'backup' => 'Backup data',
    'restore' => 'Restore backup sistem',
    'backup-accounts' => 'Backup akun dan setingan',
    'restore-accounts' => 'Restore akun dan setingan',
    'cleanup' => 'Bersihkan file tidak terpakai',
    'storage-migrate' => 'Pindahkan media ke penyimpanan S3',
    'thumbs-warm' => 'Buat thumbnail semua foto',
    'sync-media' => 'Sinkronkan daftar media',
    'retention' => 'Bersihkan catatan lama (sesi, riwayat login, Antrean)',
];

// A job that has not reported for this long (seconds) while 'running' is considered dead.
const JOB_STALE_SECONDS = 600;

function jobs_dir(): string {
    $config = require __DIR__ . '/../config.php';
    $dir = rtrim((string)$config['backups_dir'], '/\\') . '/jobs';
    if (!is_dir($dir)) mkdir($dir, 0775, true);
    return $dir;
}

// Removes job files (backup ZIPs, uploaded restore files) older than a day, keeping nothing that a queued/running job needs.
function jobs_cleanup_files(): void {
    $busy = [];
    foreach (query("SELECT payload FROM system_jobs WHERE status IN ('queued', 'running') AND payload IS NOT NULL") as $row) {
        $payload = json_decode((string)$row['payload'], true);
        if (is_array($payload) && !empty($payload['upload'])) $busy[basename((string)$payload['upload'])] = true;
    }
    foreach (glob(jobs_dir() . '/*') ?: [] as $file) {
        if (is_file($file) && !isset($busy[basename($file)]) && filemtime($file) < time() - 86400) @unlink($file);
    }
}

function job_enqueue(string $type, array $payload = []): int {
    if (!isset(JOB_TYPES[$type])) throw new InvalidArgumentException('Jenis pekerjaan tidak dikenal');
    execute(
        "INSERT INTO system_jobs (type, title, status, message, progress, payload) VALUES (?, ?, 'queued', 'Menunggu giliran.', 0, ?)",
        [$type, JOB_TYPES[$type], $payload ? json_encode($payload, JSON_UNESCAPED_UNICODE) : null]
    );
    return (int)db()->lastInsertId();
}

function job_update(int $id, int $progress, string $message): void {
    execute('UPDATE system_jobs SET progress = ?, message = ?, heartbeat_at = NOW() WHERE id = ?', [max(0, min(99, $progress)), mb_substr($message, 0, 1000), $id]);
}

function job_finish(int $id, string $status, string $message, ?array $result = null): void {
    execute(
        'UPDATE system_jobs SET status = ?, message = ?, progress = 100, result = ?, heartbeat_at = NOW(), finished_at = NOW() WHERE id = ?',
        [$status, mb_substr($message, 0, 1000), $result === null ? null : json_encode($result, JSON_UNESCAPED_UNICODE), $id]
    );
}

// The job row with its payload/result decoded; dead 'running' jobs are closed as failed on the way.
function job_get(int $id): ?array {
    $row = query_one('SELECT id, type, title, status, message, progress, payload, result, started_at, finished_at, created_at, heartbeat_at FROM system_jobs WHERE id = ?', [$id]);
    if (!$row) return null;
    if ($row['status'] === 'running') {
        $seen = strtotime((string)($row['heartbeat_at'] ?: $row['started_at'])) ?: 0;
        if ($seen > 0 && time() - $seen > JOB_STALE_SECONDS) {
            job_finish($id, 'failed', 'Pekerjaan terhenti di tengah jalan (tidak ada kabar lebih dari ' . intdiv(JOB_STALE_SECONDS, 60) . ' menit).');
            $row = query_one('SELECT id, type, title, status, message, progress, payload, result, started_at, finished_at, created_at, heartbeat_at FROM system_jobs WHERE id = ?', [$id]);
        }
    }
    $row['payload'] = $row['payload'] ? json_decode((string)$row['payload'], true) : null;
    $row['result'] = $row['result'] ? json_decode((string)$row['result'], true) : null;
    return $row;
}

// The PHP command line program (the web server's PHP is not it: under Apache PHP_BINARY is httpd).
function job_php_cli(): ?string {
    $config = require __DIR__ . '/../config.php';
    if (!empty($config['php_cli'])) return (string)$config['php_cli'];
    if (PHP_SAPI === 'cli' || PHP_SAPI === 'cli-server') return PHP_BINARY;
    $windows = DIRECTORY_SEPARATOR === '\\';
    $candidates = [];
    $ini = php_ini_loaded_file();
    if ($ini) $candidates[] = dirname($ini) . ($windows ? '\\php.exe' : '/php');
    $candidates[] = PHP_BINDIR . ($windows ? '\\php.exe' : '/php');
    foreach ($candidates as $candidate) {
        if (is_file($candidate)) return $candidate;
    }
    return null;
}

// Starts bin/worker.php for one job, detached from this request. Returns false when no process could be started.
function job_spawn(int $id): bool {
    $disabled = array_map('trim', explode(',', (string)ini_get('disable_functions')));
    $php = job_php_cli();
    $script = realpath(__DIR__ . '/../bin/worker.php');
    if ($php === null || $script === false) return false;
    if (DIRECTORY_SEPARATOR === '\\') {
        if (!function_exists('popen') || in_array('popen', $disabled, true)) return false;
        $command = 'start /B "" ' . escapeshellarg($php) . ' ' . escapeshellarg($script) . ' --job=' . $id . ' > NUL 2>&1';
        $handle = @popen($command, 'r');
        if ($handle === false) return false;
        pclose($handle);
        return true;
    }
    if (!function_exists('exec') || in_array('exec', $disabled, true)) return false;
    exec(escapeshellarg($php) . ' ' . escapeshellarg($script) . ' --job=' . $id . ' > /dev/null 2>&1 &', $out, $code);
    return $code === 0;
}

// Runs one job: claims it (so two workers never run the same one), does the work, records the end. Never throws.
function job_run(int $id): void {
    $claimed = execute("UPDATE system_jobs SET status = 'running', started_at = NOW(), heartbeat_at = NOW(), message = 'Dimulai.' WHERE id = ? AND status = 'queued'", [$id])->rowCount();
    if (!$claimed) return;
    $job = job_get($id);
    $payload = is_array($job['payload'] ?? null) ? $job['payload'] : [];

    // progress to the Queue row, at most a couple of times per second
    $lastWrite = 0.0;
    $label = JOB_TYPES[$job['type']] ?? $job['type'];
    $emit = function (array $event) use ($id, &$lastWrite, $label) {
        $now = microtime(true);
        if ($now - $lastWrite < 0.5 && ($event['current'] ?? 0) !== ($event['total'] ?? -1)) return;
        $lastWrite = $now;
        if (isset($event['total_bytes']) && $event['total_bytes'] > 0) {
            // backup / restore: the percent follows the SIZE of the files handled, not how many files there are
            $mb = function ($bytes) { return number_format($bytes / 1048576, 1, ',', ''); };
            job_update($id, (int)min(100, floor(100 * ($event['bytes'] ?? 0) / $event['total_bytes'])), $label . ': ' . $mb($event['bytes'] ?? 0) . ' dari ' . $mb($event['total_bytes']) . ' MB (' . ($event['current'] ?? 0) . ' dari ' . $event['total'] . ' file).');
        } elseif (isset($event['total']) && $event['total'] > 0) {
            job_update($id, (int)floor(100 * ($event['current'] ?? 0) / $event['total']), $label . ': ' . ($event['current'] ?? 0) . ' dari ' . $event['total'] . ' file.');
        } elseif (($event['type'] ?? '') === 'compressing') {
            job_update($id, 95, $label . ': memampatkan ZIP.');
        } elseif (($event['stage'] ?? '') === 'tables') {
            job_update($id, 5, $label . ': memulihkan data tabel.');
        } else {
            job_update($id, 1, $label . '...');
        }
    };

    try {
        switch ($job['type']) {
            case 'backup':
                [$tmpZip, $filename, $mediaCount] = maintenance_build_backup_zip($emit);
                $target = jobs_dir() . '/backup-' . $id . '.zip';
                if (!@rename($tmpZip, $target)) {
                    copy($tmpZip, $target);
                    @unlink($tmpZip);
                }
                job_finish($id, 'completed', "Backup selesai ($mediaCount file media).", ['file' => $filename, 'stored' => basename($target), 'size_bytes' => filesize($target), 'media_files' => $mediaCount]);
                break;

            case 'backup-accounts':
                [$tmpZip, $filename, $accountCount, $settingCount] = maintenance_build_account_backup_zip($emit);
                $target = jobs_dir() . '/backup-' . $id . '.zip';
                if (!@rename($tmpZip, $target)) {
                    copy($tmpZip, $target);
                    @unlink($tmpZip);
                }
                job_finish($id, 'completed', "Backup akun selesai ($accountCount akun, $settingCount setingan dan tema).", ['file' => $filename, 'stored' => basename($target), 'size_bytes' => filesize($target), 'accounts' => $accountCount, 'settings' => $settingCount]);
                break;

            case 'restore-accounts':
                $upload = jobs_dir() . '/' . basename((string)($payload['upload'] ?? ''));
                if (empty($payload['upload']) || !is_file($upload)) throw new MaintenanceError('File backup akun untuk restore tidak ditemukan.', 400);
                try {
                    $result = maintenance_restore_account_zip_file($upload, $emit);
                } finally {
                    @unlink($upload);
                }
                job_finish($id, 'completed', "Restore akun selesai. {$result['restored_accounts']} akun, {$result['restored_settings']} setingan dan tema dipulihkan.", $result);
                break;

            case 'restore':
                $upload = jobs_dir() . '/' . basename((string)($payload['upload'] ?? ''));
                if (empty($payload['upload']) || !is_file($upload)) throw new MaintenanceError('File backup untuk restore tidak ditemukan.', 400);
                try {
                    $result = maintenance_restore_zip_file($upload, $emit);
                } finally {
                    @unlink($upload);
                }
                job_finish($id, 'completed', "Restore backup sistem selesai. {$result['restored_files']} file media dipulihkan.", $result);
                break;

            case 'cleanup':
                $result = maintenance_cleanup_uploads(!empty($payload['dry_run']), $emit);
                job_finish($id, 'completed', !empty($payload['dry_run'])
                    ? "{$result['unused']} dari {$result['total_files']} file tidak terpakai."
                    : "Pembersihan selesai. {$result['removed']} file tidak terpakai dihapus.", $result);
                break;

            case 'storage-migrate':
                $result = maintenance_storage_migrate(!empty($payload['delete_local']), $emit);
                job_finish($id, $result['failed'] ? 'failed' : 'completed',
                    "{$result['copied']} file disalin, {$result['already_there']} sudah ada, {$result['failed']} gagal" . ($result['deleted_local'] ? ", {$result['deleted_local']} file lokal dihapus." : '.'), $result);
                break;

            case 'thumbs-warm':
                $result = maintenance_warm_thumbnails($emit);
                job_finish($id, 'completed', "{$result['made']} thumbnail dibuat dari {$result['photos']} foto.", $result);
                break;

            case 'retention':
                $result = maintenance_retention();
                job_finish($id, 'completed', "{$result['sessions']} sesi lama, {$result['login_attempts']} catatan login, {$result['jobs']} baris Antrean dihapus.", $result);
                break;

            case 'sync-media':
                $result = maintenance_sync_media_assets();
                job_finish($id, 'completed', "{$result['added']} media baru didaftarkan.", $result);
                break;

            default:
                throw new MaintenanceError('Jenis pekerjaan tidak dikenal.', 400);
        }
    } catch (Throwable $e) {
        job_finish($id, 'failed', $e->getMessage() !== '' ? $e->getMessage() : 'Pekerjaan gagal.');
    }
    jobs_cleanup_files();
}

// The oldest queued job, or null.
function job_next_queued(): ?int {
    $row = query_one("SELECT id FROM system_jobs WHERE status = 'queued' ORDER BY id LIMIT 1");
    return $row ? (int)$row['id'] : null;
}

// Once a day, when somebody signs in: start the housekeeping job (not on every request, and never waiting for it).
function jobs_maybe_run_retention(): void {
    try {
        if (cache_get('retention-ran') === true) return;
        cache_set('retention-ran', true, 86400);
        job_spawn(job_enqueue('retention'));
    } catch (Throwable $e) {
        // housekeeping must never get in the way of signing in
    }
}
