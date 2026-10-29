// Server-side form drafts, listed in the Antrean menu and usable from any device.
// Used by Tambah Ikan (its own draft menu), Tambah Breeding and Tambah Laporan (attach()).
// Visible to Operator, Admin and Master Admin; Viewer never sees draft controls.
;(function () {
  var pages = { koi: './farm-koi.html', breeding: './farm-breeding.html', report: './farm-reports.html', activity: './farm-reports.html', arrival: './farm-reports.html' }
  var permissions = { koi: 'database-write', breeding: 'farm-operate', report: 'farm-operate', activity: 'farm-operate', arrival: 'farm-operate' }

  function request(path, options) {
    return window.KoiAuth.apiRequest(path, options).then(function (response) {
      return response.json().catch(function () { return {} }).then(function (data) {
        if (!response.ok) throw new Error(data.error || 'Draft gagal diproses')
        return data
      })
    })
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    })
  }

  function formatTime(value) {
    var date = new Date(String(value || '').replace(' ', 'T'))
    if (isNaN(date.getTime())) return value || ''
    return window.KoiAuth && window.KoiAuth.formatDateTime ? window.KoiAuth.formatDateTime(date) : date.toLocaleString('id-ID')
  }

  var KoiDrafts = {
    pages: pages,
    permissions: permissions,
    formatTime: formatTime,
    canUse: function (type) {
      return Boolean(window.KoiAuth && window.KoiAuth.canAccess && window.KoiAuth.canAccess(permissions[type]))
    },
    canSee: function () {
      return Boolean(window.KoiAuth && window.KoiAuth.canAccess && window.KoiAuth.canAccess('farm-operate'))
    },
    list: function (type) { return request('/drafts' + (type ? '?type=' + encodeURIComponent(type) : '')) },
    get: function (id) { return request('/drafts/' + encodeURIComponent(id)) },
    save: function (payload) { return request('/drafts', { method: 'POST', body: JSON.stringify(payload) }) },
    rename: function (id, name) { return request('/drafts/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify({ name: name }) }) },
    remove: function (id) { return request('/drafts/' + encodeURIComponent(id), { method: 'DELETE' }) },
    // ?draft=ID in the URL (from Antrean "Lanjutkan")
    requestedId: function () { return new URLSearchParams(window.location.search).get('draft') },
    clearRequested: function () {
      var url = new URL(window.location.href)
      url.searchParams.delete('draft')
      window.history.replaceState(window.history.state, '', url)
    },
    // Resolves once deferred scripts (Bootstrap modal) are ready, so forms opened from a
    // Antrean link can still be closed normally after saving.
    whenReady: function () {
      if (document.readyState === 'complete') return Promise.resolve()
      return new Promise(function (resolve) { window.addEventListener('load', function () { resolve() }, { once: true }) })
    },
    link: function (draft) { return (pages[draft.type] || './farm-queue.html') + '?draft=' + encodeURIComponent(draft.id) },
  }

  var saveIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon m-0" aria-hidden="true"><path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" /><path d="M9 17h6" /><path d="M9 13h6" /></svg>'
  var pencilIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon m-0" aria-hidden="true"><path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4" /><path d="M13.5 6.5l4 4" /></svg>'
  var trashIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon m-0" aria-hidden="true"><path d="M4 7l16 0" /><path d="M10 11l0 6" /><path d="M14 11l0 6" /><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" /><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" /></svg>'

  // Adds "Simpan Draft" + a draft list to a form.
  // options: { type, host, collect: async () => ({ data, summary, item_count }), apply: (data) => void,
  //            open: () => void (opens an empty create form), onError: (message) => void, onInfo: (message) => void }
  KoiDrafts.attach = function (options) {
    var state = { currentId: null, drafts: [] }
    var perm = permissions[options.type]
    var wrapper = document.createElement('div')
    wrapper.className = 'btn-group koi-draft-controls'
    wrapper.setAttribute('data-role-required', perm)
    wrapper.innerHTML =
      '<button class="btn btn-outline-primary btn-icon" type="button" data-draft-save aria-label="Simpan draft" title="Simpan draft">' + saveIcon + '</button>' +
      '<button class="btn btn-outline-primary dropdown-toggle dropdown-toggle-split" type="button" data-bs-toggle="dropdown" data-bs-auto-close="outside" aria-expanded="false" aria-label="Daftar draft" title="Daftar draft"></button>' +
      '<div class="dropdown-menu dropdown-menu-end koi-draft-menu" data-draft-menu style="min-width:16rem;max-height:60vh;overflow:auto"></div>'
    options.host.appendChild(wrapper)
    var saveButton = wrapper.querySelector('[data-draft-save]')
    var menu = wrapper.querySelector('[data-draft-menu]')
    var error = options.onError || function (message) { window.alert(message) }
    var info = options.onInfo || function () {}

    function render() {
      menu.innerHTML = state.drafts.length
        ? state.drafts.map(function (draft) {
          var title = draft.name || draft.summary || ('Draft ' + formatTime(draft.created_at))
          return '<div class="d-flex align-items-center gap-1 px-2 py-1">' +
            '<button class="dropdown-item flex-fill text-wrap px-2' + (String(draft.id) === String(state.currentId) ? ' active' : '') + '" type="button" data-draft-load="' + draft.id + '">' +
            '<div class="fw-medium">' + escapeHtml(title) + '</div>' +
            '<div class="small text-secondary">' + escapeHtml((draft.updated_by_name || draft.created_by_name || '') + ' · ' + formatTime(draft.updated_at)) + '</div></button>' +
            '<button class="btn btn-sm btn-icon btn-outline-primary" type="button" data-draft-rename="' + draft.id + '" aria-label="Ganti nama draft" title="Ganti nama draft">' + pencilIcon + '</button>' +
            '<button class="btn btn-sm btn-icon btn-outline-danger" type="button" data-draft-delete="' + draft.id + '" aria-label="Hapus draft" title="Hapus draft">' + trashIcon + '</button>' +
            '</div>'
        }).join('')
        : '<span class="dropdown-item text-secondary">Belum ada draft</span>'
      saveButton.title = state.drafts.length ? 'Simpan draft (' + state.drafts.length + ' tersimpan)' : 'Simpan draft'
    }

    function refresh() {
      if (!KoiDrafts.canSee()) return Promise.resolve()
      return KoiDrafts.list(options.type).then(function (drafts) { state.drafts = drafts; render() }).catch(function () { render() })
    }

    function load(id) {
      return KoiDrafts.get(id).then(function (draft) {
        if (draft.type !== options.type) throw new Error('Draft ini bukan untuk formulir ini.')
        options.apply(draft.data || {})
        state.currentId = draft.id
        info('Draft dimuat: ' + (draft.name || draft.summary || formatTime(draft.created_at)))
        render()
      }).catch(function (e) { error(e.message) })
    }

    saveButton.addEventListener('click', function () {
      saveButton.disabled = true
      Promise.resolve()
        .then(function () { return options.collect() })
        .then(function (collected) {
          return KoiDrafts.save({ type: options.type, id: state.currentId || undefined, summary: collected.summary || '', item_count: collected.item_count || 1, data: collected.data })
        })
        .then(function (saved) {
          state.currentId = saved.id
          info('Draft tersimpan di Antrean.')
          return refresh()
        })
        .catch(function (e) { error('Draft belum tersimpan: ' + e.message) })
        .then(function () { saveButton.disabled = false })
    })

    menu.addEventListener('click', async function (event) {
      var loadButton = event.target.closest('[data-draft-load]')
      var renameButton = event.target.closest('[data-draft-rename]')
      var deleteButton = event.target.closest('[data-draft-delete]')
      if (loadButton) {
        load(loadButton.dataset.draftLoad)
        var toggle = wrapper.querySelector('[data-bs-toggle="dropdown"]')
        var bs = (window.tabler && window.tabler.bootstrap) || window.bootstrap
        if (bs && bs.Dropdown) bs.Dropdown.getOrCreateInstance(toggle).hide()
      } else if (renameButton) {
        var draft = state.drafts.find(function (d) { return String(d.id) === renameButton.dataset.draftRename })
        var name = (await window.KoiDialog.prompt('Nama draft', draft ? (draft.name || draft.summary || '') : ''))
        if (name && name.trim()) KoiDrafts.rename(renameButton.dataset.draftRename, name.trim()).then(refresh).catch(function (e) { error(e.message) })
      } else if (deleteButton) {
        if (!(await window.KoiDialog.confirm('Hapus draft ini?'))) return
        var id = deleteButton.dataset.draftDelete
        KoiDrafts.remove(id).then(function () {
          if (String(state.currentId) === String(id)) state.currentId = null
          return refresh()
        }).catch(function (e) { error(e.message) })
      }
    })
    wrapper.addEventListener('show.bs.dropdown', refresh)

    var controller = {
      refresh: refresh,
      load: load,
      reset: function () { state.currentId = null; render() },
      currentId: function () { return state.currentId },
      // Call after the form was saved as real data: the draft it came from is no longer needed.
      consume: function () {
        var id = state.currentId
        state.currentId = null
        if (!id) return Promise.resolve()
        return KoiDrafts.remove(id).catch(function () {}).then(refresh)
      },
    }

    refresh()
    // ?draft=ID from Antrean: only the form of the draft's own type opens it (a page may have two forms).
    var requested = KoiDrafts.requestedId()
    if (requested && KoiDrafts.canUse(options.type)) {
      KoiDrafts.get(requested).then(function (draft) {
        if (draft.type !== options.type) return
        KoiDrafts.clearRequested()
        return KoiDrafts.whenReady().then(function () { return options.open && options.open() }).then(function () { return load(requested) })
      }).catch(function (e) { error(e.message) })
    }
    return controller
  }

  window.KoiDrafts = KoiDrafts
})()
