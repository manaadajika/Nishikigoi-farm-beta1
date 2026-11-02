// Laporan: nothing typed is lost.
//   A NEW report (any kind): a few seconds after the last change the form saves itself as a draft (the same button "Simpan Draft" does it, so the
//   same draft is updated again and again and the draft list shows one entry). The draft goes away when the report is saved.
//   An EXISTING report that is being edited is never saved by itself (that would change the real report): closing the form with changes that were
//   not saved, or leaving the page, asks first.
;(function () {
  'use strict'
  if (!/farm-reports/.test(location.pathname)) return

  var AFTER_MS = 4000
  var DEFS = [
    { modal: '[data-report-modal]', form: '[data-report-form]', title: '[data-report-modal-title]', main: true },
    { modal: '[data-activity-modal]', form: '[data-activity-form]', title: '[data-activity-title]' },
    { modal: '[data-arrival-modal]', form: '[data-arrival-form]', title: '[data-arrival-title]' },
  ]
  var ADDERS = '[data-add-pond-entry],[data-add-condition-entry],[data-add-sorting-entry],[data-fish-add],[data-f-remove],[data-remove-entry],[data-mini-add],[data-mini-remove],[data-arrival-add-line],[data-line-remove],[data-activity-add-item],[data-item-remove],[data-chip-remove],[data-media-remove],[data-add-breeding-entry],[data-add-koi-entry],[data-add-account-entry]'
  var CLOSERS = '[data-report-cancel],[data-activity-close],[data-arrival-close],.btn-close'

  var current = null
  var key = ''
  var dirty = false
  var lastChange = 0
  var armedAt = 0
  var bypass = false
  var asking = false

  function find() {
    for (var i = 0; i < DEFS.length; i += 1) {
      var form = document.querySelector(DEFS[i].form)
      if (form && form.offsetParent !== null) return { def: DEFS[i], form: form, modal: document.querySelector(DEFS[i].modal) }
    }
    return null
  }
  function titleOf(found) { var el = document.querySelector(found.def.title); return el ? el.textContent.trim() : '' }
  function kindOf(found) {
    var title = titleOf(found)
    var heading = document.querySelector(found.def.title)
    if (heading && heading.dataset.koiKind) return heading.dataset.koiKind
    if (/^Detail/i.test(title) || (/^Laporan /.test(title) && !/^Laporan (Perikanan|Kegiatan|Ikan Datang)$/.test(title) && /\b[A-Z]{3}-\d\d-\d\d-\d\d\b|Report-/.test(title))) return 'detail'
    if (/^Edit/i.test(title) || /Edit Laporan/.test(title)) return 'edit'
    return 'new'
  }
  function inside(target, found) { return Boolean(found && target && found.form.contains(target)) }

  // changes made by a person (the program's own filling in of a form does not count)
  function touched(event) {
    if (!event.isTrusted) return
    var found = find()
    if (!found || !inside(event.target, found)) return
    if (Date.now() < armedAt) return
    dirty = true
    lastChange = Date.now()
  }
  document.addEventListener('input', touched, true)
  document.addEventListener('change', touched, true)
  document.addEventListener('click', function (event) {
    if (!event.isTrusted) return
    var found = find()
    if (found && inside(event.target, found) && event.target.closest && event.target.closest(ADDERS)) touched(event)
  }, true)
  document.addEventListener('submit', function (event) {
    var found = find()
    if (found && inside(event.target, found)) { dirty = false; lastChange = 0 }
  }, true)

  // ---- the question when an edited report is closed with unsaved changes ----
  function confirmDiscard() {
    if (asking) return Promise.resolve(false)
    asking = true
    var ask = window.KoiDialog && window.KoiDialog.confirm
      ? window.KoiDialog.confirm({ title: 'Perubahan belum disimpan. Buang perubahan?', confirmText: 'Ya, buang', danger: true })
      : Promise.resolve(window.confirm('Perubahan belum disimpan. Buang perubahan?'))
    return ask.then(function (ok) { asking = false; return Boolean(ok) }, function () { asking = false; return false })
  }
  document.addEventListener('click', function (event) {
    if (bypass || !event.isTrusted) return
    var found = find()
    if (!found || !dirty || kindOf(found) !== 'edit') return
    var closer = event.target.closest && event.target.closest(CLOSERS)
    if (!closer || !found.form.closest('.modal').contains(closer)) return
    event.preventDefault()
    event.stopImmediatePropagation()
    confirmDiscard().then(function (ok) {
      if (!ok) return
      dirty = false
      bypass = true
      try { closer.click() } finally { setTimeout(function () { bypass = false }, 0) }
    })
  }, true)
  ;DEFS.forEach(function (def) {
    var modal = document.querySelector(def.modal)
    if (!modal) return
    // Escape, a click outside, or any other way the window is closed
    modal.addEventListener('hide.bs.modal', function (event) {
      var found = find()
      if (bypass || !found || !dirty || kindOf(found) !== 'edit') return
      event.preventDefault()
      confirmDiscard().then(function (ok) {
        if (!ok) return
        dirty = false
        var api = (window.tabler && window.tabler.bootstrap && window.tabler.bootstrap.Modal) || (window.bootstrap && window.bootstrap.Modal)
        var instance = api && api.getInstance(modal)
        bypass = true
        try { if (instance) instance.hide() } finally { setTimeout(function () { bypass = false }, 600) }
      })
    })
  })
  window.addEventListener('beforeunload', function (event) {
    var found = find()
    if (found && dirty && kindOf(found) === 'edit') { event.preventDefault(); event.returnValue = '' }
  })

  // ---- the draft saves itself ------------------------------------------------------------------------------------------------------------
  setInterval(function () {
    var found = find()
    var identity = found ? DEFS.indexOf(found.def) + '|' + kindOf(found) : ''
    if (identity !== key) {
      // another form (or the same form opened again): start counting from nothing
      key = identity
      dirty = false
      lastChange = 0
      armedAt = Date.now() + 3000
      return
    }
    if (!found || !dirty || kindOf(found) !== 'new') return
    if (Date.now() - lastChange < AFTER_MS) return
    var dialog = found.form.closest('.modal-dialog') || found.form
    var button = dialog.querySelector('[data-draft-save]')
    if (!button || button.disabled || button.offsetParent === null) return
    dirty = false
    button.click()
  }, 1000)
})()
