var rdDock,rdExcel,rdDelete,rdChoose,LD=v0=>window.KoiAuth.formatDate(v0);
var e=`/api`,t=document.querySelector(`[data-report-form]`),n=document.querySelector(`[data-report-modal]`),zzGetModalApi=()=>window.tabler&&window.tabler.bootstrap&&window.tabler.bootstrap.Modal||window.bootstrap&&window.bootstrap.Modal,i=document.querySelector(`[data-report-modal-title]`),a=document.querySelector(`[data-report-error]`),o=document.querySelector(`[data-report-success]`),s=document.querySelector(`[data-report-submit]`),c=document.querySelector(`[data-report-date]`),l=document.querySelector(`[data-batch-code]`),u=document.querySelector(`[data-report-table]`),d=document.querySelector(`[data-pond-entry-list]`),f=document.querySelector(`[data-breeding-entry-list]`),p=document.querySelector(`[data-koi-entry-list]`),m=document.querySelector(`[data-account-entry-list]`),h=document.querySelector(`[data-media-preview-list]`),g=document.querySelector(`[data-media-status]`),_=document.querySelector(`[data-spectrum-input]`),ee=document.querySelector(`[data-spectrum-grid]`),condEntryList=document.querySelector(`[data-condition-entry-list]`),sortEntryList=document.querySelector(`[data-sorting-entry-list]`),v={data_ulang:`Data Ulang`,panen:`Panen`},te=[[`up_to_12`,`UP TO 12 CM`,0,12],[`13_15`,`13 - 15 CM`,13,15],[`16_20`,`16 - 20 CM`,16,20],[`21_25`,`21 - 25 CM`,21,25],[`26_30`,`26 - 30 CM`,26,30],[`31_35`,`31 - 35 CM`,31,35],[`36_40`,`36 - 40 CM`,36,40],[`41_45`,`41 - 45 CM`,41,45],[`46_50`,`46 - 50 CM`,46,50],[`51_55`,`51 - 55 CM`,51,55],[`56_60`,`56 - 60 CM`,56,60],[`61_65`,`61 - 65 CM`,61,65],[`66_70`,`66 - 70 CM`,66,70],[`71_75`,`71 - 75 CM`,71,75],[`76_80`,`76 - 80 CM`,76,80],[`81_85`,`81 - 85 CM`,81,85],[`86_90`,`86 - 90 CM`,86,90],[`91_95`,`91 - 95 CM`,91,95],[`96_99`,`96 - 99 CM`,96,99],[`over_100`,`OVER 100 CM`,100,1/0]],ne=[],y={},b=[],x=[],S=[],C=[],w=!1,T=null,E=``,D=`nishikigoi-cache:farm-reports`,O=e=>String(e??``).replace(/[&<>'"]/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,"'":`&#39;`,'"':`&quot;`})[e]),k=(e,t=[])=>{try{return e?JSON.parse(e):t}catch{return t}},A=e=>e?window.KoiAuth.formatDate(String(e).slice(0,10)):`-`,re=async()=>{if(T)return;let t=c.value;if(!t){l.value=``;return}try{l.value=(await(await fetch(`${e}/farm-report-next-code?date=${encodeURIComponent(t)}`)).json()).batch_code||``}catch{l.value=``}},j=()=>{const z=zzGetModalApi();z?z.getOrCreateInstance(n).show():(n.classList.add(`show`),n.style.display=`block`)},M=()=>{const z=zzGetModalApi();z?z.getInstance(n)?.hide():(n.classList.remove(`show`),n.style.display=`none`)},N=(e,t,n)=>{let r=String(t||``).toLowerCase().trim();return e.find(e=>n(e).toLowerCase()===r)||e.find(e=>n(e).toLowerCase().includes(r))},P=(e=null)=>document.querySelectorAll(`[data-koi-search-menu],[data-breeding-search-menu],[data-account-search-menu],[data-dominant-variety-search-menu]`).forEach(t=>{t!==e&&(t.classList.add(`d-none`),t.innerHTML=``)}),F=e=>[e.code,e.name,e.variety].filter(Boolean).join(` - `),I=e=>[e.batch_code,e.session_name].filter(Boolean).join(` - `),L=e=>`${e.name||e.username} @${e.username}`,R=e=>{let t=String(e||``).trim();if(!t)return``;let n=window.KoiAuth?.apiUrl?window.KoiAuth.apiUrl(t):t;try{return new URL(n,window.location.origin).href}catch{return n}},ie=(e={})=>e.image_url||e.photo_url||e.thumbnail_url||e.avatar||e.female_image_url||e.male_image_url||e.female_photo_url||e.male_photo_url||``,z=(e={},t)=>t===`breeding`?[e.spawning_method,e.method,e.status,e.pond_name,e.pond_label].filter(Boolean).join(` - `):[e.variety,e.gender,e.current_length_cm?`${e.current_length_cm} cm`:e.size_cm?`${e.size_cm} cm`:e.size].filter(Boolean).join(` - `),ae=e=>{let t=String(e||``).toLowerCase();return t.includes(`female`)||t.includes(`betina`)?`Betina`:t.includes(`male`)||t.includes(`jantan`)?`Jantan`:e||`Tidak diketahui`},oe=(e={})=>[{label:`ID`,value:e.code||e.kode||e.id||`-`},{label:`Varietas`,value:e.variety||e.varietas||`-`},{label:`Kelamin`,value:ae(e.gender||e.sex)},{label:`Nama`,value:e.name||e.nama||`-`}],se=(e,t,n)=>{try{let r=typeof e==`string`?JSON.parse(e):e,i=Array.isArray(r)?r:[];return i.length?i:t?[{koi_id:t,label:n||``,notes:``}]:[]}catch{return t?[{koi_id:t,label:n||``,notes:``}]:[]}},ce=(e,t)=>{let n=e?.koi_id?window.KoiPicker.cache[String(e.koi_id)]:null,r=String(e?.label||``).split(` - `).map(e=>e.trim()).filter(Boolean),i=n?.code||e?.code||r[0]||e?.koi_id||`-`,a=n?.name||e?.name||r[1]||`-`;return{id:e?.koi_id||i,code:i,name:a,variety:n?.variety||e?.variety||`-`,gender:n?.gender?ae(n.gender):t,bloodline:n?.bloodline||e?.bloodline||``,image_url:n?.image_url||e?.image_url||``,notes:e?.notes||``,length_cm:e?.length_cm||n?.current_length_cm||``}},B=(e={})=>{let t=[e.female_koi_code,e.female_koi_name].filter(Boolean).join(` - `),n=[e.male_koi_code,e.male_koi_name].filter(Boolean).join(` - `);return[...se(e.female_parent_entries,e.female_koi_id,t).map(e=>ce(e,`Betina`)),...se(e.male_parent_entries,e.male_koi_id,n).map(e=>ce(e,`Jantan`))]},V=(e={},t)=>t===`breeding`?[{label:`ID`,value:e.batch_code||e.id||`-`},{label:`Varietas`,value:B(e).map(e=>e.variety).filter(e=>e&&e!==`-`).join(`, `)||`-`},{label:`Kelamin`,value:B(e).map(e=>e.gender).join(` & `)||`-`},{label:`Nama`,value:e.session_name||e.name||`-`}]:oe(e),le=(e=[])=>`<div class="report-linked-details">${e.map(e=>`<span><strong>${O(e.value||`-`)}</strong>${O(e.label)}</span>`).join(``)}</div>`,ue=(e=[])=>e.length?`<div class="report-parent-list">${e.map((e,t)=>{let n=R(e.image_url);return`<div class="report-parent-chip" data-report-parent-index="${t}">${n?`<img src="${O(n)}" alt="${O(e.code)}" />`:`<span>No foto</span>`}<div><div class="report-linked-title">${O(e.code||`-`)}</div><div class="report-linked-meta">${O([e.variety,e.gender,e.name].filter(Boolean).join(` - `)||`-`)}</div><div class="report-parent-control"><label class="form-check mb-0"><input class="form-check-input" name="report_parent_show_print" type="checkbox" data-parent-show-print ${e.show_on_print===!1?``:`checked`} /><span class="form-check-label">Pilih</span></label><input class="form-control form-control-sm" name="report_parent_notes" data-parent-notes placeholder="Catatan indukan ini" autocomplete="off" value="${O(e.notes||``)}" /></div></div></div>`}).join(``)}</div>`:``,de=(e,t)=>[t===`breeding`?I(e):F(e),z(e,t),...V(e,t).map(e=>e.value),...B(e).flatMap(e=>[e.code,e.variety,e.gender,e.name])].join(` `).toLowerCase(),H=(e,pre)=>{let t=document.querySelector(e===`breeding`?`[data-breeding-search]`:`[data-koi-search]`),n=document.querySelector(e===`breeding`?`[data-breeding-search-menu]`:`[data-koi-search-menu]`);if(!t||!n)return;if(e!==`breeding`&&!pre){koiSearchLater(e);return}let r=e===`breeding`?I:F,i=t.value.toLowerCase().trim(),a=(e===`breeding`?b.filter(t=>de(t,e).includes(i)):pre).slice(0,8);if(P(n),!a.length){n.innerHTML=`<div class="report-search-item text-secondary">Tidak ada data cocok.</div>`,n.classList.remove(`d-none`);return}n.innerHTML=a.map(t=>{let n=R(ie(t)),i=[z(t,e),V(t,e).map(e=>e.value).filter(e=>e&&e!==`-`).join(` | `)].filter(Boolean).join(` - `)||`-`;return`<button class="report-search-item" type="button" data-report-search-pick="${O(e)}" data-report-search-id="${O(t.id)}">${n?`<img class="report-search-thumb" src="${O(n)}" alt="${O(r(t))}" />`:`<span class="report-search-thumb">${e===`breeding`?`BR`:`KOI`}</span>`}<span class="report-search-copy"><span class="report-search-title">${O(r(t)||`-`)}</span><span class="report-search-meta">${O(i)}</span></span></button>`}).join(``),n.classList.remove(`d-none`)},koiTok=0,koiSearchLater=window.KoiPicker.debounce(e=>{let t=document.querySelector(`[data-koi-search]`);if(!t)return;let n=++koiTok;window.KoiPicker.lookup(t.value.trim(),{limit:8}).then(r=>{n===koiTok&&H(e,r.items)}).catch(()=>{})},220),fe=()=>[...new Set((y.variety||[]).map(e=>String(e||``).trim()).filter(Boolean))].sort((e,t)=>e.localeCompare(t,`id`,{sensitivity:`base`})),pe=e=>String(e||``).split(`,`).map(e=>e.trim()).filter(Boolean),U=()=>{let e=document.querySelector(`[data-dominant-variety-search]`),t=document.querySelector(`[data-dominant-variety-search-menu]`);if(!e||!t)return;let n=pe(e.value).map(e=>e.toLowerCase()),r=String(e.value||``).split(`,`).pop().toLowerCase().split(/\s+/).map(e=>e.trim()).filter(Boolean),i=fe().filter(e=>r.length===0||r.every(t=>e.toLowerCase().includes(t))).slice(0,18);P(t),t.innerHTML=i.length?i.map(e=>`<button class="report-search-item" type="button" data-dominant-variety-pick="${O(e)}"><span class="report-search-copy"><span class="report-search-title">${n.includes(e.toLowerCase())?`Dipilih - `:``}${O(e)}</span><span class="report-search-meta">${n.includes(e.toLowerCase())?`Sudah dipilih`:`Klik untuk tambah/hapus`}</span></span></button>`).join(``):`<div class="report-search-item text-secondary">Tidak ada variety cocok.</div>`,t.classList.remove(`d-none`)},me=e=>{let t=document.querySelector(`[data-dominant-variety-search]`);if(!t)return;let n=String(e||``).trim(),r=String(t.value||``).split(`,`),i=String(r.pop()||``).trim(),a=fe().map(e=>e.toLowerCase()),o=r.map(e=>e.trim()).filter(Boolean);i&&a.includes(i.toLowerCase())&&o.push(i);let s=o.findIndex(e=>e.toLowerCase()===n.toLowerCase());s>=0?o.splice(s,1):n&&o.push(n),t.value=[...new Map(o.map(e=>[e.toLowerCase(),e])).values()].join(`, `),U(),t.focus()},he=()=>{let e=document.querySelector(`[data-account-search]`),t=document.querySelector(`[data-account-search-menu]`);if(!e||!t)return;let n=String(e.value||``).toLowerCase().trim(),r=x.filter(e=>L(e).toLowerCase().includes(n)).slice(0,10);P(t),t.innerHTML=r.length?r.map(e=>`<button class="report-search-item" type="button" data-account-search-pick="${O(e.id)}"><span class="report-search-copy"><span class="report-search-title">${O(e.name||e.username||`-`)}</span><span class="report-search-meta">${O(e.username?`@${e.username}`:`Tanpa username`)}</span></span></button>`).join(``):`<div class="report-search-item text-secondary">Tidak ada petugas cocok.</div>`,t.classList.remove(`d-none`)},W=(e,t)=>({id:e.id,label:t===`breeding`?I(e):F(e),notes:``,show_on_print:!0,parent_role:t===`breeding`?`both`:``,image_url:ie(e),meta:z(e,t),details:V(e,t),parents:t===`breeding`?B(e):[]}),ge=(e,t=`Preview`)=>{let n=R(e);n&&window.KoiAuth.zoomPhoto(n,t)},_e=()=>[...String(_.value||``).matchAll(/\\d+(?:\\.\\d+)?/g)].map(e=>Math.round(Number(e[0])*10)/10).filter(e=>Number.isFinite(e)&&e>=0),ve=()=>{let e=_e();return Object.fromEntries(te.map(([t,,n,r])=>[t,e.filter(e=>e>=n&&e<=r).length]))},G=()=>{let e=ve(),t=te.filter(([t])=>Number(e[t]||0)>0);ee.classList.toggle(`is-empty`,t.length===0),ee.innerHTML=t.map(([t,n])=>`<div class="report-spectrum-item"><div class="report-spectrum-label">${n}</div><div class="report-spectrum-count">${e[t]} ekor</div></div>`).join(``)},ye=e=>[e.name,e.location].filter(Boolean).join(` - `),be=(e={})=>e.pond_label||e.pond_name||e.origin_location||``,xe=e=>N(ne,e,ye),Se=(e={})=>{let t=document.createElement(`div`);t.className=`card`,t.innerHTML=`<div class="card-body"><div class="row g-2 align-items-end"><div class="col-md-3"><label class="form-label">Asal lokasi</label><input class="form-control" name="report_pond_search" list="pond-options" data-pond-search value="${O(be(e))}" placeholder="Cari asal lokasi" autocomplete="off" /></div><div class="col-md-3"><label class="form-label">Di Pindah ke</label><input class="form-control" name="report_pond_location" list="pond-options" data-location value="${O(e.location)}" placeholder="Cari lokasi tujuan" autocomplete="off" /></div><div class="col-md-2"><label class="form-label">Hasil</label><input class="form-control" name="report_result_qty" type="number" min="0" step="1" data-result-qty value="${O(e.result_qty)}" placeholder="0" /></div><div class="col-md-2"><label class="form-label">Rata-rata Panjang (cm)</label><input class="form-control" name="report_average_length_cm" type="number" min="0" step="0.1" data-average-length value="${O(e.average_length_cm)}" /></div><div class="col-12"><label class="form-label">Catatan Lokasi</label><textarea class="form-control" name="report_pond_notes" rows="2" data-notes>${O(e.notes)}</textarea></div><div class="col-12 text-end"><button class="btn btn-sm" type="button" data-remove-entry>Hapus</button></div></div></div>`,d.append(t),t.querySelector(`[data-remove-entry]`).addEventListener(`click`,()=>t.remove()),w&&t.querySelectorAll(`input,select,textarea,button`).forEach(e=>e.disabled=!0)},Ce=()=>[...d.children].map(e=>{let t=e.querySelector(`[data-pond-search]`).value.trim(),n=xe(t);return{pond_id:n?.id||``,pond_name:n?.name||t,pond_label:t,location:e.querySelector(`[data-location]`).value.trim(),result_qty:e.querySelector(`[data-result-qty]`).value,average_length_cm:e.querySelector(`[data-average-length]`).value,notes:e.querySelector(`[data-notes]`).value.trim()}}).filter(e=>e.pond_id||e.pond_name||e.location||e.result_qty||e.average_length_cm||e.notes),addCondEntry=(e={})=>{let t=document.createElement(`div`);t.className=`card`,t.innerHTML=`<div class="card-body"><div class="row g-2 align-items-end"><div class="col-md-8"><label class="form-label">Metrik Kondisi</label><input class="form-control" data-metric value="${O(e.metric)}" placeholder="Contoh: Ikan Reject (Cacat / Kurang Layak)" /></div><div class="col-md-3"><label class="form-label">Jumlah (ekor)</label><input class="form-control" type="number" min="0" step="1" data-qty value="${O(e.qty)}" /></div><div class="col-md-1 text-end"><button class="btn btn-sm" type="button" data-remove-entry>Hapus</button></div></div></div>`,condEntryList.append(t),t.querySelector(`[data-remove-entry]`).addEventListener(`click`,()=>t.remove()),w&&t.querySelectorAll(`input,select,textarea,button`).forEach(e=>e.disabled=!0)},getCondEntries=()=>[...condEntryList.children].map(e=>({metric:e.querySelector(`[data-metric]`).value.trim(),qty:e.querySelector(`[data-qty]`).value})).filter(e=>e.metric||e.qty),addSortEntry=(e={})=>{let t=document.createElement(`div`);t.className=`card`,t.innerHTML=`<div class="card-body"><div class="row g-2 align-items-end"><div class="col-md-3"><label class="form-label">Kategori</label><input class="form-control" data-category value="${O(e.category)}" placeholder="Contoh: Mudpond, Burayak" /></div><div class="col-md-3"><label class="form-label">Lokasi Tujuan</label><input class="form-control" list="pond-options" data-destination value="${O(e.destination)}" autocomplete="off" /></div><div class="col-md-4"><label class="form-label">Keterangan</label><input class="form-control" data-description value="${O(e.description)}" placeholder="Contoh: ochiba mix koyo" /></div><div class="col-md-1"><label class="form-label">Ekor</label><input class="form-control" type="number" min="0" step="1" data-qty value="${O(e.qty)}" /></div><div class="col-md-1 text-end"><button class="btn btn-sm" type="button" data-remove-entry>Hapus</button></div></div></div>`,sortEntryList.append(t),t.querySelector(`[data-remove-entry]`).addEventListener(`click`,()=>t.remove()),w&&t.querySelectorAll(`input,select,textarea,button`).forEach(e=>e.disabled=!0)},getSortEntries=()=>[...sortEntryList.children].map(e=>({category:e.querySelector(`[data-category]`).value.trim(),destination:e.querySelector(`[data-destination]`).value.trim(),description:e.querySelector(`[data-description]`).value.trim(),qty:e.querySelector(`[data-qty]`).value})).filter(e=>e.category||e.destination||e.description||e.qty),K=(e,t,n)=>{if(t.id&&[...e.children].some(e=>e.dataset.entryId===String(t.id)))return;let r={...W((n===`breeding`?b.find(e=>String(e.id)===String(t.id)):window.KoiPicker.cache[String(t.id)])||{},n),...t},i=document.createElement(`div`);i.className=`report-linked-card`,i.dataset.entryId=r.id||``,i.dataset.imageUrl=r.image_url||``,i.dataset.entryMeta=r.meta||``,i.dataset.entryDetails=JSON.stringify(r.details||[]),i.dataset.entryParents=JSON.stringify(r.parents||[]);let a=R(r.image_url),o=a?`<img src="${O(a)}" alt="${O(r.label||`Preview`)}" />`:`<span>No foto</span>`,s=n===`breeding`?`<div class="report-linked-main is-breeding"><div><div class="report-linked-title" data-entry-label>${O(r.label||`-`)}</div><div class="report-linked-meta">${O(r.meta||`-`)}</div>${ue(r.parents||[])}</div><button class="btn btn-sm" type="button" data-remove-entry>Hapus</button></div>`:`<div class="report-linked-main"><button class="report-linked-preview" type="button" data-preview-zoom="${O(r.image_url||``)}" aria-label="Preview ${O(r.label||`media`)}">${o}</button><div><div class="report-linked-title" data-entry-label>${O(r.label||`-`)}</div><div class="report-linked-meta">${O(r.meta||`-`)}</div>${le(r.details||[])}</div><button class="btn btn-sm" type="button" data-remove-entry>Hapus</button></div>`;i.innerHTML=n===`breeding`?s:`${s}<div class="report-linked-controls"><label class="form-check mb-0"><input class="form-check-input" name="report_show_print" type="checkbox" data-show-print ${r.show_on_print===!1?``:`checked`} /><span class="form-check-label">Pilih</span></label><input class="form-control form-control-sm" name="report_linked_notes" data-notes placeholder="Catatan masing-masing" autocomplete="off" value="${O(r.notes)}" /></div>`,e.append(i),i.querySelector(`[data-remove-entry]`).addEventListener(`click`,()=>i.remove()),i.querySelector(`[data-preview-zoom]`)?.addEventListener(`click`,()=>ge(r.image_url,r.label)),w&&i.querySelectorAll(`input,select,button:not([data-preview-zoom])`).forEach(e=>e.disabled=!0)},we=(e,t)=>[...e.children].map(e=>{let n=k(e.dataset.entryParents),r=t===`breeding`?n.map((t,n)=>{let r=e.querySelector(`[data-report-parent-index="${n}"]`);return{...t,show_on_print:!!r?.querySelector(`[data-parent-show-print]`)?.checked,notes:r?.querySelector(`[data-parent-notes]`)?.value.trim()||``}}):n;return{id:e.dataset.entryId,label:e.querySelector(`[data-entry-label]`)?.textContent||``,notes:e.querySelector(`[data-notes]`)?.value.trim()||``,show_on_print:t===`breeding`?r.some(e=>e.show_on_print!==!1):!!e.querySelector(`[data-show-print]`)?.checked,image_url:e.dataset.imageUrl||``,meta:e.dataset.entryMeta||``,details:k(e.dataset.entryDetails),parents:r,parent_role:t===`breeding`?`parents`:``}}),q=e=>{if([...m.children].some(t=>t.dataset.entryId===String(e.id)))return;let t=document.createElement(`span`);t.className=`badge bg-blue-lt p-2`,t.dataset.entryId=e.id,t.dataset.username=e.username||``,t.dataset.name=e.name||``,t.innerHTML=`${O(e.label||L(e))} <button class="btn-close btn-close-sm ms-2" type="button" aria-label="Hapus"></button>`,t.querySelector(`button`).addEventListener(`click`,()=>t.remove()),m.append(t),w&&(t.querySelector(`button`).disabled=!0)},Te=()=>[...m.children].map(e=>({id:e.dataset.entryId,username:e.dataset.username,name:e.dataset.name,label:e.textContent.trim()})),J=e=>new Promise((t,n)=>{let r=new FileReader;r.addEventListener(`load`,()=>t(r.result)),r.addEventListener(`error`,()=>n(Error(`File gagal dibaca`))),r.readAsDataURL(e)}),Ee=async e=>{if(!e||e.type===`image/gif`)return await J(e);let t=await J(e),n=await new Promise((e,n)=>{let r=new Image;r.addEventListener(`load`,()=>e(r)),r.addEventListener(`error`,()=>n(Error(`Gambar gagal diproses`))),r.src=t}),r=Math.min(1,1600/Math.max(n.naturalWidth,n.naturalHeight)),i=document.createElement(`canvas`);return i.width=Math.max(1,Math.round(n.naturalWidth*r)),i.height=Math.max(1,Math.round(n.naturalHeight*r)),i.getContext(`2d`).drawImage(n,0,0,i.width,i.height),i.toDataURL(`image/jpeg`,.76)},De=e=>new Promise(t=>{let n=document.createElement(`video`),r=document.createElement(`canvas`),i=URL.createObjectURL(e);n.muted=!0,n.preload=`metadata`,n.addEventListener(`loadeddata`,()=>{r.width=n.videoWidth||640,r.height=n.videoHeight||360,r.getContext(`2d`).drawImage(n,0,0,r.width,r.height),URL.revokeObjectURL(i),t(r.toDataURL(`image/webp`,.82))},{once:!0}),n.addEventListener(`error`,()=>{URL.revokeObjectURL(i),t(``)},{once:!0}),n.src=i}),Y=()=>{h.innerHTML=C.map((e,t)=>`<div class="col-auto"><div class="card"><div class="card-body p-2">${e.type===`video`?`<button class="report-media-preview rounded border" type="button" data-media-zoom="${t}"><video muted src="${O(e.url)}"></video></button>`:`<img class="report-media-preview rounded border" src="${O(e.url)}" alt="Media laporan" data-media-zoom="${t}" />`}<div class="small text-secondary mt-1">${e.type===`video`?`Video`:`Gambar`}</div><input class="form-control form-control-sm mt-2" name="report_media_note" data-media-note="${t}" placeholder="Catatan media" autocomplete="off" value="${O(e.notes)}" /><button class="btn btn-sm w-100 mt-1" type="button" data-remove-media="${t}">Hapus</button></div></div></div>`).join(``),h.querySelectorAll(`[data-media-zoom]`).forEach(e=>e.addEventListener(`click`,()=>ge(C[Number(e.dataset.mediaZoom)]?.url,`Media laporan`))),h.querySelectorAll(`[data-media-note]`).forEach(e=>e.addEventListener(`input`,()=>{C[Number(e.dataset.mediaNote)].notes=e.value})),h.querySelectorAll(`[data-remove-media]`).forEach(e=>e.addEventListener(`click`,()=>{C.splice(Number(e.dataset.removeMedia),1),Y()})),w&&h.querySelectorAll(`input,button:not([data-media-zoom])`).forEach(e=>e.disabled=!0)},Oe=()=>(h.querySelectorAll(`[data-media-note]`).forEach(e=>{C[Number(e.dataset.mediaNote)]&&(C[Number(e.dataset.mediaNote)].notes=e.value.trim())}),C),ke=async t=>{for(let n of t)if(g.innerHTML=`<div class="small text-secondary mb-1">Mengompres/mengupload ${n.name}</div><div class="progress progress-sm"><div class="progress-bar progress-bar-indeterminate"></div></div>`,n.type.startsWith(`image/`)){let t=await fetch(`${e}/images`,{method:`POST`,headers:{"content-type":`application/json`},body:JSON.stringify({prefix:`report-image`,image_data:await Ee(n)})}),r=await t.json().catch(()=>({}));if(!t.ok)throw Error(r.error||r.detail||`Gambar gagal diupload`);C.push({type:`image`,url:r.image_url,thumbnail_url:r.image_url,name:n.name,notes:``})}else if([`video/mp4`,`video/webm`].includes(n.type)){if(n.size>100*1024*1024)throw Error(`Ukuran video maksimal 100 MB`);let[t,r]=await Promise.all([J(n),De(n)]),i=await fetch(`${e}/videos`,{method:`POST`,headers:{"content-type":`application/json`},body:JSON.stringify({prefix:`report-video`,video_data:t,thumbnail_data:r})}),a=await i.json().catch(()=>({}));if(!i.ok)throw Error(a.error||a.detail||`Video gagal diupload`);C.push({type:`video`,url:a.video_url,thumbnail_url:a.video_thumbnail_url,name:n.name,notes:``})}else throw Error(`Format media harus gambar, mp4, atau webm`);g.textContent=`Media siap disimpan.`,Y()},Ae=async()=>{try{let e=await navigator.clipboard.read(),t=[];for(let n of e){let e=n.types.find(e=>e.startsWith(`image/`));if(!e)continue;let r=await n.getType(e);t.push(new File([r],`paste-laporan-${Date.now()}-${t.length+1}.${e.split(`/`)[1]||`png`}`,{type:e}))}if(!t.length)throw Error(`Clipboard tidak berisi gambar.`);await ke(t)}catch(e){g.textContent=e.message||`Paste gambar gagal.`}},X=e=>{w=e,t.querySelectorAll(`input,select,textarea`).forEach(t=>t.disabled=e),t.querySelectorAll(`[data-add-pond-entry],[data-add-condition-entry],[data-add-sorting-entry],[data-add-breeding-entry],[data-add-koi-entry],[data-add-account-entry],[data-remove-entry],[data-remove-media]`).forEach(t=>t.disabled=e),s.classList.toggle(`d-none`,e)},Z=()=>{T=null,X(!1),s.textContent=`Simpan Laporan`,t.reset(),d.innerHTML=``,condEntryList.innerHTML=``,sortEntryList.innerHTML=``,f.innerHTML=``,p.innerHTML=``,m.innerHTML=``,C=[],g.textContent=``,a.classList.add(`d-none`),o.classList.add(`d-none`),c.valueAsDate=new Date,l.value=``,re(),Y(),G()},je=()=>{i.textContent=`Formulir Tambah Laporan`,Z(),j()},Me=e=>{t.elements.report_type.value=e.report_type||`data_ulang`,t.elements.report_date.value=String(e.report_date||``).split(`T`)[0],t.elements.batch_code.value=e.batch_code||``,t.elements.report_title.value=e.report_title||``,t.elements.dominant_variety.value=e.dominant_variety||``,t.elements.origin_location.value=e.origin_location||``,t.elements.destination_location.value=e.destination_location||``,t.elements.average_length_cm.value=e.average_length_cm||``,t.elements.notes.value=e.notes||``,k(e.pond_entries).forEach(Se),k(e.condition_entries).forEach(addCondEntry),k(e.sorting_entries).forEach(addSortEntry),k(e.breeding_entries).forEach(e=>K(f,e,`breeding`)),k(e.koi_entries).forEach(e=>K(p,e,`koi`)),k(e.reporter_entries).forEach(e=>q(e)),C=k(e.media_entries),_.value=k(e.spectrum_sizes).join(`, `),k(e.validation_checks).forEach(e=>{let t=document.querySelector(`[data-validation-check][value="${e}"]`);t&&(t.checked=!0)}),t.elements.show_in_gallery&&(t.elements.show_in_gallery.checked=!!(e.gallery_id||e.show_in_gallery===!0)),Y(),G()},Ne=e=>{Z(),i.textContent=`Detail Laporan`,Me(e),X(!0),j()},Pe=e=>{Z(),T=e.id,i.textContent=`Formulir Edit Laporan`,Me(e),X(!1),s.textContent=`Simpan Perubahan`,j()},Fe=e=>{S=e,rdDock.prune(e);let shown=rdDock.apply(e.filter(rdReportMatches));u.innerHTML=shown.map(item=>{let pe=k(item.pond_entries),be=k(item.breeding_entries),locText=pe.map(x=>[x.pond_name,x.location].filter(Boolean).join(` -> `)).filter(Boolean).join(`, `)||item.pond_name||`-`,breedText=be.map(x=>x.label).join(`, `)||`-`;return`<div class="col-sm-6 col-lg-4 col-xl-3"><div class="card h-100 report-card" data-dock-id="${O(item.id)}"><div class="report-card-top" data-dock-select title="Klik untuk memilih"><span class="badge ${item.report_type==='panen'?'bg-green-lt':'bg-blue-lt'}">${O(v[item.report_type]||item.report_type||'-')}</span><div class="report-card-date">${O(LD(item.report_date))}</div></div><div class="card-body" role="button" tabindex="0" data-report-id="${O(item.id)}"><div class="d-flex align-items-start justify-content-between gap-2 mb-1"><div class="report-card-code"><button class="dock-code-copy" type="button" data-copy-report-code="${O(item.batch_code||'-')}" title="${O(item.batch_code||'-')}">${O(item.batch_code||'-')}</button></div><span class="badge bg-blue text-blue-fg dock-selected-badge">Terpilih</span></div><div class="fw-semibold report-card-title">${O(item.report_title||'-')}</div>${item.gallery_id?`<a class="badge bg-purple-lt text-decoration-none mt-1" href="./farm-gallery.html?id=${O(item.gallery_id)}" onclick="event.stopPropagation()" title="Buka koleksi ini di Galeri">Galeri #${O(item.gallery_id)}</a>`:``}<div class="row g-2 small mt-1"><div class="col-12 report-card-cell"><span class="text-secondary">Lokasi</span><div class="report-card-ellipsis" title="${O(locText)}">${O(locText)}</div></div><div class="col-12 report-card-cell"><span class="text-secondary">Breeding</span><div class="report-card-ellipsis" title="${O(breedText)}">${O(breedText)}</div></div></div><div class="report-card-actions"><button class="btn btn-sm" type="button" data-print-report="${O(item.id)}">${window.KoiDock.icon('printer')} Cetak</button><button class="btn btn-sm" type="button" data-edit-report="${O(item.id)}" data-role-required="farm-operate">${window.KoiDock.icon('edit')} Edit</button><button class="btn btn-sm btn-outline-danger" type="button" data-delete-report="${O(item.id)}" data-role-required="farm-operate">${window.KoiDock.icon('trash')} Hapus</button></div></div></div></div>`}).join(``)||`<div class="col-12 text-secondary">${rdReportSearch?`Laporan tidak ditemukan.`:`Belum ada laporan tersimpan.`}</div>`,rdDock.refresh()},Q=(t=!1)=>fetch(`${e}/farm-reports`).then(e=>e.json()).then(e=>{let n=JSON.stringify(e);t&&n===E||(E=n,localStorage.setItem(D,n),Fe(e))}).catch(()=>{t||(u.innerHTML=`<div class="col-12 text-danger">Laporan gagal dimuat.</div>`)}),Ie=()=>{try{let e=JSON.parse(localStorage.getItem(D)||`[]`);if(!Array.isArray(e)||!e.length)return;E=JSON.stringify(e),Fe(e)}catch{localStorage.removeItem(D)}},Le=async()=>{let[t,n,r,i]=await Promise.all([fetch(`${e}/ponds`),fetch(`${e}/koi/facets?archived=all&fields=variety`),fetch(`${e}/breeding`),fetch(`${e}/accounts`)]);ne=await t.json(),y=n.ok?await n.json():{},b=await r.json(),x=await i.json(),await(async()=>{let ids=[...new Set(b.flatMap(e=>[...se(e.female_parent_entries,e.female_koi_id,``),...se(e.male_parent_entries,e.male_koi_id,``)].map(e=>e?.koi_id)).filter(Boolean).map(String))];if(ids.length)try{await window.KoiPicker.byIds(ids,{scope:`all`})}catch{}})(),document.querySelector(`#pond-options`).innerHTML=ne.map(e=>`<option value="${O(ye(e))}"></option>`).join(``)};document.querySelector(`[data-add-pond-entry]`).addEventListener(`click`,()=>Se()),document.querySelector(`[data-add-condition-entry]`).addEventListener(`click`,()=>addCondEntry()),document.querySelector(`[data-add-sorting-entry]`).addEventListener(`click`,()=>addSortEntry()),document.querySelector(`[data-add-breeding-entry]`).addEventListener(`click`,()=>{let e=document.querySelector(`[data-breeding-search]`),t=N(b,e.value,I);t&&K(f,W(t,`breeding`),`breeding`),e.value=``}),document.querySelector(`[data-add-koi-entry]`).addEventListener(`click`,()=>{let e=document.querySelector(`[data-koi-search]`),t=e.value;e.value=``,window.KoiPicker.lookup(t.trim(),{limit:20}).then(r=>{let n=N(r.items,t,F);n&&K(p,W(n,`koi`),`koi`)}).catch(()=>{})}),document.querySelector(`[data-add-account-entry]`).addEventListener(`click`,()=>{let e=document.querySelector(`[data-account-search]`),t=N(x,e.value,L);t&&q(t),e.value=``,P()}),document.querySelector(`[data-breeding-search]`).addEventListener(`input`,()=>H(`breeding`)),document.querySelector(`[data-breeding-search]`).addEventListener(`focus`,()=>H(`breeding`)),document.querySelector(`[data-koi-search]`).addEventListener(`input`,()=>H(`koi`)),document.querySelector(`[data-koi-search]`).addEventListener(`focus`,()=>H(`koi`)),document.querySelector(`[data-dominant-variety-search]`).addEventListener(`input`,U),document.querySelector(`[data-dominant-variety-search]`).addEventListener(`focus`,U),document.querySelector(`[data-account-search]`).addEventListener(`input`,he),document.querySelector(`[data-account-search]`).addEventListener(`focus`,he),document.addEventListener(`click`,e=>{let t=e.target.closest(`[data-report-search-pick]`),n=e.target.closest(`[data-dominant-variety-pick]`),r=e.target.closest(`[data-account-search-pick]`);if(t){let e=t.dataset.reportSearchPick,n=e===`breeding`?b.find(e=>String(e.id)===String(t.dataset.reportSearchId)):window.KoiPicker.cache[String(t.dataset.reportSearchId)];if(n){let t=document.querySelector(e===`breeding`?`[data-breeding-search]`:`[data-koi-search]`);t.value=e===`breeding`?I(n):F(n),K(e===`breeding`?f:p,W(n,e),e),t.value=``}P();return}if(n){me(n.dataset.dominantVarietyPick);return}if(r){let e=x.find(e=>String(e.id)===String(r.dataset.accountSearchPick));if(e){q(e);let t=document.querySelector(`[data-account-search]`);t.value=``}P();return}e.target.closest(`.report-search-wrap`)||P()}),document.querySelector(`[data-media-input]`).addEventListener(`change`,e=>ke([...e.target.files]).catch(e=>{g.textContent=e.message}).finally(()=>{e.target.value=``})),document.querySelector(`[data-media-paste]`).addEventListener(`click`,Ae),_.addEventListener(`input`,G),c.addEventListener(`change`,re),(window.__koiReportDrafts=(()=>{let h=document.createElement(`div`);h.className=`me-auto`;t.querySelector(`.modal-footer`)?.prepend(h);let c2=()=>{let d={report_type:new FormData(t).get(`report_type`),report_date:t.elements.report_date.value,batch_code:t.elements.batch_code.value,report_title:t.elements.report_title.value,dominant_variety:t.elements.dominant_variety.value,origin_location:t.elements.origin_location.value,destination_location:t.elements.destination_location.value,average_length_cm:t.elements.average_length_cm.value,notes:t.elements.notes.value,pond_entries:JSON.stringify(Ce()),condition_entries:JSON.stringify(getCondEntries()),sorting_entries:JSON.stringify(getSortEntries()),breeding_entries:JSON.stringify(we(f,`breeding`)),koi_entries:JSON.stringify(we(p,`koi`)),reporter_entries:JSON.stringify(Te()),media_entries:JSON.stringify(Oe()),spectrum_sizes:JSON.stringify(_e()),validation_checks:JSON.stringify([...document.querySelectorAll(`[data-validation-check]:checked`)].map(x=>x.value)),show_in_gallery:!!t.elements.show_in_gallery?.checked};return{data:d,summary:[d.report_title,d.report_date].filter(Boolean).join(` - `)||`Laporan tanpa judul`,item_count:1}};return window.KoiDrafts?.attach({type:`report`,host:h,collect:c2,apply:d=>{i.textContent=`Formulir Tambah Laporan`,Z(),Me(d),re()},open:je,onError:m2=>{a.textContent=m2,a.classList.remove(`d-none`)},onInfo:m2=>{g.textContent=m2}})})(),document.querySelector(`[data-report-open]`).addEventListener(`click`,()=>{window.__koiReportDrafts?.reset(),je()})),document.querySelectorAll(`[data-report-cancel]`).forEach(e=>e.addEventListener(`click`,()=>{M(),Z()})),n.addEventListener(`dblclick`,e=>{e.target===n&&(M(),Z())});var $=e=>window.KoiPrint.photo(R(e)),Re=(e=[])=>{let t=Array.isArray(e)?e.filter(e=>e.show_on_print!==!1):[];return t.length?t.map(e=>`${e.code||e.id||`-`} (${[e.variety,e.gender,e.name].filter(Boolean).join(` - `)||`-`})`).join(`; `):`-`},ze=e=>e.length?e.map(e=>`<tr><td><strong>${O(e.label||`-`)}</strong></td><td>${O(e.meta||`-`)}</td><td>${O(Re(e.parents||[]))}</td><td>${O(e.notes||`-`)}</td></tr>`).join(``):`<tr><td colspan="4" class="kp-muted">Belum ada data dipilih.</td></tr>`,Be=e=>e.length?e.map(e=>`<tr><td class="kp-center">${$(e.image_url)}</td><td><strong>${O(e.label||`-`)}</strong></td><td>${O(e.meta||`-`)}</td><td>${Array.isArray(e.details)&&e.details.length?O(e.details.map(e=>`${e.label}: ${e.value||`-`}`).join(`, `)):`-`}</td><td>${O(e.notes||`-`)}</td></tr>`).join(``):`<tr><td colspan="5" class="kp-muted">Belum ada data dipilih.</td></tr>`,Ve=e=>e.length?e.map(e=>`<tr><td><strong>${O([e.pond_name||e.pond_label,e.location].filter(Boolean).join(` -> `)||`-`)}</strong></td><td class="kp-num">${e.result_qty?`${e.result_qty} ekor`:`-`}</td><td class="kp-num">${e.average_length_cm?`${e.average_length_cm} cm`:`-`}</td><td>${O(e.notes||`-`)}</td></tr>`).join(``):`<tr><td colspan="4" class="kp-muted">Belum ada lokasi.</td></tr>`,He=e=>e.length?e.map(e=>`<tr><td><strong>${O(e.label||e.name||e.username||`-`)}</strong></td><td>${O(e.username?`@${e.username}`:`-`)}</td></tr>`).join(``):`<tr><td colspan="2" class="kp-muted">Belum ada petugas.</td></tr>`,Ue=e=>e.length?e.map(e=>`<tr><td class="kp-center">${e.type===`video`?`<div class="kp-muted">Video</div>`:$(e.thumbnail_url||e.url)}</td><td>${O(e.notes||e.name||(e.type===`video`?e.url:`Media laporan`)||`-`)}</td></tr>`).join(``):`<tr><td colspan="2" class="kp-muted">Belum ada media.</td></tr>`,rpCondRows=e=>e.map(e=>`<tr><td>${O(e.metric||`-`)}</td><td class="kp-num">${e.qty?`${O(e.qty)} ekor`:`-`}</td></tr>`).join(``),rpSortBody=e=>{let t=new Map;return e.forEach(e=>{let n=e.category||`-`;t.has(n)||t.set(n,[]),t.get(n).push(e)}),[...t.entries()].map(([e,t])=>{let n=t.reduce((e,t)=>e+(Number(t.qty)||0),0);return `<tr style="background:#f1f5f9"><td colspan="3"><strong>${O(e)} - TOTAL ${n} EKOR</strong></td></tr>`+t.map(e=>`<tr><td>${O(e.destination||`-`)}</td><td>${O(e.description||`-`)}</td><td class="kp-num">${e.qty?`${O(e.qty)} ekor`:`-`}</td></tr>`).join(``)}).join(``)},validationLabelsX={ikan_di_foto:`Ikan di foto`,ikan_masuk_web:`Ikan masuk web`,ikan_di_pindah:`Ikan di pindah`},We=e=>{let t=k(e.pond_entries),cnd=k(e.condition_entries),srt=k(e.sorting_entries),n=k(e.breeding_entries).filter(e=>e.show_on_print!==!1),r=k(e.koi_entries).filter(e=>e.show_on_print!==!1),i=k(e.reporter_entries),a=k(e.media_entries),vc=k(e.validation_checks),o=k(e.spectrum_summary),s=Object.entries(o).filter(([,e])=>Number(e)>0),totIkan=s.reduce((e,[,t])=>e+Number(t),0),sizeRows=s.map(([k1,v1])=>`<tr><td>${O(k1)}</td><td class="kp-num">${O(v1)} ekor</td></tr>`).join(``)+(s.length?`<tr style="background:#f1f5f9"><td><strong>Total Ikan Data / Panen</strong></td><td class="kp-num"><strong>${totIkan} ekor</strong></td></tr>`:``)+(e.average_length_cm?`<tr><td><em>Rata-rata Ukuran</em></td><td class="kp-num"><em>${window.KoiPrint.size(e.average_length_cm)} cm</em></td></tr>`:``),bd=`${s.length||e.average_length_cm?`<section class="kp-section"><h2>Distribusi Ukuran (Spectrum Variance)</h2><table class="kp-table"><thead><tr><th>Kategori Ukuran</th><th class="kp-num">Jumlah (Ekor)</th></tr></thead><tbody>${sizeRows}</tbody></table></section>`:``}${vc.length?`<section class="kp-section"><h2>Validasi Website</h2><table class="kp-table"><tbody>${vc.map(e=>`<tr><td>&check; ${O(validationLabelsX[e]||e)}</td></tr>`).join(``)}</tbody></table></section>`:``}${cnd.length?`<section class="kp-section"><h2>Kondisi / Status Tambahan</h2><table class="kp-table"><thead><tr><th>Metrik Kondisi</th><th class="kp-num">Jumlah</th></tr></thead><tbody>${rpCondRows(cnd)}</tbody></table></section>`:``}${srt.length?`<section class="kp-section"><h2>Detail Sortir Ikan (Pemindahan Lokasi)</h2><table class="kp-table"><thead><tr><th>Lokasi Tujuan</th><th>Keterangan</th><th class="kp-num">Jumlah (Ekor)</th></tr></thead><tbody>${rpSortBody(srt)}</tbody></table></section>`:``}${t.length?`<section class="kp-section"><h2>Lokasi</h2><table class="kp-table"><thead><tr><th>Lokasi</th><th class="kp-num" style="width:14%">Hasil</th><th class="kp-num" style="width:16%">Rata-rata</th><th>Catatan</th></tr></thead><tbody>${Ve(t)}</tbody></table></section>`:``}${n.length?`<section class="kp-section"><h2>Sesi Breeding</h2><table class="kp-table"><thead><tr><th>Sesi</th><th>Info</th><th>Indukan</th><th>Catatan</th></tr></thead><tbody>${ze(n)}</tbody></table></section>`:``}${r.length?`<section class="kp-section"><h2>Mention Ikan</h2><table class="kp-table"><thead><tr><th class="kp-center" style="width:48px">Foto</th><th>Kode/Label</th><th>Info</th><th>Detail</th><th>Catatan</th></tr></thead><tbody>${Be(r)}</tbody></table></section>`:``}${i.length?`<section class="kp-section"><h2>Petugas</h2><table class="kp-table"><thead><tr><th>Nama</th><th>Username</th></tr></thead><tbody>${He(i)}</tbody></table></section>`:``}${a.length?`<section class="kp-section"><h2>Media Laporan</h2><table class="kp-table"><thead><tr><th class="kp-center" style="width:48px">Foto</th><th>Keterangan</th></tr></thead><tbody>${Ue(a)}</tbody></table></section>`:``}`;window.KoiPrint.print({key:`report-detail`,title:e.report_title||`Laporan`,heading:e.report_title||`Laporan`,subheading:`${A(e.report_date)} - ${v[e.report_type]||e.report_type||`-`}`,info:[[`Kode Batch`,e.batch_code],[`Jenis`,v[e.report_type]||e.report_type],[`Lokasi Asal`,e.origin_location],[`Lokasi Tujuan`,e.destination_location],[`Varietas Dominan`,e.dominant_variety]],notes:e.notes||``,body:bd})};rdDelete=async ids=>{let ti=ids.map(id=>{let rp=S.find(x=>String(x.id)===String(id));return rp?.report_title||rp?.batch_code}).filter(Boolean);if(!(await window.KoiDialog.confirm(`Hapus ${ids.length} laporan (${ti.join(`, `)})?`)))return;let fl=[];for(let id of ids)try{let rs=await fetch(`/api/farm-reports/${id}`,{method:`DELETE`});rs.ok||fl.push(id)}catch{fl.push(id)}rdDock.clear(),await Q(),fl.length&&alert(`${fl.length} laporan gagal dihapus.`)},rdChoose=()=>{document.querySelector(`[data-report-type-chooser]`)?.remove();let ov=document.createElement(`div`);ov.setAttribute(`data-report-type-chooser`,``),ov.style.cssText=`position:fixed;inset:0;z-index:4900;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.6)`,ov.innerHTML='<div class="card" style="max-width:26rem;width:100%"><div class="card-header"><h3 class="card-title">Tambah Laporan</h3><div class="card-actions"><button type="button" class="btn-close" data-close-chooser aria-label="Tutup"></button></div></div><div class="list-group list-group-flush"><button type="button" class="list-group-item list-group-item-action" data-choose="perikanan"><div class="fw-medium">Laporan Perikanan</div><div class="small text-secondary">Data ulang / panen: jumlah, ukuran, spektrum, validasi.</div></button><button type="button" class="list-group-item list-group-item-action" data-choose="kegiatan"><div class="fw-medium">Laporan Kegiatan</div><div class="small text-secondary">Pakan, ganti air, pengobatan, bersih kolam, pindah ikan, perbaikan.</div></button></div></div>',ov.addEventListener(`click`,ev=>{let ch=ev.target.closest(`[data-choose]`);if(ch){ov.remove(),(ch.dataset.choose===`kegiatan`?document.querySelector(`[data-report-open-activity]`)||document.querySelector(`[data-report-open]`):document.querySelector(`[data-report-open]`))?.click();return}(ev.target===ov||ev.target.closest(`[data-close-chooser]`))&&ov.remove()}),document.body.appendChild(ov)},document.addEventListener(`keydown`,ev=>{ev.key===`Escape`&&document.querySelector(`[data-report-type-chooser]`)?.remove()}),rdExcel=(()=>{const reportExcelColumns = ['Tanggal', 'Kode Batch', 'Jenis', 'Judul', 'Varietas Dominan', 'Lokasi Asal', 'Lokasi Tujuan', 'Rata-rata Ukuran (cm)', 'Lokasi', 'Breeding', 'Petugas', 'Catatan', 'Galeri', 'ID Galeri']
const reportDateFromText = (value) => {
  const typed = String(value || '').trim()
  const iso = typed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  const dmy = typed.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/)
  const long = typed.match(/^(\d{1,2})\s*-\s*\[?(\d{1,2})\]?[^\d]*-\s*(\d{4})$/)
  const parts = iso ? iso.slice(1, 4) : dmy ? dmy.slice(1, 4).reverse() : long ? long.slice(1, 4).reverse() : null
  if (!parts) return ''
  const [year, month, day] = parts.map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    : ''
}

// "Galeri" column: Ya / Tidak. Empty = Ya when the report arrives with documentation (ZIP), so the
    // photos get a history in the Galeri menu; otherwise Tidak.
    const reportGalleryFrom = (value, hasMedia) => {
      const typed = String(value || '').trim().toLowerCase()
      if (['ya', 'y', 'yes', 'true', '1'].includes(typed)) return true
      if (['tidak', 't', 'no', 'false', '0'].includes(typed)) return false
      return hasMedia
    }

    // "Ikan Datang" reports (Laporan Ikan Datang): the main sheet has their summary row; the fish lines
    // (one row per jenis) go to an extra sheet "Ikan Datang", which is also the format the import reads.
    const reportArrivalColumns = ['Tanggal', 'Nama Laporan', 'Ikan Dari', 'Jenis', 'Kelamin', 'Ukuran (cm)', 'Ternakan', 'Bloodline', 'Owner', 'Lokasi Tujuan', 'Foto', 'Catatan', 'Kode Batch']
    // Photo of a line: in the ZIP it is a file under dokumentasi/<kode>/, in a plain Excel file its upload URL.
    const reportArrivalPhotoPath = (item, index, line) => `image/${window.KoiZip.safeName(item.batch_code || String(item.id), 'laporan')}/ikan/ikan-${String(index + 1).padStart(2, '0')}.${(String(line.image_url).split('?')[0].split('.').pop() || 'jpg').toLowerCase()}`
    const reportArrivalRows = (chosen, zipMode = false) => chosen.filter((item) => item.report_type === 'ikan_datang').flatMap((item) =>
      window.KoiArrival.linesOf(item).map((line, index) => [
        String(item.report_date || '').slice(0, 10), item.report_title || '', item.origin_location || '', line.variety,
        window.KoiArrival.genderLabels[line.gender], line.size_cm, line.farm, line.bloodline, line.owner, line.pond_name,
        line.image_url ? (zipMode ? reportArrivalPhotoPath(item, index, line) : line.image_url) : '', item.notes || '', item.batch_code || '',
      ]))
    const reportArrivalPhotoFiles = (chosen) => chosen.filter((item) => item.report_type === 'ikan_datang').flatMap((item) =>
      window.KoiArrival.linesOf(item).map((line, index) => (line.image_url ? { path: reportArrivalPhotoPath(item, index, line), url: line.image_url } : null)).filter(Boolean))

    const exportReportsZip = async (chosen, rows) => {
      const progress = window.KoiZip.progress('Unduh ZIP Laporan')
      try {
        const result = await window.KoiZip.exportPackage({
          sheetName: 'Laporan',
          header: reportExcelColumns,
          rows,
          keyHeader: 'Kode Batch',
          xlsxName: 'data-laporan.xlsx',
          extraSheets: reportArrivalRows(chosen, true).length ? [{ name: 'Ikan Datang', header: reportArrivalColumns, rows: reportArrivalRows(chosen, true), keyColumn: reportArrivalColumns.length - 1 }] : [],
          extraFiles: reportArrivalPhotoFiles(chosen),
          docs: chosen.map((item) => ({ key: item.batch_code || String(item.id), media: k(item.media_entries) })),
          onProgress: (text) => progress.set(text),
        })
        window.KoiZip.download(result.blob, `zip-laporan-${window.KoiZip.today()}.zip`)
        window.KoiDock.showResult('Unduh ZIP Laporan', `Selesai: ${chosen.length} laporan, ${result.photos} foto, ${result.videos} video.`, result.problems)
      } catch (error) {
        window.KoiDock.showResult('Unduh ZIP Laporan', error.message || 'ZIP gagal dibuat.')
      } finally {
        progress.close()
      }
    }

    const exportReportsExcel = (ids, zipMode = false) => {
  if (!window.XLSX) {
    window.KoiDock.showResult('Ekspor Excel', 'Pustaka Excel belum termuat. Muat ulang halaman.')
    return
  }

  const chosen = ids.length ? S.filter((item) => ids.includes(String(item.id))) : rdDock.apply(S)
  if (!chosen.length) {
    window.KoiDock.showResult('Ekspor Excel', 'Belum ada laporan untuk diexport.')
    return
  }

  const rows = chosen.map((item) => [
    String(item.report_date || '').slice(0, 10),
    item.batch_code || '',
    v[item.report_type] || (item.report_type === 'kegiatan' ? 'Kegiatan' : item.report_type === 'ikan_datang' ? 'Ikan Datang' : item.report_type || ''),
    item.report_title || '',
    item.dominant_variety || '',
    item.origin_location || '',
    item.destination_location || '',
    item.average_length_cm ?? '',
    k(item.pond_entries).map((entry) => [entry.pond_name, entry.location].filter(Boolean).join(' -> ')).filter(Boolean).join(', ') || item.pond_name || '',
    k(item.breeding_entries).map((entry) => entry.label).filter(Boolean).join(', '),
    k(item.reporter_entries).map((entry) => entry.label || entry.name || entry.username).filter(Boolean).join(', ') || item.reporter || '',
    item.notes || '',
    item.gallery_id ? 'Ya' : 'Tidak',
    item.gallery_id || '',
  ])
  if (zipMode) return exportReportsZip(chosen, rows)
      const sheet = XLSX.utils.aoa_to_sheet([reportExcelColumns, ...rows])
  sheet['!cols'] = reportExcelColumns.map((column) => ({ wch: Math.max(14, column.length + 2) }))
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Laporan')
      const arrivalRows = reportArrivalRows(chosen)
      if (arrivalRows.length) {
        const arrivalSheet = XLSX.utils.aoa_to_sheet([reportArrivalColumns, ...arrivalRows])
        arrivalSheet['!cols'] = reportArrivalColumns.map((column) => ({ wch: Math.max(14, column.length + 2) }))
        XLSX.utils.book_append_sheet(workbook, arrivalSheet, 'Ikan Datang')
      }
  const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const link = document.createElement('a')
  const objectUrl = URL.createObjectURL(blob)

  link.href = objectUrl
  link.download = `data-laporan-${new Date().toISOString().slice(0, 10)}.xlsx`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}

// Impor makes NEW reports from the summary columns (Tanggal, Jenis, Judul, Varietas Dominan, Lokasi Asal/Tujuan,
    // Rata-rata Ukuran, Catatan, Galeri). Kolam, Breeding and Petugas are export-only; fill in the details through the form.
    // Laporan Ikan Datang comes from the sheet "Ikan Datang" (one row per fish).
    // Mass input works in two passes: everything is checked first and shown as a preview (nothing is written),
    // and only after "Lanjutkan" the reports are saved. A report that is already there (same code, or same type,
    // date and title) is never created a second time.
    const readReportsWorkbook = async (file) => {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true, dateNF: 'yyyy-mm-dd' })
      const toRecords = (sheet) => XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false }).map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [String(key).trim().toLowerCase(), String(value ?? '').trim().replace(/^[-–—]+$/, '')])))
      const records = toRecords(workbook.Sheets[workbook.SheetNames[0]])
      const arrivalSheetName = workbook.SheetNames.find((name) => name.trim().toLowerCase() === 'ikan datang')
      const arrivalFormat = records.length > 0 && 'ikan dari' in records[0]
      const arrivalRecords = arrivalFormat ? records : arrivalSheetName ? toRecords(workbook.Sheets[arrivalSheetName]) : null
      return { records, arrivalFormat, arrivalSheetName, arrivalRecords }
    }

    const runReportsImport = async (sheet, pkg, dryRun, progress) => {
      const problems = []
      let inserted = 0
      let arrivalCreated = 0
      let docsAdded = 0
      let docsSkipped = 0
      let docsPlanned = 0
      let galleryCount = 0
      const { records, arrivalFormat, arrivalSheetName, arrivalRecords } = sheet
      const knownCodes = new Set(S.map((item) => String(item.batch_code || '').toUpperCase()))
      const typeFrom = (value) => ({ panen: 'panen', 'data ulang': 'data_ulang', data_ulang: 'data_ulang' })[String(value || '').trim().toLowerCase()] || ''
      const dateOf = (item) => String(item.report_date || '').slice(0, 10)
      // date + title alone is not enough: one day can have several reports with the same title (different ponds, different notes)
      const reportKey = (type, date, title, origin, notes) => `${type}|${date}|${String(title || '').trim().toLowerCase()}|${String(origin || '').trim().toLowerCase()}|${String(notes || '').trim().toLowerCase()}`
      const arrivalKey = (date, title, origin) => `${date}|${String(title || '').trim().toLowerCase()}|${String(origin || '').trim().toLowerCase()}`
      const existingKeys = new Set(S.filter((item) => item.report_type !== 'ikan_datang').map((item) => reportKey(item.report_type, dateOf(item), item.report_title, item.origin_location, item.notes)))
      const existingArrivals = new Set(S.filter((item) => item.report_type === 'ikan_datang').map((item) => arrivalKey(dateOf(item), item.report_title, item.origin_location)))

      if (arrivalRecords && window.KoiArrival) {
        const parsed = window.KoiArrival.importSheet(arrivalRecords, { knownCodes: [...knownCodes], dateFromText: reportDateFromText, pondByName: await window.KoiArrival.pondMap() })
        problems.push(...parsed.problems)
        for (const group of parsed.groups) {
          if (pkg && group.code) pkg.markUsed(group.code)
          const key = arrivalKey(group.date, group.title, group.origin)
          if (existingArrivals.has(key)) {
            problems.push(`${group.title}: laporan Ikan Datang dengan tanggal, nama, dan asal yang sama sudah ada, dilewati`)
            continue
          }
          existingArrivals.add(key)
          let docs = null
          if (pkg) {
            const found = await pkg.docsForRow(group.docsCell, group.code)
            docs = found.docs
            problems.push(...found.problems.map((message) => `${group.title}: ${message}`))
          }
          if (docs && docs.length) docsPlanned += docs.length
          if (dryRun) {
            arrivalCreated += 1
            continue
          }
          let arrivalMedia = []
          if (docs && docs.length) {
            progress?.set(`${group.title}: ${docs.length} dokumentasi`)
            const uploaded = await window.KoiZip.uploadEntries(docs, { imagePrefix: 'report-image', videoPrefix: 'report-video', existingUrls: [] })
            problems.push(...uploaded.problems.map((message) => `${group.title}: ${message}`))
            docsAdded += uploaded.entries.length
            docsSkipped += uploaded.duplicates
            arrivalMedia = uploaded.entries
          }
          problems.push(...(await window.KoiArrival.resolveLineImages(group, pkg)))
          const galleryWantedArrival = reportGalleryFrom('', arrivalMedia.length > 0)
          try {
            const response = await fetch('/api/farm-reports', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(window.KoiArrival.payloadFor(group, { media_entries: arrivalMedia, show_in_gallery: galleryWantedArrival })),
            })
            if (response.ok) {
              arrivalCreated += 1
              if (galleryWantedArrival) galleryCount += 1
            } else {
              const result = await response.json().catch(() => ({}))
              problems.push(`${group.title}: ${result.error || 'gagal disimpan'}`)
            }
          } catch {
            problems.push(`${group.title}: gagal disimpan`)
          }
        }
      }

      for (const [index, record] of (arrivalFormat ? [] : records).entries()) {
        const line = index + 2
        const code = (record['kode batch'] || '').toUpperCase()
        if (pkg && code) pkg.markUsed(code)
        const bad = []
        const date = reportDateFromText(record.tanggal)
        const type = typeFrom(record.jenis)
        if (String(record.jenis || '').trim().toLowerCase() === 'ikan datang') {
          if (!arrivalSheetName) problems.push(`Baris ${line}: Laporan Ikan Datang diimport lewat sheet "Ikan Datang" (satu baris per ekor ikan)`)
          continue
        }

        if (code && knownCodes.has(code)) {
          problems.push(`Baris ${line} (${code}): laporan dengan kode ini sudah ada, dilewati`)
          continue
        }
        if (!date) bad.push(record.tanggal ? `Tanggal "${record.tanggal}" tidak valid` : 'Tanggal wajib diisi')
        if (!type) bad.push(String(record.jenis || '').toLowerCase() === 'kegiatan' ? 'Laporan Kegiatan tidak bisa diimport, buat lewat formulir' : `Jenis "${record.jenis}" tidak dikenal (Panen atau Data Ulang)`)
        if (!record.judul) bad.push('Judul wajib diisi')
        if (bad.length) {
          problems.push(`Baris ${line}${code ? ` (${code})` : ''}: ${bad.join('; ')}`)
          continue
        }
        const key = reportKey(type, date, record.judul, record['lokasi asal'], record.catatan)
        if (existingKeys.has(key)) {
          problems.push(`Baris ${line}${code ? ` (${code})` : ''}: laporan "${record.judul}" tanggal ${date} (${type === 'panen' ? 'Panen' : 'Data Ulang'}) sudah ada, dilewati`)
          continue
        }
        existingKeys.add(key)

        // Dokumentasi cell: folder(s) of the ZIP and/or @ID of media that is already in the Galeri
        let docs = null
        if (pkg) {
          const found = await pkg.docsForRow(record.dokumentasi, code)
          docs = found.docs
          problems.push(...found.problems.map((message) => `Baris ${line}${code ? ` (${code})` : ''}: ${message}`))
        }
        if (docs && docs.length) docsPlanned += docs.length
        if (dryRun) {
          inserted += 1
          continue
        }

        // Documentation from a ZIP: the photos/videos for this Kode Batch (files, or media mentioned by ID Media)
        // become the new report's media.
        let importedMedia = []
        if (docs && docs.length) {
          progress?.set(`Baris ${line}: ${docs.length} dokumentasi`)
          const uploaded = await window.KoiZip.uploadEntries(docs, { imagePrefix: 'report-image', videoPrefix: 'report-video', existingUrls: [] })
          problems.push(...uploaded.problems.map((message) => `Baris ${line} (${code}): ${message}`))
          docsAdded += uploaded.entries.length
          docsSkipped += uploaded.duplicates
          importedMedia = uploaded.entries
        }
        const galleryWanted = reportGalleryFrom(record.galeri, importedMedia.length > 0)
        try {
          const response = await fetch('/api/farm-reports', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              report_type: type,
              report_date: date,
              report_title: record.judul,
              dominant_variety: record['varietas dominan'],
              origin_location: record['lokasi asal'],
              destination_location: record['lokasi tujuan'],
              average_length_cm: record['rata-rata ukuran (cm)'],
              notes: record.catatan,
              media_entries: importedMedia,
              show_in_gallery: galleryWanted,
            }),
          })
          if (response.ok) {
            inserted += 1
            if (galleryWanted) galleryCount += 1
          } else {
            const result = await response.json().catch(() => ({}))
            problems.push(`Baris ${line}: ${result.error || 'gagal disimpan'}`)
          }
        } catch {
          problems.push(`Baris ${line}: gagal disimpan`)
        }
      }

      if (pkg) {
        for (const key of pkg.unusedKeys()) problems.push(`Folder dokumentasi "${key}" tidak dipakai: tidak ada baris data yang memakainya`)
      }
      return { inserted, arrivalCreated, docsAdded, docsSkipped, docsPlanned, galleryCount, problems }
    }

    const importReportsExcel = async (file) => {
      if (!window.XLSX) {
        window.KoiDock.showResult('Impor Excel', 'Pustaka Excel belum termuat. Muat ulang halaman.')
        return
      }

      let progress = null
      try {
        progress = window.KoiZip.progress('Memeriksa file Laporan')
        let pkg = null
        const packageProblems = []
        if (/\.zip$/i.test(file.name)) {
          pkg = await window.KoiZip.readPackage(file)
          file = pkg.xlsxFile
          packageProblems.push(...pkg.problems)
        } else {
          pkg = await window.KoiZip.plainPackage()
        }
        const sheet = await readReportsWorkbook(file)
        if (!sheet.records.length) {
          window.KoiDock.showResult('Impor Excel', 'File tidak berisi data. Kolom yang dikenali: ' + reportExcelColumns.join(', ') + '.')
          return
        }

        // pass 1: check everything, write nothing
        const plan = await runReportsImport(sheet, pkg, true, progress)
        progress.close()
        progress = null
        const planProblems = [...packageProblems, ...plan.problems]
        if (!plan.inserted && !plan.arrivalCreated) {
          window.KoiDock.showResult('Impor Excel Laporan', 'Tidak ada laporan yang bisa diimport.', planProblems)
          return
        }
        const summary = `Laporan baru: ${plan.inserted}` + (plan.arrivalCreated ? `\nLaporan Ikan Datang baru: ${plan.arrivalCreated}` : '') +
          (pkg.isZip || plan.docsPlanned ? `\nDokumentasi: ${plan.docsPlanned} file (masuk Galeri kecuali kolom Galeri = Tidak)` : '') +
          (planProblems.length ? '\nBaris atau file bermasalah dilewati.' : '')
        const go = await window.KoiDock.showResult('Pratinjau import Laporan', summary, planProblems, { confirm: true, okLabel: planProblems.length ? 'Lanjutkan (lewati yang bermasalah)' : 'Lanjutkan' })
        if (!go) return

        // pass 2: write
        progress = window.KoiZip.progress('Impor Laporan')
        const result = await runReportsImport(sheet, pkg, false, progress)
        const allProblems = [...packageProblems, ...result.problems]
        window.KoiDock.showResult('Impor Excel Laporan', `Laporan baru ${result.inserted}${result.arrivalCreated ? `, Ikan Datang baru ${result.arrivalCreated}` : ''}, bermasalah ${allProblems.length}.${pkg.isZip || result.docsPlanned ? ` Dokumentasi ditambahkan ${result.docsAdded}, sudah ada ${result.docsSkipped}. Masuk Galeri ${result.galleryCount}.` : ''} Rincian kolam, kondisi, sortir, spektrum, dan data lain diisi lewat formulir.`, allProblems)
        await Q()
      } catch (error) {
        window.KoiDock.showResult('Impor Excel Laporan', error.message || 'File tidak dapat dibaca.')
      } finally {
        progress?.close()
      }
    }

    const reportImportInput = document.createElement('input')
reportImportInput.type = 'file'
reportImportInput.accept = '.xlsx,.xls,.zip'
reportImportInput.hidden = true
reportImportInput.addEventListener('change', async () => {
  const [file] = Array.from(reportImportInput.files || [])
  reportImportInput.value = ''
  if (file) await importReportsExcel(file)
})
document.body.appendChild(reportImportInput)
 return {exportReportsExcel,reportImportInput}})(),rdDock=window.KoiDock.create({root:u,label:`laporan`,idOf:it=>String(it.id),visibleItems:()=>rdDock.apply(S.filter(rdReportMatches)),render:()=>Fe(S),actions:[{key:`edit`,icon:`edit`,title:`Edit laporan terpilih`,role:`farm-operate`,show:c1=>c1===1,onClick:ids=>{document.querySelector(`[data-dock-id="${ids[0]}"] [data-edit-report]`)?.click()}},{key:`copy`,icon:`copy`,title:`Salin kode batch terpilih`,onClick:async(ids,bt)=>{let cd=ids.map(id=>S.find(x=>String(x.id)===String(id))?.batch_code).filter(Boolean),ok=await window.KoiDock.copyText(cd.join(`\n`));bt.classList.remove(`btn-outline-primary`),bt.classList.add(ok?`btn-success`:`btn-danger`),bt.setAttribute(`title`,ok?`Kode batch tersalin`:`Kode batch gagal disalin`),setTimeout(()=>{bt.classList.remove(`btn-success`,`btn-danger`),bt.classList.add(`btn-outline-primary`),bt.setAttribute(`title`,`Salin kode batch terpilih`)},1200)}},{key:`print`,icon:`printer`,variant:`secondary`,title:c1=>c1>1?`Cetak ${c1} laporan terpilih (satu halaman per laporan)`:`Cetak laporan terpilih`,show:c1=>c1>=1,onClick:ids=>{const clickPrint=id=>document.querySelector(`[data-dock-id="${id}"] [data-print-report]`)?.click();if(ids.length>1)window.KoiPrint.printMany(ids,clickPrint,{title:`Laporan terpilih (${ids.length})`});else clickPrint(ids[0])}},{key:`delete`,icon:`trash`,variant:`danger`,title:c1=>`Hapus ${c1} laporan terpilih`,role:`farm-operate`,onClick:ids=>rdDelete(ids)},{key:`export`,icon:`file-spreadsheet`,variant:`success`,title:c1=>c1?`Ekspor Excel (${c1} terpilih)`:`Ekspor Excel`,always:!0,onClick:ids=>rdExcel.exportReportsExcel(ids)},{key:`zip`,icon:`file-zip`,variant:`success`,title:c1=>c1?`Unduh ZIP (${c1} terpilih)`:`Unduh ZIP (Excel + dokumentasi)`,always:!0,onClick:ids=>rdExcel.exportReportsExcel(ids,!0)},{key:`import`,icon:`upload`,variant:`success`,title:`Impor Excel atau ZIP`,role:`farm-operate`,always:!0,show:c1=>c1===0,onClick:()=>rdExcel.reportImportInput.click()}],add:{title:`Tambah laporan`,role:`farm-operate`,onClick:()=>document.querySelector(`[data-report-open]`).click()}}),u.addEventListener(`click`,async t=>{let cc=t.target.closest(`[data-copy-report-code]`);if(cc){t.preventDefault(),t.stopPropagation();let og=cc.textContent,ok=await window.KoiDock.copyText(cc.dataset.copyReportCode);cc.setAttribute(`title`,ok?`Kode Batch tersalin`:`Kode Batch gagal disalin`),cc.classList.toggle(`is-copied`,ok),cc.classList.toggle(`is-copy-failed`,!ok),cc.textContent=ok?`Tersalin`:`Gagal`,setTimeout(()=>{cc.textContent=og,cc.classList.remove(`is-copied`,`is-copy-failed`)},1e3);return}let sa=t.target.closest(`[data-dock-select]`);if(sa){rdDock.toggle(sa.closest(`[data-dock-id]`).dataset.dockId);return}let n=t.target.closest(`[data-print-report]`);if(n){t.stopPropagation();let e=S.find(e=>String(e.id)===String(n.dataset.printReport));e&&We(e);return}let r=t.target.closest(`[data-edit-report]`);if(r){t.stopPropagation();let e=S.find(e=>String(e.id)===String(r.dataset.editReport));e&&Pe(e);return}let i=t.target.closest(`[data-delete-report]`);if(i){t.stopPropagation();let n=S.find(e=>String(e.id)===String(i.dataset.deleteReport));if(!n)return;let r=n.report_title||A(n.report_date)||`laporan ini`;if(!(await window.KoiDialog.confirm(`Hapus ${r}?`)))return;i.disabled=!0,i.textContent=`Menghapus`;try{let t=await fetch(`${e}/farm-reports/${i.dataset.deleteReport}`,{method:`DELETE`}),n=await t.json().catch(()=>({}));if(!t.ok)throw Error(n.error||n.detail||`Laporan gagal dihapus`);await Q()}catch(e){alert(e.message),i.disabled=!1,i.textContent=`Hapus`}return}if(t.target.closest(`.dropdown`)){t.stopPropagation();return}let a=t.target.closest(`[data-report-id]`),o=S.find(e=>String(e.id)===String(a?.dataset.reportId));o&&Ne(o)}),u.addEventListener(`keydown`,e=>{if(e.key!==`Enter`&&e.key!==` `)return;let t=e.target.closest(`[data-report-id]`);if(e.target!==t)return;let n=S.find(e=>String(e.id)===t?.dataset.reportId);n&&(e.preventDefault(),Ne(n))}),t.addEventListener(`submit`,async n=>{n.preventDefault(),a.classList.add(`d-none`),o.classList.add(`d-none`),s.disabled=!0,s.textContent=`Menyimpan...`;let r={report_type:new FormData(t).get(`report_type`),report_date:t.elements.report_date.value,batch_code:t.elements.batch_code.value,report_title:t.elements.report_title.value,dominant_variety:t.elements.dominant_variety.value,origin_location:t.elements.origin_location.value,destination_location:t.elements.destination_location.value,average_length_cm:t.elements.average_length_cm.value,notes:t.elements.notes.value,pond_entries:Ce(),condition_entries:getCondEntries(),sorting_entries:getSortEntries(),breeding_entries:we(f,`breeding`),koi_entries:we(p,`koi`),reporter_entries:Te(),media_entries:Oe(),spectrum_sizes:_e(),spectrum_summary:ve(),validation_checks:[...document.querySelectorAll(`[data-validation-check]:checked`)].map(e=>e.value),show_in_gallery:!!t.elements.show_in_gallery?.checked};try{let t=await fetch(`${e}/farm-reports${T?`/${T}`:``}`,{method:T?`PUT`:`POST`,headers:{"content-type":`application/json`},body:JSON.stringify(r)}),n=await t.json().catch(()=>({}));if(!t.ok)throw Error(n.error||n.detail||`Laporan gagal disimpan`);let koiWasEditing=!!T;await Q(),window.__koiReportDrafts?.consume(),koiWasEditing||(Z(),M())}catch(e){a.textContent=e.message,a.classList.remove(`d-none`)}finally{s.disabled=!1,s.textContent=T?`Simpan Perubahan`:`Simpan Laporan`}}),c.valueAsDate=new Date,G(),Ie(),Q(),Le().catch(()=>{}),window.KoiAuth?.registerRealtimeRefresh(()=>Q(!0),{intervalMs:3e4});document.head.insertAdjacentHTML(`beforeend`,`<style>.report-parent-chip img{cursor:zoom-in}</style>`),document.addEventListener(`click`,e=>{let t=e.target.closest(`.report-parent-chip img`);t&&window.KoiAuth.zoomPhoto(t.src,t.alt)});
// ---- Laporan search: plain words + "field:value" ---------------------------------------------------------
// "jenis:panen kolam:mudpond catatan:habis" -> every field:value must match (a value runs until the next field:).
// Plain words must all be found in kode, judul, jenis, varietas, asal, tujuan, kolam, breeding, petugas. A comma
// inside a text value means "or" (jenis:panen,data ulang). Catatan is only searched with catatan:.
var rdReportSearch = ''
var rdReportAliases = {
  kode: 'batch_code', batch: 'batch_code', kodebatch: 'batch_code',
  judul: 'report_title', nama: 'report_title',
  jenis: 'type', tipe: 'type', type: 'type',
  tanggal: 'report_date', tgl: 'report_date',
  varietas: 'dominant_variety', variety: 'dominant_variety', dominan: 'dominant_variety',
  asal: 'origin_location', tujuan: 'destination_location',
  kolam: 'pond', lokasi: 'pond', pond: 'pond',
  breeding: 'breeding',
  petugas: 'reporter',
  ukuran: 'average_length_cm', size: 'average_length_cm',
  catatan: 'notes', notes: 'notes',
  galeri: 'gallery_id',
}
// "bloo:isa" works too: a field name may be shortened to its first letters (2 or more). Exact names win, then the
// first name in the alias list that starts with what was typed. Tidak diketahui names stay plain text.
function rdReportResolveMarkers(keyword, aliases) {
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
var rdReportTypeNames = { panen: 'Panen', data_ulang: 'Data Ulang', kegiatan: 'Kegiatan', ikan_datang: 'Ikan Datang' }

function rdReportNorm(value) {
  return String(value === null || value === undefined ? '' : value).toLowerCase().trim()
}

function rdReportList(value) {
  try { var parsed = typeof value === 'string' ? JSON.parse(value || '[]') : value; return Array.isArray(parsed) ? parsed : [] } catch (error) { return [] }
}

function rdReportParts(item) {
  var pond = rdReportList(item.pond_entries).map(function (entry) { return [entry.pond_name, entry.location, entry.label].filter(Boolean).join(' ') }).join(' ') + ' ' + (item.pond_name || '')
  var breeding = rdReportList(item.breeding_entries).map(function (entry) { return entry.label || '' }).join(' ')
  var reporter = rdReportList(item.reporter_entries).map(function (entry) { return [entry.label, entry.username, entry.name].filter(Boolean).join(' ') }).join(' ') + ' ' + (item.reporter || '')
  var typeName = rdReportTypeNames[item.report_type] || String(item.report_type || '').replace(/_/g, ' ')
  return { pond: rdReportNorm(pond), breeding: rdReportNorm(breeding), reporter: rdReportNorm(reporter), type: rdReportNorm(typeName + ' ' + String(item.report_type || '').replace(/_/g, ' ') + (item.report_type === 'panen' || item.report_type === 'data_ulang' ? ' perikanan' : '')) }
}

function rdReportNumberTest(value) {
  var text = String(value || '').toLowerCase().replace(/\s|cm/g, '').replace(',', '.')
  var compare = text.match(/^(>=|<=|>|<)(\d+(?:\.\d+)?)$/)
  if (compare) {
    var limit = Number(compare[2])
    return { '>=': function (n) { return n >= limit }, '<=': function (n) { return n <= limit }, '>': function (n) { return n > limit }, '<': function (n) { return n < limit } }[compare[1]]
  }
  var range = text.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/)
  if (range) {
    var min = Math.min(Number(range[1]), Number(range[2]))
    var max = Math.max(Number(range[1]), Number(range[2]))
    return function (n) { return n >= min && n <= max }
  }
  return /^\d+(?:\.\d+)?$/.test(text) ? function (n) { return n === Number(text) } : null
}

function rdReportDateText(value) {
  var match = String(value || '').trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  return match ? match[3] + '-' + match[2].padStart(2, '0') + '-' + match[1].padStart(2, '0') : String(value || '').trim()
}

// true / false, or null while the value is still being typed
function rdReportField(item, parts, field, rawValue) {
  var value = rdReportNorm(rawValue)
  if (!value) return null
  if (field === 'average_length_cm') {
    var test = rdReportNumberTest(value)
    var number = Number(item.average_length_cm)
    if (!test) return null
    return item.average_length_cm !== null && item.average_length_cm !== undefined && item.average_length_cm !== '' && Number.isFinite(number) && test(number)
  }
  if (field === 'report_date') return String(item.report_date || '').slice(0, 10).includes(rdReportDateText(value))
  if (field === 'gallery_id') return String(item.gallery_id || '') === value.replace(/^#/, '')
  return value.split(',').map(function (part) { return part.trim() }).filter(Boolean).some(function (choice) {
    if (field === 'type') return parts.type.includes(choice.replace(/_/g, ' '))
    if (field === 'pond') return parts.pond.includes(choice)
    if (field === 'breeding') return parts.breeding.includes(choice)
    if (field === 'reporter') return parts.reporter.includes(choice)
    return rdReportNorm(item[field]).includes(choice)
  })
}

function rdReportMatches(item) {
  var keyword = String(rdReportSearch || '').trim()
  if (!keyword) return true
  var markers = rdReportResolveMarkers(keyword, rdReportAliases)
  var plain = markers.length ? keyword.slice(0, markers[0].index) : keyword
  var parts = rdReportParts(item)
  for (var index = 0; index < markers.length; index += 1) {
    var marker = markers[index]
    var valueStart = marker.index + marker[0].length
    var valueEnd = index + 1 < markers.length ? markers[index + 1].index : keyword.length
    if (rdReportField(item, parts, rdReportAliases[marker[1].toLowerCase()], keyword.slice(valueStart, valueEnd)) === false) return false
  }
  var alternatives = plain.split(',').map(function (part) { return rdReportNorm(part).split(/\s+/).filter(Boolean) }).filter(function (words) { return words.length })
  if (!alternatives.length) return true
  var blob = rdReportNorm([item.batch_code, item.report_title, parts.type, item.dominant_variety, item.origin_location, item.destination_location, parts.pond, parts.breeding, parts.reporter].join(' '))
  return alternatives.some(function (words) { return words.every(function (word) { return blob.includes(word) }) })
}

// the navbar search feeds the hidden [data-report-search] input
;(function () {
  var box = document.querySelector('[data-report-search]')
  var navbar = document.querySelector('#navbar-global-search')
  if (navbar) {
    navbar.setAttribute('placeholder', 'Kode, judul, kolam, jenis:panen')
    navbar.setAttribute('title', 'Cari bebas: kode, judul, jenis, varietas, asal, tujuan, kolam, breeding, petugas. Cari per kolom dengan kolom:isi, boleh digabung: jenis:panen kolam:mudpond catatan:habis. Nama kolom boleh disingkat (misalnya jen:panen). Kolom: kode, judul, jenis, tanggal, varietas, asal, tujuan, kolam, breeding, petugas, ukuran, catatan, galeri.')
  }
  if (box) box.addEventListener('input', function () { rdReportSearch = box.value.trim(); Fe(S) })
})()
