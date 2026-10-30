# Bundle Helper Reborn 3.0

A userscript that marks the games you already own, have wishlisted, or have ignored on Steam while you browse bundle and game store sites. It also adds a Steam button to each game it recognizes.

If you buy games outside of Steam, it shows at a glance what you already have, without looking each game up manually.

- **Green ring:** owned
- **Blue ring:** wishlisted
- **Gray ring, faded:** ignored

## Install

1. Install a userscript manager such as [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/).
2. Open [`bundle-helper-reborn.user.js`](https://raw.githubusercontent.com/SentaiBrad/Bundle-Helper-Reborn-3.0/main/bundle-helper-reborn.user.js) and confirm the install.
3. Sign in at [store.steampowered.com](https://store.steampowered.com) in the same browser.
4. Open a supported site.

Updates are picked up automatically from this repository.

**Coming from "Bundle Helper Reborn 2.0 - Extended" (the Gist version)?** Install 3.0 from the link above, then remove the old script. The two are separate scripts in your userscript manager.

## Supported sites

**Reads Steam IDs from the page:**
- AStats
- DailyIndieGame
- Fanatical (via its product data)
- IndieGala
- old.reddit.com
- SGTools
- SteamDB
- SteamGifts
- SteamGround

**Matches by game title when the page has no Steam ID:**
- Eneba (Steam products only)
- Humble Bundle
- itch.io (including `*.itch.io` pages)

**Works only when the page links to Steam or shows Steam images:**
- G2A
- GameSeal
- HRK Game
- Tiltify

Title matching only accepts an exact (case-insensitive) match from Steam's store search. Anything else is left unmarked rather than guessed.

## Privacy

The script reads your owned, wishlisted and ignored lists from `store.steampowered.com` while you're signed in, and caches them in your userscript manager for up to 24 hours. Title lookups go to Steam's store search. Nothing is sent anywhere else, and no API key is needed.

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
