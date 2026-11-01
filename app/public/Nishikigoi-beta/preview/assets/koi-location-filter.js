// Data Ikan > filter Lokasi: the list is grouped by the areas of Data Kolam. An area is a row of its own (bold) and can be chosen: it means every
// fish of that area (the ponds under it and the fish written with that area only); the ponds of the area stand under it. Several areas and
// ponds can be chosen together. The page builds the plain list of ponds; this file rearranges it every time the page rebuilds it.
// Choosing an area sends "__area__:<name>" in the Lokasi filter, which the server (koi_filter_sql) understands.
function koiLocationFilterBoot() {
  'use strict'

  var select = document.getElementById('koi-filter-location')
  if (!select || /(^|[?&])arsip=1/.test(location.search)) return   // the archive lists where the fish were, not areas

  var AREA = '__area__:'
  var NO_AREA = 'Tanpa Area'
  var places = null        // [{ name, ponds: [names] }] in the order of Data Kolam
  var areaFacet = []       // areas that have fish
  var chosenAreas = {}
  var busy = false
  var loading = null

  function json(url) {
    return fetch(url).then(function (response) { return response.ok ? response.json() : null }).catch(function () { return null })
  }
  function load() {
    if (loading) return loading
    loading = Promise.all([json('/api/ponds/options'), json('/api/app-settings'), json('/api/koi/facets?fields=pond_area')]).then(function (results) {
      var ponds = Array.isArray(results[0]) ? results[0] : []
      var order = []
      try { order = JSON.parse((results[1] || {}).pond_area_order || '[]') } catch (error) { order = [] }
      if (!Array.isArray(order)) order = []
      areaFacet = results[2] && Array.isArray(results[2].pond_area) ? results[2].pond_area : []
      var groups = {}
      ponds.forEach(function (pond) {
        var area = String(pond.location || '').trim()
        if (!area) return
        ;(groups[area] = groups[area] || []).push(String(pond.name || '').trim())
      })
      areaFacet.forEach(function (area) { if (!groups[area]) groups[area] = [] })
      var names = order.filter(function (name) { return groups[name] }).concat(Object.keys(groups).filter(function (name) { return order.indexOf(name) < 0 }).sort(function (a, b) { return a.localeCompare(b) }))
      places = names.map(function (name) { return { name: name, ponds: groups[name] } })
    })
    return loading
  }

  function option(value, text, attributes) {
    var el = document.createElement('option')
    el.value = value
    el.textContent = text
    Object.keys(attributes || {}).forEach(function (key) { el.setAttribute(key, attributes[key]) })
    return el
  }

  function regroup() {
    if (busy || !places) return
    var current = Array.prototype.slice.call(select.options)
    var allOption = current.filter(function (o) { return o.value === '' })[0]
    var emptyOption = current.filter(function (o) { return o.value === '__kosong__' })[0]
    var pondOptions = current.filter(function (o) { return o.value !== '' && o.value !== '__kosong__' && o.value.indexOf(AREA) !== 0 })
    var picked = {}
    current.forEach(function (o) {
      if (o.selected && o.value !== '') picked[o.value] = true
    })
    Object.keys(chosenAreas).forEach(function (name) { picked[AREA + name] = true })

    var byName = {}
    pondOptions.forEach(function (o) { byName[o.value] = o })
    var used = {}
    var fragment = document.createDocumentFragment()
    fragment.appendChild(option('', allOption ? allOption.textContent : 'Semua'))
    if (emptyOption) fragment.appendChild(option('__kosong__', emptyOption.textContent))

    places.forEach(function (place) {
      var children = place.ponds.filter(function (name) { return byName[name] })
      var hasFish = areaFacet.indexOf(place.name) >= 0
      if (!children.length && !hasFish) return
      fragment.appendChild(option(AREA + place.name, place.name, { 'data-group-head': '', 'data-search': place.name }))
      children.forEach(function (name) {
        used[name] = true
        fragment.appendChild(option(name, byName[name].textContent, { 'data-group-item': '', 'data-search': place.name }))
      })
    })
    // ponds that belong to no area of the list
    var rest = pondOptions.filter(function (o) { return !used[o.value] })
    rest.forEach(function (o) { fragment.appendChild(option(o.value, o.textContent, rest.length ? { 'data-search': NO_AREA } : {})) })

    busy = true
    select.innerHTML = ''
    select.appendChild(fragment)
    Array.prototype.forEach.call(select.options, function (o) { o.selected = !!picked[o.value] })
    observer.takeRecords()
    busy = false
  }

  var observer = new MutationObserver(function () { if (!busy) regroup() })
  observer.observe(select, { childList: true })

  // the areas that are picked now (an area option exists only while the list is grouped, so remember them)
  select.addEventListener('change', function () {
    if (busy) return
    chosenAreas = {}
    Array.prototype.forEach.call(select.selectedOptions, function (o) {
      if (o.value.indexOf(AREA) === 0) chosenAreas[o.value.slice(AREA.length)] = true
    })
  })

  load().then(regroup)
  // a fish added or moved changes which areas have fish; look again now and then
  setInterval(function () { loading = null; load().then(function () { if (!document.hidden) regroup() }) }, 120000)
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', koiLocationFilterBoot)
else koiLocationFilterBoot()
