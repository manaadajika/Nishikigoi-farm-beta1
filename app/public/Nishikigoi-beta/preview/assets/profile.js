// Profile card: clicking a person's picture or name (anything with data-profile-id="<account id>") opens that account's profile.
// Data comes from GET /api/messages/profile/{id}; e-mail and phone are sent only for your own account and to a Master Admin.
;(function () {
  'use strict'
  if (window.KoiProfile) return

  var style = document.createElement('style')
  style.textContent = [
    '[data-profile-id]{cursor:pointer}',
    '[data-profile-id]:hover .koi-profile-name,.koi-profile-link:hover{text-decoration:underline}',
    '.koi-profile-overlay{position:fixed;inset:0;z-index:1100;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:1rem}',
    '.koi-profile-overlay[hidden]{display:none}',
    '.koi-profile-card{position:relative;width:min(680px,100%);max-height:100%;overflow:auto;background:var(--tblr-bg-surface);color:var(--tblr-body-color);border:1px solid var(--tblr-border-color);border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.5)}',
    '.koi-profile-cover{width:100%;height:clamp(96px,26vw,190px);background:linear-gradient(135deg,var(--tblr-primary),var(--tblr-bg-surface-secondary));background-size:cover;background-position:center}',
    '.koi-profile-close{position:absolute;top:.6rem;right:.6rem;width:2.1rem;height:2.1rem;border:0;border-radius:50%;background:rgba(0,0,0,.35);color:#fff;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0}',
    '.koi-profile-body{padding:0 1.5rem 1.5rem;text-align:center}',
    '.koi-profile-avatar{position:relative;z-index:1;margin:-48px auto .75rem;width:96px;height:96px;border-radius:50%;border:4px solid var(--tblr-bg-surface);background-color:var(--tblr-bg-surface-secondary);background-size:cover;background-position:center;display:flex;align-items:center;justify-content:center;font-size:2rem;font-weight:600}',
    '.koi-profile-title{font-size:1.25rem;font-weight:700;line-height:1.2;word-break:break-word}',
    '.koi-profile-sub{color:var(--tblr-secondary)}',
    '.koi-profile-badges{display:flex;gap:.4rem;justify-content:center;flex-wrap:wrap;margin:.75rem 0}',
    '.koi-profile-presence{display:inline-flex;align-items:center;gap:.4rem;font-size:.85rem;color:var(--tblr-secondary)}',
    '.koi-profile-presence i{display:inline-block;width:.55rem;height:.55rem;border-radius:50%;background:var(--tblr-secondary)}',
    '.koi-profile-presence.is-online i{background:var(--tblr-green,#2fb344)}',
    '.koi-profile-list{margin:1rem 0 0;padding:0;list-style:none;text-align:left;border-top:1px solid var(--tblr-border-color)}',
    '.koi-profile-list li{display:flex;justify-content:space-between;gap:1rem;padding:.6rem 0;border-bottom:1px solid var(--tblr-border-color)}',
    '.koi-profile-list li span:first-child{color:var(--tblr-secondary);flex:none}',
    '.koi-profile-list li span:last-child{text-align:right;word-break:break-word}',
    '.koi-profile-social{margin:1.25rem -1.5rem -1.5rem;border-top:1px solid var(--tblr-border-color);text-align:left}',
    '.koi-profile-actions{display:flex;gap:.5rem;justify-content:center;flex-wrap:wrap;margin-top:1.1rem}',
  ].join('\n')
  document.head.appendChild(style)

  var overlay = document.createElement('div')
  overlay.className = 'koi-profile-overlay'
  overlay.hidden = true
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-label', 'Profil')
  overlay.innerHTML = '<div class="koi-profile-card"><div class="koi-profile-cover"></div>' +
    '<button type="button" class="koi-profile-close" data-kp="close" aria-label="Tutup"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></svg></button>' +
    '<div class="koi-profile-body" data-kp="body"></div></div>'
  document.body.appendChild(overlay)
  var body = overlay.querySelector('[data-kp="body"]')
  var cover = overlay.querySelector('.koi-profile-cover')
  var token = 0

  var escapeHtml = function (value) { return String(value == null ? '' : value).replace(/[&<>'"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c] }) }
  var initials = function (p) { return String(p.name || p.username || 'U').split(/\s+/).filter(Boolean).slice(0, 2).map(function (s) { return s.charAt(0).toUpperCase() }).join('') || 'U' }
  var roleColor = function (role) { return { 'Master Admin': 'purple', Admin: 'azure', Operator: 'green' }[role] || 'secondary' }
  var parseDate = function (value) {
    var m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/)
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null
  }
  var longDate = function (value) {
    var d = parseDate(value)
    return d ? (window.KoiAuth && window.KoiAuth.formatDate ? window.KoiAuth.formatDate(d) : d.toLocaleDateString('id-ID')) : '-'
  }
  var ago = function (value) {
    var d = parseDate(value)
    if (!d) return ''
    var s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000))
    if (s < 60) return 'baru saja'
    if (s < 3600) return Math.floor(s / 60) + ' menit lalu'
    if (s < 86400) return Math.floor(s / 3600) + ' jam lalu'
    return Math.floor(s / 86400) + ' hari lalu'
  }

  var close = function () { token += 1; overlay.hidden = true }
  var render = function (p) {
    cover.style.backgroundImage = p.cover ? 'url(' + p.cover + ')' : ''
    var avatar = p.avatar ? '<div class="koi-profile-avatar" style="background-image:url(' + escapeHtml(p.avatar) + ')"></div>' : '<div class="koi-profile-avatar">' + escapeHtml(initials(p)) + '</div>'
    var presence = p.online ? '<span class="koi-profile-presence is-online"><i></i>Online sekarang</span>'
      : p.last_seen_at ? '<span class="koi-profile-presence"><i></i>Terakhir aktif ' + escapeHtml(ago(p.last_seen_at)) + '</span>'
      : '<span class="koi-profile-presence"><i></i>Tidak sedang login</span>'
    var rows = [['Peran', escapeHtml(p.role || '-')], ['Status akun', escapeHtml(p.status === 'Active' ? 'Aktif' : p.status || '-')], ['Bergabung', escapeHtml(longDate(p.joined_at))]]
    if ('email' in p) rows.push(['Email', escapeHtml(p.email || '-')])
    if ('phone' in p) rows.push(['Telepon', escapeHtml(p.phone || '-')])
    var actions = ''
    if (p.can_message && window.KoiMessenger) actions += '<button type="button" class="btn btn-primary" data-kp="message" data-id="' + p.id + '">' + (p.is_me ? 'Catatan pribadi' : 'Kirim pesan') + '</button>'
    if (p.is_me) actions += '<a class="btn" href="./settings.html">Edit profil</a>'
    body.innerHTML = avatar +
      '<div class="koi-profile-title">' + escapeHtml(p.name || p.username) + (p.is_me ? ' <span class="text-secondary fw-normal">(Anda)</span>' : '') + '</div>' +
      '<div class="koi-profile-sub">@' + escapeHtml(p.username || '') + '</div>' +
      '<div class="koi-profile-badges"><span class="badge bg-' + roleColor(p.role) + '-lt">' + escapeHtml(p.role || '-') + '</span></div>' +
      presence +
      '<ul class="koi-profile-list">' + rows.map(function (r) { return '<li><span>' + r[0] + '</span><span>' + r[1] + '</span></li>' }).join('') + '</ul>' +
      (actions ? '<div class="koi-profile-actions">' + actions + '</div>' : '') +
      '<div class="koi-profile-social" data-kp="social"></div>'
    var social = body.querySelector('[data-kp="social"]')
    if (window.KoiSocial) window.KoiSocial.mount(social, { mode: 'user', userId: p.id, isMe: p.is_me })
    else social.remove()
  }
  var open = function (id) {
    if (!id || !window.KoiAuth || !window.KoiAuth.apiRequest) return
    var mine = ++token
    body.innerHTML = '<div class="py-5 text-secondary"><span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Memuat profil...</div>'
    overlay.hidden = false
    cover.style.backgroundImage = ''
    window.KoiAuth.apiRequest('/messages/profile/' + encodeURIComponent(id)).then(function (response) {
      return response.json().catch(function () { return null }).then(function (data) {
        if (!response.ok) throw new Error((data && data.error) || 'Profil tidak bisa dimuat')
        return data
      })
    }).then(function (data) {
      if (mine === token) render(data)
    }).catch(function (error) {
      if (mine === token) body.innerHTML = '<div class="py-5 text-danger">' + escapeHtml(error.message) + '</div>'
    })
  }

  overlay.addEventListener('click', function (event) {
    if (event.target === overlay || event.target.closest('[data-kp="close"]')) { close(); return }
    var message = event.target.closest('[data-kp="message"]')
    if (message) {
      var id = message.getAttribute('data-id')
      close()
      if (window.KoiMessenger) window.KoiMessenger.open(id)
    }
  })
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !overlay.hidden) { event.stopPropagation(); close() }
  }, true)
  // anything with data-profile-id opens that profile (captured first, so a row around it does not also react)
  document.addEventListener('click', function (event) {
    var target = event.target.closest && event.target.closest('[data-profile-id]')
    if (!target || overlay.contains(target)) return
    event.preventDefault()
    event.stopPropagation()
    open(target.getAttribute('data-profile-id'))
  }, true)

  // your own profile (the menu of the profile picture): your id is the one flagged is_me in the account list
  var openMine = function () {
    if (!window.KoiAuth || !window.KoiAuth.apiRequest) return
    window.KoiAuth.apiRequest('/messages/users?q=').then(function (r) { return r.json() }).then(function (users) {
      var me = users.filter(function (u) { return u.is_me })[0]
      if (me) open(me.id)
    }).catch(function () {})
  }

  window.KoiProfile = { open: open, close: close, openMine: openMine }
})()
