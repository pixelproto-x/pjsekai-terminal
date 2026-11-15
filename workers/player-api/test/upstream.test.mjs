import test from "node:test";
import assert from "node:assert/strict";
import worker, { candidates, upstreamError } from "../src/index.js";

test("uses the public Haruki endpoint for all five regions", () => {
  for (const region of ["jp", "tw", "en", "kr", "cn"]) {
    const list = candidates(region, "123456", {});
    const haruki = list.find((item) => item.name === "Haruki Public");
    assert.ok(haruki);
    assert.match(haruki.url, new RegExp(`/public/${region}/suite/123456\\?`));
  }
});

test("adds HiSekai only as a Taiwan fallback", () => {
  assert.deepEqual(candidates("tw", "123", {}).map((item) => item.name), [
    "HiSekai", "Haruki Public",
  ]);
  assert.deepEqual(candidates("jp", "123", {}).map((item) => item.name), [
    "Haruki Public",
  ]);
});

test("uses optional provider credentials only when present", () => {
  const list = candidates("jp", "123", {
    HARUKI_TOKEN: "configured",
    MOE_TOKEN: "configured",
  });
  assert.deepEqual(list.map((item) => item.name), [
    "Haruki Public", "Haruki", "Exmeaning",
  ]);
});

test("maps upstream statuses to useful public errors", () => {
  assert.equal(upstreamError([404, 502], "tw").status, 404);
  assert.equal(upstreamError([403, 502], "jp").status, 403);
  assert.equal(upstreamError([429], "en").status, 429);
  assert.equal(upstreamError([502], "kr").status, 502);
});

test("returns the current event ranking for a supported region", async () => {
  const calls = [];
  const response = await worker.fetch(
    new Request("https://worker.example/api/tw/user/123456/event-ranking", {
      headers: { Origin: "https://pixelproto-x.github.io" },
    }),
    {
      FETCH: async (url) => {
        calls.push(String(url));
        if (String(url).endsWith("/tw/events/current")) {
          return new Response(JSON.stringify({ event: { id: 321, name: "Test Event" } }), { status: 200 });
        }
        return new Response(JSON.stringify({ row: { rank: 88, point: 12345 } }), { status: 200 });
      },
    },
  );
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.row.rank, 88);
  assert.equal(body.event.id, 321);
  assert.equal(calls.length, 2);
  assert.ok(calls[1].includes("321/points/search?profileId=123456"));
});

test("uses the Moesekai CN snapshot when the player is in its top 100", async () => {
  let requested = "";
  const response = await worker.fetch(
    new Request("https://worker.example/api/cn/user/123456/event-ranking", {
      headers: { Origin: "https://pixelproto-x.github.io" },
    }),
    {
      FETCH: async (url) => {
        requested = String(url);
        return new Response(JSON.stringify({
          event_id: 321,
          region: "cn",
          rankings: [{ rank: 77, userId: "123456", name: "Test Player", score: 456789 }],
        }), { status: 200 });
      },
    },
  );
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.match(requested, /rks-n-cn\.exmeaning\.com\/api\/public\/v2\/cn\/latest$/);
  assert.equal(body.status, "OK");
  assert.equal(body.row.rank, 77);
  assert.equal(body.row.profileId, "123456");
  assert.equal(body.source, "Moesekai");
});

test("does not claim a CN player is unranked when only the Moesekai top 100 was checked", async () => {
  const response = await worker.fetch(
    new Request("https://worker.example/api/cn/user/123456/event-ranking", {
      headers: { Origin: "https://pixelproto-x.github.io" },
    }),
    {
      FETCH: async () => new Response(JSON.stringify({
        event_id: 321,
        region: "cn",
        rankings: [{ rank: 1, userId: "other", name: "Other", score: 999999 }],
      }), { status: 200 }),
    },
  );
  const body = await response.json();
  assert.equal(body.status, "NOT_FOUND_TOP_100");
  assert.equal(body.scannedTo, 100);
  assert.equal(body.row, null);
});


test("converts Haneoka pending snapshots into a retryable application response", async () => {
  const response = await worker.fetch(
    new Request("https://worker.example/api/tw/user/123456/event-ranking", {
      headers: { Origin: "https://pixelproto-x.github.io" },
    }),
    {
      FETCH: async (url) => {
        if (String(url).endsWith("/tw/events/current")) {
          return new Response(JSON.stringify({ event: { id: 321 } }), { status: 200 });
        }
        return new Response(JSON.stringify({ error: { kind: "pending", retryAfter: 17 } }), { status: 503 });
      },
    },
  );
  const body = await response.json();
  assert.equal(response.status, 202);
  assert.equal(body.status, "DATA_PENDING");
  assert.equal(body.retryAfter, 17);
  assert.equal(response.headers.get("retry-after"), "17");
});


test("preserves current-event upstream failures as a visible ranking status", async () => {
  const response = await worker.fetch(
    new Request("https://worker.example/api/tw/user/123456/event-ranking", {
      headers: { Origin: "https://pixelproto-x.github.io" },
    }),
    {
      FETCH: async () => new Response(JSON.stringify({ error: "rate limited" }), { status: 429 }),
    },
  );
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.status, "UPSTREAM_ERROR");
  assert.equal(body.upstreamStatus, 429);
});

test("preserves event point-board upstream failures as a visible ranking status", async () => {
  const response = await worker.fetch(
    new Request("https://worker.example/api/tw/user/123456/event-ranking", {
      headers: { Origin: "https://pixelproto-x.github.io" },
    }),
    {
      FETCH: async (url) => {
        if (String(url).endsWith("/tw/events/current")) {
          return new Response(JSON.stringify({ event: { id: 321 } }), { status: 200 });
        }
        return new Response(JSON.stringify({ error: "upstream unavailable" }), { status: 502 });
      },
    },
  );
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.status, "UPSTREAM_ERROR");
  assert.equal(body.upstreamStatus, 502);
  assert.equal(body.event.id, 321);
});


test("finds a player beyond rank 2000 by scanning Haneoka 100-rank windows", async () => {
  const pageStarts = [];
  const response = await worker.fetch(
    new Request("https://worker.example/api/tw/user/987654/event-ranking", {
      headers: { Origin: "https://pixelproto-x.github.io" },
    }),
    {
      FETCH: async (url) => {
        const value = String(url);
        if (value.endsWith("/tw/events/current")) {
          return new Response(JSON.stringify({ event: { id: 654 } }), { status: 200 });
        }
        if (value.includes("/points/search?")) {
          return new Response(JSON.stringify({ row: null, searchedTo: 2000 }), { status: 200 });
        }
        const start = Number(new URL(value).searchParams.get("start"));
        pageStarts.push(start);
        const rows = start === 2101
          ? [{ rank: 2147, profileId: "987654", point: 123456 }]
          : [{ rank: start, profileId: "other-" + start, point: 1000 }];
        return new Response(JSON.stringify({ rows, maxRank: null }), { status: 200 });
      },
    },
  );
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.status, "OK");
  assert.equal(body.row.rank, 2147);
  assert.equal(body.row.profileId, "987654");
  assert.ok(pageStarts.includes(2001));
  assert.ok(pageStarts.includes(2101));
});

test("returns scan progress when a player is not in the first scanned windows", async () => {
  const response = await worker.fetch(
    new Request("https://worker.example/api/tw/user/987654/event-ranking", {
      headers: { Origin: "https://pixelproto-x.github.io" },
    }),
    {
      FETCH: async (url) => {
        const value = String(url);
        if (value.endsWith("/tw/events/current")) {
          return new Response(JSON.stringify({ event: { id: 654 } }), { status: 200 });
        }
        if (value.includes("/points/search?")) {
          return new Response(JSON.stringify({ row: null, searchedTo: 2000 }), { status: 200 });
        }
        const start = Number(new URL(value).searchParams.get("start"));
        return new Response(JSON.stringify({
          rows: [{ rank: start, profileId: "someone-else", point: 1000 }],
          maxRank: null,
        }), { status: 200 });
      },
    },
  );
  const body = await response.json();
  assert.equal(body.status, "SCAN_PROGRESS");
  assert.equal(body.nextStart, 3201);
  assert.equal(body.scannedTo, 3101);
});

test("resumes full ranking scans from the requested rank window", async () => {
  const requested = [];
  const response = await worker.fetch(
    new Request("https://worker.example/api/tw/user/987654/event-ranking?start=5001&pages=2&eventId=654", {
      headers: { Origin: "https://pixelproto-x.github.io" },
    }),
    {
      FETCH: async (url) => {
        const value = String(url);
        if (value.endsWith("/tw/events/current")) {
          return new Response(JSON.stringify({ event: { id: 654 } }), { status: 200 });
        }
        requested.push(new URL(value).searchParams.get("start"));
        return new Response(JSON.stringify({
          rows: [{ rank: Number(new URL(value).searchParams.get("start")), profileId: "other", point: 1 }],
          maxRank: 5050,
        }), { status: 200 });
      },
    },
  );
  const body = await response.json();
  assert.equal(body.status, "NOT_FOUND");
  assert.equal(body.maxRank, 5050);
  assert.deepEqual(requested.sort(), ["5001", "5101"]);
});

test("keeps pending full-ranking windows retryable without advancing the scan", async () => {
  const response = await worker.fetch(
    new Request("https://worker.example/api/tw/user/987654/event-ranking?start=2001&pages=3&eventId=654", {
      headers: { Origin: "https://pixelproto-x.github.io" },
    }),
    {
      FETCH: async (url) => {
        const value = String(url);
        if (value.endsWith("/tw/events/current")) {
          return new Response(JSON.stringify({ event: { id: 654 } }), { status: 200 });
        }
        return new Response(JSON.stringify({ error: { kind: "pending", retryAfter: 19 } }), { status: 503 });
      },
    },
  );
  const body = await response.json();
  assert.equal(response.status, 202);
  assert.equal(body.status, "DATA_PENDING");
  assert.equal(body.scanStart, 2001);
  assert.equal(body.scanPages, 3);
  assert.equal(body.retryAfter, 19);
});


test("does not retry an inactive Haneoka ranking search", async () => {
  const rankingCalls = [];
  const response = await worker.fetch(
    new Request("https://worker.example/api/tw/user/123456/event-ranking", {
      headers: { Origin: "https://pixelproto-x.github.io" },
    }),
    {
      FETCH: async (url) => {
        const value = String(url);
        if (value.endsWith("/tw/events/current")) {
          return new Response(JSON.stringify({ event: { id: 321, pointRankingEnabled: true } }), { status: 200 });
        }
        rankingCalls.push(value);
        return new Response(JSON.stringify({ error: { kind: "inactive", retryAfter: null } }), { status: 503 });
      },
    },
  );
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.status, "RANKING_INACTIVE");
  assert.equal(body.upstreamKind, "inactive");
  assert.equal(rankingCalls.length, 1);
});

test("uses the total board instead of the disabled point board", async () => {
  const calls = [];
  const response = await worker.fetch(
    new Request("https://worker.example/api/tw/user/123456/event-ranking", {
      headers: { Origin: "https://pixelproto-x.github.io" },
    }),
    {
      FETCH: async (url) => {
        const value = String(url);
        calls.push(value);
        if (value.endsWith("/tw/events/current")) {
          return new Response(JSON.stringify({
            event: {
              id: 321,
              pointRankingEnabled: false,
              pointRankingStatus: "disabled",
              totalRankingEnabled: true,
              totalRankingStatus: "collecting",
            },
          }), { status: 200 });
        }
        if (value.endsWith("/tw/events/321/total/latest")) {
          return new Response(JSON.stringify({
            rows: [{ rank: 42, profileId: "123456", scoreExact: "98765" }],
            stale: false,
          }), { status: 200 });
        }
        throw new Error("Unexpected upstream URL: " + value);
      },
    },
  );
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.status, "OK");
  assert.equal(body.row.rank, 42);
  assert.equal(body.source, "Haneoka Total");
  assert.equal(calls.length, 2);
});

test("does not treat inactive ranking pages as pending scans", async () => {
  const response = await worker.fetch(
    new Request("https://worker.example/api/tw/user/123456/event-ranking?start=2001&pages=1&eventId=321", {
      headers: { Origin: "https://pixelproto-x.github.io" },
    }),
    {
      FETCH: async (url) => {
        const value = String(url);
        if (value.endsWith("/tw/events/current")) {
          return new Response(JSON.stringify({ event: { id: 321, pointRankingEnabled: true } }), { status: 200 });
        }
        return new Response(JSON.stringify({ error: { kind: "inactive", retryAfter: null } }), { status: 503 });
      },
    },
  );
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.status, "RANKING_INACTIVE");
});


test("uses the Haneoka total board when point ranking is disabled", async () => {
  const calls = [];
  const response = await worker.fetch(
    new Request("https://worker.example/api/tw/user/7649981479996463925/event-ranking", {
      headers: { Origin: "https://pixelproto-x.github.io" },
    }),
    {
      FETCH: async (url) => {
        const value = String(url);
        calls.push(value);
        if (value.endsWith("/tw/events/current")) {
          return new Response(JSON.stringify({
            event: {
              id: 5,
              pointRankingEnabled: false,
              totalRankingEnabled: true,
            },
          }), { status: 200 });
        }
        if (value.endsWith("/tw/events/5/total/latest")) {
          return new Response(JSON.stringify({
            rows: [
              { rank: 1, profileId: "1111111111111111111", scoreExact: "999999" },
              { rank: 87, profileId: "7649981479996463925", scoreExact: "123456" },
            ],
            observedAtMs: 1794700000000,
            stale: false,
          }), { status: 200 });
        }
        throw new Error("Unexpected upstream URL: " + value);
      },
    },
  );
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.status, "OK");
  assert.equal(body.row.rank, 87);
  assert.equal(body.row.scoreExact, "123456");
  assert.equal(body.source, "Haneoka Total");
  assert.equal(calls.length, 2);
});

test("reports the documented top-100 limit for Haneoka total rankings", async () => {
  const response = await worker.fetch(
    new Request("https://worker.example/api/tw/user/7649981479996463925/event-ranking", {
      headers: { Origin: "https://pixelproto-x.github.io" },
    }),
    {
      FETCH: async (url) => {
        const value = String(url);
        if (value.endsWith("/tw/events/current")) {
          return new Response(JSON.stringify({
            event: { id: 5, pointRankingEnabled: false, totalRankingEnabled: true },
          }), { status: 200 });
        }
        if (value.endsWith("/tw/events/5/total/latest")) {
          return new Response(JSON.stringify({
            rows: [{ rank: 1, profileId: "1111111111111111111", scoreExact: "999999" }],
            stale: false,
          }), { status: 200 });
        }
        throw new Error("Unexpected upstream URL: " + value);
      },
    },
  );
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.status, "NOT_FOUND_TOP_100");
  assert.equal(body.scannedTo, 1);
});
