// Rekomendasi isian: field teks yang nilainya sering berulang (lokasi, kategori, satuan, penjual, varietas, farm, ...)
// menawarkan nilai yang sudah pernah ada di data, urut dari yang paling sering dipakai. Mengetik menyaring pilihan.
// Satu file untuk semua formulir; field dikenali dari atribut name atau id.
;(function () {
  var FIELD_KEYS = {
    variety: 'variety', dominant_variety: 'variety',
    bloodline: 'bloodline',
    farm_name: 'farm',
    breeder: 'breeder',
    location: 'location', initial_location: 'location', origin_location: 'location', destination_location: 'location', archive_location: 'location',
    category: 'category',
    unit: 'unit',
    supplier: 'supplier', initial_supplier: 'supplier',
    client_name: 'client',
    buyer: 'buyer',
  }
  var DEFAULTS = {
    unit: ['pcs', 'kg', 'gram', 'liter', 'botol', 'sak', 'dus', 'pack', 'buah', 'unit', 'meter', 'roll', 'set', 'ekor'],
  }
  var cacheKey = 'nishikigoi-suggestions'
  var ttl = 60 * 1000
  var store = null
  var loadedAt = 0
  var loading = null
  var panel = null
  var current = null
  var active = -1
  var shown = []

  // ---- one look for every helper dropdown of the program ------------------------------------------------------------------------
  // rounded panel, one scrollbar, soft rows (no ruled lines), the same hover colour; used by this panel and by the Data Ikan menus
  // for variety, pond (kolam / area), parent and name suggestions.
  function installMenuStyle() {
    if (document.getElementById('koi-menu-style')) return
    var panels = '.fs-panel,.koi-text-suggest-menu,.koi-parent-search-menu,.koi-pond-search-menu,.koi-variety-search-menu'
    var items = '.fs-item,.koi-text-suggest-item,.koi-parent-search-item,.koi-pond-search-item,.koi-variety-search-item'
    var style = document.createElement('style')
    style.id = 'koi-menu-style'
    style.textContent =
      panels + '{background:var(--tblr-bg-surface,#fff)!important;color:var(--tblr-body-color,#1d273b);border:1px solid var(--tblr-border-color,#dce1e7)!important;border-radius:12px!important;' +
      'box-shadow:0 12px 32px rgba(0,0,0,.38)!important;padding:6px!important;max-height:17rem!important;overflow-x:hidden!important;overflow-y:auto!important;scrollbar-width:thin}' +
      '.fs-panel{position:fixed;z-index:2300}' +
      '.fs-head{padding:.3rem .7rem .25rem;font-size:.68rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--tblr-secondary,#667382)}' +
      items + '{display:block;width:100%;margin:0 0 2px!important;padding:.5rem .7rem!important;border:0!important;border-radius:8px!important;background:transparent;color:var(--tblr-body-color,inherit)!important;' +
      'text-align:left;font-size:.92rem;line-height:1.3;cursor:pointer}' +
      '.fs-item{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      items.split(',').map(function (c) { return c + ':last-child' }).join(',') + '{margin-bottom:0!important}' +
      items.split(',').map(function (c) { return c + ':hover,' + c + ':focus' }).join(',') + ',.fs-item.is-active{background:rgba(var(--tblr-primary-rgb,6,111,209),.16)!important;color:var(--tblr-body-color,inherit)!important;outline:0}' +
      '.fs-item mark{background:rgba(247,103,7,.28);color:inherit;padding:0}' +
      '.koi-pond-search-copy strong,.koi-parent-search-copy strong{font-weight:600}' +
      '.koi-parent-search-empty,.koi-pond-search-empty,.koi-variety-search-empty{padding:.6rem .7rem!important;color:var(--tblr-secondary,#667382)}'
    document.head.appendChild(style)
  }
  installMenuStyle()

  // a text field that used to open the browser's own <datalist> dropdown opens this panel instead
  function adoptLists() {
    Array.prototype.forEach.call(document.querySelectorAll('input[list]'), function (el) {
      el.setAttribute('data-fs-list', el.getAttribute('list'))
      el.removeAttribute('list')
    })
  }
  adoptLists()
  if (window.MutationObserver) new MutationObserver(adoptLists).observe(document.documentElement, { childList: true, subtree: true })

  function readCache() {
    try {
      var raw = JSON.parse(sessionStorage.getItem(cacheKey) || 'null')
      if (raw && raw.data) { store = raw.data; loadedAt = raw.at || 0 }
    } catch (e) {}
  }
  function writeCache() {
    try { sessionStorage.setItem(cacheKey, JSON.stringify({ at: loadedAt, data: store })) } catch (e) {}
  }
  function refresh(force) {
    if (loading) return loading
    if (!force && store && Date.now() - loadedAt < ttl) return Promise.resolve(store)
    loading = fetch('/api/suggestions')
      .then(function (response) { if (!response.ok) throw new Error('bad'); return response.json() })
      .then(function (data) { store = data; loadedAt = Date.now(); writeCache(); return store })
      .catch(function () { return store || {} })
      .then(function (result) { loading = null; return result })
    return loading
  }

  function keyOf(el) {
    if (!el || el.tagName !== 'INPUT') return ''
    var type = (el.getAttribute('type') || 'text').toLowerCase()
    if (type !== 'text' && type !== 'search') return ''
    if (el.disabled || el.readOnly) return ''
    // fields that have their own richer menu (variety, pond, parent) are left to it, so two menus never stack up
    if (el.hasAttribute('data-no-suggest') || el.hasAttribute('data-variety-search-input') || el.hasAttribute('data-pond-search-input') || el.hasAttribute('data-parent-search-input')) return ''
    var listId = el.getAttribute('data-fs-list')
    return el.getAttribute('data-suggest-key') || (listId ? 'list:' + listId : '') || FIELD_KEYS[el.getAttribute('name') || ''] || FIELD_KEYS[el.id || ''] || ''
  }

  // the options of a <datalist> that used to give the browser's own dropdown
  function listValues(id, query) {
    var datalist = document.getElementById(id)
    if (!datalist) return []
    var all = Array.prototype.map.call(datalist.options, function (option) { return option.value }).filter(Boolean)
    var q = String(query || '').trim().toLowerCase()
    if (!q) return all.slice(0, 12)
    var starts = []
    var contains = []
    all.forEach(function (value) {
      var lower = value.toLowerCase()
      if (lower === q) return
      if (lower.indexOf(q) === 0) starts.push(value)
      else if (lower.indexOf(q) > 0) contains.push(value)
    })
    return starts.concat(contains).slice(0, 12)
  }

  function valuesFor(key, query) {
    if (key.indexOf('list:') === 0) return listValues(key.slice(5), query)
    var list = ((store && store[key]) || []).slice()
    ;(DEFAULTS[key] || []).forEach(function (value) {
      if (!list.some(function (v) { return v.toLowerCase() === value.toLowerCase() })) list.push(value)
    })
    var q = String(query || '').trim().toLowerCase()
    if (!q) return list.slice(0, 8)
    var starts = []
    var contains = []
    list.forEach(function (value) {
      var lower = value.toLowerCase()
      if (lower === q) return
      if (lower.indexOf(q) === 0) starts.push(value)
      else if (lower.indexOf(q) > 0) contains.push(value)
    })
    return starts.concat(contains).slice(0, 8)
  }

  function ensurePanel() {
    if (panel) return panel
    installMenuStyle()
    panel = document.createElement('div')
    panel.className = 'fs-panel'
    panel.hidden = true
    panel.setAttribute('role', 'listbox')
    panel.addEventListener('mousedown', function (event) { event.preventDefault() })
    panel.addEventListener('click', function (event) {
      var item = event.target.closest('[data-fs-value]')
      if (item) choose(item.getAttribute('data-fs-value'))
    })
    document.body.appendChild(panel)
    return panel
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] })
  }

  function place() {
    if (!panel || !current) return
    var rect = current.getBoundingClientRect()
    var width = Math.max(rect.width, 200)
    panel.style.left = Math.round(Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))) + 'px'
    panel.style.width = Math.round(Math.min(width, window.innerWidth - 16)) + 'px'
    var below = window.innerHeight - rect.bottom
    if (below < 160 && rect.top > below) {
      panel.style.top = ''
      panel.style.bottom = Math.round(window.innerHeight - rect.top + 4) + 'px'
    } else {
      panel.style.bottom = ''
      panel.style.top = Math.round(rect.bottom + 4) + 'px'
    }
  }

  function hide() {
    if (panel) panel.hidden = true
    active = -1
    shown = []
  }

  function render() {
    if (!current) return hide()
    var key = keyOf(current)
    if (!key) return hide()
    var query = current.value
    shown = valuesFor(key, query)
    if (!shown.length) return hide()
    ensurePanel()
    var q = query.trim().toLowerCase()
    panel.innerHTML = '<div class="fs-head">' + (q ? 'Pilihan yang cocok' : key.indexOf('list:') === 0 ? 'Pilihan' : 'Pernah dipakai') + '</div>' + shown.map(function (value, index) {
      var text = escapeHtml(value)
      if (q) {
        var at = value.toLowerCase().indexOf(q)
        if (at >= 0) text = escapeHtml(value.slice(0, at)) + '<mark>' + escapeHtml(value.slice(at, at + q.length)) + '</mark>' + escapeHtml(value.slice(at + q.length))
      }
      return '<button type="button" class="fs-item" role="option" data-fs-index="' + index + '" data-fs-value="' + escapeHtml(value) + '">' + text + '</button>'
    }).join('')
    active = -1
    panel.hidden = false
    place()
  }

  function setActive(index) {
    var items = panel ? panel.querySelectorAll('.fs-item') : []
    if (!items.length) return
    active = (index + items.length) % items.length
    items.forEach(function (el, i) { el.classList.toggle('is-active', i === active) })
    items[active].scrollIntoView({ block: 'nearest' })
  }

  function choose(value) {
    if (!current) return
    current.value = value
    current.dispatchEvent(new Event('input', { bubbles: true }))
    current.dispatchEvent(new Event('change', { bubbles: true }))
    hide()
    try { current.focus() } catch (e) {}
  }

  // a value typed once becomes a suggestion at once (the server list catches up on the next refresh)
  function learn(el) {
    var key = keyOf(el)
    var value = String(el.value || '').trim()
    if (!key || key.indexOf('list:') === 0 || value.length < 2 || value.length > 120) return
    store = store || {}
    var list = store[key] = store[key] || []
    if (!list.some(function (v) { return v.toLowerCase() === value.toLowerCase() })) {
      list.unshift(value)
      writeCache()
    }
  }

  function prepare(el) {
    // a native datalist would show a second list on top of ours
    if (el.hasAttribute('list')) el.removeAttribute('list')
    el.setAttribute('autocomplete', 'off')
  }

  document.addEventListener('focusin', function (event) {
    var el = event.target
    if (!keyOf(el)) return
    current = el
    prepare(el)
    if (store) render()
    refresh(false).then(function () { if (current === el && document.activeElement === el) render() })
  })
  document.addEventListener('input', function (event) {
    if (event.target !== current || !keyOf(current)) return
    render()
  })
  document.addEventListener('focusout', function (event) {
    if (event.target !== current) return
    learn(current)
    setTimeout(function () { if (document.activeElement !== current) { hide(); current = null } }, 120)
  })
  document.addEventListener('keydown', function (event) {
    if (!panel || panel.hidden || event.target !== current) return
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive(active + 1) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(active - 1) }
    else if (event.key === 'Escape') { event.stopPropagation(); hide() }
    else if (event.key === 'Enter' && active >= 0) { event.preventDefault(); choose(shown[active]) }
  }, true)
  window.addEventListener('resize', place)
  window.addEventListener('scroll', place, true)

  readCache()
})()

// Catatan di formulir entri banyak: tinggi kolom mengikuti isi (Enter menambah baris, kolom ikut membesar).
;(function () {
  var MAX = 260
  function grow(el) {
    el.style.height = 'auto'
    var full = el.scrollHeight + 2
    el.style.height = Math.min(full, MAX) + 'px'
    el.style.overflowY = full > MAX ? 'auto' : 'hidden'
  }
  document.addEventListener('input', function (event) {
    var el = event.target
    if (el && el.matches && el.matches('.koi-entry-table textarea')) grow(el)
  })
  // rows drawn or filled by code (Tarik data ikan, import, edit): size them once
  var timer = null
  function sweep() {
    timer = null
    document.querySelectorAll('.koi-entry-table textarea').forEach(function (el) {
      var key = el.value.length + ':' + el.clientWidth
      if (el.dataset.grownKey !== key) { el.dataset.grownKey = key; grow(el) }
    })
  }
  new MutationObserver(function () {
    if (timer || !document.querySelector('.koi-entry-table textarea')) return
    timer = setTimeout(sweep, 150)
  }).observe(document.body, { childList: true, subtree: true })
  window.addEventListener('resize', function () { if (!timer) timer = setTimeout(sweep, 200) })
})()

// Catatan Formulir di Data Kolam: kolom membesar sendiri mengikuti isi, jadi isinya tidak perlu digulung atau
// kolomnya ditarik. Berlaku saat mengetik dan saat isinya diisi program (membuka kolam, memulihkan catatan).
;(function () {
  var IDS = ['pond-detail-notes', 'pond-notes']
  function fit(el) {
    var cap = Math.max(240, Math.round(window.innerHeight * 0.7))
    el.style.height = 'auto'
    var full = el.scrollHeight + 2
    el.style.height = Math.min(full, cap) + 'px'
    el.style.overflowY = full > cap ? 'auto' : 'hidden'
  }
  document.addEventListener('input', function (event) {
    var el = event.target
    if (el && el.id && IDS.indexOf(el.id) >= 0) fit(el)
  })
  setInterval(function () {
    IDS.forEach(function (id) {
      var el = document.getElementById(id)
      if (!el || el.offsetParent === null) return
      var key = el.value.length + ':' + el.clientWidth
      if (el.dataset.fitKey !== key) { el.dataset.fitKey = key; fit(el) }
    })
  }, 400)
})()
