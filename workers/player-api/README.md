# Project SEKAI player API — Cloudflare Worker

This Worker is the server-side gateway for the static GitHub Pages website. It does not require a computer to stay on.

## Routes

- `GET /health`
- `GET /api/{region}/user/{uid}/profile`

Supported region codes: `jp`, `tw`, `en`, `kr`, `cn`.

The Taiwan route can use the documented HiSekai endpoint without credentials. Haruki and Exmeaning are optional upstreams for all five regions and require their own provider-issued tokens. A region without configured upstream credentials returns `SOURCE_NOT_CONFIGURED`; the Worker never fabricates profile data.

## Deploy

1. Install Wrangler and authenticate with `npx wrangler login`, or connect this repository to Cloudflare Workers Builds.
2. From this directory run `npx wrangler deploy`.
3. In the Worker settings, add secrets named `HARUKI_TOKEN` and/or `MOE_TOKEN` only after obtaining valid credentials from the respective providers. Do not commit tokens.
4. Copy the Worker `workers.dev` URL. The website frontend must be configured to use that URL before player lookup is switched over.

For GitHub Actions deployment, add repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. The API token should have the minimum Workers edit permissions needed for deployment.

## Security and limits

- CORS allows only `https://pixelproto-x.github.io`.
- UID path parameters are numeric and limited to 1–20 digits.
- Upstream requests time out after 9 seconds.
- No provider credentials are returned to the browser.
- The Worker does not accept arbitrary upstream URLs, preventing it from becoming an open proxy.

Cloudflare Workers Free currently documents a 100,000-request daily allowance; account limits and provider rate limits still apply.
