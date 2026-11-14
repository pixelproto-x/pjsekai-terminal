import test from "node:test";
import assert from "node:assert/strict";
import { createProviderRegistry } from "../../src/core/provider-registry.mjs";

test("resolves only declared region and capability pairs", () => {
  const registry = createProviderRegistry();
  registry.register({
    id: "public-global",
    regions: ["global"],
    capabilities: { playerProfile: true, playRecords: false },
  });
  assert.equal(registry.resolve({ region: "global", capability: "playerProfile" }).length, 1);
  assert.throws(
    () => registry.resolve({ region: "global", capability: "playRecords" }),
    { code: "SOURCE_UNAVAILABLE" },
  );
});

test("rejects duplicate provider IDs", () => {
  const registry = createProviderRegistry();
  const provider = { id: "one", regions: ["global"], capabilities: {} };
  registry.register(provider);
  assert.throws(() => registry.register(provider), { code: "PROVIDER_DUPLICATE" });
});
