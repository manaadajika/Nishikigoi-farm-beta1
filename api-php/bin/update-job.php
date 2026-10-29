<?php
// api-php/bin/update-job.php — background jobs of the in-program update (started by lib/update.php):
//   php update-job.php check   looks on GitHub (git fetch) and records how many updates wait
//   php update-job.php apply   takes them (git pull --ff-only); the new files are used by the very next request
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once __DIR__ . '/../lib/update.php';

$job = $argv[1] ?? '';

// the newest commit of this computer and, after a fetch, the ones that wait on GitHub
function update_head(): ?array {
    [$code, $out] = update_git(['log', '-1', '--format=%h%x09%cd%x09%s', '--date=short'], 10);
    if ($code !== 0 || $out === '') return null;
    [$sha, $date, $subject] = array_pad(explode("\t", $out, 3), 3, '');
    return ['sha' => $sha, 'date' => $date, 'subject' => $subject];
}
function update_pending(): array {
    [$code, $count] = update_git(['rev-list', '--count', 'HEAD..@{u}'], 10);
    if ($code !== 0) return [0, [], 'Cabang ini belum terhubung ke GitHub.'];
    [, $log] = update_git(['log', '--format=%s%x09%cd', '--date=short', '-n', '15', 'HEAD..@{u}'], 10);
    $changes = [];
    foreach (array_filter(explode("\n", $log)) as $line) {
        [$subject, $date] = array_pad(explode("\t", $line, 2), 2, '');
        $changes[] = ['subject' => trim($subject), 'date' => trim($date)];
    }
    return [(int)trim($count), $changes, null];
}

if ($job === 'check') {
    $state = update_read(update_state_file()) ?? [];
    [$code, $out] = update_git(['fetch', '--quiet'], 60);
    $state['checking_since'] = null;
    $state['checked_at'] = time();
    if ($code !== 0) {
        $state['error'] = 'Tidak bisa menghubungi GitHub: ' . strtok($out, "\n");
    } else {
        [$behind, $changes, $error] = update_pending();
        $state['behind'] = $behind;
        $state['changes'] = $changes;
        $state['error'] = $error;
    }
    $state['head'] = update_head();
    update_write(update_state_file(), $state);
    exit(0);
}

if ($job === 'apply') {
    $started = time();
    $last = 0.0;
    $steps = [];   // what each finished stage came to, shown ticked on the screen: [1 => 'ada 3 pembaruan', 2 => '4,2 MB, 120 objek']
    // what the screen shows: stage (1-3), what is happening, how far that stage is (null = not countable), and a detail line
    $report = function (int $stage, string $label, ?int $percent, string $detail = '', bool $force = false) use ($started, &$last, &$steps) {
        $now = microtime(true);
        if (!$force && $now - $last < 0.4) return;
        $last = $now;
        update_write(update_apply_file(), ['state' => 'running', 'started_at' => $started, 'stage' => $stage, 'stage_label' => $label, 'percent' => $percent, 'detail' => $detail, 'steps' => $steps, 'message' => 'Tahap ' . $stage . '/3: ' . $label]);
    };
    // sizes read like backup and restore: MB, or KB while it is still small
    $mbOf = fn(int $bytes): string => $bytes < 1048576 ? number_format($bytes / 1024, 1, ',', '.') . ' KB' : number_format($bytes / 1048576, 1, ',', '.') . ' MB';
    $mb = fn(string $size, string $unit): string => $mbOf((int)round((float)$size * ['KiB' => 1024, 'MiB' => 1048576, 'GiB' => 1073741824][$unit]));
    $num = fn(int $n): string => number_format($n, 0, ',', '.');

    $report(1, 'memeriksa GitHub', null, 'menghubungi GitHub', true);
    // stage 2: download. git prints "Receiving objects: 45% (1672/2786), 2.52 MiB | 2.47 MiB/s" while it works.
    $downloaded = '';
    [$code, $out] = update_git_stream(['fetch', '--progress'], 180, function (string $line) use ($report, $mb, $num, &$downloaded) {
        if (preg_match('/Receiving objects:\s+(\d+)% \((\d+)\/(\d+)\)(?:, ([\d.]+) (KiB|MiB|GiB))?/', $line, $m)) {
            $size = isset($m[4]) ? $mb($m[4], $m[5]) : '';
            $downloaded = ($size !== '' ? $size . ', ' : '') . $num((int)$m[3]) . ' objek';
            $report(2, 'mengunduh paket', (int)$m[1], ($size !== '' ? $size . ', ' : '') . $num((int)$m[2]) . ' dari ' . $num((int)$m[3]) . ' objek (' . $m[1] . '%)');
        } elseif (preg_match('/Resolving deltas:\s+(\d+)% \((\d+)\/(\d+)\)/', $line, $m)) {
            $report(2, 'menyusun paket', (int)$m[1], $num((int)$m[2]) . ' dari ' . $num((int)$m[3]) . ' bagian (' . $m[1] . '%)');
        } elseif (preg_match('/(Counting|Compressing) objects:\s+(\d+)%/', $line, $m)) {
            $report(2, 'GitHub menyiapkan paket', (int)$m[2], $m[2] . '%');
        } elseif (preg_match('/Enumerating objects:\s+(\d+)/', $line, $m)) {
            $report(2, 'GitHub menyiapkan paket', null, $num((int)$m[1]) . ' objek');
        }
    });
    if ($code !== 0) {
        update_write(update_apply_file(), ['state' => 'error', 'started_at' => $started, 'finished_at' => time(), 'message' => 'Pembaruan gagal diambil: ' . strtok($out, "\n")]);
        exit(1);
    }
    [$behind] = update_pending();
    $steps[1] = $behind > 0 ? $num($behind) . ' pembaruan tersedia' : 'sudah terbaru';
    if ($downloaded === '') {
        // a small package passes without git printing progress: the size of what arrived is read from the new objects
        [, $objects] = update_git(['rev-list', '--objects', 'HEAD..@{u}'], 30);
        [, $bytes] = update_git(['rev-list', '--objects', '--disk-usage', 'HEAD..@{u}'], 30);
        $count = count(array_filter(explode("
", $objects)));
        if ($count > 0) $downloaded = ((int)$bytes > 0 ? $mbOf((int)$bytes) . ', ' : '') . $num($count) . ' objek';
    }
    $steps[2] = $downloaded !== '' ? $downloaded : 'paket kecil';
    // a small update flies by: keep the finished download on screen for a moment so the stage can be seen
    $report(2, 'mengunduh paket', 100, $steps[2] . ' (100%)', true);
    usleep(700000);

    // stage 3: put the changed files in place, a few at a time, so the screen can count them
    [, $listing] = update_git(['diff', '--name-status', 'HEAD..@{u}'], 15);
    $present = [];
    $removed = 0;
    foreach (array_filter(explode("\n", $listing)) as $row) {
        $cols = explode("\t", $row);
        $status = $cols[0][0] ?? '';
        if ($status === 'D') $removed++;
        else $present[] = end($cols);
    }
    $total = count($present) + $removed;
    $sizes = [];
    if ($present) {
        [, $tree] = update_git(['ls-tree', '-r', '-l', '@{u}'], 30);
        $wanted = array_flip($present);
        foreach (array_filter(explode("\n", $tree)) as $row) {
            $tab = strpos($row, "\t");
            if ($tab === false) continue;
            $path = substr($row, $tab + 1);
            if (isset($wanted[$path])) $sizes[$path] = (int)(preg_split('/\s+/', trim(substr($row, 0, $tab)))[3] ?? 0);
        }
    }
    $bytesTotal = array_sum($sizes);
    $done = 0;
    $bytesDone = 0;
    $detail = function () use (&$done, &$bytesDone, $total, $bytesTotal, $num, $mbOf): string {
        return $num($done) . ' dari ' . $num($total) . ' berkas' . ($bytesTotal > 0 ? ', ' . $mbOf($bytesDone) . ' dari ' . $mbOf($bytesTotal) : '') . ' (' . ($total > 0 ? (int)floor(100 * $done / $total) : 100) . '%)';
    };
    $report(3, 'memasang berkas', 0, $detail(), true);
    $batch = max(8, (int)ceil(count($present) / 40));
    foreach (array_chunk($present, $batch) as $chunk) {
        [$code, $out] = update_git(array_merge(['checkout', '@{u}', '--'], $chunk), 120);
        if ($code !== 0) {
            update_write(update_apply_file(), ['state' => 'error', 'started_at' => $started, 'finished_at' => time(), 'message' => 'Pembaruan gagal dipasang: ' . strtok($out, "\n")]);
            exit(1);
        }
        foreach ($chunk as $path) { $done++; $bytesDone += $sizes[$path] ?? 0; }
        $report(3, 'memasang berkas', $total > 0 ? (int)floor(100 * $done / $total) : 100, $detail());
    }
    // files that no longer exist are removed and the branch moves to the new version in one last step
    [$code, $out] = update_git(['merge', '--ff-only', '@{u}'], 120);
    $state = update_read(update_state_file()) ?? [];
    if ($code !== 0) {
        update_write(update_apply_file(), ['state' => 'error', 'started_at' => $started, 'finished_at' => time(), 'message' => 'Pembaruan gagal dipasang: ' . strtok($out, "\n")]);
        exit(1);
    }
    $done = $total;
    $bytesDone = $bytesTotal;
    $steps[3] = $num($total) . ' berkas' . ($removed > 0 ? ' (' . $num($removed) . ' dihapus)' : '') . ($bytesTotal > 0 ? ', ' . $mbOf($bytesTotal) : '');
    $report(3, 'memasang berkas', 100, $detail(), true);
    usleep(500000);
    [$behind, $changes] = update_pending();
    $state['behind'] = $behind;
    $state['changes'] = $changes;
    $state['error'] = null;
    $state['checked_at'] = time();
    $state['head'] = update_head();
    update_write(update_state_file(), $state);
    update_write(update_apply_file(), ['state' => 'done', 'started_at' => $started, 'finished_at' => time(), 'stage' => 3, 'percent' => 100, 'steps' => $steps, 'message' => 'Versi terbaru terpasang.', 'head' => $state['head'], 'files' => $total]);
    exit(0);
}

fwrite(STDERR, "Pemakaian: php update-job.php check|apply\n");
exit(2);
