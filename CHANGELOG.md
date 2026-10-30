# Changelog

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
