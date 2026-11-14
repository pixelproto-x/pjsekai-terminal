import { fetchJson } from "../core/http.mjs";
import { createCache } from "../core/cache.mjs";
import { normalizePlayerUid } from "../core/player-uid.mjs";

const PROFILE_BASE = "https://api.hisekai.org";
const CACHE_TTL_MS = 5 * 60 * 1000;

export function createHiSekaiPlayerProvider({
  fetchImpl,
  cache = createCache({ namespace: "pjsekai-hisekai-profile", version: "1" }),
  now = () => Date.now(),
  timeoutMs = 12000,
} = {}) {
  return Object.freeze({
    id: "hisekai-tw",
    region: "tw",
    capabilities: Object.freeze({ profile: true, team: true, cards: true }),
    async getProfile(input, options = {}) {
      const uid = normalizePlayerUid(input);
      const cacheKey = "profile:" + uid;
      const cached = cache.get(cacheKey);
      if (cached) {
        return { ...cached, cached: true };
      }

      const url = PROFILE_BASE + "/tw/user/" + encodeURIComponent(uid) + "/profile";
      const data = await fetchJson(url, {
        fetchImpl,
        signal: options.signal,
        timeoutMs,
      });
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new TypeError("Hi Sekai returned an unexpected profile payload.");
      }

      const result = {
        data,
        uid,
        region: "tw",
        source: "Hi Sekai",
        fetchedAt: new Date(now()).toISOString(),
        cached: false,
      };
      cache.set(cacheKey, result, CACHE_TTL_MS);
      return result;
    },
  });
}
