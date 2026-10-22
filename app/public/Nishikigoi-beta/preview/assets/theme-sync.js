// Theme Settings per account, kept on the server so the choice follows the account to every browser and device.
//
// - on load: GET /my-theme. When the server has a theme for this account it is applied here; when the server has none but
//   this browser does (an older choice), that choice is sent to the server once.
// - on every change in Theme Settings (or Reset): the account's theme is sent to the server shortly after.
// The page's own script (BaseLayout) applies the change at once and keeps the local copy; this file only mirrors it.
;(function () {
  var DEFAULTS = { 'theme': 'light', 'theme-base': 'gray', 'theme-font': 'sans-serif', 'theme-primary': 'blue', 'theme-radius': '1' }
  var KEYS = Object.keys(DEFAULTS)
  var saveTimer = null

  function session() {
    try { return window.KoiAuth && window.KoiAuth.getSession ? window.KoiAuth.getSession() : null } catch (error) { return null }
  }
  function storageKey() {
    var current = session()
    return current && current.username ? 'koi-farm-theme-settings-' + current.username : ''
  }
  function readLocal() {
    try { return JSON.parse(window.localStorage.getItem(storageKey()) || 'null') || {} } catch (error) { return {} }
  }
  function clean(theme) {
    var out = {}
    KEYS.forEach(function (key) {
      var value = theme && theme[key]
      if (typeof value === 'string' && /^[a-z0-9_-]{1,32}$/i.test(value)) out[key] = value
    })
    return out
  }
  function sameTheme(a, b) {
    return KEYS.every(function (key) { return (a[key] || '') === (b[key] || '') })
  }
  function request(path, options) {
    return window.KoiAuth.apiRequest(path, options).then(function (response) {
      return response.json().catch(function () { return {} }).then(function (data) {
        if (!response.ok) throw new Error(data.error || 'Permintaan gagal')
        return data
      })
    })
  }

  // Same rules as dist/js/tabler-theme.js and the Theme Settings form in BaseLayout.
  function applyToPage(theme) {
    var root = document.documentElement
    KEYS.forEach(function (key) {
      var value = theme[key] || ''
      try {
        if (key !== 'theme') {
          if (value) window.localStorage.setItem('tabler-' + key, value)
          else window.localStorage.removeItem('tabler-' + key)
        }
      } catch (error) {}
      if (key === 'theme') return
      if (value && value !== DEFAULTS[key]) root.setAttribute('data-bs-' + key, value)
      else root.removeAttribute('data-bs-' + key)
    })
    try { window.localStorage.setItem('tabler-theme', theme.theme === 'light' || theme.theme === 'dark' ? theme.theme : 'auto') } catch (error) {}
    window.dispatchEvent(new Event('koi-theme-changed'))
    syncRadios(theme)
  }
  function syncRadios(theme) {
    var form = document.getElementById('offcanvas-settings')
    if (!form) return
    KEYS.forEach(function (key) {
      var wanted = theme[key] || (key === 'theme' ? 'auto' : DEFAULTS[key])
      form.querySelectorAll('[name="' + key + '"]').forEach(function (radio) { radio.checked = radio.value === wanted })
    })
  }

  function pushToServer() {
    var name = storageKey()
    if (!name) return
    var theme = clean(readLocal())
    request('/my-theme', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ theme: theme }) }).catch(function () {})
  }
  // the page's own script writes the chosen options into the address bar; keep the address clean
  function cleanAddress() {
    try {
      var url = new URL(window.location.href)
      var changed = false
      KEYS.forEach(function (key) {
        if (url.searchParams.has(key)) { url.searchParams.delete(key); changed = true }
      })
      if (changed) window.history.replaceState(window.history.state, '', url)
    } catch (error) {}
  }
  function schedulePush() {
    window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(function () { cleanAddress(); pushToServer() }, 400)
  }

  function start() {
    if (!window.KoiAuth || !session()) return
    var form = document.getElementById('offcanvas-settings')
    if (form) {
      // listeners added after the page's own, so the local copy is already written when these run
      form.addEventListener('change', schedulePush)
      var reset = document.getElementById('reset-changes')
      if (reset) reset.addEventListener('click', schedulePush)
    }
    // the radio of the colour mode shows "Auto" for an account that never chose
    syncRadios(clean(readLocal()))

    // the page's own script ticks the radios after this file ran: set them again once everything has loaded
    window.addEventListener('load', function () { syncRadios(clean(readLocal())) })

    request('/my-theme').then(function (data) {
      var remote = clean(data && data.theme)
      var local = clean(readLocal())
      if (Object.keys(remote).length) {
        if (!sameTheme(remote, local)) {
          try { window.localStorage.setItem(storageKey(), JSON.stringify(remote)) } catch (error) {}
          applyToPage(remote)
        }
      } else if (Object.keys(local).length) {
        pushToServer()
      }
    }).catch(function () {})
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
  else start()
})()
