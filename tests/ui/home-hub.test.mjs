import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, css, script] = await Promise.all([
  readFile(new URL("../../index.html", import.meta.url), "utf8"),
  readFile(new URL("../../redesign-6th.css", import.meta.url), "utf8"),
  readFile(new URL("../../home-hub.js", import.meta.url), "utf8")
]);

test("homepage exposes an accessible Taiwan player UID lookup", () => {
  assert.match(html, /id="homePlayerLookup"/);
  assert.match(html, /id="homePlayerUid"/);
  assert.match(html, /aria-describedby="homePlayerHint"/);
  assert.match(html, /id="mskPlayerId"/);
  assert.match(html, /id="mskLoadPlayer"/);
  assert.match(script, /profileInput\.value = playerId/);
  assert.match(script, /loadButton\.click\(\)/);
});

test("homepage shortcuts navigate to existing feature pages", () => {
  for (const page of ["songs", "cards", "events", "characters"]) {
    assert.match(html, new RegExp('data-go="' + page + '"'));
  }
});

test("player hub layout has tablet and mobile breakpoints", () => {
  assert.match(css, /@media\(max-width:980px\)/);
  assert.match(css, /@media\(max-width:640px\)/);
  assert.match(css, /@media\(max-width:380px\)/);
});
