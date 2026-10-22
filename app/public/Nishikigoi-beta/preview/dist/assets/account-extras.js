// Account Settings (settings.html) extras, loaded by auth.js on that page only:
//  - "Background Profile": upload / remove the picture behind the name on the profile card
//  - a "Profile" button that opens your own profile card
//  - pictures are shrunk in the browser before they are sent (a phone photo is several MB; the avatar needs 512 px, the
//    background 1500 px), and the server keeps them as files, not as text in the account row.
// It works by wrapping KoiAuth.saveRemoteAccount, which the page calls on Submit, so the page script stays as it is.
;(function () {
  'use strict'
  if (window.__koiAccountExtras) return
  window.__koiAccountExtras = true

  var auth = window.KoiAuth
  var session = auth && auth.getSession && auth.getSession()
  if (!auth || !session) return

  var state = { cover: '', saved: '', id: 0 }
  var isData = function (value) { return typeof value === 'string' && value.indexOf('data:image/') === 0 }

  // ---------- picture shrinking
  var shrink = function (dataUrl, maxSide, quality) {
    return new Promise(function (resolve) {
      var image = new Image()
      image.onerror = function () { resolve(dataUrl) }
      image.onload = function () {
        var big = Math.max(image.width, image.height)
        if (big <= maxSide && dataUrl.length < 600 * 1024) { resolve(dataUrl); return }
        var scale = big > maxSide ? maxSide / big : 1
        var canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(image.width * scale))
        canvas.height = Math.max(1, Math.round(image.height * scale))
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      image.src = dataUrl
    })
  }
  var readFile = function (file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader()
      reader.onerror = function () { reject(new Error('Gambar tidak bisa dibaca')) }
      reader.onload = function () { resolve(String(reader.result || '')) }
      reader.readAsDataURL(file)
    })
  }

  // ---------- the cover section
  var section = null
  var preview = null
  var setPreview = function (value) {
    if (!preview) return
    preview.style.backgroundImage = value ? 'url(' + value + ')' : ''
    preview.classList.toggle('has-image', !!value)
  }
  var message = function (text, variant) {
    var el = document.querySelector('[data-settings-message]')
    if (!el) return
    el.textContent = text
    el.className = 'alert alert-' + (variant || 'success') + ' mb-3'
  }

  var build = function () {
    var avatarRow = document.querySelector('[data-avatar-preview]')
    var anchor = avatarRow && avatarRow.closest('.row')
    if (!anchor || section) return !!section
    var style = document.createElement('style')
    style.textContent = '.koi-cover-preview{width:100%;max-width:540px;aspect-ratio:3/1;border-radius:12px;border:1px solid var(--tblr-border-color);background:linear-gradient(135deg,var(--tblr-primary),var(--tblr-bg-surface-secondary));background-size:cover;background-position:center}' +
      '.koi-cover-preview:not(.has-image){opacity:.55}'
    document.head.appendChild(style)
    section = document.createElement('div')
    section.className = 'mt-4'
    section.innerHTML = '<h3 class="card-title">Background Profile</h3>' +
      '<p class="card-subtitle">Gambar di belakang nama pada profil Anda. Disarankan lebar (perbandingan 3:1), misalnya 1500 × 500.</p>' +
      '<div class="koi-cover-preview mb-3" data-cover-preview></div>' +
      '<div class="d-flex flex-wrap gap-2">' +
        '<input type="file" class="d-none" accept="image/*" data-cover-input />' +
        '<button type="button" class="btn" data-cover-upload>Upload Background Profile</button>' +
        '<button type="button" class="btn btn-ghost-danger" data-cover-remove>Delete Background Profile</button>' +
      '</div>'
    anchor.parentNode.insertBefore(section, anchor.nextSibling)
    preview = section.querySelector('[data-cover-preview]')
    var input = section.querySelector('[data-cover-input]')
    section.querySelector('[data-cover-upload]').addEventListener('click', function () { input.click() })
    section.querySelector('[data-cover-remove]').addEventListener('click', function () {
      state.cover = ''
      setPreview('')
      message('Background Profile dihapus. Klik Submit untuk menyimpan.')
    })
    input.addEventListener('change', function () {
      var file = input.files && input.files[0]
      input.value = ''
      if (!file) return
      readFile(file).then(function (dataUrl) { return shrink(dataUrl, 1500, 0.85) }).then(function (small) {
        state.cover = small
        setPreview(small)
        message('Background Profile siap disimpan. Klik Submit untuk memperbarui.')
      }).catch(function (error) { message(error.message, 'danger') })
    })
    // Cancel puts the saved picture back
    var cancel = document.querySelector('[data-action="reset-account-settings"]')
    if (cancel) cancel.addEventListener('click', function () { state.cover = state.saved; setPreview(state.saved) })
    return true
  }

  // ---------- the Profile button next to the title
  var addProfileButton = function () {
    var title = document.querySelector('h2.mb-4')
    if (!title || title.querySelector('[data-open-my-profile]')) return
    title.classList.add('d-flex', 'align-items-center', 'justify-content-between', 'gap-3')
    var button = document.createElement('button')
    button.type = 'button'
    button.className = 'btn btn-outline-primary'
    button.setAttribute('data-open-my-profile', '')
    button.textContent = 'Profile'
    button.addEventListener('click', function () {
      var open = function (id) { if (id && window.KoiProfile) window.KoiProfile.open(id) }
      if (state.id) { open(state.id); return }
      auth.apiRequest('/messages/users?q=').then(function (r) { return r.json() }).then(function (users) {
        var me = users.filter(function (u) { return u.is_me })[0]
        if (me) { state.id = me.id; open(me.id) }
      }).catch(function () {})
    })
    title.appendChild(button)
  }

  // ---------- Submit: shrink the pictures, add the background, keep the page's copy small
  var original = auth.saveRemoteAccount
  auth.saveRemoteAccount = function (account) {
    var mine = account && account.username === session.username
    var work = Promise.resolve()
    if (account && isData(account.avatar)) work = shrink(account.avatar, 512, 0.85).then(function (small) { account.avatar = small })
    if (mine && section) {
      work = work.then(function () { return isData(state.cover) ? shrink(state.cover, 1500, 0.85) : state.cover }).then(function (cover) {
        state.cover = cover
        account.cover = cover
      })
    }
    return work.then(function () { return original.call(auth, account) }).then(function (result) {
      if (result) {
        // the server answers with the stored file URLs: keep those, not the pasted pictures
        if ('avatar' in result) account.avatar = result.avatar || ''
        if (mine && 'cover' in result) {
          account.cover = result.cover || ''
          state.cover = state.saved = account.cover
          setPreview(state.cover)
        }
      }
      return result
    })
  }

  var start = function () {
    if (!build()) return
    addProfileButton()
    var load = auth.getRemoteAccounts ? auth.getRemoteAccounts() : Promise.resolve([])
    load.then(function (accounts) {
      var mine = (accounts || []).filter(function (a) { return a.username === session.username })[0]
      if (mine) {
        state.id = Number(mine.id) || 0
        state.cover = state.saved = mine.cover || ''
        setPreview(state.cover)
      }
    }).catch(function () {})
  }
  var tries = 0
  var wait = window.setInterval(function () {
    tries += 1
    if (document.querySelector('[data-avatar-preview]') || tries > 50) {
      window.clearInterval(wait)
      start()
    }
  }, 100)
})()
