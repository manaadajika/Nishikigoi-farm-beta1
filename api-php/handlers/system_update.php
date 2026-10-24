<?php
// api-php/handlers/system_update.php — "versi baru tersedia" and "Perbarui sekarang" (Master Admin only, see lib/update.php).

require_once __DIR__ . '/../lib/update.php';

route('GET', '/system/update', function () {
    require_account();
    if (!update_enabled()) send_json(200, ['enabled' => false]);

    $state = update_read(update_state_file()) ?? [];
    $apply = update_read(update_apply_file()) ?? [];
    $now = time();
    $checking = isset($state['checking_since']) && $now - (int)$state['checking_since'] < 120;
    $applying = ($apply['state'] ?? '') === 'running' && $now - (int)($apply['started_at'] ?? 0) < 300;
    $age = $now - (int)($state['checked_at'] ?? 0);
    // looked up at most every 3 hours (when a Master Admin has the program open), or when asked (not more than once a minute); the job runs on its own, this answer never waits for it
    $asked = isset($_GET['refresh']) && $age > 60;
    if (!$checking && !$applying && (!isset($state['checked_at']) || $age > 10800 || $asked)) {
        $state['checking_since'] = $now;
        update_write(update_state_file(), $state);
        update_spawn('check');
        $checking = true;
    }

    $behind = (int)($state['behind'] ?? 0);
    $dirty = $behind > 0 && update_is_dirty();
    send_json(200, [
        'enabled' => true,
        'checking' => $checking,
        'checked_at' => $state['checked_at'] ?? null,
        'behind' => $behind,
        'changes' => $state['changes'] ?? [],
        'head' => $state['head'] ?? null,
        'error' => $state['error'] ?? null,
        'dirty' => $dirty,
        'can_apply' => $behind > 0 && !$dirty && !$applying,
        'apply' => ['state' => $apply['state'] ?? null, 'message' => $apply['message'] ?? null, 'finished_at' => $apply['finished_at'] ?? null, 'stage' => $apply['stage'] ?? null, 'stage_label' => $apply['stage_label'] ?? null, 'percent' => $apply['percent'] ?? null, 'detail' => $apply['detail'] ?? null, 'files' => $apply['files'] ?? null],
    ]);
});

route('POST', '/system/update/apply', function () {
    require_account();
    if (!update_enabled()) send_error(409, 'Pembaruan dari dalam program hanya tersedia untuk program hasil git clone yang dijalankan lewat nishikigoi.');
    $state = update_read(update_state_file()) ?? [];
    $apply = update_read(update_apply_file()) ?? [];
    if (($apply['state'] ?? '') === 'running' && time() - (int)($apply['started_at'] ?? 0) < 300) send_error(409, 'Pembaruan sedang berjalan.');
    if ((int)($state['behind'] ?? 0) <= 0) send_error(409, 'Sudah versi terbaru.');
    if (update_is_dirty()) send_error(409, 'Ada berkas program yang diubah di komputer ini, jadi pembaruan otomatis dibatalkan supaya tidak menimpanya.');
    update_write(update_apply_file(), ['state' => 'running', 'started_at' => time(), 'message' => 'Mengambil pembaruan...']);
    update_spawn('apply');
    send_json(202, ['ok' => true]);
});
