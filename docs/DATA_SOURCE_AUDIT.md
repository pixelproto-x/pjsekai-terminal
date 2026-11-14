# Public player data source audit

## Current implementation

- The website uses the Cloudflare Worker at `https://pjsekai-player-api.a0983439343.workers.dev`.
- The Worker adapter is being migrated to the self-hosted Haruki Sekai API v6.33.0 container.
- The public browser route remains `GET /api/{region}/user/{uid}/profile` for `jp`, `tw`, `en`, `kr`, and `cn`.
- The Worker maps that route to Haruki v6's `GET /api/{region}/{uid}/profile` endpoint and wraps the response for the existing website.
- The browser no longer calls the legacy public Haruki endpoint or the Taiwan-only HiSekai endpoint directly.

## Data and privacy

- Lookup is by numeric public UID; no game password is requested from the visitor.
- The self-hosted Haruki service requires operator-configured region API settings, encryption values, and account sessions.
- Operator credentials belong only in encrypted Cloudflare Worker Secrets and are passed to the container at startup. They must not be committed to the repository or pasted into chat.
- The service does not fabricate missing profile fields. The UI displays only fields recognizable in the returned public profile data.

## Verification limits

- The repository-side Haruki v6.33.0 container integration is prepared, but the live migration is not complete until the Workers Paid plan and the two required Worker Secrets are configured.
- A successful GitHub Pages build or Worker deployment does not prove that all five game regions can log in.
- Production verification must confirm Haruki reports version `6.33.0` and healthy sessions for all five regions.
