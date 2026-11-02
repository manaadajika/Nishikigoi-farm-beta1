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
    '.input-group:has(>[data-activity-other].d-none){display:none!important}' +
    'body.koi-switching .modal-backdrop,body.koi-switching .modal-backdrop.fade,body.koi-switching .modal-backdrop.show{transition:none!important;opacity:0!important}' +
    'body.koi-switched .modal-backdrop{transition:none!important}' +
    // the filter row has the height and the letters of the button next to it ("Tambah Laporan")
    '.btn-group:has(>[data-report-filter]){border-radius:6px;overflow:hidden}' +
    '.btn-group:has(>[data-report-filter])>[data-report-filter]{height:2.5rem;padding:0 1rem;font-size:.875rem;font-weight:600;border-radius:0!important}' +
    // phone: the title, the filter row (scrolls sideways when it is wider than the screen) and "Tambah Laporan" each get their own line
    '@media (max-width:767.98px){' +
    '.card-header:has(>.card-actions [data-report-filter]){flex-wrap:wrap;gap:.6rem}' +
    '.card-header:has(>.card-actions [data-report-filter])>.card-title{flex:1 1 100%;margin:0}' +
    '.card-header:has(>.card-actions [data-report-filter])>.card-actions{flex:1 1 100%;width:100%;margin:0}' +
    '.card-actions .btn-group:has([data-report-filter]){flex:1 1 100%;overflow-x:auto;margin:0!important;flex-wrap:nowrap}' +
    '.card-actions .btn-group [data-report-filter]{white-space:nowrap;flex:1 1 auto;padding:.3rem .45rem;font-size:.78rem}' +
    '.card-actions [data-report-open]{flex:1 1 100%}' +
    '}' +
    '.koi-switch-shade{position:fixed;inset:0;z-index:1049;pointer-events:none;background:var(--tblr-backdrop-bg,#182433);opacity:var(--tblr-backdrop-opacity,.32);backdrop-filter:blur(4px)}' +
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

  // ONE window for every kind of report: the dialog that is open stays open (same backdrop, same frame) and only its content is swapped:
  // the dialog of the next kind moves into it and the old one is hidden. When the window closes everything goes back to its own place.
  // The next kind's own modal element is placed INSIDE the open one (so everything that form looks up in its own modal keeps working, and
  // clicks, typing and Escape still reach the open window) and shown by hand; the open window's own dialog is only hidden meanwhile.
  function guestRelease(host) {
    var guest = host.__guest
    if (guest) {
      guest.modal.style.display = 'none'
      guest.modal.classList.remove('show')
      guest.modal.setAttribute('aria-hidden', 'true')
      guest.modal.__koiHost = null
      if (guest.parent) guest.parent.insertBefore(guest.modal, guest.next || null)
    }
    host.__guest = null
    if (host.__own) host.__own.style.display = ''
  }
  function guestSwap(host, toModal) {
    if (!host.__own) {
      host.__own = host.querySelector(':scope > .modal-dialog')
      host.addEventListener('hidden.bs.modal', function () { guestRelease(host) })
    }
    guestRelease(host)
    if (toModal === host) return
    var parent = toModal.parentNode
    var next = toModal.nextSibling
    host.appendChild(toModal)
    toModal.style.transition = 'none'
    toModal.style.display = 'block'
    toModal.classList.add('show')
    toModal.removeAttribute('aria-hidden')
    host.__own.style.display = 'none'
    host.__guest = { modal: toModal, parent: parent, next: next }
    toModal.__koiHost = host
  }
  // the form that lives as a guest closes the window it is in
  function guestClose(modal) {
    var host = modal.__koiHost
    if (!host) return false
    // the window fades out with the guest still in it; everything goes back to its place once it is closed (hidden.bs.modal)
    var api = modalApi()
    var instance = api && api.getInstance(host)
    if (instance) instance.hide()
    return true
  }

  // Changes the report type without the dialog flashing: the next form opens in the same moment the old one closes
  // (no fade, no gap), and the date, title and text typed so far move along.
  function switchType(fromModal, hide, type) {
    var fromFamily = fromModal.hasAttribute('data-activity-modal') ? 'kegiatan' : fromModal.hasAttribute('data-arrival-modal') ? 'ikan_datang' : 'perikanan'
    var carried = readShared(fromFamily)
    // the usual way: one window, its content swapped (no closing, no opening)
    var hostModal = fromModal.__koiHost || fromModal
    var mainModal = document.querySelector('[data-report-modal]')
    var toFamily = typeFamily(type)
    var target = null
    try { target = modalOfFamily(toFamily) } catch (e) {}
    if (target && hostModal.classList.contains('show') && (target !== mainModal || hostModal === mainModal)) {
      guestSwap(hostModal, target)
      openType(type)
      ;[60, 400, 1000].forEach(function (delay) { setTimeout(function () { applyShared(toFamily, carried, delay > 60) }, delay) })
      return
    }
    // while the forms swap, the dark layer behind them neither fades out nor fades in again (that was the flash)
    // the real backdrop is hidden for a moment and an identical layer stands in for it, so the page never lights up between the two forms
    var shade = document.createElement('div')
    shade.className = 'koi-switch-shade'
    document.body.appendChild(shade)
    document.body.classList.add('koi-switching')
    setTimeout(function () {
      document.body.classList.add('koi-switched')
      document.body.classList.remove('koi-switching')
      shade.remove()
      setTimeout(function () { document.body.classList.remove('koi-switched') }, 400)
    }, 900)
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
    typeChooserHtml: typeChooserHtml, openType: openType, switchType: switchType, guestClose: guestClose,
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
    if (['semua', 'data_ulang', 'panen', 'kegiatan', 'ikan_datang'].indexOf(filter) < 0) filter = 'semua'

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
    filterGroup.innerHTML = [['semua', 'Semua'], ['data_ulang', 'Data Ulang'], ['panen', 'Panen'], ['kegiatan', 'Kegiatan'], ['ikan_datang', 'Ikan Datang']].map(function (item) {
      return '<button type="button" class="btn btn-sm" data-report-filter="' + item[0] + '">' + item[1] + '</button>'
    }).join('')
    openButton.parentNode.insertBefore(filterGroup, openButton)
    // A/Z | Z/A: the order of the cards by report date (Z/A = newest first, A/Z = oldest first, the same words as Data Ikan)
    var sortDesc = true
    try { sortDesc = sessionStorage.getItem('nishikigoi-report-sort') !== 'asc' } catch (e) {}
    var sortButton = document.createElement('button')
    sortButton.type = 'button'
    sortButton.className = 'btn btn-outline-primary btn-sm me-2'
    sortButton.setAttribute('data-report-sort', '')
    sortButton.style.cssText = 'height:2.5rem;min-width:3.2rem;font-weight:600'
    function paintSort() {
      sortButton.textContent = sortDesc ? 'Z/A' : 'A/Z'
      sortButton.setAttribute('aria-pressed', sortDesc ? 'true' : 'false')
      sortButton.title = sortDesc ? 'Urutan tanggal: terbaru di atas (Z ke A)' : 'Urutan tanggal: terlama di atas (A ke Z)'
      sortButton.setAttribute('aria-label', sortButton.title)
    }
    paintSort()
    openButton.parentNode.insertBefore(sortButton, openButton)
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
      '<div class="col-md-2"><label class="form-label">Kode Batch</label><input class="form-control" data-code-box placeholder="Otomatis" title="Boleh diisi sendiri. Kosongkan supaya kode dibuat otomatis." autocomplete="off" data-no-clear></div>' +
      '<div class="col-md-4"><label class="form-label">Judul <span class="text-secondary small">(opsional)</span></label><input class="form-control" name="judul" placeholder="Otomatis dari jenis dan kolam"></div>' +
      '<div class="col-md-4"><label class="form-label required">Tanggal</label><input class="form-control" type="text" data-date-parts name="tanggal"></div>' +
      '<div class="col-6 col-md-4"><label class="form-label">Jam mulai</label><input class="form-control" type="time" name="jam_mulai"></div>' +
      '<div class="col-6 col-md-4"><label class="form-label">Jam selesai</label><input class="form-control" type="time" name="jam_selesai"></div>' +
      '<div class="col-md-6" data-chips-ponds><label class="form-label">Kolam <span class="text-secondary small">(kolam atau seluruh area, bisa lebih dari satu)</span></label><div class="d-flex flex-wrap gap-1 mb-1" data-chip-list></div>' +
      '<input class="form-control" data-chip-input data-suggest-key="place" placeholder="Cari kolam atau area lalu pilih dari daftar" autocomplete="off"><div class="form-hint text-danger" data-chip-hint></div></div>' +
      '<div class="col-md-6" data-chips-staff><label class="form-label">Petugas <span class="text-secondary small">(bisa lebih dari satu)</span></label><div class="d-flex flex-wrap gap-1 mb-1" data-chip-list></div>' +
      '<input class="form-control" data-chip-input list="activity-staff-options" placeholder="Cari nama petugas lalu pilih dari daftar" autocomplete="off"><datalist id="activity-staff-options"></datalist><div class="form-hint text-danger" data-chip-hint></div></div>' +
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
    // Kolam and Petugas: chosen from the list one by one and shown as small tags (no Ctrl-click on a multiple select)
    function makeChips(box, options) {
      var tags = box.querySelector('[data-chip-list]')
      var input = box.querySelector('[data-chip-input]')
      var hint = box.querySelector('[data-chip-hint]')
      var entries = []
      function render() {
        tags.innerHTML = entries.map(function (entry, index) {
          return '<span class="badge bg-blue-lt d-inline-flex align-items-center gap-1" style="font-size:.85rem;padding:.35rem .5rem">' + escapeHtml(options.labelOf(entry)) +
            (readonly ? '' : '<button type="button" class="btn-close" style="font-size:.55rem" data-chip-remove="' + index + '" aria-label="Hapus"></button>') + '</span>'
        }).join('')
      }
      function add(text) {
        var value = String(text || '').trim()
        if (!value) return true
        var entry = options.resolve(value)
        if (!entry) { hint.textContent = '"' + value + '" tidak ada di daftar.'; return false }
        hint.textContent = ''
        if (!entries.some(function (item) { return options.keyOf(item) === options.keyOf(entry) })) entries.push(entry)
        input.value = ''
        render()
        return true
      }
      input.addEventListener('keydown', function (event) { if (event.key === 'Enter') { event.preventDefault(); add(input.value) } })
      input.addEventListener('change', function () { add(input.value) })
      tags.addEventListener('click', function (event) {
        var remove = event.target.closest('[data-chip-remove]')
        if (!remove) return
        entries.splice(Number(remove.getAttribute('data-chip-remove')), 1)
        render()
      })
      return {
        get: function () { return entries.slice() },
        set: function (list) { entries = (list || []).slice(); hint.textContent = ''; input.value = ''; render() },
        flush: function () { return add(input.value) },
        refresh: render,
      }
    }
    var pondChips = makeChips(modal.querySelector('[data-chips-ponds]'), {
      resolve: function (text) {
        var name = text.toLowerCase()
        var pond = ponds.find(function (item) { return String(item.name || '').trim().toLowerCase() === name })
        if (pond) return { pond_id: Number(pond.id), pond_name: pond.name, location: pond.location || '' }
        var inArea = ponds.find(function (item) { return String(item.location || '').trim().toLowerCase() === name })
        if (inArea) { var area = String(inArea.location).trim(); return { pond_id: '', pond_name: area, location: area, area: true } }
        return null
      },
      labelOf: function (entry) { return entry.area ? entry.pond_name + ' (seluruh area)' : entry.pond_name + (entry.location ? ' (' + entry.location + ')' : '') },
      keyOf: function (entry) { return entry.area ? 'a:' + String(entry.pond_name).toLowerCase() : 'p:' + entry.pond_id },
    })
    var staffChips = makeChips(modal.querySelector('[data-chips-staff]'), {
      resolve: function (text) {
        var name = text.toLowerCase()
        var account = accounts.find(function (item) {
          return ((item.name || item.username) + ' @' + item.username).toLowerCase() === name || String(item.username || '').toLowerCase() === name || String(item.name || '').trim().toLowerCase() === name
        })
        return account ? { account_id: Number(account.id), label: account.name || account.username || '', username: account.username || '' } : null
      },
      labelOf: function (entry) { return entry.label + (entry.username ? ' @' + entry.username : '') },
      keyOf: function (entry) { return 'a' + entry.account_id },
    })

    function showModal() {
      if (modal.__koiHost) { modal.classList.add('show'); return }
      var api = modalApi()
      if (api) api.getOrCreateInstance(modal).show()
      else { modal.classList.add('show'); modal.style.display = 'block' }
    }
    function hideModal() {
      if (!guestClose(modal)) {
      var api = modalApi()
      if (api) { var instance = api.getInstance(modal); if (instance) instance.hide() }
      else { modal.classList.remove('show'); modal.style.display = 'none' }
      }
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
      pondChips.refresh()
      staffChips.refresh()
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
      pondChips.set(parse(data.pond_entries, []).map(function (p) {
        return p.pond_id ? { pond_id: Number(p.pond_id), pond_name: p.pond_name || '', location: p.location || '' }
          : { pond_id: '', pond_name: p.pond_name || p.location || '', location: p.location || p.pond_name || '', area: true }
      }))
      var session = window.KoiAuth.getSession() || {}
      // Petugas starts empty in a new report: whoever did the work is chosen on purpose
      staffChips.set(parse(data.reporter_entries, []).map(function (r) { return { account_id: Number(r.account_id || r.id) || '', label: r.label || r.name || r.username || '', username: r.username || '' } }))
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
      pondChips.flush()
      staffChips.flush()
      var pondEntries = pondChips.get().map(function (entry) { return entry.area ? { pond_id: '', pond_name: entry.pond_name, location: entry.location, area: true } : { pond_id: entry.pond_id, pond_name: entry.pond_name, location: entry.location } })
      var staffEntries = staffChips.get().map(function (entry) { return { account_id: entry.account_id, label: entry.label, username: entry.username } })
      var title = form.elements.judul.value.trim() ||
        (jenisText + (pondEntries.length ? ' - ' + pondEntries.slice(0, 3).map(function (p) { return p.pond_name }).join(', ') + (pondEntries.length > 3 ? ', ...' : '') : ''))
      var toNumber = function (value) { var n = Number(String(value).replace(',', '.')); return String(value).trim() === '' || !Number.isFinite(n) ? null : n }
      return {
        report_type: TYPE,
        batch_code: modal.querySelector('[data-code-box]').value.trim(),
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
      modal.querySelector('[data-code-box]').value = report && report.batch_code ? report.batch_code : ''
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
      var pondText = parse(report.pond_entries, []).map(function (p) { return p.pond_id ? [p.pond_name, p.location].filter(Boolean).join(' - ') : (p.pond_name || p.location) + ' (seluruh area)' }).join(', ')
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
        var kind = report ? (report.report_type === 'panen' || report.report_type === 'kegiatan' || report.report_type === 'ikan_datang' ? report.report_type : 'data_ulang') : 'data_ulang'
        host.classList.toggle('d-none', filter !== 'semua' && kind !== filter)
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
      sortCards()
    }
    // cards are in the order of the server (newest report date first); Z/A keeps that, A/Z reverses it. Only moves cards when the order is wrong.
    function sortCards() {
      var hosts = Array.prototype.filter.call(table.children, function (el) { return el.querySelector && el.querySelector('[data-report-id]') })
      if (hosts.length < 2) return
      function key(el) { var r = reportsById.get(String(el.querySelector('[data-report-id]').dataset.reportId)) || {}; return [String(r.report_date || ''), String(r.created_at || ''), Number(r.id) || 0] }
      var sorted = hosts.slice().sort(function (x, y) {
        var a = key(x), b = key(y), n = 0
        for (var i = 0; i < 3 && !n; i += 1) n = a[i] < b[i] ? -1 : a[i] > b[i] ? 1 : 0
        return sortDesc ? -n : n
      })
      var same = sorted.every(function (el, i) { return el === hosts[i] })
      if (same) return
      sorted.forEach(function (el) { table.appendChild(el) })
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
        modal.querySelector('#activity-staff-options').innerHTML = accounts.map(function (a) { return '<option value="' + escapeHtml((a.name || a.username) + ' @' + a.username) + '"></option>' }).join('')
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

    sortButton.addEventListener('click', function () {
      sortDesc = !sortDesc
      try { sessionStorage.setItem('nishikigoi-report-sort', sortDesc ? 'desc' : 'asc') } catch (e) {}
      paintSort()
      sortCards()
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
      apply: function (data) { fill(data); modal.querySelector('[data-code-box]').value = data.batch_code || '' },
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
