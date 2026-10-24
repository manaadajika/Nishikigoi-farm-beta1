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
function update_git(array $args, int $timeoutSeconds = 30): array {
    $git = update_git_binary();
    if ($git === null) return [127, 'Git belum terpasang'];
    $cmd = array_merge([$git, '-C', update_root()], $args);
    $proc = @proc_open($cmd, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, null, array_merge(getenv() ?: [], ['GIT_TERMINAL_PROMPT' => '0', 'LC_ALL' => 'C']));
    if (!is_resource($proc)) return [127, 'Git tidak bisa dijalankan'];
    stream_set_blocking($pipes[1], false);
    stream_set_blocking($pipes[2], false);
    $out = '';
    $deadline = microtime(true) + $timeoutSeconds;
    while (true) {
        $out .= (string)stream_get_contents($pipes[1]) . (string)stream_get_contents($pipes[2]);
        $status = proc_get_status($proc);
        if (!$status['running']) break;
        if (microtime(true) > $deadline) { proc_terminate($proc); proc_close($proc); return [124, 'Git terlalu lama menjawab (internet bermasalah?)']; }
        usleep(100000);
    }
    $out .= (string)stream_get_contents($pipes[1]) . (string)stream_get_contents($pipes[2]);
    $code = $status['exitcode'];
    proc_close($proc);
    return [$code, trim($out)];
}

// Like update_git(), but hands every progress line git prints (Receiving objects: 45% (12/27), 2.5 MiB | ...) to $onLine while it runs.
// git separates those lines with a carriage return, not a newline. [exit code, last output]
function update_git_stream(array $args, int $timeoutSeconds, callable $onLine): array {
    $git = update_git_binary();
    if ($git === null) return [127, 'Git belum terpasang'];
    $proc = @proc_open(array_merge([$git, '-C', update_root()], $args), [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, null, array_merge(getenv() ?: [], ['GIT_TERMINAL_PROMPT' => '0', 'LC_ALL' => 'C']));
    if (!is_resource($proc)) return [127, 'Git tidak bisa dijalankan'];
    stream_set_blocking($pipes[1], false);
    stream_set_blocking($pipes[2], false);
    $buffer = '';
    $all = '';
    $deadline = microtime(true) + $timeoutSeconds;
    $drain = function () use (&$buffer, &$all, $pipes, $onLine) {
        $chunk = (string)stream_get_contents($pipes[1]) . (string)stream_get_contents($pipes[2]);
        if ($chunk === '') return;
        $all .= $chunk;
        $buffer .= $chunk;
        $parts = preg_split('/[
]+/', $buffer);
        $buffer = (string)array_pop($parts);
        foreach ($parts as $line) if (trim($line) !== '') $onLine(trim($line));
    };
    while (true) {
        $drain();
        $status = proc_get_status($proc);
        if (!$status['running']) break;
        if (microtime(true) > $deadline) { proc_terminate($proc); proc_close($proc); return [124, 'Git terlalu lama menjawab (internet bermasalah?)']; }
        usleep(150000);
    }
    $drain();
    if (trim($buffer) !== '') $onLine(trim($buffer));
    $code = $status['exitcode'];
    proc_close($proc);
    return [$code, trim(substr($all, -600))];
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
