var e=`/api`,t=document.querySelector(`[data-gallery-form]`),n=document.querySelector(`[data-gallery-id]`),r=document.querySelector(`[data-media-list]`),i=document.querySelector(`[data-gallery-list]`),a=document.querySelector(`[data-gallery-pond-id]`),o=document.querySelector(`[data-bulk-media-input]`),s=document.querySelector(`[data-paste-media]`),c=document.querySelector(`[data-gallery-error]`),l=document.querySelector(`[data-gallery-submit]`),u=document.querySelector(`[data-modal-title]`),d=document.querySelector(`#gallery-modal`),f=document.querySelector(`#gallery-viewer-modal`),p=document.querySelector(`[data-viewer-title]`),m=document.querySelector(`[data-viewer-body]`),h=async e=>{let t=window.scrollX,n=window.scrollY,r=await e();return requestAnimationFrame(()=>window.scrollTo(t,n)),r},g=null,_=null,v=[],y=`nishikigoi-cache:farm-gallery`,b=e=>String(e??``).replace(/[&<>'"]/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,"'":`&#39;`,'"':`&quot;`})[e]),x=()=>window.tabler?.bootstrap?.Modal||window.bootstrap?.Modal,S=e=>new Promise((t,n)=>{let r=new FileReader;r.addEventListener(`load`,()=>t(r.result)),r.addEventListener(`error`,()=>n(Error(`Media gagal dibaca`))),r.readAsDataURL(e)}),C=async e=>{if(!e||e.type===`image/gif`)return await S(e);let t=await S(e),n=await new Promise((e,n)=>{let r=new Image;r.addEventListener(`load`,()=>e(r)),r.addEventListener(`error`,()=>n(Error(`Gambar gagal diproses`))),r.src=t}),r=Math.min(1,1600/Math.max(n.naturalWidth,n.naturalHeight)),i=document.createElement(`canvas`);return i.width=Math.max(1,Math.round(n.naturalWidth*r)),i.height=Math.max(1,Math.round(n.naturalHeight*r)),i.getContext(`2d`).drawImage(n,0,0,i.width,i.height),i.toDataURL(`image/jpeg`,.76)},w=e=>new Promise(t=>{let n=document.createElement(`video`),r=document.createElement(`canvas`),i=URL.createObjectURL(e);n.muted=!0,n.playsInline=!0,n.preload=`metadata`,n.addEventListener(`loadeddata`,()=>{r.width=n.videoWidth||640,r.height=n.videoHeight||360,r.getContext(`2d`).drawImage(n,0,0,r.width,r.height),URL.revokeObjectURL(i),t(r.toDataURL(`image/webp`,.82))},{once:!0}),n.addEventListener(`error`,()=>{URL.revokeObjectURL(i),t(``)},{once:!0}),n.src=i}),T=e=>window.KoiAuth?.apiUrl?window.KoiAuth.apiUrl(e||``):e||``,E=e=>{let t=T(e);return t?`background-image: url('${b(t)}')`:``},D=e=>{let t=e.thumbnail_url||e.image_url;return e.media_type===`video`?`<button class="gallery-form-preview gallery-form-preview-video d-flex align-items-center justify-content-center w-100 p-0" type="button" data-media-preview data-view-form-media style="${E(t)}">Video</button>`:`<button class="gallery-form-preview w-100 p-0" type="button" data-media-preview data-view-form-media style="${E(t)}"></button>`},O=async(e,t)=>{let n=[`image/png`,`image/jpeg`,`image/webp`,`image/gif`].includes(t.type),r=[`video/mp4`,`video/webm`].includes(t.type);if(!n&&!r)throw Error(`Format media harus gambar, mp4, atau webm`);if(r&&t.size>100*1024*1024)throw Error(`Ukuran video maksimal 100 MB`);e.dataset.mediaType=r?`video`:`image`,e.dataset.imageUrl=``,e.dataset.thumbnailUrl=``;let i=n?await C(t):await S(t);r?(e.dataset.videoData=i,e.dataset.imageData=``,e.dataset.thumbnailData=await w(t)):(e.dataset.imageData=i,e.dataset.videoData=``,e.dataset.thumbnailData=``),e.querySelector(`[data-media-preview]`).outerHTML=D({media_type:e.dataset.mediaType,image_url:n?i:``,thumbnail_url:e.dataset.thumbnailData})},k=(e={})=>{let t=document.createElement(`div`);t.className=`col-sm-6 col-lg-4`,t.dataset.mediaRow=``,t.dataset.mediaType=e.media_type||`image`,t.dataset.imageUrl=e.image_url||``,t.dataset.thumbnailUrl=e.thumbnail_url||``,t.dataset.mediaNotes=e.notes||``,t.innerHTML=`
        <div class="card gallery-form-media-card">
          <button class="btn btn-icon btn-outline-danger gallery-form-remove" type="button" aria-label="Hapus media" data-remove-media>
            <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" /><path d="M9 7v-3h6v3" /></svg>
          </button>
          <div class="card-body">
            ${D(e)}
            <input class="form-control form-control-sm mt-2" name="gallery_media_file" type="file" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm" data-media-input>
            <textarea class="form-control form-control-sm mt-2" name="gallery_media_notes" rows="2" placeholder="Catatan media" data-media-notes>${b(e.notes||``)}</textarea>
          </div>
        </div>
      `;let n=t.querySelector(`[data-media-input]`);n.addEventListener(`change`,async()=>{let e=n.files[0];if(e)try{await O(t,e)}catch(e){n.value=``,c.textContent=e.message,c.classList.remove(`d-none`)}}),t.querySelector(`[data-remove-media]`).addEventListener(`click`,()=>{t.remove(),r.querySelector(`[data-media-row]`)||k()}),t.addEventListener(`click`,e=>{if(!e.target.closest(`[data-view-form-media]`))return;let n={image_url:t.dataset.imageData||t.dataset.videoData||t.dataset.imageUrl||``,media_type:t.dataset.mediaType||`image`,thumbnail_url:t.dataset.thumbnailData||t.dataset.thumbnailUrl||``,notes:t.querySelector(`[data-media-notes]`)?.value.trim()||t.dataset.mediaNotes||``};n.image_url&&I(n)}),r.appendChild(t)},A=()=>Array.from(r.querySelectorAll(`[data-media-row]`)).some(e=>e.dataset.imageUrl||e.dataset.imageData||e.dataset.videoData),j=async e=>{c.classList.add(`d-none`);let t=Array.from(e||[]);if(t.length!==0){A()||(r.innerHTML=``);for(let e of t){let t=r.querySelectorAll(`[data-media-row]`).length;k();let n=r.querySelectorAll(`[data-media-row]`)[t];await O(n,e)}}},M=async()=>{c.classList.add(`d-none`);try{let e=await navigator.clipboard.read(),t=[];for(let n of e){let e=n.types.find(e=>e.startsWith(`image/`));if(!e)continue;let r=await n.getType(e);t.push(new File([r],`paste-gallery-${Date.now()}-${t.length+1}.${e.split(`/`)[1]||`png`}`,{type:e}))}if(!t.length)throw Error(`Clipboard tidak berisi gambar.`);await j(t)}catch(e){c.textContent=e.message||`Paste gambar gagal.`,c.classList.remove(`d-none`)}},N=()=>{t.reset(),n.value=``,a.value=``,r.innerHTML=``,c.classList.add(`d-none`),u.textContent=`Formulir Tambah Galeri`,l.textContent=`Simpan Galeri`,k()},P=()=>{let e=x();if(e){e.getInstance(d)?.hide();return}d.classList.remove(`show`),d.style.display=`none`,d.setAttribute(`aria-hidden`,`true`),d.removeAttribute(`aria-modal`),d.removeAttribute(`role`),document.body.classList.remove(`modal-open`),document.body.style.removeProperty(`overflow`),document.body.style.removeProperty(`padding-right`),g?.remove(),g=null},F=()=>{let e=x();if(m.innerHTML=``,e){e.getInstance(f)?.hide();return}f.classList.remove(`show`),f.style.display=`none`,f.setAttribute(`aria-hidden`,`true`),f.removeAttribute(`aria-modal`),f.removeAttribute(`role`),document.body.classList.remove(`modal-open`),document.body.style.removeProperty(`overflow`),document.body.style.removeProperty(`padding-right`),_?.remove(),_=null},I=e=>{let t=e.thumbnail_url||e.image_url,n=T(e.image_url),r=T(t);p.textContent=e.notes||(e.media_type===`video`?`Video`:`Foto`);if(window.KoiAuth&&window.KoiAuth.zoomPhoto&&n){window.KoiAuth.zoomPhoto(n,p.textContent);return}m.innerHTML=e.media_type===`video`?`<video class="gallery-viewer-media rounded border" src="${b(n)}" poster="${b(r)}" controls autoplay playsinline></video>`:`<img class="gallery-viewer-media rounded border" src="${b(n)}" alt="${b(e.notes||`Preview gallery`)}" />`;let i=x();if(i){i.getOrCreateInstance(f).show();return}f.classList.add(`show`),f.style.display=`block`,f.removeAttribute(`aria-hidden`),f.setAttribute(`aria-modal`,`true`),f.setAttribute(`role`,`dialog`),document.body.classList.add(`modal-open`),document.body.style.overflow=`hidden`,_=document.createElement(`div`),_.className=`modal-backdrop fade show`,_.addEventListener(`click`,F),document.body.appendChild(_)},L=(e=!0)=>{e&&N();let t=x();if(t){t.getOrCreateInstance(d).show();return}d.classList.add(`show`),d.style.display=`block`,d.removeAttribute(`aria-hidden`),d.setAttribute(`aria-modal`,`true`),d.setAttribute(`role`,`dialog`),document.body.classList.add(`modal-open`),document.body.style.overflow=`hidden`,g=document.createElement(`div`),g.className=`modal-backdrop fade show`,g.addEventListener(`click`,P),document.body.appendChild(g)},R=()=>Array.from(r.querySelectorAll(`[data-media-row]`)).map(e=>({image_url:e.dataset.imageUrl||``,image_data:e.dataset.imageData||``,video_data:e.dataset.videoData||``,media_type:e.dataset.mediaType||`image`,thumbnail_url:e.dataset.thumbnailUrl||``,thumbnail_data:e.dataset.thumbnailData||``,notes:e.querySelector(`[data-media-notes]`).value.trim()})).filter(e=>e.image_url||e.image_data||e.video_data),z=e=>{let t=e.thumbnail_url||e.image_url;return`
        <div class="col-4">
          <button class="d-block ratio ratio-1x1 rounded border position-relative w-100 p-0" type="button" data-view-media="${b(e.id)}" style="${E(t)}; background-position: center; background-size: cover;">
            ${e.media_type===`video`?`<span class="badge bg-dark text-white position-absolute bottom-0 end-0 m-1">Video</span>`:``}
          </button>
          <div class="small text-secondary text-truncate mt-1">${b(e.notes||`-`)}</div>
        </div>
      `},B=e=>{v=e,i.innerHTML=e.filter(glMatches).map(e=>`
        <div class="col-md-6 col-xl-4">
          <div class="card h-100">
            <div class="card-body">
              <div class="d-flex align-items-start justify-content-between gap-3 mb-3">
                <div>
                  <h3 class="card-title mb-1">${b(e.title)}</h3>
                  <div class="text-secondary">${e.gallery_date?window.KoiAuth.formatDate(e.gallery_date):`-`}</div>
                  <div class="text-secondary">${e.images.length} media</div>
                </div>
                <div class="btn-list flex-nowrap">
                  <button class="btn btn-icon btn-outline-primary" type="button" aria-label="Edit gallery" data-edit-gallery="${e.id}" data-role-required="database-write">
                    <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4" /><path d="M13.5 6.5l4 4" /></svg>
                  </button>
                  <button class="btn btn-icon btn-outline-danger" type="button" aria-label="Hapus gallery" data-delete-gallery="${e.id}" data-role-required="database-write">
                    <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" /><path d="M9 7v-3h6v3" /></svg>
                  </button>
                </div>
              </div>
              <div class="row g-2 mb-3">
                ${e.images.slice(0,3).map(z).join(``)}
                ${e.images.length>3?`<div class="col-4"><button class="btn w-100 h-100 border" type="button" data-edit-gallery="${e.id}" data-role-required="database-write">+${e.images.length-3} media</button></div>`:``}
              </div>
              <div class="text-secondary">${b(e.notes||`-`)}</div>
            </div>
          </div>
        </div>
      `).join(``)||`<div class="col-12"><div class="card"><div class="card-body text-secondary">${glSearch?`Galeri tidak ditemukan.`:`Belum ada data gallery.`}</div></div></div>`},V=(t=!1)=>fetch(`${e}/gallery`).then(e=>e.ok?e.json():Promise.reject(Error(`Galeri gagal dimuat`))).then(e=>{localStorage.setItem(y,JSON.stringify(e)),B(e)}).catch(()=>{t||(i.innerHTML=`<div class="col-12"><div class="card"><div class="card-body text-danger">Data gallery gagal dimuat.</div></div></div>`)});document.querySelector(`[data-upload-media]`).addEventListener(`click`,()=>o.click()),s.addEventListener(`click`,M),o.addEventListener(`change`,()=>{j(o.files).catch(e=>{c.textContent=e.message,c.classList.remove(`d-none`)}).finally(()=>{o.value=``})}),document.querySelector(`[data-add-media]`).addEventListener(`click`,()=>k()),document.querySelector(`[data-open-create]`).addEventListener(`click`,()=>L()),d.querySelectorAll(`[data-bs-dismiss="modal"], .btn-close`).forEach(e=>{e.addEventListener(`click`,P)}),f.querySelectorAll(`[data-bs-dismiss="modal"], [data-close-viewer]`).forEach(e=>{e.addEventListener(`click`,F)}),i.addEventListener(`click`,async i=>{let o=i.target.closest(`[data-edit-gallery]`),s=i.target.closest(`[data-delete-gallery]`),c=i.target.closest(`[data-view-media]`);if(c){let e=String(c.dataset.viewMedia),t=v.flatMap(e=>e.images||[]).find(t=>String(t.id)===e);t&&I(t)}if(o){let e=v.find(e=>String(e.id)===String(o.dataset.editGallery));if(!e)return;N(),u.textContent=`Formulir Edit Galeri`,l.textContent=`Simpan Perubahan`,n.value=e.id,a.value=e.pond_id||``,t.elements.title.value=e.title||``,t.elements.gallery_date.value=e.gallery_date?String(e.gallery_date).slice(0,10):``,t.elements.notes.value=e.notes||``,r.innerHTML=``,e.images.forEach(k),L(!1)}s&&(await window.KoiDialog.confirm(`Hapus gallery ini?`))&&(await fetch(`${e}/gallery/${s.dataset.deleteGallery}`,{method:`DELETE`}),h(V))}),t.addEventListener(`submit`,async r=>{r.preventDefault(),c.classList.add(`d-none`),l.disabled=!0,l.innerHTML=`<span class="spinner-border spinner-border-sm me-2" role="status" aria-label="Menyimpan gallery"></span><span class="progress progress-sm flex-fill"><span class="progress-bar progress-bar-indeterminate"></span></span>`;try{let r=Object.fromEntries(new FormData(t).entries());if(r.images=R(),r.images.length===0)throw Error(`Minimal satu foto/video wajib diisi`);r.pond_id=r.pond_id||null,r.segment_name=r.title||`Galeri`,r.gallery_date=r.gallery_date||new Date().toISOString().slice(0,10);let i=await fetch(`${e}/gallery${n.value?`/${n.value}`:``}`,{method:n.value?`PUT`:`POST`,headers:{"content-type":`application/json`},body:JSON.stringify(r)}),a=await i.json().catch(()=>({}));if(!i.ok)throw Error(a.detail||a.error||`Galeri gagal disimpan`);N(),P(),h(V)}catch(e){c.textContent=e.message,c.classList.remove(`d-none`)}finally{l.disabled=!1,l.textContent=n.value?`Simpan Perubahan`:`Simpan Galeri`}}),N(),(()=>{try{let e=JSON.parse(localStorage.getItem(y)||`[]`);if(!Array.isArray(e)||e.length===0)return;B(e)}catch{localStorage.removeItem(y)}})(),V();
// ---- Galeri search: plain words + "field:value" -----------------------------------------------------------
// "sumber:laporan kolam:mudpond media:telur" -> every field:value must match (a value runs until the next field:).
// Plain words must all be found in judul, kode sumber, kolam and sumber; a bare number (or #12) is the Galeri ID.
// A comma inside a text value means "or". Catatan is only searched with catatan: (catatan koleksi) or media: (catatan
// foto/video).
var glSearch = ''
var glAliases = {
  id: 'id', nomor: 'id',
  judul: 'title', nama: 'title',
  tanggal: 'gallery_date', tgl: 'gallery_date',
  kode: 'code',
  kolam: 'pond', lokasi: 'pond',
  sumber: 'source', asal: 'source',
  catatan: 'notes', notes: 'notes',
  media: 'media', foto: 'media',
  idmedia: 'media_id',
  tipe: 'media_type', jenismedia: 'media_type',
}
// "bloo:isa" works too: a field name may be shortened to its first letters (2 or more). Exact names win, then the
// first name in the alias list that starts with what was typed. Unknown names stay plain text.
function glResolveMarkers(keyword, aliases) {
  var names = Object.keys(aliases)
  var found = []
  var pattern = /(?:^|[\s,])([a-z]+)\s*:/gi
  var match
  while ((match = pattern.exec(keyword))) {
    var key = match[1].toLowerCase()
    var name = aliases[key] ? key : (key.length >= 2 ? names.find(function (alias) { return alias.indexOf(key) === 0 }) : null)
    if (name) {
      var hit = [match[0], name]
      hit.index = match.index
      found.push(hit)
    }
  }
  return found
}

function glNorm(value) {
  return String(value === null || value === undefined ? '' : value).toLowerCase().trim()
}

function glParts(item) {
  var source = item.source_type === 'report' ? 'laporan' : item.source_type === 'breeding' ? 'breeding' : item.source_type === 'invoice' ? 'invoice penjualan' : item.source_type === 'sell' ? 'katalog penjualan' : item.source_type === 'pond' ? 'kolam data kolam' : 'manual'
  var code = [item.report_batch_code, item.breeding_batch_code, item.invoice_no, item.invoice_client_name, item.sell_title].filter(Boolean).join(' ')
  var pond = [item.pond_name, item.source_pond_name].filter(Boolean).join(' ')
  var images = Array.isArray(item.images) ? item.images : []
  return {
    source: glNorm(source),
    code: glNorm(code + ' ' + (item.report_title || '') + ' ' + (item.breeding_session_name || '')),
    pond: glNorm(pond),
    mediaNotes: glNorm(images.map(function (image) { return [image.notes, image.display_name, image.name].filter(Boolean).join(' ') }).join(' ')),
    mediaIds: images.map(function (image) { return String(image.id) }),
    mediaTypes: glNorm(images.map(function (image) { return image.media_type === 'video' ? 'video' : 'foto gambar image' }).join(' ')),
  }
}

function glDateText(value) {
  var match = String(value || '').trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  return match ? match[3] + '-' + match[2].padStart(2, '0') + '-' + match[1].padStart(2, '0') : String(value || '').trim()
}

// true / false, or null while the value is still being typed
function glField(item, parts, field, rawValue) {
  var value = glNorm(rawValue)
  if (!value) return null
  if (field === 'id') return String(item.id) === value.replace(/^#/, '')
  if (field === 'media_id') return parts.mediaIds.indexOf(value.replace(/^#/, '')) >= 0
  if (field === 'gallery_date') return String(item.gallery_date || '').slice(0, 10).includes(glDateText(value))
  return value.split(',').map(function (part) { return part.trim() }).filter(Boolean).some(function (choice) {
    if (field === 'code') return parts.code.includes(choice)
    if (field === 'pond') return parts.pond.includes(choice)
    if (field === 'source') return parts.source.includes(choice)
    if (field === 'media') return parts.mediaNotes.includes(choice)
    if (field === 'media_type') return parts.mediaTypes.includes(choice)
    return glNorm(item[field]).includes(choice)
  })
}

function glMatches(item) {
  var keyword = String(glSearch || '').trim()
  if (!keyword) return true
  var markers = glResolveMarkers(keyword, glAliases)
  var plain = markers.length ? keyword.slice(0, markers[0].index) : keyword
  var parts = glParts(item)
  for (var index = 0; index < markers.length; index += 1) {
    var marker = markers[index]
    var valueStart = marker.index + marker[0].length
    var valueEnd = index + 1 < markers.length ? markers[index + 1].index : keyword.length
    if (glField(item, parts, glAliases[marker[1].toLowerCase()], keyword.slice(valueStart, valueEnd)) === false) return false
  }
  var alternatives = plain.split(',').map(function (part) { return glNorm(part).split(/\s+/).filter(Boolean) }).filter(function (words) { return words.length })
  if (!alternatives.length) return true
  var blob = glNorm([item.title, parts.code, parts.pond, parts.source].join(' '))
  return alternatives.some(function (words) {
    return words.every(function (word) { return /^#?\d+$/.test(word) ? String(item.id) === word.replace('#', '') || blob.includes(word.replace('#', '')) : blob.includes(word) })
  })
}

// the navbar search feeds the hidden [data-gallery-search] input
;(function () {
  var box = document.querySelector('[data-gallery-search]')
  var navbar = document.querySelector('#navbar-global-search')
  if (navbar) {
    navbar.setAttribute('placeholder', 'Judul, kolam, sumber:laporan, media:kata')
    navbar.setAttribute('title', 'Cari bebas: judul, kode laporan/breeding, kolam, sumber, atau ID galeri. Cari per kolom dengan kolom:isi, boleh digabung: sumber:laporan kolam:mudpond media:telur. Nama kolom boleh disingkat (misalnya jen:panen). Kolom: id, judul, tanggal, kode, kolam, sumber, catatan, media, idmedia, tipe.')
  }
  if (box) box.addEventListener('input', function () { glSearch = box.value.trim(); B(v) })
})()
