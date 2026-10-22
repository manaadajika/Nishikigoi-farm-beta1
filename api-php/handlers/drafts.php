<?php
// api-php/handlers/drafts.php
//
// Form drafts (Tambah Ikan, Tambah Breeding, Tambah Laporan) kept on the server so they show in
// the Queue menu and can be continued from any device. Visible to Operator, Admin and Master Admin
// (never Viewer). Saving or continuing a draft needs the same level as saving the form itself.

require_once __DIR__ . '/../lib/uploads.php';

const DRAFT_TYPES = [
    // type => [label, minimum role level to save/continue]
    'koi' => ['Data Ikan', 2],
    'breeding' => ['Breeding', 1],
    'report' => ['Laporan', 1],
    'activity' => ['Laporan Kegiatan', 1],
    'arrival' => ['Laporan Ikan Datang', 1],
];

function draft_session(): array {
    $session = require_account();
    $role = $session['account_role'] ?? $session['role'] ?? null;
    if (role_level($role) < 1) send_error(403, 'Draft hanya untuk Operator, Admin, dan Master Admin.');
    $session['_level'] = role_level($role);
    return $session;
}

function draft_row(array $row, bool $withData): array {
    $item = [
        'id' => (int)$row['id'],
        'type' => $row['type'],
        'type_label' => DRAFT_TYPES[$row['type']][0] ?? $row['type'],
        'name' => $row['name'],
        'summary' => $row['summary'],
        'item_count' => (int)$row['item_count'],
        'created_by_name' => $row['created_by_name'],
        'updated_by_name' => $row['updated_by_name'],
        'created_at' => $row['created_at'],
        'updated_at' => $row['updated_at'],
    ];
    if ($withData) $item['data'] = json_decode((string)$row['data'], true);
    return $item;
}

route('GET', '/drafts', function () {
    draft_session();
    $type = (string)($_GET['type'] ?? '');
    if ($type !== '' && !isset(DRAFT_TYPES[$type])) send_error(422, 'Jenis draft tidak dikenal');
    $rows = $type === ''
        ? query('SELECT * FROM form_drafts ORDER BY updated_at DESC, id DESC')
        : query('SELECT * FROM form_drafts WHERE type = ? ORDER BY updated_at DESC, id DESC', [$type]);
    send_json(200, array_map(fn($row) => draft_row($row, isset($_GET['with_data'])), $rows));
});

route_pattern('GET', '#^/drafts/(\d+)$#', function (array $m) {
    draft_session();
    $row = query_one('SELECT * FROM form_drafts WHERE id = ?', [$m[1]]);
    if (!$row) send_error(404, 'Draft tidak ditemukan (mungkin sudah disimpan atau dihapus).');
    send_json(200, draft_row($row, true));
});

// Create (no id) or overwrite an existing draft (id given).
route('POST', '/drafts', function () {
    $session = draft_session();
    $body = read_json_body();
    $type = (string)($body['type'] ?? '');
    if (!isset(DRAFT_TYPES[$type])) send_error(422, 'Jenis draft tidak dikenal');
    if ($session['_level'] < DRAFT_TYPES[$type][1]) send_error(403, 'Akun ini tidak boleh menyimpan draft ' . DRAFT_TYPES[$type][0] . '.');
    if (!isset($body['data']) || !is_array($body['data'])) send_error(422, 'Isi draft kosong');

    $data = json_encode($body['data'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (strlen($data) > 4 * 1024 * 1024) send_error(413, 'Draft terlalu besar');
    $name = mb_substr(trim((string)($body['name'] ?? '')), 0, 120);
    $summary = mb_substr(trim((string)($body['summary'] ?? '')), 0, 255);
    $count = max(0, (int)($body['item_count'] ?? 0));
    $who = $session['name'] ?: $session['username'];
    $id = (int)($body['id'] ?? 0);

    if ($id > 0 && query_one('SELECT id FROM form_drafts WHERE id = ? AND type = ?', [$id, $type])) {
        $old = query_one('SELECT data FROM form_drafts WHERE id = ?', [$id]);
        execute(
            'UPDATE form_drafts SET data = ?, summary = ?, item_count = ?, name = COALESCE(NULLIF(?, \'\'), name),
                    updated_by = ?, updated_by_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [$data, $summary, $count, $name, $session['account_id'], $who, $id]
        );
        delete_upload_files_if_unused(draft_upload_urls((string)($old['data'] ?? '')));
    } else {
        execute(
            'INSERT INTO form_drafts (type, name, summary, item_count, data, created_by, created_by_name, updated_by, updated_by_name)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$type, $name, $summary, $count, $data, $session['account_id'], $who, $session['account_id'], $who]
        );
        $id = (int)db()->lastInsertId();
    }
    send_json(201, draft_row(query_one('SELECT * FROM form_drafts WHERE id = ?', [$id]), false));
});

route_pattern('PATCH', '#^/drafts/(\d+)$#', function (array $m) {
    $session = draft_session();
    $row = query_one('SELECT * FROM form_drafts WHERE id = ?', [$m[1]]);
    if (!$row) send_error(404, 'Draft tidak ditemukan');
    if ($session['_level'] < DRAFT_TYPES[$row['type']][1]) send_error(403, 'Akun ini tidak boleh mengubah draft ini.');
    $body = read_json_body();
    $name = mb_substr(trim((string)($body['name'] ?? '')), 0, 120);
    execute('UPDATE form_drafts SET name = ?, updated_at = updated_at WHERE id = ?', [$name, $m[1]]);
    send_json(200, draft_row(query_one('SELECT * FROM form_drafts WHERE id = ?', [$m[1]]), false));
});

route_pattern('DELETE', '#^/drafts/(\d+)$#', function (array $m) {
    $session = draft_session();
    $row = query_one('SELECT * FROM form_drafts WHERE id = ?', [$m[1]]);
    if (!$row) send_json(200, ['ok' => true, 'deleted_files' => 0]); // already gone (e.g. saved from another device)
    if ($session['_level'] < DRAFT_TYPES[$row['type']][1]) send_error(403, 'Akun ini tidak boleh menghapus draft ini.');
    execute('DELETE FROM form_drafts WHERE id = ?', [$m[1]]);
    // Photos only this draft used (uploaded when it was saved) are removed; photos already used by
    // real data (because the draft was saved as data) stay.
    $deletedFiles = delete_upload_files_if_unused(draft_upload_urls((string)$row['data']));
    send_json(200, ['ok' => true, 'deleted_files' => $deletedFiles]);
});

function draft_upload_urls(string $json): array {
    preg_match_all('#/api/uploads/[A-Za-z0-9._/-]+#', str_replace('\\/', '/', $json), $m);
    return $m[0] ?? [];
}
