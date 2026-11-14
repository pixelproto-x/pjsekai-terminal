# Public player data source audit

## Confirmed documentation
- Hi Sekai documents the Taiwan profile endpoint: `GET https://api.hisekai.org/tw/user/{user_id}/profile`.
- The documentation describes cached profile data and may include fields such as level, team, cards, and power.
- Documentation does not guarantee every field exists for every player or that complete play history, AP/FC records, or full collection data are available.
- Sekai Master API provides game master data; it is not a player-profile endpoint.

## Current implementation
- Browser-side adapter: `src/data/hisekai-player.mjs`.
- UID is validated before requests; successful responses are cached locally for five minutes.
- UI reports source, region, freshness, and errors. It does not claim missing fields are zero or that absent team data means an empty team.
- The lookup does not request game passwords, private account tokens, or login credentials.

## Verification limits
- Browser CORS behavior, live upstream availability, and production rate limits must be verified in the target browser/network.
- The endpoint is documented for Taiwan only. Other regions are not marked supported.
- The API's current response schema is not guaranteed by this static client; the UI displays only recognizable public fields and avoids inventing unavailable data.
