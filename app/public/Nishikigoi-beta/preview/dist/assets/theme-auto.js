// Colour mode of the program: Light, Dark or Auto (follow the device), chosen per account in Theme Settings.
// "Auto" is the default for everybody. The choice and the other theme options are kept per account
// (localStorage key koi-farm-theme-settings-<username>, mirrored on the server by theme-sync.js).
// Runs before dist/js/tabler-theme.js, which reads the 'tabler-*' keys written here.
;(function () {
  var sessionKey = 'koi-farm-auth-session'
  var themeKeys = ['theme', 'theme-base', 'theme-font', 'theme-primary', 'theme-radius']

  function username() {
    try {
      var raw = window.sessionStorage.getItem(sessionKey) || window.localStorage.getItem(sessionKey)
      var session = JSON.parse(raw || 'null')
      return session && session.username ? String(session.username) : ''
    } catch (error) { return '' }
  }
  function accountTheme() {
    try {
      var name = username()
      if (!name) return {}
      return JSON.parse(window.localStorage.getItem('koi-farm-theme-settings-' + name) || 'null') || {}
    } catch (error) { return {} }
  }
  function savedMode() {
    var mode = accountTheme().theme
    return mode === 'light' || mode === 'dark' ? mode : 'auto'
  }

  // The options of this account are the ones tabler-theme.js applies (also when the session lives only in localStorage).
  try {
    var saved = accountTheme()
    themeKeys.forEach(function (key) {
      if (key === 'theme') return
      if (saved[key]) window.localStorage.setItem('tabler-' + key, saved[key])
      else window.localStorage.removeItem('tabler-' + key)
    })
    window.localStorage.setItem('tabler-theme', savedMode())
  } catch (error) {}

  // Theme options never travel in the address: a ?theme= (or ?theme-primary= ...) link must not change the account's theme.
  try {
    var url = new URL(window.location.href)
    var stripped = false
    themeKeys.forEach(function (key) {
      if (url.searchParams.has(key)) { url.searchParams.delete(key); stripped = true }
    })
    if (stripped) window.history.replaceState(window.history.state, '', url)
  } catch (error) {}
  try { window.sessionStorage.removeItem('koi-theme-override') } catch (error) {}

  // The old moon/sun buttons stay hidden: the mode is chosen in Theme Settings (account menu).
  var style = document.createElement('style')
  style.textContent = '.js-theme-toggle,.nav-item:has(> .js-theme-toggle),.position-fixed:has(> .js-theme-toggle){display:none!important}'
  document.head.appendChild(style)

  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)')
  var apply = function () {
    var mode = savedMode()
    var dark = mode === 'dark' || (mode === 'auto' && prefersDark.matches)
    if (dark) document.documentElement.setAttribute('data-bs-theme', 'dark')
    else document.documentElement.removeAttribute('data-bs-theme')
  }
  prefersDark.addEventListener('change', apply)
  // Some phones only report the new device theme when the app comes back to the foreground.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') apply()
  })
  window.addEventListener('focus', apply)
  window.addEventListener('koi-theme-changed', apply)
})()

// Color scheme "Inverted" (white in dark mode): softer than pure white, and the tick of a checked checkbox,
// the dot of a radio and the dash of a half-checked box turn dark (they are white in Tabler, so they vanished
// on a white fill).
;(function () {
  var dark = '%23111827'
  var css = [
    'html[data-bs-theme-primary="inverted"][data-bs-theme="dark"]{--tblr-primary:#d5dbe3;--tblr-primary-rgb:213,219,227;--tblr-primary-fg:#111827}',
    'html[data-bs-theme-primary="inverted"][data-bs-theme="dark"] .pagination{--tblr-pagination-active-color:#111827}',
    'html[data-bs-theme-primary="inverted"][data-bs-theme="dark"] .text-bg-primary{color:#111827!important}',
    'html[data-bs-theme-primary="inverted"][data-bs-theme="dark"] .calendar-range.range-start .date-item,html[data-bs-theme-primary="inverted"][data-bs-theme="dark"] .calendar-range.range-end .date-item,html[data-bs-theme-primary="inverted"][data-bs-theme="dark"] .form-help:hover{color:#111827}',
    'html[data-bs-theme-primary="inverted"][data-bs-theme="dark"] .form-check-input:checked[type=checkbox]{--tblr-form-check-bg-image:url("data:image/svg+xml,%3csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 16 16\' width=\'16\' height=\'16\'%3e%3cpath fill=\'none\' stroke=\'' + dark + '\' stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2.4\' d=\'M4 8.5l2.5 2.5l5-5\'/%3e%3c/svg%3e")}',
    'html[data-bs-theme-primary="inverted"][data-bs-theme="dark"] .form-check-input:checked[type=radio]{--tblr-form-check-bg-image:url("data:image/svg+xml,%3csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 16 16\'%3e%3ccircle r=\'3\' fill=\'' + dark + '\' cx=\'8\' cy=\'8\'/%3e%3c/svg%3e")}',
    'html[data-bs-theme-primary="inverted"][data-bs-theme="dark"] .form-check-input[type=checkbox]:indeterminate{--tblr-form-check-bg-image:url("data:image/svg+xml,%3csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 20 20\'%3e%3cpath fill=\'none\' stroke=\'' + dark + '\' stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'3\' d=\'M6 10h8\'/%3e%3c/svg%3e")}',
    'html[data-bs-theme-primary="inverted"][data-bs-theme="dark"] .form-selectgroup-input[type=checkbox]:checked + .form-selectgroup-label .form-selectgroup-check{background-image:url("data:image/svg+xml,%3csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 16 16\' width=\'16\' height=\'16\'%3e%3cpath fill=\'none\' stroke=\'' + dark + '\' stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2.4\' d=\'M4 8.5l2.5 2.5l5.5 -5.5\'/%3e%3c/svg%3e");border-color:var(--tblr-primary)}',
    'html[data-bs-theme-primary="inverted"][data-bs-theme="dark"] .form-selectgroup-input[type=radio]:checked + .form-selectgroup-label .form-selectgroup-check{background-image:url("data:image/svg+xml,%3csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 16 16\'%3e%3ccircle r=\'3\' fill=\'' + dark + '\' cx=\'8\' cy=\'8\'/%3e%3c/svg%3e");border-color:var(--tblr-primary)}',
  ].join('\n')
  var style = document.createElement('style')
  style.id = 'koi-inverted-scheme-fix'
  style.textContent = css
  ;(document.head || document.documentElement).appendChild(style)
})()
