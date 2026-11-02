// Data Kolam: a "Cetak area" button on the heading of every area. The print has the area's name and totals, then one part for every pond
// of the area: its fish (photo, code, name, variety, bloodline, farm, size) and its kanban cards. Uses the program's print window (KoiPrint).
function pondAreaPrintBoot() {
  'use strict'

  var style = document.createElement('style')
  // the program's own small button (like the print button of the dock), standing at the right of the area heading
  style.textContent =
    '.pond-area-heading{position:relative}' +
    '.pond-area-print{position:absolute;right:.5rem;top:50%;transform:translateY(-50%);display:inline-flex;align-items:center;gap:.35rem;background:var(--tblr-bg-surface,#fff)}' +
    '.pond-area-print svg{width:16px;height:16px}'
  document.head.appendChild(style)

  function esc(value) {
    return window.KoiPrint ? window.KoiPrint.escapeHtml(value == null ? '' : value) : String(value == null ? '' : value)
  }
  function assetUrl(src) {
    var value = String(src || '').trim()
    if (!value) return ''
    if (/^(data:|blob:|https?:\/\/)/i.test(value)) return value
    var resolved = window.KoiAuth && window.KoiAuth.apiUrl ? window.KoiAuth.apiUrl(value) : value
    try { return new URL(resolved, window.location.origin).href } catch (error) { return value }
  }
  function json(url) {
    return fetch(url).then(function (response) { return response.ok ? response.json() : null }).catch(function () { return null })
  }
  function parseFish(value) {
    if (Array.isArray(value)) return value
    try { var list = JSON.parse(value || '[]'); return Array.isArray(list) ? list : [] } catch (error) { return [] }
  }
  function images(card) {
    var list = card.images
    if (typeof list === 'string') { try { list = JSON.parse(list) } catch (error) { list = [] } }
    return Array.isArray(list) ? list.filter(Boolean) : []
  }
  function thumb(url) {
    var match = /^\/api\/uploads\/(.+)$/.exec(String(url || ''))
    return match ? '/api/thumb/240/' + match[1] : url
  }

  function pondSection(pond, kanban, kp, number) {
    var fish = parseFish(pond.fish)
    var photos = fish.length
    var rows = fish.map(function (item, index) {
      return '<tr>' +
        '<td class="kp-center">' + (index + 1) + '</td>' +
        '<td>' + kp.photo(assetUrl(item.image_url || item.photo_url || item.image || item.photo), item.code) + '</td>' +
        '<td><strong>' + esc(item.code || '-') + '</strong></td>' +
        '<td>' + esc(item.name || '-') + '</td>' +
        '<td>' + esc(item.variety || '-') + '</td>' +
        '<td>' + esc(item.bloodline || '-') + '</td>' +
        '<td>' + esc(item.farm_name || '-') + '</td>' +
        '<td class="kp-num">' + (item.current_length_cm ? kp.size(item.current_length_cm) + ' cm' : '-') + '</td>' +
        '</tr>'
    }).join('') || '<tr><td colspan="8" class="kp-muted">Belum ada ikan tercatat di Data Ikan untuk kolam ini.</td></tr>'
    var manual = Number(pond.unphotographed_fish_qty || 0)
    var kanbanTable = ''
    if (kanban && kanban.length) {
      var total = kanban.reduce(function (sum, card) { return sum + Number(card.qty || 0) }, 0)
      kanbanTable = '<div style="margin:8px 0 4px;font-weight:600">Kanban Catatan</div>' +
        '<table class="kp-table"><thead><tr><th class="kp-center" style="width:28px">No</th><th style="width:22%">Kanban</th><th>Catatan</th><th class="kp-num" style="width:9%">Qty</th><th style="width:20%">Gambar</th></tr></thead><tbody>' +
        kanban.map(function (card, index) {
          return '<tr><td class="kp-center">' + (index + 1) + '</td>' +
            '<td><strong>' + esc(card.title || '-') + '</strong><div class="kp-muted">' + esc(card.note_date && window.KoiAuth ? window.KoiAuth.formatDate(card.note_date) : '') + '</div></td>' +
            '<td style="white-space:pre-wrap">' + esc(card.body || '-') + '</td>' +
            '<td class="kp-num">' + Number(card.qty || 0) + '</td>' +
            '<td>' + images(card).map(function (url) { return '<img src="' + esc(assetUrl(thumb(url))) + '" alt="" style="width:22px;height:33px;object-fit:cover;margin:1px;border:1px solid #bbb" />' }).join('') + '</td></tr>'
        }).join('') +
        '</tbody><tfoot><tr><td></td><td colspan="2"><strong>Total Qty Kanban</strong></td><td class="kp-num"><strong>' + total + '</strong></td><td></td></tr></tfoot></table>'
    }
    return '<section style="margin:0 0 18px">' +
      '<div style="break-after:avoid;page-break-after:avoid;margin:0 0 6px;padding:5px 8px;background:#eef1f5;border:1px solid #cfd6df;font-weight:700">' +
      number + '. ' + esc(pond.name || '-') +
      '<span style="font-weight:400;margin-left:10px">Qty Data Ikan ' + photos + ' &middot; Qty Kanban ' + manual + ' &middot; Total Qty ' + (photos + manual) + '</span></div>' +
      '<table class="kp-table"><thead><tr>' +
      '<th class="kp-center" style="width:28px">No</th><th class="kp-center" style="width:48px">Foto</th><th style="width:13%">Kode</th><th>Nama</th>' +
      '<th style="width:15%">Varietas</th><th style="width:13%">Bloodline</th><th style="width:17%">Ternakan</th><th class="kp-num" style="width:10%">Ukuran</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>' + kanbanTable + '</section>'
  }

  function printArea(area, button) {
    var kp = window.KoiPrint
    if (!kp) { window.alert('Fitur cetak belum siap. Muat ulang halaman lalu coba lagi.'); return }
    button.disabled = true
    json('/api/ponds').then(function (ponds) {
      var inArea = (Array.isArray(ponds) ? ponds : []).filter(function (pond) { return String(pond.location || '').trim() === area })
        .sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'id', { numeric: true }) })
      if (!inArea.length) { window.alert('Tidak ada kolam di area ini.'); return }
      // the kanban cards of the ponds that have notes or a quantity (one request each, all at once)
      return Promise.all(inArea.map(function (pond) {
        var has = Number(pond.unphotographed_fish_qty || 0) > 0 || String(pond.notes || '').trim() !== ''
        return has ? json('/api/ponds/' + pond.id + '/kanban').then(function (data) { return (data && data.items) || [] }) : Promise.resolve([])
      })).then(function (cards) {
        var fishTotal = 0
        var kanbanTotal = 0
        inArea.forEach(function (pond) {
          fishTotal += parseFish(pond.fish).length
          kanbanTotal += Number(pond.unphotographed_fish_qty || 0)
        })
        var body = inArea.map(function (pond, index) { return pondSection(pond, cards[index], kp, index + 1) }).join('')
        kp.print({
          key: 'ponds-area',
          title: 'Area ' + area,
          heading: 'Daftar Ikan per Area',
          subheading: area,
          info: [['Area', area], ['Jumlah kolam', inArea.length], ['Qty Data Ikan', fishTotal], ['Qty Kanban', kanbanTotal], ['Total Qty', fishTotal + kanbanTotal]],
          body: body,
        })
      })
    }).catch(function () { window.alert('Cetak area gagal disiapkan.') }).then(function () { button.disabled = false })
  }

  function decorate() {
    document.querySelectorAll('.pond-area-heading').forEach(function (heading) {
      if (heading.querySelector('.pond-area-print')) return
      var area = String(heading.getAttribute('data-area-name') || heading.textContent || '').trim()
      if (!area) return
      heading.setAttribute('data-area-name', area)
      var button = document.createElement('button')
      button.type = 'button'
      button.className = 'btn btn-sm btn-outline-secondary pond-area-print'
      button.title = 'Cetak semua ikan di area ini'
      button.setAttribute('aria-label', 'Cetak area ' + area)
      button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 17h2a2 2 0 0 0 2 -2v-4a2 2 0 0 0 -2 -2h-14a2 2 0 0 0 -2 2v4a2 2 0 0 0 2 2h2"/><path d="M17 9v-4a2 2 0 0 0 -2 -2h-6a2 2 0 0 0 -2 2v4"/><rect x="7" y="13" width="10" height="8" rx="2"/></svg><span>Cetak area</span>'
      heading.appendChild(button)
    })
  }

  document.addEventListener('click', function (event) {
    var button = event.target.closest('.pond-area-print')
    if (!button) return
    event.stopPropagation()
    var heading = button.closest('.pond-area-heading')
    printArea(heading.getAttribute('data-area-name'), button)
  }, true)

  var timer = null
  new MutationObserver(function () {
    if (timer) return
    timer = setTimeout(function () { timer = null; decorate() }, 50)
  }).observe(document.body, { childList: true, subtree: true })
  decorate()
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pondAreaPrintBoot)
else pondAreaPrintBoot()
