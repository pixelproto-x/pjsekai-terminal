import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../../index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../../redesign-6th.css", import.meta.url), "utf8");
const themes = await readFile(new URL("../../sekai-themes.css", import.meta.url), "utf8");
const lookup = await readFile(new URL("../../player-lookup.js", import.meta.url), "utf8");
const shell = await readFile(new URL("../../app-shell.js", import.meta.url), "utf8");

assert.match(html, /redesign-6th\.css/, "sixth anniversary UI stylesheet remains linked");
assert.match(html, /class="anniversary-hero"/, "sixth anniversary hero remains");
assert.match(html, /id="homePlayerLookup"/, "homepage UID lookup remains");
assert.match(html, /id="playerLookupForm"/, "dedicated player lookup page remains");
assert.match(html, /data-page="settings"/, "appearance settings remain");
for (const theme of ["virtual-singer","leo-need","more-more-jump","vivid-bad-squad","wonderlands-showtime","nightcord"]) {
  assert.match(html, new RegExp('data-theme="' + theme + '"'), theme + " theme control remains");
  assert.match(themes, new RegExp('data-sekai-theme="' + theme + '"'), theme + " has its own visual system");
}
assert.match(html, /sekai-themes\.css/, "six-unit theme stylesheet is linked");
assert.doesNotMatch(themes, /colorfulstage\.com|pjsekai\.sega\.jp/, "unit themes use original CSS artwork rather than embedded downloadable wallpaper assets");
assert.match(html, /class="bottom-bar"/, "bottom navigation remains");
assert.match(html, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/, "bottom navigation has one grid column per visible tab");
assert.match(shell, /function syncTabIndicator\(\)/, "bottom selection bubble is positioned from the active tab");
assert.match(shell, /tabIndicator\.style\.setProperty\("--tab-left"/, "bottom selection bubble receives its horizontal position");
assert.match(html, /pointer-events:auto;touch-action:none;cursor:grab/, "selection bubble accepts pointer and touch dragging");
assert.match(shell, /bottomBar\.addEventListener\("pointerdown"/, "navigation container receives pointer down over the selection bubble");
assert.match(shell, /bottomBar\.setPointerCapture\(event\.pointerId\)/, "drag keeps receiving pointer movement outside the bubble");
assert.match(shell, /bottomBar\.addEventListener\("pointermove"/, "selection bubble follows captured pointer movement");
assert.match(shell, /finishIndicatorDrag\(event, true\)/, "releasing dragged bubble selects the nearest tab");

assert.match(html, /transition:left var\(--tab-duration\).*width var\(--tab-duration\)/, "bottom selection bubble smoothly animates its position and width");
assert.match(shell, /addEventListener\("resize", syncTabIndicator/, "bottom selection bubble realigns after viewport resizing");
const routes = [...html.matchAll(/<section class="page[^"]*" data-page="([^"]+)"/g)].map((match) => match[1]);
assert.deepEqual(routes.sort(), ["home", "profile", "settings", "songs"], "four intended page sections remain");
assert.doesNotMatch(html, /dojo-controls\.js|event-calc\.js|chart-analyzer\.js|my-sekai\.js|system-settings\.js|home-hub\.js/, "legacy feature scripts are not loaded");
assert.match(lookup, /createCloudflarePlayerProvider/, "five-region public UID provider is connected");
assert.match(lookup, /const region = "auto"/, "player UID lookup automatically checks the supported regions");
assert.match(html, /自動檢查日服 台服 國際服 韓服 簡中服五個伺服器/, "homepage explains automatic five-region lookup");
assert.doesNotMatch(html, /id="homePlayerRegion"|id="playerRegion"/, "player lookup does not require manual region selection");
assert.match(html, /id="songRegion"/, "song manager keeps its independent server selector");
assert.match(html, /@supports \(appearance:base-select\)/, "song server selector enables the customizable CSS picker where supported");
assert.match(html, /::picker\(select\)/, "song server dropdown popup has its own CSS styling");
assert.match(html, /option:checked/, "selected song server has a custom highlighted state");
assert.match(html, /position-area:block-end span-inline/, "song server dropdown is anchored directly below its selector");
assert.match(html, /min-width:160px/, "song server dropdown remains wide enough for full server labels");
for (const [region, label] of [["jp","日服"],["tw","台服"],["en","國際服"],["kr","韓服"],["cn","簡中服"]]) {
  assert.match(html, new RegExp(`<option value="${region}"[^>]*>[^<]*${label}</option>`), `${label} song data is selectable`);
}
for (const region of ["jp", "en", "tw", "kr", "cn"]) {
  assert.match(html, new RegExp(`id="songRegion"[\\s\\S]*?<option value="${region}"`), region + " song database can be selected");
}
assert.match(lookup, /REQUEST_TIMEOUT/, "lookup timeout is handled");
assert.match(shell, /applyTheme/, "theme switching is functional");
assert.match(shell, /virtual-singer/, "Virtual Singer is the default theme");
assert.match(css, /img_kv_miku_pc\.webp/, "official sixth anniversary key visual remains");
assert.match(css, /@media\(max-width:640px\)/, "mobile layout remains");
assert.match(css, /prefers-reduced-motion/, "reduced motion is respected");

assert.equal(routes.length, 4, "home, player lookup, song management, and appearance settings remain");
console.log("Minimal player hub UI smoke tests passed.");

const visibleText = html
  .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
  .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&[^;]+;/g, " ")
  .replace(/\s+/g, " ")
  .trim();
assert.doesNotMatch(visibleText, /[，。！？：；、·↗♫✦♪‹％%]/, "visible interface copy has no decorative punctuation or symbols");
assert.doesNotMatch(visibleText, /PLAYER HUB|PLAYER SEARCH|PUBLIC PLAYER DATA|DISPLAY SETTINGS|AFTER THE END|BLUE HORIZON|IDOL BLOOM|STREET BEAT|Fan-made project/, "template-like labels are removed");
for (const theme of ["virtual-singer","leo-need","more-more-jump","vivid-bad-squad","wonderlands-showtime","nightcord"]) {
  assert.match(themes, new RegExp('body\\[data-sekai-theme="' + theme + '"\\]'), theme + " has a dedicated visual design");
}
assert.match(themes, /--unit-scene/);
assert.match(themes, /--unit-pattern/);
assert.match(themes, /--unit-panel:rgba\(244,251,255,var\(--sub-glass-opacity\)\)/, "base theme glass opacity follows the live slider");
assert.match(themes, /--unit-shell:rgba\(236,247,255,var\(--shell-opacity\)\)/, "base theme shell opacity follows the live slider");
assert.match(themes, /--unit-panel-strong:rgba\(250,253,255,min\(1,calc\(var\(--glass-opacity\) \+ .55\)\)\)/, "strong theme glass opacity follows the live slider");
assert.equal((themes.match(/--unit-panel:rgba\([^;]+var\(--sub-glass-opacity\)/g) || []).length, 7, "base theme and six unit themes use the live panel opacity");
assert.equal((themes.match(/--unit-shell:rgba\([^;]+var\(--shell-opacity\)/g) || []).length, 7, "base theme and six unit themes use the live shell opacity");
assert.match(themes, /--unit-panel:rgba\(244,251,255,var\(--sub-glass-opacity\)\)/, "glass panels remain visibly translucent");
assert.match(themes, /--unit-shell:rgba\(236,247,255,var\(--shell-opacity\)\)/, "main shell keeps visible background transparency");
assert.match(themes, /--unit-panel-strong:rgba\(250,253,255,min\(1,calc\(var\(--glass-opacity\) \+ .55\)\)\)/, "strong glass surfaces retain transparency");
assert.ok(html.includes("#toast.toast{") && html.includes("var(--unit-accent,#52cfe8)"), "success toast follows the active unit accent");
assert.ok(html.includes("background-color:#fff!important") && html.includes("color:#181a22!important"), "success toast keeps readable contrast");
assert.ok(html.includes("color:#181a22!important"), "success toast text remains readable");
assert.match(themes, /\.sekai-ambience\{z-index:0\}/, "unit-specific background is above the body canvas");
assert.match(themes, /\.app-shell\{position:relative;z-index:1\}/, "application surfaces remain above the unit background");
assert.doesNotMatch(lookup, /查詢成功。|查詢失敗：|UID 格式錯誤，/);

assert.match(themes, /\.bottom-bar \.tab-indicator\{z-index:0\}/, "selection bubble stays behind navigation labels");
assert.match(themes, /\.bottom-bar \.tab\{position:relative;z-index:1\}/, "navigation labels render above the selection bubble");

assert.match(lookup, /pjskPlayerLookupCacheV3/, "player profile data is cached across refreshes");
assert.match(lookup, /已還原上次查詢資料/, "cached player results render before background refresh");
assert.match(lookup, /saveLookupCache\(uid, region, result\)/, "successful player profile results are persisted");
