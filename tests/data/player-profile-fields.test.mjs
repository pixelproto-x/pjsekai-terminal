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

import { extractPlayerRanking } from "../../src/data/player-profile-fields.mjs";

test("reads explicit player ranking fields without mistaking character ranks", () => {
  assert.equal(extractPlayerRanking({
    userGamedata: { rank: 245, playerRank: 18 },
    userCharacters: [{ rank: 99 }],
  }), 18);
  assert.equal(extractPlayerRanking({
    userGamedata: { rank: 245 },
    userCharacters: [{ rank: 99 }],
  }), null);
});

test("supports ranking fields on a profile object", () => {
  assert.equal(extractPlayerRanking({
    userProfile: { rankingPosition: 321 },
  }), 321);
});


import { extractPlayerPower } from "../../src/data/player-profile-fields.mjs";

test("extracts the published combined power from profile fields", () => {
  assert.equal(extractPlayerPower({
    userGamedata: { rank: 245, totalPower: 287654 },
  }), 287654);
});

test("falls back to a deck's published total without summing card stats", () => {
  assert.equal(extractPlayerPower({
    userGamedata: { rank: 245 },
    userDecks: [{ deckId: 1, teamPower: 198765 }],
    userCharacters: [{ power: 999999 }],
  }), 198765);
});

test("does not mistake character or card power for combined power", () => {
  assert.equal(extractPlayerPower({
    userGamedata: { rank: 245 },
    userCharacters: [{ power: 999999 }],
    userCards: [{ power: 888888 }],
  }), null);
});
