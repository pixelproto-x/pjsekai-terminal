import test from "node:test";
import assert from "node:assert/strict";
import { createHiSekaiPlayerProvider } from "../../src/data/hisekai-player.mjs";
import { createCache } from "../../src/core/cache.mjs";

const jsonResponse = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
});

test("Hi Sekai provider requests the Taiwan public profile endpoint", async () => {
  let requested = "";
  const provider = createHiSekaiPlayerProvider({
    fetchImpl: async (url) => {
      requested = url;
      return jsonResponse({ user: { userId: "123", level: 42 }, team: [] });
    },
    cache: createCache({ storage: null }),
    now: () => 0,
  });

  const result = await provider.getProfile(" 123 ");
  assert.equal(requested, "https://api.hisekai.org/tw/user/123/profile");
  assert.equal(result.uid, "123");
  assert.equal(result.region, "tw");
  assert.equal(result.source, "Hi Sekai");
  assert.equal(result.cached, false);
  assert.equal(result.data.user.level, 42);
});

test("Hi Sekai provider caches successful responses", async () => {
  let calls = 0;
  const provider = createHiSekaiPlayerProvider({
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse({ userId: "456" });
    },
    cache: createCache({ storage: null }),
    now: () => 1000,
  });

  const first = await provider.getProfile("456");
  const second = await provider.getProfile("456");
  assert.equal(calls, 1);
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.deepEqual(second.data, first.data);
});

test("Hi Sekai provider rejects malformed UIDs before making a request", async () => {
  let calls = 0;
  const provider = createHiSekaiPlayerProvider({
    fetchImpl: async () => { calls += 1; return jsonResponse({}); },
    cache: createCache({ storage: null }),
  });

  await assert.rejects(provider.getProfile("12abc"), { code: "UID_INVALID" });
  assert.equal(calls, 0);
});

test("Hi Sekai provider surfaces upstream HTTP failures", async () => {
  const provider = createHiSekaiPlayerProvider({
    fetchImpl: async () => jsonResponse({ message: "rate limited" }, 429),
    cache: createCache({ storage: null }),
  });

  await assert.rejects(provider.getProfile("789"), { code: "UPSTREAM_HTTP_ERROR" });
});
