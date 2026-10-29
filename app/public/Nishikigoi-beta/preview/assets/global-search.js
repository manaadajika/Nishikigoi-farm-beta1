// Pencarian global (kotak cari di navbar) - HANYA di Dashboard.
// Di Dashboard, mengetik menampilkan dropdown hasil dari Data Ikan, Arsip, Data Kolam, Breeding, Laporan, Katalog,
// Invoice, Inventaris, dan Galeri, ditambah menu dan pengaturan program. Klik hasil membuka item itu di menunya.
// Tanpa mengetik, dropdown menampilkan pencarian terakhir dan pintasan menu.
// Di menu lain kotak cari tetap pencarian biasa milik halaman itu (menyaring daftar, kolom:isi dsb);
// berkas ini di sana hanya meneruskan hasil pilihan dari Dashboard (?cari=, tindakan setelah pindah halaman).
;(function () {
  var input = null
  var panel = null
  var recentKey = 'nishikigoi-recent-searches'
  var afterNavKey = 'nishikigoi-after-nav'
  var timer = null
  var controller = null
  var lastQuery = ''
  var dataGroups = []
  var dataMeta = null
  var active = -1

  var ICONS = {
    search: '<circle cx="10" cy="10" r="7"/><path d="M21 21l-6 -6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
    fish: '<path d="M16.69 7.44a6.973 6.973 0 0 0 -1.69 4.56c0 1.747 .64 3.345 1.699 4.571"/><path d="M2 9.504c7.715 8.647 14.75 10.265 20 2.498c-5.25 -7.761 -12.285 -6.142 -20 2.504"/><path d="M18 11v.01"/><path d="M11.5 10.5c-.667 1 -.667 2 0 3"/>',
    archive: '<path d="M3 4m0 2a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z"/><path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-10"/><path d="M10 12l4 0"/>',
    bowl: '<path d="M4 12h16a1 1 0 0 1 1 1a8 8 0 0 1 -8 8h-2a8 8 0 0 1 -8 -8a1 1 0 0 1 1 -1z"/><path d="M6 9a6 3 0 0 1 12 0"/>',
    'dna-2': '<path d="M17 3v1c0 2.5 -2 4.5 -5 6c-3 1.5 -5 3.5 -5 6v1"/><path d="M7 3v1c0 2.5 2 4.5 5 6c3 1.5 5 3.5 5 6v1"/><path d="M10 8h4"/><path d="M10 16h4"/>',
    report: '<path d="M8 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h5.697"/><path d="M18 14v4h4"/><path d="M18 11v-4a2 2 0 0 0 -2 -2h-2"/><path d="M8 3m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z"/><path d="M18 18m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0"/>',
    tag: '<path d="M7.5 7.5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M3 6v5.172a2 2 0 0 0 .586 1.414l7.71 7.71a2.41 2.41 0 0 0 3.408 0l5.592 -5.592a2.41 2.41 0 0 0 0 -3.408l-7.71 -7.71a2 2 0 0 0 -1.414 -.586h-5.172a3 3 0 0 0 -3 3z"/>',
    'file-invoice': '<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M19 12v7a1.78 1.78 0 0 1 -3.1 1.4a1.65 1.65 0 0 0 -2.6 0a1.65 1.65 0 0 1 -2.6 0a1.65 1.65 0 0 0 -2.6 0a1.78 1.78 0 0 1 -3.1 -1.4v-14a2 2 0 0 1 2 -2h7l5 5v4"/><path d="M9 7h1"/><path d="M9 13h6"/><path d="M9 17h6"/>',
    package: '<path d="M12 3l8 4.5l0 9l-8 4.5l-8 -4.5l0 -9l8 -4.5"/><path d="M12 12l8 -4.5"/><path d="M12 12l0 9"/><path d="M12 12l-8 -4.5"/><path d="M16 5.25l-8 4.5"/>',
    photo: '<path d="M15 8h.01"/><path d="M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12z"/><path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5"/><path d="M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3"/>',
    settings: '<path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z"/><path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"/>',
    page: '<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z"/>',
    x: '<path d="M18 6l-12 12"/><path d="M6 6l12 12"/>',
  }
  function icon(name) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || ICONS.page) + '</svg>'
  }

  // Menu dan pengaturan. perm = izin yang dibutuhkan (sama dengan data-role-required di menu).
  var PAGES = [
    { t: 'Dashboard', u: 'farm.html', k: 'ringkasan statistik indukan home', i: 'page', s: 'Menu' },
    { t: 'Data Ikan', u: 'farm-koi.html', k: 'ikan koi kode varietas bloodline daftar', i: 'fish', s: 'Menu' },
    { t: 'Data Kolam', u: 'farm-ponds.html', k: 'kolam area lokasi tempat air', i: 'bowl', s: 'Menu' },
    { t: 'Breeding', u: 'farm-breeding.html', k: 'pemijahan induk jantan betina spawning', i: 'dna-2', s: 'Menu' },
    { t: 'Laporan', u: 'farm-reports.html', k: 'report kegiatan panen perikanan ikan datang sortir', i: 'report', s: 'Menu' },
    { t: 'Katalog', u: 'farm-sell.html', k: 'jual penjualan harga dijual dagang', i: 'tag', s: 'Penjualan' },
    { t: 'Invoice', u: 'farm-invoice.html', k: 'tagihan nota faktur pembayaran bukti transfer', i: 'file-invoice', s: 'Penjualan' },
    { t: 'Inventaris', u: 'farm-inventory.html', k: 'stok barang gudang belanja pakan obat aset rusak pembelian', i: 'package', s: 'Lainnya', perm: 'database-write' },
    { t: 'Arsip', u: 'farm-archive.html', k: 'arsip archive ikan diarsipkan', i: 'archive', s: 'Lainnya', perm: 'database-write' },
    { t: 'Antrean', u: 'farm-queue.html', k: 'antrean antrian queue draft job pekerjaan lanjutkan', i: 'page', s: 'Lainnya', perm: 'database-write' },
    { t: 'Galeri', u: 'farm-gallery.html', k: 'galeri gallery foto video koleksi dokumentasi', i: 'photo', s: 'Lainnya', perm: 'database-write' },
    { t: 'Log Sistem', u: 'farm-log.html', k: 'log riwayat aktivitas sistem catatan', i: 'page', s: 'Lainnya', perm: 'database-write' },
    { t: 'Change Log', u: 'farm-log.html', click: '[data-log-tab="changelog"]', k: 'versi perubahan update rilis changelog', i: 'page', s: 'Lainnya', perm: 'database-write' },
    { t: 'Panduan Penggunaan', u: 'farm-log.html', click: '[data-log-tab="panduan"]', k: 'panduan cara pakai bantuan tutorial help', i: 'page', s: 'Lainnya', perm: 'database-write' },
    { t: 'Theme Settings', u: 'settings.html', click: '[data-bs-target="#offcanvas-settings"]', k: 'tema warna gelap terang dark light mode tampilan font', i: 'settings', s: 'Pengaturan' },
    { t: 'Give Feedback', u: 'settings.html', click: '[data-feedback-open]', k: 'feedback masukan saran laporan masalah kirim pesan ke master', i: 'settings', s: 'Pengaturan' },
    { t: 'Pengaturan Akun', u: 'settings.html', k: 'akun profil password kata sandi email foto', i: 'settings', s: 'Pengaturan' },
    { t: 'Pesan', u: 'farm.html?pesan=1', k: 'message pesan inbox feedback masukan', i: 'page', s: 'Pengaturan' },
    { t: 'Master Akun', u: 'settings-master-account.html', k: 'kelola akun tambah akun daftar akun pengguna role hak akses', i: 'settings', s: 'Pengaturan', perm: 'master-admin' },
    { t: 'Backup & Restore Sistem', u: 'settings-master-account.html#backup-restore', k: 'backup restore cadangan pulihkan unduh data bersihkan hapus semua', i: 'settings', s: 'Pengaturan', perm: 'master-admin' },
    { t: 'Identitas Program', u: 'settings-master-account.html', k: 'logo nama program brand favicon ikon identitas', i: 'settings', s: 'Pengaturan', perm: 'master-admin' },
    { t: 'Riwayat Login', u: 'settings-master-account.html', k: 'login masuk riwayat sesi perangkat', i: 'settings', s: 'Pengaturan', perm: 'master-admin' },
    { t: 'Lisensi', u: 'license.html', k: 'license lisensi mit hak cipta', i: 'page', s: 'Pengaturan' },
    { t: 'Beranda', u: 'landing.html', k: 'halaman depan landing page profil farm', i: 'page', s: 'Pengaturan' },
  ]

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>'"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]
    })
  }
  function norm(value) { return String(value == null ? '' : value).toLowerCase().trim() }
  function termsOf(query) { return norm(query).split(/\s+/).filter(function (t) { return t.length > 0 }) }
  function highlight(text, terms) {
    var safe = escapeHtml(text)
    terms.forEach(function (term) {
      if (term.length < 2) return
      var re = new RegExp('(' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig')
      safe = safe.replace(re, '<mark>$1</mark>')
    })
    return safe
  }
  function denied(perm) {
    if (!perm) return false
    return (document.documentElement.getAttribute('data-koi-deny') || '').split(' ').indexOf(perm) >= 0
  }
  function readRecent() {
    try { var list = JSON.parse(localStorage.getItem(recentKey) || '[]'); return Array.isArray(list) ? list : [] } catch (e) { return [] }
  }
  function writeRecent(list) {
    try { localStorage.setItem(recentKey, JSON.stringify(list.slice(0, 6))) } catch (e) {}
  }
  function remember(query) {
    var q = String(query || '').trim()
    if (q.length < 2) return
    writeRecent([q].concat(readRecent().filter(function (item) { return item.toLowerCase() !== q.toLowerCase() })))
  }

  var CSS = '' +
    '.gs-panel{position:fixed;z-index:2100;max-height:min(72vh,560px);overflow:auto;background:var(--tblr-bg-surface,#fff);color:var(--tblr-body-color,#1d273b);' +
    'border:1px solid var(--tblr-border-color,#dce1e7);border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,.35);padding:6px 0}' +
    '.gs-head{padding:8px 14px 4px;font-size:.7rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--tblr-secondary,#667382);display:flex;justify-content:space-between;align-items:center}' +
    '.gs-item{display:flex;align-items:center;gap:10px;width:100%;padding:7px 14px;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer;text-decoration:none}' +
    '.gs-item:hover,.gs-item.is-active{background:var(--tblr-bg-surface-secondary,#f1f5f9)}' +
    '.gs-icon{flex:0 0 auto;width:34px;height:34px;display:flex;align-items:center;justify-content:center;border-radius:8px;background:var(--tblr-bg-surface-secondary,#f1f5f9);color:var(--tblr-secondary,#667382);overflow:hidden}' +
    '.gs-icon img{width:100%;height:100%;object-fit:cover}' +
    '.gs-icon.gs-photo{width:36px;height:54px;border-radius:6px;background:var(--tblr-bg-surface-secondary,#f1f5f9)}' +
    '.gs-icon.gs-photo img{object-fit:contain}' +
    '.gs-main{min-width:0;flex:1 1 auto}' +
    '.gs-title{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.gs-sub{font-size:.8rem;color:var(--tblr-secondary,#667382);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.gs-tag{flex:0 0 auto;font-size:.7rem;color:var(--tblr-secondary,#667382);border:1px solid var(--tblr-border-color,#dce1e7);border-radius:999px;padding:1px 8px}' +
    '.gs-empty{padding:14px;color:var(--tblr-secondary,#667382);font-size:.9rem}' +
    '.gs-x{border:0;background:transparent;color:var(--tblr-secondary,#667382);cursor:pointer;padding:2px;line-height:1}' +
    '.gs-panel mark{background:rgba(247,103,7,.28);color:inherit;padding:0 1px;border-radius:2px}'

  function ensurePanel() {
    if (panel) return panel
    var style = document.createElement('style')
    style.textContent = CSS
    document.head.appendChild(style)
    panel = document.createElement('div')
    panel.className = 'gs-panel'
    panel.setAttribute('role', 'listbox')
    panel.hidden = true
    panel.addEventListener('mousedown', function (event) { event.preventDefault() }) // jangan lepas fokus kotak cari
    document.body.appendChild(panel)
    return panel
  }
  function place() {
    if (!panel || !input) return
    var rect = input.getBoundingClientRect()
    // rata tengah terhadap kotak cari, tetap di dalam layar
    var width = Math.max(Math.min(620, window.innerWidth - 16), Math.min(rect.width, window.innerWidth - 16))
    var left = rect.left + rect.width / 2 - width / 2
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8))
    panel.style.top = Math.round(rect.bottom + 6) + 'px'
    panel.style.left = Math.round(left) + 'px'
    panel.style.width = Math.round(width) + 'px'
  }
  function open() {
    ensurePanel()
    place()
    panel.hidden = false
  }
  function close() {
    if (panel) panel.hidden = true
    active = -1
  }
  function items() { return panel ? Array.prototype.slice.call(panel.querySelectorAll('[data-gs-item]')) : [] }
  function setActive(index) {
    var list = items()
    if (!list.length) { active = -1; return }
    active = (index + list.length) % list.length
    list.forEach(function (el, i) { el.classList.toggle('is-active', i === active) })
    list[active].scrollIntoView({ block: 'nearest' })
  }

  function go(entry, query) {
    remember(query || (input && input.value))
    close()
    if (entry.click) {
      var here = entry.u ? new URL(entry.u, window.location.href).pathname.replace(/\/$/, '') === window.location.pathname.replace(/\/$/, '') : true
      if (here) { triggerClick(entry.click); return }
      try { sessionStorage.setItem(afterNavKey, JSON.stringify({ click: entry.click, at: Date.now() })) } catch (e) {}
    }
    var target = entry.u
    if (target) {
      var url = new URL(target, window.location.href)
      var sameTarget = url.pathname === window.location.pathname && url.search === window.location.search
      if (!sameTarget) { window.location.href = url.pathname + url.search + url.hash; return }
      if (entry.click) return
      if (url.hash) { window.location.hash = url.hash; return }
      window.location.reload()
    }
  }
  function triggerClick(selector) {
    var tries = 0
    var iv = setInterval(function () {
      tries += 1
      var el = document.querySelector(selector)
      if (el) { clearInterval(iv); el.click() } else if (tries > 25) clearInterval(iv)
    }, 200)
  }

  function row(entry, terms, tag) {
    var thumb = entry.image
      ? '<span class="gs-icon gs-photo"><img src="' + escapeHtml(entry.image) + '" alt="" loading="lazy"></span>'
      : '<span class="gs-icon">' + icon(entry.i || 'page') + '</span>'
    return '<button type="button" class="gs-item" role="option" data-gs-item data-gs-key="' + escapeHtml(entry.key) + '">' + thumb +
      '<span class="gs-main"><span class="gs-title d-block">' + highlight(entry.t, terms) + '</span>' +
      (entry.sub ? '<span class="gs-sub d-block">' + highlight(entry.sub, terms) + '</span>' : '') + '</span>' +
      (tag ? '<span class="gs-tag">' + escapeHtml(tag) + '</span>' : '') + '</button>'
  }

  var registry = {}
  function register(entry) {
    var key = 'e' + Object.keys(registry).length
    entry.key = key
    registry[key] = entry
    return entry
  }

  // "Tidak ada hasil": tanda seru kecil di samping tombol hapus (x) pada kotak cari, bukan panel dropdown
  var notice = null
  function setNotice(text, failed) {
    if (!input) return
    var wrap = input.closest('.navbar-global-search')
    if (!wrap) return
    if (!notice) {
      notice = document.createElement('span')
      notice.setAttribute('role', 'status')
      notice.style.cssText = 'position:absolute;top:50%;right:2.4rem;transform:translateY(-50%);display:flex;line-height:0;cursor:help;z-index:2;opacity:.9'
      notice.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>'
    }
    // sama halusnya dengan tombol hapus (x): warna sekunder, bukan kuning/merah
    notice.style.color = 'var(--tblr-secondary)'
    notice.title = text
    notice.setAttribute('aria-label', text)
    if (notice.parentNode !== wrap) wrap.appendChild(notice)
    input.style.paddingRight = '4rem'
  }
  function clearNotice() {
    if (notice && notice.parentNode) notice.parentNode.removeChild(notice)
    if (input) input.style.paddingRight = ''
  }

  function renderIdle() {
    clearNotice()
    ensurePanel()
    registry = {}
    var html = ''
    var recent = readRecent()
    if (recent.length) {
      html += '<div class="gs-head"><span>Pencarian terakhir</span><button type="button" class="gs-x" data-gs-clear-recent>Hapus</button></div>'
      recent.forEach(function (q) {
        var e = register({ t: q, i: 'clock', recent: true })
        html += row(e, [], '')
      })
    }
    html += '<div class="gs-head"><span>Pintasan</span></div>'
    PAGES.filter(function (p) { return !denied(p.perm) }).slice(0, 7).forEach(function (p) {
      html += row(register({ t: p.t, u: p.u, click: p.click, i: p.i }), [], p.s)
    })
    panel.innerHTML = html
    active = -1
    open()
  }

  // how many results one group (koi = Data Ikan, archive = Arsip) holds
  function groupCount(key) {
    var count = 0
    dataGroups.forEach(function (g) { if (g.key === key) count += g.items.length })
    return count
  }

  // Enter without choosing a row: when the text is a fish ID (or a list of IDs) the answer is clear, go there:
  // all of them in Data Ikan, all of them in the archive, or the single fish found. Mixed results stay a choice.
  function enterTarget(query) {
    var q = String(query || '').trim()
    if (q.length < 2 || q !== lastQuery) return ''
    var inData = groupCount('koi')
    var inArchive = groupCount('archive')
    if (inData && inArchive) return ''
    var encoded = encodeURIComponent(q)
    if (dataMeta) {
      if (inArchive) return 'farm-koi.html?arsip=1&cari=' + encoded
      return inData ? 'farm-koi.html?cari=' + encoded : ''
    }
    var only = dataGroups.filter(function (g) { return g.key === 'koi' || g.key === 'archive' })
    var others = dataGroups.filter(function (g) { return g.key !== 'koi' && g.key !== 'archive' })
    if (others.length || only.length !== 1 || only[0].items.length !== 1) return ''
    // only a fish whose code IS the text (a code is typed whole), not any fish that merely contains it
    if (String(only[0].items[0].title || '').trim().toLowerCase() !== q.toLowerCase()) return ''
    return only[0].items[0].url || ''
  }

  function renderResults(query, loading, failed) {
    clearNotice()
    ensurePanel()
    registry = {}
    var terms = termsOf(query)
    var html = ''
    var menu = PAGES.filter(function (p) {
      if (denied(p.perm)) return false
      var hay = norm(p.t + ' ' + p.k + ' ' + p.s)
      return terms.every(function (term) { return hay.indexOf(term) >= 0 })
    }).slice(0, 4)
    if (menu.length) {
      html += '<div class="gs-head"><span>Menu dan pengaturan</span></div>'
      menu.forEach(function (p) { html += row(register({ t: p.t, u: p.u, click: p.click, i: p.i }), terms, p.s) })
    }
    if (dataMeta && !loading) {
      var found = 0
      dataGroups.forEach(function (g) { found += g.items.length })
      html += '<div class="gs-head"><span>Daftar kode ikan</span></div><div class="gs-empty" style="padding:4px 14px 8px">' + found + ' dari ' + dataMeta.requested + ' kode ditemukan' +
        (dataMeta.missing.length ? '. Tidak ditemukan: ' + escapeHtml(dataMeta.missing.slice(0, 8).join(', ')) + (dataMeta.missing.length > 8 ? ' dan ' + (dataMeta.missing.length - 8) + ' lainnya' : '') : '') + '</div>'
      // the codes may sit in Data Ikan, in the archive, or both: one shortcut for each place that has some
      var inData = groupCount('koi')
      var inArchive = groupCount('archive')
      if (inData) html += row(register({ t: 'Tampilkan semua di Data Ikan', sub: inData + ' kode ini disaring langsung di halaman Data Ikan', u: 'farm-koi.html?cari=' + encodeURIComponent(query), i: 'fish' }), [], '')
      if (inArchive) html += row(register({ t: 'Tampilkan semua di Arsip', sub: inArchive + ' kode ini ada di Arsip (ikan yang diarsipkan)', u: 'farm-koi.html?arsip=1&cari=' + encodeURIComponent(query), i: 'archive' }), [], '')
    }
    dataGroups.forEach(function (group) {
      html += '<div class="gs-head"><span>' + escapeHtml(group.label) + '</span></div>'
      group.items.forEach(function (it) {
        html += row(register({ t: it.title, sub: it.subtitle, u: it.url, image: it.image, i: group.icon }), terms, '')
      })
      if (group.more) {
        var page = { koi: 'farm-koi.html', archive: 'farm-koi.html?arsip=1', ponds: 'farm-ponds.html', breeding: 'farm-breeding.html', reports: 'farm-reports.html', sell: 'farm-sell.html', invoices: 'farm-invoice.html', inventory: 'farm-inventory.html', gallery: 'farm-gallery.html' }[group.key]
        if (page) {
          var sep = page.indexOf('?') >= 0 ? '&' : '?'
          html += row(register({ t: 'Lihat semua di ' + group.label, u: page + sep + 'cari=' + encodeURIComponent(query), i: 'search' }), [], '')
        }
      }
    })
    if (!menu.length && !dataGroups.length) {
      if (loading) {
        html += '<div class="gs-empty">Mencari...</div>'
      } else {
        // tidak ada hasil / gagal: cukup tanda seru di kotak cari
        panel.innerHTML = ''
        close()
        setNotice(failed ? 'Pencarian gagal dimuat. Periksa koneksi lalu coba lagi.' : 'Tidak ada hasil untuk “' + query + '”. Coba kata kunci lain.', failed)
        return
      }
    } else if (loading) {
      html += '<div class="gs-empty" style="padding:6px 14px">Mencari di semua menu...</div>'
    }
    panel.innerHTML = html
    active = -1
    open()
  }

  function search(query) {
    lastQuery = query
    if (controller) try { controller.abort() } catch (e) {}
    controller = typeof AbortController === 'function' ? new AbortController() : null
    renderResults(query, true, false)
    fetch('/api/search?q=' + encodeURIComponent(query), controller ? { signal: controller.signal } : undefined)
      .then(function (response) { if (!response.ok) throw new Error('bad'); return response.json() })
      .then(function (data) {
        if (query !== lastQuery) return
        dataGroups = Array.isArray(data.groups) ? data.groups : []
        dataMeta = data.mode === 'codes' ? { requested: data.requested || 0, missing: data.missing || [] } : null
        renderResults(query, false, false)
      })
      .catch(function (error) {
        if (error && error.name === 'AbortError') return
        if (query !== lastQuery) return
        dataGroups = []
        dataMeta = null
        renderResults(query, false, true)
      })
  }

  function onInput() {
    clearTimeout(timer)
    var query = input.value.trim()
    if (query.length < 2) {
      dataGroups = []
      dataMeta = null
      lastQuery = ''
      if (controller) try { controller.abort() } catch (e) {}
      if (document.activeElement === input) renderIdle()
      return
    }
    timer = setTimeout(function () { search(query) }, 220)
  }

  function onKey(event) {
    if (!panel || panel.hidden) {
      if (event.key === 'ArrowDown') { if (input.value.trim().length >= 2) search(input.value.trim()); else renderIdle() }
      return
    }
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive(active + 1) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(active - 1) }
    else if (event.key === 'Escape') { close() }
    else if (event.key === 'Enter') {
      var list = items()
      if (active >= 0 && list[active]) { event.preventDefault(); activate(list[active]) }
      else {
        var target = enterTarget(input.value)
        if (target) { event.preventDefault(); go({ u: target }, input.value) } else { remember(input.value); close() }
      }
    }
  }

  function activate(el) {
    var entry = registry[el.getAttribute('data-gs-key')]
    if (!entry) return
    if (entry.recent) {
      input.value = entry.t
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.focus()
      return
    }
    go(entry, input.value)
  }

  // pencarian pintar hanya untuk Dashboard (farm.html); menu lain memakai pencarian bawaannya
  function onDashboard() {
    var name = window.location.pathname.replace(/\/$/, '').split('/').pop().replace(/\.html$/, '')
    return name === 'farm'
  }

  function bind() {
    if (!onDashboard()) return
    input = document.querySelector('.navbar-global-search-input')
    if (!input || input.dataset.gsReady) return
    input.dataset.gsReady = '1'
    input.setAttribute('autocomplete', 'off')
    input.setAttribute('aria-autocomplete', 'list')
    input.addEventListener('focus', function () {
      if (input.value.trim().length >= 2) { if (dataGroups.length || lastQuery) renderResults(input.value.trim(), false, false); else search(input.value.trim()) }
      else renderIdle()
    })
    input.addEventListener('input', onInput)
    input.addEventListener('keydown', onKey)
    input.addEventListener('blur', function () { setTimeout(close, 150) })
    document.addEventListener('click', function (event) {
      if (!panel || panel.hidden) return
      var item = event.target.closest && event.target.closest('[data-gs-item]')
      if (item && panel.contains(item)) { activate(item); return }
      if (event.target.closest && event.target.closest('[data-gs-clear-recent]')) { writeRecent([]); renderIdle(); return }
      if (!event.target.closest || !event.target.closest('.navbar-global-search')) close()
    })
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    var clear = input.closest('.navbar-global-search')
    if (clear) {
      var button = clear.querySelector('[data-navbar-search-clear]')
      if (button) button.addEventListener('click', function () { dataGroups = []; lastQuery = ''; setTimeout(renderIdle, 0) })
    }
  }

  // ?cari=KODE: dibawa dari hasil pencarian global; mengisi kotak cari halaman tujuan
  function applyCari() {
    var params
    try { params = new URLSearchParams(window.location.search) } catch (e) { return }
    var value = params.get('cari')
    if (!value) return
    var tries = 0
    var iv = setInterval(function () {
      tries += 1
      var pageInput = document.querySelector('[data-koi-search], [data-pond-search], [data-gallery-search], [data-report-search], [data-breeding-search], [data-log-search], [data-sell-search], [data-invoice-search], [data-inventory-search]')
      var globalInput = document.querySelector('.navbar-global-search-input')
      if (pageInput) {
        clearInterval(iv)
        pageInput.value = value
        pageInput.dispatchEvent(new Event('input', { bubbles: true }))
        if (globalInput) {
          globalInput.value = value
          var wrapper = globalInput.closest('.navbar-global-search')
          if (wrapper) wrapper.classList.add('has-value')
        }
        params.delete('cari')
        var rest = params.toString()
        try { window.history.replaceState(null, '', window.location.pathname + (rest ? '?' + rest : '')) } catch (e) {}
      } else if (tries > 40) clearInterval(iv)
    }, 150)
  }

  // tindakan setelah pindah halaman (mis. membuka tab Panduan atau Theme Settings)
  function applyAfterNav() {
    var raw
    try { raw = sessionStorage.getItem(afterNavKey); sessionStorage.removeItem(afterNavKey) } catch (e) { return }
    if (!raw) return
    try {
      var data = JSON.parse(raw)
      if (data && data.click && Date.now() - Number(data.at || 0) < 15000) triggerClick(data.click)
    } catch (e) {}
  }

  function start() {
    bind()
    applyCari()
    applyAfterNav()
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
  else start()
})()
