import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../../index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../../redesign-6th.css", import.meta.url), "utf8");
const app = await readFile(new URL("../../app-shell.js", import.meta.url), "utf8");
const themes = await readFile(new URL("../../sekai-themes.css", import.meta.url), "utf8");
const lookup = await readFile(new URL("../../player-lookup.js", import.meta.url), "utf8");
const shell = await readFile(new URL("../../app-shell.js", import.meta.url), "utf8");

assert.match(html, /redesign-6th\.css/, "sixth anniversary UI stylesheet remains linked");
assert.match(html, /class="anniversary-hero"/, "sixth anniversary hero remains");
assert.match(html, /id="homePlayerLookup"/, "homepage UID lookup remains");
assert.match(html, /id="playerLookupForm"/, "dedicated player lookup page remains");
assert.match(html, /data-page="settings"/, "appearance settings remain");
assert.match(html, /<div class="player-results" id="playerLookupResults"[\s\S]*?<\/section>\s*<\/section>\s*<section class="page" data-page="settings">/, "appearance settings are a top-level page, not nested inside player lookup");
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
assert.match(shell, /chevron\.textContent = "⌃"/, "song server picker points upward while closed");
assert.match(shell, /menu\.showPopover\(\)/, "song server picker uses the browser top layer when opened");
assert.match(shell, /menu\.hidePopover\(\)/, "song server picker leaves the browser top layer when closed");
assert.match(shell, /positionServerPickerMenu\(wrapper\)/, "song server picker is positioned against its trigger");
const songsCss = await readFile(new URL("../../songs.css", import.meta.url), "utf8");
assert.match(songsCss, /songs-toolbar select::picker\(select\)/, "song difficulty, level, and sort dropdowns have styled popups");
assert.match(songsCss, /song-record select::picker\(select\)/, "song record dropdowns have styled popups");
assert.match(songsCss, /:open::picker-icon/, "song dropdown arrows animate when opened");
assert.match(songsCss, /server-picker-open/, "song server dropdown has an opening animation");
assert.match(songsCss, /server-picker-close/, "song server dropdown has a closing animation");
assert.match(shell, /applyTheme/, "theme switching is functional");
assert.match(shell, /virtual-singer/, "Virtual Singer is the default theme");
assert.match(html, /id="anniversaryCoverSelect"/, "six anniversary cover choices are available");
for (const year of ["1","2","3","4","5","6"]) {
  assert.match(html, new RegExp('<option value="' + year + '"'), year + " anniversary cover is selectable");
}
assert.match(app, /pjskAnniversaryCover/, "selected anniversary cover is persisted");
assert.match(app, /applyAnniversaryCover/, "selected anniversary cover updates the home hero");
assert.match(app, /anniversaryCoverHeadline/, "selected anniversary cover updates its official headline");
assert.match(app, /anniversaryCoverEmphasis/, "selected anniversary cover updates its official supporting line");
const officialAnniversaryCopy = [
  ["群青讚歌", "一週年紀念歌曲"],
  ["Journey", "二週年紀念歌曲"],
  ["門扉的另一側", "嶄新的故事"],
  ["由心意創造的世界", ""],
  ["聲音連繫著未來", ""],
  ["心意交會的故事", ""]
];
for (const [headline, emphasis] of officialAnniversaryCopy) {
  assert.ok(app.includes(headline), "anniversary selector contains the official anniversary copy: " + headline);
  if (emphasis) assert.ok(app.includes(emphasis), "anniversary selector contains the corresponding copy: " + emphasis);
}
const anniversaryCoverUrls = [
  "https://pjsekai.sega.jp/assets/images/1st/ogp.png",
  "https://pjsekai.sega.jp/2nd/assets/img/ogp.jpg",
  "https://pjsekai.sega.jp/3rd/assets/images/common/0927_ogp.png",
  "https://pjsekai.sega.jp/4th/assets/images/common/ogp.png",
  "https://pjsekai.sega.jp/5th/assets/images/index/kv/img_kv_pc.png",
  "https://pjsekai.sega.jp/6th/assets/webp/index/fv/img_kv_miku_pc.webp"
];
for (const url of anniversaryCoverUrls) {
  assert.ok(app.includes(url), "anniversary cover points to its official hosted artwork: " + url);
}
assert.match(css, /--anniversary-cover-image/, "home hero uses the selected anniversary image");
assert.match(css, /anniversary-hero h1 span\{display:inline;background:linear-gradient/, "anniversary headline uses a readable pearl-to-aqua gradient");
assert.match(css, /anniversary-hero h1 em\{color:#b9e9f3/, "anniversary supporting headline uses a soft aqua accent");
assert.match(themes, /body\[data-sekai-theme\] \.anniversary-hero h1 span/, "anniversary headline gradient adapts to the selected unit theme");
assert.match(css, /img_kv_miku_pc\.webp/, "official sixth anniversary key visual remains");
assert.match(css, /@media\(max-width:640px\)/, "mobile layout remains");
assert.match(css, /prefers-reduced-motion/, "reduced motion is respected");

assert.equal(routes.length, 4, "home, player lookup, song management, and appearance settings remain");

const accountSync = await readFile(new URL("../../account-sync.js", import.meta.url), "utf8");
assert.doesNotMatch(accountSync, /pjskUiStateV1|pjskSongViewV1/, "scroll position and transient song filters stay on each device");
assert.match(accountSync, /ACCOUNT_BACKUP_PREFIX/, "each Google account keeps a separate local settings backup");
assert.match(accountSync, /localStorage\.setItem\(ACCOUNT_BACKUP_PREFIX \+ previousSubject/, "switching accounts preserves the previous account's local settings before changing scope");
assert.match(accountSync, /accountLocalData = readAccountBackup\(subject\)/, "switching accounts restores only the selected account's local settings");
assert.doesNotMatch(accountSync, /for \(const key of SYNC_KEYS\) localStorage\.removeItem\(key\)/, "account switching never deletes local settings before preserving them");
assert.match(accountSync, /Storage\.prototype\.setItem/, "cloud sync observes actual persistent storage changes");
assert.doesNotMatch(accountSync, /document\.addEventListener\("click", scheduleSync\)/, "ordinary clicks do not trigger cloud writes");
assert.match(accountSync, /syncRunning|syncQueued/, "cloud writes are serialized to prevent stale requests overwriting newer data");
assert.doesNotMatch(accountSync, /window\.location\.reload\(\)/, "cloud updates do not reload and jump the page");
assert.match(app, /applyCloudSettings/, "cloud appearance settings apply without a page reload");
assert.match(await readFile(new URL("../../songs.js", import.meta.url), "utf8"), /refreshCloudSongData/, "cloud song data refreshes in place");
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

assert.match(html, /id="anniversaryCoverHeadline">心意交會的故事<\/span>/, "homepage HTML fallback uses the shortened sixth-anniversary title");
assert.match(html, /id="anniversaryCoverEmphasis" hidden/, "empty second anniversary headline line stays hidden initially");
assert.doesNotMatch(html, /savePlayerForm|savedPlayerList|playerLookupHistory/, "unrelated saved-player workspace is removed");
assert.doesNotMatch(lookup, /pjskSavedPlayersV1|pjskPlayerHistoryV1|MAX_SAVED_PLAYERS|favorite-current|rememberPlayer/, "player lookup no longer manages saved-player collections");
assert.doesNotMatch(css, /Batch 2: saved player workspace/, "removed player workspace has no leftover styling");
