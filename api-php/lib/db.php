<?php
// api-php/lib/db.php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/cache.php';

const KOI_SCHEMA_REV = 20261101;

// PHP 8.5 renamed the MySQL driver constants (Pdo\Mysql::ATTR_*); older versions only know PDO::MYSQL_ATTR_*.
function koi_pdo_init_command(): int {
    return class_exists('Pdo\\Mysql') ? constant('Pdo\\Mysql::ATTR_INIT_COMMAND') : PDO::MYSQL_ATTR_INIT_COMMAND;
}

// What every connection sets first: the time zone, and NO_ZERO_IN_DATE switched off. The program lets a date be known only in part
// (just the year, or year and month): the day or month that is not known is stored as 00 (2025-00-00, 2025-03-00), which MySQL
// refuses while that mode is on. Such dates still sort and compare correctly as text and with YEAR().
function koi_session_init_sql(): string {
    return "SET time_zone = '" . date('P') . "', sql_mode = REPLACE(REPLACE(@@sql_mode, 'NO_ZERO_IN_DATE', ''), 'NO_ZERO_DATE', '')";
}

function db(): PDO {
    static $pdo = null;
    if ($pdo !== null) return $pdo;

    $config = require __DIR__ . '/../config.php';
    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
        $config['db_host'],
        $config['db_port'],
        $config['db_name']
    );

    // Opening a MySQL connection costs about 15 ms, more than most requests need for their own work. A persistent connection is
    // kept by the PHP process and reused by the next request. Always safe in the single-process server of Termux (cli-server);
    // on Apache / PHP-FPM it holds one connection per worker, so switch it on ('db_persistent' => true in config.local.php)
    // only when the number of workers stays below MySQL's max_connections.
    $persistent = array_key_exists('db_persistent', $config) ? (bool)$config['db_persistent'] : PHP_SAPI === 'cli-server';
    $pdo = new PDO($dsn, $config['db_user'], $config['db_pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::ATTR_PERSISTENT => $persistent,
        koi_pdo_init_command() => koi_session_init_sql(),
    ]);
    if ($persistent) {
        // a reused connection must start clean: nothing left open or switched off by a request that died half way
        if ($pdo->inTransaction()) $pdo->rollBack();
        $pdo->exec('SET FOREIGN_KEY_CHECKS=1');
    }

    // About twenty cheap checks that every table and column is there. They only need to run again after a program update, so once
    // they passed the shared cache remembers it for a few minutes (KOI_SCHEMA_REV: raise it when an ensure_* function is added).
    // the key names the database too: two programs on one computer (or a database made again from nothing) must each run their own checks
    $schemaKey = 'schema-ok:' . KOI_SCHEMA_REV . ':' . md5($config['db_host'] . ':' . $config['db_port'] . ':' . $config['db_name'] . ':' . __DIR__);
    if (cache_get($schemaKey) !== true) {
        ensure_all_schemas($pdo);
        cache_set($schemaKey, true, 300);
    }

    return $pdo;
}

// Connection for reads that may be a little behind (lists, searches): a read replica when 'db_read_host' is set, otherwise the
// main database. A request that follows a write by this browser within 3 seconds reads the main database anyway (cookie koi_rw,
// set by execute()), so a list reloaded right after saving never shows the old data.
function db_read(): PDO {
    static $replica = null;
    $config = require __DIR__ . '/../config.php';
    if (empty($config['db_read_host']) || db_in_transaction() || !empty($_COOKIE['koi_rw'])) return db();
    if ($replica !== null) return $replica;
    try {
        $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $config['db_read_host'], (int)($config['db_read_port'] ?? $config['db_port']), $config['db_name']);
        $replica = new PDO($dsn, $config['db_read_user'] ?? $config['db_user'], $config['db_read_pass'] ?? $config['db_pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            koi_pdo_init_command() => koi_session_init_sql(),
        ]);
    } catch (Throwable $e) {
        error_log('[nishikigoi-api] read replica unreachable, using the main database: ' . $e->getMessage());
        $replica = db();   // never fail a read because the replica is down
    }
    return $replica;
}

function db_in_transaction(): bool {
    return db()->inTransaction();
}

// Like query(), for reads that tolerate replica lag.
function query_read(string $sql, array $params = []): array {
    $stmt = db_read()->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll();
}

function ensure_all_schemas(PDO $pdo): void {
    ensure_archive_schema($pdo);
    ensure_koi_order_index($pdo);
    ensure_koi_seq_schema($pdo);
    ensure_koi_area_schema($pdo);
    ensure_jobs_schema($pdo);
    ensure_messages_schema($pdo);
    ensure_message_prefs_schema($pdo);
    ensure_posts_schema($pdo);
    ensure_drafts_schema($pdo);
    ensure_gallery_archive_schema($pdo);
    ensure_activity_report_schema($pdo);
    ensure_breeding_extra_dates_schema($pdo);
    ensure_breeding_larva_schema($pdo);
    ensure_report_panen_schema($pdo);
    ensure_security_schema($pdo);
    ensure_pond_notes_date_schema($pdo);
    ensure_activity_updated_schema($pdo);
    ensure_sell_schema($pdo);
    ensure_invoice_schema($pdo);
    ensure_inventory_schema($pdo);
    ensure_accounts_phone_schema($pdo);
    ensure_accounts_cover_schema($pdo);
    ensure_breeding_officer_schema($pdo);
}

// Login history/lockout and the per-IP request counter (see lib/security.php).
function ensure_security_schema(PDO $pdo): void {
    try {
        if ($pdo->query("SHOW TABLES LIKE 'login_attempts'")->fetch()) return;
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS login_attempts (
                id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(100) NOT NULL DEFAULT "",
                ip_address VARCHAR(45) NOT NULL DEFAULT "",
                success TINYINT(1) NOT NULL DEFAULT 0,
                user_agent VARCHAR(255) NOT NULL DEFAULT "",
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_login_ip_time (ip_address, created_at),
                INDEX idx_login_user_time (username, created_at)
            ) ENGINE=InnoDB'
        );
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS api_rate_limits (
                ip VARCHAR(45) NOT NULL,
                window_start INT UNSIGNED NOT NULL,
                hits INT UNSIGNED NOT NULL DEFAULT 0,
                PRIMARY KEY (ip, window_start)
            ) ENGINE=InnoDB'
        );
    } catch (Throwable $e) {
        // Another request may be creating the tables at the same moment.
    }
}

// Data Kolam: the date shown beside "Catatan Formulir" (day - [month] Month - year).
// "Aktivitas terbaru" of the Dashboard shows edits too: these tables only knew when a row was made. updated_at starts as the creation time
// of every existing row and moves on every later change (rows made from now on start empty: made and changed are the same moment).
function ensure_activity_updated_schema(PDO $pdo): void {
    foreach (['farm_reports', 'pond_documentation', 'koi_growth_logs'] as $table) {
        try {
            if ($pdo->query("SHOW COLUMNS FROM $table LIKE 'updated_at'")->fetch()) continue;
            $pdo->exec("ALTER TABLE $table ADD COLUMN updated_at DATETIME NULL");
            $pdo->exec("UPDATE $table SET updated_at = created_at");
            $pdo->exec("ALTER TABLE $table MODIFY updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP");
        } catch (Throwable $e) {
            // Another request may have added the column first.
        }
    }
}

function ensure_pond_notes_date_schema(PDO $pdo): void {
    try {
        if ($pdo->query("SHOW COLUMNS FROM ponds LIKE 'notes_date'")->fetch()) return;
        $pdo->exec('ALTER TABLE ponds ADD COLUMN notes_date DATE NULL');
    } catch (Throwable $e) {
        // Another request may have added the column first.
    }
}

// Adds the archive columns to an existing database (Laragon, Termux, restored copies)
// the first time it is used, so app updates never need a manual SQL import.
function ensure_archive_schema(PDO $pdo): void {
    try {
        if ($pdo->query("SHOW COLUMNS FROM koi LIKE 'archived_at'")->fetch()) return;
        $pdo->exec(
            'ALTER TABLE koi
                ADD COLUMN archived_at DATETIME NULL,
                ADD COLUMN archive_location VARCHAR(255) NULL,
                ADD INDEX idx_koi_archived_at (archived_at)'
        );
    } catch (Throwable $e) {
        // Another request may have added the columns first; anything else surfaces on the next query.
    }
}

// Index for the ordered, paged fish list (lib/koi_query.php): archive scope first, then creation order. With it the
// database finds a page of ids, counts a scope and numbers fish without reading the rows themselves.
function ensure_koi_order_index(PDO $pdo): void {
    try {
        if ($pdo->query("SHOW INDEX FROM koi WHERE Key_name = 'idx_koi_scope_order'")->fetch()) return;
        $pdo->exec('UPDATE koi SET created_at = NOW() WHERE created_at IS NULL');
        $pdo->exec('ALTER TABLE koi ADD INDEX idx_koi_scope_order (archived_at, created_at, id)');
    } catch (Throwable $e) {
        // Another request may have added it first; the list still works without the index, only slower.
    }
}

// "Nomor urut" of a fish = its position by creation time among the fish of the same kind (active, or archived), stored in
// koi.seq so a page never has to count rows to show it. The number is the position in the list and it can be moved freely
// (POST /koi/move-seq): renumbering closes the gaps in the stored order and only places fish without a number (seq = 0: new,
// restored, archived or unarchived) last, in the order they were created. Everything that adds, removes, archives or restores fish keeps it
// right (koi_append_seq / koi_renumber); a fish that arrives without a number (seq = 0) makes the next request renumber.
function ensure_koi_seq_schema(PDO $pdo): void {
    try {
        $missing = !$pdo->query("SHOW COLUMNS FROM koi LIKE 'seq'")->fetch();
        if ($missing) {
            $pdo->exec('ALTER TABLE koi ADD COLUMN seq INT UNSIGNED NOT NULL DEFAULT 0, ADD INDEX idx_koi_scope_seq (archived_at, seq), ADD INDEX idx_koi_seq (seq)');
        }
        if ($missing || $pdo->query('SELECT 1 FROM koi WHERE seq = 0 LIMIT 1')->fetch()) koi_renumber($pdo);
    } catch (Throwable $e) {
        // Another request may be doing the same; the list falls back to seq = 0 until the next request.
    }
}

// koi.area: the area a fish is in when nobody checked its exact pond. With a pond, the pond's location is the area.
function ensure_koi_area_schema(PDO $pdo): void {
    try {
        if ($pdo->query("SHOW COLUMNS FROM koi LIKE 'area'")->fetch()) return;
        $pdo->exec('ALTER TABLE koi ADD COLUMN area VARCHAR(255) NULL');
    } catch (Throwable $e) {
        // Another request may have added the column first.
    }
}

// Numbers every fish again (one statement, only the rows whose number changed are written; updated_at is left alone).
function koi_renumber(?PDO $pdo = null): void {
    ($pdo ?: db())->exec(
        'UPDATE koi JOIN (
             SELECT id, ROW_NUMBER() OVER (PARTITION BY (archived_at IS NOT NULL) ORDER BY (seq = 0), seq, created_at, id) AS rn FROM koi
         ) numbered ON numbered.id = koi.id
         SET koi.seq = numbered.rn, koi.updated_at = koi.updated_at
         WHERE koi.seq <> numbered.rn'
    );
}

// A new fish is the newest one, so it simply gets the next number (no renumbering of the others).
function koi_append_seq(int $id): void {
    execute(
        'UPDATE koi SET seq = (SELECT next_seq FROM (SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq FROM koi WHERE archived_at IS NULL AND id <> ?) last_seq),
                updated_at = updated_at
         WHERE id = ?',
        [$id, $id]
    );
}

// Background jobs (lib/jobs.php) keep their options and result in the Queue table, and report that they are alive.
function ensure_jobs_schema(PDO $pdo): void {
    try {
        if ($pdo->query("SHOW COLUMNS FROM system_jobs LIKE 'payload'")->fetch()) return;
        $pdo->exec('ALTER TABLE system_jobs ADD COLUMN payload MEDIUMTEXT NULL, ADD COLUMN result MEDIUMTEXT NULL, ADD COLUMN heartbeat_at DATETIME NULL');
    } catch (Throwable $e) {
        // Another request may have added them first.
    }
}

// Tables for the encrypted account-to-account messages. No foreign keys to accounts on purpose,
// so restoring or editing accounts can never wipe conversations.
function ensure_messages_schema(PDO $pdo): void {
    try {
        if ($pdo->query("SHOW TABLES LIKE 'message_attachments'")->fetch()) return;
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS messages (
                id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                sender_id INT UNSIGNED NOT NULL,
                recipient_id INT UNSIGNED NOT NULL,
                body_enc MEDIUMTEXT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                read_at DATETIME NULL,
                deleted_at DATETIME NULL,
                INDEX idx_messages_pair (sender_id, recipient_id, id),
                INDEX idx_messages_recipient (recipient_id, read_at)
            ) ENGINE=InnoDB'
        );
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS message_attachments (
                id CHAR(32) PRIMARY KEY,
                message_id BIGINT UNSIGNED NOT NULL,
                mime VARCHAR(50) NOT NULL,
                size_bytes INT UNSIGNED NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_message_attachments_message (message_id),
                FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
            ) ENGINE=InnoDB'
        );
    } catch (Throwable $e) {
        // Another request may be creating the tables at the same moment.
    }
}

// Per account and conversation: pinned, muted, marked as unread, and "deleted for me" (messages up to cleared_before are hidden from
// this account only; the other person keeps them). Rows are never needed for a conversation that uses the defaults.
function ensure_message_prefs_schema(PDO $pdo): void {
    try {
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS message_conversation_prefs (
                account_id INT UNSIGNED NOT NULL,
                partner_id INT UNSIGNED NOT NULL,
                pinned TINYINT(1) NOT NULL DEFAULT 0,
                muted TINYINT(1) NOT NULL DEFAULT 0,
                marked_unread TINYINT(1) NOT NULL DEFAULT 0,
                cleared_before BIGINT UNSIGNED NOT NULL DEFAULT 0,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (account_id, partner_id)
            ) ENGINE=InnoDB'
        );
    } catch (Throwable $e) {
        // Another request may be creating the table at the same moment.
    }
}

// Posts, comments (a post with parent_id), their pictures and likes. No foreign key to accounts on purpose, like the messages:
// restoring or editing accounts can never wipe them. Not part of the system backup (accounts are not either).
function ensure_posts_schema(PDO $pdo): void {
    try {
        if ($pdo->query("SHOW TABLES LIKE 'post_likes'")->fetch()) return;
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS posts (
                id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                author_id INT UNSIGNED NOT NULL,
                parent_id BIGINT UNSIGNED NULL,
                body TEXT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_posts_author (author_id, parent_id, id),
                INDEX idx_posts_parent (parent_id, id)
            ) ENGINE=InnoDB'
        );
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS post_images (
                id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                post_id BIGINT UNSIGNED NOT NULL,
                url VARCHAR(500) NOT NULL,
                position TINYINT UNSIGNED NOT NULL DEFAULT 0,
                INDEX idx_post_images_post (post_id)
            ) ENGINE=InnoDB'
        );
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS post_likes (
                post_id BIGINT UNSIGNED NOT NULL,
                account_id INT UNSIGNED NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (post_id, account_id),
                INDEX idx_post_likes_account (account_id)
            ) ENGINE=InnoDB'
        );
    } catch (Throwable $e) {
        // Another request may be creating the tables at the same moment.
    }
}

// Laporan Kegiatan keeps its own fields (jenis, jam, bahan, kondisi air, status) as JSON.
function ensure_activity_report_schema(PDO $pdo): void {
    try {
        if ($pdo->query("SHOW COLUMNS FROM farm_reports LIKE 'activity_data'")->fetch()) return;
        $pdo->exec('ALTER TABLE farm_reports ADD COLUMN activity_data MEDIUMTEXT NULL');
    } catch (Throwable $e) {
        // Another request may have added the column first.
    }
}

// Gallery collections can be archived (hidden from the main list, restorable).
function ensure_gallery_archive_schema(PDO $pdo): void {
    try {
        if ($pdo->query("SHOW COLUMNS FROM gallery_collections LIKE 'archived_at'")->fetch()) return;
        $pdo->exec('ALTER TABLE gallery_collections ADD COLUMN archived_at DATETIME NULL');
    } catch (Throwable $e) {
        // Another request may have added the column first.
    }
}

// Breeding: separate dates for when spawning started and when the fish were
// separated from the eggs/burayak, matching the paper/PDF Laporan Pemijahan.
function ensure_breeding_extra_dates_schema(PDO $pdo): void {
    try {
        if ($pdo->query("SHOW COLUMNS FROM breeding_batches LIKE 'spawning_started_at'")->fetch()) return;
        $pdo->exec(
            'ALTER TABLE breeding_batches
                ADD COLUMN spawning_started_at DATE NULL,
                ADD COLUMN fish_separated_at DATE NULL'
        );
    } catch (Throwable $e) {
        // Another request may have added the columns first.
    }
}

// Breeding dates are Awal Pijah, Akhir Pijah and Tanggal Release Larva (+ Update Terakhir). breeding_date stays as the session
// date and now equals Awal Pijah, so older sessions that never had an Awal Pijah get it from the session date.
function ensure_breeding_larva_schema(PDO $pdo): void {
    try {
        if (!$pdo->query("SHOW COLUMNS FROM breeding_batches LIKE 'larva_released_at'")->fetch()) {
            $pdo->exec('ALTER TABLE breeding_batches ADD COLUMN larva_released_at DATE NULL');
        }
        $pdo->exec('UPDATE breeding_batches SET spawning_started_at = breeding_date WHERE spawning_started_at IS NULL');
    } catch (Throwable $e) {
        // Another request may be doing the same.
    }
}

// Panen (harvest) reports: destination pond, a condition/reject metrics list,
// and a categorized pond-transfer sorting list — matching the paper/PDF
// Formulir Panen. JSON is stored as TEXT, same convention as pond_entries etc.
function ensure_report_panen_schema(PDO $pdo): void {
    try {
        if ($pdo->query("SHOW COLUMNS FROM farm_reports LIKE 'destination_location'")->fetch()) return;
        $pdo->exec(
            'ALTER TABLE farm_reports
                ADD COLUMN destination_location VARCHAR(255) NULL,
                ADD COLUMN condition_entries TEXT NULL,
                ADD COLUMN sorting_entries TEXT NULL'
        );
    } catch (Throwable $e) {
        // Another request may have added the columns first.
    }
}

// Form drafts shown in the Queue menu (see handlers/drafts.php).
function ensure_drafts_schema(PDO $pdo): void {
    try {
        if ($pdo->query("SHOW TABLES LIKE 'form_drafts'")->fetch()) return;
        $pdo->exec(
            "CREATE TABLE IF NOT EXISTS form_drafts (
                id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                type VARCHAR(20) NOT NULL,
                name VARCHAR(120) NOT NULL DEFAULT '',
                summary VARCHAR(255) NOT NULL DEFAULT '',
                item_count INT UNSIGNED NOT NULL DEFAULT 0,
                data MEDIUMTEXT NOT NULL,
                created_by INT UNSIGNED NULL,
                created_by_name VARCHAR(255) NULL,
                updated_by INT UNSIGNED NULL,
                updated_by_name VARCHAR(255) NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_form_drafts_type (type, updated_at)
            ) ENGINE=InnoDB"
        );
    } catch (Throwable $e) {
        // Another request may be creating the table at the same moment.
    }
}

function query(string $sql, array $params = []): array {
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll();
}

function query_one(string $sql, array $params = []): ?array {
    $rows = query($sql, $params);
    return $rows[0] ?? null;
}

function execute(string $sql, array $params = []): PDOStatement {
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    // with a read replica, remember for 3 seconds that this browser just wrote (see db_read)
    static $marked = false;
    if (!$marked && PHP_SAPI !== 'cli' && !headers_sent() && preg_match('/^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i', $sql)) {
        $config = require __DIR__ . '/../config.php';
        if (!empty($config['db_read_host'])) {
            setcookie('koi_rw', '1', ['expires' => time() + 3, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax']);
            $marked = true;
        }
    }
    return $stmt;
}

function is_duplicate_error(PDOException $e): bool {
    return (int)($e->errorInfo[1] ?? 0) === 1062;
}

// Sell menu: fish (one, a package of several, or a manual combined photo) offered for sale.
// koi_ids is a JSON list of Data Ikan ids; media_entries is a JSON list of manual photos/videos.
function ensure_sell_schema(PDO $pdo): void {
    try {
        if ($pdo->query("SHOW TABLES LIKE 'sell_items'")->fetch()) {
            // documentation photos/videos (shown in Galeri on request) were added after the table first existed
            if (!$pdo->query("SHOW COLUMNS FROM sell_items LIKE 'documentation_entries'")->fetch()) {
                $pdo->exec('ALTER TABLE sell_items ADD COLUMN documentation_entries MEDIUMTEXT NULL AFTER media_entries');
            }
            return;
        }
        $pdo->exec(
            "CREATE TABLE IF NOT EXISTS sell_items (
                id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(200) NOT NULL,
                price DECIMAL(14,2) NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'available',
                description TEXT NULL,
                koi_ids TEXT NULL,
                media_entries MEDIUMTEXT NULL,
                documentation_entries MEDIUMTEXT NULL,
                buyer VARCHAR(150) NULL,
                sold_at DATE NULL,
                created_by VARCHAR(100) NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_sell_status (status)
            ) ENGINE=InnoDB"
        );
    } catch (Throwable $e) {
        // Another request may be creating the table at the same moment.
    }
}

// Inventaris (Etc > Inventaris): items bought for the farm and their history. Stock is calculated from the movements.
function ensure_inventory_schema(PDO $pdo): void {
    try {
        $pdo->exec(
            "CREATE TABLE IF NOT EXISTS inventory_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  kind VARCHAR(20) NOT NULL DEFAULT 'habis_pakai',
  category VARCHAR(100) NULL,
  unit VARCHAR(30) NULL,
  image_url VARCHAR(500) NULL,
  min_stock DECIMAL(14,2) NULL,
  monthly_need DECIMAL(14,2) NULL,
  notes TEXT NULL,
  archived_at DATETIME NULL,
  created_by VARCHAR(100) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_inventory_kind (kind),
  INDEX idx_inventory_name (name)
) ENGINE=InnoDB"
        );
        $pdo->exec(
            "CREATE TABLE IF NOT EXISTS inventory_movements (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  item_id INT UNSIGNED NOT NULL,
  type VARCHAR(20) NOT NULL,
  qty DECIMAL(14,2) NOT NULL DEFAULT 0,
  unit_price DECIMAL(14,2) NULL,
  total_price DECIMAL(14,2) NULL,
  supplier VARCHAR(200) NULL,
  movement_date DATE NOT NULL,
  location VARCHAR(200) NULL,
  koi_ids TEXT NULL,
  notes TEXT NULL,
  created_by VARCHAR(100) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_inventory_move_item (item_id, movement_date),
  INDEX idx_inventory_move_type (type)
) ENGINE=InnoDB"
        );
    } catch (Throwable $e) {
        // Another request may be creating the tables at the same moment.
    }
}

// Invoices (Penjualan > Invoice). items is a JSON list of lines (description, qty, unit_price and, when the line was
// picked from the app, koi_id or sell_id); total is calculated by the server from the lines and the discount.
function ensure_invoice_schema(PDO $pdo): void {
    try {
        if ($pdo->query("SHOW TABLES LIKE 'invoices'")->fetch()) {
            // proof-of-transfer photos were added after the table first existed
            if (!$pdo->query("SHOW COLUMNS FROM invoices LIKE 'payment_proofs'")->fetch()) {
                $pdo->exec('ALTER TABLE invoices ADD COLUMN payment_proofs MEDIUMTEXT NULL AFTER notes');
            }
            // documentation photos/videos (shown in Galeri on request) came later still
            if (!$pdo->query("SHOW COLUMNS FROM invoices LIKE 'media_entries'")->fetch()) {
                $pdo->exec('ALTER TABLE invoices ADD COLUMN media_entries MEDIUMTEXT NULL AFTER payment_proofs');
            }
            // a discount may be given as a percent of the subtotal (discount_percent); discount stays the amount in rupiah
            if (!$pdo->query("SHOW COLUMNS FROM invoices LIKE 'discount_percent'")->fetch()) {
                $pdo->exec('ALTER TABLE invoices ADD COLUMN discount_percent DECIMAL(5,1) NULL AFTER discount');
            }
            // the discount as it was typed (50.000, 10%, 10% 50.000): the amount is worked out again whenever the lines change
            if (!$pdo->query("SHOW COLUMNS FROM invoices LIKE 'discount_text'")->fetch()) {
                $pdo->exec('ALTER TABLE invoices ADD COLUMN discount_text VARCHAR(120) NULL AFTER discount_percent');
            }
            return;
        }
        $pdo->exec(
            "CREATE TABLE IF NOT EXISTS invoices (
                id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                invoice_no VARCHAR(40) NOT NULL,
                title VARCHAR(200) NULL,
                client_name VARCHAR(200) NOT NULL,
                client_contact TEXT NULL,
                invoice_date DATE NOT NULL,
                due_date DATE NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'unpaid',
                items MEDIUMTEXT NULL,
                discount DECIMAL(14,2) NOT NULL DEFAULT 0,
                discount_percent DECIMAL(5,1) NULL,
                discount_text VARCHAR(120) NULL,
                total DECIMAL(14,2) NOT NULL DEFAULT 0,
                sales_contact TEXT NULL,
                bank_account TEXT NULL,
                notes TEXT NULL,
                payment_proofs MEDIUMTEXT NULL,
                media_entries MEDIUMTEXT NULL,
                created_by VARCHAR(100) NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_invoice_no (invoice_no),
                INDEX idx_invoice_date (invoice_date)
            ) ENGINE=InnoDB"
        );
    } catch (Throwable $e) {
        // Another request may be creating the table at the same moment.
    }
}

// Accounts get an optional phone number (filled in on the sign-up page, shown in Master Akun).
// The picture behind the name on the profile card (Account Settings > Background Profile): a stored /api/uploads/... URL.
function ensure_accounts_cover_schema(PDO $pdo): void {
    try {
        if ($pdo->query("SHOW COLUMNS FROM accounts LIKE 'cover'")->fetch()) return;
        $pdo->exec('ALTER TABLE accounts ADD COLUMN cover VARCHAR(500) NULL AFTER avatar');
    } catch (Throwable $e) {
        // Another request may be adding the column at the same moment.
    }
}

function ensure_accounts_phone_schema(PDO $pdo): void {
    try {
        if ($pdo->query("SHOW COLUMNS FROM accounts LIKE 'phone'")->fetch()) return;
        $pdo->exec('ALTER TABLE accounts ADD COLUMN phone VARCHAR(40) NULL AFTER email');
    } catch (Throwable $e) {
        // Another request may have added the column first.
    }
}

// Breeding: who handled the session ("Petugas") and the date the record was last updated (filled in
// automatically on every save; the form lets the user change it).
function ensure_breeding_officer_schema(PDO $pdo): void {
    try {
        if ($pdo->query("SHOW COLUMNS FROM breeding_batches LIKE 'officer_name'")->fetch()) return;
        $pdo->exec(
            'ALTER TABLE breeding_batches
                ADD COLUMN officer_name VARCHAR(255) NULL,
                ADD COLUMN last_update_date DATE NULL'
        );
    } catch (Throwable $e) {
        // Another request may have added the columns first.
    }
}
