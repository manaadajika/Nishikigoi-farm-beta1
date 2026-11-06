// Data Kolam: the heading of every area gets one small "..." button instead of the wide "Cetak area" button (which pushed the name aside on a phone).
// Its menu: Cetak area (the print of pond-area-print.js), Ganti nama area, Ganti warna aksen, Hapus warna aksen.
// Rename and colour use the same server calls as "Pengaturan area" (POST /ponds-rename-area, PATCH /app-settings) and the page reloads afterwards.
;(function () {
  'use strict'
  if (!/farm-ponds/.test(location.pathname)) return

  var MAX_NAME = 100
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
  function parseList(value) {
    try { var list = typeof value === 'string' ? JSON.parse(value) : value; return Array.isArray(list) ? list.map(String) : null } catch (error) { return null }
  }
  function parseColors(value) {
    try { var colors = typeof value === 'string' ? JSON.parse(value) : value; return colors && typeof colors === 'object' ? colors : {} } catch (error) { return {} }
  }
  function say(message) { if (window.KoiDialog && window.KoiDialog.alert) window.KoiDialog.alert(message); else window.alert(message) }

  var style = document.createElement('style')
  style.textContent =
    '.pond-area-print{display:none!important}' +
    '.pond-area-menu-btn{position:absolute;right:.4rem;top:50%;transform:translateY(-50%);width:2.2rem;height:2.2rem;display:inline-flex;align-items:center;justify-content:center;padding:0;border:0!important;border-radius:50%;background:transparent!important;color:var(--tblr-secondary,#667382);box-shadow:none!important;transition:background .15s,color .15s}' +
    '.pond-area-menu-btn:hover,.pond-area-menu-btn:focus-visible{background:color-mix(in srgb,currentColor 14%,transparent)!important;color:var(--tblr-body-color,inherit)}' +
    '.pond-area-menu-btn svg{width:20px;height:20px}' +
    '.pond-area-heading{padding-right:3.2rem}' +
    '.koi-area-menu{position:fixed;z-index:1070;min-width:13rem;background:var(--tblr-bg-surface,#fff);border:1px solid var(--tblr-border-color-translucent,var(--tblr-border-color,#ccc));border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.22);padding:.35rem}' +
    '.koi-area-menu button{display:block;width:100%;text-align:left;border:0;background:transparent;color:inherit;padding:.6rem .85rem;border-radius:8px;font-size:.92rem;transition:background .12s}' +
    '.koi-area-menu button:hover{background:var(--tblr-bg-surface-secondary,rgba(128,128,128,.15))}'
  document.head.appendChild(style)

  function closeMenu() { if (menu) { menu.remove(); menu = null } }

  function settingsNow() { return request('/app-settings').then(function (settings) { return settings || {} }) }
  function currentColor(area) { return settingsNow().then(function (settings) { var colors = parseColors(settings.pond_area_colors); return /^#[0-9a-f]{6}$/i.test(colors[area] || '') ? colors[area] : '' }) }

  function saveColor(area, color) {
    return settingsNow().then(function (settings) {
      var colors = parseColors(settings.pond_area_colors)
      if (color) colors[area] = color; else delete colors[area]
      return request('/app-settings', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pond_area_colors: JSON.stringify(colors) }) })
    }).then(function () { window.location.reload() }).catch(function (error) { say(error.message || 'Warna gagal disimpan.') })
  }

  function rename(area) {
    window.KoiDialog.prompt('Ganti nama area', area).then(function (typed) {
      if (typed == null) return
      var name = String(typed).trim().replace(/\s+/g, ' ')
      if (!name || name === area) return
      if (name.length > MAX_NAME) { say('Nama area maksimal ' + MAX_NAME + ' karakter.'); return }
      return Promise.all([request('/ponds'), settingsNow()]).then(function (results) {
        var ponds = Array.isArray(results[0]) ? results[0] : []
        var settings = results[1]
        var taken = ponds.some(function (pond) { return String(pond.location || '').trim().toLowerCase() === name.toLowerCase() && String(pond.location || '').trim() !== area })
        if (taken) { say('Sudah ada area bernama "' + name + '". Pakai nama lain.'); return null }
        return request('/ponds-rename-area', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ renames: [{ from: area, to: name }] }) }).then(function () {
          var swap = function (list) { return list ? list.map(function (item) { return item === area ? name : item }) : null }
          var colors = parseColors(settings.pond_area_colors)
          if (colors[area]) { colors[name] = colors[area]; delete colors[area] }
          var body = { pond_area_colors: JSON.stringify(colors) }
          var areas = swap(parseList(settings.pond_areas))
          var order = swap(parseList(settings.pond_area_order))
          if (areas) body.pond_areas = JSON.stringify(areas)
          if (order) body.pond_area_order = JSON.stringify(order)
          return request('/app-settings', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
        }).then(function () {
          try {
            var saved = JSON.parse(window.localStorage.getItem('pondAreaOrder') || 'null')
            if (Array.isArray(saved)) window.localStorage.setItem('pondAreaOrder', JSON.stringify(saved.map(function (item) { return item === area ? name : item })))
          } catch (error) { /* only a remembered order */ }
          window.location.reload()
        })
      })
    }).catch(function (error) { say(error.message || 'Nama area gagal diganti.') })
  }

  function pickColor(area) {
    currentColor(area).then(function (color) {
      if (!colorInput) {
        colorInput = document.createElement('input')
        colorInput.type = 'color'
        colorInput.style.cssText = 'position:fixed;left:-100px;top:0;width:1px;height:1px;opacity:0'
        document.body.appendChild(colorInput)
      }
      colorInput.value = color || '#206bc4'
      colorInput.onchange = function () { saveColor(area, colorInput.value) }
      colorInput.click()
    })
  }

  function openMenu(button, area, heading) {
    closeMenu()
    menu = document.createElement('div')
    menu.className = 'koi-area-menu'
    var editable = canEdit()
    menu.innerHTML = '<button type="button" data-act="print">Cetak area</button>' +
      (editable ? '<button type="button" data-act="rename">Ganti nama area</button>' : '')
    document.body.appendChild(menu)
    var box = button.getBoundingClientRect()
    var width = menu.offsetWidth
    menu.style.top = Math.min(window.innerHeight - menu.offsetHeight - 8, box.bottom + 4) + 'px'
    menu.style.left = Math.max(8, Math.min(window.innerWidth - width - 8, box.right - width)) + 'px'
    menu.addEventListener('click', function (event) {
      var action = event.target.closest('[data-act]')
      if (!action) return
      var kind = action.getAttribute('data-act')
      closeMenu()
      if (kind === 'print') { var print = heading.querySelector('.pond-area-print'); if (print) print.click() }
      else if (kind === 'rename') rename(area)
    })
  }

  function decorate() {
    document.querySelectorAll('.pond-area-heading').forEach(function (heading) {
      if (heading.querySelector('.pond-area-menu-btn')) return
      var area = String(heading.getAttribute('data-area-name') || Array.prototype.filter.call(heading.childNodes, function (node) { return node.nodeType === 3 }).map(function (node) { return node.textContent }).join('') || '').trim()
      if (!area) return
      var button = document.createElement('button')
      button.type = 'button'
      button.className = 'btn btn-sm pond-area-menu-btn'
      button.setAttribute('aria-label', 'Menu area ' + area)
      button.setAttribute('title', 'Cetak, ganti nama')
      button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="19" r="1.2"/></svg>'
      button.addEventListener('click', function (event) { event.stopPropagation(); openMenu(button, area, heading) })
      heading.appendChild(button)
    })
  }

  document.addEventListener('click', function (event) { if (menu && !event.target.closest('.koi-area-menu') && !event.target.closest('.pond-area-menu-btn')) closeMenu() })
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape') closeMenu() })
  window.addEventListener('scroll', closeMenu, { passive: true })
  var timer = null
  new MutationObserver(function () { if (timer) return; timer = setTimeout(function () { timer = null; decorate() }, 60) }).observe(document.body, { childList: true, subtree: true })
  decorate()
})()
