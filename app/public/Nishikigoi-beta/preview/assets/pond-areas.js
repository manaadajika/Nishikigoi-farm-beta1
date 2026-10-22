// Data Kolam > Pengaturan Area and the Area dropdown of Formulir Tambah/Edit Kolam.
//
// - The list of areas is edited as a draft (add, rename, delete an empty area, drag to reorder) and only
//   written when Simpan is pressed. Renames are applied to every pond of that area by the server.
// - The Area field of the pond form is a dropdown filled from the same list (areas of existing ponds plus
//   areas that were added here and have no pond yet).
// - Saved in app_settings: `pond_areas` (the list) and `pond_area_order` (same list, read by the page).
//
// Loaded on farm-ponds only. The page's own script keeps working with the dropdown because a <select> has
// the same .value API as the old text field.
;(function () {
  var MAX_NAME = 100

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    })
  }
  function request(path, options) {
    return window.KoiAuth.apiRequest(path, options).then(function (response) {
      return response.json().catch(function () { return {} }).then(function (data) {
        if (!response.ok) throw new Error(data.error || 'Permintaan gagal')
        return data
      })
    })
  }
  function parseList(value) {
    try {
      var list = typeof value === 'string' ? JSON.parse(value) : value
      if (!Array.isArray(list)) return null
      return list.map(function (item) { return String(item == null ? '' : item).trim() }).filter(Boolean)
    } catch (error) { return null }
  }
  function unique(list) {
    var seen = {}
    return list.filter(function (name) {
      var key = name.toLowerCase()
      if (seen[key]) return false
      seen[key] = true
      return true
    })
  }
  function alpha(a, b) { return a.localeCompare(b) }

  // names in display order + how many ponds use each
  function loadAreas() {
    return Promise.all([request('/ponds'), request('/app-settings')]).then(function (results) {
      var ponds = Array.isArray(results[0]) ? results[0] : []
      var settings = results[1] || {}
      var counts = {}
      ponds.forEach(function (pond) {
        var name = String(pond.location || '').trim()
        if (name) counts[name] = (counts[name] || 0) + 1
      })
      var present = Object.keys(counts)
      var saved = parseList(settings.pond_areas)
      var legacy = parseList(settings.pond_area_order)
      if (!legacy) { try { legacy = parseList(window.localStorage.getItem('pondAreaOrder')) } catch (error) {} }
      var base = saved || (legacy || []).filter(function (name) { return counts[name] !== undefined })
      var names = unique(base.concat(present.filter(function (name) { return base.indexOf(name) === -1 }).sort(alpha)))
      return { names: names, counts: counts }
    })
  }

  // ---- dropdown in Formulir Tambah/Edit Kolam --------------------------------------------------------------
  var select = null
  function setupSelect() {
    select = document.querySelector('#pond-location')
    if (!select || select.tagName !== 'SELECT') { select = null; return }
    var descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')
    function hasOption(value) {
      return Array.prototype.some.call(select.options, function (option) { return option.value === value })
    }
    // a pond whose area is not in the list yet (older data) still shows its own area instead of going blank
    Object.defineProperty(select, 'value', {
      configurable: true,
      get: function () { return descriptor.get.call(select) },
      set: function (value) {
        var text = value == null ? '' : String(value)
        if (text && !hasOption(text)) {
          var extra = document.createElement('option')
          extra.value = text
          extra.textContent = text
          select.appendChild(extra)
        }
        descriptor.set.call(select, text)
      },
    })
    var modalElement = select.closest('.modal')
    if (modalElement) modalElement.addEventListener('show.bs.modal', function () { refreshSelect() })
    refreshSelect()
  }
  function refreshSelect() {
    if (!select) return Promise.resolve()
    return loadAreas().then(function (areas) {
      var current = select.value
      select.innerHTML = '<option value="">(Tanpa area)</option>' + areas.names.map(function (name) {
        return '<option value="' + escapeHtml(name) + '">' + escapeHtml(name) + '</option>'
      }).join('')
      select.value = current
    }).catch(function () {})
  }

  // ---- Pengaturan Area ------------------------------------------------------------------------------------
  var icons = {
    grip: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>',
    edit: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 7h-1a2 2 0 0 0 -2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2 -2v-1"/><path d="M20.385 6.585a2.1 2.1 0 0 0 -2.97 -2.97l-8.415 8.385v3h3l8.385 -8.415z"/><path d="M16 5l3 3"/></svg>',
    trash: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7l16 0"/><path d="M10 11l0 6"/><path d="M14 11l0 6"/><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12"/><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3"/></svg>',
  }

  function setupModal() {
    var modal = document.querySelector('#area-settings-modal')
    if (!modal) return
    var body = modal.querySelector('.modal-body')
    var footer = modal.querySelector('.modal-footer')
    var legacyList = modal.querySelector('[data-area-order-list]')
    if (!body || !footer) return

    // the page's own arrow list stays in the markup (its script still looks for it) but is hidden
    if (legacyList) legacyList.classList.add('d-none')
    Array.prototype.forEach.call(footer.children, function (child) { child.classList.add('d-none') })

    var style = document.createElement('style')
    // Same feel as the photo history in Data Ikan: a handle button, the row follows the pointer, the others slide aside.
    style.textContent =
      '.area-grip{touch-action:none;cursor:grab;user-select:none;flex:0 0 auto}' +
      '.area-row{position:relative;will-change:transform}' +
      '.area-editor.is-reordering .area-row:not(.is-dragging){transition:transform .2s ease}' +
      '.area-row.is-dragging{cursor:grabbing;z-index:5;transition:none;background:var(--tblr-bg-surface);box-shadow:0 6px 18px rgba(0,0,0,.35)}' +
      '.area-row.is-dragging .area-grip{cursor:grabbing}' +
      '.area-row.is-new{border-left:3px solid var(--tblr-primary)}'
    document.head.appendChild(style)

    var editorWrap = document.createElement('div')
    editorWrap.innerHTML =
      '<div class="input-group mb-3">' +
        '<input class="form-control" type="text" maxlength="' + MAX_NAME + '" placeholder="Nama area baru" autocomplete="off" data-area-new>' +
        '<button class="btn btn-primary" type="button" data-area-add>Tambah area</button>' +
      '</div>' +
      '<div class="text-danger small mb-2 d-none" data-area-error></div>' +
      '<div class="list-group area-editor" data-area-editor><div class="list-group-item text-secondary">Memuat area...</div></div>' +
      '<div class="form-hint mt-2">Geser tombol titik-titik di sebelah kiri untuk mengubah urutan. Perubahan baru berlaku setelah menekan Simpan.</div>'
    body.appendChild(editorWrap)

    var actions = document.createElement('div')
    actions.className = 'd-flex w-100 align-items-center gap-2'
    actions.innerHTML =
      '<button class="btn me-auto" type="button" data-area-reset>Reset Urutan</button>' +
      '<button class="btn" type="button" data-bs-dismiss="modal">Batal</button>' +
      '<button class="btn btn-primary" type="button" data-area-save disabled>Simpan</button>'
    footer.appendChild(actions)

    var editor = editorWrap.querySelector('[data-area-editor]')
    var input = editorWrap.querySelector('[data-area-new]')
    var errorBox = editorWrap.querySelector('[data-area-error]')
    var saveButton = actions.querySelector('[data-area-save]')

    var draft = []       // [{ name, original (null for a new area), count }]
    var initial = ''     // signature of the loaded state, to know whether anything changed
    var editing = -1
    var forceClose = false
    var saving = false

    function signature() {
      return JSON.stringify(draft.map(function (item) { return [item.original, item.name] }))
    }
    function isDirty() { return signature() !== initial }
    function showError(message) {
      errorBox.textContent = message || ''
      errorBox.classList.toggle('d-none', !message)
    }
    function nameTaken(name, exceptIndex) {
      var key = name.toLowerCase()
      return draft.some(function (item, index) { return index !== exceptIndex && item.name.toLowerCase() === key })
    }

    function render() {
      editor.innerHTML = draft.map(function (item, index) {
        var inUse = item.count > 0
        return '<div class="list-group-item area-row d-flex align-items-center gap-2' + (item.original === null ? ' is-new' : '') + '" data-area-row="' + index + '">' +
          '<span class="btn btn-outline-secondary btn-sm btn-icon area-grip" data-area-grip title="Geser untuk urutkan" aria-label="Geser untuk urutkan">' + icons.grip + '</span>' +
          '<div class="flex-fill" style="min-width:0">' +
            (editing === index
              ? '<input class="form-control form-control-sm" type="text" maxlength="' + MAX_NAME + '" value="' + escapeHtml(item.name) + '" data-area-name-input>'
              : '<div class="fw-medium text-truncate" title="' + escapeHtml(item.name) + '">' + escapeHtml(item.name) +
                (item.original !== null && item.original !== item.name ? ' <span class="text-secondary small">(sebelumnya ' + escapeHtml(item.original) + ')</span>' : '') + '</div>') +
          '</div>' +
          '<span class="badge bg-secondary-lt">' + item.count + ' kolam</span>' +
          '<button class="btn btn-sm btn-icon" type="button" data-area-rename title="Ganti nama" aria-label="Ganti nama">' + icons.edit + '</button>' +
          '<button class="btn btn-sm btn-icon btn-outline-danger" type="button" data-area-delete ' + (inUse ? 'disabled title="Masih dipakai ' + item.count + ' kolam. Pindahkan kolamnya dulu."' : 'title="Hapus area"') + ' aria-label="Hapus area">' + icons.trash + '</button>' +
        '</div>'
      }).join('') || '<div class="list-group-item text-secondary">Belum ada area. Tambahkan lewat kolom di atas.</div>'
      saveButton.disabled = saving || !isDirty()
      var field = editor.querySelector('[data-area-name-input]')
      if (field) { field.focus(); field.select() }
    }

    function load() {
      editing = -1
      showError('')
      input.value = ''
      editor.innerHTML = '<div class="list-group-item text-secondary">Memuat area...</div>'
      return loadAreas().then(function (areas) {
        draft = areas.names.map(function (name) { return { name: name, original: name, count: areas.counts[name] || 0 } })
        initial = signature()
        render()
      }).catch(function (error) {
        editor.innerHTML = '<div class="list-group-item text-danger">' + escapeHtml(error.message || 'Area gagal dimuat') + '</div>'
      })
    }

    function addArea() {
      var name = input.value.trim()
      if (!name) { showError('Nama area belum diisi.'); return }
      if (name.length > MAX_NAME) { showError('Nama area maksimal ' + MAX_NAME + ' huruf.'); return }
      if (nameTaken(name, -1)) { showError('Area "' + name + '" sudah ada.'); return }
      showError('')
      draft.push({ name: name, original: null, count: 0 })
      input.value = ''
      render()
      editor.scrollTop = editor.scrollHeight
      input.focus()
    }

    function commitRename(index, value) {
      var name = String(value || '').trim()
      editing = -1
      if (name && name !== draft[index].name) {
        if (name.length > MAX_NAME) showError('Nama area maksimal ' + MAX_NAME + ' huruf.')
        else if (nameTaken(name, index)) showError('Area "' + name + '" sudah ada.')
        else { showError(''); draft[index].name = name }
      }
      render()
    }

    editorWrap.addEventListener('click', function (event) {
      if (event.target.closest('[data-area-add]')) { addArea(); return }
      var row = event.target.closest('[data-area-row]')
      if (!row) return
      var index = Number(row.dataset.areaRow)
      if (event.target.closest('[data-area-rename]')) { editing = index; render(); return }
      if (event.target.closest('[data-area-delete]')) {
        if (draft[index].count > 0) return
        draft.splice(index, 1)
        editing = -1
        showError('')
        render()
      }
    })
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') { event.preventDefault(); addArea() }
    })
    editor.addEventListener('keydown', function (event) {
      var field = event.target.closest('[data-area-name-input]')
      if (!field) return
      var index = Number(field.closest('[data-area-row]').dataset.areaRow)
      if (event.key === 'Enter') { event.preventDefault(); commitRename(index, field.value) }
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); editing = -1; render() }
    })
    editor.addEventListener('focusout', function (event) {
      var field = event.target.closest('[data-area-name-input]')
      if (!field || editing < 0) return
      commitRename(Number(field.closest('[data-area-row]').dataset.areaRow), field.value)
    })

    // drag and drop with the handle on the left (mouse, pen and touch)
    var drag = null
    function rowsNow() { return Array.prototype.slice.call(editor.querySelectorAll('[data-area-row]')) }
    editor.addEventListener('pointerdown', function (event) {
      if (event.button !== undefined && event.button !== 0) return
      var grip = event.target.closest('[data-area-grip]')
      if (!grip || editing >= 0) return
      var rows = rowsNow()
      if (rows.length <= 1) return
      var rects = rows.map(function (row) { return row.getBoundingClientRect() })
      var row = grip.closest('[data-area-row]')
      drag = {
        pointerId: event.pointerId,
        row: row,
        startIndex: rows.indexOf(row),
        startX: event.clientX,
        startY: event.clientY,
        count: rows.length,
        cell: rects.length > 1 ? rects[1].top - rects[0].top : rects[0].height,
        order: rows.map(function (item, index) { return index }),
        activated: false,
      }
    })
    editor.addEventListener('pointermove', function (event) {
      if (!drag || event.pointerId !== drag.pointerId) return
      var dx = event.clientX - drag.startX
      var dy = event.clientY - drag.startY
      if (!drag.activated) {
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return
        drag.activated = true
        drag.row.classList.add('is-dragging')
        editor.classList.add('is-reordering')
        try { drag.row.setPointerCapture(drag.pointerId) } catch (error) {}
        document.body.style.userSelect = 'none'
        document.body.style.touchAction = 'none'
      }
      event.preventDefault()
      drag.row.style.transform = 'translateY(' + dy + 'px)'
      // how many whole rows the pointer has moved, added to the dragged row's own position
      var target = Math.min(drag.count - 1, Math.max(0, Math.round(drag.startIndex + dy / drag.cell)))
      var order = []
      for (var i = 0; i < drag.count; i += 1) { if (i !== drag.startIndex) order.push(i) }
      order.splice(target, 0, drag.startIndex)
      drag.order = order
      var rows = rowsNow()
      order.forEach(function (originalIndex, position) {
        if (originalIndex === drag.startIndex) return
        var shift = (position - originalIndex) * drag.cell
        rows[originalIndex].style.transform = shift ? 'translateY(' + shift + 'px)' : ''
      })
    })
    function finishDrag(event) {
      var current = drag
      if (!current || (event && event.pointerId !== undefined && event.pointerId !== current.pointerId)) return
      drag = null
      document.body.style.userSelect = ''
      document.body.style.touchAction = ''
      if (!current.activated) return
      editor.classList.remove('is-reordering')
      var changed = current.order.some(function (originalIndex, position) { return originalIndex !== position })
      if (!changed) {
        rowsNow().forEach(function (row) { row.style.transform = '' })
        current.row.classList.remove('is-dragging')
        return
      }
      var before = current.row.getBoundingClientRect()
      var moved = draft[current.startIndex]
      draft = current.order.map(function (originalIndex) { return draft[originalIndex] })
      render()
      // the dragged row is a fresh element now: let it fly from where it was dropped into its slot
      var fresh = rowsNow()[draft.indexOf(moved)]
      if (fresh) {
        var after = fresh.getBoundingClientRect()
        fresh.style.transition = 'none'
        fresh.style.transform = 'translateY(' + (before.top - after.top) + 'px)'
        window.requestAnimationFrame(function () {
          window.requestAnimationFrame(function () {
            fresh.style.transition = 'transform .2s ease'
            fresh.style.transform = ''
            fresh.addEventListener('transitionend', function () { fresh.style.transition = '' }, { once: true })
          })
        })
      }
    }
    editor.addEventListener('pointerup', finishDrag)
    editor.addEventListener('pointercancel', finishDrag)

    actions.querySelector('[data-area-reset]').addEventListener('click', function () {
      draft.sort(function (a, b) { return alpha(a.name, b.name) })
      editing = -1
      render()
    })

    saveButton.addEventListener('click', function () {
      if (saving || !isDirty()) return
      saving = true
      saveButton.disabled = true
      saveButton.textContent = 'Menyimpan...'
      showError('')
      var renames = draft.filter(function (item) { return item.original !== null && item.original !== item.name })
        .map(function (item) { return { from: item.original, to: item.name } })
      var names = draft.map(function (item) { return item.name })
      var step = renames.length
        ? request('/ponds-rename-area', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ renames: renames }) })
        : Promise.resolve()
      step.then(function () {
        return request('/app-settings', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ pond_areas: JSON.stringify(names), pond_area_order: JSON.stringify(names) }),
        })
      }).then(function () {
        try { window.localStorage.setItem('pondAreaOrder', JSON.stringify(names)) } catch (error) {}
        forceClose = true
        // the page draws its groups from its own copy of the ponds: reload so everything shows the new areas
        window.location.reload()
      }).catch(function (error) {
        saving = false
        saveButton.textContent = 'Simpan'
        showError(error.message || 'Area gagal disimpan.')
        render()
      })
    })

    modal.addEventListener('show.bs.modal', function () { forceClose = false; saving = false; saveButton.textContent = 'Simpan'; load() })
    modal.addEventListener('hide.bs.modal', function (event) {
      if (forceClose || !isDirty()) return
      // the dialog answers later, so the closing is stopped now and done again once the person agrees
      event.preventDefault()
      window.KoiDialog.confirm({ title: 'Perubahan area belum disimpan. Buang perubahan?', confirmText: 'Ya, buang', danger: true }).then(function (discard) {
        if (!discard) return
        forceClose = true
        var api = (window.tabler && window.tabler.bootstrap && window.tabler.bootstrap.Modal) || (window.bootstrap && window.bootstrap.Modal)
        if (api) api.getOrCreateInstance(modal).hide()
      })
    })
  }

  function start() {
    setupSelect()
    setupModal()
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
  else start()
})()
