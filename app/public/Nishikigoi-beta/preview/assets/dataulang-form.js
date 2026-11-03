// Laporan Data Ulang: the form gets a table "Ikan Satuan" (one row per fish, for the photo session) and the check box "Ambil ukuran dari tabel Ikan Satuan"
// in the size spectrum. The sections "Lokasi dan Hasil" and "Kondisi / Reject" belong to Panen: a Data Ulang form shows them only when an older
// report has data in them. The fish are kept in the report's activity_data ({ fish: [...], spectrum_from_fish }), so the database does not change.
// The page's own form code is not touched: this file adds the table to the form, reads the saved report out of the list the page loads, and adds
// activity_data to the save request of a Data Ulang report.
;(function () {
  'use strict'
  if (!/farm-reports/.test(location.pathname)) return

  var SEX = [['unknown', 'Unknown'], ['male', 'Male'], ['female', 'Female']]
  var reportsByCode = {}
  var reportsById = {}
  var currentId = null
  var breedings = []
  var ready = false
  var section = null
  var listBox = null
  var specCheck = null
  var specInput = null
  var form = null
  var modal = null
  var codeInput = null
  var lastKey = null
  var wasShown = false
  var codeTyped = false

  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] }) }
  function parse(value, fallback) {
    if (value && typeof value === 'object') return value
    try { var parsed = JSON.parse(value || ''); return parsed == null ? fallback : parsed } catch (error) { return fallback }
  }
  function currentType() { var radio = form && form.querySelector('input[name="report_type"]:checked'); return radio ? radio.value : '' }
  // a click on a small photo shows it large (click again, or Esc, to close)
  window.KoiZoomImage = function (url, title) {
    if (!url) return
    var layer = document.createElement('div')
    layer.style.cssText = 'position:fixed;inset:0;z-index:2100;background:rgba(0,0,0,.88);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.6rem;cursor:zoom-out;padding:1rem'
    layer.innerHTML = '<img alt="" style="max-width:94vw;max-height:84vh;object-fit:contain;border-radius:6px"><div style="color:#fff;font-size:.9rem">' + esc(title || '') + '</div>'
    layer.querySelector('img').src = url
    function close() { layer.remove(); document.removeEventListener('keydown', onKey, true) }
    function onKey(event) { if (event.key === 'Escape') { event.stopPropagation(); close() } }
    layer.addEventListener('click', close)
    document.addEventListener('keydown', onKey, true)
    document.body.appendChild(layer)
  }
  function hide(element, flag) { var wanted = flag ? 'none' : ''; if (element.style.display !== wanted) element.style.display = wanted }
  function setDisabled(field, value) { if (field.disabled !== value) field.disabled = value }
  function setKind(heading, value) { if ((heading.dataset.koiKind || '') !== value) heading.dataset.koiKind = value }
  function isReadonly() { var title = modal && modal.querySelector('[data-report-modal-title]'); return Boolean(title && (title.dataset.koiKind === 'detail' || /Detail/i.test(title.textContent))) }

  // ---- what the page loads and saves -----------------------------------------------------------------------------------------------
  var pendingDraft = null
  var draftCode = ''
  var originalFetch = window.fetch
  function pathOf(url) { try { return new URL(url, location.origin).pathname } catch (error) { return String(url || '') } }
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || ''
    var method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase()
    var path = pathOf(url)
    if ((method === 'POST' || method === 'PUT') && /\/api\/farm-reports(\/\d+)?$/.test(path) && init && typeof init.body === 'string' && ready && modal.classList.contains('show') && currentType() === 'data_ulang') {
      try {
        var body = JSON.parse(init.body)
        if (body.report_type === 'data_ulang') {
          body.activity_data = { fish: collect(), spectrum_from_fish: Boolean(specCheck && specCheck.checked) }
          init = Object.assign({}, init, { body: JSON.stringify(body) })
        }
      } catch (error) { /* the report is saved without the table */ }
    }
    // "Simpan Draft": the table goes into the draft as well
    if (method === 'POST' && /\/api\/drafts\/?$/.test(path) && init && typeof init.body === 'string' && ready && modal.classList.contains('show') && currentType() === 'data_ulang') {
      try {
        var draftBody = JSON.parse(init.body)
        if (draftBody.type === 'report' && draftBody.data) {
          draftBody.data.activity_data = JSON.stringify({ fish: collect(), spectrum_from_fish: Boolean(specCheck && specCheck.checked) })
          init = Object.assign({}, init, { body: JSON.stringify(draftBody) })
        }
      } catch (error) { /* the draft is saved without the table */ }
    }
    var promise = originalFetch.call(this, input, init)
    // a draft that is opened (from the draft list or from Antrean): its table is filled in once the form has been filled
    if (method === 'GET' && /\/api\/drafts\/[^/]+$/.test(path)) {
      return promise.then(function (response) {
        return response.clone().json().then(function (draft) {
          // a Kode Batch typed by hand is kept; the page puts the next free code there again after loading a draft
          draftCode = draft && draft.type === 'report' && draft.data && draft.data.batch_code && !/^(DTU|PAN|ACT|NEW)-\d\d-\d\d-\d\d$/.test(draft.data.batch_code) ? String(draft.data.batch_code) : ''
          if (draft && draft.type === 'report' && draft.data && draft.data.report_type === 'data_ulang') pendingDraft = { activity_data: draft.data.activity_data }
        }).catch(function () {}).then(function () { return response })
      })
    }
    if (method === 'GET' && /\/api\/farm-reports\/?$/.test(path)) {
      promise.then(function (response) {
        return response.clone().json().then(function (list) {
          if (!Array.isArray(list)) return
          reportsByCode = {}
          reportsById = {}
          list.forEach(function (item) { reportsById[String(item.id)] = item; if (item.batch_code) reportsByCode[String(item.batch_code)] = item })
          warmAllParents()
        })
      }).catch(function () {})
    }
    return promise
  }

  // which report the form was opened for: the row that was clicked (view, edit, print); "Tambah Laporan" means a new one
  document.addEventListener('click', function (event) {
    if (event.target.closest('[data-report-open]')) { currentId = null; draftCode = ''; return }
    var row = event.target.closest('[data-report-id],[data-dock-id]')
    if (row) { currentId = row.getAttribute('data-report-id') || row.getAttribute('data-dock-id'); draftCode = ''; setTimeout(function () { warmParents(reportsById[currentId]) }, 50) }
  }, true)

  // ---- the table -----------------------------------------------------------------------------------------------------------------------
  function breedingOptions(selected) {
    return '<option value="">- tanpa sesi -</option>' + breedings.map(function (item) {
      return '<option value="' + esc(item.id) + '"' + (String(item.id) === String(selected || '') ? ' selected' : '') + '>' + esc((item.batch_code || '') + (item.session_name ? ' - ' + item.session_name : '')) + '</option>'
    }).join('')
  }
  function maleOptions(breedingId, selected) {
    var item = breedings.filter(function (b) { return String(b.id) === String(breedingId || '') })[0]
    var males = item ? parse(item.male_parent_entries, []) : []
    return '<option value="">- male -</option>' + (Array.isArray(males) ? males : []).map(function (male) {
      return '<option value="' + esc(male.koi_id) + '"' + (String(male.koi_id) === String(selected || '') ? ' selected' : '') + '>' + esc(male.label || male.code || male.koi_id) + '</option>'
    }).join('')
  }
  // the photo of the female of the chosen session and of the chosen male, next to their boxes
  var photoCache = {}
  function thumbOf(url) {
    var match = /^\/api\/uploads\/(.+)$/.exec(String(url || ''))
    return match ? '/api/thumb/240/' + match[1] : String(url || '')
  }
  function photoOf(id) {
    id = String(id || '')
    if (!id) return Promise.resolve(null)
    if (photoCache[id] !== undefined) return Promise.resolve(photoCache[id])
    if (!window.KoiPicker || !window.KoiPicker.byIds) return Promise.resolve(null)
    return window.KoiPicker.byIds([id], { scope: 'all' }).then(function (rows) {
      var fish = rows && rows[0]
      photoCache[id] = fish ? { url: fish.image_url || fish.photo_url || '', code: fish.code || '' } : null
      return photoCache[id]
    }).catch(function () { return null })
  }
  function showPhoto(image, photo) {
    if (!photo || !photo.url) { image.style.display = 'none'; image.removeAttribute('src'); return }
    image.src = thumbOf(photo.url)
    image.dataset.full = photo.url
    image.title = photo.code
    image.style.cssText = 'display:block;flex:0 0 auto;width:1.9rem;height:2.9rem;object-fit:cover;border-radius:4px;border:1px solid var(--tblr-border-color,#ccc);cursor:zoom-in'
  }
  function updatePreview(row) {
    var item = breedings.filter(function (b) { return String(b.id) === String(row.dataset.b || '') })[0]
    var female = item ? parse(item.female_parent_entries, []) : []
    var femaleId = Array.isArray(female) && female[0] ? female[0].koi_id : ''
    photoOf(femaleId).then(function (photo) { showPhoto(row.querySelector('[data-prev="female"]'), photo) })
    photoOf(row.dataset.m).then(function (photo) { showPhoto(row.querySelector('[data-prev="male"]'), photo) })
  }
  // the photo of the fish itself: uploaded from the gallery, or taken with the camera (see media-capture.js), shrunk and kept like the other report photos
  function showOwnPhoto(row) {
    var image = row.querySelector('[data-f-photo]')
    var pick = row.querySelector('[data-f-photo-pick]')
    var url = row.dataset.photo || ''
    if (!image) return
    if (url) {
      image.src = thumbOf(url)
      image.dataset.full = url
      image.style.cssText = 'display:block;flex:0 0 auto;width:1.9rem;height:2.9rem;object-fit:cover;border-radius:4px;border:1px solid var(--tblr-border-color,#ccc);cursor:zoom-in'
    } else { image.style.display = 'none'; image.removeAttribute('src') }
    pick.textContent = url ? 'Ganti' : 'Foto'
  }
  function uploadOwnPhoto(row, file) {
    var kit = window.KoiReportKit
    var pick = row.querySelector('[data-f-photo-pick]')
    if (!kit || !file) return
    pick.disabled = true
    pick.textContent = '...'
    kit.compressImage(file).then(function (dataUrl) {
      return kit.request('/images', { method: 'POST', body: JSON.stringify({ prefix: 'report-image', image_data: dataUrl }) })
    }).then(function (data) { row.dataset.photo = data.image_url || '' }).catch(function (error) { window.alert(error.message || 'Foto gagal diunggah.') }).then(function () {
      pick.disabled = false
      showOwnPhoto(row)
    })
  }
  function renumber() {
    Array.prototype.forEach.call(listBox.children, function (row, index) { row.querySelector('[data-f="no"]').textContent = String(index + 1) })
  }
  function addRow(entry) {
    entry = entry || {}
    var row = document.createElement('div')
    row.dataset.b = entry.breeding_id || ''
    row.dataset.m = entry.male_id || ''
    row.dataset.photo = entry.foto || ''
    row.className = 'border-bottom py-1'
    row.setAttribute('data-fish-row', '')
    row.style.cssText = 'display:grid;grid-template-columns:2.2rem 6.2rem minmax(7rem,1.1fr) 5.5rem 7.5rem minmax(12rem,1.9fr) minmax(9.5rem,1.3fr) minmax(7rem,1.2fr) 4.6rem;gap:.4rem;align-items:center;min-width:66rem'
    row.innerHTML =
      '<div class="fw-semibold text-secondary text-center" data-f="no"></div>' +
      '<div class="d-flex align-items-center gap-1"><img data-f-photo alt="" style="display:none"><button type="button" class="btn btn-sm btn-outline-primary" data-f-photo-pick title="Unggah foto atau ambil dengan kamera">Foto</button><input type="file" accept="image/*" hidden data-f-photo-input></div>' +
      '<input class="form-control form-control-sm" data-no-clear data-f="jenis" list="arrival-varieties" placeholder="Contoh Showa" value="' + esc(entry.jenis) + '">' +
      '<input class="form-control form-control-sm" data-no-clear type="number" min="0" step="0.1" data-f="ukuran" placeholder="cm" value="' + esc(entry.ukuran) + '">' +
      '<select class="form-select form-select-sm" data-f="sex">' + SEX.map(function (s) { return '<option value="' + s[0] + '"' + (s[0] === (entry.sex || 'unknown') ? ' selected' : '') + '>' + s[1] + '</option>' }).join('') + '</select>' +
      '<div class="d-flex align-items-center gap-1" style="min-width:0"><select class="form-select form-select-sm" data-f="breeding">' + breedingOptions(entry.breeding_id) + '</select><img data-prev="female" alt="" style="display:none"></div>' +
      '<div class="d-flex align-items-center gap-1" style="min-width:0"><select class="form-select form-select-sm" data-f="male">' + maleOptions(entry.breeding_id, entry.male_id) + '</select><img data-prev="male" alt="" style="display:none"></div>' +
      '<input class="form-control form-control-sm" data-no-clear data-f="catatan" placeholder="Catatan" value="' + esc(entry.catatan) + '">' +
      '<button type="button" class="btn btn-sm btn-outline-danger" data-f-remove>Hapus</button>'
    listBox.appendChild(row)
    renumber()
    applyReadonly()
    updatePreview(row)
    showOwnPhoto(row)
  }
  // the sessions arrive after the form was filled in: show each row's saved choice again
  function refreshChoices() {
    if (!listBox) return
    Array.prototype.forEach.call(listBox.children, function (row) {
      row.querySelector('[data-f="breeding"]').innerHTML = breedingOptions(row.dataset.b)
      row.querySelector('[data-f="male"]').innerHTML = maleOptions(row.dataset.b, row.dataset.m)
      updatePreview(row)
    })
  }
  function loadBreedings() {
    return originalFetch.call(window, '/api/breeding').then(function (response) { return response.ok ? response.json() : [] }).then(function (list) { breedings = Array.isArray(list) ? list : []; warmAllParents(); refreshChoices() }).catch(function () {})
  }
  function collect() {
    if (!listBox) return []
    return Array.prototype.map.call(listBox.children, function (row) {
      var get = function (name) { return row.querySelector('[data-f="' + name + '"]') }
      var breeding = get('breeding')
      var male = get('male')
      var breedingOption = breeding.options[breeding.selectedIndex]
      var maleOption = male.options[male.selectedIndex]
      return {
        foto: row.dataset.photo || '',
        jenis: get('jenis').value.trim(), ukuran: get('ukuran').value, sex: get('sex').value,
        breeding_id: breeding.value, breeding_label: breeding.value ? breedingOption.textContent : '',
        male_id: male.value, male_label: male.value ? maleOption.textContent : '',
        catatan: get('catatan').value.trim(),
      }
    }).filter(function (fish) { return fish.jenis || fish.ukuran !== '' || fish.breeding_id || fish.male_id || fish.catatan || fish.foto })
  }
  function load(report) {
    listBox.innerHTML = ''
    var data = report ? parse(report.activity_data, {}) || {} : {}
    ;(Array.isArray(data.fish) ? data.fish : []).forEach(addRow)
    specCheck.checked = Boolean(data.spectrum_from_fish)
    syncSpectrum()
    applyReadonly()
  }
  function syncSpectrum() {
    if (!specInput) return
    if (!specCheck.checked) { specInput.readOnly = false; return }
    var sizes = collect().map(function (fish) { return fish.ukuran }).filter(function (value) { return value !== '' && Number.isFinite(Number(value)) })
    specInput.value = sizes.join(', ')
    specInput.readOnly = true
    specInput.dispatchEvent(new Event('input', { bubbles: true }))
  }
  function applyReadonly() {
    if (!section) return
    var locked = isReadonly()
    section.querySelectorAll('input,select,button').forEach(function (field) { setDisabled(field, locked) })
    setDisabled(specCheck, locked)
  }

  // the photos of the female and the chosen males of the sessions of a Panen: fetched when the report is opened, so the print (which must open its window at once) has them
  function parentIds(report) {
    var ids = []
    parse(report && report.pond_entries, []).forEach(function (place) {
      var item = breedings.filter(function (b) { return String(b.id) === String(place.breeding_id || '') })[0]
      var females = item ? parse(item.female_parent_entries, []) : []
      if (Array.isArray(females) && females[0] && females[0].koi_id) ids.push(String(females[0].koi_id))
      ;(Array.isArray(place.males) ? place.males : []).forEach(function (male) { if (male && male.koi_id) ids.push(String(male.koi_id)) })
    })
    return ids
  }
  // all Panen reports at once (one request), so a print started from a card has the photos at hand
  function warmAllParents() {
    if (!breedings.length || !window.KoiPicker || !window.KoiPicker.byIds) return
    var ids = []
    Object.keys(reportsById).forEach(function (key) { if (reportsById[key].report_type === 'panen') parentIds(reportsById[key]).forEach(function (id) { if (photoCache[id] === undefined && ids.indexOf(id) < 0) ids.push(id) }) })
    if (!ids.length) return
    window.KoiPicker.byIds(ids, { scope: 'all' }).then(function (rows) {
      ;(rows || []).forEach(function (fish) { photoCache[String(fish.id)] = fish && fish.image_url ? { url: fish.image_url, code: fish.code || '' } : null })
      ids.forEach(function (id) { if (photoCache[id] === undefined) photoCache[id] = null })
    }).catch(function () {})
  }
  function warmParents(report) {
    if (!report || report.report_type !== 'panen') return
    parentIds(report).forEach(function (id) { photoOf(id) })
  }
  function parentFigure(role, id, label) {
    var photo = id && photoCache[id] ? photoCache[id] : null
    var shown = label || (photo && photo.code) || ''
    if (!photo && !shown) return ''
    var split = String(shown).split(' - ')
    var code = split.shift()
    var name = split.join(' - ')
    return '<div style="display:inline-block;text-align:center;margin:3px 6px 0 0;vertical-align:top;width:64px">' +
      (photo ? '<img src="' + esc(thumbOf(photo.url)) + '" alt="" style="width:34px;height:51px;object-fit:cover;border:1px solid #bbb">' : '<div style="width:34px;height:51px;border:1px solid #bbb;margin:0 auto"></div>') +
      '<div style="font-size:8px;line-height:1.2;overflow-wrap:anywhere"><b>' + role + '</b><br>' + esc(code) + (name ? '<br>' + esc(name) : '') + '</div></div>'
  }
  function parentsHtml(place) {
    var item = breedings.filter(function (b) { return String(b.id) === String(place.breeding_id || '') })[0]
    var females = item ? parse(item.female_parent_entries, []) : []
    var female = Array.isArray(females) && females[0] ? females[0] : null
    var html = ''
    if (female && female.koi_id) html += parentFigure('Female', String(female.koi_id), female.label || female.code)
    ;(Array.isArray(place.males) ? place.males : []).forEach(function (male) { if (male && male.koi_id) html += parentFigure('Male', String(male.koi_id), male.label) })
    return html ? '<div>' + html + '</div>' : ''
  }

  // ---- print: the Ikan Satuan table of a Data Ulang and the per-place details of a Panen are added to the program's print ---------------------------------------
  function printExtra(report) {
    var data = parse(report.activity_data, {}) || {}
    var html = ''
    var cell = function (value) { return esc(value == null || value === '' ? '-' : value) }
    if (report.report_type === 'data_ulang' && Array.isArray(data.fish) && data.fish.length) {
      // a column of Sex, Sesi Breeding or Male is printed only when at least one fish filled it in; Sex is written in words
      var sexWord = function (value) { return value === 'male' ? 'Male' : value === 'female' ? 'Female' : '' }
      var withSex = data.fish.some(function (fish) { return sexWord(fish.sex) })
      var withSession = data.fish.some(function (fish) { return fish.breeding_label })
      var withMale = data.fish.some(function (fish) { return fish.male_label })
      html += '<section class="kp-section"><h2>Ikan Satuan</h2><table class="kp-table"><thead><tr><th class="kp-center" style="width:28px">No</th><th class="kp-center" style="width:44px">Foto</th><th>Jenis</th><th class="kp-num">Ukuran (cm)</th>' +
        (withSex ? '<th>Sex</th>' : '') + (withSession ? '<th>Sesi Breeding</th>' : '') + (withMale ? '<th>Male</th>' : '') + '<th>Catatan</th></tr></thead><tbody>' +
        data.fish.map(function (fish, index) {
          var photo = fish.foto ? '<img src="' + esc(thumbOf(fish.foto)) + '" alt="" style="width:26px;height:39px;object-fit:cover;border:1px solid #bbb">' : '-'
          return '<tr><td class="kp-center">' + (index + 1) + '</td><td class="kp-center">' + photo + '</td><td>' + cell(fish.jenis) + '</td><td class="kp-num">' + cell(fish.ukuran) + '</td>' +
            (withSex ? '<td>' + cell(sexWord(fish.sex)) + '</td>' : '') + (withSession ? '<td>' + cell(fish.breeding_label) + '</td>' : '') + (withMale ? '<td>' + cell(fish.male_label) + '</td>' : '') + '<td>' + cell(fish.catatan) + '</td></tr>'
        }).join('') + '</tbody></table></section>'
    }
    return html
  }
  // Panen: ONE table "Lokasi dan Hasil" with every place (also a place that only has a result), in place of the program's own, shorter "Lokasi" table.
  // A column of Varietas, Sesi Breeding, Reject, Sortir or Catatan is printed only when at least one place filled it in.
  function panenTable(report) {
    var places = parse(report.pond_entries, [])
    if (!Array.isArray(places) || !places.length) return ''
    var any = function (test) { return places.some(test) }
    var withVariety = any(function (p) { return p.variety })
    var withSession = any(function (p) { return p.breeding_label || (p.males && p.males.length) })
    var withReject = any(function (p) { return p.reject && p.reject.length })
    var withSortir = any(function (p) { return p.sortir && p.sortir.length })
    var withNotes = any(function (p) { return p.notes })
    var cell = function (value) { return esc(value == null || value === '' ? '-' : value) }
    var count = function (value) { var n = Number(value); return Number.isFinite(n) ? n.toLocaleString('id-ID') : String(value) }
    var size = function (value) { return window.KoiPrint && window.KoiPrint.size ? window.KoiPrint.size(value) : value }
    var head = '<th class="kp-center" style="width:28px">No</th><th>Lokasi</th><th class="kp-num" style="width:11%">Hasil</th><th class="kp-num" style="width:12%">Rata-rata</th>' +
      (withVariety ? '<th>Varietas Dominan</th>' : '') + (withSession ? '<th>Sesi Breeding</th>' : '') + (withReject ? '<th>Reject</th>' : '') + (withSortir ? '<th>Sortir</th>' : '') + (withNotes ? '<th>Catatan</th>' : '')
    var rows = places.map(function (place, index) {
      var reject = (place.reject || []).map(function (r) { return esc(r.metric || '-') + ' (' + esc(count(r.qty || 0)) + ')' }).join('<br>') || '-'
      var sortir = (place.sortir || []).map(function (r) {
        return esc(r.category || '-') + (r.destination ? ' &rarr; ' + esc(r.destination) : '') + ' (' + esc(count(r.qty || 0)) + ')' + (r.description ? ' - ' + esc(r.description) : '')
      }).join('<br>') || '-'
      return '<tr><td class="kp-center">' + (index + 1) + '</td><td><strong>' + cell([place.pond_label || place.pond_name, place.location].filter(Boolean).join(' -> ')) + '</strong></td>' +
        '<td class="kp-num">' + (place.result_qty ? esc(count(place.result_qty)) + ' ekor' : '-') + '</td><td class="kp-num">' + (place.average_length_cm ? esc(size(place.average_length_cm)) + ' cm' : '-') + '</td>' +
        (withVariety ? '<td>' + cell(place.variety) + '</td>' : '') +
        (withSession ? '<td>' + cell(place.breeding_label) + parentsHtml(place) + '</td>' : '') +
        (withReject ? '<td>' + reject + '</td>' : '') + (withSortir ? '<td>' + sortir + '</td>' : '') + (withNotes ? '<td>' + cell(place.notes) + '</td>' : '') + '</tr>'
    }).join('')
    return '<section class="kp-section"><h2>Lokasi dan Hasil</h2><table class="kp-table"><thead><tr>' + head + '</tr></thead><tbody>' + rows + '</tbody></table></section>'
  }
  ;(function wrapPrint() {
    if (!window.KoiPrint || !window.KoiPrint.print) { setTimeout(wrapPrint, 400); return }
    if (window.KoiPrint.__koiReportExtra) return
    var original = window.KoiPrint.print
    window.KoiPrint.print = function (options) {
      try {
        var report = options && options.key === 'report-detail' && currentId ? reportsById[currentId] : null
        var extra = report ? printExtra(report) : ''
        var body = String(options.body || '')
        var places = report && report.report_type === 'panen' ? panenTable(report) : ''
        if (places) {
          var own = /<section class="kp-section"><h2>Lokasi<\/h2>[\s\S]*?<\/section>/
          body = own.test(body) ? body.replace(own, function () { return places }) : body + places
        }
        if (extra || places) options = Object.assign({}, options, { body: body + extra })
      } catch (error) { /* the plain print */ }
      return original.call(this, options)
    }
    window.KoiPrint.__koiReportExtra = true
  })()

  // ---- build and keep in step ------------------------------------------------------------------------------------------------------
  function build() {
    modal = document.querySelector('[data-report-modal]')
    form = document.querySelector('[data-report-form]')
    if (!modal || !form || section) return
    var pondList = form.querySelector('[data-pond-entry-list]')
    var spectrum = form.querySelector('[data-spectrum-input]')
    if (!pondList || !spectrum) return
    codeInput = form.querySelector('[data-batch-code]')
    if (codeInput) {
      // Kode Batch can be typed; left empty the program makes it itself
      codeInput.removeAttribute('readonly')
      codeInput.setAttribute('placeholder', 'Otomatis')
      codeInput.setAttribute('title', 'Boleh diisi sendiri. Kosongkan supaya kode dibuat otomatis.')
      codeInput.setAttribute('autocomplete', 'off')
      codeInput.addEventListener('input', function (event) { if (event.isTrusted) codeTyped = true })
    }
    // Varietas Dominan has its own list (pick several varieties, click again to remove): the second list of "Pernah dipakai" that opened first
    // on this box is switched off, and the own list opens as soon as the box is focused
    var variety = form.querySelector('[data-dominant-variety-search]')
    if (variety) {
      variety.setAttribute('data-no-suggest', '')
      variety.addEventListener('focus', function () { variety.dispatchEvent(new Event('input', { bubbles: true })) })
    }
    var pondSection = pondList.closest('.report-form-section')
    // every box of the table has the same height and the same letters (a select of the theme is taller than a text box)
    var look = document.createElement('style')
    look.textContent = '[data-fish-section] [data-fish-row] .form-control,[data-fish-section] [data-fish-row] .form-select{height:2.1rem;min-height:2.1rem;font-size:.85rem;line-height:1.3;padding:.25rem .55rem;box-sizing:border-box}' +
      '[data-fish-section] [data-fish-row] .form-select{padding-right:1.8rem;background-position:right .5rem center;background-size:12px}' +
      '[data-fish-section] [data-fish-row] .btn{height:2.1rem;padding:0 .5rem;font-size:.8rem}' +
      '[data-fish-section] [data-fish-row] .koi-native-select-button{height:2.1rem;min-height:2.1rem;font-size:.85rem;line-height:1.3;padding:.25rem 1.8rem .25rem .55rem;box-sizing:border-box}' +
      '[data-fish-section] [data-fish-row] .koi-native-select{display:block;min-width:0;flex:1 1 auto}'
    document.head.appendChild(look)
    section = document.createElement('div')
    section.className = 'report-form-section'
    section.setAttribute('data-fish-section', '')
    hide(section, true)
    section.innerHTML = '<div class="d-flex align-items-center justify-content-between gap-2 mb-2"><h4 class="mb-0">Ikan Satuan</h4><button class="btn btn-sm" type="button" data-fish-add>Tambah Ikan</button></div>' +
      '<div class="form-hint mb-2">Opsional, untuk sesi foto. Satu baris = satu ekor: jenis, ukuran, sex, sesi breeding (dan male-nya), serta catatan. Boleh dikosongkan.</div>' +
      '<div style="overflow-x:auto"><div class="fw-semibold small text-secondary border-bottom pb-1" style="display:grid;grid-template-columns:2.2rem 6.2rem minmax(7rem,1.1fr) 5.5rem 7.5rem minmax(12rem,1.9fr) minmax(9.5rem,1.3fr) minmax(7rem,1.2fr) 4.6rem;gap:.4rem;min-width:66rem"><div class="text-center">No</div><div>Foto</div><div>Jenis</div><div>Ukuran (cm)</div><div>Sex</div><div>Sesi Breeding</div><div>Male</div><div>Catatan</div><div></div></div>' +
      '<div data-fish-list></div></div>'
    pondSection.parentNode.insertBefore(section, pondSection)
    listBox = section.querySelector('[data-fish-list]')
    specInput = spectrum
    var label = document.createElement('label')
    label.className = 'form-check mb-2'
    label.innerHTML = '<input class="form-check-input" type="checkbox" data-spectrum-from-fish><span class="form-check-label">Ambil ukuran dari tabel Ikan Satuan (kalau tidak dicentang, ukuran diisi manual)</span>'
    spectrum.parentNode.insertBefore(label, spectrum)
    specCheck = label.querySelector('input')
    hide(specCheck.closest('label'), true)

    section.addEventListener('click', function (event) {
      var zoom = event.target.closest('img[data-prev],img[data-f-photo]')
      if (zoom && zoom.dataset.full) { window.KoiZoomImage(zoom.dataset.full, zoom.title || ''); return }
      var pickButton = event.target.closest('[data-f-photo-pick]')
      if (pickButton) { pickButton.closest('[data-fish-row]').querySelector('[data-f-photo-input]').click(); return }
      if (event.target.closest('[data-fish-add]')) { addRow(); return }
      var remove = event.target.closest('[data-f-remove]')
      if (remove) { remove.closest('[data-fish-row]').remove(); renumber(); syncSpectrum() }
    })
    section.addEventListener('change', function (event) {
      var changedRow = event.target.closest('[data-fish-row]')
      if (event.target.matches('[data-f="breeding"]')) {
        changedRow.dataset.b = event.target.value
        changedRow.dataset.m = ''
        changedRow.querySelector('[data-f="male"]').innerHTML = maleOptions(event.target.value, '')
      }
      if (event.target.matches('[data-f="male"]')) changedRow.dataset.m = event.target.value
      if (event.target.matches('[data-f="breeding"],[data-f="male"]')) updatePreview(changedRow)
      syncSpectrum()
    })
    section.addEventListener('change', function (event) {
      if (event.target.matches('[data-f-photo-input]')) {
        var photoFile = event.target.files && event.target.files[0]
        event.target.value = ''
        uploadOwnPhoto(event.target.closest('[data-fish-row]'), photoFile)
      }
    })
    section.addEventListener('input', function (event) { if (event.target.matches('[data-f="ukuran"]')) syncSpectrum() })
    specCheck.addEventListener('change', syncSpectrum)
    ready = true
    loadBreedings()
  }

  function tick() {
    if (!ready) { build(); if (!ready) return }
    var shown = modal.classList.contains('show')
    if (shown && !wasShown) {
      lastKey = null
      codeTyped = false
      loadBreedings()
    }
    wasShown = shown
    if (!shown) return
    var titleBox = modal.querySelector('[data-report-modal-title]')
    var existing = currentId && titleBox && !/Tambah/i.test(titleBox.textContent) ? reportsById[currentId] : null
    if (existing && codeInput && existing.batch_code && codeInput.value !== existing.batch_code) codeInput.value = existing.batch_code
    if (!existing && codeInput && draftCode && !codeTyped && codeInput.value !== draftCode && (codeInput.value === '' || /^(DTU|PAN|ACT|NEW)-\d\d-\d\d-\d\d$/.test(codeInput.value))) codeInput.value = draftCode
    // a new report starts with an empty code box (the page puts the next free code there; the server makes the real one when saving)
    if (!existing && codeInput && !codeTyped && codeInput.value && /^(DTU|PAN|ACT|NEW)-\d\d-\d\d-\d\d$/.test(codeInput.value)) codeInput.value = ''
    var isData = currentType() === 'data_ulang'
    var pondList = form.querySelector('[data-pond-entry-list]')
    var conditionList = form.querySelector('[data-condition-entry-list]')
    hide(section, !isData)
    hide(specCheck.closest('label'), !isData)
    if (!isData && specInput.readOnly) specInput.readOnly = false
    // Lokasi dan Hasil / Kondisi belong to Panen; a Data Ulang shows them only when an older report has data there
    var pondSection = pondList.closest('.report-form-section')
    var conditionSection = conditionList.closest('.report-form-section')
    hide(pondSection, isData && !pondList.children.length)
    // the Kondisi / Reject section has ONE owner (this file): it is hidden in a Data Ulang and in a Panen while it is empty (panen-form.js leaves it alone,
    // two files setting it in turn made it blink)
    hide(conditionSection, (isData || currentType() === 'panen') && !conditionList.children.length)
    // the form of an existing report is titled like the others ("Laporan Panen PAN-26-11-01") and does not offer another type
    var typeSection = form.querySelector('input[name="report_type"]').closest('.report-form-section')
    var heading = modal.querySelector('[data-report-modal-title]')
    if (heading) {
      if (!existing) { setKind(heading, ''); hide(typeSection, false) }
      else {
        var shownText = heading.textContent
        if (/^Detail/i.test(shownText)) setKind(heading, 'detail')
        else if (/Edit/i.test(shownText) && !/^Edit Laporan /.test(shownText)) setKind(heading, 'edit')
        var kindLabel = existing.report_type === 'panen' ? 'Panen' : 'Data Ulang'
        var wanted = (heading.dataset.koiKind === 'detail' ? 'Laporan ' : 'Edit Laporan ') + kindLabel + (existing.batch_code ? ' ' + existing.batch_code : '')
        if (heading.dataset.koiKind && shownText !== wanted) heading.textContent = wanted
        hide(typeSection, true)
      }
    }
    // the form of an existing report shows its own Kode Batch (the page fills in the next free code instead)
    var title = modal.querySelector('[data-report-modal-title]')
    var opened = currentId && title && !/Tambah/i.test(title.textContent) ? reportsById[currentId] : null
    if (opened && codeInput && opened.batch_code && codeInput.value !== opened.batch_code) codeInput.value = opened.batch_code
    var key = opened ? 'id:' + opened.id : (codeInput ? codeInput.value : '')
    if (isData && pendingDraft) { var fromDraft = pendingDraft; pendingDraft = null; lastKey = key; load(fromDraft); applyReadonly(); return }
    if (isData && key !== lastKey) {
      lastKey = key
      var found = opened || reportsByCode[key]
      load(found && found.report_type === 'data_ulang' ? found : null)
    }
    applyReadonly()
  }
  setInterval(tick, 350)
})()
