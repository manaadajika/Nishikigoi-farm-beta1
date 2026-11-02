// Data Ikan > Edit Masal dari file. The file is the one the Excel / ZIP buttons of the dock download: the id of a fish is its Kode Koi, the other
// columns are the fields. Only the columns that are in the file and the cells that are filled in change a fish; a cell with [kosong] empties
// the field; a Kode Koi that does not exist is skipped (nothing is created, nothing is deleted, fish that are not in the file stay as they are).
// The file is shown as a before -> after list first; the server then applies it in one go (POST /api/koi/macro-apply) and keeps the old values
// for 30 days so the whole edit can be undone. A ZIP can carry photos named after the Kode Koi (or the Nama Foto column): they are added to the
// History Progress Foto of the fish.
function koiMacroBoot() {
  'use strict'

  var api = null
  var modalEl = null
  var plan = null
  var applied = false

  var LABELS = {
    name: 'Nama', pond: 'Lokasi', area: 'Area', variety: 'Varietas', bloodline: 'Bloodline', farm_name: 'Ternakan', breeder: 'Owner',
    gender: 'Sex', parent_type: 'Typ', status: 'Status', birth_date: 'Tanggal Lahir', purchase_date: 'Tanggal Beli', purchase_price: 'Harga Beli',
    sale_price: 'Harga Jual', current_length_cm: 'Size (cm)', notes: 'Catatan',
  }
  var EDITABLE = ['name', 'pond_name', 'area', 'variety', 'bloodline', 'farm_name', 'breeder', 'gender', 'parent_type', 'status', 'birth_date', 'purchase_date', 'purchase_price', 'sale_price', 'current_length_cm', 'notes']
  var STATUS_TEXT = { active: 'Aktif', non_active: 'Non-Aktif', quarantine: 'Karantina', sold: 'Terjual', dead: 'Mati' }
  var CLEAR = /^\[kosong\]$/i

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] })
  }
  function request(method, url, body) {
    return fetch(url, { method: method, headers: body === undefined ? undefined : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }).then(function (response) {
      return response.json().catch(function () { return {} }).then(function (data) {
        if (!response.ok) throw new Error(data.error || 'Permintaan gagal.')
        return data
      })
    })
  }
  function text(value) { return String(value == null ? '' : value).replace(/\r\n?/g, '\n').trim() } // a line break is the same in Excel (CRLF) and in the database (LF)
  function sameValue(a, b) {
    a = text(a); b = text(b)
    if (a !== '' && b !== '' && !isNaN(Number(a)) && !isNaN(Number(b))) return Number(a) === Number(b)
    return a === b
  }

  // ---- the modal -----------------------------------------------------------------------------------------------------------------------------
  function ensureModal() {
    if (modalEl) return modalEl
    modalEl = document.createElement('div')
    modalEl.className = 'modal modal-blur fade'
    modalEl.id = 'koi-macro-modal'
    modalEl.tabIndex = -1
    modalEl.innerHTML =
      '<div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable"><div class="modal-content">' +
        '<div class="modal-header"><h5 class="modal-title">Edit Masal dari Excel / ZIP</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Tutup"></button></div>' +
        '<div class="modal-body">' +
          '<div class="mb-3"><div class="fw-semibold mb-1">1. Unduh data</div>' +
            '<div class="text-secondary small mb-2">Pilih ikan di daftar (atau biarkan kosong untuk semua hasil pencarian dan filter), lalu unduh. Kolom pertama, <strong>Kode Koi</strong>, adalah ID ikan.</div>' +
            '<div class="d-flex gap-2 flex-wrap"><button class="btn btn-outline-primary" type="button" data-macro-download="xlsx">Unduh Excel</button><button class="btn btn-outline-primary" type="button" data-macro-download="zip">Unduh ZIP (Excel + foto)</button>' +
            '<button class="btn btn-outline-primary" type="button" data-macro-blank="xlsx" title="Excel berisi judul kolom saja, untuk ikan baru">Template kosong Excel (entry baru)</button><button class="btn btn-outline-primary" type="button" data-macro-blank="zip" title="Contoh ZIP: Excel kosong dan folder foto, untuk ikan baru">Template kosong ZIP (entry baru)</button>' +
            '<button class="btn btn-outline-primary" type="button" data-macro-import="xlsx">Impor data baru (Excel)</button><button class="btn btn-outline-primary" type="button" data-macro-import="zip">Impor data baru (ZIP)</button></div></div>' +
          '<div class="mb-3"><div class="fw-semibold mb-1">2. Ubah file, lalu unggah</div>' +
            '<ul class="text-secondary small mb-2 ps-3"><li>Hapus kolom yang tidak ingin diubah. Yang wajib hanya <strong>Kode Koi</strong>.</li>' +
            '<li>Sel kosong berarti tidak diubah. Untuk mengosongkan isian, tulis <code>[kosong]</code>.</li>' +
            '<li>Kode Koi yang tidak ada di Data Ikan dilewati (ikan baru: pakai template kosong lalu Impor data baru). Ikan yang tidak ada di file tidak berubah dan tidak dihapus.</li>' +
            '<li>Di ZIP, foto bernama sama dengan Kode Koi (atau kolom Nama Foto) masuk ke History Progress Foto.</li></ul>' +
            '<input class="form-control" type="file" accept=".xlsx,.xls,.zip" data-macro-file /></div>' +
          '<div data-macro-status class="small text-secondary mb-2"></div>' +
          '<div data-macro-preview></div>' +
          '<hr /><div class="fw-semibold mb-1">Riwayat edit masal (30 hari terakhir)</div><div data-macro-history class="small"></div>' +
        '</div>' +
        '<div class="modal-footer"><button type="button" class="btn" data-bs-dismiss="modal">Tutup</button><button type="button" class="btn btn-primary" data-macro-apply hidden>Terapkan</button></div>' +
      '</div></div>'
    document.body.appendChild(modalEl)
    modalEl.addEventListener('hidden.bs.modal', function () {
      if (applied) { applied = false; window.location.reload() }
    })
    modalEl.querySelector('[data-macro-file]').addEventListener('change', function (event) {
      var file = event.target.files && event.target.files[0]
      event.target.value = ''
      if (file) readFile(file)
    })
    modalEl.addEventListener('click', function (event) {
      var download = event.target.closest('[data-macro-download]')
      if (download) {
        var selector = download.getAttribute('data-macro-download') === 'xlsx' ? '[data-export-selected-spreadsheet]' : '[data-download-selected-images]'
        var button = document.querySelector(selector)
        if (button) button.click()
        return
      }
      var imp = event.target.closest('[data-macro-import]')
      if (imp) {
        // the import of new fish works inside the "Tambah ikan" window: open it, then ask for the file
        var pick = document.querySelector(imp.getAttribute('data-macro-import') === 'xlsx' ? '[data-import-koi-excel]' : '[data-import-koi-zip]')
        var Modal = (window.tabler && window.tabler.bootstrap && window.tabler.bootstrap.Modal) || (window.bootstrap && window.bootstrap.Modal)
        if (Modal) Modal.getOrCreateInstance(modalEl).hide()
        var add = document.querySelector('[data-open-add-koi]')
        if (add) add.click()
        setTimeout(function () { if (pick) pick.click() }, 350)
        return
      }
      var blank = event.target.closest('[data-macro-blank]')
      if (blank) {
        var tpl = document.querySelector(blank.getAttribute('data-macro-blank') === 'xlsx' ? '[data-export-koi-excel-template]' : '[data-export-koi-zip-template]')
        if (tpl) tpl.click()
        return
      }
      if (event.target.closest('[data-macro-apply]')) { apply(); return }
      var undo = event.target.closest('[data-macro-undo]')
      if (undo) undoBatch(undo.getAttribute('data-macro-undo'), undo)
    })
    return modalEl
  }
  function modalApi() { return (window.tabler && window.tabler.bootstrap && window.tabler.bootstrap.Modal) || (window.bootstrap && window.bootstrap.Modal) }
  function status(message, bad) {
    var box = modalEl.querySelector('[data-macro-status]')
    box.textContent = message || ''
    box.className = 'small mb-2 ' + (bad ? 'text-danger' : 'text-secondary')
  }

  function open() {
    api = window.KoiImportApi
    if (!api) { window.alert('Halaman belum siap. Muat ulang halaman lalu coba lagi.'); return }
    ensureModal()
    plan = null
    applied = false
    modalEl.querySelector('[data-macro-preview]').innerHTML = ''
    modalEl.querySelector('[data-macro-apply]').hidden = true
    status('')
    loadHistory()
    var Modal = modalApi()
    if (Modal) Modal.getOrCreateInstance(modalEl).show()
  }

  // ---- reading the file ------------------------------------------------------------------------------------------------------------------------
  function extension(name) { var m = /\.([a-z0-9]+)$/i.exec(String(name || '')); return m ? m[1].toLowerCase() : '' }
  function readFile(file) {
    status('Membaca file...')
    modalEl.querySelector('[data-macro-preview]').innerHTML = ''
    modalEl.querySelector('[data-macro-apply]').hidden = true
    var images = []
    var xlsxFilePromise
    if (extension(file.name) === 'zip') {
      xlsxFilePromise = api.parseKoiZip(file).then(function (entries) {
        var xlsx = entries.filter(function (entry) { return extension(entry.name) === 'xlsx' })
        if (xlsx.length !== 1) throw new Error('ZIP wajib berisi tepat satu file .xlsx.')
        images = entries.filter(function (entry) { return ['jpg', 'jpeg', 'png', 'webp', 'gif'].indexOf(extension(entry.name)) >= 0 && String(entry.name).split('/').pop().charAt(0) !== '.' })
        return new File([xlsx[0].data], String(xlsx[0].name).split('/').pop())
      })
    } else {
      xlsxFilePromise = Promise.resolve(file)
    }
    xlsxFilePromise.then(function (xlsxFile) { return api.parseXlsxRows(xlsxFile) }).then(function (rows) {
      return build(rows, images, file.name)
    }).catch(function (error) { status(error.message || 'File tidak dapat dibaca.', true) })
  }

  function build(rows, images, sourceName) {
    var map = new Map()
    api.excelHeaderMap.forEach(function (value, key) { map.set(key, value) })
    api.zipHeaderMap.forEach(function (value, key) { map.set(key, value) })
    var headerIndex = api.findHeaderRowIndex(rows, map)
    var rawHeaders = rows[headerIndex] || []
    var headers = rawHeaders.map(function (item) { return map.get(String(item).trim().toLowerCase()) || '' })
    if (headers.indexOf('code') < 0) throw new Error('File wajib memiliki kolom Kode Koi.')
    var ignored = rawHeaders.map(function (item, index) { return { name: String(item).trim(), key: headers[index] } }).filter(function (h) { return h.name && (!h.key || (h.key !== 'code' && h.key !== 'photo_name' && EDITABLE.indexOf(h.key) < 0)) }).map(function (h) { return h.name })
    var dataRows = rows.slice(headerIndex + 1)
    var records = []
    dataRows.forEach(function (row, index) {
      var record = { line: (row && row.excelRow) || index + headerIndex + 2 }
      var any = false
      headers.forEach(function (key, column) {
        if (!key) return
        var value = text(row[column])
        record[key] = value
        if (value) any = true
      })
      if (any && record.code) records.push(record)
    })
    if (!records.length) throw new Error('File tidak berisi baris dengan Kode Koi.')
    var seen = {}
    var duplicates = []
    records.forEach(function (record) {
      var key = api.normalizeZipCode(record.code)
      if (seen[key]) duplicates.push(record.code)
      seen[key] = true
    })
    if (duplicates.length) throw new Error('Kode Koi kembar di file: ' + duplicates.join(', '))
    var codes = records.map(function (record) { return record.code })
    status('Mencocokkan ' + codes.length + ' Kode Koi dengan Data Ikan...')
    return window.KoiPicker.byCodes(codes, { scope: 'all' }).then(function (found) {
      var byCode = new Map()
      found.forEach(function (item) { byCode.set(api.normalizeZipCode(item.code), item) })
      plan = compare(records, byCode, images, sourceName, ignored)
      render()
    })
  }

  function pondLabel(item) { return text(item.pond_name) || text(item.pond_location) || '' }

  function compare(records, byCode, images, sourceName, ignored) {
    var ponds = api.pondsList()
    var areas = {}
    ponds.forEach(function (pond) { var area = text(pond.location); if (area) areas[area.toLowerCase()] = area })
    var photosByKey = new Map()
    images.forEach(function (entry) { photosByKey.set(api.normalizePhotoName(entry.name), entry) })
    var result = { source: sourceName, changes: [], unchanged: 0, missing: [], problems: [], photos: [], ignoredColumns: ignored, rows: [] }

    records.forEach(function (record) {
      var existing = byCode.get(api.normalizeZipCode(record.code))
      if (!existing) { result.missing.push(record.code); return }
      var patch = {}
      var diffs = []
      var linked = /^\s*[A-Za-z]{2}\d{4,}/.test(text(existing.parent_info))   // a fish of a breeding session (BR260905 - ...) follows the session for Bloodline / Ternakan
      function add(key, label, oldText, newText, patchPart) {
        if (sameValue(oldText, newText)) return
        if (linked && (key === 'bloodline' || key === 'farm_name')) {
          diffs.push({ label: label, oldText: oldText, newText: newText, note: 'diabaikan: mengikuti sesi breeding' })
          return
        }
        Object.keys(patchPart).forEach(function (field) { patch[field] = patchPart[field] })
        diffs.push({ label: label, oldText: oldText, newText: newText })
      }
      EDITABLE.forEach(function (key) {
        var raw = record[key]
        if (raw === undefined || raw === '') return
        var clear = CLEAR.test(raw)
        if (key === 'pond_name') {
          if (clear) { add('pond', LABELS.pond, pondLabel(existing), '(kosong)', { pond_id: null, area: '' }); return }
          var pond = ponds.filter(function (item) { return String(item.name).toLowerCase() === raw.toLowerCase() })[0]
          if (pond) { add('pond', LABELS.pond, pondLabel(existing), pond.name, { pond_id: pond.id }); return }
          if (areas[raw.toLowerCase()]) { add('pond', LABELS.pond, pondLabel(existing), areas[raw.toLowerCase()] + ' (area)', { pond_id: null, area: areas[raw.toLowerCase()] }); return }
          result.problems.push('Baris ' + record.line + ' (' + record.code + '): Lokasi "' + raw + '" tidak ada di Data Kolam')
          return
        }
        if (key === 'area') {
          if (text(existing.pond_name)) return   // a fish with a pond has the area of its pond
          add('area', LABELS.area, text(existing.pond_location), clear ? '(kosong)' : raw, { area: clear ? '' : raw })
          return
        }
        var normalized = ''
        if (!clear) {
          var probe = {}
          probe[key] = raw
          normalized = api.normalizeImportedKoiItem(probe)[key]
          if (['birth_date', 'purchase_date'].indexOf(key) >= 0 && !normalized) { result.problems.push('Baris ' + record.line + ' (' + record.code + '): ' + LABELS[key] + ' "' + raw + '" tidak dikenali'); return }
          if (['purchase_price', 'sale_price', 'current_length_cm'].indexOf(key) >= 0 && (normalized === '' || isNaN(Number(normalized)))) { result.problems.push('Baris ' + record.line + ' (' + record.code + '): ' + LABELS[key] + ' "' + raw + '" bukan angka'); return }
        }
        var oldValue = key === 'birth_date' || key === 'purchase_date' ? text(existing[key]).slice(0, 10) : existing[key]
        var oldShown = key === 'status' ? (STATUS_TEXT[existing.status] || existing.status) : oldValue
        var newShown = clear ? '(kosong)' : key === 'status' ? (STATUS_TEXT[normalized] || normalized) : normalized
        var patchPart = {}
        patchPart[key] = clear ? (['purchase_price', 'sale_price', 'current_length_cm', 'birth_date', 'purchase_date'].indexOf(key) >= 0 ? null : '') : normalized
        add(key, LABELS[key], oldShown, newShown, patchPart)
      })
      var photoEntry = null
      var wanted = record.photo_name || record.code
      if (images.length) photoEntry = photosByKey.get(api.normalizePhotoName(wanted)) || photosByKey.get(api.normalizePhotoName(record.code)) || null
      if (photoEntry) result.photos.push({ id: existing.id, code: existing.code, entry: photoEntry, length: patch.current_length_cm || (record.current_length_cm && !CLEAR.test(record.current_length_cm) ? record.current_length_cm : '') })
      var effective = diffs.filter(function (d) { return !d.note })
      if (effective.length) result.changes.push({ id: existing.id, code: existing.code, patch: patch, diffs: diffs })
      else if (!photoEntry) result.unchanged++
      if (!effective.length && diffs.length) result.rows.push({ code: existing.code, diffs: diffs })
    })
    return result
  }

  function render() {
    var box = modalEl.querySelector('[data-macro-preview]')
    var changed = plan.changes.length
    var cells = plan.changes.reduce(function (sum, change) { return sum + change.diffs.filter(function (d) { return !d.note }).length }, 0)
    var html = '<div class="d-flex flex-wrap gap-2 mb-2">' +
      '<span class="badge bg-green-lt">Berubah: ' + changed + ' ikan (' + cells + ' isian)</span>' +
      '<span class="badge bg-secondary-lt">Tanpa perubahan: ' + plan.unchanged + '</span>' +
      '<span class="badge bg-orange-lt">Kode tidak ditemukan (dilewati): ' + plan.missing.length + '</span>' +
      '<span class="badge bg-red-lt">Bermasalah (dilewati): ' + plan.problems.length + '</span>' +
      (plan.photos.length ? '<span class="badge bg-blue-lt">Foto progress: ' + plan.photos.length + '</span>' : '') + '</div>'
    if (plan.ignoredColumns.length) html += '<div class="small text-secondary mb-2">Kolom yang tidak dipakai di edit masal (diabaikan): ' + esc(plan.ignoredColumns.join(', ')) + '</div>'
    if (plan.missing.length) html += '<details class="mb-2"><summary class="small">Kode Koi tidak ditemukan (' + plan.missing.length + ')</summary><div class="small text-secondary">' + esc(plan.missing.join(', ')) + '</div></details>'
    if (plan.problems.length) html += '<details class="mb-2" open><summary class="small text-danger">Bermasalah (' + plan.problems.length + ')</summary><div class="small">' + plan.problems.map(esc).join('<br>') + '</div></details>'
    if (changed) {
      var shown = 0
      var rows = ''
      plan.changes.some(function (change) {
        return change.diffs.some(function (diff) {
          if (shown >= 400) return true
          shown++
          rows += '<tr><td><strong>' + esc(change.code) + '</strong></td><td>' + esc(diff.label) + '</td><td class="text-secondary">' + esc(text(diff.oldText) || '(kosong)') + '</td><td>' + (diff.note ? '<span class="text-secondary text-decoration-line-through">' + esc(diff.newText) + '</span> <small class="text-warning">' + esc(diff.note) + '</small>' : '<strong>' + esc(diff.newText) + '</strong>') + '</td></tr>'
          return false
        })
      })
      html += '<div class="table-responsive" style="max-height:340px;overflow:auto"><table class="table table-sm"><thead><tr><th>Kode Koi</th><th>Isian</th><th>Lama</th><th>Baru</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
        (cells > 400 ? '<div class="small text-secondary">Menampilkan 400 perubahan pertama dari ' + cells + '.</div>' : '')
    } else if (!plan.photos.length) {
      html += '<div class="text-secondary">Tidak ada perubahan yang bisa diterapkan.</div>'
    }
    box.innerHTML = html
    var applyButton = modalEl.querySelector('[data-macro-apply]')
    applyButton.hidden = !(changed || plan.photos.length)
    applyButton.disabled = false
    applyButton.textContent = 'Terapkan ' + (changed ? changed + ' ikan' : '') + (changed && plan.photos.length ? ' + ' : '') + (plan.photos.length ? plan.photos.length + ' foto' : '')
    status('')
  }

  // ---- applying -----------------------------------------------------------------------------------------------------------------------------------
  function shrink(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader()
      reader.onerror = function () { reject(new Error('Foto gagal dibaca.')) }
      reader.onload = function () {
        var dataUrl = reader.result
        if (blob.type === 'image/gif') { resolve(dataUrl); return }
        var image = new Image()
        image.onload = function () {
          var scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight))
          var canvas = document.createElement('canvas')
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
          canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
          resolve(canvas.toDataURL('image/jpeg', 0.76))
        }
        image.onerror = function () { resolve(dataUrl) }
        image.src = dataUrl
      }
      reader.readAsDataURL(blob)
    })
  }
  function mime(name) { var e = extension(name); return e === 'png' ? 'image/png' : e === 'webp' ? 'image/webp' : e === 'gif' ? 'image/gif' : 'image/jpeg' }

  function apply() {
    if (!plan) return
    if (plan.changes.length > 2000) { status('Terlalu banyak: ' + plan.changes.length + ' ikan berubah, maksimal 2000 sekali terapkan. Pecah file menjadi beberapa bagian.', true); return }
    var button = modalEl.querySelector('[data-macro-apply]')
    button.disabled = true
    var summary = { updated: 0, unchanged: 0, photos: 0, failedPhotos: [] }
    var first = plan.changes.length
      ? request('POST', '/api/koi/macro-apply', { source: plan.source, rows: plan.changes.map(function (change) { return { id: change.id, code: change.code, patch: change.patch } }) }).then(function (data) {
          summary.updated = data.updated
          summary.unchanged = data.unchanged
          applied = true
        })
      : Promise.resolve()
    first.then(function () {
      return plan.photos.reduce(function (chain, photo, index) {
        return chain.then(function () {
          status('Mengunggah foto progress ' + (index + 1) + ' dari ' + plan.photos.length + '...')
          return shrink(new Blob([photo.entry.data], { type: mime(photo.entry.name) })).then(function (dataUrl) {
            return request('POST', '/api/koi-images', { image_data: dataUrl, prefix: String(photo.code || 'koi').toLowerCase().replace(/[^a-z0-9-]/g, '') || 'koi' })
          }).then(function (uploaded) {
            return request('POST', '/api/koi/' + photo.id + '/photo-history', { image_url: uploaded.image_url, length_cm: photo.length || '', notes: 'Progress dari Edit Masal' })
          }).then(function () { summary.photos++; applied = true }).catch(function (error) { summary.failedPhotos.push(photo.code + ': ' + (error.message || 'gagal')) })
        })
      }, Promise.resolve())
    }).then(function () {
      var message = 'Selesai. ' + summary.updated + ' ikan diperbarui' + (summary.photos ? ', ' + summary.photos + ' foto progress ditambahkan' : '') + '.'
      status(message + (summary.failedPhotos.length ? ' Foto gagal: ' + summary.failedPhotos.join('; ') : '') + (summary.photos ? ' (Foto progress tidak ikut dibatalkan; hapus lewat History Progress Foto bila perlu.)' : ''))
      modalEl.querySelector('[data-macro-preview]').innerHTML = ''
      button.hidden = true
      plan = null
      loadHistory()
    }).catch(function (error) {
      status(error.message || 'Edit masal gagal disimpan. Tidak ada yang berubah.', true)
      button.disabled = false
    })
  }

  // ---- history / undo ---------------------------------------------------------------------------------------------------------------------------
  function loadHistory() {
    var box = modalEl.querySelector('[data-macro-history]')
    box.textContent = 'Memuat...'
    request('GET', '/api/koi/macro-batches').then(function (data) {
      var items = data.items || []
      if (!items.length) { box.innerHTML = '<span class="text-secondary">Belum ada edit masal.</span>'; return }
      box.innerHTML = items.map(function (item) {
        return '<div class="d-flex justify-content-between align-items-center gap-2 py-1 border-bottom"><div><strong>' + esc(window.KoiAuth && window.KoiAuth.formatDateTime ? window.KoiAuth.formatDateTime(item.created_at) : item.created_at) + '</strong> &middot; ' + esc(item.actor || '-') + ' &middot; ' + Number(item.row_count) + ' ikan &middot; <span class="text-secondary">' + esc(item.source || '') + '</span></div>' +
          (item.undone_at ? '<span class="badge bg-secondary-lt">Sudah dibatalkan</span>' : '<button class="btn btn-sm btn-outline-danger" type="button" data-macro-undo="' + item.id + '">Batalkan</button>') + '</div>'
      }).join('')
    }).catch(function (error) { box.innerHTML = '<span class="text-danger">' + esc(error.message) + '</span>' })
  }
  function undoBatch(id, button) {
    Promise.resolve(window.KoiDialog ? window.KoiDialog.confirm('Batalkan edit masal ini?\n\nNilai lama dikembalikan, tetapi isian yang sudah diubah lagi sesudahnya dibiarkan.') : window.confirm('Batalkan edit masal ini?')).then(function (ok) {
      if (!ok) return
      button.disabled = true
      return request('POST', '/api/koi/macro-batches/' + id + '/undo').then(function (data) {
        applied = true
        status('Dibatalkan: ' + data.restored + ' isian dikembalikan' + (data.skipped ? ', ' + data.skipped + ' dibiarkan karena sudah diubah lagi' : '') + '.')
        loadHistory()
      }).catch(function (error) { button.disabled = false; status(error.message || 'Gagal membatalkan.', true) })
    })
  }

  document.addEventListener('click', function (event) {
    if (event.target.closest('[data-koi-macro-open]')) open()
  })
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', koiMacroBoot)
else koiMacroBoot()
