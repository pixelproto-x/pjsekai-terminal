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



test("auto-detects a unique region when every other region returns not found", async () => {
  const workerFetch = async (url) => {
    const parsed = new URL(url);
    const region = parsed.pathname.match(/\\/public\\/(jp|tw|en|kr|cn)\\//)?.[1]
      || (parsed.hostname === "api.hisekai.org" ? "tw" : null);
    if (region === "jp") {
      return Response.json({ userGamedata: { userName: "Test Player" } });
    }
    return new Response("not found", { status: 404 });
  };
  const response = await worker.fetch(new Request(
    "https://worker.test/api/auto/user/123456/profile",
    { headers: { Origin: "https://pixelproto-x.github.io" } },
  ), { FETCH: workerFetch });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.region, "jp");
  assert.equal(payload.uid, "123456");
});

test("does not guess when the same UID exists in multiple regions", async () => {
  const workerFetch = async (url) => {
    const parsed = new URL(url);
    const region = parsed.pathname.match(/\\/public\\/(jp|tw|en|kr|cn)\\//)?.[1]
      || (parsed.hostname === "api.hisekai.org" ? "tw" : null);
    if (region === "jp" || region === "tw") {
      return Response.json({ userGamedata: { userName: "Test Player" } });
    }
    return new Response("not found", { status: 404 });
  };
  const response = await worker.fetch(new Request(
    "https://worker.test/api/auto/user/123456/profile",
    { headers: { Origin: "https://pixelproto-x.github.io" } },
  ), { FETCH: workerFetch });
  assert.equal(response.status, 409);
  assert.deepEqual((await response.json()).regions, ["jp", "tw"]);
});
