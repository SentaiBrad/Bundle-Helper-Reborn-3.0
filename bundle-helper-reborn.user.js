// ==UserScript==
// @name            Bundle Helper Reborn 3.0
// @namespace       https://github.com/SentaiBrad/
// @author          SentaiBrad
// @version         3.0.13
// @description     Marks owned/ignored/wishlisted games on several sites, and also adds a button to open the steam page for each game.
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

# Bundle Helper Reborn

Marks owned/ignored/wishlisted games on several sites, and also adds a button to open the steam page for each game.

## Purpose

If you have a Steam account, you are probably also buying games from other
websites.

This user-script can help you by highlighting (on other sites) the games you
already have, games you have ignored, and games you have wishlisted (on Steam).

It also adds a convenient button (actually, a link) to open the Steam page for
each game on the supported third-party websites.

It is complementary to the amazing [AugmentedSteam browser extension](https://augmentedsteam.com/).
While that extension only applies to the Steam website(s), this user-script
applies to third-party websites.

It needs the permission to connect to `store.steampowered.com` to get the list
of owned/ignored/wishlisted items for the current logged-in user.

## History

This user-script is a fork of ["Bundle Helper" v1.09 by "7-elephant"](https://greasyfork.org/en/scripts/16105-bundle-helper).

It was initially based on 7-elephant's code, but has been completely rewritten
for v2.0. Code for obsolete websites was removed. Additional code for
extraneous poorly-documented functionality was also removed. This fork/version
has a clear purpose and sticks to that purpose. It's also supposed to be easier
to add support for more websites, or update the current ones when needed.

In order to avoid name clashes, I've decided to name it "Bundle Helper Reborn".

This fork also available at:
* https://greasyfork.org/en/scripts/478401-bundle-helper-reborn
* https://gist.github.com/denilsonsa/618ca8a9d04d574a162b10cbd3fce20f

* License: [GPL-3.0-only](https://spdx.org/licenses/GPL-3.0-only.html)
* Copyright 2016-2019, 7-elephant
* Copyright 2023, Denilson Sá Maia
* Copyright 2026, SentaiBrad

## Bundle Helper Reborn 3.0

Maintained by SentaiBrad: https://github.com/SentaiBrad/Bundle-Helper-Reborn-3.0
Continues "Bundle Helper Reborn 2.0 - Extended" (v2.x), previously published at
https://gist.github.com/SentaiBrad/076c6966ddfe4c328e90ccc8396720f7

*/

(function () {
	"use strict";
	// jshint multistr:true

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
		} catch (ex) {
			// Invalid URL.
			return "";
		}

		return url.pathname.replace(reX`^.*/`, "");
	}

	// Returns a new function that will call the callback without arguments
	// after timeout milliseconds of quietness.
	function debounce(callback, timeout = 500) {
		let id = null;
		return function() {
			clearTimeout(id);
			id = setTimeout(callback, timeout);
		};
	}

	const active_mutation_observers = [];

	function stopAllMutationObservers() {
		for (const observer of active_mutation_observers) {
			observer.disconnect();
		}
		active_mutation_observers.length = 0;
	}

	// Returns a new MutationObserver that observes a specific node.
	// The observer will be immediately active.
	function debouncedMutationObserver(rootNode, callback, timeout = 500) {
		const func = debounce(callback, timeout);
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

	// Adds a MutationObserver to each root node matched by the CSS selector.
	function debouncedMutationObserverSelectorAll(rootSelector, callback, timeout = 500) {
		for (const root of document.querySelectorAll(rootSelector)) {
			debouncedMutationObserver(root, callback, timeout);
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
	// Same as reX, but ignoring case.
	function reXi(re_string) {
		return new RegExp(reX(re_string), "i");
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

		re_app.lastIndex = 0;
		re_sub.lastIndex = 0;

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
		first_mark_ms: null,
		fetch_hook: "not used on this site",
	};

	// Call whenever an item gets marked; records how long the first one took.
	function noteMarked() {
		if (debug_state.first_mark_ms === null) {
			debug_state.first_mark_ms = Math.round(performance.now());
			debug_log.add("site", `first item marked ${debug_state.first_mark_ms} ms after the page started loading`);
		}
	}

	//////////////////////////////////////////////////
	// Steam profile data caching

	const cachename_profile_data = "bh_profile_data";
	const cachename_profile_time = "bh_profile_time";
	const cache_max_age_seconds = 60 * 60 * 24;  // 24 hours
	let cached_sets = null;

	function setProfileCache(data) {
		cached_sets = null;
		data.rgCurations = {};
		data.rgCurators = {};
		data.rgCuratorsIgnored = [];
		data.rgRecommendedApps = [];
		data.rgRecommendedTags = [];
		GM_setValue(cachename_profile_data, data);
		GM_setValue(cachename_profile_time, getUnixTimestamp());
	}

	function clearProfileCache() {
		cached_sets = null;
		GM_setValue(cachename_profile_data, {});
		GM_setValue(cachename_profile_time, 0);
	}

	function getProfileCacheAge() {
		const now = getUnixTimestamp();
		const cached = GM_getValue(cachename_profile_time, 0);
		if (!cached) {
			return "";
		}
		return humanReadableSecondsAmount(now - cached);
	}

	function isProfileCacheExpired() {
		const now = getUnixTimestamp();
		const cached = GM_getValue(cachename_profile_time, 0);
		return now - cached > cache_max_age_seconds;
	}

	function downloadProfileData() {
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

	function downloadAndUpdateProfileCache() {
		return downloadProfileData().then((data) => {
			const owned = data?.rgOwnedApps?.length ?? 0;
			debug_state.steam_fetch = `ok at ${new Date().toLocaleTimeString()}: ${owned} owned apps`;
			debug_log.add("steam", `profile data fetched: ${owned} owned apps, ${data?.rgOwnedPackages?.length ?? 0} owned packages, ${data?.rgWishlist?.length ?? 0} wishlisted`);
			if (!owned) debug_log.add("error", "Steam returned 0 owned apps. Usually this means you're not signed in at store.steampowered.com in this browser.");
			setProfileCache(data);
		});
	}

	function updateProfileCacheIfExpired() {
		if (isProfileCacheExpired()) {
			return downloadAndUpdateProfileCache();
		} else {
			return Promise.resolve();
		}
	}

	function getCachedSets() {
		if (!cached_sets) {
			const data = GM_getValue(cachename_profile_data, {});
			cached_sets = {
				appsInCart: new Set(data.rgAppsInCart),
				ignoredPackages: new Set(data.rgIgnoredPackages),
				ownedApps: new Set(data.rgOwnedApps),
				ownedPackages: new Set(data.rgOwnedPackages),
				packagesInCart: new Set(data.rgPackagesInCart),
				wishlist: new Set(data.rgWishlist),
				ignoredApps: new Set(Object.keys(data.rgIgnoredApps ?? {}).map((key) => Number(key))),
				excludedTags: new Set(data.rgExcludedTags?.map((obj) => obj.name)),
			};
		}
		return cached_sets;
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
		// Filled in by future API calls; shown on the debug panel's Steam API tab.
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
		hasKey() {
			return this.getKey().length > 0;
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
	// Bundle Helper panel (bottom-left corner)
	//
	// The panel is a list of sections. Each section supplies its own HTML,
	// optional CSS, an init(panel) to hook up events and an update(panel) to
	// refresh what it shows. New features add a section with addPanelSection()
	// instead of editing the panel itself.

	// Monochrome Steam logo for the panel (same shapes as the Steam buttons).
	const steam_icon_svg = `
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" aria-label="Steam" role="img">
			<path d="m183 280 41 28 27 41 87-62-94-96"/>
			<circle cx="325" cy="191" r="74" fill="none" stroke="currentColor" stroke-width="40"/>
			<ellipse cx="191" cy="340" rx="56" ry="56" fill="none" stroke="currentColor" stroke-width="40"/>
		</svg>
	`;

	// Classic "bug" icon.
	const bug_icon_svg = `
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-label="Debug" role="img">
			<path d="M9 3.5 7.6 2.1l1-1L10.3 2.8a5 5 0 0 1 3.4 0L15.4 1.1l1 1L15 3.5A5 5 0 0 1 17 7H7a5 5 0 0 1 2-3.5Z"/>
			<path d="M6 8h12v6a6 6 0 0 1-5.25 5.95V11h-1.5v8.95A6 6 0 0 1 6 14V8Z"/>
			<path d="M1 9h4v1.5H1zM19 9h4v1.5h-4zM1 13.25h4v1.5H1zM19 13.25h4v1.5h-4zM2.5 19.5 5.6 16.4l1.1 1.06-3.1 3.1zM21.5 19.5l-3.1-3.1-1.1 1.06 3.1 3.1z"/>
		</svg>
	`;

	const panel_sections = [];

	function addPanelSection(section) {
		panel_sections.push(section);
	}

	const panel_base_css = `
		.container {
			display: inline-block;
			background: #1b2838;
			color: #ddd;
			padding: 0.5em;
			border-radius: 0 0.5em 0 0;
			border: 1px #ddd outset;
			border-width: 1px 1px 0 0;
			font: 12px sans-serif;
		}
		p {
			margin: 0;
		}
		a {
			font: inherit;
			color: inherit;
			text-decoration: none;
		}
		a:hover {
			color: #fff;
			text-decoration: underline;
		}
		.right {
			float: right;
			margin-left: 0.5em;
		}
		/* Expanded views (debug, Steam settings) take the panel's existing width
		   instead of widening it, and wrap their text. */
		.view {
			margin-top: 0.4em;
			padding-top: 0.4em;
			border-top: 1px solid #556;
			width: 0;
			min-width: 100%;
			overflow-wrap: anywhere;
		}
	`;

	function createPanel() {
		const root = document.createElement("bundle-helper");
		const shadow = root.attachShadow({mode: "open"});
		shadow.innerHTML = `
			<style>${panel_base_css}${panel_sections.map((s) => s.css ?? "").join("\n")}</style>
			<div class="container">${panel_sections.map((s) => `<div data-section="${s.id}">${s.html}</div>`).join("")}</div>
		`;

		const panel = {
			root,
			shadow,
			$: (selector) => shadow.querySelector(selector),
			update() {
				for (const section of panel_sections) {
					try {
						section.update?.(panel);
					} catch (error) {
						debug_log.add("error", `panel section "${section.id}" update failed: ${error}`);
					}
				}
			},
			close() {
				root.remove();
			},
			// Views are hidden sections opened by a panel button; one at a time.
			toggleView(id) {
				for (const view of shadow.querySelectorAll(".view")) {
					view.hidden = (view.id === id) ? !view.hidden : true;
				}
				panel.update();
			},
		};

		for (const section of panel_sections) {
			try {
				section.init?.(panel);
			} catch (error) {
				debug_log.add("error", `panel section "${section.id}" init failed: ${error}`);
			}
		}
		panel.update();
		return panel;
	}

	// Section: Steam profile data summary and the panel's links.
	addPanelSection({
		id: "steam",
		html: `
			<p>
				Steam profile data <a href="javascript:;" id="refresh">last fetched <output id="age"></output> ago</a>.
			</p>
			<p>
				Owned:
				<output id="ownedApps"></output> apps,
				<output id="ownedPackages"></output> packages.
			</p>
			<p>
				Ignored:
				<output id="ignoredApps"></output> apps,
				<output id="ignoredPackages"></output> packages.
			</p>
			<p>
				<a href="javascript:;" id="close" class="right">[close]</a>
				<a href="javascript:;" id="retry" class="right" title="Forget saved title misses and look them up again">[retry misses]</a>
				<a href="javascript:;" id="debug-toggle" class="right icon" title="Debug info">${bug_icon_svg}</a>
				<a href="javascript:;" id="steam-toggle" class="right icon" title="Steam settings">${steam_icon_svg}</a>
				Wishlisted:
				<output id="wishlist"></output> apps.
			</p>
		`,
		css: `
			.icon svg {
				width: 12px;
				height: 12px;
				vertical-align: -2px;
				fill: currentColor;
			}
		`,
		init(panel) {
			panel.$("#refresh").addEventListener("click", (ev) => {
				ev.preventDefault();
				downloadAndUpdateProfileCache().catch(() => {}).finally(() => panel.update());
			});
			panel.$("#retry").addEventListener("click", (ev) => {
				ev.preventDefault();
				const removed = clearTitleMisses();
				debug_log.add("lookup", `cleared ${removed} saved misses, reloading page`);
				location.reload();
			});
			panel.$("#close").addEventListener("click", (ev) => {
				ev.preventDefault();
				panel.close();
			});
		},
		update(panel) {
			const sets = getCachedSets();
			panel.$("#age").value = getProfileCacheAge() || "never";
			panel.$("#ownedApps").value = sets.ownedApps.size;
			panel.$("#ownedPackages").value = sets.ownedPackages.size;
			panel.$("#ignoredApps").value = sets.ignoredApps.size;
			panel.$("#ignoredPackages").value = sets.ignoredPackages.size;
			panel.$("#wishlist").value = sets.wishlist.size;
		},
	});

	// Section: debug report, opened by the bug button. Hidden by default.
	// Tabs show parts of the report; [copy] always copies the whole report.
	addPanelSection({
		id: "debug",
		html: `
			<div id="debug" class="view" hidden>
				<div class="tabs">
					<span>
						<a href="javascript:;" class="tab" data-tab="overview">Overview</a>
						<a href="javascript:;" class="tab" data-tab="log">Log</a>
						<a href="javascript:;" class="tab" data-tab="api">Steam API</a>
					</span>
					<span>
						<a href="javascript:;" id="debug-refresh">[refresh]</a>
						<a href="javascript:;" id="debug-copy" title="Copy the full report (all tabs)">[copy]</a>
					</span>
				</div>
				<div class="debug-body">
					<span id="debug-copied" hidden></span>
					<pre id="debug-text"></pre>
				</div>
			</div>
		`,
		css: `
			/* One fixed line: tabs left, actions right. Nothing is ever inserted
			   here, so it can't wrap or change size. */
			.tabs {
				display: flex;
				justify-content: space-between;
				gap: 0.5em;
				white-space: nowrap;
			}
			.tab {
				padding: 0 0.3em;
				border-radius: 3px;
			}
			/* Status messages ("copied") float over the report instead of
			   taking space in the layout. */
			.debug-body {
				position: relative;
			}
			#debug-copied {
				position: absolute;
				top: 0.3em;
				right: 0.3em;
				padding: 0.1em 0.5em;
				border-radius: 3px;
				background: #2a475e;
				color: #fff;
				pointer-events: none;
			}
			.tab.active {
				background: #2a475e;
				color: #fff;
			}
			#debug-text {
				margin: 0.4em 0 0 0;
				max-height: 40vh;
				overflow-y: auto;
				white-space: pre-wrap;
				overflow-wrap: anywhere;
				font: 11px monospace;
				user-select: text;
			}
		`,
		init(panel) {
			let current_tab = "overview";
			const show = () => {
				for (const tab of panel.shadow.querySelectorAll(".tab")) {
					tab.classList.toggle("active", tab.dataset.tab === current_tab);
				}
				panel.$("#debug-text").textContent = buildDebugReport(current_tab);
			};
			panel.showDebugTab = show;
			for (const tab of panel.shadow.querySelectorAll(".tab")) {
				tab.addEventListener("click", (ev) => {
					ev.preventDefault();
					current_tab = tab.dataset.tab;
					show();
				});
			}
			panel.$("#debug-toggle").addEventListener("click", (ev) => {
				ev.preventDefault();
				panel.toggleView("debug");
			});
			panel.$("#debug-refresh").addEventListener("click", (ev) => {
				ev.preventDefault();
				show();
			});
			panel.$("#debug-copy").addEventListener("click", (ev) => {
				ev.preventDefault();
				const text = buildDebugReport("all");
				const done = (message) => {
					const note = panel.$("#debug-copied");
					note.textContent = message;
					note.hidden = false;
					clearTimeout(note.bh_timer);
					note.bh_timer = setTimeout(() => note.hidden = true, 2500);
				};
				const fallback = () => {
					// Clipboard blocked: show the full report and select it so Ctrl+C works.
					panel.$("#debug-text").textContent = text;
					const range = document.createRange();
					range.selectNodeContents(panel.$("#debug-text"));
					const selection = window.getSelection();
					selection.removeAllRanges();
					selection.addRange(range);
					done("selected, press Ctrl+C");
				};
				if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => done("copied"), fallback);
				else fallback();
			});
		},
		update(panel) {
			if (!panel.$("#debug").hidden) panel.showDebugTab();
		},
	});

	// Section: Steam settings, opened by the Steam button. Hidden by default.
	// Today it only stores the optional Web API key; nothing uses it yet.
	addPanelSection({
		id: "steam-settings",
		html: `
			<div id="steam-settings" class="view" hidden>
				<p><b>Steam Web API key</b> (optional, not used yet)</p>
				<p>Status: <output id="api-key-status"></output></p>
				<p>
					<input id="api-key-input" type="password" autocomplete="off" spellcheck="false" placeholder="32-character key">
				</p>
				<p>
					<a href="javascript:;" id="api-key-save">[save]</a>
					<a href="javascript:;" id="api-key-clear">[clear]</a>
				</p>
				<p class="hint">Get one at <a href="https://steamcommunity.com/dev/apikey" target="_blank" rel="noopener">steamcommunity.com/dev/apikey</a>. Stored only in your userscript manager.</p>
			</div>
		`,
		css: `
			#api-key-input {
				box-sizing: border-box;
				width: 100%;
				font: 11px monospace;
				background: #0e1621;
				color: #ddd;
				border: 1px solid #556;
				padding: 1px 3px;
				margin: 0.3em 0;
			}
			.hint {
				color: #9aa;
				font-size: 11px;
			}
			.hint a {
				text-decoration: underline;
			}
		`,
		init(panel) {
			panel.$("#steam-toggle").addEventListener("click", (ev) => {
				ev.preventDefault();
				panel.toggleView("steam-settings");
			});
			panel.$("#api-key-save").addEventListener("click", (ev) => {
				ev.preventDefault();
				const key = panel.$("#api-key-input").value.trim();
				if (!steam_api.isValidFormat(key)) {
					panel.$("#api-key-status").value = "not saved: a key is 32 letters and digits (0-9, A-F)";
					return;
				}
				steam_api.setKey(key);
				panel.$("#api-key-input").value = "";
				debug_log.add("steam", "Steam Web API key saved");
				panel.update();
			});
			panel.$("#api-key-clear").addEventListener("click", (ev) => {
				ev.preventDefault();
				steam_api.clearKey();
				panel.$("#api-key-input").value = "";
				debug_log.add("steam", "Steam Web API key cleared");
				panel.update();
			});
		},
		update(panel) {
			const key = steam_api.getKey();
			panel.$("#api-key-status").value = key ? `saved (ends in ${key.slice(-4)})` : "not set";
		},
	});

	// Plain-text report: [Section] headers and "Setting = value" lines.
	// tab: "overview", "log", "api" or "all" (everything, used by [copy]).
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
			value("Page", location.origin + location.pathname);
			value("Page at script start", location.href === debug_state.url_at_start ? "same" : `${debug_state.url_at_start} (the site changed pages without reloading)`);
			value("Site handler", debug_state.site_handler || "none (this host has no handler)");
			value("Browser", navigator.userAgent);
			value("Script started", `${debug_state.started_ms} ms after the page started loading`);
			value("First item marked", debug_state.first_mark_ms === null ? "not yet" : `${debug_state.first_mark_ms} ms after the page started loading`);

			section("Steam data");
			const sets = getCachedSets();
			const fetched = GM_getValue(cachename_profile_time, 0);
			value("Last fetched", fetched ? `${new Date(fetched * 1000).toISOString()} (${getProfileCacheAge()} ago)` : "never");
			value("Fetch on this page", debug_state.steam_fetch);
			value("Owned apps", sets.ownedApps.size);
			value("Owned packages", sets.ownedPackages.size);
			value("Wishlisted apps", sets.wishlist.size);
			value("Ignored apps", sets.ignoredApps.size);
			value("Ignored packages", sets.ignoredPackages.size);
			if (!sets.ownedApps.size) value("Warning", "no owned apps saved; sign in at store.steampowered.com, then click 'last fetched'");

			section("Title lookups");
			const saved = Object.values(loadTitleCache());
			value("Saved format version", title_cache_version);
			value("Saved matches", saved.filter((e) => e.match).length);
			value("Saved misses", saved.filter((e) => !e.match).length);
			value("Log lines this page", debug_log.count("lookup"));

			section("This page");
			value("Marked owned", count(".bh_owned"));
			value("Marked wishlisted", count(".bh_wished"));
			value("Marked ignored", count(".bh_ignored"));
			value("Steam buttons", count(".bh_steamlink"));
			value("Processed elements", count(".bh_already_processed"));
			value("Page watchers", active_mutation_observers.length);
			const duplicates = [...document.querySelectorAll(".bh_already_processed")].filter((el) => el.querySelectorAll(".bh_steamlink").length > 1).length;
			value("Items with more than one Steam button", duplicates);
			if (debug_state.site_handler === "fanatical.com") {
				value("Fanatical fetch hook", debug_state.fetch_hook);
				value("Fanatical covers with Steam data", `${fanatical_cover_map.size}${fanatical_cover_map.size ? "" : " (0 after the page loaded means the hook isn't seeing Fanatical's data)"}`);
			}
			value("Errors this page", debug_log.count("error"));
		}

		if (want("api")) {
			section("Steam API");
			const key = steam_api.getKey();
			value("Key", key ? `set (ends in ${key.slice(-4)})` : "not set");
			value("Key format", key ? (steam_api.isValidFormat(key) ? "valid (32 hex characters)" : "INVALID") : "n/a");
			value("Used by", "nothing yet");
			value("Requests this page", steam_api.stats.requests);
			value("Failed requests", steam_api.stats.failures);
			value("Last request", steam_api.stats.last_request || "none");
			value("Last error", steam_api.stats.last_error || "none");
		}

		if (want("log")) {
			section("Log (newest last)");
			const entries = debug_log.entries;
			for (const entry of entries) {
				lines.push(`${entry.time.toLocaleTimeString()} ${entry.category}: ${entry.message}`);
			}
			if (!entries.length) lines.push("(empty)");
		}
		return lines.join("\n");
	}

	function addBundleHelperUI(root) {
		if (typeof root == "string") {
			root = document.querySelector(root);
		}
		if (!root) {
			root = document.body;
		}

		const panel = createPanel();
		root.appendChild(panel.root);
		updateProfileCacheIfExpired().catch(() => {}).finally(() => panel.update());
		return panel;
	}

	//////////////////////////////////////////////////
	// Marking functions

	function getClassForAppId(app) {
		if (!app) return "";
		const sets = getCachedSets();
		if (sets.ownedApps.has(app)) return "bh_owned";
		if (sets.wishlist.has(app)) return "bh_wished";
		if (sets.ignoredApps.has(app)) return "bh_ignored";
		return "";
	}

	function getClassForSubId(sub) {
		if (!sub) return "";
		const sets = getCachedSets();
		if (sets.ownedPackages.has(sub)) return "bh_owned";
		if (sets.ignoredPackages.has(sub)) return "bh_ignored";
		return "";
	}

	// Create a new <a> link element to the appropriate Steam URL.
	function createSteamLink(app_or_sub, id) {
		const url = `https://store.steampowered.com/${app_or_sub}/${id}`;
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
		a.addEventListener("click", function(ev) {
			ev.stopPropagation();
		});
		return a;
	}

	function markElements({
		rootSelector = "body",
		itemSelector = "a[href*='store.steampowered.com/']",
		itemStringExtractor = (a) => a.href,
		closestSelector = "*",
		addSteamLinkFunc = (item, closest, steam_link) => {},
	}) {
		let total_items = 0;
		let valid_data_items = 0;
		let valid_closest_items = 0;
		let skipped_items = 0;
		let marked_items = 0;
		for (const root of document.querySelectorAll(rootSelector)) {
			for (const item of root.querySelectorAll(itemSelector)) {
				total_items++;
				const data = itemStringExtractor(item);
				if (!data) {
					continue;
				}
				valid_data_items++;
				const closest = item.closest(closestSelector);
				if (!closest) {
					continue;
				}
				valid_closest_items++;
				if (closest.classList.contains("bh_already_processed")) {
					skipped_items++;
					continue;
				}
				closest.classList.add("bh_already_processed");

				const {app, sub} = parseStringForSteamId(data);
				if (app || sub) {
					marked_items++;
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

		console.info(
			"markElements(",
			"rootSelector=", rootSelector, ",",
			"itemSelector=", itemSelector, ",",
			"closestSelector=", closestSelector, "):",
			`${total_items} total elements, ${valid_data_items} with valid data, ${valid_closest_items} with valid closest element, ${skipped_items} skipped, ${marked_items} marked`
		);
	}

	// This function tries to undo the effects of markElements().
	function unmarkAllElements() {
		const classes = [
			"bh_owned", "bh_wished", "bh_ignored", "bh_already_processed",
		];
		for (const elem of document.querySelectorAll(classes.map((s) => `.${s}`).join(", "))) {
			elem.classList.remove(...classes);
		}
		for (const elem of document.querySelectorAll(".bh_steamlink")) {
			elem.remove();
		}
	}

	//////////////////////////////////////////////////
	// Site-specific data and code

	// There are no visible ids in the DOM on Fanatical.
	// Let's use something unique as the key: the cover image filenames.
	// The values are the "steam" objects from Fanatical API.
	const fanatical_cover_map = new Map();

	// For sites that embed Steam CDN image URLs directly in <img> tags.
	function markBySteamImageUrl(rootSelector, closestSelector) {
		markElements({
			rootSelector: rootSelector,
			itemSelector: "img[src*='steamstatic.com/steam/apps/'], img[src*='cdn.akamai.steamstatic.com']",
			itemStringExtractor: (img) => img.src,
			closestSelector: closestSelector,
		});
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
	// 1 day. Changing title_cache_version discards everything (e.g. after the
	// matching rules change, so old misses get another chance).
	const title_cache_name = "bh_title_cache";
	const title_cache_version = 4;
	const title_cache_match_days = 30;
	const title_cache_miss_days = 1;
	let title_cache = null;

	function loadTitleCache() {
		if (title_cache) return title_cache;
		const stored = GM_getValue(title_cache_name, null);
		title_cache = (stored && stored.version === title_cache_version && stored.entries) ? stored.entries : {};
		const now = getUnixTimestamp();
		for (const [key, entry] of Object.entries(title_cache)) {
			const max_age = (entry?.match ? title_cache_match_days : title_cache_miss_days) * 86400;
			if (!entry || !(now - entry.time <= max_age)) delete title_cache[key];
		}
		return title_cache;
	}

	function clearTitleMisses() {
		const cache = loadTitleCache();
		let removed = 0;
		for (const [key, entry] of Object.entries(cache)) {
			if (!entry.match) { delete cache[key]; removed++; }
		}
		saveTitleCache();
		return removed;
	}

	function saveTitleCache() {
		GM_setValue(title_cache_name, {version: title_cache_version, entries: title_cache});
	}

	const pending_title_lookups = new Map();

	// GET from store.steampowered.com. Resolves to the response, or null on a
	// network/HTTP error (so the caller knows not to cache a miss).
	function steamGet(url, responseType) {
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
		// package list; asking for package_groups alone came back empty (3.0.9).
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
	function resolveTitle(title) {
		const key = normalizeTitle(spellGreek(title)) || title.trim().toLowerCase();
		if (!key) return Promise.resolve(null);
		const cache = loadTitleCache();
		if (cache[key]) {
			debug_log.add("lookup", JSON.stringify(title) + " saved result: " + (cache[key].match ? `${cache[key].match.type} ${cache[key].match.id}` : "miss"));
			return Promise.resolve(cache[key].match);
		}
		if (pending_title_lookups.has(key)) return pending_title_lookups.get(key);

		const lookup = lookupTitle(title).then(({result, cacheable}) => {
			if (cacheable) {
				cache[key] = {match: result, time: getUnixTimestamp()};
				saveTitleCache();
			}
			return result;
		}).finally(() => pending_title_lookups.delete(key));
		pending_title_lookups.set(key, lookup);
		return lookup;
	}

	const site_mapping = {
		"astats.astats.nl": function() {
			document.body.classList.add("bh_basic_style");
			GM_addStyle(`
				.bh_basic_style table.tablesorter tbody tr.bh_owned,
				.bh_basic_style table.tablesorter tbody tr.bh_wished,
				.bh_basic_style table.tablesorter tbody tr.bh_ignored {
					background: var(--bh-bgcolor) linear-gradient(135deg, rgba(0, 0, 0, 0.70) 10%, rgba(0, 0, 0, 0) 100%) !important;
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
				.bh_steamlink {
					position: absolute;
					bottom: 0;
					left: calc( 50% - var(--bh-steamlink-size) / 2 );
				}
				.ProductHeader.container .bh_steamlink {
					position: static;
					bottom: auto;
				}
			`);

			// Intercepting fetch() requests.
			// With help from:
			// * https://blog.logrocket.com/intercepting-javascript-fetch-api-requests-responses/
			// * https://stackoverflow.com/a/29293383
			// Using unsafeWindow to access the page's window object:
			// * https://violentmonkey.github.io/api/metadata-block/#inject-into
			const original_fetch = unsafeWindow.fetch;
			debug_state.fetch_hook = "installed";
			unsafeWindow.fetch = async function(...args) {
				let [resource, options] = args;
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

							// Page: https://www.fanatical.com/en/bundle/batman-arkham-collection
							// AJAX: https://www.fanatical.com/api/products-group/batman-arkham-collection/en
							for (const bundle of json_data.bundles ?? []) {
								for (const game of bundle.games ?? []) {
									if (game.cover && game.steam) {
										fanatical_cover_map.set(game.cover, game.steam);
									}
								}
							}

							// Page: https://www.fanatical.com/en/pick-and-mix/build-your-own-bento-bundle
							// AJAX: https://www.fanatical.com/api/pick-and-mix/build-your-own-bento-bundle/en
							for (const game of json_data.products ?? []) {
								if (game.cover && game.steam) {
									fanatical_cover_map.set(game.cover, game.steam);
								}
							}

							// Page: https://www.fanatical.com/en/game/the-last-of-us-part-i
							// AJAX: https://www.fanatical.com/api/products-group/the-last-of-us-part-i/en
							if (json_data.cover && json_data.steam) {
								fanatical_cover_map.set(json_data.cover, json_data.steam);
							}
						});
						return p;
					}
				}
				return response;
			};

			// Setting a MutationObserver on the whole document is bad for
			// performance, but I can't find any better way, given the website
			// rewrites the DOM at will. At least, I'm increasing the debouncing
			// time to at least 2 seconds.
			debouncedMutationObserverSelectorAll("body", function() {
				markElements({
					rootSelector: "main",
					itemSelector: "img.img-full[srcset]",
					itemStringExtractor: (img) => {
						const filename = filenameFromURL(img.src);
						const steam = fanatical_cover_map.get(filename);
						if (!steam) {
							return "";
						}
						return `/${steam.type}/${steam.id}`;
					},
					closestSelector: ".bundle-game-card, .bundle-product-card, .card, .HitCard, .header-content-container, .NewPickAndMixCard, .PickAndMixCard, .ProductHeader.container",
					addSteamLinkFunc: (item, closest, link) => {
						closest.style.position = "relative";
						closest.classList.add("bh_card");
						closest.insertAdjacentElement("beforeend", link);
					},
				});
			}, 2000);

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
			debouncedMutationObserverSelectorAll(".main-list-results", function() {
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
			debouncedMutationObserverSelectorAll(".header-search .results", function() {
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
			debouncedMutationObserverSelectorAll(".content", function() {
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
            console.log("BH: humblebundle handler running");
			document.body.classList.add("bh_basic_style");
			GM_addStyle(`
				/* Humble: outline and label on the image, not the whole tile. */
				.bh_basic_style .tier-item-view.bh_owned   .img-container,
				.bh_basic_style .tier-item-view.bh_wished  .img-container,
				.bh_basic_style .tier-item-view.bh_ignored .img-container {
					outline: var(--bh-outline-width) var(--bh-outline-style) var(--bh-color);
					outline-offset: calc(-1 * var(--bh-outline-width));
				}
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
				console.log("BH: processTiles called, tiles found:", document.querySelectorAll(".tier-item-view:not(.bh_already_processed)").length);
				for (const tile of document.querySelectorAll(".tier-item-view:not(.bh_already_processed)")) {
					tile.classList.add("bh_already_processed");
					const title_elem = tile.querySelector(".item-title");
					if (!title_elem) continue;
					const title = ([...title_elem.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent.trim()).join("")).trim();
					if (!title) debug_log.add("error", `Humble tile title came out empty; tile text is ${JSON.stringify(title_elem.textContent.trim().slice(0, 80))}`);
					resolveTitle(title).then((match) => {
						if (!match) return;
						tile.classList.remove("bh_owned", "bh_wished", "bh_ignored");
						const cssClass = match.type === "sub" ? getClassForSubId(match.id) : getClassForAppId(match.id);
						if (cssClass) { tile.classList.add(cssClass); noteMarked(); }
						const img_container = tile.querySelector(".img-container");
						img_container?.classList.add("bh_card");
						if (img_container && !img_container.querySelector(".bh_steamlink")) {
							img_container.appendChild(createSteamLink(match.type, match.id));
						}
					});
				}
			}

			console.log("BH: setting up observer, body exists:", !!document.body);
			processTiles();
			debouncedMutationObserverSelectorAll("body", processTiles, 2000);
		},
		"hrkgame.com": function() {
			document.body.classList.add("bh_basic_style");
			debouncedMutationObserverSelectorAll("body", () =>
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
                                .bh_basic_style .index_game_cell_widget.bh_owned   { outline: 3px solid var(--bh-bgcolor); outline-offset: -3px; }
                                .bh_basic_style .index_game_cell_widget.bh_wished  { outline: 3px solid var(--bh-bgcolor); outline-offset: -3px; }
                                .bh_basic_style .index_game_cell_widget.bh_ignored { outline: 3px solid var(--bh-bgcolor); outline-offset: -3px; }
                        `);

                        function processItchTiles() {
                                const tiles = document.querySelectorAll(".index_game_cell_widget.game_cell:not(.bh_already_processed)");
                                console.log("BH itch.io: processItchTiles called, tiles found:", tiles.length);
                                for (const tile of tiles) {
                                        tile.classList.add("bh_already_processed");
                                        const title_elem = tile.querySelector(".game_title, .title");
                                        if (!title_elem) continue;
                                        const title = ([...title_elem.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent.trim()).join("")).trim();
                                        if (!title) debug_log.add("error", `itch.io tile title came out empty; tile text is ${JSON.stringify(title_elem.textContent.trim().slice(0, 80))}`);
                                        resolveTitle(title).then((match) => {
                                                if (!match) return;
                                                tile.classList.remove("bh_owned", "bh_wished", "bh_ignored");
                                                const cssClass = match.type === "sub" ? getClassForSubId(match.id) : getClassForAppId(match.id);
                                                if (cssClass) { tile.classList.add(cssClass); noteMarked(); }
                                                const thumb = tile.querySelector("a.game_thumb");
                                                if (thumb && !thumb.querySelector(".bh_steamlink")) {
                                                        const link = createSteamLink(match.type, match.id);
                                                        link.style.position = "absolute";
                                                        link.style.bottom = "4px";
                                                        link.style.right = "4px";
                                                        link.style.zIndex = "10";                                                        thumb.appendChild(link);
                                                }
                                        });
                                }
                        }

                        // Retry loop: tiles load after script fires, keep trying for 10 seconds
                        let _itchRetries = 0;
                        function _itchRetry() {
                                processItchTiles();
                                if (document.querySelectorAll(".index_game_cell_widget.game_cell").length === 0 && _itchRetries++ < 10) {
                                        setTimeout(_itchRetry, 1000);
                                }
                        }
                        _itchRetry();
                        debouncedMutationObserverSelectorAll("body", processItchTiles, 2000);
                },
		"tiltify.com": function() {
			document.body.classList.add("bh_basic_style");
			debouncedMutationObserverSelectorAll("body", () =>
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
			// Eneba cards move on hover; marking uses the ring/tint style, which
			// doesn't affect size or position, and the Steam button is placed
			// absolutely inside the card.
			document.body.classList.add("bh_basic_style");
			GM_addStyle(`
				.bh_eneba_card {
					position: relative;
					--bh-label-left: 38px;   /* right of the Steam button */
				}
				/* Top-left: Eneba shows its wishlist heart top-right on hover. */
				.bh_eneba_card > .bh_steamlink {
					position: absolute;
					top: 6px;
					left: 6px;
					z-index: 5;
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

			function markEneba(element, match, add_link) {
				element.classList.remove("bh_owned", "bh_wished", "bh_ignored");
				const cssClass = match.type === "sub" ? getClassForSubId(match.id) : getClassForAppId(match.id);
				if (cssClass) { element.classList.add(cssClass); noteMarked(); }
				if (!element.querySelector(":scope > .bh_steamlink")) add_link(createSteamLink(match.type, match.id));
			}

			function processEneba() {
				// Product cards (store, search, home page rows)
				for (const link of document.querySelectorAll("a[title][href]")) {
					if (link.closest(".bh_eneba_card")) continue;   // card already handled
					const name = enebaGameName(link.title);
					if (!name) continue;
					const card = findEnebaCard(link);
					if (!card || card.classList.contains("bh_already_processed")) continue;
					card.classList.add("bh_already_processed", "bh_eneba_card", "bh_card");
					resolveTitle(name).then((match) => {
						if (match) markEneba(card, match, (a) => card.appendChild(a));
					});
				}
				// Product page heading
				const heading = document.querySelector("h1:not(.bh_already_processed)");
				if (heading) {
					const name = enebaGameName(heading.textContent.trim());
					if (name) {
						heading.classList.add("bh_already_processed", "bh_eneba_heading");
						resolveTitle(name).then((match) => {
							if (match) markEneba(heading, match, (a) => heading.appendChild(a));
						});
					}
				}
			}

			debouncedMutationObserverSelectorAll("body", processEneba, 1000);
		},
		"g2a.com": function() {
			document.body.classList.add("bh_basic_style");
			debouncedMutationObserverSelectorAll("body", () =>
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
			bundle-helper {
				position: fixed;
				bottom: 0;
				left: 0;
				z-index: 99;
			}

			/* Marking style (3.0.13): a solid outline drawn on top of the item, plus
			   a small OWNED / WISHLIST / IGNORED label on card-style items. The
			   item's own colors are untouched and nothing is faded. Outlines never
			   change size or position (safe for cards that move on hover).
			   All look settings are variables, for a future settings panel. */
			body {
				--bh-color-owned: #22e07a;
				--bh-color-wished: #3db8ff;
				--bh-color-ignored: #9a9a9a;
				--bh-outline-width: 3px;
				--bh-label-text-color: #0b0b0b;
				--bh-label-top: 8px;
				--bh-label-left: 8px;
				--bh-steamlink-size: 24px;
			}
			.bh_owned   { --bh-color: var(--bh-color-owned);   --bh-bgcolor: var(--bh-color-owned);   --bh-outline-style: solid;  --bh-label: "OWNED"; }
			.bh_wished  { --bh-color: var(--bh-color-wished);  --bh-bgcolor: var(--bh-color-wished);  --bh-outline-style: solid;  --bh-label: "WISHLIST"; }
			.bh_ignored { --bh-color: var(--bh-color-ignored); --bh-bgcolor: var(--bh-color-ignored); --bh-outline-style: dashed; --bh-label: "IGNORED"; }
			.bh_basic_style .bh_owned,
			.bh_basic_style .bh_wished,
			.bh_basic_style .bh_ignored {
				outline: var(--bh-outline-width) var(--bh-outline-style) var(--bh-color) !important;
				outline-offset: calc(-1 * var(--bh-outline-width));
			}
			/* Label on card-style items (the element with .bh_card must be positioned). */
			.bh_owned.bh_card::after,   .bh_owned .bh_card::after,
			.bh_wished.bh_card::after,  .bh_wished .bh_card::after,
			.bh_ignored.bh_card::after, .bh_ignored .bh_card::after {
				content: var(--bh-label);
				position: absolute;
				top: var(--bh-label-top);
				left: var(--bh-label-left);
				z-index: 6;
				pointer-events: none;
				font: 700 11px/1 sans-serif;
				letter-spacing: 0.04em;
				padding: 4px 6px;
				border-radius: 3px;
				background: var(--bh-color);
				color: var(--bh-label-text-color);
			}

			.bh_steamlink svg {
				width: var(--bh-steamlink-size);
				height: var(--bh-steamlink-size);
			}
		`);

		// Adding some statistics to the corner of the screen.
		addBundleHelperUI();

		// Run site-specific code.
		processSite();
	}

	main();

})();
