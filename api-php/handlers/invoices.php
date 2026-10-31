<?php
// api-php/handlers/invoices.php
//
// Penjualan > Invoice. An invoice has a client, dated lines (description, qty, unit price; a line may point at a
// Data Ikan fish via koi_id or a Penjualan item via sell_id) and a discount. The total is always calculated here
// from the lines, never trusted from the browser.

const INVOICE_STATUSES = ['unpaid', 'paid'];

function invoice_decode_list($value): array {
    if (is_array($value)) return $value;
    $decoded = json_decode((string)$value, true);
    return is_array($decoded) ? $decoded : [];
}

function invoice_number($value, string $label) {
    $value = blank_to_null($value);
    if ($value === null) return null;
    if (is_string($value)) {
        $text = trim(preg_replace('/^\s*rp\.?\s*/i', '', $value));
        $value = preg_match('/^\d+(\.\d{1,2})?$/', $text) ? $text : str_replace(['.', ','], ['', '.'], $text);
    }
    if (!is_numeric($value) || (float)$value < 0) send_error(400, "$label harus berupa angka");
    return (float)$value;
}

function invoice_clean_items($value): array {
    $clean = [];
    foreach (invoice_decode_list($value) as $line) {
        if (!is_array($line)) continue;
        $description = trim((string)($line['description'] ?? ''));
        if ($description === '') continue;
        $qty = invoice_number($line['qty'] ?? 1, 'Jumlah (qty)');
        $price = invoice_number($line['unit_price'] ?? 0, 'Harga satuan');
        $entry = [
            'description' => mb_substr($description, 0, 300),
            'qty' => $qty === null || $qty <= 0 ? 1 : round($qty, 2),
            'unit_price' => $price === null ? 0 : round($price, 2),
        ];
        if (!empty($line['koi_id'])) $entry['koi_id'] = (int)$line['koi_id'];
        if (!empty($line['sell_id'])) $entry['sell_id'] = (int)$line['sell_id'];
        $clean[] = $entry;
    }
    return $clean;
}

// Proof-of-transfer images: only files this app stored (or an http(s) link), kept in the order they were added.
function invoice_clean_proofs($value): array {
    $clean = [];
    foreach (invoice_decode_list($value) as $entry) {
        if (is_string($entry)) $entry = ['url' => $entry];
        if (!is_array($entry)) continue;
        $url = trim((string)($entry['url'] ?? $entry['image_url'] ?? ''));
        if ($url === '' || !(str_starts_with($url, '/api/uploads/') || preg_match('#^https?://#i', $url))) continue;
        $clean[] = ['url' => $url, 'name' => mb_substr((string)($entry['name'] ?? ''), 0, 200)];
    }
    return $clean;
}

// Documentation photos/videos: same shape as Penjualan's media (sell_clean_media), shown in Galeri on request.
function invoice_clean_media($value): array {
    return sell_clean_media($value);
}

// The collection of an invoice in the Galeri ("Tampilkan dokumentasi di Galeri"): follows media_entries.
// $show: true/false = the user's choice, null = keep what exists (an existing collection is only refreshed).
function sync_invoice_gallery(int $invoiceId, ?bool $show): void {
    $linked = query_one("SELECT id FROM gallery_collections WHERE source_type = 'invoice' AND source_id = ? LIMIT 1", [$invoiceId]);
    if ($show === null) $show = (bool)$linked;
    $invoice = $show ? query_one('SELECT * FROM invoices WHERE id = ?', [$invoiceId]) : null;
    $media = $invoice ? normalize_source_media($invoice['media_entries'] ?? '[]') : [];
    sync_source_gallery('invoice', $invoiceId, $show && $invoice !== null, $media, [
        'pond_id' => null,
        'title' => $invoice ? trim('Invoice ' . $invoice['invoice_no'] . ' - ' . $invoice['client_name']) : '',
        'segment_name' => 'Invoice',
        'gallery_date' => $invoice ? substr((string)$invoice['invoice_date'], 0, 10) : null,
        'notes' => $invoice ? ($invoice['title'] ?: $invoice['notes'] ?: null) : null,
    ]);
}

function invoice_gallery_choice(array $body): ?bool {
    if (!array_key_exists('show_in_gallery', $body)) return null;
    return filter_var($body['show_in_gallery'], FILTER_VALIDATE_BOOLEAN);
}

function invoice_media_urls($value): array {
    $urls = [];
    foreach (invoice_clean_media($value) as $entry) {
        $urls[] = $entry['url'];
        if ($entry['thumbnail_url'] !== '' && $entry['thumbnail_url'] !== $entry['url']) $urls[] = $entry['thumbnail_url'];
    }
    return $urls;
}

function invoice_subtotal(array $items): float {
    $sum = 0.0;
    foreach ($items as $line) $sum += (float)$line['qty'] * (float)$line['unit_price'];
    return $sum;
}

// "50.000", "10%", "10,5%" or several parts separated by a space or + ("10% + 20% + 200.000"): [amount in rupiah, the text tidied], or null when a
// part is not a number. The parts are taken one after the other (a tiered discount): a percent (0-100, one decimal) is of what is left
// after the parts before it, a sum in rupiah is taken off as it is. The discount never exceeds the subtotal.
function invoice_discount_from_text(string $text, float $subtotal): ?array {
    $left = $subtotal;
    $parts = [];
    foreach (preg_split('/[\s+]+/', trim($text), -1, PREG_SPLIT_NO_EMPTY) as $token) {
        if (preg_match('/^(\d+(?:[.,]\d)?)%$/', $token, $m)) {
            $percent = (float)str_replace(',', '.', $m[1]);
            if ($percent > 100) return null;
            $left -= $left * $percent / 100;
            $parts[] = str_replace('.', ',', rtrim(rtrim(number_format($percent, 1, ',', ''), '0'), ',')) . '%';
        } elseif (preg_match('/^[\d.,]+$/', $token)) {
            $digits = preg_replace('/\D/', '', $token);
            if ($digits === '') return null;
            $left -= (float)$digits;
            $parts[] = number_format((float)$digits, 0, ',', '.');
        } else {
            return null;
        }
    }
    if (!$parts) return null;
    $left = max(0.0, $left);
    return [round($subtotal - $left, 0), implode(' + ', $parts)];
}

function invoice_total(array $items, float $discount): float {
    return max(0.0, round(invoice_subtotal($items) - $discount, 2));
}

function invoice_clean_date($value, bool $required, string $label): ?string {
    $value = trim((string)blank_to_null($value));
    if ($value === '') {
        if ($required) send_error(400, "$label wajib diisi");
        return null;
    }
    return koi_clean_partial_date($value, $label);
}

// INV-YYMM-001: the number counts per month. A manual number is kept as typed.
function invoice_next_number(string $date): string {
    // INV-YYMM-001; a date known only by its year (2025-00-00) keeps the month position as 00: INV-2500-001
    [$year, $month] = koi_date_parts($date);
    $prefix = 'INV-' . substr((string)$year, -2) . str_pad((string)$month, 2, '0', STR_PAD_LEFT) . '-';
    $last = query_one('SELECT invoice_no FROM invoices WHERE invoice_no LIKE ? ORDER BY invoice_no DESC LIMIT 1', [$prefix . '%']);
    $number = $last ? ((int)substr((string)$last['invoice_no'], strlen($prefix)) + 1) : 1;
    return $prefix . str_pad((string)$number, 3, '0', STR_PAD_LEFT);
}

function invoice_row(array $row): array {
    $row['items'] = invoice_clean_items($row['items'] ?? '[]');
    $row['payment_proofs'] = invoice_clean_proofs($row['payment_proofs'] ?? '[]');
    $row['media_entries'] = invoice_clean_media($row['media_entries'] ?? '[]');
    return $row;
}

const INVOICE_SELECT = "SELECT invoices.*,
        (SELECT gc.id FROM gallery_collections gc WHERE gc.source_type = 'invoice' AND gc.source_id = invoices.id LIMIT 1) AS gallery_id
    FROM invoices";

route('GET', '/invoices', function () {
    $rows = query(INVOICE_SELECT . ' ORDER BY invoice_date DESC, id DESC');
    send_json(200, array_map('invoice_row', $rows));
});

route('GET', '/invoices-next-number', function () {
    send_json(200, ['invoice_no' => invoice_next_number((string)($_GET['date'] ?? date('Y-m-d')))]);
});

route_pattern('GET', '#^/invoices/(\d+)$#', function (array $m) {
    $row = query_one(INVOICE_SELECT . ' WHERE invoices.id = ?', [$m[1]]);
    if (!$row) send_error(404, 'Invoice tidak ditemukan');
    send_json(200, invoice_row($row));
});

function invoice_fields(array $body, bool $partial, ?array $existing): array {
    $fields = [];
    if (!$partial || array_key_exists('invoice_no', $body)) {
        $no = trim((string)($body['invoice_no'] ?? ''));
        if ($no !== '') $fields['invoice_no'] = mb_substr($no, 0, 40);
    }
    if (!$partial || array_key_exists('client_name', $body)) {
        $client = trim((string)($body['client_name'] ?? ''));
        if ($client === '') send_error(400, 'Nama client atau pembeli wajib diisi');
        $fields['client_name'] = mb_substr($client, 0, 200);
    }
    if (array_key_exists('title', $body)) $fields['title'] = mb_substr(trim((string)$body['title']), 0, 200) ?: null;
    if (array_key_exists('client_contact', $body)) $fields['client_contact'] = trim((string)$body['client_contact']) ?: null;
    if (!$partial || array_key_exists('invoice_date', $body)) $fields['invoice_date'] = invoice_clean_date($body['invoice_date'] ?? date('Y-m-d'), true, 'Tanggal invoice');
    if (array_key_exists('due_date', $body)) $fields['due_date'] = invoice_clean_date($body['due_date'], false, 'Jatuh tempo');
    if (array_key_exists('status', $body)) {
        $status = (string)$body['status'];
        if (!in_array($status, INVOICE_STATUSES, true)) send_error(400, 'Status harus belum dibayar atau lunas');
        $fields['status'] = $status;
    }
    foreach (['sales_contact', 'bank_account', 'notes'] as $column) {
        if (array_key_exists($column, $body)) $fields[$column] = trim((string)$body[$column]) ?: null;
    }
    if (array_key_exists('payment_proofs', $body)) {
        $fields['payment_proofs'] = json_encode(invoice_clean_proofs($body['payment_proofs']), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
    if (array_key_exists('media_entries', $body)) {
        $fields['media_entries'] = json_encode(invoice_clean_media($body['media_entries']), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
    $itemsGiven = array_key_exists('items', $body);
    $discountGiven = array_key_exists('discount', $body);
    if ($itemsGiven) $fields['items'] = json_encode(invoice_clean_items($body['items']), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $textGiven = array_key_exists('discount_text', $body);
    if ($discountGiven) $fields['discount'] = invoice_number($body['discount'], 'Diskon') ?? 0;
    // The discount may be typed as an amount (50.000), a percent of the subtotal (10%) or both (10% 50.000): the amount is worked out
    // here from the lines and again whenever they change. An amount in rupiah alone (older clients) clears the text.
    if ($textGiven) {
        $text = trim((string)blank_to_null($body['discount_text']));
        $fields['discount_text'] = $text === '' ? null : $text;
    } elseif ($discountGiven) {
        $fields['discount_text'] = null;
    }
    if ($itemsGiven || $discountGiven || $textGiven) {
        $items = $itemsGiven ? invoice_clean_items($body['items']) : invoice_clean_items($existing['items'] ?? '[]');
        $discountText = array_key_exists('discount_text', $fields) ? $fields['discount_text'] : ($existing['discount_text'] ?? null);
        if ($discountText !== null && $discountText !== '') {
            $parsed = invoice_discount_from_text((string)$discountText, invoice_subtotal($items));
            if ($parsed === null) send_error(422, 'Diskon tidak valid. Tulis nominal (50.000), persen (10%), atau keduanya (10% 50.000)');
            [$fields['discount'], $fields['discount_text']] = $parsed;
        }
        $discount = array_key_exists('discount', $fields) ? (float)$fields['discount'] : (float)($existing['discount'] ?? 0);
        $fields['total'] = invoice_total($items, $discount);
    }
    return $fields;
}

route('POST', '/invoices', function () {
    $session = require_account();
    $body = read_json_body();
    $fields = invoice_fields($body, false, null);
    $fields += ['status' => 'unpaid', 'items' => '[]', 'discount' => 0, 'total' => 0];
    if (empty($fields['invoice_no'])) $fields['invoice_no'] = invoice_next_number($fields['invoice_date']);
    $fields['created_by'] = (string)($session['username'] ?? '') ?: null;
    $columns = array_keys($fields);
    try {
        execute(
            'INSERT INTO invoices (' . implode(', ', array_map(fn($c) => "`$c`", $columns)) . ') VALUES (' . implode(', ', array_fill(0, count($columns), '?')) . ')',
            array_values($fields)
        );
    } catch (PDOException $e) {
        if (is_duplicate_error($e)) send_error(409, 'Nomor invoice sudah dipakai');
        throw $e;
    }
    $newId = (int)db()->lastInsertId();
    sync_invoice_gallery($newId, invoice_gallery_choice($body) ?? false);
    send_json(201, invoice_row(query_one(INVOICE_SELECT . ' WHERE invoices.id = ?', [$newId])));
});

$invoiceUpdate = function (array $m) {
    require_account();
    $existing = query_one('SELECT * FROM invoices WHERE id = ?', [$m[1]]);
    if (!$existing) send_error(404, 'Invoice tidak ditemukan');
    $body = read_json_body();
    $fields = invoice_fields($body, true, $existing);
    $galleryChoice = invoice_gallery_choice($body);
    if (!$fields && $galleryChoice === null) send_error(400, 'Tidak ada field untuk diupdate');
    if ($fields) {
        $sets = implode(', ', array_map(fn($c) => "`$c` = ?", array_keys($fields)));
        try {
            execute("UPDATE invoices SET $sets WHERE id = ?", [...array_values($fields), $m[1]]);
        } catch (PDOException $e) {
            if (is_duplicate_error($e)) send_error(409, 'Nomor invoice sudah dipakai');
            throw $e;
        }
    }
    // the Galeri collection follows the documentation (and the invoice number/client in its title)
    sync_invoice_gallery((int)$m[1], $galleryChoice);
    $dropped = [];
    if (array_key_exists('payment_proofs', $fields)) {
        $kept = array_column(invoice_clean_proofs($fields['payment_proofs']), 'url');
        $dropped = array_diff(array_column(invoice_clean_proofs($existing['payment_proofs'] ?? '[]'), 'url'), $kept);
    }
    if (array_key_exists('media_entries', $fields)) {
        $dropped = array_merge($dropped, array_diff(invoice_media_urls($existing['media_entries'] ?? '[]'), invoice_media_urls($fields['media_entries'])));
    }
    $dropped = array_values(array_unique($dropped));
    if ($dropped) {
        require_once __DIR__ . '/../lib/uploads.php';
        delete_upload_files_if_unused($dropped);
    }
    send_json(200, invoice_row(query_one(INVOICE_SELECT . ' WHERE invoices.id = ?', [$m[1]])));
};
route_pattern('PATCH', '#^/invoices/(\d+)$#', $invoiceUpdate);
route_pattern('PUT', '#^/invoices/(\d+)$#', $invoiceUpdate);

route_pattern('DELETE', '#^/invoices/(\d+)$#', function (array $m) {
    require_account();
    $row = query_one('SELECT payment_proofs, media_entries FROM invoices WHERE id = ?', [$m[1]]);
    if (!$row) send_error(404, 'Invoice tidak ditemukan');
    execute('DELETE FROM invoices WHERE id = ?', [$m[1]]);
    execute("DELETE FROM gallery_collections WHERE source_type = 'invoice' AND source_id = ?", [$m[1]]);
    $urls = array_values(array_unique(array_merge(
        array_column(invoice_clean_proofs($row['payment_proofs'] ?? '[]'), 'url'),
        invoice_media_urls($row['media_entries'] ?? '[]')
    )));
    if ($urls) {
        require_once __DIR__ . '/../lib/uploads.php';
        delete_upload_files_if_unused($urls);
    }
    send_json(200, ['ok' => true]);
});
