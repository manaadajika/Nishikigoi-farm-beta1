// Data Kolam: accent colour per pond (not per area any more).
// - The colour is chosen in Formulir Edit Kolam (field "Warna aksen") and saved together with the pond. Nothing sits on the cards.
// - Saved in app_settings `pond_colors` as {"<pond id>": "#rrggbb"}; the cards update at once, no page reload.
// - The old area colours (`pond_area_colors`) are no longer drawn: the area heading is plain and a card only takes its own colour.
// The page draws the cards itself (and again on every refresh), so a MutationObserver puts the colours back after each draw.
;(function () {
  'use strict'
  if (!/farm-ponds/.test(location.pathname)) return

  var HEX = /^#[0-9a-f]{6}$/i
  var colors = {}
  var loadedAt = 0
  var loading = false

  function request(path, options) {
    return window.KoiAuth.apiRequest(path, options).then(function (response) {
      return response.json().catch(function () { return {} }).then(function (data) {
        if (!response.ok) throw new Error(data.error || data.detail || 'Permintaan gagal.')
        return data
      })
    })
  }
  function canEdit() { return Boolean(window.KoiAuth && window.KoiAuth.canAccess && window.KoiAuth.canAccess('farm-operate')) }
  function parseColors(value) {
    var result = {}
    try {
      var parsed = typeof value === 'string' ? JSON.parse(value) : value
      if (parsed && typeof parsed === 'object') Object.keys(parsed).forEach(function (key) { if (HEX.test(parsed[key])) result[key] = parsed[key] })
    } catch (error) { /* empty map */ }
    return result
  }
  function say(message) { if (window.KoiDialog && window.KoiDialog.alert) window.KoiDialog.alert(message); else window.alert(message) }

  var style = document.createElement('style')
  style.textContent =
    // area headings stay plain: the colour belongs to the pond now
    '.pond-area-heading.has-color{background:var(--tblr-bg-surface-secondary)!important;border-bottom:0!important}' +
    '.pond-color-input.is-unset{opacity:.45}'
  document.head.appendChild(style)

  function applyTo(card) {
    var id = card.getAttribute('data-dock-id')
    var color = id && colors[id] ? colors[id] : ''
    var has = card.classList.contains('has-area-color')
    if (color) {
      if (!has) card.classList.add('has-area-color')
      if (card.style.getPropertyValue('--area-color') !== color) card.style.setProperty('--area-color', color)
    } else if (has || card.style.getPropertyValue('--area-color')) {
      card.classList.remove('has-area-color')
      card.style.removeProperty('--area-color')
    }
  }
  function applyAll() {
    document.querySelectorAll('.pond-card[data-dock-id]').forEach(applyTo)
  }

  function save(id, color) {
    return request('/app-settings').then(function (settings) {
      var latest = parseColors((settings || {}).pond_colors)
      if (color) latest[id] = color; else delete latest[id]
      return request('/app-settings', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pond_colors: JSON.stringify(latest) }) }).then(function () { colors = latest; loadedAt = Date.now(); applyAll() })
    }).catch(function (error) { say(error.message || 'Warna gagal disimpan.') })
  }

  // ---- "Warna aksen" field inside Formulir Edit Kolam ------------------------------------------------------
  var editingId = null   // id of the pond being edited, null when adding a new pond
  var chosen = ''        // colour shown in the field ('' = none)
  var field = null
  function paintField() {
    if (!field) return
    var input = field.querySelector('[data-pond-color-input]')
    var clear = field.querySelector('[data-pond-color-clear]')
    input.value = chosen || '#206bc4'
    input.classList.toggle('is-unset', !chosen)
    field.querySelector('[data-pond-color-text]').textContent = chosen ? 'Warna dipilih' : 'Belum ada warna'
    clear.classList.toggle('d-none', !chosen)
  }
  function setupField() {
    var form = document.querySelector('[data-pond-form]')
    if (!form || field) return
    var notes = form.querySelector('#pond-notes')
    var row = notes && notes.closest('.col-12')
    if (!row) return
    field = document.createElement('div')
    field.className = 'col-12'
    field.innerHTML =
      '<label class="form-label">Warna aksen</label>' +
      '<div class="d-flex align-items-center gap-2">' +
        '<input type="color" class="form-control form-control-color pond-color-input" data-pond-color-input aria-label="Warna aksen kolam">' +
        '<span class="text-secondary" data-pond-color-text></span>' +
        '<button type="button" class="btn btn-sm ms-auto d-none" data-pond-color-clear>Hapus warna</button>' +
      '</div>'
    row.parentNode.insertBefore(field, row)
    field.querySelector('[data-pond-color-input]').addEventListener('input', function (event) { chosen = event.target.value; paintField() })
    field.querySelector('[data-pond-color-clear]').addEventListener('click', function () { chosen = ''; paintField() })
    // saved together with the pond: pressing the form's own save button
    form.addEventListener('submit', function () {
      if (editingId && chosen !== (colors[editingId] || '')) save(editingId, chosen)
    }, true)
    var modal = document.querySelector('#pond-modal')
    if (modal) modal.addEventListener('show.bs.modal', function () {
      chosen = editingId ? (colors[editingId] || '') : ''
      field.classList.toggle('d-none', !editingId)
      paintField()
    })
  }
  // remember which pond the edit button belongs to (the page opens the form right after this click)
  document.addEventListener('click', function (event) {
    var edit = event.target.closest('[data-edit-pond]')
    if (edit) editingId = edit.getAttribute('data-edit-pond')
    else if (event.target.closest('[data-add-pond-trigger]')) editingId = null
  }, true)

  function load() {
    if (loading) return
    loading = true
    request('/app-settings').then(function (settings) {
      colors = parseColors((settings || {}).pond_colors)
      loadedAt = Date.now()
      applyAll()
    }).catch(function () {}).then(function () { loading = false })
  }

  var busy = false
  new MutationObserver(function () {
    if (busy) return
    busy = true
    // microtask: the colours are back before the browser paints the new cards
    Promise.resolve().then(function () {
      if (!field) setupField()
      applyAll()
      busy = false
      if (Date.now() - loadedAt > 20000) load()
    })
  }).observe(document.body, { childList: true, subtree: true })
  setupField()
  load()
})()
