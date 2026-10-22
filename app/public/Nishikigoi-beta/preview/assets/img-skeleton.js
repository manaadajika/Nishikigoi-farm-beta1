// Foto yang belum siap: pembungkusnya (yang tampak sebagai warna solid) berkedip lembut seperti cahaya sekitar
// sampai gambarnya selesai dimuat, sehingga jelas bahwa foto sedang dimuat dan bukan kosong.
;(function () {
  if (window.__koiImgSkeleton) return
  window.__koiImgSkeleton = true

  var style = document.createElement('style')
  style.id = 'koi-img-skeleton-style'
  style.textContent = '@keyframes koi-skel-pulse{0%,100%{opacity:0}50%{opacity:1}}' +
    '.koi-img-loading::after{content:"";position:absolute;inset:0;z-index:1;border-radius:inherit;pointer-events:none;' +
    'background:linear-gradient(135deg,rgba(255,255,255,.55),rgba(255,255,255,.22));animation:koi-skel-pulse 1.5s ease-in-out infinite}' +
    'html[data-bs-theme="dark"] .koi-img-loading::after{background:linear-gradient(135deg,rgba(255,255,255,.34),rgba(255,255,255,.1))}' +
    '@media (prefers-reduced-motion:reduce){.koi-img-loading::after{animation:none;opacity:.5}}' +
    '@media print{.koi-img-loading::after{display:none}}'
  ;(document.head || document.documentElement).appendChild(style)

  var queue = []
  var scheduled = false

  function mark(img) {
    if (!img || img.__koiSkel || (img.complete && img.naturalWidth > 0)) return
    var parent = img.parentElement
    if (!parent || parent.closest('.navbar, .avatar, .dropdown-menu, .modal-backdrop, [data-koi-no-skeleton]')) return
    img.__koiSkel = true
    queue.push(img)
    if (!scheduled) {
      scheduled = true
      setTimeout(flush, 0)
    }
  }

  // reads first, writes after, so many images at once cause a single layout pass
  function flush() {
    scheduled = false
    var batch = queue
    queue = []
    var todo = []
    var i
    for (i = 0; i < batch.length; i++) {
      var img = batch[i]
      var parent = img.parentElement
      if (!parent || (img.complete && img.naturalWidth > 0)) continue
      if (parent.clientWidth < 56 || parent.clientHeight < 56) continue // icons, avatars and thumbnails
      todo.push({ img: img, parent: parent, restore: window.getComputedStyle(parent).position === 'static' })
    }
    todo.forEach(function (item) {
      if (item.restore) item.parent.style.position = 'relative'
      item.parent.classList.add('koi-img-loading')
      var done = function () {
        item.parent.classList.remove('koi-img-loading')
        if (item.restore) item.parent.style.position = ''
      }
      item.img.addEventListener('load', done, { once: true })
      item.img.addEventListener('error', done, { once: true })
    })
  }

  function scan(root) {
    if (!root || root.nodeType !== 1) return
    if (root.tagName === 'IMG') { mark(root); return }
    var images = root.querySelectorAll ? root.querySelectorAll('img') : []
    for (var i = 0; i < images.length; i++) mark(images[i])
  }

  function start() {
    scan(document.body)
    new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var added = records[i].addedNodes
        for (var j = 0; j < added.length; j++) scan(added[j])
      }
    }).observe(document.body, { childList: true, subtree: true })
  }
  if (document.body) start()
  else document.addEventListener('DOMContentLoaded', start)
})()
