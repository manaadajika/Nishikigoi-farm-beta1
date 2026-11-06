// Data Kolam: accent colour per pond (not per area any more).
// - A small round colour button sits left of the edit button on every pond card. Click: choose "Ganti warna aksen" or "Hapus warna aksen".
// - Saved in app_settings `pond_colors` as {"<pond id>": "#rrggbb"}; saved at once, no page reload.
// - The old area colours (`pond_area_colors`) are no longer drawn: the area heading is plain and a card only takes its own colour.
// The page draws the cards itself (and again on every refresh), so a MutationObserver puts the colours back after each draw.
;(function () {
  'use strict'
  if (!/farm-ponds/.test(location.pathname)) return

  var HEX = /^#[0-9a-f]{6}$/i
  var colors = {}
  var loadedAt = 0
  var loading = false
  var menu = null
  var colorInput = null

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
    '.pond-color-btn{width:2rem;height:2rem;padding:0;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;margin-right:.4rem;border:2px solid var(--tblr-border-color,#ccc);background:var(--tblr-bg-surface,#fff)}' +
    '.pond-color-btn.is-set{border-color:transparent}' +
    '.pond-color-btn svg{width:16px;height:16px;color:var(--tblr-secondary,#667382)}' +
    '.pond-color-btn.is-set svg{display:none}' +
    '.pond-color-menu{position:fixed;z-index:1070;min-width:12rem;background:var(--tblr-bg-surface,#fff);border:1px solid var(--tblr-border-color-translucent,var(--tblr-border-color,#ccc));border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.22);padding:.35rem}' +
    '.pond-color-menu button{display:block;width:100%;text-align:left;border:0;background:transparent;color:inherit;padding:.6rem .85rem;border-radius:8px;font-size:.92rem}' +
    '.pond-color-menu button:hover{background:var(--tblr-bg-surface-secondary,rgba(128,128,128,.15))}'
  document.head.appendChild(style)

  var icon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21a9 9 0 0 1 0 -18c4.97 0 9 3.582 9 8c0 1.06 -.474 2.078 -1.318 2.828c-.844 .75 -1.989 1.172 -3.182 1.172h-2.5a2 2 0 0 0 -1 3.75a1.3 1.3 0 0 1 -1 2.25"/><circle cx="8.5" cy="10.5" r=".6" fill="currentColor"/><circle cx="12.5" cy="7.5" r=".6" fill="currentColor"/><circle cx="16.5" cy="10.5" r=".6" fill="currentColor"/></svg>'

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
    var button = card.querySelector('.pond-color-btn')
    if (!button) {
      var actions = card.querySelector('.pond-card-actions')
      if (!actions || !canEdit()) return
      button = document.createElement('button')
      button.type = 'button'
      button.className = 'btn pond-color-btn'
      button.setAttribute('aria-label', 'Warna aksen kolam')
      button.setAttribute('title', 'Warna aksen kolam')
      button.innerHTML = icon
      button.addEventListener('click', function (event) { event.stopPropagation(); openMenu(button, id) })
      actions.insertBefore(button, actions.firstChild)
    }
    button.setAttribute('data-pond-id', id)
    button.classList.toggle('is-set', Boolean(color))
    button.style.background = color || ''
  }
  function applyAll() {
    document.querySelectorAll('.pond-card[data-dock-id]').forEach(applyTo)
  }

  function closeMenu() { if (menu) { menu.remove(); menu = null } }
  function save(id, color) {
    return request('/app-settings').then(function (settings) {
      var latest = parseColors((settings || {}).pond_colors)
      if (color) latest[id] = color; else delete latest[id]
      return request('/app-settings', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pond_colors: JSON.stringify(latest) }) }).then(function () { colors = latest; loadedAt = Date.now(); applyAll() })
    }).catch(function (error) { say(error.message || 'Warna gagal disimpan.') })
  }
  function pick(id) {
    if (!colorInput) {
      colorInput = document.createElement('input')
      colorInput.type = 'color'
      colorInput.style.cssText = 'position:fixed;left:-100px;top:0;width:1px;height:1px;opacity:0'
      document.body.appendChild(colorInput)
    }
    colorInput.value = colors[id] || '#206bc4'
    colorInput.onchange = function () { save(id, colorInput.value) }
    colorInput.click()
  }
  function openMenu(button, id) {
    closeMenu()
    menu = document.createElement('div')
    menu.className = 'pond-color-menu'
    menu.innerHTML = '<button type="button" data-act="color">Ganti warna aksen</button>' + (colors[id] ? '<button type="button" data-act="uncolor">Hapus warna aksen</button>' : '')
    document.body.appendChild(menu)
    var box = button.getBoundingClientRect()
    menu.style.top = Math.max(8, Math.min(window.innerHeight - menu.offsetHeight - 8, box.top - menu.offsetHeight - 4 > 8 ? box.top - menu.offsetHeight - 4 : box.bottom + 4)) + 'px'
    menu.style.left = Math.max(8, Math.min(window.innerWidth - menu.offsetWidth - 8, box.right - menu.offsetWidth)) + 'px'
    menu.addEventListener('click', function (event) {
      var action = event.target.closest('[data-act]')
      if (!action) return
      var kind = action.getAttribute('data-act')
      closeMenu()
      if (kind === 'color') pick(id)
      else save(id, '')
    })
  }

  function load() {
    if (loading) return
    loading = true
    request('/app-settings').then(function (settings) {
      colors = parseColors((settings || {}).pond_colors)
      loadedAt = Date.now()
      applyAll()
    }).catch(function () {}).then(function () { loading = false })
  }

  document.addEventListener('click', function (event) { if (menu && !event.target.closest('.pond-color-menu') && !event.target.closest('.pond-color-btn')) closeMenu() })
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape') closeMenu() })
  window.addEventListener('scroll', closeMenu, { passive: true })

  var busy = false
  new MutationObserver(function () {
    if (busy) return
    busy = true
    // microtask: the colours are back before the browser paints the new cards
    Promise.resolve().then(function () {
      applyAll()
      busy = false
      if (Date.now() - loadedAt > 20000) load()
    })
  }).observe(document.body, { childList: true, subtree: true })
  load()
})()
