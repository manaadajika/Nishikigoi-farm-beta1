<?php
// bin/nishikigoi.php — the one program that sets up and runs Nishikigoi the same way on Windows, Linux, macOS and Android (Termux, proot).
// Normally it is started through nishikigoi.bat / nishikigoi.ps1 / nishikigoi.sh, which only make sure PHP (and a database server) exist.
//
//   php bin/nishikigoi.php run              no thinking: sets up when needed, then starts
//   php bin/nishikigoi.php setup            first time: private database, tables, account admin / admin
//   php bin/nishikigoi.php start [options]  starts the database (when it is not running) and the web server (stays in front; CTRL+C stops it)
//   php bin/nishikigoi.php stop             stops the private database
//   php bin/nishikigoi.php status           what is running
//   php bin/nishikigoi.php update [--check] looks for a newer version on GitHub and installs it (--check only reports)
//   php bin/nishikigoi.php passwd USER PASS sets a new password (when it was forgotten)
//
// Options of start:  --port=2000   --local (this device only)   --host=ADDRESS   (--lan = the default: other devices on the network may connect)
//
// The database is a private MariaDB/MySQL instance kept in storage/mysql on port 3307 (override: NISHIKIGOI_DB_PORT). It listens on this
// device only, has no password of its own, and never touches another MySQL on the same computer.
// To use an existing MySQL/MariaDB instead, run  php api-php/bin/install.php  (it asks for the login) and start only the web server.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

$root = dirname(__DIR__);
$isWindows = PHP_OS_FAMILY === 'Windows';
$webRoot = $root . '/app/public/Nishikigoi-beta/preview/dist';
$dataDir = $root . '/storage/mysql';
$runDir = $root . '/storage/run';
$logDir = $root . '/storage/logs';
$dbPort = (int)(getenv('NISHIKIGOI_DB_PORT') ?: 3307);
const REQUIRED_EXTENSIONS = ['pdo_mysql', 'mbstring', 'gd', 'zip', 'openssl', 'fileinfo', 'json'];

function say(string $text = ''): void { echo $text . PHP_EOL; }
function fail(string $text, int $code = 1): void { fwrite(STDERR, PHP_EOL . 'GAGAL: ' . $text . PHP_EOL); exit($code); }

// ---- arguments ----------------------------------------------------------------------------------------------------------------
if (isset($argv[1]) && strpos($argv[1], '--') === 0 && !in_array($argv[1], ['--help'], true)) array_splice($argv, 1, 0, ['run']);   // nishikigoi --lan = run --lan
$command = $argv[1] ?? 'run';
if ($command === 'help' || $command === '--help' || $command === '-h') $command = 'help';
$positional = [];
$opts = [];
foreach (array_slice($argv, 2) as $arg) {
    if (preg_match('/^--([a-z-]+)(?:=(.*))?$/s', $arg, $m)) $opts[$m[1]] = $m[2] ?? '1';
    else $positional[] = $arg;
}

// ---- PHP extensions: a missing one that exists as a file is loaded by running this same command again with -d extension=... --------
function php_flags_for_missing_extensions(): array {
    $flags = [];
    $dir = (string)ini_get('extension_dir');
    foreach (REQUIRED_EXTENSIONS as $ext) {
        if (extension_loaded($ext)) continue;
        foreach (['', 'php_'] as $prefix) {
            foreach (['so', 'dll'] as $suffix) {
                if ($dir !== '' && is_file($dir . '/' . $prefix . $ext . '.' . $suffix)) { $flags[] = '-d'; $flags[] = 'extension=' . $ext; break 2; }
            }
        }
    }
    return $flags;
}
function missing_extensions(): array {
    return array_values(array_filter(REQUIRED_EXTENSIONS, fn($e) => !extension_loaded($e)));
}
if (!getenv('NISHIKIGOI_REEXEC') && missing_extensions()) {
    $flags = php_flags_for_missing_extensions();
    if ($flags) {
        $cmd = array_merge([PHP_BINARY], $flags, [__FILE__], array_slice($argv, 1));
        $proc = proc_open($cmd, [0 => STDIN, 1 => STDOUT, 2 => STDERR], $pipes, null, array_merge(getenv(), ['NISHIKIGOI_REEXEC' => '1']));
        exit(is_resource($proc) ? proc_close($proc) : 1);
    }
}

// ---- helpers: processes and ports ---------------------------------------------------------------------------------------------
function port_open(string $host, int $port, float $timeout = 0.4): bool {
    $s = @fsockopen($host, $port, $errno, $errstr, $timeout);
    if ($s) { fclose($s); return true; }
    return false;
}
function quote(string $arg): string {
    if (PHP_OS_FAMILY === 'Windows') return '"' . str_replace('"', '""', $arg) . '"';
    return escapeshellarg($arg);
}
// Starts a program that keeps running after this command ends; its output goes to $log. The caller waits for the port.
function spawn_background(array $cmd, string $log): void {
    $line = implode(' ', array_map('quote', $cmd));
    if (PHP_OS_FAMILY === 'Windows') {
        // "start /B" hands the program over and cmd ends at once; the program only gets files (never a pipe), so nothing waits for it
        $proc = proc_open('cmd /c start "" /B ' . $line, [0 => ['file', 'NUL', 'r'], 1 => ['file', $log, 'a'], 2 => ['file', $log . '.err', 'a']], $pipes, null, null, ['bypass_shell' => true]);
        if (is_resource($proc)) proc_close($proc);
    } else {
        shell_exec('nohup ' . $line . ' >> ' . quote($log) . ' 2>&1 < /dev/null &');
    }
}
function run_capture(array $cmd): array {
    $proc = proc_open($cmd, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
    if (!is_resource($proc)) return [127, ''];
    $out = stream_get_contents($pipes[1]) . stream_get_contents($pipes[2]);
    return [proc_close($proc), $out];
}

// ---- finding the database server ------------------------------------------------------------------------------------------------
function find_executable(array $names, array $extraDirs = []): ?string {
    $dirs = $extraDirs;
    foreach (explode(PATH_SEPARATOR, (string)getenv('PATH')) as $p) if ($p !== '') $dirs[] = $p;
    foreach ($dirs as $dir) {
        foreach ($names as $name) {
            foreach (PHP_OS_FAMILY === 'Windows' ? ['.exe', '.cmd', '.bat'] : [''] as $ext) {
                $file = rtrim($dir, '/\\') . DIRECTORY_SEPARATOR . $name . $ext;
                if (is_file($file) && (PHP_OS_FAMILY === 'Windows' || is_executable($file))) return $file;
            }
        }
    }
    return null;
}
function db_search_dirs(string $root): array {
    $dirs = [];
    if ($d = getenv('NISHIKIGOI_DB_DIR')) $dirs[] = $d;
    $dirs[] = $root . '/runtime/mariadb/bin';
    foreach (glob($root . '/runtime/mariadb*/bin') ?: [] as $d) $dirs[] = $d;
    $dirs = array_merge($dirs, ['/usr/sbin', '/usr/libexec', '/usr/local/sbin', '/opt/homebrew/opt/mariadb/bin', '/usr/local/opt/mariadb/bin', '/opt/homebrew/opt/mysql/bin', '/usr/local/opt/mysql/bin']);
    if ($prefix = getenv('PREFIX')) $dirs[] = $prefix . '/bin';   // Termux
    if (PHP_OS_FAMILY === 'Windows') {
        foreach (['C:/laragon/bin/mysql/*/bin', 'C:/Program Files/MariaDB */bin', 'C:/Program Files/MySQL/MySQL Server */bin', 'C:/xampp/mysql/bin', (getenv('USERPROFILE') ?: '') . '/laragon/bin/mysql/*/bin'] as $pattern) {
            foreach (glob($pattern) ?: [] as $d) $dirs[] = $d;
        }
    }
    return $dirs;
}
function db_tools(string $root): ?array {
    $dirs = db_search_dirs($root);
    $server = find_executable(['mariadbd', 'mysqld'], $dirs);
    if (!$server) return null;
    $bin = dirname($server);
    [, $version] = run_capture([$server, '--no-defaults', '--version']);
    $mariadb = stripos($version, 'mariadb') !== false;
    return [
        'server' => $server,
        'flavor' => $mariadb ? 'mariadb' : 'mysql',
        'install' => find_executable(['mariadb-install-db', 'mysql_install_db'], [$bin, dirname($bin) . '/scripts']),
        'admin' => find_executable(['mariadb-admin', 'mysqladmin'], array_merge([$bin], $dirs)),
        'basedir' => dirname($bin),
    ];
}
function install_hint(): string {
    switch (PHP_OS_FAMILY) {
        case 'Windows': return 'Jalankan nishikigoi.bat lagi: server database akan diunduh otomatis. Atau pasang MariaDB (https://mariadb.org/download) lalu ulangi.';
        case 'Darwin': return 'Jalankan:  brew install mariadb';
        default:
            if (getenv('PREFIX') && strpos((string)getenv('PREFIX'), 'termux') !== false) return 'Jalankan:  pkg install mariadb';
            return 'Pasang MariaDB: Debian/Ubuntu `sudo apt install mariadb-server`, Fedora `sudo dnf install mariadb-server`, Arch `sudo pacman -S mariadb`. (nishikigoi.sh melakukannya sendiri.)';
    }
}

// ---- the private database ---------------------------------------------------------------------------------------------------
function db_up(int $port): bool {
    if (!port_open('127.0.0.1', $port)) return false;
    try {
        new PDO("mysql:host=127.0.0.1;port=$port", 'root', '', [PDO::ATTR_TIMEOUT => 3, PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        return true;
    } catch (Throwable $e) {
        return false;   // still starting, or another program holds the port
    }
}
function db_init(array $t, string $dataDir): void {
    if (is_dir($dataDir . '/mysql')) return;
    if (!is_dir($dataDir) && !@mkdir($dataDir, 0775, true) && !is_dir($dataDir)) fail("Folder database tidak bisa dibuat: $dataDir");
    say('    Menyiapkan data database (sekali saja, sekitar setengah menit)...');
    if ($t['flavor'] === 'mysql') {
        [$code, $out] = run_capture([$t['server'], '--no-defaults', '--initialize-insecure', '--basedir=' . $t['basedir'], '--datadir=' . $dataDir]);
    } elseif ($t['install']) {
        [$code, $out] = run_capture([$t['install'], '--no-defaults', '--datadir=' . $dataDir, '--auth-root-authentication-method=normal', '--skip-test-db']);
    } else {
        fail('Alat pembuat data MariaDB (mariadb-install-db) tidak ditemukan di ' . $t['basedir'] . '.');
    }
    if ($code !== 0 || !is_dir($dataDir . '/mysql')) fail("Data database gagal dibuat.\n" . trim($out));
}
function db_start(array $t, string $dataDir, string $runDir, string $logDir, int $port): void {
    if (db_up($port)) return;
    if (port_open('127.0.0.1', $port)) fail("Port $port sudah dipakai program lain. Pakai port database lain: NISHIKIGOI_DB_PORT=3310 (lalu setup ulang).");
    foreach ([$runDir, $logDir] as $d) if (!is_dir($d)) @mkdir($d, 0775, true);
    $args = [
        $t['server'], '--no-defaults',
        '--basedir=' . $t['basedir'], '--datadir=' . $dataDir,
        '--port=' . $port, '--bind-address=127.0.0.1',
        '--pid-file=' . $runDir . '/mysql.pid',
        '--log-error=' . $logDir . '/mysql-error.log',
        '--character-set-server=utf8mb4', '--collation-server=utf8mb4_unicode_ci',
        // small and quick: this database serves one farm, not a data center
        '--max-connections=60', '--innodb-buffer-pool-size=64M', '--innodb-log-file-size=32M',
        '--performance-schema=OFF', '--skip-log-bin', '--innodb-flush-log-at-trx-commit=2',
    ];
    if ($t['flavor'] === 'mysql') { $args[] = '--mysqlx=OFF'; $args[] = '--default-authentication-plugin=mysql_native_password'; }
    if (PHP_OS_FAMILY !== 'Windows') $args[] = '--socket=' . $runDir . '/mysql.sock';
    spawn_background($args, $logDir . '/mysql.log');
    for ($i = 0; $i < 90; $i++) {
        if (db_up($port)) return;
        usleep(700000);
    }
    fail("Database tidak mau menyala. Lihat $logDir/mysql-error.log");
}
function db_stop(?array $t, int $port, string $runDir): bool {
    if (!db_up($port)) return false;
    try {
        $pdo = new PDO("mysql:host=127.0.0.1;port=$port", 'root', '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        try { $pdo->exec('SHUTDOWN'); } catch (Throwable $e) { /* the connection ends while it shuts down */ }
    } catch (Throwable $e) {
        return false;
    }
    for ($i = 0; $i < 40; $i++) {
        if (!port_open('127.0.0.1', $port)) return true;
        usleep(500000);
    }
    return false;
}
function embedded(string $dataDir): bool { return is_dir($dataDir . '/mysql'); }

// True while the account "admin" still has the starting password "admin" (for the warning in the banner).
function default_password_in_use(string $root): bool {
    try {
        $config = require $root . '/api-php/config.php';
        $pdo = new PDO(sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $config['db_host'], $config['db_port'], $config['db_name']), $config['db_user'], $config['db_pass'], [PDO::ATTR_TIMEOUT => 3, PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $row = $pdo->query("SELECT password FROM accounts WHERE username = 'admin' LIMIT 1")->fetch(PDO::FETCH_ASSOC);
        return $row ? password_verify('admin', (string)$row['password']) : false;
    } catch (Throwable $e) {
        return false;   // only used for a warning in the banner: when it cannot be told, say nothing
    }
}

// ---- commands ------------------------------------------------------------------------------------------------------------------
switch ($command) {
    case 'run': {   // double-click / no command: install first when needed, then start
        $self = fn(array $args) => (function () use ($args) {
            $proc = proc_open(array_merge([PHP_BINARY], php_flags_for_missing_extensions(), [__FILE__], $args), [0 => STDIN, 1 => STDOUT, 2 => STDERR], $pipes, null, array_merge(getenv(), ['NISHIKIGOI_REEXEC' => '1']));
            return is_resource($proc) ? proc_close($proc) : 1;
        })();
        if (!is_file($root . '/api-php/config.local.php') && $self(['setup']) !== 0) exit(1);
        exit($self(array_merge(['start'], array_slice($argv, 2))));
    }

    case 'setup': {
        say('== Nishikigoi: pemasangan ==');
        if (version_compare(PHP_VERSION, '8.1.0', '<')) fail('Butuh PHP 8.1 atau lebih baru (terpasang ' . PHP_VERSION . ').');
        // exit code 3 = "PHP lacks an extension": nishikigoi.sh then installs the missing package and tries once more
        if ($missing = missing_extensions()) fail('Ekstensi PHP belum aktif: ' . implode(', ', $missing) . ". Aktifkan di php.ini (hapus ';' di depan extension=...), atau pasang paketnya (Termux: pkg install php-gd).", 3);
        say('1/3 PHP ' . PHP_VERSION . ' dan ekstensinya lengkap.');

        say('2/3 Database pribadi (port ' . $dbPort . ')...');
        $t = db_tools($root);
        if (!$t) fail('Server database (MariaDB/MySQL) belum ada. ' . install_hint(), 2);
        say('    Memakai ' . ($t['flavor'] === 'mariadb' ? 'MariaDB' : 'MySQL') . ': ' . $t['server']);
        db_init($t, $dataDir);
        db_start($t, $dataDir, $runDir, $logDir, $dbPort);
        say('    Database menyala.');

        say('3/3 Tabel dan akun...');
        $install = [PHP_BINARY, $root . '/api-php/bin/install.php', '--yes', '--allow-weak=1', '--db-host=127.0.0.1', '--db-port=' . $dbPort, '--db-name=nishikigoi_koi', '--db-user=root', '--db-pass=',
            '--admin-user=admin', '--admin-name=Administrator', '--admin-pass=admin'];
        $proc = proc_open($install, [0 => STDIN, 1 => STDOUT, 2 => STDERR], $pipes, null, array_merge(getenv(), ['NISHIKIGOI_REEXEC' => '1']));
        $code = is_resource($proc) ? proc_close($proc) : 1;
        if ($code !== 0) fail('Pemasangan tabel gagal (lihat pesan di atas).');
        say();
        say('Selesai. Jalankan:  nishikigoi start   lalu buka http://localhost:2000');
        say("Masuk dengan username 'admin' dan kata sandi 'admin', lalu GANTI kata sandinya di Pengaturan.");
        break;
    }

    case 'start': {
        if (!is_file($root . '/api-php/config.local.php')) fail('Belum dipasang. Jalankan dulu:  nishikigoi setup');
        $port = (int)($opts['port'] ?? getenv('PORT') ?: 2000);
        if (embedded($dataDir)) {
            $t = db_tools($root);
            if (!$t) fail('Server database tidak ditemukan. ' . install_hint(), 2);
            if (!db_up($dbPort)) { say('Menyalakan database...'); db_start($t, $dataDir, $runDir, $logDir, $dbPort); }
        }
        // Who may connect: other devices on the network always may (Wi-Fi, Tailscale...); --local keeps it to this device. While the starting
        // password "admin" is unchanged the banner says so.
        $host = isset($opts['local']) ? '127.0.0.1' : ($opts['host'] ?? '0.0.0.0');
        $lanNote = '';
        if ($host !== '127.0.0.1' && default_password_in_use($root)) {
            $lanNote = "Perhatian: kata sandi akun 'admin' masih 'admin' dan program terbuka untuk perangkat lain di jaringan ini. Segera ganti di Pengaturan.";
        }
        if (port_open('127.0.0.1', $port)) fail("Port $port sudah dipakai. Pilih port lain, mis.  nishikigoi start --port=2100");
        $flags = ['-d', 'memory_limit=512M', '-d', 'post_max_size=512M', '-d', 'upload_max_filesize=512M', '-d', 'max_execution_time=300', '-d', 'date.timezone=Asia/Jakarta', '-d', 'display_errors=0', '-d', 'log_errors=1', '-d', 'error_log=' . $logDir . '/php-error.log', '-d', 'error_reporting=E_ALL & ~E_DEPRECATED & ~E_NOTICE'];
        // OPcache makes pages answer faster, but on Termux (Android) it cannot create its lock file and stops the server ("Cannot create lock"),
        // so it stays off there unless NISHIKIGOI_OPCACHE=1; where it is on, its lock file goes to storage/run (always writable)
        if (!is_dir($runDir)) @mkdir($runDir, 0775, true);
        $onTermux = strpos((string)getenv('PREFIX'), 'com.termux') !== false;
        $opcachePref = getenv('NISHIKIGOI_OPCACHE');
        $useOpcache = $opcachePref === '1' || ($opcachePref !== '0' && !$onTermux);
        if (extension_loaded('Zend OPcache')) {
            $flags = $useOpcache
                ? array_merge($flags, ['-d', 'opcache.enable=1', '-d', 'opcache.lockfile_path=' . $runDir, '-d', 'opcache.validate_timestamps=1', '-d', 'opcache.revalidate_freq=2', '-d', 'opcache.memory_consumption=64'])
                : array_merge($flags, ['-d', 'opcache.enable=0']);
        }
        $cmd = array_merge([PHP_BINARY], php_flags_for_missing_extensions(), $flags, ['-S', "$host:$port", '-t', $webRoot, $root . '/bin/router.php']);
        say('Nishikigoi jalan di http://localhost:' . $port . ($host === '0.0.0.0' ? '  (juga bisa dibuka dari perangkat lain di jaringan yang sama lewat alamat IP perangkat ini; pakai --local untuk membatasi)' : '  (hanya dari perangkat ini)'));
        if ($lanNote !== '') say($lanNote);
        say('Tekan CTRL+C untuk menghentikan server web. Database tetap menyala; matikan dengan:  nishikigoi stop');
        // NISHIKIGOI_SELF_UPDATE=1 turns on "versi baru tersedia / Perbarui sekarang" in the program (api-php/lib/update.php)
        $env = array_merge(getenv(), ['NISHIKIGOI_REEXEC' => '1', 'NISHIKIGOI_SELF_UPDATE' => '1']);
        if (!$isWindows) $env['PHP_CLI_SERVER_WORKERS'] = getenv('PHP_CLI_SERVER_WORKERS') ?: '4';
        $proc = proc_open($cmd, [0 => STDIN, 1 => STDOUT, 2 => STDERR], $pipes, $root, $env);
        exit(is_resource($proc) ? proc_close($proc) : 1);
    }

    case 'stop': {
        if (!embedded($dataDir)) { say('Tidak ada database pribadi yang perlu dihentikan.'); break; }
        say(db_stop(db_tools($root), $dbPort, $runDir) ? 'Database dihentikan.' : 'Database memang tidak sedang jalan.');
        break;
    }

    case 'status': {
        say('PHP        : ' . PHP_VERSION . ($isWindows ? ' (Windows)' : ' (' . PHP_OS_FAMILY . ')'));
        $t = db_tools($root);
        say('Database   : ' . ($t ? ($t['flavor'] === 'mariadb' ? 'MariaDB' : 'MySQL') . ' di ' . $t['server'] : 'tidak ditemukan'));
        say('Data       : ' . (embedded($dataDir) ? 'siap (' . $dataDir . ')' : 'belum dibuat (jalankan setup)'));
        say('Database   : ' . (db_up($dbPort) ? "MENYALA di port $dbPort" : 'mati'));
        say('Web (2000) : ' . (port_open('127.0.0.1', 2000) ? 'MENYALA' : 'mati'));
        break;
    }

    case 'update': {   // new version from GitHub: look first (--check), or take it
        if (!is_dir($root . '/.git')) fail('Folder ini bukan hasil git clone, jadi tidak bisa diperbarui otomatis.');
        if (!find_executable(['git'])) fail('Git belum terpasang. Pasang Git (https://git-scm.com) lalu ulangi.');
        $git = fn(array $args) => run_capture(array_merge(['git', '-C', $root], $args));
        say('Memeriksa versi terbaru di GitHub...');
        [$code, $out] = $git(['fetch', '--quiet']);
        if ($code !== 0) fail("Tidak bisa menghubungi GitHub (internet atau login GitHub bermasalah).
" . trim($out));
        [$code, $behind] = $git(['rev-list', '--count', 'HEAD..@{u}']);
        if ($code !== 0) fail('Cabang ini belum terhubung ke GitHub (tidak ada upstream).');
        $behind = (int)trim($behind);
        if ($behind === 0) { say('Sudah versi terbaru.'); break; }
        say("Ada $behind pembaruan:");
        [, $log] = $git(['log', '--format=  - %s (%cd)', '--date=short', '-n', '15', 'HEAD..@{u}']);
        say(rtrim($log));
        if (isset($opts['check'])) { say('Jalankan  nishikigoi update  untuk mengambilnya.'); break; }
        [$code, $out] = $git(['pull', '--ff-only']);
        if ($code !== 0) fail("Pembaruan gagal diambil (biasanya ada berkas program yang diubah di komputer ini).
" . trim($out));
        say('Pembaruan terpasang. Perubahan database dibuat otomatis saat program dibuka lagi.');
        say('Jika program sedang jalan, hentikan (CTRL+C) lalu jalankan lagi supaya versi barunya dipakai.');
        break;
    }

    case 'passwd': {
        if (count($positional) < 2) fail('Pemakaian:  nishikigoi passwd USERNAME KATASANDI_BARU');
        [$user, $pass] = $positional;
        if ($pass === '') fail('Kata sandi tidak boleh kosong.');
        chdir($root . '/api-php');
        require_once $root . '/api-php/lib/db.php';
        $done = execute('UPDATE accounts SET password = ? WHERE username = ?', [password_hash($pass, PASSWORD_DEFAULT), $user])->rowCount();
        execute('DELETE FROM account_sessions WHERE username = ?', [$user]);
        say($done ? "Kata sandi '$user' diganti; semua sesi masuknya dikeluarkan." : "Akun '$user' tidak ditemukan.");
        break;
    }

    default:
        say('Nishikigoi — pemakaian:');
        say('  nishikigoi                    pasang bila perlu, lalu jalankan');
        say('  nishikigoi setup              pemasangan pertama (database pribadi, tabel, akun admin / admin)');
        say('  nishikigoi start [--port=N] [--lan]   jalankan (http://localhost:2000)');
        say('  nishikigoi stop               hentikan database pribadi');
        say('  nishikigoi status             lihat yang sedang jalan');
        say('  nishikigoi update [--check]   cari dan pasang versi terbaru dari GitHub');
        say('  nishikigoi passwd USER PASS   ganti kata sandi akun');
}
