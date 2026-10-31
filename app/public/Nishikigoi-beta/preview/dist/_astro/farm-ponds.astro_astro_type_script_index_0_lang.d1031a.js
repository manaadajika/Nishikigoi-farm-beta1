const pdWords = (part) => part.replace(/([a-z])(\d)/g, '$1 $2').replace(/(\d)\s*-\s*(\d)/g, '$1-$2').split(/\s+/).filter(Boolean)
// a word matches the name/area text; a number matches the numbers of the name ("2" finds "VAT 02"), and "2-5" any number from 2 to 5
const pdWordMatch = (word, item, haystack) => {
  const numbers = (String(item.name || '').match(/\d+/g) || []).map(Number)
  const range = word.match(/^(\d+)-(\d+)$/)
  if (range) {
    const low = Math.min(Number(range[1]), Number(range[2]))
    const high = Math.max(Number(range[1]), Number(range[2]))
    return numbers.some((number) => number >= low && number <= high)
  }
  return haystack.includes(word) || (/^\d+$/.test(word) && numbers.includes(Number(word)))
}
const zzSize=e=>{let n=Number(e);return Number.isFinite(n)&&String(e).trim()!==``?n.toLocaleString(`id-ID`,{maximumFractionDigits:1}):String(e??``)};var pdDock,pdBulkNote,pdBulkStatus,pdDelete,pdSortLabel,pdSortTitle,e=`/api`,t=e=>e||`-`,n=e=>String(e??``).replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`).replace(/'/g,`&#039;`),r=document.querySelector(`[data-ponds-table]`),i=document.querySelector(`[data-print-ponds]`),a=document.querySelectorAll(`[data-print-pond-detail]`),o=document.querySelector(`[data-open-area-settings]`),s=document.querySelector(`#area-settings-modal`),ee=document.querySelector(`[data-area-order-list]`),te=document.querySelector(`[data-reset-area-order]`),c=document.querySelector(`[data-import-ponds]`),l=document.querySelector(`[data-export-ponds]`),u=document.querySelector(`[data-import-ponds-input]`),d=document.querySelector(`[data-pond-import-export-message]`),f=document.querySelector(`[data-pond-form]`),p=document.querySelector(`[data-form-message]`),m=document.querySelector(`[data-pond-form-title]`),ne=document.querySelector(`[data-pond-submit]`),h=document.querySelector(`#pond-modal`),g=document.querySelector(`#pond-detail-modal`),re=document.querySelector(`[data-pond-detail-title]`),ie=document.querySelector(`[data-pond-detail-summary]`),ae=document.querySelector(`[data-pond-detail-fish]`),_=document.querySelector(`[data-pond-detail-form]`),v=document.querySelector(`[data-pond-detail-message]`),y=document.querySelector(`[data-save-pond-notes]`),b=document.querySelector(`[data-pond-note-history]`),x=document.querySelector(`[data-delete-pond]`),S=document.querySelector(`[data-pond-documentation-input]`),C=document.querySelector(`[data-upload-pond-documentation]`),w=document.querySelector(`[data-paste-pond-documentation]`),T=document.querySelector(`[data-pond-documentation-status]`),E=document.querySelector(`[data-pond-documentation-list]`),D=async e=>{let t=window.scrollX,n=window.scrollY,r=await e();return requestAnimationFrame(()=>window.scrollTo(t,n)),r},O=null,k=null,A=null,j=``,M=new Map,N={unknown:`Unknown`,male:`Male`,female:`Female`,active:`Aktif`,quarantine:`Karantina`,sold:`Terjual`,dead:`Mati`,indukan:`Indukan`,non_indukan:`Bukan Indukan`},P=[],F=JSON.parse(localStorage.getItem(`pondAreaOrder`)||`[]`),I=(()=>{try{let e=JSON.parse(sessionStorage.getItem(`nishikigoi-view:farm-ponds`)||`null`);if(e&&[`name`,`unphotographed_fish_qty`,`koi_count`,`notes`].includes(e.key)&&(e.direction===`asc`||e.direction===`desc`))return{key:e.key,direction:e.direction}}catch{}return{key:`name`,direction:`asc`}})(),L=`nishikigoi-cache:farm-ponds`,oe={kosong:{label:`Kosong`,className:`bg-secondary-lt`},active:{label:`Aktif`,className:`bg-green-lt`},perbaikan:{label:`Perbaikan`,className:`bg-yellow-lt`}},se=()=>window.tabler?.bootstrap?.Modal||window.bootstrap?.Modal,R=e=>{let t=se();if(t){t.getOrCreateInstance(e).show();return}if(O=e,e.classList.add(`show`),e.style.display=`block`,e.removeAttribute(`aria-hidden`),e.setAttribute(`aria-modal`,`true`),e.setAttribute(`role`,`dialog`),document.body.classList.add(`modal-open`),!document.querySelector(`[data-fallback-modal-backdrop]`)){let e=document.createElement(`div`);e.className=`modal-backdrop fade show`,e.dataset.fallbackModalBackdrop=`true`,e.addEventListener(`click`,B),document.body.appendChild(e)}},z=e=>{let t=se();if(t){t.getInstance(e)?.hide();return}e.classList.remove(`show`),e.style.display=`none`,e.setAttribute(`aria-hidden`,`true`),e.removeAttribute(`aria-modal`),e.removeAttribute(`role`),document.body.classList.remove(`modal-open`),document.querySelector(`[data-fallback-modal-backdrop]`)?.remove(),O=null};function B(){O&&z(O)}var V=e=>{try{let t=typeof e==`string`?JSON.parse(e):e;return Array.isArray(t)?t.filter(Boolean):[]}catch{return[]}},H=e=>Number(e.koi_count||0)+Number(e.unphotographed_fish_qty||0),U=e=>new Promise((t,n)=>{let r=new FileReader;r.addEventListener(`load`,()=>t(r.result)),r.addEventListener(`error`,()=>n(Error(`Gambar gagal dibaca`))),r.readAsDataURL(e)}),ce=e=>new Promise((t,n)=>{let r=new FileReader;r.addEventListener(`load`,()=>t(r.result)),r.addEventListener(`error`,()=>n(Error(`File import gagal dibaca`))),r.readAsText(e)}),le=e=>`"${String(e??``).replace(/"/g,`""`)}"`,ue=e=>{let t=[],n=[],r=``,i=!1;for(let a=0;a<e.length;a+=1){let o=e[a],s=e[a+1];if(o===`"`&&i&&s===`"`){r+=`"`,a+=1;continue}if(o===`"`){i=!i;continue}if(o===`,`&&!i){n.push(r),r=``;continue}if((o===`
`||o===`\r`)&&!i){o===`\r`&&s===`
`&&(a+=1),n.push(r),n.some(e=>e.trim())&&t.push(n),n=[],r=``;continue}r+=o}n.push(r),n.some(e=>e.trim())&&t.push(n);let[a=[],...o]=t,s=a.map(e=>e.trim().toLowerCase());return o.map(e=>s.reduce((t,n,r)=>(t[n]=e[r]||``,t),{}))},de=e=>new Promise((t,n)=>{let r=new Image;r.addEventListener(`load`,()=>t(r)),r.addEventListener(`error`,()=>n(Error(`Gambar gagal diproses`))),r.src=e}),fe=e=>new Promise(t=>{let n=document.createElement(`video`),r=document.createElement(`canvas`),i=URL.createObjectURL(e);n.muted=!0,n.playsInline=!0,n.preload=`metadata`,n.addEventListener(`loadeddata`,()=>{r.width=n.videoWidth||640,r.height=n.videoHeight||360,r.getContext(`2d`).drawImage(n,0,0,r.width,r.height),URL.revokeObjectURL(i),t(r.toDataURL(`image/webp`,.82))},{once:!0}),n.addEventListener(`error`,()=>{URL.revokeObjectURL(i),t(``)},{once:!0}),n.src=i}),pe=async e=>{let t=await de(await U(e)),n=Math.min(1,1600/Math.max(t.naturalWidth,t.naturalHeight)),r=document.createElement(`canvas`);return r.width=Math.max(1,Math.round(t.naturalWidth*n)),r.height=Math.max(1,Math.round(t.naturalHeight*n)),r.getContext(`2d`).drawImage(t,0,0,r.width,r.height),r.toDataURL(`image/jpeg`,.76)},me=e=>`
      <div class="pond-fish-preview d-flex align-items-center justify-content-center">
        ${e.image_url?`<img src="${e.image_url}" alt="${t(e.code)}" loading="lazy" data-zoom-info="${encodeURIComponent(JSON.stringify(window.KoiAuth.koiZoomInfo(e)))}" />`:`<div class="pond-fish-preview-placeholder d-flex align-items-center justify-content-center">${t(e.code).slice(0,4)}</div>`}
      </div>
    `,he=e=>{b.innerHTML=e.map(e=>`
            <div class="list-group-item">
              <div class="d-flex justify-content-between gap-3">
                <div>
                  <div class="text-secondary small">${e.created_at?window.KoiAuth.formatDateTime(e.created_at):`-`}</div>
                  <div>${t(e.new_notes)}</div>
                  <div class="text-secondary small mt-1">Sebelumnya: ${t(e.previous_notes)}</div>
                </div>
                <button class="btn btn-sm btn-outline-danger" type="button" data-delete-note-history="${e.id}" data-role-required="farm-operate">Hapus</button>
              </div>
            </div>
          `).join(``)||`<div class="list-group-item text-secondary">Belum ada history pengeditan catatan.</div>`},W=async t=>{b.innerHTML=`<div class="list-group-item text-secondary">Memuat history catatan.</div>`;try{let n=await fetch(`${e}/ponds/${t}/note-history`);if(!n.ok)throw Error(`History gagal dimuat`);he(await n.json())}catch{b.innerHTML=`<div class="list-group-item text-danger">History catatan gagal dimuat.</div>`}},ndDay=document.querySelector(`[data-notes-day]`),ndMonth=document.querySelector(`[data-notes-month]`),ndMList=document.querySelector(`[data-notes-month-list]`),ndYear=document.querySelector(`[data-notes-year]`),ndNames=[`Januari`,`Februari`,`Maret`,`April`,`Mei`,`Juni`,`Juli`,`Agustus`,`September`,`Oktober`,`November`,`Desember`],ndLabel=m1=>`[${String(m1).padStart(2,`0`)}] ${ndNames[m1-1]}`,ndFmt=v1=>/^(\d{4})-(\d{2})-(\d{2})/.test(String(v1||``))?window.KoiAuth.formatDate(v1):``,ndParse=v1=>{let t1=String(v1||``).trim().toLowerCase();if(!t1)return 0;let n1=t1.match(/^\[?(\d{1,2})\]?(?:\s|$)/);if(n1)return Number(n1[1])>=1&&Number(n1[1])<=12?Number(n1[1]):0;let i1=ndNames.findIndex(x=>x.toLowerCase().startsWith(t1));return i1>=0?i1+1:0},ndSuggest=v1=>{let t1=String(v1||``).trim().toLowerCase().replace(/^\[|\]$/g,``);return ndNames.map((x,i)=>i+1).filter(m1=>t1?/^\d+$/.test(t1)?String(m1).startsWith(t1):ndNames[m1-1].toLowerCase().includes(t1):!0)},ndActive=-1,ndHide=()=>{ndMList.hidden=!0,ndActive=-1},ndChoose=m1=>{ndMonth.value=ndLabel(m1),ndMonth.classList.remove(`is-invalid`),ndHide(),ndMonth.dispatchEvent(new Event(`input`,{bubbles:!0}))},ndShow=()=>{let nums=ndSuggest(ndMonth.value);ndActive=nums.length?0:-1,ndMList.innerHTML=nums.map((m1,i)=>`<button class="list-group-item list-group-item-action py-1 ${i===0?`active`:``}" type="button" data-month-option="${m1}">${ndLabel(m1)}</button>`).join(``),ndMList.hidden=nums.length===0},ndMove=st=>{let op=[...ndMList.querySelectorAll(`[data-month-option]`)];op.length&&(ndActive=(ndActive+st+op.length)%op.length,op.forEach((o,i)=>o.classList.toggle(`active`,i===ndActive)),op[ndActive].scrollIntoView({block:`nearest`}))},ndPad=v1=>String(v1).padStart(2,`0`),ndValue=()=>{let dt=ndDay.value.trim(),mt0=ndMonth.value.trim(),yt=ndYear.value.trim();if(!dt&&!mt0&&!yt)return``;let d1=Number(dt),m1=ndParse(ndMonth.value),y1=Number(yt),yOk=Number.isInteger(y1)&&y1>=1900&&y1<=2100,mOk=!mt0||m1>=1,dOk=!dt||Number.isInteger(d1)&&d1>=1&&d1<=(m1>=1?new Date(y1,m1,0).getDate():31);return ndDay.classList.toggle(`is-invalid`,!dOk),ndMonth.classList.toggle(`is-invalid`,!mOk),ndYear.classList.toggle(`is-invalid`,!yOk),yOk&&mOk&&dOk?`${y1}-${m1>=1?ndPad(m1):`00`}-${dt?ndPad(d1):`00`}`:null},ndSet=(v1,bl)=>{let mt=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(v1||``)),td=new Date;!mt&&bl?(ndYear.value=``,ndMonth.value=``,ndDay.value=``):(ndYear.value=String(mt?Number(mt[1]):td.getFullYear()),ndMonth.value=mt?Number(mt[2])?ndLabel(Number(mt[2])):``:ndLabel(td.getMonth()+1),ndDay.value=mt?Number(mt[3])?String(Number(mt[3])):``:String(td.getDate())),[ndDay,ndMonth,ndYear].forEach(f1=>f1.classList.remove(`is-invalid`))},ndTouched=!1,ndInit=(ndSet(``,!0),ndMonth.addEventListener(`focus`,ndShow),ndMonth.addEventListener(`input`,ndShow),ndMonth.addEventListener(`keydown`,ev=>{if(ev.key===`ArrowDown`){ev.preventDefault(),ndMList.hidden?ndShow():ndMove(1)}else if(ev.key===`ArrowUp`){ev.preventDefault(),ndMove(-1)}else if(ev.key===`Enter`||ev.key===`Tab`){let op=ndMList.hidden?null:ndMList.querySelectorAll(`[data-month-option]`)[ndActive];op&&(ev.key===`Enter`&&ev.preventDefault(),ndChoose(Number(op.dataset.monthOption)))}else ev.key===`Escape`&&!ndMList.hidden&&(ev.stopPropagation(),ndHide())}),ndMList.addEventListener(`mousedown`,ev=>{let op=ev.target.closest(`[data-month-option]`);op&&(ev.preventDefault(),ndChoose(Number(op.dataset.monthOption)))}),ndMonth.addEventListener(`blur`,()=>{ndHide();let m1=ndParse(ndMonth.value);m1&&(ndMonth.value=ndLabel(m1)),ndMonth.classList.toggle(`is-invalid`,!!ndMonth.value.trim()&&!m1)}),[ndDay,ndMonth,ndYear].forEach(f1=>f1.addEventListener(`input`,()=>{ndTouched=!0})),document.querySelector(`#pond-detail-notes`).addEventListener(`input`,()=>{ndTouched||ndSet(``)}),document.querySelector(`[data-notes-date-button]`).addEventListener(`click`,()=>{let tp=document.querySelector(`[data-notes-date-picker]`),td=new Date;tp.value=ndValue()||`${td.getFullYear()}-${ndPad(td.getMonth()+1)}-${ndPad(td.getDate())}`,(()=>{try{typeof tp.showPicker==`function`?tp.showPicker():tp.click()}catch{tp.focus()}})()}),document.querySelector(`[data-notes-date-picker]`).addEventListener(`change`,ev=>{ev.target.value&&(ndTouched=!0,ndSet(ev.target.value))}),document.querySelector(`[data-notes-date-clear]`).addEventListener(`click`,()=>{ndSet(``,!0),ndTouched=!0})),dmSel=new Set,dmBarEl=document.querySelector(`[data-pond-documentation-move-bar]`),dmTarget=document.querySelector(`[data-doc-move-target]`),dmBtn=document.querySelector(`[data-doc-move-button]`),dmGal=document.querySelector(`[data-doc-gallery-button]`),dmTimers=new Map,dmSave,dmOpts=ex=>{let by=new Map;return P.filter(o=>String(o.id)!==String(ex)).forEach(o=>{let ar=o.location||`Tanpa Area`;by.set(ar,[...(by.get(ar)||[]),o])}),`<option value="">Pindah ke kolam...</option>`+X(Array.from(by.keys())).map(ar=>`<optgroup label="${n(ar)}">${by.get(ar).sort((x,y)=>String(x.name).localeCompare(String(y.name),`id`,{numeric:!0})).map(o=>`<option value="${o.id}">${t(o.name)}</option>`).join(``)}</optgroup>`).join(``)},dmBar=()=>{let present=new Set(Array.from(E.querySelectorAll(`[data-doc-select]`)).map(bx=>bx.dataset.docSelect));Array.from(dmSel).forEach(id=>{present.has(id)||dmSel.delete(id)}),dmBarEl.hidden=present.size===0;let keep=dmTarget.value;dmTarget.innerHTML=dmOpts(k),dmTarget.value=keep&&dmTarget.querySelector(`option[value="${keep}"]`)?keep:``,dmBtn.textContent=dmSel.size?`Pindahkan (${dmSel.size})`:`Pindahkan`,dmBtn.disabled=!dmSel.size||!dmTarget.value,dmGal.disabled=!dmSel.size},G=e=>{E.innerHTML=e.map(e=>{let r=M.get(String(e.id))||e.notes||``;return`
          <div class="pond-documentation-item" data-pond-documentation-item="${e.id}" data-pond-documentation-url="${n(e.image_url)}" data-pond-documentation-media-type="${n(e.media_type||`image`)}" data-pond-documentation-thumb="${n(e.thumbnail_url||``)}">
            <button class="btn btn-sm btn-danger pond-documentation-delete" type="button" data-delete-pond-documentation="${e.id}" data-role-required="farm-operate">Hapus</button>
            <label class="m-0" style="position:absolute;top:8px;left:8px;z-index:2;padding:4px 6px;line-height:1;border-radius:4px;background:rgba(0,0,0,.55)" data-role-required="farm-operate"><input class="form-check-input m-0" type="checkbox" data-doc-select="${e.id}" aria-label="Pilih dokumentasi" ${dmSel.has(String(e.id))?`checked`:``} /></label>
            <a class="pond-documentation-preview" href="${n(e.image_url)}" target="_blank" rel="noreferrer">
              ${e.media_type===`video`?`<video src="${n(e.image_url)}" preload="metadata"></video>`:`<img src="${n(e.image_url)}" alt="${n(t(e.display_name||`Dokumentasi kolam`))}" loading="lazy" />`}
            </a>
            <div class="pond-documentation-notes">
              <textarea class="form-control form-control-sm" name="pond_documentation_notes" rows="2" placeholder="Catatan dokumentasi" data-pond-documentation-notes="${e.id}" data-role-disable-unless="farm-operate">${n(r)}</textarea>
            </div>
          </div>
        `}).join(``)||`<div class="text-secondary">Belum ada dokumentasi.</div>`,dmBar()},K=async t=>{E.innerHTML=`<div class="text-secondary">Memuat dokumentasi.</div>`;try{let n=await fetch(`${e}/ponds/${t}/documentation`);if(!n.ok)throw Error(`Dokumentasi gagal dimuat`);G(await n.json())}catch{E.innerHTML=`<div class="text-danger">Dokumentasi gagal dimuat.</div>`}},ge=()=>Array.from(E.querySelectorAll(`[data-pond-documentation-item]`)).map(e=>{let t=e.querySelector(`[data-pond-documentation-notes]`);return{id:e.dataset.pondDocumentationItem,image_url:e.dataset.pondDocumentationUrl||``,media_type:e.dataset.pondDocumentationMediaType||`image`,notes:t?.value.trim()||M.get(e.dataset.pondDocumentationItem)||``}}).filter(e=>e.id&&e.image_url),q=(e,t)=>t===`koi_count`?H(e):t===`unphotographed_fish_qty`?Number(e.unphotographed_fish_qty||0):String(e[t]||``).toLowerCase(),_e=e=>[e.name,e.location].filter(Boolean).join(` `).toLowerCase(),ve=e=>{let q=pdSearchQuery;if(!q)return!0;let k=((mm)=>mm?mm.index:-1)(q.match(/(?:^|[\s,])ca(?:t(?:a(?:t(?:a(?:n)?)?)?)?)?\s*:/)),m=q,p=``;k>=0&&(m=q.slice(0,k),p=q.slice(q.indexOf(`:`,k)+1).trim());let h=_e(e),a=m.split(/,|\.(?!\d)/).map(s=>pdWords(s)).filter(w=>w.length);if(a.length&&!a.some(w=>w.every(x=>pdWordMatch(x,e,h))))return!1;if(p&&!String(e.notes||``).toLowerCase().includes(p))return!1;return!0},J=()=>P.filter(ve).sort((e,t)=>{let n=q(e,I.key),r=q(t,I.key),i=typeof n==`number`&&typeof r==`number`?n-r:n.localeCompare(r);return I.direction===`asc`?i:-i}),ye=e=>e.reduce((e,n)=>{let r=t(n.location);return e.has(r)||e.set(r,[]),e.get(r).push(n),e},new Map),be=()=>Array.from(new Set(P.map(e=>t(e.location)))),xe=e=>{let n=t(e).trim();if(!n)return``;if(/^(data:|blob:|https?:\/\/)/i.test(n))return n;let r=window.KoiAuth?.apiUrl?window.KoiAuth.apiUrl(n):n;try{return new URL(r,window.location.origin).href}catch{return r}},Se=(e,t)=>{let r=xe(e);return r?`<img class="print-fish-photo" src="${n(r)}" alt="${n(t||`Foto ikan`)}" decoding="sync" />`:`<div class="print-fish-photo print-fish-photo-empty">No foto</div>`},Ce=()=>`
      <style>
        * {
          box-sizing: border-box;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        html,
        body {
          margin: 0 !important;
          padding: 0 !important;
          background: #ffffff !important;
          color: #111827 !important;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 11px;
          line-height: 1.35;
        }

        body {
          padding: 14px !important;
        }

        h1 {
          margin: 0 0 12px;
          color: #111827;
          font-size: 15px;
          font-weight: 800;
          letter-spacing: .01em;
          text-align: center;
        }

        .print-sheet {
          width: 100%;
          max-width: none;
          background: #ffffff;
        }

        .print-meta {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 8px;
          margin-bottom: 12px;
        }

        .print-meta-item {
          padding: 7px 9px;
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          background: #f8fafc;
        }

        .print-label {
          display: block;
          margin-bottom: 3px;
          color: #64748b;
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .print-value {
          color: #111827;
          font-size: 11px;
          font-weight: 700;
          word-break: break-word;
        }

        .print-notes {
          margin: 0 0 12px;
          padding: 8px 9px;
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          background: #ffffff;
          color: #111827;
          white-space: pre-wrap;
        }

        .print-area-block {
          margin: 0 0 14px;
          break-inside: auto;
          page-break-inside: auto;
        }

        .print-area-title {
          margin: 0 0 6px;
          padding: 0;
          background: transparent;
          color: #475569;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .02em;
          text-transform: uppercase;
        }

        .print-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          background: #ffffff;
        }

        .print-table th,
        .print-table td {
          padding: 6px 7px;
          border: 1px solid #cbd5e1;
          background: #ffffff;
          color: #111827;
          vertical-align: top;
          word-break: break-word;
        }

        .print-table th {
          background: #f1f5f9;
          color: #334155;
          font-size: 9px;
          font-weight: 800;
          text-transform: uppercase;
        }

        .print-table tr {
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .print-fish-photo {
          display: block;
          width: 52px;
          height: 70px;
          object-fit: contain;
          border: 1px solid #cbd5e1;
          border-radius: 3px;
          background: #f8fafc;
        }

        .print-fish-photo-empty {
          display: flex;
          align-items: center;
          justify-content: center;
          color: #64748b;
          font-size: 9px;
          text-align: center;
        }

        @media print {
          @page {
            size: auto;
            margin: 10mm;
          }

          body {
            padding: 0 !important;
          }
        }
      </style>
    `,we=(e,t=8e3)=>{let n=Array.from(e.document.images||[]);return n.length?Promise.race([Promise.all(n.map(e=>e.complete&&e.naturalWidth>0?Promise.resolve():new Promise(t=>{let n=!1,r=()=>{n||(n=!0,t())};e.onload=r,e.onerror=r,typeof e.decode==`function`&&e.decode().then(r).catch(()=>{})}))),new Promise(e=>setTimeout(e,t))]):Promise.resolve()},Y=(e,t)=>{let r=window.open(``,`_blank`);if(!r){alert(`Jendela cetak gagal dibuka. Izinkan pop-up untuk mencetak.`);return}let i=n(e||`Cetak Nishikigoi`);r.document.open(),r.document.write(`<!doctype html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <base href="${n(window.location.origin)}/">
            <title>${i}</title>
            ${Ce()}
          </head>
          <body>${t}</body>
        </html>`),r.document.close(),r.focus(),we(r).then(()=>{setTimeout(()=>r.print(),150)})},Te=()=> {
      const ponds = J()
      if (!ponds.length) {
        alert('Belum ada data kolam untuk dicetak.')
        return
      }
      const kp = window.KoiPrint
      const e = kp.escapeHtml
      const groups = ye(ponds)
      const areas = X(Array.from(groups.keys()))
      const totalFish = ponds.reduce((sum, pond) => sum + Number(H(pond) || 0), 0)
      const body = areas.map((area) => {
        const items = groups.get(area) || []
        const areaFish = items.reduce((sum, pond) => sum + Number(H(pond) || 0), 0)
        return `<section class="kp-section"><h2>${e(area)} <span class="kp-muted">(${items.length} kolam, ${areaFish} ikan)</span></h2>
          <table class="kp-table"><thead><tr><th class="kp-center" style="width:28px">No</th><th style="width:28%">Nama Kolam</th><th class="kp-num" style="width:12%">Qty Total</th><th>Catatan</th></tr></thead>
          <tbody>${items.map((pond, index) => `<tr><td class="kp-center">${index + 1}</td><td><strong>${e(pond.name || '-')}</strong></td><td class="kp-num">${H(pond)}</td><td>${e(pond.notes || '-')}</td></tr>`).join('')}</tbody></table></section>`
      }).join('')
      kp.print({
        key: 'ponds-list',
        title: 'Daftar Kolam',
        heading: 'Daftar Kolam',
        info: [['Jumlah kolam', ponds.length], ['Jumlah area', areas.length], ['Total ikan', totalFish]],
        body,
      })
    },Ee=()=> {
      const pond = P.find((item) => String(item.id) === String(k))
      if (!pond) {
        alert('Pilih kolam terlebih dahulu.')
        return
      }
      const kp = window.KoiPrint
      const e = kp.escapeHtml
      const fish = V(pond.fish)
      const rows = fish.map((item, index) => `<tr>
          <td class="kp-center">${index + 1}</td>
          <td>${kp.photo(xe(item.image_url || item.photo_url || item.imageUrl || item.image || item.photo), item.code)}</td>
          <td><strong>${e(item.code || '-')}</strong></td>
          <td>${e(item.name || '-')}</td>
          <td>${e(item.variety || '-')}</td>
          <td>${e(item.bloodline || '-')}</td>
          <td>${e(item.farm_name || '-')}</td>
          <td class="kp-num">${item.current_length_cm ? `${kp.size(item.current_length_cm)} cm` : '-'}</td>
        </tr>`).join('') || '<tr><td colspan="8" class="kp-muted">Belum ada ikan tercatat di Data Ikan untuk kolam ini.</td></tr>'
      kp.print({
        key: 'ponds-detail',
        title: `Isi Kolam ${pond.name || ''}`,
        heading: 'Daftar Ikan dalam Kolam',
        subheading: pond.name || '',
        info: [['Nama Kolam', pond.name], ['Area', pond.location], ['Ikan terdata', fish.length], ['Manual', Number(pond.unphotographed_fish_qty || 0)], ['Qty Total', H(pond)]],
        notes: pond.notes || '',
        body: `<table class="kp-table"><thead><tr>
          <th class="kp-center" style="width:28px">No</th><th class="kp-center" style="width:48px">Foto</th><th style="width:13%">Kode</th><th>Nama</th>
          <th style="width:15%">Varietas</th><th style="width:13%">Bloodline</th><th style="width:17%">Ternakan</th><th class="kp-num" style="width:10%">Ukuran</th>
        </tr></thead><tbody>${rows}</tbody></table>`,
      })
    },X=e=>{let t=new Set(e),n=F.filter(e=>t.has(e)),r=e.filter(e=>!n.includes(e)).sort((e,t)=>e.localeCompare(t));return[...n,...r]},De=n=>{F=n,localStorage.setItem(`pondAreaOrder`,JSON.stringify(F)),fetch(`${e}/app-settings`,{method:`PATCH`,headers:{"content-type":`application/json`},body:JSON.stringify({pond_area_order:JSON.stringify(n)})}).catch(()=>{}),Z(),Q()},Z=()=>{let e=X(be());ee.innerHTML=e.map((t,r)=>`
        <div class="list-group-item d-flex align-items-center justify-content-between gap-2">
          <div class="fw-medium">${n(t)}</div>
          <div class="btn-list flex-nowrap">
            <button class="btn btn-sm btn-icon" type="button" data-move-area="up" data-area-name="${n(t)}" ${r===0?`disabled`:``} aria-label="Naik" title="Naik">↑</button>
            <button class="btn btn-sm btn-icon" type="button" data-move-area="down" data-area-name="${n(t)}" ${r===e.length-1?`disabled`:``} aria-label="Turun" title="Turun">↓</button>
          </div>
        </div>
      `).join(``)||`<div class="list-group-item text-secondary">Belum ada area.</div>`},Q=()=>{pdDock.prune(P);let e=pdDock.apply(J());if(e.length===0){r.innerHTML=`<div class="col-12 text-secondary">${pdSearchQuery?`Data kolam tidak ditemukan.`:`Belum ada data kolam.`}</div>`,pdDock.refresh();return}let i=ye(e);r.innerHTML=X(Array.from(i.keys())).map(ar=>`<div class="col-12"><div class="pond-area-heading${/^#[0-9a-f]{6}$/i.test((window.pdAreaColors||{})[ar]||``)?` has-color`:``}"${/^#[0-9a-f]{6}$/i.test((window.pdAreaColors||{})[ar]||``)?` style="--area-color:${window.pdAreaColors[ar]}"`:``}>${n(ar)}</div></div>${(i.get(ar)||[]).map(e=>{let st=oe[e.status]||{label:t(e.status),className:`bg-secondary-lt`};return`<div class="col-sm-6 col-lg-4 col-xl-3" data-search-text="${n(_e(e))}"><div class="card h-100 pond-card${/^#[0-9a-f]{6}$/i.test((window.pdAreaColors||{})[ar]||``)?` has-area-color`:``}"${/^#[0-9a-f]{6}$/i.test((window.pdAreaColors||{})[ar]||``)?` style="--area-color:${window.pdAreaColors[ar]}"`:``} data-dock-id="${n(e.id)}"><div class="pond-card-stat" data-dock-select title="Klik untuk memilih"><div class="pond-card-qty">${H(e)}</div><div class="text-secondary small">Qty Total</div></div><div class="card-body" role="button" tabindex="0" data-pond-row="${n(e.id)}"><div class="d-flex align-items-start justify-content-between gap-2 mb-2"><div class="fw-semibold pond-card-ellipsis" title="${n(t(e.name))}">${n(t(e.name))}</div><div class="d-flex align-items-center gap-1 flex-shrink-0"><span class="badge bg-blue text-blue-fg dock-selected-badge">Terpilih</span><span class="badge ${st.className}">${n(st.label)}</span></div></div><div class="row g-2 small"><div class="col-6"><span class="text-secondary">Terfoto</span><div>${Number(e.koi_count||0)}</div></div><div class="col-6"><span class="text-secondary">Manual</span><div>${Number(e.unphotographed_fish_qty||0)}</div></div><div class="col-12"><span class="text-secondary">Catatan</span>${e.notes_date?`<div style="font-size:.75rem;color:var(--tblr-secondary)">${n(ndFmt(e.notes_date))}</div>`:``}<div class="pond-card-notes">${n(t(e.notes))}</div></div></div><div class="pond-card-actions"><button class="btn btn-sm btn-icon btn-outline-primary" type="button" data-edit-pond="${n(e.id)}" data-role-required="farm-operate" aria-label="Edit kolam" title="Edit kolam">${window.KoiDock.icon(`edit`)}</button></div></div></div></div>`}).join(``)}`).join(``),pdDock.refresh()},$=async(t=!1)=>{t||(r.innerHTML=`<div class="col-12 text-secondary">Memuat data kolam.</div>`);try{let n=await fetch(`${e}/ponds`);if(!n.ok)throw Error(`API kolam belum siap`);let r=await n.json();try{let s1=await fetch(`${e}/app-settings`);if(s1.ok){let s2=await s1.json(),s3=typeof s2.pond_area_order==`string`?JSON.parse(s2.pond_area_order):null;try{let pc=typeof s2.pond_area_colors==`string`?JSON.parse(s2.pond_area_colors):null;window.pdAreaColors=pc&&typeof pc==`object`?pc:{}}catch{window.pdAreaColors={}}Array.isArray(s3)&&(F=s3,localStorage.setItem(`pondAreaOrder`,JSON.stringify(s3)))}}catch{}let i=JSON.stringify(r),k=i+`|`+JSON.stringify(F)+`|`+JSON.stringify(window.pdAreaColors||{});if(t&&k===j)return;j=k,localStorage.setItem(L,i),P=r,Z(),Q()}catch{t||(r.innerHTML=`<div class="col-12 text-danger">Data kolam gagal dimuat. Pastikan API berjalan.</div>`)}},Oe=()=>{try{let e=JSON.parse(localStorage.getItem(L)||`[]`);return!Array.isArray(e)||e.length===0?!1:(j=JSON.stringify(e),P=e,Z(),Q(),!0)}catch{return localStorage.removeItem(L),!1}},ke=()=>{A=null,f.reset(),m.textContent=`Formulir Tambah Kolam`,ne.textContent=`Simpan Kolam`,p.textContent=``},Ae=e=>{let t=P.find(t=>String(t.id)===String(e));t&&(A=t.id,f.elements.name.value=t.name||``,f.elements.location.value=t.location||``,f.elements.status.value=t.status||`kosong`,f.elements.notes.value=t.notes||``,m.textContent=`Formulir Edit Kolam`,ne.textContent=`Simpan Perubahan`,p.textContent=``,R(h))};document.querySelectorAll(`[data-sort-key]`).forEach(e=>{e.addEventListener(`click`,()=>{let t=e.dataset.sortKey;I={key:t,direction:I.key===t&&I.direction===`asc`?`desc`:`asc`},(()=>{try{sessionStorage.setItem(`nishikigoi-view:farm-ponds`,JSON.stringify(I))}catch{}})(),Q()})}),o.addEventListener(`click`,()=>{Z(),R(s)}),ee.addEventListener(`click`,e=>{let t=e.target.closest(`[data-move-area]`);if(!t)return;let n=X(be()),r=n.indexOf(t.dataset.areaName),i=t.dataset.moveArea===`up`?r-1:r+1;if(r<0||i<0||i>=n.length)return;let[a]=n.splice(r,1);n.splice(i,0,a),De(n)}),te.addEventListener(`click`,()=>{De([])});var fsSel=new Set,fsAll=document.querySelector(`[data-fish-select-all]`),fsTarget=document.querySelector(`[data-fish-move-target]`),fsBtn=document.querySelector(`[data-fish-move-button]`),fsPond=()=>P.find(pd=>String(pd.id)===String(k)),fsBar=pd=>{let c=fsSel.size,total=V(pd.fish).length;ae.querySelectorAll(`[data-fish-select]`).forEach(bx=>{bx.closest(`tr`).classList.toggle(`table-active`,bx.checked)});fsAll.checked=total>0&&c===total,fsAll.indeterminate=c>0&&c<total,fsBtn.textContent=c?`Pindahkan (${c})`:`Pindahkan`;let keep=fsTarget.value,byArea=new Map;P.filter(o=>String(o.id)!==String(pd.id)).forEach(o=>{let ar=o.location||`Tanpa Area`;byArea.set(ar,[...(byArea.get(ar)||[]),o])}),fsTarget.innerHTML=`<option value="">Pindah ke kolam...</option>`+X(Array.from(byArea.keys())).map(ar=>`<optgroup label="${n(ar)}">${byArea.get(ar).sort((x,y)=>String(x.name).localeCompare(String(y.name),`id`,{numeric:!0})).map(o=>`<option value="${o.id}">${t(o.name)}</option>`).join(``)}</optgroup>`).join(``),fsTarget.value=keep&&fsTarget.querySelector(`option[value="${keep}"]`)?keep:``,fsBtn.disabled=!c||!fsTarget.value},fsRender=n=>{let r=V(n.fish);re.textContent=`Formulir Kolam ${t(n.name)}`,ie.innerHTML=`
        <div class="col-sm-6 col-lg-3"><span class="text-secondary">Nama Kolam</span><div>${t(n.name)}</div></div>
        <div class="col-sm-6 col-lg-3"><span class="text-secondary">Area</span><div>${t(n.location)}</div></div>
        <div class="col-sm-6 col-lg-3" data-print-hidden><span class="text-secondary">Status</span><div>${oe[n.status]?.label||t(n.status)}</div></div>
        <div class="col-sm-6 col-lg-3"><span class="text-secondary">Qty Total</span><div>${H(n)}</div></div>
        <div class="col-sm-6 col-lg-3" data-print-hidden><span class="text-secondary">Terfoto / Manual</span><div>${Number(n.koi_count||0)} / ${Number(n.unphotographed_fish_qty||0)}</div></div>
      `,ae.innerHTML=r.map(e=>`
        <tr style="cursor: pointer">
          <td data-role-required="database-write"><input class="form-check-input" type="checkbox" data-fish-select="${e.id}" aria-label="Pilih ${t(e.code)}" ${fsSel.has(String(e.id))?`checked`:``}></td>
          <td>${me(e)}</td>
          <td>${t(e.code)}</td>
          <td>${t(e.name)}</td>
          <td>${t(e.variety)}</td>
          <td>${t(e.bloodline)}</td>
          <td>${t(e.farm_name)}</td>
          <td>${e.current_length_cm?`${zzSize(e.current_length_cm)} cm`:`-`}</td>
        </tr>
      `).join(``)||`<tr><td colspan="8" class="text-secondary">Belum ada ikan tercatat di Data Ikan untuk kolam ini.</td></tr>`,fsBar(n)},je=e=>{let n=P.find(t=>String(t.id)===String(e));if(!n)return;k=n.id,fsSel.clear(),dmSel.clear(),_.elements.unphotographed_fish_qty.value=Number(n.unphotographed_fish_qty||0),_.elements.status.value=n.status||`kosong`,_.elements.notes.value=n.notes||``,ndSet(n.notes_date,!0),ndTouched=!1,v.textContent=``,fsRender(n),R(g),W(n.id),K(n.id)};ae.addEventListener(`change`,ev=>{let bx=ev.target.closest(`[data-fish-select]`),pd=fsPond();bx&&pd&&(bx.checked?fsSel.add(bx.dataset.fishSelect):fsSel.delete(bx.dataset.fishSelect),fsBar(pd))}),ae.addEventListener(`click`,ev=>{if(ev.target.closest(`[data-fish-select]`))return;let pv=ev.target.closest(`.pond-fish-preview`),ph=pv&&pv.querySelector(`img`);if(ph){{let zi=null;try{zi=JSON.parse(decodeURIComponent(ph.dataset.zoomInfo||``))}catch(zx){}window.KoiAuth.zoomPhoto(ph.src,zi?.title||ph.alt,zi?.lines||[])};return}let bx=ev.target.closest(`tr`)?.querySelector(`[data-fish-select]`);if(!bx||bx.offsetParent===null||String(window.getSelection()))return;bx.checked=!bx.checked,bx.dispatchEvent(new Event(`change`,{bubbles:!0}))}),fsAll.addEventListener(`change`,()=>{let pd=fsPond();pd&&(fsSel.clear(),fsAll.checked&&V(pd.fish).forEach(o=>fsSel.add(String(o.id))),ae.querySelectorAll(`[data-fish-select]`).forEach(bx=>{bx.checked=fsSel.has(bx.dataset.fishSelect)}),fsBar(pd))}),fsTarget.addEventListener(`change`,()=>{fsBtn.disabled=!fsSel.size||!fsTarget.value}),fsBtn.addEventListener(`click`,async()=>{let pd=fsPond(),tg=P.find(o=>String(o.id)===String(fsTarget.value)),ids=Array.from(fsSel);if(!pd||!tg||!ids.length)return;fsBtn.disabled=!0,v.textContent=`Memindahkan ${ids.length} ikan ke ${tg.name}.`;let failed=[];for(let st=0;st<ids.length;st+=5)await Promise.all(ids.slice(st,st+5).map(async id=>{try{let rs=await fetch(`/api/koi/${id}`,{method:`PATCH`,headers:{"content-type":`application/json`},body:JSON.stringify({pond_id:tg.id})});if(!rs.ok)throw Error(`gagal`)}catch{failed.push(id)}}));fsSel.clear(),failed.forEach(id=>fsSel.add(id)),await $(!0);let nw=fsPond();nw&&fsRender(nw),fsTarget.value=``,nw&&fsBar(nw);let mv=ids.length-failed.length;v.textContent=failed.length?`${mv} ikan dipindah ke ${tg.name}, ${failed.length} gagal (dipilih ulang).`:`${mv} ikan dipindah ke ${tg.name}.`});document.addEventListener(`click`,e=>{let t=e.target.closest(`[data-bs-toggle="modal"]`),n=e.target.closest(`[data-bs-dismiss="modal"]`);if(t){let e=document.querySelector(t.dataset.bsTarget);e&&R(e)}if(n){let e=n.closest(`.modal`);e&&z(e)}}),i.addEventListener(`click`,Te),a.forEach(e=>{e.addEventListener(`click`,Ee)}),window.addEventListener(`afterprint`,()=>{document.body.classList.remove(`printing-pond-detail`),document.body.classList.remove(`printing-pond-list`)}),(()=>{
const pondExcelColumns = ['Area', 'Nama Kolam', 'Status', 'Terfoto', 'Manual', 'Qty Total', 'Tanggal Catatan', 'Catatan']
const pondStatusFromText = (value) => {
  const typed = String(value || '').trim().toLowerCase()
  if (typed === 'aktif' || typed === 'active') return 'active'
  if (typed === 'kosong' || typed === 'perbaikan') return typed
  return ''
}
// 2026-01-26, 26/01/2026 and "26 - [1] Januari - 2026" all become 2026-01-26; anything else becomes ''.
const pondNoteDateFromText = (value) => window.KoiAuth.dateFromText(value)

const exportPondsZip = async (ids) => {
      if (!P.length) {
        d.textContent = 'Belum ada data kolam untuk diexport.'
        return
      }
      const chosen = ids.length ? J().filter((pond) => ids.includes(String(pond.id))) : J()
      const progress = window.KoiZip.progress('Unduh ZIP Data Kolam')
      try {
        const response = await fetch('/api/pond-documentation')
        const everything = response.ok ? await response.json() : []
        const byPond = new Map()
        everything.forEach((doc) => {
          const list = byPond.get(String(doc.pond_id)) || []
          list.push({ type: doc.media_type === 'video' ? 'video' : 'image', url: doc.image_url, name: '', notes: doc.notes || '' })
          byPond.set(String(doc.pond_id), list)
        })
        const rows = chosen.map((pond) => [
          pond.location || '',
          pond.name || '',
          oe[pond.status]?.label || pond.status || 'Kosong',
          Number(pond.koi_count || 0),
          Number(pond.unphotographed_fish_qty || 0),
          H(pond),
          pond.notes_date ? String(pond.notes_date).slice(0, 10) : '',
          pond.notes || '',
        ])
        const result = await window.KoiZip.exportPackage({
          sheetName: 'Data Kolam',
          header: pondExcelColumns,
          rows,
          keyHeader: 'Nama Kolam',
          xlsxName: 'data-kolam.xlsx',
          docs: chosen.map((pond) => ({ key: pond.name || String(pond.id), media: byPond.get(String(pond.id)) || [] })),
          onProgress: (text) => progress.set(text),
        })
        window.KoiZip.download(result.blob, `zip-kolam-${window.KoiZip.today()}.zip`)
        window.KoiDock.showResult('Unduh ZIP Data Kolam', `Selesai: ${chosen.length} kolam, ${result.photos} foto, ${result.videos} video.`, result.problems)
      } catch (error) {
        window.KoiDock.showResult('Unduh ZIP Data Kolam', error.message || 'ZIP gagal dibuat.')
      } finally {
        progress.close()
      }
    }
    window.koiPondsZip = exportPondsZip

    l.addEventListener('click', async () => {
  d.textContent = 'Menyiapkan export Excel data kolam.'
  l.disabled = true

  try {
    if (!P.length) {
      throw new Error('Belum ada data kolam untuk diexport.')
    }
    if (!window.XLSX) {
      throw new Error('Pustaka Excel belum termuat. Muat ulang halaman.')
    }

    const rows = J().map((pond) => [
      pond.location || '',
      pond.name || '',
      oe[pond.status]?.label || pond.status || 'Kosong',
      Number(pond.koi_count || 0),
      Number(pond.unphotographed_fish_qty || 0),
      H(pond),
      pond.notes_date ? String(pond.notes_date).slice(0, 10) : '',
      pond.notes || '',
    ])
    const sheet = XLSX.utils.aoa_to_sheet([pondExcelColumns, ...rows])
    sheet['!cols'] = pondExcelColumns.map((column) => ({ wch: Math.max(14, column.length + 2) }))
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, sheet, 'Data Kolam')
    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const link = document.createElement('a')
    const objectUrl = URL.createObjectURL(blob)

    link.href = objectUrl
    link.download = `data-kolam-${new Date().toISOString().slice(0, 10)}.xlsx`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    d.textContent = 'Ekspor Excel data kolam selesai.'
  } catch (error) {
    d.textContent = error.message
  } finally {
    l.disabled = false
  }
})

c.addEventListener('click', () => {
  u.click()
})

u.addEventListener('change', async () => {
      let [file] = Array.from(u.files || [])

      if (!file) {
        return
      }

      c.disabled = true
      d.textContent = 'Membaca file import.'
      let progress = null

      // A pond whose name already exists is updated (only the columns that are filled in); a new name creates a pond.
      // Mass input works in two passes: the file is checked and shown as a preview first (nothing is written),
      // and only after "Lanjutkan" it is saved. A ZIP also adds the documentation (see zip-kit.js).
      const pondsFromFile = async (source) => {
        let records
        if (/\.csv$/i.test(source.name)) {
          records = ue(await ce(source))
        } else {
          if (!window.XLSX) {
            throw new Error('Pustaka Excel belum termuat. Muat ulang halaman.')
          }
          const workbook = XLSX.read(await source.arrayBuffer(), { type: 'array', cellDates: true, dateNF: 'yyyy-mm-dd' })
          const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '', raw: false })
          records = rawRows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [String(key).trim().toLowerCase(), value])))
        }

        return records.map((record) => ({
          name: String(record['nama kolam'] ?? record.nama ?? record.name ?? '').trim(),
          location: String(record.area ?? record.lokasi ?? record.location ?? '').trim(),
          status: pondStatusFromText(record.status),
          unphotographed: String(record['manual'] ?? record['belum difoto'] ?? record.unphotographed_fish_qty ?? '').trim(),
          notesDate: pondNoteDateFromText(record['tanggal catatan']),
          notes: String(record.catatan ?? record.notes ?? '').trim(),
          docsCell: String(record.dokumentasi ?? '').trim(),
        }))
      }

      const runPondsImport = async (items, pkg, dryRun) => {
        const problems = []
        let inserted = 0
        let updated = 0
        let skipped = 0
        let docsAdded = 0
        let docsSkipped = 0
        let docsPlanned = 0
        const seen = new Set()

        // Documentation from the ZIP is added to the pond (the server skips files the pond already has).
        const attachDocs = async (pondId, name, docs) => {
          d.textContent = `Mengupload dokumentasi ${name} (${docs.length})`
          progress?.set(`${name}: ${docs.length} dokumentasi`)
          const result = await window.KoiZip.addPondDocs(pondId, docs)
          docsAdded += result.added
          docsSkipped += result.skipped
          problems.push(...result.problems.map((message) => `${name}: ${message}`))
        }

        for (const [index, item] of items.entries()) {
          const line = index + 2
          if (!item.name) {
            skipped += 1
            problems.push(`Baris ${line}: Nama Kolam kosong, dilewati`)
            continue
          }
          const lowered = item.name.toLowerCase()
          if (seen.has(lowered)) {
            skipped += 1
            problems.push(`Baris ${line} (${item.name}): nama kolam kembar di file, dilewati`)
            continue
          }
          seen.add(lowered)
          if (pkg) pkg.markUsed(item.name)

          d.textContent = `${dryRun ? 'Memeriksa' : 'Mengimport'} ${index + 1}/${items.length}: ${item.name}`
          const existing = P.find((pond) => String(pond.name || '').trim().toLowerCase() === lowered)
          const fields = {}
          if (item.location) fields.location = item.location
          if (item.status) fields.status = item.status
          if (item.unphotographed !== '') fields.unphotographed_fish_qty = Math.max(0, Number(item.unphotographed) || 0)
          if (item.notes) fields.notes = item.notes
          if (item.notesDate) fields.notes_date = item.notesDate
          // Dokumentasi cell: folder(s) of the ZIP and/or @ID of media that is already in the Galeri
          let docs = null
          if (pkg) {
            const found = await pkg.docsForRow(item.docsCell, item.name)
            docs = found.docs
            problems.push(...found.problems.map((message) => `Baris ${line} (${item.name}): ${message}`))
          }
          const hasDocs = Boolean(docs && docs.length)
          if (hasDocs) docsPlanned += docs.length

          if (existing && Object.keys(fields).length === 0 && !hasDocs) {
            skipped += 1
            continue
          }
          if (dryRun) {
            if (!existing) inserted += 1
            else if (Object.keys(fields).length) updated += 1
            continue
          }

          try {
            if (existing) {
              if (Object.keys(fields).length === 0) {
                await attachDocs(existing.id, item.name, docs)
                continue
              }
              const response = await fetch(`/api/ponds/${existing.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(fields) })
              if (response.ok) {
                updated += 1
                if (hasDocs) await attachDocs(existing.id, item.name, docs)
              } else {
                skipped += 1
                problems.push(`Baris ${line} (${item.name}): gagal diperbarui`)
              }
            } else {
              const response = await fetch('/api/ponds', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ name: item.name, location: item.location, status: item.status || 'kosong', unphotographed_fish_qty: fields.unphotographed_fish_qty || 0, notes: item.notes }),
              })
              if (response.ok) {
                inserted += 1
                const created = item.notesDate || hasDocs ? await response.json().catch(() => null) : null
                if (created?.id && item.notesDate) await fetch(`/api/ponds/${created.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ notes_date: item.notesDate }) })
                if (created?.id && hasDocs) await attachDocs(created.id, item.name, docs)
              } else {
                skipped += 1
                problems.push(`Baris ${line} (${item.name}): gagal disimpan`)
              }
            }
          } catch {
            skipped += 1
            problems.push(`Baris ${line} (${item.name}): gagal disimpan`)
          }
        }

        if (pkg) {
          for (const key of pkg.unusedKeys()) problems.push(`Folder dokumentasi "${key}" tidak dipakai: tidak ada baris data yang memakainya`)
        }
        return { inserted, updated, skipped, docsAdded, docsSkipped, docsPlanned, problems }
      }

      try {
        progress = window.KoiZip.progress('Memeriksa file Data Kolam')
        let pkg = null
        const packageProblems = []
        if (/\.zip$/i.test(file.name)) {
          pkg = await window.KoiZip.readPackage(file)
          file = pkg.xlsxFile
          packageProblems.push(...pkg.problems)
        } else {
          pkg = await window.KoiZip.plainPackage()
        }
        const items = await pondsFromFile(file)

        if (items.length === 0) {
          throw new Error('File tidak berisi data kolam. Kolom yang dikenali: Area, Nama Kolam, Status, Manual, Tanggal Catatan, Catatan.')
        }

        // pass 1: check everything, write nothing
        const plan = await runPondsImport(items, pkg, true)
        progress.close()
        progress = null
        const planProblems = [...packageProblems, ...plan.problems]
        if (!plan.inserted && !plan.updated && !plan.docsPlanned) {
          d.textContent = 'Tidak ada data kolam yang bisa diimport.'
          window.KoiDock.showResult('Impor Data Kolam', 'Tidak ada data yang bisa diimport.', planProblems)
          return
        }
        const preview = `Kolam baru: ${plan.inserted}\nKolam diperbarui: ${plan.updated}` +
          (pkg.isZip || plan.docsPlanned ? `\nDokumentasi: ${plan.docsPlanned} file (yang sudah ada dilewati otomatis)` : '') +
          (planProblems.length ? '\nBaris atau file bermasalah dilewati.' : '')
        const go = await window.KoiDock.showResult('Pratinjau import Data Kolam', preview, planProblems, { confirm: true, okLabel: planProblems.length ? 'Lanjutkan (lewati yang bermasalah)' : 'Lanjutkan' })
        if (!go) {
          d.textContent = 'Impor dibatalkan.'
          return
        }

        // pass 2: write
        progress = window.KoiZip.progress('Impor Data Kolam')
        const result = await runPondsImport(items, pkg, false)
        const summary = `Impor selesai. Baru ${result.inserted}, diperbarui ${result.updated}, dilewati ${result.skipped}.${pkg.isZip || result.docsPlanned ? ` Dokumentasi ditambahkan ${result.docsAdded}, sudah ada ${result.docsSkipped}.` : ''}`
        d.textContent = summary
        window.KoiDock.showResult('Impor Data Kolam', summary, [...packageProblems, ...result.problems])
        await D($)
      } catch (error) {
        d.textContent = error.message || 'Impor gagal.'
      } finally {
        progress?.close()
        u.value = ''
        c.disabled = false
      }
    })
})(),document.addEventListener(`keydown`,e=>{e.key===`Escape`&&B()}),r.addEventListener(`click`,async e=>{let t=e.target.closest(`[data-edit-pond]`);if(t){Ae(t.dataset.editPond);return}let sa=e.target.closest(`[data-dock-select]`);if(sa){pdDock.toggle(sa.closest(`[data-dock-id]`).dataset.dockId);return}let n=e.target.closest(`[data-pond-row]`);if(n&&!e.target.closest(`button, input`)){je(n.dataset.pondRow);return}}),x.addEventListener(`click`,async()=>{if(!k)return;let n=P.find(e=>String(e.id)===String(k));if((await window.KoiDialog.confirm(`Hapus ${t(n?.name)}?`))){x.disabled=!0,x.textContent=`Menghapus`,v.textContent=``;try{let t=await fetch(`${e}/ponds/${k}`,{method:`DELETE`});if(!t.ok){let e=await t.json().catch(()=>({}));throw Error(e.error||`Kolam gagal dihapus.`)}z(g),k=null,await D($)}catch(e){v.textContent=e.message}finally{x.disabled=!1,x.textContent=`Hapus Kolam`}}});var Me=async(e=`clipboard-pond`)=>{if(!navigator.clipboard?.read)throw Error(`Browser belum mengizinkan baca clipboard gambar.`);let t=await navigator.clipboard.read();for(let n of t){let t=n.types.find(e=>e.startsWith(`image/`));if(!t)continue;let r=await n.getType(t),i=t.split(`/`)[1]||`png`;return new File([r],`${e}.${i}`,{type:t})}throw Error(`Clipboard tidak berisi gambar.`)},Ne=async t=>{if(k){if(t=Array.from(t||[]).filter(e=>e.type.startsWith(`image/`)||e.type.startsWith(`video/`)),t.length===0){T.textContent=`0/0`;return}C.classList.add(`disabled`),C.setAttribute(`aria-disabled`,`true`),T.innerHTML=`<div class="small text-secondary mb-1"><span data-upload-progress-label>0/${t.length}</span></div><div class="progress progress-sm"><div class="progress-bar progress-bar-indeterminate"></div></div>`;try{let n=0;for(let r of t){let i=r.type.startsWith(`video/`);T.querySelector(`[data-upload-progress-label]`).textContent=`${n+1}/${t.length} - Memproses ${r.name}`;let a=i?await U(r):await pe(r);if(T.querySelector(`[data-upload-progress-label]`).textContent=`${n+1}/${t.length} - Mengupload ${r.name}`,i){let t=await fe(r),i=await fetch(`${e}/videos`,{method:`POST`,headers:{"content-type":`application/json`},body:JSON.stringify({prefix:`pond-doc-video`,video_data:a,thumbnail_data:t})});if(!i.ok){let e=await i.json().catch(()=>({}));throw Error(e.detail||e.error||`Video gagal diupload.`)}let o=await i.json();M.set(`video-${Date.now()}-${n}`,``),G([...ge(),{id:`video-${Date.now()}-${n}`,image_url:o.video_url,media_type:`video`,thumbnail_url:o.video_thumbnail_url||``,notes:``}]),n+=1;continue}let o=await fetch(`${e}/ponds/${k}/documentation`,{method:`POST`,headers:{"content-type":`application/json`},body:JSON.stringify({images:i?[]:[a],media:[{media_type:i?`video`:`image`,[i?`video_data`:`image_data`]:a}]})});if(!o.ok){let e=await o.json().catch(()=>({}));throw i&&o.status===422?Error(`Unggah video perlu restart aplikasi agar API terbaru aktif.`):Error(e.detail||e.error||`Dokumentasi gagal diupload.`)}n+=1}S.value=``,T.textContent=`${n}/${t.length} media selesai diupload.`,await K(k)}catch(e){T.textContent=e.message}finally{C.classList.remove(`disabled`),C.removeAttribute(`aria-disabled`)}}};S.addEventListener(`change`,async()=>{Ne(S.files).catch(e=>{T.textContent=e.message||`Dokumentasi gagal diupload.`})});const zzHasDraggedFiles=e=>[...e.dataTransfer?.types||[]].includes(`Files`);g.addEventListener(`dragover`,e=>{zzHasDraggedFiles(e)&&(e.preventDefault(),e.dataTransfer.dropEffect=`copy`,C.classList.add(`is-dragover`))}),g.addEventListener(`dragleave`,e=>{(e.target===g||!g.contains(e.relatedTarget))&&C.classList.remove(`is-dragover`)}),g.addEventListener(`drop`,e=>{if(C.classList.remove(`is-dragover`),!zzHasDraggedFiles(e))return;e.preventDefault(),window.KoiAuth?.canAccess?.(`farm-operate`)&&Ne(e.dataTransfer.files).catch(t=>{T.textContent=t.message||`Dokumentasi gagal diupload.`})}),w.addEventListener(`click`,async()=>{if(k){w.disabled=!0;try{await Ne([await Me()])}catch(e){T.textContent=e.message||`Paste gambar dokumentasi gagal.`}finally{w.disabled=!1}}}),E.addEventListener(`click`,async t=>{let pl=t.target.closest(`.pond-documentation-preview`);if(pl){t.preventDefault();let nt=pl.closest(`[data-pond-documentation-item]`)?.querySelector(`[data-pond-documentation-notes]`)?.value.trim();{let zp=P.find(zq=>String(zq.id)===String(k));window.KoiAuth.zoomPhoto(pl.getAttribute(`href`),zp?`Dokumentasi ${zp.name}`:`Dokumentasi kolam`,[zp&&zp.location?`Area: ${zp.location}`:``,nt?`Catatan: ${nt}`:``])};return}let n=t.target.closest(`[data-save-pond-documentation-notes]`);if(n&&k){let t=E.querySelector(`[data-pond-documentation-notes="${n.dataset.savePondDocumentationNotes}"]`)?.value||``;M.set(String(n.dataset.savePondDocumentationNotes),t),n.disabled=!0,n.textContent=`Menyimpan`,T.textContent=``;try{let r=await fetch(`${e}/ponds/${k}/documentation/${n.dataset.savePondDocumentationNotes}`,{method:`PATCH`,headers:{"content-type":`application/json`},body:JSON.stringify({notes:t})});if(!r.ok){let e=await r.json().catch(()=>({}));if(r.status===404){T.textContent=``,n.textContent=`Siap`,setTimeout(()=>{n.disabled=!1,n.textContent=`Simpan Catatan`},900);return}throw Error(e.detail||e.error||`Catatan dokumentasi gagal disimpan.`)}T.textContent=``,n.textContent=`Tersimpan`,setTimeout(()=>{n.disabled=!1,n.textContent=`Simpan Catatan`},900)}catch(e){T.textContent=e.message,n.disabled=!1,n.textContent=`Simpan Catatan`}return}let r=t.target.closest(`[data-delete-pond-documentation]`);if(!(!r||!k)){r.disabled=!0,r.textContent=`Pindah`,T.textContent=``;try{if(String(r.dataset.deletePondDocumentation||``).startsWith(`video-`)){r.closest(`[data-pond-documentation-item]`)?.remove(),T.textContent=``;return}let t=await fetch(`${e}/ponds/${k}/documentation/${r.dataset.deletePondDocumentation}`,{method:`DELETE`});if(!t.ok){let e=await t.json().catch(()=>({}));throw Error(e.detail||e.error||`Dokumentasi gagal dihapus.`)}T.textContent=``,await K(k)}catch(e){T.textContent=e.message,r.disabled=!1,r.textContent=`Hapus`}}}),E.addEventListener(`change`,ev=>{let bx=ev.target.closest(`[data-doc-select]`);bx&&(bx.checked?dmSel.add(bx.dataset.docSelect):dmSel.delete(bx.dataset.docSelect),dmBar())}),dmTarget.addEventListener(`change`,()=>{dmBtn.disabled=!dmSel.size||!dmTarget.value}),dmBtn.addEventListener(`click`,async()=>{let tg=P.find(o=>String(o.id)===String(dmTarget.value)),ids=Array.from(dmSel);if(!k||!tg||!ids.length)return;dmBtn.disabled=!0,T.textContent=`Memindahkan ${ids.length} dokumentasi ke ${tg.name}.`;ids.forEach(id=>{window.clearTimeout(dmTimers.get(id)),dmTimers.delete(id)});try{let rs=await fetch(`/api/ponds/${k}/documentation/move`,{method:`POST`,headers:{"content-type":`application/json`},body:JSON.stringify({target_pond_id:tg.id,items:ids.map(id=>M.has(id)?{id,notes:M.get(id)}:{id})})}),rj=await rs.json().catch(()=>({}));if(!rs.ok)throw Error(rj.detail||rj.error||`Dokumentasi gagal dipindah.`);ids.forEach(id=>M.delete(id)),dmSel.clear(),dmTarget.value=``,await K(k),T.textContent=`${rj.moved??ids.length} dokumentasi dipindah ke ${tg.name}.`}catch(er){T.textContent=er.message,dmBar()}}),dmGal.addEventListener(`click`,async()=>{let pd=P.find(o=>String(o.id)===String(k)),its=Array.from(E.querySelectorAll(`[data-pond-documentation-item]`)).filter(it=>dmSel.has(it.dataset.pondDocumentationItem));if(!pd||!its.length)return;dmGal.disabled=!0,T.textContent=`Menyimpan ke Galeri.`;let td=new Date,ttl=`Dokumentasi ${pd.name} ${window.KoiAuth.formatDate(td)}`;try{let rs=await fetch(`/api/gallery`,{method:`POST`,headers:{"content-type":`application/json`},body:JSON.stringify({pond_id:pd.id,title:ttl,gallery_date:`${td.getFullYear()}-${String(td.getMonth()+1).padStart(2,`0`)}-${String(td.getDate()).padStart(2,`0`)}`,images:its.map(it=>{let id=it.dataset.pondDocumentationItem,nt=it.querySelector(`[data-pond-documentation-notes]`)?.value.trim()||M.get(id)||``;return{image_url:it.dataset.pondDocumentationUrl,media_type:it.dataset.pondDocumentationMediaType||`image`,thumbnail_url:it.dataset.pondDocumentationThumb||``,notes:nt}})})}),rj=await rs.json().catch(()=>({}));if(!rs.ok)throw Error(rj.detail||rj.error||`Gagal menyimpan ke Galeri.`);dmSel.clear(),E.querySelectorAll(`[data-doc-select]`).forEach(bx=>{bx.checked=!1}),dmBar(),T.textContent=`${its.length} dokumentasi disimpan ke Galeri: ${ttl}.`}catch(er){T.textContent=er.message,dmBar()}}),dmSave=async(pondId,docId)=>{window.clearTimeout(dmTimers.get(docId)),dmTimers.delete(docId);if(!/^\d+$/.test(docId)||!M.has(docId))return;let val=M.get(docId);try{let rs=await fetch(`/api/ponds/${pondId}/documentation/${docId}`,{method:`PATCH`,headers:{"content-type":`application/json`},body:JSON.stringify({notes:val})});if(!rs.ok)throw Error(`gagal`);M.get(docId)===val&&M.delete(docId),String(k)===String(pondId)&&(T.textContent=`Catatan tersimpan.`)}catch{String(k)===String(pondId)&&(T.textContent=`Catatan belum tersimpan, coba lagi.`)}},E.addEventListener(`input`,ev=>{let nt=ev.target.closest(`[data-pond-documentation-notes]`);if(!nt)return;let id=String(nt.dataset.pondDocumentationNotes),pid=k;M.set(id,nt.value||``),window.clearTimeout(dmTimers.get(id)),dmTimers.set(id,window.setTimeout(()=>dmSave(pid,id),800))}),E.addEventListener(`focusout`,ev=>{let nt=ev.target.closest(`[data-pond-documentation-notes]`);nt&&dmSave(k,String(nt.dataset.pondDocumentationNotes))}),y.addEventListener(`click`,async()=>{if(k){let nd=ndValue();if(nd===null){v.textContent=`Tanggal catatan belum lengkap atau tidak valid. Isi tanggal, bulan (contoh [1] Januari), dan tahun.`;return}y.disabled=!0,y.textContent=`Menyimpan`,v.textContent=`Menyimpan catatan kolam.`;try{let t={...Object.fromEntries(new FormData(_).entries()),notes_date:nd,save_notes_only:!0},n=await fetch(`${e}/ponds/${k}`,{method:`PATCH`,headers:{"content-type":`application/json`},body:JSON.stringify(t)}),r=await n.json().catch(()=>({}));if(!n.ok)throw Error(r.error||`Catatan kolam gagal disimpan.`);let i=P.findIndex(e=>String(e.id)===String(k));i>=0&&r.pond&&(P[i]={...P[i],...r.pond}),v.textContent=`Catatan kolam berhasil disimpan.`,await W(k),await D($)}catch(e){v.textContent=e.message}finally{y.disabled=!1,y.textContent=`Simpan Catatan`}}}),_.addEventListener(`submit`,e=>e.preventDefault()),b.addEventListener(`click`,async t=>{let n=t.target.closest(`[data-delete-note-history]`);if(!(!n||!k)){n.disabled=!0,n.textContent=`Menghapus`;try{let t=await fetch(`${e}/ponds/${k}/note-history/${n.dataset.deleteNoteHistory}`,{method:`DELETE`});if(!t.ok){let e=await t.json().catch(()=>({}));throw Error(e.error||`History catatan gagal dihapus.`)}await W(k)}catch(e){n.disabled=!1,n.textContent=`Hapus`,v.textContent=e.message}}}),f.addEventListener(`submit`,async t=>{t.preventDefault(),p.textContent=A?`Menyimpan perubahan kolam.`:`Menyimpan data kolam.`;let n=Object.fromEntries(new FormData(f).entries()),r;try{r=await fetch(A?`${e}/ponds/${A}`:`${e}/ponds`,{method:A?`PATCH`:`POST`,headers:{"content-type":`application/json`},body:JSON.stringify(n)})}catch{p.textContent=`API tidak terhubung. Pastikan backend berjalan di ${e}.`;return}if(!r.ok){let e=await r.json().catch(()=>({}));p.textContent=e.detail?`${e.error||`Kolam gagal disimpan.`}: ${e.detail}`:e.error||`Kolam gagal disimpan.`;return}let i=A?`Kolam berhasil diperbarui.`:`Kolam berhasil disimpan.`;A?(p.textContent=i,D($)):(ke(),p.textContent=i,D($),z(h))}),h.addEventListener(`hidden.bs.modal`,()=>{ke()}),pdDelete=async ids=>{let nm=ids.map(id=>P.find(o=>String(o.id)===String(id))?.name).filter(Boolean);if(!(await window.KoiDialog.confirm(`Hapus ${ids.length} kolam (${nm.join(`, `)})?`)))return;let fl=[];for(let id of ids)try{let rs=await fetch(`/api/ponds/${id}`,{method:`DELETE`});rs.ok||fl.push(id)}catch{fl.push(id)}pdDock.clear(),await D($),fl.length&&alert(`${fl.length} kolam gagal dihapus.`)},pdSortLabel=()=>I.direction===`asc`?`A/Z`:`Z/A`,pdSortTitle=()=>I.direction===`asc`?`Urutan A ke Z (klik untuk Z ke A)`:`Urutan Z ke A (klik untuk A ke Z)`,pdBulkNote=(()=>{
// Catatan masal: the same text is added as a new line to the Catatan Formulir of every selected pond.
const openPondBulkNote = (ids) => {
  document.querySelector('[data-pond-bulk-note]')?.remove()
  const overlay = document.createElement('div')
  overlay.setAttribute('data-pond-bulk-note', '')
  overlay.style.cssText = 'position:fixed;inset:0;z-index:4900;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.6)'
  overlay.innerHTML = `
    <div class="card" style="max-width:30rem;width:100%">
      <div class="card-header"><h3 class="card-title">Catatan Masal (${ids.length} kolam)</h3><div class="card-actions"><button type="button" class="btn-close" data-bulk-cancel aria-label="Tutup"></button></div></div>
      <div class="card-body">
        <label class="form-label" for="pond-bulk-note-text">Catatan yang ditambahkan ke Catatan Formulir kolam terpilih</label>
        <textarea class="form-control" id="pond-bulk-note-text" rows="4" data-bulk-text></textarea>
        <label class="form-check mt-3 mb-0"><input class="form-check-input" type="checkbox" data-bulk-replace /><span class="form-check-label">Ganti catatan (hapus catatan yang sudah ada)</span></label>
            <div class="form-hint mt-2" data-bulk-hint></div>
        <div class="text-danger small mt-2" data-bulk-error></div>
      </div>
      <div class="card-footer d-flex justify-content-end gap-2"><button type="button" class="btn" data-bulk-cancel>Batal</button><button type="button" class="btn btn-primary" data-bulk-save>Tambahkan</button></div>
    </div>`
  const close = () => overlay.remove()
      const replaceBox = overlay.querySelector('[data-bulk-replace]')
      const syncMode = () => {
        const replace = replaceBox.checked
        const button = overlay.querySelector('[data-bulk-save]')
        button.textContent = replace ? 'Ganti' : 'Tambahkan'
        button.classList.toggle('btn-danger', replace)
        button.classList.toggle('btn-primary', !replace)
        overlay.querySelector('[data-bulk-hint]').textContent = replace
          ? 'Semua catatan yang sudah ada pada kolam terpilih akan DIHAPUS dan diganti dengan teks ini. Tanggal catatan kolam menjadi hari ini.'
          : 'Ditambahkan di paling atas, dipisah garis, dan catatan lama tetap ada di bawahnya (tidak dihapus). Tanggal catatan kolam menjadi hari ini.'
      }
      replaceBox.addEventListener('change', syncMode)
      syncMode()
      overlay.addEventListener('click', async (event) => {
        if (event.target === overlay || event.target.closest('[data-bulk-cancel]')) {
      close()
      return
    }
    if (!event.target.closest('[data-bulk-save]')) return

    const text = overlay.querySelector('[data-bulk-text]').value.trim()
    if (!text) {
      overlay.querySelector('[data-bulk-error]').textContent = 'Isi catatan terlebih dahulu.'
      return
    }

    if (replaceBox.checked && !(await window.KoiDialog.confirm(`GANTI catatan ${ids.length} kolam terpilih? Semua catatan yang sudah ada akan dihapus.`))) return

        const saveButton = overlay.querySelector('[data-bulk-save]')
        saveButton.disabled = true
    saveButton.textContent = 'Menyimpan'
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    let failed = 0

    for (const id of ids) {
      const pond = P.find((item) => String(item.id) === String(id))
      try {
        const response = await fetch(`/api/ponds/${id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ notes: replaceBox.checked || !String(pond?.notes || '').trim() ? text : `${text}\n-----------\n\n${pond.notes}`, notes_date: today }),
        })
        if (!response.ok) failed += 1
      } catch {
        failed += 1
      }
    }

    close()
    pdDock.clear()
    await D($)
    if (failed) alert(`${failed} kolam gagal diberi catatan.`)
  })
  document.body.appendChild(overlay)
  overlay.querySelector('[data-bulk-text]').focus()
}
 return openPondBulkNote})(),pdBulkStatus=(()=>{
// Ubah status masal: the same status for every selected pond.
const openPondBulkStatus = (ids) => {
  document.querySelector('[data-pond-bulk-status]')?.remove()
  const overlay = document.createElement('div')
  overlay.setAttribute('data-pond-bulk-status', '')
  overlay.style.cssText = 'position:fixed;inset:0;z-index:4900;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.6)'
  overlay.innerHTML = `
    <div class="card" style="max-width:24rem;width:100%">
      <div class="card-header"><h3 class="card-title">Ubah Status (${ids.length} kolam)</h3><div class="card-actions"><button type="button" class="btn-close" data-bulk-cancel aria-label="Tutup"></button></div></div>
      <div class="card-body">
        <div class="form-label">Status baru untuk kolam terpilih</div>
        ${[['active', 'Aktif'], ['kosong', 'Kosong'], ['perbaikan', 'Perbaikan']].map(([value, label], index) => `<label class="form-check"><input class="form-check-input" type="radio" name="pond-bulk-status" value="${value}" ${index === 0 ? 'checked' : ''} /><span class="form-check-label">${label}</span></label>`).join('')}
        <div class="text-danger small mt-2" data-bulk-error></div>
      </div>
      <div class="card-footer d-flex justify-content-end gap-2"><button type="button" class="btn" data-bulk-cancel>Batal</button><button type="button" class="btn btn-primary" data-bulk-save>Ubah</button></div>
    </div>`
  overlay.addEventListener('click', async (event) => {
    if (event.target === overlay || event.target.closest('[data-bulk-cancel]')) {
      overlay.remove()
      return
    }
    if (!event.target.closest('[data-bulk-save]')) return
    const status = overlay.querySelector('input[name="pond-bulk-status"]:checked')?.value
    if (!status) return
    const saveButton = overlay.querySelector('[data-bulk-save]')
    saveButton.disabled = true
    saveButton.textContent = 'Menyimpan'
    let failed = 0
    for (const id of ids) {
      try {
        const response = await fetch(`/api/ponds/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status }) })
        if (!response.ok) failed += 1
      } catch {
        failed += 1
      }
    }
    overlay.remove()
    pdDock.clear()
    await D($)
    if (failed) alert(`${failed} kolam gagal diubah statusnya.`)
  })
  document.body.appendChild(overlay)
}
 return openPondBulkStatus})(),pdDock=window.KoiDock.create({root:r,label:`kolam`,idOf:it=>String(it.id),visibleItems:()=>pdDock.apply(J()),render:()=>Q(),actions:[{key:`edit`,icon:`edit`,title:`Edit kolam terpilih`,role:`farm-operate`,show:c1=>c1===1,onClick:ids=>Ae(ids[0])},{key:`bulk-status`,icon:`arrows-exchange`,title:`Ubah status kolam terpilih`,role:`farm-operate`,onClick:ids=>pdBulkStatus(ids)},{key:`bulk-note`,icon:`note`,title:`Catatan masal kolam terpilih`,role:`farm-operate`,onClick:ids=>pdBulkNote(ids)},{key:`print-one`,icon:`printer`,variant:`secondary`,title:c1=>c1>1?`Cetak ${c1} kolam terpilih (satu halaman per kolam)`:`Cetak kolam terpilih`,show:c1=>c1>=1,onClick:ids=>{if(ids.length>1){window.KoiPrint.printMany(ids,id=>{k=id,Ee()},{title:`Isi Kolam (${ids.length} kolam)`});return}k=ids[0],Ee()}},{key:`delete`,icon:`trash`,variant:`danger`,title:c1=>`Hapus ${c1} kolam terpilih`,role:`farm-operate`,onClick:ids=>pdDelete(ids)},{key:`print-list`,icon:`printer`,variant:`secondary`,title:`Cetak daftar kolam`,always:!0,show:c1=>c1===0,onClick:()=>i.click()},{key:`import`,icon:`upload`,variant:`success`,title:`Impor kolam (Excel atau ZIP)`,role:`farm-operate`,always:!0,show:c1=>c1===0,onClick:()=>c.click()},{key:`export`,icon:`file-spreadsheet`,variant:`success`,title:`Ekspor kolam (Excel)`,always:!0,show:c1=>c1===0,onClick:()=>l.click()},{key:`zip`,icon:`file-zip`,variant:`success`,title:c1=>c1?`Unduh ZIP (${c1} terpilih)`:`Unduh ZIP (Excel + dokumentasi)`,always:!0,onClick:ids=>window.koiPondsZip(ids)},{key:`settings`,icon:`settings`,title:`Pengaturan area`,role:`farm-operate`,always:!0,show:c1=>c1===0,onClick:()=>o.click()},{key:`sort`,text:pdSortLabel(),title:pdSortTitle(),always:!0,onClick:()=>{I={key:`name`,direction:I.key===`name`&&I.direction===`asc`?`desc`:`asc`};try{sessionStorage.setItem(`nishikigoi-view:farm-ponds`,JSON.stringify(I))}catch{}pdDock.updateAction(`sort`,{text:pdSortLabel(),title:pdSortTitle()}),Q()}}],add:{title:`Tambah kolam`,role:`farm-operate`,onClick:()=>document.querySelector(`[data-add-pond-trigger]`).click()}}),r.addEventListener(`keydown`,ev=>{let rw=ev.target.closest(`[data-pond-row]`);rw&&ev.target===rw&&(ev.key===`Enter`||ev.key===` `)&&(ev.preventDefault(),je(rw.dataset.pondRow))}),$(Oe()),window.KoiAuth?.registerRealtimeRefresh(()=>D(()=>$(!0)),{intervalMs:25e3});
var pdSearchQuery=``;(()=>{let i=document.querySelector(`[data-pond-search]`);i&&i.addEventListener(`input`,()=>{pdSearchQuery=i.value.trim().toLowerCase(),Q()})})();
(()=>{let b=document.querySelector(`#navbar-global-search`);b&&(b.setAttribute(`placeholder`,`Nama kolam, area, catatan:kata`),b.setAttribute(`title`,`Cari nama kolam atau area. Beberapa kata = semuanya harus cocok (mudpond 14). Pisahkan dengan koma atau titik untuk beberapa kolam (konkret 01, konkret 02). Cari di catatan: catatan:kata`))})();
