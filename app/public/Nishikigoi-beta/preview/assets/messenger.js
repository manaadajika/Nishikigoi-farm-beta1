// Messenger: the message icon next to the notification bell. A click opens a small panel (conversation list; a chat opens inside it),
// the expand button opens the full layout (list on the left, chat on the right). Uses the same /api/messages/* routes as before.
// "?pesan=1" opens the full layout (the old Settings > Message address redirects there), "&user=ID" also opens that chat.
;(function () {
  'use strict'
  if (window.KoiMessenger) return
  var MAX_IMAGES = 15
  var bell = document.getElementById('navbar-notifications-toggle')
  var bellItem = bell && bell.closest('.nav-item')
  var navList = bellItem && bellItem.parentNode
  if (!navList || !window.KoiAuth || !window.KoiAuth.getSession || !window.KoiAuth.getSession()) return

  var ICON = {
    chat: '<path d="M3 20l1.3 -3.9a9 8 0 1 1 3.4 2.9l-4.7 1" />',
    expand: '<path d="M4 8v-2a2 2 0 0 1 2 -2h2" /><path d="M4 16v2a2 2 0 0 0 2 2h2" /><path d="M16 4h2a2 2 0 0 1 2 2v2" /><path d="M16 20h2a2 2 0 0 0 2 -2v-2" />',
    collapse: '<path d="M5 9l4 0l0 -4" /><path d="M3 3l6 6" /><path d="M5 15l4 0l0 4" /><path d="M3 21l6 -6" /><path d="M19 9l-4 0l0 -4" /><path d="M15 9l6 -6" /><path d="M19 15l-4 0l0 4" /><path d="M15 15l6 6" />',
    close: '<path d="M18 6l-12 12" /><path d="M6 6l12 12" />',
    compose: '<path d="M7 7h-1a2 2 0 0 0 -2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2 -2v-1" /><path d="M20.385 6.585a2.1 2.1 0 0 0 -2.97 -2.97l-8.415 8.385v3h3l8.385 -8.415" /><path d="M16 5l3 3" />',
    back: '<path d="M5 12l14 0" /><path d="M5 12l6 6" /><path d="M5 12l6 -6" />',
    dots: '<path d="M5 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M19 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />',
    mail: '<path d="M3 7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-10" /><path d="M3 7l9 6l9 -6" />',
    mailOpen: '<path d="M3 9l9 6l9 -6l-9 -6l-9 6" /><path d="M21 9v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-10" /><path d="M3 19l6 -6" /><path d="M21 19l-6 -6" />',
    pin: '<path d="M15 4.5l-4 4l-4 1.5l-1.5 1.5l7 7l1.5 -1.5l1.5 -4l4 -4" /><path d="M9 15l-4.5 4.5" /><path d="M14.5 4l5.5 5.5" />',
    bellOff: '<path d="M9.346 5.353c.21 -.129 .428 -.246 .654 -.353a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3m-1.18 2.82h-13.82a4 4 0 0 0 2 -3v-3a6.97 6.97 0 0 1 1.347 -4.147" /><path d="M9 17v1a3 3 0 0 0 6 0v-1" /><path d="M3 3l18 18" />',
    trash: '<path d="M4 7l16 0" /><path d="M10 11l0 6" /><path d="M14 11l0 6" /><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" /><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />',
    photo: '<path d="M15 8h.01" /><path d="M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12" /><path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5" /><path d="M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3" />',
  }
  var icon = function (name, size) {
    var px = size || 22
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + px + '" height="' + px + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" class="icon">' + ICON[name] + '</svg>'
  }

  // ---------- styles
  var style = document.createElement('style')
  style.textContent = [
    '.koi-msgr-menu{padding:0;width:400px;max-width:calc(100vw - 16px);overflow:hidden}',
    '.koi-msgr-menu .koi-msgr{height:min(580px,calc(100vh - 110px))}',
    '.koi-msgr{display:flex;position:relative;height:100%;background:var(--tblr-bg-surface);color:var(--tblr-body-color)}',
    '.koi-msgr button{font:inherit}',
    '.koi-msgr-side{display:flex;flex-direction:column;min-width:0;width:100%;position:relative}',
    '.koi-msgr-main{display:none;flex-direction:column;min-width:0;flex:1}',
    '.koi-msgr.has-chat .koi-msgr-side{display:none}',
    '.koi-msgr.has-chat .koi-msgr-main{display:flex}',
    '.koi-msgr-head{display:flex;align-items:center;gap:.5rem;padding:.9rem 1rem .5rem}',
    '.koi-msgr-title{font-weight:700;font-size:1.05rem;display:flex;align-items:center;gap:.5rem;flex:1;min-width:0}',
    '.koi-msgr-title .badge{font-size:.7rem}',
    '.koi-msgr-iconbtn{border:0;background:transparent;color:inherit;width:2.1rem;height:2.1rem;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;padding:0;cursor:pointer}',
    '.koi-msgr-iconbtn:hover{background:var(--tblr-bg-surface-secondary)}',
    '.koi-msgr-search{padding:.25rem 1rem .6rem;display:none}',
    '.koi-msgr.is-expanded .koi-msgr-search,.koi-msgr.is-searching .koi-msgr-search{display:block}',
    '.koi-msgr-search input{border-radius:999px;background:var(--tblr-bg-surface-secondary);border:0;padding:.5rem 1rem}',
    '.koi-msgr-list{flex:1;overflow:auto;padding-bottom:4.5rem}',
    '.koi-msgr-row{display:flex;align-items:center;gap:.75rem;width:100%;padding:.55rem 1rem;border:0;background:transparent;text-align:left;color:inherit;cursor:pointer}',
    '.koi-msgr-row:hover,.koi-msgr-row.is-active{background:var(--tblr-bg-surface-secondary)}',
    '.koi-msgr-row .avatar{flex:none;width:3rem;height:3rem}',
    '.koi-msgr-copy{min-width:0;flex:1}',
    '.koi-msgr-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.25}',
    '.koi-msgr-preview{font-size:.82rem;color:var(--tblr-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.25}',
    '.koi-msgr-row.is-unread .koi-msgr-name,.koi-msgr-row.is-unread .koi-msgr-preview{font-weight:700;color:var(--tblr-body-color)}',
    '.koi-msgr-flags{display:inline-flex;align-items:center;gap:.4rem;flex:none;color:var(--tblr-secondary)}',
    '.koi-msgr-flags .icon{width:1rem;height:1rem}',
    '.koi-msgr-more{flex:none;display:none;width:2rem;height:2rem;border:0;border-radius:50%;background:transparent;color:var(--tblr-secondary);align-items:center;justify-content:center;padding:0;cursor:pointer}',
    '.koi-msgr-more:hover{background:var(--tblr-bg-surface-tertiary,var(--tblr-bg-surface))}',
    '.koi-msgr-row:hover .koi-msgr-more,.koi-msgr-row:focus-within .koi-msgr-more,.koi-msgr-row.has-pop .koi-msgr-more{display:inline-flex}',
    '.koi-msgr-row:hover .koi-msgr-flags,.koi-msgr-row:focus-within .koi-msgr-flags,.koi-msgr-row.has-pop .koi-msgr-flags{display:none}',
    '@media (hover:none){.koi-msgr-more{display:inline-flex}.koi-msgr-row:hover .koi-msgr-flags{display:inline-flex}.koi-msgr-flags .koi-msgr-dot{display:none}}',
    '.koi-msgr-pop{position:absolute;z-index:6;min-width:13.5rem;padding:.4rem;border-radius:14px;background:var(--tblr-bg-surface);border:1px solid var(--tblr-border-color);box-shadow:0 10px 30px rgba(0,0,0,.4)}',
    '.koi-msgr-pop[hidden]{display:none}',
    '.koi-msgr-pop button{display:flex;align-items:center;justify-content:space-between;gap:1rem;width:100%;padding:.55rem .7rem;border:0;border-radius:10px;background:transparent;color:inherit;text-align:left;cursor:pointer}',
    '.koi-msgr-pop button:hover{background:var(--tblr-bg-surface-secondary)}',
    '.koi-msgr-pop button.is-danger{color:var(--tblr-red,#d63939)}',
    '.koi-msgr-dot{flex:none;width:.6rem;height:.6rem;border-radius:50%;background:var(--tblr-primary)}',
    '.koi-msgr-note{padding:1rem;color:var(--tblr-secondary);font-size:.9rem}',
    '.koi-msgr-fab{position:absolute;right:1rem;bottom:1rem;width:3.2rem;height:3.2rem;border-radius:50%;border:1px solid var(--tblr-border-color);background:var(--tblr-bg-surface-secondary);color:inherit;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(0,0,0,.3);cursor:pointer}',
    '.koi-msgr-fab:hover{background:var(--tblr-bg-surface-tertiary,var(--tblr-bg-surface-secondary))}',
    '.koi-msgr-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:.5rem;padding:2rem;color:var(--tblr-secondary)}',
    '.koi-msgr-chat{display:none;flex-direction:column;flex:1;min-height:0}',
    '.koi-msgr-chat.is-open{display:flex}',
    '.koi-msgr-chathead{display:flex;align-items:center;gap:.65rem;padding:.65rem .9rem;border-bottom:1px solid var(--tblr-border-color)}',
    '.koi-msgr-chathead .avatar{flex:none}',
    '.koi-msgr-thread{flex:1;overflow:auto;padding:1rem;display:flex;flex-direction:column;gap:.3rem}',
    '.koi-msgr-bubble{max-width:75%;padding:.5rem .8rem;border-radius:18px;word-break:break-word}',
    '.koi-msgr-bubble.is-mine{align-self:flex-end;background:var(--tblr-primary);color:var(--tblr-primary-fg,#fff);border-bottom-right-radius:6px}',
    '.koi-msgr-bubble.is-theirs{align-self:flex-start;background:var(--tblr-bg-surface-secondary);border-bottom-left-radius:6px}',
    '.koi-msgr-text{white-space:pre-wrap}',
    '.koi-msgr-images{display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:.25rem;margin-top:.35rem}',
    '.koi-msgr-images img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px;cursor:zoom-in;background:rgba(127,127,127,.2)}',
    '.koi-msgr-meta{font-size:.66rem;opacity:.75;margin-top:.15rem;display:flex;gap:.5rem;justify-content:flex-end;align-items:center}',
    '.koi-msgr-meta button{border:0;background:transparent;color:inherit;padding:0;text-decoration:underline;font-size:inherit;cursor:pointer}',
    '.koi-msgr-deleted{font-size:.75rem;font-style:italic;color:var(--tblr-secondary);padding:.1rem .5rem}',
    '.koi-msgr-deleted.is-mine{align-self:flex-end}',
    '.koi-msgr-composer{padding:.65rem .75rem;display:flex;flex-direction:column;gap:.45rem;border-top:1px solid var(--tblr-border-color)}',
    '.koi-msgr-previews{display:flex;flex-wrap:wrap;gap:.35rem}',
    '.koi-msgr-prev{position:relative}',
    '.koi-msgr-prev img{width:56px;height:56px;object-fit:cover;border-radius:8px;border:1px solid var(--tblr-border-color)}',
    '.koi-msgr-prev button{position:absolute;top:-6px;right:-6px;width:1.2rem;height:1.2rem;padding:0;line-height:1;border-radius:50%;border:0;background:var(--tblr-red,#d63939);color:#fff;cursor:pointer}',
    '.koi-msgr-inputrow{display:flex;gap:.5rem;align-items:flex-end}',
    '.koi-msgr-inputrow textarea{flex:1;resize:none;max-height:140px;border-radius:20px;padding:.5rem 1rem}',
    '.koi-msgr-error{font-size:.8rem;color:var(--tblr-red,#d63939)}',
    // the full layout
    '.koi-msgr-overlay{position:fixed;inset:0;z-index:1090;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:1rem}',
    '.koi-msgr-overlay[hidden]{display:none}',
    '.koi-msgr-box{width:min(1220px,100%);height:min(820px,100%);background:var(--tblr-bg-surface);border:1px solid var(--tblr-border-color);border-radius:14px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.5)}',
    '.koi-msgr.is-expanded .koi-msgr-side{display:flex;flex:0 0 380px;width:380px;border-right:1px solid var(--tblr-border-color)}',
    '.koi-msgr.is-expanded .koi-msgr-main{display:flex}',
    '.koi-msgr.is-expanded .koi-msgr-back,.koi-msgr.is-expanded .koi-msgr-fab{display:none}',
    '.koi-msgr.is-expanded .koi-msgr-list{padding-bottom:.5rem}',
    '.koi-msgr:not(.is-expanded) .km-expanded-only{display:none}',
    '.koi-msgr.is-expanded .km-compact-only{display:none}',
    '.koi-msgr-thread-pad{padding:1rem 1.5rem}',
    '@media (max-width:767.98px){',
    '  .koi-msgr-menu{position:fixed!important;left:8px!important;right:8px!important;top:60px!important;inset-inline:8px!important;transform:none!important;width:auto;max-width:none}',
    '  .koi-msgr-menu .koi-msgr{height:min(50vh,440px)}',   // half the screen: the new-message button must stay above the floating toolbar
    '  .km-expand{display:none}',
    '  .koi-msgr-bubble{max-width:88%}',
    '}',
  ].join('\n')
  document.head.appendChild(style)

  // ---------- markup
  var item = document.createElement('div')
  item.className = 'nav-item dropdown koi-msgr-item'
  item.innerHTML =
    '<a href="#" id="navbar-messages-toggle" class="nav-link px-0" data-bs-toggle="dropdown" data-bs-auto-close="outside" aria-label="Pesan" aria-expanded="false" title="Pesan">' +
      icon('chat', 24) + '<span class="badge bg-red d-none" data-message-unread>0</span></a>' +
    '<div class="dropdown-menu dropdown-menu-arrow dropdown-menu-end koi-msgr-menu"></div>'
  navList.insertBefore(item, bellItem)
  var toggle = item.querySelector('#navbar-messages-toggle')
  var menu = item.querySelector('.koi-msgr-menu')

  var root = document.createElement('div')
  root.className = 'koi-msgr'
  root.innerHTML =
    '<section class="koi-msgr-side">' +
      '<div class="koi-msgr-head">' +
        '<div class="koi-msgr-title">Messages <span class="badge bg-red d-none" data-message-unread>0</span></div>' +
        '<button type="button" class="koi-msgr-iconbtn km-expanded-only" data-km="compose" title="Pesan baru" aria-label="Pesan baru">' + icon('compose', 20) + '</button>' +
        '<button type="button" class="koi-msgr-iconbtn km-compact-only km-expand" data-km="expand" title="Buka layar penuh" aria-label="Buka layar penuh">' + icon('expand', 20) + '</button>' +
        '<button type="button" class="koi-msgr-iconbtn km-expanded-only" data-km="collapse" title="Kecilkan" aria-label="Kecilkan">' + icon('collapse', 20) + '</button>' +
        '<button type="button" class="koi-msgr-iconbtn" data-km="close" title="Tutup" aria-label="Tutup">' + icon('close', 20) + '</button>' +
      '</div>' +
      '<div class="koi-msgr-search"><input class="form-control" type="search" name="messenger_search" placeholder="Cari nama, username, atau email" autocomplete="off" data-km="search" /></div>' +
      '<div class="koi-msgr-list" data-km="list"><div class="koi-msgr-note">Memuat percakapan...</div></div>' +
      '<button type="button" class="koi-msgr-fab" data-km="compose" title="Pesan baru" aria-label="Pesan baru">' + icon('compose', 22) + '</button>' +
    '</section>' +
    '<section class="koi-msgr-main">' +
      '<div class="koi-msgr-empty" data-km="empty">' + icon('chat', 40) + '<div class="fw-semibold">Pesan Anda</div><div>Pilih percakapan di sebelah kiri, atau cari akun untuk mulai berkirim pesan.</div><div class="small">Pesan dan gambar disimpan terenkripsi di server.</div></div>' +
      '<div class="koi-msgr-chat" data-km="chat">' +
        '<div class="koi-msgr-chathead">' +
          '<button type="button" class="koi-msgr-iconbtn koi-msgr-back" data-km="back" title="Kembali" aria-label="Kembali">' + icon('back', 20) + '</button>' +
          '<span class="avatar avatar-sm" data-km="avatar"></span>' +
          '<div class="min-w-0 flex-fill"><div class="fw-semibold" data-km="pname"></div><div class="text-secondary small" data-km="psub"></div></div>' +
          '<button type="button" class="koi-msgr-iconbtn km-compact-only km-expand" data-km="expand" title="Buka layar penuh" aria-label="Buka layar penuh">' + icon('expand', 20) + '</button>' +
          '<button type="button" class="koi-msgr-iconbtn km-compact-only" data-km="close" title="Tutup" aria-label="Tutup">' + icon('close', 20) + '</button>' +
        '</div>' +
        '<div class="koi-msgr-thread" data-km="thread"></div>' +
        '<form class="koi-msgr-composer" data-km="form">' +
          '<div class="koi-msgr-error d-none" data-km="error"></div>' +
          '<div class="koi-msgr-previews" data-km="previews"></div>' +
          '<div class="koi-msgr-inputrow">' +
            '<button type="button" class="koi-msgr-iconbtn" data-km="attach" title="Lampirkan gambar (maksimal ' + MAX_IMAGES + ')" aria-label="Lampirkan gambar">' + icon('photo', 22) + '</button>' +
            '<input class="d-none" type="file" accept="image/*" multiple data-km="file" />' +
            '<textarea class="form-control" name="messenger_text" rows="1" maxlength="5000" placeholder="Tulis pesan" data-km="text"></textarea>' +
            '<button type="submit" class="btn btn-primary" data-km="send">Kirim</button>' +
          '</div>' +
        '</form>' +
      '</div>' +
    '</section>'
  menu.appendChild(root)

  var overlay = document.createElement('div')
  overlay.className = 'koi-msgr-overlay'
  overlay.hidden = true
  overlay.innerHTML = '<div class="koi-msgr-box" data-km="box"></div>'
  document.body.appendChild(overlay)
  var box = overlay.querySelector('[data-km="box"]')

  var $ = function (name) { return root.querySelector('[data-km="' + name + '"]') }
  var listEl = $('list'), searchEl = $('search'), emptyEl = $('empty'), chatEl = $('chat'), threadEl = $('thread')
  var form = $('form'), textEl = $('text'), fileEl = $('file'), previewsEl = $('previews'), errorEl = $('error'), sendButton = $('send')

  // ---------- helpers
  var conversations = [], results = null, partner = null, messages = [], pending = []
  var pop = null
  var listSignature = '', threadSignature = '', pollTimer = null, searchTimer = null, busyList = false
  var blobCache = {}
  var escapeHtml = function (value) { return String(value == null ? '' : value).replace(/[&<>'"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c] }) }
  var initials = function (p) { return String(p.name || p.username || 'U').split(/\s+/).filter(Boolean).slice(0, 2).map(function (s) { return s.charAt(0).toUpperCase() }).join('') || 'U' }
  // a picture opens that account's profile (data-profile-id, see profile.js)
  var avatarHtml = function (p, size) {
    var link = ' data-profile-id="' + escapeHtml(p.id) + '" title="Lihat profil"'
    return p.avatar ? '<span class="avatar avatar-' + size + '"' + link + ' style="background-image:url(' + escapeHtml(p.avatar) + ')"></span>' : '<span class="avatar avatar-' + size + '"' + link + '>' + escapeHtml(initials(p)) + '</span>'
  }
  var displayName = function (p) { return (p.name || p.username || '') + (p.is_me ? ' (Anda)' : '') }
  var api = function (path, options) { return window.KoiAuth.apiRequest(path, options) }
  var json = function (path, options) {
    return api(path, options).then(function (response) {
      return response.json().catch(function () { return null }).then(function (data) {
        if (!response.ok) throw new Error((data && data.error) || 'Permintaan gagal diproses')
        return data
      })
    })
  }
  var parseDate = function (value) {
    var match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/)
    return match ? new Date(+match[1], +match[2] - 1, +match[3], +match[4], +match[5], +(match[6] || 0)) : null
  }
  var ago = function (value) {
    var date = parseDate(value)
    if (!date) return ''
    var seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000))
    if (seconds < 60) return 'baru saja'
    if (seconds < 3600) return Math.floor(seconds / 60) + ' mnt'
    if (seconds < 86400) return Math.floor(seconds / 3600) + ' jam'
    if (seconds < 604800) return Math.floor(seconds / 86400) + ' hari'
    return Math.floor(seconds / 604800) + ' mgg'
  }
  var clock = function (value) {
    var date = parseDate(value)
    if (!date) return ''
    var now = new Date()
    var hm = ('0' + date.getHours()).slice(-2) + ':' + ('0' + date.getMinutes()).slice(-2)
    var same = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()
    return same ? hm : (window.KoiAuth && window.KoiAuth.formatDate ? window.KoiAuth.formatDate(date) : date.toLocaleDateString('id-ID')) + ' ' + hm
  }
  var setError = function (message) {
    errorEl.textContent = message || ''
    errorEl.classList.toggle('d-none', !message)
  }
  var refreshUnread = function () { if (window.KoiMessages && window.KoiMessages.refreshUnread) window.KoiMessages.refreshUnread() }

  // ---------- conversation list
  var lastRender = 0
  var renderList = function () {
    lastRender = Date.now()
    var showing = results !== null
    var items = showing ? results : conversations
    if (!items.length) {
      listEl.innerHTML = '<div class="koi-msgr-note">' + (showing ? 'Tidak ada akun yang cocok.' : 'Belum ada percakapan. Ketuk tombol pesan baru untuk mencari akun.') + '</div>'
      return
    }
    listEl.innerHTML = items.map(function (c) {
      var unread = !showing && (c.unread || c.marked_unread)
      var line = showing ? '@' + (c.username || '') : (c.last_from_me ? 'Anda: ' : '') + (c.preview || '') + (c.last_at ? ' · ' + ago(c.last_at) : '')
      var flags = showing ? '' : '<span class="koi-msgr-flags">' + (c.muted ? '<span title="Dibisukan">' + icon('bellOff', 16) + '</span>' : '') + (c.pinned ? '<span title="Disematkan">' + icon('pin', 16) + '</span>' : '') +
        (unread ? '<span class="koi-msgr-dot" title="Belum dibaca"></span>' : '') + '</span>'
      return '<div class="koi-msgr-row ' + (partner && partner.id === c.id ? 'is-active ' : '') + (unread ? 'is-unread ' : '') + (pop && pop.dataset.id === String(c.id) && !pop.hidden ? 'has-pop' : '') + '" role="button" tabindex="0" data-km-open="' + escapeHtml(c.id) + '">' +
        avatarHtml(c, 'md') +
        '<div class="koi-msgr-copy"><div class="koi-msgr-name">' + escapeHtml(displayName(c)) + '</div><div class="koi-msgr-preview">' + escapeHtml(line) + '</div></div>' +
        flags +
        (showing ? '' : '<button type="button" class="koi-msgr-more" data-km-more="' + escapeHtml(c.id) + '" title="Opsi" aria-label="Opsi percakapan">' + icon('dots', 20) + '</button>') + '</div>'
    }).join('')
  }
  var loadConversations = function () {
    return json('/messages/conversations').then(function (data) {
      var signature = JSON.stringify(data)
      conversations = data
      if (signature !== listSignature) {
        listSignature = signature
        if (results === null) renderList()
      } else if (results === null && Date.now() - lastRender > 60000) {
        renderList()   // the "x mnt" labels move on (not on every poll: a re-drawn row would eat a click that is in progress)
      }
      refreshUnread()
    })
  }
  searchEl.addEventListener('input', function () {
    window.clearTimeout(searchTimer)
    var query = searchEl.value.trim()
    if (!query) {
      results = null
      if (!root.classList.contains('is-expanded')) root.classList.remove('is-searching')
      renderList()
      return
    }
    searchTimer = window.setTimeout(function () {
      json('/messages/users?q=' + encodeURIComponent(query)).then(function (data) { results = data }).catch(function () { results = [] }).then(renderList)
    }, 250)
  })

  // ---------- thread
  var loadImage = function (img) {
    var id = img.dataset.attachment
    if (blobCache[id]) { img.src = blobCache[id]; return }
    api('/messages/attachments/' + id).then(function (response) {
      if (!response.ok) return null
      return response.blob()
    }).then(function (blob) {
      if (!blob) return
      blobCache[id] = URL.createObjectURL(blob)
      img.src = blobCache[id]
    }).catch(function () {})
  }
  var renderThread = function (stick) {
    threadEl.innerHTML = messages.map(function (m) {
      var side = m.mine ? 'is-mine' : 'is-theirs'
      if (m.deleted) return '<div class="koi-msgr-deleted ' + side + '">Pesan ini telah dihapus</div>'
      var images = m.attachments.map(function (a) { return '<img data-attachment="' + escapeHtml(a.id) + '" alt="Gambar" />' }).join('')
      return '<div class="koi-msgr-bubble ' + side + '">' +
        (m.text ? '<div class="koi-msgr-text">' + escapeHtml(m.text) + '</div>' : '') +
        (images ? '<div class="koi-msgr-images">' + images + '</div>' : '') +
        '<div class="koi-msgr-meta"><span>' + escapeHtml(clock(m.created_at)) + '</span>' +
        (m.mine ? '<span>' + (m.read ? 'Dibaca' : 'Terkirim') + '</span><button type="button" data-km-delete="' + m.id + '">Hapus</button>' : '') + '</div></div>'
    }).join('') || '<div class="koi-msgr-note">Belum ada pesan. Tulis pesan pertama di bawah.</div>'
    threadEl.querySelectorAll('img[data-attachment]').forEach(loadImage)
    if (stick) threadEl.scrollTop = threadEl.scrollHeight
  }
  var showPartner = function () {
    $('pname').textContent = displayName(partner)
    $('pname').setAttribute('data-profile-id', partner.id)
    $('pname').title = 'Lihat profil'
    $('avatar').setAttribute('data-profile-id', partner.id)
    $('avatar').title = 'Lihat profil'
    $('psub').textContent = partner.username ? '@' + partner.username : ''
    var avatar = $('avatar')
    avatar.style.backgroundImage = partner.avatar ? 'url(' + partner.avatar + ')' : ''
    avatar.textContent = partner.avatar ? '' : initials(partner)
  }
  var loadThread = function (first) {
    if (!partner) return Promise.resolve()
    var id = partner.id
    return json('/messages/thread/' + id).then(function (data) {
      if (!partner || partner.id !== id) return
      var signature = JSON.stringify(data.messages)
      partner = data.partner
      showPartner()
      if (first || signature !== threadSignature) {
        var near = threadEl.scrollHeight - threadEl.scrollTop - threadEl.clientHeight < 80
        threadSignature = signature
        messages = data.messages
        renderThread(first || near)
      }
      refreshUnread()
    })
  }
  var openConversation = function (id) {
    var known = conversations.concat(results || []).filter(function (c) { return String(c.id) === String(id) })[0]
    partner = known ? Object.assign({}, known) : { id: Number(id), name: '', username: '' }
    threadSignature = ''
    pending = []
    renderPreviews()
    setError('')
    emptyEl.style.display = 'none'
    chatEl.classList.add('is-open')
    root.classList.add('has-chat')
    root.classList.remove('is-searching')
    showPartner()
    renderList()
    return loadThread(true).then(loadConversations).then(renderList).catch(function (error) { setError(error.message) })
  }
  var closeConversation = function () {
    partner = null
    root.classList.remove('has-chat')
    chatEl.classList.remove('is-open')
    emptyEl.style.display = ''
    renderList()
  }
  // ---------- "more" menu of a conversation
  pop = document.createElement('div')
  pop.className = 'koi-msgr-pop'
  pop.hidden = true
  root.appendChild(pop)
  var hidePop = function () {
    if (pop.hidden) return
    pop.hidden = true
    pop.dataset.id = ''
    renderList()
  }
  var findConversation = function (id) { return conversations.filter(function (c) { return String(c.id) === String(id) })[0] }
  var showPop = function (id, anchor) {
    var c = findConversation(id)
    if (!c) return
    var isUnread = c.unread || c.marked_unread
    var item = function (action, iconName, label, danger) {
      return '<button type="button" data-km-act="' + action + '"' + (danger ? ' class="is-danger"' : '') + '><span>' + label + '</span>' + icon(iconName, 20) + '</button>'
    }
    pop.innerHTML =
      item('unread', isUnread ? 'mailOpen' : 'mail', isUnread ? 'Tandai sudah dibaca' : 'Tandai belum dibaca') +
      item('pin', 'pin', c.pinned ? 'Lepas sematan' : 'Sematkan') +
      item('mute', 'bellOff', c.muted ? 'Batalkan bisu' : 'Bisukan') +
      item('delete', 'trash', 'Hapus', true)
    pop.dataset.id = String(id)
    pop.hidden = false
    var rootBox = root.getBoundingClientRect()
    var box = anchor.getBoundingClientRect()
    if (!box.width) box = anchor.closest('.koi-msgr-row').getBoundingClientRect()   // the button shows on hover only
    var width = pop.offsetWidth
    var left = Math.min(Math.max(8, box.right - rootBox.left - width), Math.max(8, rootBox.width - width - 8))
    var top = box.bottom - rootBox.top + 4
    if (top + pop.offsetHeight > rootBox.height - 8) top = Math.max(8, box.top - rootBox.top - pop.offsetHeight - 4)
    pop.style.left = left + 'px'
    pop.style.top = top + 'px'
    renderList()
  }
  var runAction = async function (action) {
    var id = pop.dataset.id
    var c = findConversation(id)
    if (!c) { hidePop(); return }
    var post = function (path, body) { return json('/messages/conversations/' + id + path, { method: 'POST', body: JSON.stringify(body || {}) }) }
    var job
    if (action === 'unread') job = (c.unread || c.marked_unread) ? post('/prefs', { mark_read: true }) : post('/prefs', { marked_unread: true })
    else if (action === 'pin') job = post('/prefs', { pinned: !c.pinned })
    else if (action === 'mute') job = post('/prefs', { muted: !c.muted })
    else if (action === 'delete') {
      hidePop()
      if (!(await window.KoiDialog.confirm('Hapus percakapan dengan ' + displayName(c) + ' dari akun Anda? Pesan di akun lawan bicara tidak ikut terhapus.'))) return
      job = post('/delete').then(function () { if (partner && String(partner.id) === String(id)) closeConversation() })
    }
    hidePop()
    if (!job) return
    job.then(loadConversations).then(renderList).catch(function (error) { window.alert(error.message) })
  }
  pop.addEventListener('click', function (event) {
    var button = event.target.closest('[data-km-act]')
    if (button) runAction(button.getAttribute('data-km-act'))
  })
  document.addEventListener('click', function (event) {
    if (pop.hidden || event.target.closest('.koi-msgr-pop') || event.target.closest('[data-km-more]')) return
    hidePop()
  }, true)
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape') hidePop() })
  listEl.addEventListener('scroll', hidePop)

  listEl.addEventListener('click', function (event) {
    var more = event.target.closest('[data-km-more]')
    if (more) {
      event.stopPropagation()
      var same = !pop.hidden && pop.dataset.id === more.getAttribute('data-km-more')
      if (same) hidePop(); else showPop(more.getAttribute('data-km-more'), more)
      return
    }
    var row = event.target.closest('[data-km-open]')
    if (row) openConversation(row.getAttribute('data-km-open'))
  })
  listEl.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    if (event.target.closest('[data-km-more]')) return
    var row = event.target.closest('[data-km-open]')
    if (row) { event.preventDefault(); openConversation(row.getAttribute('data-km-open')) }
  })
  $('back').addEventListener('click', closeConversation)
  threadEl.addEventListener('click', async function (event) {
    var del = event.target.closest('[data-km-delete]')
    if (del) {
      if (!(await window.KoiDialog.confirm('Hapus pesan ini? Pesan akan tampil sebagai "Pesan ini telah dihapus" untuk kedua pihak.'))) return
      json('/messages/' + del.getAttribute('data-km-delete'), { method: 'DELETE' }).then(function () { return loadThread() }).then(loadConversations).catch(function (error) { setError(error.message) })
      return
    }
    var image = event.target.closest('img[data-attachment]')
    if (image && image.src) {
      if (window.KoiAuth && window.KoiAuth.zoomPhoto) window.KoiAuth.zoomPhoto(image.src, 'Gambar pesan', [image.getAttribute('alt') || ''])
      else window.open(image.src, '_blank', 'noopener')
    }
  })

  // ---------- composer
  var fileToDataUrl = function (file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader()
      reader.onerror = function () { reject(new Error('Gambar tidak bisa dibaca')) }
      reader.onload = function () {
        var image = new Image()
        image.onerror = function () { reject(new Error('File bukan gambar yang valid')) }
        image.onload = function () {
          var big = Math.max(image.width, image.height)
          var scale = big > 1280 ? 1280 / big : 1
          var canvas = document.createElement('canvas')
          canvas.width = Math.max(1, Math.round(image.width * scale))
          canvas.height = Math.max(1, Math.round(image.height * scale))
          canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
          resolve(canvas.toDataURL('image/jpeg', 0.8))
        }
        image.src = String(reader.result)
      }
      reader.readAsDataURL(file)
    })
  }
  function renderPreviews() {
    previewsEl.innerHTML = pending.map(function (src, index) {
      return '<div class="koi-msgr-prev"><img src="' + escapeHtml(src) + '" alt="Lampiran ' + (index + 1) + '" /><button type="button" data-km-remove="' + index + '" aria-label="Hapus lampiran">&times;</button></div>'
    }).join('')
  }
  $('attach').addEventListener('click', function () { fileEl.click() })
  fileEl.addEventListener('change', function () {
    var files = Array.prototype.slice.call(fileEl.files)
    fileEl.value = ''
    setError('')
    files.reduce(function (chain, file) {
      return chain.then(function () {
        if (pending.length >= MAX_IMAGES) { setError('Gambar maksimal ' + MAX_IMAGES + ' per pesan.'); return }
        return fileToDataUrl(file).then(function (src) { pending.push(src) }).catch(function (error) { setError(error.message) })
      })
    }, Promise.resolve()).then(renderPreviews)
  })
  previewsEl.addEventListener('click', function (event) {
    var button = event.target.closest('[data-km-remove]')
    if (!button) return
    pending.splice(Number(button.getAttribute('data-km-remove')), 1)
    renderPreviews()
  })
  textEl.addEventListener('input', function () {
    textEl.style.height = 'auto'
    textEl.style.height = Math.min(textEl.scrollHeight, 140) + 'px'
  })
  // Enter sends, Shift+Enter (or Enter on a touch screen) is a new line
  textEl.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches && !event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    form.requestSubmit()
  })
  form.addEventListener('submit', function (event) {
    event.preventDefault()
    if (!partner) return
    var text = textEl.value.trim()
    if (!text && pending.length === 0) { setError('Tulis pesan atau pilih gambar.'); return }
    sendButton.disabled = true
    setError('')
    json('/messages/send', { method: 'POST', body: JSON.stringify({ to: partner.id, body: text, images: pending }) }).then(function () {
      textEl.value = ''
      textEl.style.height = 'auto'
      pending = []
      renderPreviews()
      return loadThread(true)
    }).then(loadConversations).then(renderList).catch(function (error) { setError(error.message) }).then(function () { sendButton.disabled = false })
  })

  // ---------- compose (search for an account)
  var startCompose = function () {
    if (!root.classList.contains('is-expanded')) {
      closeConversation()
      root.classList.add('is-searching')
    }
    searchEl.value = ''
    results = null
    json('/messages/users?q=').then(function (data) { if (!searchEl.value.trim()) { results = data; renderList() } }).catch(function () {})
    searchEl.focus()
  }
  root.addEventListener('click', function (event) {
    var button = event.target.closest('[data-km]')
    if (!button) return
    var name = button.getAttribute('data-km')
    if (name === 'compose') startCompose()
    else if (name === 'expand') setExpanded(true)
    else if (name === 'collapse') setExpanded(false)
    else if (name === 'close') closeAll()
  })

  // ---------- open / close
  var dropdownApi = function () { return window.bootstrap && window.bootstrap.Dropdown ? window.bootstrap.Dropdown.getOrCreateInstance(toggle) : null }
  var isOpen = function () { return menu.classList.contains('show') || !overlay.hidden }
  var poll = function () {
    if (document.visibilityState !== 'visible' || !isOpen()) return
    loadConversations().then(function () { return loadThread() }).catch(function () {})
  }
  var startPolling = function () {
    window.clearInterval(pollTimer)
    pollTimer = window.setInterval(poll, 5000)
  }
  var stopPolling = function () { window.clearInterval(pollTimer) }
  var onOpened = function () {
    startPolling()
    loadConversations().catch(function () { listEl.innerHTML = '<div class="koi-msgr-note text-danger">Percakapan gagal dimuat.</div>' })
  }
  function setExpanded(expanded) {
    if (pop) pop.hidden = true
    root.classList.toggle('is-expanded', expanded)
    if (expanded) {
      overlay.hidden = false
      box.appendChild(root)
      var d = dropdownApi()
      if (d) d.hide(); else if (menu.classList.contains('show')) toggle.click()
      onOpened()
    } else {
      overlay.hidden = true
      menu.appendChild(root)
      root.classList.remove('is-searching')
      // one tick later: the click that got us here is still bubbling and would count as a click outside the panel
      window.setTimeout(function () {
        var instance = dropdownApi()
        if (instance) instance.show(); else if (!menu.classList.contains('show')) toggle.click()
      }, 0)
    }
  }
  function closeAll() {
    if (pop) pop.hidden = true
    overlay.hidden = true
    if (root.parentNode !== menu) menu.appendChild(root)
    root.classList.remove('is-expanded')
    var d = dropdownApi()
    if (d) d.hide(); else if (menu.classList.contains('show')) toggle.click()
    stopPolling()
  }
  overlay.addEventListener('click', function (event) { if (event.target === overlay) closeAll() })
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && !overlay.hidden) closeAll() })
  toggle.addEventListener('shown.bs.dropdown', onOpened)
  toggle.addEventListener('hidden.bs.dropdown', function () { if (overlay.hidden) stopPolling() })
  toggle.addEventListener('click', function (event) { event.preventDefault() })

  window.KoiMessenger = {
    open: function (userId) {
      setExpanded(true)
      if (userId) loadConversations().catch(function () {}).then(function () { return openConversation(userId) })
    },
  }
  refreshUnread()

  // ?pesan=1[&user=ID]: opens the full layout (also the target of the old Settings > Message address)
  var params = new URLSearchParams(window.location.search)
  if (params.get('pesan')) {
    var wanted = params.get('user')
    params.delete('pesan'); params.delete('user')
    var rest = params.toString()
    try { window.history.replaceState(null, '', window.location.pathname + (rest ? '?' + rest : '') + window.location.hash) } catch (error) { /* address stays */ }
    window.KoiMessenger.open(wanted)
  }
})()
