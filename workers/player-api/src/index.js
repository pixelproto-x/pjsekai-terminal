import { ALLOWED_ORIGIN, REGIONS, parseProfilePath } from "./routes.mjs";

const UPSTREAM_TIMEOUT_MS = 8000;
const CACHE_TTL_SECONDS = 300;
const HANEOKA_REGIONS = new Set(["jp", "tw", "en", "kr"]);
const PUBLIC_PROFILE_KEYS = [
  "userGamedata", "userDecks", "userCharacters",
  "userChallengeLiveSoloStages", "userChallengeLiveSoloResults",
  "userChallengeLiveSoloHighScoreRewards", "userBonds", "userMaterials",
  "userAreas", "userMysekaiFixtureGameCharacterPerformanceBonuses",
  "userMysekaiGates", "upload_time",
].join(",");

function json(body, status, origin, { cacheSeconds = 0, extraHeaders = {} } = {}) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": origin,
    "vary": "Origin",
    "x-content-type-options": "nosniff",
    "cache-control": cacheSeconds
      ? `public, max-age=0, s-maxage=${cacheSeconds}`
      : "no-store",
    ...extraHeaders,
  };
  return new Response(JSON.stringify(body), { status, headers });
}

function candidates(region, uid, env) {
  const encodedUid = encodeURIComponent(uid);
  const list = [];

  // HiSekai documents team and power fields for its Taiwan profile response.
  // Prefer it there; Haruki remains the multi-region fallback.
  if (region === "tw") {
    list.push({
      name: "HiSekai",
      url: `https://api.hisekai.org/tw/user/${encodedUid}/profile`,
      headers: {},
    });
  }
  list.push({
    name: "Haruki Public",
    url: `https://suite-api.haruki.seiunx.com/public/${region}/suite/${encodedUid}?key=${PUBLIC_PROFILE_KEYS}`,
    headers: {},
  });

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
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetchImpl(source.url, {
        method: "GET",
        headers: { accept: "application/json", ...source.headers },
        signal,
      });
      if (!response.ok) {
        if (response.status >= 500 && attempt === 0 && !signal.aborted) continue;
        return { ok: false, status: response.status };
      }

      const data = await response.json();
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        if (attempt === 0 && !signal.aborted) continue;
        return { ok: false, status: 502 };
      }
      return { ok: true, data };
    } catch {
      if (attempt === 0 && !signal.aborted) continue;
      return { ok: false, status: 502 };
    }
  }
  return { ok: false, status: 502 };
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

    if (profile.region === "auto") {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
      const fetchImpl = env.FETCH || fetch;
      try {
        const checks = await Promise.all(REGIONS.map(async (region) => {
          const statuses = [];
          for (const source of candidates(region, profile.uid, env)) {
            const result = await fetchSource(source, controller.signal, fetchImpl);
            if (result.ok) return { region, source: source.name, data: result.data };
            statuses.push(result.status);
          }
          return { region, statuses };
        }));

        const matches = checks.filter((item) => item.data);
        const failures = checks.filter((item) => !item.data).flatMap((item) => item.statuses || []);
        if (matches.length > 1) {
          return json({ error: "AMBIGUOUS_REGION", regions: matches.map((item) => item.region) }, 409, origin);
        }
        if (matches.length === 1 && failures.every((status) => status === 404)) {
          const match = matches[0];
          const payload = {
            data: match.data,
            uid: profile.uid,
            region: match.region,
            source: match.source,
            fetchedAt: new Date().toISOString(),
            cached: false,
          };
          const response = json(payload, 200, origin, { cacheSeconds: CACHE_TTL_SECONDS });
          if (cache) {
            const store = cache.put(cacheKey, response.clone());
            if (ctx.waitUntil) ctx.waitUntil(store.catch(() => {}));
          }
          return response;
        }
        if (matches.length === 1 || failures.some((status) => status !== 404)) {
          const status = failures.includes(429) ? 429 : failures.includes(403) ? 403 : 503;
          return json({
            error: "REGION_DETECTION_INCOMPLETE",
            message: "At least one region could not be checked",
          }, status, origin);
        }
        return json({ error: "PLAYER_NOT_FOUND" }, 404, origin);
      } catch {
        controller.abort();
        return json({ error: "REGION_DETECTION_UNAVAILABLE" }, 503, origin);
      } finally {
        clearTimeout(timeout);
      }
    }

    const sources = candidates(profile.region, profile.uid, env);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    const statuses = [];
    const fetchImpl = env.FETCH || fetch;

    try {
      let success = null;
      // Try the Taiwan profile source first because it publishes team power.
      // If it is unavailable, fall back to the multi-region Haruki source.
      for (const source of sources) {
        const result = await fetchSource(source, controller.signal, fetchImpl);
        if (result.ok) {
          success = { source: source.name, result };
          break;
        }
        statuses.push(result.status);
      }
      if (!success) {
        const failure = upstreamError(statuses, profile.region);
        return json(failure.body, failure.status, origin);
      }
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
