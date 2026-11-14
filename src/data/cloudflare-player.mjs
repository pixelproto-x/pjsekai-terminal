import { fetchJson } from "../core/http.mjs";
import { createCache } from "../core/cache.mjs";
import { normalizePlayerUid } from "../core/player-uid.mjs";

export const CLOUDFLARE_PLAYER_API = "https://pjsekai-player-api.a0983439343.workers.dev";
const REGIONS = Object.freeze(["jp", "tw", "en", "kr", "cn"]);
const CACHE_TTL_MS = 5 * 60 * 1000;

export function createCloudflarePlayerProvider({
  fetchImpl,
  cache = createCache({ namespace: "pjsekai-cloudflare-profile", version: "1" }),
  now = () => Date.now(),
  timeoutMs = 12000,
} = {}) {
  return Object.freeze({
    id: "cloudflare-player-api",
    regions: REGIONS,
    capabilities: Object.freeze({ profile: true, team: true, cards: true, characters: true }),
    async getProfile(input, region = "tw", options = {}) {
      const uid = normalizePlayerUid(input);
      if (!REGIONS.includes(region)) {
        const error = new RangeError("Unsupported Project SEKAI region.");
        error.code = "REGION_UNSUPPORTED";
        throw error;
      }

      const cacheKey = region + ":profile:" + uid;
      const cached = cache.get(cacheKey);
      if (cached) return { ...cached, cached: true };

      const url = CLOUDFLARE_PLAYER_API + "/api/" + region + "/user/" + encodeURIComponent(uid) + "/profile";
      const payload = await fetchJson(url, { fetchImpl, signal: options.signal, timeoutMs });
      if (!payload || typeof payload !== "object" || Array.isArray(payload)
        || !payload.data || typeof payload.data !== "object" || Array.isArray(payload.data)) {
        const error = new TypeError("Cloudflare player API returned an unexpected profile payload.");
        error.code = "UPSTREAM_INVALID_PAYLOAD";
        throw error;
      }

      const result = {
        data: payload.data,
        uid: String(payload.uid ?? uid),
        region: payload.region ?? region,
        source: payload.source ?? "Cloudflare Player API",
        fetchedAt: payload.fetchedAt ?? new Date(now()).toISOString(),
        cached: false,
      };
      cache.set(cacheKey, result, CACHE_TTL_MS);
      return result;
    },
  });
}
