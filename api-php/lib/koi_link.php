<?php
// api-php/lib/koi_link.php
//
// A fish that belongs to a breeding session (Data Ikan > Indukan/Breeding, saved in koi.parent_info as
// "BR260903 - Nama sesi | Female: ... | Male: ...") does not choose its own Bloodline and Ternakan:
//   Bloodline = the session's title (breeding_batches.session_name)
//   Ternakan  = the program's name (app_settings brand_name, "Nama program" in Master Akun)
// These functions keep the stored values in line with that, whenever a fish is saved, a session is renamed or the
// program name changes. Every function takes the PDO to use so the schema check (lib/db.php) can call them too.

// "BR260903 - Nama sesi | Female: X | Male: Y" -> [ "BR260903 - Nama sesi", " | Female: X | Male: Y" ]
function koi_split_parent_info(string $info): array {
    if (preg_match('/^(.*?)(\s*\|?\s*Female:.*)$/is', $info, $m)) return [trim($m[1]), $m[2]];
    return [trim($info), ''];
}

function koi_session_code_of(string $info): string {
    [$parent] = koi_split_parent_info($info);
    return preg_match('/^(\S+)/u', $parent, $m) ? $m[1] : '';
}

function koi_program_name(PDO $pdo): string {
    $stmt = $pdo->prepare("SELECT value FROM app_settings WHERE `key` = 'brand_name'");
    $stmt->execute();
    $row = $stmt->fetch();
    return trim((string)($row['value'] ?? ''));
}

// Brings Bloodline, Ternakan and the session label inside parent_info in line with the sessions.
// $ids = only these fish (null = every fish); $renames = ['OLDCODE' => 'NEWCODE'] for a session whose code just changed;
// $dry = only count and list, change nothing. Returns ['checked' => n, 'changed' => n, 'rows' => [[code, field, from, to], ...]].
function koi_sync_session_links(PDO $pdo, ?array $ids = null, array $renames = [], bool $dry = false): array {
    $sessions = [];
    foreach ($pdo->query('SELECT batch_code, session_name FROM breeding_batches')->fetchAll() as $row) {
        $sessions[mb_strtolower((string)$row['batch_code'])] = $row;
    }
    $renameMap = [];
    foreach ($renames as $old => $new) $renameMap[mb_strtolower((string)$old)] = mb_strtolower((string)$new);
    $program = koi_program_name($pdo);

    $sql = "SELECT id, code, parent_info, bloodline, farm_name FROM koi WHERE parent_info IS NOT NULL AND parent_info <> ''";
    $params = [];
    if ($ids !== null) {
        $ids = array_values(array_filter(array_map('intval', $ids), fn($id) => $id > 0));
        if (!$ids) return ['checked' => 0, 'changed' => 0, 'rows' => []];
        $sql .= ' AND id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')';
        $params = $ids;
    }
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $update = $pdo->prepare('UPDATE koi SET bloodline = ?, farm_name = ?, parent_info = ? WHERE id = ?');

    $checked = 0;
    $changed = 0;
    $rows = [];
    foreach ($stmt->fetchAll() as $koi) {
        $info = (string)$koi['parent_info'];
        $key = mb_strtolower(koi_session_code_of($info));
        $key = $renameMap[$key] ?? $key;
        if ($key === '' || !isset($sessions[$key])) continue;
        $checked++;
        $session = $sessions[$key];
        $title = trim((string)$session['session_name']);

        $bloodline = $title !== '' ? $title : (string)$koi['bloodline'];
        $farm = $program !== '' ? $program : (string)$koi['farm_name'];
        [, $tail] = koi_split_parent_info($info);
        $label = $session['batch_code'] . ($title !== '' ? ' - ' . $title : '');
        $newInfo = $label . $tail;

        $diff = [];
        if ((string)$koi['bloodline'] !== $bloodline) $diff[] = ['bloodline', $koi['bloodline'], $bloodline];
        if ((string)$koi['farm_name'] !== $farm) $diff[] = ['farm_name', $koi['farm_name'], $farm];
        if ($info !== $newInfo) $diff[] = ['parent_info', $info, $newInfo];
        if (!$diff) continue;

        $changed++;
        foreach ($diff as $d) $rows[] = [$koi['code'], $d[0], $d[1], $d[2]];
        if (!$dry) $update->execute([$bloodline, $farm, $newInfo, $koi['id']]);
    }
    return ['checked' => $checked, 'changed' => $changed, 'rows' => $rows];
}

// One time, after the update that introduced the rule: fish saved earlier with a hand-typed Bloodline/Ternakan are brought in line.
function ensure_koi_session_link_backfill(PDO $pdo): void {
    try {
        $stmt = $pdo->prepare("SELECT value FROM app_settings WHERE `key` = 'koi_session_link_v1'");
        $stmt->execute();
        if ($stmt->fetch()) return;
        koi_sync_session_links($pdo);
        $pdo->prepare("INSERT INTO app_settings (`key`, value) VALUES ('koi_session_link_v1', ?) ON DUPLICATE KEY UPDATE value = VALUES(value)")->execute([date('Y-m-d H:i:s')]);
    } catch (Throwable $e) {
        error_log('[nishikigoi-api] koi session link backfill failed: ' . $e->getMessage());
    }
}
