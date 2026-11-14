import test from "node:test";
import assert from "node:assert/strict";
import worker, { candidates, upstreamError } from "../src/index.js";

test("uses the public Haruki endpoint for all five regions", () => {
  for (const region of ["jp", "tw", "en", "kr", "cn"]) {
    const list = candidates(region, "123456", {});
    assert.equal(list[0].name, "Haruki Public");
    assert.match(list[0].url, new RegExp(`/public/${region}/suite/123456\\?`));
  }
});

test("adds HiSekai only as a Taiwan fallback", () => {
  assert.deepEqual(candidates("tw", "123", {}).map((item) => item.name), [
    "Haruki Public", "HiSekai",
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

test("does not pretend CN event rankings are supported by the provider", async () => {
  const response = await worker.fetch(
    new Request("https://worker.example/api/cn/user/123456/event-ranking", {
      headers: { Origin: "https://pixelproto-x.github.io" },
    }),
    { FETCH: async () => { throw new Error("must not call upstream"); } },
  );
  assert.equal(response.status, 501);
  assert.equal((await response.json()).error, "EVENT_RANKING_UNSUPPORTED");
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
