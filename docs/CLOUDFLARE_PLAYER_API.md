# Cloudflare player API

The Worker runs in Cloudflare and does not require the owner's computer to stay online.

## Deployment

The GitHub Actions workflow deploys `workers/player-api` using the repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

Live endpoint:
`https://pjsekai-player-api.a0983439343.workers.dev`

- Health: `/health`
- Player profile: `/api/{region}/user/{uid}/profile`
- Regions: `jp`, `tw`, `en`, `kr`, `cn`

## Current website integration

- Taiwan UID lookups now use the deployed Cloudflare Worker, which calls the documented HiSekai Taiwan profile endpoint.
- Japan, International, Korea, and Simplified Chinese lookups still use the existing Haruki browser provider until an upstream provider credential is configured on the Worker.
- The Worker supports Haruki and Exmeaning upstream credentials through Worker secrets named `HARUKI_TOKEN` and `MOE_TOKEN`. These are separate from the Cloudflare deployment token.
- Missing upstream credentials return an explicit 503 response; the Worker does not fabricate profile data.

## Security and checks

- CORS allows only `https://pixelproto-x.github.io`.
- UID paths accept numeric IDs of 1–20 digits.
- Upstream requests have a 9-second timeout.
- Provider credentials stay on the Worker and are never returned to the browser.
- GitHub Actions runs syntax checks, unit tests, deploys the Worker, and checks its live health endpoint.
