// Laporan Panen: every row of "Lokasi dan Hasil" is one harvest place and carries its own details: Varietas Dominan, Sesi Breeding (with the
// photo of its female), Reject and Sortir. Two Mudpond harvested on the same day are two rows, each with its own numbers.
// The details are kept inside the row's entry of pond_entries (variety, breeding_id, breeding_label, reject, sortir), so the database does not change.
// The page's own form is not touched: this file adds the extra boxes to every row of the list as it appears, fills them from the saved report, and
// puts the rows (with the extras) into the save request of a Panen report. In a Panen the report-wide Reject, Sortir and Sesi Breeding boxes are
// shown only when an older report has data in them.
;(function () {
  'use strict'
  if (!/farm-reports/.test(location.pathname)) return

  var reportsById = {}
  var currentId = null
  var breedings = []
  var ponds = []
  var form = null
  var modal = null
  var listBox = null
  var ready = false
  var wasShown = false
  var photoCache = {}

  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] }) }
  function parse(value, fallback) {
    if (value && typeof value === 'object') return value
    try { var parsed = JSON.parse(value || ''); return parsed == null ? fallback : parsed } catch (error) { return fallback }
  }
  function hide(element, flag) { if (!element) return; var wanted = flag ? 'none' : ''; if (element.style.display !== wanted) element.style.display = wanted }
  function currentType() { var radio = form && form.querySelector('input[name="report_type"]:checked'); return radio ? radio.value : '' }
  function isReadonly() { var title = modal && modal.querySelector('[data-report-modal-title]'); return Boolean(title && (title.dataset.koiKind === 'detail' || /Detail/i.test(title.textContent))) }

  // ---- what the page loads and saves -------------------------------------------------------------------------------------------------
  var draftEntries = null
  var originalFetch = window.fetch
  function pathOf(url) { try { return new URL(url, location.origin).pathname } catch (error) { return String(url || '') } }
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || ''
    var method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase()
    var path = pathOf(url)
    if ((method === 'POST' || method === 'PUT') && /\/api\/farm-reports(\/\d+)?$/.test(path) && init && typeof init.body === 'string' && ready && modal.classList.contains('show') && currentType() === 'panen') {
      try {
        var body = JSON.parse(init.body)
        if (body.report_type === 'panen') {
          body.pond_entries = collect()
          init = Object.assign({}, init, { body: JSON.stringify(body) })
        }
      } catch (error) { /* the report is saved as the page built it */ }
    }
    // "Simpan Draft": the blocks with their extras go into the draft as well
    if (method === 'POST' && /\/api\/drafts\/?$/.test(path) && init && typeof init.body === 'string' && ready && modal.classList.contains('show') && currentType() === 'panen') {
      try {
        var draftBody = JSON.parse(init.body)
        if (draftBody.type === 'report' && draftBody.data) {
          draftBody.data.pond_entries = JSON.stringify(collect())
          init = Object.assign({}, init, { body: JSON.stringify(draftBody) })
        }
      } catch (error) { /* the draft is saved as the page built it */ }
    }
    var promise = originalFetch.call(this, input, init)
    // a draft that is opened: its blocks are filled in as the rows appear
    if (method === 'GET' && /\/api\/drafts\/[^/]+$/.test(path)) {
      return promise.then(function (response) {
        return response.clone().json().then(function (draft) {
          draftEntries = draft && draft.type === 'report' && draft.data && draft.data.report_type === 'panen' ? parse(draft.data.pond_entries, []) : null
        }).catch(function () { draftEntries = null }).then(function () { return response })
      })
    }
    if (method === 'GET' && /\/api\/farm-reports\/?$/.test(path)) {
      promise.then(function (response) {
        return response.clone().json().then(function (list) {
          if (!Array.isArray(list)) return
          reportsById = {}
          list.forEach(function (item) { reportsById[String(item.id)] = item })
        })
      }).catch(function () {})
    }
    return promise
  }
  document.addEventListener('click', function (event) {
    if (event.target.closest('[data-report-open]')) { currentId = null; draftEntries = null; return }
    var row = event.target.closest('[data-report-id]')
    if (row) { currentId = row.getAttribute('data-report-id'); draftEntries = null }
  }, true)

  // ---- photo of the female of a session --------------------------------------------------------------------------------------------------
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
      photoCache[id] = fish && fish.image_url ? { url: fish.image_url, code: fish.code || '' } : null
      return photoCache[id]
    }).catch(function () { return null })
  }

  // ---- the extras of one row ----------------------------------------------------------------------------------------------------------
  function breedingOptions(selected) {
    return '<option value="">- tanpa sesi -</option>' + breedings.map(function (item) {
      return '<option value="' + esc(item.id) + '"' + (String(item.id) === String(selected || '') ? ' selected' : '') + '>' + esc((item.batch_code || '') + (item.session_name ? ' - ' + item.session_name : '')) + '</option>'
    }).join('')
  }
  function miniRow(kind, entry) {
    entry = entry || {}
    var row = document.createElement('div')
    row.setAttribute('data-mini', kind)
    row.style.cssText = 'display:grid;gap:.4rem;align-items:center;margin-bottom:.35rem;' + (kind === 'reject' ? 'grid-template-columns:minmax(8rem,2fr) 6rem auto' : 'grid-template-columns:minmax(6rem,1.2fr) minmax(7rem,1.4fr) minmax(6rem,1.4fr) 5rem auto')
    row.innerHTML = kind === 'reject'
      ? '<input class="form-control form-control-sm" data-no-clear data-m="metric" placeholder="Contoh: Ikan Reject (Cacat / Kurang Layak)" value="' + esc(entry.metric) + '">' +
        '<input class="form-control form-control-sm" data-no-clear type="number" min="0" step="1" data-m="qty" placeholder="Ekor" value="' + esc(entry.qty) + '">' +
        '<button type="button" class="btn btn-sm btn-outline-danger" data-mini-remove>Hapus</button>'
      : '<input class="form-control form-control-sm" data-no-clear data-m="category" placeholder="Kategori" value="' + esc(entry.category) + '">' +
        '<input class="form-control form-control-sm" data-no-clear data-suggest-key="place" data-m="destination" placeholder="Lokasi tujuan" autocomplete="off" value="' + esc(entry.destination) + '">' +
        '<input class="form-control form-control-sm" data-no-clear data-m="description" placeholder="Keterangan" value="' + esc(entry.description) + '">' +
        '<input class="form-control form-control-sm" data-no-clear type="number" min="0" step="1" data-m="qty" placeholder="Ekor" value="' + esc(entry.qty) + '">' +
        '<button type="button" class="btn btn-sm btn-outline-danger" data-mini-remove>Hapus</button>'
    return row
  }
  function decorate(card, entry) {
    var host = card.querySelector('.card-body .row')
    if (!host || host.querySelector('[data-panen-extra]')) return
    entry = entry || {}
    var extra = document.createElement('div')
    extra.className = 'col-12'
    extra.setAttribute('data-panen-extra', '')
    extra.innerHTML =
      '<div class="row g-2">' +
        '<div class="col-md-6"><label class="form-label">Varietas Dominan</label><input class="form-control" data-no-clear data-x="variety" list="arrival-varieties" placeholder="Contoh: Kohaku, Showa" autocomplete="off" value="' + esc(entry.variety) + '"></div>' +
        '<div class="col-md-6"><label class="form-label">Hubungkan Sesi Breeding</label><div class="d-flex align-items-center gap-1"><select class="form-select" data-x="breeding">' + breedingOptions(entry.breeding_id) + '</select><img data-x-photo alt="" style="display:none"></div></div>' +
        '<div class="col-12"><div class="d-flex align-items-center justify-content-between mb-1"><label class="form-label mb-0">Kondisi / Reject</label><button type="button" class="btn btn-sm" data-mini-add="reject">Tambah Kondisi</button></div><div data-x-list="reject"></div></div>' +
        '<div class="col-12"><div class="d-flex align-items-center justify-content-between mb-1"><label class="form-label mb-0">Sortir Ikan (per Kategori)</label><button type="button" class="btn btn-sm" data-mini-add="sortir">Tambah Sortir</button></div><div data-x-list="sortir"></div></div>' +
      '</div>'
    var notes = host.querySelector('[data-notes]')
    var notesCol = notes ? notes.closest('.col-12') : null
    if (notesCol) host.insertBefore(extra, notesCol); else host.appendChild(extra)
    card.dataset.breeding = entry.breeding_id || ''
    ;(Array.isArray(entry.reject) ? entry.reject : []).forEach(function (item) { extra.querySelector('[data-x-list="reject"]').appendChild(miniRow('reject', item)) })
    ;(Array.isArray(entry.sortir) ? entry.sortir : []).forEach(function (item) { extra.querySelector('[data-x-list="sortir"]').appendChild(miniRow('sortir', item)) })
    paintFemale(card)
    if (isReadonly()) extra.querySelectorAll('input,select,button').forEach(function (field) { field.disabled = true })
  }
  function paintFemale(card) {
    var image = card.querySelector('[data-x-photo]')
    if (!image) return
    var item = breedings.filter(function (b) { return String(b.id) === String(card.dataset.breeding || '') })[0]
    var females = item ? parse(item.female_parent_entries, []) : []
    photoOf(Array.isArray(females) && females[0] ? females[0].koi_id : '').then(function (photo) {
      if (!photo) { image.style.display = 'none'; return }
      image.src = thumbOf(photo.url)
      image.dataset.full = photo.url
      image.title = photo.code
      image.style.cssText = 'display:block;flex:0 0 auto;width:1.9rem;height:2.9rem;object-fit:cover;border-radius:4px;border:1px solid var(--tblr-border-color,#ccc);cursor:zoom-in'
    })
  }

  // the rows as the page's save would build them, plus the extras
  function pondOf(text) {
    var name = String(text || '').trim().toLowerCase()
    return name ? ponds.filter(function (p) { return String(p.name || '').trim().toLowerCase() === name })[0] : null
  }
  function collect() {
    return Array.prototype.map.call(listBox.children, function (card) {
      var get = function (selector) { var el = card.querySelector(selector); return el ? el.value : '' }
      var origin = get('[data-pond-search]').trim()
      var pond = pondOf(origin)
      var breeding = card.querySelector('[data-x="breeding"]')
      var option = breeding && breeding.options[breeding.selectedIndex]
      var mini = function (kind, fields) {
        return Array.prototype.map.call(card.querySelectorAll('[data-mini="' + kind + '"]'), function (row) {
          var entry = {}
          fields.forEach(function (name) { entry[name] = row.querySelector('[data-m="' + name + '"]').value.trim() })
          return entry
        }).filter(function (entry) { return fields.some(function (name) { return entry[name] !== '' }) })
      }
      return {
        pond_id: pond ? pond.id : '', pond_name: pond ? pond.name : origin, pond_label: origin, location: get('[data-location]').trim(),
        result_qty: get('[data-result-qty]'), average_length_cm: get('[data-average-length]'), notes: get('[data-notes]').trim(),
        variety: get('[data-x="variety"]').trim(),
        breeding_id: breeding ? breeding.value : '', breeding_label: breeding && breeding.value ? option.textContent : '',
        reject: mini('reject', ['metric', 'qty']), sortir: mini('sortir', ['category', 'destination', 'description', 'qty']),
      }
    }).filter(function (entry) {
      return entry.pond_name || entry.location || entry.result_qty || entry.average_length_cm || entry.notes || entry.variety || entry.breeding_id || entry.reject.length || entry.sortir.length
    })
  }

  // ---- keeping the form in step ----------------------------------------------------------------------------------------------------------
  function build() {
    modal = document.querySelector('[data-report-modal]')
    form = document.querySelector('[data-report-form]')
    if (!modal || !form || ready) return
    listBox = form.querySelector('[data-pond-entry-list]')
    if (!listBox) return
    listBox.addEventListener('click', function (event) {
      var zoom = event.target.closest('img[data-x-photo]')
      if (zoom && zoom.dataset.full && window.KoiZoomImage) { window.KoiZoomImage(zoom.dataset.full, zoom.title || ''); return }
      var add = event.target.closest('[data-mini-add]')
      if (add) { var box = add.closest('[data-panen-extra]').querySelector('[data-x-list="' + add.getAttribute('data-mini-add') + '"]'); box.appendChild(miniRow(add.getAttribute('data-mini-add'))); return }
      var remove = event.target.closest('[data-mini-remove]')
      if (remove) remove.closest('[data-mini]').remove()
    })
    listBox.addEventListener('change', function (event) {
      if (!event.target.matches('[data-x="breeding"]')) return
      var card = event.target.closest('.card')
      card.dataset.breeding = event.target.value
      paintFemale(card)
    })
    // every row the page adds gets its extras; rows of a saved report are filled from it (the n-th row is the n-th entry)
    new MutationObserver(decorateAll).observe(listBox, { childList: true })
    ready = true
    originalFetch.call(window, '/api/ponds').then(function (r) { return r.ok ? r.json() : [] }).then(function (list) { ponds = Array.isArray(list) ? list : [] }).catch(function () {})
    originalFetch.call(window, '/api/breeding').then(function (r) { return r.ok ? r.json() : [] }).then(function (list) { breedings = Array.isArray(list) ? list : []; Array.prototype.forEach.call(listBox.querySelectorAll('[data-x="breeding"]'), function (select) { var card = select.closest('.card'); select.innerHTML = breedingOptions(card.dataset.breeding); paintFemale(card) }) }).catch(function () {})
  }

  function decorateAll() {
    var opened = currentId ? reportsById[currentId] : null
    var entries = draftEntries || (opened ? parse(opened.pond_entries, []) : [])
    Array.prototype.forEach.call(listBox.children, function (card, index) { decorate(card, entries[index]) })
  }

  function tick() {
    if (!ready) { build(); if (!ready) return }
    var shown = modal.classList.contains('show')
    wasShown = shown
    if (!shown) return
    var panen = currentType() === 'panen'
    // rows that were there before this file was ready (a draft opened at once from Antrean) get their extras now
    decorateAll()
    // report-wide boxes that a Panen replaces by the ones inside every row
    var conditionList = form.querySelector('[data-condition-entry-list]')
    var sortingList = form.querySelector('[data-sorting-entry-list]')
    var breedingColumn = form.querySelector('[data-breeding-search]')
    breedingColumn = breedingColumn && breedingColumn.closest('.col-lg-6')
    var breedingList = form.querySelector('[data-breeding-entry-list]')
    hide(sortingList.closest('.report-form-section'), panen && !sortingList.children.length)
    hide(breedingColumn, panen && breedingList && !breedingList.children.length)
    var readonly = isReadonly()
    Array.prototype.forEach.call(listBox.querySelectorAll('[data-panen-extra]'), function (extra) {
      hide(extra, !panen)
      extra.querySelectorAll('input,select,button').forEach(function (field) { if (field.disabled !== readonly) field.disabled = readonly })
    })
  }
  setInterval(tick, 350)
})()
