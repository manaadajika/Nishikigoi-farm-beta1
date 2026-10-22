<?php
// api-php/handlers/posts.php
//
// Posts, comments and likes shown on every account's profile and on the Beranda page (the X/Twitter-style part of the program).
// A post has text and up to four pictures; a comment is a post with parent_id (one level: comments are made on posts, not on
// comments). Every account that can sign in, Viewer included, can post, comment and like (see required_write_level in lib/auth.php).

require_once __DIR__ . '/../lib/uploads.php';

const POST_MAX_TEXT = 1000;
const POST_MAX_IMAGES = 4;
const POST_PAGE_SIZE = 15;
const POST_COMMENT_LIMIT = 200;

function post_me(): array {
    $session = require_account();
    return ['id' => (int)$session['account_id'], 'role' => (string)($session['account_role'] ?? '')];
}

// The columns every list shows, plus counts and "did I like it". $where uses only columns of p (posts), a (author).
function post_rows(string $where, array $params, int $me, int $limit, string $order = 'p.id DESC'): array {
    $sql = "SELECT p.id, p.author_id, p.parent_id, p.body, p.created_at,
                   a.name AS author_name, a.username AS author_username, a.avatar AS author_avatar, a.role AS author_role,
                   (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.id) AS likes,
                   (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.id AND l.account_id = ?) AS liked,
                   (SELECT COUNT(*) FROM posts c WHERE c.parent_id = p.id) AS comments
            FROM posts p JOIN accounts a ON a.id = p.author_id
            WHERE $where ORDER BY $order LIMIT " . (int)$limit;
    return query($sql, array_merge([$me], $params));
}

// Shapes rows for the client: images, "replying to" summary for comments, booleans.
function post_shape(array $rows, int $me, string $myRole): array {
    if (!$rows) return [];
    $ids = array_map('intval', array_column($rows, 'id'));
    $marks = implode(',', array_fill(0, count($ids), '?'));
    $images = [];
    foreach (query("SELECT post_id, url FROM post_images WHERE post_id IN ($marks) ORDER BY position, id", $ids) as $image) {
        $images[(int)$image['post_id']][] = $image['url'];
    }
    $parentIds = array_values(array_unique(array_filter(array_map(fn($r) => $r['parent_id'] !== null ? (int)$r['parent_id'] : 0, $rows))));
    $parents = [];
    if ($parentIds) {
        $pm = implode(',', array_fill(0, count($parentIds), '?'));
        foreach (query("SELECT p.id, p.body, a.id AS author_id, a.name, a.username FROM posts p JOIN accounts a ON a.id = p.author_id WHERE p.id IN ($pm)", $parentIds) as $parent) {
            $parents[(int)$parent['id']] = [
                'id' => (int)$parent['id'], 'author_id' => (int)$parent['author_id'], 'author_name' => $parent['name'],
                'author_username' => $parent['username'], 'snippet' => mb_substr((string)$parent['body'], 0, 140),
            ];
        }
    }
    $out = [];
    foreach ($rows as $row) {
        $id = (int)$row['id'];
        $out[] = [
            'id' => $id,
            'parent_id' => $row['parent_id'] !== null ? (int)$row['parent_id'] : null,
            'body' => (string)$row['body'],
            'created_at' => $row['created_at'],
            'images' => $images[$id] ?? [],
            'likes' => (int)$row['likes'],
            'liked' => (int)$row['liked'] > 0,
            'comments' => (int)$row['comments'],
            'mine' => (int)$row['author_id'] === $me,
            'can_delete' => (int)$row['author_id'] === $me || $myRole === 'Master Admin',
            'author' => [
                'id' => (int)$row['author_id'], 'name' => $row['author_name'], 'username' => $row['author_username'],
                'avatar' => $row['author_avatar'], 'role' => $row['author_role'],
            ],
            'parent' => $row['parent_id'] !== null ? ($parents[(int)$row['parent_id']] ?? null) : null,
        ];
    }
    return $out;
}

// Sends one page: ids below ?before, newest first, plus has_more.
function post_send_page(string $where, array $params, array $me): void {
    $before = (int)($_GET['before'] ?? 0);
    if ($before > 0) {
        $where .= ' AND p.id < ?';
        $params[] = $before;
    }
    $rows = post_rows($where, $params, $me['id'], POST_PAGE_SIZE + 1);
    $more = count($rows) > POST_PAGE_SIZE;
    if ($more) array_pop($rows);
    send_json(200, ['items' => post_shape($rows, $me['id'], $me['role']), 'has_more' => $more]);
}

// Beranda: every top-level post of every account.
route('GET', '/posts/feed', function () {
    $me = post_me();
    post_send_page('p.parent_id IS NULL', [], $me);
});

// A profile: ?tab=posts (default), replies (comments the account wrote) or media (posts with pictures).
route_pattern('GET', '#^/posts/user/(\d+)$#', function (array $m) {
    $me = post_me();
    $author = (int)$m[1];
    $tab = (string)($_GET['tab'] ?? 'posts');
    if ($tab === 'replies') {
        post_send_page('p.author_id = ? AND p.parent_id IS NOT NULL', [$author], $me);
    } elseif ($tab === 'media') {
        post_send_page('p.author_id = ? AND p.parent_id IS NULL AND EXISTS (SELECT 1 FROM post_images i WHERE i.post_id = p.id)', [$author], $me);
    }
    post_send_page('p.author_id = ? AND p.parent_id IS NULL', [$author], $me);
});

// One post with its comments, oldest first.
route_pattern('GET', '#^/posts/(\d+)$#', function (array $m) {
    $me = post_me();
    $id = (int)$m[1];
    $rows = post_rows('p.id = ?', [$id], $me['id'], 1);
    if (!$rows) send_error(404, 'Postingan tidak ditemukan');
    $post = post_shape($rows, $me['id'], $me['role'])[0];
    $comments = post_rows('p.parent_id = ?', [$id], $me['id'], POST_COMMENT_LIMIT, 'p.id ASC');
    send_json(200, ['post' => $post, 'comments' => post_shape($comments, $me['id'], $me['role'])]);
});

route('POST', '/posts', function () {
    $me = post_me();
    $body = read_json_body();
    $text = trim((string)($body['body'] ?? ''));
    if (mb_strlen($text) > POST_MAX_TEXT) send_error(422, 'Postingan maksimal ' . POST_MAX_TEXT . ' karakter');
    $images = is_array($body['images'] ?? null) ? array_values($body['images']) : [];
    if (count($images) > POST_MAX_IMAGES) send_error(422, 'Gambar maksimal ' . POST_MAX_IMAGES . ' per postingan');
    if ($text === '' && !$images) send_error(422, 'Tulis sesuatu atau pilih gambar');

    $parentId = isset($body['parent_id']) && $body['parent_id'] !== null && $body['parent_id'] !== '' ? (int)$body['parent_id'] : null;
    if ($parentId !== null) {
        $parent = query_one('SELECT id, parent_id FROM posts WHERE id = ?', [$parentId]);
        if (!$parent) send_error(404, 'Postingan yang dibalas tidak ditemukan');
        if ($parent['parent_id'] !== null) send_error(422, 'Komentar hanya bisa dibuat pada postingan');
    }

    $saved = [];
    $pdo = db();
    try {
        foreach ($images as $dataUrl) {
            if (strlen((string)$dataUrl) > 12 * 1024 * 1024) send_error(422, 'Satu gambar maksimal 8 MB');
            try {
                $saved[] = save_image_data((string)$dataUrl, 'post-image');
            } catch (InvalidArgumentException $e) {
                send_error(422, 'Format gambar tidak valid');
            }
        }
        $pdo->beginTransaction();
        execute('INSERT INTO posts (author_id, parent_id, body) VALUES (?, ?, ?)', [$me['id'], $parentId, $text === '' ? null : $text]);
        $postId = (int)$pdo->lastInsertId();
        foreach ($saved as $position => $url) {
            execute('INSERT INTO post_images (post_id, url, position) VALUES (?, ?, ?)', [$postId, $url, $position]);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        foreach ($saved as $url) {
            $rel = substr($url, strlen('/api/uploads/'));
            if (storage_safe_path($rel)) storage_delete($rel);
        }
        throw $e;
    }
    $row = post_rows('p.id = ?', [$postId], $me['id'], 1);
    send_json(201, ['ok' => true, 'post' => post_shape($row, $me['id'], $me['role'])[0]]);
});

// Delete: the author or a Master Admin. A post takes its comments, likes and pictures with it.
route_pattern('DELETE', '#^/posts/(\d+)$#', function (array $m) {
    $me = post_me();
    $id = (int)$m[1];
    $post = query_one('SELECT id, author_id FROM posts WHERE id = ?', [$id]);
    if (!$post) send_error(404, 'Postingan tidak ditemukan');
    if ((int)$post['author_id'] !== $me['id'] && $me['role'] !== 'Master Admin') send_error(403, 'Hanya pemilik postingan yang bisa menghapusnya');
    $ids = [$id];
    foreach (query('SELECT id FROM posts WHERE parent_id = ?', [$id]) as $comment) $ids[] = (int)$comment['id'];
    $marks = implode(',', array_fill(0, count($ids), '?'));
    $urls = array_column(query("SELECT url FROM post_images WHERE post_id IN ($marks)", $ids), 'url');
    execute("DELETE FROM post_likes WHERE post_id IN ($marks)", $ids);
    execute("DELETE FROM post_images WHERE post_id IN ($marks)", $ids);
    execute("DELETE FROM posts WHERE id IN ($marks)", $ids);
    delete_upload_files_if_unused($urls);
    send_json(200, ['ok' => true]);
});

route_pattern('POST', '#^/posts/(\d+)/like$#', function (array $m) {
    $me = post_me();
    $id = (int)$m[1];
    if (!query_one('SELECT id FROM posts WHERE id = ?', [$id])) send_error(404, 'Postingan tidak ditemukan');
    $removed = execute('DELETE FROM post_likes WHERE post_id = ? AND account_id = ?', [$id, $me['id']])->rowCount();
    if (!$removed) execute('INSERT IGNORE INTO post_likes (post_id, account_id) VALUES (?, ?)', [$id, $me['id']]);
    $count = (int)(query_one('SELECT COUNT(*) AS n FROM post_likes WHERE post_id = ?', [$id])['n'] ?? 0);
    send_json(200, ['liked' => !$removed, 'likes' => $count]);
});
