// Data Kolam: a dropdown "Area" above the list. Choosing an area shows only the ponds of that area (the page's own list code reads
// window.__pondArea when it builds the list); "Semua area" shows everything. The choice is remembered for this browser tab.
;(function () {
  'use strict'
  // the list may not be in the page yet when this file runs: look again for a few seconds
  var tries = 0
  function boot() {
    var table = document.querySelector('[data-ponds-table]')
    var search = document.querySelector('[data-pond-search]')
    if (!table || !search || !table.parentElement) {
      if (tries++ < 50) window.setTimeout(boot, 200)
      return
    }
    if (document.getElementById('pond-area-filter')) return
    build(table, search)
  }
  function build(table, search) {
  var storeKey = 'nishikigoi-pond-area'
  var NONE = 'Tanpa Area'

  function stored() { try { return sessionStorage.getItem(storeKey) || '' } catch (error) { return '' } }
  function keep(value) { try { sessionStorage.setItem(storeKey, value) } catch (error) { /* only a convenience */ } }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] })
  }

  window.__pondArea = stored()

  var wrap = document.createElement('div')
  wrap.className = 'd-flex align-items-center gap-2 flex-wrap mb-3'
  wrap.innerHTML = '<label class="text-secondary text-uppercase fw-medium" for="pond-area-filter" style="font-size:.8rem">Area:</label>' +
    '<select class="form-select" id="pond-area-filter" style="width:auto;min-width:10rem;max-width:100%" aria-label="Tampilkan hanya area ini"><option value="">Semua area</option></select>'
  table.parentElement.insertBefore(wrap, table.parentElement.firstChild)
  var select = wrap.querySelector('select')

  function orderOf() {
    try { var order = JSON.parse(localStorage.getItem('pondAreaOrder') || '[]'); return Array.isArray(order) ? order : [] } catch (error) { return [] }
  }
  function fill(areas) {
    var order = orderOf()
    areas.sort(function (a, b) {
      var x = order.indexOf(a), y = order.indexOf(b)
      if (x < 0 && y < 0) return a.localeCompare(b)
      return x < 0 ? 1 : y < 0 ? -1 : x - y
    })
    select.innerHTML = '<option value="">Semua area</option>' + areas.map(function (area) { return '<option value="' + esc(area) + '">' + esc(area) + '</option>' }).join('')
    select.value = areas.indexOf(window.__pondArea) >= 0 ? window.__pondArea : ''
    if (select.value !== window.__pondArea) { window.__pondArea = ''; keep('') }
  }

  var load = window.KoiAuth && window.KoiAuth.apiRequest
    ? window.KoiAuth.apiRequest('/ponds/options')
    : fetch((window.KOI_API_URL || '/api') + '/ponds/options')
  Promise.resolve(load).then(function (response) { return response.json() }).then(function (rows) {
    var seen = {}
    ;(rows || []).forEach(function (row) { seen[String(row.location || '').trim() || NONE] = true })
    fill(Object.keys(seen))
    if (window.__pondArea) search.dispatchEvent(new Event('input'))
  }).catch(function () { /* the filter just stays on "Semua area" */ })

  select.addEventListener('change', function () {
    window.__pondArea = select.value
    keep(select.value)
    search.dispatchEvent(new Event('input')) // the page lists again through its own search handler
  })
  }
  boot()
})()
