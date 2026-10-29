<?php
// api-php/lib/koi_query.php
require_once __DIR__ . '/cache.php';
//
// Server-side list for Data Ikan: filters, search ("kode nama size 49-70cm bloodline:isa ..."), sort and paging all happen
// here, so a page only carries the 24 fish it shows instead of the whole farm, and the server never holds the whole farm
// in memory either (see "how the list is produced" below).
//
// The search rules are a line-by-line port of the browser version that used to live in farm-koi.astro
// (matchesKoiSearch, matchesFieldCriterion, numberTest, ...). Both give the same fish.

const KOI_STATUS_LABELS = [
    'unknown' => 'Unknown', 'male' => 'Male', 'female' => 'Female', 'active' => 'Active', 'non_active' => 'Non-Active',
    'quarantine' => 'Quarantine', 'sold' => 'Sold', 'dead' => 'Dead', 'indukan' => 'Indukan', 'non_indukan' => 'Bukan Indukan',
];

// order matters: a shortened name ("bloo:") resolves to the first alias that starts with it
const KOI_SEARCH_ALIASES = [
    'kode' => 'code', 'code' => 'code', 'id' => 'code',
    'nama' => 'name', 'name' => 'name',
    'variety' => 'variety', 'varietas' => 'variety', 'jenis' => 'variety',
    'bloodline' => 'bloodline', 'darah' => 'bloodline',
    'ternakan' => 'farm_name', 'peternakan' => 'farm_name', 'farm' => 'farm_name',
    'breeding' => 'breeding_session', 'parrent' => 'parent_info',
    'breeder' => 'breeder',
    'induk' => 'parent_info', 'indukan' => 'parent_info', 'parent' => 'parent_info',
    'kolam' => 'pond_name', 'lokasi' => 'pond_name', 'pond' => 'pond_name',
    'area' => 'pond_location',
    'status' => 'status',
    'gender' => 'gender', 'kelamin' => 'gender', 'jk' => 'gender',
    'tipe' => 'parent_type', 'type' => 'parent_type',
    'catatan' => 'notes', 'notes' => 'notes', 'note' => 'notes',
    'ukuran' => 'current_length_cm', 'size' => 'current_length_cm', 'panjang' => 'current_length_cm',
    'hargabeli' => 'purchase_price', 'beli' => 'purchase_price',
    'hargajual' => 'sale_price', 'jual' => 'sale_price',
    'lahir' => 'birth_date', 'tanggallahir' => 'birth_date',
    'tanggalbeli' => 'purchase_date', 'tglbeli' => 'purchase_date',
    'nomor' => 'sequence', 'no' => 'sequence', 'urut' => 'sequence',
    // the names of the Edit / Tambah Ikan form (a label with spaces is written together here: "Harga Jual:" -> hargajual)
    'kodekoi' => 'code', 'owner' => 'breeder', 'parentbreeding' => 'parent_info', 'typ' => 'parent_type', 'sizesaatini' => 'current_length_cm',
    'tgllahir' => 'birth_date', 'terakhirdiedit' => 'updated_at', 'diedit' => 'updated_at',
];

// "Harga Jual:15", "Tanggal Lahir:2025" ... : the form's own labels (with spaces) become one word before the field names are looked up
const KOI_SEARCH_LABELS = [
    'parent/breeding' => 'parentbreeding', 'parent breeding' => 'parentbreeding', 'terakhir diedit' => 'terakhirdiedit', 'tanggal lahir' => 'tanggallahir',
    'tanggal beli' => 'tanggalbeli', 'size saat ini' => 'sizesaatini', 'harga beli' => 'hargabeli', 'harga jual' => 'hargajual', 'kode koi' => 'kodekoi',
];
function koi_normalize_search_labels(string $keyword): string {
    foreach (KOI_SEARCH_LABELS as $label => $compact) {
        $keyword = preg_replace('~(^|[\s,])' . preg_quote($label, '~') . '\s*:~iu', '$1' . $compact . ':', $keyword);
    }
    return $keyword;
}
const KOI_STATUS_WORDS = ['aktif' => 'active', 'nonaktif' => 'non_active', 'non-aktif' => 'non_active', 'karantina' => 'quarantine', 'terjual' => 'sold', 'mati' => 'dead'];
const KOI_GENDER_WORDS = ['jantan' => 'male', 'male' => 'male', 'm' => 'male', 'betina' => 'female', 'female' => 'female', 'f' => 'female', 'u' => 'unknown', 'unknown' => 'unknown', 'belum' => 'unknown'];

// JS: String(value || '').trim().toLowerCase()   (falsy values count as empty)
function koi_norm($value): string {
    if ($value === null || $value === false || $value === '' || $value === 0 || $value === 0.0) return '';
    return mb_strtolower(trim((string)$value), 'UTF-8');
}

function koi_has(string $haystack, string $needle): bool {
    return $needle === '' || mb_strpos($haystack, $needle, 0, 'UTF-8') !== false;
}

// JS parseSearchNumber
function koi_parse_number(string $value, bool $money): ?float {
    $text = preg_replace('/rp|cm|\s/', '', mb_strtolower($value, 'UTF-8'));
    // 15jt / 15 juta = 15.000.000, 500rb / 500 ribu = 500.000 (prices only)
    $factor = 1;
    if ($money && preg_match('/^(.*?)(juta|jt|ribu|rb)$/', $text, $unit) && $unit[1] !== '') {
        $factor = in_array($unit[2], ['juta', 'jt'], true) ? 1000000 : 1000;
        $text = $unit[1];
    }
    if ($money) {
        $text = str_replace('.', '', $text);
    }
    $comma = strpos($text, ',');
    if ($comma !== false) $text = substr_replace($text, '.', $comma, 1);
    if ($text === '' || !is_numeric($text) || preg_match('/^\s|\s$/', $text)) return null;
    $number = (float)$text * $factor;
    // a bare small number in a price field is read as millions ("Harga Jual:15" = 15 juta); real prices here are never below 1.000
    if ($money && $factor === 1 && $number > 0 && $number < 1000) $number *= 1000000;
    return $number;
}

// JS numberTest: "49-70", "45", ">50", ">=50", "<30", "<=30"; returns a callable, or null while the value is still being typed
function koi_number_test(string $value, bool $money): ?callable {
    $text = preg_replace('/rp|cm|\s/', '', mb_strtolower($value, 'UTF-8'));
    if (preg_match('/^(>=|<=|>|<)(.+)$/s', $text, $m)) {
        $limit = koi_parse_number($m[2], $money);
        if ($limit === null) return null;
        switch ($m[1]) {
            case '>=': return fn($n) => $n >= $limit;
            case '<=': return fn($n) => $n <= $limit;
            case '>': return fn($n) => $n > $limit;
            default: return fn($n) => $n < $limit;
        }
    }
    $pattern = $money ? '/^([\d.,]+)-([\d.,]+)$/' : '/^(\d+(?:[.,]\d+)?)-(\d+(?:[.,]\d+)?)$/';
    if (preg_match($pattern, $text, $m)) {
        $first = koi_parse_number($m[1], $money);
        $second = koi_parse_number($m[2], $money);
        if ($first === null || $second === null) return null;
        $min = min($first, $second);
        $max = max($first, $second);
        return fn($n) => $n >= $min && $n <= $max;
    }
    $exact = koi_parse_number($text, $money);
    if ($exact === null) return null;
    $isInt = floor($exact) == $exact;
    return fn($n) => ($isInt && !$money) ? floor($n) == $exact : $n == $exact;
}

// JS dateSearchText: 14/06/2025 or 14-6-2025 become 2025-06-14
function koi_date_search_text(string $value): string {
    $value = trim($value);
    if (preg_match('/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/', $value, $m)) {
        return $m[3] . '-' . str_pad($m[2], 2, '0', STR_PAD_LEFT) . '-' . str_pad($m[1], 2, '0', STR_PAD_LEFT);
    }
    // the program's own date text: 2026 - [10] Oktober - 20 (- Selasa)
    if (preg_match('/^(\d{4})\s*-\s*\[?(\d{1,2})\]?[^\d]*?-\s*(\d{1,2})(?!\d)/u', $value, $m)) {
        return $m[1] . '-' . str_pad($m[2], 2, '0', STR_PAD_LEFT) . '-' . str_pad($m[3], 2, '0', STR_PAD_LEFT);
    }
    return $value;
}

// JS parseParentEntries
function koi_parse_parent_entries($value, $fallbackId, $fallbackLabel): array {
    $fallback = $fallbackId ? [['koi_id' => $fallbackId, 'label' => $fallbackLabel ?: '']] : [];
    $parsed = is_string($value) ? json_decode($value, true) : $value;
    if (!is_array($parsed) || !array_is_list($parsed)) return $fallback;
    return count($parsed) > 0 ? $parsed : $fallback;
}

// JS resolveSearchMarkers: [[matchedText, aliasName, byteIndex], ...]
function koi_search_markers(string $keyword): array {
    $names = array_keys(KOI_SEARCH_ALIASES);
    $found = [];
    if (preg_match_all('/(?:^|[\s,])([a-z]+)\s*:/i', $keyword, $matches, PREG_SET_ORDER | PREG_OFFSET_CAPTURE)) {
        foreach ($matches as $match) {
            $key = strtolower($match[1][0]);
            $name = null;
            if (isset(KOI_SEARCH_ALIASES[$key])) {
                $name = $key;
            } elseif (strlen($key) >= 2) {
                foreach ($names as $alias) {
                    if (strpos($alias, $key) === 0) { $name = $alias; break; }
                }
            }
            if ($name !== null) $found[] = [$match[0][0], $name, $match[0][1]];
        }
    }
    return $found;
}

// ---- how the list is produced -----------------------------------------------------------------------------------------
//
// Nothing here loads "all fish" into PHP. A request works in up to three steps:
//   1. SQL does everything it can do exactly: scope (active / archived), dropdown filters, gender, type, "selected only",
//      count, ordering and the page itself (LIMIT/OFFSET on the covering index idx_koi_scope_order).
//   2. A search text is first turned into a SQL pre-filter that can only be wider than the real search (LIKE on the
//      columns it looks at), so the database throws away most fish.
//   3. The few candidates left are walked in chunks of 1000 (keyset, no OFFSET) and checked by the exact PHP port of the
//      browser's search, which keeps the results identical to the old behaviour.
// Memory therefore stays about the size of one chunk, whatever the number of fish.

// Everything the search needs besides the fish row itself.
function koi_search_context(string $scope): array {
    return ['scope' => $scope, 'rank' => [], 'koi' => [], 'sessions' => null, 'sessionCache' => []];
}

function koi_scope_where(string $scope, string $alias = 'koi'): string {
    if ($scope === 'archived') return "$alias.archived_at IS NOT NULL";
    if ($scope === 'all') return '1=1';
    return "$alias.archived_at IS NULL";
}

// Id of the fish at position $n ("nomor urut") of the scope, or null: koi.seq holds that position (index idx_koi_scope_seq).
function koi_rank_id(array &$ctx, int $n): ?int {
    if ($n < 1) return null;
    if (!array_key_exists($n, $ctx['rank'])) {
        $row = query_read('SELECT koi.id FROM koi WHERE ' . koi_scope_where($ctx['scope']) . ' AND koi.seq = ? ORDER BY koi.created_at, koi.id LIMIT 1', [$n]);
        $ctx['rank'][$n] = $row ? (int)$row[0]['id'] : null;
    }
    return $ctx['rank'][$n];
}

// Parent fish named by breeding sessions, fetched by id (only those) instead of keeping every fish around.
function koi_ctx_preload(array &$ctx, array $ids): void {
    $need = [];
    foreach ($ids as $id) {
        $key = (string)$id;
        if ($key !== '' && ctype_digit($key) && !array_key_exists($key, $ctx['koi'])) $need[$key] = true;
    }
    foreach (array_chunk(array_keys($need), 500) as $chunk) {
        foreach ($chunk as $key) $ctx['koi'][(string)$key] = null;
        $rows = query_read(
            'SELECT koi.id, koi.code, koi.name, koi.variety, koi.bloodline, koi.farm_name FROM koi WHERE ' . koi_scope_where($ctx['scope']) .
            ' AND koi.id IN (' . implode(',', array_fill(0, count($chunk), '?')) . ')',
            array_map('intval', $chunk)
        );
        foreach ($rows as $row) $ctx['koi'][(string)$row['id']] = $row;
    }
}

function koi_breeding_sessions(array &$ctx): array {
    if ($ctx['sessions'] === null) {
        $ctx['sessions'] = query_read(
            'SELECT breeding_batches.batch_code, breeding_batches.session_name, breeding_batches.male_koi_id, breeding_batches.female_koi_id,
                    breeding_batches.male_parent_entries, breeding_batches.female_parent_entries,
                    male.code AS male_koi_code, male.name AS male_koi_name, female.code AS female_koi_code, female.name AS female_koi_name
             FROM breeding_batches
             LEFT JOIN koi AS male ON male.id = breeding_batches.male_koi_id
             LEFT JOIN koi AS female ON female.id = breeding_batches.female_koi_id'
        );
        $ids = [];
        foreach ($ctx['sessions'] as $session) {
            $entries = array_merge(
                koi_parse_parent_entries($session['male_parent_entries'], $session['male_koi_id'], $session['male_koi_name']),
                koi_parse_parent_entries($session['female_parent_entries'], $session['female_koi_id'], $session['female_koi_name'])
            );
            foreach ($entries as $entry) $ids[] = $entry['koi_id'] ?? '';
        }
        koi_ctx_preload($ctx, $ids);
    }
    return $ctx['sessions'];
}

// Batch codes of the breeding sessions whose text (code, name, parents) contains $choice; cached per choice.
function koi_session_codes(array &$ctx, string $choice): array {
    if (!array_key_exists($choice, $ctx['sessionCache'])) {
        $codes = [];
        foreach (koi_breeding_sessions($ctx) as $session) {
            $parents = array_merge(
                koi_parse_parent_entries($session['male_parent_entries'], $session['male_koi_id'], $session['male_koi_name']),
                koi_parse_parent_entries($session['female_parent_entries'], $session['female_koi_id'], $session['female_koi_name'])
            );
            $parentText = implode(' ', array_map(function ($entry) use ($ctx) {
                $koi = $ctx['koi'][(string)($entry['koi_id'] ?? '')] ?? null;
                $bits = [$entry['koi_id'] ?? null, $entry['label'] ?? null, $koi['code'] ?? null, $koi['name'] ?? null, $koi['variety'] ?? null, $koi['bloodline'] ?? null, $koi['farm_name'] ?? null];
                return implode(' ', array_filter($bits, fn($b) => $b !== null && $b !== '' && $b !== false && $b !== 0));
            }, $parents));
            $hay = koi_norm(implode(' ', [$session['batch_code'], $session['session_name'], $session['male_koi_code'], $session['male_koi_name'], $session['female_koi_code'], $session['female_koi_name'], $parentText]));
            if (koi_has($hay, $choice)) {
                $code = koi_norm($session['batch_code']);
                if ($code !== '') $codes[] = $code;
            }
        }
        $ctx['sessionCache'][$choice] = $codes;
    }
    return $ctx['sessionCache'][$choice];
}

// JS matchesFieldCriterion: true / false, or null when the value is still being typed (no filter yet)
function koi_match_field(array $item, string $field, string $rawValue, array &$ctx): ?bool {
    $value = koi_norm($rawValue);
    if ($value === '') return null;

    if ($field === 'current_length_cm' || $field === 'purchase_price' || $field === 'sale_price') {
        $test = koi_number_test($value, $field !== 'current_length_cm');
        if ($test === null) return null;
        $raw = $item[$field] ?? null;
        if ($raw === null || $raw === '' || !is_numeric($raw)) return false;
        return (bool)$test((float)$raw);
    }
    if ($field === 'breeding_session') {
        $wanted = array_values(array_filter(array_map('trim', explode(',', $value)), fn($p) => $p !== ''));
        $info = koi_norm($item['parent_info'] ?? null);
        foreach ($wanted as $choice) {
            if (koi_has($info, $choice)) return true;
            koi_session_codes($ctx, $choice);
            foreach ($ctx['sessionCache'][$choice] as $code) {
                if (koi_has($info, $code)) return true;
            }
        }
        return false;
    }
    if ($field === 'sequence') {
        $wanted = koi_parse_number($value, false);
        if ($wanted === null) return null;
        // "nomor:12": is this the fish at position 12?
        $rankId = floor($wanted) == $wanted ? koi_rank_id($ctx, (int)$wanted) : null;
        return $rankId !== null && $rankId === (int)$item['id'];
    }
    if ($field === 'birth_date' || $field === 'purchase_date' || $field === 'updated_at') {
        return koi_has(substr((string)($item[$field] ?? ''), 0, 10), koi_date_search_text($value));
    }

    $choices = array_values(array_filter(array_map('trim', explode(',', $value)), fn($p) => $p !== ''));
    foreach ($choices as $choice) {
        if ($field === 'status') {
            $raw = mb_strtolower((string)($item['status'] ?? ''), 'UTF-8');
            $wantedStatus = KOI_STATUS_WORDS[$choice] ?? $choice;
            if ($raw === $wantedStatus || koi_has(koi_norm(KOI_STATUS_LABELS[$item['status'] ?? ''] ?? null), $choice)) return true;
        } elseif ($field === 'gender') {
            $raw = mb_strtolower((string)($item['gender'] ?: 'unknown'), 'UTF-8');
            if ($raw === (KOI_GENDER_WORDS[$choice] ?? $choice)) return true;
        } elseif ($field === 'parent_type') {
            $wantedType = preg_match('/^(bukan|non)/', $choice) ? 'non_indukan' : 'indukan';
            if (mb_strtolower((string)($item['parent_type'] ?: 'non_indukan'), 'UTF-8') === $wantedType) return true;
        } elseif ($field === 'pond_location') {
            if (koi_has(koi_norm($item['pond_location'] ?? null), $choice)) return true;
        } else {
            if (koi_has(koi_norm($item[$field] ?? null), $choice)) return true;
        }
    }
    return false;
}

// "<30", ">30cm", ">=45", "30>", "kurang dari 30", "lebih dari 30" are size comparisons: each becomes one word ("lt30", "gt30", "le30",
// "ge30") that koi_plain_terms reads as a size test. The sign alone says the direction, on either side of the number. JS twin: compareSizeWords.
function koi_compare_words(string $text): string {
    $num = '(\d+(?:\.\d+)?)';
    $ops = ['<=' => 'le', '≤' => 'le', '>=' => 'ge', '≥' => 'ge', '<' => 'lt', '>' => 'gt'];
    $text = preg_replace_callback('/\b(?:kurang\s+dari|di\s*bawah)\s*' . $num . '\s*(?:cm)?/iu', fn($m) => ' lt' . $m[1] . ' ', $text);
    $text = preg_replace_callback('/\b(?:lebih\s+dari|di\s*atas)\s*' . $num . '\s*(?:cm)?/iu', fn($m) => ' gt' . $m[1] . ' ', $text);
    $text = preg_replace_callback('/(<=|>=|≤|≥|<|>)\s*' . $num . '\s*(?:cm)?/iu', fn($m) => ' ' . $ops[$m[1]] . $m[2] . ' ', $text);
    $text = preg_replace_callback('/' . $num . '\s*(?:cm)?\s*(<=|>=|≤|≥|<|>)(?!\s*\d)/iu', fn($m) => ' ' . $ops[$m[2]] . $m[1] . ' ', $text);
    return $text;
}

// The plain part of a search text ("kode nama 49-70cm 45cm"): words that look at id/code/name/bloodline/farm, and size tests.
// Shared by the exact check and the SQL pre-filter so both read the text the same way.
function koi_plain_terms(string $plain): array {
    // "size 50-100", "ukuran 45cm": the label word in front of a number is not a word to look for
    $plain = preg_replace('/\b(?:size|ukuran|panjang)\s*(?=\d)/iu', '', $plain);
    $plain = preg_replace('/(\d)\s+cm(?![a-z])/i', '$1cm', $plain);
    $plain = preg_replace('/(\d)\s*(?:cm)?\s*-\s*(\d)/i', '$1-$2', $plain);
    $terms = array_values(array_filter(preg_split('/[,\s]+/u', koi_norm($plain)), fn($t) => $t !== ''));
    $idTerms = [];
    $sizeTests = [];   // ['range', min, max] | ['exact', wanted, isInt]
    foreach ($terms as $term) {
        if (preg_match('/^(\d+(?:[.,]\d+)?)-(\d+(?:[.,]\d+)?)(?:cm)?$/', $term, $m)) {
            $first = (float)str_replace(',', '.', $m[1]);
            $second = (float)str_replace(',', '.', $m[2]);
            $sizeTests[] = ['range', min($first, $second), max($first, $second)];
        } elseif (preg_match('/^(gt|ge|lt|le)(\d+(?:\.\d+)?)$/', $term, $m)) {
            $sizeTests[] = ['compare', $m[1], (float)$m[2]];
        } elseif (preg_match('/^(\d+(?:[.,]\d+)?)cm$/', $term, $m)) {
            $wanted = (float)str_replace(',', '.', $m[1]);
            $sizeTests[] = ['exact', $wanted, floor($wanted) == $wanted];
        } else {
            $idTerms[] = $term;
        }
    }
    return ['id' => $idTerms, 'size' => $sizeTests];
}

// The plain part of a search text, as groups: a comma or a period separates alternatives (OR), spaces inside a group mean
// "all of these" (AND). A period between two digits stays a decimal point ("45.5cm"). JS twin: splitSearchGroups.
function koi_plain_groups(string $plain): array {
    $plain = koi_compare_words($plain);
    $plain = preg_replace('/(\d)\.(?=\d)/', '$1' . chr(1), $plain);
    $groups = [];
    foreach (preg_split('/[,.]+/u', $plain) as $chunk) {
        $chunk = str_replace(chr(1), '.', $chunk);
        // a pasted list of fish codes separated by spaces or new lines ("26CY8E 26EQ6M") lists those fish: each code is its own group
        $words = array_values(array_filter(preg_split('/\s+/u', koi_norm($chunk)), fn($w) => $w !== ''));
        $codes = count($words) > 1;
        foreach ($words as $word) {
            if (!preg_match('/^\d{2}[a-z0-9]{2,}$/u', $word) || preg_match('/cm$/', $word)) { $codes = false; break; }
        }
        foreach ($codes ? $words : [$chunk] as $piece) {
            $parts = koi_plain_terms($piece);
            // the words typed together (spaces) are one phrase, found whole in one of the fields
            if (count($parts['id']) > 1) $parts['id'] = [implode(' ', $parts['id'])];
            if ($parts['id'] || $parts['size']) $groups[] = $parts;
        }
    }
    return $groups;
}

// One group of koi_plain_groups against a fish: every word must be found (code, name, bloodline, ternakan, or the number
// shown on the card), and the size has to fit one of the size tests when there are any.
function koi_group_matches(array $item, array $parts, array &$ctx): bool
{
    if ($parts['id']) {
        $values = [koi_norm($item['code'] ?? null), koi_norm($item['name'] ?? null), koi_norm($item['bloodline'] ?? null), koi_norm($item['farm_name'] ?? null)];
        foreach ($parts['id'] as $term) {
            $hit = false;
            // a number alone also means "the fish at that position"
            if (preg_match('/^\d+$/', $term) && koi_rank_id($ctx, (int)$term) === (int)$item['id']) $hit = true;
            if (!$hit) {
                foreach ($values as $v) {
                    if (koi_has($v, $term)) { $hit = true; break; }
                }
            }
            if (!$hit) return false;
        }
    }

    if ($parts['size']) {
        $raw = $item['current_length_cm'] ?? null;
        $size = ($raw === null || $raw === '') ? 0.0 : (is_numeric($raw) ? (float)$raw : null);
        if ($size === null) return false;
        $known = !($raw === null || $raw === '');   // a fish without a size is never "less than" anything
        // comparisons (">30 <60") all have to hold; ranges and exact sizes ("49-70cm 45cm") are alternatives
        $others = false;
        $ok = false;
        foreach ($parts['size'] as $test) {
            if ($test[0] === 'compare') {
                if (!($known && match ($test[1]) { 'gt' => $size > $test[2], 'ge' => $size >= $test[2], 'lt' => $size < $test[2], default => $size <= $test[2] })) return false;
                continue;
            }
            $others = true;
            $hit = $test[0] === 'range' ? ($size >= $test[1] && $size <= $test[2]) : ($test[2] ? floor($size) == $test[1] : $size == $test[1]);
            if ($hit) $ok = true;
        }
        if ($others && !$ok) return false;
    }
    return true;
}

// JS matchesKoiSearch
function koi_matches_search(array $item, string $keyword, array &$ctx): bool
{
    $keyword = koi_normalize_search_labels(trim($keyword));
    if ($keyword === '') return true;

    $markers = koi_search_markers($keyword);
    $plain = count($markers) ? substr($keyword, 0, $markers[0][2]) : $keyword;

    foreach ($markers as $index => $marker) {
        $valueStart = $marker[2] + strlen($marker[0]);
        $valueEnd = $index + 1 < count($markers) ? $markers[$index + 1][2] : strlen($keyword);
        $field = KOI_SEARCH_ALIASES[strtolower($marker[1])];
        $result = koi_match_field($item, $field, substr($keyword, $valueStart, $valueEnd - $valueStart), $ctx);
        if ($result === false) return false;
    }

    $groups = koi_plain_groups($plain);
    if (!$groups) return true;
    foreach ($groups as $parts) {
        if (koi_group_matches($item, $parts, $ctx)) return true;
    }
    return false;
}

// ---- SQL pre-filter of a search text (always wider than, or equal to, the exact search) --------------------------------

// "contains" on a column, wider than the exact test: case/accent-insensitive, % and _ taken literally
function koi_like(string $columnSql, string $needle, array &$params): string {
    $params[] = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $needle) . '%';
    return "($columnSql COLLATE utf8mb4_unicode_ci LIKE ?)";
}

// JS numberTest as SQL, widened a hair so rounding can never drop a fish the exact check would keep
function koi_number_sql(string $value, bool $money, string $column, array &$params): ?string {
    $text = preg_replace('/rp|cm|\s/', '', mb_strtolower($value, 'UTF-8'));
    $eps = 0.0001;
    if (preg_match('/^(>=|<=|>|<)(.+)$/s', $text, $m)) {
        $limit = koi_parse_number($m[2], $money);
        if ($limit === null) return null;
        if ($m[1] === '>=' || $m[1] === '>') { $params[] = $limit - $eps; return "$column >= ?"; }
        $params[] = $limit + $eps;
        return "$column <= ?";
    }
    $pattern = $money ? '/^([\d.,]+)-([\d.,]+)$/' : '/^(\d+(?:[.,]\d+)?)-(\d+(?:[.,]\d+)?)$/';
    if (preg_match($pattern, $text, $m)) {
        $first = koi_parse_number($m[1], $money);
        $second = koi_parse_number($m[2], $money);
        if ($first === null || $second === null) return null;
        array_push($params, min($first, $second) - $eps, max($first, $second) + $eps);
        return "$column BETWEEN ? AND ?";
    }
    $exact = koi_parse_number($text, $money);
    if ($exact === null) return null;
    if (floor($exact) == $exact && !$money) {
        array_push($params, $exact - $eps, $exact + 1 - $eps);
        return "($column >= ? AND $column < ?)";
    }
    array_push($params, $exact - $eps, $exact + $eps);
    return "$column BETWEEN ? AND ?";
}

// One field:value part of a search text; null = nothing to narrow down (still typing, or only the exact check can tell)
function koi_marker_sql(string $field, string $rawValue, array &$ctx, array &$params): ?string {
    $value = koi_norm($rawValue);
    if ($value === '') return null;

    $numeric = ['current_length_cm' => 'koi.current_length_cm', 'purchase_price' => 'koi.purchase_price', 'sale_price' => 'koi.sale_price'];
    if (isset($numeric[$field])) return koi_number_sql($value, $field !== 'current_length_cm', $numeric[$field], $params);
    if ($field === 'breeding_session') {
        // a fish matches when its parent info holds the text, or the batch code of a session that holds the text
        $wanted = array_values(array_filter(array_map('trim', explode(',', $value)), fn($p) => $p !== ''));
        if (!$wanted) return '0=1';
        $parts = [];
        foreach ($wanted as $choice) {
            $parts[] = koi_like('koi.parent_info', $choice, $params);
            foreach (koi_session_codes($ctx, $choice) as $code) $parts[] = koi_like('koi.parent_info', $code, $params);
        }
        return count($parts) > 300 ? null : '(' . implode(' OR ', $parts) . ')';
    }
    if ($field === 'sequence') {
        $wanted = koi_parse_number($value, false);
        if ($wanted === null) return null;
        $id = floor($wanted) == $wanted ? koi_rank_id($ctx, (int)$wanted) : null;
        if ($id === null) return '0=1';
        $params[] = $id;
        return 'koi.id = ?';
    }
    if ($field === 'birth_date' || $field === 'purchase_date' || $field === 'updated_at') {
        return koi_like("CAST(koi.$field AS CHAR)", koi_date_search_text($value), $params);
    }

    $choices = array_values(array_filter(array_map('trim', explode(',', $value)), fn($p) => $p !== ''));
    if (!$choices) return '0=1';
    $parts = [];
    foreach ($choices as $choice) {
        if ($field === 'status') {
            $wanted = KOI_STATUS_WORDS[$choice] ?? $choice;
            $params[] = $wanted;
            $part = 'LOWER(koi.status) = ?';
            $keys = [];
            foreach (KOI_STATUS_LABELS as $key => $label) {
                if (koi_has(koi_norm($label), $choice)) $keys[] = $key;
            }
            if ($keys) {
                $part .= ' OR koi.status IN (' . implode(',', array_fill(0, count($keys), '?')) . ')';
                foreach ($keys as $key) $params[] = $key;
            }
            $parts[] = "($part)";
        } elseif ($field === 'gender') {
            $params[] = KOI_GENDER_WORDS[$choice] ?? $choice;
            $parts[] = "(LOWER(IFNULL(NULLIF(koi.gender, ''), 'unknown')) = ?)";
        } elseif ($field === 'parent_type') {
            $params[] = preg_match('/^(bukan|non)/', $choice) ? 'non_indukan' : 'indukan';
            $parts[] = "(LOWER(IFNULL(NULLIF(koi.parent_type, ''), 'non_indukan')) = ?)";
        } elseif ($field === 'pond_location') {
            $parts[] = koi_like("COALESCE(NULLIF(ponds.location, ''), NULLIF(koi.area, ''))", $choice, $params);
        } elseif ($field === 'pond_name') {
            $parts[] = koi_like('ponds.name', $choice, $params);
        } else {
            $parts[] = koi_like('koi.' . $field, $choice, $params);   // $field comes from KOI_SEARCH_ALIASES, never from the request
        }
    }
    return '(' . implode(' OR ', $parts) . ')';
}

// Whole search text -> [sql, params]; sql '' = no narrowing
function koi_search_prefilter(string $keyword, array &$ctx): array {
    $keyword = koi_normalize_search_labels(trim($keyword));
    if ($keyword === '') return ['', []];
    $params = [];
    $conds = [];

    $markers = koi_search_markers($keyword);
    $plain = count($markers) ? substr($keyword, 0, $markers[0][2]) : $keyword;
    foreach ($markers as $index => $marker) {
        $valueStart = $marker[2] + strlen($marker[0]);
        $valueEnd = $index + 1 < count($markers) ? $markers[$index + 1][2] : strlen($keyword);
        $field = KOI_SEARCH_ALIASES[strtolower($marker[1])];
        $cond = koi_marker_sql($field, substr($keyword, $valueStart, $valueEnd - $valueStart), $ctx, $params);
        if ($cond !== null) $conds[] = $cond;
    }

    $groupSql = [];
    foreach (koi_plain_groups($plain) as $parts) {
        $own = [];
        foreach ($parts['id'] as $term) {
            $one = [];
            foreach (['koi.code', 'koi.name', 'koi.bloodline', 'koi.farm_name'] as $column) $one[] = koi_like($column, $term, $params);
            if (preg_match('/^\d+$/', $term)) {
                $id = koi_rank_id($ctx, (int)$term);
                if ($id !== null) { $one[] = 'koi.id = ?'; $params[] = $id; }
            }
            $own[] = '(' . implode(' OR ', $one) . ')';
        }
        if ($parts['size']) {
            $any = [];
            $size = 'IFNULL(koi.current_length_cm, 0)';
            foreach ($parts['size'] as $test) {
                if ($test[0] !== 'compare') continue;
                $params[] = $test[2];
                $own[] = '(koi.current_length_cm IS NOT NULL AND koi.current_length_cm ' . ['gt' => '>', 'ge' => '>=', 'lt' => '<', 'le' => '<='][$test[1]] . ' ?)';
            }
            foreach ($parts['size'] as $test) {
                if ($test[0] === 'compare') continue;
                if ($test[0] === 'range') {
                    array_push($params, $test[1] - 0.0001, $test[2] + 0.0001);
                    $any[] = "($size BETWEEN ? AND ?)";
                } elseif ($test[2]) {
                    array_push($params, $test[1] - 0.0001, $test[1] + 1 - 0.0001);
                    $any[] = "($size >= ? AND $size < ?)";
                } else {
                    array_push($params, $test[1] - 0.0001, $test[1] + 0.0001);
                    $any[] = "($size BETWEEN ? AND ?)";
                }
            }
            if ($any) $own[] = '(' . implode(' OR ', $any) . ')';
        }
        $groupSql[] = '(' . implode(' AND ', $own) . ')';
    }
    if ($groupSql) $conds[] = '(' . implode(' OR ', $groupSql) . ')';
    return [$conds ? implode(' AND ', $conds) : '', $params];
}

// ---- paging machinery -------------------------------------------------------------------------------------------------

const KOI_LEAN_COLUMNS = 'koi.id, koi.code, koi.name, koi.variety, koi.bloodline, koi.farm_name, koi.breeder, koi.gender, koi.status,
    koi.parent_type, koi.parent_info, koi.current_length_cm, koi.purchase_price, koi.sale_price,
    koi.birth_date, koi.purchase_date, koi.created_at, koi.updated_at, ponds.name AS pond_name, COALESCE(NULLIF(ponds.location, ""), NULLIF(koi.area, "")) AS pond_location';

function koi_join_ponds(string $sql): string {
    return strpos($sql, 'ponds.') !== false ? ' LEFT JOIN ponds ON ponds.id = koi.pond_id' : '';
}

// Walks the fish of a scope that pass $where, in (created_at, id) order, a chunk at a time (keyset: no OFFSET, constant
// memory). $each($row) returns false to stop.
function koi_scan(string $scope, string $where, array $params, bool $desc, string $columns, callable $each, int $chunk = 1000): void {
    $cmp = $desc ? '<' : '>';
    $dir = $desc ? 'DESC' : 'ASC';
    $cursor = null;
    while (true) {
        $sql = "SELECT $columns FROM koi LEFT JOIN ponds ON ponds.id = koi.pond_id WHERE " . koi_scope_where($scope) . ($where !== '' ? " AND ($where)" : '');
        $bind = $params;
        if ($cursor !== null) {
            // (created_at, id) past the cursor, written out so MySQL starts the index range at the cursor
            $sql .= " AND (koi.created_at $cmp ? OR (koi.created_at = ? AND koi.id $cmp ?))";
            array_push($bind, $cursor[0], $cursor[0], $cursor[1]);
        }
        $rows = query_read($sql . " ORDER BY koi.seq $dir, koi.id $dir LIMIT $chunk", $bind);
        foreach ($rows as $row) {
            if ($each($row) === false) return;
        }
        if (count($rows) < $chunk) return;
        $last = end($rows);
        $cursor = [$last['created_at'], (int)$last['id']];
    }
}

// All SQL: used when the conditions are exact (no search text). [total, ids of the page, first $idCap ids]
function koi_collect_sql(string $scope, string $where, array $params, bool $desc, int $offset, int $limit, int $idCap = 0, ?int $knownTotal = null): array {
    $full = koi_scope_where($scope) . ($where !== '' ? " AND ($where)" : '');
    $join = koi_join_ponds($where);
    $dir = $desc ? 'DESC' : 'ASC';
    $total = $knownTotal ?? (int)query_read("SELECT COUNT(*) AS c FROM koi$join WHERE $full", $params)[0]['c'];
    $slice = [];
    if ($limit > 0 && $total > 0) {
        foreach (query_read("SELECT koi.id FROM koi$join WHERE $full ORDER BY koi.seq $dir, koi.id $dir LIMIT " . (int)$limit . ' OFFSET ' . (int)$offset, $params) as $row) $slice[] = (int)$row['id'];
    }
    $ids = [];
    if ($idCap > 0 && $total > 0) {
        foreach (query_read("SELECT koi.id FROM koi$join WHERE $full ORDER BY koi.seq $dir, koi.id $dir LIMIT " . (int)$idCap, $params) as $row) $ids[] = (int)$row['id'];
    }
    return ['total' => $total, 'slice' => $slice, 'ids' => $ids];
}

// Candidates from SQL ($where, wider than the real condition) checked one by one by $exact. Same result shape.
function koi_collect_scan(string $scope, string $where, array $params, bool $desc, callable $exact, int $offset, int $limit, int $idCap, bool $withNotes): array {
    $columns = KOI_LEAN_COLUMNS . ($withNotes ? ', koi.notes' : '');
    $total = 0;
    $slice = [];
    $ids = [];
    koi_scan($scope, $where, $params, $desc, $columns, function ($row) use (&$total, &$slice, &$ids, $exact, $offset, $limit, $idCap) {
        if (!$exact($row)) return true;
        if ($total >= $offset && count($slice) < $limit) $slice[] = (int)$row['id'];
        if (count($ids) < $idCap) $ids[] = (int)$row['id'];
        $total++;
        return true;
    });
    return ['total' => $total, 'slice' => $slice, 'ids' => $ids];
}

// "nomor urut" of the given fish (stored in koi.seq); 0 for fish that are not in the scope
function koi_seq_map(array $ids, string $scope): array {
    $ids = array_values(array_unique(array_map('intval', $ids)));
    if (!$ids) return [];
    $map = [];
    foreach (array_chunk($ids, 400) as $chunk) {
        $rows = query_read('SELECT koi.id, koi.seq FROM koi WHERE ' . koi_scope_where($scope) . ' AND koi.id IN (' . implode(',', array_fill(0, count($chunk), '?')) . ')', $chunk);
        foreach ($rows as $row) $map[(int)$row['id']] = (int)$row['seq'];
    }
    return $map;
}

// The full row shown on a card / used by the forms: the same shape /koi has always returned, plus `seq`.
function koi_full_rows(array $ids, array $seqById): array {
    if (!$ids) return [];
    $out = [];
    foreach (array_chunk($ids, 400) as $chunk) {
        $placeholders = implode(',', array_fill(0, count($chunk), '?'));
        foreach (query_read(
            "SELECT koi.*, ponds.name AS pond_name, COALESCE(NULLIF(ponds.location, ''), NULLIF(koi.area, '')) AS pond_location,
                    (SELECT growth_logs.length_cm FROM koi_growth_logs growth_logs
                     WHERE growth_logs.koi_id = koi.id
                     ORDER BY growth_logs.measured_at DESC, growth_logs.id DESC LIMIT 1) AS latest_length_cm
             FROM koi LEFT JOIN ponds ON ponds.id = koi.pond_id
             WHERE koi.id IN ($placeholders)",
            $chunk
        ) as $row) {
            $row['seq'] = $seqById[(int)$row['id']] ?? 0;
            $out[(string)$row['id']] = $row;
        }
    }
    $ordered = [];
    foreach ($ids as $id) {
        if (isset($out[(string)$id])) $ordered[] = $out[(string)$id];
    }
    return $ordered;
}

// Dropdown filters, gender, type and "selected only / hide selected" as exact SQL: [sql, params]
function koi_filter_sql(array $in): array {
    $conds = [];
    $params = [];

    $filters = $in['f'] ?? [];
    if (is_string($filters)) $filters = json_decode($filters, true);
    if (!is_array($filters)) $filters = [];
    foreach (['variety', 'bloodline', 'farm_name', 'pond_name', 'status'] as $key) {
        $values = array_values(array_filter(array_map('strval', is_array($filters[$key] ?? null) ? $filters[$key] : []), fn($v) => $v !== ''));
        if (!$values) continue;
        // an archived fish has no pond: its "Lokasi" is where it was (archive_location, e.g. "Ikan Mati", "Vat 10")
        $column = $key === 'pond_name' ? (((string)($in['archived'] ?? '')) === '1' ? 'koi.archive_location' : 'ponds.name') : "koi.$key";
        // "__kosong__" = the fish whose field is not filled in (the "(Kosong)" choice of the dropdown), alone or together with real values
        $wantsEmpty = in_array('__kosong__', $values, true);
        $values = array_values(array_filter($values, fn($v) => $v !== '__kosong__'));
        $parts = [];
        if ($wantsEmpty) $parts[] = "TRIM(IFNULL($column, '')) = ''";
        if ($values) {
            $parts[] = "TRIM($column) COLLATE utf8mb4_bin IN (" . implode(',', array_fill(0, count($values), '?')) . ')';
            foreach ($values as $value) $params[] = $value;
        }
        $conds[] = '(' . implode(' OR ', $parts) . ')';
    }

    // one gender or a comma list (the Gender dropdown is a multiple choice)
    $genders = array_values(array_filter(array_map('trim', explode(',', (string)($in['gender'] ?? ''))), fn($g) => $g !== ''));
    if ($genders) {
        $conds[] = "TRIM(IFNULL(koi.gender, '')) COLLATE utf8mb4_bin IN (" . implode(',', array_fill(0, count($genders), '?')) . ')';
        foreach ($genders as $g) $params[] = $g;
    }
    $types = array_values(array_filter(array_map('trim', explode(',', (string)($in['types'] ?? '')))));
    if ($types) {
        $conds[] = "IFNULL(NULLIF(TRIM(koi.parent_type), ''), 'non_indukan') COLLATE utf8mb4_bin IN (" . implode(',', array_fill(0, count($types), '?')) . ')';
        foreach ($types as $type) $params[] = $type;
    }

    $ids = $in['ids'] ?? [];
    if (is_string($ids)) $ids = array_filter(explode(',', $ids));
    $ids = array_values(array_unique(array_filter(array_map('intval', is_array($ids) ? $ids : []), fn($id) => $id > 0)));
    $mode = (string)($in['ids_mode'] ?? '');
    if ($mode === 'only') {
        if ($ids) {
            $conds[] = 'koi.id IN (' . implode(',', $ids) . ')';
        } else {
            $conds[] = '0=1';
        }
    } elseif ($mode === 'hide' && $ids) {
        $conds[] = 'koi.id NOT IN (' . implode(',', $ids) . ')';
    }
    return [implode(' AND ', $conds), $params];
}

// The list itself. $in: archived, q, f (JSON: dropdown filters), gender, types (comma list), sort, page, per_page,
// ids + ids_mode (only|hide).
function koi_page_result(array $in): array {
    $scope = ((string)($in['archived'] ?? '')) === '1' ? 'archived' : 'active';
    $keyword = koi_normalize_search_labels(trim((string)($in['q'] ?? '')));
    $needsNotes = false;
    foreach (koi_search_markers($keyword) as $marker) {
        if (KOI_SEARCH_ALIASES[$marker[1]] === 'notes') $needsNotes = true;
    }
    $ctx = koi_search_context($scope);
    [$filterSql, $filterParams] = koi_filter_sql($in);
    $desc = ((string)($in['sort'] ?? 'desc')) !== 'asc';
    $perPage = (int)($in['per_page'] ?? 24);
    $perPage = $perPage < 1 ? 24 : min($perPage, 5000);
    $page = max(1, (int)($in['page'] ?? 1));

    $baseTotal = (int)query_read('SELECT COUNT(*) AS c FROM koi WHERE ' . koi_scope_where($scope))[0]['c'];

    if ($keyword === '') {
        // without filters every fish of the scope is in the list: no second count
        $total = $filterSql === '' ? $baseTotal : koi_collect_sql($scope, $filterSql, $filterParams, $desc, 0, 0)['total'];
        $totalPages = max(1, (int)ceil($total / $perPage));
        $page = min($page, $totalPages);
        $result = koi_collect_sql($scope, $filterSql, $filterParams, $desc, ($page - 1) * $perPage, $perPage, 0, $total);
    } else {
        [$searchSql, $searchParams] = koi_search_prefilter($keyword, $ctx);
        $where = implode(' AND ', array_filter([$filterSql, $searchSql], fn($s) => $s !== ''));
        $bind = array_merge($filterParams, $searchParams);
        $exact = function ($row) use ($keyword, &$ctx) { return koi_matches_search($row, $keyword, $ctx); };
        // the page asked for may not exist when the list got shorter: count first when it is out of range
        $result = koi_collect_scan($scope, $where, $bind, $desc, $exact, ($page - 1) * $perPage, $perPage, 0, $needsNotes);
        $total = $result['total'];
        $totalPages = max(1, (int)ceil($total / $perPage));
        if ($page > $totalPages) {
            $page = $totalPages;
            $result = koi_collect_scan($scope, $where, $bind, $desc, $exact, ($page - 1) * $perPage, $perPage, 0, $needsNotes);
        }
    }

    return [
        'items' => koi_full_rows($result['slice'], koi_seq_map($result['slice'], $scope)),
        'total' => $total,
        'page' => $page,
        'per_page' => $perPage,
        'total_pages' => $totalPages,
        'base_total' => $baseTotal,
    ];
}

const KOI_FACET_COLUMNS = ['variety' => 'koi.variety', 'bloodline' => 'koi.bloodline', 'pond_name' => 'ponds.name', 'status' => 'koi.status',
                           'breeder' => 'koi.breeder', 'name' => 'koi.name', 'farm_name' => 'koi.farm_name', 'parent_info' => 'koi.parent_info'];

function koi_facet_scope(bool $archived, bool $includeAll): string {
    return $includeAll ? 'all' : ($archived ? 'archived' : 'active');
}

// Distinct values for the dropdown filters and the suggestion menus (the database does the DISTINCT, case-sensitive).
// $fields limits the work to the lists asked for; name and parent_info have a value per fish, ask for them one search at a time
// (koi_facet_search) when there are many fish.
function koi_facets(bool $archived, bool $includeAll = false, ?array $fields = null): array {
    $scope = koi_facet_scope($archived, $includeAll);
    $out = [];
    foreach (KOI_FACET_COLUMNS as $key => $column) {
        if ($fields !== null && !in_array($key, $fields, true)) continue;
        $join = $key === 'pond_name' ? ' LEFT JOIN ponds ON ponds.id = koi.pond_id' : '';
        if ($key === 'pond_name' && $scope === 'archived') {   // the Lokasi list of the archive: where the fish were
            $column = 'koi.archive_location';
            $join = '';
        }
        $rows = query_read("SELECT DISTINCT BINARY TRIM($column) AS v FROM koi$join WHERE " . koi_scope_where($scope) . " AND $column IS NOT NULL AND TRIM($column) <> ''");
        $values = [];
        foreach ($rows as $row) {
            $v = trim((string)$row['v']);
            if ($v !== '') $values[$v] = true;
        }
        $list = array_map('strval', array_keys($values));
        sort($list, SORT_STRING);
        $out[$key] = $list;
    }
    return $out;
}

// The lists are cheap to keep: one entry per scope/fields in the shared cache (lib/cache.php), valid for 2 minutes and dropped
// whenever fish are added, removed, archived, restored or edited in a field that feeds a list (koi_facets_cache_clear).
const KOI_FACETS_TTL = 120;

function koi_facets_cached(bool $archived, bool $includeAll = false, ?array $fields = null): array {
    $key = 'facets:' . cache_ns('facets') . ':' . koi_facet_scope($archived, $includeAll) . '|' . ($fields === null ? '*' : implode(',', $fields));
    $data = cache_get($key);
    if (is_array($data)) return $data;
    $data = koi_facets($archived, $includeAll, $fields);
    cache_set($key, $data, KOI_FACETS_TTL);
    return $data;
}

function koi_facets_cache_clear(): void {
    cache_bump('facets');
}

// Suggestions while typing: the first $limit distinct values of one field that contain $query.
function koi_facet_search(string $field, string $query, int $limit, bool $archived, bool $includeAll = false): array {
    if (!isset(KOI_FACET_COLUMNS[$field])) return [];
    $column = KOI_FACET_COLUMNS[$field];
    $scope = koi_facet_scope($archived, $includeAll);
    $join = $field === 'pond_name' ? ' LEFT JOIN ponds ON ponds.id = koi.pond_id' : '';
    $params = [];
    $like = '';
    $needle = koi_norm($query);
    if ($needle !== '') $like = ' AND ' . koi_like($column, $needle, $params);
    $limit = max(1, min(50, $limit));
    $rows = query_read("SELECT DISTINCT BINARY TRIM($column) AS v FROM koi$join WHERE " . koi_scope_where($scope) . " AND $column IS NOT NULL AND TRIM($column) <> ''$like ORDER BY v LIMIT $limit", $params);
    $out = [];
    foreach ($rows as $row) {
        $v = trim((string)$row['v']);
        if ($v !== '' && ($needle === '' || koi_has(mb_strtolower($v, 'UTF-8'), $needle))) $out[$v] = true;
    }
    return array_map('strval', array_keys($out));
}

// Fish by id and/or code (any case) with their sequence number; scope: active | archived | all
function koi_batch_rows(array $ids, array $codes, string $scope): array {
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids), fn($id) => $id > 0)));
    $lookup = [];
    foreach ($codes as $code) {
        $code = mb_strtolower(trim((string)$code), 'UTF-8');
        if ($code !== '') $lookup[$code] = true;
    }
    foreach (array_chunk(array_keys($lookup), 500) as $chunk) {
        $rows = query_read('SELECT koi.id FROM koi WHERE ' . koi_scope_where($scope) . ' AND LOWER(TRIM(koi.code)) IN (' . implode(',', array_fill(0, count($chunk), '?')) . ')', array_map('strval', $chunk));
        foreach ($rows as $row) $ids[] = (int)$row['id'];
    }
    $ids = array_slice(array_values(array_unique($ids)), 0, 2000);
    return koi_full_rows($ids, koi_seq_map($ids, $scope));
}

// ---- Picker lookup (Penjualan, Invoice, Inventaris, Laporan, Breeding): the search of assets/koi-picker.js ---------------
// Every word must appear in code/name/variety/bloodline/farm/pond/breeder; "49-70cm" is a size range; a list of two or
// more codes means "any of these codes". Same behaviour the picker always had, now evaluated on the server.
const KOI_PICKER_CODE_LIKE = '/^\d{2}[a-z0-9]{2,}$/u';

function koi_picker_lookup(array $in): array {
    $scope = (string)($in['scope'] ?? 'active');   // active | archived | all
    if (!in_array($scope, ['active', 'archived', 'all'], true)) $scope = 'active';
    $query = trim((string)($in['q'] ?? ''));
    $gender = trim((string)($in['gender'] ?? ''));   // male | female: only fish of that gender are listed (parent pickers)
    $limit = max(1, min(500, (int)($in['limit'] ?? 40)));
    $offset = max(0, (int)($in['offset'] ?? 0));
    $exclude = [];
    foreach (explode(',', (string)($in['exclude'] ?? '')) as $id) {
        if (trim($id) !== '' && ctype_digit(trim($id))) $exclude[] = (int)trim($id);
    }

    // a period between two digits stays a decimal point (45.5), any other period separates like a comma
    $tokens = array_values(array_map(fn($t) => str_replace(chr(1), '.', $t), array_filter(preg_split('/[\s,;.]+/u', preg_replace('/(\d)\.(?=\d)/', '$1' . chr(1), koi_norm($query))), fn($t) => $t !== '')));
    $known = [];
    if (count($tokens) > 1) {
        foreach (array_chunk(array_values(array_unique($tokens)), 500) as $chunk) {
            $rows = query_read('SELECT LOWER(TRIM(koi.code)) AS c FROM koi WHERE ' . koi_scope_where($scope) . ' AND LOWER(TRIM(koi.code)) IN (' . implode(',', array_fill(0, count($chunk), '?')) . ')', $chunk);
            foreach ($rows as $row) $known[mb_strtolower((string)$row['c'], 'UTF-8')] = true;
        }
    }
    $listMode = count($tokens) > 1;
    if ($listMode) {
        foreach ($tokens as $token) {
            if (!isset($known[$token]) && !preg_match(KOI_PICKER_CODE_LIKE, $token)) { $listMode = false; break; }
        }
    }

    $unique = [];
    if ($listMode) {
        foreach ($tokens as $token) $unique[$token] = true;
        $unique = array_map('strval', array_keys($unique));
    }

    // exact conditions
    $conds = [];
    $params = [];
    if ($gender !== '') {
        // a parent picker lists the fish of that gender AND the ones whose gender is not filled in yet (they get the gender of the side when saved)
        $conds[] = "(TRIM(IFNULL(koi.gender, '')) COLLATE utf8mb4_bin = ? OR TRIM(IFNULL(koi.gender, '')) NOT IN ('male', 'female'))";
        $params[] = $gender;
    }
    if ($exclude) $conds[] = 'koi.id NOT IN (' . implode(',', $exclude) . ')';

    if ($listMode) {
        $conds[] = 'LOWER(TRIM(koi.code)) IN (' . implode(',', array_fill(0, count($unique), '?')) . ')';
        foreach ($unique as $token) $params[] = $token;
        $found = koi_collect_sql($scope, implode(' AND ', $conds), $params, true, $offset, $limit, 2000);
    } elseif (!$tokens) {
        $found = koi_collect_sql($scope, implode(' AND ', $conds), $params, true, $offset, $limit, 2000);
    } else {
        // wider SQL pre-filter, then the exact word-by-word check
        $columns = ['koi.code', 'koi.name', 'koi.variety', 'koi.bloodline', 'koi.farm_name', 'ponds.name', 'koi.breeder'];
        $sizeSql = 'IFNULL(koi.current_length_cm, 0)';
        foreach ($tokens as $term) {
            if (preg_match('/^(\d+(?:[.,]\d+)?)-(\d+(?:[.,]\d+)?)(?:cm)?$/', $term, $m)) {
                $a = (float)str_replace(',', '.', $m[1]);
                $b = (float)str_replace(',', '.', $m[2]);
                $conds[] = "($sizeSql BETWEEN ? AND ?)";
                array_push($params, min($a, $b) - 0.0001, max($a, $b) + 0.0001);
            } else {
                $one = [];
                foreach ($columns as $column) $one[] = koi_like($column, $term, $params);
                $conds[] = '(' . implode(' OR ', $one) . ')';
            }
        }
        $exact = function ($row) use ($tokens) {
            $haystack = koi_norm(implode(' ', [$row['code'], $row['name'], $row['variety'], $row['bloodline'], $row['farm_name'], $row['pond_name'], $row['breeder']]));
            $size = (float)($row['current_length_cm'] ?? 0);
            foreach ($tokens as $term) {
                if (preg_match('/^(\d+(?:[.,]\d+)?)-(\d+(?:[.,]\d+)?)(?:cm)?$/', $term, $m)) {
                    $a = (float)str_replace(',', '.', $m[1]);
                    $b = (float)str_replace(',', '.', $m[2]);
                    if (!($size >= min($a, $b) && $size <= max($a, $b))) return false;
                } elseif (!koi_has($haystack, $term)) {
                    return false;
                }
            }
            return true;
        };
        $found = koi_collect_scan($scope, implode(' AND ', $conds), $params, true, $exact, $offset, $limit, 2000, false);
    }

    $missing = [];
    if ($listMode) {
        foreach ($unique as $token) {
            if (!isset($known[$token])) $missing[] = $token;
        }
    }

    return [
        'items' => koi_full_rows($found['slice'], koi_seq_map($found['slice'], $scope)),
        'total' => $found['total'],
        'ids' => array_map('strval', $found['ids']),
        'list_mode' => $listMode,
        'tokens' => $listMode ? $unique : $tokens,
        'missing' => $missing,
        'offset' => $offset,
        'limit' => $limit,
    ];
}
