// Lainnya > Arsip: "Ikan | Galeri" switch. The Galeri tab lists archived gallery collections with
// Kembalikan (restore to Galeri) and Hapus permanen. Collections made from a report are removed
// from the Laporan menu, so Hapus shows a warning pointing there instead.
;(function () {
  var tabKey = 'nishikigoi-archive-tab'

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    })
  }
  function formatDate(value) {
    if (!value) return '-'
    return window.KoiAuth && window.KoiAuth.formatDate ? window.KoiAuth.formatDate(String(value).slice(0, 10)) : String(value).slice(0, 10)
  }
  function canWrite() {
    return Boolean(window.KoiAuth && window.KoiAuth.canAccess && window.KoiAuth.canAccess('database-write'))
  }
  function request(path, options) {
    return window.KoiAuth.apiRequest(path, options).then(function (response) {
      return response.json().catch(function () { return {} }).then(function (data) {
        if (!response.ok) throw new Error(data.error || 'Permintaan gagal')
        return data
      })
    })
  }

  function start() {
    var fishCards = document.querySelector('[data-archive-cards]')
    if (!fishCards) return
    var fishCard = fishCards.closest('.card')
    var searchInput = document.querySelector('[data-koi-search]')
    var tab = 'ikan'
    try { tab = sessionStorage.getItem(tabKey) === 'galeri' ? 'galeri' : 'ikan' } catch (e) {}
    // the fish list lives in Data Ikan (archive view): the Ikan tab leads there
    if (tab === 'ikan') { window.location.replace('./farm-koi.html?arsip=1'); return }
    var collections = []

    var switcher = document.createElement('div')
    switcher.className = 'btn-group mb-3'
    switcher.setAttribute('role', 'group')
    switcher.innerHTML =
      '<button type="button" class="btn" data-archive-tab="ikan">Ikan</button>' +
      '<button type="button" class="btn" data-archive-tab="galeri">Galeri <span class="badge bg-secondary-lt ms-1" data-archive-gallery-count>0</span></button>'
    fishCard.parentNode.insertBefore(switcher, fishCard)

    var panel = document.createElement('div')
    panel.className = 'card d-none'
    panel.innerHTML =
      '<div class="card-header"><div><h3 class="card-title">Galeri diarsipkan</h3>' +
      '<div class="text-secondary small">Koleksi yang diarsipkan dari menu Galeri. Kembalikan untuk menampilkannya lagi di Galeri.</div></div></div>' +
      '<div class="card-body"><div class="alert alert-danger d-none" role="alert" data-archive-gallery-notice></div>' +
      '<div class="row g-3" data-archive-gallery-list><div class="col-12 text-secondary">Memuat arsip galeri.</div></div></div>'
    fishCard.parentNode.insertBefore(panel, fishCard.nextSibling)
    var list = panel.querySelector('[data-archive-gallery-list]')
    var notice = panel.querySelector('[data-archive-gallery-notice]')

    function applyTab() {
      switcher.querySelectorAll('[data-archive-tab]').forEach(function (button) {
        var active = button.dataset.archiveTab === tab
        button.classList.toggle('btn-primary', active)
        button.setAttribute('aria-pressed', active ? 'true' : 'false')
      })
      fishCard.classList.toggle('d-none', tab !== 'ikan')
      panel.classList.toggle('d-none', tab !== 'galeri')
    }

    // Collections that follow a Laporan, a Breeding session or a pond's documentation.
    function sourceInfo(item) {
      if (item.source_type === 'report') return { label: 'Dari Laporan ' + (item.report_batch_code || ''), menu: 'Laporan', href: './farm-reports.html', how: 'buka laporannya, lalu lepas centang "Tampilkan media di Galeri" atau hapus laporannya' }
      if (item.source_type === 'breeding') return { label: 'Dari Breeding ' + (item.breeding_batch_code || ''), menu: 'Breeding', href: './farm-breeding.html', how: 'buka sesinya, lalu lepas centang "Tampilkan dokumentasi di Galeri" atau hapus sesinya' }
      if (item.source_type === 'sell') return { label: 'Dari Katalog ' + (item.sell_title || ''), menu: 'Penjualan > Katalog', href: './farm-sell.html', how: 'buka itemnya, lalu lepas centang "Tampilkan dokumentasi di Galeri" atau hapus itemnya' }
      if (item.source_type === 'invoice') return { label: 'Dari Invoice ' + (item.invoice_no || ''), menu: 'Penjualan > Invoice', href: './farm-invoice.html', how: 'buka invoicenya, lalu lepas centang "Tampilkan dokumentasi di Galeri" atau hapus invoicenya' }
      if (item.source_type === 'pond') return { label: 'Dari Kolam ' + (item.source_pond_name || ''), menu: 'Data Kolam', href: './farm-ponds.html', how: 'hapus dokumentasinya di Isi Kolam' }
      return null
    }

    function render() {
      var query = String(searchInput && searchInput.value || '').trim().toLowerCase()
      var archived = collections.filter(function (item) { return item.archived_at })
      switcher.querySelector('[data-archive-gallery-count]').textContent = archived.length
      var shown = archived.filter(function (item) {
        return !query || [item.id, item.title, item.notes, item.report_batch_code, item.report_title, item.breeding_batch_code, item.source_pond_name, item.invoice_no, item.invoice_client_name, item.sell_title].join(' ').toLowerCase().indexOf(query) !== -1
      })
      if (!shown.length) {
        list.innerHTML = '<div class="col-12 text-secondary">' + (archived.length ? 'Tidak ada arsip galeri yang cocok dengan pencarian.' : 'Belum ada koleksi galeri yang diarsipkan.') + '</div>'
        return
      }
      list.innerHTML = shown.map(function (item) {
        var images = Array.isArray(item.images) ? item.images : []
        var source = sourceInfo(item)
        var thumbs = images.slice(0, 3).map(function (media) {
          var source = media.thumbnail_url || media.image_url || ''
          return '<div class="col-4"><div class="ratio ratio-1x1 rounded border" style="background:url(&quot;' + escapeHtml(source) + '&quot;) center/cover"></div></div>'
        }).join('')
        return '<div class="col-md-6 col-xl-4"><div class="card h-100"><div class="card-body">' +
          '<h3 class="card-title mb-1" style="overflow-wrap:anywhere">' + escapeHtml(item.title) + '</h3>' +
          '<div class="d-flex flex-wrap gap-1 mb-1">' +
          '<span class="badge bg-secondary-lt">ID ' + escapeHtml(item.id) + '</span>' +
          (source ? '<span class="badge bg-blue-lt" style="white-space:normal">' + escapeHtml(source.label) + '</span>' : '') +
          '<span class="badge bg-secondary-lt">Diarsipkan ' + escapeHtml(formatDate(item.archived_at)) + '</span></div>' +
          '<div class="text-secondary small mb-2">' + escapeHtml(formatDate(item.gallery_date)) + ' · ' + images.length + ' media</div>' +
          '<div class="row g-2 mb-3">' + thumbs + '</div>' +
          (canWrite()
            ? '<div class="btn-list"><button type="button" class="btn btn-primary btn-sm" data-archive-gallery-restore="' + item.id + '">Kembalikan ke Galeri</button>' +
              '<button type="button" class="btn btn-outline-danger btn-sm" data-archive-gallery-delete="' + item.id + '">Hapus permanen</button></div>'
            : '') +
          '</div></div></div>'
      }).join('')
    }

    function load() {
      return request('/gallery').then(function (items) {
        collections = Array.isArray(items) ? items : []
        render()
      }).catch(function () {
        list.innerHTML = '<div class="col-12 text-danger">Arsip galeri gagal dimuat.</div>'
      })
    }

    switcher.addEventListener('click', function (event) {
      var button = event.target.closest('[data-archive-tab]')
      if (!button) return
      tab = button.dataset.archiveTab
      if (tab === 'ikan') { try { sessionStorage.setItem(tabKey, 'ikan') } catch (e) {} window.location.href = './farm-koi.html?arsip=1'; return }
      try { sessionStorage.setItem(tabKey, tab) } catch (e) {}
      applyTab()
    })

    if (searchInput) searchInput.addEventListener('input', render)

    list.addEventListener('click', async function (event) {
      var restore = event.target.closest('[data-archive-gallery-restore]')
      var remove = event.target.closest('[data-archive-gallery-delete]')
      if (restore) {
        restore.disabled = true
        request('/gallery/' + restore.dataset.archiveGalleryRestore + '/unarchive', { method: 'POST', body: '{}' })
          .then(load)
          .catch(function (error) { window.alert(error.message); restore.disabled = false })
        return
      }
      if (!remove) return
      var item = collections.find(function (entry) { return String(entry.id) === remove.dataset.archiveGalleryDelete })
      if (!item) return
      var origin = sourceInfo(item)
      if (origin) {
        notice.innerHTML = '<strong>Koleksi ini berasal dari ' + escapeHtml(origin.label.replace('Dari ', '')) + '.</strong> ' +
          'Hapus lewat menu ' + escapeHtml(origin.menu) + ': ' + escapeHtml(origin.how) + '. ' +
          '<a class="btn btn-danger btn-sm ms-2" href="' + origin.href + '">Buka ' + escapeHtml(origin.menu) + '</a>'
        notice.classList.remove('d-none')
        notice.scrollIntoView({ behavior: 'smooth', block: 'center' })
        return
      }
      var typed = (await window.KoiDialog.prompt('Hapus permanen koleksi "' + item.title + '" beserta daftar medianya dari Galeri? Tindakan ini tidak bisa dibatalkan.\n\nKetik HAPUS untuk konfirmasi.'))
      if (typed === null) return
      if (typed.trim().toUpperCase() !== 'HAPUS') { window.alert('Belum dihapus: ketik HAPUS untuk konfirmasi.'); return }
      remove.disabled = true
      request('/gallery/' + item.id, { method: 'DELETE' })
        .then(load)
        .catch(function (error) { window.alert(error.message); remove.disabled = false })
    })

    applyTab()
    load()
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
  else start()
})()
