<?php
// api-php/handlers/farm_reports.php

route('GET', '/farm-reports', function () {
    send_json(200, query(
        "SELECT farm_reports.*, ponds.name AS pond_name, koi.code AS koi_code, koi.name AS koi_name,
                (SELECT gc.id FROM gallery_collections gc WHERE gc.source_type = 'report' AND gc.source_id = farm_reports.id LIMIT 1) AS gallery_id
         FROM farm_reports
         LEFT JOIN ponds ON ponds.id = farm_reports.pond_id
         LEFT JOIN koi ON koi.id = farm_reports.koi_id
         ORDER BY farm_reports.created_at DESC LIMIT 50"
    ));
});

// Mirrors the original Node app's getReportBatchCode(): format
// "Report-{YY}-{MM}-{NN}" scoped per report month, always computed
// server-side from report_date (the client never supplies this on
// create). On edit, keeps the existing code if the report stayed in
// the same year-month, regenerates only if the month changed.
function get_report_batch_code(string $reportDate, ?int $excludeId = null, string $existingCode = ''): string {
    $dateValue = substr($reportDate, 0, 10);
    if (!preg_match('/^(\d{4})-(\d{2})-/', $dateValue, $m)) {
        return $existingCode;
    }
    $prefix = 'Report-' . substr($m[1], -2) . '-' . $m[2] . '-';
    if ($existingCode !== '' && str_starts_with($existingCode, $prefix)) {
        return $existingCode;
    }

    $sql = 'SELECT batch_code FROM farm_reports WHERE batch_code LIKE ?';
    $params = [$prefix . '%'];
    if ($excludeId !== null) {
        $sql .= ' AND id != ?';
        $params[] = $excludeId;
    }
    $maxNumber = 0;
    foreach (query($sql, $params) as $row) {
        $number = (int)substr((string)$row['batch_code'], strlen($prefix));
        $maxNumber = max($maxNumber, $number);
    }
    return $prefix . str_pad((string)($maxNumber + 1), 2, '0', STR_PAD_LEFT);
}

// "Tampilkan media di Galeri": one gallery collection per report (source_type 'report'), showing the
// report's own media (same files, nothing copied). $show: true = create/update, false = remove,
// null = not sent (edit keeps the current choice and only refreshes an existing collection).
function sync_report_gallery(int $reportId, ?bool $show): void {
    $linked = query_one("SELECT id FROM gallery_collections WHERE source_type = 'report' AND source_id = ? LIMIT 1", [$reportId]);
    if ($show === null) $show = (bool)$linked;
    $report = $show ? query_one('SELECT * FROM farm_reports WHERE id = ?', [$reportId]) : null;
    $media = $report ? normalize_source_media($report['media_entries']) : [];

    $ponds = $report ? json_decode((string)$report['pond_entries'], true) : null;
    if (is_string($ponds)) $ponds = json_decode($ponds, true);
    $pondId = is_array($ponds) && !empty($ponds[0]['pond_id']) ? (int)$ponds[0]['pond_id'] : null;
    $title = $report ? trim('Laporan ' . ($report['batch_code'] ?? '') . (!empty($report['report_title']) ? ' - ' . $report['report_title'] : '')) : '';
    sync_source_gallery('report', $reportId, $show && $report !== null, $media, [
        'pond_id' => $pondId, 'title' => $title, 'segment_name' => 'Laporan',
        'gallery_date' => $report && $report['report_date'] ? substr((string)$report['report_date'], 0, 10) : null,
        'notes' => $report ? ($report['notes'] ?: null) : null,
    ]);
}

function report_gallery_choice(array $body): ?bool {
    if (!array_key_exists('show_in_gallery', $body)) return null;
    return filter_var($body['show_in_gallery'], FILTER_VALIDATE_BOOLEAN);
}

route('GET', '/farm-report-next-code', function () {
    $date = $_GET['date'] ?? date('Y-m-d');
    send_json(200, ['batch_code' => get_report_batch_code($date)]);
});

// Numeric report columns: "", "-" and null mean "no value"; "28,5" is accepted; anything else is a clear 400
// instead of a database error (500).
function report_number($value, string $label) {
    $value = blank_to_null($value);
    if ($value === null) return null;
    if (is_string($value)) $value = str_replace(',', '.', trim($value));
    if (!is_numeric($value)) send_error(400, "$label harus berupa angka (isi: " . (is_scalar($value) ? $value : '?') . ')');
    return $value;
}

route('POST', '/farm-reports', function () {
    require_account();
    $body = read_json_body();
    $reportType = trim($body['report_type'] ?? '');
    $reportDate = trim($body['report_date'] ?? '');
    if ($reportType === '' || $reportDate === '') send_error(400, 'report_type dan report_date wajib diisi');

    $batchCode = get_report_batch_code($reportDate);

    $jsonCols = ['pond_entries', 'breeding_entries', 'koi_entries', 'reporter_entries', 'spectrum_sizes', 'media_entries', 'condition_entries', 'sorting_entries'];
    $encode = fn($k) => in_array($k, $jsonCols) && isset($body[$k]) ? json_encode($body[$k]) : ($body[$k] ?? null);

    execute(
        'INSERT INTO farm_reports (report_type, report_date, pond_id, koi_id, reporter, qty, average_length_cm,
             average_weight_g, result, notes, video_url, video_thumbnail_url, origin_location, pond_entries,
             breeding_entries, koi_entries, reporter_entries, dominant_variety, spectrum_sizes, spectrum_summary,
             validation_checks, media_entries, report_title, batch_code, activity_data,
             destination_location, condition_entries, sorting_entries)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
            $reportType, $reportDate, blank_to_null($body['pond_id'] ?? null), blank_to_null($body['koi_id'] ?? null), $body['reporter'] ?? null,
            report_number($body['qty'] ?? null, 'Jumlah'), report_number($body['average_length_cm'] ?? null, 'Rata-rata ukuran'), report_number($body['average_weight_g'] ?? null, 'Rata-rata berat'),
            $body['result'] ?? null, $body['notes'] ?? null, $body['video_url'] ?? null, $body['video_thumbnail_url'] ?? null,
            $body['origin_location'] ?? null, $encode('pond_entries'), $encode('breeding_entries'), $encode('koi_entries'),
            $encode('reporter_entries'), $body['dominant_variety'] ?? null, $encode('spectrum_sizes'),
            $body['spectrum_summary'] ?? null, $body['validation_checks'] ?? null, $encode('media_entries'),
            $body['report_title'] ?? null, $batchCode,
            isset($body['activity_data']) ? (is_string($body['activity_data']) ? $body['activity_data'] : json_encode($body['activity_data'], JSON_UNESCAPED_UNICODE)) : null,
            $body['destination_location'] ?? null, $encode('condition_entries'), $encode('sorting_entries'),
        ]
    );
    $reportId = (int)db()->lastInsertId();
    sync_report_gallery($reportId, report_gallery_choice($body) ?? false);
    send_json(201, query_one('SELECT * FROM farm_reports WHERE id = ?', [$reportId]));
});

route_pattern('GET', '#^/farm-reports/(\d+)$#', function (array $m) {
    $report = query_one('SELECT * FROM farm_reports WHERE id = ?', [$m[1]]);
    if (!$report) send_error(404, 'Laporan tidak ditemukan');
    send_json(200, $report);
});

$farmReportUpdateHandler = function (array $m) {
    require_account();
    $body = read_json_body();
    $cols = ['report_type', 'report_date', 'pond_id', 'koi_id', 'reporter', 'qty', 'average_length_cm',
             'average_weight_g', 'result', 'notes', 'video_url', 'video_thumbnail_url', 'report_title',
             'origin_location', 'pond_entries', 'breeding_entries', 'koi_entries', 'reporter_entries',
             'media_entries', 'spectrum_sizes', 'spectrum_summary', 'validation_checks', 'dominant_variety', 'activity_data',
             'destination_location', 'condition_entries', 'sorting_entries'];
    $jsonCols = ['pond_entries', 'breeding_entries', 'koi_entries', 'reporter_entries', 'spectrum_sizes', 'media_entries', 'activity_data', 'condition_entries', 'sorting_entries'];
    $numericCols = ['pond_id', 'koi_id', 'qty', 'average_length_cm', 'average_weight_g'];
    $fields = [];
    $params = [];
    foreach ($cols as $col) {
        if (array_key_exists($col, $body)) {
            $fields[] = "$col = ?";
            if (in_array($col, $jsonCols, true)) {
                $params[] = json_encode($body[$col]);
            } elseif (in_array($col, ['qty', 'average_length_cm', 'average_weight_g'], true)) {
                $params[] = report_number($body[$col], $col === 'qty' ? 'Jumlah' : ($col === 'average_length_cm' ? 'Rata-rata ukuran' : 'Rata-rata berat'));
            } elseif (in_array($col, $numericCols, true)) {
                $params[] = blank_to_null($body[$col]);
            } else {
                $params[] = $body[$col];
            }
        }
    }

    // Recompute batch_code same as the original app: keep it if the report
    // stayed in the same year-month, regenerate only if report_date moved
    // to a different month.
    if (array_key_exists('report_date', $body)) {
        $existing = query_one('SELECT report_date, batch_code FROM farm_reports WHERE id = ?', [$m[1]]);
        $existingMonth = substr((string)($existing['report_date'] ?? ''), 0, 7);
        $nextMonth = substr((string)$body['report_date'], 0, 7);
        $keepCode = $existingMonth === $nextMonth ? (string)($existing['batch_code'] ?? '') : '';
        $fields[] = 'batch_code = ?';
        $params[] = get_report_batch_code((string)$body['report_date'], (int)$m[1], $keepCode);
    }

    if (!$fields && report_gallery_choice($body) === null) send_error(400, 'Tidak ada field untuk diupdate');
    if ($fields) {
        $params[] = $m[1];
        execute('UPDATE farm_reports SET ' . implode(', ', $fields) . ' WHERE id = ?', $params);
    }
    sync_report_gallery((int)$m[1], report_gallery_choice($body));

    $report = query_one('SELECT * FROM farm_reports WHERE id = ?', [$m[1]]);
    if (!$report) send_error(404, 'Laporan tidak ditemukan');
    send_json(200, $report);
};

route_pattern('PATCH', '#^/farm-reports/(\d+)$#', $farmReportUpdateHandler);
route_pattern('PUT', '#^/farm-reports/(\d+)$#', $farmReportUpdateHandler);

route_pattern('DELETE', '#^/farm-reports/(\d+)$#', function (array $m) {
    require_account();
    require_once __DIR__ . '/../lib/uploads.php';
    $urls = array_merge(
        upload_urls_in_rows([query_one('SELECT * FROM farm_reports WHERE id = ?', [$m[1]])]),
        gallery_upload_urls_for_source('report', (int)$m[1])
    );
    execute("DELETE FROM gallery_collections WHERE source_type = 'report' AND source_id = ?", [$m[1]]);
    execute('DELETE FROM farm_reports WHERE id = ?', [$m[1]]);
    $deletedFiles = delete_upload_files_if_unused($urls);
    send_json(200, ['ok' => true, 'deleted_files' => $deletedFiles]);
});
