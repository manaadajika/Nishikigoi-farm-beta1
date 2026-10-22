/*
 * Floating action dock shared by Breeding, Data Kolam and Laporan (same look and behaviour as the dock in Data Ikan):
 * select-all, selected count (tap = show only the selected), hide selected, page actions that appear
 * while something is selected, add (+), clear (x), and a chevron that tucks the dock away.
 *
 *   var dock = KoiDock.create({
 *     root: element holding the cards (cards carry data-dock-id="<id>"),
 *     idOf: function (item) { return String(item.id) },
 *     visibleItems: function () { return items currently listed (before the dock's own filters) },
 *     render: function () { re-render the list (it must call dock.apply(items) and dock.refresh()) },
 *     label: 'breeding',
 *     actions: [{ key, icon, title, variant, role, show(count), onClick(ids) }],
 *     add: { title, role, onClick }
 *   })
 */
(function () {
  if (window.KoiDock) return
  var ICONS = {
  "triangle-up": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"currentColor\" aria-hidden=\"true\" focusable=\"false\" class=\"icon\"><path d=\"M12 6.5l7.5 11.5h-15z\" /></svg>",
  "triangle-down": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"currentColor\" aria-hidden=\"true\" focusable=\"false\" class=\"icon\"><path d=\"M12 17.5l7.5 -11.5h-15z\" /></svg>",
  "package": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\" class=\"icon\"><path d=\"M12 3l8 4.5l0 9l-8 4.5l-8 -4.5l0 -9l8 -4.5\" /><path d=\"M12 12l8 -4.5\" /><path d=\"M12 12l0 9\" /><path d=\"M12 12l-8 -4.5\" /><path d=\"M16 5.25l-8 4.5\" /></svg>",
  "basket": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\" class=\"icon\"><path d=\"M10 14a2 2 0 1 0 4 0a2 2 0 0 0 -4 0\" /><path d=\"M5.001 8h13.999a2 2 0 0 1 1.977 2.304l-1.255 7.152a3 3 0 0 1 -2.966 2.544h-9.512a3 3 0 0 1 -2.965 -2.544l-1.255 -7.152a2 2 0 0 1 1.977 -2.304\" /><path d=\"M17 10l-2 -6\" /><path d=\"M7 10l2 -6\" /></svg>",
  "package-export": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\" class=\"icon\"><path d=\"M12 21l-8 -4.5v-9l8 -4.5l8 4.5v4.5\" /><path d=\"M12 12l8 -4.5\" /><path d=\"M12 12v9\" /><path d=\"M12 12l-8 -4.5\" /><path d=\"M15 18h7\" /><path d=\"M19 15l3 3l-3 3\" /></svg>",
  "alert-triangle": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\" class=\"icon\"><path d=\"M12 9v4\" /><path d=\"M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0\" /><path d=\"M12 16h.01\" /></svg>",
  "arrows-exchange": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\" class=\"icon\"><path d=\"M7 10h14l-4 -4\" /><path d=\"M17 14h-14l4 4\" /></svg>",
  "list-check": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\" class=\"icon\"><path d=\"M3.5 5.5l1.5 1.5l2.5 -2.5\" /><path d=\"M3.5 11.5l1.5 1.5l2.5 -2.5\" /><path d=\"M3.5 17.5l1.5 1.5l2.5 -2.5\" /><path d=\"M11 6l9 0\" /><path d=\"M11 12l9 0\" /><path d=\"M11 18l9 0\" /></svg>",
  "history": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\" class=\"icon\"><path d=\"M12 8l0 4l2 2\" /><path d=\"M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5\" /></svg>",
  "tool": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\" class=\"icon\"><path d=\"M7 10h3v-3l-3.5 -3.5a6 6 0 0 1 8 8l6 6a2 2 0 0 1 -3 3l-6 -6a6 6 0 0 1 -8 -8l3.5 3.5\" /></svg>",
  "checks": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\" class=\"icon\"><path d=\"M7 12l5 5l10 -10\" /><path d=\"M2 12l5 5m5 -5l5 -5\" /></svg>",
  "eye-off": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\" class=\"icon\"><path d=\"M10.585 10.587a2 2 0 0 0 2.829 2.828\" /><path d=\"M16.681 16.673a8.717 8.717 0 0 1 -4.681 1.327c-3.6 0 -6.6 -2 -9 -6c1.272 -2.12 2.712 -3.678 4.32 -4.674m2.86 -1.146a9.055 9.055 0 0 1 1.82 -.18c3.6 0 6.6 2 9 6c-.666 1.11 -1.379 2.067 -2.138 2.87\" /><path d=\"M3 3l18 18\" /></svg>",
  "edit": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\" class=\"icon\"><path d=\"M7 7h-1a2 2 0 0 0 -2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2 -2v-1\" /><path d=\"M20.385 6.585a2.1 2.1 0 0 0 -2.97 -2.97l-8.415 8.385v3h3l8.385 -8.415\" /><path d=\"M16 5l3 3\" /></svg>",
  "copy": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\" class=\"icon\"><path d=\"M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667l0 -8.666\" /><path d=\"M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1\" /></svg>",
  "trash": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\" class=\"icon\"><path d=\"M4 7l16 0\" /><path d=\"M10 11l0 6\" /><path d=\"M14 11l0 6\" /><path d=\"M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12\" /><path d=\"M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3\" /></svg>",
  "printer": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\" class=\"icon\"><path d=\"M17 17h2a2 2 0 0 0 2 -2v-4a2 2 0 0 0 -2 -2h-14a2 2 0 0 0 -2 2v4a2 2 0 0 0 2 2h2\" /><path d=\"M17 9v-4a2 2 0 0 0 -2 -2h-6a2 2 0 0 0 -2 2v4\" /><path d=\"M7 15a2 2 0 0 1 2 -2h6a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2l0 -4\" /></svg>",
  "plus": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\" class=\"icon\"><path d=\"M12 5l0 14\" /><path d=\"M5 12l14 0\" /></svg>",
  "x": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\" class=\"icon\"><path d=\"M18 6l-12 12\" /><path d=\"M6 6l12 12\" /></svg>",
  "chevron-right": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\" class=\"icon\"><path d=\"M9 6l6 6l-6 6\" /></svg>",
  "dots": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\" class=\"icon\"><path d=\"M4 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0\" /><path d=\"M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0\" /><path d=\"M18 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0\" /></svg>",
  "download": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\" class=\"icon\"><path d=\"M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2\" /><path d=\"M7 11l5 5l5 -5\" /><path d=\"M12 4l0 12\" /></svg>",
  "file-spreadsheet": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\" class=\"icon\"><path d=\"M14 3v4a1 1 0 0 0 1 1h4\" /><path d=\"M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2\" /><path d=\"M8 11h8v7h-8l0 -7\" /><path d=\"M8 15h8\" /><path d=\"M11 11v7\" /></svg>",
  "upload": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\" class=\"icon\"><path d=\"M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2\" /><path d=\"M7 9l5 -5l5 5\" /><path d=\"M12 4l0 12\" /></svg>",
  "settings": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\" class=\"icon\"><path d=\"M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065\" /><path d=\"M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0\" /></svg>",
  "note": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\" class=\"icon\"><path d=\"M13 20l7 -7\" /><path d=\"M13 20v-6a1 1 0 0 1 1 -1h6v-7a2 2 0 0 0 -2 -2h-12a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7\" /></svg>",
  "map-pin": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\" class=\"icon\"><path d=\"M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0\" /><path d=\"M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0\" /></svg>",
  "zoom-in": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\" class=\"icon\"><path d=\"M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0\" /><path d=\"M7 10l6 0\" /><path d=\"M10 7l0 6\" /><path d=\"M21 21l-6 -6\" /></svg>",
  "list-details": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\" class=\"icon\"><path d=\"M13 5h8\" /><path d=\"M13 9h5\" /><path d=\"M13 15h8\" /><path d=\"M13 19h5\" /><path d=\"M3 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4\" /><path d=\"M3 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4\" /></svg>",
  "refresh": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\" class=\"icon\"><path d=\"M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4\" /><path d=\"M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4\" /></svg>",
  "menu-2": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\" class=\"icon\"><path d=\"M4 6l16 0\" /><path d=\"M4 12l16 0\" /><path d=\"M4 18l16 0\" /></svg>",
  "dashboard": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\" class=\"icon\"><path d=\"M10 13a2 2 0 1 0 4 0a2 2 0 1 0 -4 0\" /><path d=\"M13.45 11.55l2.05 -2.05\" /><path d=\"M6.4 20a9 9 0 1 1 11.2 0l-11.2 0\" /></svg>",
  "fish": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\" class=\"icon\"><path d=\"M16.69 7.44a6.973 6.973 0 0 0 -1.69 4.56c0 1.747 .64 3.345 1.699 4.571\" /><path d=\"M2 9.504c7.715 8.647 14.75 10.265 20 2.498c-5.25 -7.761 -12.285 -6.142 -20 2.504\" /><path d=\"M18 11v.01\" /><path d=\"M11.5 10.5c-.667 1 -.667 2 0 3\" /></svg>",
  "bowl": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\" class=\"icon\"><path d=\"M4 8h16a1 1 0 0 1 1 1v.5c0 1.5 -2.517 5.573 -4 6.5v1a1 1 0 0 1 -1 1h-8a1 1 0 0 1 -1 -1v-1c-1.687 -1.054 -4 -5 -4 -6.5v-.5a1 1 0 0 1 1 -1\" /></svg>",
  "dna-2": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\" class=\"icon\"><path d=\"M17 3v1c-.01 3.352 -1.68 6.023 -5.008 8.014c-3.328 1.99 3.336 -2 .008 -.014c-3.328 1.99 -5 4.662 -5.008 8.014v1\" /><path d=\"M17 21.014v-1c-.01 -3.352 -1.68 -6.023 -5.008 -8.014c-3.328 -1.99 3.336 2 .008 .014c-3.328 -1.991 -5 -4.662 -5.008 -8.014v-1\" /><path d=\"M7 4h10\" /><path d=\"M7 20h10\" /><path d=\"M8 8h8\" /><path d=\"M8 16h8\" /></svg>",
  "report": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\" class=\"icon\"><path d=\"M8 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h5.697\" /><path d=\"M18 14v4h4\" /><path d=\"M18 11v-4a2 2 0 0 0 -2 -2h-2\" /><path d=\"M8 5a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2\" /><path d=\"M14 18a4 4 0 1 0 8 0a4 4 0 1 0 -8 0\" /><path d=\"M8 11h4\" /><path d=\"M8 15h3\" /></svg>",
  "archive": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\" class=\"icon\"><path d=\"M3 6a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2\" /><path d=\"M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-10\" /><path d=\"M10 12l4 0\" /></svg>",
  "stack-2": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\" class=\"icon\"><path d=\"M12 4l-8 4l8 4l8 -4l-8 -4\" /><path d=\"M4 12l8 4l8 -4\" /><path d=\"M4 16l8 4l8 -4\" /></svg>",
  "photo": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\" class=\"icon\"><path d=\"M15 8h.01\" /><path d=\"M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12\" /><path d=\"M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5\" /><path d=\"M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3\" /></svg>",
  "clipboard-list": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\" class=\"icon\"><path d=\"M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2\" /><path d=\"M9 5a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2\" /><path d=\"M9 12l.01 0\" /><path d=\"M13 12l2 0\" /><path d=\"M9 16l.01 0\" /><path d=\"M13 16l2 0\" /></svg>",
  "user": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\" class=\"icon\"><path d=\"M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0\" /><path d=\"M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2\" /></svg>",
  "message": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\" class=\"icon\"><path d=\"M8 9h8\" /><path d=\"M8 13h6\" /><path d=\"M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-5l-5 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12\" /></svg>",
  "shield-lock": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\" class=\"icon\"><path d=\"M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3\" /><path d=\"M11 11a1 1 0 1 0 2 0a1 1 0 1 0 -2 0\" /><path d=\"M12 12l0 2.5\" /></svg>",
  "database": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\" class=\"icon\"><path d=\"M4 6a8 3 0 1 0 16 0a8 3 0 1 0 -16 0\" /><path d=\"M4 6v6a8 3 0 0 0 16 0v-6\" /><path d=\"M4 12v6a8 3 0 0 0 16 0v-6\" /></svg>",
  "certificate": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\" class=\"icon\"><path d=\"M12 15a3 3 0 1 0 6 0a3 3 0 1 0 -6 0\" /><path d=\"M13 17.5v4.5l2 -1.5l2 1.5v-4.5\" /><path d=\"M10 19h-5a2 2 0 0 1 -2 -2v-10c0 -1.1 .9 -2 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -1 1.73\" /><path d=\"M6 9l12 0\" /><path d=\"M6 12l3 0\" /><path d=\"M6 15l2 0\" /></svg>",
  "file-zip": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\" class=\"icon\"><path d=\"M6 20.735a2 2 0 0 1 -1 -1.735v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2h-1\" /><path d=\"M11 17a2 2 0 0 1 2 2v2a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1v-2a2 2 0 0 1 2 -2\" /><path d=\"M11 5l-1 0\" /><path d=\"M13 7l-1 0\" /><path d=\"M11 9l-1 0\" /><path d=\"M13 11l-1 0\" /><path d=\"M11 13l-1 0\" /><path d=\"M13 15l-1 0\" /></svg>",
  "file-invoice": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\" class=\"icon\"><path d=\"M14 3v4a1 1 0 0 0 1 1h4\" /><path d=\"M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2\" /><path d=\"M9 7l1 0\" /><path d=\"M9 13l6 0\" /><path d=\"M13 17l2 0\" /></svg>",
  "brand-whatsapp": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\" class=\"icon\"><path d=\"M3 21l1.65 -3.8a9 9 0 1 1 3.4 2.9l-5.05 .9\" /><path d=\"M9 10a.5 .5 0 0 0 1 0v-1a.5 .5 0 0 0 -1 0v1a5 5 0 0 0 5 5h1a.5 .5 0 0 0 0 -1h-1a.5 .5 0 0 0 0 1\" /></svg>",
  "coin": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\" class=\"icon\"><path d=\"M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0\" /><path d=\"M14.8 9a2 2 0 0 0 -1.8 -1h-2a2 2 0 1 0 0 4h2a2 2 0 1 1 0 4h-2a2 2 0 0 1 -1.8 -1\" /><path d=\"M12 7v10\" /></svg>",
  "tag": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\" class=\"icon\"><path d=\"M6.5 7.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0\" /><path d=\"M3 6v5.172a2 2 0 0 0 .586 1.414l7.71 7.71a2.41 2.41 0 0 0 3.408 0l5.592 -5.592a2.41 2.41 0 0 0 0 -3.408l-7.71 -7.71a2 2 0 0 0 -1.414 -.586h-5.172a3 3 0 0 0 -3 3\" /></svg>"
}

  function injectStyles() {
    if (document.getElementById('koi-dock-styles')) return
    var style = document.createElement('style')
    style.id = 'koi-dock-styles'
    style.textContent = [
      '.koi-dock{position:fixed;bottom:1rem;left:50%;z-index:1030;display:inline-flex;align-items:center;justify-content:center;width:max-content;max-width:calc(100vw - 2rem);padding:.35rem;border:1px solid var(--tblr-border-color);border-radius:8px;background:var(--tblr-bg-surface);box-shadow:0 18px 45px rgba(0,0,0,.34);transform:translateX(-50%);backdrop-filter:blur(10px)}',
      '.koi-dock.is-hidden{display:none}',
      '.koi-dock-actions{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:.5rem;max-width:100%}',
            '.koi-dock-actions>*{flex:0 0 auto}',
            '.koi-dock .btn-icon{position:relative}',
      '.koi-dock .btn-icon .icon{margin:0}',
      '.koi-dock .is-off{display:none!important}',
      '.koi-dock-nav{position:fixed;left:50%;z-index:1040;width:min(26rem,calc(100vw - 1.5rem));overflow:auto;padding:.75rem;border:1px solid var(--tblr-border-color);border-radius:8px;background:var(--tblr-bg-surface);box-shadow:0 18px 45px rgba(0,0,0,.34);transform:translateX(-50%)}',
      '.koi-dock-nav[hidden]{display:none}',
      '.koi-dock-nav-title{margin:.25rem 0 .35rem;font-size:.7rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--tblr-secondary)}',
      '.koi-dock-nav-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.35rem}',
      '.koi-dock-nav a{display:flex;align-items:center;gap:.5rem;min-width:0;padding:.5rem .6rem;border:1px solid var(--tblr-border-color);border-radius:6px;color:inherit;text-decoration:none;font-size:.875rem}',
      '.koi-dock-nav a:hover{border-color:var(--tblr-primary);color:var(--tblr-primary)}',
      '.koi-dock-nav a[aria-current=page]{border-color:var(--tblr-primary);background:rgba(var(--tblr-primary-rgb),.14);font-weight:600}',
      '.koi-dock-nav a .icon{flex:0 0 auto;width:1.1rem;height:1.1rem;margin:0}',
      '.koi-dock-nav a span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.koi-dock-reveal{position:fixed;bottom:1rem;right:1rem;z-index:1031;display:none;box-shadow:0 12px 32px rgba(0,0,0,.32)}',
      '.koi-dock-reveal.is-visible{display:inline-flex}',
      '.koi-dock [data-dock-count]:disabled{opacity:1}',
      '.koi-dock .koi-dock-text{font-weight:700}',
      '.koi-dock [data-dock-count]:disabled .fw-bold{opacity:.45}',
      '[data-dock-id]{border:1px solid var(--tblr-border-color);transition:border-color .15s ease,box-shadow .15s ease}',
      '[data-dock-id].is-selected{border-color:var(--tblr-primary);outline:2px solid var(--tblr-primary);outline-offset:-2px;box-shadow:0 8px 22px rgba(0,0,0,.16)}',
      '.dock-selected-badge{display:none}',
      '[data-dock-id].is-selected .dock-selected-badge{display:inline-flex}',
      '[data-dock-select]{cursor:pointer}',
      '.dock-code-copy{display:block;max-width:100%;border:0;background:transparent;color:inherit;font:inherit;font-weight:600;padding:0;text-align:left;cursor:pointer;user-select:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dock-code-copy:hover{color:var(--tblr-primary)}',
      '.dock-code-copy.is-copied{color:var(--tblr-success)}',
      '.dock-code-copy.is-copy-failed{color:var(--tblr-danger)}',
      '@media (max-width:575.98px){.koi-dock{bottom:calc(.75rem + env(safe-area-inset-bottom));max-width:calc(100vw - 1.5rem)}.koi-dock-reveal{right:.75rem;bottom:calc(.75rem + env(safe-area-inset-bottom))}}',
      '.koi-dock [data-dock-scroll-top]:disabled,.koi-dock [data-dock-scroll-bottom]:disabled,[data-koi-action-dock] [data-dock-scroll-top]:disabled,[data-koi-action-dock] [data-dock-scroll-bottom]:disabled{opacity:.35}',
      '@media print{.koi-dock,.koi-dock-reveal,.koi-dock-nav{display:none!important}}',
    ].join('')
    document.head.appendChild(style)
  }

  function button(className, key, title, iconName, extra) {
    var el = document.createElement('button')
    el.type = 'button'
    el.className = 'btn btn-icon ' + className
    el.setAttribute('data-dock-' + key, '')
    el.setAttribute('aria-label', title)
    el.setAttribute('title', title)
    if (extra && extra.role) el.setAttribute('data-role-required', extra.role)
    el.innerHTML = iconName === 'count' ? '<span class="fw-bold" data-dock-number>0</span>' : (ICONS[iconName] || '')
    return el
  }

  // Copy-on-click used for the codes on the cards (same behaviour as the fish code in Data Ikan).
  async function copyText(value) {
    var textValue = String(value || '')
    if (!textValue || textValue === '-') return false
    var textarea = document.createElement('textarea')
    textarea.value = textValue
    textarea.setAttribute('readonly', '')
    textarea.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    textarea.setSelectionRange(0, textValue.length)
    try {
      var copied = document.execCommand('copy')
      textarea.remove()
      if (copied) return true
    } catch (error) {
      textarea.remove()
    }
    try {
      await navigator.clipboard.writeText(textValue)
      return true
    } catch (error) {
      return false
    }
  }

  // "Pindah menu": a drop-up panel above the dock with every menu of the program.
  var NAV_SECTIONS = [
    { title: 'Menu utama', items: [
      ['Dashboard', 'farm.html', 'dashboard'], ['Data Ikan', 'farm-koi.html', 'fish'], ['Data Kolam', 'farm-ponds.html', 'bowl'],
      ['Breeding', 'farm-breeding.html', 'dna-2'], ['Laporan', 'farm-reports.html', 'report'], ['Katalog', 'farm-sell.html', 'tag'], ['Invoice', 'farm-invoice.html', 'file-invoice'] ] },
    { title: 'Etc', role: 'database-write', items: [
      ['Archive', 'farm-archive.html', 'archive'], ['Queue', 'farm-queue.html', 'stack-2'],
      ['Gallery', 'farm-gallery.html', 'photo'], ['Log', 'farm-log.html', 'clipboard-list'],
      ['Inventaris', 'farm-inventory.html', 'package'] ] },
  ]

  function attachNav(button, anchor) {
    if (!button || !anchor) return
    injectStyles()
    var current = (location.pathname.split('/').pop() || 'farm').replace(/\.html$/, '') || 'farm'
    var panel = document.createElement('div')
    panel.className = 'koi-dock-nav'
    panel.hidden = true
    panel.setAttribute('role', 'menu')
    panel.setAttribute('aria-label', 'Pindah menu')
    panel.innerHTML = NAV_SECTIONS.map(function (section) {
      return '<div' + (section.role ? ' data-role-required="' + section.role + '"' : '') + '>' +
        '<div class="koi-dock-nav-title">' + section.title + '</div><div class="koi-dock-nav-grid">' +
        section.items.map(function (item) {
          var page = item[1].replace(/#.*$/, '').replace(/\.html$/, '')
          var active = page === current && item[1].indexOf('#') === -1
          return '<a role="menuitem" href="./' + item[1] + '"' + (item[3] ? ' data-role-required="' + item[3] + '"' : '') + (active ? ' aria-current="page"' : '') + '>' + (ICONS[item[2]] || '') + '<span>' + item[0] + '</span></a>'
        }).join('') + '</div></div>'
    }).join('')
    document.body.appendChild(panel)

    function place() {
      var rect = anchor.getBoundingClientRect()
      panel.style.bottom = (window.innerHeight - rect.top + 8) + 'px'
      panel.style.maxHeight = Math.max(160, rect.top - 24) + 'px'
    }
    function close() {
      panel.hidden = true
      button.setAttribute('aria-expanded', 'false')
      button.classList.remove('btn-primary')
      button.classList.add('btn-outline-primary')
    }
    function open() {
      panel.hidden = false
      place()
      button.setAttribute('aria-expanded', 'true')
      button.classList.add('btn-primary')
      button.classList.remove('btn-outline-primary')
    }
    button.setAttribute('aria-haspopup', 'true')
    button.setAttribute('aria-expanded', 'false')
    button.addEventListener('click', function (event) {
      event.stopPropagation()
      if (panel.hidden) open()
      else close()
    })
    document.addEventListener('click', function (event) {
      if (!panel.hidden && !panel.contains(event.target) && !button.contains(event.target)) close()
    })
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !panel.hidden) {
        event.stopPropagation()
        close()
      }
    }, true)
    window.addEventListener('resize', function () { if (!panel.hidden) place() })
  }

  // Small result dialog (import summaries): a title, a short summary and an optional list of problems.
  // With options { confirm: true, okLabel } it is a preview: returns a Promise (true = continue, false = cancel).
  function showResult(title, summary, problems, options) {
    options = options || {}
    var decided = null
    var promise = options.confirm ? new Promise(function (resolve) { decided = resolve }) : null
    var old = document.querySelector('[data-koi-result]')
    if (old) { if (old.__koiClose) old.__koiClose(); else old.remove() }
    var overlay = document.createElement('div')
    overlay.setAttribute('data-koi-result', '')
    overlay.style.cssText = 'position:fixed;inset:0;z-index:4900;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.6)'
    function esc(value) { return String(value == null ? '' : value).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] }) }
    var list = (problems || []).length
      ? '<div class="fw-semibold mt-3 mb-1">Baris yang bermasalah (' + problems.length + ')</div><ul class="small mb-0 ps-3" style="max-height:14rem;overflow:auto">' +
        problems.slice(0, 50).map(function (line) { return '<li>' + esc(line) + '</li>' }).join('') +
        (problems.length > 50 ? '<li>dan ' + (problems.length - 50) + ' lainnya</li>' : '') + '</ul>'
      : ''
    var footer = options.confirm
      ? '<div class="card-footer d-flex justify-content-end gap-2"><button type="button" class="btn" data-result-close>Batal</button><button type="button" class="btn btn-primary" data-result-ok>' + esc(options.okLabel || 'Lanjutkan') + '</button></div>'
      : '<div class="card-footer text-end"><button type="button" class="btn btn-primary" data-result-close>Tutup</button></div>'
    overlay.innerHTML = '<div class="card" style="max-width:32rem;width:100%;max-height:90vh"><div class="card-header"><h3 class="card-title">' + esc(title) + '</h3>' +
      '<div class="card-actions"><button type="button" class="btn-close" data-result-close aria-label="Tutup"></button></div></div>' +
      '<div class="card-body" style="overflow:auto"><div style="white-space:pre-line">' + esc(summary) + '</div>' + list + '</div>' + footer + '</div>'
    var backLayer = null
    function closeOverlay() {
      overlay.remove()
      if (backLayer && window.KoiBack) window.KoiBack.closed(backLayer)
      backLayer = null
    }
    overlay.__koiClose = closeOverlay
    overlay.addEventListener('click', function (event) {
      if (event.target.closest('[data-result-ok]')) { closeOverlay(); if (decided) decided(true); return }
      if (event.target === overlay || event.target.closest('[data-result-close]')) { closeOverlay(); if (decided) decided(false) }
    })
    document.body.appendChild(overlay)
    if (window.KoiBack) backLayer = window.KoiBack.open(function () { closeOverlay(); if (decided) decided(false) })
    return promise
  }


  // Jump to the top / bottom of the page without scrolling by hand. Added to every dock (own dock of Data Ikan,
  // the docks made by create(), and the small "Pindah menu" dock of the other pages).
  function scrollButtons() {
    var up = button('btn-outline-primary', 'scroll-top', 'Ke atas', 'triangle-up')
    var down = button('btn-outline-primary', 'scroll-bottom', 'Ke bawah', 'triangle-down')
    up.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'instant' }) })
    down.addEventListener('click', function () {
      window.scrollTo({ top: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight), behavior: 'instant' })
    })
    return [up, down]
  }
  function syncScrollButtons() {
    var max = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) - window.innerHeight
    var y = window.scrollY || document.documentElement.scrollTop || 0
    document.querySelectorAll('[data-dock-scroll-top]').forEach(function (b) { b.disabled = y <= 8 })
    document.querySelectorAll('[data-dock-scroll-bottom]').forEach(function (b) { b.disabled = max <= 8 || y >= max - 8 })
  }
  var scrollSyncTimer = null
  function queueScrollSync() {
    if (scrollSyncTimer) return
    scrollSyncTimer = setTimeout(function () { scrollSyncTimer = null; syncScrollButtons() }, 80)
  }
  window.addEventListener('scroll', queueScrollSync, { passive: true })
  window.addEventListener('resize', queueScrollSync)
  new MutationObserver(queueScrollSync).observe(document.documentElement, { childList: true, subtree: true })

  function installOwnDockScroll() {
    var hide = document.querySelector('[data-koi-action-dock] [data-koi-action-dock-hide]')
    if (!hide || document.querySelector('[data-koi-action-dock] [data-dock-scroll-top]')) return
    scrollButtons().forEach(function (el) { hide.parentNode.insertBefore(el, hide) })
    syncScrollButtons()
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installOwnDockScroll)
  else installOwnDockScroll()

  function create(options) {
    injectStyles()
    var selected = new Set()
    var showSelectedOnly = false
    var hideSelected = false
    var hidden = false
    var label = options.label || 'data'

    var dock = document.createElement('div')
    dock.className = 'koi-dock'
    dock.setAttribute('data-koi-dock', '')
    var row = document.createElement('div')
    row.className = 'koi-dock-actions'
    dock.appendChild(row)

    var selectAll = button('btn-outline-primary', 'select-all', 'Pilih semua yang tampil', 'checks')
    var count = button('btn-outline-primary', 'count', 'Tampilkan yang dipilih', 'count')
    count.setAttribute('aria-pressed', 'false')
    var hideBtn = button('btn-outline-primary is-off', 'hide-selected', 'Sembunyikan yang dipilih', 'eye-off')
    hideBtn.setAttribute('aria-pressed', 'false')
    row.appendChild(selectAll)
    row.appendChild(count)
    row.appendChild(hideBtn)

    var actionButtons = (options.actions || []).map(function (action) {
      var el = button('btn-outline-' + (action.variant || 'primary') + ' is-off', 'action-' + action.key, '', action.icon || 'dots', { role: action.role })
      if (action.text) {
        el.innerHTML = action.text
        el.classList.add('koi-dock-text')
      }
      el.__action = action
      row.appendChild(el)
      return el
    })

    var addBtn = null
    if (options.add) {
      addBtn = button('btn-primary', 'add', options.add.title || 'Tambah', 'plus', { role: options.add.role })
      row.appendChild(addBtn)
    }
    var clearBtn = button('btn-outline-orange is-off', 'clear', 'Batal pilih', 'x')
    var hideDock = button('btn-outline-warning', 'hide-dock', 'Sembunyikan tombol aksi', 'chevron-right')
    row.appendChild(clearBtn)
    scrollButtons().forEach(function (el) { row.appendChild(el) })
    row.appendChild(hideDock)
    // Right next to the "hide dock" button, at the end of the row.
    var navBtn = button('btn-outline-primary', 'nav', 'Pindah menu', 'menu-2')
    row.appendChild(navBtn)

    var reveal = button('btn-warning koi-dock-reveal', 'reveal', 'Tampilkan tombol aksi', 'dots')
    document.body.appendChild(dock)
    document.body.appendChild(reveal)

    function ids() {
      return Array.from(selected)
    }

    function refresh() {
      var n = selected.size
      count.querySelector('[data-dock-number]').textContent = String(n)
      count.disabled = n === 0
      count.classList.toggle('btn-outline-primary', !showSelectedOnly)
      count.classList.toggle('btn-primary', showSelectedOnly)
      count.setAttribute('aria-pressed', showSelectedOnly ? 'true' : 'false')
      count.setAttribute('title', showSelectedOnly ? 'Tampilkan semua data' : 'Tampilkan yang dipilih')
      count.setAttribute('aria-label', showSelectedOnly ? 'Tampilkan semua data' : 'Tampilkan ' + n + ' ' + label + ' yang dipilih')
      hideBtn.classList.toggle('is-off', n === 0)
      hideBtn.classList.toggle('btn-outline-primary', !hideSelected)
      hideBtn.classList.toggle('btn-primary', hideSelected)
      hideBtn.setAttribute('aria-pressed', hideSelected ? 'true' : 'false')
      hideBtn.setAttribute('title', hideSelected ? 'Tampilkan kembali yang disembunyikan' : 'Sembunyikan yang dipilih')
      actionButtons.forEach(function (el) {
        var action = el.__action
        var visible = (action.always || n > 0) && (!action.show || action.show(n))
        el.classList.toggle('is-off', !visible)
        var title = typeof action.title === 'function' ? action.title(n) : action.title
        el.setAttribute('title', title)
        el.setAttribute('aria-label', title)
      })
      if (addBtn) addBtn.classList.toggle('is-off', n > 0)
      clearBtn.classList.toggle('is-off', n === 0)
      dock.classList.toggle('is-hidden', hidden)
      reveal.classList.toggle('is-visible', hidden)
      if (options.root) {
        options.root.querySelectorAll('[data-dock-id]').forEach(function (card) {
          card.classList.toggle('is-selected', selected.has(card.getAttribute('data-dock-id')))
        })
      }
    }

    function changed() {
      if (selected.size === 0) {
        showSelectedOnly = false
        hideSelected = false
      }
      if (showSelectedOnly || hideSelected) options.render()
      else refresh()
    }

    function toggle(id, force) {
      id = String(id)
      var on = force === undefined ? !selected.has(id) : force
      if (on) selected.add(id)
      else selected.delete(id)
      changed()
    }

    // Filters the list for "show only selected" / "hide selected".
    function apply(items) {
      var idOf = options.idOf
      if (showSelectedOnly) return items.filter(function (item) { return selected.has(idOf(item)) })
      if (hideSelected) return items.filter(function (item) { return !selected.has(idOf(item)) })
      return items
    }

    // Forget ids that no longer exist (deleted elsewhere).
    function prune(allItems) {
      var present = new Set(allItems.map(options.idOf))
      Array.from(selected).forEach(function (id) { if (!present.has(id)) selected.delete(id) })
    }

    selectAll.addEventListener('click', function () {
      options.visibleItems().forEach(function (item) { selected.add(options.idOf(item)) })
      changed()
    })
    count.addEventListener('click', function () {
      if (!selected.size) return
      showSelectedOnly = !showSelectedOnly
      if (showSelectedOnly) hideSelected = false
      options.render()
    })
    hideBtn.addEventListener('click', function () {
      if (!selected.size) return
      hideSelected = !hideSelected
      if (hideSelected) showSelectedOnly = false
      options.render()
    })
    clearBtn.addEventListener('click', function () {
      selected.clear()
      showSelectedOnly = false
      hideSelected = false
      options.render()
    })
    actionButtons.forEach(function (el) {
      el.addEventListener('click', function () {
        if (el.__action.always || selected.size) el.__action.onClick(ids(), el)
      })
    })
    if (addBtn) addBtn.addEventListener('click', function () { options.add.onClick() })
    hideDock.addEventListener('click', function () { hidden = true; refresh() })
    reveal.addEventListener('click', function () { hidden = false; refresh() })

    // Changes the label/tooltip of a button later (e.g. the A/Z sort toggle).
    function updateAction(key, patch) {
      var el = row.querySelector('[data-dock-action-' + key + ']')
      if (!el) return
      if (patch.text !== undefined) el.innerHTML = patch.text
      if (patch.title) {
        el.__action.title = patch.title
        el.setAttribute('title', patch.title)
        el.setAttribute('aria-label', patch.title)
      }
    }

    attachNav(navBtn, dock)

    refresh()
    return { updateAction: updateAction, toggle: toggle, apply: apply, prune: prune, refresh: refresh, ids: ids, isSelected: function (id) { return selected.has(String(id)) }, clear: function () { selected.clear(); showSelectedOnly = false; hideSelected = false; refresh() } }
  }

  // Pages without their own dock (Dashboard, Archive, Queue, Gallery, Log, Settings, License) get a small
  // dock that only holds the "Pindah menu" button, so the dock is the same starting point everywhere.
  var OWN_DOCK = ['farm-koi', 'farm-breeding', 'farm-ponds', 'farm-reports', 'farm-sell', 'farm-invoice', 'farm-inventory']
  var NO_DOCK = ['', 'index', 'sign-in', 'sign-up', 'forgot-password']
  function installNavOnly() {
    var page = (location.pathname.split('/').pop() || '').replace(/\.html$/, '')
    if (OWN_DOCK.indexOf(page) >= 0 || NO_DOCK.indexOf(page) >= 0) return
    injectStyles()
    var dock = document.createElement('div')
    dock.className = 'koi-dock'
    dock.setAttribute('data-koi-dock', '')
    var row = document.createElement('div')
    row.className = 'koi-dock-actions'
    scrollButtons().forEach(function (el) { row.appendChild(el) })
    var navBtn = button('btn-outline-primary', 'nav', 'Pindah menu', 'menu-2')
    row.appendChild(navBtn)
    dock.appendChild(row)
    document.body.appendChild(dock)
    attachNav(navBtn, dock)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installNavOnly)
  else installNavOnly()

  window.KoiDock = { create: create, attachNav: attachNav, copyText: copyText, showResult: showResult, icon: function (name) { return ICONS[name] || '' } }
})()
