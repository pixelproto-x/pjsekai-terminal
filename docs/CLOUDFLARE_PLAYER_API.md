# Cloudflare player API setup

The website is hosted on GitHub Pages. This Worker runs in Cloudflare's cloud, so the owner's PC does not need to remain powered on.

## Current integration status

This is the backend foundation only. The website still needs its Worker URL before its lookup client can be switched to the new backend. Do not remove the existing lookup UI or claim five-region support until upstream credentials and live tests are complete.

## Required account setup

1. Connect the GitHub repository to Cloudflare Workers Builds, or add GitHub repository secrets:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
2. Deploy `workers/player-api`.
3. In the Worker settings, add provider secrets only if valid credentials have been issued:
   - `HARUKI_TOKEN`
   - `MOE_TOKEN`
4. Record the deployed `workers.dev` URL in the website's public API endpoint configuration. This URL is not a secret.

Never paste API tokens into chat, source files, commits, or public issues.

## Provider coverage

- Taiwan: HiSekai documents the TW profile endpoint. This can work without an upstream token.
- Japan, International, Korea, Simplified Chinese, and additional TW fallback: Haruki / Exmeaning gateway upstreams require provider credentials.
- Missing credentials produce a clear 503 response instead of pretending a region is working.

## Verification before frontend cutover

- Confirm Worker `/health` returns `{ "status": "ok" }`.
- Confirm a valid Taiwan UID returns a real HiSekai response.
- Confirm each other region with its configured provider token.
- Confirm invalid UIDs, missing profiles, provider throttling, and upstream outages are handled.
- Only then point `player-lookup.js` to the Worker and remove the browser-side legacy adapters.
