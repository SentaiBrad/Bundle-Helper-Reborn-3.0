# Contributing

Thanks for helping. Fixes for broken sites, support for new sites, and better title matching are all welcome.

## How to contribute

1. Fork this repository and create a branch for your change.
2. Edit `bundle-helper-reborn.user.js`.
3. Test it in Tampermonkey or Violentmonkey on the pages you changed, signed in to Steam.
4. Open a pull request that says:
   - which sites and page types you tested (with example URLs)
   - what was broken or missing, and what your change does

Please don't bump `@version` in your pull request. It's bumped when changes are released.

If you'd rather not write code, open an issue with the page URL and what you expected to see.

## Guidelines

- **Prefer real Steam IDs over titles.** Use a Steam link, Steam image URL, data attribute or site API data whenever the page has one. Fall back to title matching only when it doesn't.
- **Don't guess.** A game that's left unmarked is better than one marked wrong. Keep title matching exact after normalization.
- **No per-title special cases.** Hardcoded mappings for individual games don't belong in the shared script.
- **Keep each site's code in its own handler** in `site_mapping`, and scope selectors to that site's game cards so the page isn't recolored broadly.
- **Respect Steam.** Don't add code that floods Steam's store search with requests.
- **Keep the license and credits intact.** The project is GPL-3.0-only.
