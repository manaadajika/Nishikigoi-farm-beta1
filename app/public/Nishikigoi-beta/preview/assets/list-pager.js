// Pagination tampilan untuk daftar kartu (Data Kolam, Breeding, Laporan, Katalog, Invoice, Inventaris, Galeri).
// Halaman tetap menggambar daftarnya seperti biasa; pager hanya menampilkan satu halaman sekaligus dan
// menyembunyikan sisanya (foto kartu yang tersembunyi tidak dimuat). Pencarian, filter, pilih, cetak, dan export
// tetap bekerja atas seluruh data. Pilihan jumlah per halaman diingat per menu.
;(function () {
  var path = window.location.pathname.replace(/\/$/, '').split('/').pop().replace(/\.html$/, '')
  var TARGETS = {
    'farm-ponds': '[data-ponds-table]',
    'farm-breeding': '[data-breeding-table]',
    'farm-reports': '[data-report-table]',
    'farm-sell': '[data-sell-table]',
    'farm-invoice': '[data-invoice-table]',
    'farm-inventory': '[data-inv-table]',
    'farm-gallery': '[data-gallery-list]',
  }
  var selector = TARGETS[path]
  if (!selector) return

  var SIZES = [12, 24, 48, 120, 240, 0] // 0 = Semua
  var DEFAULT_SIZE = 24
  var sizeKey = 'nishikigoi-pagesize:' + path
  var HIDDEN = 'koi-pg-hidden'

  function readSize() {
    try {
      var raw = localStorage.getItem(sizeKey)
      if (raw !== null) {
        var n = Number(raw)
        if (SIZES.indexOf(n) >= 0) return n
      }
    } catch (e) {}
    return DEFAULT_SIZE
  }
  function writeSize(n) { try { localStorage.setItem(sizeKey, String(n)) } catch (e) {} }

  var style = document.createElement('style')
  style.textContent = '.' + HIDDEN + '{display:none!important}' +
    '.koi-pg-top{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.5rem .75rem;margin:.25rem 0 .75rem}' +
    '.koi-pg-top .koi-pg-size{display:inline-flex;align-items:center;gap:.5rem;color:var(--tblr-secondary);white-space:nowrap}' +
    '.koi-pg-top .koi-pg-size select{width:auto;min-width:5.5rem}' +
    '.koi-pg-bottom{display:flex;justify-content:center;margin:1rem 0 .25rem}' +
    '.koi-pg-bottom .pagination{display:flex;flex-wrap:wrap;justify-content:center;gap:.25rem;margin:0}' +
    '.koi-pg-bottom .page-item{margin:0}' +
    '.koi-pg-bottom .page-link{min-width:2.25rem;border-radius:var(--tblr-border-radius);text-align:center}'
  document.head.appendChild(style)

  var container = null
  var top = null
  var bottom = null
  // the page number lives in the address too (?page=3): a refresh stays on that page and the link can be shared.
  // It only replaces the current history entry, so the Back button still leaves the menu (it does not step through pages).
  var urlPage = (function () {
    try {
      var n = parseInt(new URLSearchParams(window.location.search).get('page'), 10)
      return n >= 1 ? n : 0
    } catch (e) { return 0 }
  })()
  var page = urlPage || 1
  var size = readSize()
  var lastIds = []
  var applying = false
  var printing = false

  function isItem(el) { return el.nodeType === 1 && (el.matches('.card') || !!el.querySelector('.card')) }

  function idOf(el, index) {
    var withId = el.matches('[data-dock-id]') ? el : el.querySelector('[data-dock-id]')
    return withId ? withId.getAttribute('data-dock-id') : 'i' + index
  }

  function hideImages(el) {
    el.querySelectorAll('img[src]').forEach(function (img) {
      if (!img.dataset.pgSrc) { img.dataset.pgSrc = img.getAttribute('src'); img.removeAttribute('src') }
    })
  }
  function showImages(el) {
    el.querySelectorAll('img[data-pg-src]').forEach(function (img) {
      img.setAttribute('src', img.dataset.pgSrc)
      delete img.dataset.pgSrc
    })
  }

  function buildBars() {
    top = document.createElement('div')
    top.className = 'koi-pg-top d-none'
    bottom = document.createElement('div')
    bottom.className = 'koi-pg-bottom d-none'
    container.parentNode.insertBefore(top, container)
    container.parentNode.insertBefore(bottom, container.nextSibling)
    top.addEventListener('change', function (event) {
      var sel = event.target.closest('select')
      if (!sel) return
      size = Number(sel.value)
      writeSize(size)
      page = 1
      apply(true)
    })
    bottom.addEventListener('click', function (event) {
      var b = event.target.closest('[data-pg-page]')
      if (!b) return
      event.preventDefault()
      var next = Number(b.getAttribute('data-pg-page'))
      if (!next || next === page) return
      page = next
      apply(true)
      window.scrollTo({ top: 0, behavior: 'instant' })
    })
  }

  function pageButtons(totalPages) {
    var nums = []
    for (var i = 1; i <= totalPages; i += 1) {
      if (i === 1 || i === totalPages || Math.abs(i - page) <= 1) nums.push(i)
    }
    var out = []
    var prev = 0
    nums.forEach(function (n) {
      if (prev && n - prev > 1) out.push('<li class="page-item disabled"><span class="page-link">&hellip;</span></li>')
      out.push('<li class="page-item' + (n === page ? ' active' : '') + '"><button type="button" class="page-link" data-pg-page="' + n + '">' + n + '</button></li>')
      prev = n
    })
    return '<ul class="pagination">' +
      '<li class="page-item' + (page <= 1 ? ' disabled' : '') + '"><button type="button" class="page-link" data-pg-page="' + (page - 1) + '"' + (page <= 1 ? ' disabled' : '') + '>Sebelumnya</button></li>' +
      out.join('') +
      '<li class="page-item' + (page >= totalPages ? ' disabled' : '') + '"><button type="button" class="page-link" data-pg-page="' + (page + 1) + '"' + (page >= totalPages ? ' disabled' : '') + '>Berikutnya</button></li>' +
      '</ul>'
  }

  function sizeSelect() {
    return '<label class="koi-pg-size"><span class="fw-medium small text-uppercase">Tampilkan:</span><select class="form-select form-select-sm">' +
      SIZES.map(function (n) { return '<option value="' + n + '"' + (n === size ? ' selected' : '') + '>' + (n === 0 ? 'Semua' : n) + '</option>' }).join('') +
      '</select></label>'
  }

  function syncUrl(total) {
    if (printing || total === 0) return
    try {
      var url = new URL(window.location.href)
      if (page > 1) url.searchParams.set('page', String(page))
      else url.searchParams.delete('page')
      var next = url.pathname + url.search + url.hash
      if (next !== window.location.pathname + window.location.search + window.location.hash) {
        window.history.replaceState(window.history.state, '', next)
      }
    } catch (e) {}
  }

  function apply(force) {
    if (!container || applying) return
    applying = true
    try {
      var children = Array.prototype.slice.call(container.children)
      var items = children.filter(isItem)
      var ids = items.map(idOf)
      if (!force) {
        // another set of cards (filter or search changed): back to page 1; only a small change keeps the page
        var removed = lastIds.filter(function (id) { return ids.indexOf(id) < 0 }).length
        if (removed >= 2) page = 1
      }
      lastIds = ids
      var total = items.length
      var per = size === 0 || printing ? Math.max(total, 1) : size
      var totalPages = Math.max(1, Math.ceil(total / per))
      // no cards yet (still loading): keep the page asked for in the address
      if (total > 0 && page > totalPages) page = totalPages
      var start = (page - 1) * per
      var end = start + per
      items.forEach(function (el, i) {
        var visible = i >= start && i < end
        el.classList.toggle(HIDDEN, !visible)
        if (visible) showImages(el)
        else hideImages(el)
      })
      // area headings (Data Kolam): shown only when a card of that area is visible
      var heading = null
      var anyVisible = false
      var flush = function () { if (heading) heading.classList.toggle(HIDDEN, !anyVisible && total > 0) }
      children.forEach(function (el) {
        if (isItem(el)) {
          if (!el.classList.contains(HIDDEN)) anyVisible = true
        } else if (el.querySelector && el.querySelector('.pond-area-heading')) {
          flush()
          heading = el
          anyVisible = false
        }
      })
      flush()

      syncUrl(total)
      var showBar = total > SIZES[0]
      top.classList.toggle('d-none', !showBar)
      bottom.classList.toggle('d-none', !showBar || totalPages <= 1)
      if (showBar) {
        var from = total ? start + 1 : 0
        var to = Math.min(end, total)
        top.innerHTML = '<span class="text-secondary fw-medium">Menampilkan ' + from + '-' + to + ' dari ' + total + '</span>' + sizeSelect()
        bottom.innerHTML = totalPages > 1 ? pageButtons(totalPages) : ''
      }
    } finally {
      applying = false
    }
  }

  function start() {
    container = document.querySelector(selector)
    if (!container) return false
    buildBars()
    var timer = null
    new MutationObserver(function () {
      if (applying) return
      clearTimeout(timer)
      timer = setTimeout(function () { apply(false) }, 0)
    }).observe(container, { childList: true })
    window.addEventListener('beforeprint', function () { printing = true; apply(true) })
    window.addEventListener('afterprint', function () { printing = false; apply(true) })
    apply(false)
    return true
  }

  var tries = 0
  function boot() {
    if (start()) return
    tries += 1
    if (tries < 40) setTimeout(boot, 150)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot)
  else boot()
})()
