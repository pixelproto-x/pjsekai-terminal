# Cloudflare player API — Haruki v6

This Worker is the public adapter for the self-hosted Haruki Sekai API. It keeps
the existing website URL and public route shape while translating profile
requests to the current Haruki v6 route.

## Runtime

- Haruki image: `ghcr.io/team-haruki/haruki-sekai-api:6.33.0`.
- Runtime: Cloudflare Containers + Durable Objects.
- No home computer or always-on local server is required.
- Containers require the Cloudflare Workers Paid plan and are billed by active
  container usage and provisioned resources.
- The container uses the `basic` instance and sleeps after 10 minutes without
  activity. Its account files are recreated from Worker secrets on startup.

## Public routes

- `GET /health`
- `GET /api/{region}/user/{uid}/profile` for `jp`, `tw`, `en`, `kr`, `cn`.

The Worker maps the public website route to Haruki v6's
`/api/{region}/{uid}/profile` route. It allows requests only from
`https://pixelproto-x.github.io` and wraps the profile payload in the format
the existing website expects.

## Required Cloudflare Worker secrets

Create these two secrets on the existing `pjsekai-player-api` Worker:

1. `HARUKI_CONFIG_YAML`: the complete Haruki v6.33.0 configuration, based on
   `haruki-sekai-configs.template.yaml`. Every region must have its correct
   API URL, Host header, AES key/IV, and account directory. The JP cookie URL
   must also be configured if required by the JP account setup.
2. `HARUKI_ACCOUNTS_JSON`: a JSON object with one array per region. Example
   structure only — replace the sample values with valid account credentials
   owned and supplied by the operator:

```json
{
  "jp": [{"userId": "…", "deviceId": "…", "credential": "…"}],
  "en": [{"userId": "…", "deviceId": "…", "credential": "…"}],
  "tw": [{"userID": 123456, "deviceId": "…", "accessToken": "…"}],
  "kr": [{"userID": 123456, "deviceId": "…", "accessToken": "…"}],
  "cn": [{"userID": 123456, "deviceId": "…", "accessToken": "…"}]
}
```

Do not paste credentials into chat, commit them to GitHub, or put them in
ordinary Worker variables. Use encrypted Worker Secrets only. Do not use game
account passwords in place of the credential/access-token fields.

## Deployment

The deployment workflow is intentionally manual until the account owner has
enabled Workers Paid and configured both Worker secrets. Run
`.github/workflows/deploy-player-api.yml` only after both prerequisites are
ready. The workflow deploys the container and verifies that Haruki reports
version `6.33.0` with all five regions healthy.

## Important limitations

Haruki v6 is a self-hosted game API proxy, not a public hosted API. It cannot
serve a region until that region's game endpoint settings, encryption values,
and a valid account session are configured. A successful container deployment
alone does not prove that player lookup works.
