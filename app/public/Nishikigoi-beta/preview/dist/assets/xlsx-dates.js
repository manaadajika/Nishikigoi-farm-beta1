// Excel files of the program: a date is written as a real Excel date (shown as yyyy-mm-dd, lined up on the right like every date of Excel)
// instead of text, and a date that Excel kept as a plain serial number (45822) is read back as the date it is.
// It wraps XLSX.utils.aoa_to_sheet (writing) and XLSX.utils.sheet_to_json (reading), so every export and import of the program gets it:
// a column counts as a date column when its title is Tanggal..., Tgl..., Awal Pijah, Akhir Pijah or Update Terakhir.
// A date that is only partly known (2026-00-00, 2026-05-00) cannot be an Excel date: it stays text.
;(function () {
  'use strict'
  if (!window.XLSX || !window.XLSX.utils || window.XLSX.utils.__koiDates) return

  var HEADER = /^(tanggal\b.*|tgl\b.*|awal pijah|akhir pijah|update terakhir)$/
  var EPOCH = Date.UTC(1899, 11, 30)

  function isDateHeader(value) { return typeof value === 'string' && HEADER.test(value.trim().toLowerCase()) }

  // 'YYYY-MM-DD' (also the other forms the program reads: 26/01/2026 ...) -> Excel serial number, or null when it is not a whole date
  function toSerial(text) {
    var raw = String(text == null ? '' : text).trim()
    if (!raw) return null
    var iso = /^(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?$/.exec(raw)
    if (!iso && window.KoiAuth && window.KoiAuth.dateFromText) {
      var parsed = String(window.KoiAuth.dateFromText(raw) || '')
      iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(parsed)
    }
    if (!iso) return null
    var year = Number(iso[1])
    var month = Number(iso[2])
    var day = Number(iso[3])
    if (!month || !day || month > 12 || day > 31) return null
    var time = Date.UTC(year, month - 1, day)
    var check = new Date(time)
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null
    return Math.round((time - EPOCH) / 86400000)
  }
  function fromSerial(value) {
    var number = Number(value)
    if (!Number.isFinite(number) || number < 20000 || number > 80000) return null
    return new Date(EPOCH + Math.round(number) * 86400000).toISOString().slice(0, 10)
  }

  // the title row is one of the first three rows (Data Ikan has a hint row above it)
  function dateColumns(rows) {
    for (var r = 0; r < Math.min(3, rows.length); r += 1) {
      var found = []
      ;(rows[r] || []).forEach(function (cell, c) { if (isDateHeader(cell)) found.push(c) })
      if (found.length) return { row: r, columns: found }
    }
    return null
  }

  var utils = window.XLSX.utils
  var originalWrite = utils.aoa_to_sheet
  var originalRead = utils.sheet_to_json

  utils.aoa_to_sheet = function (rows, options) {
    var sheet = originalWrite.call(this, rows, options)
    try {
      var where = Array.isArray(rows) ? dateColumns(rows) : null
      if (where) {
        for (var r = where.row + 1; r < rows.length; r += 1) {
          where.columns.forEach(function (c) {
            var cell = sheet[utils.encode_cell({ r: r, c: c })]
            if (!cell || cell.t !== 's') return
            var serial = toSerial(cell.v)
            if (serial === null) return
            cell.t = 'n'
            cell.v = serial
            cell.z = 'yyyy-mm-dd'
            delete cell.w
          })
        }
      }
    } catch (error) { /* a date that cannot be converted stays text */ }
    return sheet
  }

  utils.sheet_to_json = function (sheet, options) {
    var result = originalRead.call(this, sheet, options)
    try {
      if (options && options.header === 1) {
        var where = dateColumns(result)
        if (where) {
          for (var r = where.row + 1; r < result.length; r += 1) {
            where.columns.forEach(function (c) {
              var iso = fromSerial(result[r][c] !== '' && /^\d{5}$/.test(String(result[r][c]).trim()) ? result[r][c] : NaN)
              if (iso) result[r][c] = iso
            })
          }
        }
      } else if (!options || !options.header) {
        result.forEach(function (row) {
          Object.keys(row).forEach(function (key) {
            if (!isDateHeader(key)) return
            var value = row[key]
            if (typeof value === 'number' || (typeof value === 'string' && /^\d{5}$/.test(value.trim()))) {
              var iso = fromSerial(value)
              if (iso) row[key] = iso
            }
          })
        })
      }
    } catch (error) { /* the cell stays as Excel gave it */ }
    return result
  }
  utils.__koiDates = true
})()
