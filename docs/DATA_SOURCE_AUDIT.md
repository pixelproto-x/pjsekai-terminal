# Public data source audit

Last checked: 2026-11-14

## Player UID lookup

### Hi Sekai
- Documentation: https://docs.hisekai.org/en/docs/api/user/profile
- Endpoint documented: GET https://api.hisekai.org/{region}/user/{user_id}/profile
- Documented region coverage: TW only at the time checked.
- The endpoint is described as cached data.
- The documentation says the raw response includes level, team, cards, power, and additional fields.
- The user lookup documentation currently lists the profile endpoint; it does not document a universal endpoint for every player record.

Implementation decision:
- Treat this as a TW profile provider, not a global player-data provider.
- Show its source and retrieval time in the UI.
- Keep profile fields optional and preserve the raw response for normalization tests.
- Do not infer AP/FC history, full inventory, or other records from the existence of a profile response.
- Before production use, verify CORS behavior, rate limits, terms, response shape, and endpoint availability from the deployed browser environment.

## Implementation status\n\n- A browser-side Taiwan profile adapter now uses the documented endpoint, validates UIDs, applies a short local TTL cache, and exposes source/freshness metadata.\n- Automated tests cover request URL construction, caching, invalid UID rejection, and upstream HTTP errors.\n- Live browser CORS behavior, production rate limits, and current endpoint availability remain unverified; the UI must show failures rather than imply that every UID is retrievable.\n\n## Master game data

### Sekai Master API
- Project: https://github.com/Sekai-World/sekai-master-api
- Documentation describes public master-data GET endpoints under /api/v1.
- This is a source for game master data (for example cards, music, events, characters), not evidence of a public player UID profile endpoint.
- Keep master-data adapters separate from player-profile adapters.

## Other possible sources
Community gateways and unofficial clients exist, but their existence alone does not establish that an endpoint is public, stable, region-complete, browser-accessible, or suitable for this site. Evaluate each candidate independently before registering it.

## Coverage policy
A region/capability pair is marked supported only after the exact endpoint has been verified. Unsupported regions must produce a clear unavailable state rather than silently querying a different region. No login, private credential, game-account token, or hidden account data is required or collected for public UID lookup.
