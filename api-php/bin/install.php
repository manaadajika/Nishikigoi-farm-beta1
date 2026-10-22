<?php
// api-php/bin/install.php — database setup for an EXISTING MySQL/MariaDB server (the usual first run is  nishikigoi setup, which uses its own private database):
//
//   php api-php/bin/install.php
//   php api-php/bin/install.php --db-host=127.0.0.1 --db-port=3306 --db-name=nishikigoi_koi --db-user=root --db-pass= \
//        --admin-user=admin --admin-name="Pemilik Farm" --admin-pass=GantiIni123 --yes
//
// What it does, in order (safe to run again; it never drops or overwrites data):
//   1. checks the PHP version and the PHP extensions the program needs
//   2. connects to MySQL/MariaDB and creates the database when it is not there
//   3. creates the tables (api-php/schema.sql) when the database is still empty; the program adds newer columns/tables by itself later
//   4. writes api-php/config.local.php with the database login (this file is never committed)
//   5. creates the folders for photos, backups and logs
//   6. creates the first Master Admin account when there is none
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

$root = dirname(__DIR__, 2);
$api = dirname(__DIR__);

// ---- arguments: --name=value, --yes (never ask, use defaults / the values given) -------------------------------------------------
$args = [];
$yes = false;
foreach (array_slice($argv, 1) as $arg) {
    if ($arg === '--yes' || $arg === '-y') { $yes = true; continue; }
    if (preg_match('/^--([a-z-]+)=(.*)$/s', $arg, $m)) $args[$m[1]] = $m[2];
}
function say(string $text = ''): void { echo $text . PHP_EOL; }
function fail(string $text): void { fwrite(STDERR, PHP_EOL . 'GAGAL: ' . $text . PHP_EOL); exit(1); }
function ask(string $label, string $default = '', ?string $given = null, bool $yes = false): string {
    if ($given !== null) return $given;
    if ($yes) return $default;
    echo $label . ($default !== '' ? " [$default]" : '') . ': ';
    $line = fgets(STDIN);
    $line = $line === false ? '' : trim($line);
    return $line === '' ? $default : $line;
}

// ---- 1. requirements -----------------------------------------------------------------------------------------------------------
say('== Nishikigoi: pemasangan pertama ==');
say('1/6 Memeriksa PHP...');
if (version_compare(PHP_VERSION, '8.1.0', '<')) fail('Butuh PHP 8.1 atau lebih baru (yang terpasang: ' . PHP_VERSION . ').');
$missing = [];
foreach (['pdo_mysql' => 'database MySQL', 'mbstring' => 'teks', 'gd' => 'gambar/thumbnail', 'zip' => 'backup dan restore', 'openssl' => 'pesan terenkripsi', 'fileinfo' => 'jenis file unggahan', 'json' => 'JSON'] as $ext => $why) {
    if (!extension_loaded($ext)) $missing[] = "$ext ($why)";
}
if ($missing) fail("Ekstensi PHP belum aktif: " . implode(', ', $missing) . ". Aktifkan di php.ini (hapus tanda ';' di depan extension=...), lalu ulangi.");
say('    PHP ' . PHP_VERSION . ' dan semua ekstensi yang dibutuhkan ada.');

// ---- 2. database ---------------------------------------------------------------------------------------------------------------
say('2/6 Database MySQL/MariaDB...');
$dbHost = ask('Alamat MySQL', '127.0.0.1', $args['db-host'] ?? null, $yes);
$dbPort = (int)ask('Port MySQL', '3306', $args['db-port'] ?? null, $yes);
$dbName = ask('Nama database', 'nishikigoi_koi', $args['db-name'] ?? null, $yes);
$dbUser = ask('User MySQL', 'root', $args['db-user'] ?? null, $yes);
$dbPass = ask('Kata sandi MySQL (kosong bila tidak ada)', '', $args['db-pass'] ?? null, $yes);
if (!preg_match('/^[A-Za-z0-9_]{1,64}$/', $dbName)) fail('Nama database hanya boleh huruf, angka, dan garis bawah.');

try {
    $server = new PDO("mysql:host=$dbHost;port=$dbPort;charset=utf8mb4", $dbUser, $dbPass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
} catch (Throwable $e) {
    fail("Tidak bisa terhubung ke MySQL di $dbHost:$dbPort dengan user '$dbUser'. Pastikan MySQL/MariaDB sudah jalan (di Laragon: klik Start All) dan login-nya benar.\n  Pesan: " . $e->getMessage());
}
$server->exec("CREATE DATABASE IF NOT EXISTS `$dbName` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
$server->exec("USE `$dbName`");
say("    Database '$dbName' siap.");

// ---- 3. tables -----------------------------------------------------------------------------------------------------------------
say('3/6 Tabel...');
$hasTables = (bool)$server->query("SHOW TABLES LIKE 'koi'")->fetch();
if ($hasTables) {
    say('    Tabel sudah ada: dilewati (data tidak disentuh).');
} else {
    $sql = (string)file_get_contents(__DIR__ . '/../schema.sql');
    // the file starts with CREATE DATABASE / USE for the default name: the database was already chosen above
    $sql = preg_replace('/^\s*CREATE DATABASE[^;]*;\s*/im', '', $sql);
    $sql = preg_replace('/^\s*USE\s+[^;]*;\s*/im', '', $sql);
    try {
        $server->exec($sql);
    } catch (Throwable $e) {
        fail('Tabel gagal dibuat: ' . $e->getMessage());
    }
    say('    Tabel dasar dibuat.');
}

// ---- 4. config.local.php -------------------------------------------------------------------------------------------------------
say('4/6 Pengaturan koneksi...');
$configFile = $api . '/config.local.php';
if (is_file($configFile) && !isset($args['force-config'])) {
    say('    config.local.php sudah ada: dibiarkan (pakai --force-config=1 untuk menimpa).');
} else {
    $lines = [
        "<?php",
        "// api-php/config.local.php — login database komputer ini. Dibuat oleh bin/install.php dan TIDAK ikut Git.",
        "return [",
        "    'db_host' => " . var_export($dbHost, true) . ",",
        "    'db_port' => " . $dbPort . ",",
        "    'db_name' => " . var_export($dbName, true) . ",",
        "    'db_user' => " . var_export($dbUser, true) . ",",
        "    'db_pass' => " . var_export($dbPass, true) . ",",
        "];",
        "",
    ];
    file_put_contents($configFile, implode(PHP_EOL, $lines));
    say('    config.local.php ditulis.');
}

// ---- 5. folders ----------------------------------------------------------------------------------------------------------------
say('5/6 Folder...');
foreach ([$api . '/uploads', $root . '/storage/backups', $root . '/storage/logs'] as $dir) {
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) fail("Folder tidak bisa dibuat: $dir");
}
say('    uploads, backup, dan log siap.');

// the program checks and adds its newer tables/columns itself the first time it opens the database
chdir($api);
require_once $api . '/lib/db.php';
try {
    ensure_all_schemas(db());   // run the table/column checks now, whatever the program remembers from an earlier database
} catch (Throwable $e) {
    fail('Program tidak bisa menyiapkan database dengan pengaturan tadi: ' . $e->getMessage());
}

// ---- 6. first account ----------------------------------------------------------------------------------------------------------
say('6/6 Akun Master Admin...');
$hasAdmin = (bool)query_one("SELECT id FROM accounts WHERE role = 'Master Admin' AND status = 'Active' LIMIT 1");
if ($hasAdmin) {
    say('    Sudah ada akun Master Admin: dilewati.');
} else {
    $adminUser = '';
    while (!preg_match('/^[a-z0-9._-]{3,50}$/', $adminUser)) {
        $adminUser = ask('Username Master Admin (huruf kecil/angka, 3-50 karakter)', 'admin', $args['admin-user'] ?? null, $yes);
        if (!preg_match('/^[a-z0-9._-]{3,50}$/', $adminUser)) {
            if ($yes || isset($args['admin-user'])) fail('Username harus 3-50 karakter: huruf kecil, angka, titik, strip, atau garis bawah.');
            say('    Username tidak valid, coba lagi.');
        }
    }
    $adminName = ask('Nama lengkap', 'Master Admin', $args['admin-name'] ?? null, $yes);
    $adminPass = '';
    $minPass = isset($args['allow-weak']) ? 1 : 6;   // nishikigoi setup starts with admin / admin on purpose: it must be changed after the first login
    while (strlen($adminPass) < $minPass) {
        $adminPass = ask('Kata sandi (minimal 6 karakter; bisa diganti nanti di Pengaturan)', '', $args['admin-pass'] ?? null, $yes);
        if (strlen($adminPass) < $minPass) {
            if ($yes || isset($args['admin-pass'])) fail('Kata sandi Master Admin minimal 6 karakter (--admin-pass=...).');
            say('    Kata sandi terlalu pendek, coba lagi.');
        }
    }
    execute(
        'INSERT INTO accounts (username, name, password, role, status) VALUES (?, ?, ?, ?, ?)',
        [$adminUser, $adminName, password_hash($adminPass, PASSWORD_DEFAULT), 'Master Admin', 'Active']
    );
    say("    Akun '$adminUser' dibuat.");
}

say();
say('Selesai. Jalankan program dengan  nishikigoi start  (Windows: nishikigoi.bat start; Linux/macOS/Android: ./nishikigoi.sh start),');
say('lalu buka http://localhost:2000 dan masuk dengan akun Master Admin tadi.');
say('Data lama dari komputer lain: masuk, lalu Pengaturan > Master Akun > Restore (ZIP backup).');
