// Edit Masal dari Excel / ZIP for Breeding, Laporan and Data Kolam (Data Ikan has its own: koi-macro-edit.js).
// The same rules everywhere: unduh the data, change some cells, unggah it back. The id of a row (Kode Batch, Nama Kolam, ID Kanban) says which
// record it is; only the columns that are in the file and the cells that are filled in change a record; [kosong] empties a cell; an id that does
// not exist is skipped (nothing is created, nothing is deleted, records that are not in the file stay as they are). The file is shown as a
// before -> after list first and is then applied in one go on the server (POST /api/macro/<entity>/apply), which keeps the old values 30 days so
// the whole edit can be undone. A ZIP can be the one of the page's own ZIP export: only its Excel is read.
(function () {
  'use strict'

  var CLEAR = /^\[kosong\]$/i
  var pageActions = []
  function text(value) { return String(value == null ? '' : value).trim() }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] }) }
  function day(value) { return text(value).slice(0, 10) }
  function getJson(url) {
    return fetch(url).then(function (response) { return response.ok ? response.json() : Promise.reject(new Error('Data gagal dimuat.')) })
  }
  function request(method, url, body) {
    return fetch(url, { method: method, headers: body === undefined ? undefined : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }).then(function (response) {
      return response.json().catch(function () { return {} }).then(function (data) {
        if (!response.ok) throw new Error(data.error || 'Permintaan gagal.')
        return data
      })
    })
  }
  function parseList(value) {
    try { var list = typeof value === 'string' ? JSON.parse(value) : value; return Array.isArray(list) ? list : [] } catch (error) { return [] }
  }

  // ---- what each page can edit -----------------------------------------------------------------------------------------------------------
  var METHODS = { alami: 'alami', stripping: 'stripping' }
  var BREEDING_STATUS = { planning: 'planning', proses: 'proses', completed: 'completed', selesai: 'completed', failed: 'failed', gagal: 'failed' }
  var POND_STATUS = { kosong: 'kosong', aktif: 'active', active: 'active', perbaikan: 'perbaikan' }
  var POND_STATUS_TEXT = { kosong: 'Kosong', active: 'Aktif', perbaikan: 'Perbaikan' }

  var CONFIGS = {
    'farm-breeding': {
      title: 'Edit Masal Breeding',
      sheetName: 'Breeding',
      targets: [{
        entity: 'breeding', keyHeaders: ['kode batch', 'kode'], keyLabel: 'Kode Batch', upper: true,
        load: function () { return getJson('/api/breeding').then(function (list) { return list.map(function (item) { return { key: item.batch_code, item: item } }) }) },
        columns: [
          { header: 'Nama Sesi', aliases: [], field: 'session_name', type: 'text', get: function (i) { return i.session_name } },
          { header: 'Awal Pijah', aliases: ['awal pemijahan'], field: 'spawning_started_at', also: ['breeding_date'], type: 'date', get: function (i) { return day(i.spawning_started_at || i.breeding_date) } },
          { header: 'Akhir Pijah', aliases: ['akhir pemijahan', 'pemisahan ikan'], field: 'fish_separated_at', type: 'date', get: function (i) { return day(i.fish_separated_at) } },
          { header: 'Tanggal Release Larva', aliases: [], field: 'larva_released_at', type: 'date', get: function (i) { return day(i.larva_released_at) } },
          { header: 'Metode', aliases: [], field: 'spawning_method', type: 'choice', choices: METHODS, get: function (i) { return i.spawning_method } },
          { header: 'Status', aliases: [], field: 'status', type: 'choice', choices: BREEDING_STATUS, get: function (i) { return i.status } },
          { header: 'Burayak', aliases: ['fry', 'jumlah burayak'], field: 'fry_count', type: 'int', get: function (i) { return i.fry_count } },
          { header: 'Berat Telur (g)', aliases: ['berat telur'], field: 'egg_weight_g', type: 'decimal', get: function (i) { return i.egg_weight_g } },
          { header: 'Catatan', aliases: [], field: 'notes', type: 'text', get: function (i) { return i.notes } },
          { header: 'Petugas', aliases: [], field: 'officer_name', type: 'text', get: function (i) { return i.officer_name } },
          { header: 'Lokasi Breeding', aliases: ['lokasi', 'kolam'], field: 'pond_entries', type: 'places', get: function (i) { return parseList(i.pond_entries).map(function (e) { return e.label || e.pond_name || '' }).filter(Boolean).join(', ') } },
        ],
      }],
    },
    'farm-reports': {
      title: 'Edit Masal Laporan',
      sheetName: 'Laporan',
      targets: [{
        entity: 'reports', keyHeaders: ['kode batch', 'kode'], keyLabel: 'Kode Batch', upper: false,
        load: function () { return getJson('/api/farm-reports').then(function (list) { return list.map(function (item) { return { key: item.batch_code, item: item } }) }) },
        columns: [
          { header: 'Tanggal', aliases: ['tanggal laporan'], field: 'report_date', type: 'date', get: function (i) { return day(i.report_date) } },
          { header: 'Judul', aliases: ['judul laporan'], field: 'report_title', type: 'text', get: function (i) { return i.report_title } },
          { header: 'Varietas Dominan', aliases: [], field: 'dominant_variety', type: 'text', get: function (i) { return i.dominant_variety } },
          { header: 'Lokasi Asal', aliases: [], field: 'origin_location', type: 'text', get: function (i) { return i.origin_location } },
          { header: 'Lokasi Tujuan', aliases: [], field: 'destination_location', type: 'text', get: function (i) { return i.destination_location } },
          { header: 'Rata-rata Ukuran (cm)', aliases: ['rata-rata ukuran'], field: 'average_length_cm', type: 'decimal', get: function (i) { return i.average_length_cm } },
          { header: 'Catatan', aliases: [], field: 'notes', type: 'text', get: function (i) { return i.notes } },
        ],
      }],
    },
    'farm-ponds': {
      title: 'Edit Masal Data Kolam',
      sheetName: 'Kolam',
      targets: [{
        entity: 'ponds', keyHeaders: ['nama kolam'], keyLabel: 'Nama Kolam', upper: false, sheet: 'Kolam',
        load: function () { return getJson('/api/ponds').then(function (list) { return list.map(function (item) { return { key: item.name, item: item } }) }) },
        columns: [
          { header: 'Area', aliases: [], field: 'location', type: 'text', get: function (i) { return i.location } },
          { header: 'Status', aliases: [], field: 'status', type: 'choice', choices: POND_STATUS, get: function (i) { return POND_STATUS_TEXT[i.status] || i.status } },
        ],
      }, {
        entity: 'kanban', keyHeaders: ['id kanban'], keyLabel: 'ID Kanban', upper: false, sheet: 'Kanban', extraExportColumns: [['Nama Kolam', function (i) { return i.pond_name }]],
        load: function () { return getJson('/api/ponds/kanban-all').then(function (data) { return (data.items || []).map(function (item) { return { key: String(item.id), item: item } }) }) },
        columns: [
          { header: 'Judul', aliases: [], field: 'title', type: 'text', get: function (i) { return i.title } },
          { header: 'Tanggal', aliases: ['tanggal pencatatan'], field: 'note_date', type: 'date', get: function (i) { return day(i.note_date) } },
          { header: 'Catatan', aliases: [], field: 'body', type: 'text', get: function (i) { return i.body } },
          { header: 'Qty', aliases: ['qty kanban'], field: 'qty', type: 'int', get: function (i) { return i.qty } },
          { header: 'Warna', aliases: [], field: 'color', type: 'color', get: function (i) { return i.color } },
        ],
      }],
    },
  }

  var pageKey = (location.pathname.match(/(farm-breeding|farm-reports|farm-ponds)/) || [])[1]
  var config = pageKey && CONFIGS[pageKey]
  if (!config) return

  var modalEl = null
  var plan = null
  var applied = false

  // ---- the button in the page's dock ---------------------------------------------------------------------------------------------------
  if (window.KoiDock && window.KoiDock.create) {
    var originalCreate = window.KoiDock.create
    window.KoiDock.create = function (options) {
      options = options || {}
      pageActions = options.actions || []
      // Excel / ZIP / Impor live in the Edit Masal window now; the dock keeps only the other buttons
      options.actions = pageActions.filter(function (a) { return ['export', 'zip', 'import'].indexOf(a.key) < 0 }).concat([{
        key: 'macro-edit', icon: 'file-edit-masal', title: 'Edit masal dari Excel atau ZIP', variant: 'success', role: 'database-write',
        always: true, show: function () { return true }, onClick: function () { open() },
      }])
      return originalCreate.call(this, options)
    }
  }

  // ---- the modal -----------------------------------------------------------------------------------------------------------------------------
  function modalApi() { return (window.tabler && window.tabler.bootstrap && window.tabler.bootstrap.Modal) || (window.bootstrap && window.bootstrap.Modal) }
  function ensureModal() {
    if (modalEl) return modalEl
    var keyLabels = config.targets.map(function (t) { return t.keyLabel }).join(' / ')
    modalEl = document.createElement('div')
    modalEl.className = 'modal modal-blur fade'
    modalEl.tabIndex = -1
    modalEl.innerHTML =
      '<div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable"><div class="modal-content">' +
        '<div class="modal-header"><h5 class="modal-title">' + esc(config.title) + ' dari Excel / ZIP</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Tutup"></button></div>' +
        '<div class="modal-body">' +
          '<div class="mb-3"><div class="fw-semibold mb-1">1. Unduh data</div>' +
            '<div class="text-secondary small mb-2">Mengunduh Excel berisi semua data yang bisa diedit. Kolom pertama, <strong>' + esc(keyLabels) + '</strong>, adalah ID barisnya.</div>' +
            '<div class="d-flex flex-wrap gap-2"><button class="btn btn-outline-success" type="button" data-macro-download>Unduh Excel untuk diedit</button>' +
            '<button class="btn btn-outline-success" type="button" data-macro-zip>Unduh ZIP (Excel + dokumentasi)</button>' +
            '<button class="btn btn-outline-success" type="button" data-macro-blank title="Excel berisi judul kolom saja, untuk mengisi data baru">Unduh template kosong (entry baru)</button>' +
            '<button class="btn btn-outline-primary" type="button" data-macro-import title="Memasukkan data baru dari template yang sudah diisi (Excel atau ZIP)">Impor data baru (Excel / ZIP)</button></div></div>' +
          '<div class="mb-3"><div class="fw-semibold mb-1">2. Ubah file, lalu unggah</div>' +
            '<ul class="text-secondary small mb-2 ps-3"><li>Hapus kolom yang tidak ingin diubah. Yang wajib hanya kolom ID.</li>' +
            '<li>Sel kosong berarti tidak diubah. Untuk mengosongkan isian, tulis <code>[kosong]</code>.</li>' +
            '<li>ID yang tidak ada dilewati. Data yang tidak ada di file tidak berubah dan tidak dihapus. Edit masal tidak membuat data baru; untuk data baru pakai template kosong lalu Impor data baru.</li>' +
            '<li>File ZIP dari unduhan halaman ini juga bisa diunggah (yang dibaca hanya Excel-nya).</li></ul>' +
            '<input class="form-control" type="file" accept=".xlsx,.xls,.zip" data-macro-file /></div>' +
          '<div data-macro-status class="small text-secondary mb-2"></div><div data-macro-preview></div>' +
          '<hr /><div class="fw-semibold mb-1">Riwayat edit masal (30 hari terakhir)</div><div data-macro-history class="small"></div>' +
        '</div>' +
        '<div class="modal-footer"><button type="button" class="btn" data-bs-dismiss="modal">Tutup</button><button type="button" class="btn btn-primary" data-macro-apply hidden>Terapkan</button></div>' +
      '</div></div>'
    document.body.appendChild(modalEl)
    modalEl.addEventListener('hidden.bs.modal', function () { if (applied) { applied = false; window.location.reload() } })
    modalEl.querySelector('[data-macro-file]').addEventListener('change', function (event) {
      var file = event.target.files && event.target.files[0]
      event.target.value = ''
      if (file) readFile(file)
    })
    modalEl.addEventListener('click', function (event) {
      if (event.target.closest('[data-macro-download]')) { download(event.target.closest('[data-macro-download]')); return }
      if (event.target.closest('[data-macro-zip]')) { pageAction('zip'); return }
      if (event.target.closest('[data-macro-blank]')) { blankTemplate(); return }
      if (event.target.closest('[data-macro-import]')) { if (pageAction('import')) Modal_hide(); return }
      if (event.target.closest('[data-macro-apply]')) { apply(); return }
      var undo = event.target.closest('[data-macro-undo]')
      if (undo) undoBatch(undo.getAttribute('data-macro-undo'), undo)
    })
    return modalEl
  }
  function status(message, bad) {
    var box = modalEl.querySelector('[data-macro-status]')
    box.textContent = message || ''
    box.className = 'small mb-2 ' + (bad ? 'text-danger' : 'text-secondary')
  }
  function Modal_hide() { var Modal = modalApi(); if (Modal && modalEl) Modal.getOrCreateInstance(modalEl).hide() }
  function open() {
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

  // The ZIP of the page itself (Excel + photos and documentation), the same as the dock's ZIP button, for everything the page shows.
  function pageAction(key) {
    var action = pageActions.filter(function (a) { return a.key === key })[0]
    if (!action) { status('Fitur ini belum tersedia di halaman ini.', true); return false }
    action.onClick([])
    return true
  }
  // The empty frame for new entries: the page's own Excel export with only its title row (so the columns are exactly the ones its Impor reads).
  function blankTemplate() {
    var sheetUtils = window.XLSX && window.XLSX.utils
    if (!sheetUtils) { status('Pustaka Excel belum termuat. Muat ulang halaman.', true); return }
    var originalSheet = sheetUtils.aoa_to_sheet
    var originalClick = HTMLAnchorElement.prototype.click
    var name = 'template-kosong-' + pageKey.replace('farm-', '') + '.xlsx'
    sheetUtils.aoa_to_sheet = function (rows, opts) { return originalSheet.call(this, (rows || []).slice(0, 1), opts) }
    HTMLAnchorElement.prototype.click = function () { if (this.download) this.download = name; return originalClick.apply(this, arguments) }
    try {
      if (pageAction('export')) status('Template kosong diunduh. Isi baris di bawah judul kolom, lalu masukkan lewat tombol Impor data baru di atas.')
    } finally {
      sheetUtils.aoa_to_sheet = originalSheet
      HTMLAnchorElement.prototype.click = originalClick
    }
  }

  // ---- download ---------------------------------------------------------------------------------------------------------------------------------
  function download(button) {
    if (!window.XLSX) { window.alert('Pustaka Excel belum termuat. Muat ulang halaman.'); return }
    button.disabled = true
    status('Menyiapkan file...')
    Promise.all(config.targets.map(function (target) { return target.load() })).then(function (loaded) {
      var workbook = XLSX.utils.book_new()
      config.targets.forEach(function (target, index) {
        var extra = target.extraExportColumns || []
        var header = [target.keyLabel].concat(extra.map(function (c) { return c[0] })).concat(target.columns.map(function (c) { return c.header }))
        var rows = loaded[index].map(function (entry) {
          return [entry.key].concat(extra.map(function (c) { return c[1](entry.item) })).concat(target.columns.map(function (c) { var v = c.get(entry.item); return v == null ? '' : v }))
        })
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([header].concat(rows)), target.sheet || config.sheetName)
      })
      var buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
      var blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      var link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = 'edit-masal-' + pageKey.replace('farm-', '') + '-' + new Date().toISOString().slice(0, 10) + '.xlsx'
      link.click()
      setTimeout(function () { URL.revokeObjectURL(link.href) }, 2000)
      status('File diunduh. Ubah, lalu unggah di langkah 2.')
    }).catch(function (error) { status(error.message || 'File gagal disiapkan.', true) }).then(function () { button.disabled = false })
  }

  // ---- reading the file -------------------------------------------------------------------------------------------------------------------------
  function readFile(file) {
    if (!window.XLSX) { status('Pustaka Excel belum termuat. Muat ulang halaman.', true); return }
    status('Membaca file...')
    modalEl.querySelector('[data-macro-preview]').innerHTML = ''
    modalEl.querySelector('[data-macro-apply]').hidden = true
    var xlsxPromise
    if (/\.zip$/i.test(file.name)) {
      if (!window.KoiZip || !window.KoiZip.readPackage) { status('Pembaca ZIP belum termuat. Muat ulang halaman.', true); return }
      xlsxPromise = window.KoiZip.readPackage(file).then(function (pkg) { if (!pkg.xlsxFile) throw new Error('ZIP tidak berisi file .xlsx.'); return pkg.xlsxFile })
    } else {
      xlsxPromise = Promise.resolve(file)
    }
    xlsxPromise.then(function (xlsxFile) { return xlsxFile.arrayBuffer() }).then(function (buffer) {
      var workbook = XLSX.read(buffer, { type: 'array', cellDates: true, dateNF: 'yyyy-mm-dd' })
      return build(workbook, file.name)
    }).catch(function (error) { status(error.message || 'File tidak dapat dibaca.', true) })
  }

  function norm(value) { return text(value).toLowerCase() }

  function build(workbook, sourceName) {
    var sections = []
    var used = {}
    workbook.SheetNames.forEach(function (sheetName) {
      var rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '', raw: false })
      if (!rows.length) return
      var headers = Object.keys(rows[0]).map(norm)
      var target = config.targets.filter(function (t) { return !used[t.entity] && t.keyHeaders.some(function (h) { return headers.indexOf(h) >= 0 }) })
      // a sheet named like a target wins when several fit
      var named = target.filter(function (t) { return t.sheet && norm(t.sheet) === norm(sheetName) })[0]
      var chosen = named || target[0]
      if (!chosen) return
      used[chosen.entity] = true
      sections.push({ target: chosen, rows: rows, sheet: sheetName })
    })
    if (!sections.length) throw new Error('File tidak punya kolom ID (' + config.targets.map(function (t) { return t.keyLabel }).join(' / ') + ').')
    return Promise.all(sections.map(function (section) { return section.target.load() })).then(function (loaded) {
      plan = { source: sourceName, sections: sections.map(function (section, index) { return compare(section, loaded[index]) }) }
      render()
    })
  }

  function compare(section, existingList) {
    var target = section.target
    var byKey = {}
    existingList.forEach(function (entry) { byKey[norm(entry.key)] = entry })
    var columnByHeader = {}
    target.columns.forEach(function (column) { [column.header].concat(column.aliases || []).forEach(function (h) { columnByHeader[norm(h)] = column }) })
    var originalKeys = Object.keys(section.rows[0])
    var keyName = originalKeys.filter(function (name) { return target.keyHeaders.indexOf(norm(name)) >= 0 })[0]
    var ignored = originalKeys.filter(function (name) { return name !== keyName && !columnByHeader[norm(name)] })
    var result = { target: target, sheet: section.sheet, changes: [], unchanged: 0, missing: [], problems: [], ignored: ignored }
    var seen = {}
    section.rows.forEach(function (row, index) {
      var rawKey = text(row[keyName])
      if (!rawKey) return
      var k = norm(rawKey)
      var line = index + 2
      if (seen[k]) { result.problems.push('Baris ' + line + ': ' + target.keyLabel + ' "' + rawKey + '" kembar di file (baris ini dilewati)'); return }
      seen[k] = true
      var entry = byKey[k]
      if (!entry) { result.missing.push(rawKey); return }
      var patch = {}
      var diffs = []
      originalKeys.forEach(function (name) {
        var column = columnByHeader[norm(name)]
        if (!column) return
        var raw = text(row[name])
        if (raw === '') return
        var clear = CLEAR.test(raw)
        var value
        var shown
        var type = column.type
        if (clear) {
          if (type === 'int' && column.field === 'qty') { result.problems.push('Baris ' + line + ' (' + rawKey + '): ' + column.header + ' tidak bisa dikosongkan'); return }
          value = type === 'places' ? [] : ''
          shown = '(kosong)'
        } else if (type === 'text') { value = raw; shown = raw }
        else if (type === 'date') {
          value = window.KoiAuth && window.KoiAuth.dateFromText ? window.KoiAuth.dateFromText(raw) : raw
          if (!value) { result.problems.push('Baris ' + line + ' (' + rawKey + '): ' + column.header + ' "' + raw + '" tidak dikenali'); return }
          shown = value
        } else if (type === 'int') {
          if (!/^\d{1,9}$/.test(raw.replace(/[.\s]/g, ''))) { result.problems.push('Baris ' + line + ' (' + rawKey + '): ' + column.header + ' "' + raw + '" bukan angka bulat'); return }
          value = raw.replace(/[.\s]/g, ''); shown = value
        } else if (type === 'decimal') {
          var number = raw.replace(',', '.')
          if (isNaN(Number(number))) { result.problems.push('Baris ' + line + ' (' + rawKey + '): ' + column.header + ' "' + raw + '" bukan angka'); return }
          value = number; shown = number
        } else if (type === 'choice') {
          value = column.choices[norm(raw)]
          if (!value) { result.problems.push('Baris ' + line + ' (' + rawKey + '): ' + column.header + ' "' + raw + '" tidak dikenali'); return }
          shown = value
        } else if (type === 'color') {
          value = norm(raw)
          if (!/^#[0-9a-f]{6}$/.test(value)) { result.problems.push('Baris ' + line + ' (' + rawKey + '): ' + column.header + ' "' + raw + '" bukan warna (#rrggbb)'); return }
          shown = value
        } else if (type === 'places') {
          value = raw.split(/[,;\n]+/).map(function (part) { return part.trim() }).filter(Boolean)
          shown = value.join(', ')
        }
        var oldShown = text(column.get(entry.item))
        var same = type === 'places' ? oldShown.toLowerCase() === shown.toLowerCase() : (!clear && type === 'choice' ? text(column.choices[norm(oldShown)] || oldShown) === value : (oldShown !== '' && shown !== '' && !isNaN(Number(oldShown)) && !isNaN(Number(shown)) && type !== 'text' ? Number(oldShown) === Number(shown) : oldShown === (clear ? '' : shown)))
        if (same) return
        patch[column.field] = value
        ;(column.also || []).forEach(function (field) { patch[field] = value })
        diffs.push({ label: column.header, oldText: oldShown, newText: shown })
      })
      if (diffs.length) result.changes.push({ key: entry.key, patch: patch, diffs: diffs })
      else result.unchanged++
    })
    return result
  }

  function render() {
    var box = modalEl.querySelector('[data-macro-preview]')
    var html = ''
    var totalChanges = 0
    plan.sections.forEach(function (section) {
      var cells = section.changes.reduce(function (sum, change) { return sum + change.diffs.length }, 0)
      totalChanges += section.changes.length
      html += '<div class="fw-semibold mt-2">' + esc(section.target.entity === 'kanban' ? 'Kanban kolam' : section.target.keyLabel === 'Nama Kolam' ? 'Data Kolam' : config.title.replace('Edit Masal ', '')) + (plan.sections.length > 1 ? ' (sheet ' + esc(section.sheet) + ')' : '') + '</div>' +
        '<div class="d-flex flex-wrap gap-2 mb-2"><span class="badge bg-green-lt">Berubah: ' + section.changes.length + ' baris (' + cells + ' isian)</span>' +
        '<span class="badge bg-secondary-lt">Tanpa perubahan: ' + section.unchanged + '</span>' +
        '<span class="badge bg-orange-lt">ID tidak ditemukan (dilewati): ' + section.missing.length + '</span>' +
        '<span class="badge bg-red-lt">Bermasalah (dilewati): ' + section.problems.length + '</span></div>'
      if (section.ignored.length) html += '<div class="small text-secondary mb-2">Kolom yang tidak dipakai (diabaikan): ' + esc(section.ignored.join(', ')) + '</div>'
      if (section.missing.length) html += '<details class="mb-2"><summary class="small">ID tidak ditemukan (' + section.missing.length + ')</summary><div class="small text-secondary">' + esc(section.missing.join(', ')) + '</div></details>'
      if (section.problems.length) html += '<details class="mb-2" open><summary class="small text-danger">Bermasalah (' + section.problems.length + ')</summary><div class="small">' + section.problems.map(esc).join('<br>') + '</div></details>'
      if (section.changes.length) {
        var rows = ''
        var shown = 0
        section.changes.some(function (change) {
          return change.diffs.some(function (diff) {
            if (shown >= 300) return true
            shown++
            rows += '<tr><td><strong>' + esc(change.key) + '</strong></td><td>' + esc(diff.label) + '</td><td class="text-secondary">' + esc(diff.oldText || '(kosong)') + '</td><td><strong>' + esc(diff.newText) + '</strong></td></tr>'
            return false
          })
        })
        html += '<div class="table-responsive" style="max-height:300px;overflow:auto"><table class="table table-sm"><thead><tr><th>' + esc(section.target.keyLabel) + '</th><th>Isian</th><th>Lama</th><th>Baru</th></tr></thead><tbody>' + rows + '</tbody></table></div>' + (cells > 300 ? '<div class="small text-secondary">Menampilkan 300 perubahan pertama dari ' + cells + '.</div>' : '')
      }
    })
    if (!totalChanges) html += '<div class="text-secondary">Tidak ada perubahan yang bisa diterapkan.</div>'
    box.innerHTML = html
    var applyButton = modalEl.querySelector('[data-macro-apply]')
    applyButton.hidden = !totalChanges
    applyButton.disabled = false
    applyButton.textContent = 'Terapkan ' + totalChanges + ' baris'
    status('')
  }

  // ---- applying ----------------------------------------------------------------------------------------------------------------------------------
  function apply() {
    if (!plan) return
    var button = modalEl.querySelector('[data-macro-apply]')
    button.disabled = true
    var done = []
    plan.sections.reduce(function (chain, section) {
      if (!section.changes.length) return chain
      return chain.then(function () {
        status('Menyimpan ' + section.changes.length + ' baris...')
        return request('POST', '/api/macro/' + section.target.entity + '/apply', { source: plan.source, rows: section.changes.map(function (change) { return { key: change.key, patch: change.patch } }) }).then(function (data) {
          applied = true
          done.push(data.updated + ' ' + (section.target.entity === 'kanban' ? 'kartu kanban' : 'baris'))
        })
      })
    }, Promise.resolve()).then(function () {
      status('Selesai. ' + done.join(', ') + ' diperbarui.')
      modalEl.querySelector('[data-macro-preview]').innerHTML = ''
      button.hidden = true
      plan = null
      loadHistory()
    }).catch(function (error) {
      status((error.message || 'Edit masal gagal disimpan.') + (done.length ? ' (sudah tersimpan: ' + done.join(', ') + ')' : ' Tidak ada yang berubah.'), true)
      button.disabled = false
    })
  }

  // ---- history / undo ----------------------------------------------------------------------------------------------------------------------------
  function loadHistory() {
    var box = modalEl.querySelector('[data-macro-history]')
    box.textContent = 'Memuat...'
    Promise.all(config.targets.map(function (target) { return request('GET', '/api/macro/' + target.entity + '/batches').then(function (data) { return (data.items || []).map(function (item) { item.entity = target.entity; return item }) }) })).then(function (lists) {
      var items = [].concat.apply([], lists).sort(function (a, b) { return b.id - a.id })
      if (!items.length) { box.innerHTML = '<span class="text-secondary">Belum ada edit masal.</span>'; return }
      box.innerHTML = items.map(function (item) {
        return '<div class="d-flex justify-content-between align-items-center gap-2 py-1 border-bottom"><div><strong>' + esc(window.KoiAuth && window.KoiAuth.formatDateTime ? window.KoiAuth.formatDateTime(item.created_at) : item.created_at) + '</strong> &middot; ' + esc(item.actor || '-') + ' &middot; ' + Number(item.row_count) + (item.entity === 'kanban' ? ' kartu' : ' baris') + ' &middot; <span class="text-secondary">' + esc(item.source || '') + '</span></div>' +
          (item.undone_at ? '<span class="badge bg-secondary-lt">Sudah dibatalkan</span>' : '<button class="btn btn-sm btn-outline-danger" type="button" data-macro-undo="' + item.id + '">Batalkan</button>') + '</div>'
      }).join('')
    }).catch(function (error) { box.innerHTML = '<span class="text-danger">' + esc(error.message) + '</span>' })
  }
  function undoBatch(id, button) {
    Promise.resolve(window.KoiDialog ? window.KoiDialog.confirm('Batalkan edit masal ini?\n\nNilai lama dikembalikan, tetapi isian yang sudah diubah lagi sesudahnya dibiarkan.') : window.confirm('Batalkan edit masal ini?')).then(function (ok) {
      if (!ok) return
      button.disabled = true
      return request('POST', '/api/macro/batches/' + id + '/undo').then(function (data) {
        applied = true
        status('Dibatalkan: ' + data.restored + ' isian dikembalikan' + (data.skipped ? ', ' + data.skipped + ' dibiarkan karena sudah diubah lagi' : '') + '.')
        loadHistory()
      }).catch(function (error) { button.disabled = false; status(error.message || 'Gagal membatalkan.', true) })
    })
  }
})()
