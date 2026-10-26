// Master Akun > Tambah/Edit Akun: the password is typed twice (the second box must match) and an eye button shows what is typed.
// Works on top of the page's own form: it only adds a field and stops "Submit" while the two boxes differ.
;(function () {
  function start() {
    var password = document.getElementById('account-password')
    var submit = document.querySelector('[data-action="save-account"]')
    if (!password || !submit || document.getElementById('account-password-confirm')) return
    var group = password.parentElement

    var eye = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0"/><path d="M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6"/></svg>'
    var eyeOff = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.585 10.587a2 2 0 0 0 2.829 2.828"/><path d="M16.681 16.673a8.717 8.717 0 0 1 -4.681 1.327c-3.6 0 -6.6 -2 -9 -6c1.272 -2.12 2.712 -3.678 4.32 -4.674m2.86 -1.146a9.055 9.055 0 0 1 1.82 -.18c3.6 0 6.6 2 9 6c-.666 1.11 -1.379 2.067 -2.138 2.87"/><path d="M3 3l18 18"/></svg>'

    // the first box and the eye button share one input group
    var wrap = document.createElement('div')
    wrap.className = 'input-group'
    password.parentNode.insertBefore(wrap, password)
    wrap.appendChild(password)
    var toggle = document.createElement('button')
    toggle.type = 'button'
    toggle.className = 'btn btn-icon'
    toggle.title = 'Tampilkan password'
    toggle.setAttribute('aria-label', 'Tampilkan password')
    toggle.innerHTML = eye
    wrap.appendChild(toggle)

    var label = document.createElement('label')
    label.className = 'form-label mt-3'
    label.htmlFor = 'account-password-confirm'
    label.textContent = 'Ulangi password'
    var confirm = document.createElement('input')
    confirm.type = 'password'
    confirm.className = 'form-control'
    confirm.id = 'account-password-confirm'
    confirm.autocomplete = 'new-password'
    var error = document.createElement('div')
    error.className = 'text-danger small mt-1 d-none'
    var hint = group.querySelector('[data-password-hint]')
    group.insertBefore(label, hint)
    group.insertBefore(confirm, hint)
    group.insertBefore(error, hint)

    function setShown(shown) {
      password.type = shown ? 'text' : 'password'
      confirm.type = shown ? 'text' : 'password'
      toggle.innerHTML = shown ? eyeOff : eye
      toggle.title = shown ? 'Sembunyikan password' : 'Tampilkan password'
      toggle.setAttribute('aria-label', toggle.title)
    }
    function showError(message) {
      error.textContent = message || ''
      error.classList.toggle('d-none', !message)
    }
    var shown = false
    toggle.addEventListener('click', function () { shown = !shown; setShown(shown) })
    confirm.addEventListener('input', function () { showError('') })
    password.addEventListener('input', function () { showError('') })

    // a new form (Tambah/Edit) starts with an empty second box and hidden letters
    var title = document.querySelector('[data-account-form-title]')
    if (title && window.MutationObserver) {
      new MutationObserver(function () { confirm.value = ''; shown = false; setShown(false); showError('') })
        .observe(title, { childList: true, characterData: true, subtree: true })
    }

    // runs before the page's own Submit handler and stops it when the two boxes differ
    document.addEventListener('click', function (event) {
      if (!event.target.closest('[data-action="save-account"]')) return
      if (password.value === '' && confirm.value === '') return
      if (password.value !== confirm.value) {
        event.stopImmediatePropagation()
        event.preventDefault()
        showError('Password dan ulangi password belum sama.')
        confirm.focus()
      }
    }, true)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
  else start()
})()
