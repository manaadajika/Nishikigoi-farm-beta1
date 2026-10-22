// The menu of the profile picture (top right): Profile, Settings & Privacy (Account settings, Change Log, Theme Settings,
// Give Feedback, Master Akun for a Master Admin) and Sign out. Built here so every page shows the same menu.
;(function () {
  'use strict'
  var menu = document.querySelector('.navbar-user-menu')
  if (!menu || menu.getAttribute('data-koi-menu')) return
  menu.setAttribute('data-koi-menu', '1')

  var PATHS = {
    user: '<path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0" /><path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" />',
    settings: '<path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z" /><path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />',
    chevron: '<path d="M6 9l6 6l6 -6" />',
    clipboard: '<path d="M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2" /><path d="M9 3m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z" /><path d="M9 12l.01 0" /><path d="M13 12l2 0" /><path d="M9 16l.01 0" /><path d="M13 16l2 0" />',
    palette: '<path d="M12 21a9 9 0 0 1 0 -18c4.97 0 9 3.582 9 8c0 1.06 -.474 2.078 -1.318 2.828c-.844 .75 -1.989 1.172 -3.182 1.172h-2.5a2 2 0 0 0 -1 3.75a1.3 1.3 0 0 1 -1 2.25" /><path d="M8.5 10.5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M12.5 7.5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M16.5 10.5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />',
    feedback: '<path d="M4 21v-13a3 3 0 0 1 3 -3h10a3 3 0 0 1 3 3v6a3 3 0 0 1 -3 3h-9l-4 4" /><path d="M12 8v3" /><path d="M12 14v.01" />',
    shield: '<path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3" /><path d="M12 11m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M12 12l0 2.5" />',
    logout: '<path d="M14 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2" /><path d="M9 12h12l-3 -3" /><path d="M18 15l3 -3" />',
  }
  var icon = function (name, cls) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" class="icon ' + (cls || 'dropdown-item-icon') + '">' + PATHS[name] + '</svg>'
  }

  var style = document.createElement('style')
  style.textContent = '.koi-sp-list{padding-bottom:.25rem}' +
    '.koi-sp-list .dropdown-item{padding-left:2.6rem}' +
    '[data-koi-sp-toggle] .koi-sp-chevron{transition:transform .15s ease;margin-left:auto}' +
    '[data-koi-sp-toggle][aria-expanded="true"] .koi-sp-chevron{transform:rotate(180deg)}'
  document.head.appendChild(style)

  menu.innerHTML =
    '<a class="dropdown-item" href="#" data-koi-my-profile>' + icon('user') + ' Profile</a>' +
    '<div class="dropdown-divider"></div>' +
    '<a class="dropdown-item d-flex align-items-center" href="#" data-koi-sp-toggle aria-expanded="false">' + icon('settings') + ' Settings &amp; Privacy ' + icon('chevron', 'koi-sp-chevron me-0') + '</a>' +
    '<div class="koi-sp-list" data-koi-sp-list hidden>' +
      '<a class="dropdown-item" href="./settings.html">Pengaturan Akun</a>' +
      '<a class="dropdown-item" href="./farm-log.html#changelog" data-koi-changelog>Change Log</a>' +
      '<a class="dropdown-item" href="#" data-bs-toggle="offcanvas" data-bs-target="#offcanvas-settings" aria-controls="offcanvas-settings">Theme Settings</a>' +
      '<a class="dropdown-item" href="#" data-feedback-open>Give Feedback</a>' +
      '<a class="dropdown-item" href="./settings-master-account.html" data-role-required="master-admin">Master Akun</a>' +
    '</div>' +
    '<div class="dropdown-divider"></div>' +
    '<a class="dropdown-item" href="./sign-in.html" data-action="logout">' + icon('logout') + ' Sign out</a>'

  menu.addEventListener('click', function (event) {
    var toggle = event.target.closest('[data-koi-sp-toggle]')
    if (toggle) {
      // opens or closes the list without closing the whole menu
      event.preventDefault()
      event.stopPropagation()
      var list = menu.querySelector('[data-koi-sp-list]')
      list.hidden = !list.hidden
      toggle.setAttribute('aria-expanded', list.hidden ? 'false' : 'true')
      return
    }
    var mine = event.target.closest('[data-koi-my-profile]')
    if (mine) {
      event.preventDefault()
      if (window.KoiProfile) window.KoiProfile.openMine()
      return
    }
    var log = event.target.closest('[data-koi-changelog]')
    if (log) {
      // already on the Log page: open the tab instead of reloading
      var tab = document.querySelector('[data-log-tab="changelog"]')
      if (tab) { event.preventDefault(); tab.click() }
    }
  })
})()
