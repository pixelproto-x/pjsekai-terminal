import test from "node:test";
import assert from "node:assert/strict";
import { createCloudflarePlayerProvider, CLOUDFLARE_PLAYER_API } from "../../src/data/cloudflare-player.mjs";
import { createCache } from "../../src/core/cache.mjs";

const jsonResponse = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
});

test("Cloudflare provider requests the deployed Taiwan Worker endpoint", async () => {
  let requested = "";
  const provider = createCloudflarePlayerProvider({
    fetchImpl: async (url) => {
      requested = url;
      return jsonResponse({
        data: { user: { userId: "123", level: 42 } },
        uid: "123",
        region: "tw",
        source: "HiSekai",
        fetchedAt: "2026-11-14T00:00:00.000Z",
      });
    },
    cache: createCache({ storage: null }),
    now: () => 0,
  });

  const result = await provider.getProfile(" 123 ", "tw");
  assert.equal(requested, CLOUDFLARE_PLAYER_API + "/api/tw/user/123/profile");
  assert.equal(result.uid, "123");
  assert.equal(result.region, "tw");
  assert.equal(result.source, "HiSekai");
  assert.equal(result.cached, false);
  assert.equal(result.data.user.level, 42);
});

test("Cloudflare provider caches successful responses", async () => {
  let calls = 0;
  const provider = createCloudflarePlayerProvider({
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse({ data: { userId: "456" }, uid: "456", region: "tw" });
    },
    cache: createCache({ storage: null }),
    now: () => 1000,
  });

  const first = await provider.getProfile("456", "tw");
  const second = await provider.getProfile("456", "tw");
  assert.equal(calls, 1);
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.deepEqual(second.data, first.data);
});

test("Cloudflare provider rejects malformed UIDs before making a request", async () => {
  let calls = 0;
  const provider = createCloudflarePlayerProvider({
    fetchImpl: async () => { calls += 1; return jsonResponse({}); },
    cache: createCache({ storage: null }),
  });

  await assert.rejects(provider.getProfile("12abc", "tw"), { code: "UID_INVALID" });
  assert.equal(calls, 0);
});

test("Cloudflare provider rejects unsupported regions", async () => {
  const provider = createCloudflarePlayerProvider({
    fetchImpl: async () => jsonResponse({}),
    cache: createCache({ storage: null }),
  });

  await assert.rejects(provider.getProfile("123", "xx"), { code: "REGION_UNSUPPORTED" });
});
