// Service worker Nishikigoi - satu-satunya tugasnya: menampilkan halaman "Koneksi gagal" bertema program
// saat server tidak terjangkau (komputer/HP server mati, jaringan putus). Tidak menyimpan halaman, data,
// atau API apa pun, jadi tidak pernah membuat program menampilkan versi lama.
// Dilayani dari /sw.js supaya cakupannya seluruh situs (lihat astro.config.mjs untuk salinannya ke root).
var CACHE = 'nishikigoi-offline-v2'
var PAGE = '/assets/error.html'
var SHELL = [PAGE, '/dist/css/tabler.css', '/dist/css/tabler-themes.css']

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      // satu per satu: file yang tidak ada tidak boleh menggagalkan pemasangan
      return Promise.all(SHELL.map(function (url) { return cache.add(url).catch(function () {}) }))
    }).then(function () { return self.skipWaiting() })
  )
})

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (key) { return key !== CACHE }).map(function (key) { return caches.delete(key) }))
    }).then(function () { return self.clients.claim() })
  )
})

function fromCache(request) {
  return caches.open(CACHE).then(function (cache) {
    return cache.match(request, { ignoreSearch: true })
  })
}

self.addEventListener('fetch', function (event) {
  var request = event.request
  if (request.method !== 'GET') return
  var url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Berkas pendukung halaman error: jaringan dulu, cadangan dari cache.
  if (SHELL.indexOf(url.pathname) >= 0) {
    event.respondWith(
      fetch(request).then(function (response) {
        if (response && response.ok) {
          var copy = response.clone()
          caches.open(CACHE).then(function (cache) { cache.put(url.pathname, copy) })
        }
        return response
      }).catch(function () {
        return fromCache(url.pathname).then(function (cached) { return cached || Response.error() })
      })
    )
    return
  }

  // Halaman yang dibuka pengguna: bila server tidak terjangkau, arahkan ke halaman Koneksi gagal.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(function () {
        var from = url.pathname + url.search
        return Response.redirect(PAGE + '?code=offline&from=' + encodeURIComponent(from), 302)
      })
    )
  }
})
