import test from "node:test";
import assert from "node:assert/strict";
import { createCache } from "../../src/core/cache.mjs";

function memoryStorage() {
  const data = new Map();
  return {
    get length() { return data.size; },
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
    key: (index) => [...data.keys()][index] ?? null,
  };
}

test("stores values until their TTL expires", () => {
  let now = 100;
  const cache = createCache({ storage: memoryStorage(), now: () => now });
  cache.set("profile:123", { name: "player" }, 50);
  assert.deepEqual(cache.get("profile:123"), { name: "player" });
  now = 151;
  assert.equal(cache.get("profile:123"), null);
});

test("removes one key and clears only its namespace", () => {
  const storage = memoryStorage();
  const cache = createCache({ storage, namespace: "test" });
  cache.set("a", 1, 1000);
  storage.setItem("other:1:x", JSON.stringify({ value: 2, expiresAt: 9999999999999 }));
  cache.remove("a");
  assert.equal(cache.get("a"), null);
  cache.set("b", 2, 1000);
  cache.clear();
  assert.equal(cache.get("b"), null);
  assert.notEqual(storage.getItem("other:1:x"), null);
});

test("rejects non-positive TTLs", () => {
  const cache = createCache({ storage: null });
  assert.throws(() => cache.set("x", 1, 0), TypeError);
});
