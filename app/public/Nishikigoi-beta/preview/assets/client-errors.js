// Reports a JavaScript error or a file that failed to load to the server log, as a request to /api/client-error?... (the address
// appears in the web server's access log, so an error that only happens on a phone can be read from the PC). Nothing else is sent.
(function () {
  var sent = 0
  function send(info) {
    if (sent++ > 8) return
    try {
      var query = Object.keys(info).map(function (key) { return key + '=' + encodeURIComponent(String(info[key] == null ? '' : info[key]).slice(0, 300)) }).join('&')
      new Image().src = '/api/client-error?' + query + '&ua=' + encodeURIComponent(navigator.userAgent.slice(0, 60))
    } catch (error) { /* nothing to do */ }
  }
  window.addEventListener('error', function (event) {
    if (event.target && event.target !== window && (event.target.src || event.target.href)) {
      send({ t: 'load', src: event.target.src || event.target.href, p: location.pathname })
      return
    }
    send({ t: 'error', m: event.message, f: String(event.filename || '').split('/').pop(), l: event.lineno, c: event.colno, p: location.pathname })
  }, true)
  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason
    send({ t: 'reject', m: reason && (reason.message || reason), p: location.pathname })
  })
})()
