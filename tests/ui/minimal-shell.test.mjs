import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../../index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../../redesign-6th.css", import.meta.url), "utf8");
const app = await readFile(new URL("../../app-shell.js", import.meta.url), "utf8");
const themes = await readFile(new URL("../../sekai-themes.css", import.meta.url), "utf8");
const workspaceCss = await readFile(new URL("../../player-workspace.css", import.meta.url), "utf8");
const lookup = await readFile(new URL("../../player-lookup.js", import.meta.url), "utf8");
const workspace = await readFile(new URL("../../player-workspace.js", import.meta.url), "utf8");
assert.match(workspace, /return select;/, "player workspace filters use the same native select controls as other database sections");
assert.doesNotMatch(workspace, /document\.body\.append\(menu\)/, "player workspace does not create detached custom filter popups");
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
assert.match(shell, /lowResourceSignals/, "low-resource devices are detected for adaptive rendering");
assert.match(shell, /pjsekai:pagechange/, "page navigation notifies lazy-loaded features");
assert.match(html, /html\.low-performance[\s\S]*?backdrop-filter:\s*none !important/, "low-resource mode disables expensive glass blur effects");
assert.match(shell, /tabIndicator\.style\.setProperty\("--tab-left"/, "bottom selection bubble receives its horizontal position");
assert.match(html, /pointer-events:none;touch-action:pan-y;cursor:default/, "transparent selection bubble never blocks navigation labels or vertical scrolling");
assert.match(shell, /bottomBar\.addEventListener\("pointerdown"/, "navigation container receives pointer down over the selection bubble");
assert.match(shell, /bottomBar\.setPointerCapture\(event\.pointerId\)/, "drag keeps receiving pointer movement outside the bubble");
assert.match(shell, /bottomBar\.addEventListener\("pointermove"/, "selection bubble follows captured pointer movement");
assert.match(shell, /finishIndicatorDrag\(event, true\)/, "releasing dragged bubble selects the nearest tab");

assert.match(html, /transition:left var\(--tab-duration\).*width var\(--tab-duration\)/, "bottom selection bubble smoothly animates its position and width");
assert.match(shell, /addEventListener\("resize", syncTabIndicator/, "bottom selection bubble realigns after viewport resizing");
const routes = [...html.matchAll(/<section class="page[^"]*" data-page="([^"]+)"/g)].map((match) => match[1]);
assert.deepEqual(routes.sort(), ["game-tools", "home", "profile", "settings", "songs"], "five intended page sections remain");
assert.doesNotMatch(html, /dojo-controls\.js|event-calc\.js|chart-analyzer\.js|my-sekai\.js|system-settings\.js|home-hub\.js/, "legacy feature scripts are not loaded");
assert.match(lookup, /createCloudflarePlayerProvider/, "five-region public UID provider is connected");
assert.match(lookup, /requestedRegion = "auto"/, "player UID lookup defaults to automatic server detection");
assert.match(lookup, /provider\.getProfileAuto\(uid\)/, "automatic lookup still checks the five supported regions");
assert.match(lookup, /provider\.getProfile\(uid, region\)/, "manual server selection resolves that server directly");
assert.match(lookup, /function sourceUrlFor\(result\)/, "player result resolves the exact upstream data source URL");
for (const source of ["hisekai", "haruki public", "haruki", "exmeaning"]) {
  assert.ok(lookup.toLowerCase().includes('case "' + source + '"'), source + " source link is supported");
}
assert.match(lookup, /player-source-pill/, "player results display the source pill");
assert.match(lookup, /sourceLink\.href = sourceUrl/, "source pill itself links to the provider endpoint");
assert.doesNotMatch(lookup, /開啟資料來源/, "separate open-source label is removed");
assert.match(lookup, /case "cloudflare player api"/, "Cloudflare Player API results also link to their source endpoint");
assert.match(html, /自動檢查日服 台服 國際服 韓服 簡中服五個伺服器/, "homepage explains automatic five-region lookup");
assert.match(html, /玩家查詢/, "player lookup label uses the shorter title");
assert.doesNotMatch(html, /五服玩家查詢|五服公開資料/, "old five-region feature labels are removed");
assert.match(html, /<strong>選擇主題<\/strong>/, "theme section heading uses the concise selection label");
assert.doesNotMatch(html, /六大團體主題/, "old theme section wording is removed");
assert.ok(html.includes('<span aria-hidden="true">↑</span>'), "back-to-top circle uses an upward arrow");
assert.match(html, /id="playerRegion"/, "player lookup supports explicit cross-server account selection");
assert.match(html, /id="songRegion"/, "song manager keeps its independent server selector");
assert.match(html, /<label for="songRegion">選擇伺服器<\/label>/, "song manager selector label is concise");
assert.match(html, /@supports \(appearance:base-select\)/, "song server selector enables the customizable CSS picker where supported");
assert.match(html, /::picker\(select\)/, "song server dropdown popup has its own CSS styling");
assert.match(html, /option:checked/, "selected song server has a custom highlighted state");
assert.match(html, /position-area:block-end;/, "song server dropdown opens directly below its selector without spanning the full row");
assert.match(html, /width:max-content;[\s\S]*?max-width:min\(220px,calc\(100vw - 32px\)\)/, "song server dropdown stays compact and adapts to narrow screens");
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
assert.match(songsCss, /\.songs-region-row>\.server-picker \.server-picker-menu\{min-width:150px;width:max-content;max-width:min\(190px,calc\(100vw - 28px\)\)\}/, "song server popup stays compact instead of expanding to the full viewport");
assert.match(songsCss, /server-picker-close/, "song server dropdown has a closing animation");
assert.match(shell, /applyTheme/, "theme switching is functional");
assert.match(shell, /virtual-singer/, "Virtual Singer is the default theme");
assert.match(html, /id="anniversaryCoverSelect"/, "six anniversary cover choices are available");
assert.match(html, /redesign-6th\.css\?v=20261115-dropdown-toplayer-repair-v6/, "settings dropdown stylesheet cache is refreshed");
assert.match(html, /language\.js\?v=20261115-dropdown-toplayer-repair-v6/, "language dropdown script cache is refreshed");
assert.match(css, /\.styled-select-menu/, "anniversary and language dropdowns use custom popup styling");
assert.match(css, /\.styled-select-option\.is-selected/, "settings dropdowns highlight the selected option");
const languageModule = await readFile(new URL("../../language.js", import.meta.url), "utf8");
assert.match(languageModule, /function enhanceStyledSelect\(/, "settings selectors use shared custom dropdown behavior");
assert.match(languageModule, /enhanceStyledSelect\(document\.getElementById\("anniversaryCoverSelect"\)\)/, "anniversary selector uses the custom dropdown");
assert.match(languageModule, /enhanceStyledSelect\(select\)/, "language selector uses the custom dropdown");
assert.match(languageModule, /menu\.showPopover\(\)/, "settings dropdown popup uses the browser top layer");
assert.match(languageModule, /menu\.style\.position = "fixed"/, "settings dropdown popup is viewport-positioned in the top layer");
assert.match(app, /refreshStyledSelect\?\.\(select\)/, "anniversary selector label stays synchronized after programmatic cover changes");
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

assert.equal(routes.length, 5, "home, player lookup, song management, game tools, and appearance settings remain");


const accountSync = await readFile(new URL("../../account-sync.js", import.meta.url), "utf8");
assert.match(accountSync, /pjskSavedPlayersV2/, "saved players sync across signed-in devices");
assert.match(accountSync, /pjskPlayerHistoryV1/, "lookup history syncs across signed-in devices");
assert.match(accountSync, /pjskUiStateV1|pjskSongViewV1/, "saved interface and song filter state sync across devices");
assert.match(accountSync, /ACCOUNT_BACKUP_PREFIX/, "each Google account keeps a separate local settings backup");
assert.match(accountSync, /localStorage\.setItem\(ACCOUNT_BACKUP_PREFIX \+ previousSubject/, "switching accounts preserves the previous account's local settings before changing scope");
assert.match(accountSync, /accountLocalData = readAccountBackup\(subject\)/, "switching accounts restores only the selected account's local settings");
assert.doesNotMatch(accountSync, /for \(const key of SYNC_KEYS\) localStorage\.removeItem\(key\)/, "account switching never deletes local settings before preserving them");
assert.match(accountSync, /Storage\.prototype\.setItem/, "cloud sync observes actual persistent storage changes");
assert.doesNotMatch(accountSync, /document\.addEventListener\("click", scheduleSync\)/, "ordinary clicks do not trigger cloud writes");
assert.match(accountSync, /syncRunning|syncQueued/, "cloud writes are serialized to prevent stale requests overwriting newer data");
assert.doesNotMatch(accountSync, /700\);/, "persistent changes are not held behind the old 700ms sync delay");
for (const key of ["pjskSongViewV1", "pjskUiStateV1", "pjskLastPlayerLookup"]) {
  assert.ok(accountSync.includes('"'+key+'"'), key + " is included in cross-device account sync");
}
assert.match(accountSync, /setInterval\(pullCloudChanges, 15000\)/, "signed-in devices receive remote updates automatically");
assert.match(accountSync, /window\.confirm\("確定要登出 Google 帳號嗎？登出後將停止雲端同步。"\)/, "Google sign-out requires explicit confirmation");
assert.match(accountSync, /if \(!accessToken\) return;[\s\S]*?window\.confirm\([\s\S]*?\)[\s\S]*?signOut\(\);/, "canceling the sign-out confirmation keeps the Google session connected");
assert.doesNotMatch(accountSync, /window\.location\.reload\(\)/, "cloud updates do not reload and jump the page");
assert.match(app, /applyCloudSettings/, "cloud appearance settings apply without a page reload");
assert.match(await readFile(new URL("../../songs.js", import.meta.url), "utf8"), /refreshCloudSongData/, "cloud song data refreshes in place");
const songsModule = await readFile(new URL("../../songs.js", import.meta.url), "utf8");
assert.match(songsModule, /const SONGS_PER_RENDER = 60/, "song catalogue renders in small batches to avoid blocking the interface");
assert.match(songsModule, /SONG_CACHE_TTL/, "regional song catalogue uses a persistent freshness cache");
assert.match(songsModule, /readSongCache\(region\)/, "refresh reuses locally cached regional song data");
assert.match(songsModule, /visibleBatch = songs\.slice\(0, renderedSongLimit\)/, "only the current song batch is inserted into the DOM");
assert.match(songsModule, /function indexCharts\(charts\)/, "song charts are indexed once instead of repeatedly scanning the full chart list");
assert.match(songsModule, /載入更多歌曲/, "remaining songs can be loaded on demand");
assert.match(html, /const initialPage = page \|\| "home"/, "remembered page is selected in the document head before first paint");
assert.match(html, /initialPageStyle\.textContent[\s\S]*?display:none!important[\s\S]*?display:block!important/, "only the remembered page is visible before app-shell navigation initializes");
assert.match(html, /initialPageStyle\.id = "initial-page-bootstrap-style"/, "first-paint page visibility rule has a removable identifier");
assert.match(shell, /getElementById\("initial-page-bootstrap-style"\)\?\.remove\(\)/, "first-paint page visibility rule is removed after route initialization");
assert.match(shell, /removeAttribute\("data-initial-page"\)/, "first-paint route selector is cleared before later navigation");
assert.match(html, /html\[data-restore-scroll="pending"\] body\{visibility:hidden\}/, "page stays hidden until saved scroll position is restored");
assert.match(html, /app-shell\.js\?v=20261115-dropdown-toplayer-repair-v6/, "app shell cache is refreshed for instant scroll restoration");
assert.match(app, /go\(savedUiState\.activePage[^\n]+\{ preserveScroll: true \}\)/, "initial route restoration does not scroll to the top");
assert.match(app, /window\.scrollTo\(\{ top: Number\(savedUiState\.scrollY\), behavior: "instant" \}\)/, "saved scroll position is restored instantly before showing the page");
assert.match(app, /setTimeout\(saveUiState, 180\)/, "UI state persistence is debounced so typing does not synchronously serialize the whole form on every keystroke");
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
assert.match(html, /player-workspace.js/, "player workspace module is loaded");
assert.match(lookup, /已還原上次查詢資料/, "cached player results render before background refresh");
assert.match(lookup, /saveLookupCache\(uid, region, result\)/, "successful player profile results are persisted");

assert.match(html, /id="anniversaryCoverHeadline">心意交會的故事<\/span>/, "homepage HTML fallback uses the shortened sixth-anniversary title");
assert.match(html, /id="anniversaryCoverEmphasis" hidden/, "empty second anniversary headline line stays hidden initially");
assert.match(html, /id="savedPlayerList"/, "saved player workspace is present");
assert.match(html, /id="playerLookupHistory"/, "recent player lookup history is present");
assert.match(html, /id="playerCompareButton"/, "saved player comparison controls are present");
assert.match(html, /player-workspace\.css\?v=20261115-dropdown-toplayer-repair-v6/, "player workspace theme stylesheet cache is refreshed");
assert.match(workspaceCss, /body\[data-sekai-theme\] \.player-workspace-panel\{[\s\S]*?background:var\(--unit-panel\)/, "player workspace panel uses the active SEKAI glass surface");
assert.match(workspaceCss, /body\[data-sekai-theme\] \.saved-player-card,[\s\S]*?background:var\(--unit-panel-strong\)/, "saved player cards use the active SEKAI strong surface");
assert.match(workspaceCss, /body\[data-sekai-theme\] \.player-workspace-tools input[\s\S]*?color:var\(--unit-ink\)[\s\S]*?background:var\(--unit-panel-strong\)/, "workspace controls keep readable theme-aware text and backgrounds");
for (const theme of ["virtual-singer","leo-need","more-more-jump","vivid-bad-squad","wonderlands-showtime","nightcord"]) {
  assert.match(workspaceCss, new RegExp('body\\[data-sekai-theme="' + theme + '"\\]'), theme + " has a dedicated player workspace treatment");
}

assert.match(html, /id="playerWorkspaceFavorite"/, "favorite-only filtering is available");
const workspaceJs = await readFile(new URL("../../player-workspace.js", import.meta.url), "utf8");
assert.match(workspaceJs, /return select;/, "player filters use native selects like the game database");
assert.match(html, /id="playerRegion"/, "each player can be managed by a specific server");
assert.match(lookup, /pjsk:player-loaded/, "successful and restored profiles notify the player workspace");
assert.match(lookup, /getProfile\(uid, region\)/, "player lookup supports an explicitly selected server");
assert.doesNotMatch(css, /Batch 2: saved player workspace/, "removed player workspace has no leftover styling");

assert.match(html, /透明與清楚平衡/, "opacity scale explains the standard visual effect");
assert.match(html, /卡片更有層次/, "opacity scale includes the soft visual effect");
assert.match(html, /介面更實更易讀/, "opacity scale includes the clear visual effect");
assert.match(app, /opacityLevels = \[/, "opacity readout maps percentages to visual levels");
assert.match(app, /closestLevel\.label/, "opacity readout shows the closest matching visual level");
assert.match(app, /opacityRange\?\.addEventListener\("input"/, "opacity slider responds directly to native input");
assert.match(app, /opacityRange\?\.addEventListener\("change"/, "opacity slider saves after native interaction");
assert.doesNotMatch(app, /OPACITY_RESISTANCE|opacityDragState|getOpacityMagneticTarget|magneticTarget/, "opacity slider keeps native unrestricted pointer movement");
assert.match(html, /id="opacityRange"[^>]*max="55"/, "opacity slider range is mapped to the four preset positions");
assert.match(html, /data-opacity-marker="12"[^>]*21\.8182%[\s\S]*data-opacity-marker="22"[^>]*40%[\s\S]*data-opacity-marker="35"[^>]*63\.6364%[\s\S]*data-opacity-marker="48"[^>]*87\.2727%/, "all four marker dots use positions matching the mapped opacity values");
assert.match(html, /透亮<\/strong><small>背景更明顯<\/small><\/span><span style="--opacity-mark-position:40%"/, "the first and second labels use their corresponding marker positions");
assert.match(html, /清晰<\/strong><small>介面更實更易讀<\/small><\/span><\/div>/, "all four opacity labels remain present");
assert.match(html, /\.opacity-range\{[^}]*touch-action:pan-y/, "opacity slider preserves vertical page scrolling");
assert.match(html, /\.opacity-marker-rail\{position:absolute;z-index:2;/, "opacity marker dots render above the range input track");
assert.match(html, /app-shell\.js\?v=20261115-dropdown-toplayer-repair-v6/, "app shell script cache is refreshed");
assert.match(app, /opacityRange\?\.addEventListener\("pointerdown"/, "opacity slider uses pointer tracking for localized detent resistance");
assert.match(app, /OPACITY_DETENTS = \[12, 22, 35, 48\]/, "opacity resistance is limited to the four marked values");
assert.match(app, /OPACITY_DETENT_WIDTH = 2\.6/, "opacity resistance is confined to a narrow zone around each marker");
assert.match(app, /Math\.sin\(2 \* Math\.PI \* t\)/, "opacity resistance uses a continuous non-snapping movement curve");
assert.doesNotMatch(app.slice(app.indexOf("const opacityRange"), app.indexOf('$("#homeBrand")')), /Math\.round\(.*detent|return detent/, "opacity slider does not snap or magnetically pull to markers");
assert.doesNotMatch(app, /opacityPauseUntil|opacityPauseTimer|140\)/, "opacity slider has no artificial time-based pause");

assert.match(themes, /--unit-muted:#435c70/, "Virtual Singer secondary text uses a readable contrast color");
assert.match(themes, /--unit-muted:#4d6078/, "Leo/need secondary text uses a readable contrast color");
assert.match(themes, /--unit-muted:#486657/, "MORE MORE JUMP secondary text uses a readable contrast color");
assert.match(themes, /--unit-muted:#c8cedb/, "Vivid BAD SQUAD secondary text uses a readable contrast color");
assert.match(themes, /--unit-muted:#5d4d78/, "Wonderlands Showtime secondary text uses a readable contrast color");
assert.match(themes, /--unit-muted:#c9c4d9/, "Nightcord secondary text uses a readable contrast color");
assert.match(themes, /body\[data-sekai-theme\].*:where\([\s\S]*\.brand-text span/, "theme legibility rules cover shared secondary text");

const gameToolsJs = await readFile(new URL("../../game-tools.js", import.meta.url), "utf8");
const gameToolsCss = await readFile(new URL("../../game-tools.css", import.meta.url), "utf8");

assert.match(gameToolsJs, /function updateSearchResults\(/, "game-tool search updates only result containers");
assert.match(gameToolsJs, /選擇伺服器/, "game database region label uses the requested wording");
assert.doesNotMatch(gameToolsJs, /<label>(?:搜尋|搜尋角色|搜尋稱號|搜尋活動|角色|團體|屬性|稀有度)<(?:input|select)/, "filter labels are not wrapping interactive controls");
assert.ok(gameToolsJs.includes('<label for="gtCharacter">角色</label><select id="gtCharacter">'), "filter labels explicitly target their controls");
assert.ok(gameToolsJs.includes('<label for="gtQuery">搜尋</label><input id="gtQuery"'), "search label is separated from the search input");
assert.doesNotMatch(gameToolsJs, /function enhanceGameToolSelects\(|showPopover\(|hidePopover\(/, "selectors use the native iOS-safe picker rather than detached popovers");
assert.match(gameToolsJs, /if\(e\.target\.id==="gtQuery"\)\{const input=e\.target;s\.q=input\.value;updateSearchResults\(\);\}/, "search input updates results without replacing or refocusing the input");
assert.match(gameToolsJs, /calculateCardEventBonus\(c,id,s\.eventDeckBonuses,s\.gameCharacterUnits\)/, "event bonus uses the official event deck bonus rules and character-unit mapping");
assert.match(gameToolsJs, /calculateCardRarityBonus\(c,s\.masterRanks\[String\(c\.id\)\]\?\?0,s\.eventRarityBonusRates\)/, "event bonus includes the selected card mastery rank");
assert.match(gameToolsJs, /data-master-rank/, "team editor exposes mastery rank controls");
assert.match(gameToolsJs, /characterUnits\(c\.id,s\.gameCharacterUnits\)\.includes\(s\.unit\)/, "character search supports group filtering");
assert.match(gameToolsJs, /async function load\(\)\{const generation=\+\+loadGeneration;/, "new region loads supersede stale in-flight requests");
assert.match(gameToolsJs, /const list=p\.querySelector\("\.gt-cards"\);if\(list\)list\.innerHTML=/, "card search replaces only the scrollable result list");
assert.doesNotMatch(gameToolsCss, /gt-select-menu|gt-region-menu|background:transparent!important/, "obsolete transparent popup styling is removed");
assert.match(gameToolsCss, /#gameToolsRoot select\{[\s\S]*?appearance:none/, "all native game-tool selectors receive a unified custom appearance");
assert.match(gameToolsCss, /#gameToolsRoot select option\{background:#fff;color:#202638\}/, "native selector options retain an opaque readable surface");
assert.match(gameToolsCss, /\.gt-region-control select#gtRegion\{[\s\S]*?background-color:transparent/, "server selector control remains integrated with its themed region shell");
assert.match(gameToolsCss, /\.gt-region-control select#gtRegion:focus-visible/, "server selector has an explicit keyboard focus state");
assert.match(gameToolsCss, /background-image:url/, "game-tool search field has a search icon");
assert.doesNotMatch(gameToolsJs, /pointerup|field\.focus\(\{preventScroll:true\}\)/, "search is not forcibly refocused after touch");
assert.match(gameToolsCss, /#gameToolsRoot \.gt-cards\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/, "card grid uses larger two-column desktop layout");
assert.match(gameToolsCss, /#gameToolsRoot \.gt-art\{[\s\S]*?height:148px/, "card artwork is restored to a larger size");
assert.match(html, /game-tools\.css\?v=20261115-game-tools-complete-v10/, "game-tool styles use a fresh cache version");
