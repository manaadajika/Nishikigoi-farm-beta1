<?php
// api-php/lib/maintenance.php
//
// Backup, restore and clean-up of the whole system, and the Queue entries (system_jobs) they report to. The routes in
// handlers/maintenance.php and the background worker (bin/worker.php, lib/jobs.php) both call these functions, so a backup made
// in the background is exactly the backup the page used to stream.

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/uploads.php';
require_once __DIR__ . '/koi_query.php';
require_once __DIR__ . '/thumbnail.php';

const MAINTENANCE_TABLES = [
    'ponds', 'koi', 'koi_growth_logs', 'pond_note_history', 'pond_documentation',
    'farm_reports', 'breeding_batches', 'accounts', 'media_assets', 'media_references',
    'app_settings', 'system_notifications', 'system_jobs', 'account_sessions',
    'gallery_collections', 'gallery_images', 'sell_items', 'invoices', 'inventory_items', 'inventory_movements',
];

// Allowlist of real columns per table (from api-php/schema.sql), used to filter
// untrusted dump rows (from JSON request bodies / uploaded ZIPs) before they are
// interpolated into SQL identifier lists in restore_tables_from_dump().
const MAINTENANCE_TABLE_COLUMNS = [
    'ponds' => ['id', 'name', 'location', 'status', 'unphotographed_fish_qty', 'notes', 'notes_date', 'created_at', 'updated_at'],
    'koi' => [
        'id', 'pond_id', 'code', 'name', 'variety', 'farm_name', 'breeder', 'bloodline', 'gender',
        'parent_type', 'image_url', 'birth_date', 'purchase_date', 'purchase_price', 'current_length_cm',
        'current_weight_g', 'status', 'notes', 'sale_price', 'parent_info', 'created_at', 'updated_at',
        'archived_at', 'archive_location',
    ],
    'koi_growth_logs' => ['id', 'koi_id', 'measured_at', 'length_cm', 'weight_g', 'image_url', 'notes', 'sort_order', 'created_at'],
    'pond_note_history' => ['id', 'pond_id', 'previous_notes', 'new_notes', 'created_at'],
    'pond_documentation' => [
        'id', 'pond_id', 'image_url', 'media_type', 'thumbnail_url', 'display_name', 'status', 'notes',
        'moved_to_gallery_at', 'created_at',
    ],
    'farm_reports' => [
        'id', 'report_type', 'report_date', 'pond_id', 'koi_id', 'reporter', 'qty', 'average_length_cm',
        'average_weight_g', 'result', 'notes', 'video_url', 'video_thumbnail_url', 'origin_location',
        'pond_entries', 'breeding_entries', 'koi_entries', 'reporter_entries', 'dominant_variety',
        'spectrum_sizes', 'spectrum_summary', 'validation_checks', 'media_entries', 'report_title',
        'batch_code', 'created_at', 'activity_data', 'destination_location', 'condition_entries', 'sorting_entries',
    ],
    'breeding_batches' => [
        'id', 'batch_code', 'session_name', 'breeding_date', 'male_koi_id', 'female_koi_id',
        'male_parent_entries', 'female_parent_entries', 'pond_id', 'spawning_method', 'status',
        'fry_count', 'notes', 'video_url', 'video_thumbnail_url', 'pond_entries', 'egg_weight_g',
        'media_entries', 'created_at', 'updated_at', 'spawning_started_at', 'fish_separated_at',
        'officer_name', 'last_update_date', 'larva_released_at',
    ],
    'accounts' => ['id', 'username', 'name', 'email', 'phone', 'password', 'role', 'status', 'avatar', 'cover', 'created_at', 'updated_at'],
    'media_assets' => ['id', 'url', 'file_path', 'segment', 'media_type', 'size_bytes', 'status', 'created_at', 'updated_at'],
    'media_references' => ['id', 'media_id', 'owner_type', 'owner_id', 'source_column', 'created_at'],
    'app_settings' => ['key', 'value', 'updated_at'],
    'system_notifications' => [
        'id', 'type', 'title', 'message', 'status', 'actor', 'role', 'action', 'target_id', 'target_label',
        'details', 'created_at', 'read_at', 'notification_cleared_at',
    ],
    'system_jobs' => ['id', 'type', 'title', 'status', 'message', 'progress', 'started_at', 'finished_at', 'created_at'],
    'account_sessions' => [
        'id', 'account_id', 'username', 'name', 'role', 'remember_device', 'ip_address', 'user_agent',
        'status', 'created_at', 'last_seen_at', 'expires_at', 'logged_out_at',
    ],
    'gallery_collections' => [
        'id', 'pond_id', 'title', 'segment_name', 'gallery_date', 'notes', 'source_type', 'source_id',
        'created_at', 'updated_at', 'archived_at',
    ],
    'gallery_images' => ['id', 'gallery_id', 'image_url', 'media_type', 'thumbnail_url', 'notes', 'sort_order', 'created_at'],
    'sell_items' => [
        'id', 'title', 'price', 'status', 'description', 'koi_ids', 'media_entries', 'documentation_entries', 'buyer', 'sold_at',
        'created_by', 'created_at', 'updated_at',
    ],
    'inventory_items' => [
        'id', 'name', 'kind', 'category', 'unit', 'image_url', 'min_stock', 'monthly_need', 'notes', 'archived_at',
        'created_by', 'created_at', 'updated_at',
    ],
    'inventory_movements' => [
        'id', 'item_id', 'type', 'qty', 'unit_price', 'total_price', 'supplier', 'movement_date', 'location',
        'koi_ids', 'notes', 'created_by', 'created_at',
    ],
    'invoices' => [
        'id', 'invoice_no', 'title', 'client_name', 'client_contact', 'invoice_date', 'due_date', 'status', 'items',
        'discount', 'total', 'sales_contact', 'bank_account', 'notes', 'payment_proofs', 'media_entries', 'created_by', 'created_at', 'updated_at',
    ],
];

// Scope of the ZIP system-backup/restore feature (GET /maintenance/backup.zip,
// POST /maintenance/restore-zip) — mirrors the original Node app's
// `systemBackupTables` exactly. Deliberately excludes accounts/account_sessions
// /system_notifications/system_jobs so restoring a system backup can never
// clobber logins or audit history.
// app_settings holds two kinds of rows. These belong to the SYSTEM data (the list of pond areas and its order, a one-time marker of the gallery);
// every other row is a SETTING of the program or of an account (brand identity, print settings, each account's theme) and travels with the
// account backup instead. The two stamps below are per device and are in neither backup.
const SYSTEM_SETTING_KEYS = ['pond_areas', 'pond_area_order', 'pond_area_colors', 'gallery_sources_backfill', 'breeding_parents_backfill', 'breeding_auto_indukan'];
const ACCOUNT_BACKUP_FORMAT = 'nishikigoi-account-backup';
const ACCOUNT_BACKUP_JSON = 'nishikigoi-account-backup.json';

function maintenance_account_setting_where(): string {
    $system = implode(', ', array_map(fn($key) => "'$key'", SYSTEM_SETTING_KEYS));
    return "`key` NOT IN ($system) AND `key` NOT IN ('last_backup_at', 'last_restore_at', 'last_account_backup_at', 'last_account_restore_at')";
}

const SYSTEM_BACKUP_TABLES = [
    'ponds', 'koi', 'koi_growth_logs', 'pond_note_history', 'pond_documentation',
    'gallery_collections', 'gallery_images', 'breeding_batches', 'farm_reports',
    'media_assets', 'media_references', 'app_settings', 'sell_items', 'invoices', 'inventory_items', 'inventory_movements',
];


// Backup ZIP filename timestamp: "2026-[09] september - rab 30 - 09'21"
// (year, bracketed month number + Indonesian month name, Indonesian day
// abbreviation + day number, 24h WIB time with no seconds, minutes marked
// with an apostrophe since ':' is not a valid Windows filename character).
function format_backup_filename_stamp(string $isoDate): string {
    $months = [1 => 'januari', 2 => 'februari', 3 => 'maret', 4 => 'april', 5 => 'mei', 6 => 'juni',
        7 => 'juli', 8 => 'agustus', 9 => 'september', 10 => 'oktober', 11 => 'november', 12 => 'desember'];
    $days = [0 => 'min', 1 => 'sen', 2 => 'sel', 3 => 'rab', 4 => 'kam', 5 => 'jum', 6 => 'sab'];
    $dt = new DateTime($isoDate);
    return $dt->format('Y') . '-[' . $dt->format('m') . '] ' . $months[(int)$dt->format('n')]
        . ' - ' . $days[(int)$dt->format('w')] . ' ' . (int)$dt->format('d')
        . ' - ' . $dt->format('H') . "'" . $dt->format('i');
}

// Queue (system_jobs) entries, same wording as the original Node server.
function create_system_job(string $type, string $title, string $message, int $progress = 0): int {
    execute(
        'INSERT INTO system_jobs (type, title, status, message, progress, started_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
        [$type, $title, 'running', $message, $progress]
    );
    return (int)db()->lastInsertId();
}

function finish_system_job(int $id, string $status, string $message): void {
    if ($id <= 0) return;
    execute(
        'UPDATE system_jobs SET status = ?, message = ?, progress = 100, finished_at = CURRENT_TIMESTAMP WHERE id = ?',
        [$status, mb_substr($message, 0, 1000), $id]
    );
}

// When the last system backup was made and the last backup was restored here (shown on Master Akun). Kept in app_settings, so
// restoring a backup or clearing the data puts them back afterwards: a backup from another device must not change them.
const MAINTENANCE_STAMP_KEYS = ['last_backup_at', 'last_restore_at', 'last_account_backup_at', 'last_account_restore_at'];

function maintenance_stamps(): array {
    $stamps = array_fill_keys(MAINTENANCE_STAMP_KEYS, '');
    foreach (query("SELECT `key`, value FROM app_settings WHERE `key` IN ('last_backup_at', 'last_restore_at', 'last_account_backup_at', 'last_account_restore_at')") as $row) {
        $stamps[$row['key']] = (string)$row['value'];
    }
    return $stamps;
}

function maintenance_account_stamps(): array { return maintenance_stamps(); }

function maintenance_set_stamp(string $key, ?string $value): void {
    if (!in_array($key, MAINTENANCE_STAMP_KEYS, true)) return;
    if ($value === null || $value === '') {
        execute('DELETE FROM app_settings WHERE `key` = ?', [$key]);
        return;
    }
    execute('INSERT INTO app_settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)', [$key, $value]);
}

function dump_all_tables(): array {
    $dump = [];
    foreach (MAINTENANCE_TABLES as $table) {
        $dump[$table] = query("SELECT * FROM `$table`");
    }
    return $dump;
}

function dump_system_backup_tables(): array {
    $dump = [];
    foreach (SYSTEM_BACKUP_TABLES as $table) {
        $dump[$table] = $table === 'app_settings'
            ? query("SELECT * FROM `$table` WHERE `key` IN ('" . implode("', '", SYSTEM_SETTING_KEYS) . "') ORDER BY `key`")
            : query("SELECT * FROM `$table` ORDER BY id");
    }
    return $dump;
}

// $appSettingKeys: when given, only those rows of app_settings are replaced (a system restore must leave the program's settings and the
// accounts' themes alone, whatever an older backup file still carries)
function restore_tables_from_dump(array $dump, array $tables = MAINTENANCE_TABLES, ?array $appSettingKeys = null): void {
    db()->beginTransaction();
    try {
        execute('SET FOREIGN_KEY_CHECKS=0');
        try {
            foreach (array_reverse($tables) as $table) {
                if ($table === 'app_settings' && $appSettingKeys !== null) {
                    if ($appSettingKeys) execute('DELETE FROM app_settings WHERE `key` IN (' . implode(', ', array_fill(0, count($appSettingKeys), '?')) . ')', array_values($appSettingKeys));
                    continue;
                }
                execute("DELETE FROM `$table`");
            }
            foreach ($tables as $table) {
                $allowedColumns = MAINTENANCE_TABLE_COLUMNS[$table] ?? [];
                $rows = $dump[$table] ?? [];
                foreach ($rows as $row) {
                    if (!is_array($row)) continue;
                    if ($table === 'app_settings' && $appSettingKeys !== null && !in_array((string)($row['key'] ?? ''), $appSettingKeys, true)) continue;
                    // Only keep keys that are real columns of this table — dump rows come
                    // from untrusted JSON (request body or uploaded ZIP), so any unknown
                    // key must never reach the SQL identifier list.
                    $row = array_intersect_key($row, array_flip($allowedColumns));
                    if (empty($row)) continue;
                    $columns = array_keys($row);
                    $placeholders = implode(', ', array_fill(0, count($columns), '?'));
                    $columnList = implode(', ', array_map(fn($c) => "`$c`", $columns));
                    execute("INSERT INTO `$table` ($columnList) VALUES ($placeholders)", array_values($row));
                }
            }
        } finally {
            execute('SET FOREIGN_KEY_CHECKS=1');
        }
        db()->commit();
        koi_renumber();   // restored fish arrive without a stored number
        koi_facets_cache_clear();
    } catch (Throwable $e) {
        db()->rollBack();
        throw $e;
    }
}

// ---- the work itself ---------------------------------------------------------------------------------------------------
//
// Each of these runs the same way whether a request calls it (old buttons, small data) or the background worker does. An error
// the user should read is thrown as MaintenanceError; its code is the HTTP status a route answers with.

class MaintenanceError extends RuntimeException {}

// Every media file that belongs in a backup or a clean-up scan as [path, size]: all of the storage except the thumbnails,
// which are made again whenever somebody asks for them.
function maintenance_media_files(): array {
    $files = [];
    foreach (storage_list() as [$rel, $size]) {
        if (str_starts_with($rel, '_thumbs/')) continue;
        $files[] = [$rel, $size];
    }
    return $files;
}

// Builds the system backup ZIP in a temporary file. $emit gets the same events the old streaming backup sent
// (['type' => 'progress', 'current' => n, 'total' => m] and ['type' => 'compressing']). Returns [zip path, file name, media count].
function maintenance_build_backup_zip(?callable $emit = null): array {
    $emit = $emit ?? function (array $event) {};
    $config = require __DIR__ . '/../config.php';
    $exportedAt = date('c');

    // with the photos in a bucket a backup can leave them there (the bucket is their copy): 'backup_media' => false
    $includeMedia = storage_driver() === 'local' || ($config['backup_media'] ?? true) !== false;
    $files = $includeMedia ? maintenance_media_files() : [];

    $tmpZip = tempnam(sys_get_temp_dir(), 'koi_backup_') . '.zip';
    $downloaded = [];
    try {
        $zip = new ZipArchive();
        if ($zip->open($tmpZip, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) throw new MaintenanceError('Backup gagal dibuat', 500);

        $mediaFiles = [];
        $total = count($files);
        $totalBytes = 0;
        foreach ($files as [, $fileSize]) $totalBytes += (int)$fileSize;
        $doneBytes = 0;
        foreach ($files as $index => [$rel, $size]) {
            if (storage_driver() === 'local') {
                $zip->addFile(storage_local_path($rel), 'uploads/' . $rel);
            } else {
                $fetched = storage_fetch_to_file($rel);   // a bucket file has to be downloaded to go into the ZIP
                if (!$fetched) continue;
                $downloaded[] = $fetched[0];
                $zip->addFile($fetched[0], 'uploads/' . $rel);
            }
            $mediaFiles[] = ['path' => $rel, 'size_bytes' => $size];
            $doneBytes += (int)$size;
            if ($index % 20 === 0 || $index === $total - 1) $emit(['type' => 'progress', 'current' => $index + 1, 'total' => $total, 'bytes' => $doneBytes, 'total_bytes' => $totalBytes]);
        }

        $emit(['type' => 'compressing']);
        $payload = [
            'app' => 'Nishikigoi',
            'format' => 'nishikigoi-system-backup',
            'version' => 2,
            'exported_at' => $exportedAt,
            'tables' => dump_system_backup_tables(),
            'media_files' => $mediaFiles,
        ];
        $zip->addFromString('nishikigoi-backup.json', json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        $zip->close();
        maintenance_set_stamp('last_backup_at', $exportedAt);
    } catch (Throwable $e) {
        if (file_exists($tmpZip)) @unlink($tmpZip);
        throw $e;
    } finally {
        foreach ($downloaded as $path) @unlink($path);
    }
    return [$tmpZip, 'nishikigoi-backup-' . format_backup_filename_stamp($exportedAt) . '.zip', count($mediaFiles)];
}

// Puts every uploads/... file of a backup ZIP into the storage (zip-slip checked, dangerous extensions neutered). Returns how many were restored.
function maintenance_restore_zip_media(ZipArchive $zip, string $zipPath, callable $emit): int {
        $entries = [];
        $entrySizes = [];
        $totalBytes = 0;
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $name = $zip->getNameIndex($i);
            if (strpos($name, 'uploads/') === 0 && strlen($name) > strlen('uploads/') && substr($name, -1) !== '/') {
                $entries[] = $name;
                $stat = $zip->statIndex($i);
                $entrySizes[$name] = (int)($stat['size'] ?? 0);
                $totalBytes += $entrySizes[$name];
            }
        }

        $restored = 0;
        $total = count($entries);
        $doneBytes = 0;
        foreach ($entries as $index => $name) {
            $doneBytes += $entrySizes[$name];
            $relative = substr($name, strlen('uploads/'));

            // First-pass filter: reject any entry whose name contains a ".." path
            // segment (zip-slip) before touching the storage at all.
            $segments = explode('/', str_replace('\\', '/', $relative));
            if (in_array('..', $segments, true) || in_array('.', $segments, true)) continue;

            // Neuter dangerous extensions (.php, .svg, etc): a restored ZIP is untrusted input and, like a direct
            // upload, lands in the web-accessible uploads dir where Apache would otherwise execute or render it.
            $entryExt = strtolower(pathinfo($relative, PATHINFO_EXTENSION));
            $safeExt = sanitize_upload_extension($entryExt);
            if ($safeExt !== $entryExt) $relative = preg_replace('/\.[^.\/]*$/', '', $relative) . '.' . $safeExt;
            if (!storage_safe_path($relative)) continue;

            $tmp = tempnam(sys_get_temp_dir(), 'koi_restore_file_');
            try {
                if (copy('zip://' . $zipPath . '#' . $name, $tmp)) {
                    storage_put_file($relative, $tmp);
                    $restored++;
                }
            } finally {
                @unlink($tmp);
            }
            if ($index % 20 === 0 || $index === $total - 1) $emit(['type' => 'progress', 'current' => $index + 1, 'total' => $total, 'bytes' => $doneBytes, 'total_bytes' => $totalBytes]);
        }
    return $restored;
}

// ---- account backup: accounts + the program's settings + themes (separate from the system backup) -----------------------------
//
// Holds the accounts (with their password hashes: keep the file private), the settings rows of app_settings (brand identity, print settings,
// every account's theme) and the image files those rows and the accounts point to (profile photos, logos).
function maintenance_build_account_backup_zip(?callable $emit = null): array {
    $emit = $emit ?? function (array $event) {};
    $exportedAt = date('c');
    $accounts = query('SELECT * FROM accounts ORDER BY id');
    $settings = query('SELECT * FROM app_settings WHERE ' . maintenance_account_setting_where() . ' ORDER BY `key`');

    $urls = [];
    foreach (upload_urls_in_rows(array_merge($accounts, $settings)) as $url) $urls[$url] = true;
    $files = [];
    foreach (array_keys($urls) as $url) {
        $rel = substr($url, strlen('/api/uploads/'));
        if ($rel === '' || !storage_safe_path($rel) || !storage_exists($rel)) continue;
        $files[] = [$rel, (int)(storage_size($rel) ?? 0)];
    }

    $tmpZip = tempnam(sys_get_temp_dir(), 'koi_account_backup_') . '.zip';
    $downloaded = [];
    try {
        $zip = new ZipArchive();
        if ($zip->open($tmpZip, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) throw new MaintenanceError('Backup akun gagal dibuat', 500);
        $total = count($files);
        $totalBytes = 0;
        foreach ($files as [, $size]) $totalBytes += $size;
        $doneBytes = 0;
        $mediaFiles = [];
        foreach ($files as $index => [$rel, $size]) {
            if (storage_driver() === 'local') {
                $zip->addFile(storage_local_path($rel), 'uploads/' . $rel);
            } else {
                $fetched = storage_fetch_to_file($rel);
                if (!$fetched) continue;
                $downloaded[] = $fetched[0];
                $zip->addFile($fetched[0], 'uploads/' . $rel);
            }
            $mediaFiles[] = ['path' => $rel, 'size_bytes' => $size];
            $doneBytes += $size;
            $emit(['type' => 'progress', 'current' => $index + 1, 'total' => $total, 'bytes' => $doneBytes, 'total_bytes' => $totalBytes]);
        }
        $emit(['type' => 'compressing']);
        $zip->addFromString(ACCOUNT_BACKUP_JSON, json_encode([
            'app' => 'Nishikigoi',
            'format' => ACCOUNT_BACKUP_FORMAT,
            'version' => 1,
            'exported_at' => $exportedAt,
            'tables' => ['accounts' => $accounts, 'app_settings' => $settings],
            'media_files' => $mediaFiles,
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        $zip->close();
        maintenance_set_stamp('last_account_backup_at', $exportedAt);
    } catch (Throwable $e) {
        if (file_exists($tmpZip)) @unlink($tmpZip);
        throw $e;
    } finally {
        foreach ($downloaded as $path) @unlink($path);
    }
    return [$tmpZip, 'nishikigoi-backup-akun-' . format_backup_filename_stamp($exportedAt) . '.zip', count($accounts), count($settings)];
}

// Restores an account backup ZIP: replaces the accounts and the settings rows. Refuses a backup without a Master Admin (nobody could sign in).
function maintenance_restore_account_zip_file(string $zipPath, ?callable $emit = null): array {
    $emit = $emit ?? function (array $event) {};
    $zip = new ZipArchive();
    if ($zip->open($zipPath) !== true) throw new MaintenanceError('File ZIP tidak valid', 400);
    try {
        $json = $zip->getFromName(ACCOUNT_BACKUP_JSON);
        if ($json === false) throw new MaintenanceError('ZIP bukan backup akun Nishikigoi yang valid', 400);
        $backup = json_decode($json, true);
        unset($json);
        if (!is_array($backup) || ($backup['format'] ?? null) !== ACCOUNT_BACKUP_FORMAT || !isset($backup['tables']['accounts'])) {
            throw new MaintenanceError('Format backup akun tidak dikenali', 400);
        }
        $accounts = (array)$backup['tables']['accounts'];
        $settings = array_values(array_filter((array)($backup['tables']['app_settings'] ?? []), function ($row) {
            $key = is_array($row) ? (string)($row['key'] ?? '') : '';
            return $key !== '' && !in_array($key, SYSTEM_SETTING_KEYS, true)
                && !in_array($key, ['last_backup_at', 'last_restore_at', 'last_account_backup_at', 'last_account_restore_at'], true);
        }));
        $hasMaster = false;
        foreach ($accounts as $account) {
            if (is_array($account) && ($account['role'] ?? '') === 'Master Admin' && ($account['status'] ?? 'Active') === 'Active') $hasMaster = true;
        }
        if (!$hasMaster) throw new MaintenanceError('Backup akun ini tidak punya akun Master Admin yang aktif, jadi tidak dipulihkan (tidak akan ada yang bisa masuk).', 400);

        $emit(['type' => 'progress', 'stage' => 'tables']);
        $stamps = maintenance_stamps();
        $accountStamp = maintenance_account_stamps();
        db()->beginTransaction();
        try {
            execute('SET FOREIGN_KEY_CHECKS=0');
            try {
                execute('DELETE FROM accounts');
                execute('DELETE FROM app_settings WHERE ' . maintenance_account_setting_where());
                foreach (['accounts' => $accounts, 'app_settings' => $settings] as $table => $rows) {
                    $allowed = MAINTENANCE_TABLE_COLUMNS[$table] ?? [];
                    foreach ($rows as $row) {
                        if (!is_array($row)) continue;
                        $row = array_intersect_key($row, array_flip($allowed));
                        if (empty($row)) continue;
                        $columns = array_keys($row);
                        execute("INSERT INTO `$table` (" . implode(', ', array_map(fn($c) => "`$c`", $columns)) . ') VALUES (' . implode(', ', array_fill(0, count($columns), '?')) . ')', array_values($row));
                    }
                }
            } finally {
                execute('SET FOREIGN_KEY_CHECKS=1');
            }
            db()->commit();
        } catch (Throwable $e) {
            db()->rollBack();
            throw $e;
        }
        // the dates of the device the backup came from must not replace this device's own
        foreach (MAINTENANCE_STAMP_KEYS as $key) maintenance_set_stamp($key, $key === 'last_account_restore_at' ? date('c') : ($stamps[$key] ?? $accountStamp[$key] ?? ''));
        $restored = maintenance_restore_zip_media($zip, $zipPath, $emit);
    } finally {
        $zip->close();
    }
    return ['restored_accounts' => count($accounts), 'restored_settings' => count($settings), 'restored_files' => $restored];
}

// Restores the tables and media files of a backup ZIP. Returns ['restored_files' => n]. Throws MaintenanceError(…, 400) for a ZIP
// that is not a Nishikigoi backup.
function maintenance_restore_zip_file(string $zipPath, ?callable $emit = null): array {
    $emit = $emit ?? function (array $event) {};
    $zip = new ZipArchive();
    if ($zip->open($zipPath) !== true) throw new MaintenanceError('File ZIP tidak valid', 400);
    try {
        $dumpJson = $zip->getFromName('nishikigoi-backup.json');
        if ($dumpJson === false) throw new MaintenanceError('ZIP bukan backup Nishikigoi yang valid', 400);
        $backup = json_decode($dumpJson, true);
        unset($dumpJson);
        if (!is_array($backup) || ($backup['format'] ?? null) !== 'nishikigoi-system-backup' || !isset($backup['tables'])) {
            throw new MaintenanceError('Format backup tidak dikenali', 400);
        }

        $emit(['type' => 'progress', 'stage' => 'tables']);
        $stamps = maintenance_stamps();
        restore_tables_from_dump($backup['tables'], SYSTEM_BACKUP_TABLES, SYSTEM_SETTING_KEYS);
        unset($backup);
        // the backup carries the dates of the device it came from: put this device's own back, and note this restore
        maintenance_set_stamp('last_backup_at', $stamps['last_backup_at']);
        maintenance_set_stamp('last_restore_at', date('c'));

        $restored = maintenance_restore_zip_media($zip, $zipPath, $emit);
    } finally {
        $zip->close();
    }
    return ['restored_files' => $restored];
}

// What the "Bersihkan File Tidak Terpakai" button does: files nothing refers to. $dryRun only counts.
function maintenance_cleanup_uploads(bool $dryRun, ?callable $emit = null): array {
    $usedSet = referenced_upload_urls();
    $totalFiles = 0;
    $unused = [];
    $unusedBytes = 0;
    foreach (maintenance_media_files() as [$rel, $size]) {
        $totalFiles++;
        if (!isset($usedSet['/api/uploads/' . $rel])) {
            $unused[] = $rel;
            $unusedBytes += $size;
        }
    }

    // Safety net: if no data refers to any file at all but files exist, the scan itself is suspect.
    if ($totalFiles > 0 && count($usedSet) === 0 && farm_data_exists()) {
        throw new MaintenanceError('Pemeriksaan data tidak menemukan satu pun foto terpakai, pembersihan dibatalkan demi keamanan.', 409);
    }

    $summary = [
        'ok' => true,
        'dry_run' => $dryRun,
        'total_files' => $totalFiles,
        'referenced' => count($usedSet),
        'unused' => count($unused),
        'unused_bytes' => $unusedBytes,
        'samples' => array_map(fn($rel) => 'uploads/' . $rel, array_slice($unused, 0, 10)),
    ];
    if ($dryRun) return $summary;

    $removed = 0;
    foreach ($unused as $index => $rel) {
        if (storage_delete($rel)) {
            $removed++;
            foreach (THUMBNAIL_WIDTHS as $width) storage_delete('_thumbs/' . $width . '/' . $rel . '.jpg');
        }
        if ($emit && ($index % 50 === 0 || $index === count($unused) - 1)) $emit(['type' => 'progress', 'current' => $index + 1, 'total' => count($unused)]);
    }
    $summary['removed'] = $removed;
    return $summary;
}

// Registers every file in the storage that has no media_assets row yet.
function maintenance_sync_media_assets(): array {
    $existing = array_flip(array_column(query('SELECT url FROM media_assets'), 'url'));
    $added = 0;
    foreach (maintenance_media_files() as [$rel, $size]) {
        $url = '/api/uploads/' . $rel;
        if (isset($existing[$url])) continue;
        $ext = strtolower(pathinfo($rel, PATHINFO_EXTENSION));
        $mediaType = in_array($ext, ['mp4', 'mov', 'webm']) ? 'video' : 'image';
        execute(
            'INSERT INTO media_assets (url, file_path, segment, media_type, size_bytes, status) VALUES (?, ?, ?, ?, ?, ?)',
            [$url, 'uploads/' . $rel, basename(dirname($rel)), $mediaType, $size, 'active']
        );
        $added++;
    }
    return ['ok' => true, 'added' => $added];
}

// Copies the files of the local uploads folder into the bucket (storage_driver must be 's3'), checks every copy by its size,
// and only then, if asked, removes the local file. Safe to run again: files already in the bucket with the same size are skipped.
function maintenance_storage_migrate(bool $deleteLocal, ?callable $emit = null): array {
    if (storage_driver() !== 's3') throw new MaintenanceError("Atur 'storage_driver' => 's3' di config.local.php dulu.", 409);
    $files = [];
    foreach (storage_local_list() as [$rel, $size]) {
        if (!str_starts_with($rel, '_thumbs/')) $files[] = [$rel, $size];
    }
    $total = count($files);
    $result = ['total' => $total, 'copied' => 0, 'already_there' => 0, 'failed' => 0, 'deleted_local' => 0, 'bytes' => 0, 'errors' => []];
    foreach ($files as $index => [$rel, $size]) {
        try {
            $path = storage_local_path($rel);
            if (storage_size($rel) === $size) {
                $result['already_there']++;
            } else {
                storage_put_file($rel, $path);
                if (storage_size($rel) !== $size) throw new RuntimeException('ukuran di bucket berbeda setelah disalin');
                $result['copied']++;
                $result['bytes'] += $size;
            }
            if ($deleteLocal && @unlink($path)) $result['deleted_local']++;
        } catch (Throwable $e) {
            $result['failed']++;
            if (count($result['errors']) < 10) $result['errors'][] = $rel . ': ' . $e->getMessage();
        }
        if ($emit && ($index % 10 === 0 || $index === $total - 1)) $emit(['type' => 'progress', 'current' => $index + 1, 'total' => $total]);
    }
    return $result;
}

// Housekeeping of the tables that only grow because the program runs, never of farm data: closed sessions and login attempts, old
// Queue rows, request counters, leftover job files. Farm data (fish, ponds, reports, photos ...) is never touched here.
// Defaults keep a year of login history and Queue; 'retention_days' => ['sessions' => 365, ...] in config.local.php changes that.
function maintenance_retention(): array {
    $config = require __DIR__ . '/../config.php';
    $days = array_replace(['sessions' => 365, 'login_attempts' => 90, 'jobs' => 365], (array)($config['retention_days'] ?? []));
    $result = [];
    $result['sessions'] = execute(
        "DELETE FROM account_sessions WHERE (status <> 'active' OR expires_at < NOW()) AND COALESCE(logged_out_at, expires_at, last_seen_at, created_at) < DATE_SUB(NOW(), INTERVAL " . (int)$days['sessions'] . ' DAY)'
    )->rowCount();
    $result['login_attempts'] = execute('DELETE FROM login_attempts WHERE created_at < DATE_SUB(NOW(), INTERVAL ' . (int)$days['login_attempts'] . ' DAY)')->rowCount();
    $result['jobs'] = execute("DELETE FROM system_jobs WHERE status IN ('completed', 'failed') AND finished_at < DATE_SUB(NOW(), INTERVAL " . (int)$days['jobs'] . ' DAY)')->rowCount();
    $result['rate_limits'] = execute('DELETE FROM api_rate_limits WHERE window_start < ?', [(int)floor(time() / 60) - 5])->rowCount();
    return $result;
}

// Makes the thumbnails of every photo now (they are otherwise made the first time somebody opens a list).
function maintenance_warm_thumbnails(?callable $emit = null, array $widths = [240, 480]): array {
    $images = [];
    foreach (maintenance_media_files() as [$rel, $size]) {
        if (in_array(strtolower(pathinfo($rel, PATHINFO_EXTENSION)), ['jpg', 'jpeg', 'png', 'webp', 'gif'], true)) $images[] = $rel;
    }
    $total = count($images);
    $result = ['photos' => $total, 'made' => 0, 'already_there' => 0, 'skipped' => 0];
    foreach ($images as $index => $rel) {
        foreach ($widths as $width) {
            $thumb = thumbnail_path($rel, $width);
            if (storage_exists($thumb)) { $result['already_there']++; continue; }
            $bytes = thumbnail_generate($rel, $width);
            if ($bytes === null) { $result['skipped']++; continue; }
            storage_put($thumb, $bytes);
            $result['made']++;
        }
        if ($emit && ($index % 10 === 0 || $index === $total - 1)) $emit(['type' => 'progress', 'current' => $index + 1, 'total' => $total]);
    }
    return $result;
}

// ---- Program files nobody needs any more --------------------------------------------------------------------------------------------
// Every release gives a changed script or stylesheet a new name (so the browser never shows an old copy). The old names stay behind: in
// the program folder of a clone until the update that removes them, and always on a phone (an update package adds files, it never
// removes one). This finds them (a file in the site's _astro folder that no page, stylesheet or script mentions), plus leftovers of
// the update (temporary git files), old slow-request logs, and the garbage git keeps after many updates. $dryRun only measures.
// A file that git itself tracks is left alone: deleting it would make the next update stop at "local changes"; the update that
// removes it from the program does it on its own.
function maintenance_dir_size(string $dir): int {
    $total = 0;
    if (!is_dir($dir)) return 0;
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS));
    foreach ($it as $file) {
        if ($file->isFile()) $total += (int)$file->getSize();
    }
    return $total;
}

function maintenance_web_root(): ?string {
    $root = dirname(__DIR__, 2);
    $candidates = [];
    $doc = (string)($_SERVER['DOCUMENT_ROOT'] ?? '');
    if ($doc !== '') $candidates[] = $doc;
    $candidates[] = $root . '/app/public/Nishikigoi-beta/preview/dist';
    $candidates[] = $root . '/htdocs';
    foreach ($candidates as $dir) {
        if (is_dir($dir . '/_astro') && is_file($dir . '/sw.js')) return rtrim(str_replace('\\', '/', (string)realpath($dir)), '/');
    }
    return null;
}

function maintenance_cleanup_program(bool $dryRun): array {
    $root = str_replace('\\', '/', dirname(__DIR__, 2));
    $web = maintenance_web_root();
    if ($web === null) throw new MaintenanceError('Folder situs tidak ditemukan.', 404);

    // everything that may name a script or stylesheet: pages, the files in _astro itself, shared scripts and the service worker
    $text = '';
    foreach (array_merge(glob($web . '/*.html') ?: [], glob($web . '/_astro/*') ?: [], glob($web . '/assets/*.js') ?: [], [$web . '/sw.js']) as $file) {
        if (is_file($file)) $text .= "\n" . (string)@file_get_contents($file);
    }
    $unused = [];
    foreach (glob($web . '/_astro/*') ?: [] as $file) {
        if (is_file($file) && strpos($text, basename($file)) === false) $unused[] = $file;
    }
    // files that git tracks stay (see above); the others go
    $tracked = [];
    $isRepo = is_dir($root . '/.git');
    if ($isRepo) {
        require_once __DIR__ . '/update.php';
        [$code, $out] = update_git(['ls-files', '--', ltrim(substr($web, strlen($root)), '/') . '/_astro'], 20);
        if ($code === 0) foreach (array_filter(explode("\n", $out)) as $line) $tracked[basename(trim($line))] = true;
    }
    $remove = array_values(array_filter($unused, fn($file) => !isset($tracked[basename($file)])));
    $keptByGit = count($unused) - count($remove);

    // leftovers of the update and old logs
    $junk = [];
    foreach (glob($root . '/storage/run/git-*') ?: [] as $file) {
        if (is_file($file) && filemtime($file) < time() - 3600) $junk[] = $file;
    }
    foreach (glob($root . '/storage/run/*.tmp') ?: [] as $file) {
        if (is_file($file) && filemtime($file) < time() - 3600) $junk[] = $file;
    }
    foreach (glob($root . '/storage/logs/*.log') ?: [] as $file) {
        if (is_file($file) && filemtime($file) < time() - 30 * 86400) $junk[] = $file;
    }

    $sum = function (array $files): int { $n = 0; foreach ($files as $file) $n += (int)@filesize($file); return $n; };
    $result = [
        'dry_run' => $dryRun,
        'unused_files' => count($remove),
        'unused_bytes' => $sum($remove),
        'kept_by_git_files' => $keptByGit,
        'kept_by_git_bytes' => $sum(array_filter($unused, fn($file) => isset($tracked[basename($file)]))),
        'junk_files' => count($junk),
        'junk_bytes' => $sum($junk),
        'samples' => array_map('basename', array_slice($remove, 0, 6)),
        'git' => $isRepo,
        'git_bytes_before' => $isRepo ? maintenance_dir_size($root . '/.git') : 0,
        'git_bytes_after' => null,
        'removed' => 0,
    ];
    if ($dryRun) return $result;

    foreach (array_merge($remove, $junk) as $file) {
        if (@unlink($file)) $result['removed']++;
    }
    if ($isRepo) {
        // the garbage git keeps after many updates (objects nothing points to any more)
        require_once __DIR__ . '/update.php';
        update_git(['gc', '--prune=now', '--quiet'], 180);
        $result['git_bytes_after'] = maintenance_dir_size($root . '/.git');
    }
    return $result;
}
