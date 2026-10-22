<?php
// api-php/handlers/koi_page.php
//
// Server-side list for Data Ikan (see lib/koi_query.php): GET /koi/page, GET /koi/facets, POST /koi/batch.

require_once __DIR__ . '/../lib/koi_query.php';

// ?archived=1&q=...&f={"variety":["Kohaku"]}&gender=male&types=indukan&sort=desc&page=2&per_page=24
route('GET', '/koi/page', function () {
    send_json(200, koi_page_result($_GET));
});

// the same, with a body: needed when the list is limited to selected fish (a long list of ids)
route('POST', '/koi/page', function () {
    send_json(200, koi_page_result(read_json_body()));
});

// distinct values for the dropdown filters and suggestion menus
route('GET', '/koi/facets', function () {
    $archived = (string)($_GET['archived'] ?? '');
    $fields = array_values(array_filter(array_map('trim', explode(',', (string)($_GET['fields'] ?? '')))));
    send_json(200, koi_facets_cached($archived === '1', $archived === 'all', $fields ?: null));
});

// typeahead for the fields that have a value per fish: ?field=name&q=abc&limit=8&archived=
route('GET', '/koi/facet-search', function () {
    $archived = (string)($_GET['archived'] ?? '');
    send_json(200, koi_facet_search((string)($_GET['field'] ?? ''), (string)($_GET['q'] ?? ''), (int)($_GET['limit'] ?? 8), $archived === '1', $archived === 'all'));
});

// full rows of specific fish (selected on another page, or restored after a reload), by id and/or code
route('POST', '/koi/batch', function () {
    $body = read_json_body();
    $archived = (string)($body['archived'] ?? '');
    $scope = $archived === 'all' ? 'all' : ($archived === '1' ? 'archived' : 'active');
    send_json(200, koi_batch_rows(
        is_array($body['ids'] ?? null) ? $body['ids'] : [],
        is_array($body['codes'] ?? null) ? $body['codes'] : [],
        $scope
    ));
});

// search for the "pilih ikan" boxes of the other menus: ?q=&scope=active|archived|all&limit=&offset=&exclude=1,2
route('GET', '/koi/lookup', function () {
    send_json(200, koi_picker_lookup($_GET));
});
