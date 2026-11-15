import { extractPlayerIdentity, extractPlayerPower } from "./src/data/player-profile-fields.mjs";

const SAVED_KEY = "pjskSavedPlayersV2";
const HISTORY_KEY = "pjskPlayerHistoryV1";
const MAX_SAVED = 50;
const MAX_HISTORY = 10;
const REGIONS = Object.freeze(["jp", "tw", "en", "kr", "cn"]);
const REGION_NAMES = Object.freeze({ jp: "日服", tw: "台服", en: "國際服", kr: "韓服", cn: "簡中服" });
const $ = (selector) => document.querySelector(selector);
const list = $("#savedPlayerList");
const historyList = $("#playerLookupHistory");
const compareResult = $("#playerCompareResult");
let currentProfile = null;

function read(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { window.PJSEKAI?.toast("儲存空間不足 請刪除部分玩家紀錄"); }
}
function keyOf(player) { return String(player.region) + ":" + String(player.uid); }
function safeText(value) { return String(value ?? ""); }
function node(tag, className, value) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (value !== undefined) element.textContent = safeText(value);
  return element;
}
function profileSummary(result) {
  const identity = extractPlayerIdentity(result.data, result.uid);
  const root = result.data || {};
  const objects = [];
  const seen = new WeakSet();
  const stack = [root];
  while (stack.length && objects.length < 400) {
    const item = stack.pop();
    if (!item || typeof item !== "object" || seen.has(item)) continue;
    seen.add(item); objects.push(item);
    for (const value of Object.values(item)) if (value && typeof value === "object") stack.push(value);
  }
  const findArray = (keys) => {
    for (const object of objects) for (const key of keys) if (Array.isArray(object[key])) return object[key];
    return [];
  };
  const characters = findArray(["userCharacters", "characters", "user_cards"]);
  const teams = findArray(["userDecks", "decks", "team", "teams", "user_decks"]);
  return {
    name: identity.name,
    uid: String(result.uid),
    region: result.region,
    level: identity.level == null ? null : String(identity.level),
    power: extractPlayerPower(root) == null ? null : String(extractPlayerPower(root)),
    characterCount: characters.length || null,
    teamCount: teams.length || null,
    source: result.source || "",
    fetchedAt: result.fetchedAt || new Date().toISOString()
  };
}
function shareUrl(player) {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("player", player.uid);
  url.searchParams.set("region", player.region);
  if (player.alias) url.searchParams.set("name", player.alias.slice(0, 40));
  return url.toString();
}
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    window.PJSEKAI?.toast("分享連結已複製");
  } catch {
    const input = document.createElement("textarea");
    input.value = text;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.append(input);
    input.select();
    const ok = document.execCommand("copy");
    input.remove();
    window.PJSEKAI?.toast(ok ? "分享連結已複製" : "無法複製連結");
  }
}
function saveCurrent(result) {
  const summary = profileSummary(result);
  const players = read(SAVED_KEY);
  const id = keyOf(summary);
  const existing = players.find((item) => keyOf(item) === id);
  if (existing) {
    existing.profile = summary;
    existing.updatedAt = new Date().toISOString();
  } else {
    if (players.length >= MAX_SAVED) {
      window.PJSEKAI?.toast("最多儲存 50 組 UID 與伺服器帳號");
      return;
    }
    players.unshift({ ...summary, alias: "", tags: [], favorite: false, profile: summary, createdAt: new Date().toISOString() });
  }
  write(SAVED_KEY, players);
  renderSaved();
  window.PJSEKAI?.toast(existing ? "玩家資料已更新" : "已加入玩家資料庫");
}
function addHistory(result) {
  const summary = profileSummary(result);
  const history = read(HISTORY_KEY).filter((item) => keyOf(item) !== keyOf(summary));
  history.unshift(summary);
  write(HISTORY_KEY, history.slice(0, MAX_HISTORY));
  renderHistory();
}
function openPlayer(player) {
  const uid = $("#playerUid");
  const region = $("#playerRegion");
  if (uid) uid.value = player.uid;
  if (region) region.value = player.region;
  window.PJSEKAI?.go("profile");
  window.PJSEKAI_LOOKUP?.(player.uid, player.region);
}
function enhanceFilterSelect(select) {
  if (!select || select.dataset.customized === "true") return;
  select.dataset.customized = "true";
  const wrapper = document.createElement("div");
  wrapper.className = "player-filter-dropdown";
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "player-filter-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  const menu = document.createElement("div");
  menu.className = "player-filter-menu";
  menu.setAttribute("role", "listbox");
  menu.hidden = true;
  select.parentNode.insertBefore(wrapper, select);
  wrapper.append(select, trigger, menu);
  select.classList.add("player-filter-native");
  const placeMenu = () => {
    const rect = trigger.getBoundingClientRect();
    const gap = 8;
    const margin = 8;
    const below = window.innerHeight - rect.bottom - gap;
    const above = rect.top - gap;
    const maxHeight = Math.max(96, Math.min(260, Math.max(below, above) - margin));
    const width = Math.max(140, Math.min(rect.width, window.innerWidth - margin * 2));
    menu.style.position = "fixed";
    menu.style.zIndex = "2147483647";
    menu.style.left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin)) + "px";
    menu.style.width = width + "px";
    menu.style.maxWidth = width + "px";
    menu.style.maxHeight = maxHeight + "px";
    menu.style.top = below >= Math.min(180, maxHeight) || below >= above
      ? Math.min(window.innerHeight - maxHeight - margin, rect.bottom + gap) + "px"
      : Math.max(margin, rect.top - maxHeight - gap) + "px";
  };
  const close = () => {
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    wrapper.classList.remove("is-open");
    if (wrapper.isConnected && menu.parentNode !== wrapper) wrapper.append(menu);
    if (!wrapper.isConnected) menu.remove();
    ["position","z-index","left","top","width","max-width","max-height"].forEach((property) => menu.style.removeProperty(property));
  };
  const refresh = () => {
    trigger.textContent = select.selectedOptions[0]?.textContent || "請選擇";
    menu.replaceChildren();
    [...select.options].forEach((option) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "player-filter-option" + (option.value === select.value ? " is-selected" : "");
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", option.value === select.value ? "true" : "false");
      item.textContent = option.textContent;
      item.addEventListener("click", () => {
        select.value = option.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        refresh();
        close();
        trigger.focus();
      });
      menu.append(item);
    });
  };
  trigger.addEventListener("click", () => {
    const opening = menu.hidden;
    document.querySelectorAll(".player-filter-dropdown.is-open").forEach((other) => {
      other._closePlayerFilter?.();
    });
    menu.hidden = !opening;
    trigger.setAttribute("aria-expanded", String(opening));
    wrapper.classList.toggle("is-open", opening);
    if (opening) {
      document.body.append(menu);
      placeMenu();
    }
  });
  document.addEventListener("click", (event) => { if (!wrapper.contains(event.target) && !menu.contains(event.target)) close(); });
  window.addEventListener("resize", () => { if (!menu.hidden) placeMenu(); });
  window.addEventListener("scroll", () => { if (!menu.hidden) placeMenu(); }, true);
  select.addEventListener("change", refresh);
  refresh();
  wrapper._closePlayerFilter = close;
  select._refreshCustomFilter = refresh;
}
function renderSaved() {
  if (!list) return;
  const players = read(SAVED_KEY);
  const search = ($("#playerWorkspaceSearch")?.value || "").trim().toLowerCase();
  const tag = $("#playerWorkspaceTag")?.value || "";
  const favoritesOnly = $("#playerWorkspaceFavorite")?.value === "yes";
  const filtered = players.filter((p) => {
    const haystack = [p.uid, p.name, p.alias, ...(p.tags || [])].join(" ").toLowerCase();
    return (!search || haystack.includes(search)) && (!tag || (p.tags || []).includes(tag)) && (!favoritesOnly || p.favorite);
  });
  const count = $("#playerSavedCount");
  if (count) count.textContent = players.length + " / " + MAX_SAVED;
  const tagSelect = $("#playerWorkspaceTag");
  if (tagSelect) {
    const selected = tagSelect.value;
    const tags = [...new Set(players.flatMap((p) => p.tags || []))].sort((a,b) => a.localeCompare(b, "zh-Hant"));
    tagSelect.replaceChildren(node("option", "", "所有標籤"));
    tagSelect.options[0].value = "";
    tags.forEach((value) => { const option = node("option", "", value); option.value = value; tagSelect.append(option); });
    tagSelect.value = tags.includes(selected) ? selected : "";
    enhanceFilterSelect(tagSelect);
    tagSelect._refreshCustomFilter?.();
  }
  list.replaceChildren();
  if (!filtered.length) {
    list.append(node("p", "player-workspace-empty", players.length ? "沒有符合條件的玩家" : "查詢玩家後按下加入工作台 即可管理多組 UID"));
    return;
  }
  filtered.forEach((player) => {
    const card = node("article", "saved-player-card");
    card.dataset.playerKey = keyOf(player);
    const top = node("div", "saved-player-top");
    const pickLabel = node("label", "player-compare-pick");
    const pick = node("input");
    pick.type = "checkbox"; pick.className = "player-compare-check"; pick.value = keyOf(player); pick.setAttribute("aria-label", "選擇比較 " + (player.alias || player.name));
    pickLabel.append(pick, node("span", "", "比較"));
    const title = node("div", "saved-player-title");
    title.append(node("strong", "", player.alias || player.name || "未提供名稱"));
    title.append(node("small", "", "UID " + player.uid + " · " + (REGION_NAMES[player.region] || player.region)));
    const favorite = node("button", "player-action-button" + (player.favorite ? " is-favorite" : ""), player.favorite ? "已收藏" : "收藏");
    favorite.type = "button"; favorite.dataset.action = "favorite";
    top.append(pickLabel, title, favorite);
    const fields = node("div", "saved-player-edit");
    const alias = document.createElement("input");
    alias.type = "text"; alias.maxLength = 40; alias.value = player.alias || ""; alias.placeholder = "玩家暱稱"; alias.dataset.field = "alias"; alias.setAttribute("aria-label", "玩家暱稱");
    const tags = document.createElement("input");
    tags.type = "text"; tags.maxLength = 160; tags.value = (player.tags || []).join(", "); tags.placeholder = "標籤 以逗號分隔"; tags.dataset.field = "tags"; tags.setAttribute("aria-label", "玩家標籤");
    fields.append(alias, tags);
    const actions = node("div", "saved-player-actions");
    for (const [action, label] of [["open","開啟玩家"],["share","分享個人頁面"],["remove","移除"]]) {
      const button = node("button", "player-action-button", label); button.type = "button"; button.dataset.action = action; actions.append(button);
    }
    card.append(top, fields, actions);
    list.append(card);
  });
  const compareButton = $("#playerCompareButton");
  if (compareButton) compareButton.disabled = list.querySelectorAll(".player-compare-check:checked").length < 2;
}
function renderHistory() {
  if (!historyList) return;
  const history = read(HISTORY_KEY);
  historyList.replaceChildren();
  if (!history.length) { historyList.append(node("p", "player-workspace-empty", "完成查詢後 這裡會保留最近 10 筆紀錄")); return; }
  history.forEach((item) => {
    const row = node("div", "player-history-row");
    const info = node("div");
    info.append(node("strong", "", item.name || "未提供名稱"));
    info.append(node("small", "", "UID " + item.uid + " · " + (REGION_NAMES[item.region] || item.region) + " · " + new Date(item.fetchedAt).toLocaleString()));
    const button = node("button", "player-action-button", "重新查詢"); button.type = "button"; button.dataset.historyKey = keyOf(item);
    row.append(info, button); historyList.append(row);
  });
}
function compareSelected() {
  const selected = [...list.querySelectorAll(".player-compare-check:checked")].map((input) => input.value);
  const players = read(SAVED_KEY).filter((p) => selected.includes(keyOf(p)));
  if (players.length < 2) { compareResult.replaceChildren(); return; }
  if (players.length > 4) { window.PJSEKAI?.toast("一次最多比較四位玩家"); return; }
  const fields = [
    ["玩家名稱", (p) => p.profile?.name || p.name],
    ["UID", (p) => p.uid],
    ["伺服器", (p) => REGION_NAMES[p.region] || p.region],
    ["玩家等級", (p) => p.profile?.level],
    ["綜合力", (p) => p.profile?.power ? Number(p.profile.power).toLocaleString() : null],
    ["公開角色資料", (p) => p.profile?.characterCount],
    ["公開隊伍資料", (p) => p.profile?.teamCount],
    ["資料來源", (p) => p.profile?.source],
    ["最後更新", (p) => p.profile?.fetchedAt ? new Date(p.profile.fetchedAt).toLocaleString() : null]
  ];
  const table = document.createElement("table");
  table.className = "player-compare-table";
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  headRow.append(node("th", "", "比較項目"));
  players.forEach((p) => headRow.append(node("th", "", p.alias || p.name || p.uid)));
  head.append(headRow); table.append(head);
  const body = document.createElement("tbody");
  fields.forEach(([label, getter]) => {
    const row = document.createElement("tr"); row.append(node("th", "", label));
    players.forEach((p) => row.append(node("td", "", getter(p) ?? "來源未提供")));
    body.append(row);
  });
  table.append(body); compareResult.replaceChildren(node("h3", "", "玩家資料比較"), table);
}
function handlePlayerLoaded(event) {
  currentProfile = event.detail;
  const resultCard = $("#playerLookupResults .player-result-card");
  if (!resultCard) return;
  const sharedName = new URLSearchParams(location.search).get("name");
  const sharedHeading = resultCard.querySelector("h2");
  if (sharedName && sharedHeading) sharedHeading.textContent = sharedName.slice(0, 40);
  const actions = node("div", "player-result-actions");
  const save = node("button", "player-action-button primary", "加入玩家資料庫"); save.type = "button"; save.dataset.resultAction = "save";
  const share = node("button", "player-action-button", "分享個人頁面"); share.type = "button"; share.dataset.resultAction = "share";
  actions.append(save, share);
  resultCard.append(actions);
  addHistory(currentProfile);
}
window.addEventListener("pjsk:player-loaded", handlePlayerLoaded);
window.addEventListener("pjsk:cloud-data-applied", () => { renderSaved(); renderHistory(); });
$("#playerLookupResults")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-result-action]");
  if (!button || !currentProfile) return;
  if (button.dataset.resultAction === "save") saveCurrent(currentProfile);
  if (button.dataset.resultAction === "share") {
    const summary = profileSummary(currentProfile);
    const saved = read(SAVED_KEY).find((p) => keyOf(p) === keyOf(summary));
    copy(shareUrl(saved || summary));
  }
});
list?.addEventListener("change", (event) => {
  const card = event.target.closest(".saved-player-card");
  if (!card) return;
  const players = read(SAVED_KEY);
  const player = players.find((p) => keyOf(p) === card.dataset.playerKey);
  if (!player) return;
  if (event.target.matches(".player-compare-check")) {
    const button = $("#playerCompareButton");
    if (button) button.disabled = list.querySelectorAll(".player-compare-check:checked").length < 2;
    return;
  }
  const field = event.target.dataset.field;
  if (!field) return;
  if (field === "alias") player.alias = event.target.value.trim().slice(0, 40);
  if (field === "tags") player.tags = [...new Set(event.target.value.split(",").map((tag) => tag.trim().slice(0, 24)).filter(Boolean))].slice(0, 12);
  write(SAVED_KEY, players); renderSaved();
});
list?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const card = button.closest(".saved-player-card");
  const players = read(SAVED_KEY);
  const player = players.find((p) => keyOf(p) === card?.dataset.playerKey);
  if (!player) return;
  switch (button.dataset.action) {
    case "favorite": player.favorite = !player.favorite; write(SAVED_KEY, players); renderSaved(); break;
    case "open": openPlayer(player); break;
    case "share": copy(shareUrl(player)); break;
    case "remove": write(SAVED_KEY, players.filter((p) => p !== player)); renderSaved(); compareResult.replaceChildren(); break;
  }
});
$("#playerWorkspaceSearch")?.addEventListener("input", renderSaved);
$("#playerWorkspaceTag")?.addEventListener("change", renderSaved);
$("#playerWorkspaceFavorite")?.addEventListener("change", renderSaved);
$("#playerCompareButton")?.addEventListener("click", compareSelected);
historyList?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-history-key]");
  if (!button) return;
  const item = read(HISTORY_KEY).find((p) => keyOf(p) === button.dataset.historyKey);
  if (item) openPlayer(item);
});
$("#clearPlayerHistory")?.addEventListener("click", () => {
  write(HISTORY_KEY, []); renderHistory();
});
enhanceFilterSelect($("#playerWorkspaceFavorite"));
renderSaved();
renderHistory();

const shared = new URLSearchParams(location.search);
const sharedUid = shared.get("player");
if (sharedUid && /^[0-9]{1,20}$/.test(sharedUid)) {
  const sharedRegion = REGIONS.includes(shared.get("region")) ? shared.get("region") : "auto";
  const uidInput = $("#playerUid");
  const regionInput = $("#playerRegion");
  if (uidInput) uidInput.value = sharedUid;
  if (regionInput) regionInput.value = sharedRegion;
  window.PJSEKAI?.go("profile");
  if (shared.get("name")) {
    const heading = $("#playerLookupResults");
    if (heading) heading.setAttribute("aria-label", shared.get("name").slice(0, 40) + " 的公開玩家資料");
  }
  window.PJSEKAI_LOOKUP?.(sharedUid, sharedRegion);
}
