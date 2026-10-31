// ==UserScript==
// @name            Bundle Helper Reborn 3.0
// @namespace       https://github.com/SentaiBrad/
// @author          SentaiBrad
// @version         3.0.33
// @description     Marks the Steam games you own, have wishlisted or ignored on bundle and game store sites (Humble Bundle, Fanatical, Eneba and more), including packs and bundles, with a Steam button on each game.
// @match           *://dailyindiegame.com/*
// @match           *://old.reddit.com/*
// @match           *://sgtools.info/*
// @match           *://www.sgtools.info/*
// @match           *://steamgifts.com/*
// @match           *://www.steamgifts.com/*
// @match           *://astats.astats.nl/*
// @match           *://www.fanatical.com/*
// @match           *://fanatical.com/*
// @match           *://www.indiegala.com/*
// @match           *://indiegala.com/*
// @match           *://www.humblebundle.com/*
// @match           *://humblebundle.com/*
// @match           *://steamdb.info/*
// @match           *://www.steamdb.info/*
// @match           *://steamground.com/*
// @match           *://www.steamground.com/*
// @match           *://hrkgame.com/*
// @match           *://www.hrkgame.com/*
// @match           *://gameseal.com/*
// @match           *://www.gameseal.com/*
// @match           *://itch.io/*
// @match           *://tiltify.com/*
// @match           *://www.tiltify.com/*
// @match           *://g2a.com/*
// @match           *://www.g2a.com/*
// @match           *://eneba.com/*
// @match           *://www.eneba.com/*
// @grant           GM_addStyle
// @grant           GM_getValue
// @grant           GM_openInTab
// @grant           GM_setValue
// @grant           GM_xmlhttpRequest
// @grant           unsafeWindow
// @connect         store.steampowered.com
// @icon            https://store.steampowered.com/favicon.ico
// @license         GPL-3.0-only
// @homepageURL     https://github.com/SentaiBrad/Bundle-Helper-Reborn-3.0
// @supportURL      https://github.com/SentaiBrad/Bundle-Helper-Reborn-3.0/issues
// @downloadURL https://raw.githubusercontent.com/SentaiBrad/Bundle-Helper-Reborn-3.0/main/bundle-helper-reborn.user.js
// @updateURL   https://raw.githubusercontent.com/SentaiBrad/Bundle-Helper-Reborn-3.0/main/bundle-helper-reborn.user.js
// ==/UserScript==

/*
Bundle Helper Reborn 3.0
https://github.com/SentaiBrad/Bundle-Helper-Reborn-3.0

Marks the Steam games you own, have wishlisted or ignored while you browse
bundle and game store sites. See README.md for what it shows, the supported
sites and what it saves, and CONTRIBUTING.md for how the code is organized.

License: GPL-3.0-only (https://spdx.org/licenses/GPL-3.0-only.html)
Copyright 2016-2019, 7-elephant (Bundle Helper)
Copyright 2023, Denilson Sá Maia (Bundle Helper Reborn)
Copyright 2026, SentaiBrad
*/

(function () {
	"use strict";

	//////////////////////////////////////////////////
	// Convenience functions

	// Returns the Unix timestamp in seconds (as an integer value).
	function getUnixTimestamp() {
		return Math.trunc(Date.now() / 1000);
	}

	// Returns a human-readable amount of time.
	function humanReadableSecondsAmount(seconds) {
		if (!(Number.isFinite(seconds) && seconds >= 0)) {
			return "";
		}

		const minutes = seconds / 60;
		const hours = minutes / 60;
		const days = hours / 24;

		if (days >= 10 ) return days.toFixed(0) + " days";
		if (days >= 1.5) return days.toFixed(1) + " days";
		if (hours >= 10 ) return hours.toFixed(0) + " hours";
		if (hours >= 1.5) return hours.toFixed(1) + " hours";
		if (minutes >= 1) return minutes.toFixed(0) + " minutes";
		else return "just now";
	}

	// Returns just the filename (i.e. basename) of a URL.
	function filenameFromURL(s) {
		if (!s) {
			return "";
		}

		let url;
		try {
			url = new URL(s);
		} catch {
			return "";   // not a valid URL
		}

		return url.pathname.replace(reX`^.*/`, "");
	}

	// Returns a function that runs the callback soon after it's first called,
	// then at most once per `interval` while calls keep coming. A page that never
	// stops changing (Fanatical) still gets scanned regularly.
	function throttle(callback, interval = 1000) {
		let timer = null;
		let last_run = 0;
		return function() {
			if (timer) return;
			const wait = Math.max(150, last_run + interval - Date.now());
			timer = setTimeout(() => {
				timer = null;
				last_run = Date.now();
				callback();
			}, wait);
		};
	}

	const active_mutation_observers = [];

	// Runs callback now and again whenever rootNode or anything inside it
	// changes, at most once per `interval` ms. Errors are logged, not thrown.
	function watchForChanges(rootNode, callback, interval = 500) {
		const func = throttle(() => {
			const started = performance.now();
			try {
				callback();
			} catch (error) {
				debug_log.add("error", `page scan failed: ${error?.stack ?? error}`);
			}
			const took = Math.round(performance.now() - started);
			scan_stats.count++;
			scan_stats.total_ms += took;
			scan_stats.slowest_ms = Math.max(scan_stats.slowest_ms, took);
		}, interval);
		func();
		const observer = new MutationObserver(func);
		observer.observe(rootNode, {
			subtree: true,
			childList: true,
			attributes: true,
			characterData: false,
		});
		active_mutation_observers.push(observer);
		return observer;
	}

	// watchForChanges() for every element matching the CSS selector.
	function watchAllForChanges(rootSelector, callback, interval = 500) {
		for (const root of document.querySelectorAll(rootSelector)) {
			watchForChanges(root, callback, interval);
		}
	}

	//////////////////////////////////////////////////
	// Regular expressions

	// Emulates the "x" flag for RegExp.
	// It's also known as "verbose" flag, as it allows whitespace and comments inside the regex.
	// It will probably break if the original string contains "$".
	function reX(re_string) {
		const raw = re_string.raw[0];
		let s = raw;
		// Removing comments.
		s = s.replace(/(?<!\\)\/\/.*$/gm, "");
		// Removing all whitespace.
		s = s.replace(/[ \t\r\n]+/g, "");
		return new RegExp(s);
	}

	const re_app = reX`
		( /app/ | /apps/ | appid= )
		(?<id>[0-9]+)
		\b
	`;
	const re_sub = reX`
		( /sub/ | /subs/ )
		(?<id>[0-9]+)
		\b
	`;

	// Parses a string and tries to extract the app id or the sub id.
	function parseStringForSteamId(s) {
		const match_app = re_app.exec(s);
		const match_sub = re_sub.exec(s);

		if (match_app && match_sub) {
			console.warn("The string matched both app id and sub id. This is likely a mistake.", s, match_app, match_sub);
		}

		return {
			app: Number(match_app?.groups.id ?? 0),
			sub: Number(match_sub?.groups.id ?? 0),
		};
	}

	//////////////////////////////////////////////////
	// Debug log and state (shown by the bug button in the panel)

	const debug_log = {
		max_entries: 300,
		entries: [],
		// category: "steam", "lookup", "site" or "error"
		add(category, message) {
			this.entries.push({time: new Date(), category, message});
			if (this.entries.length > this.max_entries) this.entries.shift();
			const text = `BH ${category}: ${message}`;
			if (category === "error") console.error(text); else console.info(text);
		},
		count(category) {
			return this.entries.filter((e) => e.category === category).length;
		},
	};

	const debug_state = {
		site_handler: "",
		steam_fetch: "not fetched on this page (saved data used)",
		url_at_start: location.href,
		started_ms: Math.round(performance.now()),   // ms since the page started loading
		visibility_at_start: document.visibilityState,
		first_mark_ms: null,
		fetch_hook: "not used on this site",
		fanatical_data_fallback: "not needed",
	};

	// Call whenever an item gets marked; records how long the first one took.
	function noteMarked() {
		if (debug_state.first_mark_ms === null) {
			debug_state.first_mark_ms = Math.round(performance.now());
			debug_log.add("site", `first item marked ${debug_state.first_mark_ms} ms after the page started loading`);
		}
	}

	//////////////////////////////////////////////////
	// Steam library data (owned, wishlisted, ignored), saved for 24 hours

	const steam_data_key = "bh_profile_data";
	const steam_data_time_key = "bh_profile_time";
	const steam_data_max_age = 60 * 60 * 24;  // 24 hours
	let steam_sets = null;

	function saveSteamData(data) {
		steam_sets = null;
		data.rgCurations = {};
		data.rgCurators = {};
		data.rgCuratorsIgnored = [];
		data.rgRecommendedApps = [];
		data.rgRecommendedTags = [];
		GM_setValue(steam_data_key, data);
		GM_setValue(steam_data_time_key, getUnixTimestamp());
	}

	function steamDataAge() {
		const now = getUnixTimestamp();
		const cached = GM_getValue(steam_data_time_key, 0);
		if (!cached) {
			return "";
		}
		return humanReadableSecondsAmount(now - cached);
	}

	function isSteamDataOld() {
		const now = getUnixTimestamp();
		const cached = GM_getValue(steam_data_time_key, 0);
		return now - cached > steam_data_max_age;
	}

	function fetchSteamData() {
		return new Promise((resolve, reject) => {
			function handleError(response) {
				debug_state.steam_fetch = `failed: HTTP ${response?.status ?? "none"} ${response?.statusText ?? ""}`.trim();
				debug_log.add("error", `Steam profile data request ${debug_state.steam_fetch}`);
				reject();
			}

			GM_xmlhttpRequest({
				method: "GET",
				url: "https://store.steampowered.com/dynamicstore/userdata/?t=" + getUnixTimestamp(),
				responseType: "json",
				onload: function(response) {
					if (response.status === 200) {
						resolve(response.response);
					} else {
						handleError(response);
					}
				},
				onerror: handleError,
				onabort: function() {
					debug_state.steam_fetch = "aborted";
					debug_log.add("error", "Steam profile data request aborted");
					reject();
				},
			});
		});
	}

	function refreshSteamData() {
		return fetchSteamData().then((data) => {
			const owned = data?.rgOwnedApps?.length ?? 0;
			debug_state.steam_fetch = `ok at ${new Date().toLocaleTimeString()}: ${owned} owned apps`;
			debug_log.add("steam", `profile data fetched: ${owned} owned apps, ${data?.rgOwnedPackages?.length ?? 0} owned packages, ${data?.rgWishlist?.length ?? 0} wishlisted`);
			if (!owned) debug_log.add("error", "Steam returned 0 owned apps. Usually this means you're not signed in at store.steampowered.com in this browser.");
			saveSteamData(data);
		});
	}

	function refreshSteamDataIfOld() {
		if (isSteamDataOld()) {
			return refreshSteamData();
		} else {
			return Promise.resolve();
		}
	}

	function getSteamSets() {
		if (!steam_sets) {
			const data = GM_getValue(steam_data_key, {});
			steam_sets = {
				ignoredPackages: new Set(data.rgIgnoredPackages),
				ownedApps: new Set(data.rgOwnedApps),
				ownedPackages: new Set(data.rgOwnedPackages),
				wishlist: new Set(data.rgWishlist),
				ignoredApps: new Set(Object.keys(data.rgIgnoredApps ?? {}).map((key) => Number(key))),
			};
		}
		return steam_sets;
	}

	//////////////////////////////////////////////////
	// Optional Steam Web API key (prepared, NOT used yet)
	//
	// Nothing in the script needs a key today. This only stores one so future
	// features can use it. Rules for when it does get used:
	//   - Only send it to https://api.steampowered.com (add
	//     "@connect api.steampowered.com" to the header at that point).
	//   - Never log it, never put it in the debug report, never send it anywhere else.
	//   - Every feature must still work without a key.

	const steam_api = {
		storage_name: "bh_steam_api_key",
		// Filled in by future API calls; shown in the debug report's Steam API section.
		stats: {requests: 0, failures: 0, last_request: "", last_error: ""},
		// Future API calls should report through this (never pass the key in `what`).
		noteRequest(what, ok, error) {
			this.stats.requests++;
			this.stats.last_request = `${new Date().toLocaleTimeString()} ${what}`;
			if (!ok) {
				this.stats.failures++;
				this.stats.last_error = `${new Date().toLocaleTimeString()} ${what}: ${error ?? "failed"}`;
			}
			debug_log.add(ok ? "api" : "error", `Steam API ${what}${ok ? "" : ": " + (error ?? "failed")}`);
		},
		getKey() {
			return String(GM_getValue(this.storage_name, "") || "");
		},
		// Steam Web API keys are 32 hexadecimal characters.
		isValidFormat(key) {
			return /^[0-9A-F]{32}$/i.test(key);
		},
		setKey(key) {
			GM_setValue(this.storage_name, String(key).trim());
		},
		clearKey() {
			GM_setValue(this.storage_name, "");
		},
	};

	//////////////////////////////////////////////////
	// Settings
	//
	// Every setting is one entry in this list; the settings view is built from
	// it. Saved values are checked against the list when loaded, so an old or
	// damaged value falls back to the default instead of breaking anything.

	const settings_key = "bh_settings";
	const setting_definitions = [
		{id: "panel_size", group: "Panel", label: "Size", type: "choice", default: "auto",
			choices: [["auto", "Auto"], ["small", "Small"], ["normal", "Normal"], ["large", "Large"], ["4k", "4K"]]},
		{id: "panel_corner", group: "Panel", label: "Corner", type: "choice", default: "left",
			choices: [["left", "Left"], ["right", "Right"]]},
		{id: "card_labels", group: "Marking", label: "Labels on cards", type: "switch", default: true},
		{id: "background_tabs", group: "Links", label: "Steam links open in a background tab", type: "switch", default: true},
		{id: "use_api_key", group: "Steam Web API (optional)", label: "Use my API key", type: "switch", default: false},
	];

	// Text scale for each panel size. "auto" picks one from the window width
	// (which already includes the operating system's display scaling).
	const panel_scales = {small: 0.9, normal: 1, large: 1.25, "4k": 1.6};

	let current_settings = null;

	function loadSettings() {
		const saved = GM_getValue(settings_key, {});
		current_settings = {};
		for (const definition of setting_definitions) {
			current_settings[definition.id] = isValidSetting(definition, saved?.[definition.id]) ? saved[definition.id] : definition.default;
		}
		return current_settings;
	}

	function isValidSetting(definition, value) {
		if (definition.type === "switch") return typeof value === "boolean";
		return definition.choices.some(([choice]) => choice === value);
	}

	function getSetting(id) {
		return (current_settings ?? loadSettings())[id];
	}

	function setSetting(id, value) {
		const definition = setting_definitions.find((d) => d.id === id);
		if (!definition || !isValidSetting(definition, value)) return;
		getSetting(id);
		current_settings[id] = value;
		GM_setValue(settings_key, current_settings);
		debug_log.add("settings", `${definition.label} = ${value}`);
		if (id === "use_api_key") {
			// Another account's data must never carry over: forget everything
			// saved and fetch the Steam data again.
			clearSavedLookups();
			refreshSteamData().catch(() => {});
		}
		applySettings();
	}

	function panelScale() {
		const size = getSetting("panel_size");
		if (size !== "auto") return panel_scales[size];
		if (window.innerWidth >= 2400) return panel_scales["4k"];
		if (window.innerWidth >= 1600) return panel_scales.large;
		return panel_scales.normal;
	}

	// Page-wide effects of the settings; the panel applies its own on update.
	function applySettings() {
		document.documentElement.classList.toggle("bh_no_card_labels", !getSetting("card_labels"));
		the_panel?.applyLayout();
		the_panel?.update();
	}

	//////////////////////////////////////////////////
	// What happened on this page, for the debug view

	// Every item the script looked at: its name on the page, where its Steam
	// data came from, and the lookup result (null when nothing matched).
	const page_items = [];

	// The same item seen again (a site redrawing its cards) is listed once.
	function recordItem(name, source, match) {
		const item = {name: String(name ?? "").trim().slice(0, 120) || "(no name)", source, match};
		const key = `${item.name}\n${source}\n${match ? `${match.type} ${match.id ?? match.members?.length}` : "miss"}`;
		if (recorded_items.has(key)) return;
		recorded_items.add(key);
		page_items.push(item);
		schedulePanelUpdate();
	}
	const recorded_items = new Set();

	// Requests made on this page, by where they went.
	const request_counts = {steam_search: 0, steam_app_details: 0, fanatical: 0, saved: 0};

	// How many items each site rule found on its latest scan. A rule that
	// suddenly finds 0 usually means the site changed its layout.
	const rule_counts = new Map();

	function noteRule(rule, found) {
		rule_counts.set(rule, found);
	}

	const scan_stats = {count: 0, total_ms: 0, slowest_ms: 0, last: null};

	// The state of one item as shown in the debug view: a marking class (for
	// the colored dot) and a short description.
	function itemState(match) {
		if (!match) return {css: "miss", text: "no match"};
		if (match.type === "pack") {
			const state = packState(match.members);
			return {css: state.css, text: state.label || `pack of ${match.members.length}, none owned`};
		}
		const css = classForMatch(match);
		const words = {bh_owned: "owned", bh_wished: "wishlisted", bh_ignored: "ignored"};
		return {css, text: `${words[css] ?? "not owned"}, ${match.type} ${match.id}`};
	}

	//////////////////////////////////////////////////
	// Corner panel
	//
	// Shows the Steam data summary; the gear opens settings, the bug opens the
	// debug report, [−] minimizes it to a small bar (clicking the bar opens it
	// again; remembered on every site). It lives in a shadow root, so the
	// site's styles can't reach it, and it takes after Steam's colors without
	// imitating Steam.

	const panel_minimized_key = "bh_panel_minimized";
	const issues_url = "https://github.com/SentaiBrad/Bundle-Helper-Reborn-3.0/issues/new";
	let the_panel = null;

	const panel_icons = {
		gear: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.4-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3.3h-4l-.4 2.7a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.4L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.4 2.5-1a7.4 7.4 0 0 0 1.7 1l.4 2.7h4l.4-2.7a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.4zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"/></svg>`,
		bug: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3.5 7.6 2.1l1-1L10.3 2.8a5 5 0 0 1 3.4 0L15.4 1.1l1 1L15 3.5A5 5 0 0 1 17 7H7a5 5 0 0 1 2-3.5Z"/><path d="M6 8h12v6a6 6 0 0 1-5.25 5.95V11h-1.5v8.95A6 6 0 0 1 6 14V8Z"/><path d="M1 9h4v1.5H1zM19 9h4v1.5h-4zM1 13.25h4v1.5H1zM19 13.25h4v1.5h-4zM2.5 19.5 5.6 16.4l1.1 1.06-3.1 3.1zM21.5 19.5l-3.1-3.1-1.1 1.06 3.1 3.1z"/></svg>`,
		minimize: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 11h14v2H5z"/></svg>`,
	};

	// Steam's store colors (read from store.steampowered.com, 2026-10-30) and a
	// system font. Sizes are in em, so the panel size setting scales everything.
	const panel_css = `
		:host { all: initial; }
		.panel, .bar {
			box-sizing: border-box;
			font: 1em/1.5 Arial, Helvetica, sans-serif;
			color: rgb(198, 212, 223);
			background: rgb(15, 25, 36);
			border: 1px solid #2a475e;
			border-radius: 0.4em 0.4em 0 0;
			box-shadow: 0 0.3em 1em rgba(0, 0, 0, 0.5);
		}
		.panel { width: 25em; }
		/* The minimized bar reaches down to the bottom edge, with its text at the
		   top, clear of the link and loading text browsers show in the bottom
		   corner. */
		.bar { display: flex; align-items: center; gap: 0.8em; padding: 0.3em 0.8em calc(0.3em + 26px); cursor: pointer; white-space: nowrap; }
		.bar:hover { background: rgb(23, 29, 37); }
		[hidden] { display: none !important; }
		.head { display: flex; align-items: center; gap: 0.3em; padding: 0.4em 0.6em; background: rgb(23, 29, 37); border-bottom: 1px solid #2a475e; }
		.head b { flex: 1; color: #fff; font-weight: bold; }
		button { all: unset; box-sizing: border-box; cursor: pointer; }
		button:focus-visible { outline: 1px solid #66c0f4; }
		.icon { display: inline-flex; align-items: center; justify-content: center; width: 1.8em; height: 1.6em; border-radius: 0.25em; color: rgb(198, 212, 223); }
		.icon svg { width: 1.15em; height: 1.15em; fill: currentColor; }
		.icon:hover, .icon.on { background: #2a475e; color: #fff; }
		.body { padding: 0.5em 0.8em 0.7em; }
		.row { display: flex; justify-content: space-between; gap: 1em; }
		.owned { color: #22e07a; } .wished { color: #3db8ff; } .ignored { color: #9a9a9a; } .partial { color: #c792ff; }
		.link { color: #66c0f4; text-decoration: underline; cursor: pointer; }
		.actions { display: flex; flex-wrap: wrap; gap: 0.4em; margin-top: 0.5em; }
		.button { padding: 0.15em 0.7em; border-radius: 0.2em; background: #2a475e; color: #fff; font-size: 0.92em; }
		.button:hover { background: #66c0f4; color: rgb(15, 25, 36); }
		.group { margin: 0.7em 0 0.2em; font-size: 0.8em; font-weight: bold; letter-spacing: 0.1em; color: #8ea2b8; text-transform: uppercase; }
		.setting { display: flex; justify-content: space-between; align-items: center; gap: 1em; min-height: 1.8em; }
		.switch { position: relative; width: 2.2em; height: 1.15em; border-radius: 1em; background: #4b5a6b; flex: none; }
		.switch::after { content: ""; position: absolute; top: 0.15em; left: 0.15em; width: 0.85em; height: 0.85em; border-radius: 50%; background: #fff; }
		.switch[aria-checked="true"] { background: #22e07a; }
		.switch[aria-checked="true"]::after { left: auto; right: 0.15em; }
		.choices { display: flex; border: 1px solid #4b5a6b; border-radius: 0.2em; overflow: hidden; flex: none; }
		.choices button { padding: 0 0.5em; font-size: 0.92em; }
		.choices button[aria-pressed="true"] { background: #2a475e; color: #fff; }
		input { box-sizing: border-box; width: 100%; margin-top: 0.3em; padding: 0.15em 0.3em; font: 0.92em monospace; color: rgb(198, 212, 223); background: rgb(23, 29, 37); border: 1px solid #4b5a6b; }
		.note { color: #8ea2b8; font-size: 0.92em; }
		.tabs { display: flex; align-items: center; gap: 0.4em; padding: 0.45em 0.7em; border-bottom: 1px solid #2a475e; }
		.tabs button { padding: 0.1em 0.6em; border-radius: 0.2em; }
		.tabs button[aria-pressed="true"] { background: #2a475e; color: #fff; }
		.tabs .spacer { flex: 1; }
		.scroll { max-height: 45vh; overflow-y: auto; }
		pre { margin: 0; padding: 0.7em 0.9em; font: 0.9em/1.6 monospace; white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; }
		.item { display: grid; grid-template-columns: 0.8em 1fr; column-gap: 0.6em; row-gap: 0.1em; padding: 0.45em 0.9em; border-bottom: 1px solid rgb(23, 29, 37); line-height: 1.35; }
		.item small { grid-column: 2; color: #8ea2b8; font-size: 0.85em; }
		.dot { width: 0.65em; height: 0.65em; margin-top: 0.4em; border-radius: 50%; border: 1px solid #4b5a6b; box-sizing: border-box; }
		.dot.bh_owned { background: #22e07a; border: none; } .dot.bh_wished { background: #3db8ff; border: none; }
		.dot.bh_ignored { border: 2px dashed #9a9a9a; } .dot.bh_partial { background: #c792ff; border: none; } .dot.miss { background: #e05555; border: none; }
		.foot { display: flex; justify-content: space-between; padding: 0.4em 0.8em; border-top: 1px solid #2a475e; font-size: 0.92em; }
		.copied { color: #22e07a; }
	`;

	const panel_html = `
		<div class="bar" id="bar" role="button" tabindex="0" title="Open Bundle Helper" hidden>
			<b>Bundle Helper</b>
			<span class="owned" id="bar-owned"></span>
			<span class="wished" id="bar-wished"></span>
			<span class="ignored" id="bar-ignored"></span>
			<span class="note" id="bar-age"></span>
		</div>
		<div class="panel" id="panel">
			<div class="head">
				<b id="title">Bundle Helper</b>
				<button class="icon" id="open-settings" title="Settings">${panel_icons.gear}</button>
				<button class="icon" id="open-debug" title="Debug report">${panel_icons.bug}</button>
				<button class="icon" id="minimize" title="Minimize">${panel_icons.minimize}</button>
			</div>
			<div class="body" id="view-main">
				<div class="row"><span>Steam data</span><span><span id="age"></span> · <span class="link" id="refresh" role="button" tabindex="0">refresh</span></span></div>
				<div class="row"><span class="owned">Owned</span><span id="owned"></span></div>
				<div class="row"><span class="wished">Wishlist</span><span id="wishlist"></span></div>
				<div class="row"><span class="ignored">Ignored</span><span id="ignored"></span></div>
				<div class="row"><span>This page</span><span id="page"></span></div>
				<div class="actions"><button class="button" id="retry" title="Forget titles that weren't found and look them up again">Retry misses</button></div>
			</div>
			<div class="body" id="view-settings" hidden></div>
			<div id="view-debug" hidden>
				<div class="tabs">
					<button data-tab="overview" aria-pressed="true">Overview</button>
					<button data-tab="items" aria-pressed="false">Items</button>
					<button data-tab="log" aria-pressed="false">Log</button>
					<span class="spacer"></span>
					<button class="button" id="copy" title="Copy the full report (all tabs)">Copy all</button>
				</div>
				<div class="scroll" id="debug-body"></div>
				<div class="foot"><span id="copy-note"></span><a class="link" id="report" target="_blank" rel="noopener">Report a problem</a></div>
			</div>
		</div>
	`;

	function createPanel() {
		const host = document.createElement("bundle-helper");
		const shadow = host.attachShadow({mode: "open"});
		shadow.innerHTML = `<style>${panel_css}</style>${panel_html}`;
		const $ = (selector) => shadow.querySelector(selector);
		let view = "main";
		let debug_tab = "overview";

		function showView(name) {
			view = view === name ? "main" : name;
			$("#view-main").hidden = view !== "main";
			$("#view-settings").hidden = view !== "settings";
			$("#view-debug").hidden = view !== "debug";
			$("#open-settings").classList.toggle("on", view === "settings");
			$("#open-debug").classList.toggle("on", view === "debug");
			$("#title").textContent = {main: "Bundle Helper", settings: "Settings", debug: "Debug"}[view];
			panel.update();
		}

		function setMinimized(minimized) {
			GM_setValue(panel_minimized_key, minimized);
			$("#bar").hidden = !minimized;
			$("#panel").hidden = minimized;
			if (!minimized) panel.update();
		}

		// Every panel action is logged, and an error in one can't break the panel.
		const onClick = (selector, action) => $(selector).addEventListener("click", (ev) => {
			ev.preventDefault();
			debug_log.add("panel", `clicked ${selector}`);
			try {
				action(ev);
			} catch (error) {
				debug_log.add("error", `panel action ${selector} failed: ${error?.stack ?? error}`);
			}
		});
		onClick("#open-settings", () => showView("settings"));
		onClick("#open-debug", () => showView("debug"));
		onClick("#minimize", () => setMinimized(true));
		onClick("#bar", () => setMinimized(false));
		$("#bar").addEventListener("keydown", (ev) => { if (ev.key === "Enter") setMinimized(false); });
		onClick("#refresh", () => refreshSteamData().catch(() => {}).finally(() => panel.update()));
		onClick("#retry", () => {
			const removed = clearSavedMisses();
			debug_log.add("lookup", `cleared ${removed} saved misses, reloading page`);
			location.reload();
		});
		for (const tab of shadow.querySelectorAll("[data-tab]")) {
			tab.addEventListener("click", () => {
				debug_tab = tab.dataset.tab;
				for (const other of shadow.querySelectorAll("[data-tab]")) other.setAttribute("aria-pressed", String(other === tab));
				panel.update();
			});
		}
		onClick("#copy", () => copyReport(buildDebugReport("all"), $("#debug-body"), $("#copy-note")));
		buildSettingsView($("#view-settings"));

		const panel = {
			host,
			applyLayout() {
				host.style.fontSize = `${12 * panelScale()}px`;
				const right = getSetting("panel_corner") === "right";
				host.style.left = right ? "auto" : "0";
				host.style.right = right ? "0" : "auto";
			},
			update() {
				try {
					this.render();
				} catch (error) {
					debug_log.add("error", `panel update failed: ${error?.stack ?? error}`);
				}
			},
			render() {
				const sets = getSteamSets();
				$("#bar-owned").textContent = `${sets.ownedApps.size.toLocaleString()} owned`;
				$("#bar-wished").textContent = `${sets.wishlist.size.toLocaleString()} wishlist`;
				$("#bar-ignored").textContent = `${sets.ignoredApps.size.toLocaleString()} ignored`;
				$("#bar-age").textContent = steamDataAge() ? `fetched ${steamDataAge() === "just now" ? "just now" : `${steamDataAge()} ago`}` : "never fetched";
				if ($("#panel").hidden) return;
				if (view === "main") updateMainView($, sets);
				if (view === "settings") updateSettingsView($("#view-settings"));
				if (view === "debug") updateDebugView($("#debug-body"), debug_tab);
				$("#report").href = `${issues_url}?title=${encodeURIComponent(`Problem on ${location.hostname} (version ${GM_info?.script?.version ?? "unknown"})`)}`;
			},
		};
		panel.applyLayout();
		setMinimized(GM_getValue(panel_minimized_key, false) === true);
		return panel;
	}

	// "1 app", "2 apps"
	function plural(n, word) {
		return `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
	}

	function updateMainView($, sets) {
		const age = steamDataAge();
		$("#age").textContent = !age ? "never fetched" : age === "just now" ? "fetched just now" : `${age} ago`;
		$("#owned").textContent = `${plural(sets.ownedApps.size, "app")} · ${plural(sets.ownedPackages.size, "package")}`;
		$("#wishlist").textContent = plural(sets.wishlist.size, "app");
		$("#ignored").textContent = plural(sets.ignoredApps.size, "app");
		const count = (css) => document.querySelectorAll(`.${css}`).length;
		const page = $("#page");
		page.textContent = "";
		const parts = [["owned", count("bh_owned"), "owned"], ["wished", count("bh_wished"), "wishlist"], ["partial", count("bh_partial"), "partly owned"]];
		for (const [css, n, word] of parts) {
			if (page.childNodes.length) page.append(" · ");
			const part = document.createElement("span");
			part.className = css;
			part.textContent = `${n} ${word}`;
			page.append(part);
		}
	}

	// Builds the settings view from setting_definitions, grouped by `group`,
	// plus the API key field and the data buttons.
	function buildSettingsView(container) {
		let group = "";
		for (const definition of setting_definitions) {
			if (definition.group !== group) {
				group = definition.group;
				const heading = document.createElement("div");
				heading.className = "group";
				heading.textContent = group;
				container.append(heading);
			}
			const row = document.createElement("div");
			row.className = "setting";
			const label = document.createElement("span");
			label.textContent = definition.label;
			row.append(label);
			if (definition.type === "switch") {
				const control = document.createElement("button");
				control.className = "switch";
				control.setAttribute("role", "switch");
				control.dataset.setting = definition.id;
				control.title = definition.label;
				control.addEventListener("click", () => setSetting(definition.id, !getSetting(definition.id)));
				row.append(control);
			} else {
				const choices = document.createElement("span");
				choices.className = "choices";
				for (const [value, text] of definition.choices) {
					const choice = document.createElement("button");
					choice.textContent = text;
					choice.dataset.setting = definition.id;
					choice.dataset.value = value;
					choice.addEventListener("click", () => setSetting(definition.id, value));
					choices.append(choice);
				}
				row.append(choices);
			}
			container.append(row);
		}

		// The key itself is never shown again after saving, only its last 4 characters.
		const key_input = document.createElement("input");
		key_input.type = "password";
		key_input.autocomplete = "off";
		key_input.spellcheck = false;
		key_input.placeholder = "32-character key";
		const key_status = document.createElement("div");
		key_status.className = "note";
		key_status.id = "api-key-status";
		const key_actions = document.createElement("div");
		key_actions.className = "actions";
		const addButton = (parent, text, title, action) => {
			const button = document.createElement("button");
			button.className = "button";
			button.textContent = text;
			button.title = title;
			button.addEventListener("click", () => {
				debug_log.add("panel", `clicked ${text}`);
				try {
					action();
				} catch (error) {
					debug_log.add("error", `panel action ${text} failed: ${error?.stack ?? error}`);
				}
			});
			parent.append(button);
		};
		addButton(key_actions, "Save key", "Save the key in your userscript manager", () => {
			const key = key_input.value.trim();
			if (!steam_api.isValidFormat(key)) {
				key_status.textContent = "Not saved: a key is 32 letters and digits (0-9, A-F).";
				return;
			}
			steam_api.setKey(key);
			key_input.value = "";
			debug_log.add("settings", "Steam Web API key saved");
			the_panel?.update();
		});
		addButton(key_actions, "Clear key", "Remove the saved key", () => {
			steam_api.clearKey();
			debug_log.add("settings", "Steam Web API key cleared");
			the_panel?.update();
		});
		container.append(key_input, key_status, key_actions);

		const data_heading = document.createElement("div");
		data_heading.className = "group";
		data_heading.textContent = "Saved data";
		const data_actions = document.createElement("div");
		data_actions.className = "actions";
		addButton(data_actions, "Refresh Steam data", "Fetch your owned, wishlisted and ignored lists again", () => {
			refreshSteamData().catch(() => {}).finally(() => the_panel?.update());
		});
		addButton(data_actions, "Retry misses", "Forget titles that weren't found and look them up again", () => {
			clearSavedMisses();
			location.reload();
		});
		addButton(data_actions, "Clear saved lookups", "Forget every saved title, product and bundle lookup", () => {
			clearSavedLookups();
			location.reload();
		});
		const note = document.createElement("div");
		note.className = "note";
		note.textContent = "Nothing uses the API key yet. Switching it clears saved lookups and fetches your Steam data again.";
		container.append(note, data_heading, data_actions);
	}

	function updateSettingsView(container) {
		for (const control of container.querySelectorAll("[data-setting]")) {
			const value = getSetting(control.dataset.setting);
			if (control.classList.contains("switch")) control.setAttribute("aria-checked", String(value));
			else control.setAttribute("aria-pressed", String(control.dataset.value === value));
		}
		const key = steam_api.getKey();
		container.querySelector("#api-key-status").textContent = key ? `Key saved (ends in ${key.slice(-4)}).` : "No key saved.";
	}

	function updateDebugView(container, tab) {
		container.textContent = "";
		if (tab !== "items") {
			const pre = document.createElement("pre");
			pre.textContent = buildDebugReport(tab);
			container.append(pre);
			return;
		}
		if (!page_items.length) {
			const pre = document.createElement("pre");
			pre.textContent = "No items seen on this page yet.";
			container.append(pre);
			return;
		}
		for (const item of page_items) {
			const state = itemState(item.match);
			const row = document.createElement("div");
			row.className = "item";
			const dot = document.createElement("span");
			dot.className = `dot ${state.css}`;
			const name = document.createElement("span");
			name.textContent = `${item.name}: ${state.text}`;
			const source = document.createElement("small");
			source.textContent = item.source;
			row.append(dot, name, source);
			container.append(row);
		}
	}

	// Copies the report; when the clipboard is blocked, shows it selected so
	// Ctrl+C works.
	function copyReport(text, body, note) {
		const done = (message) => {
			note.textContent = message;
			note.className = "copied";
			clearTimeout(note.bh_timer);
			note.bh_timer = setTimeout(() => { note.textContent = ""; }, 2500);
		};
		const fallback = () => {
			body.textContent = "";
			const pre = document.createElement("pre");
			pre.textContent = text;
			body.append(pre);
			const range = document.createRange();
			range.selectNodeContents(pre);
			const selection = window.getSelection();
			selection.removeAllRanges();
			selection.addRange(range);
			done("Selected, press Ctrl+C");
		};
		if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => done("Copied"), fallback);
		else fallback();
	}

	// Updates the panel at most once a second while things are being marked.
	const schedulePanelUpdate = throttle(() => the_panel?.update(), 1000);

	// Plain-text report: [Section] headers and "Setting = value" lines.
	// tab: "overview", "items", "log" or "all" (everything, used by Copy all).
	// Never includes anything that identifies the user: the page address has
	// no query or #hash, and the API key only shows its last 4 characters.
	function buildDebugReport(tab = "all") {
		const lines = [];
		const section = (name) => {
			if (lines.length) lines.push("");
			lines.push(`[${name}]`);
		};
		const value = (name, val) => lines.push(`${name} = ${val}`);
		const count = (selector) => document.querySelectorAll(selector).length;
		const want = (name) => tab === "all" || tab === name;
		const info = (typeof GM_info !== "undefined") ? GM_info : null;

		if (tab === "all") {
			lines.push("Bundle Helper Reborn debug report");
			value("Generated", new Date().toISOString());
		}

		if (want("overview")) {
			section("Script");
			value("Version", info?.script?.version ?? "unknown");
			value("Manager", info ? `${info.scriptHandler ?? "unknown"} ${info.version ?? ""}`.trim() : "unknown");
			value("Update URL", info?.script?.updateURL || info?.script?.downloadURL || info?.scriptUpdateURL || "unknown");
			value("Injection mode", info?.sandboxMode ?? info?.injectInto ?? "unknown");
			value("Browser", navigator.userAgent);
			value("Script started", `${debug_state.started_ms} ms after the page started loading`);
			value("First item marked", debug_state.first_mark_ms === null ? "not yet" : `${debug_state.first_mark_ms} ms after the page started loading`);

			section("Page");
			value("Page", location.origin + location.pathname);
			value("Page at script start", location.href === debug_state.url_at_start ? "same" : `${debug_state.url_at_start.split(/[?#]/)[0]} (the site changed pages without reloading)`);
			value("Site handler", debug_state.site_handler || "none (this host has no handler)");
			value("Window", `${window.innerWidth} x ${window.innerHeight}, ${document.visibilityState} (${debug_state.visibility_at_start} when the script started)`);
			value("Page language", document.documentElement.lang || "not set");

			section("Settings");
			for (const definition of setting_definitions) value(definition.label, getSetting(definition.id));
			value("Panel scale", panelScale());

			section("Steam data");
			const sets = getSteamSets();
			const fetched = GM_getValue(steam_data_time_key, 0);
			value("Last fetched", fetched ? `${new Date(fetched * 1000).toISOString()} (${steamDataAge()} ago)` : "never");
			value("Fetch on this page", debug_state.steam_fetch);
			value("Owned apps", sets.ownedApps.size);
			value("Owned packages", sets.ownedPackages.size);
			value("Wishlisted apps", sets.wishlist.size);
			value("Ignored apps", sets.ignoredApps.size);
			value("Ignored packages", sets.ignoredPackages.size);
			if (!sets.ownedApps.size) value("Warning", "no owned apps saved; sign in at store.steampowered.com, then click refresh");

			section("Saved lookups");
			const saved = Object.entries(loadSavedLookups());
			const kind = (key) => key.startsWith("fanatical-contents:") ? "Fanatical products" : "Titles";
			for (const name of ["Titles", "Fanatical products"]) {
				const entries = saved.filter(([key]) => kind(key) === name);
				value(name, `${entries.filter(([, e]) => e.match).length} found, ${entries.filter(([, e]) => !e.match).length} not found`);
			}
			value("Saved format version", saved_lookups_version);

			section("Requests on this page");
			value("Steam search", request_counts.steam_search);
			value("Steam app details", request_counts.steam_app_details);
			value("Fanatical data", request_counts.fanatical);
			value("Answered from saved lookups", request_counts.saved);

			section("This page");
			value("Items seen", page_items.length);
			value("Marked owned", count(".bh_owned"));
			value("Marked wishlisted", count(".bh_wished"));
			value("Marked ignored", count(".bh_ignored"));
			value("Marked partly owned packs", count(".bh_partial"));
			value("Marked packs", count(".bh_pack"));
			value("Steam buttons", count(".bh_steamlink"));
			value("Processed elements", count(".bh_already_processed"));
			value("Page watchers", active_mutation_observers.length);
			value("Page scans", `${scan_stats.count}, slowest ${scan_stats.slowest_ms} ms, average ${scan_stats.count ? Math.round(scan_stats.total_ms / scan_stats.count) : 0} ms`);
			const duplicates = [...document.querySelectorAll(".bh_already_processed")].filter((el) => el.querySelectorAll(".bh_steamlink").length > 1).length;
			value("Items with more than one Steam button", duplicates);
			for (const [rule, found] of rule_counts) value(`Found by ${rule}`, found);
			if (debug_state.site_handler === "fanatical.com") {
				value("Fanatical fetch hook", debug_state.fetch_hook);
				value("Fanatical covers with Steam data", `${fanatical_cover_map.size}${fanatical_cover_map.size ? "" : " (0 after the page loaded means the hook isn't seeing Fanatical's data)"}`);
				value("Fanatical data fallback", debug_state.fanatical_data_fallback);
			}
			value("Errors this page", debug_log.count("error"));

			section("Steam API");
			const key = steam_api.getKey();
			value("Key", key ? `set (ends in ${key.slice(-4)})` : "not set");
			value("Key format", key ? (steam_api.isValidFormat(key) ? "valid (32 hex characters)" : "INVALID") : "n/a");
			value("Used by", "nothing yet");
			value("Requests this page", steam_api.stats.requests);
			value("Failed requests", steam_api.stats.failures);
			value("Last error", steam_api.stats.last_error || "none");
		}

		if (want("items")) {
			section("Items (name = result, source)");
			for (const item of page_items) value(item.name, `${itemState(item.match).text}, from ${item.source}`);
			if (!page_items.length) lines.push("(none yet)");
		}

		if (want("log")) {
			section("Log (newest last)");
			for (const entry of debug_log.entries) {
				lines.push(`${entry.time.toLocaleTimeString()} ${entry.category}: ${entry.message}`);
			}
			if (!debug_log.entries.length) lines.push("(empty)");
		}
		return lines.join("\n");
	}

	function addBundleHelperUI() {
		the_panel = createPanel();
		document.body.appendChild(the_panel.host);
		refreshSteamDataIfOld().catch(() => {}).finally(() => the_panel.update());
		return the_panel;
	}

	//////////////////////////////////////////////////
	// Marking functions

	function getClassForAppId(app) {
		if (!app) return "";
		const sets = getSteamSets();
		if (sets.ownedApps.has(app)) return "bh_owned";
		if (sets.wishlist.has(app)) return "bh_wished";
		if (sets.ignoredApps.has(app)) return "bh_ignored";
		return "";
	}

	function getClassForSubId(sub) {
		if (!sub) return "";
		const sets = getSteamSets();
		if (sets.ownedPackages.has(sub)) return "bh_owned";
		if (sets.ignoredPackages.has(sub)) return "bh_ignored";
		return "";
	}

	// Create a new <a> link element to the appropriate Steam URL.
	function steamUrl(app_or_sub, id) {
		return `https://store.steampowered.com/${app_or_sub}/${id}`;
	}

	// Clicking opens the Steam page in a background tab, like a middle-click,
	// so the store page keeps focus.
	function createSteamLink(app_or_sub, id) {
		const a = createSteamButton(steamUrl(app_or_sub, id));
		a.addEventListener("click", function(ev) {
			ev.stopPropagation();
			if (!getSetting("background_tabs")) return;   // follow the link normally
			ev.preventDefault();
			GM_openInTab(a.href, {active: false});
		});
		return a;
	}

	// The Steam button for a pack opens a list of the games inside (see
	// openPackMenu). Middle-click still opens the first game, from the href.
	function createPackButton(members) {
		const first = members.find((member) => member.type === "app" || member.type === "sub");
		const a = createSteamButton(first ? steamUrl(first.type, first.id) : "https://store.steampowered.com/");
		a.title = "Games in this pack";
		a.addEventListener("click", function(ev) {
			ev.preventDefault();
			ev.stopPropagation();
			openPackMenu(a, members);
		});
		return a;
	}

	function createSteamButton(url) {
		// Copied from: https://github.com/edent/SuperTinyIcons/blob/master/images/svg/steam.svg
		const svg = `
			<svg xmlns="http://www.w3.org/2000/svg" aria-label="Steam" role="img" viewBox="0 0 512 512" fill="#ebebeb">
				<path d="m0 0H512V512H0" fill="#231f20"/>
				<path d="m183 280 41 28 27 41 87-62-94-96"/>
				<circle cx="325" cy="191" r="74" fill="none" stroke="#ebebeb" stroke-width="33"/>
				<ellipse cx="191" cy="340" fill="none" rx="56" ry="56" stroke="#ebebeb" stroke-width="33"/>
			</svg>
		`;
		const a = document.createElement("a");
		a.href = url;
		a.innerHTML = svg;
		a.className = "bh_steamlink";
		return a;
	}

	//////////////////////////////////////////////////
	// Pack menu: the games inside a pack, each with its state and a link

	let open_pack_menu = null;

	function closePackMenu() {
		open_pack_menu?.remove();
		open_pack_menu = null;
	}

	// Clicks outside the menu, Esc and scrolling close it.
	document.addEventListener("click", (ev) => {
		if (open_pack_menu && !open_pack_menu.contains(ev.target)) closePackMenu();
	}, true);
	document.addEventListener("keydown", (ev) => {
		if (ev.key === "Escape") closePackMenu();
	});
	window.addEventListener("scroll", closePackMenu, {passive: true});

	const pack_member_states = {
		bh_owned: {text: "OWNED", css: "owned"},
		bh_wished: {text: "WISHLIST", css: "wished"},
		bh_ignored: {text: "IGNORED", css: "ignored"},
	};

	function openPackMenu(button, members) {
		const was_open_here = open_pack_menu?.bh_button === button;
		closePackMenu();
		if (was_open_here) return;

		const menu = document.createElement("bh-pack-menu");
		menu.bh_button = button;
		const head = document.createElement("bh-pack-head");
		head.textContent = `${members.length} GAMES IN THIS PACK`;
		menu.append(head);

		for (const member of members) {
			const found = member.type === "app" || member.type === "sub";
			const row = document.createElement(found ? "a" : "bh-pack-row");
			row.className = "bh_pack_row";
			const state = found ? pack_member_states[classForMatch(member)] : null;
			const dot = document.createElement("bh-pack-dot");
			dot.className = state?.css ?? "none";
			const name = document.createElement("bh-pack-name");
			name.textContent = member.name || (found ? `Steam ${member.type} ${member.id}` : "Unknown game");
			const tag = document.createElement("bh-pack-tag");
			tag.className = state?.css ?? "";
			tag.textContent = found ? (state?.text ?? "") : "NOT ON STEAM";
			row.append(dot, name, tag);
			if (found) {
				row.href = steamUrl(member.type, member.id);
				// Opens in a background tab, like a middle-click, so the store
				// page keeps focus and the menu stays open.
				row.addEventListener("click", (ev) => {
					ev.stopPropagation();
					if (!getSetting("background_tabs")) return;   // follow the link normally
					ev.preventDefault();
					GM_openInTab(row.href, {active: false});
				});
			}
			menu.append(row);
		}

		document.body.append(menu);
		open_pack_menu = menu;

		// Below the button, or above it when there's no room; inside the window.
		const at = button.getBoundingClientRect();
		const size = menu.getBoundingClientRect();
		const margin = 8;
		let top = at.bottom + 4;
		if (top + size.height > window.innerHeight - margin) top = Math.max(margin, at.top - size.height - 4);
		const left = Math.min(Math.max(margin, at.left), window.innerWidth - size.width - margin);
		menu.style.top = `${top}px`;
		menu.style.left = `${left}px`;
	}

	// Turns an element into a card: adds the frame and label, which CSS shows
	// only while the card (or the item around it) is marked. Safe to call more
	// than once.
	function makeCard(card) {
		if (getComputedStyle(card).position === "static") {
			card.style.position = "relative";
		}
		card.classList.add("bh_card");
		if (card.querySelector(":scope > bh-label")) return;
		card.append(document.createElement("bh-label"), document.createElement("bh-frame"));
	}

	// A pack is several Steam games sold as one product (a store's 2-in-1, a
	// collection). match: {type: "pack", members: [{type: "app" or "sub", id}, ...]}.
	// Returns the class and label for the pack as a whole:
	//   owns all        -> owned, "OWNED 7/7"
	//   owns some       -> partial, "OWNED 3/7", plus " · WISH 2" if any are wishlisted
	//   owns none, some wishlisted -> wished (dashed frame), "WISHLIST 2/7"
	//   all ignored     -> ignored, "IGNORED 7/7"
	function packState(members) {
		const total = members.length;
		const count = (css) => members.filter((member) => classForMatch(member) === css).length;
		const owned = count("bh_owned");
		const wished = count("bh_wished");
		const ignored = count("bh_ignored");
		if (total && owned === total) return {css: "bh_owned", label: `OWNED ${owned}/${total}`};
		if (owned) return {css: "bh_partial", label: `OWNED ${owned}/${total}` + (wished ? ` · WISH ${wished}` : "")};
		if (wished) return {css: "bh_wished", label: `WISHLIST ${wished}/${total}`};
		if (total && ignored === total) return {css: "bh_ignored", label: `IGNORED ${ignored}/${total}`};
		return {css: "", label: ""};
	}

	function classForMatch(match) {
		if (match.type === "app") return getClassForAppId(match.id);
		if (match.type === "sub") return getClassForSubId(match.id);
		return "";
	}

	const marking_classes = ["bh_owned", "bh_wished", "bh_ignored", "bh_partial", "bh_pack"];

	// Marks an element from a lookup result (a Steam game, package or pack) and
	// adds a Steam button through addLink(link), which places it for the site.
	// A pack's button opens the list of games inside.
	function markMatch(element, match, addLink) {
		element.classList.remove(...marking_classes);
		element.style.removeProperty("--bh-label");
		let css;
		if (match.type === "pack") {
			const state = packState(match.members);
			css = state.css;
			if (css) {
				element.classList.add("bh_pack");
				element.style.setProperty("--bh-label", JSON.stringify(state.label));
			}
		} else {
			css = classForMatch(match);
		}
		if (css) {
			element.classList.add(css);
			noteMarked();
		}
		if (addLink && !element.querySelector(".bh_steamlink")) {
			addLink(match.type === "pack" ? createPackButton(match.members) : createSteamLink(match.type, match.id));
		}
	}

	// Logs failures of a lookup-and-mark chain instead of losing them.
	function logFailure(where) {
		return (error) => debug_log.add("error", `${where}: ${error?.stack ?? error}`);
	}

	// Text sitting directly inside an element, ignoring text in its child
	// elements. Humble puts extra labels inside the title element, which this
	// skips.
	function ownText(element) {
		const parts = [];
		for (const node of element.childNodes) {
			if (node.nodeType === Node.TEXT_NODE) parts.push(node.textContent.trim());
		}
		return parts.join("").trim();
	}

	function markElements({
		rootSelector = "body",
		itemSelector = "a[href*='store.steampowered.com/']",
		itemStringExtractor = (a) => a.href,
		closestSelector = "*",
		addSteamLinkFunc = (item, closest, steam_link) => {},
	}) {
		let items_found = 0;
		let items_with_data = 0;
		let items_in_container = 0;
		let items_already_done = 0;
		let items_with_steam_id = 0;
		for (const root of document.querySelectorAll(rootSelector)) {
			for (const item of root.querySelectorAll(itemSelector)) {
				items_found++;
				const data = itemStringExtractor(item);
				if (!data) {
					continue;
				}
				items_with_data++;
				const closest = item.closest(closestSelector);
				if (!closest) {
					continue;
				}
				items_in_container++;
				if (closest.classList.contains("bh_already_processed")) {
					items_already_done++;
					continue;
				}
				closest.classList.add("bh_already_processed");

				const {app, sub} = parseStringForSteamId(data);
				if (app || sub) {
					recordItem(item.alt || item.title || item.textContent || data, "Steam ID on the page", app ? {type: "app", id: app} : {type: "sub", id: sub});
					items_with_steam_id++;
					closest.classList.remove("bh_owned", "bh_wished", "bh_ignored");
					const cssClass = getClassForAppId(app) || getClassForSubId(sub);
					if (cssClass) {
						closest.classList.add(cssClass);
						noteMarked();
					}

					const steam_link = createSteamLink(app ? "app" : "sub", app || sub);
					addSteamLinkFunc?.(item, closest, steam_link)
				}
			}
		}

		noteRule(`${itemSelector} in ${rootSelector}`, items_found);
		if (items_with_steam_id) {
			debug_log.add("site", `${itemSelector} in ${rootSelector}: ${items_found} found, ${items_with_data} with data, ${items_in_container} in a container, ${items_already_done} already done, ${items_with_steam_id} newly marked`);
		}
	}

	//////////////////////////////////////////////////
	// Site-specific data and code

	// There are no visible ids in the DOM on Fanatical.
	// Let's use something unique as the key: the cover image filenames.
	// The values are {steam, name, slug} from Fanatical's own product data.
	const fanatical_cover_map = new Map();

	function rememberFanaticalProduct(product) {
		if (product.cover && product.steam) {
			fanatical_cover_map.set(product.cover, {steam: product.steam, name: product.name, slug: product.slug});
		}
	}

	// Fanatical sells some products with no Steam ID of their own (collections,
	// 2-in-1s). Its product data can list the games inside, each with a Steam ID.
	// Resolves to a pack, or null when the product lists no Steam games.
	function lookupFanaticalContents(slug) {
		return cachedLookup(`fanatical-contents:${slug}`, `Fanatical product ${slug}`, async () => {
			let data;
			try {
				request_counts.fanatical++;
				const response = await fetch(`/api/products-group/${encodeURIComponent(slug)}/en`);
				if (!response.ok) throw new Error(`HTTP ${response.status}`);
				data = await response.json();
			} catch (error) {
				debug_log.add("lookup", `Fanatical product ${slug}: request failed (${error}), will retry next visit`);
				return {result: null, cacheable: false};
			}
			const members = [];
			for (const bundle of data?.bundles ?? []) {
				for (const game of bundle.games ?? []) {
					if (game.steam?.id) {
						members.push({type: game.steam.type === "sub" ? "sub" : "app", id: Number(game.steam.id), name: game.name ?? ""});
					}
				}
			}
			debug_log.add("lookup", `Fanatical product ${slug}: ${members.length} Steam games inside`);
			return {result: members.length ? {type: "pack", members} : null, cacheable: true};
		});
	}

	// For a Fanatical product without a Steam ID: its listed contents first,
	// then a lookup by name.
	async function resolveFanaticalProduct(product) {
		if (product.slug) {
			const pack = await lookupFanaticalContents(product.slug);
			if (pack) return pack;
		}
		return product.name ? resolveName(product.name) : null;
	}

	// For simple static sites that have plain Steam store links in the DOM.
	function markBySteamHref(rootSelector, closestSelector) {
		markElements({
			rootSelector: rootSelector,
			itemSelector: "a[href*='store.steampowered.com/app/'], a[href*='store.steampowered.com/sub/']",
			itemStringExtractor: (a) => a.href,
			closestSelector: closestSelector,
		});
	}

	//////////////////////////////////////////////////
	// Title matching (sites without Steam IDs: Humble Bundle, itch.io)

	// Makes store titles comparable: "F.E.A.R. 2: Project Origin™" and
	// "FEAR 2 - Project Origin" both become "fear 2 project origin".
	function normalizeTitle(title) {
		return title
			.replace(/[™®©]/g, "")               // before NFKD, which turns ™ into "TM"
			.normalize("NFKD")
			.replace(/[\u0300-\u036f]/g, "")    // accents
			.replace(/&/g, " and ")
			.toLowerCase()
			.replace(/['’.]/g, "")               // F.E.A.R. -> fear, Assassin's -> assassins
			.replace(/[^a-z0-9]+/g, " ")          // other punctuation -> space
			.trim();
	}

	// Greek letters used as words, e.g. METAL GEAR SOLID Δ, NINJA GAIDEN Σ.
	const greek_letter_names = {
		"α": "alpha", "β": "beta", "γ": "gamma", "δ": "delta", "ε": "epsilon",
		"ζ": "zeta", "η": "eta", "θ": "theta", "λ": "lambda", "μ": "mu",
		"π": "pi", "σ": "sigma", "ς": "sigma", "τ": "tau", "φ": "phi",
		"χ": "chi", "ψ": "psi", "ω": "omega",
	};
	function spellGreek(title) {
		return title.replace(/[\u0370-\u03ff]/g, (ch) => {
			const name = greek_letter_names[ch.toLowerCase()];
			return name ? " " + name + " " : ch;
		});
	}

	function removeBrackets(title) {
		return title.replace(/\[[^\]]*\]/g, " ");
	}

	// Roman numerals as whole words, never the first word ("X-COM", "V Rising").
	const roman_numerals = {
		"ii": "2", "iii": "3", "iv": "4", "v": "5", "vi": "6", "vii": "7", "viii": "8",
		"ix": "9", "x": "10", "xi": "11", "xii": "12", "xiii": "13", "xiv": "14", "xv": "15",
	};
	function romanToDigits(normalized) {
		return normalized.split(" ").map((word, i) => (i > 0 && roman_numerals[word]) || word).join(" ");
	}

	// Trailing edition words, removed only as the last attempt.
	const edition_suffix = /(\s+(definitive|ultimate|complete|deluxe|special|enhanced|anniversary|gold|premium|standard|digital deluxe|game of the year|goty|collectors|directors cut)(\s+edition)?|\s+(edition|remastered|remaster|hd|goty))+$/;
	function removeEdition(normalized) {
		return normalized.replace(edition_suffix, "").trim();
	}

	// Each attempt turns a raw title into a comparison key. Attempts run in
	// order and only the first one that finds exactly one Steam result wins.
	const title_match_attempts = [
		(t) => normalizeTitle(t),
		(t) => normalizeTitle(spellGreek(t)),
		(t) => normalizeTitle(removeBrackets(spellGreek(t))),
		(t) => romanToDigits(normalizeTitle(removeBrackets(spellGreek(t)))),
		(t) => removeEdition(romanToDigits(normalizeTitle(removeBrackets(spellGreek(t))))),
	];

	// candidates: [{appid, title}] from one Steam search. Returns an appid or 0.
	function pickSteamMatch(title, candidates) {
		for (const [i, makeKey] of title_match_attempts.entries()) {
			const key = makeKey(title);
			if (!key) continue;
			const ids = new Set(candidates.filter((c) => makeKey(c.title) === key).map((c) => c.appid));
			if (ids.size === 1) return [...ids][0];
			// Exact normalized match keeps the old "first result" behavior; later,
			// looser attempts never guess between several different games.
			if (i === 0 && ids.size > 1) return candidates.find((c) => makeKey(c.title) === key).appid;
		}
		// Non-Latin titles normalize to "", so compare those as written.
		const plain = title.trim().toLowerCase();
		return candidates.find((c) => c.title.trim().toLowerCase() === plain)?.appid ?? 0;
	}

	// Title lookups are saved between visits. Matches are kept 30 days and misses
	// 1 day. Changing saved_lookups_version discards everything (e.g. after the
	// matching rules change, so old misses get another chance).
	const saved_lookups_key = "bh_title_cache";
	const saved_lookups_version = 4;
	const saved_match_days = 30;
	const saved_miss_days = 1;
	let saved_lookups = null;

	function loadSavedLookups() {
		if (saved_lookups) return saved_lookups;
		const stored = GM_getValue(saved_lookups_key, null);
		saved_lookups = (stored && stored.version === saved_lookups_version && stored.entries) ? stored.entries : {};
		const now = getUnixTimestamp();
		for (const [key, entry] of Object.entries(saved_lookups)) {
			const max_age = (entry?.days ?? (entry?.match ? saved_match_days : saved_miss_days)) * 86400;
			if (!entry || !(now - entry.time <= max_age)) delete saved_lookups[key];
		}
		return saved_lookups;
	}

	function clearSavedMisses() {
		const cache = loadSavedLookups();
		let removed = 0;
		for (const [key, entry] of Object.entries(cache)) {
			if (!entry.match) { delete cache[key]; removed++; }
		}
		storeSavedLookups();
		return removed;
	}

	function clearSavedLookups() {
		saved_lookups = {};
		storeSavedLookups();
	}

	function storeSavedLookups() {
		GM_setValue(saved_lookups_key, {version: saved_lookups_version, entries: saved_lookups});
	}

	const pending_lookups = new Map();

	// GET from store.steampowered.com. Resolves to the response, or null on a
	// network/HTTP error (so the caller knows not to cache a miss).
	function steamGet(url, responseType) {
		if (url.includes("/search/suggest")) request_counts.steam_search++;
		else if (url.includes("/api/appdetails")) request_counts.steam_app_details++;
		return new Promise((resolve) => {
			GM_xmlhttpRequest({
				method: "GET",
				url: url,
				responseType: responseType,
				onload: (response) => resolve(response.status === 200 ? response : null),
				onerror: () => resolve(null),
				onabort: () => resolve(null),
				ontimeout: () => resolve(null),
			});
		});
	}

	// Steam's search suggestions (games only). Resolves to [{appid, title}] or null on error.
	async function searchSteamApps(term) {
		// Steam's search returns nothing when the term contains "+"
		// ("DOOM + DOOM II"), but finds the game without it.
		term = term.replace(/\s*\+\s*/g, " ").trim();
		const response = await steamGet("https://store.steampowered.com/search/suggest?term=" + encodeURIComponent(term) + "&f=games&cc=US&realm=1&l=english");
		if (!response) return null;
		const doc = new DOMParser().parseFromString(response.responseText, "text/html");
		const candidates = [];
		for (const result of doc.querySelectorAll("a[data-ds-appid]")) {
			const appid = Number((result.dataset.dsAppid ?? "").split(",")[0]);
			const result_title = result.querySelector(".match_name")?.textContent?.trim() ?? "";
			if (appid && result_title) candidates.push({appid, title: result_title});
		}
		return candidates;
	}

	// The packages a game is sold in, e.g. F.E.A.R. (app 21090) is sold as
	// "FEAR: Ultimate Shooter Edition" (package 4384) and "FEAR Collection" (12357).
	// Resolves to [{appid: packageid, title}] or null on error.
	async function getSteamPackages(appid) {
		// "basic,packages,package_groups" is the combination verified to return the
		// package list; asking for package_groups alone returns an empty list.
		const response = await steamGet("https://store.steampowered.com/api/appdetails?appids=" + appid + "&filters=basic,packages,package_groups&cc=us&l=english", "json");
		if (!response) return null;
		let json = response.response;
		if (typeof json === "string" || !json) {
			try { json = JSON.parse(response.responseText); } catch { json = null; }
		}
		const details = json?.[appid];
		if (!details?.success) {
			debug_log.add("lookup", `app details for ${appid}: Steam answered success=${details?.success ?? "missing"}`);
		}
		const packages = [];
		for (const group of details?.data?.package_groups ?? []) {
			for (const sub of group.subs ?? []) {
				// option_text looks like "FEAR: Ultimate Shooter Edition - $9.99"
				const name = String(sub.option_text ?? "").replace(/<[^>]*>/g, "").replace(/\s+-\s+[^-]*(\d|free)[^-]*$/i, "").trim();
				if (sub.packageid && name) packages.push({appid: Number(sub.packageid), title: name});
			}
		}
		return packages;
	}

	// Finds the Steam game, or failing that the Steam package, for a store title.
	// Resolves to {type: "app"|"sub", id} or null. Only complete answers are cached.
	async function lookupTitle(title) {
		let had_error = false;

		const log = (...args) => debug_log.add("lookup", JSON.stringify(title) + " " + args.map((a) => typeof a === "string" ? a : JSON.stringify(a)).join(" "));
		const candidates = await searchSteamApps(title);
		if (candidates === null) { log("Steam search failed (network or HTTP error), will retry next visit"); return {result: null, cacheable: false}; }
		log("search results:", candidates.map((c) => `${c.appid} ${c.title}`));
		const appid = pickSteamMatch(title, candidates);
		if (appid) { log("matched game", appid); return {result: {type: "app", id: appid}, cacheable: true}; }

		// Package fallback: compilations and editions sold as Steam packages.
		// Search the part before ":" or " - " ("FEAR"), then check the packages
		// of games whose name starts the store title.
		const base = title.split(/:|\s[-–—]\s/)[0].trim();
		const wanted = normalizeTitle(spellGreek(title));
		const games = [];
		const addGames = (list) => {
			for (const c of list) {
				const key = normalizeTitle(spellGreek(c.title));
				if (key && (wanted === key || wanted.startsWith(key + " ")) && !games.includes(c.appid)) games.push(c.appid);
			}
		};
		addGames(candidates);
		if (!games.length && base && normalizeTitle(base) !== normalizeTitle(title)) {
			const more = await searchSteamApps(base);
			log("package fallback, searched", JSON.stringify(base), "->", more === null ? "ERROR" : more.map((c) => `${c.appid} ${c.title}`));
			if (more === null) had_error = true;
			else addGames(more);
		}
		// Steam's search can't find "FEAR" but finds "F.E.A.R.". For a single
		// all-caps word (FEAR, STALKER, QUBE), also try it spelled with dots.
		if (!games.length && /^[A-Z]{2,8}$/.test(base)) {
			const dotted_term = base.split("").join(".") + ".";
			const dotted = await searchSteamApps(dotted_term);
			log("package fallback, searched", JSON.stringify(dotted_term), "->", dotted === null ? "ERROR" : dotted.map((c) => `${c.appid} ${c.title}`));
			if (dotted === null) had_error = true;
			else addGames(dotted);
		}
		log("games whose name starts the title:", games);
		for (const game of games.slice(0, 2)) {
			const packages = await getSteamPackages(game);
			log("packages of", game, "->", packages === null ? "ERROR" : packages.map((p) => `${p.appid} ${p.title}`));
			if (packages === null) { had_error = true; continue; }
			const packageid = pickSteamMatch(title, packages);
			if (packageid) { log("matched package", packageid); return {result: {type: "sub", id: packageid}, cacheable: true}; }
		}
		log(had_error ? "no match (an error occurred, not saved)" : "no match (saved as a miss for 1 day)");
		return {result: null, cacheable: !had_error};
	}

	// Resolves to {type: "app"|"sub", id} or null.
	// Runs a lookup once and saves its result between visits (matches for 30
	// days, misses for 1 day, or `days` when given). lookup() resolves to
	// {result, cacheable}; results from failed requests aren't saved. Identical
	// lookups running at the same time share one request.
	function cachedLookup(key, description, lookup, days) {
		const cache = loadSavedLookups();
		if (cache[key]) {
			request_counts.saved++;
			debug_log.add("lookup", `${description} saved result: ${describeMatch(cache[key].match)}`);
			return Promise.resolve(cache[key].match);
		}
		if (pending_lookups.has(key)) return pending_lookups.get(key);

		const running = lookup().then(({result, cacheable}) => {
			if (cacheable) {
				cache[key] = {match: result, time: getUnixTimestamp()};
				if (days) cache[key].days = days;
				storeSavedLookups();
			}
			return result;
		}).finally(() => pending_lookups.delete(key));
		pending_lookups.set(key, running);
		return running;
	}

	function describeMatch(match) {
		if (!match) return "miss";
		if (match.type === "pack") return `pack of ${match.members.length}`;
		return `${match.type} ${match.id}`;
	}

	// Looks up one Steam game or package by its exact title.
	function resolveTitle(title) {
		const key = normalizeTitle(spellGreek(title)) || title.trim().toLowerCase();
		if (!key) return Promise.resolve(null);
		return cachedLookup(key, JSON.stringify(title), () => lookupTitle(title));
	}

	// Looks up a store's product name. When the name isn't a Steam game or
	// package but joins several games with " + " ("Game One + Game Two"), each
	// part is looked up and the result is a pack. Parts that aren't found count
	// as not owned.
	async function resolveName(name) {
		const match = await resolveTitle(name);
		if (match) return match;
		const parts = name.split(/\s+\+\s+/).map((part) => part.trim()).filter(Boolean);
		if (parts.length < 2) return null;
		const matches = await Promise.all(parts.map((part) => resolveTitle(part)));
		if (!matches.some(Boolean)) return null;
		const members = matches.map((found, i) => ({...(found ?? {type: "unknown", id: 0}), name: parts[i]}));
		return {type: "pack", members};
	}

	const site_mapping = {
		"astats.astats.nl": function() {
			document.body.classList.add("bh_basic_style");
			GM_addStyle(`
				.bh_basic_style table.tablesorter tbody tr.bh_owned,
				.bh_basic_style table.tablesorter tbody tr.bh_wished,
				.bh_basic_style table.tablesorter tbody tr.bh_ignored {
					background: var(--bh-color) linear-gradient(135deg, rgba(0, 0, 0, 0.70) 10%, rgba(0, 0, 0, 0) 100%) !important;
					color: var(--bh-fgcolor) !important;
				}
			`);
			markElements({
				rootSelector: "body",
				itemSelector: "td > a > img[alt='Logo']",
				itemStringExtractor: (img) => img.src,
				closestSelector: "tr",
			});
			markElements({
				rootSelector: "body",
				itemSelector: "td > a > img.teaser[data-src]",
				itemStringExtractor: (img) => img.dataset.src,
				closestSelector: "td",
			});
		},
		"dailyindiegame.com": function() {
			document.body.classList.add("bh_basic_style");
			markElements({
				rootSelector: ".DIG3_14_Gray",
				itemSelector: "td.DIG3_14_Orange a[href*='store.steampowered.com/']",
				itemStringExtractor: (a) => a.href,
				closestSelector: "td",
				addSteamLinkFunc: (item, closest, link) => {
					item.insertAdjacentElement("beforebegin", link);
				},
			});
			markElements({
				rootSelector: "#DIG2TableGray",
				itemSelector: "a[href*='store.steampowered.com/']",
				itemStringExtractor: (a) => a.href,
				closestSelector: "tr:has(> .XDIGcontent)",
				addSteamLinkFunc: (item, closest, link) => {
					item.insertAdjacentElement("beforebegin", link);
				},
			});
			markElements({
				rootSelector: ".DIG-SiteLinksLarge, #DIG2TableGray",
				itemSelector: "a[href*='site_gamelisting_']:has(img)",
				itemStringExtractor: (a) => a.href.replace(/site_gamelisting_([0-9]+)\.html.*/, "app/$1"),
				closestSelector: "li, td",
				addSteamLinkFunc: (item, closest, link) => {
					link.style.position = "absolute";
					link.style.bottom = "0";
					link.style.right = "0";
				},
			});
			markElements({
				rootSelector: "#TableKeys",
				itemSelector: "a[href*='site_gamelisting_']",
				itemStringExtractor: (a) => a.href.replace(/site_gamelisting_([0-9]+)\.html.*/, "app/$1"),
				closestSelector: "tr",
				addSteamLinkFunc: (item, closest, link) => {
					item.insertAdjacentElement("beforebegin", link);
				},
			});
		},
		"fanatical.com": function() {
			document.body.classList.add("bh_basic_style");
			GM_addStyle(`
				/* Steam button: bottom-right of the cover image. The !important
				   rules beat Fanatical's ".faux-block-link a { position: relative }",
				   which would put the button back in the card's flow and make
				   marked cards taller than unmarked ones. */
				.cover-container > .bh_steamlink {
					position: absolute !important;
					right: 4px;
					bottom: 4px;
					z-index: 7 !important;
					line-height: 0;
				}
				.bh_card > .bh_steamlink {
					position: absolute !important;
					bottom: 0;
					left: calc( 50% - var(--bh-steamlink-size) / 2 );
					z-index: 7 !important;
				}
				.ProductHeader.container .bh_steamlink {
					position: static !important;
				}
			`);

			function rememberFanaticalData(json_data) {
				// Page: https://www.fanatical.com/en/bundle/batman-arkham-collection
				// AJAX: https://www.fanatical.com/api/products-group/batman-arkham-collection/en
				for (const bundle of json_data.bundles ?? []) {
					for (const game of bundle.games ?? []) {
						rememberFanaticalProduct(game);
					}
				}

				// Page: https://www.fanatical.com/en/pick-and-mix/build-your-own-bento-bundle
				// AJAX: https://www.fanatical.com/api/pick-and-mix/build-your-own-bento-bundle/en
				for (const game of json_data.products ?? []) {
					rememberFanaticalProduct(game);
				}

				// Page: https://www.fanatical.com/en/game/the-last-of-us-part-i
				// AJAX: https://www.fanatical.com/api/products-group/the-last-of-us-part-i/en
				rememberFanaticalProduct(json_data);
			}

			// Intercepting fetch() requests.
			// With help from:
			// * https://blog.logrocket.com/intercepting-javascript-fetch-api-requests-responses/
			// * https://stackoverflow.com/a/29293383
			// Using unsafeWindow to access the page's window object:
			// * https://violentmonkey.github.io/api/metadata-block/#inject-into
			const original_fetch = unsafeWindow.fetch;
			debug_state.fetch_hook = "installed";
			unsafeWindow.fetch = async function(...args) {
				const [resource, options] = args;
				const response = await original_fetch(resource, options);

				// Replacing the .json() method.
				const original_json = response.json;
				if (original_json) {
					response.json = function() {
						const p = original_json.apply(this);
						p.then((json_data) => {
							if (!json_data) {
								return;
							}
							rememberFanaticalData(json_data);
							// Cards may already be on the page when their data arrives.
							rescanSoon();
						});
						return p;
					}
				}
				return response;
			};

			// The hook misses Fanatical's data when the page asked for it before
			// the script started, for example in a tab opened in the background or
			// on a slow computer. Then, once the page has loaded and none of its
			// product covers has data, the script asks for that page's data itself,
			// once per page.
			const product_card_selector = ".bundle-game-card, .bundle-product-card, .NewPickAndMixCard, .PickAndMixCard, .ProductHeader.container";
			const fallback_requested = new Set();
			let hook_had_its_chance = false;
			function startFallbackTimer() {
				setTimeout(() => {
					hook_had_its_chance = true;
					rescanSoon();
				}, 2000);
			}
			if (document.readyState === "complete") {
				startFallbackTimer();
			} else {
				window.addEventListener("load", startFallbackTimer);
			}

			function pageDataUrl() {
				const parts = location.pathname.match(/^\/[^/]+\/(bundle|pick-and-mix|game)\/([^/]+)/);
				if (!parts) return null;
				const api = parts[1] === "pick-and-mix" ? "pick-and-mix" : "products-group";
				return `/api/${api}/${parts[2]}/en`;
			}

			async function requestMissedPageData() {
				if (!hook_had_its_chance) return;
				const url = pageDataUrl();
				if (!url || fallback_requested.has(url)) return;
				const covers = [...document.querySelectorAll("main img.img-full[srcset]")].filter((img) => img.closest(product_card_selector));
				if (!covers.length || covers.some((img) => fanatical_cover_map.has(filenameFromURL(img.src)))) return;

				fallback_requested.add(url);
				const before = fanatical_cover_map.size;
				try {
					request_counts.fanatical++;
					const response = await fetch(url);
					if (!response.ok) throw new Error(`HTTP ${response.status}`);
					rememberFanaticalData(await response.json());
				} catch (error) {
					debug_state.fanatical_data_fallback = `${url} failed (${error})`;
					debug_log.add("site", `the hook missed this page's data; requesting ${url} failed (${error})`);
					return;
				}
				debug_state.fanatical_data_fallback = `${url}: ${fanatical_cover_map.size - before} covers with Steam data`;
				debug_log.add("site", `the hook missed this page's data; requested ${url}: ${fanatical_cover_map.size - before} covers with Steam data`);
				rescanSoon();
			}

			// Fanatical rewrites its page all the time, so the whole body is
			// watched; scans run at most every 2 seconds.
			// On the cover image when the card has one; product page headers keep
			// the button inline.
			function placeSteamLink(card, link) {
				const cover = card.matches(".ProductHeader.container") ? null : card.querySelector(".cover-container");
				(cover ?? card).insertAdjacentElement("beforeend", link);
			}

			const card_selector = ".bundle-game-card, .bundle-product-card, .card, .HitCard, .header-content-container, .NewPickAndMixCard, .PickAndMixCard, .ProductHeader.container";

			// Products without a Steam ID of their own (collections, 2-in-1s).
			function markProductsWithoutSteamId() {
				for (const img of document.querySelectorAll("main img.img-full[srcset]")) {
					const product = fanatical_cover_map.get(filenameFromURL(img.src));
					if (!product || product.steam?.id) continue;
					const card = img.closest(card_selector);
					if (!card || card.classList.contains("bh_already_processed")) continue;
					// Whole bundles (cards linking to a bundle page) aren't products.
					if (card.querySelector("a.HitCard__main__cover[href*='/bundle/'], a.HitCard__main__cover[href*='/pick-and-mix/']")) continue;
					card.classList.add("bh_already_processed");
					resolveFanaticalProduct(product).then((match) => {
						recordItem(product.name, "Fanatical product without a Steam ID: its contents, or its name looked up on Steam", match);
						if (!match) return;
						makeCard(card);
						markMatch(card, match, (link) => placeSteamLink(card, link));
					}).catch(logFailure(`Fanatical product ${JSON.stringify(product.name)}`));
				}
			}

			function scanPage() {
				markElements({
					rootSelector: "main",
					itemSelector: "img.img-full[srcset]",
					itemStringExtractor: (img) => {
						const product = fanatical_cover_map.get(filenameFromURL(img.src));
						if (!product?.steam?.id) {
							return "";
						}
						return `/${product.steam.type}/${product.steam.id}`;
					},
					closestSelector: card_selector,
					addSteamLinkFunc: (item, closest, link) => {
						makeCard(closest);
						placeSteamLink(closest, link);
					},
				});
				markProductsWithoutSteamId();
				requestMissedPageData().catch(logFailure("Fanatical data fallback"));
			}
			const rescanSoon = throttle(scanPage, 500);

			watchAllForChanges("body", scanPage, 2000);

			// We don't even try matching the dropdown results from the top bar.
			// It's not reliable and doesn't work properly.
		},
		"indiegala.com": function() {
			document.body.classList.add("bh_basic_style");
			markElements({
				rootSelector: ".store-product-main-container.product-main-container .product",
				itemSelector: "a[data-prod-id]",
				itemStringExtractor: (a) => "/app/" + a.dataset.prodId,
				closestSelector: "figcaption",
				addSteamLinkFunc: (item, closest, link) => {
					closest.insertAdjacentElement("afterbegin", link);
				},
			});
			GM_addStyle(`
				.main-list-results-item figcaption {
					background: transparent;
				}
				.main-list-results-item-margin {
					background: #FFF;
				}
				a.main-list-results-item-add-to-cart {
					left: calc( 2 * 10px + var(--bh-steamlink-size) );
					width: auto;
					right: 10px;
				}
			`);
			watchAllForChanges(".main-list-results", function() {
				markElements({
					rootSelector: ".main-list-results",
					itemSelector: "a[data-prod-id]",
					itemStringExtractor: (a) => "/app/" + a.dataset.prodId,
					closestSelector: ".main-list-results-item-margin",
					addSteamLinkFunc: (item, closest, link) => {
						closest.querySelector("div.flex").insertAdjacentElement("afterbegin", link);
					},
				});
			});
			GM_addStyle(`
				.bundle-page-tier-item-outer figcaption {
					background: transparent;
				}
				.bundle-page-tier-item-outer {
					background: #FFF;
				}
			`);
			markElements({
				rootSelector: ".bundle-page-tier-games",
				itemSelector: "img.img-fit",
				itemStringExtractor: (img) => img.src,
				closestSelector: ".bundle-page-tier-item-outer",
				addSteamLinkFunc: (item, closest, link) => {
					link.style.position = "relative";
					link.style.zIndex = "99";
				},
			});
			GM_addStyle(`
				.header-search .results .results-item a,
				.header-search .results .results-item .price .final-color-off {
					background: transparent;
					color: inherit;
				}
			`);
			watchAllForChanges(".header-search .results", function() {
				markElements({
					rootSelector: ".header-search .results",
					itemSelector: "a[data-prod-id]",
					itemStringExtractor: (a) => "/app/" + a.dataset.prodId,
					closestSelector: ".results-item",
					addSteamLinkFunc: (item, closest, link) => {
						closest.querySelector("div.flex").insertAdjacentElement("afterbegin", link);
					},
				});
			});
		},
		"reddit.com": function() {
			document.body.classList.add("bh_basic_style");
			watchAllForChanges(".content", function() {
				markElements({
					itemSelector: "a[href*='store.steampowered.com/'], a[href*='steamcommunity.com/']",
					itemStringExtractor: (a) => a.href,
				});
			});
		},
		"sgtools.info": function() {
			document.body.classList.add("bh_basic_style");
			GM_addStyle(`
				.bh_owned a,
				.bh_wished a,
				.bh_ignored a {
					color: inherit;
				}
			`);
			markElements({
				rootSelector: "#content",
				itemSelector: "table a[href*='store.steampowered.com/']",
				itemStringExtractor: (a) => a.href,
				closestSelector: "tr",
			});
			GM_addStyle(`
				.bh_owned h2,
				.bh_wished h2,
				.bh_ignored h2,
				.bh_owned h3,
				.bh_wished h3,
				.bh_ignored h3 {
					color: inherit;
				}
			`);
			markElements({
				rootSelector: "#deals",
				itemSelector: ".deal_game_image > img[src*='/steam/']",
				itemStringExtractor: (img) => img.src,
				closestSelector: ".deal",
				addSteamLinkFunc: (item, closest, link) => {
					link.style.float = "left";
				},
			});
		},
		"steamgifts.com": function() {
			document.body.classList.add("bh_basic_style");
			GM_addStyle(`
				.page__outer-wrap {
					text-shadow: none;
				}
			`);
			GM_addStyle(`
				.giveaway__heading > * {
					order: 2;
				}
				.giveaway__heading > .giveaway__icon {
					order: 1;
				}
				.bh_owned   .giveaway__summary .giveaway__heading > *,
				.bh_wished  .giveaway__summary .giveaway__heading > *,
				.bh_ignored .giveaway__summary .giveaway__heading > *,
				.bh_owned   .giveaway__summary .giveaway__columns > *,
				.bh_wished  .giveaway__summary .giveaway__columns > *,
				.bh_ignored .giveaway__summary .giveaway__columns > * {
					color: inherit;
				}
			`);
			markElements({
				rootSelector: ".page__inner-wrap",
				itemSelector: "a.giveaway_image_thumbnail[style]",
				itemStringExtractor: (a) => a.style.backgroundImage,
				closestSelector: ".giveaway__row-inner-wrap",
			});
			GM_addStyle(`
				.bh_owned   .table__column__heading,
				.bh_wished  .table__column__heading,
				.bh_ignored .table__column__heading {
					color: inherit;
				}
			`);
			markElements({
				rootSelector: ".table",
				itemSelector: "a[href*='store.steampowered.com/']",
				itemStringExtractor: (a) => a.href,
				closestSelector: ".table__row-outer-wrap",
			});
			markElements({
				itemSelector: "a[href*='store.steampowered.com/'], a[href*='steamcommunity.com/']",
				itemStringExtractor: (a) => a.href,
			});
		},
		"steamground.com": function() {
			document.body.classList.add("bh_basic_style");
			GM_addStyle(`
				.bh_owned .inner__slider,
				.bh_wished .inner__slider,
				.bh_ignored .inner__slider {
					background-color: transparent;
				}
			`);
			markElements({
				rootSelector: ".content_inner",
				itemSelector: "a[href*='store.steampowered.com/']",
				itemStringExtractor: (a) => a.href,
				closestSelector: ".content_inner",
			});
			GM_addStyle(`
				.wholesale-card_info_about {
					display: inline-block;
					position: static;
				}
			`);
		},
		"humblebundle.com": function() {
			document.body.classList.add("bh_basic_style");
			GM_addStyle(`
				/* Humble: frame and label on the image (.bh_card), not the whole tile. */
				.bh_basic_style .tier-item-view.bh_owned,
				.bh_basic_style .tier-item-view.bh_wished,
				.bh_basic_style .tier-item-view.bh_ignored {
					outline: none !important;
				}
				.tier-item-view .img-container {
					position: relative;
				}
				.tier-item-view .img-container .bh_steamlink {
					position: absolute;
					bottom: 4px;
					right: 4px;
					z-index: 10;
				}
			`);



			function processTiles() {
				noteRule("Humble tiles (.tier-item-view)", document.querySelectorAll(".tier-item-view").length);
				for (const tile of document.querySelectorAll(".tier-item-view:not(.bh_already_processed)")) {
					tile.classList.add("bh_already_processed");
					const title_elem = tile.querySelector(".item-title");
					if (!title_elem) continue;
					const title = ownText(title_elem);
					if (!title) debug_log.add("error", `Humble tile title came out empty; tile text is ${JSON.stringify(title_elem.textContent.trim().slice(0, 80))}`);
					resolveName(title).then((match) => {
						recordItem(title, "Humble title, looked up on Steam", match);
						if (!match) return;
						const img_container = tile.querySelector(".img-container");
						if (img_container) makeCard(img_container);
						markMatch(tile, match, (link) => img_container?.appendChild(link));
					}).catch(logFailure(`Humble tile ${JSON.stringify(title)}`));
				}
			}

			processTiles();
			watchAllForChanges("body", processTiles, 2000);
		},
		"hrkgame.com": function() {
			document.body.classList.add("bh_basic_style");
			watchAllForChanges("body", () =>
				markBySteamHref("body", ".product-item, article, li")
			, 1000);
		},
		"gameseal.com": function() {
			document.body.classList.add("bh_basic_style");
			markBySteamHref("body", ".product, .game-card, article, li");
		},
		"itch.io": function() {
			document.body.classList.add("bh_basic_style");
			GM_addStyle(`
				.bh_basic_style .index_game_cell_widget.bh_owned   { outline: 3px solid var(--bh-color); outline-offset: -3px; }
				.bh_basic_style .index_game_cell_widget.bh_wished  { outline: 3px solid var(--bh-color); outline-offset: -3px; }
				.bh_basic_style .index_game_cell_widget.bh_ignored { outline: 3px solid var(--bh-color); outline-offset: -3px; }
			`);

			function processItchTiles() {
				noteRule("itch.io tiles (.game_cell)", document.querySelectorAll(".index_game_cell_widget.game_cell").length);
				const tiles = document.querySelectorAll(".index_game_cell_widget.game_cell:not(.bh_already_processed)");
				for (const tile of tiles) {
					tile.classList.add("bh_already_processed");
					const title_elem = tile.querySelector(".game_title, .title");
					if (!title_elem) continue;
					const title = ownText(title_elem);
					if (!title) debug_log.add("error", `itch.io tile title came out empty; tile text is ${JSON.stringify(title_elem.textContent.trim().slice(0, 80))}`);
					resolveName(title).then((match) => {
						recordItem(title, "itch.io title, looked up on Steam", match);
						if (!match) return;
						markMatch(tile, match, (link) => {
							const thumb = tile.querySelector("a.game_thumb");
							if (!thumb) return;
							link.style.position = "absolute";
							link.style.bottom = "4px";
							link.style.right = "4px";
							link.style.zIndex = "10";
							thumb.appendChild(link);
						});
					}).catch(logFailure(`itch.io tile ${JSON.stringify(title)}`));
				}
			}

			// Tiles can load after the script starts: check once a second for up to
			// 10 seconds until some appear.
			let retries = 0;
			function retryUntilTilesAppear() {
				processItchTiles();
				if (document.querySelectorAll(".index_game_cell_widget.game_cell").length === 0 && retries++ < 10) {
					setTimeout(retryUntilTilesAppear, 1000);
				}
			}
			retryUntilTilesAppear();
			watchAllForChanges("body", processItchTiles, 2000);
		},
		"tiltify.com": function() {
			document.body.classList.add("bh_basic_style");
			watchAllForChanges("body", () =>
				markBySteamHref("body", ".reward-card, article, li")
			, 2000);
		},
		"steamdb.info": function() {
			document.body.classList.add("bh_basic_style");
			markBySteamHref("body", "tr, .app, li");
		},
		"eneba.com": function() {
			// Eneba has no Steam IDs on the page, so items are matched by title
			// ("HELLDIVERS 2 Steam Key (PC) GLOBAL" -> "HELLDIVERS 2"). Its CSS class
			// names are generated and change between site updates, so nothing here
			// depends on them: cards are found from the product link's title
			// attribute, and the product page from its single <h1>.
			// Eneba cards move and grow on hover, so marking never changes their
			// size or position, and the Steam button is placed absolutely inside
			// the card.
			document.body.classList.add("bh_basic_style");
			GM_addStyle(`
				.bh_eneba_card {
					position: relative;
				}
				/* Top-left, on top of the label band. (Eneba shows its wishlist
				   heart top-right on hover.) */
				.bh_eneba_card > .bh_steamlink {
					position: absolute;
					top: 0;
					left: 0;
					z-index: 7;
					line-height: 0;
				}
				.bh_eneba_heading > .bh_steamlink {
					display: inline-block;
					margin-left: 0.4em;
					vertical-align: middle;
					line-height: 0;
				}
				.bh_basic_style .bh_eneba_heading.bh_owned,
				.bh_basic_style .bh_eneba_heading.bh_wished,
				.bh_basic_style .bh_eneba_heading.bh_ignored {
					outline-offset: 3px;
					border-radius: 4px;
				}
			`);

			// Only Steam products. Returns the game name, or "" if not a Steam product.
			function enebaGameName(title) {
				if (!/\bsteam\b/i.test(title)) return "";
				return title
					.replace(/\s*\((PC|Mac|Linux)\)\s*/gi, " ")
					.replace(/\s+steam\s+(cd\s+)?(key|gift|account)\b.*$/i, "")
					.trim();
			}

			// Largest ancestor (up to 8 levels) that still contains only this
			// product's links and has an image.
			function findEnebaCard(link) {
				const path = new URL(link.href, location.href).pathname;
				let best = null;
				let el = link.parentElement;
				for (let i = 0; el && el !== document.body && i < 8; i++, el = el.parentElement) {
					const other = [...el.querySelectorAll("a[href]")].some((a) => {
						const url = new URL(a.href, location.href);
						return url.origin === location.origin && url.pathname !== path;
					});
					if (other) break;
					if (el.querySelector("img")) best = el;
				}
				return best;
			}

			function processEneba() {
				// Product cards (store, search, home page rows)
				noteRule("Eneba product links (a[title])", document.querySelectorAll("a[title][href]").length);
				for (const link of document.querySelectorAll("a[title][href]")) {
					if (link.closest(".bh_eneba_card")) continue;   // card already handled
					const name = enebaGameName(link.title);
					if (!name) continue;
					const card = findEnebaCard(link);
					if (!card || card.classList.contains("bh_already_processed")) continue;
					card.classList.add("bh_already_processed", "bh_eneba_card");
					makeCard(card);
					resolveName(name).then((match) => {
						recordItem(name, "Eneba card title, looked up on Steam", match);
						if (match) markMatch(card, match, (steam_link) => card.appendChild(steam_link));
					}).catch(logFailure(`Eneba card ${JSON.stringify(name)}`));
				}
				// Product page heading
				const heading = document.querySelector("h1:not(.bh_already_processed)");
				if (heading) {
					const name = enebaGameName(heading.textContent.trim());
					if (name) {
						heading.classList.add("bh_already_processed", "bh_eneba_heading");
						resolveName(name).then((match) => {
							recordItem(name, "Eneba page heading, looked up on Steam", match);
							if (match) markMatch(heading, match, (link) => heading.appendChild(link));
						}).catch(logFailure(`Eneba heading ${JSON.stringify(name)}`));
					}
				}
			}

			watchAllForChanges("body", processEneba, 1000);
		},
		"g2a.com": function() {
			document.body.classList.add("bh_basic_style");
			watchAllForChanges("body", () =>
				markBySteamHref("body", "[class*='tile'], [class*='card'], article, li")
			, 2000);
		},
	};

	function processSite() {
		let hostname = document.location.hostname;
		// Removing the www. prefix, if present.
		hostname = hostname.replace(/^www\./, "");
		// Calling the site-specific code, if found.
		const handler = site_mapping[hostname];
		debug_state.site_handler = handler ? hostname : "";
		if (!handler) return;
		debug_log.add("site", `running the ${hostname} handler`);
		try {
			handler();
		} catch (error) {
			debug_log.add("error", `${hostname} handler failed: ${error?.stack ?? error}`);
		}
	}

	function main() {
		GM_addStyle(`
			/* The corner panel; its corner and size come from the settings. */
			bundle-helper {
				position: fixed;
				bottom: 0;
				z-index: 99;
			}
			.bh_no_card_labels bh-label {
				display: none !important;
			}

			/* Marking: a colored outline on the item (cards get a frame and label
			   band instead, below). The item's own colors are untouched and nothing
			   is faded; outlines never change size or position. Every look setting
			   is a CSS variable. */
			body {
				--bh-color-owned: #22e07a;
				--bh-color-wished: #3db8ff;
				--bh-color-ignored: #9a9a9a;
				--bh-color-partial: #c792ff;
				--bh-outline-width: 4px;
				--bh-label-text-color: #0b0b0b;
				--bh-steamlink-size: 24px;
			}
			.bh_owned   { --bh-color: var(--bh-color-owned);     --bh-outline-style: solid;  --bh-label: "OWNED"; }
			.bh_wished  { --bh-color: var(--bh-color-wished);   --bh-outline-style: solid;  --bh-label: "WISHLIST"; }
			.bh_ignored { --bh-color: var(--bh-color-ignored); --bh-outline-style: dashed; --bh-label: "IGNORED"; }
			.bh_partial { --bh-color: var(--bh-color-partial); --bh-outline-style: solid;  --bh-label: "PARTIAL"; }
			/* A pack with wishlisted games but none owned. */
			.bh_pack.bh_wished { --bh-outline-style: dashed; }
			.bh_basic_style .bh_owned,
			.bh_basic_style .bh_wished,
			.bh_basic_style .bh_ignored,
			.bh_basic_style .bh_partial {
				outline: var(--bh-outline-width) var(--bh-outline-style) var(--bh-color) !important;
				outline-offset: calc(-1 * var(--bh-outline-width));
			}
			/* Cards (tiles with an image) get a frame and a label band made of the
			   script's own elements (bh-frame, bh-label), added by makeCard(). Sites
			   don't style tags they don't know, so their hover effects can't distort
			   the marking. Layer 6 keeps both above a card's image and hover
			   overlays (Fanatical's is 5) while badges above that stay on top (a site
			   can change it with --bh-layer); isolation keeps every layer inside the
			   card, so floating bars and menus stay above the marking. */
			.bh_card {
				isolation: isolate;
			}
			.bh_basic_style .bh_card.bh_owned,  .bh_basic_style .bh_owned .bh_card,
			.bh_basic_style .bh_card.bh_wished, .bh_basic_style .bh_wished .bh_card,
			.bh_basic_style .bh_card.bh_ignored, .bh_basic_style .bh_ignored .bh_card,
			.bh_basic_style .bh_card.bh_partial, .bh_basic_style .bh_partial .bh_card {
				outline: none !important;
			}
			bh-frame, bh-label {
				all: initial;
				display: none;
			}
			.bh_owned bh-frame, .bh_wished bh-frame, .bh_ignored bh-frame, .bh_partial bh-frame,
			.bh_owned bh-label, .bh_wished bh-label, .bh_ignored bh-label, .bh_partial bh-label {
				display: block;
			}
			bh-frame, bh-label {
				z-index: var(--bh-layer, 6);
			}
			bh-frame {
				position: absolute;
				inset: 0;
				pointer-events: none;
				box-sizing: border-box;
				border: var(--bh-outline-width) var(--bh-outline-style) var(--bh-color);
				border-radius: inherit;
			}
			bh-label {
				position: absolute;
				top: 0;
				left: 0;
				right: var(--bh-band-right, 0);   /* sites can keep room for their own buttons */
				pointer-events: none;
				box-sizing: border-box;
				padding: 6px 12px;
				text-align: right;
				font: 800 12px/1 sans-serif;
				letter-spacing: 0.12em;
				background: var(--bh-color);
				color: var(--bh-label-text-color);
				box-shadow: 0 2px 6px rgba(0, 0, 0, 0.45);
			}
			bh-label::before {
				content: var(--bh-label);
			}

			/* Pack menu: the script's own elements, styled like the corner panel. */
			bh-pack-menu, bh-pack-head, bh-pack-row, bh-pack-dot, bh-pack-name, bh-pack-tag, .bh_pack_row {
				all: initial;
			}
			bh-pack-menu {
				position: fixed;
				z-index: 2147483000;
				display: block;
				width: 280px;
				max-height: 60vh;
				overflow-y: auto;
				padding: 6px 0;
				background: #171d25;
				border: 1px solid #3a4655;
				border-radius: 6px;
				box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
				font: 13px sans-serif;
				color: #ddd;
			}
			bh-pack-head {
				display: block;
				padding: 6px 12px 8px;
				margin-bottom: 4px;
				border-bottom: 1px solid #2a3440;
				font: 11px sans-serif;
				letter-spacing: 0.08em;
				color: #9aa;
			}
			.bh_pack_row {
				display: flex;
				align-items: center;
				gap: 8px;
				padding: 6px 12px;
				font: 13px sans-serif;
				color: #ddd;
				cursor: default;
			}
			a.bh_pack_row {
				cursor: pointer;
			}
			a.bh_pack_row:hover {
				background: #2a475e;
				color: #fff;
			}
			bh-pack-dot {
				display: block;
				flex: none;
				box-sizing: border-box;
				width: 10px;
				height: 10px;
				border-radius: 50%;
				border: 1px solid #556;
			}
			bh-pack-dot.owned   { background: var(--bh-color-owned); border: none; }
			bh-pack-dot.wished  { background: var(--bh-color-wished); border: none; }
			bh-pack-dot.ignored { border: 2px dashed var(--bh-color-ignored); }
			bh-pack-name {
				display: block;
				color: inherit;
				font: inherit;
			}
			bh-pack-tag {
				display: block;
				margin-left: auto;
				font: 700 10px sans-serif;
				letter-spacing: 0.08em;
				color: #9aa;
			}
			bh-pack-tag.owned   { color: var(--bh-color-owned); }
			bh-pack-tag.wished  { color: var(--bh-color-wished); }
			bh-pack-tag.ignored { color: var(--bh-color-ignored); }

			.bh_steamlink svg {
				width: var(--bh-steamlink-size);
				height: var(--bh-steamlink-size);
			}
		`);

		applySettings();
		addBundleHelperUI();

		// Run site-specific code.
		processSite();
	}

	main();

})();
