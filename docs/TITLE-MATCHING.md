# Hard-to-match game titles

Stores often name the same game differently from Steam. This lists the patterns that break title matching (used on Humble Bundle and itch.io), with real examples, and whether 3.0.3 handles each one.

**Verified** means the Steam title was read from the Steam store page on 2026-10-29. Where the store page tool may have dropped special characters, that's noted.

## Handled in 3.0.3

### Periods in acronyms
- Steam **F.E.A.R. 2: Project Origin** (app 16450), Humble "FEAR 2: Project Origin". Verified (Brad's screenshots).
- Steam **S.T.A.L.K.E.R.: Shadow of Chernobyl** (app 4500). Verified.
- 3.0.3 drops periods, so both sides become "fear 2 project origin".

### Trademark symbols and missing spaces after colons
- Steam **NieR:Automata™** (app 524220). Verified.
- Steam **DRAGON QUEST® XI S: Echoes of an Elusive Age™ - Definitive Edition** (app 1295510). Verified. Steam's own EULA text for the same game uses an en dash (–) instead of the hyphen.
- 3.0.3 drops ™ ® ©, and treats `:`, `-`, `–` and spaces all as word breaks.

### Accents
- **Ōkami HD** is often written with a macron. Steam shows **Okami HD** (app 587620). Verified, though the page tool may have dropped non-Latin text.
- **Brütal Legend** is often written with an umlaut. Steam shows **Brutal Legend** (app 225260). Same caveat.
- 3.0.3 strips accents, so both spellings match.

## Not handled yet

### Greek letters used as words
- Steam **METAL GEAR SOLID Δ: SNAKE EATER** (app 2417610). Verified. Konami's own site uses Δ, news sites write "Metal Gear Solid Delta" ([Gematsu](https://www.gematsu.com/2025/09/metal-gear-solid-delta-snake-eater-shipments-and-digital-sales-top-one-million)), and store URLs turn Δ into "d" ([Nuuvem](https://www.nuuvem.com/us-en/item/metal-gear-solid-d-snake-eater)).
- Steam **ΔV: Rings of Saturn** (app 846030). Verified. Elsewhere it appears as "DV: Rings of Saturn" ([GamingOnLinux](https://gamingonlinux.com/2023/07/dv-rings-of-saturn)) or "V Rings of Saturn" ([raijin.gg](https://raijin.gg/app/846030/V_Rings_of_Saturn)).
- **NINJA GAIDEN Σ** (Sigma), part of the Master Collection ([Steam discussion](https://steamcommunity.com/app/1580780/discussions/0/3433451954995059765)).
- Problem: 3.0.3 drops Greek letters entirely, so Steam's "METAL GEAR SOLID Δ: SNAKE EATER" becomes "metal gear solid snake eater" and won't match "Metal Gear Solid Delta: Snake Eater". Dropping a letter that carries meaning is also a false-match risk.
- Fix idea: spell common Greek letters out as words (Δ → delta, Σ → sigma, Ω → omega, α → alpha, β → beta) before comparing.

### Collection names in brackets, in different positions
- Steam lists the game as **NINJA GAIDEN Σ [NINJA GAIDEN: Master Collection]** ([vaporlens](https://vaporlens.app/app/1580780/ninja_gaiden_σ_ninja_gaiden_master_collection.md)). Fanatical puts the bracket first: **[NINJA GAIDEN: Master Collection] NINJA GAIDEN Σ** ([Fanatical](https://www.fanatical.com/game/ninja-gaiden-master-collection-ninja-gaiden-2)).
- Fix idea: compare titles with any `[...]` part removed, as a second attempt after the full title fails. Fanatical gets IDs from its own data, so this mainly matters for Humble and itch.io.

### Roman numerals vs digits
- "Broken Sword II" vs "Broken Sword 2": even the developer's own materials mix the two ([ScummVM mailing list](https://lists.scummvm.org/pipermail/scummvm-devel/2009-December/007284.html)).
- Existing matchers convert numerals both ways, for I to XV ([canrun matcher](https://huggingface.co/spaces/grasant/canrun/raw/main/src/optimized_game_fuzzy_matcher.py)).
- Risk: single letters such as "V", "X" and "I" are often real words or letters ("ΔV", "Battlefield V", "X-COM"). Only convert a numeral when it's a whole word after the first word, and only as a fallback attempt.

### Edition and version suffixes
- Humble "FEAR: Ultimate Shooter Edition" got no Steam match (Brad's screenshot, 2026-10-29). It's a package of several games, not one Steam app, so there may be no single correct match at all.
- "Okami" vs Steam "Okami HD"; "… - Definitive Edition", "GOTY", "Remastered", "Deluxe Edition", "Complete Edition", "Enhanced Edition".
- The canrun matcher keeps edition words and only uses them to score candidates ("edition, remastered, remake, definitive, ultimate, goty, complete, deluxe, special, anniversary, enhanced").
- Fix idea: as a last resort, strip a known edition suffix from the store title and try again. Only accept the result if Steam's title is exactly the base name or the same edition, so "Delta" can never become "Delta 2".

### Renamed Steam listings
- Steam app 1659040 is now **HITMAN World of Assassination** and app 2280 is **DOOM + DOOM II** (both verified). Store pages that use older or different names won't match by title.
- Fix idea: none safe for title matching. Prefer real Steam IDs from the page whenever a site provides them.

### Same title, different games
- Remakes and reboots often reuse the original name, with only a year or nothing at all to tell them apart. An exact title match takes Steam's first search result with that name, which could be the wrong one.
- Fix idea: when several Steam results normalize to the same title, don't guess. Leave the tile unmarked, or show the Steam button without coloring.

## Steam packages (3.0.5)

- Humble's "FEAR: Ultimate Shooter Edition" isn't a Steam game. It's Steam **package 4384**, sold on the F.E.A.R. page (app 21090) next to package 12357 "FEAR Collection". Verified 2026-10-29 from Steam's public app details for app 21090, and from the F.E.A.R. store page showing it IN LIBRARY.
- Steam's game search returns nothing for "FEAR: Ultimate Shooter Edition", so no title rule can match it.
- 3.0.5 searches the part before ":" or " - ", reads the package list of up to 2 games whose name starts the title, and matches the package name with the same rules as game titles.

## Order of attempts

1. Real Steam ID on the page (link, image URL, data attribute). Always wins.
2. Normalized exact match (3.0.3).
3. Same, with Greek letters spelled out.
4. Same, with any `[...]` part removed.
5. Same, with Roman numerals converted (whole words only, not the first word).
6. Same, with a known edition suffix removed, under the strict rule above.

Each step only runs if the earlier ones found nothing. Each should ship as its own version and be tested on live pages before the next.
