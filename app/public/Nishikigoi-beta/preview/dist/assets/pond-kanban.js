// Kanban catatan of the pond form (Data Kolam > Formulir Kolam).
// Cards stand side by side, can be dragged left/right by their handle, and each has its own recording date, note and quantity
// (Qty Kanban) with a history of additions/subtractions. A deleted card goes to History Catatan, where it can be restored.
// The page (farm-ponds) tells this file which pond is open with the event "pond-detail-open"; after changes it hears "pond-kanban-changed".
function pondKanbanBoot() {
  'use strict'

  var root = document.querySelector('[data-pond-kanban]')
  if (!root) return
  var board = root.querySelector('[data-kanban-board]')
  var totalBox = root.querySelector('[data-kanban-total]')
  var message = root.querySelector('[data-kanban-message]')
  var addButton = root.querySelector('[data-kanban-add]')
  var deletedBox = document.querySelector('[data-kanban-deleted]')
  var detailModal = document.getElementById('pond-detail-modal')
  var pondId = null
  var changed = false
  var cards = {}
  var saveTimers = {}

  var style = document.createElement('style')
  style.textContent =
    '.pk-board{display:flex;gap:.75rem;overflow-x:auto;padding:.25rem .1rem .75rem;align-items:flex-start;scroll-snap-type:x proximity}' +
    '.pk-card{flex:0 0 17rem;max-width:85%;scroll-snap-align:start;border:1px solid var(--tblr-border-color,#dee2e6);border-radius:.5rem;background:var(--tblr-bg-surface,#fff);padding:.6rem;display:flex;flex-direction:column;gap:.45rem}' +
    '.pk-card.pk-dragging{opacity:.5;outline:2px dashed var(--tblr-primary,#206bc4)}' +
    '.pk-head{display:flex;gap:.35rem;align-items:center}' +
    '.pk-grip{flex:0 0 auto;cursor:grab;touch-action:none;user-select:none;padding:.15rem .35rem;border-radius:.3rem;color:var(--tblr-secondary,#6c7a91);font-size:1.1rem;line-height:1}' +
    '.pk-grip:hover{background:rgba(127,127,127,.15)}' +
    '.pk-title{font-weight:600}' +
    '.pk-body{resize:vertical;min-height:6rem}' +
    '.pk-qty{display:flex;align-items:center;gap:.4rem;flex-wrap:wrap}' +
    '.pk-qty-value{font-size:1.15rem;font-weight:700;min-width:2.2rem;text-align:center}' +
    '.pk-qty-label{font-size:.78rem;color:var(--tblr-secondary,#6c7a91)}' +
    '.pk-qtyform{display:flex;flex-direction:column;gap:.35rem;padding:.5rem;border-radius:.4rem;background:rgba(127,127,127,.1)}' +
    '.pk-log{font-size:.8rem;max-height:9rem;overflow:auto;border-top:1px solid var(--tblr-border-color,#dee2e6);padding-top:.35rem}' +
    '.pk-log div{display:flex;justify-content:space-between;gap:.5rem;padding:.1rem 0}' +
    '.pk-up{color:#2fb344}.pk-down{color:#d63939}' +
    '.pk-foot{font-size:.74rem;color:var(--tblr-secondary,#6c7a91)}' +
    '.pk-empty{padding:1.2rem;color:var(--tblr-secondary,#6c7a91);text-align:center;width:100%}'
  document.head.appendChild(style)

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    })
  }
  function dateText(value) {
    if (!value) return '-'
    return window.KoiAuth && window.KoiAuth.formatDate ? window.KoiAuth.formatDate(value) : String(value).slice(0, 10)
  }
  function dateTimeText(value) {
    if (!value) return '-'
    return window.KoiAuth && window.KoiAuth.formatDateTime ? window.KoiAuth.formatDateTime(value) : String(value)
  }
  function today() {
    var d = new Date()
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2)
  }
  function say(text, bad) {
    if (!message) return
    message.textContent = text || ''
    message.className = 'form-hint mb-0 ' + (bad ? 'text-danger' : 'text-secondary')
  }
  function request(method, url, body) {
    return fetch(url, {
      method: method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then(function (response) {
      return response.json().catch(function () { return {} }).then(function (data) {
        if (!response.ok) throw new Error(data.error || 'Permintaan gagal.')
        return data
      })
    })
  }
  function api(path) { return '/api' + path }

  function cardHtml(item) {
    return '' +
      '<div class="pk-card" data-kanban-card="' + item.id + '">' +
        '<div class="pk-head">' +
          '<span class="pk-grip" data-kanban-grip title="Tahan dan geser untuk memindah urutan" aria-label="Geser kanban">&#8942;&#8942;</span>' +
          '<input class="form-control form-control-sm pk-title" data-k-title maxlength="255" placeholder="Judul kanban" aria-label="Judul kanban" data-role-disable-unless="farm-operate" value="' + esc(item.title) + '" />' +
          '<button class="btn btn-sm btn-outline-danger" type="button" data-k-delete data-role-required="farm-operate" title="Hapus kanban (masuk History Catatan)" aria-label="Hapus kanban">&times;</button>' +
        '</div>' +
        '<div>' +
          '<div class="pk-qty-label">Tanggal pencatatan</div>' +
          '<input type="text" class="form-control form-control-sm" data-date-parts data-k-date data-role-disable-unless="farm-operate" value="' + esc(item.note_date ? String(item.note_date).slice(0, 10) : '') + '" />' +
        '</div>' +
        '<textarea class="form-control pk-body" data-k-body rows="5" placeholder="Catatan" data-role-disable-unless="farm-operate">' + esc(item.body) + '</textarea>' +
        '<div class="pk-qty">' +
          '<span class="pk-qty-label">Qty Kanban</span>' +
          '<button class="btn btn-sm btn-icon" type="button" data-k-qty-open="-1" data-role-required="farm-operate" title="Kurangi" aria-label="Kurangi">&minus;</button>' +
          '<span class="pk-qty-value" data-k-qty>' + Number(item.qty || 0) + '</span>' +
          '<button class="btn btn-sm btn-icon" type="button" data-k-qty-open="1" data-role-required="farm-operate" title="Tambah" aria-label="Tambah">+</button>' +
          '<button class="btn btn-sm ms-auto" type="button" data-k-log-toggle>Riwayat</button>' +
        '</div>' +
        '<div class="pk-qtyform" data-k-qtyform hidden>' +
          '<strong data-k-qtymode></strong>' +
          '<input type="number" class="form-control form-control-sm" min="1" step="1" inputmode="numeric" data-k-delta placeholder="Jumlah ikan" />' +
          '<input type="text" class="form-control form-control-sm" data-date-parts data-k-logdate value="' + today() + '" />' +
          '<input type="text" class="form-control form-control-sm" maxlength="500" data-k-lognote placeholder="Keterangan (boleh kosong)" />' +
          '<div class="d-flex gap-2"><button class="btn btn-sm btn-primary" type="button" data-k-qty-save>Catat</button><button class="btn btn-sm" type="button" data-k-qty-cancel>Batal</button></div>' +
        '</div>' +
        '<div class="pk-log" data-k-log hidden></div>' +
        '<div class="pk-foot" data-k-foot>' + footText(item) + '</div>' +
      '</div>'
  }
  function footText(item) {
    return 'Dibuat ' + esc(item.created_by || '-') + ' &middot; diubah ' + esc(dateTimeText(item.updated_at))
  }

  function updateTotal() {
    var total = 0
    Object.keys(cards).forEach(function (id) { total += Number(cards[id].qty || 0) })
    if (totalBox) totalBox.textContent = Object.keys(cards).length ? 'Total Qty Kanban: ' + total : ''
  }

  function renderBoard(items) {
    cards = {}
    items.forEach(function (item) { cards[item.id] = item })
    board.innerHTML = items.length ? items.map(cardHtml).join('') : '<div class="pk-empty">Belum ada kanban. Tekan "Tambah Kanban" untuk mulai mencatat.</div>'
    updateTotal()
  }

  function renderDeleted(items) {
    if (!deletedBox) return
    if (!items.length) {
      deletedBox.innerHTML = ''
      return
    }
    deletedBox.innerHTML = '<div class="list-group-item bg-transparent fw-semibold">Kanban dihapus (' + items.length + ')</div>' + items.map(function (item) {
      return '<div class="list-group-item" data-kanban-deleted-item="' + item.id + '">' +
        '<div class="d-flex justify-content-between gap-3 flex-wrap">' +
          '<div style="min-width:0">' +
            '<div class="text-secondary small">Dihapus ' + esc(dateTimeText(item.deleted_at)) + ' oleh ' + esc(item.deleted_by || '-') + '</div>' +
            '<div class="fw-semibold">' + esc(item.title || '(tanpa judul)') + ' <span class="text-secondary fw-normal">&middot; ' + esc(dateText(item.note_date)) + ' &middot; Qty ' + Number(item.qty || 0) + '</span></div>' +
            (item.body ? '<div style="white-space:pre-wrap">' + esc(item.body) + '</div>' : '') +
          '</div>' +
          '<div class="d-flex gap-2 align-items-start">' +
            '<button class="btn btn-sm" type="button" data-k-restore="' + item.id + '" data-role-required="farm-operate">Pulihkan</button>' +
            '<button class="btn btn-sm btn-outline-danger" type="button" data-k-purge="' + item.id + '" data-role-required="farm-operate">Hapus Permanen</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    }).join('')
  }

  function load(id) {
    pondId = id
    say('')
    board.innerHTML = '<div class="pk-empty"><span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Memuat kanban...</div>'
    return request('GET', api('/ponds/' + id + '/kanban')).then(function (data) {
      if (pondId !== id) return
      renderBoard(data.items || [])
      renderDeleted(data.deleted || [])
    }).catch(function (error) {
      board.innerHTML = '<div class="pk-empty text-danger">' + esc(error.message || 'Kanban gagal dimuat.') + '</div>'
    })
  }
  function reload() { return pondId ? load(pondId) : Promise.resolve() }

  // ---- saving a card's title / date / note -------------------------------------------------------------------------------------------
  function saveCard(cardEl) {
    var id = cardEl.getAttribute('data-kanban-card')
    var payload = {
      title: cardEl.querySelector('[data-k-title]').value,
      body: cardEl.querySelector('[data-k-body]').value,
      note_date: cardEl.querySelector('[data-k-date]').value,
    }
    var foot = cardEl.querySelector('[data-k-foot]')
    return request('PATCH', api('/ponds/kanban/' + id), payload).then(function (item) {
      changed = true
      cards[id] = Object.assign(cards[id] || {}, item)
      foot.innerHTML = 'Tersimpan &middot; ' + footText(item)
      say('')
    }).catch(function (error) {
      foot.textContent = error.message || 'Gagal menyimpan.'
      foot.classList.add('text-danger')
      say(error.message || 'Kanban gagal disimpan.', true)
    })
  }
  function scheduleSave(cardEl, delay) {
    var id = cardEl.getAttribute('data-kanban-card')
    cardEl.querySelector('[data-k-foot]').classList.remove('text-danger')
    clearTimeout(saveTimers[id])
    saveTimers[id] = setTimeout(function () { delete saveTimers[id]; saveCard(cardEl) }, delay)
  }
  function flush() {
    Object.keys(saveTimers).forEach(function (id) {
      clearTimeout(saveTimers[id])
      delete saveTimers[id]
      var el = board.querySelector('[data-kanban-card="' + id + '"]')
      if (el) saveCard(el)
    })
  }

  board.addEventListener('input', function (event) {
    var cardEl = event.target.closest('[data-kanban-card]')
    if (!cardEl) return
    if (event.target.matches('[data-k-title],[data-k-body]')) scheduleSave(cardEl, 800)
    else if (event.target.matches('[data-k-date]')) scheduleSave(cardEl, 300)
  })
  board.addEventListener('focusout', function (event) {
    var cardEl = event.target.closest('[data-kanban-card]')
    if (cardEl && cardEl.querySelector('[data-k-foot]') && saveTimers[cardEl.getAttribute('data-kanban-card')]) {
      clearTimeout(saveTimers[cardEl.getAttribute('data-kanban-card')])
      delete saveTimers[cardEl.getAttribute('data-kanban-card')]
      saveCard(cardEl)
    }
  })

  // ---- quantity ------------------------------------------------------------------------------------------------------------------------
  function renderLog(cardEl, rows) {
    var box = cardEl.querySelector('[data-k-log]')
    box.innerHTML = rows.length ? rows.map(function (row) {
      var up = Number(row.delta) > 0
      return '<div><span>' + esc(dateText(row.log_date)) + (row.notes ? ' &middot; ' + esc(row.notes) : '') + '<br><span class="text-secondary">' + esc(row.actor || '-') + '</span></span>' +
        '<span class="' + (up ? 'pk-up' : 'pk-down') + '">' + (up ? '+' : '') + Number(row.delta) + ' &rarr; ' + Number(row.qty_after) + '</span></div>'
    }).join('') : '<div class="text-secondary">Belum ada riwayat jumlah.</div>'
  }
  function loadLog(cardEl) {
    var id = cardEl.getAttribute('data-kanban-card')
    return request('GET', api('/ponds/kanban/' + id + '/qty-log')).then(function (rows) { renderLog(cardEl, rows) }).catch(function () {
      cardEl.querySelector('[data-k-log]').textContent = 'Riwayat gagal dimuat.'
    })
  }

  board.addEventListener('click', function (event) {
    var cardEl = event.target.closest('[data-kanban-card]')
    if (!cardEl) return
    var id = cardEl.getAttribute('data-kanban-card')

    var open = event.target.closest('[data-k-qty-open]')
    if (open) {
      var form = cardEl.querySelector('[data-k-qtyform]')
      var sign = Number(open.getAttribute('data-k-qty-open'))
      form.setAttribute('data-sign', sign)
      form.querySelector('[data-k-qtymode]').textContent = sign > 0 ? 'Tambah ikan' : 'Kurangi ikan'
      form.querySelector('[data-k-delta]').value = ''
      form.querySelector('[data-k-lognote]').value = ''
      form.querySelector('[data-k-logdate]').value = today()
      form.hidden = false
      form.querySelector('[data-k-delta]').focus()
      return
    }
    if (event.target.closest('[data-k-qty-cancel]')) {
      cardEl.querySelector('[data-k-qtyform]').hidden = true
      return
    }
    if (event.target.closest('[data-k-qty-save]')) {
      var f = cardEl.querySelector('[data-k-qtyform]')
      var amount = parseInt(f.querySelector('[data-k-delta]').value, 10)
      if (!amount || amount < 1) { say('Isi jumlah ikan (angka 1 atau lebih).', true); return }
      var btn = event.target.closest('[data-k-qty-save]')
      btn.disabled = true
      request('POST', api('/ponds/kanban/' + id + '/qty'), {
        delta: amount * Number(f.getAttribute('data-sign') || 1),
        log_date: f.querySelector('[data-k-logdate]').value,
        notes: f.querySelector('[data-k-lognote]').value,
      }).then(function (data) {
        changed = true
        cards[id] = Object.assign(cards[id] || {}, data.kanban)
        cardEl.querySelector('[data-k-qty]').textContent = Number(data.kanban.qty)
        f.hidden = true
        updateTotal()
        say('')
        if (!cardEl.querySelector('[data-k-log]').hidden) loadLog(cardEl)
      }).catch(function (error) {
        say(error.message || 'Jumlah gagal dicatat.', true)
      }).then(function () { btn.disabled = false })
      return
    }
    if (event.target.closest('[data-k-log-toggle]')) {
      var logBox = cardEl.querySelector('[data-k-log]')
      logBox.hidden = !logBox.hidden
      if (!logBox.hidden) loadLog(cardEl)
      return
    }
    if (event.target.closest('[data-k-delete]')) {
      var name = cardEl.querySelector('[data-k-title]').value.trim() || 'tanpa judul'
      Promise.resolve(window.KoiDialog ? window.KoiDialog.confirm('Hapus kanban "' + name + '"?\n\nKanban masuk ke History Catatan dan masih bisa dipulihkan.') : window.confirm('Hapus kanban ini?')).then(function (ok) {
        if (!ok) return
        flush()
        return request('DELETE', api('/ponds/kanban/' + id)).then(function () { changed = true; return reload() }).catch(function (error) { say(error.message, true) })
      })
    }
  })

  // ---- add -----------------------------------------------------------------------------------------------------------------------------
  if (addButton) {
    addButton.addEventListener('click', function () {
      if (!pondId) return
      addButton.disabled = true
      request('POST', api('/ponds/' + pondId + '/kanban'), { title: '', body: '' }).then(function () {
        changed = true
        return reload()
      }).then(function () {
        board.scrollLeft = board.scrollWidth
        var last = board.querySelector('[data-kanban-card]:last-child [data-k-title]')
        if (last) last.focus()
      }).catch(function (error) { say(error.message || 'Kanban gagal ditambah.', true) }).then(function () { addButton.disabled = false })
    })
  }

  // ---- deleted cards (History Catatan) -------------------------------------------------------------------------------------------------
  if (deletedBox) {
    deletedBox.addEventListener('click', function (event) {
      var restore = event.target.closest('[data-k-restore]')
      var purge = event.target.closest('[data-k-purge]')
      if (restore) {
        restore.disabled = true
        request('POST', api('/ponds/kanban/' + restore.getAttribute('data-k-restore') + '/restore')).then(function () { changed = true; return reload() }).catch(function (error) { restore.disabled = false; say(error.message, true) })
      } else if (purge) {
        var row = purge.closest('[data-kanban-deleted-item]')
        var title = row ? row.querySelector('.fw-semibold').textContent : 'kanban ini'
        Promise.resolve(window.KoiDialog ? window.KoiDialog.prompt('Hapus permanen "' + title.trim() + '"?\n\nRiwayat jumlahnya ikut hilang dan tidak bisa dikembalikan.\nKetik HAPUS untuk melanjutkan.') : 'HAPUS').then(function (answer) {
          if (answer !== 'HAPUS') return
          return request('DELETE', api('/ponds/kanban/' + purge.getAttribute('data-k-purge') + '?permanent=1')).then(function () { return reload() }).catch(function (error) { say(error.message, true) })
        })
      }
    })
  }

  // ---- dragging a card by its handle (mouse and touch) ---------------------------------------------------------------------------------------------
  var drag = null
  board.addEventListener('pointerdown', function (event) {
    var grip = event.target.closest('[data-kanban-grip]')
    if (!grip || (event.pointerType === 'mouse' && event.button !== 0)) return
    var cardEl = grip.closest('[data-kanban-card]')
    if (!cardEl || board.querySelectorAll('[data-kanban-card]').length < 2) return
    event.preventDefault()
    drag = { card: cardEl, grip: grip, before: orderOf() }
    try { grip.setPointerCapture(event.pointerId) } catch (e) { /* the move events still reach the document */ }
    cardEl.classList.add('pk-dragging')
  })
  function orderOf() {
    return Array.prototype.map.call(board.querySelectorAll('[data-kanban-card]'), function (el) { return el.getAttribute('data-kanban-card') })
  }
  board.addEventListener('pointermove', function (event) {
    if (!drag) return
    var rect = board.getBoundingClientRect()
    if (event.clientX < rect.left + 40) board.scrollLeft -= 18
    else if (event.clientX > rect.right - 40) board.scrollLeft += 18
    var target = null
    Array.prototype.forEach.call(board.querySelectorAll('[data-kanban-card]'), function (el) {
      if (el === drag.card) return
      var r = el.getBoundingClientRect()
      if (event.clientX >= r.left && event.clientX <= r.right) target = el
    })
    if (!target) return
    var r2 = target.getBoundingClientRect()
    var after = event.clientX > r2.left + r2.width / 2
    var siblings = Array.prototype.slice.call(board.children)
    var draggedIndex = siblings.indexOf(drag.card)
    var targetIndex = siblings.indexOf(target)
    if (draggedIndex < targetIndex && after) board.insertBefore(drag.card, target.nextSibling)
    else if (draggedIndex > targetIndex && !after) board.insertBefore(drag.card, target)
  })
  function endDrag() {
    if (!drag) return
    var current = drag
    drag = null
    current.card.classList.remove('pk-dragging')
    var now = orderOf()
    if (now.join(',') === current.before.join(',')) return
    request('POST', api('/ponds/' + pondId + '/kanban/order'), { ids: now.map(Number) }).then(function () { changed = true }).catch(function (error) {
      say(error.message || 'Urutan gagal disimpan.', true)
      reload()
    })
  }
  board.addEventListener('pointerup', endDrag)
  board.addEventListener('pointercancel', endDrag)

  // ---- page hooks ----------------------------------------------------------------------------------------------------------------------------
  window.addEventListener('pond-detail-open', function (event) { changed = false; load(event.detail.id) })
  if (detailModal) {
    detailModal.addEventListener('hide.bs.modal', flush)
    detailModal.addEventListener('hidden.bs.modal', function () {
      if (changed) window.dispatchEvent(new CustomEvent('pond-kanban-changed'))
      changed = false
      pondId = null
    })
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pondKanbanBoot)
else pondKanbanBoot()
