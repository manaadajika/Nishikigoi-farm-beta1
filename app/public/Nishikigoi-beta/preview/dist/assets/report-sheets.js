// Laporan: the Excel / ZIP of the page has one sheet for every kind of report, not one mixed sheet.
//   Data Ulang | Panen | Kegiatan | Ikan Datang   -> one row per report (Ikan Datang: one row per fish)
//   Lokasi | Sortir | Kondisi                       -> the detail rows of a Data Ulang / Panen report, tied to it by Kode Batch
//   Petunjuk                                        -> how to fill the file
// The same sheets are read back by Impor (new reports only: a report whose Kode Batch exists is never changed or created twice).
// An older file with the single sheet "Laporan" (column Jenis) and the sheet "Ikan Datang" is still read.
// This file replaces the "export", "zip" and "import" buttons of the page's dock: it wraps KoiDock.create (after macro-edit.js did) and
// takes the file the "Impor" input receives before the page's own, older import sees it.
;(function () {
  'use strict'
  if (!/farm-reports/.test(location.pathname)) return

  var TYPE_SHEETS = [['data_ulang', 'Data Ulang'], ['panen', 'Panen'], ['kegiatan', 'Kegiatan'], ['ikan_datang', 'Ikan Datang']]
  var MAIN_COLUMNS = ['Tanggal', 'Kode Batch', 'Judul', 'Varietas Dominan', 'Rata-rata Ukuran (cm)', 'Deret Ukuran Ikan (cm)', 'Breeding', 'Mention Ikan', 'Petugas', 'Catatan', 'Galeri', 'ID Galeri']
  var LOCATION_COLUMNS = ['Kode Batch', 'Judul', 'No', 'Asal Lokasi', 'Pindah ke', 'Hasil (ekor)', 'Rata-rata Ukuran (cm)', 'Varietas Dominan', 'Sesi Breeding', 'Catatan Lokasi']
  var SORTING_COLUMNS = ['Kode Batch', 'Judul', 'Kategori', 'Lokasi Tujuan', 'Keterangan', 'Ekor', 'No Lokasi']
  var CONDITION_COLUMNS = ['Kode Batch', 'Judul', 'Metrik Kondisi', 'Jumlah (ekor)', 'No Lokasi']
  var FISH_COLUMNS = ['Kode Batch', 'Judul', 'No', 'Jenis', 'Ukuran (cm)', 'Sex', 'Sesi Breeding', 'Male', 'Catatan', 'Foto']
  var ACTIVITY_COLUMNS = ['Tanggal', 'Kode Batch', 'Judul', 'Jenis Kegiatan', 'Jam Mulai', 'Jam Selesai', 'Kolam', 'Petugas', 'Uraian', 'Bahan', 'Suhu Air (°C)', 'pH Air', 'Status', 'Tindak Lanjut', 'Galeri', 'ID Galeri']
  var ARRIVAL_COLUMNS = ['Tanggal', 'Nama Laporan', 'Ikan Dari', 'Jenis', 'Sex', 'Ukuran (cm)', 'Ternakan', 'Bloodline', 'Owner', 'Lokasi Tujuan', 'Foto', 'Catatan', 'Kode Batch']
  var HELP_COLUMNS = ['Petunjuk']
  var HELP_ROWS = [
    ['Satu sheet untuk tiap jenis laporan: Data Ulang, Panen, Kegiatan, dan Ikan Datang (satu baris per ekor ikan).'],
    ['Lokasi: satu baris per tempat panen (No = nomor tempat), lengkap dengan Varietas Dominan dan Sesi Breeding-nya. Sortir dan Kondisi: baris dengan No Lokasi milik tempat itu, baris tanpa No Lokasi milik seluruh laporan.'],
    ['Ikan Satuan adalah tabel ikan pada formulir Data Ulang (satu baris per ekor, kolom Sesi Breeding diisi kode batch breeding, Male diisi kode ikan male dari sesi itu). Lokasi, Sortir, dan Kondisi adalah rincian laporan Panen / Data Ulang lama. Satu baris rincian = satu baris di bagian itu pada formulir.'],
    ['Rincian dihubungkan ke laporannya lewat Kode Batch. Untuk laporan BARU, tulis kode bebas (misalnya N1) di Kode Batch laporan dan di baris rinciannya; program memberi kode batch resminya sendiri.'],
    ['Laporan yang Kode Batch-nya sudah ada tidak diubah dan tidak dibuat dua kali. Untuk mengubah laporan yang sudah ada, pakai Edit Masal.'],
    ['Kegiatan: Kolam berisi nama kolam atau nama area (pisahkan dengan koma), Petugas berisi username akun (pisahkan dengan koma), Bahan ditulis "Garam ikan 2 kg; Obat 5 ml".'],
    ['Breeding, Mention Ikan, dan Petugas Data Ulang / Panen ikut diunduh tetapi tidak dibaca saat impor; isi lewat formulir.'],
    ['Kolom Dokumentasi (khusus ZIP) berisi nama folder foto atau video, atau @ID media yang sudah ada di Galeri.'],
  ]

  var ACTIVITIES = [['pakan', 'Pemberian pakan'], ['ganti_air', 'Ganti air / kuras'], ['pengobatan', 'Pengobatan / perawatan'], ['bersih', 'Bersih kolam / filter'],
    ['pindah', 'Pindah ikan'], ['seleksi', 'Seleksi / panen'], ['perbaikan', 'Perbaikan fasilitas'], ['lainnya', 'Lainnya']]
  var STATUSES = [['selesai', 'Selesai'], ['belum', 'Belum selesai'], ['tindak_lanjut', 'Perlu tindak lanjut']]

  var pageActions = []
  var pageOptions = null

  // ---- small helpers -----------------------------------------------------------------------------------------------------------------
  function text(value) { return String(value == null ? '' : value).replace(/\r\n?/g, '\n').trim() }
  function norm(value) { return text(value).toLowerCase() }
  function parse(value, fallback) {
    if (Array.isArray(value)) return value
    if (value && typeof value === 'object') return value
    try { var parsed = JSON.parse(value || ''); return parsed == null ? fallback : parsed } catch (error) { return fallback }
  }
  function list(value) { var parsed = parse(value, []); return Array.isArray(parsed) ? parsed : [] }
  function toNumber(value) {
    var raw = text(value).replace(',', '.')
    if (raw === '') return null
    var number = Number(raw)
    return Number.isFinite(number) ? number : NaN
  }
  function numeric(value) {
    if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim())) return Number(value)
    return value == null ? '' : value
  }
  function dateText(value) { return window.KoiAuth && window.KoiAuth.dateShort ? window.KoiAuth.dateShort(value) : String(value || '').slice(0, 10) }
  function dateFrom(value) { return window.KoiAuth && window.KoiAuth.dateFromText ? window.KoiAuth.dateFromText(value) : String(value || '').slice(0, 10) }
  function typeOf(item) { return item.report_type === 'kegiatan' || item.report_type === 'ikan_datang' || item.report_type === 'panen' ? item.report_type : 'data_ulang' }
  function labelOf(items, key) { var found = items.filter(function (item) { return item[0] === key })[0]; return found ? found[1] : '' }
  function keyOf(items, typed) {
    var wanted = norm(typed)
    var found = items.filter(function (item) { return item[0] === wanted || norm(item[1]) === wanted })[0]
    return found ? found[0] : ''
  }
  function request(method, url, body) {
    return fetch(url, { method: method, headers: body === undefined ? undefined : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }).then(function (response) {
      return response.json().catch(function () { return {} }).then(function (data) {
        if (!response.ok) throw new Error(data.error || data.detail || 'Permintaan gagal.')
        return data
      })
    })
  }
  function sheetOf(rows, header) { return XLSX.utils.aoa_to_sheet([header].concat(rows)) }
  function setWidths(sheet, header) { sheet['!cols'] = header.map(function (column) { return { wch: Math.max(14, String(column).length + 2) } }) }
  function showResult(title, message, problems, options) { return window.KoiDock.showResult(title, message, problems || [], options) }

  // ---- export: the rows of every sheet -----------------------------------------------------------------------------------------------
  function mainRow(item) {
    return [
      dateText(item.report_date), item.batch_code || '', item.report_title || '', item.dominant_variety || '', numeric(item.average_length_cm),
      list(item.spectrum_sizes).join(' '),
      list(item.breeding_entries).map(function (entry) { return entry.label }).filter(Boolean).join(', '),
      list(item.koi_entries).map(function (entry) { return entry.label }).filter(Boolean).join(', '),
      list(item.reporter_entries).map(function (entry) { return entry.label || entry.name || entry.username }).filter(Boolean).join(', ') || item.reporter || '',
      item.notes || '', item.gallery_id ? 'Ya' : 'Tidak', item.gallery_id || '',
    ]
  }
  function activityRow(item) {
    var activity = parse(item.activity_data, {}) || {}
    var jenis = labelOf(ACTIVITIES, activity.jenis) || activity.jenis || ''
    if (activity.jenis === 'lainnya' && activity.jenis_lain) jenis = activity.jenis_lain
    return [
      dateText(item.report_date), item.batch_code || '', item.report_title || '', jenis, activity.jam_mulai || '', activity.jam_selesai || '',
      list(item.pond_entries).map(function (entry) { return entry.pond_name || entry.location }).filter(Boolean).join(', '),
      list(item.reporter_entries).map(function (entry) { return entry.username || entry.label || entry.name }).filter(Boolean).join(', '),
      item.notes || '',
      list(activity.bahan).map(function (b) { return [b.nama, b.jumlah, b.satuan].filter(function (part) { return part !== '' && part != null }).join(' ') }).filter(Boolean).join('; '),
      numeric(activity.suhu), numeric(activity.ph), labelOf(STATUSES, activity.status) || '', activity.tindak_lanjut || '',
      item.gallery_id ? 'Ya' : 'Tidak', item.gallery_id || '',
    ]
  }
  function photoPath(item, index, line) {
    var extension = (String(line.image_url).split('?')[0].split('.').pop() || 'jpg').toLowerCase()
    return 'image/' + window.KoiZip.safeName(item.batch_code || String(item.id), 'laporan') + '/ikan/ikan-' + String(index + 1).padStart(2, '0') + '.' + extension
  }
  function arrivalRows(items, zipMode) {
    var rows = []
    items.filter(function (item) { return typeOf(item) === 'ikan_datang' }).forEach(function (item) {
      window.KoiArrival.linesOf(item).forEach(function (line, index) {
        rows.push([dateText(item.report_date), item.report_title || '', item.origin_location || '', line.variety, window.KoiArrival.genderLabels[line.gender], numeric(line.size_cm), line.farm, line.bloodline, line.owner,
          line.pond_name, line.image_url ? (zipMode ? photoPath(item, index, line) : line.image_url) : '', item.notes || '', item.batch_code || ''])
      })
    })
    return rows
  }
  function arrivalPhotoFiles(items) {
    var files = []
    items.filter(function (item) { return typeOf(item) === 'ikan_datang' }).forEach(function (item) {
      window.KoiArrival.linesOf(item).forEach(function (line, index) { if (line.image_url) files.push({ path: photoPath(item, index, line), url: line.image_url }) })
    })
    return files
  }
  // Ikan Satuan of a Data Ulang report (the table of the form, kept in activity_data.fish)
  function fishRows(items) {
    var rows = []
    items.filter(function (item) { return typeOf(item) === 'data_ulang' }).forEach(function (item) {
      var data = parse(item.activity_data, {}) || {}
      ;(Array.isArray(data.fish) ? data.fish : []).forEach(function (fish, index) {
        rows.push([item.batch_code || '', item.report_title || '', index + 1, fish.jenis || '', numeric(fish.ukuran), fish.sex || 'unknown', fish.breeding_label || '', fish.male_label || '', fish.catatan || '', fish.foto || ''])
      })
    })
    return rows
  }
  // Lokasi: one row per harvest place (its own variety and session); Sortir and Kondisi: the report-wide rows (No Lokasi empty) and the rows of a place (No Lokasi = its number)
  function locationRows(items) {
    var rows = []
    items.filter(function (item) { return typeOf(item) === 'data_ulang' || typeOf(item) === 'panen' }).forEach(function (item) {
      list(item.pond_entries).forEach(function (e, index) {
        rows.push([item.batch_code || '', item.report_title || '', index + 1, e.pond_label || e.pond_name || '', e.location || '', numeric(e.result_qty), numeric(e.average_length_cm), e.variety || '', e.breeding_label || '', e.notes || ''])
      })
    })
    return rows
  }
  function nestedRows(items, globalField, nestedField, pick) {
    var rows = []
    items.filter(function (item) { return typeOf(item) === 'data_ulang' || typeOf(item) === 'panen' }).forEach(function (item) {
      list(item[globalField]).forEach(function (e) { rows.push([item.batch_code || '', item.report_title || ''].concat(pick(e), ['']))})
      list(item.pond_entries).forEach(function (place, index) {
        list(place[nestedField]).forEach(function (e) { rows.push([item.batch_code || '', item.report_title || ''].concat(pick(e), [index + 1])) })
      })
    })
    return rows
  }
  function detailRows(items, field, pick) {
    var rows = []
    items.filter(function (item) { return typeOf(item) === 'data_ulang' || typeOf(item) === 'panen' }).forEach(function (item) {
      list(item[field]).forEach(function (entry) { rows.push([item.batch_code || '', item.report_title || ''].concat(pick(entry))) })
    })
    return rows
  }
  function sheetsOf(items, zipMode) {
    var byType = function (type) { return items.filter(function (item) { return typeOf(item) === type }) }
    return {
      'Data Ulang': { header: MAIN_COLUMNS, rows: byType('data_ulang').map(mainRow), key: 1 },
      'Panen': { header: MAIN_COLUMNS, rows: byType('panen').map(mainRow), key: 1 },
      'Kegiatan': { header: ACTIVITY_COLUMNS, rows: byType('kegiatan').map(activityRow), key: 1 },
      'Ikan Datang': { header: ARRIVAL_COLUMNS, rows: arrivalRows(items, zipMode), key: ARRIVAL_COLUMNS.length - 1 },
      'Lokasi': { header: LOCATION_COLUMNS, rows: locationRows(items), key: -1 },
      'Sortir': { header: SORTING_COLUMNS, rows: nestedRows(items, 'sorting_entries', 'sortir', function (e) { return [e.category || '', e.destination || '', e.description || '', numeric(e.qty)] }), key: -1 },
      'Ikan Satuan': { header: FISH_COLUMNS, rows: fishRows(items), key: -1 },
      'Kondisi': { header: CONDITION_COLUMNS, rows: nestedRows(items, 'condition_entries', 'reject', function (e) { return [e.metric || '', numeric(e.qty)] }), key: -1 },
      'Petunjuk': { header: HELP_COLUMNS, rows: HELP_ROWS, key: -1 },
    }
  }
  var SHEET_ORDER = ['Data Ulang', 'Panen', 'Kegiatan', 'Ikan Datang', 'Ikan Satuan', 'Lokasi', 'Sortir', 'Kondisi', 'Petunjuk']

  function chosenItems(ids) {
    return request('GET', '/api/farm-reports').then(function (all) {
      if (ids && ids.length) return all.filter(function (item) { return ids.indexOf(String(item.id)) >= 0 })
      var visible = pageOptions && pageOptions.visibleItems ? pageOptions.visibleItems() : null
      if (visible && visible.length) { var wanted = {}; visible.forEach(function (item) { wanted[String(item.id)] = true }); return all.filter(function (item) { return wanted[String(item.id)] }) }
      return all
    })
  }

  function exportExcel(ids) {
    if (!window.XLSX) { showResult('Ekspor Excel', 'Pustaka Excel belum termuat. Muat ulang halaman.'); return }
    return chosenItems(ids).then(function (items) {
      var sheets = sheetsOf(items, false)
      var workbook = XLSX.utils.book_new()
      SHEET_ORDER.forEach(function (name) {
        var sheet = sheetOf(sheets[name].rows, sheets[name].header)
        setWidths(sheet, sheets[name].header)
        XLSX.utils.book_append_sheet(workbook, sheet, name)
      })
      var buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
      var blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      var link = document.createElement('a')
      var url = URL.createObjectURL(blob)
      link.href = url
      link.download = 'data-laporan-' + new Date().toISOString().slice(0, 10) + '.xlsx'
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(function () { URL.revokeObjectURL(url) }, 1000)
    }).catch(function (error) { showResult('Ekspor Excel', error.message || 'Ekspor gagal.') })
  }

  function exportZip(ids) {
    if (!window.XLSX || !window.KoiZip) { showResult('Unduh ZIP Laporan', 'Pustaka Excel atau ZIP belum termuat. Muat ulang halaman.'); return }
    var progress = window.KoiZip.progress('Unduh ZIP Laporan')
    return chosenItems(ids).then(function (items) {
      var sheets = sheetsOf(items, true)
      // the first sheet carries the documentation of its own rows; the others look their folder up by Kode Batch
      var first = items.filter(function (item) { return typeOf(item) === 'data_ulang' })
      var others = items.filter(function (item) { return typeOf(item) !== 'data_ulang' })
      var docOf = function (item) { return { key: item.batch_code || String(item.id), media: list(item.media_entries) } }
      return window.KoiZip.exportPackage({
        sheetName: 'Data Ulang',
        header: MAIN_COLUMNS,
        rows: sheets['Data Ulang'].rows,
        keyHeader: 'Kode Batch',
        xlsxName: 'data-laporan.xlsx',
        extraSheets: SHEET_ORDER.slice(1).map(function (name) { return { name: name, header: sheets[name].header, rows: sheets[name].rows, keyColumn: sheets[name].key } }),
        extraFiles: arrivalPhotoFiles(items),
        docs: first.map(docOf).concat(others.map(docOf)),
        onProgress: function (message) { progress.set(message) },
      }).then(function (result) {
        window.KoiZip.download(result.blob, 'zip-laporan-' + window.KoiZip.today() + '.zip')
        showResult('Unduh ZIP Laporan', 'Selesai: ' + items.length + ' laporan, ' + result.photos + ' foto, ' + result.videos + ' video.', result.problems)
      })
    }).catch(function (error) { showResult('Unduh ZIP Laporan', error.message || 'ZIP gagal dibuat.') }).then(function () { progress.close() })
  }

  // ---- import ---------------------------------------------------------------------------------------------------------------------------
  function readWorkbook(file) {
    return file.arrayBuffer().then(function (buffer) {
      var workbook = XLSX.read(buffer, { type: 'array', cellDates: true, dateNF: 'yyyy-mm-dd' })
      var toRecords = function (sheet) {
        return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false }).map(function (row) {
          var record = {}
          Object.keys(row).forEach(function (key) { record[norm(key)] = text(row[key]).replace(/^[-–—]+$/, '') })
          return record
        })
      }
      var named = function (name) { var found = workbook.SheetNames.filter(function (sheetName) { return norm(sheetName) === name })[0]; return found ? toRecords(workbook.Sheets[found]) : null }
      var sheets = { data_ulang: named('data ulang'), panen: named('panen'), kegiatan: named('kegiatan'), ikan_datang: named('ikan datang'), ikan_satuan: named('ikan satuan'), lokasi: named('lokasi'), sortir: named('sortir'), kondisi: named('kondisi'), legacy: named('laporan') }
      // an older file: the first sheet holds every report, the column Jenis says which kind
      var firstName = workbook.SheetNames[0]
      var firstRecords = firstName ? toRecords(workbook.Sheets[firstName]) : []
      var hasTypeSheet = ['data_ulang', 'panen', 'kegiatan'].some(function (key) { return sheets[key] })
      if (!hasTypeSheet && !sheets.legacy && firstRecords.length && 'jenis' in firstRecords[0] && !('ikan dari' in firstRecords[0])) sheets.legacy = firstRecords
      if (!sheets.ikan_datang && firstRecords.length && 'ikan dari' in firstRecords[0]) sheets.ikan_datang = firstRecords
      return sheets
    })
  }

  function loadLookups() {
    return Promise.all([request('GET', '/api/ponds').catch(function () { return [] }), request('GET', '/api/farm-reports').catch(function () { return [] }), request('GET', '/api/accounts').catch(function () { return [] }), request('GET', '/api/breeding').catch(function () { return [] })]).then(function (results) {
      var ponds = Array.isArray(results[0]) ? results[0] : []
      var byName = {}
      var areas = {}
      ponds.forEach(function (pond) { byName[norm(pond.name)] = pond; if (text(pond.location)) areas[norm(pond.location)] = text(pond.location) })
      var accounts = (Array.isArray(results[2]) ? results[2] : []).filter(function (a) { return String(a.status || 'Active').toLowerCase() === 'active' })
      return { ponds: ponds, pondByName: byName, areaByName: areas, accounts: accounts, breedings: Array.isArray(results[3]) ? results[3] : [], reports: Array.isArray(results[1]) ? results[1] : [] }
    })
  }

  function galleryFrom(value, hasMedia) {
    var typed = norm(value)
    if (['ya', 'y', 'yes', 'true', '1'].indexOf(typed) >= 0) return true
    if (['tidak', 't', 'no', 'false', '0'].indexOf(typed) >= 0) return false
    return hasMedia
  }
  function timeFrom(value) {
    var raw = text(value)
    if (raw === '') return ''
    var match = /^(\d{1,2})[:.](\d{2})/.exec(raw)
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null
    return String(match[1]).padStart(2, '0') + ':' + match[2]
  }
  function splitNames(value) { return text(value).split(/[,;\n]+/).map(function (part) { return part.trim() }).filter(Boolean) }
  function bahanFrom(value) {
    return text(value).split(/[;\n]+/).map(function (part) { return part.trim() }).filter(Boolean).map(function (part) {
      var match = /^(.*?)\s+(\d+(?:[.,]\d+)?)\s*([^\d\s]+)?$/.exec(part)
      return match ? { nama: match[1].trim(), jumlah: match[2].replace(',', '.'), satuan: match[3] || '' } : { nama: part, jumlah: '', satuan: '' }
    })
  }

  // the rows of one new report: details by Kode Batch (the same text on the main row and on its detail rows)
  function detailsFor(sheets, code, lookups, problems) {
    var key = norm(code)
    var of = function (records) { return (records || []).filter(function (record) { return key && norm(record['kode batch']) === key }) }
    var sessionOf = function (text) {
      var wanted = norm(text)
      return wanted ? lookups.breedings.filter(function (b) { return norm(b.batch_code) === wanted || wanted.indexOf(norm(b.batch_code)) === 0 })[0] : null
    }
    var placeRecords = of(sheets.lokasi)
    var pondEntries = []
    var numbers = {}
    placeRecords.forEach(function (record, index) {
      var origin = record['asal lokasi'] || ''
      var pond = lookups.pondByName[norm(origin)]
      var session = sessionOf(record['sesi breeding'])
      var entry = {
        pond_id: pond ? pond.id : '', pond_name: pond ? pond.name : origin, pond_label: origin, location: record['pindah ke'] || '', result_qty: record['hasil (ekor)'] || '',
        average_length_cm: record['rata-rata ukuran (cm)'] || '', notes: record['catatan lokasi'] || '', variety: record['varietas dominan'] || '',
        breeding_id: session ? String(session.id) : '', breeding_label: session ? (session.batch_code + (session.session_name ? ' - ' + session.session_name : '')) : (record['sesi breeding'] || ''),
        reject: [], sortir: [],
      }
      numbers[String(record.no || index + 1)] = entry
      pondEntries.push(entry)
    })
    pondEntries = pondEntries.filter(function (entry) { return entry.pond_name || entry.location || entry.result_qty || entry.notes || entry.variety || entry.breeding_label })
    // a row with "No Lokasi" belongs to that place, a row without it to the whole report
    var sorting = []
    of(sheets.sortir).forEach(function (record) {
      var entry = { category: record.kategori || '', destination: record['lokasi tujuan'] || '', description: record.keterangan || '', qty: record.ekor || '' }
      if (!(entry.category || entry.destination || entry.description || entry.qty)) return
      var place = record['no lokasi'] ? numbers[String(record['no lokasi'])] : null
      if (place) place.sortir.push(entry); else sorting.push(entry)
    })
    var conditions = []
    of(sheets.kondisi).forEach(function (record) {
      var entry = { metric: record['metrik kondisi'] || '', qty: record['jumlah (ekor)'] || '' }
      if (!(entry.metric || entry.qty)) return
      var place = record['no lokasi'] ? numbers[String(record['no lokasi'])] : null
      if (place) place.reject.push(entry); else conditions.push(entry)
    })
    var fish = of(sheets.ikan_satuan).map(function (record) {
      var typedSex = norm(record.sex)
      var wanted = norm(record['sesi breeding'])
      var session = wanted ? lookups.breedings.filter(function (b) { return norm(b.batch_code) === wanted || wanted.indexOf(norm(b.batch_code)) === 0 })[0] : null
      var maleText = norm(record.male)
      var maleEntry = session ? list(session.male_parent_entries).filter(function (m) { return norm(m.label || m.code) === maleText })[0] : null
      return {
        jenis: record.jenis || '', ukuran: record['ukuran (cm)'] || '', sex: typedSex === 'male' || typedSex === 'female' ? typedSex : 'unknown',
        breeding_id: session ? String(session.id) : '', breeding_label: session ? (session.batch_code + (session.session_name ? ' - ' + session.session_name : '')) : (record['sesi breeding'] || ''),
        male_id: maleEntry ? String(maleEntry.koi_id) : '', male_label: maleEntry ? (maleEntry.label || maleEntry.code) : (record.male || ''), catatan: record.catatan || '', foto: record.foto || '',
      }
    }).filter(function (entry) { return entry.jenis || entry.ukuran !== '' || entry.breeding_label || entry.catatan || entry.foto })
    return { pondEntries: pondEntries, sorting: sorting, conditions: conditions, fish: fish }
  }

  function runImport(sheets, pkg, dryRun, progress, lookups) {
    var problems = []
    var created = { data_ulang: 0, panen: 0, kegiatan: 0, ikan_datang: 0 }
    var docsAdded = 0
    var docsSkipped = 0
    var docsPlanned = 0
    var knownCodes = {}
    lookups.reports.forEach(function (item) { knownCodes[String(item.batch_code || '').toUpperCase()] = true })
    var dateOf = function (item) { return String(item.report_date || '').slice(0, 10) }
    var existing = {}
    lookups.reports.forEach(function (item) { existing[[typeOf(item), dateOf(item), norm(item.report_title), norm(item.notes)].join('|')] = true })
    var usedDetailCodes = {}
    var queue = []

    // ---- main sheets (Data Ulang, Panen, an older single sheet) ----
    var mains = []
    ;[['data_ulang', sheets.data_ulang], ['panen', sheets.panen]].forEach(function (pair) {
      ;(pair[1] || []).forEach(function (record, index) { mains.push({ type: pair[0], record: record, line: index + 2, sheet: pair[0] === 'panen' ? 'Panen' : 'Data Ulang' }) })
    })
    ;(sheets.legacy || []).forEach(function (record, index) {
      var typed = norm(record.jenis)
      if (typed === 'ikan datang') return
      mains.push({ type: typed === 'panen' ? 'panen' : typed === 'data ulang' || typed === 'data_ulang' ? 'data_ulang' : (typed === 'kegiatan' ? 'kegiatan-legacy' : ''), record: record, line: index + 2, sheet: 'Laporan', legacyJenis: record.jenis })
    })
    mains.forEach(function (entry) {
      var record = entry.record
      var code = String(record['kode batch'] || '').toUpperCase()
      var label = entry.sheet + ' baris ' + entry.line + (code ? ' (' + code + ')' : '')
      if (code) usedDetailCodes[code] = true
      if (pkg && code) pkg.markUsed(code)
      if (!record.tanggal && !record.judul && !code) return
      if (code && knownCodes[code]) { problems.push(label + ': laporan dengan kode ini sudah ada, dilewati'); return }
      var bad = []
      var date = dateFrom(record.tanggal)
      if (!date) bad.push(record.tanggal ? 'Tanggal "' + record.tanggal + '" tidak valid' : 'Tanggal wajib diisi')
      if (!entry.type) bad.push('Jenis "' + (entry.legacyJenis || '') + '" tidak dikenal (Data Ulang atau Panen)')
      if (entry.type === 'kegiatan-legacy') { bad.length = 0; bad.push('Laporan Kegiatan diimport lewat sheet "Kegiatan"') }
      if (!record.judul) bad.push('Judul wajib diisi')
      var average = toNumber(record['rata-rata ukuran (cm)'])
      if (average !== null && Number.isNaN(average)) bad.push('Rata-rata Ukuran harus angka')
      if (bad.length) { problems.push(label + ': ' + bad.join('; ')); return }
      var key = [entry.type, date, norm(record.judul), norm(record.catatan)].join('|')
      if (existing[key]) { problems.push(label + ': laporan "' + record.judul + '" tanggal ' + date + ' sudah ada, dilewati'); return }
      existing[key] = true
      var details = detailsFor(sheets, code, lookups, problems)
      // an older file: Lokasi Asal / Lokasi Tujuan become one Lokasi row
      if (!details.pondEntries.length && (record['lokasi asal'] || record['lokasi tujuan'])) {
        var origin = record['lokasi asal'] || ''
        var pond = lookups.pondByName[norm(origin)]
        details.pondEntries.push({ pond_id: pond ? pond.id : '', pond_name: pond ? pond.name : origin, pond_label: origin, location: record['lokasi tujuan'] || '', result_qty: '', average_length_cm: '', notes: '' })
      }
      var spectrum = text(record['deret ukuran ikan (cm)']).split(/[\s,;]+/).map(function (part) { return toNumber(part) }).filter(function (n) { return n !== null && !Number.isNaN(n) })
      queue.push({
        label: label, code: code, docsCell: record.dokumentasi, galleryCell: record.galeri, type: entry.type,
        payload: {
          report_type: entry.type, report_date: date, report_title: record.judul, dominant_variety: record['varietas dominan'] || '',
          average_length_cm: average === null ? '' : average, notes: record.catatan || '',
          pond_entries: details.pondEntries, sorting_entries: details.sorting, condition_entries: details.conditions,
          spectrum_sizes: spectrum,
          activity_data: entry.type === 'data_ulang' ? { fish: details.fish, spectrum_from_fish: false } : undefined,
          origin_location: details.pondEntries.map(function (e) { return e.pond_label || e.pond_name }).filter(Boolean).filter(function (v, i, a) { return a.indexOf(v) === i }).join(', '),
          destination_location: details.pondEntries.map(function (e) { return e.location }).filter(Boolean).filter(function (v, i, a) { return a.indexOf(v) === i }).join(', '),
        },
      })
    })

    // ---- Kegiatan ----
    ;(sheets.kegiatan || []).forEach(function (record, index) {
      var line = index + 2
      var code = String(record['kode batch'] || '').toUpperCase()
      var label = 'Kegiatan baris ' + line + (code ? ' (' + code + ')' : '')
      if (pkg && code) pkg.markUsed(code)
      if (!record.tanggal && !record.judul && !record.uraian && !code) return
      if (code && knownCodes[code]) { problems.push(label + ': laporan dengan kode ini sudah ada, dilewati'); return }
      var bad = []
      var date = dateFrom(record.tanggal)
      if (!date) bad.push(record.tanggal ? 'Tanggal "' + record.tanggal + '" tidak valid' : 'Tanggal wajib diisi')
      if (!record.uraian) bad.push('Uraian wajib diisi')
      var jenisText = record['jenis kegiatan'] || ''
      var jenis = keyOf(ACTIVITIES, jenisText) || (jenisText ? 'lainnya' : '')
      if (!jenisText) bad.push('Jenis Kegiatan wajib diisi')
      var jam1 = timeFrom(record['jam mulai'])
      var jam2 = timeFrom(record['jam selesai'])
      if (jam1 === null) bad.push('Jam Mulai harus berbentuk 08:30')
      if (jam2 === null) bad.push('Jam Selesai harus berbentuk 08:30')
      if (jam1 && jam2 && jam2 < jam1) bad.push('Jam Selesai lebih awal dari Jam Mulai')
      var suhu = toNumber(record['suhu air (°c)'])
      var ph = toNumber(record['ph air'])
      if (Number.isNaN(suhu)) bad.push('Suhu Air harus angka')
      if (Number.isNaN(ph) || (ph !== null && (ph < 0 || ph > 14))) bad.push('pH Air harus angka 0 sampai 14')
      var statusText = record.status || ''
      var status = statusText ? keyOf(STATUSES, statusText) : 'selesai'
      if (!status) bad.push('Status "' + statusText + '" tidak dikenal (Selesai, Belum selesai, Perlu tindak lanjut)')
      var pondEntries = []
      splitNames(record.kolam).forEach(function (name) {
        var pond = lookups.pondByName[norm(name)]
        var area = lookups.areaByName[norm(name)]
        if (pond) pondEntries.push({ pond_id: Number(pond.id), pond_name: pond.name, location: pond.location || '' })
        else if (area) pondEntries.push({ pond_id: '', pond_name: area, location: area, area: true })
        else bad.push('Kolam "' + name + '" tidak ditemukan di Data Kolam (nama kolam atau nama area)')
      })
      var staffEntries = []
      splitNames(record.petugas).forEach(function (name) {
        var wanted = norm(name).replace(/^.*@/, '')
        var account = lookups.accounts.filter(function (a) { return norm(a.username) === wanted || norm(a.name) === norm(name) || norm((a.name || a.username) + ' @' + a.username) === norm(name) })[0]
        if (!account) bad.push('Petugas "' + name + '" tidak ditemukan (tulis username atau nama akun)')
        else staffEntries.push({ account_id: Number(account.id), label: account.name || account.username || '', username: account.username || '' })
      })
      if (bad.length) { problems.push(label + ': ' + bad.join('; ')); return }
      var title = record.judul || ((labelOf(ACTIVITIES, jenis) || 'Kegiatan') + (pondEntries.length ? ' - ' + pondEntries.slice(0, 3).map(function (p) { return p.pond_name }).join(', ') + (pondEntries.length > 3 ? ', ...' : '') : ''))
      var key = ['kegiatan', date, norm(title), norm(record.uraian)].join('|')
      if (existing[key]) { problems.push(label + ': kegiatan "' + title + '" tanggal ' + date + ' sudah ada, dilewati'); return }
      existing[key] = true
      queue.push({
        label: label, code: code, docsCell: record.dokumentasi, galleryCell: record.galeri, type: 'kegiatan',
        payload: {
          report_type: 'kegiatan', report_date: date, report_title: title, notes: record.uraian, pond_entries: pondEntries, reporter_entries: staffEntries,
          activity_data: { jenis: jenis, jenis_lain: jenis === 'lainnya' ? jenisText : '', jam_mulai: jam1 || '', jam_selesai: jam2 || '', bahan: bahanFrom(record.bahan), suhu: suhu, ph: ph, status: status, tindak_lanjut: record['tindak lanjut'] || '' },
        },
      })
    })

    // detail rows that belong to no report of this file
    ;[['Ikan Satuan', sheets.ikan_satuan], ['Lokasi', sheets.lokasi], ['Sortir', sheets.sortir], ['Kondisi', sheets.kondisi]].forEach(function (pair) {
      ;(pair[1] || []).forEach(function (record, index) {
        var code = String(record['kode batch'] || '').toUpperCase()
        if (!code) { problems.push(pair[0] + ' baris ' + (index + 2) + ': Kode Batch kosong, dilewati'); return }
        if (!usedDetailCodes[code]) problems.push(pair[0] + ' baris ' + (index + 2) + ' (' + code + '): tidak ada laporan baru dengan kode ini di sheet Data Ulang / Panen, dilewati')
      })
    })

    var chain = Promise.resolve()
    // ---- Ikan Datang (one row per fish, grouped by KoiArrival) ----
    if (sheets.ikan_datang && window.KoiArrival) {
      chain = chain.then(function () { return window.KoiArrival.pondMap() }).then(function (pondByName) {
        // fish rows of a report that already exists are left alone (said once per code)
        var saidKnown = {}
        var freshRows = sheets.ikan_datang.filter(function (record, index) {
          var code = String(record['kode batch'] || '').toUpperCase()
          if (!code || !knownCodes[code]) return true
          if (pkg) pkg.markUsed(code)
          if (!saidKnown[code]) { saidKnown[code] = true; problems.push('Ikan Datang baris ' + (index + 2) + ' (' + code + '): laporan dengan kode ini sudah ada, dilewati') }
          return false
        })
        var parsed = window.KoiArrival.importSheet(freshRows, { knownCodes: Object.keys(knownCodes), dateFromText: dateFrom, pondByName: pondByName })
        problems.push.apply(problems, parsed.problems)
        var arrivalExisting = {}
        lookups.reports.filter(function (item) { return typeOf(item) === 'ikan_datang' }).forEach(function (item) { arrivalExisting[[dateOf(item), norm(item.report_title), norm(item.origin_location)].join('|')] = true })
        return parsed.groups.reduce(function (inner, group) {
          return inner.then(function () {
            if (pkg && group.code) pkg.markUsed(group.code)
            var key = [group.date, norm(group.title), norm(group.origin)].join('|')
            if (arrivalExisting[key]) { problems.push(group.title + ': laporan Ikan Datang dengan tanggal, nama, dan asal yang sama sudah ada, dilewati'); return }
            arrivalExisting[key] = true
            return (pkg ? pkg.docsForRow(group.docsCell, group.code) : Promise.resolve({ docs: null, problems: [] })).then(function (found) {
              problems.push.apply(problems, (found.problems || []).map(function (message) { return group.title + ': ' + message }))
              var docs = found.docs
              if (docs && docs.length) docsPlanned += docs.length
              if (dryRun) { created.ikan_datang += 1; return }
              var saveMedia = docs && docs.length
                ? (progress && progress.set(group.title + ': ' + docs.length + ' dokumentasi'), window.KoiZip.uploadEntries(docs, { imagePrefix: 'report-image', videoPrefix: 'report-video', existingUrls: [] }))
                : Promise.resolve({ entries: [], problems: [], duplicates: 0 })
              return saveMedia.then(function (uploaded) {
                problems.push.apply(problems, uploaded.problems.map(function (message) { return group.title + ': ' + message }))
                docsAdded += uploaded.entries.length
                docsSkipped += uploaded.duplicates
                return window.KoiArrival.resolveLineImages(group, pkg).then(function (extra) {
                  problems.push.apply(problems, extra)
                  return request('POST', '/api/farm-reports', window.KoiArrival.payloadFor(group, { media_entries: uploaded.entries, show_in_gallery: galleryFrom('', uploaded.entries.length > 0) }))
                }).then(function () { created.ikan_datang += 1 }, function (error) { problems.push(group.title + ': ' + (error.message || 'gagal disimpan')) })
              })
            })
          })
        }, Promise.resolve())
      })
    }

    // ---- save the queue (Data Ulang, Panen, Kegiatan) ----
    return chain.then(function () {
      return queue.reduce(function (inner, item) {
        return inner.then(function () {
          return (pkg ? pkg.docsForRow(item.docsCell, item.code) : Promise.resolve({ docs: null, problems: [] })).then(function (found) {
            problems.push.apply(problems, (found.problems || []).map(function (message) { return item.label + ': ' + message }))
            var docs = found.docs
            if (docs && docs.length) docsPlanned += docs.length
            if (dryRun) { created[item.type] += 1; return }
            var saveMedia = docs && docs.length
              ? (progress && progress.set(item.label + ': ' + docs.length + ' dokumentasi'), window.KoiZip.uploadEntries(docs, { imagePrefix: 'report-image', videoPrefix: 'report-video', existingUrls: [] }))
              : Promise.resolve({ entries: [], problems: [], duplicates: 0 })
            return saveMedia.then(function (uploaded) {
              problems.push.apply(problems, uploaded.problems.map(function (message) { return item.label + ': ' + message }))
              docsAdded += uploaded.entries.length
              docsSkipped += uploaded.duplicates
              var payload = Object.assign({}, item.payload, { media_entries: uploaded.entries, show_in_gallery: galleryFrom(item.galleryCell, uploaded.entries.length > 0) })
              return request('POST', '/api/farm-reports', payload).then(function () { created[item.type] += 1 }, function (error) { problems.push(item.label + ': ' + (error.message || 'gagal disimpan')) })
            })
          })
        })
      }, Promise.resolve())
    }).then(function () {
      if (pkg) pkg.unusedKeys().forEach(function (key) { problems.push('Folder dokumentasi "' + key + '" tidak dipakai: tidak ada baris data yang memakainya') })
      return { created: created, docsAdded: docsAdded, docsSkipped: docsSkipped, docsPlanned: docsPlanned, problems: problems }
    })
  }

  function total(created) { return created.data_ulang + created.panen + created.kegiatan + created.ikan_datang }
  function breakdown(created) {
    return TYPE_SHEETS.filter(function (pair) { return created[pair[0]] }).map(function (pair) { return pair[1] + ' baru: ' + created[pair[0]] }).join('\n')
  }

  function importFile(file) {
    if (!window.XLSX || !window.KoiZip) { showResult('Impor Excel Laporan', 'Pustaka Excel atau ZIP belum termuat. Muat ulang halaman.'); return Promise.resolve() }
    var progress = window.KoiZip.progress('Memeriksa file Laporan')
    var pkg = null
    var packageProblems = []
    var sheets = null
    var lookups = null
    var source = /\.zip$/i.test(file.name)
      ? window.KoiZip.readPackage(file).then(function (opened) { pkg = opened; packageProblems = opened.problems.slice(); return opened.xlsxFile })
      : window.KoiZip.plainPackage().then(function (plain) { pkg = plain; return file })
    return source.then(readWorkbook).then(function (read) {
      sheets = read
      return loadLookups()
    }).then(function (loaded) {
      lookups = loaded
      var any = ['data_ulang', 'panen', 'kegiatan', 'ikan_datang', 'legacy'].some(function (key) { return sheets[key] && sheets[key].length })
      if (!any) { progress.close(); progress = null; showResult('Impor Excel Laporan', 'File tidak berisi data. Sheet yang dikenali: Data Ulang, Panen, Kegiatan, Ikan Datang, Lokasi, Sortir, Kondisi.'); return null }
      return runImport(sheets, pkg, true, progress, lookups).then(function (plan) {
        progress.close()
        progress = null
        var planProblems = packageProblems.concat(plan.problems)
        if (!total(plan.created)) { showResult('Impor Excel Laporan', 'Tidak ada laporan yang bisa diimport.', planProblems); return null }
        var summary = breakdown(plan.created) + (pkg.isZip || plan.docsPlanned ? '\nDokumentasi: ' + plan.docsPlanned + ' file (masuk Galeri kecuali kolom Galeri = Tidak)' : '') +
          (planProblems.length ? '\nBaris atau file bermasalah dilewati.' : '')
        return showResult('Pratinjau import Laporan', summary, planProblems, { confirm: true, okLabel: planProblems.length ? 'Lanjutkan (lewati yang bermasalah)' : 'Lanjutkan' }).then(function (go) {
          if (!go) return null
          progress = window.KoiZip.progress('Impor Laporan')
          return loadLookups().then(function (fresh) { return runImport(sheets, pkg, false, progress, fresh) }).then(function (result) {
            var allProblems = packageProblems.concat(result.problems)
            showResult('Impor Excel Laporan', 'Laporan baru ' + total(result.created) + ' (' + breakdown(result.created).replace(/\n/g, ', ') + '), bermasalah ' + allProblems.length + '.' +
              (pkg.isZip || result.docsPlanned ? ' Dokumentasi ditambahkan ' + result.docsAdded + ', sudah ada ' + result.docsSkipped + '.' : ''), allProblems)
            window.dispatchEvent(new Event('focus'))
          })
        })
      })
    }).catch(function (error) { showResult('Impor Excel Laporan', error.message || 'File tidak dapat dibaca.') }).then(function () { if (progress) progress.close() })
  }

  // the "Impor" file input of the page: this import reads the file first, the page's older one never sees it
  document.addEventListener('change', function (event) {
    var input = event.target
    if (!input || input.type !== 'file' || input.accept !== '.xlsx,.xls,.zip' || input.hasAttribute('data-macro-file')) return
    event.stopImmediatePropagation()
    var file = input.files && input.files[0]
    input.value = ''
    if (file) importFile(file)
  }, true)

  // ---- the dock: export and zip are replaced ----------------------------------------------------------------------------------------------
  if (window.KoiDock && window.KoiDock.create) {
    var originalCreate = window.KoiDock.create
    window.KoiDock.create = function (options) {
      options = options || {}
      if (options.label === 'laporan') {
        pageOptions = options
        options.actions = (options.actions || []).map(function (action) {
          if (action.key === 'export') return Object.assign({}, action, { onClick: function (ids) { return exportExcel(ids || []) } })
          if (action.key === 'zip') return Object.assign({}, action, { onClick: function (ids) { return exportZip(ids || []) } })
          return action
        })
      }
      return originalCreate.call(this, options)
    }
  }
})()
