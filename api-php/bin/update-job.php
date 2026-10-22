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
    update_write(update_apply_file(), ['state' => 'running', 'started_at' => $started, 'message' => 'Mengambil pembaruan...']);
    update_git(['fetch', '--quiet'], 60);
    [$code, $out] = update_git(['pull', '--ff-only'], 180);
    $state = update_read(update_state_file()) ?? [];
    if ($code !== 0) {
        update_write(update_apply_file(), ['state' => 'error', 'started_at' => $started, 'finished_at' => time(), 'message' => 'Pembaruan gagal diambil: ' . strtok($out, "\n")]);
        exit(1);
    }
    [$behind, $changes] = update_pending();
    $state['behind'] = $behind;
    $state['changes'] = $changes;
    $state['error'] = null;
    $state['checked_at'] = time();
    $state['head'] = update_head();
    update_write(update_state_file(), $state);
    update_write(update_apply_file(), ['state' => 'done', 'started_at' => $started, 'finished_at' => time(), 'message' => 'Versi terbaru terpasang.', 'head' => $state['head']]);
    exit(0);
}

fwrite(STDERR, "Pemakaian: php update-job.php check|apply\n");
exit(2);
