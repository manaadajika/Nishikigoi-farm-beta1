// Shared print layout + "Pengaturan Cetak" (paper size, orientation, scale, margin), used by the
// print buttons of the farm pages. Plain, square, black-on-white documents.
//
// KoiPrint.print({
//   key: 'ponds-detail',              // settings are remembered per key
//   title: 'Isi Kolam Konkret 01',    // window / PDF file name
//   heading: 'DAFTAR IKAN DALAM KOLAM',
//   info: [['Nama Kolam', 'Konkret 01'], ...],   // label/value boxes (values are text)
//   notes: 'text',                    // optional
//   body: '<table class="kp-table">…</table>',   // trusted HTML built by the page (escape values!)
//   orientation: 'portrait',          // default when nothing was chosen before
//   attachment: {                     // optional extra pages after this one (e.g. documentation photos)
//     key: 'docs', label: 'Dokumentasi (foto atau video)',   // one checkbox in "Pengaturan Cetak", ticked by default
//     heading: 'LAMPIRAN DOKUMENTASI', subheading: 'INV-2610-001', body: '<div>…</div>'
//   }
// })
;(function () {
  var papers = {
    a4: { label: 'A4 (21 x 29,7 cm)', width: 21, height: 29.7 },
    f4: { label: 'F4 / Folio (21,5 x 33 cm)', width: 21.5, height: 33 },
    letter: { label: 'Letter (21,6 x 27,9 cm)', width: 21.59, height: 27.94 },
    legal: { label: 'Legal (21,6 x 35,6 cm)', width: 21.59, height: 35.56 },
    a5: { label: 'A5 (14,8 x 21 cm)', width: 14.8, height: 21 },
    custom: { label: 'Ukuran kustom' },
  }
  var margins = { normal: { label: 'Normal (1 cm)', mm: 10 }, narrow: { label: 'Sempit (0,5 cm)', mm: 5 }, none: { label: 'Tanpa margin', mm: 0 }, custom: { label: 'Kustom (atas, bawah, kanan, kiri)', mm: 10 } }
  var defaults = { paper: 'a4', width: 0, height: 0, orientation: 'portrait', margin: 'normal', marginTop: 1, marginRight: 1, marginBottom: 1, marginLeft: 1, header: true }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    })
  }
  function brandName() {
    try {
      var settings = JSON.parse(localStorage.getItem('nishikigoi-app-settings') || 'null') || {}
      return settings.brand_name || 'Nishikigoi'
    } catch (e) { return 'Nishikigoi' }
  }
  // The program icon from Identitas Program (Master Akun), shown left of the program name in every document head.
  function brandIconUrl() {
    try {
      var settings = JSON.parse(localStorage.getItem('nishikigoi-app-settings') || 'null') || {}
      var icon = String(settings.brand_logo_light || settings.brand_icon || '').trim()
      if (!icon) return ''
      if (/^(data|blob):/i.test(icon)) return icon
      var resolved = window.KoiAuth && window.KoiAuth.apiUrl ? window.KoiAuth.apiUrl(icon) : icon
      return new URL(resolved, window.location.origin).href
    } catch (e) { return '' }
  }
  function brandSubtitle() {
    try {
      var settings = JSON.parse(localStorage.getItem('nishikigoi-app-settings') || 'null') || {}
      return String(settings.brand_subtitle || '').trim() || 'Nishikigoi - manajemen koi farm'
    } catch (e) { return 'Nishikigoi - manajemen koi farm' }
  }
  // The settings of every kind of print are shared by all accounts and devices: the server keeps them (GET/PUT /print-settings);
  // this browser keeps a copy so the dialog opens at once and still works offline.
  var serverSettings = null
  function api() { return window.KoiAuth && window.KoiAuth.apiRequest ? window.KoiAuth : null }
  function fetchServerSettings() {
    var auth = api()
    if (!auth) return
    try {
      auth.apiRequest('/print-settings').then(function (response) { return response.ok ? response.json() : null }).then(function (data) {
        if (data && data.settings && typeof data.settings === 'object') serverSettings = data.settings
      }).catch(function () {})
    } catch (e) {}
  }
  function pushServerSettings(key, settings) {
    var auth = api()
    if (serverSettings) serverSettings[key] = settings
    if (!auth) return
    try {
      auth.apiRequest('/print-settings', { method: 'PUT', body: JSON.stringify({ key: key, settings: settings }) }).catch(function () {})
    } catch (e) {}
  }
  function loadSettings(key, orientation) {
    try {
      var shared = serverSettings && serverSettings[key]
      if (shared && typeof shared === 'object') return Object.assign({}, defaults, shared)
      var saved = JSON.parse(localStorage.getItem('koi-print-settings:' + key) || 'null')
      if (saved && typeof saved === 'object') return Object.assign({}, defaults, saved)
    } catch (e) {}
    return Object.assign({}, defaults, orientation ? { orientation: orientation } : {})
  }
  function saveSettings(key, settings) {
    try { localStorage.setItem('koi-print-settings:' + key, JSON.stringify(settings)) } catch (e) {}
    pushServerSettings(key, settings)
  }
  setTimeout(fetchServerSettings, 800)
  function nowText() {
    return window.KoiAuth && window.KoiAuth.formatDateTime ? window.KoiAuth.formatDateTime(new Date()) : new Date().toLocaleString('id-ID')
  }

  // Margin of the page in cm: a preset, or the four custom sides.
  function marginBox(settings) {
    if (settings.margin === 'custom') {
      var side = function (value) { var n = Number(value); return Number.isFinite(n) && n >= 0 ? Math.min(n, 10) : 1 }
      return { top: side(settings.marginTop), right: side(settings.marginRight), bottom: side(settings.marginBottom), left: side(settings.marginLeft) }
    }
    var cm = (margins[settings.margin] || margins.normal).mm / 10
    return { top: cm, right: cm, bottom: cm, left: cm }
  }

  // ---- document ----
  function pageCss(settings) {
    var paper = papers[settings.paper] || papers.a4
    var width = settings.paper === 'custom' ? Number(settings.width) || 21 : paper.width
    var height = settings.paper === 'custom' ? Number(settings.height) || 29.7 : paper.height
    if (settings.orientation === 'landscape') { var swap = width; width = height; height = swap }
    var box = marginBox(settings)
    return '@page{size:' + width + 'cm ' + height + 'cm;margin:' + box.top + 'cm ' + box.right + 'cm ' + box.bottom + 'cm ' + box.left + 'cm}'
  }

  var documentCss = [
    '*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;border-radius:0!important}',
    'html,body{margin:0;padding:0;background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif;font-size:10.5px;line-height:1.35}',
    '@media screen{body{padding:16px}}',
    '.kp-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;padding-bottom:6px;margin-bottom:10px;border-bottom:2px solid #111}',
    '.kp-brandbox{display:flex;align-items:center;gap:8px;min-width:0}',
    '.kp-logo{display:block;width:34px;height:34px;object-fit:contain;flex:0 0 auto}',
    '.kp-brand{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em}',
    '.kp-brand small{display:block;font-weight:400;text-transform:none;letter-spacing:0;color:#555}',
    '.kp-title{font-size:15px;font-weight:800;text-transform:uppercase;text-align:right}',
    '.kp-title small{display:block;font-size:9.5px;font-weight:400;text-transform:none;color:#555}',
    '.kp-info{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));border-top:1px solid #999;border-left:1px solid #999;margin-bottom:10px}',
    '.kp-info div{padding:5px 7px;border-right:1px solid #999;border-bottom:1px solid #999}',
    '.kp-label{display:block;font-size:8.5px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:.03em}',
    '.kp-value{font-size:11px;font-weight:700;word-break:break-word}',
    '.kp-notes{border:1px solid #999;padding:5px 7px;margin-bottom:10px;white-space:pre-wrap}',
    '.kp-section{margin:0 0 12px;break-inside:auto}',
    '.kp-section h2{font-size:10.5px;font-weight:800;text-transform:uppercase;margin:0 0 4px;letter-spacing:.03em}',
    '.kp-table{width:100%;border-collapse:collapse;table-layout:fixed}',
    '.kp-table th,.kp-table td{border:1px solid #999;padding:4px 6px;vertical-align:middle;text-align:left;word-break:break-word}',
    '.kp-table th{background:#eee;font-size:8.5px;font-weight:800;text-transform:uppercase;letter-spacing:.03em}',
    '.kp-table tr{break-inside:avoid;page-break-inside:avoid}',
    '.kp-table thead{display:table-header-group}',
    '.kp-num{text-align:right!important;white-space:nowrap}',
    '.kp-center{text-align:center!important}',
    '.kp-photo{display:block;width:34px;height:51px;object-fit:contain;background:#f3f3f3;margin:0 auto;border:1px solid #bbb}',
    // no photo is ever cropped in a print: any picture a page styled with object-fit:cover is shown whole instead
    '.kp-sheet img[style*="object-fit:cover"],.kp-sheet img[style*="object-fit: cover"]{object-fit:contain!important;background:#f3f3f3}',
    '.kp-photo-empty{display:flex;align-items:center;justify-content:center;width:34px;height:51px;margin:0 auto;border:1px dashed #bbb;color:#888;font-size:7px;text-align:center}',
    '.kp-muted{color:#666}',
    '.kp-foot{margin-top:10px;padding-top:4px;border-top:1px solid #999;display:flex;justify-content:space-between;color:#555;font-size:8.5px}',
    '.kp-sign{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:22px;break-inside:avoid}',
    '.kp-sign div{text-align:center}',
    '.kp-sign span{display:block;margin-top:42px;border-top:1px solid #111;padding-top:3px}',
    '.kp-page+.kp-page{break-before:page;page-break-before:always}',
  ].join('')

  // One printed page: heading, info boxes, notes, body, signatures and footer of a single item.
  function buildPage(options, settings) {
    var bare = settings && settings.header === false
    var info = (options.info || []).filter(function (row) { return row && row[0] })
    var icon = brandIconUrl()
    if (bare) {
      // "Cetak dengan kop" off: only the data (and signatures), no brand head, info boxes, notes or footer
      return (options.body || '') +
        (options.signatures ? '<section class="kp-sign">' + options.signatures.map(function (label) {
          return '<div>' + escapeHtml(label) + '<span>(............................)</span></div>'
        }).join('') + '</section>' : '')
    }
    return '<header class="kp-head"><div class="kp-brandbox">' +
      (icon ? '<img class="kp-logo" src="' + escapeHtml(icon) + '" alt="" onerror="this.remove()">' : '') +
      '<div class="kp-brand">' + escapeHtml(brandName()) + '<small>' + escapeHtml(brandSubtitle()) + '</small></div></div>' +
      '<div class="kp-title">' + escapeHtml(options.heading || options.title || '') +
      (options.subheading ? '<small>' + escapeHtml(options.subheading) + '</small>' : '') + '</div></header>' +
      (info.length ? '<section class="kp-info">' + info.map(function (row) {
        return '<div><span class="kp-label">' + escapeHtml(row[0]) + '</span><span class="kp-value">' + escapeHtml(row[1] == null || row[1] === '' ? '-' : row[1]) + '</span></div>'
      }).join('') + '</section>' : '') +
      (options.notes ? '<section class="kp-notes"><span class="kp-label">Catatan</span>' + escapeHtml(options.notes) + '</section>' : '') +
      (options.body || '') +
      (options.signatures ? '<section class="kp-sign">' + options.signatures.map(function (label) {
        return '<div>' + escapeHtml(label) + '<span>(............................)</span></div>'
      }).join('') + '</section>' : '') +
      '<footer class="kp-foot"><span>' + escapeHtml(options.title || '') + '</span><span>Dicetak ' + escapeHtml(nowText()) + '</span></footer>'
  }

  // The attachment pages of one item (page 2 and onward), when its checkbox is ticked in the dialog.
  function attachmentPage(page, settings) {
    var attachment = page.attachment
    if (!attachment || !attachment.body) return ''
    if (settings.attach && settings.attach[attachment.key || 'attachment'] === false) return ''
    return '<div class="kp-page">' + buildPage({
      heading: attachment.heading || 'LAMPIRAN',
      subheading: attachment.subheading,
      title: attachment.title || ((page.title || '') + ' - lampiran'),
      body: attachment.body,
    }, settings) + '</div>'
  }

  // The distinct attachment checkboxes of a print job (one per key, even when several items share it).
  function attachmentChoices(options) {
    var pages = options.pages && options.pages.length ? options.pages : [options]
    var seen = {}
    var choices = []
    pages.forEach(function (page) {
      var attachment = page.attachment
      if (!attachment || !attachment.body) return
      var key = attachment.key || 'attachment'
      if (seen[key]) return
      seen[key] = true
      choices.push({ key: key, label: attachment.label || 'Lampiran' })
    })
    return choices
  }

  // options.pages (several selected items): every item starts on its own page.
  function buildDocument(options, settings) {
    var pages = options.pages && options.pages.length ? options.pages : [options]
    return '<!doctype html><html><head><meta charset="utf-8"><base href="' + escapeHtml(window.location.origin) + '/">' +
      '<title>' + escapeHtml(options.title || 'Cetak') + '</title>' +
      '<style>' + documentCss + pageCss(settings) + '</style></head><body><main class="kp-sheet">' +
      pages.map(function (page) { return '<div class="kp-page">' + buildPage(page, settings) + '</div>' + attachmentPage(page, settings) }).join('') +
      '</main></body></html>'
  }

  function waitForImages(win, timeout) {
    var images = Array.prototype.slice.call(win.document.images || [])
    if (!images.length) return Promise.resolve()
    return Promise.race([
      Promise.all(images.map(function (image) {
        if (image.complete) return Promise.resolve()
        return new Promise(function (resolve) { image.onload = resolve; image.onerror = resolve })
      })),
      new Promise(function (resolve) { setTimeout(resolve, timeout || 8000) }),
    ])
  }

  // Custom paper size: a side left empty (or 0) takes the size of the content, so the whole job fits one page at its natural size.
  // A fixed width also shrinks content that is wider than the print area, so nothing is cut off at the right.
  function applyAutoSize(win, settings) {
    var paper = papers[settings.paper] || papers.a4
    var custom = settings.paper === 'custom'
    var width = custom ? Number(settings.width) || 0 : paper.width
    var height = custom ? Number(settings.height) || 0 : paper.height
    if (settings.orientation === 'landscape') { var swap = width; width = height; height = swap }
    var box = marginBox(settings)
    var sideX = box.left + box.right
    var sideY = box.top + box.bottom
    var pxCm = 96 / 2.54
    var doc = win.document
    var sheet = doc.querySelector('.kp-sheet')
    if (!sheet) return
    var pages = Array.prototype.slice.call(doc.querySelectorAll('.kp-page'))
    var autoWidth = width <= 0
    var autoHeight = height <= 0
    doc.body.style.padding = '0'

    var availW = (width - sideX) * pxCm
    if (autoWidth) {
      availW = (21 - sideX) * pxCm
      sheet.style.width = availW + 'px'
      pages.forEach(function (page) { availW = Math.max(availW, page.scrollWidth) })
    }
    sheet.style.width = availW + 'px'
    pages.forEach(function (page) {
      page.style.zoom = 1
      if (page.scrollWidth > availW + 1) page.style.zoom = availW / page.scrollWidth
    })
    // [data-kp-fill] (e.g. a 3 x 3 photo grid) takes all the height left on its page, below the head and above the footer
    if (!autoHeight) {
      pages.forEach(function (page) {
        var fill = page.querySelector('[data-kp-fill]')
        if (!fill) return
        var foot = page.querySelector('.kp-foot')
        var footHeight = foot ? foot.getBoundingClientRect().height + 6 : 0
        var top = fill.getBoundingClientRect().top - page.getBoundingClientRect().top
        fill.style.height = Math.max(120, (height - sideY) * pxCm - top - footHeight - 12) + 'px'
      })
    }
    if (!autoWidth && !autoHeight) return

    var pageWidth = autoWidth ? availW / pxCm + sideX : width
    var pageHeight = height
    if (autoHeight) {
      var tallest = 0
      pages.forEach(function (page) { tallest = Math.max(tallest, page.getBoundingClientRect().height) })
      pageHeight = tallest / pxCm + sideY + 0.4
    }
    var style = doc.head.querySelector('style')
    if (style) style.textContent = style.textContent.replace(/@page\{size:[^;]*;/, '@page{size:' + pageWidth.toFixed(2) + 'cm ' + pageHeight.toFixed(2) + 'cm;')
  }

  function openAndPrint(options, settings) {
    var win = window.open('', '_blank')
    if (!win) { window.alert('Jendela cetak gagal dibuka. Izinkan pop-up untuk mencetak.'); return }
    win.document.open()
    win.document.write(buildDocument(options, settings))
    win.document.close()
    win.focus()
    waitForImages(win).then(function () {
      try { applyAutoSize(win, settings) } catch (e) {}
      setTimeout(function () { win.print() }, 150)
    })
  }

  // ---- settings dialog ----
  var dialog = null
  function ensureDialog() {
    if (dialog) return dialog
    var element = document.createElement('div')
    element.className = 'modal modal-blur fade'
    element.tabIndex = -1
    element.setAttribute('aria-hidden', 'true')
    element.innerHTML =
      '<div class="modal-dialog modal-sm modal-dialog-centered" role="document"><div class="modal-content">' +
      '<div class="modal-header"><h5 class="modal-title">Pengaturan Cetak</h5><button type="button" class="btn-close" data-kp-cancel aria-label="Tutup"></button></div>' +
      '<div class="modal-body">' +
      '<label class="form-label">Ukuran kertas</label><select class="form-select mb-2" data-kp-paper>' +
      Object.keys(papers).map(function (key) { return '<option value="' + key + '">' + papers[key].label + '</option>' }).join('') + '</select>' +
      '<div class="row g-2 mb-2 d-none" data-kp-custom><div class="col-6"><label class="form-label small mb-1">Tinggi (cm)</label><input class="form-control" type="number" min="0" max="300" step="0.1" data-kp-height placeholder="Otomatis"></div>' +
      '<div class="col-6"><label class="form-label small mb-1">Lebar (cm)</label><input class="form-control" type="number" min="0" max="300" step="0.1" data-kp-width placeholder="Otomatis"></div>' +
      '<div class="col-12"><div class="form-hint">Kosongkan atau isi 0 = ukuran otomatis mengikuti isi yang dicetak, jadi muat satu halaman.</div></div></div>' +
      '<label class="form-label mt-2">Orientasi halaman</label><div class="btn-group w-100 mb-2" role="group">' +
      '<input type="radio" class="btn-check" name="kp_orientation" id="kp-portrait" value="portrait"><label class="btn" for="kp-portrait">Potret</label>' +
      '<input type="radio" class="btn-check" name="kp_orientation" id="kp-landscape" value="landscape"><label class="btn" for="kp-landscape">Lanskap</label></div>' +
      '<label class="form-label mt-2">Margin</label><select class="form-select" data-kp-margin>' +
      Object.keys(margins).map(function (key) { return '<option value="' + key + '">' + margins[key].label + '</option>' }).join('') + '</select>' +
      '<div class="row g-2 mt-1 d-none" data-kp-margin-custom>' +
      [['Top', 'Atas'], ['Bottom', 'Bawah'], ['Right', 'Kanan'], ['Left', 'Kiri']].map(function (side) {
        return '<div class="col-3"><label class="form-label small mb-1">' + side[1] + ' (cm)</label><input class="form-control px-2" type="number" min="0" max="10" step="0.1" data-kp-margin-' + side[0].toLowerCase() + '></div>'
      }).join('') + '</div>' +
      '<label class="form-label mt-2">Kop (logo, judul, info)</label><div class="btn-group w-100 mb-2" role="group">' +
      '<input type="radio" class="btn-check" name="kp_header" id="kp-header-on" value="1"><label class="btn" for="kp-header-on">Dengan kop</label>' +
      '<input type="radio" class="btn-check" name="kp_header" id="kp-header-off" value="0"><label class="btn" for="kp-header-off">Tanpa kop</label></div>' +
      '<div class="mt-3 d-none" data-kp-extras></div>' +
      '<div class="form-hint mt-2">Setelah ini jendela cetak browser terbuka. Pilih printer, atau "Simpan sebagai PDF".</div>' +
      '</div><div class="modal-footer"><button type="button" class="btn" data-kp-cancel>Batal</button><button type="button" class="btn btn-primary" data-kp-print>Cetak</button></div>' +
      '</div></div>'
    document.body.appendChild(element)
    dialog = { element: element, onPrint: null }
    var paper = element.querySelector('[data-kp-paper]')
    var marginSelect = element.querySelector('[data-kp-margin]')
    marginSelect.addEventListener('change', function () { element.querySelector('[data-kp-margin-custom]').classList.toggle('d-none', marginSelect.value !== 'custom') })
    paper.addEventListener('change', function () { element.querySelector('[data-kp-custom]').classList.toggle('d-none', paper.value !== 'custom') })
    element.addEventListener('click', function (event) {
      if (event.target.closest('[data-kp-cancel]')) hide()
      if (event.target.closest('[data-kp-print]') && dialog.onPrint) {
        var settings = {
          paper: paper.value,
          width: Number(element.querySelector('[data-kp-width]').value) || 0,
          height: Number(element.querySelector('[data-kp-height]').value) || 0,
          orientation: (element.querySelector('[name="kp_orientation"]:checked') || {}).value || 'portrait',
          margin: element.querySelector('[data-kp-margin]').value,
          marginTop: Number(element.querySelector('[data-kp-margin-top]').value) || 0,
          marginRight: Number(element.querySelector('[data-kp-margin-right]').value) || 0,
          marginBottom: Number(element.querySelector('[data-kp-margin-bottom]').value) || 0,
          marginLeft: Number(element.querySelector('[data-kp-margin-left]').value) || 0,
          header: (element.querySelector('[name="kp_header"]:checked') || {}).value !== '0',
          attach: {},
        }
        element.querySelectorAll('[data-kp-attach]').forEach(function (box) { settings.attach[box.dataset.kpAttach] = box.checked })
        var callback = dialog.onPrint
        hide()
        callback(settings)
      }
    })
    return dialog
  }
  function modalApi() { return (window.tabler && window.tabler.bootstrap && window.tabler.bootstrap.Modal) || (window.bootstrap && window.bootstrap.Modal) }
  function show() {
    var api = modalApi()
    if (api) { api.getOrCreateInstance(dialog.element).show(); return }
    dialog.element.classList.add('show'); dialog.element.style.display = 'block'
  }
  function hide() {
    var api = modalApi()
    if (api) { var instance = api.getInstance(dialog.element); if (instance) instance.hide(); return }
    dialog.element.classList.remove('show'); dialog.element.style.display = 'none'
  }

  window.KoiPrint = {
    escapeHtml: escapeHtml,
    // Number with at most one decimal, like Data Ikan (85, 45,5)
    size: function (value) {
      var number = Number(value)
      if (value === null || value === undefined || String(value).trim() === '' || !Number.isFinite(number)) return ''
      return number.toLocaleString('id-ID', { maximumFractionDigits: 1 })
    },
    photo: function (src, alt) {
      return src
        ? '<img class="kp-photo" src="' + escapeHtml(src) + '" alt="' + escapeHtml(alt || 'Foto ikan') + '">'
        : '<div class="kp-photo-empty">Tanpa foto</div>'
    },
    // Prints several items in one document, one page each, with a single "Pengaturan Cetak" dialog.
    // `build(item)` is the page's own single-item print function; its KoiPrint.print call is captured
    // instead of opened, so every page keeps exactly the layout of its normal print.
    printMany: function (items, build, options) {
      var pages = []
      var original = window.KoiPrint.print
      window.KoiPrint.print = function (pageOptions) { pages.push(pageOptions) }
      try {
        items.forEach(function (item) { build(item) })
      } finally {
        window.KoiPrint.print = original
      }
      if (!pages.length) return
      if (pages.length === 1) { original(pages[0]); return }
      original(Object.assign({}, pages[0], { title: (options && options.title) || pages[0].title, pages: pages }))
    },
    print: function (options) {
      var key = options.key || 'default'
      var settings = loadSettings(key, options.orientation)
      fetchServerSettings()
      var d = ensureDialog()
      var el = d.element
      el.querySelector('[data-kp-paper]').value = settings.paper
      el.querySelector('[data-kp-width]').value = Number(settings.width) > 0 ? settings.width : ''
      el.querySelector('[data-kp-height]').value = Number(settings.height) > 0 ? settings.height : ''
      el.querySelector('[data-kp-custom]').classList.toggle('d-none', settings.paper !== 'custom')
      el.querySelector(settings.orientation === 'landscape' ? '#kp-landscape' : '#kp-portrait').checked = true
      el.querySelector(settings.header === false ? '#kp-header-off' : '#kp-header-on').checked = true
      el.querySelector('[data-kp-margin]').value = settings.margin
      ;['Top', 'Right', 'Bottom', 'Left'].forEach(function (side) {
        var value = Number(settings['margin' + side])
        el.querySelector('[data-kp-margin-' + side.toLowerCase() + ']').value = Number.isFinite(value) ? value : 1
      })
      el.querySelector('[data-kp-margin-custom]').classList.toggle('d-none', settings.margin !== 'custom')
      // attachments (e.g. documentation) are offered per print job and always start ticked
      var choices = attachmentChoices(options)
      var extras = el.querySelector('[data-kp-extras]')
      extras.innerHTML = choices.length
        ? '<label class="form-label">Lampiran</label>' + choices.map(function (choice) {
            return '<label class="form-check mb-1"><input class="form-check-input" type="checkbox" checked data-kp-attach="' + escapeHtml(choice.key) + '"><span class="form-check-label">' + escapeHtml(choice.label) + '</span></label>'
          }).join('') + '<div class="form-hint">Dicetak di halaman 2 dan seterusnya, hanya untuk dokumen yang punya lampiran.</div>'
        : ''
      extras.classList.toggle('d-none', !choices.length)
      d.onPrint = function (chosen) {
        var toSave = Object.assign({}, chosen)
        delete toSave.attach
        saveSettings(key, toSave)
        // buildPages(settings): for prints whose pages depend on the chosen paper (e.g. 9 photos portrait, 18 landscape)
        var finalOptions = typeof options.buildPages === 'function' ? Object.assign({}, options, { pages: options.buildPages(chosen) }) : options
        openAndPrint(finalOptions, chosen)
      }
      show()
    },
  }
})()
