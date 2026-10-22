// "Tarik dari Data Ikan": a dialog to pick one or more fish from Data Ikan (search, tick, confirm).
// Used by Penjualan (Katalog, Invoice), Inventaris and the other menus that link fish.
//
// The fish are never downloaded as a whole list: every search is a request to the server (GET /api/koi/lookup).
// Search accepts a pasted list of codes (spaces, commas, semicolons or new lines, as copied by "Salin ID" in Data Ikan):
// every listed code is shown.
//
//   KoiPicker.open({
//     title: 'Tarik dari Data Ikan',
//     scope: 'active',                    // active | archived | all
//     disabledIds: ['12', '40'],          // already in the form: shown ticked and locked
//     confirmLabel: 'Tambahkan',
//     onConfirm: function (ids, items) {}  // ids = array of strings
//   })
//
//   KoiPicker.lookup(query, { scope, limit, offset, exclude })  -> Promise<{ items, total, ids, missing, list_mode, tokens }>
//   KoiPicker.byIds(ids) / KoiPicker.byCodes(codes)             -> Promise<fish rows>
//   KoiPicker.facets(scope)                                     -> Promise<{ variety: [...], bloodline: [...], ... }>
//   KoiPicker.debounce(fn, ms), KoiPicker.fixPaste(input), KoiPicker.cache (id -> fish row already seen)
//
// The dialog is placed inside the open modal (when there is one) so the modal's focus trap does not take
// the keyboard away from the search box.
;(function () {
  var PAGE_SIZE = 60

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    })
  }

  // the list shows a small copy of the photo (made by the server the first time: /api/thumb/<width>/<path>)
  function thumbUrl(url, width) {
    var match = /^\/api\/uploads\/(.+)$/.exec(String(url || ''))
    return match ? '/api/thumb/' + width + '/' + match[1] : url
  }

  function sizeText(value) {
    var number = Number(value)
    if (value === null || value === undefined || value === '' || !isFinite(number)) return ''
    return number.toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' cm'
  }

  var styleAdded = false
  function addStyles() {
    if (styleAdded) return
    styleAdded = true
    var style = document.createElement('style')
    style.textContent =
      '.koi-picker-overlay{position:fixed;inset:0;z-index:2000;background:rgba(2,6,23,.72);display:flex;align-items:center;justify-content:center;padding:12px}' +
      '.koi-picker{width:min(720px,100%);max-height:calc(100vh - 24px);display:flex;flex-direction:column;background:var(--tblr-bg-surface,#1b2434);color:var(--tblr-body-color,#e6e9ef);border:1px solid var(--tblr-border-color,#334155);border-radius:8px;box-shadow:0 20px 50px rgba(0,0,0,.5)}' +
      '.koi-picker-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 16px;border-bottom:1px solid var(--tblr-border-color,#334155)}' +
      '.koi-picker-head h5{margin:0;font-size:1rem}' +
      '.koi-picker-tools{padding:10px 16px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;border-bottom:1px solid var(--tblr-border-color,#334155)}' +
      '.koi-picker-tools input[type=search]{flex:1 1 220px}' +
      '.koi-picker-list{overflow:auto;padding:6px 8px;flex:1 1 auto;min-height:120px}' +
      '.koi-picker-row{display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:6px;cursor:pointer}' +
      '.koi-picker-row:hover{background:var(--tblr-bg-surface-secondary,#243044)}' +
      '.koi-picker-row.is-locked{opacity:.55;cursor:default}' +
      '.koi-picker-row img,.koi-picker-row .koi-picker-noimg{width:36px;height:54px;object-fit:cover;border-radius:4px;flex:0 0 auto;background:var(--tblr-bg-surface-secondary,#243044)}' +
      '.koi-picker-text{min-width:0;flex:1 1 auto}' +
      '.koi-picker-text strong{display:block}' +
      '.koi-picker-text span{display:block;font-size:.8rem;color:var(--tblr-secondary,#94a3b8);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.koi-picker-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 16px;border-top:1px solid var(--tblr-border-color,#334155)}' +
      '.koi-picker-count{color:var(--tblr-secondary,#94a3b8);font-size:.85rem}'
    document.head.appendChild(style)
  }

  // A single-line box drops or glues the new lines of a pasted list: turn them into spaces first.
  function fixPaste(input) {
    if (!input) return
    input.addEventListener('paste', function (event) {
      var text = event.clipboardData && event.clipboardData.getData('text')
      if (!text || !/[\r\n]/.test(text)) return
      event.preventDefault()
      var start = input.selectionStart == null ? input.value.length : input.selectionStart
      var end = input.selectionEnd == null ? input.value.length : input.selectionEnd
      input.setRangeText(text.replace(/[\r\n]+/g, ' ').trim(), start, end, 'end')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }

  // ---- server side: the fish are searched on the server (GET /api/koi/lookup), never downloaded as a whole list ----------
  var API = '/api'
  var cache = {}   // id -> fish row, filled by every lookup so labels and previews do not need another request

  function remember(items) {
    ;(items || []).forEach(function (item) { if (item && item.id != null) cache[String(item.id)] = item })
    return items || []
  }

  function request(path, init) {
    return fetch(API + path, init).then(function (response) {
      if (!response.ok) throw new Error('Data ikan gagal dimuat')
      return response.json()
    })
  }

  function archivedParam(scope) {
    return scope === 'all' ? 'all' : scope === 'archived' ? '1' : ''
  }

  // lookup('26e kohaku', { scope: 'active', limit: 40, offset: 0, exclude: ['3'], gender: 'male' }) -> { items, total, ids, missing, list_mode, tokens }
  function lookup(query, options) {
    options = options || {}
    var params = new URLSearchParams({
      q: query || '',
      scope: options.scope || 'active',
      limit: String(options.limit || 40),
      offset: String(options.offset || 0)
    })
    if (options.exclude && options.exclude.length) params.set('exclude', options.exclude.join(','))
    if (options.gender) params.set('gender', options.gender)
    return request('/koi/lookup?' + params.toString()).then(function (result) {
      remember(result.items)
      return result
    })
  }

  // byIds(['12', '40']) -> fish rows in the same order (the ones already seen come from the cache)
  function byIds(ids, options) {
    options = options || {}
    var wanted = (ids || []).map(String)
    var missing = wanted.filter(function (id) { return !cache[id] })
    var done = missing.length
      ? request('/koi/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: missing, archived: archivedParam(options.scope || 'all') })
      }).then(remember)
      : Promise.resolve()
    return done.then(function () {
      return wanted.map(function (id) { return cache[id] }).filter(Boolean)
    })
  }

  // byCodes(['26E05B']) -> fish rows with those codes (any case), for import files and pasted codes
  function byCodes(codes, options) {
    options = options || {}
    var list = (codes || []).map(function (code) { return String(code || '').trim() }).filter(Boolean)
    if (!list.length) return Promise.resolve([])
    return request('/koi/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codes: list, archived: archivedParam(options.scope || 'all') })
    }).then(remember)
  }

  // facets('active') -> { variety: [...], bloodline: [...], farm_name: [...], ... } for suggestion lists
  function facets(scope) {
    return request('/koi/facets' + (scope && scope !== 'active' ? '?archived=' + archivedParam(scope) : ''))
  }

  function debounce(fn, wait) {
    var timer = null
    return function () {
      var args = arguments
      var self = this
      clearTimeout(timer)
      timer = setTimeout(function () { fn.apply(self, args) }, wait == null ? 220 : wait)
    }
  }

  // newest first, the order Data Ikan has always shown
  function dataIkanOrder(first, second) {
    var cmp = String(second.created_at || '').localeCompare(String(first.created_at || ''))
    return cmp !== 0 ? cmp : Number(second.id) - Number(first.id)
  }

  function open(options) {
    options = options || {}
    addStyles()
    var scope = options.scope || 'active'
    var locked = {}
    ;(options.disabledIds || []).forEach(function (id) { locked[String(id)] = true })
    var chosen = {}
    var query = ''
    var items = []
    var info = { total: 0, ids: [], missing: [], list_mode: false, tokens: [] }
    var loading = false
    var failed = false
    var token = 0

    var parent = document.querySelector('.modal.show') || document.body
    var overlay = document.createElement('div')
    overlay.className = 'koi-picker-overlay'
    overlay.innerHTML =
      '<div class="koi-picker" role="dialog" aria-modal="true" aria-label="' + escapeHtml(options.title || 'Tarik dari Data Ikan') + '">' +
        '<div class="koi-picker-head"><h5>' + escapeHtml(options.title || 'Tarik dari Data Ikan') + '</h5>' +
        '<button type="button" class="btn-close" data-picker-close aria-label="Tutup"></button></div>' +
        '<div class="koi-picker-tools">' +
          '<input class="form-control" type="search" placeholder="Cari kode, nama, variety, bloodline, ternakan, ukuran 40-60cm, atau tempel beberapa kode" autocomplete="off" data-picker-search />' +
          '<button type="button" class="btn btn-outline-primary btn-sm" data-picker-all>Pilih semua yang cocok</button>' +
          '<button type="button" class="btn btn-sm" data-picker-none>Batal pilih</button>' +
        '</div>' +
        '<div class="koi-picker-list" data-picker-list></div>' +
        '<div class="koi-picker-foot"><span class="koi-picker-count" data-picker-count></span>' +
          '<span><button type="button" class="btn me-2" data-picker-close>Batal</button>' +
          '<button type="button" class="btn btn-primary" data-picker-confirm disabled>' + escapeHtml(options.confirmLabel || 'Tambahkan') + '</button></span></div>' +
      '</div>'
    parent.appendChild(overlay)

    var list = overlay.querySelector('[data-picker-list]')
    var count = overlay.querySelector('[data-picker-count]')
    var confirmButton = overlay.querySelector('[data-picker-confirm]')
    var search = overlay.querySelector('[data-picker-search]')

    function chosenCount() {
      return Object.keys(chosen).length
    }

    function refreshFooter() {
      var picked = chosenCount()
      var text = picked ? picked + ' ikan dipilih' : (loading && !items.length ? 'Memuat...' : info.total + ' ikan')
      if (info.list_mode) {
        text += ' · ' + (info.tokens.length - info.missing.length) + ' dari ' + info.tokens.length + ' kode'
        if (info.missing.length) text += ' · tidak ditemukan: ' + info.missing.slice(0, 6).join(', ').toUpperCase() + (info.missing.length > 6 ? ', ...' : '')
      }
      count.textContent = text
      confirmButton.disabled = picked === 0
      confirmButton.textContent = (options.confirmLabel || 'Tambahkan') + (picked ? ' (' + picked + ')' : '')
    }

    function render() {
      var html = items.map(function (item) {
        var id = String(item.id)
        var isLocked = Boolean(locked[id])
        var checked = isLocked || Boolean(chosen[id])
        var meta = [item.variety, item.bloodline, item.farm_name, sizeText(item.current_length_cm)].filter(Boolean).join(' · ')
        return '<label class="koi-picker-row' + (isLocked ? ' is-locked' : '') + '">' +
          '<input class="form-check-input m-0" type="checkbox" data-picker-id="' + escapeHtml(id) + '"' + (checked ? ' checked' : '') + (isLocked ? ' disabled' : '') + ' />' +
          (item.image_url ? '<img src="' + escapeHtml(thumbUrl(item.image_url, 120)) + '" alt="" loading="lazy" decoding="async" />' : '<span class="koi-picker-noimg"></span>') +
          '<span class="koi-picker-text"><strong>' + escapeHtml([item.code, item.name].filter(Boolean).join(' - ') || 'ID ' + id) + '</strong>' +
          '<span>' + escapeHtml(meta || '-') + '</span>' +
          (item.pond_name ? '<span>Kolam: ' + escapeHtml(item.pond_name) + (isLocked ? ' · sudah ditambahkan' : '') + '</span>' : (isLocked ? '<span>sudah ditambahkan</span>' : '')) +
          '</span></label>'
      }).join('')
      if (!html) {
        html = loading
          ? '<div class="text-secondary p-3"><span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Memuat ikan...</div>'
          : failed
            ? '<div class="text-danger p-3">Data ikan gagal dimuat.</div>'
            : '<div class="text-secondary p-3">Tidak ada ikan yang cocok.</div>'
      }
      if (items.length < info.total) {
        html += '<div class="p-2 text-center"><button type="button" class="btn btn-sm" data-picker-more>Tampilkan lebih banyak (' + (info.total - items.length) + ' lagi)</button></div>'
      }
      list.innerHTML = html
      refreshFooter()
    }

    // append = true: the next part of the same search ("Tampilkan lebih banyak")
    function load(append) {
      var mine = ++token
      loading = true
      failed = false
      if (!append) { items = []; info = { total: 0, ids: [], missing: [], list_mode: false, tokens: [] } }
      render()
      lookup(query, { scope: scope, limit: PAGE_SIZE, offset: append ? items.length : 0 }).then(function (result) {
        if (mine !== token) return
        loading = false
        items = append ? items.concat(result.items) : result.items
        info = result
        render()
      }).catch(function () {
        if (mine !== token) return
        loading = false
        failed = true
        render()
      })
    }

    function close() {
      token += 1
      overlay.remove()
      document.removeEventListener('keydown', onKey, true)
    }

    function onKey(event) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        event.preventDefault()
        close()
      }
    }
    document.addEventListener('keydown', onKey, true)

    overlay.addEventListener('click', function (event) {
      if (event.target === overlay || event.target.closest('[data-picker-close]')) { close(); return }
      if (event.target.closest('[data-picker-more]')) { load(true); return }
      if (event.target.closest('[data-picker-all]')) {
        ;(info.ids || []).forEach(function (id) { if (!locked[String(id)]) chosen[String(id)] = true })
        render()
        return
      }
      if (event.target.closest('[data-picker-none]')) { chosen = {}; render(); return }
      if (event.target.closest('[data-picker-confirm]')) {
        var ids = Object.keys(chosen)
        confirmButton.disabled = true
        byIds(ids, { scope: scope }).then(function (picked) {
          picked = picked.slice().sort(dataIkanOrder)   // keep the order of Data Ikan
          close()
          if (options.onConfirm) options.onConfirm(picked.map(function (item) { return String(item.id) }), picked)
        }).catch(function () {
          confirmButton.disabled = false
          count.textContent = 'Data ikan terpilih gagal dimuat, coba lagi.'
        })
        return
      }
    })
    overlay.addEventListener('change', function (event) {
      var box = event.target.closest('[data-picker-id]')
      if (!box || box.disabled) return
      if (box.checked) chosen[box.dataset.pickerId] = true
      else delete chosen[box.dataset.pickerId]
      refreshFooter()
    })
    fixPaste(search)
    var searchLater = debounce(function () { load(false) }, 250)
    search.addEventListener('input', function () {
      query = search.value
      searchLater()
    })

    load(false)
    window.setTimeout(function () { search.focus() }, 50)
    return { close: close }
  }

  window.KoiPicker = {
    open: open,
    lookup: lookup,
    byIds: byIds,
    byCodes: byCodes,
    facets: facets,
    debounce: debounce,
    remember: remember,
    cache: cache,
    fixPaste: fixPaste
  }
})()
