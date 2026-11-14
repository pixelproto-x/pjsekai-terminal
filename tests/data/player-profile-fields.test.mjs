import test from "node:test";
import assert from "node:assert/strict";
import { extractPlayerIdentity } from "../../src/data/player-profile-fields.mjs";

test("reads player name and account rank from userGamedata", () => {
  const result = extractPlayerIdentity({
    userGamedata: { userId: "123456", name: "測試玩家", rank: 245 },
    userDecks: [{ name: "主隊", rank: 88, level: 60 }],
    userCharacters: [{ characterRank: 70 }],
  }, "123456");

  assert.deepEqual(result, {
    name: "測試玩家",
    uid: "123456",
    level: 245,
  });
});

test("does not mistake nested card or character levels for player rank", () => {
  const result = extractPlayerIdentity({
    userGamedata: { userId: "987654", name: "玩家", rank: 120 },
    userDecks: [{ level: 60 }],
    userCharacters: [{ rank: 50 }],
  }, "987654");

  assert.equal(result.level, 120);
});

test("supports a profile-shaped fallback without userGamedata", () => {
  const result = extractPlayerIdentity({
    user: { userId: "456", name: "Profile 玩家", rank: 42 },
  }, "456");

  assert.equal(result.name, "Profile 玩家");
  assert.equal(result.level, 42);
});

test("uses UID fallback and explicit missing-name label", () => {
  const result = extractPlayerIdentity({ userGamedata: { rank: 10 } }, "321");

  assert.equal(result.name, "未提供名稱");
  assert.equal(result.uid, "321");
  assert.equal(result.level, 10);
});
