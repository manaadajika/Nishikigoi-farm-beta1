<?php
// api-php/lib/version.php — the version shown in every footer and in the Change Log: V<major>-<YYMMDD of the release>-<GitHub commit>.
// The first two parts are written here (raise the date on every release); the last part is the commit this folder is on, read from .git
// (no git process needed), so a program taken from GitHub always shows exactly which version of GitHub it is.

const APP_VERSION_LABEL = 'V2-261024';

function app_commit(): string {
    $git = dirname(__DIR__, 2) . '/.git';
    if (!is_dir($git)) return '';
    $head = trim((string)@file_get_contents($git . '/HEAD'));
    if ($head === '') return '';
    if (preg_match('/^[0-9a-f]{40}$/i', $head)) return substr($head, 0, 7);   // detached HEAD
    if (strpos($head, 'ref: ') !== 0) return '';
    $ref = trim(substr($head, 5));
    $sha = trim((string)@file_get_contents($git . '/' . $ref));
    if (!preg_match('/^[0-9a-f]{40}$/i', $sha)) {
        // the branch can live only in packed-refs (after git gc)
        foreach (explode("\n", (string)@file_get_contents($git . '/packed-refs')) as $line) {
            if (preg_match('/^([0-9a-f]{40}) ' . preg_quote($ref, '/') . '$/i', trim($line), $m)) { $sha = $m[1]; break; }
        }
    }
    return preg_match('/^[0-9a-f]{40}$/i', $sha) ? substr($sha, 0, 7) : '';
}

function app_version(): array {
    $commit = app_commit();
    return ['label' => APP_VERSION_LABEL, 'commit' => $commit, 'full' => $commit !== '' ? APP_VERSION_LABEL . '-' . $commit : APP_VERSION_LABEL];
}
