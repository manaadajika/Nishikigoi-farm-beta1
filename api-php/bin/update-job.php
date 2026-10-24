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
    // what the screen shows: stage (1-3), what is happening, how far that stage is (null = not countable), and a detail line
    $report = function (int $stage, string $label, ?int $percent, string $detail = '', bool $force = false) use ($started, &$last) {
        $now = microtime(true);
        if (!$force && $now - $last < 0.4) return;
        $last = $now;
        update_write(update_apply_file(), ['state' => 'running', 'started_at' => $started, 'stage' => $stage, 'stage_label' => $label, 'percent' => $percent, 'detail' => $detail, 'message' => 'Tahap ' . $stage . '/3: ' . $label]);
    };
    $mb = function (string $size, string $unit): string {
        $value = (float)$size * ['KiB' => 1 / 1024, 'MiB' => 1, 'GiB' => 1024][$unit];
        return number_format($value, 1, ',', '.') . ' MB';
    };

    $report(1, 'memeriksa GitHub', null, 'menghubungi GitHub', true);
    // stage 2: download. git prints "Receiving objects: 45% (1672/2786), 2.52 MiB | 2.47 MiB/s" while it works.
    [$code, $out] = update_git_stream(['fetch', '--progress'], 180, function (string $line) use ($report, $mb) {
        if (preg_match('/Receiving objects:\s+(\d+)% \((\d+)\/(\d+)\)(?:, ([\d.]+) (KiB|MiB|GiB))?/', $line, $m)) {
            $size = isset($m[4]) ? $mb($m[4], $m[5]) . ', ' : '';
            $report(2, 'mengunduh pembaruan', (int)$m[1], $size . number_format((int)$m[2], 0, ',', '.') . ' dari ' . number_format((int)$m[3], 0, ',', '.') . ' objek (' . $m[1] . '%)');
        } elseif (preg_match('/Resolving deltas:\s+(\d+)% \((\d+)\/(\d+)\)/', $line, $m)) {
            $report(2, 'menyusun pembaruan', (int)$m[1], number_format((int)$m[2], 0, ',', '.') . ' dari ' . number_format((int)$m[3], 0, ',', '.') . ' bagian (' . $m[1] . '%)');
        } elseif (preg_match('/(Counting|Compressing) objects:\s+(\d+)%/', $line, $m)) {
            $report(2, 'GitHub menyiapkan paket pembaruan', (int)$m[2], $m[2] . '%');
        } elseif (preg_match('/Enumerating objects:\s+(\d+)/', $line, $m)) {
            $report(2, 'GitHub menyiapkan paket pembaruan', null, number_format((int)$m[1], 0, ',', '.') . ' objek');
        }
    });
    if ($code !== 0) {
        update_write(update_apply_file(), ['state' => 'error', 'started_at' => $started, 'finished_at' => time(), 'message' => 'Pembaruan gagal diambil: ' . strtok($out, "\n")]);
        exit(1);
    }

    // a small update flies by: keep the finished download on screen for a moment so the stage can be seen
    $report(2, 'mengunduh pembaruan', 100, 'unduhan selesai (100%)', true);
    usleep(900000);

    // stage 3: put the new files in place
    [, $names] = update_git(['diff', '--name-only', 'HEAD..@{u}'], 15);
    $files = count(array_filter(explode("\n", $names)));
    $report(3, 'memasang berkas', null, $files > 0 ? number_format($files, 0, ',', '.') . ' berkas diganti' : '', true);
    usleep(600000);
    [$code, $out] = update_git(['pull', '--ff-only'], 180);
    $state = update_read(update_state_file()) ?? [];
    if ($code !== 0) {
        update_write(update_apply_file(), ['state' => 'error', 'started_at' => $started, 'finished_at' => time(), 'message' => 'Pembaruan gagal dipasang: ' . strtok($out, "\n")]);
        exit(1);
    }
    [$behind, $changes] = update_pending();
    $state['behind'] = $behind;
    $state['changes'] = $changes;
    $state['error'] = null;
    $state['checked_at'] = time();
    $state['head'] = update_head();
    update_write(update_state_file(), $state);
    update_write(update_apply_file(), ['state' => 'done', 'started_at' => $started, 'finished_at' => time(), 'stage' => 3, 'percent' => 100, 'message' => 'Versi terbaru terpasang.', 'head' => $state['head'], 'files' => $files]);
    exit(0);
}

fwrite(STDERR, "Pemakaian: php update-job.php check|apply\n");
exit(2);
