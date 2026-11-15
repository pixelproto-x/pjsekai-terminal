import { ALLOWED_ORIGIN, REGIONS, parseProfilePath, parseEventRankingPath } from "./routes.mjs";

const UPSTREAM_TIMEOUT_MS = 8000;
const CACHE_TTL_SECONDS = 300;
const HANEOKA_BASE = "https://haneoka.org/api/v1/game/records";
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

async function pendingRankingResponse(upstreamResponse, event, origin) {
  let upstreamBody = {};
  try {
    upstreamBody = await upstreamResponse.json();
  } catch {}
  const rawRetryAfter = upstreamBody?.error?.retryAfter
    ?? upstreamResponse.headers.get("Retry-After")
    ?? 30;
  const retryAfter = Math.max(5, Math.min(300, Number(rawRetryAfter) || 30));
  return json({
    status: "DATA_PENDING",
    error: "EVENT_DATA_PENDING",
    event,
    retryAfter,
  }, 202, origin, { extraHeaders: { "retry-after": String(retryAfter) } });
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

    const eventRanking = parseEventRankingPath(url.pathname);
    if (eventRanking) {
      if (!HANEOKA_REGIONS.has(eventRanking.region)) {
        return json({ error: "EVENT_RANKING_UNSUPPORTED", region: eventRanking.region }, 501, origin);
      }
      const eventCache = env.PROFILE_CACHE || globalThis.caches?.default;
      const eventCacheKey = new Request(url.toString(), { method: "GET" });
      if (eventCache) {
        try {
          const hit = await eventCache.match(eventCacheKey);
          if (hit) return json({ ...(await hit.json()), cached: true }, 200, origin, { cacheSeconds: 60 });
        } catch {}
      }
      const eventController = new AbortController();
      const eventTimeout = setTimeout(() => eventController.abort(), UPSTREAM_TIMEOUT_MS);
      try {
        const fetchImpl = env.FETCH || fetch;
        const currentResponse = await fetchImpl(HANEOKA_BASE + "/" + eventRanking.region + "/events/current", {
          headers: { accept: "application/json" }, signal: eventController.signal,
        });
        if (currentResponse.status === 503) return await pendingRankingResponse(currentResponse, null, origin);
        if (!currentResponse.ok) return json({ error: "EVENT_SOURCE_UNAVAILABLE" }, 502, origin);
        const current = await currentResponse.json();
        const event = current?.event ?? null;
        if (!event?.id) return json({ event: null, row: null, status: "NO_ACTIVE_EVENT" }, 200, origin, { cacheSeconds: 60 });
        const requestedName = url.searchParams.get("name")?.trim() || "";
        const searchQuery = requestedName
          ? "?query=" + encodeURIComponent(requestedName) + "&partial=1"
          : "?profileId=" + encodeURIComponent(eventRanking.uid);
        const searchUrl = HANEOKA_BASE + "/" + eventRanking.region + "/events/" + encodeURIComponent(String(event.id))
          + "/points/search" + searchQuery;
        const rankingResponse = await fetchImpl(searchUrl, {
          headers: { accept: "application/json" }, signal: eventController.signal,
        });
        if (rankingResponse.status === 503) return await pendingRankingResponse(rankingResponse, event, origin);
        if (rankingResponse.status === 404) return json({ event, row: null, status: "POINT_BOARD_UNAVAILABLE" }, 200, origin, { cacheSeconds: 60 });
        if (!rankingResponse.ok) return json({ error: "EVENT_RANKING_UNAVAILABLE" }, 502, origin);
        const ranking = await rankingResponse.json();
        let row = ranking?.row ?? null;
        let status = "OK";
        if (requestedName) {
          // A partial index may not have found every duplicate name yet.
          // Wait for a complete search before choosing any exact-name match.
          if (ranking?.complete === false) {
            const retryAfter = Math.max(5, Math.min(300, Number(ranking?.retryAfter) || 30));
            return json({ event, row: null, status: "DATA_PENDING", retryAfter }, 202, origin, {
              extraHeaders: { "retry-after": String(retryAfter) },
            });
          }
          const normalizedName = requestedName.normalize("NFKC").toLocaleLowerCase();
          const exactMatches = (Array.isArray(ranking?.matches) ? ranking.matches : [])
            .filter((match) => String(match?.name ?? "").normalize("NFKC").toLocaleLowerCase() === normalizedName);
          if (exactMatches.length === 1) {
            const match = exactMatches[0];
            row = { rank: match.rank, name: match.name, point: match.point, profileId: match.profileId ?? null };
          } else if (exactMatches.length > 1) {
            status = "AMBIGUOUS_NAME";
          } else {
            status = "NOT_FOUND";
          }
        } else if (!row && ranking?.searchedTo >= 2000) {
          status = "NOT_FOUND_TOP_2000";
        }
        const payload = { event, ranking, row, status, cached: false };
        const response = json(payload, 200, origin, { cacheSeconds: 60 });
        if (eventCache) {
          const store = eventCache.put(eventCacheKey, response.clone());
          if (ctx.waitUntil) ctx.waitUntil(store.catch(() => {}));
        }
        return response;
      } catch {
        return json({ error: "EVENT_SOURCE_UNAVAILABLE" }, 502, origin);
      } finally {
        eventController.abort();
        clearTimeout(eventTimeout);
      }
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
