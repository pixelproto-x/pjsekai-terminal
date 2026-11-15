# Minimal Player Hub

## Current scope
The active website includes:
- The sixth-anniversary visual shell and responsive layout.
- Home page with public player UID lookup entry.
- Dedicated public player lookup backed by the Cloudflare Worker.
- Automatic lookup across 日服、台服、國際服、韓服、簡中服, plus explicit server selection for accounts that share a UID.
- Appearance settings: six SEKAI themes and glass opacity.
- Complete Batch 2 player workspace.

## Batch 2 — Player workspace
### Implemented
- Multiple UID management: save up to 50 UID/server pairs, edit aliases, reopen and remove entries.
- Favorite players with independent favorite toggles and filtering.
- Cross-server account management: store the same UID separately for each of the five servers and query a selected server directly.
- Player comparison: select saved players and compare only fields exposed by the public profile source (name, level, power, region, character count, and team count); unavailable fields are shown as unavailable, not guessed.
- Personal homepage: shareable public profile URL that opens the selected player's live public profile.
- Lookup history: latest 10 successful lookups with direct reopen.
- Player tags: editable user-defined tags, search, and tag filtering.
- Player data sharing: share links contain only public UID/server and optional display alias; no Google tokens, private account data, or browser-local collections.
- Browser-local persistence without login; saved player and history keys are also included in existing Google account cloud sync.

### Product and data rules
- Public lookup does not require login.
- Never claim a field is available until the source returns it.
- Show source, region, timestamp, loading, empty, and failure states.
- Never collect game passwords or private account credentials.
- Public share links resolve current upstream public data; they do not expose private local data.
- Preserve the anniversary UI and keep features as separately tested modules.

## Batch 3 — Game tools (re-planned and active)
- Regional game database backed by separate Sekai Master DB repositories for JP, TW, EN, KR, and CN.
- Card catalogue with search and character, unit, attribute, and rarity filters.
- Character catalogue with upstream profile information.
- Honor-group catalogue and event catalogue.
- Five-slot team editor with device-local persistence and up to 30 named saved team presets.\n- Independent five-slot comparison lineup so two teams can be compared without overwriting each other.\n- Team score baseline estimator using the selected song chart level and user-entered total talent; estimates PERFECT base score without skill, combo, FEVER, or event modifiers.\n- Independent five-slot comparison lineup so two teams can be compared without overwriting each other.
- Ability-value aggregation only from numeric fields actually present in upstream card data; missing values are not fabricated.
- Event bonus calculator using upstream event-card bonusRate values. The displayed total is a raw sum and excludes leader bonus, event caps, and other in-game modifiers.
- Team comparison view for team size and readable ability values.
- Local card favorites.
- IndexedDB cache with a six-hour freshness window, in-flight request deduplication, stale-cache fallback, and lazy loading so game data is fetched only when the game-tools page is opened.\n- Searchable team pickers use a filtered suggestion list instead of rendering every card repeatedly.
- Source links for all five regional repositories; screens follow the active SEKAI theme and responsive layout.

### Batch 3 verification boundaries
- The public upstream database is the source of truth; availability and update cadence are controlled upstream.
- The score tool estimates only the AP base-score baseline using `total talent × (3.9 + chart level ÷ 50)`. It does not predict final live score because skill activation timing, note weights, combo, FEVER, support and event effects are not simulated.
- Card artwork is not yet rendered; the catalogue displays metadata rather than constructing unverified asset URLs.

## Removed from the active product
Legacy Dojo, chart analysis, old My SEKAI local editors, admin dashboard, Sonolus runtime, story/resource tools, and legacy data import/export/share flows remain out of scope unless explicitly re-planned.
