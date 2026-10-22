// Master Akun > Identitas Program: logo slots and the text of the print head / footer.
//
// Added below the existing "Icon Program" box (which stays as the fallback for every empty slot):
//   Logo latar terang  - light theme and printed documents
//   Logo latar gelap   - dark theme
//   Favicon            - browser tab icon, 512 x 512
//   Ikon aplikasi      - "Install" / "Add to home screen", 512 x 512 (a 192 px copy is made as well)
//   Subjudul kop       - second line of the print head
//   Nama pemilik       - footer "Copyright ... <nama>"
//
// Images are checked (PNG / WebP / JPEG, square, minimum size), resized in the browser and saved as files by the
// server through PATCH /app-settings (a data: URL is turned into an upload there).
;(function () {
  var SLOTS = [
    { key: 'brand_logo_light', title: 'Logo latar terang', hint: 'Dipakai di tema terang dan pada hasil cetak (kertas putih). PNG atau WebP, persegi, minimal 256 x 256, disarankan 512 x 512.', min: 256, size: 512 },
    { key: 'brand_logo_dark', title: 'Logo latar gelap', hint: 'Dipakai di tema gelap. PNG atau WebP, persegi, minimal 256 x 256, disarankan 512 x 512.', min: 256, size: 512 },
    { key: 'brand_favicon', title: 'Favicon (ikon tab browser)', hint: 'Ikon kecil di tab browser. PNG atau WebP persegi 512 x 512.', min: 512, size: 512 },
    { key: 'brand_app_icon', title: 'Ikon aplikasi (Install / shortcut)', hint: 'Ikon saat program dipasang ke desktop atau layar utama HP lewat Chrome. PNG atau WebP persegi 512 x 512; taruh bagian penting di tengah.', min: 512, size: 512, extra: { key: 'brand_app_icon_192', size: 192 } },
  ]
  var TEXTS = [
    { key: 'brand_subtitle', label: 'Subjudul kop cetak', placeholder: 'Nishikigoi - manajemen koi farm', hint: 'Baris kedua di kop semua hasil cetak. Kosong = teks bawaan.' },
    { key: 'brand_owner', label: 'Nama pemilik di footer', placeholder: 'Sama dengan nama program', hint: 'Tampil di footer: "Copyright ... nama". Kosong = nama program.' },
  ]

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    })
  }
  function apiUrl(path) {
    return window.KoiAuth && window.KoiAuth.apiUrl ? window.KoiAuth.apiUrl(path) : path
  }
  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader()
      reader.onload = function () { resolve(String(reader.result || '')) }
      reader.onerror = function () { reject(new Error('File tidak bisa dibaca.')) }
      reader.readAsDataURL(file)
    })
  }
  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var image = new Image()
      image.onload = function () { resolve(image) }
      image.onerror = function () { reject(new Error('Gambar tidak bisa dibuka.')) }
      image.src = src
    })
  }
  function resize(image, size) {
    var canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    var context = canvas.getContext('2d')
    context.imageSmoothingQuality = 'high'
    context.drawImage(image, 0, 0, size, size)
    return canvas.toDataURL('image/png')
  }

  function start() {
    var panel = document.querySelector('[data-brand-settings-panel]')
    if (!panel || !window.KoiAuth) return

    var style = document.createElement('style')
    style.textContent =
      '.brandx-preview{display:flex;gap:6px}' +
      '.brandx-swatch{width:72px;height:72px;border:1px solid var(--tblr-border-color);border-radius:8px;display:flex;align-items:center;justify-content:center;overflow:hidden}' +
      '.brandx-swatch.is-light{background:#fff}.brandx-swatch.is-dark{background:#0f172a}' +
      '.brandx-swatch img{max-width:100%;max-height:100%;display:block}' +
      '.brandx-empty{font-size:.7rem;color:#94a3b8;text-align:center;padding:0 4px}'
    document.head.appendChild(style)

    var box = document.createElement('div')
    box.className = 'mt-4 pt-3 border-top'
    box.innerHTML =
      '<div class="d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3 mb-3">' +
        '<div><h4 class="mb-1">Logo dan identitas lanjutan</h4>' +
        '<div class="text-secondary">Logo untuk tema terang, tema gelap, tab browser, dan aplikasi terpasang. Slot yang kosong memakai Icon Program di atas.</div></div>' +
        '<button type="button" class="btn btn-primary" data-brandx-save>Simpan Logo dan Identitas</button>' +
      '</div>' +
      '<div class="alert d-none" data-brandx-message></div>' +
      '<div class="row g-3 mb-3">' +
        TEXTS.map(function (field) {
          return '<div class="col-md-6"><label class="form-label">' + escapeHtml(field.label) + '</label>' +
            '<input class="form-control" type="text" maxlength="120" data-brandx-text="' + field.key + '" placeholder="' + escapeHtml(field.placeholder) + '">' +
            '<div class="form-hint">' + escapeHtml(field.hint) + '</div></div>'
        }).join('') +
      '</div>' +
      '<div class="row g-3">' +
        SLOTS.map(function (slot) {
          return '<div class="col-md-6"><div class="border rounded p-3 h-100" data-brandx-slot="' + slot.key + '">' +
            '<div class="fw-semibold mb-1">' + escapeHtml(slot.title) + '</div>' +
            '<div class="text-secondary small mb-2">' + escapeHtml(slot.hint) + '</div>' +
            '<div class="d-flex align-items-center gap-3">' +
              '<div class="brandx-preview"><div class="brandx-swatch is-light" data-brandx-light></div><div class="brandx-swatch is-dark" data-brandx-dark></div></div>' +
              '<div class="btn-list">' +
                '<input type="file" class="d-none" accept="image/png,image/webp,image/jpeg" data-brandx-file>' +
                '<button type="button" class="btn btn-sm" data-brandx-pick>Pilih file</button>' +
                '<button type="button" class="btn btn-sm btn-ghost-danger" data-brandx-clear>Hapus</button>' +
              '</div>' +
            '</div>' +
            '<div class="small mt-2" data-brandx-info></div>' +
          '</div></div>'
        }).join('') +
      '</div>'
    panel.appendChild(box)

    var message = box.querySelector('[data-brandx-message]')
    var state = {}   // key -> { value: url or data URL ('' = empty), extra: data URL of the 192 px copy, info }

    function say(text, variant) {
      message.textContent = text
      message.className = 'alert alert-' + (variant || 'info')
    }
    function renderSlot(slot) {
      var root = box.querySelector('[data-brandx-slot="' + slot.key + '"]')
      var current = state[slot.key] || { value: '' }
      var src = current.value ? (current.value.indexOf('data:') === 0 ? current.value : apiUrl(current.value)) : ''
      ;['light', 'dark'].forEach(function (name) {
        root.querySelector('[data-brandx-' + name + ']').innerHTML = src
          ? '<img src="' + escapeHtml(src) + '" alt="">'
          : '<span class="brandx-empty">Kosong</span>'
      })
      var info = root.querySelector('[data-brandx-info]')
      info.textContent = current.info || (current.value ? (current.value.indexOf('data:') === 0 ? 'Belum disimpan.' : 'Tersimpan.') : 'Belum ada file. Memakai Icon Program.')
      info.className = 'small mt-2 ' + (current.error ? 'text-danger' : 'text-secondary')
    }
    function renderAll() { SLOTS.forEach(renderSlot) }

    function load() {
      return window.KoiAuth.loadAppSettings().then(function (settings) {
        SLOTS.forEach(function (slot) { state[slot.key] = { value: String(settings[slot.key] || '') } })
        if (settings.brand_app_icon_192) state.brand_app_icon.extraUrl = String(settings.brand_app_icon_192)
        TEXTS.forEach(function (field) {
          box.querySelector('[data-brandx-text="' + field.key + '"]').value = String(settings[field.key] || '')
        })
        renderAll()
      })
    }

    function handleFile(slot, file) {
      if (!file) return
      var current = state[slot.key] || (state[slot.key] = { value: '' })
      if (['image/png', 'image/webp', 'image/jpeg'].indexOf(file.type) === -1) {
        current.error = true
        current.info = 'Format harus PNG, WebP, atau JPEG.'
        renderSlot(slot)
        return
      }
      readFile(file).then(function (dataUrl) {
        return loadImage(dataUrl).then(function (image) {
          var w = image.naturalWidth
          var h = image.naturalHeight
          if (Math.abs(w - h) / Math.max(w, h) > 0.02) throw new Error('Gambar harus persegi (lebar = tinggi). Gambar ini ' + w + ' x ' + h + '.')
          if (Math.min(w, h) < slot.min) throw new Error('Gambar terlalu kecil (' + w + ' x ' + h + '). Minimal ' + slot.min + ' x ' + slot.min + '.')
          var size = Math.min(slot.size, w)
          current.value = resize(image, size)
          current.extra = slot.extra ? resize(image, slot.extra.size) : ''
          current.error = false
          current.info = 'Siap disimpan (' + size + ' x ' + size + ', dari ' + w + ' x ' + h + '). Klik Simpan Logo dan Identitas.'
          renderSlot(slot)
        })
      }).catch(function (error) {
        current.error = true
        current.info = error.message || 'Gambar ditolak.'
        renderSlot(slot)
      })
    }

    box.addEventListener('click', function (event) {
      var root = event.target.closest('[data-brandx-slot]')
      if (root) {
        var slot = SLOTS.filter(function (item) { return item.key === root.dataset.brandxSlot })[0]
        if (event.target.closest('[data-brandx-pick]')) { root.querySelector('[data-brandx-file]').click(); return }
        if (event.target.closest('[data-brandx-clear]')) {
          state[slot.key] = { value: '', extra: '', cleared: true, info: 'Dikosongkan. Klik Simpan Logo dan Identitas.' }
          renderSlot(slot)
          return
        }
      }
      if (event.target.closest('[data-brandx-save]')) save(event.target.closest('[data-brandx-save]'))
    })
    box.addEventListener('change', function (event) {
      var input = event.target.closest('[data-brandx-file]')
      if (!input) return
      var slot = SLOTS.filter(function (item) { return item.key === input.closest('[data-brandx-slot]').dataset.brandxSlot })[0]
      handleFile(slot, input.files && input.files[0])
      input.value = ''
    })

    function save(button) {
      var payload = {}
      TEXTS.forEach(function (field) {
        payload[field.key] = box.querySelector('[data-brandx-text="' + field.key + '"]').value.trim()
      })
      SLOTS.forEach(function (slot) {
        var current = state[slot.key] || { value: '' }
        payload[slot.key] = current.value
        if (slot.extra) payload[slot.extra.key] = current.value ? (current.extra || current.extraUrl || '') : ''
      })
      button.disabled = true
      say('Menyimpan...', 'info')
      window.KoiAuth.saveAppSettings(payload).then(function () {
        say('Logo dan identitas berhasil disimpan.', 'success')
        return load()
      }).catch(function (error) {
        say(error.message || 'Gagal menyimpan.', 'danger')
      }).then(function () { button.disabled = false })
    }

    load().catch(function () { say('Pengaturan logo gagal dimuat.', 'danger') })
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
  else start()
})()
