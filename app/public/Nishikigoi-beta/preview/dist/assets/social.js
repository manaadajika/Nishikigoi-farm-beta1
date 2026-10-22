// Social part (X/Twitter-style): posts with pictures, comments and likes. KoiSocial.mount(element, options) draws it:
//   { mode: 'feed' }                          every account's posts (the Beranda page) with a box to post
//   { mode: 'user', userId, isMe }            one account's profile: tabs Postingan / Balasan / Media
// Used by the Beranda page and by the profile card (profile.js). Data comes from /api/posts/*.
;(function () {
  'use strict'
  if (window.KoiSocial) return

  var MAX_IMAGES = 4
  var MAX_TEXT = 1000
  var ICON = {
    comment: '<path d="M3 20l1.3 -3.9a9 8 0 1 1 3.4 2.9l-4.7 1" />',
    heart: '<path d="M19.5 12.572l-7.5 7.428l-7.5 -7.428a5 5 0 1 1 7.5 -6.566a5 5 0 1 1 7.5 6.572" />',
    trash: '<path d="M4 7l16 0" /><path d="M10 11l0 6" /><path d="M14 11l0 6" /><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" /><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />',
    photo: '<path d="M15 8h.01" /><path d="M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12" /><path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5" /><path d="M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3" />',
    back: '<path d="M5 12l14 0" /><path d="M5 12l6 6" /><path d="M5 12l6 -6" />',
    close: '<path d="M18 6l-12 12" /><path d="M6 6l12 12" />',
    next: '<path d="M9 6l6 6l-6 6" />',
    prev: '<path d="M15 6l-6 6l6 6" />',
  }
  var icon = function (name, size, filled) {
    var px = size || 18
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + px + '" height="' + px + '" viewBox="0 0 24 24" fill="' + (filled ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" class="icon">' + ICON[name] + '</svg>'
  }

  var style = document.createElement('style')
  style.textContent = [
    '.ks{color:var(--tblr-body-color);text-align:left}',
    '.ks button{font:inherit}',
    '.ks-tabs{display:flex;border-bottom:1px solid var(--tblr-border-color);position:sticky;top:0;background:var(--tblr-bg-surface);z-index:2}',
    '.ks-tab{flex:1;border:0;background:transparent;color:var(--tblr-secondary);font-weight:600;padding:.9rem .5rem;cursor:pointer;position:relative}',
    '.ks-tab:hover{background:var(--tblr-bg-surface-secondary)}',
    '.ks-tab.is-active{color:var(--tblr-body-color)}',
    '.ks-tab.is-active::after{content:"";position:absolute;left:50%;transform:translateX(-50%);bottom:0;width:3.5rem;height:4px;border-radius:4px;background:var(--tblr-primary,#1d9bf0)}',
    '.ks-compose{display:flex;gap:.75rem;padding:.9rem 1rem;border-bottom:1px solid var(--tblr-border-color)}',
    '.ks-compose-main{flex:1;min-width:0}',
    '.ks-compose textarea{width:100%;border:0;background:transparent;color:inherit;resize:none;outline:0;font-size:1.05rem;min-height:2.6rem;padding:.4rem 0}',
    '.ks-previews{display:grid;grid-template-columns:repeat(2,1fr);gap:.4rem;margin:.4rem 0}',
    '.ks-prev{position:relative}',
    '.ks-prev img{width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:12px;border:1px solid var(--tblr-border-color)}',
    '.ks-prev button{position:absolute;top:.35rem;right:.35rem;width:1.7rem;height:1.7rem;border:0;border-radius:50%;background:rgba(0,0,0,.65);color:#fff;display:inline-flex;align-items:center;justify-content:center;padding:0;cursor:pointer}',
    '.ks-compose-bar{display:flex;align-items:center;justify-content:space-between;gap:.5rem;border-top:1px solid var(--tblr-border-color);padding-top:.5rem;margin-top:.25rem}',
    '.ks-iconbtn{border:0;background:transparent;color:var(--tblr-primary,#1d9bf0);width:2.2rem;height:2.2rem;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;padding:0;cursor:pointer}',
    '.ks-iconbtn:hover{background:var(--tblr-bg-surface-secondary)}',
    '.ks-count{font-size:.8rem;color:var(--tblr-secondary)}',
    '.ks-count.is-over{color:var(--tblr-red,#d63939)}',
    '.ks-error{color:var(--tblr-red,#d63939);font-size:.85rem;margin-top:.25rem}',
    '.ks-post{display:flex;gap:.75rem;padding:.9rem 1rem;border-bottom:1px solid var(--tblr-border-color)}',
    '.ks-post.is-clickable{cursor:pointer}',
    '.ks-post.is-clickable:hover{background:var(--tblr-bg-surface-secondary)}',
    '.ks-avatar{flex:none}',
    '.ks-avatar .avatar{width:2.75rem;height:2.75rem}',
    '.ks-main{flex:1;min-width:0}',
    '.ks-head{display:flex;align-items:baseline;gap:.35rem;flex-wrap:wrap;line-height:1.3}',
    '.ks-name{font-weight:700;word-break:break-word}',
    '.ks-name:hover{text-decoration:underline}',
    '.ks-user,.ks-time,.ks-dot{color:var(--tblr-secondary);font-size:.9rem}',
    '.ks-del{margin-left:auto;border:0;background:transparent;color:var(--tblr-secondary);width:1.9rem;height:1.9rem;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;padding:0;cursor:pointer;align-self:center}',
    '.ks-del:hover{background:var(--tblr-bg-surface-tertiary,var(--tblr-bg-surface-secondary));color:var(--tblr-red,#d63939)}',
    '.ks-replying{font-size:.85rem;color:var(--tblr-secondary)}',
    '.ks-replying a{color:var(--tblr-primary,#1d9bf0);cursor:pointer}',
    '.ks-body{white-space:pre-wrap;word-break:break-word;margin-top:.15rem}',
    '.ks-imgs{display:grid;gap:3px;margin-top:.6rem;border-radius:16px;overflow:hidden;border:1px solid var(--tblr-border-color)}',
    '.ks-imgs img{width:100%;height:100%;object-fit:cover;display:block;cursor:zoom-in;background:rgba(127,127,127,.2)}',
    '.ks-imgs.n-1{grid-template-columns:1fr}',
    '.ks-imgs.n-1 img{max-height:460px;height:auto}',
    '.ks-imgs.n-2{grid-template-columns:1fr 1fr;aspect-ratio:16/9}',
    '.ks-imgs.n-3{grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;aspect-ratio:16/9}',
    '.ks-imgs.n-3 img:first-child{grid-row:1 / span 2}',
    '.ks-imgs.n-4{grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;aspect-ratio:16/9}',
    '.ks-actions{display:flex;gap:2.5rem;margin-top:.5rem;color:var(--tblr-secondary)}',
    '.ks-act{display:inline-flex;align-items:center;gap:.4rem;border:0;background:transparent;color:inherit;padding:.25rem .4rem;margin-left:-.4rem;border-radius:999px;cursor:pointer;font-size:.9rem}',
    '.ks-act:hover{background:var(--tblr-bg-surface-tertiary,var(--tblr-bg-surface-secondary))}',
    '.ks-act.is-like:hover,.ks-act.is-liked{color:#f91880}',
    '.ks-act.is-comment:hover{color:var(--tblr-primary,#1d9bf0)}',
    '.ks-thread-head{display:flex;align-items:center;gap:.75rem;padding:.6rem 1rem;border-bottom:1px solid var(--tblr-border-color);font-weight:700;font-size:1.05rem}',
    '.ks-thread-main .ks-body{font-size:1.1rem}',
    '.ks-note{padding:2rem 1rem;text-align:center;color:var(--tblr-secondary)}',
    '.ks-more{display:block;width:calc(100% - 2rem);margin:1rem;padding:.55rem;border:1px solid var(--tblr-border-color);border-radius:999px;background:transparent;color:var(--tblr-primary,#1d9bf0);cursor:pointer}',
    '.ks-more:hover{background:var(--tblr-bg-surface-secondary)}',
    '.ks-lightbox{position:fixed;inset:0;z-index:1200;background:rgba(0,0,0,.92);display:flex;align-items:center;justify-content:center}',
    '.ks-lightbox[hidden]{display:none}',
    '.ks-lightbox img{max-width:94vw;max-height:90vh;object-fit:contain}',
    '.ks-lb-btn{position:absolute;border:0;border-radius:50%;width:2.6rem;height:2.6rem;background:rgba(255,255,255,.18);color:#fff;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}',
    '.ks-lb-close{top:1rem;right:1rem}.ks-lb-prev{left:1rem;top:50%}.ks-lb-next{right:1rem;top:50%}',
  ].join('\n')
  document.head.appendChild(style)

  // ---------- helpers
  var escapeHtml = function (value) { return String(value == null ? '' : value).replace(/[&<>'"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c] }) }
  var initials = function (p) { return String(p.name || p.username || 'U').split(/\s+/).filter(Boolean).slice(0, 2).map(function (s) { return s.charAt(0).toUpperCase() }).join('') || 'U' }
  var avatarHtml = function (p, size) {
    var link = ' data-profile-id="' + escapeHtml(p.id) + '" title="Lihat profil"'
    return p.avatar ? '<span class="avatar avatar-' + size + '"' + link + ' style="background-image:url(' + escapeHtml(p.avatar) + ')"></span>' : '<span class="avatar avatar-' + size + '"' + link + '>' + escapeHtml(initials(p)) + '</span>'
  }
  var plainAvatar = function (p, size) {
    return p.avatar ? '<span class="avatar avatar-' + size + '" style="background-image:url(' + escapeHtml(p.avatar) + ')"></span>' : '<span class="avatar avatar-' + size + '">' + escapeHtml(initials(p)) + '</span>'
  }
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
    var m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/)
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) : null
  }
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
  var shortTime = function (value) {
    var d = parseDate(value)
    if (!d) return ''
    var s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000))
    if (s < 60) return 'baru saja'
    if (s < 3600) return Math.floor(s / 60) + ' mnt'
    if (s < 86400) return Math.floor(s / 3600) + ' jam'
    return window.KoiAuth && window.KoiAuth.formatDate ? window.KoiAuth.formatDate(d) : d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear()
  }
  var fullTime = function (value) {
    var d = parseDate(value)
    return d ? (window.KoiAuth && window.KoiAuth.formatDate ? window.KoiAuth.formatDate(d, { weekday: true, time: true }) : d.toLocaleString('id-ID')) : ''
  }
  var compress = function (file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader()
      reader.onerror = function () { reject(new Error('Gambar tidak bisa dibaca')) }
      reader.onload = function () {
        var image = new Image()
        image.onerror = function () { reject(new Error('File bukan gambar yang valid')) }
        image.onload = function () {
          var big = Math.max(image.width, image.height)
          var scale = big > 1600 ? 1600 / big : 1
          var canvas = document.createElement('canvas')
          canvas.width = Math.max(1, Math.round(image.width * scale))
          canvas.height = Math.max(1, Math.round(image.height * scale))
          canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
          resolve(canvas.toDataURL('image/jpeg', 0.82))
        }
        image.src = String(reader.result)
      }
      reader.readAsDataURL(file)
    })
  }

  // ---------- picture viewer
  var lightbox = null
  var openLightbox = function (urls, index) {
    if (!lightbox) {
      lightbox = document.createElement('div')
      lightbox.className = 'ks-lightbox'
      lightbox.hidden = true
      lightbox.innerHTML = '<button type="button" class="ks-lb-btn ks-lb-close" aria-label="Tutup">' + icon('close', 22) + '</button>' +
        '<button type="button" class="ks-lb-btn ks-lb-prev" aria-label="Sebelumnya">' + icon('prev', 22) + '</button><img alt="" />' +
        '<button type="button" class="ks-lb-btn ks-lb-next" aria-label="Berikutnya">' + icon('next', 22) + '</button>'
      document.body.appendChild(lightbox)
      lightbox.addEventListener('click', function (event) {
        var go = event.target.closest('.ks-lb-prev') ? -1 : event.target.closest('.ks-lb-next') ? 1 : 0
        if (go) { lightbox.show(lightbox.index + go); return }
        lightbox.hidden = true
      })
      document.addEventListener('keydown', function (event) {
        if (lightbox.hidden) return
        if (event.key === 'Escape') { event.stopPropagation(); lightbox.hidden = true }
        else if (event.key === 'ArrowLeft') lightbox.show(lightbox.index - 1)
        else if (event.key === 'ArrowRight') lightbox.show(lightbox.index + 1)
      }, true)
      lightbox.show = function (i) {
        var list = lightbox.urls
        lightbox.index = (i + list.length) % list.length
        lightbox.querySelector('img').src = list[lightbox.index]
        lightbox.querySelector('.ks-lb-prev').style.display = lightbox.querySelector('.ks-lb-next').style.display = list.length > 1 ? '' : 'none'
      }
    }
    lightbox.urls = urls
    lightbox.hidden = false
    lightbox.show(index || 0)
  }

  // ---------- the component
  function mount(root, options) {
    options = options || {}
    var mode = options.mode === 'user' ? 'user' : 'feed'
    var session = (window.KoiAuth.getSession && window.KoiAuth.getSession()) || {}
    var me = { name: session.name || session.username || '', username: session.username || '', avatar: session.avatar || '' }
    var state = { tab: 'posts', items: [], more: false, loading: false, view: 'list', thread: null, token: 0 }
    var composeImages = {}   // per compose box key -> data URLs
    root.classList.add('ks')

    var compose = function (key, placeholder, button) {
      return '<div class="ks-compose" data-ks-box="' + key + '">' +
        '<div class="ks-avatar">' + plainAvatar(me, 'md') + '</div>' +
        '<div class="ks-compose-main">' +
          '<textarea rows="1" maxlength="' + MAX_TEXT + '" placeholder="' + escapeHtml(placeholder) + '" data-ks-text></textarea>' +
          '<div class="ks-previews" data-ks-previews></div>' +
          '<div class="ks-error d-none" data-ks-error></div>' +
          '<div class="ks-compose-bar">' +
            '<div><button type="button" class="ks-iconbtn" data-ks-attach title="Tambah gambar (maksimal ' + MAX_IMAGES + ')" aria-label="Tambah gambar">' + icon('photo', 20) + '</button>' +
            '<input type="file" accept="image/*" multiple class="d-none" data-ks-file /></div>' +
            '<div class="d-flex align-items-center gap-2"><span class="ks-count" data-ks-count></span><button type="button" class="btn btn-primary btn-pill" data-ks-send disabled>' + button + '</button></div>' +
          '</div></div></div>'
    }

    var imagesHtml = function (images) {
      if (!images || !images.length) return ''
      return '<div class="ks-imgs n-' + images.length + '">' + images.map(function (url, i) { return '<img src="' + escapeHtml(url) + '" alt="Gambar" loading="lazy" data-ks-img="' + i + '" />' }).join('') + '</div>'
    }

    var postHtml = function (post, opts) {
      opts = opts || {}
      var a = post.author
      var target = post.parent_id || post.id
      var replying = post.parent && opts.showReplying !== false
        ? '<div class="ks-replying">Membalas <a data-profile-id="' + escapeHtml(post.parent.author_id) + '">@' + escapeHtml(post.parent.author_username) + '</a></div>' : ''
      return '<article class="ks-post ' + (opts.clickable ? 'is-clickable' : '') + '" data-ks-post="' + post.id + '"' + (opts.clickable ? ' data-ks-open="' + target + '"' : '') + '>' +
        '<div class="ks-avatar">' + avatarHtml(a, 'md') + '</div><div class="ks-main">' +
        '<div class="ks-head"><span class="ks-name" data-profile-id="' + escapeHtml(a.id) + '">' + escapeHtml(a.name || a.username) + '</span>' +
        '<span class="ks-user">@' + escapeHtml(a.username) + '</span><span class="ks-dot">·</span><span class="ks-time" title="' + escapeHtml(fullTime(post.created_at)) + '">' + escapeHtml(shortTime(post.created_at)) + '</span>' +
        (post.can_delete ? '<button type="button" class="ks-del" data-ks-delete="' + post.id + '" title="Hapus" aria-label="Hapus">' + icon('trash', 16) + '</button>' : '') + '</div>' +
        replying +
        (post.body ? '<div class="ks-body">' + escapeHtml(post.body) + '</div>' : '') +
        imagesHtml(post.images) +
        '<div class="ks-actions">' +
          (post.parent_id ? '' : '<button type="button" class="ks-act is-comment" data-ks-comment="' + post.id + '" title="Balas">' + icon('comment', 18) + '<span>' + (post.comments || '') + '</span></button>') +
          '<button type="button" class="ks-act is-like ' + (post.liked ? 'is-liked' : '') + '" data-ks-like="' + post.id + '" title="Suka">' + icon('heart', 18, post.liked) + '<span>' + (post.likes || '') + '</span></button>' +
        '</div></div></article>'
    }

    var tabsHtml = function () {
      var tabs = [['posts', 'Postingan'], ['replies', 'Balasan'], ['media', 'Media']]
      return '<div class="ks-tabs">' + tabs.map(function (t) { return '<button type="button" class="ks-tab ' + (state.tab === t[0] ? 'is-active' : '') + '" data-ks-tab="' + t[0] + '">' + t[1] + '</button>' }).join('') + '</div>'
    }

    // ---------- list view
    var renderList = function () {
      var canPost = mode === 'feed' || options.isMe
      var empty = mode === 'user'
        ? { posts: 'Belum ada postingan.', replies: 'Belum ada balasan.', media: 'Belum ada postingan bergambar.' }[state.tab]
        : 'Belum ada postingan. Jadilah yang pertama menulis.'
      root.innerHTML =
        (mode === 'user' ? tabsHtml() : '') +
        (canPost && (mode === 'feed' || state.tab === 'posts') ? compose('post', mode === 'feed' ? 'Apa yang sedang terjadi di kebun?' : 'Tulis postingan baru', 'Posting') : '') +
        '<div data-ks-items>' +
        (state.items.map(function (post) { return postHtml(post, { clickable: true }) }).join('') ||
          (state.loading ? '<div class="ks-note">Memuat...</div>' : '<div class="ks-note">' + empty + '</div>')) +
        '</div>' +
        (state.more ? '<button type="button" class="ks-more" data-ks-more>Muat lebih banyak</button>' : '')
    }
    var listPath = function (before) {
      var q = before ? '?before=' + before : ''
      if (mode === 'feed') return '/posts/feed' + q
      return '/posts/user/' + encodeURIComponent(options.userId) + '?tab=' + state.tab + (before ? '&before=' + before : '')
    }
    var load = function (append) {
      var token = ++state.token
      state.loading = true
      if (!append) { state.items = []; state.more = false; renderList() }
      var before = append && state.items.length ? state.items[state.items.length - 1].id : 0
      return json(listPath(before)).then(function (data) {
        if (token !== state.token) return
        state.items = append ? state.items.concat(data.items) : data.items
        state.more = data.has_more
        state.loading = false
        if (state.view === 'list') renderList()
      }).catch(function (error) {
        if (token !== state.token) return
        state.loading = false
        root.innerHTML = '<div class="ks-note text-danger">' + escapeHtml(error.message) + '</div>'
      })
    }

    // ---------- thread view
    var renderThread = function () {
      var t = state.thread
      if (!t) return
      root.innerHTML =
        '<div class="ks-thread-head"><button type="button" class="ks-iconbtn" data-ks-back aria-label="Kembali">' + icon('back', 20) + '</button>Postingan</div>' +
        '<div class="ks-thread-main">' + postHtml(t.post, { clickable: false }) + '</div>' +
        compose('reply', 'Tulis balasan Anda', 'Balas') +
        '<div>' + (t.comments.map(function (c) { return postHtml(c, { clickable: false, showReplying: false }) }).join('') || '<div class="ks-note">Belum ada balasan.</div>') + '</div>'
    }
    var openThread = function (id, focus) {
      state.view = 'thread'
      root.innerHTML = '<div class="ks-note">Memuat...</div>'
      return json('/posts/' + id).then(function (data) {
        state.thread = data
        renderThread()
        if (focus) { var ta = root.querySelector('[data-ks-box="reply"] [data-ks-text]'); if (ta) ta.focus() }
      }).catch(function (error) {
        root.innerHTML = '<div class="ks-thread-head"><button type="button" class="ks-iconbtn" data-ks-back aria-label="Kembali">' + icon('back', 20) + '</button>Postingan</div><div class="ks-note text-danger">' + escapeHtml(error.message) + '</div>'
      })
    }
    var backToList = function () {
      state.view = 'list'
      state.thread = null
      load(false)
    }

    // ---------- compose boxes
    var boxOf = function (el) { return el.closest('[data-ks-box]') }
    var refreshBox = function (box) {
      var key = box.getAttribute('data-ks-box')
      var text = box.querySelector('[data-ks-text]')
      var imgs = composeImages[key] || []
      var length = text.value.length
      box.querySelector('[data-ks-previews]').innerHTML = imgs.map(function (src, i) {
        return '<div class="ks-prev"><img src="' + escapeHtml(src) + '" alt="Lampiran ' + (i + 1) + '" /><button type="button" data-ks-remove="' + i + '" aria-label="Hapus gambar">' + icon('close', 14) + '</button></div>'
      }).join('')
      var count = box.querySelector('[data-ks-count]')
      count.textContent = length > MAX_TEXT * 0.8 ? (MAX_TEXT - length) : ''
      count.classList.toggle('is-over', length > MAX_TEXT)
      box.querySelector('[data-ks-send]').disabled = !(text.value.trim() || imgs.length) || length > MAX_TEXT
      text.style.height = 'auto'
      text.style.height = Math.min(text.scrollHeight, 220) + 'px'
    }
    var boxError = function (box, message) {
      var el = box.querySelector('[data-ks-error]')
      el.textContent = message || ''
      el.classList.toggle('d-none', !message)
    }
    var send = function (box) {
      var key = box.getAttribute('data-ks-box')
      var text = box.querySelector('[data-ks-text]')
      var button = box.querySelector('[data-ks-send]')
      var payload = { body: text.value.trim(), images: composeImages[key] || [] }
      if (key === 'reply' && state.thread) payload.parent_id = state.thread.post.id
      button.disabled = true
      boxError(box, '')
      json('/posts', { method: 'POST', body: JSON.stringify(payload) }).then(function (data) {
        composeImages[key] = []
        if (key === 'reply') return openThread(state.thread.post.id)
        text.value = ''
        refreshBox(box)
        // a new post goes to the top of the list it belongs to
        state.items.unshift(data.post)
        renderList()
      }).catch(function (error) { boxError(box, error.message); button.disabled = false })
    }

    // ---------- events
    root.addEventListener('input', function (event) {
      var box = event.target.closest && boxOf(event.target)
      if (box && event.target.matches('[data-ks-text]')) refreshBox(box)
    })
    root.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && event.target.matches && event.target.matches('[data-ks-text]')) {
        event.preventDefault()
        var box = boxOf(event.target)
        if (!box.querySelector('[data-ks-send]').disabled) send(box)
      }
    })
    root.addEventListener('change', function (event) {
      if (!event.target.matches('[data-ks-file]')) return
      var box = boxOf(event.target)
      var key = box.getAttribute('data-ks-box')
      var files = Array.prototype.slice.call(event.target.files)
      event.target.value = ''
      boxError(box, '')
      composeImages[key] = composeImages[key] || []
      files.reduce(function (chain, file) {
        return chain.then(function () {
          if (composeImages[key].length >= MAX_IMAGES) { boxError(box, 'Gambar maksimal ' + MAX_IMAGES + ' per postingan.'); return }
          return compress(file).then(function (src) { composeImages[key].push(src) }).catch(function (error) { boxError(box, error.message) })
        })
      }, Promise.resolve()).then(function () { refreshBox(box) })
    })
    root.addEventListener('click', async function (event) {
      var t = event.target
      var attach = t.closest('[data-ks-attach]')
      if (attach) { boxOf(attach).querySelector('[data-ks-file]').click(); return }
      var remove = t.closest('[data-ks-remove]')
      if (remove) {
        var rbox = boxOf(remove)
        composeImages[rbox.getAttribute('data-ks-box')].splice(Number(remove.getAttribute('data-ks-remove')), 1)
        refreshBox(rbox)
        return
      }
      var sendButton = t.closest('[data-ks-send]')
      if (sendButton) { send(boxOf(sendButton)); return }
      var tab = t.closest('[data-ks-tab]')
      if (tab) { state.tab = tab.getAttribute('data-ks-tab'); load(false); return }
      if (t.closest('[data-ks-more]')) { load(true); return }
      if (t.closest('[data-ks-back]')) { backToList(); return }
      var image = t.closest('[data-ks-img]')
      if (image) {
        event.stopPropagation()
        var urls = Array.prototype.map.call(image.parentNode.querySelectorAll('img'), function (img) { return img.getAttribute('src') })
        openLightbox(urls, Number(image.getAttribute('data-ks-img')))
        return
      }
      var del = t.closest('[data-ks-delete]')
      if (del) {
        event.stopPropagation()
        if (!(await window.KoiDialog.confirm('Hapus postingan ini? Komentar, suka, dan gambarnya ikut terhapus.'))) return
        var id = Number(del.getAttribute('data-ks-delete'))
        json('/posts/' + id, { method: 'DELETE' }).then(function () {
          if (state.view === 'thread' && state.thread && state.thread.post.id === id) { backToList(); return }
          if (state.view === 'thread') return openThread(state.thread.post.id)
          state.items = state.items.filter(function (p) { return p.id !== id })
          renderList()
        }).catch(function (error) { window.alert(error.message) })
        return
      }
      var like = t.closest('[data-ks-like]')
      if (like) {
        event.stopPropagation()
        var lid = Number(like.getAttribute('data-ks-like'))
        json('/posts/' + lid + '/like', { method: 'POST', body: '{}' }).then(function (data) {
          var all = state.items.concat(state.thread ? [state.thread.post].concat(state.thread.comments) : [])
          all.forEach(function (p) { if (p.id === lid) { p.liked = data.liked; p.likes = data.likes } })
          like.classList.toggle('is-liked', data.liked)
          like.innerHTML = icon('heart', 18, data.liked) + '<span>' + (data.likes || '') + '</span>'
        }).catch(function () {})
        return
      }
      var comment = t.closest('[data-ks-comment]')
      if (comment) { event.stopPropagation(); openThread(comment.getAttribute('data-ks-comment'), true); return }
      var open = t.closest('[data-ks-open]')
      if (open && !t.closest('a,button,[data-profile-id]')) openThread(open.getAttribute('data-ks-open'))
    })

    load(false)
    return { reload: function () { state.view = 'list'; load(false) } }
  }

  window.KoiSocial = { mount: mount }
})()
