// Tombol Kembali (Android, Chrome di PC) menutup formulir yang sedang terbuka (modal, panel samping, kotak hasil)
// dan tidak langsung pindah ke halaman sebelumnya. Setiap lapisan yang terbuka menambah satu entri riwayat;
// menutup lapisan dengan tombol di layar (X, Batal, Simpan, klik di luar) menghapus entri itu lagi, jadi
// riwayat peramban tidak menumpuk dan tombol Kembali kembali ke halaman sebelumnya setelah semua formulir tertutup.
;(function () {
  if (window.KoiBack) return
  var layers = []
  var seq = 0
  var ignorePops = 0
  var busy = false
  var queue = []
  var popping = null
  var busyTimer = null

  function depth() {
    var state = window.history.state
    return state && typeof state.koiLayer === 'number' ? state.koiLayer : 0
  }
  function run(task) {
    if (busy) queue.push(task)
    else task()
  }
  function release() {
    busy = false
    clearTimeout(busyTimer)
    var next = queue.shift()
    if (next) next()
  }
  function goBack() {
    busy = true
    ignorePops += 1
    busyTimer = setTimeout(function () { ignorePops = 0; release() }, 900)
    window.history.back()
  }

  function open(close, el) {
    var layer = { id: ++seq, close: close, el: el || null, n: layers.length + 1, pushed: false }
    layers.push(layer)
    run(function () {
      try {
        window.history.pushState({ koiLayer: layer.n }, '', window.location.href)
        layer.pushed = true
      } catch (error) {}
    })
    return layer
  }

  function closed(layer) {
    var index = layers.indexOf(layer)
    if (index < 0) return
    layers.splice(index, 1)
    if (popping === layer) {
      // closed because Back was pressed: its history entry is already gone
      popping = null
      return
    }
    run(function () {
      if (layer.pushed && depth() === layer.n) goBack()
    })
  }

  window.addEventListener('popstate', function () {
    if (ignorePops > 0) {
      ignorePops -= 1
      if (ignorePops === 0) release()
      return
    }
    var layer = layers[layers.length - 1]
    if (!layer) return
    popping = layer
    try { layer.close() } catch (error) {}
    // a layer that refuses to close (unsaved-changes guard, ...) must keep its entry, or the next Back leaves the page
    setTimeout(function () {
      if (layers.indexOf(layer) >= 0 && popping === layer) {
        popping = null
        try { window.history.pushState({ koiLayer: layer.n }, '', window.location.href) } catch (error) {}
      }
    }, 700)
  })

  // Bootstrap modals (all forms) and offcanvas panels
  ;[['modal', 'Modal'], ['offcanvas', 'Offcanvas']].forEach(function (kind) {
    document.addEventListener('shown.bs.' + kind[0], function (event) {
      var el = event.target
      if (!el || el.__koiBackLayer) return
      el.__koiBackLayer = open(function () {
        var lib = window.bootstrap || (window.tabler && window.tabler.bootstrap)
        var api = lib && lib[kind[1]]
        var instance = api && api.getInstance ? api.getInstance(el) : null
        if (instance) instance.hide()
      }, el)
    })
    document.addEventListener('hidden.bs.' + kind[0], function (event) {
      var el = event.target
      var layer = el && el.__koiBackLayer
      if (!layer) return
      el.__koiBackLayer = null
      closed(layer)
    })
  })

  // Every other full-screen layer: photo previews and zoom, parent previews, pickers, panels, report/gallery viewers,
  // and modals that a page opens by itself. They are found by what they are (a fixed layer that covers the screen),
  // not by name, so a preview added to any menu later is handled too.
  var HINT = /overlay|lightbox|zoom|viewer|preview|picker|dialog|modal|popup|backdrop-panel/i
  var SKIP = '.modal-backdrop, .koi-load, .koi-load-bar, .navbar, .koi-dock, .koi-print-root, .toast, .dropdown-menu, .koi-native-select-menu, [aria-hidden="true"], [data-koi-no-back]'
  var CLOSERS = '[data-picker-close], [data-close-breeding-zoom], [data-result-close], [data-close-viewer], [data-bs-dismiss="modal"], [data-modal-close], .btn-close, button[aria-label*="tutup" i], button[aria-label*="close" i]'
  var candidates = []
  var syncTimer = null

  function coversScreen(el) {
    var cs = window.getComputedStyle(el)
    if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') return false
    var rect = el.getBoundingClientRect()
    return rect.width >= window.innerWidth * 0.85 && rect.height >= window.innerHeight * 0.85
  }
  function looksLikeLayer(el) {
    if (!el || el.nodeType !== 1) return false
    var parent = el.parentElement
    if (parent === document.body || (parent && parent.classList && parent.classList.contains('modal'))) return true
    if (el.style && el.style.position === 'fixed') return true
    return HINT.test(typeof el.className === 'string' ? el.className : '')
  }
  function dismiss(el) {
    var lib = window.bootstrap || (window.tabler && window.tabler.bootstrap)
    var instance = el.classList.contains('modal') && lib && lib.Modal ? lib.Modal.getInstance(el) : null
    if (instance) { instance.hide(); return }
    var button = el.querySelector(CLOSERS)
    if (button) { button.click(); return }
    el.click()
  }
  function sync() {
    syncTimer = null
    layers.slice().forEach(function (layer) {
      var el = layer.el
      if (!layer.generic || !el) return
      if (!el.isConnected || !coversScreen(el)) {
        el.__koiBackLayer = null
        closed(layer)
      }
    })
    var list = candidates
    candidates = []
    list.forEach(function (el) {
      if (!el.isConnected || el.__koiBackLayer || el.matches(SKIP) || !coversScreen(el)) return
      var layer = open(function () { dismiss(el) }, el)
      layer.generic = true
      el.__koiBackLayer = layer
    })
  }
  function schedule() {
    if (!syncTimer) syncTimer = setTimeout(sync, 40)
  }
  function watchLayers() {
    new MutationObserver(function (records) {
      var touched = false
      for (var i = 0; i < records.length; i++) {
        var record = records[i]
        if (record.type === 'attributes') {
          if (looksLikeLayer(record.target)) { candidates.push(record.target); touched = true }
        } else {
          for (var j = 0; j < record.addedNodes.length; j++) {
            var node = record.addedNodes[j]
            if (looksLikeLayer(node)) { candidates.push(node); touched = true }
          }
          if (record.removedNodes.length) touched = true
        }
      }
      if (touched || layers.length) schedule()
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] })
  }
  if (document.body) watchLayers()
  else document.addEventListener('DOMContentLoaded', watchLayers)

  // after a reload the current entry may still be one of our markers; make it a normal entry
  if (depth() > 0) {
    try { window.history.replaceState(null, '', window.location.href) } catch (error) {}
  }

  window.KoiBack = { open: open, closed: closed }
})()
