import test from "node:test";
import assert from "node:assert/strict";
import { REGION_LABELS } from "../../src/data/regions.mjs";

test("region labels match the five supported game servers", () => {
  assert.deepEqual(REGION_LABELS, {
    jp: "日服",
    tw: "台服",
    en: "國際服",
    kr: "韓服",
    cn: "簡中服",
  });
});
