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

The file reads top to bottom in this order, so the part for one site, or one shared job, is easy to find:

1. Header
2. Settings
3. Small utilities, the debug log, and the record of what happened on the page
4. Steam data: your library, Steam requests, the optional API key
5. Title matching and saved lookups
6. Marking: classes, Steam buttons, the pack menu, cards and packs
7. Sites: data some sites need (Fanatical's product data), then the site handlers, alphabetical by host, each starting with a note on the pages it covers
8. The corner panel and the debug report
9. Start-up

Site handlers (in `siteMapping`) only describe their site: which element is a game, where its Steam ID or title comes from, and where the Steam button goes. Everything else is shared, so every site looks and behaves the same:

- **`makeCard(element)`** turns a card-style item into a marked card: the frame and label band are the script's own elements (`bh-frame`, `bh-label`), so the site's styles can't distort them.
- **`markMatch(element, match, addLink)`** marks an element from a lookup result: a Steam app, a Steam package, or a pack of several games. `addLink(link)` places the Steam button for the site.
- **`resolveTitle(title)`** looks up one Steam game or package by its title. **`resolveName(name)`** does the same for a store's product name, and checks a "Game One + Game Two" name part by part. **`lookUpAndMark(name, source, mark)`** is the usual way for a site that only has a name: it looks the name up, lists it in the debug view, and calls `mark(match)` to mark it the site's way.
- **`resolveProduct(product)`** finds what a store product is on Steam: its own Steam ID (`checkStoreSteamId` checks package IDs a store gives), else the pack its contents make (`packFromContents`), else the game its DLC belongs to (`baseGameOfDlc`), else its name. A site describes a product as `{name, steam, contents, dlc}`; see "Store products and packs" in the script.
- **`cachedLookup(key, description, lookup, days)`** saves any lookup's result between visits.

### The marking look

- Cards: a full frame and a label band across the top, drawn above the card's image and hover overlays (layer 6) but below the site's own badges.
- The site's interactive elements (hearts, favorite buttons) stay usable and visible.
- Marking never changes an item's size or position, and hovering doesn't change it.
- The Steam button goes bottom-right of the card's image unless the site needs it elsewhere.

## Code style

In order of importance:

1. **It works** on the real site. Correct marking comes first.
2. **It's compatible** with Tampermonkey and Violentmonkey (see [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md)), in current Firefox and Waterfox first and Chromium browsers too.
3. **It's readable and lean.**
4. **It's consistent.**

A site-specific fix may break a style rule when the site forces it. Add one comment saying why, so nobody "cleans it up" later.

**Readable**
- One function does one job, and its name says what it does.
- Return early instead of nesting deeply.
- No clever one-liners. Spell it out over a few lines.
- Numbers that mean something (timings, limits, how long results are saved) are named constants.

**Comments**
- Say *why* the code is the way it is, in the present tense.
- History (what changed, in which version) goes in CHANGELOG.md, not in comments.
- Shared functions get a short note on what goes in and what comes out.

**Consistent**
- Tabs for indentation, double quotes, semicolons, `const` or `let` (never `var`), `===`.
- `camelCase` for functions, variables and parameters. Anything that's saved or comes from outside keeps its own spelling: CSS classes (`bh_owned`), storage keys (`bh_title_cache`, `bh_settings`), the setting IDs saved inside them (`panel_size`), and Steam's and the stores' JSON fields. Renaming those would lose people's saved data or break the lookups.
- Log through `debugLog.add()`, never bare `console.log`.

**Safe**
- Text from a site goes into the page only as text (`textContent`), never as HTML. `innerHTML` is only for the script's own fixed markup and icons.
- Errors are caught where they enter the script (page scans, lookups) and logged.
- Debug reports never include anything that identifies the user: no query strings, account names, cookies, API keys, or details of other installed software.

**Lean**
- No code "for later". No abstraction until two places need it.
- No libraries; use what the browser provides.

## Guidelines

- **Settings are one list.** Add a setting to `settingDefinitions`; the settings view, the checks on saved values, and the debug report all read from it.
- **Steam Web API key:** optional and unused today. If a feature uses it, it must also work without a key, send it only to `api.steampowered.com` (add that `@connect`), and never log it. Read it with `steamApi.getKey()`.
- **Log through `debugLog.add(category, message)`**, not bare `console.log`, so it shows up in the bug button's report.
- **Work in both Tampermonkey and Violentmonkey.** Only use the metadata keys and `GM_*` functions listed in [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md), and test in both when you can.
- **Prefer real Steam IDs over titles.** Use a Steam link, Steam image URL, data attribute or site API data whenever the page has one. Fall back to title matching only when it doesn't.
- **Don't guess.** A game that's left unmarked is better than one marked wrong. Keep title matching exact after normalization.
- **No per-title special cases.** Hardcoded mappings for individual games don't belong in the shared script.
- **Keep each site's code in its own handler** in `siteMapping`, and scope selectors to that site's game cards so the page isn't recolored broadly.
- **Respect the sites.** Don't add code that floods Steam's store search or a store's own servers with requests. Save results, and limit how many requests run at once.
- **One concern per version.** Keep cleanups and behavior changes in separate versions, so a problem points at one change.
- **Test on the live site,** including hover and signed-in states, not only on a saved page.
- **Packs are the exception to exact matching:** a "Game One + Game Two" name is split into parts only after the whole name found nothing, and each part still needs an exact match.
- **Keep the license and credits intact.** The project is GPL-3.0-only.
