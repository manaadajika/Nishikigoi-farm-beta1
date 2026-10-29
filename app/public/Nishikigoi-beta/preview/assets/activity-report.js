// Laporan Kegiatan (daily farm work: pakan, ganti air, pengobatan, ...) on the Laporan page.
// "Tambah Laporan" becomes a menu: Laporan Perikanan (the existing form) | Laporan Kegiatan (this form).
// Saved in farm_reports with report_type 'kegiatan'; its own fields live in activity_data (JSON).
// Also adds a Semua | Perikanan | Kegiatan filter and opens/prints kegiatan rows with this form.
;(function () {
  var TYPE = 'kegiatan'
  var activities = [
    ['pakan', 'Pemberian pakan'], ['ganti_air', 'Ganti air / kuras'], ['pengobatan', 'Pengobatan / perawatan'],
    ['bersih', 'Bersih kolam / filter'], ['pindah', 'Pindah ikan'], ['seleksi', 'Seleksi / panen'],
    ['perbaikan', 'Perbaikan fasilitas'], ['lainnya', 'Lainnya'],
  ]
  var statuses = [['selesai', 'Selesai', 'green'], ['belum', 'Belum selesai', 'yellow'], ['tindak_lanjut', 'Perlu tindak lanjut', 'red']]
  var units = ['kg', 'gram', 'liter', 'ml', 'sak', 'butir', 'botol', 'pcs']

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    })
  }
  function parse(value, fallback) {
    if (value && typeof value === 'object') return value
    try { var parsed = JSON.parse(value || ''); return parsed == null ? fallback : parsed } catch (e) { return fallback }
  }
  function label(list, key) { var found = list.find(function (item) { return item[0] === key }); return found ? found[1] : (key || '-') }
  function formatDate(value) {
    if (!value) return '-'
    return window.KoiAuth && window.KoiAuth.formatDate ? window.KoiAuth.formatDate(String(value).slice(0, 10)) : String(value).slice(0, 10)
  }
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }
  function canWrite() { return Boolean(window.KoiAuth && window.KoiAuth.canAccess && window.KoiAuth.canAccess('farm-operate')) }
  function modalApi() { return (window.tabler && window.tabler.bootstrap && window.tabler.bootstrap.Modal) || (window.bootstrap && window.bootstrap.Modal) }
  function request(path, options) {
    return window.KoiAuth.apiRequest(path, options).then(function (response) {
      return response.json().catch(function () { return {} }).then(function (data) {
        if (!response.ok) throw new Error(data.error || data.detail || 'Permintaan gagal')
        return data
      })
    })
  }
  function compressImage(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader()
      reader.onerror = function () { reject(new Error('Foto gagal dibaca')) }
      reader.onload = function () {
        var image = new Image()
        image.onerror = function () { resolve(reader.result) }
        image.onload = function () {
          var max = 1600
          var scale = Math.min(1, max / Math.max(image.width, image.height))
          var canvas = document.createElement('canvas')
          canvas.width = Math.round(image.width * scale)
          canvas.height = Math.round(image.height * scale)
          canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
          resolve(canvas.toDataURL('image/jpeg', 0.85))
        }
        image.src = reader.result
      }
      reader.readAsDataURL(file)
    })
  }
  function readDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader()
      reader.onload = function () { resolve(reader.result) }
      reader.onerror = function () { reject(new Error('File gagal dibaca')) }
      reader.readAsDataURL(file)
    })
  }
  function videoThumbnail(file) {
    return new Promise(function (resolve) {
      var video = document.createElement('video')
      var url = URL.createObjectURL(file)
      video.muted = true
      video.preload = 'metadata'
      video.src = url
      video.onloadeddata = function () { video.currentTime = Math.min(1, (video.duration || 1) / 2) }
      video.onseeked = function () {
        var canvas = document.createElement('canvas')
        canvas.width = video.videoWidth || 320
        canvas.height = video.videoHeight || 240
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
        URL.revokeObjectURL(url)
        resolve(canvas.toDataURL('image/jpeg', 0.8))
      }
      video.onerror = function () { URL.revokeObjectURL(url); resolve('') }
    })
  }

  // Shared with arrival-report.js (Laporan Ikan Datang), which loads right after this file.
  var typeOptions = [
    ['data_ulang', 'Data Ulang', 'Isi field laporan sama dengan panen.'],
    ['panen', 'Panen', 'Isi field laporan sama dengan data ulang.'],
    ['kegiatan', 'Kegiatan', 'Pakan, ganti air, pengobatan, bersih kolam, pindah ikan.'],
    ['ikan_datang', 'Ikan Datang', 'Ikan yang baru datang: jenis, gender, ukuran, farm, bloodline, owner.'],
  ]
  var typeChooserSeq = 0
  // The four report types are shown as an equal-width grid (4 columns, 2 on tablets, 1 on phones) in every form.
  var typeStyle = document.createElement('style')
  // one compact row of tabs (the description of each type is its tooltip); same look and position in all four forms
  typeStyle.textContent =
    '.koi-type-box{padding:0;margin-bottom:1rem}' +
    '.koi-type-box>.form-label{margin-bottom:.35rem}' +
    '.koi-type-grid{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr));gap:0;margin:0!important;border:1px solid var(--tblr-border-color);border-radius:8px;overflow:hidden;background:var(--tblr-bg-surface)}' +
    '.koi-type-grid .form-selectgroup-item{margin:0!important;flex:none!important;min-width:0}' +
    '.koi-type-grid .form-selectgroup-item+.form-selectgroup-item{border-left:1px solid var(--tblr-border-color)}' +
    '.koi-type-grid .form-selectgroup-label{height:100%;justify-content:center;text-align:center;border:0!important;border-radius:0!important;padding:.6rem .5rem!important;background:transparent;transition:background .15s,color .15s}' +
    '.koi-type-grid .form-selectgroup-label .me-3{display:none}' +
    '.koi-type-grid .form-selectgroup-label .d-block{display:none!important}' +
    '.koi-type-grid .form-selectgroup-title{font-size:.9rem;margin:0!important;font-weight:600}' +
    '.koi-type-grid .form-selectgroup-input:checked+.form-selectgroup-label{background:rgba(var(--tblr-primary-rgb),.14);color:var(--tblr-primary)}' +
    '.koi-type-grid .form-selectgroup-input:checked+.form-selectgroup-label .form-selectgroup-title{color:var(--tblr-primary)}' +
    '.koi-type-grid .form-selectgroup-label:hover{background:var(--tblr-bg-surface-secondary)}' +
    '.koi-type-grid .form-selectgroup-input:focus-visible+.form-selectgroup-label{outline:2px solid var(--tblr-primary);outline-offset:-2px}' +
    '.modal-backdrop~.modal-backdrop{display:none}' +
    '@media (max-width:575.98px){.koi-type-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.koi-type-grid .form-selectgroup-item:nth-child(n+3){border-top:1px solid var(--tblr-border-color)}.koi-type-grid .form-selectgroup-item:nth-child(3){border-left:0}}'
  document.head.appendChild(typeStyle)

  // Values every report type has in common, carried over when the type is changed in a NEW report:
  // date, title and the free text (Catatan / Uraian). Field names differ per form.
  var sharedFields = {
    perikanan: { root: '[data-report-form]', date: 'report_date', title: 'report_title', text: 'notes' },
    kegiatan: { root: '[data-activity-form]', date: 'tanggal', title: 'judul', text: 'uraian' },
    ikan_datang: { root: '[data-arrival-form]', date: 'tanggal', title: 'judul', text: 'catatan' },
  }
  function typeFamily(type) { return type === 'kegiatan' || type === 'ikan_datang' ? type : 'perikanan' }
  function readShared(family) {
    var map = sharedFields[family]
    var form = document.querySelector(map.root)
    var out = {}
    if (!form) return out
    ;['date', 'title', 'text'].forEach(function (key) {
      var field = form.elements[map[key]]
      if (field && String(field.value || '').trim()) out[key] = field.value
    })
    return out
  }
  function applyShared(family, values, again) {
    var map = sharedFields[family]
    var form = document.querySelector(map.root)
    if (!form) return
    ;['date', 'title', 'text'].forEach(function (key) {
      var field = form.elements[map[key]]
      if (!field || values[key] == null) return
      // text already typed in the new form is kept; the date is replaced only while it still holds the form's default
      if (key !== 'date' && String(field.value || '').trim()) return
      if (key === 'date' && again && String(field.value || '') !== today() && String(field.value || '') !== '') return
      field.value = values[key]
      field.dispatchEvent(new Event('input', { bubbles: true }))
      field.dispatchEvent(new Event('change', { bubbles: true }))
    })
  }
  function modalOfFamily(family) { return document.querySelector(sharedFields[family].root + '').closest('.modal') }

  // Changes the report type without the dialog flashing: the next form opens in the same moment the old one closes
  // (no fade, no gap), and the date, title and text typed so far move along.
  function switchType(fromModal, hide, type) {
    var fromFamily = fromModal.hasAttribute('data-activity-modal') ? 'kegiatan' : fromModal.hasAttribute('data-arrival-modal') ? 'ikan_datang' : 'perikanan'
    var carried = readShared(fromFamily)
    var toFamily = typeFamily(type)
    var toModal = null
    try { toModal = modalOfFamily(toFamily) } catch (e) {}
    var fadeBack = []
    ;[fromModal, toModal].forEach(function (modal) {
      if (modal && modal.classList.contains('fade')) { modal.classList.remove('fade'); fadeBack.push(modal) }
    })
    // the next form opens the moment the old one is really closed (Bootstrap's own page lock and backdrop stay correct)
    var opened = false
    function go() {
      if (opened) return
      opened = true
      fromModal.removeEventListener('hidden.bs.modal', go)
      openType(type)
      // some forms fill themselves after their options arrive from the server: apply again (only empty fields are touched)
      ;[60, 400, 1000].forEach(function (delay) { setTimeout(function () { applyShared(toFamily, carried, delay > 60) }, delay) })
      setTimeout(function () { fadeBack.forEach(function (modal) { modal.classList.add('fade') }) }, 500)
      // the closing form may release the page scroll lock after the next one opened: keep it locked while a form is open
      setTimeout(function () {
        if (toModal && toModal.classList.contains('show')) {
          document.body.classList.add('modal-open')
          document.body.style.overflow = 'hidden'
        }
      }, 700)
    }
    fromModal.addEventListener('hidden.bs.modal', go)
    hide()
    setTimeout(function () {
      if (opened) return
      if (fromModal.classList.contains('show')) {
        // Bootstrap ignores a close while the form is still opening: close it as soon as it has finished opening
        fromModal.addEventListener('shown.bs.modal', function again() {
          fromModal.removeEventListener('shown.bs.modal', again)
          hide()
        })
      } else {
        go()
      }
    }, 120)
    setTimeout(go, 4000)
  }
  // "Jenis Laporan" choice for the Kegiatan / Ikan Datang forms: picking another type closes the form and opens that type's form.
  function typeChooserHtml(current) {
    typeChooserSeq += 1
    return '<div class="koi-type-box" data-type-chooser><label class="form-label required">Jenis Laporan</label><div class="form-selectgroup form-selectgroup-boxes koi-type-grid">' +
      typeOptions.map(function (option) {
        return '<label class="form-selectgroup-item" title="' + escapeHtml(option[2]) + '"><input type="radio" name="report_type_switch_' + typeChooserSeq + '" value="' + option[0] + '" class="form-selectgroup-input"' + (option[0] === current ? ' checked' : '') + ' data-type-switch>' +
          '<span class="form-selectgroup-label d-flex align-items-center p-3"><span class="me-3"><span class="form-selectgroup-check"></span></span><span><span class="form-selectgroup-title strong mb-1">' + option[1] + '</span><span class="d-block text-secondary">' + option[2] + '</span></span></span></label>'
      }).join('') + '</div></div>'
  }
  // Opens the form of a report type (a new, empty one).
  function openType(type) {
    if (type === 'kegiatan') { var activity = document.querySelector('[data-report-open-activity]'); if (activity) activity.click(); return }
    if (type === 'ikan_datang') { var arrival = document.querySelector('[data-report-open-arrival]'); if (arrival) arrival.click(); return }
    var open = document.querySelector('[data-report-open]')
    if (!open) return
    open.click()
    setTimeout(function () {
      var radio = document.querySelector('input[name="report_type"][value="' + type + '"]')
      if (radio) { radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true })) }
    }, 120)
  }

  window.KoiReportKit = {
    typeChooserHtml: typeChooserHtml, openType: openType, switchType: switchType,
    escapeHtml: escapeHtml, parse: parse, formatDate: formatDate, today: today, canWrite: canWrite, modalApi: modalApi,
    request: request, compressImage: compressImage, readDataUrl: readDataUrl, videoThumbnail: videoThumbnail,
  }

  function start() {
    var openButton = document.querySelector('[data-report-open]')
    var table = document.querySelector('[data-report-table]')
    if (!openButton || !table) return

    var reportsById = new Map()
    var ponds = []
    var accounts = []
    var media = []
    var editingId = null
    var readonly = false
    var filter = 'semua'
    try { filter = sessionStorage.getItem('nishikigoi-report-filter') || 'semua' } catch (e) {}

    // "Tambah Laporan" opens the one form directly. The report type is chosen in "Jenis Laporan" at the top of the form
    // (Data Ulang | Panen | Kegiatan | Ikan Datang), also inside the Kegiatan and Ikan Datang forms.
    var activityItem = document.createElement('button')
    activityItem.type = 'button'
    activityItem.hidden = true
    activityItem.setAttribute('data-report-open-activity', '')
    document.body.appendChild(activityItem)

    // ---- Semua | Perikanan | Kegiatan filter ----
    var filterGroup = document.createElement('div')
    filterGroup.className = 'btn-group me-2'
    filterGroup.setAttribute('role', 'group')
    filterGroup.innerHTML = [['semua', 'Semua'], ['perikanan', 'Perikanan'], ['kegiatan', 'Kegiatan'], ['ikan_datang', 'Ikan Datang']].map(function (item) {
      return '<button type="button" class="btn btn-sm" data-report-filter="' + item[0] + '">' + item[1] + '</button>'
    }).join('')
    openButton.parentNode.insertBefore(filterGroup, openButton)
    openButton.parentNode.classList.add('d-flex', 'align-items-center', 'flex-wrap', 'gap-2')

    // ---- form ----
    var modal = document.createElement('div')
    modal.className = 'modal modal-blur fade'
    modal.tabIndex = -1
    modal.setAttribute('aria-hidden', 'true')
    modal.setAttribute('data-activity-modal', '')
    modal.innerHTML =
      '<div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable" role="document"><form class="modal-content" data-activity-form novalidate>' +
      '<div class="modal-header"><h5 class="modal-title" data-activity-title>Formulir Laporan Kegiatan</h5><button type="button" class="btn-close" data-activity-close aria-label="Tutup"></button></div>' +
      '<div class="modal-body">' +
      typeChooserHtml('kegiatan') +
      '<div class="alert alert-danger d-none" data-activity-error style="white-space:pre-line"></div>' +
      '<div class="row g-3">' +
      '<div class="col-md-6"><label class="form-label required">Jenis kegiatan</label><select class="form-select" name="jenis">' +
      activities.map(function (a) { return '<option value="' + a[0] + '">' + a[1] + '</option>' }).join('') + '</select>' +
      '<input class="form-control mt-2 d-none" name="jenis_lain" placeholder="Tulis jenis kegiatan" data-activity-other></div>' +
      '<div class="col-md-6"><label class="form-label">Judul <span class="text-secondary small">(opsional)</span></label><input class="form-control" name="judul" placeholder="Otomatis dari jenis dan kolam"></div>' +
      '<div class="col-md-4"><label class="form-label required">Tanggal</label><input class="form-control" type="date" name="tanggal"></div>' +
      '<div class="col-6 col-md-4"><label class="form-label">Jam mulai</label><input class="form-control" type="time" name="jam_mulai"></div>' +
      '<div class="col-6 col-md-4"><label class="form-label">Jam selesai</label><input class="form-control" type="time" name="jam_selesai"></div>' +
      '<div class="col-md-6"><label class="form-label">Kolam</label><select class="form-select" name="kolam" multiple data-activity-ponds></select></div>' +
      '<div class="col-md-6"><label class="form-label">Petugas</label><select class="form-select" name="petugas" multiple data-activity-staff></select></div>' +
      '<div class="col-12"><label class="form-label required">Uraian kegiatan dan hasil</label><textarea class="form-control" name="uraian" rows="4" placeholder="Contoh: Ganti air 30% kolam Konkret 01-03, air sudah jernih, ikan aktif makan."></textarea></div>' +
      '<div class="col-12"><div class="d-flex align-items-center justify-content-between"><label class="form-label mb-0">Bahan / obat / pakan yang dipakai <span class="text-secondary small">(opsional)</span></label>' +
      '<button type="button" class="btn btn-sm btn-outline-primary" data-activity-add-item>Tambah baris</button></div>' +
      '<div class="mt-2" data-activity-items></div><datalist id="activity-units">' + units.map(function (u) { return '<option value="' + u + '">' }).join('') + '</datalist></div>' +
      '<div class="col-6 col-md-3"><label class="form-label">Suhu air <span class="text-secondary small">(°C)</span></label><input class="form-control" type="number" step="0.1" name="suhu" placeholder="Opsional"></div>' +
      '<div class="col-6 col-md-3"><label class="form-label">pH air</label><input class="form-control" type="number" step="0.1" min="0" max="14" name="ph" placeholder="Opsional"></div>' +
      '<div class="col-md-6"><label class="form-label">Status</label><div class="btn-group w-100" role="group">' +
      statuses.map(function (s) { return '<input type="radio" class="btn-check" name="status" id="activity-status-' + s[0] + '" value="' + s[0] + '"><label class="btn" for="activity-status-' + s[0] + '">' + s[1] + '</label>' }).join('') +
      '</div></div>' +
      '<div class="col-12 d-none" data-activity-followup><label class="form-label">Tindak lanjut</label><textarea class="form-control" name="tindak_lanjut" rows="2" placeholder="Apa yang harus dilakukan berikutnya, oleh siapa, kapan."></textarea></div>' +
      '<div class="col-12"><label class="form-label">Dokumentasi foto / video</label><input class="form-control" type="file" accept="image/*,video/mp4,video/webm" multiple data-activity-media-input>' +
      '<div class="row g-2 mt-2" data-activity-media></div><div class="text-secondary small mt-1" data-activity-media-status></div>' +
      '<label class="form-check mt-3 mb-1"><input class="form-check-input" type="checkbox" name="show_in_gallery" checked><span class="form-check-label">Tampilkan media di Galeri</span></label>' +
      '<div class="form-hint">Media laporan ini ikut tampil di menu Galeri sebagai satu koleksi (file tidak digandakan).</div></div>' +
      '</div></div>' +
      '<div class="modal-footer"><div class="me-auto" data-activity-draft-host></div>' +
      '<button type="button" class="btn d-none" data-activity-print>Cetak</button>' +
      '<button type="button" class="btn" data-activity-close>Batal</button>' +
      '<button type="submit" class="btn btn-primary" data-activity-submit>Simpan Laporan</button></div>' +
      '</form></div>'
    document.body.appendChild(modal)
    var form = modal.querySelector('[data-activity-form]')
    var errorBox = modal.querySelector('[data-activity-error]')
    var itemsBox = modal.querySelector('[data-activity-items]')
    var mediaBox = modal.querySelector('[data-activity-media]')
    var mediaStatus = modal.querySelector('[data-activity-media-status]')
    var pondSelect = modal.querySelector('[data-activity-ponds]')
    var staffSelect = modal.querySelector('[data-activity-staff]')

    function showModal() {
      var api = modalApi()
      if (api) api.getOrCreateInstance(modal).show()
      else { modal.classList.add('show'); modal.style.display = 'block' }
    }
    function hideModal() {
      var api = modalApi()
      if (api) { var instance = api.getInstance(modal); if (instance) instance.hide() }
      else { modal.classList.remove('show'); modal.style.display = 'none' }
      // lets the page reload its list (Laporan refreshes on window focus)
      setTimeout(function () { window.dispatchEvent(new Event('focus')); loadReports() }, 400)
    }
    function showError(message) { errorBox.textContent = message; errorBox.classList.remove('d-none'); errorBox.scrollIntoView({ block: 'nearest' }) }

    function setMultiple(select, values) {
      var set = new Set((values || []).map(String))
      Array.prototype.forEach.call(select.options, function (option) { option.selected = set.has(String(option.value)) })
      select.dispatchEvent(new Event('change', { bubbles: true }))
    }
    function selectedValues(select) { return Array.prototype.filter.call(select.options, function (o) { return o.selected }).map(function (o) { return o.value }) }

    function addItemRow(item) {
      item = item || {}
      var row = document.createElement('div')
      row.className = 'row g-2 mb-2'
      row.setAttribute('data-activity-item', '')
      row.innerHTML =
        '<div class="col-12 col-md-6"><input class="form-control" data-item-name placeholder="Nama, contoh Garam ikan" value="' + escapeHtml(item.nama || '') + '"></div>' +
        '<div class="col-5 col-md-2"><input class="form-control" type="number" step="0.01" min="0" data-item-qty placeholder="Jumlah" value="' + escapeHtml(item.jumlah || '') + '"></div>' +
        '<div class="col-5 col-md-3"><input class="form-control" list="activity-units" data-item-unit placeholder="Satuan" value="' + escapeHtml(item.satuan || '') + '"></div>' +
        '<div class="col-2 col-md-1"><button type="button" class="btn btn-outline-danger btn-icon w-100" data-item-remove aria-label="Hapus baris" title="Hapus baris">&times;</button></div>'
      itemsBox.appendChild(row)
    }
    function readItems() {
      return Array.prototype.map.call(itemsBox.querySelectorAll('[data-activity-item]'), function (row) {
        return { nama: row.querySelector('[data-item-name]').value.trim(), jumlah: row.querySelector('[data-item-qty]').value.trim(), satuan: row.querySelector('[data-item-unit]').value.trim() }
      }).filter(function (item) { return item.nama })
    }

    function renderMedia() {
      mediaBox.innerHTML = media.map(function (item, index) {
        var source = item.thumbnail_url || item.url
        return '<div class="col-6 col-md-3"><div class="border p-1">' +
          '<div class="ratio ratio-4x3" style="background:url(&quot;' + escapeHtml(source) + '&quot;) center/cover"></div>' +
          (item.type === 'video' ? '<span class="badge bg-dark mt-1">Video</span>' : '') +
          '<input class="form-control form-control-sm mt-1" data-media-note="' + index + '" placeholder="Keterangan" value="' + escapeHtml(item.notes || '') + '">' +
          '<button type="button" class="btn btn-sm btn-outline-danger w-100 mt-1" data-media-remove="' + index + '">Hapus</button></div></div>'
      }).join('')
    }
    function collectMedia() {
      mediaBox.querySelectorAll('[data-media-note]').forEach(function (input) {
        var item = media[Number(input.dataset.mediaNote)]
        if (item) item.notes = input.value.trim()
      })
      return media.map(function (item) { return { type: item.type, url: item.url, thumbnail_url: item.thumbnail_url || item.url, name: item.name || '', notes: item.notes || '' } })
    }
    function uploadFiles(files) {
      var list = Array.prototype.slice.call(files || [])
      var chain = Promise.resolve()
      list.forEach(function (file, index) {
        chain = chain.then(function () {
          mediaStatus.textContent = 'Mengupload ' + (index + 1) + '/' + list.length + ': ' + file.name
          if (file.type.indexOf('video/') === 0) {
            if (file.size > 100 * 1024 * 1024) throw new Error('Video ' + file.name + ' lebih dari 100 MB')
            return Promise.all([readDataUrl(file), videoThumbnail(file)]).then(function (data) {
              return request('/videos', { method: 'POST', body: JSON.stringify({ prefix: 'report-video', video_data: data[0], thumbnail_data: data[1] }) })
            }).then(function (data) { media.push({ type: 'video', url: data.video_url, thumbnail_url: data.video_thumbnail_url, name: file.name }) })
          }
          return compressImage(file).then(function (dataUrl) {
            return request('/images', { method: 'POST', body: JSON.stringify({ prefix: 'report-image', image_data: dataUrl }) })
          }).then(function (data) { media.push({ type: 'image', url: data.image_url, thumbnail_url: data.image_url, name: file.name }) })
        }).then(renderMedia)
      })
      return chain.then(function () { mediaStatus.textContent = list.length ? list.length + ' file terupload.' : '' })
        .catch(function (error) { mediaStatus.textContent = ''; showError(error.message) })
    }

    function updateVisibility() {
      form.querySelector('[data-activity-other]').classList.toggle('d-none', form.elements.jenis.value !== 'lainnya')
      var status = (form.querySelector('[name="status"]:checked') || {}).value
      modal.querySelector('[data-activity-followup]').classList.toggle('d-none', status === 'selesai' && !form.elements.tindak_lanjut.value.trim())
    }

    function setReadonly(value) {
      readonly = value
      form.querySelectorAll('input, select, textarea').forEach(function (field) { field.disabled = value })
      modal.querySelector('[data-activity-add-item]').classList.toggle('d-none', value)
      modal.querySelector('[data-activity-submit]').classList.toggle('d-none', value)
      modal.querySelector('[data-activity-print]').classList.toggle('d-none', !value && !editingId)
      itemsBox.querySelectorAll('[data-item-remove]').forEach(function (b) { b.classList.toggle('d-none', value) })
      mediaBox.querySelectorAll('[data-media-remove]').forEach(function (b) { b.classList.toggle('d-none', value) })
      var draftControls = modal.querySelector('.koi-draft-controls')
      if (draftControls) draftControls.classList.toggle('d-none', value || Boolean(editingId))
    }

    function fill(data) {
      var activity = parse(data.activity_data, {}) || {}
      form.reset()
      errorBox.classList.add('d-none')
      form.elements.jenis.value = activity.jenis || 'pakan'
      form.elements.jenis_lain.value = activity.jenis_lain || ''
      form.elements.judul.value = data.report_title || ''
      form.elements.tanggal.value = data.report_date ? String(data.report_date).slice(0, 10) : today()
      form.elements.jam_mulai.value = activity.jam_mulai || ''
      form.elements.jam_selesai.value = activity.jam_selesai || ''
      form.elements.uraian.value = data.notes || ''
      form.elements.suhu.value = activity.suhu == null ? '' : activity.suhu
      form.elements.ph.value = activity.ph == null ? '' : activity.ph
      form.elements.tindak_lanjut.value = activity.tindak_lanjut || ''
      var status = form.querySelector('[name="status"][value="' + (activity.status || 'selesai') + '"]')
      if (status) status.checked = true
      form.elements.show_in_gallery.checked = data.id ? Boolean(data.gallery_id || data.show_in_gallery === true) : data.show_in_gallery !== false
      setMultiple(pondSelect, parse(data.pond_entries, []).map(function (p) { return p.pond_id }))
      var session = window.KoiAuth.getSession() || {}
      // Petugas starts empty in a new report: whoever did the work is chosen on purpose
      var staff = parse(data.reporter_entries, []).map(function (r) { return r.account_id || r.id })
      setMultiple(staffSelect, staff)
      itemsBox.innerHTML = ''
      ;(Array.isArray(activity.bahan) ? activity.bahan : []).forEach(addItemRow)
      media = parse(data.media_entries, []).map(function (m) { return { type: m.type || 'image', url: m.url || m.image_url, thumbnail_url: m.thumbnail_url || m.url, name: m.name || '', notes: m.notes || '' } })
      renderMedia()
      mediaStatus.textContent = ''
      updateVisibility()
    }

    function buildPayload() {
      var jenis = form.elements.jenis.value
      var jenisText = jenis === 'lainnya' ? (form.elements.jenis_lain.value.trim() || 'Lainnya') : label(activities, jenis)
      var pondIds = selectedValues(pondSelect)
      var pondEntries = pondIds.map(function (id) {
        var pond = ponds.find(function (p) { return String(p.id) === String(id) }) || {}
        return { pond_id: Number(id), pond_name: pond.name || '', location: pond.location || '' }
      })
      var staffEntries = selectedValues(staffSelect).map(function (id) {
        var account = accounts.find(function (a) { return String(a.id) === String(id) }) || {}
        return { account_id: Number(id), label: account.name || account.username || '', username: account.username || '' }
      })
      var title = form.elements.judul.value.trim() ||
        (jenisText + (pondEntries.length ? ' - ' + pondEntries.slice(0, 3).map(function (p) { return p.pond_name }).join(', ') + (pondEntries.length > 3 ? ', ...' : '') : ''))
      var toNumber = function (value) { var n = Number(String(value).replace(',', '.')); return String(value).trim() === '' || !Number.isFinite(n) ? null : n }
      return {
        report_type: TYPE,
        report_date: form.elements.tanggal.value,
        report_title: title,
        notes: form.elements.uraian.value.trim(),
        pond_entries: pondEntries,
        reporter_entries: staffEntries,
        media_entries: collectMedia(),
        show_in_gallery: form.elements.show_in_gallery.checked,
        activity_data: {
          jenis: jenis,
          jenis_lain: jenis === 'lainnya' ? form.elements.jenis_lain.value.trim() : '',
          jam_mulai: form.elements.jam_mulai.value,
          jam_selesai: form.elements.jam_selesai.value,
          bahan: readItems(),
          suhu: toNumber(form.elements.suhu.value),
          ph: toNumber(form.elements.ph.value),
          status: (form.querySelector('[name="status"]:checked') || {}).value || 'selesai',
          tindak_lanjut: form.elements.tindak_lanjut.value.trim(),
        },
      }
    }

    function validate(payload) {
      var problems = []
      if (!payload.report_date) problems.push('Tanggal wajib diisi.')
      if (!payload.notes) problems.push('Uraian kegiatan dan hasil wajib diisi.')
      if (payload.activity_data.jenis === 'lainnya' && !payload.activity_data.jenis_lain) problems.push('Tulis jenis kegiatan (Lainnya).')
      if (payload.activity_data.ph !== null && (payload.activity_data.ph < 0 || payload.activity_data.ph > 14)) problems.push('pH harus antara 0 sampai 14.')
      if (payload.activity_data.jam_mulai && payload.activity_data.jam_selesai && payload.activity_data.jam_selesai < payload.activity_data.jam_mulai) problems.push('Jam selesai lebih awal dari jam mulai.')
      return problems
    }

    function openForm(report, asReadonly) {
      editingId = report && report.id ? report.id : null
      modal.querySelector('[data-activity-title]').textContent = !report || !report.id
        ? 'Formulir Laporan Kegiatan'
        : (asReadonly ? 'Laporan Kegiatan ' : 'Edit Laporan Kegiatan ') + (report.batch_code || '')
      fill(report || {})
      // an existing report keeps its type
      modal.querySelector('[data-type-chooser]').classList.toggle('d-none', Boolean(report && report.id))
      setReadonly(Boolean(asReadonly))
      if (drafts && !editingId) drafts.reset()
      showModal()
    }

    // ---- print ----
    function printReport(report) {
      var kp = window.KoiPrint
      if (!kp) { window.alert('Modul cetak belum dimuat. Muat ulang halaman.'); return }
      var e = kp.escapeHtml
      var activity = parse(report.activity_data, {}) || {}
      var jenisText = activity.jenis === 'lainnya' ? (activity.jenis_lain || 'Lainnya') : label(activities, activity.jenis)
      var pondText = parse(report.pond_entries, []).map(function (p) { return [p.pond_name, p.location].filter(Boolean).join(' - ') }).join(', ')
      var staffText = parse(report.reporter_entries, []).map(function (r) { return r.label || r.username }).join(', ')
      var hours = [activity.jam_mulai, activity.jam_selesai].filter(Boolean).join(' - ')
      var items = Array.isArray(activity.bahan) ? activity.bahan : []
      var mediaList = parse(report.media_entries, [])
      var body = '<section class="kp-section"><h2>Uraian kegiatan dan hasil</h2><div class="kp-notes" style="margin:0">' + e(report.notes || '-') + '</div></section>' +
        (items.length ? '<section class="kp-section"><h2>Bahan / obat / pakan</h2><table class="kp-table"><thead><tr><th class="kp-center" style="width:28px">No</th><th>Nama</th><th class="kp-num" style="width:18%">Jumlah</th><th style="width:18%">Satuan</th></tr></thead><tbody>' +
          items.map(function (item, index) { return '<tr><td class="kp-center">' + (index + 1) + '</td><td>' + e(item.nama) + '</td><td class="kp-num">' + e(item.jumlah || '-') + '</td><td>' + e(item.satuan || '-') + '</td></tr>' }).join('') +
          '</tbody></table></section>' : '') +
        (activity.tindak_lanjut ? '<section class="kp-section"><h2>Tindak lanjut</h2><div class="kp-notes" style="margin:0">' + e(activity.tindak_lanjut) + '</div></section>' : '') +
        (mediaList.length ? '<section class="kp-section"><h2>Dokumentasi</h2><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">' +
          mediaList.map(function (m) {
            var src = m.thumbnail_url || m.url || m.image_url
            return '<figure style="margin:0;border:1px solid #999;break-inside:avoid"><img src="' + e(src) + '" style="display:block;width:100%;height:42mm;object-fit:cover">' +
              '<figcaption style="padding:3px 5px;font-size:8.5px">' + e((m.type === 'video' ? '[Video] ' : '') + (m.notes || m.name || '')) + '</figcaption></figure>'
          }).join('') + '</div></section>' : '')
      kp.print({
        key: 'report-activity',
        title: 'Laporan Kegiatan ' + (report.batch_code || ''),
        heading: 'Laporan Kegiatan',
        subheading: (report.batch_code || '') + (report.report_title ? ' - ' + report.report_title : ''),
        info: [
          ['Kode', report.batch_code], ['Tanggal', formatDate(report.report_date)], ['Jam', hours || '-'],
          ['Jenis kegiatan', jenisText], ['Status', label(statuses, activity.status)], ['Kolam', pondText || '-'],
          ['Petugas', staffText || '-'], ['Suhu air', activity.suhu == null ? '-' : kp.size(activity.suhu) + ' °C'], ['pH air', activity.ph == null ? '-' : kp.size(activity.ph)],
        ],
        body: body,
      })
    }

    // ---- list: labels, filter, open/print kegiatan rows with this form ----
    function decorateRows() {
      filterGroup.querySelectorAll('[data-report-filter]').forEach(function (button) {
        var active = button.dataset.reportFilter === filter
        button.classList.toggle('btn-primary', active)
        button.setAttribute('aria-pressed', active ? 'true' : 'false')
      })
      table.querySelectorAll('[data-report-id]').forEach(function (row) {
        var report = reportsById.get(String(row.dataset.reportId))
        var isActivity = Boolean(report && report.report_type === TYPE)
        var isArrival = Boolean(report && report.report_type === 'ikan_datang')
        // Table rows hide themselves; a card hides its column.
        var host = row.closest('tr') || row.closest('[class*="col-"]') || row
        host.classList.toggle('d-none', (filter === 'kegiatan' && !isActivity) || (filter === 'ikan_datang' && !isArrival) || (filter === 'perikanan' && (isActivity || isArrival)))
        if (isArrival) {
          var arrivalBadge = row.closest('.report-card') && row.closest('.report-card').querySelector('.report-card-top .badge')
          var arrivalText = 'Ikan Datang'
          if (arrivalBadge && arrivalBadge.textContent !== arrivalText) { arrivalBadge.textContent = arrivalText; arrivalBadge.className = 'badge bg-teal-lt' }
        }
        if (isActivity) {
          var activity = parse(report.activity_data, {}) || {}
          var rowEl = row.closest('tr')
          var badge = rowEl ? (rowEl.children[3] && rowEl.children[3].querySelector('.badge')) : (row.closest('.report-card') && row.closest('.report-card').querySelector('.report-card-top .badge'))
          var text = 'Kegiatan: ' + (activity.jenis === 'lainnya' ? (activity.jenis_lain || 'Lainnya') : label(activities, activity.jenis))
          if (badge && badge.textContent !== text) { badge.textContent = text; badge.className = 'badge bg-orange-lt' }
        }
      })
    }
    function loadReports() {
      return request('/farm-reports').then(function (reports) {
        reportsById = new Map((Array.isArray(reports) ? reports : []).map(function (r) { return [String(r.id), r] }))
        decorateRows()
      }).catch(function () {})
    }
    function loadOptions() {
      return Promise.all([request('/ponds').catch(function () { return [] }), request('/accounts').catch(function () { return [] })]).then(function (results) {
        ponds = Array.isArray(results[0]) ? results[0] : []
        accounts = (Array.isArray(results[1]) ? results[1] : []).filter(function (a) { return String(a.status || 'Active').toLowerCase() === 'active' })
        pondSelect.innerHTML = ponds.map(function (p) { return '<option value="' + p.id + '">' + escapeHtml(p.name + (p.location ? ' (' + p.location + ')' : '')) + '</option>' }).join('')
        staffSelect.innerHTML = accounts.map(function (a) { return '<option value="' + a.id + '">' + escapeHtml((a.name || a.username) + ' @' + a.username) + '</option>' }).join('')
      })
    }

    var scheduled = false
    new MutationObserver(function () {
      if (scheduled) return
      scheduled = true
      requestAnimationFrame(function () {
        scheduled = false
        var unknown = Array.prototype.some.call(table.querySelectorAll('[data-report-id]'), function (row) { return !reportsById.has(String(row.dataset.reportId)) })
        if (unknown) loadReports(); else decorateRows()
      })
    }).observe(table, { childList: true })

    // capture phase: before the page's own handlers for Perikanan reports
    table.addEventListener('click', function (event) {
      var row = event.target.closest('[data-report-id]')
      if (!row) return
      var report = reportsById.get(String(row.dataset.reportId))
      if (!report || report.report_type !== TYPE) return
      if (event.target.closest('[data-delete-report], .dropdown-toggle')) return
      var edit = event.target.closest('[data-edit-report]')
      var print = event.target.closest('[data-print-report]')
      if (!edit && !print && event.target.closest('button, a, input')) return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (print) printReport(report)
      else openForm(report, !edit || !canWrite())
    }, true)
    table.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter') return
      var row = event.target.closest('[data-report-id]')
      if (row && row.tagName !== 'TR' && event.target !== row) return
      var report = row && reportsById.get(String(row.dataset.reportId))
      if (report && report.report_type === TYPE) { event.preventDefault(); event.stopImmediatePropagation(); openForm(report, !canWrite()) }
    }, true)

    filterGroup.addEventListener('click', function (event) {
      var button = event.target.closest('[data-report-filter]')
      if (!button) return
      filter = button.dataset.reportFilter
      try { sessionStorage.setItem('nishikigoi-report-filter', filter) } catch (e) {}
      decorateRows()
    })

    activityItem.addEventListener('click', function () { openForm(null, false) })

    modal.addEventListener('click', function (event) {
      if (event.target.closest('[data-activity-close]')) { hideModal(); return }
      if (event.target.closest('[data-activity-add-item]')) { addItemRow(); return }
      var removeItem = event.target.closest('[data-item-remove]')
      if (removeItem) { removeItem.closest('[data-activity-item]').remove(); return }
      var removeMedia = event.target.closest('[data-media-remove]')
      if (removeMedia) { collectMedia(); media.splice(Number(removeMedia.dataset.mediaRemove), 1); renderMedia(); return }
      if (event.target.closest('[data-activity-print]') && editingId) {
        var report = reportsById.get(String(editingId))
        if (report) printReport(report)
      }
    })
    form.addEventListener('change', function (event) {
      if (event.target.matches('[data-type-switch]')) {
        var target = event.target.value
        event.target.checked = false
        var self = form.querySelector('[data-type-switch][value="kegiatan"]')
        if (self) self.checked = true
        if (target !== 'kegiatan') switchType(modal, hideModal, target)
        return
      }
      if (event.target.matches('[data-activity-media-input]')) {
        uploadFiles(event.target.files).then(function () { event.target.value = '' })
        return
      }
      updateVisibility()
    })
    form.addEventListener('submit', function (event) {
      event.preventDefault()
      if (readonly) return
      errorBox.classList.add('d-none')
      var payload = buildPayload()
      var problems = validate(payload)
      if (problems.length) { showError(problems.join('\n')); return }
      var submit = modal.querySelector('[data-activity-submit]')
      submit.disabled = true
      submit.textContent = 'Menyimpan...'
      request('/farm-reports' + (editingId ? '/' + editingId : ''), { method: editingId ? 'PUT' : 'POST', body: JSON.stringify(payload) })
        .then(function () {
          if (drafts && !editingId) drafts.consume()
          // Editing keeps the form open; the popup from auth.js says it worked. Adding closes it.
          if (editingId) { window.dispatchEvent(new Event('focus')); loadReports() } else hideModal()
        })
        .catch(function (error) { showError(error.message) })
        .then(function () { submit.disabled = false; submit.textContent = 'Simpan Laporan' })
    })

    var drafts = window.KoiDrafts ? window.KoiDrafts.attach({
      type: 'activity',
      host: modal.querySelector('[data-activity-draft-host]'),
      collect: function () {
        var payload = buildPayload()
        return {
          data: Object.assign({}, payload, {
            pond_entries: JSON.stringify(payload.pond_entries),
            reporter_entries: JSON.stringify(payload.reporter_entries),
            media_entries: JSON.stringify(payload.media_entries),
            activity_data: JSON.stringify(payload.activity_data),
          }),
          summary: payload.report_title + ' - ' + (payload.report_date || ''),
          item_count: 1,
        }
      },
      apply: function (data) { fill(data) },
      open: function () { return loadOptions().then(function () { openForm(null, false) }) },
      onError: showError,
      onInfo: function (message) { mediaStatus.textContent = message },
    }) : null

    loadOptions()
    loadReports()
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
  else start()
})()
