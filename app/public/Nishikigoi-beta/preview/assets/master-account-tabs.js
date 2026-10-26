// Pengaturan Master Akun: Daftar Akun, Akun yang Sedang Login and Riwayat Login become three tabs (like the program's menu),
// each with its own search box. Riwayat Login also gets "Muat lebih banyak" and a "Menampilkan X dari Y" line.
// It rearranges the page's existing blocks and filters the rows the page already draws; it does not draw the tables itself.
;(function () {
  var STEP = 100
  var KEY = 'koi-master-account-tab'

  function start() {
    var titles = {}
    Array.prototype.forEach.call(document.querySelectorAll('h3.card-title'), function (h) { titles[h.textContent.trim()] = h })
    var defs = [
      { id: 'accounts', title: 'Daftar Akun', icon: '<circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M21 21v-2a4 4 0 0 0 -3 -3.85"/>', hint: 'Cari nama, username, email, role...' },
      { id: 'sessions', title: 'Akun yang Sedang Login', label: 'Sedang Login', icon: '<path d="M12 18.5l-3 -1.5l-6 3v-13l6 -3l6 3l6 -3v7.5"/><path d="M9 4v13"/><path d="M15 7v5.5"/><path d="M21.121 20.121a3 3 0 1 0 -4.242 0c.418 .419 1.125 1.045 2.121 1.879c1.051 -.89 1.759 -1.516 2.121 -1.879"/>', hint: 'Cari akun, role, perangkat...' },
      { id: 'history', title: 'Riwayat Login', icon: '<path d="M12 8l0 4l2 2"/><path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5"/>', hint: 'Cari username atau alamat IP...' },
    ]
    for (var i = 0; i < defs.length; i += 1) {
      var heading = titles[defs[i].title]
      if (!heading) return
      var head = heading.closest('.d-flex')
      var table = head && head.nextElementSibling
      while (table && !table.classList.contains('table-responsive')) table = table.nextElementSibling
      if (!head || !table) return
      defs[i].heading = heading
      defs[i].head = head
      defs[i].table = table
    }
    defs.forEach(function (def) {
      var pane = document.createElement('div')
      pane.setAttribute('data-account-pane', def.id)
      def.head.parentNode.insertBefore(pane, def.head)
      pane.appendChild(def.head)
      pane.appendChild(def.table)
      def.pane = pane
      // the heading text is now the tab itself
      def.heading.classList.add('d-none')
    })

    var style = document.createElement('style')
    style.textContent =
      '.koi-mini-tabs{display:flex;gap:.25rem;overflow-x:auto;border-bottom:1px solid var(--tblr-border-color);margin-bottom:1rem}' +
      '.koi-mini-tabs button{display:inline-flex;align-items:center;gap:.4rem;border:0;border-bottom:2px solid transparent;background:none;padding:.5rem .85rem;font-size:.875rem;color:var(--tblr-secondary);white-space:nowrap;margin-bottom:-1px}' +
      '.koi-mini-tabs button:hover{color:var(--tblr-body-color)}' +
      '.koi-mini-tabs button.is-active{color:var(--tblr-body-color);border-bottom-color:var(--tblr-body-color)}' +
      '.koi-pane-search{max-width:16rem;min-width:11rem}'
    document.head.appendChild(style)

    var bar = document.createElement('div')
    bar.className = 'koi-mini-tabs'
    bar.setAttribute('role', 'tablist')
    defs.forEach(function (def) {
      var button = document.createElement('button')
      button.type = 'button'
      button.setAttribute('role', 'tab')
      button.dataset.tab = def.id
      button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + def.icon + '</svg><span>' + (def.label || def.title) + '</span>'
      bar.appendChild(button)
    })
    defs[0].pane.parentNode.insertBefore(bar, defs[0].pane)

    function show(id) {
      defs.forEach(function (def) { def.pane.classList.toggle('d-none', def.id !== id) })
      Array.prototype.forEach.call(bar.children, function (button) {
        var on = button.dataset.tab === id
        button.classList.toggle('is-active', on)
        button.setAttribute('aria-selected', on ? 'true' : 'false')
      })
      try { window.sessionStorage.setItem(KEY, id) } catch (error) {}
    }
    bar.addEventListener('click', function (event) {
      var button = event.target.closest('[data-tab]')
      if (button) show(button.dataset.tab)
    })
    var remembered = ''
    try { remembered = window.sessionStorage.getItem(KEY) || '' } catch (error) {}
    show(defs.some(function (def) { return def.id === remembered }) ? remembered : 'accounts')

    // ---- one search box per tab, placed in the heading row before the buttons ---------------------------------------
    defs.forEach(function (def) {
      var input = document.createElement('input')
      input.type = 'search'
      input.className = 'form-control koi-pane-search'
      input.placeholder = def.hint
      input.setAttribute('aria-label', def.hint)
      input.autocomplete = 'off'
      var buttons = def.head.querySelector('.btn-list') || def.head.querySelector('button')
      def.head.insertBefore(input, buttons)
      def.head.classList.add('gap-2')
      def.input = input
    })

    // rows the page draws are hidden when they do not match; the page redraws a table with innerHTML, so it is checked again
    function applyFilter(def) {
      var body = def.table.querySelector('tbody')
      if (!body) return
      var words = def.input.value.toLowerCase().split(/\s+/).filter(Boolean)
      var shown = 0
      var rows = Array.prototype.filter.call(body.children, function (row) { return !row.hasAttribute('data-search-empty') })
      var hasData = rows.some(function (row) { return row.children.length > 1 })
      rows.forEach(function (row) {
        var single = row.children.length === 1
        var text = row.textContent.toLowerCase()
        var match = single || words.every(function (word) { return text.indexOf(word) !== -1 })
        row.classList.toggle('d-none', !match)
        if (match && !single) shown += 1
      })
      var note = body.querySelector('[data-search-empty]')
      if (words.length && hasData && shown === 0) {
        if (!note) {
          note = document.createElement('tr')
          note.setAttribute('data-search-empty', '')
          note.innerHTML = '<td colspan="9" class="text-secondary">Tidak ada yang cocok dengan pencarian.</td>'
          body.appendChild(note)
        }
      } else if (note) {
        note.remove()
      }
    }
    ;[defs[0], defs[1]].forEach(function (def) {
      var body = def.table.querySelector('tbody')
      var applying = false
      def.input.addEventListener('input', function () { applyFilter(def) })
      if (body && window.MutationObserver) {
        new MutationObserver(function () {
          if (applying) return
          applying = true
          applyFilter(def)
          // the observer callback is queued after its own changes: look at them before letting go
          window.setTimeout(function () { applying = false }, 0)
        }).observe(body, { childList: true })
      }
    })

    // ---- Riwayat Login: the search runs on the server (all records, not only the visible ones) ---------------------
    var history = defs[2]
    var limit = STEP
    var info = document.createElement('div')
    info.className = 'd-flex align-items-center justify-content-between gap-2 flex-wrap mb-4'
    info.innerHTML = '<span class="text-secondary small" data-history-info></span><button type="button" class="btn btn-sm d-none" data-history-more>Muat lebih banyak</button>'
    history.pane.appendChild(info)
    history.table.classList.remove('mb-4')
    history.table.classList.add('mb-2')
    var infoText = info.querySelector('[data-history-info]')
    var moreButton = info.querySelector('[data-history-more]')
    function reload() {
      var refresh = document.querySelector('[data-action="refresh-login-history"]')
      if (refresh) refresh.click()
    }
    window.koiHistoryParams = function () {
      var q = history.input.value.trim()
      return '?limit=' + limit + (q ? '&q=' + encodeURIComponent(q) : '')
    }
    window.koiHistoryLoaded = function (shown, total) {
      var searching = history.input.value.trim() !== ''
      infoText.textContent = total === 0 ? '' : 'Menampilkan ' + shown + ' dari ' + total + (searching ? ' catatan yang cocok' : ' catatan')
      moreButton.classList.toggle('d-none', shown >= total)
    }
    moreButton.addEventListener('click', function () { limit += STEP; reload() })
    var timer = null
    history.input.addEventListener('input', function () {
      window.clearTimeout(timer)
      timer = window.setTimeout(function () { limit = STEP; reload() }, 300)
    })
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
  else start()
})()
