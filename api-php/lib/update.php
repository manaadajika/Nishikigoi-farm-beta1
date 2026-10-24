<?php
// api-php/lib/update.php — "new version available" for a program installed from GitHub (git clone) and started with `nishikigoi`.
//
// The program looks for a newer version on GitHub (git fetch, at most once a day, or when a Master Admin asks) and, when a Master
// Admin presses "Perbarui sekarang", takes it (git pull --ff-only) and restarts the web server. Both jobs run as a separate
// background process (bin/update-job.php), so a slow network never blocks the page, and the state lives in storage/run/.
//
// It is only active when the program was started by `nishikigoi` (it sets NISHIKIGOI_SELF_UPDATE=1; that is also what lets the
// manager restart the server) and the folder is a git clone. Under Apache/Laragon, or from a zip, nothing here does anything.

function update_root(): string { return dirname(__DIR__, 2); }
function update_run_dir(): string { return update_root() . '/storage/run'; }
function update_state_file(): string { return update_run_dir() . '/update-state.json'; }
function update_apply_file(): string { return update_run_dir() . '/update-apply.json'; }

function update_git_binary(): ?string {
    static $found = false;
    if ($found !== false) return $found;
    $names = PHP_OS_FAMILY === 'Windows' ? ['git.exe', 'git.cmd'] : ['git'];
    $dirs = explode(PATH_SEPARATOR, (string)getenv('PATH'));
    if (PHP_OS_FAMILY === 'Windows') $dirs = array_merge($dirs, ['C:\\Program Files\\Git\\cmd', 'C:\\Program Files (x86)\\Git\\cmd']);
    foreach ($dirs as $dir) {
        foreach ($names as $name) {
            $file = rtrim($dir, '/\\') . DIRECTORY_SEPARATOR . $name;
            if ($dir !== '' && is_file($file)) return $found = $file;
        }
    }
    return $found = null;
}

function update_enabled(): bool {
    return getenv('NISHIKIGOI_SELF_UPDATE') === '1' && is_dir(update_root() . '/.git') && update_git_binary() !== null;
}

// Runs git in the program folder and never waits for a password (GIT_TERMINAL_PROMPT=0). [exit code, output]
// git writes into two temporary files that are read while it runs (no pipes: a pipe that nobody empties in time stops git on Windows).
// git separates its progress lines (Receiving objects: 45% (12/27), 2.5 MiB | ...) with a carriage return, not a newline; every one of them
// is handed to $onLine while git works.
function update_git(array $args, int $timeoutSeconds = 30, ?callable $onLine = null): array {
    $git = update_git_binary();
    if ($git === null) return [127, 'Git belum terpasang'];
    if (!is_dir(update_run_dir())) @mkdir(update_run_dir(), 0775, true);
    $base = update_run_dir() . '/git-' . getmypid() . '-' . mt_rand();
    $outFile = $base . '.out';
    $errFile = $base . '.err';
    $nul = PHP_OS_FAMILY === 'Windows' ? 'NUL' : '/dev/null';
    $proc = @proc_open(array_merge([$git, '-C', update_root()], $args), [0 => ['file', $nul, 'r'], 1 => ['file', $outFile, 'w'], 2 => ['file', $errFile, 'w']], $pipes, null, array_merge(getenv() ?: [], ['GIT_TERMINAL_PROMPT' => '0', 'LC_ALL' => 'C']));
    if (!is_resource($proc)) return [127, 'Git tidak bisa dijalankan'];
    $offset = 0;
    $pending = '';
    $emit = function () use ($errFile, &$offset, &$pending, $onLine) {
        clearstatcache(true, $errFile);
        if (!is_file($errFile) || filesize($errFile) <= $offset) return;
        $h = @fopen($errFile, 'rb');
        if (!$h) return;
        fseek($h, $offset);
        $chunk = (string)stream_get_contents($h);
        fclose($h);
        $offset += strlen($chunk);
        if ($onLine === null) return;
        $parts = preg_split('/[\r\n]+/', $pending . $chunk);
        $pending = (string)array_pop($parts);
        foreach ($parts as $line) if (trim($line) !== '') $onLine(trim($line));
    };
    $deadline = microtime(true) + $timeoutSeconds;
    $timedOut = false;
    while (true) {
        $emit();
        $status = proc_get_status($proc);
        if (!$status['running']) break;
        if (microtime(true) > $deadline) { proc_terminate($proc); $timedOut = true; break; }
        usleep(150000);
    }
    $code = $status['exitcode'];
    proc_close($proc);
    $emit();
    if ($onLine !== null && trim($pending) !== '') $onLine(trim($pending));
    $text = trim((string)@file_get_contents($outFile) . "\n" . (string)@file_get_contents($errFile));
    @unlink($outFile);
    @unlink($errFile);
    if ($timedOut) return [124, 'Git terlalu lama menjawab (internet bermasalah?)'];
    // only the end of the output matters (the last progress line is not an error message): keep the lines that are not progress
    $lines = array_filter(preg_split('/[\r\n]+/', $text), fn($l) => !preg_match('/^(remote: )?(Counting|Compressing|Enumerating|Receiving|Resolving|Updating) /', trim($l)));
    return [$code, trim(implode("\n", $lines))];
}

// kept for readability at the call sites that follow progress
function update_git_stream(array $args, int $timeoutSeconds, callable $onLine): array {
    return update_git($args, $timeoutSeconds, $onLine);
}

function update_read(string $file): ?array {
    $raw = @file_get_contents($file);
    $data = $raw !== false ? json_decode($raw, true) : null;
    return is_array($data) ? $data : null;
}
function update_write(string $file, array $data): void {
    if (!is_dir(update_run_dir())) @mkdir(update_run_dir(), 0775, true);
    @file_put_contents($file, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);
}

// True when program files were changed on this computer (a pull would refuse or overwrite them).
function update_is_dirty(): bool {
    [$code, $out] = update_git(['status', '--porcelain', '--untracked-files=no'], 10);
    return $code === 0 && $out !== '';
}

// Starts bin/update-job.php (check | apply) so that it keeps running after this request ends.
function update_spawn(string $job): void {
    $script = update_root() . '/api-php/bin/update-job.php';
    $cmd = [PHP_BINARY, $script, $job];
    $log = update_run_dir() . '/update-job.log';
    if (!is_dir(update_run_dir())) @mkdir(update_run_dir(), 0775, true);
    $quote = fn(string $a) => PHP_OS_FAMILY === 'Windows' ? '"' . str_replace('"', '""', $a) . '"' : escapeshellarg($a);
    $line = implode(' ', array_map($quote, $cmd));
    if (PHP_OS_FAMILY === 'Windows') {
        $proc = proc_open('cmd /c start "" /B ' . $line, [0 => ['file', 'NUL', 'r'], 1 => ['file', $log, 'a'], 2 => ['file', $log, 'a']], $pipes, null, null, ['bypass_shell' => true]);
        if (is_resource($proc)) proc_close($proc);
    } else {
        shell_exec('nohup ' . $line . ' >> ' . escapeshellarg($log) . ' 2>&1 < /dev/null &');
    }
}
