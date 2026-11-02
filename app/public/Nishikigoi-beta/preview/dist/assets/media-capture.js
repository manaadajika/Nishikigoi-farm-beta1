// Every place of the program that uploads a photo or a video can use the camera as well as the gallery.
// A click on a file box for images or videos (the box itself, or a button that opens a hidden one) first asks: "Kamera" or "Galeri / berkas".
//   Galeri / berkas  the normal picker of the phone or computer (several files at once where the box allows several).
//   Kamera           the camera of the device. Where the browser allows it (a secure address: https or localhost) it opens a camera screen inside the
//                    program that keeps taking photos (and videos where videos are allowed) until "Selesai"; otherwise the camera app of the phone
//                    is opened for one photo at a time and every photo is added to the ones before.
// The files end up in the same file box, which gets its normal "change" event, so no page needs to know about the camera.
// A box can opt out with the attribute data-no-camera.
;(function () {
  'use strict'
  if (window.KoiCapture) return

  var bypass = false
  var sheet = null

  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] }) }
  function accepts(input, kind) { var accept = String(input.accept || ''); return accept.indexOf(kind + '/') >= 0 }
  function wants(input) {
    if (!input || input.tagName !== 'INPUT' || input.type !== 'file' || input.hasAttribute('data-no-camera') || input.disabled) return false
    var accept = String(input.accept || '')
    if (/\.(xlsx|xls|zip|csv)|application\//i.test(accept) && !/image\/|video\//.test(accept)) return false
    return accepts(input, 'image') || accepts(input, 'video')
  }
  function stamp() { var d = new Date(); function p(n) { return String(n).padStart(2, '0') } return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) }

  // the files go into the box: added to the ones already there when the box takes several, otherwise the box keeps the last one
  function addFiles(input, files) {
    var list = Array.prototype.slice.call(files || []).filter(function (file) {
      return (file.type.indexOf('image/') === 0 && accepts(input, 'image')) || (file.type.indexOf('video/') === 0 && accepts(input, 'video'))
    })
    if (!list.length) return
    var transfer = new DataTransfer()
    if (input.multiple) Array.prototype.forEach.call(input.files || [], function (file) { transfer.items.add(file) })
    ;(input.multiple ? list : list.slice(-1)).forEach(function (file) { transfer.items.add(file) })
    input.files = transfer.files
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }

  function closeSheet() { if (sheet) { sheet.remove(); sheet = null } }
  function openPicker(input) {
    closeSheet()
    bypass = true
    try { input.click() } finally { setTimeout(function () { bypass = false }, 0) }
  }

  // ---- fallback: the camera app of the phone, one photo (or video) per tap --------------------------------------------------------------
  function nativeCamera(input, kind) {
    var temp = document.createElement('input')
    temp.type = 'file'
    temp.accept = kind + '/*'
    temp.setAttribute('capture', 'environment')
    temp.style.display = 'none'
    temp.addEventListener('change', function () { addFiles(input, temp.files); temp.remove() })
    document.body.appendChild(temp)
    bypass = true
    try { temp.click() } finally { setTimeout(function () { bypass = false }, 0) }
  }

  // ---- the camera screen inside the program (needs a secure address) --------------------------------------------------------------------
  function cameraScreen(input) {
    var photos = []
    var stream = null
    var facing = 'environment'
    var recorder = null
    var chunks = []
    var mode = 'photo'
    var canVideo = accepts(input, 'video') && typeof window.MediaRecorder !== 'undefined'
    var canPhoto = accepts(input, 'image')
    if (!canPhoto) mode = 'video'
    var single = !input.multiple

    var layer = document.createElement('div')
    layer.style.cssText = 'position:fixed;inset:0;z-index:2000;background:#000;display:flex;flex-direction:column;color:#fff;font-family:inherit'
    layer.innerHTML =
      '<video playsinline muted autoplay style="flex:1 1 auto;min-height:0;width:100%;object-fit:contain;background:#000"></video>' +
      '<div data-cam-strip style="display:flex;gap:6px;overflow-x:auto;padding:6px 10px;min-height:56px"></div>' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px 18px">' +
        '<button type="button" data-cam-cancel class="btn btn-outline-light">Batal</button>' +
        '<div class="d-flex align-items-center gap-3">' +
          (canPhoto && canVideo ? '<button type="button" data-cam-mode class="btn btn-outline-light btn-sm">Foto</button>' : '') +
          '<button type="button" data-cam-shot aria-label="Ambil" style="width:68px;height:68px;border-radius:50%;border:4px solid #fff;background:#fff;box-shadow:0 0 0 3px #000 inset"></button>' +
          '<button type="button" data-cam-flip class="btn btn-outline-light btn-sm">Balik</button>' +
        '</div>' +
        '<button type="button" data-cam-done class="btn btn-primary">Selesai</button>' +
      '</div>'
    document.body.appendChild(layer)
    var video = layer.querySelector('video')
    var strip = layer.querySelector('[data-cam-strip]')
    var shot = layer.querySelector('[data-cam-shot]')
    var done = layer.querySelector('[data-cam-done]')
    var modeButton = layer.querySelector('[data-cam-mode]')

    function paintStrip() {
      strip.innerHTML = photos.map(function (item, index) {
        return '<div style="position:relative;flex:0 0 auto"><' + (item.file.type.indexOf('video/') === 0 ? 'div style="width:44px;height:44px;border-radius:6px;background:#333;display:flex;align-items:center;justify-content:center;font-size:.7rem"' : 'img src="' + item.url + '" style="width:44px;height:44px;object-fit:cover;border-radius:6px"') + '>' + (item.file.type.indexOf('video/') === 0 ? 'Video</div>' : '') +
          '<button type="button" data-cam-drop="' + index + '" style="position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;border:0;background:#d63939;color:#fff;font-size:11px;line-height:1">x</button></div>'
      }).join('')
      done.textContent = photos.length ? 'Selesai (' + photos.length + ')' : 'Selesai'
    }
    function stop() {
      if (recorder && recorder.state !== 'inactive') { try { recorder.stop() } catch (error) { /* already stopped */ } }
      if (stream) stream.getTracks().forEach(function (track) { track.stop() })
      stream = null
    }
    function close() {
      stop()
      photos.forEach(function (item) { URL.revokeObjectURL(item.url) })
      layer.remove()
    }
    function finish() {
      var files = photos.map(function (item) { return item.file })
      close()
      addFiles(input, files)
    }
    function add(file) {
      photos.push({ file: file, url: URL.createObjectURL(file) })
      paintStrip()
      if (single) finish()
    }
    function start() {
      stop()
      navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: mode === 'video' }).then(function (media) {
        stream = media
        video.srcObject = media
      }).catch(function (error) {
        close()
        window.alert('Kamera tidak bisa dibuka: ' + (error && error.message ? error.message : 'izin ditolak') + '. Memakai kamera bawaan.')
        nativeCamera(input, canPhoto ? 'image' : 'video')
      })
    }

    shot.addEventListener('click', function () {
      if (!stream) return
      if (mode === 'photo') {
        var canvas = document.createElement('canvas')
        canvas.width = video.videoWidth || 1280
        canvas.height = video.videoHeight || 720
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
        canvas.toBlob(function (blob) { if (blob) add(new File([blob], 'kamera-' + stamp() + '-' + (photos.length + 1) + '.jpg', { type: 'image/jpeg' })) }, 'image/jpeg', 0.92)
        return
      }
      if (recorder && recorder.state === 'recording') { recorder.stop(); return }
      chunks = []
      try { recorder = new MediaRecorder(stream) } catch (error) { window.alert('Perekam video tidak didukung browser ini.'); return }
      recorder.ondataavailable = function (event) { if (event.data && event.data.size) chunks.push(event.data) }
      recorder.onstop = function () {
        shot.style.background = '#fff'
        var type = recorder.mimeType || 'video/webm'
        if (chunks.length) add(new File(chunks, 'kamera-' + stamp() + '-' + (photos.length + 1) + (type.indexOf('mp4') >= 0 ? '.mp4' : '.webm'), { type: type.split(';')[0] }))
      }
      recorder.start()
      shot.style.background = '#d63939'
    })
    if (modeButton) modeButton.addEventListener('click', function () {
      mode = mode === 'photo' ? 'video' : 'photo'
      modeButton.textContent = mode === 'photo' ? 'Foto' : 'Video'
      start()
    })
    layer.querySelector('[data-cam-flip]').addEventListener('click', function () { facing = facing === 'environment' ? 'user' : 'environment'; start() })
    layer.querySelector('[data-cam-cancel]').addEventListener('click', close)
    done.addEventListener('click', function () { if (photos.length) finish(); else close() })
    strip.addEventListener('click', function (event) {
      var drop = event.target.closest('[data-cam-drop]')
      if (!drop) return
      var removed = photos.splice(Number(drop.getAttribute('data-cam-drop')), 1)[0]
      if (removed) URL.revokeObjectURL(removed.url)
      paintStrip()
    })
    paintStrip()
    start()
  }

  function openCamera(input) {
    closeSheet()
    var canPhoto = accepts(input, 'image')
    if (window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) { cameraScreen(input); return }
    // an address without https (for example the phone reaching the PC by its IP): the camera app of the phone, photo by photo
    nativeCamera(input, canPhoto ? 'image' : 'video')
  }

  // ---- the question ---------------------------------------------------------------------------------------------------------------------
  function ask(input) {
    closeSheet()
    var video = accepts(input, 'video')
    var image = accepts(input, 'image')
    sheet = document.createElement('div')
    sheet.style.cssText = 'position:fixed;inset:0;z-index:1999;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center'
    sheet.innerHTML =
      '<div class="card" style="width:min(26rem,100%);margin:0;border-radius:14px 14px 0 0"><div class="card-body d-grid gap-2">' +
        '<div class="fw-semibold">' + (image && video ? 'Unggah foto atau video' : video ? 'Unggah video' : 'Unggah foto') + '</div>' +
        '<button type="button" class="btn btn-primary" data-ask-camera>Kamera</button>' +
        '<button type="button" class="btn" data-ask-gallery>Galeri / berkas' + (input.multiple ? ' (boleh lebih dari satu)' : '') + '</button>' +
        '<button type="button" class="btn btn-link" data-ask-cancel>Batal</button>' +
      '</div></div>'
    document.body.appendChild(sheet)
    sheet.addEventListener('click', function (event) {
      if (event.target.closest('[data-ask-camera]')) { openCamera(input); return }
      if (event.target.closest('[data-ask-gallery]')) { openPicker(input); return }
      if (event.target === sheet || event.target.closest('[data-ask-cancel]')) closeSheet()
    })
  }

  document.addEventListener('click', function (event) {
    if (bypass) return
    var input = event.target && event.target.closest ? event.target.closest('input[type="file"]') : null
    if (!input || !wants(input)) return
    event.preventDefault()
    event.stopPropagation()
    ask(input)
  }, true)
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape') closeSheet() })

  window.KoiCapture = { ask: ask, addFiles: addFiles }
})()
