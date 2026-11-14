# Cloudflare player API migration

The public website continues to call the existing Cloudflare Worker URL. The
Worker is being migrated from legacy public upstream endpoints to the current
self-hosted Haruki Sekai API v6.33.0 container.

## Architecture

- Cloudflare Worker: public CORS and route adapter.
- Cloudflare Container: official Haruki image
  `ghcr.io/team-haruki/haruki-sekai-api:6.33.0`.
- Durable Object: starts the container on demand and lets it sleep after
  inactivity.
- The user's computer does not need to remain online.
- No Render service is used.

## Required operator setup

Cloudflare Containers require the Workers Paid plan. The account owner must
also create encrypted Worker Secrets named `HARUKI_CONFIG_YAML` and
`HARUKI_ACCOUNTS_JSON`. See
`workers/player-api/README.md` and
`workers/player-api/haruki-sekai-configs.template.yaml`.

The five regions cannot be enabled with guessed values. Each needs valid
region-specific API settings, encryption values, and an account session.
Never store these secrets in the repository.

## Deployment and verification

The deploy workflow is manual until the paid plan and both Worker secrets are
ready. It deploys the container and then checks the live `/health` response
for version `6.33.0` and all five healthy regions. A successful GitHub Pages
build or Worker deployment by itself is not proof of live upstream access.
