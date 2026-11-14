import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

const request = (path, origin = "https://pixelproto-x.github.io") =>
  new Request("https://worker.example" + path, { headers: { Origin: origin } });

test("health endpoint lists all five supported regions", async () => {
  const response = await worker.fetch(request("/health"), {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok", regions: ["jp", "tw", "en", "kr", "cn"] });
  assert.equal(response.headers.get("access-control-allow-origin"), "https://pixelproto-x.github.io");
});

test("rejects unknown origins", async () => {
  const response = await worker.fetch(request("/health", "https://example.com"), {});
  assert.equal(response.status, 403);
});

test("rejects malformed UIDs before contacting upstreams", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return new Response("{}"); };
  try {
    const response = await worker.fetch(request("/api/tw/user/not-a-uid/profile"), {});
    assert.equal(response.status, 404);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test("rejects unsupported regions", async () => {
  const response = await worker.fetch(request("/api/xx/user/123456/profile"), {});
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "REGION_UNSUPPORTED");
});

for (const region of ["jp", "tw", "en", "kr", "cn"]) {
  test(`routes ${region} through the public Haruki fallback`, async (t) => {
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

    const response = await worker.fetch(request(`/api/${region}/user/123456/profile`), {});
    assert.equal(response.status, 200);
    if (region === "tw") {
      assert.match(requestedUrl, /^https:\/\/(suite-api\.haruki\.seiunx\.com\/public\/tw\/suite\/123456\?key=|api\.hisekai\.org\/tw\/user\/123456\/profile$)/);
    } else {
      assert.match(requestedUrl, new RegExp(`^https://suite-api\\.haruki\\.seiunx\\.com/public/${region}/suite/123456\\?key=`));
    }
    const body = await response.json();
    assert.equal(body.region, region);
    assert.equal(body.uid, "123456");
    assert.ok(["Haruki Public", "HiSekai"].includes(body.source));
  });
}

test("Taiwan falls back to HiSekai when the public Haruki endpoint fails", async (t) => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    if (String(url).startsWith("https://suite-api.haruki")) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify({ userGamedata: { userId: "123456", rank: 42 } }), { status: 200 });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const response = await worker.fetch(request("/api/tw/user/123456/profile"), {});
  assert.equal(response.status, 200);
  assert.equal((await response.json()).source, "HiSekai");
  assert.equal(requests.length, 2);
});

test("falls back to authenticated Haruki when public providers fail", async (t) => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), headers: options.headers });
    if (String(url).startsWith("https://suite-api.haruki") || String(url).startsWith("https://api.hisekai")) {
      return new Response("not found", { status: 404 });
    }
    return new Response(JSON.stringify({ userGamedata: { userId: "123456", rank: 42 } }), { status: 200 });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const response = await worker.fetch(request("/api/tw/user/123456/profile"), { HARUKI_TOKEN: "test-token" });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.source, "Haruki");
  assert.equal(body.data.userGamedata.rank, 42);
  assert.equal(requests.find((item) => item.url.includes("public-api.haruki"))?.headers["X-Haruki-Sekai-Token"], "test-token");
});

test("does not expose upstream credentials in the response", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true }), { status: 200 });
  t.after(() => { globalThis.fetch = originalFetch; });

  const response = await worker.fetch(request("/api/jp/user/123456/profile"), { HARUKI_TOKEN: "secret-token" });
  const body = await response.text();
  assert.equal(body.includes("secret-token"), false);
});
