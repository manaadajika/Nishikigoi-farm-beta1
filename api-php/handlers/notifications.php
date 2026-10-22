<?php
// api-php/handlers/notifications.php

route('GET', '/notifications', function () {
    $type = trim($_GET['type'] ?? '');
    $panelOnly = ($_GET['panel'] ?? '') === '1';
    $limit = min(max((int)($_GET['limit'] ?? 50), 1), 50);
    $offset = max((int)($_GET['offset'] ?? 0), 0);

    $filters = [];
    $params = [];
    if ($type !== '') { $filters[] = 'type = ?'; $params[] = $type; }
    if ($panelOnly) { $filters[] = 'notification_cleared_at IS NULL'; }
    if (notifications_hide_feedback()) { $filters[] = "type <> 'feedback'"; }
    $where = $filters ? ' WHERE ' . implode(' AND ', $filters) : '';

    $total = query_one("SELECT COUNT(*) AS total FROM system_notifications$where", $params);
    $items = query(
        "SELECT id, type, title, message, status, actor, role, action, target_id, target_label, details, created_at, read_at, notification_cleared_at
         FROM system_notifications$where ORDER BY id DESC LIMIT ? OFFSET ?",
        [...$params, $limit, $offset]
    );

    send_json(200, ['items' => $items, 'total' => (int)$total['total'], 'limit' => $limit, 'offset' => $offset]);
});

function notifications_ids_from_body(array $body): array {
    $raw = is_array($body['ids'] ?? null) ? $body['ids'] : [];
    $ids = [];
    foreach ($raw as $id) {
        $id = (int)$id;
        if ($id > 0 && !in_array($id, $ids, true)) $ids[] = $id;
    }
    return $ids;
}

route('DELETE', '/notifications', function () {
    require_account();
    $body = read_json_body();
    $ids = notifications_ids_from_body($body);
    if (count($ids) === 0) send_error(422, 'Pilih log yang ingin dihapus');

    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $guard = notifications_hide_feedback() ? " AND type <> 'feedback'" : '';
    execute("DELETE FROM system_notifications WHERE id IN ($placeholders)$guard", $ids);
    send_json(200, ['ok' => true, 'deleted' => count($ids)]);
});

route('PATCH', '/notifications/clear', function () {
    require_account();
    $body = read_json_body();
    $ids = notifications_ids_from_body($body);
    if (count($ids) === 0) send_error(422, 'Pilih notifikasi yang ingin dibersihkan');

    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $guard = notifications_hide_feedback() ? " AND type <> 'feedback'" : '';
    execute("UPDATE system_notifications SET notification_cleared_at = NOW() WHERE id IN ($placeholders)$guard", $ids);
    send_json(200, ['ok' => true, 'cleared' => count($ids)]);
});

route_pattern('GET', '#^/notifications/(\d+)$#', function (array $m) {
    $notif = query_one('SELECT * FROM system_notifications WHERE id = ?', [$m[1]]);
    if (!$notif || ($notif['type'] === 'feedback' && notifications_hide_feedback())) send_error(404, 'Notifikasi tidak ditemukan');
    send_json(200, $notif);
});

route_pattern('PATCH', '#^/notifications/(\d+)$#', function (array $m) {
    require_account();
    $body = read_json_body();
    $status = in_array($body['status'] ?? null, ['read', 'unread'], true) ? $body['status'] : 'unread';

    execute(
        "UPDATE system_notifications
         SET status = ?,
             read_at = CASE WHEN ? = 'read' THEN COALESCE(read_at, NOW()) ELSE NULL END
         WHERE id = ?" . (notifications_hide_feedback() ? " AND type <> 'feedback'" : ''),
        [$status, $status, $m[1]]
    );
    send_json(200, ['ok' => true]);
});

route_pattern('PATCH', '#^/notifications/(\d+)/read$#', function (array $m) {
    require_account();
    execute("UPDATE system_notifications SET status = 'read', read_at = NOW() WHERE id = ?" . (notifications_hide_feedback() ? " AND type <> 'feedback'" : ''), [$m[1]]);
    send_json(200, query_one('SELECT * FROM system_notifications WHERE id = ?', [$m[1]]));
});

route_pattern('DELETE', '#^/notifications/(\d+)$#', function (array $m) {
    require_account();
    execute('DELETE FROM system_notifications WHERE id = ?' . (notifications_hide_feedback() ? " AND type <> 'feedback'" : ''), [$m[1]]);
    send_json(200, ['ok' => true]);
});
