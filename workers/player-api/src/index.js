import { ALLOWED_ORIGIN, REGIONS, parseProfilePath } from "./routes.mjs";

const UPSTREAM_TIMEOUT_MS = 8000;
const CACHE_TTL_SECONDS = 300;
const PUBLIC_PROFILE_KEYS = [
  "userGamedata", "userDecks", "userCharacters",
  "userChallengeLiveSoloStages", "userChallengeLiveSoloResults",
  "userChallengeLiveSoloHighScoreRewards", "userBonds", "userMaterials",
  "userAreas", "userMysekaiFixtureGameCharacterPerformanceBonuses",
  "userMysekaiGates", "upload_time",
].join(",");

function json(body, status, origin, { cacheSeconds = 0 } = {}) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": origin,
    "vary": "Origin",
    "x-content-type-options": "nosniff",
    "cache-control": cacheSeconds
      ? `public, max-age=0, s-maxage=${cacheSeconds}`
      : "no-store",
  };
  return new Response(JSON.stringify(body), { status, headers });
}

function candidates(region, uid, env) {
  const encodedUid = encodeURIComponent(uid);
  const list = [{
    name: "Haruki Public",
    url: `https://suite-api.haruki.seiunx.com/public/${region}/suite/${encodedUid}?key=${PUBLIC_PROFILE_KEYS}`,
    headers: {},
  }];

  // Taiwan-only public fallback. HiSekai's own documentation currently lists
  // only the TW profile route as supported.
  if (region === "tw") {
    list.push({
      name: "HiSekai",
      url: `https://api.hisekai.org/tw/user/${encodedUid}/profile`,
      headers: {},
    });
  }

  // Optional legacy provider credentials remain server-side if already set.
  if (env.HARUKI_TOKEN) {
    list.push({
      name: "Haruki",
      url: `https://public-api.haruki.seiunx.com/sekai-api/v5/api/${region}/user/${encodedUid}/profile`,
      headers: { "X-Haruki-Sekai-Token": env.HARUKI_TOKEN },
    });
  }
  if (env.MOE_TOKEN) {
    list.push({
      name: "Exmeaning",
      url: `https://seka-api.exmeaning.com/api/${region}/user/${encodedUid}/profile`,
      headers: { "x-moe-sekai-token": env.MOE_TOKEN },
    });
  }
  return list;
}

async function fetchSource(source, signal, fetchImpl) {
  try {
    const response = await fetchImpl(source.url, {
      method: "GET",
      headers: { accept: "application/json", ...source.headers },
      signal,
    });
    if (!response.ok) return { ok: false, status: response.status };

    const data = await response.json();
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return { ok: false, status: 502 };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, status: 502 };
  }
}

function upstreamError(statuses, region) {
  const status = statuses.includes(404) ? 404
    : statuses.includes(429) ? 429
      : statuses.includes(403) ? 403 : 502;
  return {
    status,
    body: {
      error: status === 404 ? "PLAYER_NOT_FOUND"
        : status === 429 ? "RATE_LIMITED"
          : status === 403 ? "PROFILE_NOT_PUBLIC" : "UPSTREAM_UNAVAILABLE",
      region,
    },
  };
}

function originFor(request) {
  return request.headers.get("Origin") === ALLOWED_ORIGIN ? ALLOWED_ORIGIN : "";
}

export default {
  async fetch(request, env = {}, ctx = {}) {
    const origin = originFor(request);
    if (!origin) {
      return json({ error: "ORIGIN_NOT_ALLOWED" }, 403, "null");
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": origin,
          "access-control-allow-methods": "GET, OPTIONS",
          "access-control-allow-headers": "Content-Type",
          "access-control-max-age": "86400",
          "vary": "Origin",
        },
      });
    }
    if (request.method !== "GET") {
      return json({ error: "METHOD_NOT_ALLOWED" }, 405, origin);
    }

    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return json({
        status: "ok",
        runtime: "Cloudflare Workers Free",
        regions: [...REGIONS],
        sources: {
          default: "Haruki Public",
          twFallback: "HiSekai",
          optionalFallbacks: ["Haruki", "Exmeaning"],
        },
      }, 200, origin);
    }

    const profile = parseProfilePath(url.pathname);
    if (!profile) return json({ error: "NOT_FOUND" }, 404, origin);

    const cache = env.PROFILE_CACHE || globalThis.caches?.default;
    const cacheKey = new Request(url.toString(), { method: "GET" });
    if (cache) {
      try {
        const hit = await cache.match(cacheKey);
        if (hit) {
          const body = await hit.json();
          return json({ ...body, cached: true }, 200, origin, {
            cacheSeconds: CACHE_TTL_SECONDS,
          });
        }
      } catch {
        // A cache failure must never prevent a live lookup.
      }
    }

    const sources = candidates(profile.region, profile.uid, env);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    const statuses = [];
    const fetchImpl = env.FETCH || fetch;

    try {
      const attempts = sources.map(async (source) => {
        const result = await fetchSource(source, controller.signal, fetchImpl);
        if (!result.ok) {
          statuses.push(result.status);
          throw new Error("Upstream request failed");
        }
        return { source: source.name, result };
      });

      const success = await Promise.any(attempts);
      controller.abort();
      const payload = {
        data: success.result.data,
        uid: profile.uid,
        region: profile.region,
        source: success.source,
        fetchedAt: new Date().toISOString(),
        cached: false,
      };
      const response = json(payload, 200, origin, {
        cacheSeconds: CACHE_TTL_SECONDS,
      });
      if (cache) {
        const store = cache.put(cacheKey, response.clone());
        if (ctx.waitUntil) ctx.waitUntil(store.catch(() => {}));
      }
      return response;
    } catch {
      controller.abort();
      const failure = upstreamError(statuses, profile.region);
      return json(failure.body, failure.status, origin);
    } finally {
      clearTimeout(timeout);
    }
  },
};

export { candidates, upstreamError };
