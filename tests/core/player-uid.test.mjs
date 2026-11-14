import test from "node:test";
import assert from "node:assert/strict";
import { normalizePlayerUid } from "../../src/core/player-uid.mjs";

test("normalizes whitespace around a numeric UID", () => {
  assert.equal(normalizePlayerUid(" 123456789 "), "123456789");
});

test("rejects an empty UID", () => {
  assert.throws(() => normalizePlayerUid(" "), { code: "UID_REQUIRED" });
});

test("rejects non-numeric UIDs", () => {
  assert.throws(() => normalizePlayerUid("12abc"), { code: "UID_INVALID" });
});
