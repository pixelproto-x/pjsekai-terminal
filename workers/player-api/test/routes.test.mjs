import test from "node:test";
import assert from "node:assert/strict";
import { ALLOWED_ORIGIN, REGIONS, parseProfilePath } from "../src/routes.mjs";

test("allows only the published website origin", () => {
  assert.equal(ALLOWED_ORIGIN, "https://pixelproto-x.github.io");
});

test("lists all five supported regions", () => {
  assert.deepEqual(REGIONS, ["jp", "tw", "en", "kr", "cn"]);
});

test("parses all five public profile routes", () => {
  for (const region of REGIONS) {
    assert.deepEqual(
      parseProfilePath(`/api/${region}/user/123456/profile`),
      { region, uid: "123456" },
    );
  }
});

test("rejects malformed UIDs, unknown regions, and arbitrary paths", () => {
  assert.equal(parseProfilePath("/api/tw/user/not-a-uid/profile"), null);
  assert.equal(parseProfilePath("/api/xx/user/123456/profile"), null);
  assert.equal(parseProfilePath("/internal/accounts"), null);
  assert.equal(parseProfilePath("/api/tw/123456/profile"), null);
});


test("does not expose the removed event-ranking route", () => {
  assert.equal(parseProfilePath("/api/tw/user/123456/event-ranking"), null);
});
