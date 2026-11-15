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


const MAX_ACCOUNT_DATA_BYTES = 128 * 1024;
const GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";

async function verifyGoogleIdentity(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer ([A-Za-z0-9._~-]+)$/);
  if (!match || !env.GOOGLE_CLIENT_ID) return null;
  try {
    // Validate the OAuth access token server-side. This is the popup OAuth
    // flow, not the FedCM-based Sign in with Google credential flow.
    const response = await fetch(GOOGLE_TOKENINFO_URL + "?access_token=" + encodeURIComponent(match[1]), {
      headers: { accept: "application/json" },
    });
    if (!response.ok) return null;
    const token = await response.json();
    const scopes = String(token.scope || "").split(/\s+/);
    if (token.aud !== env.GOOGLE_CLIENT_ID ||
        (token.azp && token.azp !== env.GOOGLE_CLIENT_ID) ||
        !token.sub || !Number.isFinite(Number(token.exp)) ||
        Number(token.exp) * 1000 <= Date.now() ||
        !["true", true].includes(token.email_verified) ||
        !scopes.includes("openid") ||
        !scopes.some((scope) => scope.endsWith("/auth/userinfo.email"))) return null;
    return { sub: String(token.sub), email: String(token.email || "") };
  } catch {
    return null;
  }
}

async function handleAccountData(request, env, origin) {
  if (!env.USER_DATA_DB) return json({ error: "USER_DATA_DB_NOT_CONFIGURED" }, 503, origin);
  const identity = await verifyGoogleIdentity(request, env);
  if (!identity) return json({ error: "UNAUTHORIZED" }, 401, origin);

  if (request.method === "GET") {
    const row = await env.USER_DATA_DB.prepare(
      "SELECT data, updated_at FROM user_data WHERE google_sub = ?"
    ).bind(identity.sub).first();
    if (!row) return json({ data: {}, updatedAt: null, accountSub: identity.sub }, 200, origin);
    try {
      return json({ data: JSON.parse(row.data), updatedAt: row.updated_at, accountSub: identity.sub }, 200, origin);
    } catch {
      return json({ error: "STORED_DATA_INVALID" }, 500, origin);
    }
  }

  if (request.method === "PUT") {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_ACCOUNT_DATA_BYTES) {
      return json({ error: "DATA_TOO_LARGE", maxBytes: MAX_ACCOUNT_DATA_BYTES }, 413, origin);
    }
    let payload;
    try { payload = JSON.parse(raw); } catch {
      return json({ error: "INVALID_JSON" }, 400, origin);
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
        !payload.data || typeof payload.data !== "object" || Array.isArray(payload.data)) {
      return json({ error: "INVALID_DATA" }, 400, origin);
    }
    const serialized = JSON.stringify(payload.data);
    if (new TextEncoder().encode(serialized).byteLength > MAX_ACCOUNT_DATA_BYTES) {
      return json({ error: "DATA_TOO_LARGE", maxBytes: MAX_ACCOUNT_DATA_BYTES }, 413, origin);
    }
    const updatedAt = new Date().toISOString();
    await env.USER_DATA_DB.prepare(
      "INSERT INTO user_data (google_sub, email, data, updated_at) VALUES (?, ?, ?, ?) " +
      "ON CONFLICT(google_sub) DO UPDATE SET email = excluded.email, data = excluded.data, updated_at = excluded.updated_at"
    ).bind(identity.sub, identity.email, serialized, updatedAt).run();
    return json({ saved: true, updatedAt }, 200, origin);
  }
  return json({ error: "METHOD_NOT_ALLOWED" }, 405, origin);
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
          "access-control-allow-methods": "GET, PUT, OPTIONS",
          "access-control-allow-headers": "Content-Type, Authorization",
          "access-control-max-age": "86400",
          "vary": "Origin",
        },
      });
    }
    const url = new URL(request.url);
    if (url.pathname === "/api/account/data") {
      if (!["GET", "PUT"].includes(request.method)) {
        return json({ error: "METHOD_NOT_ALLOWED" }, 405, origin);
      }
      try {
        return await handleAccountData(request, env, origin);
      } catch {
        return json({ error: "ACCOUNT_DATA_OPERATION_FAILED" }, 500, origin);
      }
    }
    if (request.method !== "GET") {
      return json({ error: "METHOD_NOT_ALLOWED" }, 405, origin);
    }

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
