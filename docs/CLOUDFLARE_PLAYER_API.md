# Cloudflare player API

The Worker runs in Cloudflare; the owner's computer does not need to remain online.

## Routes

- `GET /health` returns the five supported region codes.
- `GET /api/{region}/user/{uid}/profile` supports `jp`, `tw`, `en`, `kr`, and `cn`.

## Upstream order

All five regions are routed through this Worker. It races the legacy public Haruki profile endpoint for the requested region. Taiwan additionally tries HiSekai. If configured, authenticated Haruki and Exmeaning upstreams are also raced.

Optional Worker secrets:
- `HARUKI_TOKEN` for the authenticated Haruki gateway.
- `MOE_TOKEN` for the Exmeaning gateway.

The Cloudflare deployment token is separate and is not an upstream provider credential. Missing optional tokens do not prevent the Worker from attempting the public upstreams. If all upstreams fail, the Worker returns a real upstream error and never fabricates profile data.

## Security

- CORS allows only `https://pixelproto-x.github.io`.
- UID paths accept numeric IDs of 1–20 digits.
- Upstream requests have a 9-second timeout.
- Provider credentials stay on the Worker and are never returned to the browser.
- The Worker does not accept arbitrary upstream URLs.
