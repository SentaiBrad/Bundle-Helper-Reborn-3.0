# Userscript manager compatibility

Bundle Helper Reborn 3.0 must work the same in **Tampermonkey** (primary) and **Violentmonkey**. When the two differ, the lowest common denominator wins: only use what both document, or what one ignores harmlessly.

Sources:
- Tampermonkey documentation: https://www.tampermonkey.net/documentation.php, pulled 2026-10-29
- Violentmonkey API documentation (metadata block, GM API, matching): https://violentmonkey.github.io/api/ (source repo commit 84ebe20, 2026-10-24), pulled 2026-10-29

## Rules

1. Use only the `GM_*` functions listed under "Allowed APIs". Both managers support them with the same behavior.
2. Grant every `GM_*` function used, plus `unsafeWindow`, with `@grant`. Never use `@grant none`.
3. Keep `@downloadURL` and `@updateURL` identical. Violentmonkey only documents `@downloadURL` for update checks. Tampermonkey checks `@updateURL` and downloads from `@downloadURL`.
4. Bump `@version` on every release, using plain dotted numbers (`3.0.1`, `3.1.0`). Violentmonkey requires each part to start with a number. Without a version change, neither manager updates.
5. Keep the metadata block the very first thing in the file, with exactly one space after `//` on every line (Violentmonkey's compatibility advice).
6. Only store JSON-serializable values with `GM_setValue`: strings, numbers, booleans, null, and arrays or objects of those. Tampermonkey also allows `undefined`; Violentmonkey doesn't.
7. Don't use Tampermonkey-only features (see "Not allowed") unless the code also works without them.
8. Don't change `@name` or `@namespace`. Together they identify the script in both managers, and changing them installs it as a separate script.

## Metadata keys

### Used, and supported by both
- `@name`, `@namespace`, `@version`, `@description`, `@icon`
- `@match`: both use Chrome-style match patterns. `*.example.com` also matches `example.com`. Query strings and `#` hashes are never part of the match.
- `@run-at document-start`: supported by both. See "Things to watch" for what it does and doesn't guarantee.
- `@grant`: one line per API.
- `@homepageURL`, `@supportURL`, `@downloadURL`

### Used, but only documented by one (harmless in the other)
- `@updateURL`: Tampermonkey only. Kept equal to `@downloadURL` (rule 3).
- `@connect store.steampowered.com`: Tampermonkey only. Without it, Tampermonkey asks the user before cross-site requests. Violentmonkey doesn't document `@connect` and ignores it.
- `@author`: Tampermonkey only. Violentmonkey ignores it.
- `@license`: documented by neither, but expected by Greasy Fork and harmless.

### Safe to add later
- `@noframes`: both. Stops the script running inside same-site iframes.
- `@exclude-match` (Violentmonkey) and `@exclude` (both): prefer `@exclude` if needed.
- `@run-at document-end` or `document-idle`: both. Note that the defaults differ: Tampermonkey defaults to `document-idle`, Violentmonkey to `document-end`. Always set `@run-at` explicitly.

### Manager-specific, use with care
- `@inject-into page` (Violentmonkey only, Tampermonkey ignores it): forces page-context injection in Violentmonkey. The default `auto` falls back to an isolated content script when a site's CSP blocks page scripts. In that context `unsafeWindow` isn't the page's real `window`, so the Fanatical `fetch` hook would silently do nothing.
- `@sandbox` (Tampermonkey 4.18+ only): Tampermonkey's default is `raw` (page context, falling back if CSP blocks it). Don't use `@sandbox JavaScript`: in Firefox it creates a separate world that needs `cloneInto`/`exportFunction` to share objects with the page.

### Not allowed
- `@run-at context-menu`, `@run-in`, `@webRequest`, `@antifeature` (not needed), `@unwrap` (removes access to `GM_*` in Violentmonkey).

## Allowed APIs

### Used today
- `GM_addStyle(css)`: both return the created `<style>` element.
- `GM_getValue(key, defaultValue)` and `GM_setValue(key, value)`: same behavior in both (see rule 6).
- `GM_xmlhttpRequest(details)`: both bypass same-origin limits and send the user's cookies by default. That's what lets the Steam profile request see the logged-in account. Use only these options and handlers:
  - options: `method`, `url`, `headers`, `data`, `timeout`, `responseType`, `overrideMimeType`, `anonymous`, `context`
  - `responseType`: `json`, `blob` or `arraybuffer` (both), or leave it out for text. Violentmonkey also lists `text` and `document`, Tampermonkey also lists `stream`; don't use those.
  - handlers: `onload`, `onerror`, `onabort`, `ontimeout`, `onprogress`, `onreadystatechange`
  - response fields: `status`, `statusText`, `readyState`, `responseHeaders`, `response`, `responseText`, `finalUrl`
  - the returned object's `abort()`
- `unsafeWindow`: the page's `window` in both, as long as the script is injected into the page (see `@inject-into` and `@sandbox` above).

### Available in both if needed
- `GM_deleteValue`, `GM_listValues`, `GM_addValueChangeListener`, `GM_removeValueChangeListener`
- `GM_registerMenuCommand(name, callback)` and `GM_unregisterMenuCommand(id)`, using only the first two arguments
- `GM_openInTab(url, { active })`: always pass `active` explicitly, because the defaults differ (Tampermonkey `false`, Violentmonkey `true`).
- `GM_setClipboard`, `GM_notification({ text, title, onclick })`
- `GM_info`: exists in both, but Violentmonkey's saved pages don't list its fields. Check a field in both managers before relying on it.
- `GM_getResourceText` / `GM_getResourceURL` with `@resource`
- The promise-based `GM.*` versions exist in both, but stick to `GM_*`. Their names differ from the `GM_*` ones (`GM.xmlHttpRequest`, `GM.getResourceUrl`), and Violentmonkey only made `GM.xmlHttpRequest` return a promise in v2.18.3.

### Not allowed (one manager only)
- Tampermonkey only: `window.onurlchange`, `GM_getTab`, `GM_saveTab`, `GM_getTabs`, `GM_webRequest`, `GM_audio`, `GM_log`, and `GM_xmlhttpRequest` options `fetch`, `redirect`, `cookie`, `cookiePartition`, `nocache`, `revalidate`, `proxy`.
- Version-gated in both: `GM_setValues`, `GM_getValues`, `GM_deleteValues` (Tampermonkey 5.3+), and `GM_cookie` (Tampermonkey; Violentmonkey 2.35.1+ for `GM.cookie`). Avoid them unless there's no alternative.

## Things to watch

- **`@run-at document-start` isn't a guarantee.** Tampermonkey treats it as "the first possible moment", and a script can still run late. Violentmonkey only runs before the page's own scripts in specific setups (page injection mode plus certain advanced settings, not in incognito, and so on). The Fanatical fetch hook therefore has to cope with missing the page's first requests.
- **Single-page sites.** Both managers only inject scripts on full page loads, not when a site changes pages in place (`history.pushState`). Tampermonkey's fix, `window.onurlchange`, is Tampermonkey-only. The compatible approach is what Violentmonkey recommends: watch for URL changes with the `navigation` API's `navigatesuccess` event when it exists, falling back to a `MutationObserver` that compares `location.href`. This matters for Humble and Fanatical.
- **`responseText` with `responseType: "json"`.** Violentmonkey only provides `responseText` "when available", so code that asks for JSON should read `response.response` and not count on `responseText`.
- **`@connect` prompts.** If a new site handler ever needs `GM_xmlhttpRequest` to a host other than `store.steampowered.com`, add its own `@connect` line, or Tampermonkey users get a permission prompt.

## Audit: 3.0.0

- **Header keys:** all supported by both or harmlessly ignored. No changes needed.
- **APIs:** `GM_addStyle`, `GM_getValue`, `GM_setValue`, `GM_xmlhttpRequest` (`responseType: "json"`, `onload`, `onerror`, `onabort`) and `unsafeWindow`. All are on the allowed list.
- **To fix later (not changed yet):**
  - The DLC lookup falls back to `JSON.parse(response.responseText)` when `response.response` isn't an object. In Violentmonkey `responseText` can be missing. It's caught and treated as a failed lookup, so it's harmless, but the fallback should go.
  - There's no `@inject-into page`, so in Violentmonkey the Fanatical hook can silently fail on pages whose CSP blocks page scripts.
  - There's no single-page navigation handling (see "Things to watch").
  - There's no `@noframes`.
