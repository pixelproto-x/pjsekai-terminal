import assert from "node:assert/strict";
import { test } from "node:test";
import { createGameDatabaseClient, GAME_DATABASE_BUNDLES, REGION_REPOSITORIES } from "../../src/data/game-database.mjs";
import { calculateCardEventBonus, cardUnit, characterUnits } from "../../src/data/game-tools-logic.mjs";
test("regional game data has independent repositories",()=>{assert.equal(REGION_REPOSITORIES.tw,"sekai-master-db-tc-diff");assert.equal(REGION_REPOSITORIES.jp,"sekai-master-db-diff");assert.equal(Object.keys(REGION_REPOSITORIES).length,5)});
test("all batch three catalog and event data bundles are declared",()=>{for(const key of ["cards","characters","honors","events"])assert.ok(GAME_DATABASE_BUNDLES[key]);assert.ok(GAME_DATABASE_BUNDLES.events.includes("eventCards"));assert.ok(GAME_DATABASE_BUNDLES.events.includes("eventDeckBonuses"));assert.ok(GAME_DATABASE_BUNDLES.events.includes("gameCharacterUnits"));assert.ok(GAME_DATABASE_BUNDLES.cards.includes("gameCharacterUnits"));assert.ok(GAME_DATABASE_BUNDLES.score.includes("musics"));assert.ok(GAME_DATABASE_BUNDLES.score.includes("musicDifficulties"))});
test("database falls back to stale cache rather than another server",async()=>{const c=createGameDatabaseClient({cache:{get:async()=>({data:[{id:5}],savedAt:0}),set:async()=>true},fetchImpl:async()=>({ok:false,status:503}),now:()=>999999,ttl:1});const r=await c.loadDataset("tw","cards");assert.equal(r.source,"stale-cache");assert.equal(r.data[0].id,5)});

test("card event bonus uses the best matching character and attribute rule", () => {
  const rules = [
    { eventId: 9, gameCharacterUnitId: 1, cardAttr: "cool", bonusRate: 50 },
    { eventId: 9, gameCharacterUnitId: 1, bonusRate: 20 },
    { eventId: 9, cardAttr: "cool", bonusRate: 20 },
    { eventId: 8, gameCharacterUnitId: 1, cardAttr: "cool", bonusRate: 99 }
  ];
  const units = [{ id: 1, gameCharacterId: 1, unit: "light_sound" }];
  assert.equal(calculateCardEventBonus({ id: 2, characterId: 1, gameCharacterUnitId: 1, attr: "cool" }, 9, rules, units), 50);
  assert.equal(calculateCardEventBonus({ id: 3, characterId: 1, gameCharacterUnitId: 1, attr: "pure" }, 9, rules, units), 20);
  assert.equal(calculateCardEventBonus({ id: 4, characterId: 2, gameCharacterUnitId: 2, attr: "pure" }, 9, rules, units), 0);
  assert.equal(calculateCardEventBonus({ id: 2, characterId: 1, gameCharacterUnitId: 1, attr: "cool" }, 7, rules, units), null);
});
test("card unit helpers resolve unit variants without assuming one group per character", () => {
  const units = [
    { id: 1, gameCharacterId: 1, unit: "light_sound" },
    { id: 42, gameCharacterId: 21, unit: "light_sound" },
    { id: 43, gameCharacterId: 21, unit: "idol" }
  ];
  assert.equal(cardUnit({ characterId: 21, gameCharacterUnitId: 43 }, units), "idol");
  assert.deepEqual(characterUnits(21, units), ["light_sound", "idol"]);
});
