# Changelog

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

- Humble Bundle: restored 2.0's tile coloring. Uses Humble's own tile and image elements again, and the background override now applies.
- Humble Bundle: logs each tile's title, Steam ID and result to the browser console, to make mismatches easier to spot.

## 3.0.0

- Renamed to **Bundle Helper Reborn 3.0** and moved from a GitHub Gist to a full repository, so changes can be contributed back with pull requests.
- Updates now come from this repository. Installs of the 2.0 Extended Gist version are separate scripts. The final Gist version shows a notice pointing here.
- Includes everything in 2.10.0.

## 2.10.0

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
