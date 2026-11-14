import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../redesign-6th.css", import.meta.url), "utf8");

assert.match(html, /href="redesign-6th\.css\?v=1"/, "redesign stylesheet is linked");
assert.match(html, /class="anniversary-hero"/, "anniversary hero exists");
assert.match(html, /data-go="profile"/, "player profile navigation remains available");
assert.match(html, /data-go="songs"/, "song navigation remains available");
assert.match(html, /id="globalSearchBtn"/, "global search trigger remains available");
assert.match(html, /class="bottom-bar"/, "bottom navigation remains available");
assert.match(html, /src="my-sekai\.js"/, "My SEKAI module remains loaded");
assert.match(html, /src="dojo-controls\.js"/, "Dojo module remains loaded");
assert.match(html, /src="event-calc\.js"/, "event calculator remains loaded");
assert.match(html, /src="chart-analyzer\.js/, "chart analyzer remains loaded");

assert.match(css, /img_kv_miku_pc\.webp/, "official 6th anniversary key visual is used");
assert.match(css, /@media\(max-width:640px\)/, "mobile layout rules exist");
assert.match(css, /prefers-reduced-motion/, "reduced-motion preference is respected");

const pageCount = (html.match(/data-page="/g) ?? []).length;
assert.ok(pageCount >= 8, "existing page sections have not been removed");
console.log("UI redesign smoke tests passed.");
