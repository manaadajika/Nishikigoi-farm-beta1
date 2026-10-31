// Laporan Ikan Datang (fish that arrive at the farm) on the Laporan page.
// "Tambah Laporan" gets a third choice. Saved in farm_reports with report_type 'ikan_datang':
//   report_title = Nama laporan, origin_location = Ikan dari mana, qty = total ekor,
//   activity_data = { lines: [{ variety, gender, size_cm, farm, bloodline, owner, pond_id, pond_name, image_url }] }  (one line = one fish,
//   each with its own destination pond; the report's pond_entries are derived from the lines).
// Loads after activity-report.js (it shares window.KoiReportKit and owns the Semua | ... | Ikan Datang filter).
// window.KoiArrival.importSheet(records) creates reports from an Excel sheet (one row per fish line).
;(function () {
  var TYPE = 'ikan_datang'
  var kit = window.KoiReportKit
  if (!kit) return
  var escapeHtml = kit.escapeHtml
  var parse = kit.parse
  var formatDate = kit.formatDate
  var request = kit.request

  var pondsCache = []

  function toNumber(value) {
    var n = Number(String(value == null ? '' : value).replace(',', '.'))
    return String(value == null ? '' : value).trim() === '' || !Number.isFinite(n) ? null : n
  }
  // Same values as the Sex field of Data Ikan: unknown | male | female (shown as words).
  var genderLabels = { unknown: 'Unknown', male: 'Male', female: 'Female' }
  function genderFrom(value) {
    var typed = String(value == null ? '' : value).trim().toLowerCase()
    if (['male', 'm', 'jantan', 'j'].indexOf(typed) >= 0) return 'male'
    if (['female', 'f', 'betina', 'b'].indexOf(typed) >= 0) return 'female'
    return 'unknown'
  }
  function sizeText(value) {
    var n = toNumber(value)
    return n === null ? '' : n.toLocaleString('id-ID', { maximumFractionDigits: 1 })
  }
  function linesOf(report) {
    var data = parse(report && report.activity_data, {}) || {}
    return (Array.isArray(data.lines) ? data.lines : []).map(function (line) {
      return { qty: toNumber(line.qty) || 1, variety: String(line.variety || ''), gender: genderFrom(line.gender), size_cm: line.size_cm == null ? '' : line.size_cm, farm: String(line.farm || ''), bloodline: String(line.bloodline || ''), owner: String(line.owner || ''), image_url: String(line.image_url || ''), pond_id: line.pond_id ? String(line.pond_id) : '', pond_name: String(line.pond_name || '') }
    })
  }
  // One line = one fish (older reports may still carry a quantity per line).
  function totalOf(lines) { return lines.reduce(function (sum, line) { return sum + (Number(line.qty) || 1) }, 0) }

  // Fields the list/export/summary use, derived from the lines.
  function summaryFields(lines) {
    var varieties = []
    lines.forEach(function (line) { if (line.variety && varieties.indexOf(line.variety) < 0) varieties.push(line.variety) })
    var weighted = 0
    var counted = 0
    lines.forEach(function (line) {
      var size = toNumber(line.size_cm)
      if (size !== null) { weighted += size * (Number(line.qty) || 1); counted += Number(line.qty) || 1 }
    })
    return {
      qty: totalOf(lines),
      dominant_variety: varieties.join(', ').slice(0, 250),
      average_length_cm: counted ? Math.round((weighted / counted) * 10) / 10 : null,
    }
  }

  // ---- print ------------------------------------------------------------------------------------
  function printReport(report) {
    var kp = window.KoiPrint
    if (!kp) { window.alert('Modul cetak belum dimuat. Muat ulang halaman.'); return }
    var e = kp.escapeHtml
    var lines = linesOf(report)
    var pondText = parse(report.pond_entries, []).map(function (p) { return [p.pond_name, p.location].filter(Boolean).join(' - ') }).join(', ')
    var mediaList = parse(report.media_entries, [])
    var rows = lines.map(function (line, index) {
      return '<tr><td class="kp-center">' + (index + 1) + '</td><td class="kp-center">' + kp.photo(line.image_url, line.variety) + '</td><td>' + e(line.variety || '-') + '</td><td class="kp-center">' + e(line.gender && line.gender !== 'unknown' ? genderLabels[line.gender] : '') +
        '</td><td class="kp-num">' + (sizeText(line.size_cm) ? e(sizeText(line.size_cm)) + ' cm' : '-') +
        '</td><td>' + e(line.farm || '-') + '</td><td>' + e(line.bloodline || '-') + '</td><td>' + e(line.owner || '-') + '</td><td>' + e(line.pond_name || '-') + '</td></tr>'
    }).join('') || '<tr><td colspan="9" class="kp-muted">Belum ada ikan.</td></tr>'
    var body = '<section class="kp-section"><h2>Ikan yang datang</h2><table class="kp-table"><thead><tr><th class="kp-center" style="width:28px">No</th><th class="kp-center" style="width:48px">Foto</th><th>Jenis</th><th class="kp-center" style="width:9%">Sex</th><th class="kp-num" style="width:9%">Ukuran</th>' +
      '<th style="width:13%">Ternakan</th><th style="width:12%">Bloodline</th><th style="width:12%">Owner</th><th style="width:13%">Lokasi</th></tr></thead><tbody>' + rows +
      '<tr><td colspan="9"><strong>Total: ' + e(totalOf(lines)) + ' ekor</strong></td></tr></tbody></table></section>' +
      (mediaList.length ? '<section class="kp-section"><h2>Dokumentasi</h2><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">' +
        mediaList.map(function (m) {
          var src = m.thumbnail_url || m.url || m.image_url
          return '<figure style="margin:0;border:1px solid #999;break-inside:avoid"><img src="' + e(src) + '" style="display:block;width:100%;height:42mm;object-fit:cover">' +
            '<figcaption style="padding:3px 5px;font-size:8.5px">' + e((m.type === 'video' ? '[Video] ' : '') + (m.notes || m.name || '')) + '</figcaption></figure>'
        }).join('') + '</div></section>' : '')
    kp.print({
      key: 'report-arrival',
      title: 'Laporan Ikan Datang ' + (report.batch_code || ''),
      heading: 'Laporan Ikan Datang',
      subheading: (report.batch_code || '') + (report.report_title ? ' - ' + report.report_title : ''),
      info: [
        ['Kode', report.batch_code], ['Tanggal', formatDate(report.report_date)], ['Ikan dari', report.origin_location || '-'],
        ['Total ikan', totalOf(lines) + ' ekor'], ['Lokasi tujuan', pondText || '-'],
      ],
      notes: report.notes || '',
      body: body,
    })
  }

  // ---- Excel sheet import ("Ikan Datang": one row per fish line) --------------------------------
  // Columns: Tanggal | Nama Laporan | Ikan Dari | Jenis | Sex | Ukuran (cm) | Ternakan | Bloodline | Owner | Lokasi Tujuan | Foto | Catatan | Kode Batch
  // One row = one fish. Rows with the same Tanggal + Nama Laporan + Ikan Dari become ONE report.
  // An old "Jumlah (ekor)" column is still read (empty = 1).
  // Returns { created, skipped, problems }.
  function importSheet(records, options) {
    options = options || {}
    var problems = []
    var groups = new Map()
    var knownCodes = new Set((options.knownCodes || []).map(function (code) { return String(code).toUpperCase() }))
    var dateFromText = options.dateFromText || function (value) { return String(value || '').slice(0, 10) }

    records.forEach(function (record, index) {
      var line = index + 2
      var title = String(record['nama laporan'] || record.judul || '').trim()
      var origin = String(record['ikan dari'] || record['ikan dari mana'] || record.asal || '').trim()
      var date = dateFromText(record.tanggal)
      var qty = toNumber(record['jumlah (ekor)'])
      var variety = String(record.jenis || record.varietas || '').trim()
      var code = String(record['kode batch'] || '').trim().toUpperCase()
      if (!title && !variety) return
      var bad = []
      if (!date) bad.push(record.tanggal ? 'Tanggal "' + record.tanggal + '" tidak valid' : 'Tanggal wajib diisi')
      if (!title) bad.push('Nama Laporan wajib diisi')
      if (!origin) bad.push('Ikan Dari wajib diisi')
      if (!variety) bad.push('Jenis wajib diisi')
      if (String(record['jumlah (ekor)'] || '').trim() !== '' && (qty === null || qty < 1)) bad.push('Jumlah (ekor) harus angka 1 atau lebih')
      var size = toNumber(record['ukuran (cm)'])
      if (String(record['ukuran (cm)'] || '').trim() !== '' && (size === null || size < 0)) bad.push('Ukuran (cm) tidak valid')
      var pondName = String(record['lokasi tujuan'] || record['kolam tujuan'] || '').trim()
      var pond = null
      if (pondName) {
        pond = options.pondByName ? options.pondByName.get(pondName.toLowerCase()) : null
        if (!pond) bad.push('Lokasi tujuan "' + pondName + '" tidak ditemukan')
      }
      if (bad.length) { problems.push('Baris ' + line + ': ' + bad.join('; ')); return }
      if (code && knownCodes.has(code)) { problems.push('Baris ' + line + ' (' + code + '): laporan dengan kode ini sudah ada, dilewati'); return }

      var key = [date, title.toLowerCase(), origin.toLowerCase()].join('|')
      if (!groups.has(key)) groups.set(key, { date: date, title: title, origin: origin, code: code, notes: '', docsCell: '', lines: [] })
      var group = groups.get(key)
      if (code && !group.code) group.code = code
      if (record.catatan && !group.notes) group.notes = String(record.catatan).trim()
      if (record.dokumentasi && !group.docsCell) group.docsCell = String(record.dokumentasi).trim()
      group.lines.push({
        qty: qty === null ? 1 : Math.round(qty), variety: variety, gender: genderFrom(record.sex || record.kelamin || record.gender), size_cm: size === null ? '' : size,
        farm: String(record.ternakan || record.farm || '').trim(), bloodline: String(record.bloodline || '').trim(), owner: String(record.owner || '').trim(),
        pond_id: pond ? String(pond.id) : '', pond_name: pond ? pond.name : '',
        image_url: '', image_ref: String(record.foto || '').trim(),
      })
    })
    return { groups: Array.from(groups.values()), problems: problems }
  }

  // Photos of the lines: "Foto" is either an upload URL of this system (/api/uploads/...) or the name/path of a file in the ZIP.
  // Returns problem texts; every resolved line gets image_url (image_ref is dropped).
  async function resolveLineImages(group, pkg) {
    var problems = []
    for (var i = 0; i < group.lines.length; i += 1) {
      var line = group.lines[i]
      var ref = line.image_ref
      delete line.image_ref
      if (!ref) continue
      if (ref.indexOf('/api/uploads/') === 0) { line.image_url = ref; continue }
      var file = pkg && pkg.fileFor ? pkg.fileFor(ref) : null
      if (!file) { problems.push(group.title + ' ikan ' + (i + 1) + ': foto "' + ref + '" tidak ada di ZIP'); continue }
      var uploaded = await window.KoiZip.uploadEntries([{ type: 'image', bytes: file.bytes, mime: file.mime, name: file.name, notes: '' }], { imagePrefix: 'report-image', videoPrefix: 'report-video', existingUrls: [] })
      if (uploaded.entries.length) line.image_url = uploaded.entries[0].url
      else problems.push(group.title + ' ikan ' + (i + 1) + ': foto "' + ref + '" gagal diupload')
    }
    return problems
  }

  function payloadFor(group, extra) {
    var summary = summaryFields(group.lines)
    // The report's ponds are the ponds of its fish (every fish has its own destination pond).
    var pondEntries = []
    var seenPonds = {}
    group.lines.forEach(function (line) {
      if (!line.pond_id || seenPonds[line.pond_id]) return
      seenPonds[line.pond_id] = true
      var pond = pondsCache.find(function (item) { return String(item.id) === String(line.pond_id) }) || {}
      pondEntries.push({ pond_id: Number(line.pond_id), pond_name: line.pond_name || pond.name || '', location: pond.location || '' })
    })
    return Object.assign({
      pond_entries: pondEntries,
      destination_location: pondEntries.map(function (entry) { return entry.pond_name }).filter(Boolean).join(', '),
      report_type: TYPE,
      report_date: group.date,
      report_title: group.title,
      origin_location: group.origin,
      notes: group.notes || '',
      qty: summary.qty,
      dominant_variety: summary.dominant_variety,
      average_length_cm: summary.average_length_cm,
      activity_data: { lines: group.lines },
    }, extra || {})
  }

  window.KoiArrival = {
    TYPE: TYPE,
    linesOf: linesOf,
    totalOf: totalOf,
    importSheet: importSheet,
    resolveLineImages: resolveLineImages,
    genderLabels: genderLabels,
    payloadFor: payloadFor,
    summaryFields: summaryFields,
    // name (lower case) -> pond, for the "Lokasi Tujuan" column of an Excel import (the old name "Kolam Tujuan" is still read)
    pondMap: function () {
      return request('/ponds').then(function (list) {
        pondsCache = Array.isArray(list) ? list : []
        return new Map(pondsCache.map(function (pond) { return [String(pond.name || '').trim().toLowerCase(), pond] }))
      }).catch(function () { return new Map() })
    },
  }

  // ---- form -------------------------------------------------------------------------------------
  function start() {
    var table = document.querySelector('[data-report-table]')
    var activityItem = document.querySelector('[data-report-open-activity]')
    if (!table || !activityItem) return

    var reportsById = new Map()
    var ponds = []
    var koiFacets = {}   // distinct varieties / farms / bloodlines from the server (GET /api/koi/facets)
    var media = []
    var editingId = null
    var readonly = false

    // Opened from the "Jenis Laporan" choice of any report form (there is no extra menu step).
    var arrivalItem = document.createElement('button')
    arrivalItem.type = 'button'
    arrivalItem.hidden = true
    arrivalItem.setAttribute('data-report-open-arrival', '')
    document.body.appendChild(arrivalItem)

    // The form of Laporan Perikanan also offers the other report types as choices in "Jenis Laporan":
    // picking one closes this form and opens that type's own form.
    var typeGroup = (document.querySelector('input[name="report_type"][value="panen"]') || {}).closest ? document.querySelector('input[name="report_type"][value="panen"]').closest('.form-selectgroup') : null
    if (typeGroup) {
      typeGroup.classList.remove('d-flex', 'flex-column', 'flex-md-row')
      typeGroup.classList.add('koi-type-grid')
      typeGroup.querySelectorAll('.form-selectgroup-item').forEach(function (item) { item.classList.remove('flex-fill') })
    }
    function addTypeShortcut(title, description, type) {
      if (!typeGroup) return
      var label = document.createElement('label')
      label.className = 'form-selectgroup-item'
      label.title = description
      label.setAttribute('data-type-shortcut', '')
      label.innerHTML = '<input type="radio" name="report_type_shortcut" class="form-selectgroup-input"><span class="form-selectgroup-label d-flex align-items-center p-3"><span class="me-3"><span class="form-selectgroup-check"></span></span><span><span class="form-selectgroup-title strong mb-1">' + escapeHtml(title) + '</span><span class="d-block text-secondary">' + escapeHtml(description) + '</span></span></span>'
      var radio = label.querySelector('input')
      radio.addEventListener('change', function () {
        radio.checked = false
        var cancel = document.querySelector('[data-report-cancel]')
        var mainModal = document.querySelector('[data-report-modal]')
        if (cancel && mainModal) kit.switchType(mainModal, function () { cancel.click() }, type)
      })
      typeGroup.appendChild(label)
    }
    // the two choices that already live in this form get the same tooltip as the added ones
    typeGroup && typeGroup.querySelectorAll('.form-selectgroup-item').forEach(function (item) {
      var description = item.querySelector('.d-block')
      if (description && !item.title) item.title = description.textContent
    })
    addTypeShortcut('Kegiatan', 'Pakan, ganti air, pengobatan, bersih kolam, pindah ikan.', 'kegiatan')
    addTypeShortcut('Ikan Datang', 'Ikan yang baru datang: jenis, gender, ukuran, farm, bloodline, owner.', 'ikan_datang')
    // an existing report keeps its type: the extra choices only show while a NEW report is being made
    var reportFormTitle = document.querySelector('[data-report-modal-title]')
    if (typeGroup && reportFormTitle) {
      var syncShortcuts = function () {
        typeGroup.querySelectorAll('[data-type-shortcut]').forEach(function (label) { label.classList.toggle('d-none', !/Tambah/.test(reportFormTitle.textContent)) })
      }
      new MutationObserver(syncShortcuts).observe(reportFormTitle, { childList: true, characterData: true, subtree: true })
      syncShortcuts()
    }

    var modal = document.createElement('div')
    modal.className = 'modal modal-blur fade'
    modal.tabIndex = -1
    modal.setAttribute('aria-hidden', 'true')
    modal.setAttribute('data-arrival-modal', '')
    modal.innerHTML =
      '<div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable" role="document"><form class="modal-content" data-arrival-form novalidate>' +
      '<div class="modal-header"><h5 class="modal-title" data-arrival-title>Formulir Laporan Ikan Datang</h5><button type="button" class="btn-close" data-arrival-close aria-label="Tutup"></button></div>' +
      '<div class="modal-body">' +
      kit.typeChooserHtml('ikan_datang') +
      '<div class="alert alert-danger d-none" data-arrival-error style="white-space:pre-line"></div>' +
      '<div class="row g-3">' +
      '<div class="col-md-6"><label class="form-label">Nama laporan <span class="text-secondary small">(opsional)</span></label><input class="form-control" name="judul" placeholder="Contoh: Kedatangan Showa dari Dainichi" autocomplete="off"></div>' +
      '<div class="col-md-3"><label class="form-label required">Tanggal datang</label><input class="form-control" type="text" data-date-parts name="tanggal"></div>' +
      '<div class="col-md-3"><label class="form-label">Ikan dari mana <span class="text-secondary small">(opsional)</span></label><input class="form-control" name="asal" list="arrival-origins" placeholder="Farm / kota / pemasok" autocomplete="off"><datalist id="arrival-origins"></datalist></div>' +
      '<div class="col-12"><div class="d-flex align-items-center justify-content-between"><label class="form-label mb-0">Ikan yang datang <span class="text-secondary small">(opsional, satu kotak = satu ekor)</span></label>' +
      '<div class="d-flex align-items-center gap-2"><span class="text-secondary small">Total: <strong data-arrival-total>0</strong> ekor</span><button type="button" class="btn btn-sm btn-outline-primary" data-arrival-add-line>Tambah ikan</button></div></div>' +
      '<div class="mt-2" data-arrival-lines></div>' +
      '<datalist id="arrival-varieties"></datalist><datalist id="arrival-farms"></datalist><datalist id="arrival-bloodlines"></datalist><datalist id="arrival-owners"></datalist></div>' +
      '<div class="col-12"><label class="form-label">Catatan</label><textarea class="form-control" name="catatan" rows="3" placeholder="Kondisi ikan saat tiba, karantina, dan lain-lain."></textarea></div>' +
      '<div class="col-12"><label class="form-label">Dokumentasi foto / video</label><input class="form-control" type="file" accept="image/*,video/mp4,video/webm" multiple data-arrival-media-input>' +
      '<div class="row g-2 mt-2" data-arrival-media></div><div class="text-secondary small mt-1" data-arrival-media-status></div>' +
      '<label class="form-check mt-3 mb-1"><input class="form-check-input" type="checkbox" name="show_in_gallery" checked><span class="form-check-label">Tampilkan media di Galeri</span></label>' +
      '<div class="form-hint">Media laporan ini ikut tampil di menu Galeri sebagai satu koleksi (file tidak digandakan).</div></div>' +
      '</div></div>' +
      '<div class="modal-footer"><div class="me-auto" data-arrival-draft-host></div><button type="button" class="btn d-none" data-arrival-print>Cetak</button>' +
      '<button type="button" class="btn" data-arrival-close>Batal</button>' +
      '<button type="submit" class="btn btn-primary" data-arrival-submit>Simpan Laporan</button></div>' +
      '</form></div>'
    document.body.appendChild(modal)
    var form = modal.querySelector('[data-arrival-form]')
    var errorBox = modal.querySelector('[data-arrival-error]')
    var linesBox = modal.querySelector('[data-arrival-lines]')
    var totalBox = modal.querySelector('[data-arrival-total]')
    var mediaBox = modal.querySelector('[data-arrival-media]')
    var mediaStatus = modal.querySelector('[data-arrival-media-status]')

    function showModal() {
      var api = kit.modalApi()
      if (api) api.getOrCreateInstance(modal).show()
      else { modal.classList.add('show'); modal.style.display = 'block' }
    }
    function hideModal() {
      var api = kit.modalApi()
      if (api) { var instance = api.getInstance(modal); if (instance) instance.hide() }
      else { modal.classList.remove('show'); modal.style.display = 'none' }
      // lets the page reload its list (Laporan refreshes on window focus)
      setTimeout(function () { window.dispatchEvent(new Event('focus')); loadReports() }, 400)
    }
    function showError(message) { errorBox.textContent = message; errorBox.classList.remove('d-none'); errorBox.scrollIntoView({ block: 'nearest' }) }
    function updateTotal() {
      var total = 0
      total = linesBox.querySelectorAll('[data-arrival-line]').length
      totalBox.textContent = total.toLocaleString('id-ID')
    }
    var lineSeq = 0
    function pondOptionsHtml(selected) {
      return '<option value="">- belum ditentukan -</option>' + ponds.map(function (pond) {
        return '<option value="' + escapeHtml(pond.id) + '"' + (String(pond.id) === String(selected || '') ? ' selected' : '') + '>' + escapeHtml(pond.name + (pond.location ? ' (' + pond.location + ')' : '')) + '</option>'
      }).join('')
    }
    function refreshPondSelects() {
      Array.prototype.forEach.call(linesBox.querySelectorAll('[data-line-pond]'), function (select) {
        var current = select.value
        select.innerHTML = pondOptionsHtml(current)
      })
    }
    function genderGroup(name, selected) {
      return '<div class="form-selectgroup flex-nowrap" role="radiogroup" aria-label="Sex">' + ['unknown', 'male', 'female'].map(function (key) {
        return '<label class="form-selectgroup-item" title="' + genderLabels[key] + '"><input class="form-selectgroup-input" type="radio" data-line-gender name="' + name + '" value="' + key + '"' + (key === selected ? ' checked' : '') + '>' +
          '<span class="form-selectgroup-label" aria-label="' + genderLabels[key] + '" style="padding:.35rem .5rem;font-size:.8rem;white-space:nowrap">' + genderLabels[key] + '</span></label>'
      }).join('') + '</div>'
    }
    function setLinePhoto(row, url) {
      row.dataset.imageUrl = url || ''
      var thumb = row.querySelector('[data-line-photo-thumb]')
      thumb.classList.toggle('d-none', !url)
      if (url) thumb.src = url
      row.querySelector('[data-line-photo-remove]').classList.toggle('d-none', !url || readonly)
      row.querySelector('[data-line-photo-pick]').textContent = url ? 'Ganti foto' : 'Unggah foto'
    }
    function addLine(line) {
      line = line || {}
      lineSeq += 1
      var row = document.createElement('div')
      row.className = 'border rounded p-2 mb-3'
      row.setAttribute('data-arrival-line', '')
      function field(cols, label, inner) { return '<div class="' + cols + '"><label class="form-label small mb-0">' + label + '</label>' + inner + '</div>' }
      row.innerHTML = '<div class="row g-2">' +
        field('col-12 col-md-2', 'Jenis', '<input class="form-control" list="arrival-varieties" data-line-variety placeholder="Contoh Showa" value="' + escapeHtml(line.variety || '') + '">') +
        field('col-5 col-md-2', 'Ukuran (cm)', '<input class="form-control" type="number" min="0" step="0.1" data-line-size placeholder="cm" value="' + escapeHtml(line.size_cm == null ? '' : line.size_cm) + '">') +
        field('col-12 col-md-4', 'Sex', genderGroup('arrival_gender_' + lineSeq, genderFrom(line.gender))) +
        field('col-6 col-md-2', 'Ternakan', '<input class="form-control" list="arrival-farms" data-line-farm placeholder="Ternakan" value="' + escapeHtml(line.farm || '') + '">') +
        field('col-6 col-md-2', 'Bloodline', '<input class="form-control" list="arrival-bloodlines" data-line-bloodline placeholder="Bloodline" value="' + escapeHtml(line.bloodline || '') + '">') +
        field('col-12 col-md-2', 'Owner', '<input class="form-control" list="arrival-owners" data-line-owner placeholder="Owner" value="' + escapeHtml(line.owner || '') + '">') +
        '</div>' +
        '<div class="row g-2 mt-1 align-items-end"><div class="col-12 col-md-4"><label class="form-label small mb-0">Lokasi tujuan</label><select class="form-select" data-line-pond>' + pondOptionsHtml(line.pond_id) + '</select></div>' +
        '<div class="col-12 col-md-8 d-flex align-items-center flex-wrap gap-2">' +
        '<img class="rounded border d-none" alt="Foto ikan" data-line-photo-thumb style="width:44px;height:44px;object-fit:cover">' +
        '<button type="button" class="btn btn-sm btn-outline-primary" data-line-photo-pick>Unggah foto</button>' +
        '<button type="button" class="btn btn-sm btn-outline-secondary d-none" data-line-photo-remove>Hapus foto</button>' +
        '<span class="text-secondary small" data-line-photo-status></span>' +
        '<input class="d-none" type="file" accept="image/*" data-line-photo-input>' +
        '<button type="button" class="btn btn-sm btn-outline-danger ms-auto" data-line-remove>Hapus ikan</button></div></div>'
      linesBox.appendChild(row)
      setLinePhoto(row, line.image_url)
      updateTotal()
    }
    function uploadLinePhoto(row, file) {
      var status = row.querySelector('[data-line-photo-status]')
      status.textContent = 'Mengupload...'
      return kit.compressImage(file).then(function (dataUrl) {
        return request('/images', { method: 'POST', body: JSON.stringify({ prefix: 'report-image', image_data: dataUrl }) })
      }).then(function (data) { setLinePhoto(row, data.image_url); status.textContent = '' })
        .catch(function (error) { status.textContent = ''; showError(error.message) })
    }
    function readLines() {
      return Array.prototype.map.call(linesBox.querySelectorAll('[data-arrival-line]'), function (row) {
        var size = toNumber(row.querySelector('[data-line-size]').value)
        return {
          qty: 1,
          variety: row.querySelector('[data-line-variety]').value.trim(),
          gender: (row.querySelector('[data-line-gender]:checked') || {}).value || 'unknown',
          size_cm: size === null ? '' : size,
          farm: row.querySelector('[data-line-farm]').value.trim(),
          bloodline: row.querySelector('[data-line-bloodline]').value.trim(),
          owner: row.querySelector('[data-line-owner]').value.trim(),
          image_url: row.dataset.imageUrl || '',
          pond_id: row.querySelector('[data-line-pond]').value || '',
          pond_name: (function () {
            var chosen = ponds.find(function (pond) { return String(pond.id) === String(row.querySelector('[data-line-pond]').value) })
            return chosen ? chosen.name : ''
          })(),
        }
      }).filter(function (line) { return line.variety || line.farm || line.bloodline || line.owner || line.size_cm !== '' || line.image_url })
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
            return Promise.all([kit.readDataUrl(file), kit.videoThumbnail(file)]).then(function (data) {
              return request('/videos', { method: 'POST', body: JSON.stringify({ prefix: 'report-video', video_data: data[0], thumbnail_data: data[1] }) })
            }).then(function (data) { media.push({ type: 'video', url: data.video_url, thumbnail_url: data.video_thumbnail_url, name: file.name }) })
          }
          return kit.compressImage(file).then(function (dataUrl) {
            return request('/images', { method: 'POST', body: JSON.stringify({ prefix: 'report-image', image_data: dataUrl }) })
          }).then(function (data) { media.push({ type: 'image', url: data.image_url, thumbnail_url: data.image_url, name: file.name }) })
        }).then(renderMedia)
      })
      return chain.then(function () { mediaStatus.textContent = list.length ? list.length + ' file terupload.' : '' })
        .catch(function (error) { mediaStatus.textContent = ''; showError(error.message) })
    }

    function setReadonly(value) {
      readonly = value
      form.querySelectorAll('input, select, textarea').forEach(function (field) { field.disabled = value })
      modal.querySelector('[data-arrival-add-line]').classList.toggle('d-none', value)
      modal.querySelector('[data-arrival-submit]').classList.toggle('d-none', value)
      modal.querySelector('[data-arrival-print]').classList.toggle('d-none', !value && !editingId)
      var draftControls = modal.querySelector('.koi-draft-controls')
      if (draftControls) draftControls.classList.toggle('d-none', value || Boolean(editingId))
      linesBox.querySelectorAll('[data-line-remove], [data-line-photo-pick]').forEach(function (b) { b.classList.toggle('d-none', value) })
      linesBox.querySelectorAll('[data-line-photo-remove]').forEach(function (b) { b.classList.toggle('d-none', value || !b.closest('[data-arrival-line]').dataset.imageUrl) })
      mediaBox.querySelectorAll('[data-media-remove]').forEach(function (b) { b.classList.toggle('d-none', value) })
    }

    function fill(data) {
      form.reset()
      errorBox.classList.add('d-none')
      form.elements.judul.value = data.report_title || ''
      form.elements.tanggal.value = data.report_date ? String(data.report_date).slice(0, 10) : kit.today()
      form.elements.asal.value = data.origin_location || ''
      form.elements.catatan.value = data.notes || ''
      form.elements.show_in_gallery.checked = data.id ? Boolean(data.gallery_id || data.show_in_gallery === true) : true
      linesBox.innerHTML = ''
      var lines = linesOf(data)
      if (lines.length) lines.forEach(addLine)
      else addLine()
      media = parse(data.media_entries, []).map(function (m) { return { type: m.type || 'image', url: m.url || m.image_url, thumbnail_url: m.thumbnail_url || m.url, name: m.name || '', notes: m.notes || '' } })
      renderMedia()
      mediaStatus.textContent = ''
      updateTotal()
    }

    function buildPayload() {
      var lines = readLines()
      var date = form.elements.tanggal.value
      var title = form.elements.judul.value.trim() || ('Ikan datang ' + (date ? kit.formatDate(date) : ''))
      var group = { date: date, title: title.trim(), origin: form.elements.asal.value.trim(), notes: form.elements.catatan.value.trim(), lines: lines }
      return payloadFor(group, {
        media_entries: collectMedia(),
        show_in_gallery: form.elements.show_in_gallery.checked,
      })
    }

    function validate(payload) {
      var problems = []
      // Nama laporan, Ikan dari mana, and the fish lines may stay empty: the entry can be completed later
      if (!payload.report_date) problems.push('Tanggal datang wajib diisi.')
      payload.activity_data.lines.forEach(function (line, index) {
        if (line.size_cm !== '' && !(Number(line.size_cm) >= 0)) problems.push('Ikan ' + (index + 1) + ': ukuran tidak valid.')
      })
      return problems
    }

    function openForm(report, asReadonly) {
      editingId = report && report.id ? report.id : null
      modal.querySelector('[data-arrival-title]').textContent = !report || !report.id
        ? 'Formulir Laporan Ikan Datang'
        : (asReadonly ? 'Laporan Ikan Datang ' : 'Edit Laporan Ikan Datang ') + (report.batch_code || '')
      fill(report || {})
      // an existing report keeps its type
      modal.querySelector('[data-type-chooser]').classList.toggle('d-none', Boolean(report && report.id))
      setReadonly(Boolean(asReadonly))
      if (drafts && !editingId) drafts.reset()
      showModal()
    }

    function fillSuggestions() {
      function uniq(values) {
        var seen = new Set()
        return values.map(function (v) { return String(v || '').trim() }).filter(function (v) { if (!v || seen.has(v.toLowerCase())) return false; seen.add(v.toLowerCase()); return true }).sort()
      }
      var previous = []
      reportsById.forEach(function (report) { if (report.report_type === TYPE) previous = previous.concat(linesOf(report)) })
      function options(id, values) { modal.querySelector('#' + id).innerHTML = uniq(values).map(function (v) { return '<option value="' + escapeHtml(v) + '"></option>' }).join('') }
      options('arrival-varieties', (koiFacets.variety || []).concat(previous.map(function (l) { return l.variety })))
      options('arrival-farms', (koiFacets.farm_name || []).concat(previous.map(function (l) { return l.farm })))
      options('arrival-bloodlines', (koiFacets.bloodline || []).concat(previous.map(function (l) { return l.bloodline })))
      options('arrival-owners', previous.map(function (l) { return l.owner }))
      var origins = []
      reportsById.forEach(function (report) { if (report.report_type === TYPE) origins.push(report.origin_location) })
      options('arrival-origins', origins.concat(koiFacets.farm_name || []))
    }

    // List cards: show where the fish came from and how many arrived instead of Lokasi / Breeding.
    function decorateCards() {
      table.querySelectorAll('[data-report-id]').forEach(function (row) {
        var report = reportsById.get(String(row.dataset.reportId))
        if (!report || report.report_type !== TYPE) return
        var lines = linesOf(report)
        var varieties = []
        lines.forEach(function (line) { if (line.variety && varieties.indexOf(line.variety) < 0) varieties.push(line.variety) })
        var values = [['Asal', report.origin_location || '-'], ['Jumlah', lines.length ? totalOf(lines) + ' ekor' + (varieties.length ? ' - ' + varieties.join(', ') : '') : '-']]
        row.querySelectorAll('.report-card-cell').forEach(function (cell, index) {
          if (!values[index]) return
          var labelEl = cell.querySelector('.text-secondary')
          var valueEl = cell.querySelector('.report-card-ellipsis')
          if (labelEl && labelEl.textContent !== values[index][0]) labelEl.textContent = values[index][0]
          if (valueEl && valueEl.textContent !== values[index][1]) { valueEl.textContent = values[index][1]; valueEl.title = values[index][1] }
        })
      })
    }

    function loadReports() {
      return request('/farm-reports').then(function (reports) {
        reportsById = new Map((Array.isArray(reports) ? reports : []).map(function (r) { return [String(r.id), r] }))
        fillSuggestions()
        decorateCards()
      }).catch(function () {})
    }
    function loadOptions() {
      return Promise.all([
        request('/ponds').catch(function () { return [] }),
        request('/koi/facets?fields=variety,farm_name,bloodline').catch(function () { return {} }),
      ]).then(function (results) {
        ponds = Array.isArray(results[0]) ? results[0] : []
        koiFacets = results[1] && typeof results[1] === 'object' ? results[1] : {}
        pondsCache = ponds
        refreshPondSelects()
        fillSuggestions()
      })
    }

    // capture phase: before the page's own handlers for Perikanan reports
    table.addEventListener('click', function (event) {
      var row = event.target.closest('[data-report-id]')
      if (!row) return
      var report = reportsById.get(String(row.dataset.reportId))
      if (!report || report.report_type !== TYPE) return
      if (event.target.closest('[data-delete-report], .dropdown-toggle, a')) return
      var edit = event.target.closest('[data-edit-report]')
      var print = event.target.closest('[data-print-report]')
      if (!edit && !print && event.target.closest('button, input')) return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (print) printReport(report)
      else openForm(report, !edit || !kit.canWrite())
    }, true)
    table.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter') return
      var row = event.target.closest('[data-report-id]')
      if (row && row.tagName !== 'TR' && event.target !== row) return
      var report = row && reportsById.get(String(row.dataset.reportId))
      if (report && report.report_type === TYPE) { event.preventDefault(); event.stopImmediatePropagation(); openForm(report, !kit.canWrite()) }
    }, true)

    var scheduled = false
    new MutationObserver(function () {
      if (scheduled) return
      scheduled = true
      requestAnimationFrame(function () {
        scheduled = false
        var unknown = Array.prototype.some.call(table.querySelectorAll('[data-report-id]'), function (row) { return !reportsById.has(String(row.dataset.reportId)) })
        if (unknown) loadReports(); else decorateCards()
      })
    }).observe(table, { childList: true })

    arrivalItem.addEventListener('click', function () { loadOptions().then(function () { openForm(null, false) }) })

    modal.addEventListener('click', function (event) {
      if (event.target.closest('[data-arrival-close]')) { hideModal(); return }
      if (event.target.closest('[data-arrival-add-line]')) { addLine(); return }
      var pickPhoto = event.target.closest('[data-line-photo-pick]')
      if (pickPhoto) { pickPhoto.closest('[data-arrival-line]').querySelector('[data-line-photo-input]').click(); return }
      var removePhoto = event.target.closest('[data-line-photo-remove]')
      if (removePhoto) { setLinePhoto(removePhoto.closest('[data-arrival-line]'), ''); return }
      var removeLine = event.target.closest('[data-line-remove]')
      if (removeLine) {
        removeLine.closest('[data-arrival-line]').remove()
        if (!linesBox.querySelector('[data-arrival-line]')) addLine()
        updateTotal()
        return
      }
      var removeMedia = event.target.closest('[data-media-remove]')
      if (removeMedia) { collectMedia(); media.splice(Number(removeMedia.dataset.mediaRemove), 1); renderMedia(); return }
      if (event.target.closest('[data-arrival-print]') && editingId) {
        var report = reportsById.get(String(editingId))
        if (report) printReport(report)
      }
    })
        form.addEventListener('change', function (event) {
      if (event.target.matches('[data-type-switch]')) {
        var target = event.target.value
        event.target.checked = false
        var self = form.querySelector('[data-type-switch][value="ikan_datang"]')
        if (self) self.checked = true
        if (target !== 'ikan_datang') kit.switchType(modal, hideModal, target)
        return
      }
      if (event.target.matches('[data-line-photo-input]')) {
        var file = event.target.files && event.target.files[0]
        var lineRow = event.target.closest('[data-arrival-line]')
        if (file) uploadLinePhoto(lineRow, file).then(function () { event.target.value = '' })
        return
      }
      if (event.target.matches('[data-arrival-media-input]')) {
        uploadFiles(event.target.files).then(function () { event.target.value = '' })
      }
    })
    form.addEventListener('submit', function (event) {
      event.preventDefault()
      if (readonly) return
      errorBox.classList.add('d-none')
      var payload = buildPayload()
      var problems = validate(payload)
      if (problems.length) { showError(problems.join('\n')); return }
      var submit = modal.querySelector('[data-arrival-submit]')
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

    // "Simpan Draft": the unfinished report goes to Lainnya > Antrean and can be continued later (from any device)
    var drafts = window.KoiDrafts ? window.KoiDrafts.attach({
      type: 'arrival',
      host: modal.querySelector('[data-arrival-draft-host]'),
      collect: function () {
        var payload = buildPayload()
        return {
          data: Object.assign({}, payload, {
            pond_entries: JSON.stringify(payload.pond_entries),
            media_entries: JSON.stringify(payload.media_entries),
            activity_data: JSON.stringify(payload.activity_data),
          }),
          summary: payload.report_title + (payload.origin_location ? ' - dari ' + payload.origin_location : ''),
          item_count: payload.activity_data.lines.length || 1,
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
