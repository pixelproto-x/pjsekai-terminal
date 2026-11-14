# Project SEKAI player API — Cloudflare Worker

This Worker is the server-side gateway for the static GitHub Pages website. It runs in Cloudflare's cloud; the owner's computer does not need to remain powered on.

## Routes

- `GET /health`
- `GET /api/{region}/user/{uid}/profile`

Supported region codes: `jp`, `tw`, `en`, `kr`, `cn`.

The Taiwan route can use the documented HiSekai endpoint without credentials. Haruki and Exmeaning are optional upstreams for all five regions and require provider-issued tokens. If more than one source is configured, the Worker races them and returns the first valid response instead of waiting for every provider. A region without a configured source returns `SOURCE_NOT_CONFIGURED`; the Worker never fabricates profile data.

## Deploy

1. Add GitHub repository Actions secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, then run the **Deploy player API Worker** workflow from the Actions tab (or push a Worker change to `main`).
2. In the Cloudflare Worker settings, add secrets named `HARUKI_TOKEN` and/or `MOE_TOKEN` only after obtaining valid credentials from the respective providers.
3. Copy the deployed Worker `workers.dev` URL. The website frontend must be configured to use that URL before player lookup is switched over.

The Cloudflare deployment token should have only the Workers permissions required to deploy this Worker. Do not commit tokens or paste them into chat.

## Security and limits

- CORS allows only `https://pixelproto-x.github.io`.
- UID path parameters are numeric and limited to 1–20 digits.
- Upstream requests have a 9-second timeout.
- The first valid upstream response wins; failed or slow providers do not delay a successful provider.
- Provider credentials are never returned to the browser.
- The Worker does not accept arbitrary upstream URLs, preventing it from becoming an open proxy.
