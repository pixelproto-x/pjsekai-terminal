import test from "node:test";
import assert from "node:assert/strict";
import { createHarukiPlayerProvider, REGION_LABELS } from "../../src/data/haruki-player.mjs";
import { createCache } from "../../src/core/cache.mjs";

const jsonResponse = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
});

test("Haruki provider exposes all five supported server regions", () => {
  const provider = createHarukiPlayerProvider({ cache: createCache({ storage: null }) });
  assert.deepEqual(provider.regions, ["jp", "en", "tw", "kr", "cn"]);
  assert.deepEqual(Object.keys(REGION_LABELS), ["jp", "en", "tw", "kr", "cn"]);
});

test("Haruki provider requests the selected region for player data", async () => {
  const requested = [];
  const provider = createHarukiPlayerProvider({
    fetchImpl: async (url) => {
      requested.push(url);
      return jsonResponse({ userGamedata: { name: "test", userId: 123 }, userDecks: [] });
    },
    cache: createCache({ storage: null }),
    now: () => 0,
  });
  for (const region of ["jp", "en", "tw", "kr", "cn"]) {
    const result = await provider.getProfile("123", region);
    assert.equal(result.region, region);
    assert.equal(result.source, "Haruki Public API");
    assert.equal(result.uid, "123");
  }
  assert.deepEqual(requested.map((url) => new URL(url).pathname), [
    "/public/jp/suite/123", "/public/en/suite/123", "/public/tw/suite/123",
    "/public/kr/suite/123", "/public/cn/suite/123",
  ]);
  assert.ok(requested.every((url) => new URL(url).searchParams.get("key").includes("userGamedata")));
});

test("Haruki cache is separated by region", async () => {
  let calls = 0;
  const provider = createHarukiPlayerProvider({
    fetchImpl: async () => { calls += 1; return jsonResponse({ userGamedata: { userId: 123 } }); },
    cache: createCache({ storage: null }),
  });
  const first = await provider.getProfile("123", "tw");
  const second = await provider.getProfile("123", "tw");
  const otherRegion = await provider.getProfile("123", "jp");
  assert.equal(calls, 2);
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.equal(otherRegion.cached, false);
});

test("Haruki provider rejects invalid UIDs and unsupported regions before requesting", async () => {
  let calls = 0;
  const provider = createHarukiPlayerProvider({
    fetchImpl: async () => { calls += 1; return jsonResponse({}); },
    cache: createCache({ storage: null }),
  });
  await assert.rejects(provider.getProfile("12abc", "tw"), { code: "UID_INVALID" });
  await assert.rejects(provider.getProfile("123", "us"), { code: "REGION_UNSUPPORTED" });
  assert.equal(calls, 0);
});

test("Haruki provider surfaces non-public player responses", async () => {
  const provider = createHarukiPlayerProvider({
    fetchImpl: async () => jsonResponse({ message: "not public" }, 403),
    cache: createCache({ storage: null }),
  });
  await assert.rejects(provider.getProfile("123", "tw"), (error) => {
    assert.equal(error.code, "UPSTREAM_HTTP_ERROR");
    assert.equal(error.details.status, 403);
    return true;
  });
});
