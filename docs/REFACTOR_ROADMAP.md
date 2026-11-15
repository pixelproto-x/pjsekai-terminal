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

## Removed from the active product
Legacy song/Dojo, card and character catalogues, event calculators, chart analysis, old My SEKAI local editors, admin dashboard, Sonolus runtime, story/resource tools, and legacy data import/export/share flows remain out of scope unless explicitly re-planned.
