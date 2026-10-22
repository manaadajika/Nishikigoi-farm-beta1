/*!
* Tabler v1.4.0 (https://tabler.io)
* Copyright 2018-2026 The Tabler Authors
* Copyright 2018-2026 codecalm.net Paweł Kuna
* Licensed under MIT (https://github.com/tabler/tabler/blob/master/LICENSE)
*/
(function(factory) {
	typeof define === "function" && define.amd ? define([], factory) : factory();
})(function() {
	//#region js/tabler-theme.ts
	var themeConfig = {
		"theme": "light",
		"theme-base": "gray",
		"theme-font": "sans-serif",
		"theme-primary": "blue",
		"theme-radius": "1"
	};
	var params = new Proxy(new URLSearchParams(window.location.search), { get: (searchParams, prop) => searchParams.get(prop) });
	var prefersDark = window.matchMedia("(prefers-color-scheme: dark)");
	for (const key in themeConfig) {
		const param = params[key];
		let selectedValue;
		if (!!param) {
			localStorage.setItem("tabler-" + key, param);
			selectedValue = param;
		} else {
			const storedTheme = localStorage.getItem("tabler-" + key);
			selectedValue = storedTheme ? storedTheme : themeConfig[key];
		}
		if (key === "theme" && selectedValue === "auto") selectedValue = prefersDark.matches ? "dark" : "light";
		if (selectedValue !== themeConfig[key]) document.documentElement.setAttribute("data-bs-" + key, selectedValue);
		else document.documentElement.removeAttribute("data-bs-" + key);
	}
	prefersDark.addEventListener("change", (event) => {
		if (localStorage.getItem("tabler-theme") === "auto") if (event.matches) document.documentElement.setAttribute("data-bs-theme", "dark");
		else document.documentElement.removeAttribute("data-bs-theme");
	});
	//#endregion
});

//# sourceMappingURL=tabler-theme.js.map