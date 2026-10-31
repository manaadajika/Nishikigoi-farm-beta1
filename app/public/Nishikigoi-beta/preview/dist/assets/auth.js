// Koneksi ke server: peringatan di layar bila permintaan ke API gagal dan service worker untuk halaman "Koneksi gagal".
;(function () {
  var nativeFetch = window.fetch ? window.fetch.bind(window) : null
  var banner = null
  var down = false
  var timer = null
  var hideTimer = null

  function build() {
    if (banner) return banner
    banner = document.createElement('div')
    banner.setAttribute('role', 'status')
    banner.setAttribute('aria-live', 'polite')
    banner.style.cssText = 'position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:2200;max-width:min(92vw,560px);' +
      'display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:10px;font-size:.875rem;line-height:1.35;' +
      'background:var(--tblr-bg-surface,#fff);color:var(--tblr-body-color,#1d273b);border:1px solid var(--tblr-border-color,#dce1e7);' +
      'box-shadow:0 8px 24px rgba(0,0,0,.28)'
    banner.innerHTML = '<span data-conn-dot style="flex:0 0 auto;width:10px;height:10px;border-radius:50%;background:#d63939"></span>' +
      '<span data-conn-text style="flex:1 1 auto"></span>' +
      '<button type="button" data-conn-reload style="flex:0 0 auto;border:0;background:transparent;color:var(--tblr-primary,#206bc4);font-weight:600;cursor:pointer;padding:0">Muat ulang</button>'
    banner.querySelector('[data-conn-reload]').addEventListener('click', function () { window.location.reload() })
    return banner
  }
  function show(text, color, withReload) {
    var el = build()
    el.querySelector('[data-conn-dot]').style.background = color
    el.querySelector('[data-conn-text]').textContent = text
    el.querySelector('[data-conn-reload]').style.display = withReload ? '' : 'none'
    if (!el.parentNode) (document.body || document.documentElement).appendChild(el)
  }
  function hide() {
    if (banner && banner.parentNode) banner.parentNode.removeChild(banner)
  }
  function probe() {
    clearTimeout(timer)
    if (!nativeFetch) return
    nativeFetch('/api/health', { cache: 'no-store' }).then(function (response) {
      if (response.ok) return recovered()
      throw new Error('not ok')
    }).catch(function () {
      timer = setTimeout(probe, 5000)
    })
  }
  function failed() {
    if (down) return
    down = true
    clearTimeout(hideTimer)
    show('Koneksi ke server terputus. Perubahan yang belum disimpan bisa gagal. Mencoba menyambung lagi...', '#d63939', false)
    timer = setTimeout(probe, 3000)
  }
  function recovered() {
    if (!down) return
    down = false
    clearTimeout(timer)
    show('Tersambung kembali ke server.', '#2fb344', true)
    hideTimer = setTimeout(hide, 3500)
  }

  // Indikator "Memuat data...": pil kecil dengan spinner di bawah header dan garis tipis di tepi atas layar.
  // Tampil sejak halaman dibuka sampai data selesai dimuat, dan untuk permintaan data yang dipicu pengguna
  // (membuka menu, mencari, memuat ulang). Pengecekan latar belakang tidak memunculkannya.
  var Loading = (function () {
    var publicNames = ['sign-in', 'sign-up', 'forgot-password', '2-step-verification', '2-step-verification-code', 'landing', 'license', 'index', 'error']
    var page = window.location.pathname.replace(/\/$/, '').split('/').pop().replace(/\.html$/, '')
    var enabled = publicNames.indexOf(page) < 0
    var background = /\/api\/(status|health|messages\/unread-count|auth\/touch|notifications)/
    var pending = 0
    var booting = true
    var el = null
    var visible = false
    var showTimer = null
    var settleTimer = null
    var lastAction = 0

    function build() {
      if (el || !document.body) return el
      var style = document.createElement('style')
      style.textContent = '@keyframes koi-load-spin{to{transform:rotate(360deg)}}@keyframes koi-load-bar{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}' +
        // the indicator is placed by place(): on the line of the page title, right after it; the fixed spot is only the fallback
        '.koi-load{position:absolute;left:0;top:0;z-index:2100;display:flex;align-items:center;gap:.45em;white-space:nowrap;line-height:1;' +
        'color:var(--tblr-body-color,#1d273b);pointer-events:none;opacity:0;transition:opacity .18s}' +
        '.koi-load.is-inline{position:static;flex:none;margin-left:1em}' +
        '.koi-load.is-wait{visibility:hidden}' +
        '.koi-load.is-fallback{position:fixed;right:1.25rem;left:auto;top:120px;padding:.25rem .7rem;border-radius:999px;font-size:.75rem;font-weight:600;' +
        'background:var(--tblr-bg-surface,#fff);border:1px solid var(--tblr-border-color,#dce1e7);box-shadow:0 8px 24px rgba(0,0,0,.28)}' +
        '.koi-load.is-on{opacity:1}@media (max-width:991.98px){.koi-load.is-fallback{top:62px;right:.75rem}}' +
        '.koi-load-spin{flex:none;width:1.15em;height:1.15em;min-width:10px;min-height:10px;border-radius:50%;border:2px solid var(--tblr-border-color,#dce1e7);border-top-color:var(--tblr-primary,#206bc4);animation:koi-load-spin .7s linear infinite}' +
        '.koi-load-bar{position:fixed;left:0;top:0;width:40%;height:3px;z-index:2101;background:var(--tblr-primary,#206bc4);pointer-events:none;opacity:0;transition:opacity .18s}' +
        '.koi-load-bar.is-on{opacity:1;animation:koi-load-bar 1.2s ease-in-out infinite}'
      document.head.appendChild(style)
      el = document.createElement('div')
      el.className = 'koi-load'
      el.setAttribute('role', 'status')
      el.setAttribute('aria-live', 'polite')
      el.innerHTML = '<span class="koi-load-spin" aria-hidden="true"></span><span class="koi-load-text">Memuat data...</span>'
      el.bar = document.createElement('div')
      el.bar.className = 'koi-load-bar'
      document.body.appendChild(el)
      document.body.appendChild(el.bar)
      return el
    }
    // Put the indicator inside the title line (a centred flex row) right after the title text: title + indicator are centred as one
    // group and share one level. No title: the fixed spot at the right edge. Hidden: parked back on the body, so it takes no space.
    var placeTimer = null
    var parkTimer = null
    var shownAt = 0
    function useFallback() {
      ;['fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'textTransform', 'color'].forEach(function (name) { el.style[name] = '' })
      el.classList.remove('is-inline')
      el.classList.remove('is-wait')
      el.classList.add('is-fallback')
      if (el.parentNode !== document.body) document.body.appendChild(el)
    }
    function place() {
      if (!el) return
      var title = document.querySelector('.page-title-line-title')
      var line = title ? title.parentNode : null
      if (!line || title.getBoundingClientRect().width === 0) {
        // the title is written a moment after the page starts: wait for it, hidden, instead of showing the pill at the edge
        if (Date.now() - shownAt < 4000) {
          el.classList.remove('is-fallback')
          el.classList.remove('is-inline')
          el.classList.add('is-wait')
          if (el.parentNode !== document.body) document.body.appendChild(el)
        } else {
          useFallback()
        }
        return
      }
      // written like the title: its font, size, weight, letter spacing, case and colour
      var look = window.getComputedStyle(title)
      ;['fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'textTransform', 'color'].forEach(function (name) { el.style[name] = look[name] })
      el.classList.remove('is-fallback')
      el.classList.remove('is-wait')
      el.classList.add('is-inline')
      if (el.parentNode !== line) line.appendChild(el)
    }
    function park() {
      if (visible || !el) return
      el.classList.remove('is-inline')
      if (el.parentNode !== document.body) document.body.appendChild(el)
    }
    function render() {
      var want = enabled && (booting || pending > 0)
      if (want === visible) return
      if (want && !build()) return
      visible = want
      if (!el) return
      clearTimeout(parkTimer)
      if (visible) {
        shownAt = Date.now()
        place()
        clearInterval(placeTimer)
        placeTimer = setInterval(place, 250)   // the title may be written after the first request starts
      } else {
        clearInterval(placeTimer)
        parkTimer = setTimeout(park, 260)      // after the fade-out
      }
      el.classList.toggle('is-on', visible)
      el.bar.classList.toggle('is-on', visible)
    }
    function update() {
      clearTimeout(showTimer)
      if (booting || pending === 0) { render(); return }
      showTimer = setTimeout(render, 400)
    }
    function settle() {
      clearTimeout(settleTimer)
      if (!booting) return
      settleTimer = setTimeout(function () {
        if (pending === 0) { booting = false; update() } else settle()
      }, 600)
    }
    function begin() {
      pending += 1
      update()
    }
    function end() {
      pending = Math.max(0, pending - 1)
      update()
      if (booting) settle()
    }
    function track(target, init) {
      if (!enabled || target.indexOf('/api/') < 0 || background.test(target)) return null
      var method = String((init && init.method) || 'GET').toUpperCase()
      if (method !== 'GET') return null
      if (!booting && Date.now() - lastAction > 1500) return null
      begin()
      var done = false
      return function () { if (!done) { done = true; end() } }
    }
    ;['pointerdown', 'keydown', 'touchstart', 'submit'].forEach(function (name) {
      document.addEventListener(name, function () { lastAction = Date.now() }, true)
    })
    document.addEventListener('DOMContentLoaded', render)
    window.addEventListener('load', settle)
    setTimeout(function () { booting = false; update() }, 15000) // never stay on forever
    window.addEventListener('pageshow', function (event) { if (event.persisted) { booting = false; pending = 0; update() } })
    update()
    return { track: track, begin: function () { lastAction = Date.now(); begin() }, end: end }
  })()
  window.KoiLoading = Loading

  if (nativeFetch) {
    window.fetch = function (input, init) {
      var target = typeof input === 'string' ? input : (input && input.url) || ''
      var isApi = target.indexOf('/api/') >= 0 && target.indexOf('/api/health') < 0
      var finish = Loading.track(target, init)
      return nativeFetch(input, init).then(function (response) {
        if (finish) finish()
        if (isApi) {
          if (response.status === 502 || response.status === 503 || response.status === 504) failed()
          else if (down) recovered()
        }
        return response
      }, function (error) {
        if (finish) finish()
        if (isApi && !(error && error.name === 'AbortError')) failed()
        throw error
      })
    }
  }
  window.addEventListener('offline', failed)
  window.addEventListener('online', function () { if (down) probe() })

  // service worker: hanya untuk halaman "Koneksi gagal" (tidak menyimpan halaman atau data)
  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {})
    })
  }
})();
(function () {
  var accountsKey = 'koi-farm-master-accounts'
  var sessionKey = 'koi-farm-auth-session'
  var currentAccountKey = 'koi-farm-auth-current'
  var defaultAccounts = []
  var workerApiBase = ''
  var usesRemoteApi = false
  var apiBase = '/api'
  var publicPages = ['sign-in', 'sign-up', 'forgot-password', '2-step-verification', '2-step-verification-code']
  var brandSettingsKey = 'nishikigoi-app-settings'
  var apiIndicatorTimer = null
  var rememberSessionDurationMs = 7 * 24 * 60 * 60 * 1000
  var lastSessionTouchAt = 0

  var apiUrl = function (path) {
    var value = String(path || '')
    if (!usesRemoteApi) return value
    if (value.indexOf(workerApiBase) === 0) return value
    if (value.indexOf('/api/') === 0) return apiBase + value.slice(4)
    if (value.indexOf(window.location.origin + '/api/') === 0) return apiBase + value.slice((window.location.origin + '/api').length)
    if (value.indexOf('/uploads/') === 0) return apiBase + value
    return value
  }

  var normalizeUploadMedia = function (root) {
    if (!usesRemoteApi) return
    var scope = root && root.querySelectorAll ? root : document
    var attributes = [
      'src',
      'href',
      'poster',
      'data-brand-icon',
      'data-image-url',
      'data-thumbnail-url',
      'data-zoom-image',
      'data-preview-photo-history',
      'data-merge-preview-photo',
      'data-pond-documentation-url',
    ]

    scope.querySelectorAll(attributes.map(function (attribute) { return '[' + attribute + ']' }).join(',')).forEach(function (element) {
      attributes.forEach(function (attribute) {
        var value = element.getAttribute(attribute)
        if (!value || value.indexOf('data:') === 0 || value.indexOf('blob:') === 0) return
        var nextValue = apiUrl(value)
        if (nextValue !== value) element.setAttribute(attribute, nextValue)
      })
    })
  }

  var readAccounts = function () {
    var accounts = JSON.parse(localStorage.getItem(accountsKey) || 'null')
    if (!Array.isArray(accounts) || accounts.length === 0) {
      localStorage.setItem(accountsKey, JSON.stringify(defaultAccounts))
      return defaultAccounts
    }

    accounts = accounts.map(function (account, index) {
      return {
        id: account.id || index + 1,
        username: account.username || String(account.name || account.email || ('user' + (index + 1))).toLowerCase().replaceAll(' ', ''),
        name: account.name || account.username || ('User ' + (index + 1)),
        email: account.email || '',
        location: account.location || '',
        password: account.password || account.username || 'password',
        role: account.role || 'Viewer',
        status: account.status || 'Active',
        avatar: account.avatar || '',
      }
    })

    accounts = accounts.filter(function (account, index, list) {
      return account.username && list.findIndex(function (item) { return item.username === account.username }) === index
    })

    localStorage.setItem(accountsKey, JSON.stringify(accounts))

    return accounts
  }

  var sessionPayload = function (account, rememberDevice) {
    var now = Date.now()
    return {
      username: account.username,
      name: account.name,
      role: account.role,
      sessionId: account.session_id || account.sessionId || '',
      location: account.location || '',
      avatar: account.avatar || '',
      rememberDevice: Boolean(rememberDevice),
      loggedInAt: new Date(now).toISOString(),
      expiresAt: rememberDevice ? new Date(now + rememberSessionDurationMs).toISOString() : '',
    }
  }

  // Shared by every tab of this browser: the session copy in localStorage counts only while this cookie (no expiry = removed when
  // the browser is closed) carries the same session id. A remembered device does not need it.
  var aliveCookie = {
    set: function (id) { try { document.cookie = 'koi_alive=' + encodeURIComponent(id || '') + '; path=/; SameSite=Lax' } catch (error) {} },
    ok: function (id) {
      try {
        var match = document.cookie.match(/(?:^|;\s*)koi_alive=([^;]*)/)
        return Boolean(match && id && decodeURIComponent(match[1]) === id)
      } catch (error) { return false }
    },
    clear: function () { try { document.cookie = 'koi_alive=; path=/; max-age=0; SameSite=Lax' } catch (error) {} },
  }

  var setSession = function (account, options) {
    var rememberDevice = Boolean(options && options.rememberDevice)
    var nextSession = sessionPayload(account, rememberDevice)
    var payload = JSON.stringify(nextSession)
    localStorage.setItem(currentAccountKey, JSON.stringify({ username: nextSession.username, at: Date.parse(nextSession.loggedInAt) }))

    sessionStorage.setItem(sessionKey, payload)
    localStorage.setItem(sessionKey, payload)
    if (rememberDevice) aliveCookie.clear()
    else aliveCookie.set(nextSession.sessionId)
  }

  var apiRequest = function (path, options) {
    var session = getSession()
    var headers = Object.assign({
      'content-type': 'application/json',
      'x-koi-role': session && session.role ? session.role : '',
      'x-koi-user': session && session.username ? session.username : '',
      'x-koi-session': session && session.sessionId ? session.sessionId : '',
    }, (options && options.headers) || {})

    return fetch(apiUrl(apiBase + path), Object.assign({}, options || {}, { headers: headers })).then(function (response) {
      touchRemoteSession(path)
      return response
    })
  }

  var getSession = function () {
    var rawSession = sessionStorage.getItem(sessionKey)
    var shared = false
    if (!rawSession) {
      rawSession = localStorage.getItem(sessionKey)
      shared = true
    }
    var session = JSON.parse(rawSession || 'null')

    if (!session) return null
    // a copy from another tab: only while the browser has not been closed since that login (or the device is remembered)
    if (shared && !session.rememberDevice && !aliveCookie.ok(session.sessionId)) {
      localStorage.removeItem(sessionKey)
      return null
    }
    if (session.expiresAt && new Date(session.expiresAt).getTime() <= Date.now()) {
      localStorage.removeItem(sessionKey)
      sessionStorage.removeItem(sessionKey)
      return null
    }
    if (!sessionStorage.getItem(sessionKey)) {
      sessionStorage.setItem(sessionKey, JSON.stringify(session))
    }
    return session
  }

  var updateStoredSession = function (updates) {
    var session = getSession()
    if (!session) return
    var nextSession = Object.assign({}, session, updates || {})
    sessionStorage.setItem(sessionKey, JSON.stringify(nextSession))
    var shared = JSON.parse(localStorage.getItem(sessionKey) || 'null')
    if (nextSession.rememberDevice || (shared && shared.sessionId === nextSession.sessionId)) localStorage.setItem(sessionKey, JSON.stringify(nextSession))
  }

  var touchRemoteSession = function (path) {
    if (!usesRemoteApi || path === '/auth/touch' || path === '/auth/logout' || path === '/auth/login') return
    var session = getSession()
    if (!session || !session.sessionId) return
    var now = Date.now()
    if (now - lastSessionTouchAt < 60000) return
    lastSessionTouchAt = now
    nativeFetch(apiUrl(apiBase + '/auth/touch'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-koi-role': session.role || '',
        'x-koi-user': session.username || '',
        'x-koi-session': session.sessionId,
      },
      body: JSON.stringify({}),
    }).catch(function () {})
  }

  var isPublicPage = function () {
    var pathname = window.location.pathname.replace(/\/+$/, '')
    var cleanPathname = pathname.replace(/\.html$/, '')
    return publicPages.some(function (page) {
      return cleanPathname.endsWith('/' + page) || cleanPathname.endsWith(page)
    })
  }

  var login = function (username, password, options) {
    var normalizedUsername = String(username || '').trim().toLowerCase()
    var normalizedPassword = String(password || '')
    var account = readAccounts().find(function (item) {
      return String(item.username || '').trim().toLowerCase() === normalizedUsername
        && String(item.password || '') === normalizedPassword
        && item.status === 'Active'
    })

    if (!account) return false
    setSession(account, options)
    return true
  }

  var loginRemote = async function (username, password, options) {
    var response = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: username, password: password, rememberDevice: Boolean(options && options.rememberDevice) }),
    })

    if (!response.ok) return false
    var data = await response.json()
    if (!data.account) return false
    data.account.session_id = data.session_id || ''
    setSession(data.account, options)
    return true
  }

  var getRemoteAccountSessions = async function () {
    var response = await apiRequest('/account-sessions')
    if (!response.ok) return []
    return response.json()
  }

  var getRemoteAccounts = async function () {
    var response = await apiRequest('/accounts')
    if (!response.ok) return []
    return response.json()
  }

  var saveRemoteAccount = async function (account) {
    var id = Number(account.id)
    var response = await apiRequest(id ? '/accounts/' + id : '/accounts', {
      method: id ? 'PATCH' : 'POST',
      body: JSON.stringify(account),
    })

    if (!response.ok) {
      var data = await response.json().catch(function () { return {} })
      throw new Error(data.error || 'Akun gagal disimpan')
    }

    return response.json()
  }

  var deleteRemoteAccount = async function (id) {
    var response = await apiRequest('/accounts/' + Number(id), { method: 'DELETE' })
    if (!response.ok) throw new Error('Akun gagal dihapus')
    return response.json()
  }


  // Light theme shows the "latar terang" logo, dark theme the "latar gelap" one; an empty slot falls back to the
  // main Icon Program. Favicon and the installed-app icon have their own slots with the same fallback.
  var brandSettingsCache = null
  var brandIconType = function (url) {
    var path = String(url || '').split('?')[0].toLowerCase()
    if (path.indexOf('data:image/png') === 0 || /\.png$/.test(path)) return 'image/png'
    if (path.indexOf('data:image/svg') === 0 || /\.svg$/.test(path)) return 'image/svg+xml'
    if (path.indexOf('data:image/webp') === 0 || /\.webp$/.test(path)) return 'image/webp'
    if (/\.jpe?g$/.test(path)) return 'image/jpeg'
    return 'image/x-icon'
  }
  var applyBrandSettings = function (settings) {
    var safeSettings = Object.assign({ brand_name: 'Nishikigoi', brand_icon: '' }, settings || {})
    brandSettingsCache = safeSettings
    var text = function (key) { return String(safeSettings[key] || '').trim() }
    var brandName = text('brand_name') || 'Nishikigoi'
    var brandIcon = text('brand_icon')
    var dark = document.documentElement.getAttribute('data-bs-theme') === 'dark'
    var themeIcon = dark ? (text('brand_logo_dark') || brandIcon || text('brand_logo_light')) : (text('brand_logo_light') || brandIcon || text('brand_logo_dark'))
    var faviconIcon = text('brand_favicon') || brandIcon
    var appIcon = text('brand_app_icon') || brandIcon

    // koi-brand-title: the tab title ends with the program name from Identitas Program (pages are written with "- Nishikigoi")
    document.title = document.title.replace(/Tabler[^-]*/i, brandName).replace(/^\s*[-|]\s*/, '').replace(/\s-\s*Nishikigoi\s*$/i, ' - ' + brandName)

    document.querySelectorAll('[data-brand-name]').forEach(function (element) {
      element.textContent = brandName
    })

    document.querySelectorAll('[data-brand-owner]').forEach(function (element) {
      element.textContent = text('brand_owner') || brandName
    })

    document.querySelectorAll('[data-brand-icon]').forEach(function (image) {
      var defaultIcon = image.parentElement && image.parentElement.querySelector('.nishikigoi-brand-default-icon')
      if (themeIcon) {
        image.src = apiUrl(themeIcon)
        image.hidden = false
        if (defaultIcon) defaultIcon.hidden = true
      } else {
        image.removeAttribute('src')
        image.hidden = true
        // koi-no-default-icon: nothing is configured in Identitas Program, so nothing is shown (no stock mark)
        if (defaultIcon) defaultIcon.hidden = true
      }
    })

    document.querySelectorAll('[data-brand-favicon]').forEach(function (link) {
      if (faviconIcon) {
        link.href = apiUrl(faviconIcon)
        link.type = brandIconType(faviconIcon)
      }
    })

    // icon used when the page is added to the home screen / installed (iOS and Chrome)
    if (appIcon) {
      var apple = document.querySelector('link[rel="apple-touch-icon"]')
      if (!apple) {
        apple = document.createElement('link')
        apple.rel = 'apple-touch-icon'
        document.head.appendChild(apple)
      }
      apple.href = apiUrl(appIcon)
    }
  }

  // the theme can change without a reload (switch in the menu, or the system theme)
  try {
    new MutationObserver(function () {
      if (brandSettingsCache) applyBrandSettings(brandSettingsCache)
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-bs-theme'] })
  } catch (error) {}

  var scheduleBrandApply = function (settings) {
    applyBrandSettings(settings)
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { applyBrandSettings(settings) }, { once: true })
    }
    requestAnimationFrame(function () { applyBrandSettings(settings) })
    setTimeout(function () { applyBrandSettings(settings) }, 50)
  }

  var loadAppSettings = async function () {
    var cached = JSON.parse(localStorage.getItem(brandSettingsKey) || 'null')
    if (cached) scheduleBrandApply(cached)

    try {
      var response = await apiRequest('/app-settings')
      if (!response.ok) return cached || { brand_name: 'Nishikigoi', brand_icon: '' }
      var settings = await response.json()
      localStorage.setItem(brandSettingsKey, JSON.stringify(settings))
      scheduleBrandApply(settings)
      return settings
    } catch (error) {
      return cached || { brand_name: 'Nishikigoi', brand_icon: '' }
    }
  }

  var saveAppSettings = async function (settings) {
    var response = await apiRequest('/app-settings', {
      method: 'PATCH',
      body: JSON.stringify(settings),
    })

    if (!response.ok) {
      var data = await response.json().catch(function () { return {} })
      throw new Error(data.error || 'Pengaturan program gagal disimpan')
    }

    var data = await response.json()
    var nextSettings = data.settings || settings
    localStorage.setItem(brandSettingsKey, JSON.stringify(nextSettings))
    scheduleBrandApply(nextSettings)
    window.dispatchEvent(new CustomEvent('nishikigoi:brand-settings-updated', { detail: nextSettings }))
    return nextSettings
  }

  var installApiIndicatorStyles = function () {
    if (document.getElementById('koi-api-indicator-style')) return
    var style = document.createElement('style')
    style.id = 'koi-api-indicator-style'
    style.textContent = [
      '.koi-api-indicator{display:inline-flex;width:.72rem;height:.72rem;min-width:.72rem;border-radius:999px;border:1px solid rgba(255,255,255,.4);background:#94a3b8;box-shadow:0 0 0 .18rem rgba(148,163,184,.16),0 0 .75rem rgba(148,163,184,.35);vertical-align:middle}',
      '.koi-api-indicator-ok{background:#22c55e;box-shadow:0 0 0 .18rem rgba(34,197,94,.18),0 0 .8rem rgba(34,197,94,.55)}',
      '.koi-api-indicator-warning{background:#f59f00;box-shadow:0 0 0 .18rem rgba(245,159,0,.18),0 0 .8rem rgba(245,159,0,.55)}',
      '.koi-api-indicator-error{background:#ef4444;box-shadow:0 0 0 .18rem rgba(239,68,68,.18),0 0 .8rem rgba(239,68,68,.55)}',
      '.koi-api-indicator-loading{animation:koiApiPulse 1.25s ease-in-out infinite}',
      '.koi-api-status-pill{display:inline-flex;align-items:center;gap:.5rem;padding:.35rem .65rem;border:1px solid var(--tblr-border-color,#2f3b4f);border-radius:999px;color:var(--tblr-secondary,#94a3b8);font-size:.8125rem;background:rgba(15,23,42,.18)}',
      '.nishikigoi-login-card-wrap{display:block}',
      '.koi-api-status-line-wrap{display:block;width:calc(100% - 3rem);margin:.45rem auto 0;padding-top:.15rem}',
      '.koi-api-status-line-wrap .koi-api-indicator{display:block;width:100%;height:.18rem;min-width:0;border:0;border-radius:999px;background:#94a3b8;box-shadow:0 0 .65rem rgba(148,163,184,.32)}',
      '.koi-api-status-line-wrap .koi-api-indicator-ok{background:#22c55e;box-shadow:0 0 .75rem rgba(34,197,94,.6)}',
      '.koi-api-status-line-wrap .koi-api-indicator-warning{background:#f59f00;box-shadow:0 0 .75rem rgba(245,159,0,.6)}',
      '.koi-api-status-line-wrap .koi-api-indicator-error{background:#ef4444;box-shadow:0 0 .75rem rgba(239,68,68,.6)}',
      '@keyframes koiApiPulse{0%,100%{opacity:.48}50%{opacity:1}}',
    ].join('')
    document.head.appendChild(style)
  }

  var setApiIndicatorState = function (state, label) {
    installApiIndicatorStyles()
    var className = state === 'ok' ? 'koi-api-indicator-ok' : state === 'warning' ? 'koi-api-indicator-warning' : state === 'error' ? 'koi-api-indicator-error' : 'koi-api-indicator-loading'
    var title = label || (state === 'ok' ? 'API dan database terhubung' : state === 'warning' ? 'API terhubung, ada data/endpoint yang perlu dicek' : state === 'error' ? 'API atau database tidak terhubung' : 'Memeriksa API')
    document.querySelectorAll('[data-api-indicator]').forEach(function (element) {
      var dot = element.classList.contains('koi-api-indicator') ? element : element.querySelector('.koi-api-indicator')
      if (dot) {
        dot.classList.remove('koi-api-indicator-ok', 'koi-api-indicator-warning', 'koi-api-indicator-error', 'koi-api-indicator-loading')
        dot.classList.add(className)
      }
      element.setAttribute('title', title)
      element.setAttribute('aria-label', title)
      var labelElement = element.querySelector('[data-api-indicator-label]')
      if (labelElement) labelElement.textContent = title
    })
    window.dispatchEvent(new CustomEvent('nishikigoi:api-status', { detail: { state: state, label: title } }))
  }

  var checkApiIndicator = async function () {
    setApiIndicatorState('loading')
    try {
      var statusResponse = await nativeFetch(apiUrl('/api/status'), { cache: 'no-store' })
      if (!statusResponse.ok) {
        setApiIndicatorState('error', 'API tidak terhubung')
        return
      }

      var statusData = await statusResponse.json().catch(function () { return null })
      setApiIndicatorState(statusData && statusData.status === 'ok' ? 'ok' : 'warning')
    } catch (error) {
      setApiIndicatorState('error', 'API atau database tidak terhubung')
    }
  }

  var installApiIndicator = function () {
    installApiIndicatorStyles()
    if (!document.querySelector('[data-api-indicator]')) return
    checkApiIndicator()
    if (!apiIndicatorTimer) {
      apiIndicatorTimer = window.setInterval(checkApiIndicator, 60000)
    }
  }

  var endServerSession = function (session) {
    if (!session || !session.sessionId) return
    nativeFetch(apiUrl(apiBase + '/auth/logout'), {
      method: 'POST',
      keepalive: true,
      headers: { 'content-type': 'application/json', 'x-koi-session': session.sessionId },
      body: JSON.stringify({}),
    }).catch(function () {})
  }

  var logout = function () {
    var session = getSession()
    var current = JSON.parse(localStorage.getItem(currentAccountKey) || 'null')
    if (session && current && current.username === session.username) localStorage.removeItem(currentAccountKey)
    endServerSession(session)
    localStorage.removeItem(sessionKey)
    sessionStorage.removeItem(sessionKey)
    aliveCookie.clear()
    window.location.href = './sign-in'
  }

  // One account per browser: when another tab logs in with a different account, this tab's older
  // session is ended (also on the server) and the tab follows the newer login or goes to sign-in.
  var followCurrentAccount = function () {
    var current = JSON.parse(localStorage.getItem(currentAccountKey) || 'null')
    var tabSession = JSON.parse(sessionStorage.getItem(sessionKey) || 'null')
    if (!current || !tabSession || current.username === tabSession.username) return false
    if (!(current.at > Date.parse(tabSession.loggedInAt || 0))) return false
    endServerSession(tabSession)
    sessionStorage.removeItem(sessionKey)
    var remembered = JSON.parse(localStorage.getItem(sessionKey) || 'null')
    if (remembered && remembered.username === tabSession.username) localStorage.removeItem(sessionKey)
    if (isPublicPage()) return true
    if (localStorage.getItem(sessionKey)) window.location.reload()
    else window.location.href = './sign-in'
    return true
  }

  var updateUserMenu = function () {
    var session = getSession()
    if (!session) return

    document.querySelectorAll('[data-auth-name]').forEach(function (element) {
      element.textContent = session.name || session.username
    })

    document.querySelectorAll('[data-auth-role]').forEach(function (element) {
      element.textContent = session.role || ''
    })

    document.querySelectorAll('[data-auth-avatar]').forEach(function (element) {
      var source = session.name || session.username || 'User'
      if (session.avatar) {
        element.textContent = ''
        element.style.backgroundImage = 'url(' + session.avatar + ')'
      } else {
        element.style.backgroundImage = ''
        element.textContent = source.split(/\s+/).filter(Boolean).slice(0, 2).map(function (part) {
          return part.charAt(0).toUpperCase()
        }).join('') || 'U'
      }
    })
  }

  var requireLogin = function () {
    if (isPublicPage()) return
    if (!getSession()) {
      window.location.href = './sign-in'
    }
  }

  var normalizeRole = function (role) {
    return String(role || '').trim().toLowerCase().replace(/\s+/g, '-')
  }

  var canAccess = function (permission) {
    var session = getSession()
    var role = normalizeRole(session && session.role)

    if (role === 'master-admin') return true
    if (permission === 'master-admin') return false
    if (role === 'admin') return ['admin', 'database-write', 'farm-operate', 'koi-write', 'koi-read'].includes(permission)
    if (role === 'operator') return ['operator', 'farm-operate', 'koi-read'].includes(permission)
    return permission === 'public'
  }

  var rolePermissions = ['master-admin', 'admin', 'database-write', 'farm-operate', 'koi-write', 'koi-read', 'operator']

  var installRoleGate = function () {
    var denied = rolePermissions.filter(function (permission) { return !canAccess(permission) })
    document.documentElement.setAttribute('data-koi-deny', denied.join(' '))
    if (document.getElementById('koi-role-gate-style')) return
    var style = document.createElement('style')
    style.id = 'koi-role-gate-style'
    style.textContent = rolePermissions.map(function (permission) {
      return 'html[data-koi-deny~="' + permission + '"] [data-role-required="' + permission + '"]{display:none!important}'
        + 'html[data-koi-deny~="' + permission + '"] [data-role-fallback="' + permission + '"]{display:inline-flex!important}'
    }).join('') + '[data-role-fallback]{display:none!important}'
    document.head.appendChild(style)
  }

  var applyRoleAccess = function () {
    installRoleGate()
    var session = getSession()
    var role = normalizeRole(session && session.role)

    document.querySelectorAll('[data-role-required]').forEach(function (element) {
      var permission = element.getAttribute('data-role-required')
      if (!canAccess(permission)) element.classList.add('d-none')
    })

    document.querySelectorAll('[data-role-disable-unless]').forEach(function (element) {
      var permission = element.getAttribute('data-role-disable-unless')
      if (!canAccess(permission)) {
        element.disabled = true
        element.setAttribute('aria-disabled', 'true')
        element.classList.add('disabled')
      }
    })

    var cleanPath = window.location.pathname.replace(/\/+$/, '').replace(/\.html$/, '')
    if (cleanPath.endsWith('settings-master-account') && role !== 'master-admin') {
      window.location.href = './farm'
    }
  }

  // ---- "berhasil" popup -----------------------------------------------------------------------------
  // Every successful save / update / delete in any menu shows a short popup, so nobody has to refresh the page to
  // know it worked. It is done here, on the API calls, so every menu gets it. Uploads, drafts, login, messages and
  // maintenance jobs have their own feedback and stay silent; a burst of calls (bulk edit, import) becomes one popup.
  var toastSilent = /\/(auth|drafts|notifications|system|messages|images|koi-images|videos|maintenance|feedback|status|jobs|koi\/page|koi\/batch|print-settings|my-theme)(\/|\?|$)/
  var toastState = { timer: null, save: 0, update: 0, remove: 0 }

  // Small notice in the top right corner (Tabler / Bootstrap "toast" look): one line, themed background, a coloured edge, gone
  // after a couple of seconds, and clicks pass through it so it never covers a button. Success is short, warnings stay longer.
  function showToast(message, kind) {
    var level = kind || (/gagal|error|tidak didukung|belum|habis|ditolak/i.test(String(message)) ? 'warning' : 'success')
    var colour = level === 'warning' ? 'var(--tblr-warning,#f59f00)' : level === 'danger' ? 'var(--tblr-danger,#d63939)' : 'var(--tblr-success,#2fb344)'
    var icon = level === 'success'
      ? '<path d="M5 12l5 5l10 -10" />'
      : '<path d="M12 9v4" /><path d="M12 16v.01" /><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0" />'
    if (!document.getElementById('koi-toast-style')) {
      var style = document.createElement('style')
      style.id = 'koi-toast-style'
      style.textContent = '.koi-toast-host{position:fixed;top:70px;right:16px;z-index:5000;display:flex;flex-direction:column;align-items:flex-end;gap:6px;max-width:min(92vw,380px);pointer-events:none}' +
        '@media (max-width:767.98px){.koi-toast-host{top:10px;right:10px;left:10px;align-items:center}}' +
        '.koi-toast-host .toast{display:flex;align-items:center;gap:.5rem;width:auto;max-width:100%;padding:.4rem .8rem;border:1px solid var(--tblr-border-color,rgba(128,150,172,.3));border-left-width:3px;border-radius:var(--tblr-border-radius,8px);background:var(--tblr-bg-surface,#1b2330);color:var(--tblr-body-color,#e6e8eb);font-size:.85rem;font-weight:500;line-height:1.3;box-shadow:0 4px 14px rgba(0,0,0,.28);opacity:0;transform:translateY(-6px);transition:opacity .16s ease,transform .16s ease;pointer-events:none}' +
        '.koi-toast-host .toast.is-in{opacity:1;transform:translateY(0)}' +
        '.koi-toast-host .toast svg{flex:0 0 auto;width:18px;height:18px}'
      document.head.appendChild(style)
    }
    var host = document.querySelector('[data-koi-toast-host]')
    if (!host) {
      host = document.createElement('div')
      host.className = 'koi-toast-host toast-container'
      host.setAttribute('data-koi-toast-host', '')
      document.body.appendChild(host)
    }
    // just under the top bar (wherever it is on screen), so it never lies over the menu
    var barBottom = 0
    Array.prototype.forEach.call(document.querySelectorAll('.navbar, header'), function (bar) {
      var rect = bar.getBoundingClientRect()
      if (rect.height > 0 && rect.top < 160 && rect.bottom > barBottom) barBottom = rect.bottom
    })
    host.style.top = (barBottom ? Math.round(barBottom) + 8 : 70) + 'px'
    var box = host.querySelector('[data-koi-toast]')
    if (!box) {
      box = document.createElement('div')
      box.setAttribute('data-koi-toast', '')
      box.setAttribute('role', 'status')
      box.setAttribute('aria-live', 'polite')
      host.appendChild(box)
    }
    box.className = 'toast show'
    box.style.borderLeftColor = colour
    box.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="' + colour + '" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + icon + '</svg><span class="toast-body p-0"></span>'
    box.querySelector('span').textContent = message
    window.requestAnimationFrame(function () { box.classList.add('is-in') })
    window.clearTimeout(box.koiTimer)
    box.koiTimer = window.setTimeout(function () { box.classList.remove('is-in') }, level === 'success' ? 2500 : 4500)
  }
  window.KoiToast = { show: showToast }

  function notifySaved(url, method, response) {
    method = String(method || 'GET').toUpperCase()
    if (method === 'GET' || method === 'HEAD' || !response || !response.ok) return
    if (toastSilent.test(String(url).split('#')[0])) return
    if (method === 'DELETE') toastState.remove += 1
    else if (method === 'POST') toastState.save += 1
    else toastState.update += 1
    window.clearTimeout(toastState.timer)
    toastState.timer = window.setTimeout(function () {
      var total = toastState.save + toastState.update + toastState.remove
      var verb = toastState.update ? 'diperbarui' : toastState.save ? 'disimpan' : 'dihapus'
      toastState.save = toastState.update = toastState.remove = 0
      showToast(total > 1 ? total + ' data ' + verb : 'Data ' + verb)
    }, 700)
  }

  var sessionExpiredHandled = false
  var handleExpiredSession = function () {
    if (sessionExpiredHandled) return
    sessionExpiredHandled = true
    try { window.sessionStorage.setItem('koi-session-expired', '1') } catch (error) {}
    try {
      window.localStorage.removeItem(sessionKey)
      window.sessionStorage.removeItem(sessionKey)
      aliveCookie.clear()
    } catch (error) {}
    window.location.href = './sign-in'
  }

  var nativeFetch = window.fetch.bind(window)
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : input && input.url ? input.url : ''
    var isApiRequest = url.indexOf('/api') === 0 || url.indexOf(window.location.origin + '/api') === 0 || url.indexOf(':4000/') > -1 || url.indexOf('localhost:4000/') > -1
    if (!isApiRequest) return nativeFetch(input, init)

    var nextInput = input
    if (usesRemoteApi) {
      if (typeof input === 'string' && input.indexOf('/api') === 0) {
        nextInput = apiBase + input.slice(4)
      } else if (typeof input === 'string' && input.indexOf(window.location.origin + '/api') === 0) {
        nextInput = apiBase + input.slice((window.location.origin + '/api').length)
      } else if (input && input.url && input.url.indexOf(window.location.origin + '/api') === 0) {
        nextInput = new Request(input.url.replace(window.location.origin + '/api', apiBase), input)
      }
    }

    var session = getSession()
    var nextInit = Object.assign({}, init || {})
    var headers = new Headers(nextInit.headers || (input && input.headers) || {})
    if (!headers.has('x-koi-role')) headers.set('x-koi-role', session && session.role ? session.role : '')
    if (!headers.has('x-koi-user')) headers.set('x-koi-user', session && session.username ? session.username : '')
    if (!headers.has('x-koi-session')) headers.set('x-koi-session', session && session.sessionId ? session.sessionId : '')
    nextInit.headers = headers

    return nativeFetch(nextInput, nextInit).then(function (response) {
      // The server ended this session (a one-day session that was not "remembered", or a login elsewhere):
      // go to the sign-in page instead of leaving every list on "gagal dimuat".
      if (response.status === 401 && !/\/auth\/(login|logout)/.test(url) && !isPublicPage()) handleExpiredSession()
      touchRemoteSession(url)
      notifySaved(url, nextInit.method || (input && input.method), response)
      return response
    })
  }


  // ---- Drag and drop for every upload button -------------------------------------------------------------------------------
  // Any upload field (even a hidden one behind a button) accepts files dropped on the area around it: the form / modal / card it
  // lives in. The dropped files go through the field's own "change" handling, filtered by its accept list, so every menu behaves the
  // same without its own code. Menus that already handle a drop themselves (they call preventDefault) are left alone.
  function installFileDrop() {
    var hasFiles = function (event) { return Array.prototype.indexOf.call((event.dataTransfer && event.dataTransfer.types) || [], 'Files') !== -1 }
    var current = null
    var accepts = function (input, file) {
      var accept = String(input.getAttribute('accept') || '').split(',').map(function (part) { return part.trim().toLowerCase() }).filter(Boolean)
      if (!accept.length) return true
      var type = String(file.type || '').toLowerCase()
      var name = String(file.name || '').toLowerCase()
      return accept.some(function (rule) {
        if (rule.charAt(0) === '.') return name.slice(-rule.length) === rule
        if (rule.slice(-2) === '/*') return type.indexOf(rule.slice(0, -1)) === 0
        return type === rule
      })
    }
    var usable = function (root) {
      return Array.prototype.filter.call(root.querySelectorAll('input[type="file"]'), function (input) {
        return !input.disabled && !input.hasAttribute('data-no-drop') && !input.closest('.modal:not(.show)') && !input.closest('[hidden]') && !!input.parentElement && input.parentElement.getClientRects().length > 0
      })
    }
    var poolOf = function (inputs, files) {
      var fitAll = inputs.filter(function (input) { return files.every(function (file) { return accepts(input, file) }) })
      return fitAll.length ? fitAll : inputs.filter(function (input) { return files.some(function (file) { return accepts(input, file) }) })
    }
    var pickFor = function (inputs, files) {
      var pool = poolOf(inputs, files)
      if (!pool.length) return null
      return (files.length > 1 && pool.filter(function (input) { return input.multiple })[0]) || pool[0]
    }
    // unique = true (Ctrl+V): only when exactly one upload field around fits, so the picture cannot land in the wrong one
    var findTarget = function (event, files, unique) {
      var element = event.target && event.target.nodeType === 1 ? event.target : null
      var single = null   // nearest field that takes only one file; used when no wider field takes several
      while (element && element !== document.body && element !== document.documentElement) {
        var input = pickFor(usable(element), files)
        if (input && unique && poolOf(usable(element), files).length > 1) return null
        if (input) {
          // several files dropped on a one-file field (e.g. one media card): look for a multiple-file field around it first
          if (files.length > 1 && !input.multiple) { if (!single) single = { zone: element, input: input } }
          else return { zone: element, input: input }
        }
        if (element.classList && element.classList.contains('modal-content')) return single
        element = element.parentElement
      }
      if (single) return single
      // a page with a single upload field (outside any modal) takes drops anywhere on the page
      var onPage = usable(document).filter(function (input) { return !input.closest('.modal') })
      if (onPage.length === 1 && !document.querySelector('.modal.show')) {
        var only = pickFor(onPage, files)
        if (only) return { zone: document.querySelector('main, .page-wrapper') || document.body, input: only }
      }
      return null
    }
    var idleTimer = null
    var clear = function () {
      window.clearTimeout(idleTimer)
      if (!current) return
      current.zone.style.outline = current.outline
      current.zone.style.outlineOffset = current.offset
      current = null
    }
    document.addEventListener('dragover', function (event) {
      if (!hasFiles(event)) return
      // a menu with its own drop area shows its own hint: drop ours so two frames never show at once
      if (event.defaultPrevented) { clear(); return }
      event.preventDefault()   // also keeps a file dropped on nothing from opening in the browser
      var target = findTarget(event, [])
      if (!target) { event.dataTransfer.dropEffect = 'none'; clear(); return }
      event.dataTransfer.dropEffect = 'copy'
      // a drag that ends outside the page (dropped elsewhere, cancelled) sends no more events: the frame goes away by itself
      window.clearTimeout(idleTimer)
      idleTimer = window.setTimeout(clear, 1200)
      if (current && current.zone === target.zone) return
      clear()
      idleTimer = window.setTimeout(clear, 1200)
      current = { zone: target.zone, outline: target.zone.style.outline, offset: target.zone.style.outlineOffset }
      target.zone.style.outline = '2px dashed var(--tblr-primary, #066fd1)'
      target.zone.style.outlineOffset = '-2px'
    })
    document.addEventListener('dragleave', function (event) {
      if (!event.relatedTarget) clear()
    })
    document.addEventListener('dragend', clear)
    // Ctrl+V with a picture (or file) on the clipboard fills the upload field of the open form, like the "Paste gambar" button does,
    // without having to click that button or a field first. A form with its own paste handling is left alone.
    document.addEventListener('paste', function ctrlPaste(event) {
      if (event.defaultPrevented) return
      var files = Array.prototype.slice.call((event.clipboardData && event.clipboardData.files) || [])
      if (!files.length) return
      var start = event.target && event.target.nodeType === 1 ? event.target : document.activeElement
      var target = findTarget({ target: start }, files, true)
      if (!target) return
      var input = target.input
      var fit = files.filter(function (file) { return accepts(input, file) })
      if (!fit.length) return
      if (!input.multiple) fit = fit.slice(0, 1)
      event.preventDefault()
      var transfer = new DataTransfer()
      fit.forEach(function (file) { transfer.items.add(file) })
      input.files = transfer.files
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    document.addEventListener('drop', function (event) {
      clear()
      if (!hasFiles(event)) return
      if (event.defaultPrevented) return
      event.preventDefault()
      var files = Array.prototype.slice.call(event.dataTransfer.files || [])
      if (!files.length) return
      var target = findTarget(event, files)
      if (!target) {
        // dropped on an upload area that does not take this kind of file
        var around = event.target && event.target.nodeType === 1 ? event.target : null
        while (around && around !== document.body) {
          if (usable(around).length) { if (window.KoiToast) window.KoiToast.show('Jenis file ini tidak didukung untuk tombol unggah di sini.'); break }
          if (around.classList && around.classList.contains('modal-content')) break
          around = around.parentElement
        }
        return
      }
      var input = target.input
      var fit = files.filter(function (file) { return accepts(input, file) })
      if (!fit.length) {
        if (window.KoiToast) window.KoiToast.show('Jenis file ini tidak didukung untuk tombol unggah di sini.')
        return
      }
      if (!input.multiple) fit = fit.slice(0, 1)
      var transfer = new DataTransfer()
      fit.forEach(function (file) { transfer.items.add(file) })
      input.files = transfer.files
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
  }
  installFileDrop()


  // ---- Clipboard on plain http (e.g. the phone's address on the Wi-Fi) -----------------------------------------------------------
  // Browsers only allow navigator.clipboard.read()/writeText() on https or localhost. Everywhere else the "Paste gambar" buttons
  // would fail ("Browser belum mengizinkan baca clipboard gambar"). Here they keep working: the button waits for the next paste
  // (Ctrl+V) and hands that image on exactly like clipboard.read() would; copying text falls back to a hidden field.
  function installClipboardFallback() {
    var secure = window.isSecureContext && navigator.clipboard && navigator.clipboard.read
    if (secure) return
    var read = function () {
      return new Promise(function (resolve, reject) {
        if (window.KoiToast) window.KoiToast.show('Tekan Ctrl+V sekarang untuk menempel gambar.')
        var finished = false
        var timer = null
        var finish = function (action) {
          if (finished) return
          finished = true
          document.removeEventListener('paste', onPaste, true)
          window.clearTimeout(timer)
          action()
        }
        var onPaste = function (event) {
          var files = Array.prototype.slice.call((event.clipboardData && event.clipboardData.files) || [])
          var images = files.filter(function (file) { return /^image\//.test(file.type) })
          if (!images.length) return   // no picture in it: keep waiting
          event.preventDefault()
          event.stopPropagation()   // the page's own paste handler must not take the same picture a second time
          finish(function () {
            resolve(images.map(function (file) {
              return { types: [file.type], getType: function () { return Promise.resolve(file) } }
            }))
          })
        }
        timer = window.setTimeout(function () {
          finish(function () { reject(new Error('Gambar belum ditempel. Tekan tombol tempel lagi, lalu Ctrl+V.')) })
        }, 30000)
        document.addEventListener('paste', onPaste, true)
      })
    }
    var writeText = function (text) {
      return new Promise(function (resolve, reject) {
        var area = document.createElement('textarea')
        area.value = String(text)
        area.setAttribute('readonly', '')
        area.style.cssText = 'position:fixed;left:-9999px;top:0'
        document.body.appendChild(area)
        area.select()
        var ok = false
        try { ok = document.execCommand('copy') } catch (error) {}
        area.remove()
        if (ok) resolve()
        else reject(new Error('Salin gagal'))
      })
    }
    try {
      if (!navigator.clipboard) Object.defineProperty(navigator, 'clipboard', { value: {}, configurable: true })
      if (!navigator.clipboard.read || !window.isSecureContext) navigator.clipboard.read = read
      if (!navigator.clipboard.writeText || !window.isSecureContext) navigator.clipboard.writeText = writeText
    } catch (error) {}
  }
  installClipboardFallback()


  // ---- Number fields: only typed, never changed by accident ----------------------------------------------------------------------
  // A focused number field changes its value when the mouse wheel passes over it (or with the arrow keys / the little spin buttons),
  // which silently ruins sizes and prices. Here a number field only takes what is typed: the wheel scrolls the page instead, the arrow
  // keys and spin buttons are gone, and fields with a decimal step (0.1, 0.01) accept any typed decimal.
  function installNumberGuard() {
    var style = document.createElement('style')
    style.id = 'koi-number-guard'
    style.textContent = 'input[type="number"]{-moz-appearance:textfield;appearance:textfield}' +
      'input[type="number"]::-webkit-outer-spin-button,input[type="number"]::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}'
    document.head.appendChild(style)
    var isNumber = function (element) { return element && element.tagName === 'INPUT' && element.type === 'number' }
    document.addEventListener('wheel', function (event) {
      if (isNumber(event.target) && document.activeElement === event.target) event.target.blur()
    }, { capture: true, passive: true })
    document.addEventListener('keydown', function (event) {
      if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && isNumber(event.target)) event.preventDefault()
    }, true)
    var relax = function (input) {
      var step = input.getAttribute('step')
      if (step && step !== 'any' && Number(step) % 1 !== 0) input.setAttribute('step', 'any')
    }
    var relaxAll = function () {
      Array.prototype.forEach.call(document.querySelectorAll('input[type="number"][step]'), relax)
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', relaxAll)
    else relaxAll()
    document.addEventListener('focusin', function (event) { if (isNumber(event.target)) relax(event.target) }, true)
  }
  installNumberGuard()

  // ---- Numbers: what may be typed ------------------------------------------------------------------------------------------------------
  // Size in cm (Size, ukuran induk, ukuran ikan datang, ukuran rata-rata): whole numbers only, digits 0-9, no comma and no period.
  // Weight in grams (Berat Telur): digits and ONE decimal sign (comma or period) with at most ONE digit after it, like 12.5.
  // The extra characters are refused as they are typed (and cut from a pasted value); a value already saved is left as it is.
  var CM_FIELDS = '[name$="length_cm"],[data-parent-length],[data-line-size],[data-average-length],input[data-bulk-value][type="number"][step="0.1"]'
  var WEIGHT_FIELDS = '[name$="weight_g"]'
  document.addEventListener('keydown', function (event) {
    var field = event.target
    if (!field || field.tagName !== 'INPUT' || !field.matches(CM_FIELDS)) return
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (['.', ',', 'e', 'E', '+', '-'].indexOf(event.key) >= 0) event.preventDefault()
  }, true)
  document.addEventListener('focusin', function (event) {
    var field = event.target
    if (field && field.tagName === 'INPUT' && field.matches && field.matches(CM_FIELDS)) field.inputMode = 'numeric'
    else if (field && field.tagName === 'INPUT' && field.matches && field.matches(WEIGHT_FIELDS)) field.inputMode = 'decimal'
  }, true)
  document.addEventListener('input', function (event) {
    var field = event.target
    if (!field || field.tagName !== 'INPUT' || !field.matches) return
    if (field.matches(CM_FIELDS)) {
      var whole = field.value.replace(/[.,].*$/, '')
      if (whole !== field.value) field.value = whole
    } else if (field.matches(WEIGHT_FIELDS)) {
      var cut = field.value.replace(/([.,]\d)\d+$/, '$1')
      if (cut !== field.value) field.value = cut
    }
  }, true)

  // ---- Fields that sit outside an open modal ---------------------------------------------------------------------------------------
  // A Bootstrap modal (Edit Ikan, Formulir Kolam ...) pulls the focus back into itself whenever it moves to an element outside the modal.
  // The program's own dialogs and pop-up lists (the size prompt of History Progress Foto, search boxes of a select list ...) are
  // placed outside the modal, so their text fields could not be typed in. A field outside the modal is now allowed to take the focus
  // while a modal is open (the page behind the modal cannot be reached with the mouse anyway).
  function installModalFocusGuard() {
    document.addEventListener('focusin', function (event) {
      var element = event.target
      if (!element || !element.closest || element.closest('.modal')) return
      if (!document.querySelector('.modal.show')) return
      if (element.matches('input, textarea, select, [contenteditable="true"]')) event.stopPropagation()
    }, true)
  }
  installModalFocusGuard()

  // ---- Clear (X) button on text fields ---------------------------------------------------------------------------------------------
  // Every ordinary text / number / email / phone / link field gets an X button joined to its right edge (the same Tabler input-group
  // look as the Show button of the password field). It empties the field, fires input + change so the page reacts, and focuses it.
  // Not added to: password, date/time, file, read-only or disabled fields, the navbar search (it has its own X), fields inside
  // dropdown menus, or any field marked data-no-clear.
  function installClearButtons() {
    var okTypes = { text: 1, search: 1, email: 1, tel: 1, url: 1, number: 1 }
    var style = document.createElement('style')
    style.id = 'koi-clear-buttons'
    style.textContent = '.input-group>[data-koi-clear]{flex:0 0 auto;padding-left:.7rem;padding-right:.7rem}' +
      '.input-group>input[type="number"]+[data-koi-clear]{border-left-width:1px}' +
      // Data Ikan has older in-field clear buttons (floating x): where this joined button exists they are hidden, so a field never shows two
      '[data-koi-clear-owner] .koi-field-clear,[data-koi-clear-owner] .koi-pond-clear,[data-koi-clear-owner] .koi-parent-clear{display:none!important}' +
      '[data-koi-clear-owner].has-clear .form-control,[data-koi-clear-owner] .koi-pond-search .form-control,.koi-pond-search[data-koi-clear-owner] .form-control,.koi-parent-search[data-koi-clear-owner] .form-control{padding-right:.75rem!important}' +
      'input[data-koi-clear-done]::-webkit-search-cancel-button{display:none}'
    document.head.appendChild(style)

    function eligible(input) {
      if (!input || input.tagName !== 'INPUT' || input.dataset.koiClearDone) return false
      var type = (input.getAttribute('type') || 'text').toLowerCase()
      if (!okTypes[type] || !input.classList.contains('form-control')) return false
      if (input.readOnly || input.disabled || input.hasAttribute('data-no-clear') || input.hasAttribute('data-date-parts') || input.matches('[data-koi-search],[data-pond-search],[data-gallery-search],[data-report-search],[data-breeding-search],[data-log-search],[data-sell-search],[data-invoice-search],[data-inventory-search]') || input.hasAttribute('hidden')) return false
      if (input.closest('.navbar, .navbar-global-search, .dropdown-menu, #offcanvas-settings, .input-icon, .form-floating, [data-no-clear]')) return false
      var parent = input.parentElement
      if (!parent) return false
      if (parent.classList.contains('input-group') && parent.querySelector('[data-koi-clear], [data-password-toggle]')) return false
      return true
    }

    function enhance(input) {
      if (!eligible(input)) return
      input.dataset.koiClearDone = '1'
      var parent = input.parentElement
      var group = parent
      var container = parent.classList.contains('input-group') ? parent.parentElement : parent
      // every wrapper of the older Data Ikan clear system (help-field, pond / parent search) is marked, so its own button is hidden
      var owner = container
      var olderRoot = container
      while (owner && owner !== document.body) {
        owner.setAttribute('data-koi-clear-owner', '')
        olderRoot = owner
        var up = owner.parentElement
        if (up && up.matches && up.matches('.koi-help-field, .koi-pond-search, .koi-parent-search')) owner = up
        else break
      }
      if (!parent.classList.contains('input-group')) {
        group = document.createElement('div')
        group.className = 'input-group'
        parent.insertBefore(group, input)
        group.appendChild(input)
      }
      var button = document.createElement('button')
      button.type = 'button'
      button.className = 'btn'
      button.tabIndex = -1
      button.setAttribute('data-koi-clear', '')
      button.setAttribute('title', 'Kosongkan isian')
      button.setAttribute('aria-label', 'Kosongkan isian')
      button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" style="display:block"><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></svg>'
      button.addEventListener('mousedown', function (event) { event.preventDefault() })
      button.addEventListener('click', function () {
        if (!input.value) { input.focus(); return }
        input.value = ''
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new Event('change', { bubbles: true }))
        // the older clear button of the same field (pond / parent search) also resets what it keeps beside the text
        var older = olderRoot && olderRoot.querySelector('.koi-pond-clear, .koi-parent-clear, .koi-field-clear')
        if (older) older.click()
        input.focus()
      })
      // after the input (and after any dropdown/suggest sibling that must stay attached to it is not needed: appended at the end)
      group.appendChild(button)
    }

    var timer = null
    function scan() {
      timer = null
      Array.prototype.forEach.call(document.querySelectorAll('input.form-control'), enhance)
    }
    function schedule() { if (!timer) timer = setTimeout(scan, 60) }
    function start() {
      scan()
      new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true })
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
    else start()
  }
  installClearButtons()

  // ---- Date standard for the whole program ---------------------------------------------------------------------------------------
  // Every date the program shows is written  year - [month number] Month name - day - weekday  (2026 - [10] Oktober - 20 - Senin);
  // where there is little room the weekday is left out (2026 - [10] Oktober - 20). KoiAuth.formatDate(value, { weekday, time }).
  // A date may be known only in part: just the year, or the year and the month. It is stored as 2025-00-00 / 2025-03-00 (the part that
  // is not known is 00, which still sorts and compares correctly) and written with only what is known: 2025, or 2025 - [03] Maret.
  // Date fields are three boxes (Tahun, Bulan, Tanggal): only the year has to be filled, see installDateInputs.
  var DATE_MONTH_NAMES = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
  var DATE_DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
  function pad2(number) { return ('0' + number).slice(-2) }
  // { y, m, d } of 2025 / 2025-03 / 2025-03-14 / 2025-03-00 / 2025-00-00 (m or d is 0 when not known), or null when it is not such a date
  function dateParts(value) {
    if (value === null || value === undefined || value instanceof Date) return null
    var text = String(value).trim()
    var match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?$/)
    if (match) return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) }
    if ((match = text.match(/^(\d{4})-(\d{2})$/))) return { y: Number(match[1]), m: Number(match[2]), d: 0 }
    if ((match = text.match(/^(\d{4})$/))) return { y: Number(match[1]), m: 0, d: 0 }
    return null
  }
  function parseDateValue(value) {
    if (value === null || value === undefined || value === '') return null
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value
    var text = String(value).trim()
    var plain = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/)
    if (plain) return new Date(Number(plain[1]), Number(plain[2]) - 1, Number(plain[3]), Number(plain[4] || 0), Number(plain[5] || 0), Number(plain[6] || 0))
    var parsed = new Date(text)
    return isNaN(parsed.getTime()) ? null : parsed
  }
  function formatDate(value, options) {
    options = options || {}
    var parts = dateParts(value)
    if (parts && parts.y > 0 && (parts.m === 0 || parts.d === 0)) {
      if (parts.m === 0) return parts.d === 0 ? String(parts.y) : parts.y + ' - tanggal ' + parts.d   // the month was forgotten, the day is known
      if (parts.m <= 12) return parts.y + ' - [' + pad2(parts.m) + '] ' + DATE_MONTH_NAMES[parts.m - 1]
    }
    var date = parseDateValue(value)
    if (!date) return value === null || value === undefined ? '' : String(value)
    var text = date.getFullYear() + ' - [' + pad2(date.getMonth() + 1) + '] ' + DATE_MONTH_NAMES[date.getMonth()] + ' - ' + pad2(date.getDate())
    if (options.weekday) text += ' - ' + DATE_DAY_NAMES[date.getDay()]
    if (options.time) text += ', ' + pad2(date.getHours()) + '.' + pad2(date.getMinutes())
    return text
  }
  function formatDateTime(value, options) {
    return formatDate(value, Object.assign({ time: true }, options || {}))
  }
  // The date as it is written in an Excel file or a short list: 2025, 2025-03 or 2025-03-14 (only what is known)
  function dateShort(value) {
    var parts = dateParts(value)
    if (!parts) return value === null || value === undefined ? '' : String(value).slice(0, 10)
    if (parts.m === 0) return parts.d === 0 ? String(parts.y) : parts.y + '-00-' + pad2(parts.d)
    if (parts.d === 0) return parts.y + '-' + pad2(parts.m)
    return parts.y + '-' + pad2(parts.m) + '-' + pad2(parts.d)
  }
  var DATE_MONTH_WORDS = { januari: 1, jan: 1, january: 1, februari: 2, feb: 2, february: 2, pebruari: 2, maret: 3, mar: 3, march: 3, april: 4, apr: 4, mei: 5, may: 5, juni: 6, jun: 6, june: 6,
    juli: 7, jul: 7, july: 7, agustus: 8, agu: 8, ags: 8, aug: 8, august: 8, september: 9, sep: 9, sept: 9, oktober: 10, okt: 10, oct: 10, october: 10, november: 11, nov: 11, desember: 12, des: 12, dec: 12, december: 12 }
  // What a person typed (or a search box / Excel cell holds) -> 'YYYY-MM-DD' (00 for a month or day that is not known), or '' when it is not a
  // date. Understands the program's own text (2026 - [10] Oktober - 20 - Senin), 2026-10-20, 20/10/2026, the older "20 - [10] Oktober - 2026",
  // and the partial forms: 2026, 2026-10, 10/2026, Oktober 2026, 2026 - [10] Oktober.
  function dateFromText(value) {
    var typed = String(value || '').trim()
    var match
    var parts = null
    if ((match = typed.match(/^(\d{4})\s*-\s*\[?(\d{1,2})\]?[^\d]*?-\s*(\d{1,2})(?!\d)/))) parts = [match[1], match[2], match[3]]
    else if ((match = typed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) parts = [match[1], match[2], match[3]]
    else if ((match = typed.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/))) parts = [match[3], match[2], match[1]]
    else if ((match = typed.match(/^(\d{1,2})\s*-\s*\[?(\d{1,2})\]?[^\d]*-\s*(\d{4})$/))) parts = [match[3], match[2], match[1]]
    else if ((match = typed.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/)) && DATE_MONTH_WORDS[match[2].toLowerCase()]) parts = [match[3], String(DATE_MONTH_WORDS[match[2].toLowerCase()]), match[1]]
    else if ((match = typed.match(/^(\d{4})\s*-\s*\[?(\d{1,2})\]?(?:\s+[A-Za-z]+)?$/))) parts = [match[1], match[2], '0']
    else if ((match = typed.match(/^(\d{4})\s*-\s*([A-Za-z]+)$/)) && DATE_MONTH_WORDS[match[2].toLowerCase()]) parts = [match[1], String(DATE_MONTH_WORDS[match[2].toLowerCase()]), '0']
    else if ((match = typed.match(/^(\d{1,2})[\/.-](\d{4})$/))) parts = [match[2], match[1], '0']
    else if ((match = typed.match(/^([A-Za-z]+)\s+(\d{4})$/)) && DATE_MONTH_WORDS[match[1].toLowerCase()]) parts = [match[2], String(DATE_MONTH_WORDS[match[1].toLowerCase()]), '0']
    else if ((match = typed.match(/^(\d{4})$/))) parts = [match[1], '0', '0']
    if (!parts) return ''
    var year = Number(parts[0]), month = Number(parts[1]), day = Number(parts[2])
    if (year < 1000) return ''
    if (month === 0) return day <= 31 ? year + '-00-' + pad2(day) : ''
    if (month > 12) return ''
    if (day === 0) return year + '-' + pad2(month) + '-00'
    var date = new Date(year, month - 1, day)
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return ''
    return year + '-' + pad2(month) + '-' + pad2(day)
  }

  // Every date field (input marked data-date-parts) becomes three boxes: Tahun, Bulan, Tanggal. Only the year has to be filled; a month
  // or a day that is not known is left as "-". The original input stays in the page (hidden) and keeps the value as YYYY-MM-DD with 00 for
  // what is not known, so forms, saving and the code that reads or sets input.value work as before.
  function installDateInputs() {
    var style = document.createElement('style')
    style.id = 'koi-date-inputs'
    style.textContent = '.koi-date-parts{display:flex;flex-wrap:wrap;gap:.35rem;width:100%;align-items:stretch}' +
      '.koi-date-parts>*{min-width:0}' +
      '.koi-date-parts .koi-dp-year{flex:0 1 4.6rem}' +
      '.koi-date-parts .koi-dp-month{flex:2 1 8.2rem}' +
      '.koi-date-parts .koi-dp-day{flex:0 1 5rem}' +
      '.koi-date-parts .form-select{padding-right:1.9rem;background-position:right .5rem center}' +
      '.koi-date-parts .koi-dp-btn{flex:0 0 auto;padding-left:.6rem;padding-right:.6rem}' +
      '.koi-date-parts .koi-dp-today{margin-left:auto}'
    document.head.appendChild(style)
    var nativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')

    function enhance(input) {
      if (!input || input.tagName !== 'INPUT' || input.dataset.koiDate || !input.hasAttribute('data-date-parts')) return
      if (input.hasAttribute('data-no-date-text') || input.closest('.navbar, #offcanvas-settings')) return
      var parent = input.parentElement
      if (!parent) return
      input.dataset.koiDate = '1'
      var required = input.required
      var label = ''
      if (input.id) {
        var labelNode = document.querySelector('label[for="' + input.id + '"]')
        label = labelNode ? labelNode.textContent.replace('*', '').trim() : ''
      }
      input.required = false
      input.setAttribute('data-no-clear', '')
      input.style.display = 'none'
      input.tabIndex = -1

      var box = document.createElement('div')
      box.className = 'koi-date-parts'
      box.setAttribute('role', 'group')
      box.setAttribute('aria-label', label || input.getAttribute('aria-label') || 'Tanggal')
      var year = document.createElement('input')
      year.type = 'text'
      year.inputMode = 'numeric'
      year.maxLength = 4
      year.className = 'form-control koi-dp-year'
      year.placeholder = 'Tahun'
      year.autocomplete = 'off'
      year.setAttribute('data-no-clear', '')
      year.setAttribute('aria-label', 'Tahun')
      year.required = required
      if (input.id) year.id = input.id + '-tahun'
      var month = document.createElement('select')
      month.className = 'form-select koi-dp-month'
      month.setAttribute('data-native-select', '')   // keep the browser's own list: it is rebuilt when the month or year changes
      month.setAttribute('aria-label', 'Bulan')
      var day = document.createElement('select')
      day.className = 'form-select koi-dp-day'
      day.setAttribute('data-native-select', '')
      day.setAttribute('aria-label', 'Tanggal')
      var today = document.createElement('button')
      today.type = 'button'
      today.className = 'btn koi-dp-btn koi-dp-today'
      today.tabIndex = -1
      today.textContent = 'Hari ini'
      today.title = 'Isi dengan tanggal hari ini'
      today.setAttribute('aria-label', 'Isi dengan tanggal hari ini')
      var clear = document.createElement('button')
      clear.type = 'button'
      clear.className = 'btn koi-dp-btn d-none'
      clear.tabIndex = -1
      clear.title = 'Kosongkan tanggal'
      clear.setAttribute('aria-label', 'Kosongkan tanggal')
      clear.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6l-12 12"/><path d="M6 6l12 12"/></svg>'
      var monthHtml = '<option value="">Bulan -</option>'
      DATE_MONTH_NAMES.forEach(function (name, index) { monthHtml += '<option value="' + pad2(index + 1) + '">[' + pad2(index + 1) + '] ' + name + '</option>' })
      month.innerHTML = monthHtml
      box.appendChild(year)
      box.appendChild(month)
      box.appendChild(day)
      box.appendChild(today)
      box.appendChild(clear)
      input.insertAdjacentElement('afterend', box)
      if (input.id) {
        var forLabel = document.querySelector('label[for="' + input.id + '"]')
        if (forLabel) forLabel.setAttribute('for', year.id)
      }

      function fillDays() {
        var chosen = day.value
        var total = 31
        if (month.value) {
          var y = /^\d{4}$/.test(year.value) ? Number(year.value) : 2000   // 2000 is a leap year: February has 29 days until the year is known
          total = new Date(y, Number(month.value), 0).getDate()
        }
        var html = '<option value="">Tgl -</option>'
        for (var n = 1; n <= total; n++) html += '<option value="' + pad2(n) + '">' + n + '</option>'
        day.innerHTML = html
        day.value = chosen && Number(chosen) <= total ? chosen : ''
        day.disabled = input.disabled
      }
      // the three boxes -> the hidden input
      function compose(fire) {
        var yearText = year.value.replace(/\D/g, '')
        if (yearText !== year.value) year.value = yearText
        year.setCustomValidity(yearText && yearText.length < 4 ? 'Tahun harus 4 angka, contoh 2025' : '')
        fillDays()
        var text = yearText.length === 4 ? yearText + '-' + (month.value || '00') + '-' + (day.value || '00') : ''
        if (nativeValue.get.call(input) !== text) {
          nativeValue.set.call(input, text)
          if (fire) {
            input.dispatchEvent(new Event('input', { bubbles: true }))
            input.dispatchEvent(new Event('change', { bubbles: true }))
          }
        }
        clear.classList.toggle('d-none', !(year.value || month.value || day.value))
        input.title = text ? formatDate(text, { weekday: true }) : ''
      }
      // the hidden input -> the three boxes (code that fills the field with input.value = ..., or a form reset)
      function render() {
        var parts = dateParts(nativeValue.get.call(input))
        year.value = parts && parts.y ? String(parts.y) : ''
        month.value = parts && parts.m ? pad2(parts.m) : ''
        fillDays()
        day.value = parts && parts.d ? pad2(parts.d) : ''
        year.setCustomValidity('')
        clear.classList.toggle('d-none', !(year.value || month.value || day.value))
        input.title = year.value ? formatDate(nativeValue.get.call(input), { weekday: true }) : ''
      }
      function syncDisabled() {
        year.disabled = month.disabled = input.disabled
        year.readOnly = input.readOnly
        clear.disabled = today.disabled = input.disabled || input.readOnly
        day.disabled = input.disabled || input.readOnly
        if (input.readOnly) month.disabled = true
        clear.classList.toggle('d-none', input.disabled || input.readOnly || !(year.value || month.value || day.value))
        today.classList.toggle('d-none', input.disabled || input.readOnly)
      }
      Object.defineProperty(input, 'value', {
        configurable: true,
        get: function () { return nativeValue.get.call(this) },
        set: function (next) {
          var text = String(next === null || next === undefined ? '' : next)
          var parts = dateParts(text)
          nativeValue.set.call(this, parts ? parts.y + '-' + pad2(parts.m) + '-' + pad2(parts.d) : text)
          render()
          syncDisabled()
        },
      })
      year.addEventListener('input', function () { compose(true) })
      month.addEventListener('change', function () { compose(true) })
      day.addEventListener('change', function () { compose(true) })
      today.addEventListener('click', function () {
        var now = new Date()
        year.value = String(now.getFullYear())
        month.value = pad2(now.getMonth() + 1)
        fillDays()
        day.value = pad2(now.getDate())
        compose(true)
      })
      clear.addEventListener('click', function () {
        year.value = ''
        month.value = ''
        day.value = ''
        compose(true)
        year.focus()
      })
      if (input.form) input.form.addEventListener('reset', function () { setTimeout(function () { render(); syncDisabled() }, 0) })
      // a form that is switched to read-only (preview) disables or locks its fields: the boxes follow
      new MutationObserver(syncDisabled).observe(input, { attributes: true, attributeFilter: ['disabled', 'readonly'] })
      render()
      syncDisabled()
    }

    var timer = null
    function scan() {
      timer = null
      Array.prototype.forEach.call(document.querySelectorAll('input[data-date-parts]'), enhance)
    }
    function schedule() { if (!timer) timer = setTimeout(scan, 0) }
    function start() {
      scan()
      new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true })
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
    else start()
  }
  installDateInputs()

  // ---- Dialogs: confirm / prompt / alert in the program's own look ----------------------------------------------------------------
  // The browser's own popups are easy to click through by accident and say "localhost says". These are small and plain, in the colors of
  // the theme, put the safe button (Batal) first for risky actions and need a typed word (e.g. HAPUS) when the message asks for it.
  //   KoiDialog.confirm('Hapus 4 ikan terpilih?')                    -> Promise<boolean>
  //   KoiDialog.confirm({ title, message, danger, confirmText, details })
  //   KoiDialog.prompt('Nama draft', 'isi awal')                      -> Promise<string|null>
  //   KoiDialog.alert('Pesan')                                        -> Promise<void> (window.alert uses it, without blocking)
  var koiDialogChain = Promise.resolve()
  function dialogEscapeHtml(text) {
    return String(text === null || text === undefined ? '' : text).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    })
  }
  var DIALOG_UNITS = 'ikan|kolam|file|laporan|breeding|foto|media|entri|item|barang|invoice|log|draft|koleksi|baris|riwayat|catatan|data|postingan|pesan|akun'
  var DIALOG_COUNT = new RegExp('(\\d[\\d.,]*)\\s+(' + DIALOG_UNITS + ')\\b', 'i')
  // escapes the text, turns "27 ikan" into a highlighted number and SEMUA / HAPUS / PERMANEN style words into red bold ones
  function dialogRichText(text) {
    var html = dialogEscapeHtml(text)
    html = html.replace(new RegExp('(\\d[\\d.,]*\\s+(?:' + DIALOG_UNITS + ')\\b)', 'gi'), '<strong class="koi-dialog-num">$1</strong>')
    html = html.replace(/\b(HAPUS|GANTI|PERMANEN|SEMUA|TIDAK|DIHAPUS|DIGANTI|TERHAPUS)\b/g, '<strong class="koi-dialog-warn">$1</strong>')
    return html.replace(/\n/g, '<br>')
  }
  function dialogNormalize(input, kind) {
    var options = typeof input === 'object' && input !== null ? Object.assign({}, input) : { message: String(input === null || input === undefined ? '' : input) }
    var message = String(options.message || '')
    var lines = message.split('\n')
    if (options.title === undefined) {
      var first = lines[0].trim()
      if (kind !== 'alert' && first && first.length <= 90) {
        options.title = first
        message = lines.slice(1).join('\n').replace(/^\n+/, '')
      } else {
        var risky = /(^|[^A-Za-z])(HAPUS|PERMANEN|SEMUA|TIDAK BISA DIKEMBALIKAN)($|[^A-Za-z])/.test(message)
        options.title = kind === 'alert' ? 'Perhatian' : kind === 'prompt' ? (/ketik\s/i.test(message) ? 'Ketik untuk konfirmasi' : 'Isi data') : risky ? 'Yakin melanjutkan?' : 'Konfirmasi'
      }
    }
    options.message = message
    if (options.danger === undefined) options.danger = /^(hapus|ganti|restore|kosongkan|buang|arsipkan|reset|batalkan)\b/i.test(String(options.title)) || /\b(PERMANEN|HAPUS|DIHAPUS|TIDAK BISA DIKEMBALIKAN)\b/.test(message + ' ' + options.title)
    if (!options.confirmText) {
      var verb = String(options.title).match(/^(hapus|arsipkan|ubah|ganti|tandai|restore|buat ulang|buang|batalkan|keluarkan)/i)
      options.confirmText = kind === 'alert' ? 'OK' : verb ? 'Ya, ' + verb[1].toLowerCase() : 'Ya, lanjutkan'
    }
    if (!options.cancelText) options.cancelText = 'Batal'
    if (options.count === undefined) {
      var found = (String(options.title) + ' ' + message).match(DIALOG_COUNT)
      if (found) { options.count = found[1]; options.unit = found[2] }
    }
    return options
  }
  function dialogShow(options, kind, defaultValue) {
    return new Promise(function (resolve) {
      var overlay = document.createElement('div')
      overlay.setAttribute('data-koi-dialog', '')
      overlay.setAttribute('role', kind === 'alert' ? 'alertdialog' : 'dialog')
      overlay.setAttribute('aria-modal', 'true')
      overlay.setAttribute('aria-label', String(options.title))
      overlay.style.cssText = 'position:fixed;inset:0;z-index:6000;display:flex;align-items:center;justify-content:center;padding:12px;background:rgba(8,12,20,.55)'
      var accent = options.danger ? 'var(--tblr-danger,#d63939)' : kind === 'alert' ? 'var(--tblr-warning,#f59f00)' : 'var(--tblr-primary,#066fd1)'
      var icon = options.danger || kind === 'alert'
        ? '<path d="M12 9v4"/><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z"/><path d="M12 16h.01"/>'
        : '<path d="M12 9h.01"/><path d="M11 12h1v4h1"/><path d="M12 3c7.2 0 9 1.8 9 9s-1.8 9 -9 9s-9 -1.8 -9 -9s1.8 -9 9 -9z"/>'
      var expectMatch = kind === 'prompt' ? String(options.message + ' ' + options.title).match(/ketik\s+["“]?([A-Za-z0-9]+)/i) : null
      var expected = expectMatch ? expectMatch[1] : ''
      // plain and small, in the colors of the theme: a title, the text, and two ordinary buttons (the count of what changes is in the text itself)
      var detailsHtml = options.details
        ? '<div style="margin-top:8px;padding:6px 8px;border-radius:6px;background:var(--tblr-bg-surface-secondary,rgba(128,150,172,.12));font-size:.8rem;overflow-wrap:anywhere">' + dialogRichText(options.details) + '</div>'
        : ''
      var inputHtml = kind === 'prompt'
        ? '<input type="text" data-dialog-input data-no-clear autocomplete="off" class="form-control mt-3" style="text-align:left" placeholder="' + dialogEscapeHtml(options.placeholder || (expected ? 'Ketik ' + expected : '')) + '">'
        : ''
      var iconCircle = '<span style="display:inline-flex;width:40px;height:40px;border-radius:50%;align-items:center;justify-content:center;background:color-mix(in srgb,' + accent + ' 14%,transparent);color:' + accent + '">' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + icon + '</svg></span>'
      // centered, like a small card: icon, title, text, and two buttons of equal width (the cancel button is the plain one)
      overlay.innerHTML =
        '<div style="width:min(92vw,22.5rem);max-height:90vh;overflow:auto;text-align:center;border-radius:var(--tblr-border-radius-lg,10px);background:var(--tblr-bg-surface,#1b2330);color:var(--tblr-body-color,#e6e8eb);border:1px solid var(--tblr-border-color,rgba(128,150,172,.3));box-shadow:0 8px 28px rgba(0,0,0,.35)">' +
        '<div style="padding:18px 20px 6px">' +
        iconCircle +
        '<div style="margin-top:10px;font-size:1rem;font-weight:600;line-height:1.35;overflow-wrap:anywhere">' + dialogRichText(options.title) + '</div>' +
        (options.message ? '<div style="margin-top:6px;font-size:.85rem;line-height:1.45;color:var(--tblr-secondary,inherit);overflow-wrap:anywhere">' + dialogRichText(options.message) + '</div>' : '') +
        detailsHtml + inputHtml +
        '</div>' +
        '<div style="display:flex;gap:10px;padding:14px 20px 18px">' +
        (kind === 'alert' ? '' : '<button type="button" data-dialog-cancel class="btn btn-sm" style="flex:1 1 0">' + dialogEscapeHtml(options.cancelText) + '</button>') +
        '<button type="button" data-dialog-ok class="btn btn-sm ' + (options.danger ? 'btn-danger' : 'btn-primary') + '" style="flex:1 1 0">' + dialogEscapeHtml(options.confirmText) + '</button>' +
        '</div></div>'
      var okButton = overlay.querySelector('[data-dialog-ok]')
      var cancelButton = overlay.querySelector('[data-dialog-cancel]')
      var field = overlay.querySelector('[data-dialog-input]')
      var previousFocus = document.activeElement
      var finished = false
      // A Bootstrap modal that is open (the Edit Ikan form, for one) pulls the focus back into itself whenever it goes to an element
      // outside the modal, and this dialog sits outside it: the field could not be typed in. The focus that moves inside the dialog is
      // kept from reaching the modal.
      function keepFocus(event) { if (overlay.contains(event.target)) event.stopPropagation() }
      function finish(value) {
        if (finished) return
        finished = true
        document.removeEventListener('keydown', onKey, true)
        document.removeEventListener('focusin', keepFocus, true)
        overlay.remove()
        if (previousFocus && previousFocus.focus) { try { previousFocus.focus() } catch (error) { /* the element is gone */ } }
        resolve(value)
      }
      function accept() {
        if (kind === 'prompt') finish(field.value)
        else if (kind === 'alert') finish(undefined)
        else finish(true)
      }
      function reject() { finish(kind === 'prompt' ? null : kind === 'alert' ? undefined : false) }
      function typedOk() { return !expected || !field || String(field.value).trim().toUpperCase() === expected.toUpperCase() }
      function onKey(event) {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); reject(); return }
        if (event.key === 'Enter' && field && document.activeElement === field) { event.preventDefault(); if (typedOk()) accept(); return }
        if (event.key === 'Tab') {
          var focusable = Array.prototype.slice.call(overlay.querySelectorAll('input, button')).filter(function (el) { return !el.disabled })
          if (!focusable.length) return
          var index = focusable.indexOf(document.activeElement)
          event.preventDefault()
          focusable[(index + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length].focus()
        }
      }
      okButton.addEventListener('click', function () { if (typedOk()) accept() })
      if (cancelButton) cancelButton.addEventListener('click', reject)
      overlay.addEventListener('mousedown', function (event) { if (event.target === overlay && kind !== 'alert') reject() })
      if (field) {
        field.value = defaultValue === undefined || defaultValue === null ? '' : String(defaultValue)
        // options.numeric: 'integer' or 'decimal' lets only digits (and one comma or period) be typed, and shows the number keypad on a phone
        if (options.numeric) {
          var integerOnly = options.numeric === 'integer'
          field.inputMode = integerOnly ? 'numeric' : 'decimal'
          field.addEventListener('input', function () {
            var cleaned = field.value.replace(integerOnly ? /[^0-9]/g : /[^0-9.,]/g, '')
            if (!integerOnly) {
              var first = cleaned.search(/[.,]/)
              if (first >= 0) cleaned = cleaned.slice(0, first + 1) + cleaned.slice(first + 1).replace(/[.,]/g, '').slice(0, 1)   // one decimal digit at most
            }
            if (cleaned !== field.value) field.value = cleaned
          })
        }
        var sync = function () { okButton.disabled = !typedOk() }
        field.addEventListener('input', sync)
        sync()
      }
      document.addEventListener('keydown', onKey, true)
      document.addEventListener('focusin', keepFocus, true)
      document.body.appendChild(overlay)
      // a risky action starts on Batal so a stray Enter or tap cannot confirm it
      var start = field || (options.danger && cancelButton ? cancelButton : okButton)
      start.focus()
      if (field) field.select()
    })
  }
  function dialogQueue(options, kind, defaultValue) {
    var run = koiDialogChain.then(function () { return dialogShow(options, kind, defaultValue) })
    koiDialogChain = run.catch(function () {})
    return run
  }
  var koiDialogStyle = document.createElement('style')
  koiDialogStyle.textContent = '.koi-dialog-num{color:var(--tblr-primary,#4299e1);font-weight:700}.koi-dialog-warn{color:var(--tblr-danger,#e55353);font-weight:700}'
  document.head.appendChild(koiDialogStyle)
  window.KoiDialog = {
    confirm: function (input, extra) { return dialogQueue(dialogNormalize(Object.assign({}, typeof input === 'object' && input !== null ? input : { message: input }, extra || {}), 'confirm'), 'confirm') },
    prompt: function (input, defaultValue, extra) { return dialogQueue(dialogNormalize(Object.assign({}, typeof input === 'object' && input !== null ? input : { message: input }, extra || {}), 'prompt'), 'prompt', defaultValue) },
    alert: function (input, extra) { return dialogQueue(dialogNormalize(Object.assign({}, typeof input === 'object' && input !== null ? input : { message: input }, extra || {}), 'alert'), 'alert') },
  }
  // alert() everywhere in the program: same look, and it does not freeze the page (nothing waits for it)
  window.alert = function (message) { window.KoiDialog.alert(message === undefined ? '' : message) }

  var koiSelectStates = new WeakMap()
  var koiSelectObserver = null
  var activeKoiSelect = null

  function installKoiSelectStyles() {
    if (document.getElementById('koi-native-select-style')) return
    var style = document.createElement('style')
    style.id = 'koi-native-select-style'
    style.textContent = [
      '.koi-native-select{position:relative;min-width:0;width:100%}',
      '.koi-native-select .koi-native-select-source{position:absolute!important;inset:0!important;width:1px!important;height:1px!important;min-height:0!important;opacity:0!important;pointer-events:none!important}',
      '.koi-native-select-button{position:relative;display:flex;align-items:center;justify-content:space-between;gap:.75rem;width:100%;min-height:40px;padding:.5625rem 2.25rem .5625rem .75rem;border:1px solid var(--tblr-border-color,#2f3b4f);border-radius:var(--tblr-border-radius,.375rem);background:var(--tblr-bg-forms,#111827);color:var(--tblr-body-color,#e5e7eb);font:inherit;line-height:1.45;text-align:left;box-shadow:none;appearance:none;cursor:pointer}',
      '.koi-native-select-button:after{content:"";position:absolute;right:.85rem;width:.52rem;height:.52rem;border-right:1.7px solid currentColor;border-bottom:1.7px solid currentColor;transform:rotate(45deg) translateY(-2px);opacity:.72}',
      '.koi-native-select-button:focus,.koi-native-select.is-open .koi-native-select-button{border-color:#1688ff;box-shadow:0 0 0 .2rem rgba(22,136,255,.18);outline:0}',
      '.koi-native-select-button:disabled{cursor:not-allowed;opacity:.65}',
      '.koi-native-select-value{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.koi-native-select-menu{position:fixed;z-index:3000;display:none;max-height:min(360px,52vh);overflow:auto;padding:.35rem;background:var(--tblr-bg-surface,#151a1d);color:var(--tblr-body-color,#f4f7fb);border:1px solid var(--tblr-border-color,#2e3a4d);border-radius:var(--tblr-border-radius,.25rem);box-shadow:var(--tblr-shadow-dropdown,0 18px 45px rgba(0,0,0,.42))}',
      '.koi-native-select-menu.is-open{display:block}',
      '.koi-native-select.is-icon{width:auto;flex:0 0 auto}',
      '.koi-native-select-button.is-icon{width:40px;min-width:40px;height:40px;min-height:40px;padding:0;justify-content:center}',
      '.koi-native-select-button.is-icon:after{display:none}',
      '.koi-native-select-button.is-icon .koi-native-select-value{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}',
      '.koi-native-select-button.is-icon .koi-select-button-icon{display:inline-flex;width:20px;height:20px}',
      '.koi-native-select-button.is-icon .koi-select-button-icon svg{width:20px;height:20px}',
      '.koi-native-select-button.is-icon.is-active{border-color:var(--tblr-primary);color:var(--tblr-primary);box-shadow:inset 0 0 0 1px var(--tblr-primary)}',
      '.koi-native-select-button.is-icon.has-text{width:auto;min-width:40px;padding:0 .8rem}',
      '.koi-native-select-button.is-icon .koi-select-button-text{font-weight:600;font-size:.875rem;line-height:1;white-space:nowrap}',
      '.koi-native-select-search{width:100%;margin:0 0 .35rem;padding:.5rem .6rem;border:1px solid var(--tblr-border-color,#324055);border-radius:var(--tblr-border-radius,.25rem);background:var(--tblr-bg-forms,#0f1724);color:var(--tblr-body-color,#f8fafc);font:inherit;outline:0}',
      '.koi-native-select-search-wrap{position:relative;margin:0 0 .35rem}.koi-native-select-search-wrap .koi-native-select-search{margin:0;padding-right:2.1rem}' +
      '.koi-native-select-search-clear{position:absolute;top:50%;right:.35rem;transform:translateY(-50%);display:flex;align-items:center;justify-content:center;width:1.5rem;height:1.5rem;padding:0;border:0;border-radius:50%;background:transparent;color:var(--tblr-secondary,#94a3b8);cursor:pointer}.koi-native-select-search-clear:hover{background:rgba(148,163,184,.2);color:var(--tblr-body-color,#f8fafc)}.koi-native-select-search-clear[hidden]{display:none}' +
      '.koi-native-select-search::-webkit-search-cancel-button{display:none}' +
      '.koi-native-select-search:focus{border-color:#1688ff;box-shadow:0 0 0 .15rem rgba(22,136,255,.18)}',
      '.koi-native-select-option{display:flex;align-items:center;width:100%;min-height:34px;padding:.45rem .5rem;border:0;border-radius:.2rem;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}',
      '.koi-native-select-option:hover,.koi-native-select-option.is-active{background:rgba(var(--tblr-primary-rgb,22,136,255),.1)}',
      '.koi-native-select-option.is-selected{color:var(--tblr-primary-fg,#ffffff);background:var(--tblr-primary,#0f74d1)}',
      '.koi-native-select-option:disabled{cursor:not-allowed;opacity:.48;background:transparent}',
      '.koi-native-select-option.has-thumb{gap:.65rem;min-height:68px;padding:.35rem .5rem}',
      '.koi-select-thumb{flex:0 0 40px;width:40px;height:60px;object-fit:contain;border:1px solid var(--tblr-border-color,#324055);border-radius:6px;background:var(--tblr-bg-surface-secondary,#1b2432);display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--tblr-secondary,#9aa5b5)}',
      '.koi-select-copy{display:flex;flex-direction:column;min-width:0}',
      '.koi-select-label{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.koi-select-detail{font-size:.8rem;opacity:.75;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.koi-native-select-empty{padding:.6rem .5rem;color:var(--tblr-secondary,#9ca3af);font-size:.875rem}',
      '@media print{.koi-native-select-button{display:none!important}.koi-native-select .koi-native-select-source{position:static!important;width:100%!important;height:auto!important;opacity:1!important}}',
    ].join('')
    document.head.appendChild(style)
  }

  function closeKoiSelect(except) {
    if (!activeKoiSelect || activeKoiSelect === except) return
    activeKoiSelect.wrapper.classList.remove('is-open')
    activeKoiSelect.button.setAttribute('aria-expanded', 'false')
    activeKoiSelect.menu.classList.remove('is-open')
    activeKoiSelect = null
  }

  function positionKoiSelectMenu(state) {
    // Inside a modal (backdrop-filter) the menu's "fixed" box is anchored to the modal, which scrolls with the
    // form on a phone. Measure where its top-left corner really is and subtract it, so the list opens under the field.
    state.menu.style.left = '0px'
    state.menu.style.top = '0px'
    var origin = state.menu.getBoundingClientRect()
    var rect = state.button.getBoundingClientRect()
    var viewportGap = 8
    var width = Math.max(rect.width, 220)
    var left = Math.min(Math.max(viewportGap, rect.left), window.innerWidth - width - viewportGap)
    var top = rect.bottom + 4
    var roomBelow = window.innerHeight - rect.bottom - viewportGap
    var roomAbove = rect.top - viewportGap
    if (roomBelow < 180 && roomAbove > roomBelow) {
      state.menu.style.maxHeight = Math.min(360, roomAbove - 4) + 'px'
      top = Math.max(viewportGap, rect.top - state.menu.offsetHeight - 4)
    } else {
      state.menu.style.maxHeight = Math.min(360, roomBelow - 4) + 'px'
    }
    state.menu.style.left = (left - origin.left) + 'px'
    state.menu.style.top = (top - origin.top) + 'px'
    state.menu.style.width = width + 'px'
  }

  function syncKoiSelect(select) {
    var state = koiSelectStates.get(select)
    if (!state) return
    if (select.multiple) {
      var chosen = Array.prototype.filter.call(select.options, function (option) { return option.selected && option.value !== '' })
      if (chosen.length) {
        state.value.textContent = chosen.map(function (option) { return option.textContent.trim() }).join(', ')
      } else {
        var allOption = select.querySelector('option[value=""]')
        state.value.textContent = allOption ? allOption.textContent.trim() : ''
      }
    } else {
      var selected = select.options[select.selectedIndex]
      state.value.textContent = selected ? selected.textContent.trim() : ''
    }
    if (state.button.classList.contains('is-icon')) {
      var picked = Array.prototype.filter.call(select.options, function (option) { return option.selected && option.value !== '' })
      var caption = select.getAttribute('data-select-title') || ''
      state.button.classList.toggle('is-active', picked.length > 0)
      var shown = picked.length ? picked.map(function (option) { return option.textContent.trim() }).join(', ') : 'Semua'
      state.button.setAttribute('title', caption + ': ' + shown)
      state.button.setAttribute('aria-label', caption + ': ' + shown)
      // a word button (data-select-text) shows the number chosen: "Status (2)", since a tooltip does not show on a phone
      var wordBox = state.button.querySelector('.koi-select-button-text')
      if (wordBox) {
        var wordLabel = select.getAttribute('data-select-text') || caption
        if (picked.length) wordLabel += ' (' + picked.length + ')'
        wordBox.textContent = wordLabel
      }
    }
    state.button.disabled = select.disabled
    Array.prototype.forEach.call(state.menu.querySelectorAll('[data-koi-select-value]'), function (optionButton) {
      if (select.multiple) {
        var matching = Array.prototype.find.call(select.options, function (option) { return option.value === optionButton.dataset.koiSelectValue })
        optionButton.classList.toggle('is-selected', Boolean(matching && matching.selected && matching.value !== ''))
      } else {
        optionButton.classList.toggle('is-selected', optionButton.dataset.koiSelectValue === select.value)
      }
    })
  }

  function renderKoiSelectOptions(select) {
    var state = koiSelectStates.get(select)
    if (!state) return
    var query = state.search ? state.search.value.trim().toLowerCase() : ''
    var keepSearchFocus = state.search && document.activeElement === state.search
    var searchStart = keepSearchFocus ? state.search.selectionStart : null
    var searchEnd = keepSearchFocus ? state.search.selectionEnd : null
    var options = Array.prototype.slice.call(select.options)
    // a multiple-choice list shows "Semua" first, then everything already chosen, then the rest (so picks stay on top, in the field too)
    if (select.multiple) {
      var rank = function (option) { return option.value === '' ? 0 : option.selected ? 1 : 2 }
      options = options.map(function (option, index) { return { option: option, index: index } })
        .sort(function (a, b) { return rank(a.option) - rank(b.option) || a.index - b.index })
        .map(function (item) { return item.option })
    }
    var visibleCount = 0
    var fragment = document.createDocumentFragment()
    if (options.length > 7) {
      if (!state.search) {
        state.search = document.createElement('input')
        state.search.className = 'koi-native-select-search'
        state.search.type = 'search'
        state.search.placeholder = 'Cari...'
        state.search.addEventListener('input', function () { renderKoiSelectOptions(select) })
        state.search.addEventListener('keydown', function (event) {
          if (event.key === 'Escape') closeKoiSelect()
        })
        // the clear button (x) of the search, like the other fields
        state.searchWrap = document.createElement('div')
        state.searchWrap.className = 'koi-native-select-search-wrap'
        state.searchClear = document.createElement('button')
        state.searchClear.type = 'button'
        state.searchClear.className = 'koi-native-select-search-clear'
        state.searchClear.tabIndex = -1
        state.searchClear.setAttribute('title', 'Kosongkan isian')
        state.searchClear.setAttribute('aria-label', 'Kosongkan isian')
        state.searchClear.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></svg>'
        state.searchClear.addEventListener('mousedown', function (event) { event.preventDefault() })
        state.searchClear.addEventListener('click', function () {
          state.search.value = ''
          renderKoiSelectOptions(select)
          state.search.focus({ preventScroll: true })
        })
        state.searchWrap.appendChild(state.search)
        state.searchWrap.appendChild(state.searchClear)
      }
      state.searchClear.hidden = !state.search.value
      fragment.appendChild(state.searchWrap)
    }
    // typing in the search of a multiple-choice list turns the "Semua" row into "Pilih semua <what was typed> (n)": one press picks
    // every match (and a second press, when all are picked, lets them go again)
    if (select.multiple && query) {
      var matching = options.filter(function (option) {
        return option.value !== '' && !option.disabled &&
          (option.textContent.trim().toLowerCase().indexOf(query) !== -1 || String(option.value).toLowerCase().indexOf(query) !== -1)
      })
      if (matching.length) {
        var everyChosen = matching.every(function (option) { return option.selected })
        var pickAll = document.createElement('button')
        pickAll.type = 'button'
        pickAll.className = 'koi-native-select-option is-select-all'
        pickAll.style.fontWeight = '600'
        pickAll.textContent = (everyChosen ? 'Batalkan semua "' : 'Pilih semua "') + state.search.value.trim() + '" (' + matching.length + ')'
        pickAll.addEventListener('click', function () {
          matching.forEach(function (option) { option.selected = !everyChosen })
          var allOption = select.querySelector('option[value=""]')
          if (allOption && !everyChosen) allOption.selected = false
          select.dispatchEvent(new Event('change', { bubbles: true }))
          renderKoiSelectOptions(select)
        })
        fragment.appendChild(pickAll)
      }
    }
    options.forEach(function (option) {
      var label = option.textContent.trim()
      if (query && label.toLowerCase().indexOf(query) === -1 && String(option.value).toLowerCase().indexOf(query) === -1) return
      visibleCount += 1
      var button = document.createElement('button')
      button.type = 'button'
      button.className = 'koi-native-select-option'
      button.dataset.koiSelectValue = option.value
      if (option.dataset.image !== undefined || option.dataset.detail !== undefined) {
        // rich option: photo (2:3) + name + detail, used by the Parent Male list
        button.classList.add('has-thumb')
        var thumb = document.createElement(option.dataset.image ? 'img' : 'span')
        thumb.className = 'koi-select-thumb'
        if (option.dataset.image) { thumb.src = option.dataset.image; thumb.alt = ''; thumb.loading = 'lazy' }
        else thumb.textContent = label.charAt(0).toUpperCase()
        var copy = document.createElement('span')
        copy.className = 'koi-select-copy'
        var main = document.createElement('span')
        main.className = 'koi-select-label'
        main.textContent = label
        copy.appendChild(main)
        if (option.dataset.detail) {
          var sub = document.createElement('span')
          sub.className = 'koi-select-detail'
          sub.textContent = option.dataset.detail
          copy.appendChild(sub)
        }
        button.appendChild(thumb)
        button.appendChild(copy)
      } else {
        button.textContent = label
      }
      button.disabled = option.disabled
      button.addEventListener('click', function () {
        if (select.multiple) {
          if (option.value === '') {
            Array.prototype.forEach.call(select.options, function (opt) { opt.selected = false })
          } else {
            option.selected = !option.selected
            var allOption = select.querySelector('option[value=""]')
            if (allOption) allOption.selected = false
          }
          select.dispatchEvent(new Event('change', { bubbles: true }))
          if (select.hasAttribute('data-select-close')) {
            // still a multiple choice (open it again for the next one), but the list closes after every press
            syncKoiSelect(select)
            closeKoiSelect()
            state.button.focus()
          } else {
            renderKoiSelectOptions(select)
          }
        } else {
          select.value = option.value
          select.dispatchEvent(new Event('change', { bubbles: true }))
          syncKoiSelect(select)
          closeKoiSelect()
          state.button.focus()
        }
      })
      fragment.appendChild(button)
    })
    if (!visibleCount) {
      var empty = document.createElement('div')
      empty.className = 'koi-native-select-empty'
      empty.textContent = 'Tidak ada data'
      fragment.appendChild(empty)
    }
    state.menu.replaceChildren(fragment)
    if (keepSearchFocus && state.search && state.menu.contains(state.search)) {
      state.search.focus({ preventScroll: true })
      if (searchStart !== null && searchEnd !== null) {
        state.search.setSelectionRange(searchStart, searchEnd)
      }
    }
    syncKoiSelect(select)
  }

  function enhanceKoiSelect(select) {
    if (!select || select.tagName !== 'SELECT' || select.hasAttribute('data-native-select') || koiSelectStates.has(select) || select.closest('.koi-native-select')) return
    installKoiSelectStyles()
    var wrapper = document.createElement('div')
    wrapper.className = 'koi-native-select'
    var button = document.createElement('button')
    button.type = 'button'
    button.className = 'koi-native-select-button'
    button.setAttribute('aria-haspopup', 'listbox')
    button.setAttribute('aria-expanded', 'false')
    var value = document.createElement('span')
    value.className = 'koi-native-select-value'
    // data-select-icon="activity": the closed select is a small square icon button (the list still opens as usual)
    // data-select-text="Status": the same small button, but it shows that word instead of an icon (clearer in the field)
    var iconName = select.getAttribute('data-select-icon')
    var buttonText = select.getAttribute('data-select-text')
    if (buttonText) {
      button.classList.add('is-icon', 'has-text')
      wrapper.classList.add('is-icon')
      var textBox = document.createElement('span')
      textBox.className = 'koi-select-button-text'
      textBox.textContent = buttonText
      button.appendChild(textBox)
    } else if (iconName) {
      var iconPaths = { activity: '<path d="M3 12h4l3 8l4 -16l3 8h4"/>' }
      button.classList.add('is-icon')
      wrapper.classList.add('is-icon')
      var iconBox = document.createElement('span')
      iconBox.className = 'koi-select-button-icon'
      iconBox.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (iconPaths[iconName] || '') + '</svg>'
      button.appendChild(iconBox)
    }
    button.appendChild(value)
    var menu = document.createElement('div')
    menu.className = 'koi-native-select-menu'
    menu.setAttribute('role', 'listbox')
    select.parentNode.insertBefore(wrapper, select)
    wrapper.appendChild(select)
    wrapper.appendChild(button)
    // Inside a modal the menu must live in the modal: Bootstrap's focus trap pulls focus back from
    // anything outside it, which made the search box in the list unusable.
    ;(select.closest('.modal') || document.body).appendChild(menu)
    select.classList.add('koi-native-select-source')
    var state = { wrapper: wrapper, button: button, value: value, menu: menu, search: null }
    koiSelectStates.set(select, state)
    button.addEventListener('click', function () {
      if (select.disabled) return
      if (activeKoiSelect === state) {
        closeKoiSelect()
        return
      }
      closeKoiSelect(state)
      activeKoiSelect = state
      wrapper.classList.add('is-open')
      button.setAttribute('aria-expanded', 'true')
      if (state.search) state.search.value = ''
      renderKoiSelectOptions(select)
      menu.classList.add('is-open')
      positionKoiSelectMenu(state)
      if (state.search) {
        window.setTimeout(function () { state.search.focus() }, 0)
      }
    })
    button.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
        event.preventDefault()
        button.click()
      } else if (event.key === 'Escape') {
        closeKoiSelect()
      }
    })
    select.addEventListener('change', function () { syncKoiSelect(select) })
    // Code such as bulk actions sets select.value / selectedIndex directly, which fires no event.
    ;['value', 'selectedIndex'].forEach(function (property) {
      var descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, property)
      if (!descriptor || !descriptor.set) return
      Object.defineProperty(select, property, {
        configurable: true,
        get: function () { return descriptor.get.call(select) },
        set: function (next) {
          descriptor.set.call(select, next)
          syncKoiSelect(select)
        }
      })
    })
    if (select.form) select.form.addEventListener('reset', function () { window.setTimeout(function () { syncKoiSelect(select) }, 0) })
    new MutationObserver(function () { renderKoiSelectOptions(select) }).observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'selected', 'label', 'value'] })
    renderKoiSelectOptions(select)
  }

  function enhanceKoiSelects(root) {
    if (!root || !root.querySelectorAll) return
    root.querySelectorAll('select.form-select').forEach(enhanceKoiSelect)
  }

  function installKoiSelectEnhancer() {
    enhanceKoiSelects(document)
    if (!koiSelectObserver) {
      koiSelectObserver = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
          mutation.addedNodes.forEach(function (node) {
            if (node.nodeType !== 1) return
            if (node.matches && node.matches('select.form-select')) enhanceKoiSelect(node)
            enhanceKoiSelects(node)
          })
        })
      })
      koiSelectObserver.observe(document.body, { childList: true, subtree: true })
    }
  }

  function registerRealtimeRefresh(refresh, options) {
    options = options || {}
    var intervalMs = Math.max(Number(options.intervalMs) || 25000, 10000)
    var initialDelayMs = Number(options.initialDelayMs)
    var timer = null
    var running = false
    var stopped = false

    function isUserEditing() {
      var active = document.activeElement
      var editingField = active && active.matches && active.matches('input, textarea, select, [contenteditable="true"]')
      return Boolean(editingField || document.querySelector('.modal.show, .modal[style*="display: block"]'))
    }

    function schedule(delay) {
      if (stopped) return
      window.clearTimeout(timer)
      timer = window.setTimeout(tick, Math.max(delay || intervalMs, 1000))
    }

    function tick() {
      if (stopped) return
      if (document.hidden || isUserEditing()) {
        schedule(intervalMs)
        return
      }
      if (running) {
        schedule(intervalMs)
        return
      }
      running = true
      Promise.resolve()
        .then(refresh)
        .catch(function () {})
        .finally(function () {
          running = false
          schedule(intervalMs)
        })
    }

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && !isUserEditing()) {
        schedule(700)
      }
    })
    window.addEventListener('focus', function () {
      if (!document.hidden && !isUserEditing()) {
        schedule(700)
      }
    })

    schedule(Number.isFinite(initialDelayMs) ? initialDelayMs : 5000 + Math.floor(Math.random() * 3000))
    return function () {
      stopped = true
      window.clearTimeout(timer)
    }
  }

  document.addEventListener('click', function (event) {
    if (!activeKoiSelect) return
    if (activeKoiSelect.wrapper.contains(event.target) || activeKoiSelect.menu.contains(event.target)) return
    closeKoiSelect()
  }, true)
  window.addEventListener('resize', function () { if (activeKoiSelect) positionKoiSelectMenu(activeKoiSelect) })
  window.addEventListener('scroll', function () { if (activeKoiSelect) positionKoiSelectMenu(activeKoiSelect) }, true)

  // Buttons of the zoom / photo-grid previews: the same look as the program's own icon buttons (square, rounded, themed).
  var zoomIcons = {
    close: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></svg>',
    prev: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6l6 6" /></svg>',
    next: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6l-6 6" /></svg>',
  }
  function ensureZoomStyles() {
    if (document.getElementById('koi-zoom-style')) return
    var style = document.createElement('style')
    style.id = 'koi-zoom-style'
    style.textContent = '.koi-zoom-btn{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;padding:0;border:1px solid var(--tblr-border-color,rgba(128,150,172,.35));border-radius:var(--tblr-border-radius,8px);background:var(--tblr-bg-surface,#1b2330);color:var(--tblr-body-color,#e6e8eb);line-height:1;cursor:pointer;transition:background .15s,border-color .15s,color .15s;user-select:none}' +
      '.koi-zoom-btn:hover,.koi-zoom-btn:focus-visible{background:var(--tblr-bg-surface-secondary,#222b3a);border-color:var(--tblr-primary,#066fd1);outline:0}' +
      '.koi-zoom-btn svg{width:20px;height:20px}' +
      '.koi-zoom-close{position:absolute;top:12px;right:14px;z-index:2}' +
      '.koi-zoom-arrow{position:absolute;top:calc(50% - 20px);z-index:2}' +
      '.koi-zoom-copy{width:auto;height:auto;margin-top:6px;padding:3px 16px;font-size:.78rem}'
    document.head.appendChild(style)
  }

  // Caption of a fish photo, the same everywhere: "code - variety - size - gender", then pond / name / bloodline, then the rest.
  function koiZoomInfo(koi) {
    koi = koi || {}
    var genders = { male: 'Male', female: 'Female', unknown: 'Unknown' }
    var filled = function (value) { return value !== null && value !== undefined && String(value).trim() !== '' }
    var size = filled(koi.current_length_cm) && Number(koi.current_length_cm) > 0
      ? Number(koi.current_length_cm).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' cm' : ''
    var title = [koi.code, koi.variety, size, koi.gender && koi.gender !== 'unknown' ? (genders[koi.gender] || koi.gender) : ''].filter(filled).join(' - ')
    var where = koi.pond_name || koi.pond || koi.location_name || koi.location || koi.pond_location
    var lines = [[where, koi.name, koi.bloodline].filter(filled).join(' - ')]
    return { title: title, lines: lines.filter(filled) }
  }
  function zoomKoi(src, koi, extraLines, fallbackTitle) {
    var info = koiZoomInfo(koi)
    zoomPhoto(src, info.title || fallbackTitle || '', info.lines.concat(extraLines || []))
  }
  // Same, for a photo that only knows the fish code: the fish is looked up first, the preview opens with whatever was found.
  function zoomKoiByCode(src, code, extraLines) {
    var fallback = function (koi) { zoomKoi(src, koi || { code: code }, extraLines, code) }
    if (!code || !window.KoiPicker || !window.KoiPicker.byCodes) { fallback(null); return }
    window.KoiPicker.byCodes([code], { scope: 'all' }).then(function (found) { fallback(found && found[0]) }, function () { fallback(null) })
  }

  // One photo/video preview for every menu: the picture with its caption underneath (title in bold, detail lines below),
  // the same layout everywhere. The caption text can be selected and copied ("Salin" copies all of it), so a click on the
  // picture or the text does not close the preview; it closes with the X button, Esc, or a click on the dark background.
  //   zoomPhoto(src, title, details)   details: a string, or a list of strings / [label, value] pairs (shown on one line, separated by " - ")
  function zoomPhoto(src, label, details, nav) {
    if (!src) return
    var old = document.querySelector('[data-koi-zoom-overlay]')
    if (old) {
      if (old._koiKey) document.removeEventListener('keydown', old._koiKey, true)
      old.remove()
    }
    ensureZoomStyles()
    var isVideo = /\.(mp4|webm)(?:[?#]|$)/i.test(String(src))
    // a detail written as { block: 'long text', title: 'Catatan' } is shown as its own multi-line block under the caption
    var zoomBlocks = []
    var plainDetails = (Array.isArray(details) ? details : (details ? [details] : [])).filter(function (line) {
      if (line && typeof line === 'object' && !Array.isArray(line) && line.block !== undefined) {
        if (String(line.block).trim()) zoomBlocks.push({ title: line.title || '', text: String(line.block).trim() })
        return false
      }
      return true
    })
    var lines = plainDetails.map(function (line) {
      if (Array.isArray(line)) return line[1] === undefined || line[1] === null ? '' : String(line[1]).trim()
      return String(line == null ? '' : line)
    }).filter(function (line) { return String(line).trim() })
    var overlay = document.createElement('div')
    overlay.setAttribute('data-koi-zoom-overlay', '')
    overlay.setAttribute('role', 'dialog')
    overlay.setAttribute('aria-label', label || 'Preview')
    overlay.style.cssText = 'position:fixed;inset:0;z-index:5000;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:14px;background:rgba(0,0,0,.88)'
    var box = document.createElement('div')
    box.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:10px;width:min(96vw,980px);height:100%;min-height:0'
    var media = document.createElement(isVideo ? 'video' : 'img')
    media.src = src
    if (isVideo) {
      media.controls = true
      media.autoplay = true
    } else {
      media.alt = label || ''
    }
    media.style.cssText = 'flex:1 1 0;min-height:0;width:100%;object-fit:contain;border-radius:6px'
    box.appendChild(media)
    var koiZoomSub = lines.join(' - ')
    var text = [label, koiZoomSub].concat(zoomBlocks.map(function (block) { return (block.title ? block.title + ':\n' : '') + block.text })).filter(function (line) { return line && String(line).trim() }).join('\n')
    if (text) {
      var caption = document.createElement('div')
      caption.setAttribute('data-koi-zoom-caption', '')
      caption.style.cssText = 'flex:0 0 auto;width:100%;max-width:640px;padding:8px 14px;border-radius:8px;background:var(--tblr-bg-surface,#1b2330);border:1px solid var(--tblr-border-color,rgba(128,150,172,.25));color:var(--tblr-body-color,#e6e8eb);text-align:center;user-select:text;-webkit-user-select:text;cursor:text;overflow-wrap:anywhere'
      if (label) {
        var title = document.createElement('div')
        title.textContent = label
        title.style.cssText = 'font-weight:700;font-size:.95rem;line-height:1.3'
        caption.appendChild(title)
      }
      if (koiZoomSub) {
        var row = document.createElement('div')
        row.textContent = koiZoomSub
        row.style.cssText = 'font-size:.82rem;line-height:1.35;color:var(--tblr-secondary-color,rgba(150,160,175,1))'
        caption.appendChild(row)
      }
      zoomBlocks.forEach(function (block) {
        var wrap = document.createElement('div')
        wrap.style.cssText = 'margin-top:8px;padding-top:6px;border-top:1px solid var(--tblr-border-color,rgba(128,150,172,.25));text-align:left'
        if (block.title) {
          var blockTitle = document.createElement('div')
          blockTitle.textContent = block.title
          blockTitle.style.cssText = 'font-size:.75rem;font-weight:600;color:var(--tblr-secondary-color,rgb(150,160,175));margin-bottom:2px'
          wrap.appendChild(blockTitle)
        }
        var blockText = document.createElement('div')
        blockText.textContent = block.text
        blockText.style.cssText = 'font-size:.82rem;line-height:1.4;white-space:pre-wrap;max-height:28vh;overflow:auto'
        wrap.appendChild(blockText)
        caption.appendChild(wrap)
      })
      var copy = document.createElement('button')
      copy.type = 'button'
      copy.setAttribute('data-koi-zoom-copy', '')
      copy.textContent = 'Salin'
      copy.className = 'koi-zoom-btn koi-zoom-copy'
      copy.addEventListener('click', function (event) {
        event.stopPropagation()
        var done = function () { copy.textContent = 'Tersalin'; window.setTimeout(function () { copy.textContent = 'Salin' }, 1400) }
        var fallback = function () {
          var area = document.createElement('textarea')
          area.value = text
          area.style.cssText = 'position:fixed;left:-9999px;top:0'
          document.body.appendChild(area)
          area.select()
          try { document.execCommand('copy') } catch (error) {}
          area.remove()
          done()
        }
        if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback)
        else fallback()
      })
      caption.appendChild(copy)
      box.appendChild(caption)
    }
    overlay.appendChild(box)
    var closeButton = document.createElement('button')
    closeButton.type = 'button'
    closeButton.setAttribute('aria-label', 'Tutup preview')
    closeButton.innerHTML = zoomIcons.close
    closeButton.className = 'koi-zoom-btn koi-zoom-close'
    overlay.appendChild(closeButton)
    function onKey(event) {
      if (nav && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        event.stopPropagation()
        event.preventDefault()
        ;(event.key === 'ArrowLeft' ? nav.prev : nav.next)()
        return
      }
      if (event.key !== 'Escape') return
      event.stopPropagation()
      close()
    }
    function close() {
      overlay.remove()
      document.removeEventListener('keydown', onKey, true)
    }
    // a click on the picture or the dark background closes it; the caption (text to select and copy) and a video's controls do not
    overlay.addEventListener('click', function (event) {
      if (event.target.closest('[data-koi-zoom-caption]') || event.target.tagName === 'VIDEO') return
      close()
    })
    closeButton.addEventListener('click', function (event) { event.stopPropagation(); close() })
    // several photos (history progress): previous / next buttons and the arrow keys; a swipe on the picture works too
    if (nav) {
      ;[['prev', '‹', 'left:10px', 'Foto sebelumnya'], ['next', '›', 'right:10px', 'Foto berikutnya']].forEach(function (spec) {
        var arrow = document.createElement('button')
        arrow.type = 'button'
        arrow.setAttribute('aria-label', spec[3])
        arrow.innerHTML = zoomIcons[spec[0]]
        arrow.className = 'koi-zoom-btn koi-zoom-arrow'
        arrow.style[spec[2].split(':')[0]] = spec[2].split(':')[1]
        arrow.addEventListener('click', function (event) { event.stopPropagation(); nav[spec[0]]() })
        overlay.appendChild(arrow)
      })
      var startX = null
      media.addEventListener('touchstart', function (event) { startX = event.touches[0].clientX }, { passive: true })
      media.addEventListener('touchend', function (event) {
        if (startX === null) return
        var delta = event.changedTouches[0].clientX - startX
        startX = null
        if (Math.abs(delta) > 50) (delta > 0 ? nav.prev : nav.next)()
      })
    }
    overlay._koiKey = onKey
    document.addEventListener('keydown', onKey, true)
    document.body.appendChild(overlay)
  }

  // A list of photos in one preview: items = [{ src, title, lines }]; counter "2 / 5" is added to the caption line.
  function zoomSeries(items, start) {
    if (!items || !items.length) return
    var index = Math.max(0, Math.min(Number(start) || 0, items.length - 1))
    var show = function () {
      var item = items[index]
      var more = items.length > 1
      var lines = (item.lines || []).slice()
      if (more) lines.push((index + 1) + ' / ' + items.length)
      zoomPhoto(item.src, item.title, lines, more ? {
        prev: function () { index = (index - 1 + items.length) % items.length; show() },
        next: function () { index = (index + 1) % items.length; show() },
      } : null)
    }
    show()
  }


  // Every photo of a list at once (History Progress): fish caption on top, a grid of thumbnails with their label and date,
  // a click on one opens it in the zoom preview (which can step through the same list).
  //   photoGrid(items, title, lines)   items = [{ src, title, lines, label, sub }]
  function photoGrid(items, title, lines) {
    if (!items || !items.length) return
    ensureZoomStyles()
    var old = document.querySelector('[data-koi-grid-overlay]')
    if (old) old.remove()
    var overlay = document.createElement('div')
    overlay.setAttribute('data-koi-grid-overlay', '')
    overlay.setAttribute('role', 'dialog')
    overlay.setAttribute('aria-label', title || 'Foto progress')
    overlay.style.cssText = 'position:fixed;inset:0;z-index:4900;display:flex;flex-direction:column;padding:12px 14px;background:rgba(0,0,0,.88)'
    var panel = document.createElement('div')
    panel.style.cssText = 'display:flex;flex-direction:column;gap:8px;width:100%;flex:1 1 auto;min-height:0'
    var head = document.createElement('div')
    head.style.cssText = 'flex:1 1 auto;min-width:0;padding:2px 8px;color:#e6e8eb;text-align:center;user-select:text;-webkit-user-select:text;overflow-wrap:anywhere'
    var heading = document.createElement('div')
    heading.textContent = title || 'Foto progress'
    heading.style.cssText = 'font-weight:700;font-size:.95rem;line-height:1.3'
    head.appendChild(heading)
    var sub = (lines || []).filter(function (line) { return line && String(line).trim() }).concat([items.length + ' foto progress']).join(' - ')
    var subRow = document.createElement('div')
    subRow.textContent = sub
    subRow.style.cssText = 'font-size:.82rem;line-height:1.35;color:rgba(230,232,235,.65)'
    head.appendChild(subRow)
    var bar = document.createElement('div')
    bar.style.cssText = 'flex:0 0 auto;display:flex;align-items:center;gap:10px;padding-left:50px'
    bar.appendChild(head)
    panel.appendChild(bar)
    var scroller = document.createElement('div')
    scroller.style.cssText = 'flex:1 1 0;min-height:0;overflow:auto;display:flex'
    var grid = document.createElement('div')
    grid.style.cssText = 'margin:auto;width:100%;display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,160px));gap:10px;justify-content:center;padding:2px'
    items.forEach(function (item, index) {
      var card = document.createElement('button')
      card.type = 'button'
      card.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px;border:1px solid var(--tblr-border-color,rgba(128,150,172,.25));border-radius:8px;background:var(--tblr-bg-surface-secondary,var(--tblr-bg-surface,#1b2330));color:var(--tblr-body-color,#e6e8eb);cursor:zoom-in;text-align:center'
      var picture = document.createElement('img')
      picture.src = item.src
      picture.alt = item.label || ''
      picture.loading = 'lazy'
      picture.style.cssText = 'width:100%;aspect-ratio:2/3;object-fit:cover;border-radius:6px;background:rgba(255,255,255,.06)'
      var label = document.createElement('div')
      label.textContent = item.label || ''
      label.style.cssText = 'font-weight:600;font-size:.85rem;color:var(--tblr-primary,#066fd1)'
      var date = document.createElement('div')
      date.textContent = item.sub || ''
      date.style.cssText = 'font-size:.78rem;color:var(--tblr-secondary-color,rgb(150,160,175))'
      card.appendChild(picture)
      card.appendChild(label)
      if (item.sub) card.appendChild(date)
      card.addEventListener('click', function (event) {
        event.stopPropagation()
        zoomSeries(items, index)
      })
      grid.appendChild(card)
    })
    scroller.appendChild(grid)
    panel.appendChild(scroller)
    overlay.appendChild(panel)
    var closeButton = document.createElement('button')
    closeButton.type = 'button'
    closeButton.setAttribute('aria-label', 'Tutup')
    closeButton.innerHTML = zoomIcons.close
    closeButton.className = 'koi-zoom-btn koi-zoom-close'
    // beside the title, same row (not floating over it)
    closeButton.style.cssText = 'position:static;flex:0 0 auto'
    bar.appendChild(closeButton)
    function onKey(event) {
      if (event.key !== 'Escape' || document.querySelector('[data-koi-zoom-overlay]')) return
      event.stopPropagation()
      close()
    }
    function close() {
      overlay.remove()
      document.removeEventListener('keydown', onKey, true)
    }
    // any empty area closes it (only the photos, the X button and the title text are excluded)
    overlay.addEventListener('click', function (event) {
      if (event.target.closest('button') || head.contains(event.target)) return
      close()
    })
    closeButton.addEventListener('click', function (event) { event.stopPropagation(); close() })
    document.addEventListener('keydown', onKey, true)
    document.body.appendChild(overlay)
  }

  window.KoiAuth = {
    formatDate: formatDate,
    formatDateTime: formatDateTime,
    dateFromText: dateFromText,
    dateParts: dateParts,
    dateShort: dateShort,
    parseDateValue: parseDateValue,
    zoomPhoto: zoomPhoto,
    zoomSeries: zoomSeries,
    photoGrid: photoGrid,
    zoomKoi: zoomKoi,
    zoomKoiByCode: zoomKoiByCode,
    koiZoomInfo: koiZoomInfo,
    accountsKey: accountsKey,
    sessionKey: sessionKey,
    usesRemoteApi: usesRemoteApi,
    defaultAccounts: defaultAccounts,
    apiRequest: apiRequest,
    apiUrl: apiUrl,
    normalizeUploadMedia: normalizeUploadMedia,
    brandSettingsKey: brandSettingsKey,
    loadAppSettings: loadAppSettings,
    saveAppSettings: saveAppSettings,
    applyBrandSettings: applyBrandSettings,
    checkApiIndicator: checkApiIndicator,
    registerRealtimeRefresh: registerRealtimeRefresh,
    getAccounts: readAccounts,
    getRemoteAccounts: getRemoteAccounts,
    getRemoteAccountSessions: getRemoteAccountSessions,
    getSession: getSession,
    updateStoredSession: updateStoredSession,
    login: login,
    loginRemote: loginRemote,
    saveRemoteAccount: saveRemoteAccount,
    deleteRemoteAccount: deleteRemoteAccount,
    logout: logout,
    updateUserMenu: updateUserMenu,
    requireLogin: requireLogin,
    canAccess: canAccess,
    applyRoleAccess: applyRoleAccess,
    canAccessRole: canAccess,
  }

  window.addEventListener('storage', function (event) {
    if (event.key === brandSettingsKey && event.newValue) {
      try {
        scheduleBrandApply(JSON.parse(event.newValue))
      } catch (error) {}
    }
  })

  window.addEventListener('nishikigoi:brand-settings-updated', function (event) {
    scheduleBrandApply(event.detail || JSON.parse(localStorage.getItem(brandSettingsKey) || 'null') || {})
  })
  if (!followCurrentAccount()) requireLogin()
  if (/\/sign-in(\.html)?$/.test(window.location.pathname) && getSession()) window.location.replace('./farm')
  installRoleGate()
  window.addEventListener('storage', function (event) {
    if (event.key === currentAccountKey) followCurrentAccount()
  })

  // Choice and on/off buttons must show their real state immediately, also while the pointer or
  // finger is still on them:
  // - btn-check (e.g. Breeding "Metode"/"Status"): Tabler's hover rule comes after the checked rule.
  // - form-selectgroup (icon filters): no pressed feedback.
  // - on/off buttons (aria-pressed="false"): the outline hover looked "on" right after switching off.
  // - touch screens have no real hover; the last tapped button kept a hover look until tapping elsewhere.
  ;(function () {
    var active = 'color:var(--tblr-btn-active-color);background-color:var(--tblr-btn-active-bg);border-color:var(--tblr-btn-active-border-color);box-shadow:var(--tblr-btn-active-shadow)'
    var style = document.createElement('style')
    style.id = 'koi-btn-state-style'
    style.textContent = [
      '@media (hover:none){.btn:hover:not(:active){color:var(--tblr-btn-color);background-color:var(--tblr-btn-bg);border-color:var(--tblr-btn-border-color)}.form-selectgroup-input:not(:checked)+.form-selectgroup-label:hover{color:var(--tblr-secondary)}}',
      '.btn[aria-pressed="false"]:not(.koi-sort-toggle):hover:not(:active){color:var(--tblr-btn-color);background-color:color-mix(in srgb,var(--tblr-btn-color) 8%,transparent);border-color:var(--tblr-btn-border-color)}',
      '.btn.active:hover,.btn.show:hover,.btn-check:checked+.btn:hover,.btn-check+.btn:active,.btn-check:checked+.btn:active{' + active + '}',
      '.form-selectgroup-input+.form-selectgroup-label:active{z-index:1;color:var(--tblr-primary);background:color-mix(in srgb,var(--tblr-primary) 4%,transparent);border-color:var(--tblr-primary)}',
    ].join('')
    document.head.appendChild(style)
  })()
  document.addEventListener('click', function (event) {
    var button = event.target.closest('[data-action="logout"]')
    if (!button) return
    event.preventDefault()
    logout()
  })
  document.addEventListener('click', function (event) {
    var restricted = event.target.closest('[data-role-required], [data-role-disable-unless]')
    if (!restricted) return
    var permission = restricted.getAttribute('data-role-required') || restricted.getAttribute('data-role-disable-unless')
    if (permission && !canAccess(permission)) {
      event.preventDefault()
      event.stopPropagation()
    }
  }, true)

  ;(function () {
    var cached = JSON.parse(localStorage.getItem(brandSettingsKey) || 'null')
    if (cached) scheduleBrandApply(cached)
  })()

  document.addEventListener('DOMContentLoaded', function () {
    installApiIndicator()
    loadAppSettings()
    updateUserMenu()
    applyRoleAccess()
    normalizeUploadMedia(document)
    installKoiSelectEnhancer()
    var roleObserverTimer = null
    new MutationObserver(function () {
      window.clearTimeout(roleObserverTimer)
      roleObserverTimer = window.setTimeout(function () {
        applyRoleAccess()
        normalizeUploadMedia(document)
        installKoiSelectEnhancer()
      }, 50)
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'href', 'poster', 'data-image-url', 'data-thumbnail-url', 'data-zoom-image', 'data-preview-photo-history', 'data-merge-preview-photo', 'data-pond-documentation-url'] })
  })
})()


// Remembers the top search box and the scroll position per menu (tab session only), so coming
// back from another menu does not start from the top with an empty search.
;(function () {
  var path = window.location.pathname.replace(/\/$/, '')
  var listPage = /\/(farm-ponds|farm-breeding|farm-reports|farm-gallery|farm-log|farm-archive|farm-sell|farm-invoice|farm-inventory)(\.html)?$/.test(path)
  var searchKey = 'nishikigoi-search:' + path
  var scrollKey = 'nishikigoi-scroll:' + path
  var pageSearchSelector = '[data-koi-search], [data-pond-search], [data-gallery-search], [data-report-search], [data-breeding-search], [data-log-search], [data-sell-search], [data-invoice-search], [data-inventory-search]'

  function read(key) {
    try { return window.sessionStorage.getItem(key) || '' } catch (error) { return '' }
  }

  function write(key, value) {
    try {
      if (value) window.sessionStorage.setItem(key, value)
      else window.sessionStorage.removeItem(key)
    } catch (error) { /* storage unavailable: nothing is remembered */ }
  }

  function findPageSearch() {
    var inputs = document.querySelectorAll(pageSearchSelector)
    for (var index = 0; index < inputs.length; index += 1) {
      if (!inputs[index].closest('.modal, .dropdown-menu, #offcanvas-settings')) return inputs[index]
    }
    return null
  }

  // the X (clear) button is shown by the "has-value" class, which the input event normally sets; restoring the text
  // by code does not fire it, so set it here
  function showSearchClear(input) {
    var wrapper = input.closest('.navbar-global-search')
    if (wrapper) wrapper.classList.toggle('has-value', Boolean(input.value))
  }

  function setupSearch() {
    var globalInput = document.querySelector('.navbar-global-search-input')
    if (!globalInput || !/\/(farm-ponds|farm-breeding|farm-reports|farm-gallery|farm-log|farm-archive|farm-sell|farm-invoice|farm-inventory)(\.html)?$/.test(path)) return

    globalInput.addEventListener('input', function () { write(searchKey, globalInput.value) })
    // the X button empties the box by code (no input event), so forget the remembered text here too
    var clearButton = globalInput.closest('.navbar-global-search') && globalInput.closest('.navbar-global-search').querySelector('[data-navbar-search-clear]')
    if (clearButton) clearButton.addEventListener('click', function () { write(searchKey, '') })

    var saved = read(searchKey)
    if (!saved) return

    var pageSearch = findPageSearch()
    if (pageSearch) {
      if (pageSearch.value !== saved) {
        pageSearch.value = saved
        pageSearch.dispatchEvent(new Event('input', { bubbles: true }))
      }
      globalInput.value = saved
      showSearchClear(globalInput)
      return
    }

    globalInput.value = saved
    globalInput.dispatchEvent(new Event('input', { bubbles: true }))
    showSearchClear(globalInput)

    // Pages without their own search field are filtered in the DOM, so filter again when rows are re-rendered.
    var timer = null
    new MutationObserver(function () {
      window.clearTimeout(timer)
      timer = window.setTimeout(function () {
        if (globalInput.value) globalInput.dispatchEvent(new Event('input', { bubbles: true }))
      }, 200)
    }).observe(document.body, { childList: true, subtree: true })
  }

  function setupScroll() {
    if (!listPage) return
    var saved = Number(read(scrollKey)) || 0

    function save() { write(scrollKey, String(Math.round(window.scrollY))) }
    window.addEventListener('pagehide', save)
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') save()
    })

    if (saved <= 0) return
    var stopped = false
    function stop() { stopped = true }
    window.addEventListener('wheel', stop, { passive: true, once: true })
    window.addEventListener('touchstart', stop, { passive: true, once: true })
    window.addEventListener('keydown', stop, { once: true })

    var tries = 0
    var poll = window.setInterval(function () {
      tries += 1
      if (stopped || tries > 40) {
        window.clearInterval(poll)
        return
      }
      var maxY = document.documentElement.scrollHeight - window.innerHeight
      if (maxY >= saved - 4) {
        window.scrollTo(0, saved)
        window.clearInterval(poll)
      }
    }, 100)
  }

  function start() {
    setupSearch()
    setupScroll()
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
  else start()
})()


// Give Feedback: any logged-in account can send a message (optional images) that only Master Admin
// accounts can read from the notification bell.
;(function () {
  var MAX_IMAGES = 3
  var MAX_LENGTH = 2000
  var feedbackModal = null
  var viewerModal = null
  var pendingImages = []

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>'"]/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]
    })
  }

  function modalApi() {
    return (window.tabler && window.tabler.bootstrap && window.tabler.bootstrap.Modal) || (window.bootstrap && window.bootstrap.Modal)
  }

  function showModal(element) {
    var api = modalApi()
    if (api) api.getOrCreateInstance(element).show()
  }

  function hideModal(element) {
    var api = modalApi()
    var instance = api && api.getInstance(element)
    if (!instance) return
    instance.hide()
    window.setTimeout(function () { if (element.classList.contains('show')) instance.hide() }, 450)
  }

  function formatTime(value) {
    var match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/)
    return match ? match[3] + '/' + match[2] + '/' + match[1] + ' ' + match[4] + ':' + match[5] : String(value || '')
  }

  function fileToCompressedDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader()
      reader.onerror = function () { reject(new Error('Gambar tidak bisa dibaca')) }
      reader.onload = function () {
        var image = new Image()
        image.onerror = function () { reject(new Error('File bukan gambar yang valid')) }
        image.onload = function () {
          var longest = Math.max(image.width, image.height)
          var scale = longest > 1600 ? 1600 / longest : 1
          var canvas = document.createElement('canvas')
          canvas.width = Math.max(1, Math.round(image.width * scale))
          canvas.height = Math.max(1, Math.round(image.height * scale))
          canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
          resolve(canvas.toDataURL('image/jpeg', 0.85))
        }
        image.src = String(reader.result)
      }
      reader.readAsDataURL(file)
    })
  }

  function ensureFeedbackModal() {
    if (feedbackModal) return feedbackModal
    var wrapper = document.createElement('div')
    wrapper.className = 'modal modal-blur fade'
    wrapper.id = 'koi-feedback-modal'
    wrapper.tabIndex = -1
    wrapper.setAttribute('aria-hidden', 'true')
    wrapper.innerHTML =
      '<div class="modal-dialog modal-dialog-centered" role="document"><form class="modal-content">' +
      '<div class="modal-header"><h5 class="modal-title">Give Feedback</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Tutup"></button></div>' +
      '<div class="modal-body">' +
      '<div class="alert d-none" data-feedback-alert></div>' +
      '<p class="text-secondary">Pesan ini dikirim ke akun Master Admin sebagai notifikasi.</p>' +
      '<div class="mb-3"><label class="form-label">Nama <span class="text-danger">*</span></label><input class="form-control" type="text" name="feedback_name" maxlength="100" required autocomplete="name" placeholder="Nama Anda" /></div>' +
      '<div class="mb-3"><label class="form-label">Kategori</label><select class="form-select" name="feedback_category"><option value="saran">Saran</option><option value="masalah">Masalah atau error</option><option value="lainnya">Lainnya</option></select></div>' +
      '<div class="mb-3"><label class="form-label">Pesan</label><textarea class="form-control" name="feedback_message" rows="5" maxlength="' + MAX_LENGTH + '" placeholder="Tulis saran, masalah, atau pertanyaan Anda"></textarea><div class="form-hint text-end" data-feedback-count>0/' + MAX_LENGTH + '</div></div>' +
      '<div><label class="form-label">Gambar (opsional, maksimal ' + MAX_IMAGES + ')</label><input class="form-control" type="file" name="feedback_images" accept="image/*" multiple /></div>' +
      '<div class="d-flex flex-wrap gap-2 mt-2" data-feedback-previews></div>' +
      '</div>' +
      '<div class="modal-footer"><button type="button" class="btn" data-bs-dismiss="modal">Batal</button><button type="submit" class="btn btn-primary" data-feedback-send>Kirim</button></div>' +
      '</form></div>'
    document.body.appendChild(wrapper)

    var form = wrapper.querySelector('form')
    var textarea = form.elements.feedback_message
    var alertBox = wrapper.querySelector('[data-feedback-alert]')
    var previews = wrapper.querySelector('[data-feedback-previews]')
    var sendButton = wrapper.querySelector('[data-feedback-send]')

    function setAlert(kind, message) {
      alertBox.className = 'alert alert-' + kind + (message ? '' : ' d-none')
      alertBox.textContent = message || ''
    }

    function renderPreviews() {
      previews.innerHTML = pendingImages.map(function (src, index) {
        return '<div class="position-relative"><img src="' + escapeHtml(src) + '" alt="Gambar ' + (index + 1) + '" style="width:72px;height:72px;object-fit:cover;border-radius:6px;border:1px solid var(--tblr-border-color)" />' +
          '<button type="button" class="btn btn-sm btn-icon btn-danger position-absolute top-0 end-0" style="width:1.4rem;height:1.4rem;min-height:0;padding:0" data-feedback-remove="' + index + '" aria-label="Hapus gambar">&times;</button></div>'
      }).join('')
    }

    textarea.addEventListener('input', function () {
      wrapper.querySelector('[data-feedback-count]').textContent = textarea.value.length + '/' + MAX_LENGTH
    })

    form.elements.feedback_images.addEventListener('change', async function (event) {
      var files = Array.prototype.slice.call(event.target.files || [])
      event.target.value = ''
      setAlert('', '')
      for (var index = 0; index < files.length; index += 1) {
        if (pendingImages.length >= MAX_IMAGES) {
          setAlert('warning', 'Gambar maksimal ' + MAX_IMAGES + '. Sisanya diabaikan.')
          break
        }
        try {
          pendingImages.push(await fileToCompressedDataUrl(files[index]))
        } catch (error) {
          setAlert('danger', error.message)
        }
      }
      renderPreviews()
    })

    previews.addEventListener('click', function (event) {
      var button = event.target.closest('[data-feedback-remove]')
      if (!button) return
      pendingImages.splice(Number(button.dataset.feedbackRemove), 1)
      renderPreviews()
    })

    form.addEventListener('submit', async function (event) {
      event.preventDefault()
      var senderName = form.elements.feedback_name.value.trim()
      if (!senderName) {
        setAlert('danger', 'Nama wajib diisi.')
        form.elements.feedback_name.focus()
        return
      }
      var message = textarea.value.trim()
      if (!message) {
        setAlert('danger', 'Pesan wajib diisi.')
        return
      }
      sendButton.disabled = true
      setAlert('', '')
      try {
        var response = await window.KoiAuth.apiRequest('/feedback', {
          method: 'POST',
          body: JSON.stringify({ name: senderName, message: message, category: form.elements.feedback_category.value, images: pendingImages }),
        })
        var data = await response.json().catch(function () { return {} })
        if (!response.ok) throw new Error(data.error || 'Feedback gagal dikirim')
        setAlert('success', 'Feedback terkirim ke akun Master Admin. Terima kasih.')
        textarea.value = ''
        pendingImages = []
        renderPreviews()
        window.setTimeout(function () { hideModal(wrapper) }, 1400)
      } catch (error) {
        setAlert('danger', error.message)
      } finally {
        sendButton.disabled = false
      }
    })

    wrapper.addEventListener('hidden.bs.modal', function () { setAlert('', '') })
    feedbackModal = wrapper
    return wrapper
  }

  function openFeedback() {
    var wrapper = ensureFeedbackModal()
    var nameInput = wrapper.querySelector('[name="feedback_name"]')
    if (nameInput && !nameInput.value.trim()) {
      var me = window.KoiAuth && window.KoiAuth.getSession && window.KoiAuth.getSession()
      nameInput.value = (me && (me.name || me.username)) || ''
    }
    wrapper.querySelector('[data-feedback-count]').textContent = wrapper.querySelector('textarea').value.length + '/' + MAX_LENGTH
    showModal(wrapper)
  }

  function ensureViewer() {
    if (viewerModal) return viewerModal
    var wrapper = document.createElement('div')
    wrapper.className = 'modal modal-blur fade'
    wrapper.id = 'koi-feedback-view-modal'
    wrapper.tabIndex = -1
    wrapper.setAttribute('aria-hidden', 'true')
    wrapper.innerHTML =
      '<div class="modal-dialog modal-dialog-centered modal-lg" role="document"><div class="modal-content">' +
      '<div class="modal-header"><h5 class="modal-title" data-feedback-view-title>Feedback</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Tutup"></button></div>' +
      '<div class="modal-body"><div class="text-secondary small mb-3" data-feedback-view-meta></div><div style="white-space:pre-wrap;word-break:break-word" data-feedback-view-message></div><div class="row g-2 mt-3" data-feedback-view-images></div></div>' +
      '<div class="modal-footer"><button type="button" class="btn" data-bs-dismiss="modal">Tutup</button></div>' +
      '</div></div>'
    document.body.appendChild(wrapper)
    viewerModal = wrapper
    return wrapper
  }

  async function openFeedbackViewer(id) {
    var response = await window.KoiAuth.apiRequest('/notifications/' + Number(id))
    if (!response.ok) return
    var item = await response.json()
    var details = {}
    try { details = JSON.parse(item.details || '{}') || {} } catch (error) { details = {} }
    var wrapper = ensureViewer()
    wrapper.querySelector('[data-feedback-view-title]').textContent = item.title || 'Feedback'
    wrapper.querySelector('[data-feedback-view-meta]').textContent =
      [details.category_label, (details.from_name || item.actor) + (item.role ? ' (' + item.role + ')' : ''), formatTime(item.created_at)].filter(Boolean).join(' - ')
    wrapper.querySelector('[data-feedback-view-message]').textContent = item.message || ''
    wrapper.querySelector('[data-feedback-view-images]').innerHTML = (details.images || []).map(function (src) {
      return '<div class="col-6 col-md-4"><a href="' + escapeHtml(src) + '" target="_blank" rel="noopener"><img src="' + escapeHtml(src) + '" alt="Lampiran feedback" style="width:100%;border-radius:6px;border:1px solid var(--tblr-border-color)" /></a></div>'
    }).join('')
    showModal(wrapper)
    if (item.status !== 'read') {
      window.KoiAuth.apiRequest('/notifications/' + Number(id) + '/read', { method: 'PATCH' }).then(function () {
        document.querySelectorAll('[data-feedback-notification="' + Number(id) + '"] .status-dot').forEach(function (dot) {
          dot.className = 'status-dot d-block'
        })
      }).catch(function () { /* the message was shown; only the read mark failed */ })
    }
  }

  document.addEventListener('click', function (event) {
    var open = event.target.closest && event.target.closest('[data-feedback-open]')
    if (open) {
      event.preventDefault()
      openFeedback()
      return
    }
    var item = event.target.closest && event.target.closest('[data-feedback-notification]')
    if (item) {
      event.preventDefault()
      openFeedbackViewer(item.getAttribute('data-feedback-notification'))
    }
  })
})()


// Unread message indicator: a badge next to "Message" in Settings and a red dot on the avatar.
// Polling is quiet on the server (it does not count as account activity).
;(function () {
  function apply(count) {
    var label = count > 99 ? '99+' : String(count)
    document.querySelectorAll('[data-message-unread]').forEach(function (element) {
      element.textContent = label
      element.classList.toggle('d-none', !count)
    })
    document.querySelectorAll('[data-auth-avatar]').forEach(function (avatar) {
      var dot = avatar.querySelector('.koi-message-dot')
      if (count && !dot) {
        dot = document.createElement('span')
        dot.className = 'badge bg-red koi-message-dot'
        dot.title = 'Ada pesan baru'
        avatar.appendChild(dot)
      } else if (!count && dot) {
        dot.remove()
      }
    })
  }

  function refreshUnread() {
    var session = window.KoiAuth && window.KoiAuth.getSession && window.KoiAuth.getSession()
    if (!session) return Promise.resolve()
    return fetch('/api/messages/unread-count')
      .then(function (response) { return response.ok ? response.json() : null })
      .then(function (data) { if (data) apply(Number(data.count || 0)) })
      .catch(function () { /* keep the last indicator */ })
  }

  window.KoiMessages = { refreshUnread: refreshUnread }

  function start() {
    window.setTimeout(refreshUnread, 1200)
    window.setInterval(function () { if (document.visibilityState === 'visible') refreshUnread() }, 30000)
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
  else start()
})()

// "?open=ID" on Data Kolam, Laporan, Breeding, Katalog and Invoice opens that item's detail once the list is drawn. The "Buka ..."
// links in Galeri use it. The remembered search of that page is dropped so it cannot hide the item.
;(function () {
  var page = window.location.pathname.replace(/\/$/, '')
  var match = /\/(farm-ponds|farm-reports|farm-breeding|farm-sell|farm-invoice|farm-inventory)(\.html)?$/.exec(page)
  if (!match) return
  var id = ''
  try { id = String(new URLSearchParams(window.location.search).get('open') || '').replace(/[^0-9]/g, '') } catch (error) {}
  if (!id) return
  try { window.sessionStorage.removeItem('nishikigoi-search:' + page) } catch (error) {}
  var selector = { 'farm-ponds': '[data-pond-row="' + id + '"]', 'farm-reports': '[data-report-id="' + id + '"]', 'farm-breeding': '[data-breeding-id="' + id + '"]', 'farm-sell': '[data-sell-id="' + id + '"]', 'farm-invoice': '[data-invoice-id="' + id + '"]' }[match[1]]
  var tries = 0
  var timer = window.setInterval(function () {
    tries += 1
    var target = document.querySelector(selector)
    if (target) {
      window.clearInterval(timer)
      try { window.history.replaceState(null, '', window.location.pathname) } catch (error) {}
      // give the page scripts a moment to finish loading their data before the click
      // Katalog and Invoice cards select on click and open their detail on double-click
      var cardPage = match[1] === 'farm-sell' || match[1] === 'farm-invoice'
      window.setTimeout(function () { if (cardPage) target.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true })); else target.click() }, 700)
    } else if (tries > 60) {
      window.clearInterval(timer)
    }
  }, 300)
})()

// Date fields: a click anywhere in the field opens the calendar (the browser only opens it from the small icon).
// Typing still works: press Esc to close the calendar and type the numbers.
;(function () {
  document.addEventListener('click', function (event) {
    var input = event.target && event.target.closest ? event.target.closest('input[type="date"]') : null
    if (!input || input.disabled || input.readOnly || typeof input.showPicker !== 'function') return
    try { input.showPicker() } catch (error) { /* the browser refused (no user gesture / already open) */ }
  })
})()


// Pencarian global di navbar dan rekomendasi isian field: dimuat dari satu tempat supaya tidak perlu mengubah tiap halaman.
;(function () {
  var publicPages = ['sign-in', 'sign-up', 'forgot-password', '2-step-verification', '2-step-verification-code', 'landing', 'license', 'index']
  var name = window.location.pathname.replace(/\/$/, '').split('/').pop().replace(/\.html$/, '')
  if (publicPages.indexOf(name) >= 0) return
  function load(src) {
    var script = document.createElement('script')
    script.src = src
    script.defer = true
    document.head.appendChild(script)
  }
  function start() {
    load('/assets/global-search.js?v=20261029b')
    load('/assets/field-suggest.js?v=20261025a')
    load('/assets/list-pager.js?v=20261021c')
    load('/assets/user-menu.js?v=20261025a')
    load('/assets/social.js?v=20261024b')
    load('/assets/profile.js?v=20261024a')
    load('/assets/messenger.js?v=20261024b')
    load('/assets/back-close.js?v=20261017b')
    load('/assets/img-skeleton.js?v=20261017a')
    if (name === 'settings') load('/assets/account-extras.js?v=20261029b')
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
  else start()
})()

// Sign-in page: tell the person why they are back here after the session ended.
;(function () {
  function show() {
    var flag = ''
    try { flag = window.sessionStorage.getItem('koi-session-expired') || ''; window.sessionStorage.removeItem('koi-session-expired') } catch (error) {}
    if (!flag) return
    var box = document.querySelector('[data-login-message]')
    if (!box) return
    box.textContent = 'Sesi Anda sudah berakhir.'
    box.className = 'small text-secondary text-center mb-3'
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show)
  else show()
})()

// ---- "Versi baru tersedia": a slim bar for the Master Admin when GitHub has a newer version, and the "Perbarui sekarang" button ----------
// The server answers { enabled: false } where this does not apply (Apache/Laragon, a copy that is not a git clone); every other role is
// refused (403) and sees nothing. The update itself runs on the server (api-php/lib/update.php); the new files are used right away.
;(function () {
  var snoozeKey = 'koi-update-snooze'
  var bar = null
  var running = false

  function session() {
    try { return window.KoiAuth && window.KoiAuth.getSession && window.KoiAuth.getSession() } catch (error) { return null }
  }
  function esc(value) {
    return String(value === null || value === undefined ? '' : value).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] })
  }
  function snoozed() {
    try { return Number(localStorage.getItem(snoozeKey) || 0) > Date.now() } catch (error) { return false }
  }
  function snooze() {
    try { localStorage.setItem(snoozeKey, String(Date.now() + 6 * 3600 * 1000)) } catch (error) { /* only a convenience */ }
  }
  function ask(path, options) {
    return window.KoiAuth.apiRequest(path, options).then(function (response) {
      return response.json().catch(function () { return {} }).then(function (data) { return { ok: response.ok, status: response.status, data: data } })
    })
  }

  function removeBar() {
    if (bar) { bar.remove(); bar = null }
  }

  // A card in the middle of the screen like the backup and restore progress: the three stages as a list (done ticked with what it came to),
  // the one running with its own counts, a bar for that stage, and a stopwatch.
  var STEP_NAMES = ['Memeriksa GitHub', 'Mengunduh paket', 'Memasang berkas']
  var CHECK = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5l10 -10"/></svg>'
  function overlay() {
    var box = document.createElement('div')
    box.setAttribute('data-koi-update-overlay', '')
    box.style.cssText = 'position:fixed;inset:0;z-index:7000;display:flex;align-items:center;justify-content:center;padding:12px;background:rgba(8,12,20,.55)'
    var rows = STEP_NAMES.map(function (name, index) {
      return '<div data-koi-update-step="' + (index + 1) + '" style="display:flex;align-items:flex-start;gap:10px;padding:7px 0">' +
        '<span data-koi-update-icon style="flex:0 0 20px;height:20px;display:inline-flex;align-items:center;justify-content:center"></span>' +
        '<span style="flex:1 1 auto;min-width:0"><span data-koi-update-name style="display:block;font-weight:500">' + name + '</span>' +
        '<span data-koi-update-info class="small text-secondary" style="display:block;overflow-wrap:anywhere"></span></span></div>'
    }).join('')
    box.innerHTML = '<div style="width:min(92vw,26rem);padding:18px 20px;border-radius:var(--tblr-border-radius-lg,10px);background:var(--tblr-bg-surface,#1b2330);color:var(--tblr-body-color,#e6e8eb);border:1px solid var(--tblr-border-color,rgba(128,150,172,.3));box-shadow:0 8px 28px rgba(0,0,0,.35)">' +
      '<div style="font-weight:600;font-size:1.05rem;margin-bottom:8px;text-align:center">Memperbarui program</div>' +
      '<div>' + rows + '</div>' +
      '<div class="progress progress-sm mt-3"><div class="progress-bar progress-bar-indeterminate" data-koi-update-bar></div></div>' +
      '<div class="d-flex justify-content-between small text-secondary mt-2"><span data-koi-update-text></span><span data-koi-update-clock></span></div>' +
      '<div class="small text-secondary mt-1">Jangan tutup halaman ini.</div></div>'
    document.body.appendChild(box)
    return box
  }
  // marks each stage done / running / waiting; `steps` holds the summary of the finished ones, `detail` the counts of the running one
  function paintSteps(box, stage, steps, detail, finished) {
    STEP_NAMES.forEach(function (name, index) {
      var number = index + 1
      var row = box.querySelector('[data-koi-update-step="' + number + '"]')
      var icon = row.querySelector('[data-koi-update-icon]')
      var info = row.querySelector('[data-koi-update-info]')
      var state = finished || number < stage ? 'done' : number === stage ? 'running' : 'waiting'
      if (row.dataset.state !== state) {
        row.dataset.state = state
        icon.innerHTML = state === 'done' ? '<span class="text-success">' + CHECK + '</span>'
          : state === 'running' ? '<span class="spinner-border spinner-border-sm text-primary" role="status" aria-hidden="true"></span>'
          : '<span style="width:8px;height:8px;border-radius:50%;background:currentColor;opacity:.35"></span>'
        row.style.opacity = state === 'waiting' ? '.55' : ''
      }
      info.textContent = state === 'done' ? ((steps && steps[number]) || '') : state === 'running' ? (detail || '') : ''
    })
  }

  function applyUpdate() {
    if (running) return
    running = true
    var box = overlay()
    var text = box.querySelector('[data-koi-update-text]')
    var clock = box.querySelector('[data-koi-update-clock]')
    var bar = box.querySelector('[data-koi-update-bar]')
    var startedAt = Date.now()
    function elapsed() {
      var seconds = Math.floor((Date.now() - startedAt) / 1000)
      return ('0' + Math.floor(seconds / 60)).slice(-2) + ':' + ('0' + (seconds % 60)).slice(-2)
    }
    function setBar(percent) {
      if (percent === null || percent === undefined) { bar.classList.add('progress-bar-indeterminate'); bar.style.width = ''; return }
      bar.classList.remove('progress-bar-indeterminate')
      bar.style.width = Math.max(0, Math.min(100, Math.floor(percent))) + '%'
    }
    function fail(message) {
      running = false
      box.remove()
      window.KoiDialog.alert(message || 'Pembaruan gagal.')
    }
    paintSteps(box, 1, null, 'menghubungi GitHub', false)
    text.textContent = 'Tahap 1/3'
    clock.textContent = elapsed()
    ask('/system/update/apply', { method: 'POST', body: '{}' }).then(function (result) {
      if (!result.ok) return fail(result.data.error || 'Pembaruan gagal dimulai.')
      var tries = 0
      var timer = window.setInterval(function () {
        tries += 1
        ask('/system/update').then(function (poll) {
          var apply = (poll.data && poll.data.apply) || {}
          if (apply.state === 'done') {
            window.clearInterval(timer)
            try { sessionStorage.removeItem('koi-app-version') } catch (error) { /* only a convenience */ }
            setBar(100)
            paintSteps(box, 3, apply.steps, '', true)
            text.textContent = 'Versi terbaru terpasang. Memuat ulang...'
            clock.textContent = elapsed()
            window.setTimeout(function () { window.location.reload() }, 1200)
          } else if (apply.state === 'error') {
            window.clearInterval(timer)
            fail(apply.message)
          } else if (apply.state === 'running') {
            paintSteps(box, apply.stage || 1, apply.steps, apply.detail || apply.stage_label, false)
            text.textContent = 'Tahap ' + (apply.stage || 1) + '/3: ' + (apply.stage_label || 'mengambil pembaruan')
            clock.textContent = elapsed()
            setBar(apply.percent === undefined ? null : apply.percent)
          }
          if (tries > 300) {
            window.clearInterval(timer)
            fail('Pembaruan memakan waktu terlalu lama. Muat ulang halaman dan periksa lagi.')
          }
        }).catch(function () { /* the server may be busy for a moment: try again on the next tick */ })
      }, 1000)
    }).catch(function () { fail('Tidak bisa menghubungi server.') })
  }

  function openDialog(info) {
    if (info.dirty) {
      window.KoiDialog.alert('Ada berkas program yang diubah di komputer ini, jadi pembaruan otomatis tidak bisa dipasang supaya perubahan itu tidak tertimpa.')
      return
    }
    var lines = (info.changes || []).slice(0, 10).map(function (change) { return '- ' + (change.date ? change.date + ': ' : '') + change.subject })
    var more = info.behind > lines.length ? '\n- dan ' + (info.behind - lines.length) + ' pembaruan lainnya' : ''
    window.KoiDialog.confirm({
      title: 'Perbarui ke versi terbaru?',
      message: info.behind + ' pembaruan tersedia:\n' + lines.join('\n') + more + '\n\nSebaiknya buat Backup dulu (Pengaturan > Master Akun). Pembaruan hanya mengganti berkas program; data Anda tidak disentuh.',
      confirmText: 'Perbarui sekarang',
      danger: false,
    }).then(function (yes) { if (yes) applyUpdate() })
  }

  function showBar(info) {
    if (bar || snoozed() || document.querySelector('[data-koi-update-overlay]')) return
    bar = document.createElement('div')
    bar.setAttribute('data-koi-update-bar', '')
    bar.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:.6rem;padding:.4rem 1rem;background:#1688ff;color:#fff;font-size:.9rem'
    bar.innerHTML = '<span>Versi baru tersedia (' + esc(info.behind) + ' pembaruan).</span>' +
      '<button type="button" class="btn btn-sm btn-light" data-koi-update-open>Lihat dan perbarui</button>' +
      '<button type="button" class="btn btn-sm btn-ghost-light" data-koi-update-later style="color:#fff">Nanti</button>'
    document.body.insertBefore(bar, document.body.firstChild)
    bar.querySelector('[data-koi-update-open]').addEventListener('click', function () { openDialog(info) })
    bar.querySelector('[data-koi-update-later]').addEventListener('click', function () { snooze(); removeBar() })
  }

  // the "Versi Program" card of Master Akun (shown only where updating from the program applies)
  function fillCard(info) {
    var card = document.querySelector('[data-update-card]')
    if (!card) return
    if (!info || !info.enabled) { card.hidden = true; return }
    card.hidden = false
    var head = info.head ? info.head.sha + ' (' + info.head.date + ') ' + info.head.subject : '-'
    card.querySelector('[data-update-head]').textContent = head
    var when = info.checked_at ? new Date(info.checked_at * 1000) : null
    card.querySelector('[data-update-checked]').textContent = info.checking ? 'sedang memeriksa...' : when ? (window.KoiAuth.formatDateTime ? window.KoiAuth.formatDateTime(when) : when.toLocaleString()) : 'belum pernah'
    var status = card.querySelector('[data-update-status]')
    status.className = info.error ? 'text-danger' : info.behind > 0 ? 'text-warning fw-semibold' : 'text-success'
    status.textContent = info.error ? info.error : info.behind > 0 ? info.behind + ' pembaruan tersedia.' : info.checking ? '' : 'Sudah versi terbaru.'
    var open = card.querySelector('[data-update-open]')
    open.hidden = !(info.behind > 0)
    open.onclick = function () { openDialog(info) }
    var refresh = card.querySelector('[data-update-refresh]')
    refresh.disabled = !!info.checking
    refresh.onclick = function () {
      refresh.disabled = true
      status.className = 'text-secondary'
      status.textContent = 'Memeriksa GitHub...'
      check(0, true)
    }
  }

  function check(attempt, force) {
    ask('/system/update' + (force && !attempt ? '?refresh=1' : '')).then(function (result) {
      var info = result.data
      if (!result.ok || !info || !info.enabled) { fillCard(null); return }
      if (info.behind > 0) showBar(info)
      else removeBar()
      fillCard(info)
      // the first look at GitHub runs in the background: ask again shortly
      if (info.checking && (attempt || 0) < 8) window.setTimeout(function () { check((attempt || 0) + 1, force) }, force ? 3000 : 5000)
    }).catch(function () { fillCard(null) })
  }

  function start() {
    var me = session()
    if (!me || me.role !== 'Master Admin' || !window.KoiAuth || !window.KoiAuth.apiRequest) return
    check(0)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
  else window.setTimeout(start, 600)
})()

// ---- The version in the footers and the Change Log: V<major>-<date>-<GitHub commit>, from /api/version ---------------------------------
// The page has a fixed text (V2-261024); the server adds the 7 letters of the GitHub commit this program is on (V2-261024-a3a285e).
;(function () {
  var cacheKey = 'koi-app-version'
  function paint(text) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-app-version]'), function (element) { element.textContent = text })
  }
  function start() {
    if (!document.querySelector('[data-app-version]')) return
    var cached = null
    try { cached = JSON.parse(sessionStorage.getItem(cacheKey) || 'null') } catch (error) { cached = null }
    if (cached && cached.full && cached.at > Date.now() - 300000) { paint(cached.full); return }
    window.fetch('/api/version').then(function (response) { return response.ok ? response.json() : null }).then(function (data) {
      if (!data || !data.full) return
      paint(data.full)
      try { sessionStorage.setItem(cacheKey, JSON.stringify({ full: data.full, at: Date.now() })) } catch (error) { /* only a convenience */ }
    }).catch(function () { /* offline: the text of the page stays */ })
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
  else start()
})()
