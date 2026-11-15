import { ALLOWED_ORIGIN, REGIONS, parseProfilePath, parseEventRankingPath } from "./routes.mjs";

const UPSTREAM_TIMEOUT_MS = 8000;
const EVENT_UPSTREAM_TIMEOUT_MS = 12000;
const EVENT_SCAN_DEFAULT_PAGES = 12;
const EVENT_SCAN_MAX_PAGES = 20;
const EVENT_SCAN_PAGE_SIZE = 100;
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

function unwrapRankingPayload(payload) {
  return payload?.data && typeof payload.data === "object" ? payload.data
    : payload?.result && typeof payload.result === "object" ? payload.result
      : payload;
}

function rankingRows(payload) {
  const root = unwrapRankingPayload(payload);
  if (Array.isArray(root?.rows)) return root.rows;
  if (Array.isArray(root?.ranking?.rows)) return root.ranking.rows;
  if (Array.isArray(root?.data?.rows)) return root.data.rows;
  return [];
}

function rankingMaxRank(payload) {
  const root = unwrapRankingPayload(payload);
  const value = root?.maxRank ?? root?.max_rank ?? root?.ranking?.maxRank ?? root?.data?.maxRank;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function rankingRowMatches(row, uid) {
  const profileId = row?.profileId ?? row?.profile_id ?? row?.userId ?? row?.user_id ?? row?.uid;
  return profileId != null && String(profileId) === String(uid);
}

async function fetchMoesekaiTop100(fetchImpl, region, uid, signal) {
  const host = region === "cn" || region === "kr"
    ? "https://rks-n-cn.exmeaning.com"
    : "https://rks-n.exmeaning.com";
  try {
    const response = await fetchImpl(host + "/api/public/v2/" + region + "/latest", {
      headers: { accept: "application/json" },
      signal,
    });
    if (!response.ok) return { ok: false, status: response.status };
    const snapshot = await response.json();
    if (!Array.isArray(snapshot?.rankings) || !snapshot?.event_id) {
      return { ok: false, status: 502 };
    }
    const entry = snapshot.rankings.find((item) => String(item?.userId) === String(uid));
    const row = entry ? {
      rank: Number(entry.rank),
      profileId: String(entry.userId),
      point: Number(entry.score),
      name: entry.name ?? "",
      source: "Moesekai",
    } : null;
    return {
      ok: true,
      event: {
        id: snapshot.event_id,
        startAt: snapshot.start_at,
        endAt: snapshot.end_at,
        updatedAt: snapshot.updated_at,
      },
      row,
      scannedTo: 100,
      source: "Moesekai",
    };
  } catch {
    return { ok: false, status: signal.aborted ? 504 : 502 };
  }
}

async function scanEventRankingPages(fetchImpl, region, event, uid, start, pages, signal) {
  const starts = Array.from({ length: pages }, (_, index) => start + index * EVENT_SCAN_PAGE_SIZE);
  const results = await Promise.all(starts.map(async (pageStart) => {
    try {
      const response = await fetchImpl(
        HANEOKA_BASE + "/" + region + "/events/" + encodeURIComponent(String(event.id))
          + "/points/ranking?start=" + encodeURIComponent(String(pageStart)),
        { headers: { accept: "application/json" }, signal },
      );
      if (response.status === 503) {
        let body = {};
        try { body = await response.json(); } catch {}
        return {
          pending: true,
          retryAfter: body?.error?.retryAfter ?? response.headers.get("Retry-After") ?? 30,
        };
      }
      if (!response.ok) return { error: response.status };
      return { pageStart, body: await response.json() };
    } catch (error) {
      return { error: signal.aborted ? 504 : 502 };
    }
  }));

  const pending = results.find((item) => item.pending);
  if (pending) {
    return {
      status: "DATA_PENDING",
      event,
      scanStart: start,
      scanPages: pages,
      retryAfter: Math.max(5, Math.min(300, Number(pending.retryAfter) || 30)),
    };
  }

  const failure = results.find((item) => item.error);
  if (failure) {
    return {
      status: "UPSTREAM_ERROR",
      error: "EVENT_RANKING_PAGE_UNAVAILABLE",
      upstreamStatus: failure.error,
      event,
      scannedTo: start - 1,
    };
  }

  const rows = results.flatMap((item) => rankingRows(item.body));
  const row = rows.find((item) => rankingRowMatches(item, uid));
  const maxRank = results.map((item) => rankingMaxRank(item.body)).filter((value) => value != null)
    .reduce((maximum, value) => Math.max(maximum, value), 0) || null;
  const lastRank = rows.reduce((maximum, item) => {
    const rank = Number(item?.rank);
    return Number.isFinite(rank) ? Math.max(maximum, rank) : maximum;
  }, 0);
  if (row) return { status: "OK", event, row, maxRank, scannedTo: Number(row.rank) || lastRank };

  const nextStart = start + pages * EVENT_SCAN_PAGE_SIZE;
  const scannedTo = lastRank || nextStart - 1;
  if (maxRank != null && nextStart > maxRank) {
    return { status: "NOT_FOUND", event, row: null, maxRank, scannedTo: Math.min(scannedTo, maxRank) };
  }
  if (rows.length === 0) {
    return {
      status: "DATA_PENDING",
      event,
      scanStart: start,
      scanPages: pages,
      retryAfter: 30,
    };
  }
  return { status: "SCAN_PROGRESS", event, row: null, nextStart, scannedTo, maxRank };
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
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), EVENT_UPSTREAM_TIMEOUT_MS);
        try {
          const snapshot = await fetchMoesekaiTop100(env.FETCH || fetch, eventRanking.region, eventRanking.uid, controller.signal);
          if (!snapshot.ok) {
            return json({
              status: "UPSTREAM_ERROR",
              error: "MOESEKAI_RANKING_UNAVAILABLE",
              upstreamStatus: snapshot.status,
              region: eventRanking.region,
            }, 200, origin);
          }
          if (snapshot.row) {
            return json({
              status: "OK",
              event: snapshot.event,
              row: snapshot.row,
              source: snapshot.source,
              scannedTo: snapshot.scannedTo,
            }, 200, origin, { cacheSeconds: 60 });
          }
          return json({
            status: "NOT_FOUND_TOP_100",
            row: null,
            event: snapshot.event,
            source: snapshot.source,
            scannedTo: snapshot.scannedTo,
            message: "Moesekai only publishes individual entries in its top-100 snapshot for this region.",
          }, 200, origin, { cacheSeconds: 60 });
        } finally {
          controller.abort();
          clearTimeout(timeout);
        }
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
      const eventTimeout = setTimeout(() => eventController.abort(), EVENT_UPSTREAM_TIMEOUT_MS);
      try {
        const fetchImpl = env.FETCH || fetch;
        const currentResponse = await fetchImpl(HANEOKA_BASE + "/" + eventRanking.region + "/events/current", {
          headers: { accept: "application/json" }, signal: eventController.signal,
        });
        if (currentResponse.status === 503) return await pendingRankingResponse(currentResponse, null, origin);
        if (!currentResponse.ok) return json({
          status: "UPSTREAM_ERROR",
          error: "EVENT_SOURCE_UNAVAILABLE",
          upstreamStatus: currentResponse.status,
        }, 200, origin);
        const current = await currentResponse.json();
        const event = current?.event ?? null;
        if (!event?.id) return json({ event: null, row: null, status: "NO_ACTIVE_EVENT" }, 200, origin, { cacheSeconds: 60 });
        const requestedEventId = url.searchParams.get("eventId");
        if (requestedEventId && requestedEventId !== String(event.id)) {
          return json({ event, row: null, status: "EVENT_CHANGED" }, 200, origin);
        }

        const requestedStart = Number(url.searchParams.get("start"));
        const requestedPages = Number(url.searchParams.get("pages"));
        const scanPages = Number.isInteger(requestedPages) && requestedPages > 0
          ? Math.min(EVENT_SCAN_MAX_PAGES, requestedPages)
          : EVENT_SCAN_DEFAULT_PAGES;
        let payload;

        if (Number.isInteger(requestedStart) && requestedStart >= 101) {
          payload = await scanEventRankingPages(
            fetchImpl, eventRanking.region, event, eventRanking.uid, requestedStart, scanPages, eventController.signal,
          );
        } else {
          // Haneoka's profileId search is the fast path for the first 2,000 ranks.
          const searchUrl = HANEOKA_BASE + "/" + eventRanking.region + "/events/" + encodeURIComponent(String(event.id))
            + "/points/search?profileId=" + encodeURIComponent(eventRanking.uid);
          const rankingResponse = await fetchImpl(searchUrl, {
            headers: { accept: "application/json" }, signal: eventController.signal,
          });
          if (rankingResponse.status === 503) return await pendingRankingResponse(rankingResponse, event, origin);
          if (rankingResponse.status === 404) return json({ event, row: null, status: "POINT_BOARD_UNAVAILABLE" }, 200, origin, { cacheSeconds: 60 });
          if (!rankingResponse.ok) return json({
            event,
            row: null,
            status: "UPSTREAM_ERROR",
            error: "EVENT_RANKING_UNAVAILABLE",
            upstreamStatus: rankingResponse.status,
          }, 200, origin);
          const ranking = await rankingResponse.json();
          const searchRoot = unwrapRankingPayload(ranking);
          const row = searchRoot?.row ?? searchRoot?.ranking?.row ?? null;
          if (row) {
            payload = { event, ranking, row, status: "OK", cached: false };
          } else {
            const searchedTo = Number(searchRoot?.searchedTo ?? searchRoot?.searched_to ?? 2000);
            const maxRank = rankingMaxRank(ranking);
            if (maxRank != null && searchedTo >= maxRank) {
              payload = { event, ranking, row: null, status: "NOT_FOUND", maxRank, scannedTo: maxRank };
            } else {
              const scanStart = Math.max(101, Math.floor((searchedTo || 2000) / EVENT_SCAN_PAGE_SIZE) * EVENT_SCAN_PAGE_SIZE + 1);
              payload = await scanEventRankingPages(
                fetchImpl, eventRanking.region, event, eventRanking.uid, scanStart, scanPages, eventController.signal,
              );
              payload.ranking = ranking;
            }
          }
        }
        const response = json({ ...payload, cached: false }, payload.status === "DATA_PENDING" ? 202 : 200, origin, {
          cacheSeconds: payload.status === "DATA_PENDING" ? 0 : 60,
        });
        if (eventCache) {
          const store = eventCache.put(eventCacheKey, response.clone());
          if (ctx.waitUntil) ctx.waitUntil(store.catch(() => {}));
        }
        return response;
      } catch {
        return json({
          status: "UPSTREAM_ERROR",
          error: eventController.signal.aborted ? "EVENT_SOURCE_TIMEOUT" : "EVENT_SOURCE_UNAVAILABLE",
          upstreamStatus: eventController.signal.aborted ? 504 : 502,
        }, 200, origin);
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
