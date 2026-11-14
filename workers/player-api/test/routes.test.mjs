import test from "node:test";
import assert from "node:assert/strict";
import { ALLOWED_ORIGIN, REGIONS, mapPublicPath } from "../src/routes.mjs";

test("allows only the published website origin", () => {
  assert.equal(ALLOWED_ORIGIN, "https://pixelproto-x.github.io");
});

test("lists all five supported regions", () => {
  assert.deepEqual(REGIONS, ["jp", "tw", "en", "kr", "cn"]);
});

test("maps the public profile route to the current Haruki v6 route", () => {
  for (const region of REGIONS) {
    assert.equal(
      mapPublicPath(`/api/${region}/user/123456/profile`),
      `/api/${region}/123456/profile`,
    );
  }
});

test("keeps the health route", () => {
  assert.equal(mapPublicPath("/health"), "/health");
});

test("rejects malformed UIDs, unknown regions, and arbitrary paths", () => {
  assert.equal(mapPublicPath("/api/tw/user/not-a-uid/profile"), null);
  assert.equal(mapPublicPath("/api/xx/user/123456/profile"), null);
  assert.equal(mapPublicPath("/internal/accounts"), null);
  assert.equal(mapPublicPath("/api/tw/123456/profile"), null);
});
