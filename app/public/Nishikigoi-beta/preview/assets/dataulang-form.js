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

  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] }) }
  function parse(value, fallback) {
    if (value && typeof value === 'object') return value
    try { var parsed = JSON.parse(value || ''); return parsed == null ? fallback : parsed } catch (error) { return fallback }
  }
  function currentType() { var radio = form && form.querySelector('input[name="report_type"]:checked'); return radio ? radio.value : '' }
  function hide(element, flag) { element.style.display = flag ? 'none' : '' }
  function isReadonly() { var title = modal && modal.querySelector('[data-report-modal-title]'); return Boolean(title && /Detail/i.test(title.textContent)) }

  // ---- what the page loads and saves -----------------------------------------------------------------------------------------------
  var originalFetch = window.fetch
  function pathOf(url) { try { return new URL(url, location.origin).pathname } catch (error) { return String(url || '') } }
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || ''
    var method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase()
    var path = pathOf(url)
    if ((method === 'POST' || method === 'PUT') && /\/api\/farm-reports(\/\d+)?$/.test(path) && init && typeof init.body === 'string' && ready && currentType() === 'data_ulang') {
      try {
        var body = JSON.parse(init.body)
        if (body.report_type === 'data_ulang') {
          body.activity_data = { fish: collect(), spectrum_from_fish: Boolean(specCheck && specCheck.checked) }
          init = Object.assign({}, init, { body: JSON.stringify(body) })
        }
      } catch (error) { /* the report is saved without the table */ }
    }
    var promise = originalFetch.call(this, input, init)
    if (method === 'GET' && /\/api\/farm-reports\/?$/.test(path)) {
      promise.then(function (response) {
        return response.clone().json().then(function (list) {
          if (!Array.isArray(list)) return
          reportsByCode = {}
          reportsById = {}
          list.forEach(function (item) { reportsById[String(item.id)] = item; if (item.batch_code) reportsByCode[String(item.batch_code)] = item })
        })
      }).catch(function () {})
    }
    return promise
  }

  // which report the form was opened for: the row that was clicked (view, edit, print); "Tambah Laporan" means a new one
  document.addEventListener('click', function (event) {
    if (event.target.closest('[data-report-open]')) { currentId = null; return }
    var row = event.target.closest('[data-report-id]')
    if (row) currentId = row.getAttribute('data-report-id')
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
  function renumber() {
    Array.prototype.forEach.call(listBox.children, function (row, index) { row.querySelector('[data-f="no"]').textContent = String(index + 1) })
  }
  function addRow(entry) {
    entry = entry || {}
    var row = document.createElement('div')
    row.dataset.b = entry.breeding_id || ''
    row.dataset.m = entry.male_id || ''
    row.className = 'border-bottom py-1'
    row.setAttribute('data-fish-row', '')
    row.style.cssText = 'display:grid;grid-template-columns:2.2rem minmax(7rem,1.2fr) 5.5rem 6.5rem minmax(9rem,1.6fr) minmax(7rem,1.2fr) minmax(7rem,1.4fr) 4.6rem;gap:.4rem;align-items:center;min-width:56rem'
    row.innerHTML =
      '<div class="fw-semibold text-secondary text-center" data-f="no"></div>' +
      '<input class="form-control form-control-sm" data-no-clear data-f="jenis" list="arrival-varieties" placeholder="Contoh Showa" value="' + esc(entry.jenis) + '">' +
      '<input class="form-control form-control-sm" data-no-clear type="number" min="0" step="0.1" data-f="ukuran" placeholder="cm" value="' + esc(entry.ukuran) + '">' +
      '<select class="form-select form-select-sm" data-f="sex">' + SEX.map(function (s) { return '<option value="' + s[0] + '"' + (s[0] === (entry.sex || 'unknown') ? ' selected' : '') + '>' + s[1] + '</option>' }).join('') + '</select>' +
      '<select class="form-select form-select-sm" data-f="breeding">' + breedingOptions(entry.breeding_id) + '</select>' +
      '<select class="form-select form-select-sm" data-f="male">' + maleOptions(entry.breeding_id, entry.male_id) + '</select>' +
      '<input class="form-control form-control-sm" data-no-clear data-f="catatan" placeholder="Catatan" value="' + esc(entry.catatan) + '">' +
      '<button type="button" class="btn btn-sm btn-outline-danger" data-f-remove>Hapus</button>'
    listBox.appendChild(row)
    renumber()
    applyReadonly()
  }
  // the sessions arrive after the form was filled in: show each row's saved choice again
  function refreshChoices() {
    if (!listBox) return
    Array.prototype.forEach.call(listBox.children, function (row) {
      row.querySelector('[data-f="breeding"]').innerHTML = breedingOptions(row.dataset.b)
      row.querySelector('[data-f="male"]').innerHTML = maleOptions(row.dataset.b, row.dataset.m)
    })
  }
  function loadBreedings() {
    return originalFetch.call(window, '/api/breeding').then(function (response) { return response.ok ? response.json() : [] }).then(function (list) { breedings = Array.isArray(list) ? list : []; refreshChoices() }).catch(function () {})
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
        jenis: get('jenis').value.trim(), ukuran: get('ukuran').value, sex: get('sex').value,
        breeding_id: breeding.value, breeding_label: breeding.value ? breedingOption.textContent : '',
        male_id: male.value, male_label: male.value ? maleOption.textContent : '',
        catatan: get('catatan').value.trim(),
      }
    }).filter(function (fish) { return fish.jenis || fish.ukuran !== '' || fish.breeding_id || fish.male_id || fish.catatan })
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
    section.querySelectorAll('input,select,button').forEach(function (field) { field.disabled = locked })
    specCheck.disabled = locked
  }

  // ---- build and keep in step ------------------------------------------------------------------------------------------------------
  function build() {
    modal = document.querySelector('[data-report-modal]')
    form = document.querySelector('[data-report-form]')
    if (!modal || !form || section) return
    var pondList = form.querySelector('[data-pond-entry-list]')
    var spectrum = form.querySelector('[data-spectrum-input]')
    if (!pondList || !spectrum) return
    codeInput = form.querySelector('[data-batch-code]')
    var pondSection = pondList.closest('.report-form-section')
    section = document.createElement('div')
    section.className = 'report-form-section'
    section.setAttribute('data-fish-section', '')
    hide(section, true)
    section.innerHTML = '<div class="d-flex align-items-center justify-content-between gap-2 mb-2"><h4 class="mb-0">Ikan Satuan</h4><button class="btn btn-sm" type="button" data-fish-add>Tambah Ikan</button></div>' +
      '<div class="form-hint mb-2">Opsional, untuk sesi foto. Satu baris = satu ekor: jenis, ukuran, sex, sesi breeding (dan male-nya), serta catatan. Boleh dikosongkan.</div>' +
      '<div style="overflow-x:auto"><div class="fw-semibold small text-secondary border-bottom pb-1" style="display:grid;grid-template-columns:2.2rem minmax(7rem,1.2fr) 5.5rem 6.5rem minmax(9rem,1.6fr) minmax(7rem,1.2fr) minmax(7rem,1.4fr) 4.6rem;gap:.4rem;min-width:56rem"><div class="text-center">No</div><div>Jenis</div><div>Ukuran (cm)</div><div>Sex</div><div>Sesi Breeding</div><div>Male</div><div>Catatan</div><div></div></div>' +
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
      syncSpectrum()
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
      loadBreedings()
    }
    wasShown = shown
    if (!shown) return
    var titleBox = modal.querySelector('[data-report-modal-title]')
    var existing = currentId && titleBox && !/Tambah/i.test(titleBox.textContent) ? reportsById[currentId] : null
    if (existing && codeInput && existing.batch_code && codeInput.value !== existing.batch_code) codeInput.value = existing.batch_code
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
    hide(conditionSection, isData && !conditionList.children.length)
    // the form of an existing report shows its own Kode Batch (the page fills in the next free code instead)
    var title = modal.querySelector('[data-report-modal-title]')
    var opened = currentId && title && !/Tambah/i.test(title.textContent) ? reportsById[currentId] : null
    if (opened && codeInput && opened.batch_code && codeInput.value !== opened.batch_code) codeInput.value = opened.batch_code
    var key = opened ? 'id:' + opened.id : (codeInput ? codeInput.value : '')
    if (isData && key !== lastKey) {
      lastKey = key
      var found = opened || reportsByCode[key]
      load(found && found.report_type === 'data_ulang' ? found : null)
    }
    applyReadonly()
  }
  setInterval(tick, 350)
})()
