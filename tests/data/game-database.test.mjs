import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GAME_DATABASE_BUNDLES,
  GAME_DATABASE_FILES,
  REGION_REPOSITORIES,
  createGameDatabaseClient
} from "../../src/data/game-database.mjs";

test("all five servers use their own Sekai Master DB repository", () => {
  assert.deepEqual(Object.keys(REGION_REPOSITORIES).sort(), ["cn", "en", "jp", "kr", "tw"]);
  assert.equal(REGION_REPOSITORIES.tw, "sekai-master-db-tc-diff");
  assert.equal(REGION_REPOSITORIES.jp, "sekai-master-db-diff");
  assert.equal(GAME_DATABASE_FILES.includes("cards"), true);
  assert.equal(GAME_DATABASE_FILES.includes("honors"), true);
});

test("bundle loads only the datasets required for that tool", async () => {
  const requested = [];
  const client = createGameDatabaseClient({
    cache: null,
    fetchImpl: async (url) => {
      requested.push(url);
      return { ok: true, json: async () => [{ id: requested.length }] };
    },
    now: () => 1000
  });

  const result = await client.loadBundle("tw", "characters");
  assert.deepEqual(Object.keys(result.datasets).sort(), ["characterProfiles", "gameCharacters"]);
  assert.equal(requested.length, 2);
  assert.ok(requested.every((url) => url.includes("sekai-master-db-tc-diff")));
  assert.deepEqual(result.warnings, []);
});

test("fresh cached data avoids a network request", async () => {
  let requests = 0;
  const client = createGameDatabaseClient({
    cache: { get: async () => ({ data: [{ id: 1 }], savedAt: 900 }), set: async () => true },
    fetchImpl: async () => { requests += 1; throw new Error("should not fetch"); },
    now: () => 1000,
    ttl: 500
  });

  const result = await client.loadDataset("jp", "gameCharacters");
  assert.equal(result.source, "cache");
  assert.equal(requests, 0);
});

test("stale cache is used when the upstream database is unavailable", async () => {
  const client = createGameDatabaseClient({
    cache: { get: async () => ({ data: [{ id: 7 }], savedAt: 100 }), set: async () => true },
    fetchImpl: async () => ({ ok: false, status: 503 }),
    now: () => 1000,
    ttl: 10
  });

  const result = await client.loadDataset("en", "cards");
  assert.equal(result.source, "stale-cache");
  assert.equal(result.data[0].id, 7);
  assert.match(result.warning, /503/);
});

test("invalid region, dataset and bundle are rejected instead of silently switching servers", async () => {
  const client = createGameDatabaseClient({ cache: null, fetchImpl: async () => ({ ok: true, json: async () => [] }) });
  await assert.rejects(client.loadDataset("xx", "cards"), /不支援的伺服器/);
  await assert.rejects(client.loadDataset("tw", "unknown"), /不支援的資料集/);
  await assert.rejects(client.loadBundle("tw", "unknown"), /不支援的資料組合/);
  assert.deepEqual(Object.keys(GAME_DATABASE_BUNDLES).sort(), ["cards", "characters", "events", "honors"]);
});

test("concurrent requests for the same region and dataset share one request", async () => {
  let requests = 0;
  const client = createGameDatabaseClient({
    cache: null,
    fetchImpl: async () => {
      requests += 1;
      await Promise.resolve();
      return { ok: true, json: async () => [{ id: 1 }] };
    }
  });

  const [first, second] = await Promise.all([
    client.loadDataset("kr", "cards"),
    client.loadDataset("kr", "cards")
  ]);
  assert.equal(requests, 1);
  assert.deepEqual(first.data, second.data);
});
