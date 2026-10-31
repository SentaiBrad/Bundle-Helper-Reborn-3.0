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

## How the script is organized

Site handlers (in `site_mapping`) only describe their site: which element is a game, where its Steam ID or title comes from, and where the Steam button goes. Everything else is shared, so every site looks and behaves the same:

- **`makeCard(element)`** turns a card-style item into a marked card: the frame and label band are the script's own elements (`bh-frame`, `bh-label`), so the site's styles can't distort them.
- **`markMatch(element, match, addLink)`** marks an element from a lookup result: a Steam app, a Steam package, or a pack of several games. `addLink(link)` places the Steam button for the site.
- **`resolveTitle(title)`** looks up one Steam game or package by its title. **`resolveName(name)`** does the same for a store's product name, and checks a "Game One + Game Two" name part by part.
- **`cachedLookup(key, description, lookup, days)`** saves any lookup's result between visits.
- **`showBundleSummary(container, members)`**, **`requestQueue(limit)`** and **`whenVisible(element, callback)`** are for bundle cards on store listings: a summary strip, a few requests at a time, and only when the card comes into view.

### The marking look

- Cards: a full frame and a label band across the top, drawn above the card's image and hover overlays (layer 6) but below the site's own badges.
- The site's interactive elements (hearts, favorite buttons) stay usable and visible.
- Marking never changes an item's size or position, and hovering doesn't change it.
- The Steam button goes bottom-right of the card's image unless the site needs it elsewhere.

## Guidelines

- **Panel features go in their own section.** The corner panel is built from sections registered with `addPanelSection({id, html, css, init(panel), update(panel)})`. Add a section rather than editing existing ones.
- **Steam Web API key:** optional and unused today. If a feature uses it, it must also work without a key, send it only to `api.steampowered.com` (add that `@connect`), and never log it. Read it with `steam_api.getKey()`.
- **Log through `debug_log.add(category, message)`**, not bare `console.log`, so it shows up in the bug button's report.
- **Work in both Tampermonkey and Violentmonkey.** Only use the metadata keys and `GM_*` functions listed in [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md), and test in both when you can.
- **Prefer real Steam IDs over titles.** Use a Steam link, Steam image URL, data attribute or site API data whenever the page has one. Fall back to title matching only when it doesn't.
- **Don't guess.** A game that's left unmarked is better than one marked wrong. Keep title matching exact after normalization.
- **No per-title special cases.** Hardcoded mappings for individual games don't belong in the shared script.
- **Keep each site's code in its own handler** in `site_mapping`, and scope selectors to that site's game cards so the page isn't recolored broadly.
- **Respect the sites.** Don't add code that floods Steam's store search or a store's own servers with requests. Save results, and limit how many requests run at once.
- **One concern per version.** Keep cleanups and behavior changes in separate versions, so a problem points at one change.
- **Test on the live site,** including hover and signed-in states, not only on a saved page.
- **Packs are the exception to exact matching:** a "Game One + Game Two" name is split into parts only after the whole name found nothing, and each part still needs an exact match.
- **Keep the license and credits intact.** The project is GPL-3.0-only.
