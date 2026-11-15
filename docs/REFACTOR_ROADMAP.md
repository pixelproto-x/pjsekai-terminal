# Minimal Player Hub

## Current scope
The active website includes:
- The sixth-anniversary visual shell and responsive layout.
- Home page with public player UID lookup entry.
- Dedicated public player lookup backed by Hi Sekai through the Cloudflare Worker.
- Automatic player-server detection across 日服、台服、國際服、韓服、簡中服.
- Appearance settings: six SEKAI themes and glass opacity.
- Player workspace: save up to 50 player UIDs locally, assign aliases and tags, mark favorites, reopen saved players, and review the latest 10 successful lookups.

## Batch 2 — Player workspace
### Implemented
- Multiple saved player UIDs.
- Favorite and unfavorite players.
- User-defined aliases and tags.
- Detected server label stored with each saved player.
- Recent successful lookup history (latest 10).
- Local-browser persistence; no account login required.

### Remaining
- Compare two or more saved player profiles using fields actually provided by the public data source.
- Share a public player profile link without exposing private credentials or browser-local data.
- Complete interaction and mobile regression checks.

## Removed from the active product
Legacy song/Dojo, card and character catalogues, event calculators, chart analysis, old My SEKAI local editors, admin dashboard, Sonolus runtime, story/resource tools, and legacy data import/export/share flows remain out of scope unless explicitly re-planned.

## Product and data rules
- Public lookup does not require a login.
- Never claim a field is available until the source returns it.
- Show source, region, timestamp, loading, empty, and failure states.
- Never collect game passwords or private account credentials.
- Saved player aliases, tags, favorites, and lookup history are stored only in the current browser's local storage.
- Preserve the anniversary UI while rebuilding future features as separate, tested vertical slices.
