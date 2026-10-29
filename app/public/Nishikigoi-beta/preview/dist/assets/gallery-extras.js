// Galeri extras: "Arsipkan" button (archived collections leave the Galeri list and are managed in
// Lainnya > Arsip, tab Galeri), plus a "Dari Laporan" mark. Collections made from a report
// ("Tampilkan media di Galeri") are changed or removed from Laporan, so Edit/Hapus on them shows a
// warning pointing there instead. Works on top of the gallery page by reading its localStorage cache.
;(function () {
  var cacheKey = 'nishikigoi-cache:farm-gallery'
  var archiveIcon = '<svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4m0 2a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z" /><path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-10" /><path d="M10 12l4 0" /></svg>'

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    })
  }
  function readItems() {
    try { var items = JSON.parse(localStorage.getItem(cacheKey) || '[]'); return Array.isArray(items) ? items : [] } catch (e) { return [] }
  }
  function writeItems(items) {
    try { localStorage.setItem(cacheKey, JSON.stringify(items)) } catch (e) {}
  }
  function canWrite() {
    return Boolean(window.KoiAuth && window.KoiAuth.canAccess && window.KoiAuth.canAccess('database-write'))
  }

  function start() {
    var list = document.querySelector('[data-gallery-list]')
    if (!list) return

    // Long titles (e.g. "Laporan Report-26-09-02 - ...") must wrap instead of pushing the buttons out.
    var style = document.createElement('style')
    style.textContent = '[data-gallery-list] .card-body > .d-flex > div:first-child{min-width:0;flex:1 1 auto}' +
      '[data-gallery-list] .card-title{overflow-wrap:anywhere}' +
      '[data-gallery-list] .card-body > .d-flex > .btn-list{flex:0 0 auto}' +
      '[data-gallery-badges] .badge{white-space:normal;text-align:left}' +
      '.gallery-target .card{outline:2px solid #206bc4;box-shadow:0 0 0 4px rgba(32,107,196,.28)}' +
      '[data-gallery-list] .gallery-media-id{position:absolute;top:4px;left:4px;right:auto;bottom:auto;width:auto!important;height:auto!important;padding:1px 6px;border-radius:4px;font-size:.7rem;line-height:1.3;background:rgba(0,0,0,.65);color:#fff;pointer-events:none}'
    document.head.appendChild(style)

    var notice = document.createElement('div')
    notice.className = 'alert d-none'
    notice.setAttribute('role', 'alert')
    list.parentElement.insertBefore(notice, list)

    var empty = document.createElement('div')
    empty.className = 'col-12 d-none'
    empty.innerHTML = '<div class="card"><div class="card-body text-secondary">Semua koleksi sedang diarsipkan. Lihat di menu Lainnya &gt; Arsip, tab Galeri.</div></div>'

    function showNotice(kind, html) {
      notice.className = 'alert alert-' + kind
      notice.innerHTML = '<div class="d-flex flex-wrap align-items-center gap-2 justify-content-between"><div>' + html + '</div>' +
        '<button type="button" class="btn btn-sm" data-gallery-notice-close>Tutup</button></div>'
      notice.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }

    // Deep link: farm-gallery.html?id=12 (or #galeri-12) scrolls to that collection and highlights it.
    // The id is shown on every card ("ID 12") and in the Laporan card ("Galeri #12").
    var targetId = ''
    try {
      var params = new URLSearchParams(window.location.search)
      targetId = String(params.get('id') || (window.location.hash.match(/^#galeri-(\d+)$/) || [])[1] || '').trim()
    } catch (e) {}
    var targetDone = false

    function focusTarget(final) {
      if (!targetId || targetDone) return
      var column = Array.prototype.slice.call(list.querySelectorAll('[data-edit-gallery]')).map(function (button) {
        return button.closest('.col-md-6, .col-xl-4')
      }).find(function (candidate) {
        return candidate && candidate.querySelector('[data-edit-gallery]').dataset.editGallery === targetId
      })
      var item = readItems().find(function (entry) { return String(entry.id) === targetId })
      if (column && !column.classList.contains('d-none')) {
        targetDone = true
        column.classList.add('gallery-target')
        column.scrollIntoView({ behavior: 'smooth', block: 'center' })
      } else if (item && item.archived_at) {
        targetDone = true
        showNotice('info', 'Koleksi <strong>' + escapeHtml(item.title) + '</strong> (ID ' + escapeHtml(targetId) + ') sedang diarsipkan. Lihat di menu ' +
          '<a href="./farm-archive.html" data-go-archive-gallery>Lainnya &gt; Arsip, tab Galeri</a>.')
      } else if (final) {
        targetDone = true
        showNotice('warning', 'Koleksi Galeri dengan ID <strong>' + escapeHtml(targetId) + '</strong> tidak ditemukan.')
      }
    }

    // Collections that follow a Laporan, a Breeding session or a pond's documentation.
    function openHref(page, item) {
      return './' + page + '.html' + (item.source_id ? '?open=' + encodeURIComponent(item.source_id) : '')
    }
    function sourceInfo(item) {
      if (item.source_type === 'report') return { label: 'Dari Laporan ' + (item.report_batch_code || ''), menu: 'Laporan', open: 'Buka laporan ' + (item.report_batch_code || ''), href: openHref('farm-reports', item) }
      if (item.source_type === 'breeding') return { label: 'Dari Breeding ' + (item.breeding_batch_code || ''), menu: 'Breeding', open: 'Buka breeding ' + (item.breeding_batch_code || ''), href: openHref('farm-breeding', item) }
      if (item.source_type === 'sell') return { label: 'Dari Katalog ' + (item.sell_title || ''), menu: 'Penjualan > Katalog', open: 'Buka katalog ' + (item.sell_title || ''), href: openHref('farm-sell', item) }
      if (item.source_type === 'invoice') return { label: 'Dari Invoice ' + (item.invoice_no || ''), menu: 'Penjualan > Invoice', open: 'Buka invoice ' + (item.invoice_no || ''), href: openHref('farm-invoice', item) }
      if (item.source_type === 'pond') return { label: 'Dari Kolam ' + (item.source_pond_name || ''), menu: 'Data Kolam', open: 'Buka isi kolam ' + (item.source_pond_name || ''), href: openHref('farm-ponds', item) }
      return null
    }

    // ---- print ----------------------------------------------------------------------------------
    var printIcon = '<svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 17h2a2 2 0 0 0 2 -2v-4a2 2 0 0 0 -2 -2h-14a2 2 0 0 0 -2 2v4a2 2 0 0 0 2 2h2" /><path d="M17 9v-4a2 2 0 0 0 -2 -2h-6a2 2 0 0 0 -2 2v4" /><path d="M7 13m0 2a2 2 0 0 1 2 -2h6a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2z" /></svg>'

    function printCollection(item) {
      var kp = window.KoiPrint
      if (!kp) { window.alert('Modul cetak belum dimuat. Muat ulang halaman.'); return }
      var e = kp.escapeHtml
      var images = Array.isArray(item.images) ? item.images : []
      var source = sourceInfo(item)
      var date = item.gallery_date ? (window.KoiAuth && window.KoiAuth.formatDate ? window.KoiAuth.formatDate(item.gallery_date) : String(item.gallery_date).slice(0, 10)) : '-'
      var cellFor = function (media, filled) {
        var src = media.thumbnail_url || media.image_url
        var label = '#' + media.id + (media.media_type === 'video' ? ' [Video]' : '') + (media.notes ? ' \u00b7 ' + media.notes : '')
        var hasPicture = (src && media.media_type !== 'video') || media.thumbnail_url
        var box = filled ? 'flex:1 1 auto;min-height:0;overflow:hidden;display:flex;align-items:center;justify-content:center;background:#f3f3f3' : 'height:46mm;overflow:hidden;display:flex;align-items:center;justify-content:center;background:#f3f3f3'
        var picture = hasPicture
          ? '<img src="' + e(src) + '" style="display:block;width:100%;height:100%;object-fit:contain">'
          : '<span style="color:#666">' + (media.media_type === 'video' ? 'Video' : 'Tanpa foto') + '</span>'
        return '<figure style="margin:0;border:1px solid #999;break-inside:avoid;' + (filled ? 'display:flex;flex-direction:column;min-height:0;overflow:hidden' : '') + '">' +
          '<div style="' + box + '">' + picture + '</div>' +
          '<figcaption style="flex:0 0 auto;padding:3px 5px;font-size:8.5px;word-break:break-word">' + e(label) + '</figcaption></figure>'
      }
      var emptyBody = '<section class="kp-section"><div class="kp-muted">Koleksi ini belum berisi foto atau video.</div></section>'
      // one block with every picture (used when several collections are printed together); each picture is shown whole
      var body = images.length
        ? '<section class="kp-section"><h2>Foto dan video (' + images.length + ')</h2><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">' +
          images.map(function (media) { return cellFor(media, false) }).join('') + '</div></section>'
        : emptyBody
      var options = {
        key: 'gallery-collection',
        title: 'Galeri ' + (item.title || ''),
        heading: 'Galeri',
        subheading: item.title || '',
        info: [
          ['ID Galeri', item.id],
          ['Judul', item.title || '-'],
          ['Tanggal', date],
          ['Sumber', source ? source.label.replace('Dari ', '') : 'Dibuat langsung di Galeri'],
          ['Jumlah media', images.length],
        ],
        notes: item.notes || '',
        body: body,
      }
      // a single collection: pages built after the dialog so the grid fills the page (portrait 3 x 4, landscape 4 x 3 = 12 per page)
      if (images.length) {
        options.buildPages = function (settings) {
          var landscape = settings && settings.orientation === 'landscape'
          var columns = landscape ? 4 : 3
          var rows = landscape ? 3 : 4
          var per = columns * rows
          var pages = []
          for (var start = 0; start < images.length; start += per) {
            var chunk = images.slice(start, start + per)
            pages.push(Object.assign({}, options, {
              buildPages: undefined,
              notes: start === 0 ? options.notes : '',
              body: '<section class="kp-section" style="margin:0"><div data-kp-fill style="display:grid;grid-template-columns:repeat(' + columns + ',minmax(0,1fr));grid-template-rows:repeat(' + rows + ',minmax(0,1fr));gap:6px;min-height:100mm">' +
                chunk.map(function (media) { return cellFor(media, true) }).join('') + '</div></section>',
            }))
          }
          return pages
        }
      }
      kp.print(options)
    }

    function visibleItems() {
      var seen = {}
      return Array.prototype.slice.call(list.querySelectorAll('[data-edit-gallery]')).map(function (button) {
        return button.closest('.col-md-6, .col-xl-4')
      }).filter(function (column, index, all) {
        return column && !column.classList.contains('d-none') && all.indexOf(column) === index
      }).map(function (column) {
        var id = column.querySelector('[data-edit-gallery]').dataset.editGallery
        if (seen[id]) return null
        seen[id] = true
        return readItems().find(function (entry) { return String(entry.id) === String(id) })
      }).filter(Boolean)
    }

    // a "Cetak" button next to "Tambah Galeri" prints every collection that is shown, one per page
    var addButton = document.querySelector('[data-open-create]')
    if (addButton && !document.querySelector('[data-gallery-print-all]')) {
      var printAll = document.createElement('button')
      printAll.type = 'button'
      printAll.className = 'btn btn-outline-secondary me-2'
      printAll.setAttribute('data-gallery-print-all', '')
      printAll.title = 'Cetak semua koleksi yang tampil (satu koleksi per halaman)'
      printAll.innerHTML = printIcon + ' Cetak'
      addButton.parentElement.insertBefore(printAll, addButton)
      printAll.addEventListener('click', function () {
        var items = visibleItems()
        if (!items.length) { window.alert('Tidak ada koleksi untuk dicetak.'); return }
        if (!window.KoiPrint) { window.alert('Modul cetak belum dimuat. Muat ulang halaman.'); return }
        window.KoiPrint.printMany(items, printCollection, { title: 'Galeri' })
      })
    }

    function decorate() {
      var byId = new Map(readItems().map(function (item) { return [String(item.id), item] }))
      var columns = new Set()
      list.querySelectorAll('[data-edit-gallery]').forEach(function (button) {
        var column = button.closest('.col-md-6, .col-xl-4')
        if (column) columns.add(column)
      })
      var visible = 0
      columns.forEach(function (column) {
        var id = column.querySelector('[data-edit-gallery]').dataset.editGallery
        var item = byId.get(String(id))
        if (!item) return
        var archived = Boolean(item.archived_at)
        column.classList.toggle('d-none', archived)
        if (!archived) visible += 1

        var title = column.querySelector('.card-title')
        var badges = column.querySelector('[data-gallery-badges]')
        if (!badges && title) {
          badges = document.createElement('div')
          badges.setAttribute('data-gallery-badges', '')
          badges.className = 'd-flex flex-wrap gap-1 mb-1'
          title.insertAdjacentElement('afterend', badges)
        }
        var source = sourceInfo(item)
        if (badges) badges.innerHTML = '<span class="badge bg-secondary-lt">ID ' + escapeHtml(item.id) + '</span>' +
          (source ? '<a class="badge bg-blue-lt text-decoration-none" href="' + escapeHtml(source.href) + '" title="' + escapeHtml(source.open) + '">' + escapeHtml(source.label) + '</a>' : '')
        // every photo / video has its own ID (gallery_images.id), also used as "ID Media" in Excel/ZIP
        column.querySelectorAll('[data-view-media]').forEach(function (tile) {
          if (tile.querySelector('.gallery-media-id')) return
          var idBadge = document.createElement('span')
          idBadge.className = 'gallery-media-id'
          idBadge.textContent = '#' + tile.dataset.viewMedia
          tile.appendChild(idBadge)
        })

        var actions = column.querySelector('.btn-list')
        if (actions && !actions.querySelector('[data-gallery-print]')) {
          var printButton = document.createElement('button')
          printButton.type = 'button'
          printButton.className = 'btn btn-icon btn-outline-secondary'
          printButton.setAttribute('data-gallery-print', id)
          printButton.title = 'Cetak koleksi ini'
          printButton.setAttribute('aria-label', printButton.title)
          printButton.innerHTML = printIcon
          actions.prepend(printButton)
        }
        if (actions && canWrite() && !actions.querySelector('[data-gallery-archive]')) {
          var button = document.createElement('button')
          button.type = 'button'
          button.className = 'btn btn-icon btn-outline-secondary'
          button.setAttribute('data-gallery-archive', id)
          button.title = 'Arsipkan (pindah ke Lainnya > Arsip)'
          button.setAttribute('aria-label', button.title)
          button.innerHTML = archiveIcon
          actions.prepend(button)
        }
      })
      if (!empty.parentElement) list.appendChild(empty)
      empty.classList.toggle('d-none', visible > 0 || columns.size === 0)
      focusTarget(false)
    }

    var scheduled = false
    new MutationObserver(function () {
      if (scheduled) return
      scheduled = true
      window.requestAnimationFrame(function () { scheduled = false; decorate() })
    }).observe(list, { childList: true })

    notice.addEventListener('click', function (event) {
      if (event.target.closest('[data-gallery-notice-close]')) notice.className = 'alert d-none'
    })

    // Capture phase: runs before the page's own Edit/Hapus handlers.
    list.addEventListener('click', function (event) {
      var printButton = event.target.closest('[data-gallery-print]')
      if (printButton) {
        event.preventDefault()
        event.stopImmediatePropagation()
        var printId = printButton.getAttribute('data-gallery-print')
        var printItem = readItems().find(function (entry) { return String(entry.id) === String(printId) })
        if (printItem) printCollection(printItem)
        return
      }
      var archiveButton = event.target.closest('[data-gallery-archive]')
      if (archiveButton) {
        event.preventDefault()
        event.stopImmediatePropagation()
        var id = archiveButton.getAttribute('data-gallery-archive')
        var item = readItems().find(function (entry) { return String(entry.id) === String(id) })
        archiveButton.disabled = true
        window.KoiAuth.apiRequest('/gallery/' + encodeURIComponent(id) + '/archive', { method: 'POST', body: '{}' })
          .then(function (response) {
            if (!response.ok) return response.json().catch(function () { return {} }).then(function (data) { throw new Error(data.error || 'Gagal mengarsipkan') })
            writeItems(readItems().map(function (entry) {
              if (String(entry.id) === String(id)) entry.archived_at = new Date().toISOString()
              return entry
            }))
            decorate()
            showNotice('info', 'Koleksi <strong>' + escapeHtml(item ? item.title : '') + '</strong> diarsipkan. Lihat atau kembalikan di menu ' +
              '<a href="./farm-archive.html" data-go-archive-gallery>Lainnya &gt; Arsip, tab Galeri</a>.')
          })
          .catch(function (error) { window.alert(error.message); archiveButton.disabled = false })
        return
      }

      var target = event.target.closest('[data-edit-gallery], [data-delete-gallery]')
      if (!target) return
      var galleryId = target.dataset.editGallery || target.dataset.deleteGallery
      var linked = readItems().find(function (entry) { return String(entry.id) === String(galleryId) })
      var source = linked && sourceInfo(linked)
      if (source) {
        event.preventDefault()
        event.stopImmediatePropagation()
        var name = linked.source_type === 'report' ? ((linked.report_batch_code || '') + (linked.report_title ? ' - ' + linked.report_title : ''))
          : linked.source_type === 'breeding' ? ((linked.breeding_batch_code || '') + (linked.breeding_session_name ? ' - ' + linked.breeding_session_name : ''))
          : linked.source_type === 'sell' ? (linked.sell_title || '')
          : linked.source_type === 'invoice' ? ((linked.invoice_no || '') + (linked.invoice_client_name ? ' - ' + linked.invoice_client_name : ''))
          : (linked.source_pond_name || '')
        showNotice('danger', '<strong>' + escapeHtml(source.label.replace('Dari ', 'Koleksi ini berasal dari ')) + (name && linked.source_type !== 'pond' ? ' (' + escapeHtml(name) + ')' : '') + '.</strong><br>' +
          'Koleksi ini tidak bisa diubah atau dihapus dari Galeri. Ubah atau hapus dokumentasinya lewat menu ' + escapeHtml(source.menu) + '. ' +
          'Kalau hanya ingin menyembunyikannya, pakai tombol Arsipkan. <a class="btn btn-danger btn-sm ms-1" href="' + escapeHtml(source.href) + '">' + escapeHtml(source.open) + '</a>')
      }
    }, true)

    // The viewer title gets the media's own ID.
    list.addEventListener('click', function (event) {
      var tile = event.target.closest('[data-view-media]')
      if (!tile) return
      var mediaId = tile.dataset.viewMedia
      setTimeout(function () {
        var title = document.querySelector('[data-viewer-title]')
        if (title) title.textContent = title.textContent.replace(/ \u00b7 ID \d+$/, '') + ' \u00b7 ID ' + mediaId
      }, 60)
    })

    // The link in the notice opens the Arsip page directly on the Galeri tab.
    document.addEventListener('click', function (event) {
      if (event.target.closest('[data-go-archive-gallery]')) {
        try { sessionStorage.setItem('nishikigoi-archive-tab', 'galeri') } catch (e) {}
      }
    })

    decorate()
    if (targetId) setTimeout(function () { focusTarget(true) }, 8000)
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
  else start()
})()
