import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../../index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../../redesign-6th.css", import.meta.url), "utf8");
const lookup = await readFile(new URL("../../player-lookup.js", import.meta.url), "utf8");
const shell = await readFile(new URL("../../app-shell.js", import.meta.url), "utf8");

assert.match(html, /redesign-6th\.css/, "sixth anniversary UI stylesheet remains linked");
assert.match(html, /class="anniversary-hero"/, "sixth anniversary hero remains");
assert.match(html, /id="homePlayerLookup"/, "homepage UID lookup remains");
assert.match(html, /id="playerLookupForm"/, "dedicated player lookup page remains");
assert.match(html, /data-page="settings"/, "appearance settings remain");
assert.match(html, /data-theme="virtual"/, "SEKAI themes remain");
assert.match(html, /class="bottom-bar"/, "bottom navigation remains");
assert.match(html, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/, "bottom navigation has one grid column per visible tab");
assert.match(shell, /function syncTabIndicator\(\)/, "bottom selection bubble is positioned from the active tab");
assert.match(shell, /tabIndicator\.style\.setProperty\("--tab-left"/, "bottom selection bubble receives its horizontal position");
assert.match(html, /transition:left var\(--tab-duration\).*width var\(--tab-duration\)/, "bottom selection bubble smoothly animates its position and width");
assert.match(shell, /addEventListener\("resize", syncTabIndicator/, "bottom selection bubble realigns after viewport resizing");
const routes = [...html.matchAll(/<section class="page[^"]*" data-page="([^"]+)"/g)].map((match) => match[1]);
assert.deepEqual(routes.sort(), ["home", "profile", "settings"], "only the intended three page sections remain");
assert.doesNotMatch(html, /dojo-controls\.js|event-calc\.js|chart-analyzer\.js|my-sekai\.js|system-settings\.js|home-hub\.js/, "legacy feature scripts are not loaded");
assert.match(lookup, /createHiSekaiPlayerProvider/, "public UID provider is connected");
assert.match(lookup, /REQUEST_TIMEOUT/, "lookup timeout is handled");
assert.match(shell, /applyTheme/, "theme switching is functional");
assert.match(css, /img_kv_miku_pc\.webp/, "official sixth anniversary key visual remains");
assert.match(css, /@media\(max-width:640px\)/, "mobile layout remains");
assert.match(css, /prefers-reduced-motion/, "reduced motion is respected");

assert.equal(routes.length, 3, "only home, player lookup, and appearance settings remain");
console.log("Minimal player hub UI smoke tests passed.");
