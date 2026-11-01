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
    '.pk-board{display:flex;gap:.75rem;overflow-x:auto;padding:.25rem .1rem .75rem;align-items:flex-start;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain}' +
    '.pk-card{flex:0 0 17rem;max-width:85%;will-change:transform;border:1px solid var(--tblr-border-color,#dee2e6);border-radius:.5rem;background:var(--tblr-bg-surface,#fff);padding:.6rem;display:flex;flex-direction:column;gap:.45rem}' +
    '.pk-card.pk-dragging{box-shadow:0 10px 28px rgba(0,0,0,.35);outline:2px solid var(--tblr-primary,#206bc4);cursor:grabbing;position:relative}' +
    '.pk-card[data-has-color]{border:1px solid var(--pk-color);border-top:4px solid var(--pk-color);background:color-mix(in srgb,var(--pk-color) 10%,var(--tblr-bg-surface,#fff))}' +
    '.pk-colorbtn{flex:0 0 auto;width:1.6rem;height:1.6rem;border-radius:50%;border:2px solid var(--tblr-border-color,#adb5bd);background:var(--pk-color,transparent);padding:0;cursor:pointer}' +
    '.pk-palette{display:flex;flex-wrap:wrap;gap:.35rem;align-items:center}' +
    '.pk-palette[hidden]{display:none}' +
    '.pk-swatch{width:1.5rem;height:1.5rem;border-radius:50%;border:2px solid rgba(255,255,255,.55);padding:0;cursor:pointer;flex:0 0 auto}' +
    '.pk-swatch-custom{background:conic-gradient(red,yellow,lime,aqua,blue,magenta,red);position:relative;overflow:hidden;display:inline-block}' +
    '.pk-swatch-custom input{position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer;border:0;padding:0}' +
    '.pk-head{display:flex;gap:.35rem;align-items:center}' +
    '.pk-grip{flex:0 0 auto;cursor:grab;touch-action:none;user-select:none;padding:.45rem .6rem;margin:-.2rem -.15rem;border-radius:.3rem;color:var(--tblr-secondary,#6c7a91);font-size:1.1rem;line-height:1}' +
    '.pk-grip:hover{background:rgba(127,127,127,.15)}' +
    '.pk-title{font-weight:600}' +
    '.pk-body{resize:vertical;min-height:6rem}' +
    '.pk-qty{display:flex;align-items:center;gap:.5rem}' +
    '.pk-actions{display:flex;align-items:stretch;gap:.3rem;flex-wrap:nowrap}' +
    '.pk-actions .btn{flex:1 1 0;min-width:0;padding:.25rem .3rem;font-size:.78rem;white-space:nowrap;display:inline-flex;align-items:center;justify-content:center;height:1.9rem}' +
    '.pk-actions .btn-icon{flex:0 0 1.9rem;font-weight:700;font-size:1rem;line-height:1}' +
    '.pk-qty-input{flex:1 1 auto;min-width:0;text-align:center;font-weight:700}' +
    '.pk-qty-label{font-size:.78rem;color:var(--tblr-secondary,#6c7a91);white-space:nowrap}' +
    '.pk-qtyform{display:flex;flex-direction:column;gap:.35rem;padding:.5rem;border-radius:.4rem;background:rgba(127,127,127,.1)}' +
    '.pk-qtyform[hidden]{display:none}' +
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

  var PALETTE = ['#4263eb', '#1098ad', '#37b24d', '#f59f00', '#f76707', '#e03131', '#d6336c', '#ae3ec9', '#7048e8', '#868e96']

  function cardHtml(item) {
    return '' +
      '<div class="pk-card" data-kanban-card="' + item.id + '"' + (item.color ? ' data-has-color style="--pk-color:' + esc(item.color) + '"' : '') + '>' +
        '<div class="pk-head">' +
          '<span class="pk-grip" data-kanban-grip title="Tahan dan geser untuk memindah urutan" aria-label="Geser kanban">&#8942;&#8942;</span>' +
          '<input class="form-control form-control-sm pk-title" data-k-title maxlength="255" placeholder="Judul kanban" aria-label="Judul kanban" data-role-disable-unless="farm-operate" value="' + esc(item.title) + '" />' +
          '<button class="pk-colorbtn" type="button" data-k-color-toggle data-role-required="farm-operate" title="Warna kartu" aria-label="Warna kartu"></button>' +
          '<button class="btn btn-sm btn-outline-danger" type="button" data-k-delete data-role-required="farm-operate" title="Hapus kanban (masuk History Catatan)" aria-label="Hapus kanban">&times;</button>' +
        '</div>' +
        '<div class="pk-palette" data-k-palette hidden>' +
          PALETTE.map(function (color) { return '<button class="pk-swatch" type="button" data-k-color="' + color + '" style="background:' + color + '" title="' + color + '" aria-label="Warna ' + color + '"></button>' }).join('') +
          '<label class="pk-swatch pk-swatch-custom" title="Warna khusus"><input type="color" data-k-color-custom value="' + esc(item.color || '#4263eb') + '" /></label>' +
          '<button class="btn btn-sm" type="button" data-k-color-theme title="Warna kartu mengikuti tema program">Sesuaikan tema</button>' +
        '</div>' +
        '<div>' +
          '<div class="pk-qty-label">Tanggal pencatatan</div>' +
          '<input type="text" class="form-control form-control-sm" data-date-parts data-k-date data-role-disable-unless="farm-operate" value="' + esc(item.note_date ? String(item.note_date).slice(0, 10) : '') + '" />' +
        '</div>' +
        '<textarea class="form-control pk-body" data-k-body rows="5" placeholder="Catatan" data-role-disable-unless="farm-operate">' + esc(item.body) + '</textarea>' +
        '<div class="pk-qty">' +
          '<span class="pk-qty-label">Qty Kanban</span>' +
          '<input type="number" class="form-control form-control-sm pk-qty-input" min="0" step="1" inputmode="numeric" data-k-qty-input data-no-clear data-role-disable-unless="farm-operate" aria-label="Qty Kanban" value="' + Number(item.qty || 0) + '" />' +
        '</div>' +
        '<div class="pk-actions">' +
          '<button class="btn btn-sm btn-icon" type="button" data-k-qty-open="-1" data-role-required="farm-operate" title="Kurangi ikan" aria-label="Kurangi ikan">&minus;</button>' +
          '<button class="btn btn-sm btn-icon" type="button" data-k-qty-open="1" data-role-required="farm-operate" title="Tambah ikan" aria-label="Tambah ikan">+</button>' +
          '<button class="btn btn-sm" type="button" data-k-move-open data-role-required="farm-operate" title="Pindahkan kartu ini ke kolam lain">Pindah</button>' +
          '<button class="btn btn-sm" type="button" data-k-split-open data-role-required="farm-operate" title="Pecah sebagian ikan ke kartu baru">Pecah</button>' +
          '<button class="btn btn-sm" type="button" data-k-log-toggle>Riwayat</button>' +
        '</div>' +
        '<div class="pk-qtyform" data-k-qtyform hidden>' +
          '<strong data-k-qtymode></strong>' +
          '<input type="number" class="form-control form-control-sm" min="1" step="1" inputmode="numeric" data-k-delta placeholder="Jumlah ikan" />' +
          '<input type="text" class="form-control form-control-sm" data-date-parts data-k-logdate value="' + today() + '" />' +
          '<input type="text" class="form-control form-control-sm" maxlength="500" data-k-lognote placeholder="Keterangan (boleh kosong)" />' +
          '<div class="d-flex gap-2"><button class="btn btn-sm btn-primary" type="button" data-k-qty-save>Catat</button><button class="btn btn-sm" type="button" data-k-qty-cancel>Batal</button></div>' +
        '</div>' +
        '<div class="pk-qtyform" data-k-moveform hidden>' +
          '<strong>Pindahkan kartu ke kolam</strong>' +
          '<select class="form-select form-select-sm" data-k-move-target></select>' +
          '<div class="d-flex gap-2"><button class="btn btn-sm btn-primary" type="button" data-k-move-save>Pindahkan</button><button class="btn btn-sm" type="button" data-k-form-cancel>Batal</button></div>' +
        '</div>' +
        '<div class="pk-qtyform" data-k-splitform hidden>' +
          '<strong>Pecah kanban</strong>' +
          '<input type="number" class="form-control form-control-sm" min="1" step="1" inputmode="numeric" data-k-split-qty />' +
          '<input type="text" class="form-control form-control-sm" maxlength="255" data-k-split-title placeholder="Judul kartu baru (boleh kosong)" />' +
          '<select class="form-select form-select-sm" data-k-split-target></select>' +
          '<div class="pk-qty-label">Catatan dan tanggal disalin ke kartu baru.</div>' +
          '<div class="d-flex gap-2"><button class="btn btn-sm btn-primary" type="button" data-k-split-save>Pecah</button><button class="btn btn-sm" type="button" data-k-form-cancel>Batal</button></div>' +
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
      var moved = Number(row.delta) === 0
      return '<div><span>' + esc(dateText(row.log_date)) + (row.notes ? ' &middot; ' + esc(row.notes) : '') + '<br><span class="text-secondary">' + esc(row.actor || '-') + '</span></span>' +
        (moved ? '<span class="text-secondary">qty ' + Number(row.qty_after) + '</span>' : '<span class="' + (up ? 'pk-up' : 'pk-down') + '">' + (up ? '+' : '') + Number(row.delta) + ' &rarr; ' + Number(row.qty_after) + '</span>') + '</div>'
    }).join('') : '<div class="text-secondary">Belum ada riwayat jumlah.</div>'
  }
  function loadLog(cardEl) {
    var id = cardEl.getAttribute('data-kanban-card')
    return request('GET', api('/ponds/kanban/' + id + '/qty-log')).then(function (rows) { renderLog(cardEl, rows) }).catch(function () {
      cardEl.querySelector('[data-k-log]').textContent = 'Riwayat gagal dimuat.'
    })
  }

  // ---- Pindah / Pecah: the ponds a card can go to --------------------------------------------------------------------------------------------
  var pondList = null
  function withPondOptions(done) {
    if (pondList) return done(pondList)
    request('GET', api('/ponds/options')).then(function (list) { pondList = list; done(list) }).catch(function (error) { say(error.message || 'Daftar kolam gagal dimuat.', true) })
  }
  function optionsHtml(list, firstLabel) {
    var groups = {}
    var order = []
    list.forEach(function (pond) {
      if (String(pond.id) === String(pondId)) return
      if (!groups[pond.location]) { groups[pond.location] = []; order.push(pond.location) }
      groups[pond.location].push(pond)
    })
    return '<option value="">' + esc(firstLabel) + '</option>' + order.map(function (area) {
      return '<optgroup label="' + esc(area) + '">' + groups[area].map(function (pond) { return '<option value="' + pond.id + '">' + esc(pond.name) + '</option>' }).join('') + '</optgroup>'
    }).join('')
  }
  function closeForms(cardEl) {
    ;['[data-k-qtyform]', '[data-k-moveform]', '[data-k-splitform]'].forEach(function (selector) {
      var form = cardEl.querySelector(selector)
      if (form) form.hidden = true
    })
  }

  // ---- colour of a card: random at first, a chosen one, or "Sesuaikan tema" (no colour, follows the theme) -------------------------------------------------
  function setColor(cardEl, color, save) {
    var id = cardEl.getAttribute('data-kanban-card')
    if (color) {
      cardEl.style.setProperty('--pk-color', color)
      cardEl.setAttribute('data-has-color', '')
    } else {
      cardEl.style.removeProperty('--pk-color')
      cardEl.removeAttribute('data-has-color')
    }
    cards[id] = Object.assign(cards[id] || {}, { color: color })
    if (!save) return
    request('PATCH', api('/ponds/kanban/' + id), { color: color }).then(function () { changed = true; say('') }).catch(function (error) { say(error.message || 'Warna gagal disimpan.', true) })
  }
  board.addEventListener('input', function (event) {
    var custom = event.target.closest('[data-k-color-custom]')
    if (custom) setColor(custom.closest('[data-kanban-card]'), custom.value, false)
  })
  board.addEventListener('change', function (event) {
    var custom = event.target.closest('[data-k-color-custom]')
    if (custom) setColor(custom.closest('[data-kanban-card]'), custom.value, true)
  })

  // - / + open a small form (amount, day, note); a number typed in the box sets the quantity to that number. The history keeps the day and who did it.
  function setQty(cardEl, change, done) {
    var id = cardEl.getAttribute('data-kanban-card')
    var input = cardEl.querySelector('[data-k-qty-input]')
    input.disabled = true
    request('POST', api('/ponds/kanban/' + id + '/qty'), change).then(function (data) {
      changed = true
      cards[id] = Object.assign(cards[id] || {}, data.kanban)
      input.value = Number(data.kanban.qty)
      updateTotal()
      say('')
      if (!cardEl.querySelector('[data-k-log]').hidden) loadLog(cardEl)
      if (done) done(true)
    }).catch(function (error) {
      input.value = Number((cards[id] || {}).qty || 0)
      say(error.message || 'Jumlah gagal disimpan.', true)
      if (done) done(false)
    }).then(function () { input.disabled = false })
  }
  board.addEventListener('change', function (event) {
    var input = event.target.closest('[data-k-qty-input]')
    if (!input) return
    var cardEl = input.closest('[data-kanban-card]')
    var id = cardEl.getAttribute('data-kanban-card')
    var value = parseInt(input.value, 10)
    if (isNaN(value) || value < 0) {
      input.value = Number((cards[id] || {}).qty || 0)
      say('Isi jumlah ikan dengan angka 0 atau lebih.', true)
      return
    }
    if (value === Number((cards[id] || {}).qty || 0)) return
    setQty(cardEl, { set: value })
  })

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
      setQty(cardEl, {
        delta: amount * Number(f.getAttribute('data-sign') || 1),
        log_date: f.querySelector('[data-k-logdate]').value,
        notes: f.querySelector('[data-k-lognote]').value,
      }, function (ok) {
        btn.disabled = false
        if (ok) f.hidden = true
      })
      return
    }
    if (event.target.closest('[data-k-color-toggle]')) {
      var palette = cardEl.querySelector('[data-k-palette]')
      palette.hidden = !palette.hidden
      return
    }
    var swatch = event.target.closest('[data-k-color]')
    if (swatch) {
      setColor(cardEl, swatch.getAttribute('data-k-color'), true)
      return
    }
    if (event.target.closest('[data-k-color-theme]')) {
      setColor(cardEl, '', true)
      cardEl.querySelector('[data-k-palette]').hidden = true
      return
    }
    var moveOpen = event.target.closest('[data-k-move-open]')
    var splitOpen = event.target.closest('[data-k-split-open]')
    if (moveOpen || splitOpen) {
      closeForms(cardEl)
      withPondOptions(function (list) {
        if (moveOpen) {
          var mf = cardEl.querySelector('[data-k-moveform]')
          mf.querySelector('[data-k-move-target]').innerHTML = optionsHtml(list, 'Pilih kolam tujuan...')
          mf.hidden = false
        } else {
          var sf = cardEl.querySelector('[data-k-splitform]')
          var qtyNow = Number((cards[id] || {}).qty || 0)
          var qtyBox = sf.querySelector('[data-k-split-qty]')
          qtyBox.value = ''
          qtyBox.placeholder = 'Jumlah ikan dipisah (maks ' + qtyNow + ')'
          sf.querySelector('[data-k-split-title]').value = ''
          sf.querySelector('[data-k-split-target]').innerHTML = optionsHtml(list, 'Kolam ini')
          sf.hidden = false
          qtyBox.focus()
        }
      })
      return
    }
    if (event.target.closest('[data-k-form-cancel]')) {
      closeForms(cardEl)
      return
    }
    if (event.target.closest('[data-k-move-save]')) {
      var target = cardEl.querySelector('[data-k-move-target]').value
      if (!target) { say('Pilih kolam tujuan.', true); return }
      var moveBtn = event.target.closest('[data-k-move-save]')
      moveBtn.disabled = true
      flush()
      request('POST', api('/ponds/kanban/' + id + '/move'), { pond_id: Number(target) }).then(function () {
        changed = true
        return reload().then(function () { say('Kanban dipindahkan ke kolam tujuan.') })
      }).catch(function (error) { moveBtn.disabled = false; say(error.message || 'Kanban gagal dipindahkan.', true) })
      return
    }
    if (event.target.closest('[data-k-split-save]')) {
      var sform = cardEl.querySelector('[data-k-splitform]')
      var amountSplit = parseInt(sform.querySelector('[data-k-split-qty]').value, 10)
      if (!amountSplit || amountSplit < 1) { say('Isi jumlah ikan yang dipisah (angka 1 atau lebih).', true); return }
      var splitBtn = event.target.closest('[data-k-split-save]')
      splitBtn.disabled = true
      flush()
      request('POST', api('/ponds/kanban/' + id + '/split'), {
        qty: amountSplit,
        title: sform.querySelector('[data-k-split-title]').value,
        pond_id: Number(sform.querySelector('[data-k-split-target]').value) || undefined,
      }).then(function () {
        changed = true
        return reload().then(function () { say('Kanban dipecah: kartu baru dibuat.') })
      }).catch(function (error) { splitBtn.disabled = false; say(error.message || 'Kanban gagal dipecah.', true) })
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
  // The card sticks to the finger/mouse (a translateX), the other cards slide aside smoothly to make room, and the board scrolls by
  // itself near its edges. The order is saved once, when the card is let go.
  var drag = null
  function cardEls() { return Array.prototype.slice.call(board.querySelectorAll('[data-kanban-card]')) }
  function orderOf() { return cardEls().map(function (el) { return el.getAttribute('data-kanban-card') }) }

  board.addEventListener('pointerdown', function (event) {
    var grip = event.target.closest('[data-kanban-grip]')
    if (!grip || drag || (event.pointerType === 'mouse' && event.button !== 0)) return
    var cardEl = grip.closest('[data-kanban-card]')
    if (!cardEl || cardEls().length < 2) return
    event.preventDefault()
    var rect = cardEl.getBoundingClientRect()
    drag = { card: cardEl, grip: grip, pointerId: event.pointerId, before: orderOf(), startX: event.clientX, startLeft: rect.left, startScroll: board.scrollLeft, x: event.clientX, shift: 0, raf: 0 }
    try { grip.setPointerCapture(event.pointerId) } catch (e) { /* the move events still reach the board */ }
    cardEl.classList.add('pk-dragging')
    cardEl.style.transition = 'none'
    cardEl.style.zIndex = '5'
    board.style.scrollSnapType = 'none'
    drag.raf = requestAnimationFrame(tick)
  })

  board.addEventListener('pointermove', function (event) {
    if (drag && event.pointerId === drag.pointerId) drag.x = event.clientX
  })

  // one frame: scroll near the edges, put the card under the pointer, and let the others make room
  function tick() {
    if (!drag) return
    var rect = board.getBoundingClientRect()
    var edge = 56
    if (drag.x < rect.left + edge) board.scrollLeft -= Math.min(26, (rect.left + edge - drag.x) / 2 + 4)
    else if (drag.x > rect.right - edge) board.scrollLeft += Math.min(26, (drag.x - (rect.right - edge)) / 2 + 4)

    var card = drag.card
    // where the card would stand with no transform, in the screen's coordinates
    var layoutLeft = card.getBoundingClientRect().left - drag.shift
    // the pointer moved by (x - startX) and the board scrolled by (scrollLeft - startScroll) since the grab
    var wanted = drag.startLeft + (drag.x - drag.startX) + (drag.startScroll - board.scrollLeft)
    var width = card.getBoundingClientRect().width
    var center = wanted + width / 2

    // the slot: the number of other cards whose middle is left of the dragged card's middle
    var others = cardEls().filter(function (el) { return el !== card })
    var slot = 0
    others.forEach(function (el) {
      var r = el.getBoundingClientRect()
      if (r.left + r.width / 2 < center) slot++
    })
    if (cardEls().indexOf(card) !== slot) {
      var firsts = others.map(function (el) { return el.getBoundingClientRect().left })
      var anchor = others[slot] || null
      board.insertBefore(card, anchor)
      // the others slide from where they were to where they are now (FLIP)
      others.forEach(function (el, index) {
        var delta = firsts[index] - el.getBoundingClientRect().left
        if (!delta) return
        el.style.transition = 'none'
        el.style.transform = 'translateX(' + delta + 'px)'
        el.getBoundingClientRect()
        el.style.transition = 'transform .18s ease'
        el.style.transform = ''
      })
      layoutLeft = card.getBoundingClientRect().left - drag.shift
    }
    drag.shift = wanted - layoutLeft
    card.style.transform = 'translateX(' + drag.shift + 'px)'
    drag.raf = requestAnimationFrame(tick)
  }

  function endDrag() {
    if (!drag) return
    var current = drag
    drag = null
    cancelAnimationFrame(current.raf)
    var card = current.card
    // settle into the slot
    card.style.transition = 'transform .16s ease'
    card.style.transform = ''
    setTimeout(function () {
      card.classList.remove('pk-dragging')
      card.style.transition = ''
      card.style.zIndex = ''
      board.style.scrollSnapType = ''
      cardEls().forEach(function (el) { el.style.transition = ''; el.style.transform = '' })
    }, 190)
    var now = orderOf()
    if (now.join(',') === current.before.join(',')) return
    request('POST', api('/ponds/' + pondId + '/kanban/order'), { ids: now.map(Number) }).then(function () { changed = true }).catch(function (error) {
      say(error.message || 'Urutan gagal disimpan.', true)
      reload()
    })
  }
  board.addEventListener('pointerup', endDrag)
  board.addEventListener('pointercancel', endDrag)
  board.addEventListener('lostpointercapture', endDrag)

  // ---- page hooks ----------------------------------------------------------------------------------------------------------------------------
  window.addEventListener('pond-detail-open', function (event) { changed = false; pondList = null; load(event.detail.id) })
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
