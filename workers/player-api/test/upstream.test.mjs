import test from "node:test";
import assert from "node:assert/strict";
import worker, { candidates, upstreamError } from "../src/index.js";

test("uses the public Haruki endpoint for all five regions", () => {
  for (const region of ["jp", "tw", "en", "kr", "cn"]) {
    const list = candidates(region, "123456", {});
    const haruki = list.find((item) => item.name === "Haruki Public");
    assert.ok(haruki);
    assert.match(haruki.url, new RegExp(`/public/${region}/suite/123456\\?`));
  }
});

test("adds HiSekai only as a Taiwan fallback", () => {
  assert.deepEqual(candidates("tw", "123", {}).map((item) => item.name), [
    "HiSekai", "Haruki Public",
  ]);
  assert.deepEqual(candidates("jp", "123", {}).map((item) => item.name), [
    "Haruki Public",
  ]);
});

test("uses optional provider credentials only when present", () => {
  const list = candidates("jp", "123", {
    HARUKI_TOKEN: "configured",
    MOE_TOKEN: "configured",
  });
  assert.deepEqual(list.map((item) => item.name), [
    "Haruki Public", "Haruki", "Exmeaning",
  ]);
});

test("maps upstream statuses to useful public errors", () => {
  assert.equal(upstreamError([404, 502], "tw").status, 404);
  assert.equal(upstreamError([403, 502], "jp").status, 403);
  assert.equal(upstreamError([429], "en").status, 429);
  assert.equal(upstreamError([502], "kr").status, 502);
});

