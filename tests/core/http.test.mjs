import test from "node:test";
import assert from "node:assert/strict";
import { fetchJson } from "../../src/core/http.mjs";

test("fetches JSON and sends an Accept header", async () => {
  let request;
  const result = await fetchJson("https://example.test/data", {
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ ok: true }) };
    },
  });
  assert.deepEqual(result, { ok: true });
  assert.equal(request.options.headers.Accept, "application/json");
});

test("surfaces upstream HTTP status and retryability", async () => {
  await assert.rejects(
    fetchJson("https://example.test/data", {
      fetchImpl: async () => ({ ok: false, status: 429 }),
    }),
    (error) => error.code === "UPSTREAM_HTTP_ERROR" && error.retryable,
  );
});

test("rejects non-HTTP protocols", async () => {
  await assert.rejects(
    fetchJson("file:///private/data.json", { fetchImpl: async () => ({}) }),
    { code: "URL_PROTOCOL_UNSUPPORTED" },
  );
});
