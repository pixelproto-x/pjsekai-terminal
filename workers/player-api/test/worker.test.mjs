import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

const request = (path, origin = "https://pixelproto-x.github.io") =>
  new Request("https://worker.example" + path, { headers: { Origin: origin } });

test("health endpoint returns ok for the website origin", async () => {
  const response = await worker.fetch(request("/health"), {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
  assert.equal(response.headers.get("access-control-allow-origin"), "https://pixelproto-x.github.io");
});

test("rejects unknown origins", async () => {
  const response = await worker.fetch(request("/health", "https://example.com"), {});
  assert.equal(response.status, 403);
});

test("rejects malformed UIDs before contacting upstreams", async () => {
  const response = await worker.fetch(request("/api/tw/user/not-a-uid/profile"), {});
  assert.equal(response.status, 404);
});

test("reports an explicit configuration error when no upstream is configured", async () => {
  const response = await worker.fetch(request("/api/jp/user/123456/profile"), {});
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "SOURCE_NOT_CONFIGURED");
});

test("uses the documented Taiwan HiSekai endpoint without an API token", async (t) => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({ userGamedata: { userId: "123456", rank: 10 } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const response = await worker.fetch(request("/api/tw/user/123456/profile"), {});
  assert.equal(response.status, 200);
  assert.match(requestedUrl, /^https:\/\/api\.hisekai\.org\/tw\/user\/123456\/profile$/);
  const body = await response.json();
  assert.equal(body.source, "HiSekai");
  assert.equal(body.uid, "123456");
});
