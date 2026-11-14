import { fetchJson } from "../core/http.mjs";
import { createCache } from "../core/cache.mjs";
import { normalizePlayerUid } from "../core/player-uid.mjs";

export const REGION_LABELS = Object.freeze({
  jp: "日本",
  en: "國際",
  tw: "台灣",
  kr: "韓國",
  cn: "中國",
});

const REGIONS = Object.freeze(Object.keys(REGION_LABELS));
const API_BASE = "https://suite-api.haruki.seiunx.com/public";
const PROFILE_KEYS = [
  "userGamedata", "userDecks", "userCharacters",
  "userChallengeLiveSoloStages", "userChallengeLiveSoloResults",
  "userChallengeLiveSoloHighScoreRewards", "userBonds", "userMaterials",
  "userAreas", "userMysekaiFixtureGameCharacterPerformanceBonuses",
  "userMysekaiGates", "upload_time",
].join(",");
const CACHE_TTL_MS = 5 * 60 * 1000;

export function createHarukiPlayerProvider({
  fetchImpl,
  cache = createCache({ namespace: "pjsekai-haruki-profile", version: "1" }),
  now = () => Date.now(),
  timeoutMs = 12000,
} = {}) {
  return Object.freeze({
    id: "haruki-public-five-region",
    regions: REGIONS,
    capabilities: Object.freeze({ profile: true, team: true, cards: true, characters: true, materials: true }),
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

      const url = API_BASE + "/" + region + "/suite/" + encodeURIComponent(uid) + "?key=" + PROFILE_KEYS;
      const data = await fetchJson(url, { fetchImpl, signal: options.signal, timeoutMs });
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        const error = new TypeError("Haruki returned an unexpected player payload.");
        error.code = "UPSTREAM_INVALID_PAYLOAD";
        throw error;
      }

      const result = {
        data, uid, region, source: "Haruki Public API",
        fetchedAt: new Date(now()).toISOString(), cached: false,
      };
      cache.set(cacheKey, result, CACHE_TTL_MS);
      return result;
    },
  });
}
