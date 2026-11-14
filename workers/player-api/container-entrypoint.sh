#!/bin/sh
set -eu

: "${HARUKI_CONFIG_YAML:?Missing Cloudflare secret HARUKI_CONFIG_YAML}"
: "${HARUKI_ACCOUNTS_JSON:?Missing Cloudflare secret HARUKI_ACCOUNTS_JSON}"

umask 077
mkdir -p /app/runtime/version /app/runtime/master
for region in jp en tw kr cn; do
  mkdir -p "/app/runtime/accounts/$region" "/app/runtime/master/$region"
done

printf '%s' "$HARUKI_CONFIG_YAML" > /app/runtime/haruki-sekai-configs.yaml

printf '%s' "$HARUKI_ACCOUNTS_JSON" | jq -e 'type == "object"' >/dev/null
for region in jp en tw kr cn; do
  printf '%s' "$HARUKI_ACCOUNTS_JSON" \
    | jq -ce --arg region "$region" '(.[$region] // []) | if type == "array" then . else error("region accounts must be arrays") end' \
    > "/app/runtime/accounts/$region/accounts.json"
done

unset HARUKI_CONFIG_YAML HARUKI_ACCOUNTS_JSON
export CONFIG_PATH=/app/runtime/haruki-sekai-configs.yaml
exec "$@"
