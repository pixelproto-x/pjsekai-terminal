import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../../index.html", import.meta.url), "utf8");
const js = await readFile(new URL("../../songs.js", import.meta.url), "utf8");
const css = await readFile(new URL("../../songs.css", import.meta.url), "utf8");
const themeCss = await readFile(new URL("../../sekai-themes.css", import.meta.url), "utf8");

assert.match(html, /data-page="songs"/, "song management route exists");
assert.match(html, /data-go="songs"/, "song navigation tab exists");
assert.match(html, /id="songSearch"/, "song search exists");
assert.match(html, /id="songRegion"/, "five-server song data selector exists");
for (const [region, label] of [["jp","日服"],["tw","台服"],["en","國際服"],["kr","韓服"],["cn","簡中服"]]) assert.match(html, new RegExp(`<option value="${region}"[^>]*>[^<]*${label}</option>`), `${label} song database is selectable`);
assert.match(html, /id="songDifficulty"/, "difficulty filter exists");
assert.match(html, /id="songLevel"/, "level filter exists");
assert.match(html, /<option value="33-36">33 至 36<\/option>/, "level filter separates levels 33 through 36");
assert.match(html, /<option value="37-99">37 以上<\/option>/, "level filter includes a separate 37+ range");
assert.match(html, /id="songRandom"/, "random song action exists");
assert.match(html, /id="songPlaylistForm"/, "playlist creation exists");
assert.match(html, /id="songList"/, "song results container exists");
assert.match(html, /src="songs\.js(?:\?[^"]*)?"/, "song manager module is loaded");
assert.match(js, /sekai-master-db-tc-diff/, "Traditional Chinese server data source is configured");
assert.match(js, /SONG_CACHE_DB/, "song catalogue is cached in IndexedDB across page refreshes");
assert.match(js, /if \(fresh\) return;/, "fresh local song data skips repeat network downloads");
assert.match(js, /SONG_CACHE_DB/, "song catalogue is cached in IndexedDB across page refreshes");
assert.match(js, /if \(fresh\) return;/, "fresh local song data skips repeat network downloads");
assert.match(js, /sekai-master-db-en-diff/, "English server data source is configured");
assert.match(js, /sekai-master-db-kr-diff/, "Korean server data source is configured");
assert.match(js, /sekai-master-db-cn-diff/, "Simplified Chinese server data source is configured");
assert.ok(js.includes('"/musics.json"'), "song list endpoint is configured");
assert.match(js, /musicDifficulties\.json/, "chart difficulty data source is configured");
assert.match(js, /localStorage/, "personal data persists locally");
assert.match(js, /window\.addEventListener\("pjsekai:pagechange"/, "song data loads only when the song page is opened");
assert.doesNotMatch(js, /\nloadSongs\(\);\s*$/, "song data is not fetched unconditionally during startup");
assert.match(js, /fetch\(dataRoot \+ "\/musics\.json"\)/, "song catalogue uses normal browser HTTP caching");
assert.doesNotMatch(js, /cache:\s*"no-cache"/, "song catalogue does not force network revalidation on every refresh");
assert.match(js, /maxLevelBySong/, "chart maximum levels are indexed once instead of recalculated during sorting");
assert.match(js, /playedSongIds/, "unplayed filter uses a precomputed set instead of scanning records for every song");
assert.match(js, /pjskSongViewV1/, "song search and filter state persists locally");
assert.match(js, /pjskSongFavorites/, "favorite list has a dedicated storage key");
assert.match(js, /pjskSongRecords/, "play records have a dedicated storage key");
assert.match(js, /pjskSongPlaylists/, "playlists have a dedicated storage key");
assert.match(js, /Full Combo/, "FC record option exists");
assert.match(js, /All Perfect/, "AP record option exists");
assert.match(css, /\.song-card/, "song cards have dedicated styling");
assert.match(css, /column-gap:18px/, "song cards have clear horizontal spacing");
assert.match(css, /row-gap:18px/, "song cards have clear vertical spacing");
assert.match(css, /min-height:34px/, "difficulty chips have enough height and breathing room");
assert.match(css, /gap:9px 10px/, "difficulty chips have clear spacing and wrap instead of crowding");
assert.match(css, /minmax\(min\(100%,380px\),1fr\)/, "song cards avoid becoming too narrow");

assert.doesNotMatch(themeCss, /\.song-difficulty:nth-child\(/, "difficulty colors are not assigned by badge position");
assert.match(themeCss, /\.page\[data-page="songs"\] \.song-card[\s\S]*?var\(--unit-panel-strong\)/, "song cards inherit the selected unit theme");
for (const unit of ["virtual-singer","leo-need","more-more-jump","vivid-bad-squad","wonderlands-showtime","nightcord"]) {
  assert.ok(themeCss.includes('body[data-sekai-theme="' + unit + '"] .page[data-page="songs"] .song-card'), unit + " has a matching song-card treatment");
}
for (const difficulty of ["easy","normal","hard","expert","master","append"]) {
  assert.ok(themeCss.includes('option[value="' + difficulty + '"]'), difficulty + " difficulty option uses its game color");
}
assert.match(css, /@media\(max-width:640px\)/, "song manager has mobile styling");
console.log("Song management UI smoke tests passed.");


assert.match(js, /difficulty-' \+ chart\.musicDifficulty/, "difficulty badge class is derived from each chart's own difficulty");
for (const difficulty of ["easy","normal","hard","expert","master","append"]) {
  assert.match(css, new RegExp("\\.song-difficulty\\.difficulty-" + difficulty), difficulty + " badge uses its Project SEKAI palette");
}
assert.match(css, /position-area:block-end span-inline/, "native song selectors open below their controls");
assert.match(css, /position-try-fallbacks:none/, "native song selectors do not flip upward");
