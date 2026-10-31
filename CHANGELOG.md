# Changelog

## 3.0.28

- Internal cleanup. No change in behavior.

## 3.0.27

- Debug report: errors while scanning a page are logged, and Fanatical bundle cards are counted (found, checked, shown).

## 3.0.26

- Fanatical: bundle cards on listing pages show a summary of the Steam games inside: how many you own, have wishlisted, and don't have yet. Each bundle is checked once a day, only when its card comes into view.

## 3.0.25

- **Pack menu.** A pack's Steam button opens a list of the games inside, each showing whether you own it, have it wishlisted or ignored. Clicking a game opens its Steam page in a background tab; the menu stays open. Click outside it or press Esc to close.
- Steam buttons open the Steam page in a background tab, so the store page keeps focus.

## 3.0.24

- Games with "+" in their name (like DOOM + DOOM II) are found on Steam. Steam's search returned nothing for them.

## 3.0.23

- Fanatical: the Steam button sits on the bottom-right of the cover image, and marked cards are no longer taller than the rest (packs and unmarked cards looked pushed down).

## 3.0.22

- **Packs.** Products that bundle several Steam games (collections, 2-in-1s) are marked by what's inside: OWNED 7/7 when you own all of it, purple OWNED 3/7 when you own some, WISHLIST 2/7 (dashed) when you own none but some are wishlisted.
- Fanatical: products without a Steam ID of their own are now checked. Their contents come from Fanatical's product data, or the name is looked up on Steam.
- Fanatical: cards are checked as soon as Fanatical's data arrives, instead of waiting for the page to change.
- Humble Bundle, Eneba and itch.io: a product named "Game One + Game Two" that isn't a single Steam product is checked game by game.

## 3.0.21

- Eneba: the label band runs the full width of the card; the wishlist heart stays on top of it.

## 3.0.20

- Fanatical: the marking stays visible while hovering a card again (3.0.19 let Fanatical's hover overlay cover it).

## 3.0.19

- Marked cards on Humble Bundle, Fanatical and Eneba look the same and can't be distorted by the site's own styles (like Humble's hover). The site's own badges stay on top of the label, and the marking stays inside the card instead of drawing over floating bars and menus.

## 3.0.18

- Humble Bundle: hovering over a marked game no longer fills its image with the marking color.

## 3.0.17

- Internal cleanup. No change in behavior.

## 3.0.16

- **Faster marking on busy pages.** Page watchers now rescan at a steady rate (soon after a change, then at most once per interval) instead of waiting for the page to go quiet. Fanatical's page never goes quiet, so marking took about 7 seconds. This is the likely cause of the old "loading takes forever, sometimes never".
- **Card frame drawn on top.** Card-style items (Eneba, Humble, Fanatical) get their frame as an overlay above the card, so the card's image can't hide it. Fanatical previously showed the frame around the bottom half only.
- **Fanatical:** the label text is right-aligned, clear of Fanatical's own top-left badges (NEW TO BUNDLE, IN LIBRARY), which were cutting it off.

## 3.0.15

- Eneba: the label band stops short of the top-right corner, so Eneba's wishlist heart is no longer covered.

## 3.0.14

- The OWNED / WISHLIST / IGNORED label is now a full-width colored band across the top of the card, and the outline is thicker (4px), so marked cards stand out from unmarked ones at a glance. Eneba draws its own thin border on every card, which is why the 3.0.13 outline blended in.
- Eneba's Steam button sits on the band's left end.

## 3.0.13

- **New marking look (all sites):** a solid outline drawn on top of the item (green owned, blue wishlisted, gray dashed ignored) plus a small **OWNED / WISHLIST / IGNORED** label on card-style items (Eneba, Humble, Fanatical). The item's own colors are untouched and nothing is faded any more. The 3.0.12 ring was drawn underneath the card's picture, so it was barely visible, and the fade on ignored items read as "greyed out".
- Humble: the outline and label go on the game's image, as before; the tile itself is no longer filled.
- Look settings are CSS variables (`--bh-color-owned`, `--bh-color-wished`, `--bh-color-ignored`, `--bh-outline-width`, label position and text color) for a future settings panel.

## 3.0.12

- **Easier-to-read marking.** Owned and wishlisted items now get a bright colored ring with a soft glow (green owned, blue wishlisted) instead of a solid green/blue fill with forced white text. The item's own colors and text are untouched, so it stays readable on dark sites and with dark themes. Ignored items get a gray ring and are faded much less (70% instead of 30%). Colors, ring width, glow, an optional tint (off by default) and the fade are CSS variables (`--bh-rgb-owned`, `--bh-ring-width`, `--bh-glow-strength`, `--bh-tint-strength`, `--bh-ignored-opacity`) for a future settings panel.
- **Eneba support** (store, search, home page rows and product pages). Eneba shows no Steam IDs, so items are matched by title ("HELLDIVERS 2 Steam Key (PC) GLOBAL" is looked up as "HELLDIVERS 2"). Only Steam products are checked. Cards are found without Eneba's generated class names. The ring doesn't change card size, so Eneba's hover animation is unaffected, and the Steam button sits top-left, clear of Eneba's wishlist heart.

## 3.0.11

- Debug view: the tab row is a single fixed line, and "copied" now appears as a small label floating over the report's corner, so pressing [copy] no longer shifts the layout.

## 3.0.10

- **Package lookup fix.** Steam's app details answered with an empty package list when asked only for `package_groups`. The script now asks for `basic,packages,package_groups`, which returns the list, and also accepts the answer when the userscript manager delivers it as text (Tampermonkey on Firefox). Found from the debug report: `packages of 21090 -> []`.
- Saved lookups are discarded once so those misses are retried.
- **Debug view has tabs:** Overview, Log and Steam API. **[copy]** stays visible and always copies the full report (all tabs, the whole log).
- Expanded views (debug, Steam settings) keep the panel's normal width and wrap their text instead of widening the panel. The debug text scrolls past 40% of the window height; nothing is cut off.
- Steam API tab: key status and format, plus request and error counters ready for future API features (`steam_api.noteRequest`).

## 3.0.9

- **Steam button** in the corner panel opens Steam settings. For now it only has an optional Steam Web API key field (save, clear, shows the last 4 characters). The key is stored in the userscript manager and is **not used by anything yet**. It's never written to the log or the debug report.
- Panel views (debug, Steam settings) open one at a time.
- Debug report additions:
  - the update URL the installed copy uses, and the manager's injection mode
  - "Page at script start", which shows when a site changed pages without reloading
  - when the script started and when the first item got marked
  - items with more than one Steam button (the Fanatical hover duplicate)
  - on Fanatical: whether the data hook is installed and how many items it captured Steam data for
  - an error line whenever a Humble or itch.io tile title comes out empty

## 3.0.8

- **Debug button.** A bug icon in the corner panel opens a debug report with [copy] and [refresh]. The report uses `[Section]` headers and `Setting = value` lines and covers:
  - Script: version, userscript manager, page, which site handler ran
  - Steam data: when it was last fetched, whether this page's fetch worked (and the HTTP error if not), owned/wishlisted/ignored counts, and a warning when there are no owned apps (usually not signed in to the Steam store)
  - Title lookups: saved matches and misses, saved format version
  - This page: how many items were marked, Steam buttons, page watchers, errors, and Fanatical's Steam data count on Fanatical
  - The last 80 log lines: Steam fetches, every title lookup step, site handler errors
- Steam fetch failures, site handler errors and title lookups now go through one log, shown in the report and in the browser console (`BH lookup:`, `BH steam:`, `BH error:` and so on).
- The panel is now built from sections (`addPanelSection`), each with its own HTML, CSS, setup and update, so new panel features can be added without touching the rest. Its look is unchanged.

## 3.0.7

- **[retry misses]** link in the corner panel: forgets saved title misses (keeps matches) and reloads the page, so missed titles are looked up again right away.
- Title lookups log each step to the browser console (filter on `BH lookup`): the exact title read from the page, Steam's search results, the package checks and the outcome. This is for tracking down titles that don't match.

## 3.0.6

- Package lookup fix: Steam's search doesn't find F.E.A.R. when searched as "FEAR" (it returns Fear & Hunger and others), but does as "F.E.A.R.". When the part before the colon is a single all-caps word of 2 to 8 letters (FEAR, STALKER, QUBE), the package lookup also searches it spelled with dots. This only runs when the earlier searches found nothing.
- Saved lookups are discarded once, so misses saved by 3.0.5 are retried.

## 3.0.5

- **Steam packages.** When a title isn't a single Steam game, the script checks whether it's a Steam package (a compilation or edition sold under its own name), and colors it by your owned packages. Example: Humble's "FEAR: Ultimate Shooter Edition" is Steam package 4384, which is sold on the F.E.A.R. store page.
- How: it searches the part before ":" or " - " ("FEAR"), then reads the package list of up to 2 matching games through Steam's public store data. No Steam API key needed. This only runs when the normal lookup finds nothing, and the result is saved like other lookups.
- The Steam button on a package tile opens the package page (`/sub/...`).
- Saved lookups from 3.0.4 are discarded once (format change), so the first visit to each bundle searches again.

## 3.0.4

- **Saved title lookups.** Humble Bundle and itch.io title lookups are now remembered between visits: matches for 30 days, misses for 1 day. A repeat visit to a bundle makes no Steam searches. Failed searches (network errors, Steam errors) are never saved. Identical titles on one page share a single search.
- **Matching fallbacks.** When a title doesn't match exactly, these are tried in order, using the same Steam search results (no extra requests):
  1. Greek letters spelled out: "Metal Gear Solid Delta" matches "METAL GEAR SOLID Δ".
  2. Bracketed collection names ignored: "[NINJA GAIDEN: Master Collection] NINJA GAIDEN Σ" matches "NINJA GAIDEN Σ [NINJA GAIDEN: Master Collection]".
  3. Roman numerals as whole words, never the first word: "Broken Sword 2" matches "Broken Sword II".
  4. Trailing edition words (Definitive, Deluxe, GOTY, Remastered, HD and so on) ignored on both sides: "Okami" matches "Okami HD".
- The fallbacks never guess. If more than one different Steam game fits, the tile is left unmarked.
- Greek letters are no longer silently dropped during matching.

## 3.0.3

- Title matching (Humble Bundle, itch.io) now ignores case, periods, apostrophes, other punctuation, accents, ™/®/© and "&" vs "and". For example, Humble's "FEAR 2: Project Origin" now matches Steam's "F.E.A.R. 2: Project Origin". Titles still have to match word for word, so editions and sequels aren't guessed.

## 3.0.2

- **Back to the working 2.0 code.** 3.0.0 and 3.0.1 were built on a merge with Bundle Dude 2.9.13, and Humble Bundle tiles stopped being colored. 3.0.2 uses the last working 2.0 Extended code (2.9.6) unchanged. Only the name, update links and credits are new.
- Fixes and improvements will now be added one at a time and tested on live sites. Ideas from the Bundle Dude merge are tracked as separate candidates.

## 3.0.1

**Broken release:** Humble Bundle tiles were still not colored. Replaced by 3.0.2.

- Humble Bundle: restored 2.0's tile coloring. Uses Humble's own tile and image elements again, and the background override now applies.
- Humble Bundle: logs each tile's title, Steam ID and result to the browser console, to make mismatches easier to spot.

## 3.0.0

**Broken release:** built on the 2.10.0 merge, which stopped Humble Bundle tiles being colored. Replaced by 3.0.2.

- Renamed to **Bundle Helper Reborn 3.0** and moved from a GitHub Gist to a full repository, so changes can be contributed back with pull requests.
- Updates now come from this repository. Installs of the 2.0 Extended Gist version are separate scripts. The final Gist version shows a notice pointing here.
- Includes everything in 2.10.0.

## 2.10.0

**Reverted.** Published briefly on the Gist on 2026-10-29, then replaced there by 2.10.1 (the 2.9.6 code plus a notice pointing to this repository), and reverted here in 3.0.2. None of the changes below are in the script today; the ones still wanted are being added back one at a time.

Merged improvements from [Bundle Dude](https://gist.github.com/DickHorner/cc55aa516c389b11b93661a49f9e658a) v2.9.13 by J Luetkens (DickHorner), a GPL-3.0 fork of 2.9.6.

Taken from Bundle Dude:
- The script starts at document-start, so the Fanatical data hook is in place before the page's first requests.
- Steam profile data is validated before it's cached, and nothing is marked until valid data is loaded.
- Refreshing from the panel re-marks the page. The panel shows how many Humble items matched.
- Title matching ignores ™/®, accents, punctuation and "&" vs "and", treats "Standard Edition" as the base game, searches DLC as a fallback, and tries the page language before English.
- Humble Bundle: uses a Steam ID on the tile when there is one, covers more page layouts, and leaves tiles retryable until they resolve.
- Steam images are detected via `srcset`. SteamDB reads `data-appid` / `data-subid`. HRK Game, GameSeal, Tiltify and G2A also check Steam image URLs and re-run as the page changes.
- `*.itch.io` pages and `old.reddit.com` are routed correctly.

Changed or left out:
- No "only one owned game in the search results" guess, because it could mark a sequel or a similarly named game as owned.
- No hardcoded per-game title mappings.
- itch.io keeps title matching (itch tiles almost never contain Steam IDs), with the same retry safeguards as Humble.

## 2.9.6 and earlier

Published as [Bundle Helper Reborn 2.0 - Extended](https://gist.github.com/SentaiBrad/076c6966ddfe4c328e90ccc8396720f7). Its revision history lives in that Gist.
