// ==UserScript==
// @name            Bundle Helper Reborn 3.0
// @namespace       https://github.com/SentaiBrad/
// @author          SentaiBrad
// @version         3.0.43
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
	// Settings
	//
	// Every setting is one entry in this list; the settings view is built from
	// it. Saved values are checked against the list when loaded, so an old or
	// damaged value falls back to the default instead of breaking anything.

	const settingsKey = "bh_settings";
	const settingDefinitions = [
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
	const panelScales = {small: 0.9, normal: 1, large: 1.25, "4k": 1.6};

	let currentSettings = null;

	function loadSettings() {
		const saved = GM_getValue(settingsKey, {});
		currentSettings = {};
		for (const definition of settingDefinitions) {
			currentSettings[definition.id] = isValidSetting(definition, saved?.[definition.id]) ? saved[definition.id] : definition.default;
		}
		return currentSettings;
	}

	function isValidSetting(definition, value) {
		if (definition.type === "switch") return typeof value === "boolean";
		return definition.choices.some(([choice]) => choice === value);
	}

	function getSetting(id) {
		return (currentSettings ?? loadSettings())[id];
	}

	function setSetting(id, value) {
		const definition = settingDefinitions.find((d) => d.id === id);
		if (!definition || !isValidSetting(definition, value)) return;
		getSetting(id);
		currentSettings[id] = value;
		GM_setValue(settingsKey, currentSettings);
		debugLog.add("settings", `${definition.label} = ${value}`);
		if (id === "use_api_key") {
			// Another account's data must never carry over: forget everything
			// saved and fetch the Steam data again.
			clearSavedLookups();
			refreshSteamData().catch(steamRefreshFailed);
		}
		applySettings();
	}

	function panelScale() {
		const size = getSetting("panel_size");
		if (size !== "auto") return panelScales[size];
		if (window.innerWidth >= 2400) return panelScales["4k"];
		if (window.innerWidth >= 1600) return panelScales.large;
		return panelScales.normal;
	}

	// Page-wide effects of the settings; the panel applies its own on update.
	function applySettings() {
		document.documentElement.classList.toggle("bh_no_card_labels", !getSetting("card_labels"));
		thePanel?.applyLayout();
		thePanel?.update();
	}

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
		let lastRun = 0;
		return function() {
			if (timer) return;
			const wait = Math.max(150, lastRun + interval - Date.now());
			timer = setTimeout(() => {
				timer = null;
				lastRun = Date.now();
				callback();
			}, wait);
		};
	}

	const activeMutationObservers = [];

	// Runs callback now and again whenever rootNode or anything inside it
	// changes, at most once per `interval` ms. Errors are logged, not thrown.
	function watchForChanges(rootNode, callback, interval = 500) {
		const func = throttle(() => {
			const started = performance.now();
			try {
				callback();
			} catch (error) {
				recordError("page scan", error);
			}
			const took = Math.round(performance.now() - started);
			scanStats.count++;
			scanStats.total_ms += took;
			scanStats.slowest_ms = Math.max(scanStats.slowest_ms, took);
		}, interval);
		func();
		const observer = new MutationObserver(func);
		observer.observe(rootNode, {
			subtree: true,
			childList: true,
			attributes: true,
			characterData: false,
		});
		activeMutationObservers.push(observer);
		return observer;
	}

	// watchForChanges() for every element matching the CSS selector.
	function watchAllForChanges(rootSelector, callback, interval = 500) {
		for (const root of document.querySelectorAll(rootSelector)) {
			watchForChanges(root, callback, interval);
		}
	}

	// Logs failures of a lookup-and-mark chain instead of losing them.
	function logFailure(where) {
		return (error) => recordError(where, error);
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

	//////////////////////////////////////////////////
	// Regular expressions

	// Emulates the "x" flag for RegExp.
	// It's also known as "verbose" flag, as it allows whitespace and comments inside the regex.
	// It will probably break if the original string contains "$".
	function reX(reString) {
		const raw = reString.raw[0];
		let s = raw;
		// Removing comments.
		s = s.replace(/(?<!\\)\/\/.*$/gm, "");
		// Removing all whitespace.
		s = s.replace(/[ \t\r\n]+/g, "");
		return new RegExp(s);
	}

	const reApp = reX`
		( /app/ | /apps/ | appid= )
		(?<id>[0-9]+)
		\b
	`;
	const reSub = reX`
		( /sub/ | /subs/ )
		(?<id>[0-9]+)
		\b
	`;

	// Parses a string and tries to extract the app id or the sub id.
	function parseStringForSteamId(s) {
		const matchApp = reApp.exec(s);
		const matchSub = reSub.exec(s);

		if (matchApp && matchSub) {
			console.warn("The string matched both app id and sub id. This is likely a mistake.", s, matchApp, matchSub);
		}

		return {
			app: Number(matchApp?.groups.id ?? 0),
			sub: Number(matchSub?.groups.id ?? 0),
		};
	}

	//////////////////////////////////////////////////
	// Debug log and state (shown by the bug button in the panel)

	const debugLog = {
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

	const debugState = {
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
		if (debugState.first_mark_ms === null) {
			debugState.first_mark_ms = Math.round(performance.now());
			debugLog.add("site", `first item marked ${debugState.first_mark_ms} ms after the page started loading`);
		}
	}

	//////////////////////////////////////////////////
	// Errors
	//
	// Every error the script catches goes through recordError(), which keeps a
	// cleaned copy for the debug report. Nothing that identifies the user goes
	// in: web addresses lose their query and #part, extension addresses (they
	// carry a per-browser ID) and local file paths are replaced, and stack
	// frames outside this script become "[other code]". This script's own
	// frames keep only the function name and the line, never an address.

	const maxErrorRecords = 20;
	const errorRecords = [];

	// One line of a stack trace, as Chromium ("    at name (location:1:2)") or
	// Firefox ("name@location:1:2") writes it. Returns {name, location, line,
	// column}, or null for a line that isn't a frame.
	function frameParts(line) {
		const chromium = line.match(/^\s*at\s+(?:(.+?)\s+\()?(.+):(\d+):(\d+)\)?\s*$/);
		if (chromium) return {name: chromium[1] ?? "", location: chromium[2], line: chromium[3], column: chromium[4]};
		const firefox = line.match(/^(.*?)@(.+):(\d+):(\d+)\s*$/);
		if (firefox) return {name: firefox[1], location: firefox[2], line: firefox[3], column: firefox[4]};
		return null;
	}

	// Where this script's own code is, as stack traces name it. Read once from a
	// stack made here; "" when the browser gives no readable stack, and then
	// every frame counts as other code.
	const ownScriptLocation = String(new Error().stack ?? "").split("\n").map(frameParts).find(Boolean)?.location ?? "";

	// Removes what could identify the user from text that goes into the report.
	function cleanText(text) {
		return String(text)
			.replace(/\b[a-z-]+-extension:\/\/[^\s)'"]*/gi, "[extension]")
			.replace(/\bfile:\/\/[^\s)'"]*/gi, "[file]")
			.replace(/\b[A-Z]:\\[^\s)'"]*/g, "[file]")
			.replace(/\b(https?:\/\/[^\s?#)'"]*)[?#][^\s)'"]*/gi, "$1");
	}

	// The frames of a stack trace, innermost first: this script's own frames
	// as "name:line:column", runs of anything else as one "[other code]".
	function cleanStack(stack) {
		const frames = [];
		for (const line of String(stack ?? "").split("\n")) {
			const frame = frameParts(line);
			if (!frame) continue;
			const own = ownScriptLocation !== "" && frame.location === ownScriptLocation;
			const text = own ? `${cleanText(frame.name) || "(anonymous)"}:${frame.line}:${frame.column}` : "[other code]";
			if (text === "[other code]" && frames[frames.length - 1] === text) continue;
			frames.push(text);
		}
		return frames;
	}

	// Records an error the script caught while doing `task`, then carries on.
	// The same error from the same task is counted, not stored again, so a scan
	// that fails every 2 seconds doesn't flood the report. Never throws.
	function recordError(task, error) {
		try {
			const kind = error?.name && error.name !== "Error" ? `${error.name}: ` : "";
			const text = kind + cleanText(error?.message ?? error ?? "unknown error").slice(0, 300);
			const existing = errorRecords.find((record) => record.task === task && record.text === text);
			if (existing) {
				existing.count++;
				return;
			}
			const frames = cleanStack(error?.stack);
			if (errorRecords.length < maxErrorRecords) {
				errorRecords.push({time: new Date(), task, text, frames, count: 1});
			}
			const where = frames.find((frame) => frame !== "[other code]");
			debugLog.add("error", `${task}: ${text}${where ? ` (at ${where})` : ""}`);
			// The panel shows that something went wrong; an error in the panel
			// itself doesn't ask the panel to redraw, which could fail again.
			if (!task.includes("panel")) schedulePanelUpdate();
		} catch {
			debugLog.add("error", `${task}: an error happened, and recording it failed too`);
		}
	}

	// Wraps a function that runs on its own later (an event listener, a timer,
	// a hook on the page) so an error in it is recorded and goes no further:
	// never into the site's own code or its error reporting. A promise it
	// returns is watched the same way.
	function guard(task, fn) {
		return function(...args) {
			try {
				const result = fn.apply(this, args);
				if (result && typeof result.then === "function") {
					result.then(undefined, (error) => recordError(task, error));
				}
				return result;
			} catch (error) {
				recordError(task, error);
				return undefined;
			}
		};
	}

	//////////////////////////////////////////////////
	// What happened on this page, for the debug view

	// Every item the script looked at: its name on the page, where its Steam
	// data came from, and the lookup result (null when nothing matched).
	const pageItems = [];

	// The same item seen again (a site redrawing its cards) is listed once.
	function recordItem(name, source, match) {
		const item = {name: String(name ?? "").trim().slice(0, 120) || "(no name)", source, match};
		const key = `${item.name}\n${source}\n${match ? `${match.type} ${match.id ?? match.members?.length}` : "miss"}`;
		if (recordedItems.has(key)) return;
		recordedItems.add(key);
		pageItems.push(item);
		schedulePanelUpdate();
	}
	const recordedItems = new Set();

	// Requests made on this page, by where they went.
	const requestCounts = {steam_search: 0, steam_app_details: 0, steam_package_details: 0, fanatical: 0, saved: 0};

	// How many items each site rule found on its latest scan. A rule that
	// suddenly finds 0 usually means the site changed its layout.
	const ruleCounts = new Map();

	function noteRule(rule, found) {
		ruleCounts.set(rule, found);
	}

	const scanStats = {count: 0, total_ms: 0, slowest_ms: 0, last: null};

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
	// Steam library data (owned, wishlisted, ignored), saved for 24 hours

	const steamDataKey = "bh_profile_data";
	const steamDataTimeKey = "bh_profile_time";
	const steamDataMaxAge = 60 * 60 * 24;  // 24 hours
	// A Steam request that hasn't answered by then counts as failed.
	const steamRequestTimeoutMs = 20000;
	// Set when Steam answered with no games at all: signed out of the Steam
	// store in this browser (see refreshSteamData).
	let steamLooksSignedOut = false;
	let steamSets = null;

	function saveSteamData(data) {
		steamSets = null;
		data.rgCurations = {};
		data.rgCurators = {};
		data.rgCuratorsIgnored = [];
		data.rgRecommendedApps = [];
		data.rgRecommendedTags = [];
		GM_setValue(steamDataKey, data);
		GM_setValue(steamDataTimeKey, getUnixTimestamp());
	}

	function steamDataAge() {
		const now = getUnixTimestamp();
		const cached = GM_getValue(steamDataTimeKey, 0);
		if (!cached) {
			return "";
		}
		return humanReadableSecondsAmount(now - cached);
	}

	function isSteamDataOld() {
		const now = getUnixTimestamp();
		const cached = GM_getValue(steamDataTimeKey, 0);
		return now - cached > steamDataMaxAge;
	}

	function fetchSteamData() {
		return new Promise((resolve, reject) => {
			function handleError(response) {
				debugState.steam_fetch = `failed: HTTP ${response?.status ?? "none"} ${response?.statusText ?? ""}`.trim();
				debugLog.add("error", `Steam profile data request ${debugState.steam_fetch}`);
				reject();
			}

			GM_xmlhttpRequest({
				method: "GET",
				url: "https://store.steampowered.com/dynamicstore/userdata/?t=" + getUnixTimestamp(),
				responseType: "json",
				timeout: steamRequestTimeoutMs,
				onload: function(response) {
					if (response.status !== 200) {
						handleError(response);
						return;
					}
					// Some managers hand JSON over as text.
					let data = response.response;
					if (typeof data === "string" || !data) {
						try { data = JSON.parse(response.responseText); } catch { data = null; }
					}
					resolve(data);
				},
				onerror: handleError,
				onabort: function() {
					debugState.steam_fetch = "aborted";
					debugLog.add("error", "Steam profile data request aborted");
					reject();
				},
				ontimeout: function() {
					debugState.steam_fetch = `timed out after ${steamRequestTimeoutMs / 1000} s`;
					debugLog.add("error", `Steam profile data request ${debugState.steam_fetch}`);
					reject();
				},
			});
		});
	}

	// Signed out of the Steam store, Steam still answers, with every list empty
	// (checked 2026-11-01). Saving that would replace the library with nothing,
	// so an answer with no owned games or packages is never saved: the saved
	// data stays and the panel asks to sign in. Fresh data re-marks the page.
	function refreshSteamData() {
		return fetchSteamData().then((data) => {
			const owned = data?.rgOwnedApps?.length ?? 0;
			const packages = data?.rgOwnedPackages?.length ?? 0;
			const time = new Date().toLocaleTimeString();
			if (!owned && !packages) {
				steamLooksSignedOut = true;
				debugState.steam_fetch = `Steam answered with no games at ${time}: probably signed out of the Steam store in this browser; saved data kept`;
				debugLog.add("error", "Steam answered with no owned games or packages, which usually means you're signed out at store.steampowered.com in this browser. Your saved Steam data was kept.");
				return;
			}
			steamLooksSignedOut = false;
			debugState.steam_fetch = `ok at ${time}: ${owned} owned apps`;
			debugLog.add("steam", `profile data fetched: ${owned} owned apps, ${packages} owned packages, ${data?.rgWishlist?.length ?? 0} wishlisted`);
			saveSteamData(data);
			remarkPage();
		});
	}

	// fetchSteamData logs its own request failures and rejects without an
	// error; anything else that goes wrong while refreshing is recorded.
	function steamRefreshFailed(error) {
		if (error) recordError("Steam data refresh", error);
	}

	function refreshSteamDataIfOld() {
		if (isSteamDataOld()) {
			return refreshSteamData();
		} else {
			return Promise.resolve();
		}
	}

	function getSteamSets() {
		if (!steamSets) {
			const data = GM_getValue(steamDataKey, {});
			steamSets = {
				ignoredPackages: new Set(data.rgIgnoredPackages),
				ownedApps: new Set(data.rgOwnedApps),
				ownedPackages: new Set(data.rgOwnedPackages),
				wishlist: new Set(data.rgWishlist),
				ignoredApps: new Set(Object.keys(data.rgIgnoredApps ?? {}).map((key) => Number(key))),
			};
		}
		return steamSets;
	}

	// GET from store.steampowered.com. Resolves to the response, or null on a
	// network/HTTP error (so the caller knows not to cache a miss).
	function steamGet(url, responseType) {
		if (url.includes("/search/suggest")) requestCounts.steam_search++;
		else if (url.includes("/api/appdetails")) requestCounts.steam_app_details++;
		else if (url.includes("/api/packagedetails")) requestCounts.steam_package_details++;
		return new Promise((resolve) => {
			GM_xmlhttpRequest({
				method: "GET",
				url: url,
				responseType: responseType,
				timeout: steamRequestTimeoutMs,
				onload: (response) => resolve(response.status === 200 ? response : null),
				onerror: () => resolve(null),
				onabort: () => resolve(null),
				ontimeout: () => resolve(null),
			});
		});
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

	const steamApi = {
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
			debugLog.add(ok ? "api" : "error", `Steam API ${what}${ok ? "" : ": " + (error ?? "failed")}`);
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
	const greekLetterNames = {
		"α": "alpha", "β": "beta", "γ": "gamma", "δ": "delta", "ε": "epsilon",
		"ζ": "zeta", "η": "eta", "θ": "theta", "λ": "lambda", "μ": "mu",
		"π": "pi", "σ": "sigma", "ς": "sigma", "τ": "tau", "φ": "phi",
		"χ": "chi", "ψ": "psi", "ω": "omega",
	};
	function spellGreek(title) {
		return title.replace(/[\u0370-\u03ff]/g, (ch) => {
			const name = greekLetterNames[ch.toLowerCase()];
			return name ? " " + name + " " : ch;
		});
	}

	function removeBrackets(title) {
		return title.replace(/\[[^\]]*\]/g, " ");
	}

	// Roman numerals as whole words, never the first word ("X-COM", "V Rising").
	const romanNumerals = {
		"ii": "2", "iii": "3", "iv": "4", "v": "5", "vi": "6", "vii": "7", "viii": "8",
		"ix": "9", "x": "10", "xi": "11", "xii": "12", "xiii": "13", "xiv": "14", "xv": "15",
	};
	function romanToDigits(normalized) {
		return normalized.split(" ").map((word, i) => (i > 0 && romanNumerals[word]) || word).join(" ");
	}

	// Trailing edition words, removed only as the last attempt.
	const editionSuffix = /(\s+(definitive|ultimate|complete|deluxe|special|enhanced|anniversary|gold|premium|standard|digital deluxe|game of the year|goty|collectors|directors cut)(\s+edition)?|\s+(edition|remastered|remaster|hd|goty))+$/;
	function removeEdition(normalized) {
		return normalized.replace(editionSuffix, "").trim();
	}

	// Each attempt turns a raw title into a comparison key. Attempts run in
	// order and only the first one that finds exactly one Steam result wins.
	const titleMatchAttempts = [
		(t) => normalizeTitle(t),
		(t) => normalizeTitle(spellGreek(t)),
		(t) => normalizeTitle(removeBrackets(spellGreek(t))),
		(t) => romanToDigits(normalizeTitle(removeBrackets(spellGreek(t)))),
		(t) => removeEdition(romanToDigits(normalizeTitle(removeBrackets(spellGreek(t))))),
	];

	// candidates: [{appid, title}] from one Steam search. Returns an appid or 0.
	function pickSteamMatch(title, candidates) {
		for (const [i, makeKey] of titleMatchAttempts.entries()) {
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
	// 1 day. Changing savedLookupsVersion discards everything (e.g. after the
	// matching rules change, so old misses get another chance).
	// Every tab running the script shares the same saved lookups, so each change
	// reads the stored copy first and changes only its own entries; writing back
	// a copy read earlier would undo what other tabs saved or cleared since.
	const savedLookupsKey = "bh_title_cache";
	const savedLookupsVersion = 5;
	const savedMatchDays = 30;
	const savedMissDays = 1;
	let savedLookups = null;

	function readSavedLookups() {
		const stored = GM_getValue(savedLookupsKey, null);
		const entries = (stored && stored.version === savedLookupsVersion && stored.entries) ? stored.entries : {};
		const now = getUnixTimestamp();
		for (const [key, entry] of Object.entries(entries)) {
			const maxAge = (entry?.days ?? (entry?.match ? savedMatchDays : savedMissDays)) * 86400;
			if (!entry || !(now - entry.time <= maxAge)) delete entries[key];
		}
		return entries;
	}

	function loadSavedLookups() {
		savedLookups ??= readSavedLookups();
		return savedLookups;
	}

	function writeSavedLookups(entries) {
		savedLookups = entries;
		GM_setValue(savedLookupsKey, {version: savedLookupsVersion, entries});
	}

	function saveLookup(key, entry) {
		const entries = readSavedLookups();
		entries[key] = entry;
		writeSavedLookups(entries);
	}

	function clearSavedMisses() {
		const entries = readSavedLookups();
		let removed = 0;
		for (const [key, entry] of Object.entries(entries)) {
			if (!entry.match) { delete entries[key]; removed++; }
		}
		writeSavedLookups(entries);
		return removed;
	}

	function clearSavedLookups() {
		writeSavedLookups({});
	}

	const pendingLookups = new Map();

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
			const resultTitle = result.querySelector(".match_name")?.textContent?.trim() ?? "";
			if (appid && resultTitle) candidates.push({appid, title: resultTitle});
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
			debugLog.add("lookup", `app details for ${appid}: Steam answered success=${details?.success ?? "missing"}`);
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
		let hadError = false;

		const log = (...args) => debugLog.add("lookup", JSON.stringify(title) + " " + args.map((a) => typeof a === "string" ? a : JSON.stringify(a)).join(" "));
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
			if (more === null) hadError = true;
			else addGames(more);
		}
		// Steam's search can't find "FEAR" but finds "F.E.A.R.". For a single
		// all-caps word (FEAR, STALKER, QUBE), also try it spelled with dots.
		if (!games.length && /^[A-Z]{2,8}$/.test(base)) {
			const dottedTerm = base.split("").join(".") + ".";
			const dotted = await searchSteamApps(dottedTerm);
			log("package fallback, searched", JSON.stringify(dottedTerm), "->", dotted === null ? "ERROR" : dotted.map((c) => `${c.appid} ${c.title}`));
			if (dotted === null) hadError = true;
			else addGames(dotted);
		}
		log("games whose name starts the title:", games);
		for (const game of games.slice(0, 2)) {
			const packages = await getSteamPackages(game);
			log("packages of", game, "->", packages === null ? "ERROR" : packages.map((p) => `${p.appid} ${p.title}`));
			if (packages === null) { hadError = true; continue; }
			const packageid = pickSteamMatch(title, packages);
			if (packageid) { log("matched package", packageid); return {result: {type: "sub", id: packageid}, cacheable: true}; }
		}
		log(hadError ? "no match (an error occurred, not saved)" : "no match (saved as a miss for 1 day)");
		return {result: null, cacheable: !hadError};
	}

	// Resolves to {type: "app"|"sub", id} or null.
	// Runs a lookup once and saves its result between visits (matches for 30
	// days, misses for 1 day, or `days` when given). lookup() resolves to
	// {result, cacheable, days}, where days is optional and applies to that
	// result; results from failed requests aren't saved. Identical
	// lookups running at the same time share one request.
	function cachedLookup(key, description, lookup, days) {
		// Another tab may have saved this since the page loaded.
		const justLoaded = !savedLookups;
		if (!loadSavedLookups()[key] && !justLoaded) savedLookups = readSavedLookups();
		const saved = savedLookups[key];
		if (saved) {
			requestCounts.saved++;
			debugLog.add("lookup", `${description} saved result: ${describeMatch(saved.match)}`);
			return Promise.resolve(saved.match);
		}
		if (pendingLookups.has(key)) return pendingLookups.get(key);

		const running = lookup().then(({result, cacheable, days: resultDays}) => {
			if (cacheable) {
				const entry = {match: result, time: getUnixTimestamp()};
				if (days ?? resultDays) entry.days = days ?? resultDays;
				saveLookup(key, entry);
			}
			return result;
		}).finally(() => pendingLookups.delete(key));
		pendingLookups.set(key, running);
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

	// For sites that only have a name: looks it up on Steam, lists it in the
	// debug view with `source` saying where the name came from, and when it's
	// found, calls mark(match) to mark it the site's way. Failures are logged.
	function lookUpAndMark(name, source, mark) {
		resolveName(name).then((match) => {
			recordItem(name, source, match);
			if (match) mark(match);
		}).catch(logFailure(`${source}: ${JSON.stringify(name)}`));
	}

	//////////////////////////////////////////////////
	// Store products and packs
	//
	// A product, as a site describes it:
	//   name:     the store's name for it
	//   steam:    {type: "app" or "sub", id} from the store's own data, or null
	//   contents: null, or a function (nested) that resolves to the pack made of
	//             the products inside it (see packFromContents), or null when it
	//             lists none
	//   dlc:      Steam app IDs of the game's DLC, from the store's own data, or []

	// A store can label a game's ID as a package ID: Fanatical sells Resident
	// Evil 5 Gold Edition as package 21690, but 21690 is the game and Steam has
	// no such package. A package that isn't owned or ignored is checked on Steam
	// once; when Steam has no such package but has a game with that ID, the game
	// is used.
	function needsSteamIdCheck(steam) {
		return steam.type === "sub" && getClassForSubId(Number(steam.id)) === "";
	}

	async function checkStoreSteamId(steam) {
		const id = Number(steam.id);
		const given = {type: steam.type === "sub" ? "sub" : "app", id};
		if (!needsSteamIdCheck(steam)) return given;
		const checked = await cachedLookup(`package-check:${id}`, `Package ${id}`, async () => {
			const exists = async (url) => {
				const response = await steamGet(url, "json");
				if (!response) return null;
				let json = response.response;
				if (typeof json === "string" || !json) {
					try { json = JSON.parse(response.responseText); } catch { json = null; }
				}
				return Boolean(json?.[id]?.success);
			};
			const isPackage = await exists(`https://store.steampowered.com/api/packagedetails?packageids=${id}&cc=us`);
			if (isPackage === null) return {result: null, cacheable: false};
			if (isPackage) return {result: given, cacheable: true};
			const isGame = await exists(`https://store.steampowered.com/api/appdetails?appids=${id}&filters=basic&cc=us`);
			if (isGame === null) return {result: null, cacheable: false};
			debugLog.add("lookup", `Package ${id}: ${isGame ? `no such package on Steam, using game ${id}` : "not found on Steam as a package or a game"}`);
			return {result: isGame ? {type: "app", id} : given, cacheable: true};
		});
		return checked ?? given;
	}

	// A product's own Steam ID (checked when needed), or else the pack its
	// contents make, or else the game its DLC belongs to, or else a lookup by its
	// name.
	async function resolveProduct(product, nested = false) {
		if (product.steam?.id) {
			return checkStoreSteamId(product.steam);
		}
		if (product.contents) {
			const pack = await product.contents(nested);
			if (pack) return pack;
		}
		if (product.dlc?.length) {
			const game = await baseGameOfDlc(product.dlc[0]);
			if (game) return game;
		}
		return product.name ? resolveName(product.name) : null;
	}

	// A store can list an edition with no Steam ID but with its DLC: Fanatical's
	// Resident Evil 6 Complete lists only DLC IDs. Steam's details for a DLC name
	// the full game it belongs to (DLC 232570 -> game 221040, Resident Evil 6),
	// so the edition is that game. Resolves to {type: "app", id} or null.
	function baseGameOfDlc(dlcId) {
		const id = Number(dlcId);
		return cachedLookup(`dlc-base:${id}`, `DLC ${id}`, async () => {
			const response = await steamGet(`https://store.steampowered.com/api/appdetails?appids=${id}&filters=basic&cc=us`, "json");
			if (!response) return {result: null, cacheable: false};
			let json = response.response;
			if (typeof json === "string" || !json) {
				try { json = JSON.parse(response.responseText); } catch { json = null; }
			}
			const details = json?.[id];
			const game = Number(details?.data?.fullgame?.appid);
			if (!details?.success || details.data.type !== "dlc" || !game) {
				debugLog.add("lookup", `DLC ${id}: Steam names no full game`);
				return {result: null, cacheable: true};
			}
			debugLog.add("lookup", `DLC ${id}: belongs to game ${game}`);
			return {result: {type: "app", id: game}, cacheable: true};
		});
	}

	// Turns the products inside a product into a pack. One with a Steam ID is a
	// member; one without is resolved like any product, so a compilation inside
	// adds its games. Only one level of products inside products is followed.
	// Members that can't be found count as not owned. Resolves to a pack, or
	// null when there are no products.
	async function packFromContents(products, nested) {
		const members = [];
		for (const product of products) {
			members.push(...await packMembersFor(product, nested));
		}
		return members.length ? {type: "pack", members} : null;
	}

	async function packMembersFor(product, nested) {
		const name = product.name ?? "";
		if (product.steam?.id) {
			return [{...await checkStoreSteamId(product.steam), name}];
		}
		const found = nested ? null : await resolveProduct(product, true);
		if (found?.type === "pack") return found.members;
		if (found) return [{...found, name}];
		return [{type: "unknown", id: 0, name}];
	}

	function countMissingMembers(pack) {
		return pack ? pack.members.filter((member) => member.type === "unknown").length : 0;
	}

	// A pack with a member that wasn't found is saved for a day, like a miss,
	// so it gets another chance soon.
	function packSaveDays(pack) {
		return countMissingMembers(pack) ? savedMissDays : undefined;
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
	function steamUrl(appOrSub, id) {
		return `https://store.steampowered.com/${appOrSub}/${id}`;
	}

	// Clicking opens the Steam page in a background tab, like a middle-click,
	// so the store page keeps focus.
	function createSteamLink(appOrSub, id) {
		const a = createSteamButton(steamUrl(appOrSub, id));
		a.addEventListener("click", guard("Steam button", (ev) => {
			ev.stopPropagation();
			if (!getSetting("background_tabs")) return;   // follow the link normally
			ev.preventDefault();
			GM_openInTab(a.href, {active: false});
		}));
		return a;
	}

	// The Steam button for a pack opens a list of the games inside (see
	// openPackMenu). Middle-click still opens the first game, from the href.
	function createPackButton(members) {
		const first = members.find((member) => member.type === "app" || member.type === "sub");
		const a = createSteamButton(first ? steamUrl(first.type, first.id) : "https://store.steampowered.com/");
		a.title = "Games in this pack";
		a.addEventListener("click", guard("pack button", (ev) => {
			ev.preventDefault();
			ev.stopPropagation();
			openPackMenu(a, members);
		}));
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

	let shownPackMenu = null;

	function closePackMenu() {
		shownPackMenu?.remove();
		shownPackMenu = null;
	}

	// Clicks outside the menu, Esc and scrolling close it.
	document.addEventListener("click", guard("pack menu", (ev) => {
		if (shownPackMenu && !shownPackMenu.contains(ev.target)) closePackMenu();
	}), true);
	document.addEventListener("keydown", guard("pack menu", (ev) => {
		if (ev.key === "Escape") closePackMenu();
	}));
	window.addEventListener("scroll", guard("pack menu", closePackMenu), {passive: true});

	const packMemberStates = {
		bh_owned: {text: "OWNED", css: "owned"},
		bh_wished: {text: "WISHLIST", css: "wished"},
		bh_ignored: {text: "IGNORED", css: "ignored"},
	};

	function openPackMenu(button, members) {
		const wasOpenHere = shownPackMenu?.bh_button === button;
		closePackMenu();
		if (wasOpenHere) return;

		const menu = document.createElement("bh-pack-menu");
		menu.bh_button = button;
		const head = document.createElement("bh-pack-head");
		head.textContent = `${members.length} GAMES IN THIS PACK`;
		menu.append(head);

		for (const member of members) {
			const found = member.type === "app" || member.type === "sub";
			const row = document.createElement(found ? "a" : "bh-pack-row");
			row.className = "bh_pack_row";
			const state = found ? packMemberStates[classForMatch(member)] : null;
			const dot = document.createElement("bh-pack-dot");
			dot.className = state?.css ?? "none";
			const name = document.createElement("bh-pack-name");
			name.textContent = member.name || (found ? `Steam ${member.type} ${member.id}` : "Unknown game");
			const tag = document.createElement("bh-pack-tag");
			tag.className = state?.css ?? "";
			tag.textContent = found ? (state?.text ?? "") : "NOT FOUND";
			row.append(dot, name, tag);
			if (found) {
				row.href = steamUrl(member.type, member.id);
				// Opens in a background tab, like a middle-click, so the store
				// page keeps focus and the menu stays open.
				row.addEventListener("click", guard("pack menu link", (ev) => {
					ev.stopPropagation();
					if (!getSetting("background_tabs")) return;   // follow the link normally
					ev.preventDefault();
					GM_openInTab(row.href, {active: false});
				}));
			}
			menu.append(row);
		}

		document.body.append(menu);
		shownPackMenu = menu;

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

	const markingClasses = ["bh_owned", "bh_wished", "bh_ignored", "bh_partial", "bh_pack"];

	// The lookup result each marked element was marked from, so its marking can
	// be applied again when fresh Steam data arrives. A WeakMap, so nothing is
	// added to the page and removed elements are forgotten.
	const markedMatches = new WeakMap();

	// Marks an element from a lookup result (a Steam game, package or pack) and
	// adds a Steam button through addLink(link), which places it for the site.
	// A pack's button opens the list of games inside.
	function markMatch(element, match, addLink) {
		applyMarking(element, match);
		if (addLink && !element.querySelector(".bh_steamlink")) {
			addLink(match.type === "pack" ? createPackButton(match.members) : createSteamLink(match.type, match.id));
		}
	}

	// The marking classes (and a pack's label) for a lookup result, from the
	// Steam data saved now.
	function applyMarking(element, match) {
		markedMatches.set(element, match);
		element.classList.remove(...markingClasses);
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
	}

	// After fresh Steam data, every item already handled on the page is marked
	// again: one handled before the data arrived (a first install, cleared
	// data) would otherwise stay unmarked until the page was reloaded.
	function remarkPage() {
		let remarked = 0;
		for (const element of document.querySelectorAll(".bh_already_processed")) {
			const match = markedMatches.get(element);
			if (!match) continue;
			applyMarking(element, match);
			remarked++;
		}
		if (remarked) debugLog.add("steam", `fresh Steam data: marking checked again on ${remarked} items`);
	}

	function markElements({
		rootSelector = "body",
		itemSelector = "a[href*='store.steampowered.com/']",
		itemStringExtractor = (a) => a.href,
		closestSelector = "*",
		addSteamLinkFunc = (item, closest, steamLink) => {},
	}) {
		let itemsFound = 0;
		let itemsWithData = 0;
		let itemsInContainer = 0;
		let itemsAlreadyDone = 0;
		let itemsWithSteamId = 0;
		for (const root of document.querySelectorAll(rootSelector)) {
			for (const item of root.querySelectorAll(itemSelector)) {
				itemsFound++;
				const data = itemStringExtractor(item);
				if (!data) {
					continue;
				}
				itemsWithData++;
				const closest = item.closest(closestSelector);
				if (!closest) {
					continue;
				}
				itemsInContainer++;
				if (closest.classList.contains("bh_already_processed")) {
					itemsAlreadyDone++;
					continue;
				}
				closest.classList.add("bh_already_processed");

				const {app, sub} = parseStringForSteamId(data);
				if (app || sub) {
					const match = app ? {type: "app", id: app} : {type: "sub", id: sub};
					recordItem(item.alt || item.title || item.textContent || data, "Steam ID on the page", match);
					itemsWithSteamId++;
					applyMarking(closest, match);
					addSteamLinkFunc?.(item, closest, createSteamLink(match.type, match.id));
				}
			}
		}

		noteRule(`${itemSelector} in ${rootSelector}`, itemsFound);
		if (itemsWithSteamId) {
			debugLog.add("site", `${itemSelector} in ${rootSelector}: ${itemsFound} found, ${itemsWithData} with data, ${itemsInContainer} in a container, ${itemsAlreadyDone} already done, ${itemsWithSteamId} newly marked`);
		}
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
	// Fanatical's product data (used by the fanatical.com handler)

	// There are no visible ids in the DOM on Fanatical.
	// Let's use something unique as the key: the cover image filenames.
	// The values are {steam, name, slug} from Fanatical's own product data.
	const fanaticalCoverMap = new Map();

	function rememberFanaticalProduct(product) {
		if (product.cover && product.steam) {
			fanaticalCoverMap.set(product.cover, {steam: product.steam, name: product.name, slug: product.slug});
		}
	}

	// A Fanatical product in the shape the shared product code uses (see
	// "Store products and packs"). Its contents come from its own product data.
	function fanaticalProduct(data) {
		return {
			name: data.name ?? "",
			steam: data.steam?.id ? data.steam : null,
			contents: data.slug ? (nested) => lookupFanaticalContents(data.slug, nested) : null,
			dlc: data.steam?.dlc ?? [],
		};
	}

	// The products listed in a Fanatical product's own data (collections,
	// 2-in-1s), as a pack. Resolves to null when it lists none.
	function lookupFanaticalContents(slug, nested = false) {
		return cachedLookup(`fanatical-contents:${slug}`, `Fanatical product ${slug}`, async () => {
			let data;
			try {
				requestCounts.fanatical++;
				const response = await fetch(`/api/products-group/${encodeURIComponent(slug)}/en`);
				if (!response.ok) throw new Error(`HTTP ${response.status}`);
				data = await response.json();
			} catch (error) {
				debugLog.add("lookup", `Fanatical product ${slug}: request failed (${error}), will retry next visit`);
				return {result: null, cacheable: false};
			}
			const products = (data?.bundles ?? []).flatMap((bundle) => bundle.games ?? []).map(fanaticalProduct);
			const pack = await packFromContents(products, nested);
			const missing = countMissingMembers(pack);
			debugLog.add("lookup", `Fanatical product ${slug}: ${pack?.members.length ?? 0} Steam games inside${missing ? `, ${missing} not found` : ""}`);
			return {result: pack, cacheable: true, days: packSaveDays(pack)};
		});
	}

	//////////////////////////////////////////////////
	// Site handlers, by host. Each starts with a note on the pages it covers.

	const siteMapping = {
		"astats.astats.nl": function() {
			// Game lists and tables: Steam logo and teaser images in rows.
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
			// Game tables and key lists: Steam links, and the site's game-listing links (app ID in the address).
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
		"eneba.com": function() {
			// Steam key listings, search and product pages: cards found from links titled with "Steam", matched by name.
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
					lookUpAndMark(name, "Eneba card title, looked up on Steam", (match) => {
						markMatch(card, match, (steamLink) => card.appendChild(steamLink));
					});
				}
				// Product page heading
				const heading = document.querySelector("h1:not(.bh_already_processed)");
				if (heading) {
					const name = enebaGameName(heading.textContent.trim());
					if (name) {
						heading.classList.add("bh_already_processed", "bh_eneba_heading");
						lookUpAndMark(name, "Eneba page heading, looked up on Steam", (match) => {
							markMatch(heading, match, (link) => heading.appendChild(link));
						});
					}
				}
			}

			watchAllForChanges("body", processEneba, 1000);
		},
		"fanatical.com": function() {
			// Bundle, pick-and-mix and game pages: Steam IDs from Fanatical's own product data.
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

			function rememberFanaticalData(jsonData) {
				// Page: https://www.fanatical.com/en/bundle/batman-arkham-collection
				// AJAX: https://www.fanatical.com/api/products-group/batman-arkham-collection/en
				for (const bundle of jsonData.bundles ?? []) {
					for (const game of bundle.games ?? []) {
						rememberFanaticalProduct(game);
					}
				}

				// Page: https://www.fanatical.com/en/pick-and-mix/build-your-own-bento-bundle
				// AJAX: https://www.fanatical.com/api/pick-and-mix/build-your-own-bento-bundle/en
				for (const game of jsonData.products ?? []) {
					rememberFanaticalProduct(game);
				}

				// Page: https://www.fanatical.com/en/game/the-last-of-us-part-i
				// AJAX: https://www.fanatical.com/api/products-group/the-last-of-us-part-i/en
				rememberFanaticalProduct(jsonData);
			}

			// Intercepting fetch() requests.
			// With help from:
			// * https://blog.logrocket.com/intercepting-javascript-fetch-api-requests-responses/
			// * https://stackoverflow.com/a/29293383
			// Using unsafeWindow to access the page's window object:
			// * https://violentmonkey.github.io/api/metadata-block/#inject-into
			// The page always gets its response and its answer exactly as they came,
			// and nothing the script does with them can throw into the page's code:
			// reading the answer is guarded, and a failed answer is left for the
			// page to handle, as it would be without the script.
			const readFanaticalAnswer = guard("Fanatical data hook", (answer) => {
				answer.then(guard("Fanatical data hook", (jsonData) => {
					if (!jsonData) return;
					rememberFanaticalData(jsonData);
					// Cards may already be on the page when their data arrives.
					rescanSoon();
				}), () => {});
			});
			const watchFanaticalResponse = guard("Fanatical data hook", (response) => {
				const originalJson = response.json;
				if (!originalJson) return;
				response.json = function(...args) {
					const answer = originalJson.apply(this, args);
					readFanaticalAnswer(answer);
					return answer;
				};
			});
			const originalFetch = unsafeWindow.fetch;
			debugState.fetch_hook = "installed";
			unsafeWindow.fetch = async function(...args) {
				const response = await originalFetch(...args);
				watchFanaticalResponse(response);
				return response;
			};

			// The hook misses Fanatical's data when the page asked for it before
			// the script started, for example in a tab opened in the background or
			// on a slow computer. Then, once the page has loaded and none of its
			// product covers has data, the script asks for that page's data itself,
			// once per page.
			const productCardSelector = ".bundle-game-card, .bundle-product-card, .NewPickAndMixCard, .PickAndMixCard, .ProductHeader.container";
			const fallbackRequested = new Set();
			let hookHadItsChance = false;
			function startFallbackTimer() {
				setTimeout(guard("Fanatical data fallback", () => {
					hookHadItsChance = true;
					rescanSoon();
				}), 2000);
			}
			if (document.readyState === "complete") {
				startFallbackTimer();
			} else {
				window.addEventListener("load", guard("Fanatical data fallback", startFallbackTimer));
			}

			function pageDataUrl() {
				const parts = location.pathname.match(/^\/[^/]+\/(bundle|pick-and-mix|game)\/([^/]+)/);
				if (!parts) return null;
				const api = parts[1] === "pick-and-mix" ? "pick-and-mix" : "products-group";
				return `/api/${api}/${parts[2]}/en`;
			}

			async function requestMissedPageData() {
				if (!hookHadItsChance) return;
				const url = pageDataUrl();
				if (!url || fallbackRequested.has(url)) return;
				const covers = [...document.querySelectorAll("main img.img-full[srcset]")].filter((img) => img.closest(productCardSelector));
				if (!covers.length || covers.some((img) => fanaticalCoverMap.has(filenameFromURL(img.src)))) return;

				fallbackRequested.add(url);
				const before = fanaticalCoverMap.size;
				try {
					requestCounts.fanatical++;
					const response = await fetch(url);
					if (!response.ok) throw new Error(`HTTP ${response.status}`);
					rememberFanaticalData(await response.json());
				} catch (error) {
					debugState.fanatical_data_fallback = `${url} failed (${error})`;
					debugLog.add("site", `the hook missed this page's data; requesting ${url} failed (${error})`);
					return;
				}
				debugState.fanatical_data_fallback = `${url}: ${fanaticalCoverMap.size - before} covers with Steam data`;
				debugLog.add("site", `the hook missed this page's data; requested ${url}: ${fanaticalCoverMap.size - before} covers with Steam data`);
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

			const cardSelector = ".bundle-game-card, .bundle-product-card, .card, .HitCard, .header-content-container, .NewPickAndMixCard, .PickAndMixCard, .ProductHeader.container";

			// The Steam ID can be used as given: there is one, and it isn't a
			// package ID that needs checking on Steam.
			function usableSteamId(product) {
				return product?.steam?.id && !needsSteamIdCheck(product.steam);
			}

			// Products without a usable Steam ID: collections and 2-in-1s with no
			// ID of their own, and package IDs that need checking on Steam.
			function markProductsNeedingLookup() {
				for (const img of document.querySelectorAll("main img.img-full[srcset]")) {
					const product = fanaticalCoverMap.get(filenameFromURL(img.src));
					if (!product || usableSteamId(product)) continue;
					const card = img.closest(cardSelector);
					if (!card || card.classList.contains("bh_already_processed")) continue;
					// Whole bundles (cards linking to a bundle page) aren't products.
					if (card.querySelector("a.HitCard__main__cover[href*='/bundle/'], a.HitCard__main__cover[href*='/pick-and-mix/']")) continue;
					card.classList.add("bh_already_processed");
					const source = product.steam?.id
						? "Fanatical's package ID, checked on Steam"
						: "Fanatical product without a Steam ID: its contents, or its name looked up on Steam";
					resolveProduct(fanaticalProduct(product)).then((match) => {
						recordItem(product.name, source, match);
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
						const product = fanaticalCoverMap.get(filenameFromURL(img.src));
						if (!usableSteamId(product)) {
							return "";
						}
						return `/${product.steam.type}/${product.steam.id}`;
					},
					closestSelector: cardSelector,
					addSteamLinkFunc: (item, closest, link) => {
						makeCard(closest);
						placeSteamLink(closest, link);
					},
				});
				markProductsNeedingLookup();
				requestMissedPageData().catch(logFailure("Fanatical data fallback"));
			}
			const rescanSoon = throttle(guard("page scan", scanPage), 500);

			watchAllForChanges("body", scanPage, 2000);

			// We don't even try matching the dropdown results from the top bar.
			// It's not reliable and doesn't work properly.
		},
		"g2a.com": function() {
			// Steam links in product cards (guessed selectors, never checked live).
			document.body.classList.add("bh_basic_style");
			watchAllForChanges("body", () =>
				markBySteamHref("body", "[class*='tile'], [class*='card'], article, li")
			, 2000);
		},
		"gameseal.com": function() {
			// Steam links in product cards (guessed selectors, never checked live).
			document.body.classList.add("bh_basic_style");
			markBySteamHref("body", ".product, .game-card, article, li");
		},
		"hrkgame.com": function() {
			// Steam links in product cards (guessed selectors, never checked live).
			document.body.classList.add("bh_basic_style");
			watchAllForChanges("body", () =>
				markBySteamHref("body", ".product-item, article, li")
			, 1000);
		},
		"humblebundle.com": function() {
			// Bundle pages: tiles matched by title.
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
					const titleElem = tile.querySelector(".item-title");
					if (!titleElem) continue;
					const title = ownText(titleElem);
					if (!title) debugLog.add("error", `Humble tile title came out empty; tile text is ${JSON.stringify(titleElem.textContent.trim().slice(0, 80))}`);
					lookUpAndMark(title, "Humble title, looked up on Steam", (match) => {
						const imgContainer = tile.querySelector(".img-container");
						if (imgContainer) makeCard(imgContainer);
						markMatch(tile, match, (link) => imgContainer?.appendChild(link));
					});
				}
			}

			processTiles();
			watchAllForChanges("body", processTiles, 2000);
		},
		"indiegala.com": function() {
			// Store, bundle and search pages: Steam app IDs in data-prod-id, and bundle images.
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
		"itch.io": function() {
			// Browse pages: game cells matched by title.
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
					const titleElem = tile.querySelector(".game_title, .title");
					if (!titleElem) continue;
					const title = ownText(titleElem);
					if (!title) debugLog.add("error", `itch.io tile title came out empty; tile text is ${JSON.stringify(titleElem.textContent.trim().slice(0, 80))}`);
					lookUpAndMark(title, "itch.io title, looked up on Steam", (match) => {
						markMatch(tile, match, (link) => {
							const thumb = tile.querySelector("a.game_thumb");
							if (!thumb) return;
							link.style.position = "absolute";
							link.style.bottom = "4px";
							link.style.right = "4px";
							link.style.zIndex = "10";
							thumb.appendChild(link);
						});
					});
				}
			}

			// Tiles can load after the script starts: check once a second for up to
			// 10 seconds until some appear.
			let retries = 0;
			function retryUntilTilesAppear() {
				processItchTiles();
				if (document.querySelectorAll(".index_game_cell_widget.game_cell").length === 0 && retries++ < 10) {
					setTimeout(guard("itch.io tiles", retryUntilTilesAppear), 1000);
				}
			}
			retryUntilTilesAppear();
			watchAllForChanges("body", processItchTiles, 2000);
		},
		"reddit.com": function() {
			// Steam store and community links in posts and comments (old.reddit.com).
			document.body.classList.add("bh_basic_style");
			watchAllForChanges(".content", function() {
				markElements({
					itemSelector: "a[href*='store.steampowered.com/'], a[href*='steamcommunity.com/']",
					itemStringExtractor: (a) => a.href,
				});
			});
		},
		"sgtools.info": function() {
			// Tables with Steam links, and deals with Steam images.
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
		"steamdb.info": function() {
			// Steam links in tables and app lists (guessed selectors, never checked live).
			document.body.classList.add("bh_basic_style");
			markBySteamHref("body", "tr, .app, li");
		},
		"steamgifts.com": function() {
			// Giveaways (app ID in the thumbnail image), and tables and other Steam links.
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
			// Steam links on store pages.
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
		"tiltify.com": function() {
			// Steam links on reward cards (guessed selectors, never checked live).
			document.body.classList.add("bh_basic_style");
			watchAllForChanges("body", () =>
				markBySteamHref("body", ".reward-card, article, li")
			, 2000);
		},
	};

	//////////////////////////////////////////////////
	// Corner panel
	//
	// Shows the Steam data summary; the gear opens settings, the bug opens the
	// debug report, [−] minimizes it to a small bar (clicking the bar opens it
	// again; remembered on every site). It lives in a shadow root, so the
	// site's styles can't reach it, and it takes after Steam's colors without
	// imitating Steam.

	const panelMinimizedKey = "bh_panel_minimized";
	const issuesUrl = "https://github.com/SentaiBrad/Bundle-Helper-Reborn-3.0/issues/new";
	let thePanel = null;

	const panelIcons = {
		gear: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.4-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3.3h-4l-.4 2.7a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.4L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.4 2.5-1a7.4 7.4 0 0 0 1.7 1l.4 2.7h4l.4-2.7a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.4zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"/></svg>`,
		bug: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3.5 7.6 2.1l1-1L10.3 2.8a5 5 0 0 1 3.4 0L15.4 1.1l1 1L15 3.5A5 5 0 0 1 17 7H7a5 5 0 0 1 2-3.5Z"/><path d="M6 8h12v6a6 6 0 0 1-5.25 5.95V11h-1.5v8.95A6 6 0 0 1 6 14V8Z"/><path d="M1 9h4v1.5H1zM19 9h4v1.5h-4zM1 13.25h4v1.5H1zM19 13.25h4v1.5h-4zM2.5 19.5 5.6 16.4l1.1 1.06-3.1 3.1zM21.5 19.5l-3.1-3.1-1.1 1.06 3.1 3.1z"/></svg>`,
		minimize: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 11h14v2H5z"/></svg>`,
		expand: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.4 15.4 12 10.8l4.6 4.6L18 14l-6-6-6 6z"/></svg>`,
	};

	// Steam's store colors (read from store.steampowered.com, 2026-10-30) and a
	// system font. Sizes are in em, so the panel size setting scales everything.
	const panelCss = `
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
		/* The whole bar opens the panel; the button at its end shows that it does. */
		.bar .icon { margin-left: auto; background: #2a475e; color: #fff; }
		.bar:hover .icon { background: #66c0f4; color: rgb(15, 25, 36); }
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
		.problem { color: #ff6b6b; font-weight: bold; }
		.warn { color: #e5b143; }
		div.warn { margin-bottom: 0.4em; }
		.row.problem > span:last-child { font-weight: normal; white-space: nowrap; }
	`;

	const panelHtml = `
		<div class="bar" id="bar" role="button" tabindex="0" title="Open Bundle Helper" hidden>
			<b>Bundle Helper</b>
			<span class="owned" id="bar-owned"></span>
			<span class="wished" id="bar-wished"></span>
			<span class="ignored" id="bar-ignored"></span>
			<span class="note" id="bar-age"></span>
			<span class="warn" id="bar-signin" hidden>sign in to Steam</span>
			<span class="problem" id="bar-problem" hidden></span>
			<span class="icon">${panelIcons.expand}</span>
		</div>
		<div class="panel" id="panel">
			<div class="head">
				<b id="title">Bundle Helper</b>
				<button class="icon" id="open-settings" title="Settings">${panelIcons.gear}</button>
				<button class="icon" id="open-debug" title="Debug report">${panelIcons.bug}</button>
				<button class="icon" id="minimize" title="Minimize">${panelIcons.minimize}</button>
			</div>
			<div class="body" id="view-main">
				<div class="row problem" id="problem" hidden><span id="problem-text">Something went wrong</span><span><span class="link" id="problem-details" role="button" tabindex="0">details</span> · <span class="link" id="problem-report" role="button" tabindex="0">report</span></span></div>
				<div class="warn" id="signin" hidden>Steam answered with no games: you're probably signed out. Sign in at <a class="link" href="https://store.steampowered.com/login/" target="_blank" rel="noopener">store.steampowered.com</a>, then click refresh. Your saved data is kept.</div>
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
		shadow.innerHTML = `<style>${panelCss}</style>${panelHtml}`;
		const $ = (selector) => shadow.querySelector(selector);
		let view = "main";
		let debugTab = "overview";

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
			GM_setValue(panelMinimizedKey, minimized);
			$("#bar").hidden = !minimized;
			$("#panel").hidden = minimized;
			if (!minimized) panel.update();
		}

		// Every panel action is logged, and an error in one can't break the panel.
		const onClick = (selector, action) => $(selector).addEventListener("click", guard(`panel action ${selector}`, (ev) => {
			ev.preventDefault();
			debugLog.add("panel", `clicked ${selector}`);
			return action(ev);
		}));
		onClick("#open-settings", () => showView("settings"));
		onClick("#open-debug", () => showView("debug"));
		onClick("#minimize", () => setMinimized(true));
		onClick("#bar", () => setMinimized(false));
		$("#bar").addEventListener("keydown", guard("panel action #bar", (ev) => { if (ev.key === "Enter") setMinimized(false); }));
		onClick("#refresh", () => refreshSteamData().catch(steamRefreshFailed).finally(() => panel.update()));
		onClick("#retry", () => {
			const removed = clearSavedMisses();
			debugLog.add("lookup", `cleared ${removed} saved misses, reloading page`);
			location.reload();
		});
		for (const tab of shadow.querySelectorAll("[data-tab]")) {
			tab.addEventListener("click", guard("panel tab", () => {
				debugTab = tab.dataset.tab;
				for (const other of shadow.querySelectorAll("[data-tab]")) other.setAttribute("aria-pressed", String(other === tab));
				panel.update();
			}));
		}
		onClick("#copy", () => copyReport(buildDebugReport("all"), $("#debug-body"), $("#copy-note")));
		onClick("#problem-details", () => showView("debug"));
		onClick("#problem-report", () => reportProblem(null));
		onClick("#report", () => reportProblem($("#copy-note")));
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
					recordError("panel update", error);
				}
			},
			render() {
				const sets = getSteamSets();
				$("#bar-owned").textContent = `${sets.ownedApps.size.toLocaleString()} owned`;
				$("#bar-wished").textContent = `${sets.wishlist.size.toLocaleString()} wishlist`;
				$("#bar-ignored").textContent = `${sets.ignoredApps.size.toLocaleString()} ignored`;
				$("#bar-age").textContent = steamDataAge() ? `fetched ${steamDataAge() === "just now" ? "just now" : `${steamDataAge()} ago`}` : "never fetched";
				$("#bar-signin").hidden = !steamLooksSignedOut;
				$("#signin").hidden = !steamLooksSignedOut;
				$("#bar-problem").hidden = !errorRecords.length;
				$("#bar-problem").textContent = plural(errorRecords.length, "error");
				$("#problem").hidden = !errorRecords.length;
				$("#problem-text").textContent = `Something went wrong (${errorRecords.length})`;
				if ($("#panel").hidden) return;
				if (view === "main") updateMainView($, sets);
				if (view === "settings") updateSettingsView($("#view-settings"));
				if (view === "debug") updateDebugView($("#debug-body"), debugTab);
				$("#report").href = `${issuesUrl}?title=${encodeURIComponent(`Problem on ${location.hostname} (version ${GM_info?.script?.version ?? "unknown"})`)}`;
			},
		};
		panel.applyLayout();
		setMinimized(GM_getValue(panelMinimizedKey, false) === true);
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

	// Builds the settings view from settingDefinitions, grouped by `group`,
	// plus the API key field and the data buttons.
	function buildSettingsView(container) {
		let group = "";
		for (const definition of settingDefinitions) {
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
				control.addEventListener("click", guard(`panel setting ${definition.id}`, () => setSetting(definition.id, !getSetting(definition.id))));
				row.append(control);
			} else {
				const choices = document.createElement("span");
				choices.className = "choices";
				for (const [value, text] of definition.choices) {
					const choice = document.createElement("button");
					choice.textContent = text;
					choice.dataset.setting = definition.id;
					choice.dataset.value = value;
					choice.addEventListener("click", guard(`panel setting ${definition.id}`, () => setSetting(definition.id, value)));
					choices.append(choice);
				}
				row.append(choices);
			}
			container.append(row);
		}

		// The key itself is never shown again after saving, only its last 4 characters.
		const keyInput = document.createElement("input");
		keyInput.type = "password";
		keyInput.autocomplete = "off";
		keyInput.spellcheck = false;
		keyInput.placeholder = "32-character key";
		const keyStatus = document.createElement("div");
		keyStatus.className = "note";
		keyStatus.id = "api-key-status";
		const keyActions = document.createElement("div");
		keyActions.className = "actions";
		const addButton = (parent, text, title, action) => {
			const button = document.createElement("button");
			button.className = "button";
			button.textContent = text;
			button.title = title;
			button.addEventListener("click", guard(`panel action ${text}`, () => {
				debugLog.add("panel", `clicked ${text}`);
				return action();
			}));
			parent.append(button);
			return button;
		};
		addButton(keyActions, "Save key", "Save the key in your userscript manager", () => {
			const key = keyInput.value.trim();
			if (!steamApi.isValidFormat(key)) {
				keyStatus.textContent = "Not saved: a key is 32 letters and digits (0-9, A-F).";
				return;
			}
			steamApi.setKey(key);
			keyInput.value = "";
			debugLog.add("settings", "Steam Web API key saved");
			thePanel?.update();
		});
		addButton(keyActions, "Clear key", "Remove the saved key", () => {
			steamApi.clearKey();
			debugLog.add("settings", "Steam Web API key cleared");
			thePanel?.update();
		});
		container.append(keyInput, keyStatus, keyActions);

		const dataHeading = document.createElement("div");
		dataHeading.className = "group";
		dataHeading.textContent = "Saved data";
		const dataActions = document.createElement("div");
		dataActions.className = "actions";
		addButton(dataActions, "Refresh Steam data", "Fetch your owned, wishlisted and ignored lists again", () => {
			refreshSteamData().catch(steamRefreshFailed).finally(() => thePanel?.update());
		});
		addButton(dataActions, "Retry misses", "Forget titles that weren't found and look them up again", () => {
			clearSavedMisses();
			location.reload();
		});
		// Saved lookups are shared by every tab, so clearing takes a second click.
		let clearTimer = 0;
		const clearButton = addButton(dataActions, "Clear saved lookups", "Forget every saved title, product and bundle lookup, in every tab", () => {
			if (!clearTimer) {
				clearButton.textContent = "Click again to clear (all tabs)";
				clearTimer = setTimeout(() => {
					clearTimer = 0;
					clearButton.textContent = "Clear saved lookups";
				}, 4000);
				return;
			}
			clearTimeout(clearTimer);
			clearSavedLookups();
			location.reload();
		});
		const note = document.createElement("div");
		note.className = "note";
		note.textContent = "Nothing uses the API key yet. Switching it clears saved lookups and fetches your Steam data again.";
		container.append(note, dataHeading, dataActions);
	}

	function updateSettingsView(container) {
		for (const control of container.querySelectorAll("[data-setting]")) {
			const value = getSetting(control.dataset.setting);
			if (control.classList.contains("switch")) control.setAttribute("aria-checked", String(value));
			else control.setAttribute("aria-pressed", String(control.dataset.value === value));
		}
		const key = steamApi.getKey();
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
		if (!pageItems.length) {
			const pre = document.createElement("pre");
			pre.textContent = "No items seen on this page yet.";
			container.append(pre);
			return;
		}
		for (const item of pageItems) {
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

	// A short message next to the debug view's buttons, gone after a moment.
	// note can be null (Report a problem from the main view or the fallback
	// notice).
	function showNote(note, message) {
		if (!note) return;
		note.textContent = message;
		note.className = "copied";
		clearTimeout(note.bh_timer);
		note.bh_timer = setTimeout(() => { note.textContent = ""; }, 2500);
	}

	// Copies the report; when the clipboard is blocked, shows it selected so
	// Ctrl+C works.
	function copyReport(text, body, note) {
		const done = (message) => showNote(note, message);
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
	const schedulePanelUpdate = throttle(() => thePanel?.update(), 1000);

	// The longest new-issue address to open; GitHub turns away much longer ones.
	const maxIssueUrlLength = 8000;

	// The new-issue address for Report a problem: a title, two questions and
	// the debug report in a code block. When the full report makes the address
	// too long, the overview goes in instead, with a note to paste the full
	// report, which is on the clipboard; failing that, only the note.
	function problemReportUrl(report, overview) {
		const version = GM_info?.script?.version ?? "unknown";
		const title = `Problem on ${location.hostname} (version ${version})`;
		const questions = "**What happened?**\n\n\n**What did you expect to happen?**\n\n\n";
		const codeBlock = (text) => "```\n" + text + "\n```\n";
		const pasteNote = "The full report (with the items and the log) was copied to your clipboard: please paste it below. If it wasn't, open the debug view in the Bundle Helper panel and click Copy all.";
		const bodies = [
			`${questions}**Debug report**\n\n${codeBlock(report)}`,
			`${questions}**Debug report** (overview)\n\n${codeBlock(overview)}\n${pasteNote}\n\n`,
			`${questions}**Debug report**\n\n${pasteNote}\n\n`,
		];
		const address = (body) => `${issuesUrl}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
		return bodies.map(address).find((url) => url.length <= maxIssueUrlLength) ?? address(bodies[bodies.length - 1]);
	}

	// Report a problem: copies the full debug report to the clipboard, then
	// opens GitHub's new-issue page in a new tab with the report filled in.
	// Nothing is sent by the script itself; the report reaches GitHub through
	// the page the person opened, and is posted only if they submit it.
	function reportProblem(note) {
		debugLog.add("panel", "Report a problem");
		const report = buildDebugReport("all");
		if (navigator.clipboard?.writeText) {
			navigator.clipboard.writeText(report).then(() => showNote(note, "Report copied"), () => showNote(note, "Couldn't copy: use Copy all"));
		}
		GM_openInTab(problemReportUrl(report, buildDebugReport("overview")), {active: true});
	}

	// Shown only when the panel couldn't be built: a plain line in the corner
	// with the same way to report the problem.
	function showFallbackNotice() {
		const notice = document.createElement("bundle-helper-notice");
		notice.style.cssText = "all: initial; position: fixed; left: 0; bottom: 0; z-index: 99; padding: 0.4em 0.8em; font: 13px/1.5 Arial, Helvetica, sans-serif; color: #ff6b6b; background: rgb(15, 25, 36); border: 1px solid #2a475e;";
		notice.textContent = "Bundle Helper: something went wrong. ";
		const link = document.createElement("a");
		link.href = issuesUrl;
		link.textContent = "Report a problem";
		link.style.cssText = "all: initial; color: #66c0f4; text-decoration: underline; cursor: pointer; font: inherit;";
		link.addEventListener("click", guard("problem notice", (ev) => {
			ev.preventDefault();
			reportProblem(null);
		}));
		notice.append(link);
		document.body.append(notice);
	}

	// Plain-text report: [Section] headers and "Setting = value" lines.
	// tab: "overview", "items", "log" or "all" (everything, used by Copy all).
	// Never includes anything that identifies the user: the page address has
	// no query or #hash, errors are cleaned by recordError(), and the API key
	// only shows its last 4 characters.
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
			value("Update URL", cleanText(info?.script?.updateURL || info?.script?.downloadURL || info?.scriptUpdateURL || "unknown"));
			value("Injection mode", info?.sandboxMode ?? info?.injectInto ?? "unknown");
			value("Browser", navigator.userAgent);
			value("Script started", `${debugState.started_ms} ms after the page started loading`);
			value("First item marked", debugState.first_mark_ms === null ? "not yet" : `${debugState.first_mark_ms} ms after the page started loading`);

			section("Page");
			value("Page", location.origin + location.pathname);
			value("Page at script start", location.href === debugState.url_at_start ? "same" : `${debugState.url_at_start.split(/[?#]/)[0]} (the site changed pages without reloading)`);
			value("Site handler", debugState.site_handler || "none (this host has no handler)");
			value("Window", `${window.innerWidth} x ${window.innerHeight}, ${document.visibilityState} (${debugState.visibility_at_start} when the script started)`);
			value("Page language", document.documentElement.lang || "not set");

			section("Settings");
			for (const definition of settingDefinitions) value(definition.label, getSetting(definition.id));
			value("Panel scale", panelScale());

			section("Steam data");
			const sets = getSteamSets();
			const fetched = GM_getValue(steamDataTimeKey, 0);
			value("Last fetched", fetched ? `${new Date(fetched * 1000).toISOString()} (${steamDataAge()} ago)` : "never");
			value("Fetch on this page", debugState.steam_fetch);
			value("Owned apps", sets.ownedApps.size);
			value("Owned packages", sets.ownedPackages.size);
			value("Wishlisted apps", sets.wishlist.size);
			value("Ignored apps", sets.ignoredApps.size);
			value("Ignored packages", sets.ignoredPackages.size);
			if (!sets.ownedApps.size) value("Warning", "no owned apps saved; sign in at store.steampowered.com, then click refresh");

			section("Saved lookups");
			const saved = Object.entries(readSavedLookups());
			const kind = (key) => {
				if (key.startsWith("fanatical-contents:")) return "Fanatical products";
				if (key.startsWith("package-check:") || key.startsWith("dlc-base:")) return "Steam ID checks";
				return "Titles";
			};
			for (const name of ["Titles", "Fanatical products", "Steam ID checks"]) {
				const entries = saved.filter(([key]) => kind(key) === name);
				value(name, `${entries.filter(([, e]) => e.match).length} found, ${entries.filter(([, e]) => !e.match).length} not found`);
			}
			value("Saved format version", savedLookupsVersion);

			section("Requests on this page");
			value("Steam search", requestCounts.steam_search);
			value("Steam app details", requestCounts.steam_app_details);
			value("Steam package details", requestCounts.steam_package_details);
			value("Fanatical data", requestCounts.fanatical);
			value("Answered from saved lookups", requestCounts.saved);

			section("This page");
			value("Items seen", pageItems.length);
			value("Marked owned", count(".bh_owned"));
			value("Marked wishlisted", count(".bh_wished"));
			value("Marked ignored", count(".bh_ignored"));
			value("Marked partly owned packs", count(".bh_partial"));
			value("Marked packs", count(".bh_pack"));
			value("Steam buttons", count(".bh_steamlink"));
			value("Processed elements", count(".bh_already_processed"));
			value("Page watchers", activeMutationObservers.length);
			value("Page scans", `${scanStats.count}, slowest ${scanStats.slowest_ms} ms, average ${scanStats.count ? Math.round(scanStats.total_ms / scanStats.count) : 0} ms`);
			const duplicates = [...document.querySelectorAll(".bh_already_processed")].filter((el) => el.querySelectorAll(".bh_steamlink").length > 1).length;
			value("Items with more than one Steam button", duplicates);
			for (const [rule, found] of ruleCounts) value(`Found by ${rule}`, found);
			if (debugState.site_handler === "fanatical.com") {
				value("Fanatical fetch hook", debugState.fetch_hook);
				value("Fanatical covers with Steam data", `${fanaticalCoverMap.size}${fanaticalCoverMap.size ? "" : " (0 after the page loaded means the hook isn't seeing Fanatical's data)"}`);
				value("Fanatical data fallback", debugState.fanatical_data_fallback);
			}
			value("Errors this page", debugLog.count("error"));

			section("Errors");
			errorRecords.forEach((record, i) => {
				const times = record.count > 1 ? `, ${record.count} times` : "";
				value(`Error ${i + 1}`, `${record.task}${times}, first at ${record.time.toLocaleTimeString()}`);
				value(`Error ${i + 1} message`, record.text);
				value(`Error ${i + 1} stack`, record.frames.join(", ") || "not readable in this browser");
			});
			if (!errorRecords.length) lines.push("(none)");
			if (!ownScriptLocation) value("Stack traces", "this browser gives no readable stack, so frames can't be told apart");

			section("Steam API");
			const key = steamApi.getKey();
			value("Key", key ? `set (ends in ${key.slice(-4)})` : "not set");
			value("Key format", key ? (steamApi.isValidFormat(key) ? "valid (32 hex characters)" : "INVALID") : "n/a");
			value("Used by", "nothing yet");
			value("Requests this page", steamApi.stats.requests);
			value("Failed requests", steamApi.stats.failures);
			value("Last error", steamApi.stats.last_error || "none");
		}

		if (want("items")) {
			section("Items (name = result, source)");
			for (const item of pageItems) value(item.name, `${itemState(item.match).text}, from ${item.source}`);
			if (!pageItems.length) lines.push("(none yet)");
		}

		if (want("log")) {
			section("Log (newest last)");
			for (const entry of debugLog.entries) {
				lines.push(`${entry.time.toLocaleTimeString()} ${entry.category}: ${entry.message}`);
			}
			if (!debugLog.entries.length) lines.push("(empty)");
		}
		return lines.join("\n");
	}

	function addBundleHelperUI() {
		thePanel = createPanel();
		document.body.appendChild(thePanel.host);
		return thePanel;
	}

	//////////////////////////////////////////////////
	// Start-up

	function processSite() {
		let hostname = document.location.hostname;
		// Removing the www. prefix, if present.
		hostname = hostname.replace(/^www\./, "");
		// Calling the site-specific code, if found.
		const handler = siteMapping[hostname];
		debugState.site_handler = handler ? hostname : "";
		if (!handler) return;
		debugLog.add("site", `running the ${hostname} handler`);
		try {
			handler();
		} catch (error) {
			recordError(`${hostname} handler`, error);
		}
	}

	function addMarkingStyles() {
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
	}

	// Each step runs on its own: if the panel can't be built, the Steam data
	// is still fetched, marking still runs, and a plain notice offers the
	// report instead.
	function main() {
		guard("start-up: styles", addMarkingStyles)();
		guard("start-up: settings", applySettings)();
		guard("start-up: Steam data", () => {
			refreshSteamDataIfOld().catch(steamRefreshFailed).finally(() => thePanel?.update());
		})();
		guard("start-up: panel", addBundleHelperUI)();
		if (!thePanel?.host.isConnected) guard("start-up: notice", showFallbackNotice)();
		guard("start-up: site", processSite)();
	}

	main();

})();
