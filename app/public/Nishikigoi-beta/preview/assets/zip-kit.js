/* Shared ZIP package helpers (Data Kolam, Breeding, Laporan).
 *
 * Package layout (same for every menu):
 *   data-<menu>.xlsx                      one sheet with the data; its last column "Dokumentasi" names the folder
 *   image/<folder>/<NN>-<nama>.<ext>       the photos of that row
 *   footage/<folder>/<NN>-<nama>.<ext>     the videos of that row
 * "Dokumentasi" cell: a folder name, several folders separated by "/", and "@<ID>" for a photo/video that is already
 * in the Galeri (for example  Vat 01/@42/@43). An empty cell uses the folder named like the row's key (Nama Kolam /
 * Kode Batch). The note (catatan) of a photo/video is its file name; "@42:catatan" gives a mention its own note.
 * The older sheet "Dokumentasi" (Kunci | No | Jenis | Nama File | Catatan | ID Media) is still read.
 *
 * Needs SheetJS (window.XLSX). Files are stored without compression (images/videos are already
 * compressed); reading also accepts deflate ZIPs made by Windows/Explorer, Chrome and 7-Zip.
 */
(function () {
  'use strict'

  var MAX_VIDEO_BYTES = 40 * 1024 * 1024
  var DOC_SHEET = 'Dokumentasi'
  var IMAGE_TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' }
  var VIDEO_TYPES = { mp4: 'video/mp4', webm: 'video/webm' }
  var XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

  // ---- ZIP writer -------------------------------------------------------------------------------
  var crcTable = (function () {
    var table = new Int32Array(256)
    for (var n = 0; n < 256; n += 1) {
      var c = n
      for (var k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c
    }
    return table
  })()

  function crc32(bytes) {
    var crc = -1
    for (var i = 0; i < bytes.length; i += 1) crc = crcTable[(crc ^ bytes[i]) & 255] ^ (crc >>> 8)
    return (crc ^ -1) >>> 0
  }

  function u16(value) { return [value & 255, (value >>> 8) & 255] }
  function u32(value) { return [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255] }

  // files: [{ name, data }] where data is a Uint8Array or ArrayBuffer. Returns a Blob.
  function createZip(files) {
    var encoder = new TextEncoder()
    var now = new Date()
    var dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)
    var dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()
    var chunks = []
    var central = []
    var offset = 0

    files.forEach(function (file) {
      var name = encoder.encode(file.name)
      var data = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data)
      var crc = crc32(data)
      // flag 0x0800 = names are UTF-8
      var header = new Uint8Array([].concat(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(dosTime), u16(dosDate),
        u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0)))
      chunks.push(header, name, data)
      central.push({ name: name, crc: crc, size: data.length, offset: offset })
      offset += header.length + name.length + data.length
    })

    var centralStart = offset
    central.forEach(function (file) {
      var header = new Uint8Array([].concat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(dosTime), u16(dosDate),
        u32(file.crc), u32(file.size), u32(file.size), u16(file.name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(file.offset)))
      chunks.push(header, file.name)
      offset += header.length + file.name.length
    })
    chunks.push(new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length),
      u32(offset - centralStart), u32(centralStart), u16(0))))

    return new Blob(chunks, { type: 'application/zip' })
  }

  // ---- ZIP reader -------------------------------------------------------------------------------
  function r16(bytes, o) { return bytes[o] | (bytes[o + 1] << 8) }
  function r32(bytes, o) { return (bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16) | (bytes[o + 3] << 24)) >>> 0 }

  async function inflate(bytes) {
    if (!window.DecompressionStream) throw new Error('Browser ini belum mendukung ZIP terkompres. Gunakan Chrome atau Edge terbaru.')
    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
    return new Uint8Array(await new Response(stream).arrayBuffer())
  }

  // Returns [{ name, data }] for every file in the ZIP (folders and __MACOSX are skipped).
  async function readZip(file) {
    var bytes = new Uint8Array(await file.arrayBuffer())
    var decoder = new TextDecoder()
    var end = -1
    for (var i = bytes.length - 22; i >= 0 && i >= bytes.length - 65557; i -= 1) {
      if (r32(bytes, i) === 0x06054b50) { end = i; break }
    }
    if (end < 0) throw new Error('File ZIP tidak valid.')

    var total = r16(bytes, end + 10)
    var dir = r32(bytes, end + 16)
    var entries = []
    for (var n = 0; n < total; n += 1) {
      if (r32(bytes, dir) !== 0x02014b50) throw new Error('Struktur ZIP tidak valid.')
      var method = r16(bytes, dir + 10)
      var compressedSize = r32(bytes, dir + 20)
      var size = r32(bytes, dir + 24)
      var nameLength = r16(bytes, dir + 28)
      var extraLength = r16(bytes, dir + 30)
      var commentLength = r16(bytes, dir + 32)
      var local = r32(bytes, dir + 42)
      var name = decoder.decode(bytes.subarray(dir + 46, dir + 46 + nameLength))
      dir += 46 + nameLength + extraLength + commentLength
      if (!name || name.endsWith('/') || name.indexOf('__MACOSX/') === 0) continue
      if (method !== 0 && method !== 8) throw new Error('File ' + name + ' memakai kompresi ZIP yang belum didukung.')
      if (r32(bytes, local) !== 0x04034b50) throw new Error('File ' + name + ' rusak di dalam ZIP.')
      var start = local + 30 + r16(bytes, local + 26) + r16(bytes, local + 28)
      var packed = bytes.subarray(start, start + compressedSize)
      var data = method === 0 ? packed.slice() : await inflate(packed)
      if (size && data.length !== size) throw new Error('Ukuran file ' + name + ' tidak sesuai. ZIP kemungkinan rusak.')
      entries.push({ name: name, data: data })
    }
    return entries
  }

  // ---- helpers ----------------------------------------------------------------------------------
  function today() { return new Date().toISOString().slice(0, 10) }
  function safeName(value, fallback) {
    var cleaned = String(value || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').replace(/^[\s.-]+|[\s.-]+$/g, '').slice(0, 60)
    return cleaned || fallback
  }
  function extensionOf(name) {
    var match = /\.([a-z0-9]{2,5})(?:\?.*)?$/i.exec(String(name || ''))
    return match ? match[1].toLowerCase() : ''
  }
  // The catatan of a photo/video is written as its file name: "Telur hari 1.jpg" -> "Telur hari 1". A leading number
  // ("01-") is only an order and is dropped. Names a camera or phone makes (IMG_1234, 20261009_123456, foto, ...)
  // carry no note.
  function noteFromFileName(name) {
    var base = String(name || '').split(/[\\/]/).pop().replace(/\.[a-z0-9]{2,5}$/i, '').replace(/^\d{1,3}[-_ ]+(?=.)/, '').trim()
    if (!base) return ''
    if (/^(?=.*[0-9])[0-9a-f_.\- ()]+$/i.test(base)) return ''
    if (/^(img|dsc|dscn|dscf|pxl|mvimg|vid|wa|photo|foto|video|image|gambar|screenshot|screen shot|whatsapp (image|video))[\s_.-]*[0-9][0-9_.\- ()a-z]*$/i.test(base)) return ''
    if (/^(foto|video|photo|image|gambar)$/i.test(base)) return ''
    return base
  }
  function normalizePath(path) { return String(path || '').replace(/\\/g, '/').replace(/^\.?\//, '').toLowerCase() }
  function mediaTypeOf(ext, hint) {
    if (VIDEO_TYPES[ext]) return 'video'
    if (IMAGE_TYPES[ext]) return 'image'
    return hint === 'video' ? 'video' : hint === 'image' ? 'image' : ''
  }

  function download(blob, filename) {
    var link = document.createElement('a')
    var url = URL.createObjectURL(blob)
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(function () { URL.revokeObjectURL(url) }, 5000)
  }

  function toDataUrl(bytes, mime) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader()
      reader.onload = function () { resolve(String(reader.result)) }
      reader.onerror = function () { reject(new Error('File tidak dapat dibaca')) }
      reader.readAsDataURL(new Blob([bytes], { type: mime }))
    })
  }

  // Small toast so long exports/imports show what they are doing.
  function progress(title) {
    var box = document.createElement('div')
    box.setAttribute('data-koi-zip-progress', '')
    box.setAttribute('role', 'status')
    box.style.cssText = 'position:fixed;left:16px;bottom:96px;z-index:4950;max-width:min(26rem,calc(100vw - 32px));padding:10px 14px;border-radius:8px;background:#1f2937;color:#fff;border:1px solid rgba(255,255,255,.18);box-shadow:0 8px 24px rgba(0,0,0,.4);font-size:.85rem'
    var head = document.createElement('strong')
    head.textContent = title
    var line = document.createElement('div')
    line.style.cssText = 'margin-top:2px;opacity:.85;word-break:break-word'
    box.append(head, line)
    document.body.appendChild(box)
    return {
      set: function (text) { line.textContent = text },
      close: function () { box.remove() },
    }
  }

  // Runs worker(item, index) for every item, at most `limit` at a time.
  async function pool(items, limit, worker) {
    var next = 0
    var runners = []
    for (var r = 0; r < Math.min(limit, items.length); r += 1) {
      runners.push((async function () {
        while (next < items.length) {
          var index = next
          next += 1
          await worker(items[index], index)
        }
      })())
    }
    await Promise.all(runners)
  }

  // ---- Galeri: every photo / video of a documentation has its own ID (gallery_images.id) ------------
  // Returns { byId: Map(id -> media), byUrl: Map(url -> media) } built from GET /api/gallery.
  async function loadGalleryMedia() {
    var byId = new Map()
    var byUrl = new Map()
    try {
      var response = await fetch('/api/gallery')
      if (response.ok) {
        var collections = await response.json()
        ;(Array.isArray(collections) ? collections : []).forEach(function (collection) {
          ;(collection.images || []).forEach(function (image) {
            var media = {
              id: Number(image.id), url: image.image_url, type: image.media_type === 'video' ? 'video' : 'image',
              thumbnail_url: image.thumbnail_url || '', notes: image.notes || '',
            }
            byId.set(String(image.id), media)
            if (!byUrl.has(image.image_url)) byUrl.set(image.image_url, media)
          })
        })
      }
    } catch (error) { /* without the Galeri the ID Media column is simply empty */ }
    return { byId: byId, byUrl: byUrl }
  }

  // ---- export -----------------------------------------------------------------------------------
  // options: { sheetName, header, rows, docs: [{ key, media: [{ type, url, name, notes }] }] (same order as rows),
  //            xlsxName, extraSheets: [{ name, header, rows, keyColumn }], extraFiles: [{ path, url }], onProgress }
  // Photos go to image/<folder>/NN-name.ext and videos to footage/<folder>/NN-name.ext. The sheet gets a last
  // column "Dokumentasi" holding the folder name of that row (empty when the row has no media). An extra sheet
  // gets the same column, looked up by the key found in its `keyColumn`.
  // Returns { blob, photos, videos, problems }.
  async function exportPackage(options) {
    if (!window.XLSX) throw new Error('Pustaka Excel belum termuat. Muat ulang halaman.')
    var problems = []
    var tasks = []
    var usedFolders = new Map()
    var folderByKey = new Map()

    options.docs.forEach(function (doc) {
      var media = (doc.media || []).filter(function (item) { return item && item.url })
      if (!media.length) return
      var folder = safeName(doc.key, 'tanpa-nama')
      var folderKey = folder.toLowerCase()
      var seen = usedFolders.get(folderKey) || 0
      usedFolders.set(folderKey, seen + 1)
      if (seen) folder = folder + ' (' + (seen + 1) + ')'
      folderByKey.set(doc.key, folder)
      media.forEach(function (item, index) {
        tasks.push({ key: doc.key, folder: folder, no: index + 1, item: item })
      })
    })

    var files = []
    var photos = 0
    var videos = 0
    var done = 0
    var exportedFolders = new Set()

    await pool(tasks, 4, async function (task) {
      var url = String(task.item.url)
      var ext = extensionOf(url.split('?')[0])
      var type = mediaTypeOf(ext, task.item.type === 'video' ? 'video' : 'image')
      var label = task.key + ' #' + task.no
      try {
        var response = await fetch(url)
        if (!response.ok) throw new Error('HTTP ' + response.status)
        var declared = Number(response.headers.get('content-length') || 0)
        if (type === 'video' && declared > MAX_VIDEO_BYTES) {
          problems.push(label + ': video lebih dari 40 MB, tidak ikut ZIP')
          return
        }
        var data = new Uint8Array(await response.arrayBuffer())
        if (type === 'video' && data.length > MAX_VIDEO_BYTES) {
          problems.push(label + ': video lebih dari 40 MB, tidak ikut ZIP')
          return
        }
        if (!IMAGE_TYPES[ext] && !VIDEO_TYPES[ext]) ext = type === 'video' ? 'mp4' : 'jpg'
        var base = safeName(String(task.item.notes || ''), type === 'video' ? 'video' : 'foto')
        var path = (type === 'video' ? 'footage/' : 'image/') + task.folder + '/' + String(task.no).padStart(2, '0') + '-' + base + '.' + ext
        files.push({ name: path, data: data })
        exportedFolders.add(task.key)
        if (type === 'video') videos += 1
        else photos += 1
      } catch (error) {
        problems.push(label + ': file tidak dapat diambil (' + (error.message || 'gagal') + ')')
      } finally {
        done += 1
        if (options.onProgress) options.onProgress('Mengambil dokumentasi ' + done + '/' + tasks.length)
      }
    })

    // Extra files (for example the photos of Ikan Datang lines): { path, url } stored at that path in the ZIP.
    await pool(options.extraFiles || [], 4, async function (extra) {
      try {
        var response = await fetch(String(extra.url))
        if (!response.ok) throw new Error('HTTP ' + response.status)
        files.push({ name: extra.path, data: new Uint8Array(await response.arrayBuffer()) })
        photos += 1
      } catch (error) {
        problems.push(extra.path + ': file tidak dapat diambil (' + (error.message || 'gagal') + ')')
      }
    })

    files.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0 })
    var folderOf = function (key) { return exportedFolders.has(key) ? folderByKey.get(key) : '' }

    var workbook = XLSX.utils.book_new()
    var rows = options.rows.map(function (row, index) { return row.concat([options.docs[index] ? folderOf(options.docs[index].key) : '']) })
    var sheet = XLSX.utils.aoa_to_sheet([options.header.concat(['Dokumentasi'])].concat(rows))
    sheet['!cols'] = options.header.concat(['Dokumentasi']).map(function (column) { return { wch: Math.max(14, String(column).length + 2) } })
    XLSX.utils.book_append_sheet(workbook, sheet, options.sheetName)
    ;(options.extraSheets || []).forEach(function (extra) {
      var extraRows = extra.rows.map(function (row) { return row.concat([folderOf(row[extra.keyColumn])]) })
      var extraSheet = XLSX.utils.aoa_to_sheet([extra.header.concat(['Dokumentasi'])].concat(extraRows))
      extraSheet['!cols'] = extra.header.concat(['Dokumentasi']).map(function (column) { return { wch: Math.max(14, String(column).length + 2) } })
      XLSX.utils.book_append_sheet(workbook, extraSheet, extra.name)
    })
    var xlsx = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })

    var blob = createZip([{ name: options.xlsxName, data: xlsx }].concat(files))
    return { blob: blob, photos: photos, videos: videos, problems: problems }
  }

  // ---- import -----------------------------------------------------------------------------------
  // The documentation of a row is written in its "Dokumentasi" cell:
  //   Vat 01            the folder "Vat 01" of the ZIP (image/Vat 01/ for photos, footage/Vat 01/ for videos)
  //   Vat 01/Vat 02     several folders, separated by "/"
  //   @42               the photo/video with that ID in the Galeri (no upload); works without a ZIP too
  //   Vat 01/@42/@43    both together
  // An empty cell falls back to the folder named like the row's key (Nama Kolam / Kode Batch). An older sheet
  // "Dokumentasi" (Kunci | No | Jenis | Nama File | Catatan | ID Media) is still read.
  // Returns an object with: xlsxFile, isZip, docsForRow(cell, key) -> Promise<{ docs, problems }>, docsFor(key),
  // markUsed(key), unusedKeys(), fileFor(path), problems.
  function buildPackage(entries, xlsxEntry, isZip) {
    var slash = xlsxEntry ? xlsxEntry.name.lastIndexOf('/') : -1
    var baseDir = slash >= 0 ? xlsxEntry.name.slice(0, slash + 1) : ''
    var relName = function (name) { return baseDir && name.indexOf(baseDir) === 0 ? name.slice(baseDir.length) : name }
    var byPath = new Map()
    var byBase = new Map()
    entries.forEach(function (entry) {
      byPath.set(normalizePath(entry.name), entry)
      byPath.set(normalizePath(relName(entry.name)), entry)
      var base = normalizePath(entry.name).split('/').pop()
      byBase.set(base, byBase.has(base) ? null : entry) // null = ambiguous
    })
    var findEntry = function (path) { return byPath.get(normalizePath(path)) || byBase.get(normalizePath(path).split('/').pop()) || null }

    var problems = []
    var docsByKey = new Map() // from the older sheet "Dokumentasi"
    var docsByFolder = new Map()
    var labels = new Map()
    var referenced = new Set()
    var addTo = function (map, key, doc) {
      var lowered = String(key).trim().toLowerCase()
      if (!map.has(lowered)) { map.set(lowered, []); labels.set(lowered, String(key).trim()) }
      map.get(lowered).push(doc)
    }
    var galleryPromise = null
    var gallery = function () { if (!galleryPromise) galleryPromise = loadGalleryMedia(); return galleryPromise }
    var mediaDoc = function (known, notes, no) {
      return { type: known.type, name: known.url.split('/').pop(), notes: notes || known.notes || '', url: known.url, thumbnail_url: known.thumbnail_url, mediaId: known.id, no: no || 0 }
    }

    // older sheet "Dokumentasi"
    var pendingSheet = null
    var addLegacySheet = async function (workbook) {
      var sheetName = workbook.SheetNames.find(function (name) { return name.trim().toLowerCase() === DOC_SHEET.toLowerCase() })
      if (!sheetName) return
      var rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '', raw: false })
      for (var rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        var row = rows[rowIndex]
        var record = {}
        var firstKey = ''
        Object.keys(row).forEach(function (column, position) {
          var name = String(column).trim().toLowerCase()
          record[name] = String(row[column] == null ? '' : row[column]).trim()
          if (position === 0) firstKey = record[name]
        })
        var line = rowIndex + 2
        var mediaId = record['id media'] || record['id galeri']
        if (!firstKey && !record['nama file'] && !mediaId) continue
        var where = 'Sheet Dokumentasi baris ' + line + ' (' + firstKey + '): '
        if (!firstKey) { problems.push('Sheet Dokumentasi baris ' + line + ': kunci kosong'); continue }
        if (mediaId) {
          var known = (await gallery()).byId.get(String(mediaId).replace(/\D/g, ''))
          if (known) { addTo(docsByKey, firstKey, mediaDoc(known, record.catatan, Number(record.no))); continue }
          if (!record['nama file']) { problems.push(where + 'ID Media ' + mediaId + ' tidak ditemukan di Galeri'); continue }
        }
        var entry = record['nama file'] ? findEntry(record['nama file']) : null
        if (!entry) { problems.push(where + 'file "' + (record['nama file'] || '') + '" tidak ada di ZIP'); continue }
        var ext = extensionOf(entry.name)
        var type = mediaTypeOf(ext, '')
        if (!type) { problems.push(where + 'format file "' + ext + '" tidak didukung'); continue }
        if (type === 'video' && entry.data.length > MAX_VIDEO_BYTES) { problems.push(where + 'video lebih dari 40 MB, dilewati'); continue }
        referenced.add(entry.name)
        addTo(docsByKey, firstKey, {
          type: type, name: entry.name.split('/').pop().replace(/^\d{1,3}-(?=.)/, ''), notes: record.catatan || '',
          bytes: entry.data, mime: type === 'video' ? VIDEO_TYPES[ext] : IMAGE_TYPES[ext], no: Number(record.no) || 0,
        })
      }
    }

    // folders: image/<folder>/file, footage/<folder>/file (also foto/, video/, dokumentasi/) or <folder>/file
    var mediaRoots = ['image', 'images', 'foto', 'footage', 'video', 'videos', 'dokumentasi']
    var folderIndex = 0
    var discover = function () {
      entries.slice().sort(function (a, b) { return a.name < b.name ? -1 : 1 }).forEach(function (entry) {
        if (referenced.has(entry.name)) return
        var parts = relName(entry.name).split('/')
        var ext = extensionOf(entry.name)
        var type = mediaTypeOf(ext, '')
        if (!type || parts.length < 2) return
        var folder
        if (mediaRoots.indexOf(parts[0].toLowerCase()) >= 0) {
          if (parts.length === 2) { problems.push('File "' + relName(entry.name) + '" ada di folder ' + parts[0] + ' tanpa folder nama kolam / kode batch, dilewati'); return }
          if (parts.length > 3) return // deeper folders (image/<kode>/ikan/ with the photos of Ikan Datang) are read by the sheet that names them
          folder = parts[1]
        } else if (parts.length === 2) {
          folder = parts[0]
        } else {
          return
        }
        if (type === 'video' && entry.data.length > MAX_VIDEO_BYTES) { problems.push('File "' + relName(entry.name) + '": video lebih dari 40 MB, dilewati'); return }
        folderIndex += 1
        addTo(docsByFolder, folder, {
          type: type, name: parts[parts.length - 1].replace(/^\d{1,3}-(?=.)/, ''), notes: noteFromFileName(parts[parts.length - 1]),
          bytes: entry.data, mime: type === 'video' ? VIDEO_TYPES[ext] : IMAGE_TYPES[ext], no: 100000 + folderIndex,
        })
      })
    }

    var used = new Set()
    var resolve = function (map, text) {
      var plain = String(text || '').trim().toLowerCase()
      if (map.has(plain)) return plain
      var safe = safeName(text, '').toLowerCase()
      return map.has(safe) ? safe : null
    }
    var sorted = function (list) { return list.slice().sort(function (a, b) { return a.no - b.no }) }
    function docsFor(key) {
      var out = []
      var legacy = resolve(docsByKey, key)
      var folder = resolve(docsByFolder, key)
      if (legacy) { used.add(legacy); out = out.concat(docsByKey.get(legacy)) }
      if (folder) { used.add(folder); out = out.concat(docsByFolder.get(folder)) }
      return out.length ? sorted(out) : null
    }
    async function docsForRow(cell, key) {
      var text = String(cell == null ? '' : cell).trim()
      var tokens = text ? text.split('/').map(function (token) { return token.trim() }).filter(Boolean) : []
      var docs = []
      var rowProblems = []
      if (!tokens.length) return { docs: docsFor(key) || [], problems: rowProblems }
      var legacy = resolve(docsByKey, key)
      if (legacy) { used.add(legacy); docs = docs.concat(docsByKey.get(legacy)) }
      for (var i = 0; i < tokens.length; i += 1) {
        var token = tokens[i]
        var mention = /^@\s*(\d+)\s*(?::\s*(.*))?$/.exec(token)
        if (mention) {
          var known = (await gallery()).byId.get(mention[1])
          if (known) docs.push(mediaDoc(known, mention[2] ? mention[2].trim() : '', 200000 + i))
          else rowProblems.push('ID Media ' + token + ' tidak ditemukan di Galeri')
          continue
        }
        var folder = resolve(docsByFolder, token)
        if (!folder) { rowProblems.push('Folder "' + token + '" tidak ada di ZIP'); continue }
        used.add(folder)
        docs = docs.concat(docsByFolder.get(folder))
      }
      return { docs: sorted(docs), problems: rowProblems }
    }
    function markUsed(key) {
      var legacy = resolve(docsByKey, key)
      var folder = resolve(docsByFolder, key)
      if (legacy) used.add(legacy)
      if (folder) used.add(folder)
    }
    function unusedKeys() {
      var out = []
      docsByKey.forEach(function (list, key) { if (!used.has(key)) out.push(labels.get(key) || key) })
      docsByFolder.forEach(function (list, key) { if (!used.has(key) && out.indexOf(labels.get(key) || key) < 0) out.push(labels.get(key) || key) })
      return out
    }
    // Looks up one file of the ZIP by the path / name written in a sheet (images only). null when missing.
    function fileFor(path) {
      var entry = findEntry(path)
      if (!entry) return null
      var ext = extensionOf(entry.name)
      if (!IMAGE_TYPES[ext]) return null
      return { bytes: entry.data, mime: IMAGE_TYPES[ext], name: entry.name.split('/').pop() }
    }

    return {
      isZip: isZip, problems: problems, docsFor: docsFor, docsForRow: docsForRow, markUsed: markUsed, unusedKeys: unusedKeys, fileFor: fileFor,
      prepare: async function (workbook) { if (workbook) await addLegacySheet(workbook); discover() },
    }
  }

  async function readPackage(file) {
    if (!window.XLSX) throw new Error('Pustaka Excel belum termuat. Muat ulang halaman.')
    var entries = await readZip(file)
    var xlsxEntry = entries.find(function (entry) {
      var base = entry.name.split('/').pop()
      return /\.xlsx$/i.test(base) && base.indexOf('~$') !== 0 && base.charAt(0) !== '.'
    })
    if (!xlsxEntry) throw new Error('Di dalam ZIP tidak ada file Excel (.xlsx).')
    var pkg = buildPackage(entries, xlsxEntry, true)
    await pkg.prepare(XLSX.read(xlsxEntry.data, { type: 'array', cellDates: true, dateNF: 'yyyy-mm-dd' }))
    pkg.xlsxFile = new File([xlsxEntry.data], xlsxEntry.name.split('/').pop(), { type: XLSX_MIME })
    return pkg
  }

  // For a plain Excel file (no ZIP): only "@ID" mentions of Galeri media can be used.
  async function plainPackage() {
    var pkg = buildPackage([], null, false)
    await pkg.prepare(null)
    return pkg
  }

  // Turns docs into report/breeding style media entries. A doc with `url` is a mention of media that is already
  // on the server (Galeri ID Media): no upload, the same file. Other docs are uploaded; a file identical to one of
  // existingUrls is not stored again (server side check) and is not returned as a new entry.
  // Returns { entries, duplicates, problems }.
  async function uploadEntries(docs, options) {
    var entries = []
    var problems = []
    var duplicates = 0
    var known = (options.existingUrls || []).slice()

    for (var i = 0; i < docs.length; i += 1) {
      var doc = docs[i]
      try {
        if (doc.url) {
          if (known.indexOf(doc.url) >= 0) { duplicates += 1; continue }
          known.push(doc.url)
          entries.push({ type: doc.type, url: doc.url, thumbnail_url: doc.thumbnail_url || (doc.type === 'video' ? '' : doc.url), name: doc.name || '', notes: doc.notes || '' })
          continue
        }
        var data = await toDataUrl(doc.bytes, doc.mime)
        var video = doc.type === 'video'
        var response = await fetch('/api/' + (video ? 'videos' : 'images'), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(video
            ? { prefix: options.videoPrefix, video_data: data, dedupe_against: known }
            : { prefix: options.imagePrefix, image_data: data, dedupe_against: known }),
        })
        var result = await response.json().catch(function () { return {} })
        if (!response.ok) throw new Error(result.detail || result.error || 'gagal diupload')
        if (result.duplicate) { duplicates += 1; continue }
        var url = video ? result.video_url : result.image_url
        known.push(url)
        entries.push({ type: video ? 'video' : 'image', url: url, thumbnail_url: video ? (result.video_thumbnail_url || '') : url, name: doc.name, notes: doc.notes || '' })
      } catch (error) {
        problems.push('Dokumentasi "' + doc.name + '": ' + (error.message || 'gagal diupload'))
      }
    }
    return { entries: entries, duplicates: duplicates, problems: problems }
  }

  // Data Kolam keeps documentation in its own table; the server skips files the pond already has.
  // Returns { added, skipped, problems }.
  async function addPondDocs(pondId, docs) {
    var added = 0
    var skipped = 0
    var problems = []
    for (var i = 0; i < docs.length; i += 3) {
      var batch = docs.slice(i, i + 3)
      try {
        var media = []
        for (var j = 0; j < batch.length; j += 1) {
          if (batch[j].url) {
            media.push({ media_type: batch[j].type, image_url: batch[j].url, thumbnail_url: batch[j].thumbnail_url || '', notes: batch[j].notes })
            continue
          }
          var data = await toDataUrl(batch[j].bytes, batch[j].mime)
          media.push(batch[j].type === 'video'
            ? { media_type: 'video', video_data: data, notes: batch[j].notes }
            : { media_type: 'image', image_data: data, notes: batch[j].notes })
        }
        var response = await fetch('/api/ponds/' + pondId + '/documentation', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ media: media, skip_duplicates: true }),
        })
        var result = await response.json().catch(function () { return {} })
        if (!response.ok) throw new Error(result.detail || result.error || 'gagal diupload')
        added += Number(result.inserted || 0)
        skipped += Number(result.skipped || 0)
      } catch (error) {
        problems.push('Dokumentasi ' + batch.map(function (doc) { return '"' + doc.name + '"' }).join(', ') + ': ' + (error.message || 'gagal diupload'))
      }
    }
    return { added: added, skipped: skipped, problems: problems }
  }

  window.KoiZip = {
    createZip: createZip,
    readZip: readZip,
    exportPackage: exportPackage,
    safeName: safeName,
    readPackage: readPackage,
    plainPackage: plainPackage,
    uploadEntries: uploadEntries,
    addPondDocs: addPondDocs,
    loadGalleryMedia: loadGalleryMedia,
    download: download,
    progress: progress,
    today: today,
    MAX_VIDEO_BYTES: MAX_VIDEO_BYTES,
  }
})()
