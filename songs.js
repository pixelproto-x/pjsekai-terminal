const $ = (selector, root = document) => root.querySelector(selector);
const DATA_REPOS = {
  jp: "sekai-master-db-diff",
  tw: "sekai-master-db-tc-diff",
  en: "sekai-master-db-en-diff",
  kr: "sekai-master-db-kr-diff",
  cn: "sekai-master-db-cn-diff",
};
const REGION_NAMES = { jp: "日服", tw: "台服", en: "國際服", kr: "韓服", cn: "簡中服" };
let loadVersion = 0;
const STORAGE = {
  favorites: "pjskSongFavorites",
  records: "pjskSongRecords",
  playlists: "pjskSongPlaylists",
};
const difficultyNames = { easy: "EASY", normal: "NORMAL", hard: "HARD", expert: "EXPERT", master: "MASTER", append: "APPEND" };
const state = { songs: [], difficulties: [], chartsBySong: new Map(), maxLevelBySong: new Map(), favorites: new Set(), records: {}, playlists: [], filter: "all", randomId: null, playlistFilterIds: null };
const songTitleCollator = new Intl.Collator("ja");
let songsLoaded = false;
let searchTimer = 0;
const SONGS_PER_RENDER = 60;
let renderedSongLimit = SONGS_PER_RENDER;
let loadMoreButton = null;
const SONG_VIEW_KEY = "pjskSongViewV1";
const SONG_CACHE_DB = "pjsk-song-catalogue";
const SONG_CACHE_STORE = "regional-data";
const SONG_CACHE_TTL = 6 * 60 * 60 * 1000;

function openSongCache() {
  if (!("indexedDB" in window)) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(SONG_CACHE_DB, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(SONG_CACHE_STORE)) {
          request.result.createObjectStore(SONG_CACHE_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
}
async function readSongCache(region) {
  const db = await openSongCache();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const request = db.transaction(SONG_CACHE_STORE, "readonly").objectStore(SONG_CACHE_STORE).get(region);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}
async function writeSongCache(region, songs, charts) {
  const db = await openSongCache();
  if (!db) return;
  await new Promise((resolve) => {
    try {
      const transaction = db.transaction(SONG_CACHE_STORE, "readwrite");
      transaction.objectStore(SONG_CACHE_STORE).put({ songs, charts, savedAt: Date.now() }, region);
      transaction.oncomplete = resolve;
      transaction.onerror = resolve;
      transaction.onabort = resolve;
    } catch { resolve(); }
  });
}
const savedSongView = readStorage(SONG_VIEW_KEY, {});
function saveSongView() {
  writeStorage(SONG_VIEW_KEY, {
    search: $("#songSearch").value,
    difficulty: $("#songDifficulty").value,
    level: $("#songLevel").value,
    sort: $("#songSort").value,
    filter: state.filter,
    randomId: state.randomId,
    playlistFilterIds: state.playlistFilterIds ? [...state.playlistFilterIds] : null,
  });
}

function readStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch { return fallback; }
}
function writeStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { window.PJSEKAI?.toast("瀏覽器無法儲存資料"); return false; }
}
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
function recordKey(songId, difficulty) { return songId + ":" + difficulty; }
function getCharts(songId) {
  return state.chartsBySong.get(Number(songId)) || [];
}
function indexCharts(charts) {
  const grouped = new Map();
  for (const chart of charts) {
    const key = Number(chart.musicId);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(chart);
  }
  const order = ["easy", "normal", "hard", "expert", "master", "append"];
  state.maxLevelBySong = new Map();
  for (const [songId, entries] of grouped) {
    entries.sort((a, b) => order.indexOf(a.musicDifficulty) - order.indexOf(b.musicDifficulty));
    state.maxLevelBySong.set(songId, entries.reduce((max, chart) => Math.max(max, Number(chart.playLevel) || 0), 0));
  }
  state.chartsBySong = grouped;
}
function updateOverview() {
  $("#songTotal").textContent = state.songs.length.toLocaleString("zh-TW");
  $("#songFavoriteTotal").textContent = state.favorites.size.toLocaleString("zh-TW");
  $("#songRecordTotal").textContent = Object.values(state.records).filter((record) => record?.status).length.toLocaleString("zh-TW");
  $("#songPlaylistTotal").textContent = state.playlists.length.toLocaleString("zh-TW");
}
function visibleSongs() {
  const query = $("#songSearch").value.trim().toLocaleLowerCase();
  const difficulty = $("#songDifficulty").value;
  const levelRange = $("#songLevel").value;
  const [minLevel, maxLevel] = levelRange ? levelRange.split("-").map(Number) : [0, 99];
  const playedSongIds = new Set();
  for (const [key, record] of Object.entries(state.records)) {
    if (record?.status) playedSongIds.add(Number(key.slice(0, key.indexOf(":"))));
  }
  let list = state.songs.filter((song) => {
    const charts = getCharts(song.id);
    const matchingCharts = charts.filter((chart) =>
      (!difficulty || chart.musicDifficulty === difficulty) &&
      (!levelRange || (Number(chart.playLevel) >= minLevel && Number(chart.playLevel) <= maxLevel))
    );
    const matchesQuery = !query || [song.title, song.lyricist, song.composer, song.arranger].some((value) => String(value || "").toLocaleLowerCase().includes(query));
    const matchesDifficulty = !difficulty || charts.some((chart) => chart.musicDifficulty === difficulty);
    const matchesLevel = matchingCharts.length > 0;
    const matchesFavorite = state.filter !== "favorites" || state.favorites.has(song.id);
    const matchesUnplayed = state.filter !== "unplayed" || !playedSongIds.has(Number(song.id));
    const matchesPlaylist = !state.playlistFilterIds || state.playlistFilterIds.has(song.id);
    return matchesQuery && matchesDifficulty && matchesLevel && matchesFavorite && matchesUnplayed && matchesPlaylist;
  });
  const sort = $("#songSort").value;
  if (sort === "newest") list.sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
  else if (sort === "level-desc" || sort === "level-asc") {
    const direction = sort === "level-desc" ? -1 : 1;
    list.sort((a, b) => direction * ((state.maxLevelBySong.get(Number(a.id)) || 0) - (state.maxLevelBySong.get(Number(b.id)) || 0)));
  } else list.sort((a, b) => songTitleCollator.compare(a.title, b.title));
  if (state.randomId !== null) list = list.filter((song) => song.id === state.randomId);
  return list;
}
function renderSongs() {
  const songs = visibleSongs();
  const visibleBatch = songs.slice(0, renderedSongLimit);
  $("#songList").innerHTML = visibleBatch.map((song) => {
    const allCharts = getCharts(song.id);
    const levelRange = $("#songLevel").value;
    const difficulty = $("#songDifficulty").value;
    const [minLevel, maxLevel] = levelRange ? levelRange.split("-").map(Number) : [0, 99];
    const charts = levelRange
      ? allCharts.filter((chart) => Number(chart.playLevel) >= minLevel && Number(chart.playLevel) <= maxLevel && (!difficulty || chart.musicDifficulty === difficulty))
      : allCharts;
    const chartMarkup = charts.map((chart) => {
      const key = recordKey(song.id, chart.musicDifficulty);
      const status = state.records[key]?.status || "";
      return '<span class="song-difficulty difficulty-' + chart.musicDifficulty + '">' + difficultyNames[chart.musicDifficulty] + ' <strong>' + chart.playLevel + '</strong></span>';
    }).join("");
    const firstChart = charts[0]?.musicDifficulty || "expert";
    const currentStatus = state.records[recordKey(song.id, firstChart)]?.status || "";
    const seconds = Number(song.secForMusicScoreMaker);
    const duration = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds / 60) + ":" + String(Math.floor(seconds % 60)).padStart(2, "0") : "時間未提供";
    return '<article class="song-card" data-song-id="' + song.id + '">' +
      '<div class="song-card-head"><div><h3>' + escapeHTML(song.title) + '</h3><div class="song-card-meta">' + escapeHTML(song.composer || song.lyricist || "作曲者未提供") + '　' + duration + '</div></div>' +
      '<button class="song-favorite" type="button" data-action="favorite" aria-pressed="' + state.favorites.has(song.id) + '">' + (state.favorites.has(song.id) ? "已收藏" : "收藏") + '</button></div>' +
      '<div class="song-difficulties">' + chartMarkup + '</div>' +
      '<div class="song-record"><label>紀錄難度</label><select data-role="record-difficulty" aria-label="紀錄難度">' + charts.map((chart) => '<option value="' + chart.musicDifficulty + '">' + difficultyNames[chart.musicDifficulty] + '</option>').join("") + '</select>' +
      '<select data-role="record-status" aria-label="遊玩結果"><option value="" ' + (!currentStatus ? "selected" : "") + '>未設定</option><option value="clear" ' + (currentStatus === "clear" ? "selected" : "") + '>Clear</option><option value="fc" ' + (currentStatus === "fc" ? "selected" : "") + '>Full Combo</option><option value="ap" ' + (currentStatus === "ap" ? "selected" : "") + '>All Perfect</option></select>' +
      '<select data-role="playlist-target" aria-label="選擇歌單">' + state.playlists.map((playlist, index) => '<option value="' + index + '">' + escapeHTML(playlist.name) + '</option>').join("") + '</select>' +
      '<button class="song-playlist-add" type="button" data-action="playlist-add">加入歌單</button></div></article>';
  }).join("");
  $("#songEmpty").hidden = songs.length > 0;
  if (!loadMoreButton) {
    loadMoreButton = document.createElement("button");
    loadMoreButton.type = "button";
    loadMoreButton.className = "song-load-more";
    loadMoreButton.addEventListener("click", () => {
      renderedSongLimit += SONGS_PER_RENDER;
      renderSongs();
    });
    $("#songList").insertAdjacentElement("afterend", loadMoreButton);
  }
  const remaining = Math.max(0, songs.length - visibleBatch.length);
  loadMoreButton.hidden = remaining === 0;
  loadMoreButton.textContent = remaining ? "載入更多歌曲（還有 " + remaining.toLocaleString("zh-TW") + " 首）" : "";
  $("#songDataStatus").textContent = "顯示 " + visibleBatch.length.toLocaleString("zh-TW") + " / " + songs.length.toLocaleString("zh-TW") + " 首歌曲 伺服器 " + REGION_NAMES[$("#songRegion").value];
  updateOverview();
  renderPlaylists();
}
function renderPlaylists() {
  $("#songPlaylistList").innerHTML = state.playlists.map((playlist, index) =>
    '<article class="song-playlist"><strong>' + escapeHTML(playlist.name) + '</strong><small>' + playlist.songIds.length + ' 首歌曲</small><div class="song-playlist-actions"><button type="button" data-playlist-action="view" data-playlist-index="' + index + '">查看歌單</button><button type="button" data-playlist-action="remove" data-playlist-index="' + index + '">刪除歌單</button></div></article>'
  ).join("") || '<div class="songs-empty">尚未建立歌單</div>';
}
function setFilter(filter) {
  renderedSongLimit = SONGS_PER_RENDER;
  state.filter = filter;
  state.randomId = null;
  state.playlistFilterIds = null;
  ["songShowAll", "songShowFavorites", "songShowUnplayed"].forEach((id) => $("#" + id).classList.toggle("active", id === ({ all: "songShowAll", favorites: "songShowFavorites", unplayed: "songShowUnplayed" })[filter]));
  saveSongView();
  renderSongs();
}
function applySongCatalogue(songs, charts) {
  const now = Date.now();
  state.songs = songs.filter((song) =>
    song.title && !song.isFullLength &&
    Number.isInteger(Number(song.id)) &&
    Number.isFinite(Number(song.publishedAt)) &&
    Number(song.publishedAt) <= now
  );
  const availableSongIds = new Set(state.songs.map((song) => Number(song.id)));
  state.difficulties = charts.filter((chart) =>
    availableSongIds.has(Number(chart.musicId)) && chart.musicDifficulty
  );
  indexCharts(state.difficulties);
  songsLoaded = true;
  renderedSongLimit = SONGS_PER_RENDER;
  renderSongs();
}

async function loadSongs(region = $("#songRegion").value) {
  const status = $("#songDataStatus");
  const version = ++loadVersion;
  const repo = DATA_REPOS[region] || DATA_REPOS.tw;
  const dataRoot = "https://sekai-world.github.io/" + repo;
  status.textContent = "正在載入" + REGION_NAMES[region] + "歌曲資料";
  const cached = await readSongCache(region);
  if (version !== loadVersion) return;
  if (cached && Array.isArray(cached.songs) && Array.isArray(cached.charts)) {
    applySongCatalogue(cached.songs, cached.charts);
    const fresh = Date.now() - Number(cached.savedAt || 0) < SONG_CACHE_TTL;
    status.textContent = REGION_NAMES[region] + "歌曲資料已從本機快取載入 共 " +
      state.songs.length.toLocaleString("zh-TW") + " 首";
    if (fresh) return;
    status.textContent += " 正在背景檢查更新";
  }
  try {
    const [songsResponse, chartsResponse] = await Promise.all([
      fetch(dataRoot + "/musics.json"),
      fetch(dataRoot + "/musicDifficulties.json"),
    ]);
    if (!songsResponse.ok || !chartsResponse.ok) throw new Error("歌曲資料來源暫時無法連線");
    const [songs, charts] = await Promise.all([songsResponse.json(), chartsResponse.json()]);
    if (version !== loadVersion) return;
    if (!Array.isArray(songs) || !Array.isArray(charts)) throw new Error("歌曲資料格式不正確");
    await writeSongCache(region, songs, charts);
    if (version !== loadVersion) return;
    applySongCatalogue(songs, charts);
    status.textContent = REGION_NAMES[region] + "歌曲資料已更新 共 " +
      state.songs.length.toLocaleString("zh-TW") + " 首";
  } catch (error) {
    if (version !== loadVersion) return;
    if (cached && songsLoaded) {
      status.textContent = REGION_NAMES[region] + "目前使用已儲存的歌曲資料 更新失敗";
      return;
    }
    songsLoaded = false;
    status.textContent = REGION_NAMES[region] + " " + error.message + " 請稍後重新整理";
    $("#songTotal").textContent = "載入失敗";
  }
}
$("#songRegion").value = readStorage("pjskSongRegion", "tw");
$("#songSearch").value = savedSongView.search || "";
$("#songDifficulty").value = savedSongView.difficulty || "";
$("#songLevel").value = savedSongView.level || "";
$("#songSort").value = savedSongView.sort || "title";
state.filter = ["all", "favorites", "unplayed"].includes(savedSongView.filter) ? savedSongView.filter : "all";
state.randomId = Number.isFinite(Number(savedSongView.randomId)) && savedSongView.randomId !== null ? Number(savedSongView.randomId) : null;
state.playlistFilterIds = Array.isArray(savedSongView.playlistFilterIds) ? new Set(savedSongView.playlistFilterIds) : null;
["songShowAll", "songShowFavorites", "songShowUnplayed"].forEach((id) => $("#"+id).classList.toggle("active", id === ({ all: "songShowAll", favorites: "songShowFavorites", unplayed: "songShowUnplayed" })[state.filter]));
window.PJSEKAI?.syncServerSelect?.($("#songRegion"));
$("#songRegion").addEventListener("change", () => {
  writeStorage("pjskSongRegion", $("#songRegion").value);
  state.randomId = null;
  songsLoaded = false;
  loadSongs($("#songRegion").value);
});
state.favorites = new Set(readStorage(STORAGE.favorites, []));
state.records = readStorage(STORAGE.records, {});
state.playlists = readStorage(STORAGE.playlists, []);
$("#songSearch").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    renderedSongLimit = SONGS_PER_RENDER;
    state.randomId = null;
    saveSongView();
    renderSongs();
  }, 100);
});
["songDifficulty", "songLevel", "songSort"].forEach((id) => $("#" + id).addEventListener("change", () => { renderedSongLimit = SONGS_PER_RENDER; state.randomId = null; saveSongView(); renderSongs(); }));
$("#songShowAll").addEventListener("click", () => setFilter("all"));
$("#songShowFavorites").addEventListener("click", () => setFilter("favorites"));
$("#songShowUnplayed").addEventListener("click", () => setFilter("unplayed"));
$("#songRandom").addEventListener("click", () => {
  const songs = visibleSongs();
  if (!songs.length) return window.PJSEKAI?.toast("目前條件沒有可抽選的歌曲");
  state.randomId = songs[Math.floor(Math.random() * songs.length)].id;
  saveSongView();
  renderSongs();
  $("#songList").scrollIntoView({ behavior: "smooth", block: "start" });
});
$("#songList").addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const card = button.closest("[data-song-id]");
  const songId = Number(card?.dataset.songId);
  if (!songId) return;
  if (button.dataset.action === "favorite") {
    if (state.favorites.has(songId)) state.favorites.delete(songId);
    else state.favorites.add(songId);
    writeStorage(STORAGE.favorites, [...state.favorites]);
    renderSongs();
  }
  if (button.dataset.action === "playlist-add") {
    if (!state.playlists.length) return window.PJSEKAI?.toast("請先建立歌單");
    const target = Number($("select[data-role=playlist-target]", card).value);
    const playlist = state.playlists[target];
    if (!playlist) return window.PJSEKAI?.toast("請先建立歌單");
    if (!playlist.songIds.includes(songId)) playlist.songIds.push(songId);
    writeStorage(STORAGE.playlists, state.playlists);
    renderPlaylists();
    window.PJSEKAI?.toast("已加入 " + playlist.name);
  }
});
$("#songList").addEventListener("change", (event) => {
  const card = event.target.closest("[data-song-id]");
  if (!card) return;
  if (event.target.dataset.role === "record-difficulty") {
    const songId = Number(card.dataset.songId);
    const difficulty = event.target.value;
    $("select[data-role=record-status]", card).value = state.records[recordKey(songId, difficulty)]?.status || "";
    return;
  }
  if (event.target.dataset.role !== "record-status") return;
  const songId = Number(card.dataset.songId);
  const difficulty = $("select[data-role=record-difficulty]", card).value;
  const key = recordKey(songId, difficulty);
  if (event.target.value) state.records[key] = { status: event.target.value, updatedAt: Date.now() };
  else delete state.records[key];
  writeStorage(STORAGE.records, state.records);
  updateOverview();
});
$("#songPlaylistForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = $("#songPlaylistName");
  const name = input.value.trim();
  if (!name) return;
  if (state.playlists.some((playlist) => playlist.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return window.PJSEKAI?.toast("這個歌單名稱已經存在");
  state.playlists.push({ name, songIds: [] });
  writeStorage(STORAGE.playlists, state.playlists);
  input.value = "";
  renderSongs();
  updateOverview();
});
$("#songPlaylistList").addEventListener("click", (event) => {
  const button = event.target.closest("[data-playlist-action]");
  if (!button) return;
  const index = Number(button.dataset.playlistIndex);
  const playlist = state.playlists[index];
  if (!playlist) return;
  if (button.dataset.playlistAction === "remove") {
    state.playlists.splice(index, 1);
    writeStorage(STORAGE.playlists, state.playlists);
    renderSongs();
    updateOverview();
  } else {
    state.playlistFilterIds = new Set(playlist.songIds);
    state.filter = "playlist";
    saveSongView();
    state.randomId = null;
    ["songShowAll", "songShowFavorites", "songShowUnplayed"].forEach((id) => $("#" + id).classList.remove("active"));
    renderSongs();
    $("#songList").scrollIntoView({ behavior: "smooth", block: "start" });
  }
});
window.PJSEKAI = { ...(window.PJSEKAI || {}), refreshCloudSongData: () => {
  state.favorites = new Set(readStorage(STORAGE.favorites, []));
  state.records = readStorage(STORAGE.records, {});
  state.playlists = readStorage(STORAGE.playlists, []);
  const cloudRegion = readStorage("pjskSongRegion", "tw");
  const cloudView = readStorage(SONG_VIEW_KEY, {});
  $("#songSearch").value = cloudView.search || "";
  $("#songDifficulty").value = cloudView.difficulty || "";
  $("#songLevel").value = cloudView.level || "";
  $("#songSort").value = cloudView.sort || "title";
  state.filter = ["all", "favorites", "unplayed", "playlist"].includes(cloudView.filter) ? cloudView.filter : "all";
  state.randomId = Number.isFinite(Number(cloudView.randomId)) && cloudView.randomId !== null ? Number(cloudView.randomId) : null;
  state.playlistFilterIds = Array.isArray(cloudView.playlistFilterIds) ? new Set(cloudView.playlistFilterIds) : null;
  ["songShowAll", "songShowFavorites", "songShowUnplayed"].forEach((id) =>
    $("#" + id).classList.toggle("active", id === ({ all: "songShowAll", favorites: "songShowFavorites", unplayed: "songShowUnplayed" })[state.filter]));
  if (cloudRegion !== $("#songRegion").value) {
    $("#songRegion").value = cloudRegion;
    window.PJSEKAI?.syncServerSelect?.($("#songRegion"));
    songsLoaded = false;
  }
  if (document.querySelector('.page.active[data-page="songs"]')) {
    if (!songsLoaded) loadSongs(cloudRegion);
    else renderSongs();
  }
} };

function ensureSongsLoaded() {
  if (!songsLoaded) loadSongs($("#songRegion").value);
}
window.addEventListener("pjsekai:pagechange", (event) => {
  if (event.detail?.page === "songs") ensureSongsLoaded();
});
if (document.querySelector('.page.active[data-page="songs"]')) ensureSongsLoaded();
