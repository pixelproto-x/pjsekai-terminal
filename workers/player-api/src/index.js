const REGIONS = new Set(["jp", "tw", "en", "kr", "cn"]);
const ALLOWED_ORIGIN = "https://pixelproto-x.github.io";
const UPSTREAM_TIMEOUT_MS = 9000;
const PUBLIC_PROFILE_KEYS = [
  "userGamedata", "userDecks", "userCharacters",
  "userChallengeLiveSoloStages", "userChallengeLiveSoloResults",
  "userChallengeLiveSoloHighScoreRewards", "userBonds", "userMaterials",
  "userAreas", "userMysekaiFixtureGameCharacterPerformanceBonuses",
  "userMysekaiGates", "upload_time",
].join(",");

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": origin,
      "vary": "Origin",
      "x-content-type-options": "nosniff",
    },
  });
}

function corsOrigin(request) {
  const origin = request.headers.get("Origin");
  return origin === ALLOWED_ORIGIN ? origin : "";
}

async function fetchSource(url, headers, signal) {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json", ...headers },
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

function candidates(region, uid, env) {
  const encodedUid = encodeURIComponent(uid);
  const list = [
    {
      name: "Haruki Public",
      url: `https://suite-api.haruki.seiunx.com/public/${region}/suite/${encodedUid}?key=${PUBLIC_PROFILE_KEYS}`,
      headers: {},
    },
  ];
  if (region === "tw") {
    list.push({
      name: "HiSekai",
      url: `https://api.hisekai.org/tw/user/${encodedUid}/profile`,
      headers: {},
    });
  }
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

export default {
  async fetch(request, env) {
    const origin = corsOrigin(request);
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      if (!origin) return new Response(null, { status: 403 });
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

    if (!origin) return json({ error: "ORIGIN_NOT_ALLOWED" }, 403, "null");
    if (request.method !== "GET") return json({ error: "METHOD_NOT_ALLOWED" }, 405, origin);

    if (url.pathname === "/health") {
      return json({ status: "ok", regions: [...REGIONS] }, 200, origin);
    }

    const match = url.pathname.match(/^\/api\/([a-z]{2})\/user\/([0-9]{1,20})\/profile$/);
    if (!match) return json({ error: "NOT_FOUND" }, 404, origin);

    const [, region, uid] = match;
    if (!REGIONS.has(region)) return json({ error: "REGION_UNSUPPORTED" }, 400, origin);

    const sources = candidates(region, uid, env);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    const statuses = [];

    try {
      const attempts = sources.map(async (source) => {
        const result = await fetchSource(source.url, source.headers, controller.signal);
        if (!result.ok) {
          statuses.push(result.status);
          throw new Error("Upstream request failed");
        }
        return { source: source.name, result };
      });

      const success = await Promise.any(attempts);
      controller.abort();
      return json({
        data: success.result.data,
        uid,
        region,
        source: success.source,
        fetchedAt: new Date().toISOString(),
        cached: false,
      }, 200, origin);
    } catch {
      controller.abort();
      const failure = upstreamError(statuses, region);
      return json(failure.body, failure.status, origin);
    } finally {
      clearTimeout(timeout);
    }
  },
};
