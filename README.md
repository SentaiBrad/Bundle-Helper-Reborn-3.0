# Bundle Helper Reborn 3.0

A userscript that marks the games you already own, have wishlisted, or have ignored on Steam while you browse bundle and game store sites.

If you buy games outside of Steam, it shows at a glance what you already have, without looking each game up by hand.

## What it shows

**Games**
- **OWNED:** green frame and label
- **WISHLIST:** blue frame and label
- **IGNORED:** gray dashed frame and label

On card-style sites (Humble Bundle, Fanatical, Eneba) the label is a band across the top of the card. The site's own badges, such as Fanatical's IN LIBRARY, stay on top of it. Other sites get the colored outline.

**Packs** (a store's 2-in-1s and collections, sold as one product but made of several Steam games):
- **OWNED 7/7:** green, you own all of it
- **OWNED 3/7:** purple, you own some of it (plus "· WISH 2" when some of the rest are wishlisted)
- **WISHLIST 2/7:** blue dashed, you own none but some are wishlisted

**Bundle cards** on store listings (Fanatical): a small strip along the bottom of the cover counting the Steam games inside, for example **OWN 3 · WISH 2 · NEW 13**.

**Steam button:** every recognized game gets a small Steam button. Clicking it opens the game's Steam page in a background tab. On a pack, it opens a list of the games inside, each with its state; clicking one opens it in a background tab.

The meaning never relies on color alone: every state has a text label, ignored items are dashed, and packs and bundles show counts.

## Install

1. Install a userscript manager such as [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/).
2. Open [`bundle-helper-reborn.user.js`](https://raw.githubusercontent.com/SentaiBrad/Bundle-Helper-Reborn-3.0/main/bundle-helper-reborn.user.js) and confirm the install.
3. Sign in at [store.steampowered.com](https://store.steampowered.com) in the same browser.
4. Open a supported site.

Updates are picked up automatically from this repository.

**Coming from "Bundle Helper Reborn 2.0 - Extended" (the Gist version)?** Install 3.0 from the link above, then remove the old script. The two are separate scripts in your userscript manager.

## Supported sites

| Site | How games are recognized | Status |
|---|---|---|
| Humble Bundle | Game title, looked up on Steam | Working |
| Fanatical | Fanatical's own product data, which includes Steam IDs; title lookup for products without one | Working. Bundle-card summaries are new and still being checked. |
| Eneba | Game title, looked up on Steam (Steam products only) | Working on store listings; product pages not yet checked |
| itch.io | Game title, looked up on Steam | Not working: titles are read as empty. `itch.io` only, not creator pages (`name.itch.io`). |
| old.reddit.com | Steam links in posts | Not working: the script never runs there |
| AStats, DailyIndieGame, IndieGala, SGTools, SteamGifts, SteamGround | Steam links, images or IDs on the page | Carried over from 2.x, not yet checked in 3.0 |
| SteamDB, Tiltify, HRK Game, GameSeal, G2A | Steam links on the page | Not working; to be checked and rewritten |

## The corner panel

A small panel in the bottom corner shows when your Steam data was last fetched, how many apps you own, have wishlisted and ignored, and what was marked on the current page.

- **refresh:** fetch your Steam data again.
- **Retry misses:** forget titles that weren't found and look them up again.
- **[−]:** minimize the panel to a small bar; click the bar to open it again.
- **Settings (gear):** panel size and corner, labels on cards, bundle summaries, Steam links in a background tab, the optional Steam Web API key, and buttons to refresh or clear saved data.
- **Debug (bug):** what the script did on this page: an overview, every item it looked at and the result, and its log. **Copy all** copies the report for a bug report, and **Report a problem** opens a new issue on GitHub. The report never includes anything that identifies you.

## Privacy

Everything stays in your browser, in your userscript manager's storage. Nothing is sent to anyone else.

- **Steam library:** your owned, wishlisted and ignored lists are read from `store.steampowered.com` while you're signed in, and saved for up to 24 hours.
- **Title lookups:** game titles are searched on Steam's store search, and Steam's public app details are read for packages. Results are saved: found titles for 30 days, not-found titles for 1 day.
- **Fanatical:** the script reads the product data Fanatical's own pages load, and requests a product's or bundle's data from Fanatical when it needs the games inside. Results are saved for 30 days (products) or 1 day (bundles).
- **No API key is needed.** If you enter an optional Steam Web API key, it's stored only in your userscript manager and never logged or shown in the debug report.

## Contributing

Fixes and new sites are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## History and credits

Bundle Helper Reborn 3.0 is the latest step in a line of forks:

1. [Bundle Helper](https://greasyfork.org/en/scripts/16105-bundle-helper) v1.09 by 7-elephant
2. [Bundle Helper Reborn](https://gist.github.com/denilsonsa/618ca8a9d04d574a162b10cbd3fce20f) by Denilson Sá Maia: a v2.0 rewrite
3. [Bundle Helper Reborn 2.0 - Extended](https://gist.github.com/SentaiBrad/076c6966ddfe4c328e90ccc8396720f7) by SentaiBrad: added Humble Bundle, itch.io, SteamDB, Tiltify, HRK Game, GameSeal and G2A
4. Bundle Helper Reborn 3.0 by SentaiBrad: moved to a full repository so changes can be contributed back

Other forks of the 2.0 Extended script exist, such as [Bundle Dude](https://gist.github.com/DickHorner/cc55aa516c389b11b93661a49f9e658a) by J Luetkens (DickHorner). See [CHANGELOG.md](CHANGELOG.md) for history.

## License

[GPL-3.0-only](LICENSE)

- Copyright 2016-2019, 7-elephant
- Copyright 2023, Denilson Sá Maia
- Copyright 2026, SentaiBrad
