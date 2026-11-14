import { createHiSekaiPlayerProvider } from "./src/data/hisekai-player.mjs";

const provider = createHiSekaiPlayerProvider();
const $ = (selector) => document.querySelector(selector);
const status = $("#playerLookupStatus");
const results = $("#playerLookupResults");
const button = $("#playerLookupButton");

function allObjects(root) {
  const output = [];
  const seen = new WeakSet();
  const stack = [root];
  while (stack.length && output.length < 500) {
    const item = stack.pop();
    if (!item || typeof item !== "object" || seen.has(item)) continue;
    seen.add(item);
    output.push(item);
    for (const value of Object.values(item)) if (value && typeof value === "object") stack.push(value);
  }
  return output;
}
function getValue(objects, keys) {
  for (const object of objects) {
    for (const key of keys) {
      const value = object?.[key];
      if (value !== undefined && value !== null && value !== "" && typeof value !== "object") return value;
    }
  }
  return null;
}
function getArray(objects, keys) {
  for (const object of objects) {
    for (const key of keys) if (Array.isArray(object?.[key]) && object[key].length) return object[key];
  }
  return [];
}
function createNode(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
}
function renderProfile(result) {
  const objects = allObjects(result.data);
  const identity = objects
    .map((object) => ({
      object,
      score: ["userId", "user_id", "playerId", "player_id", "nickname", "userName", "playerName", "level", "userLevel"].reduce((sum, key) => sum + (object[key] != null ? 1 : 0), 0),
    }))
    .sort((a, b) => b.score - a.score)[0]?.object ?? result.data;
  const scoped = [identity, ...objects.filter((object) => object !== identity)];
  const name = getValue(scoped, ["name", "nickname", "userName", "playerName", "displayName"]) || "未提供名稱";
  const uid = getValue(scoped, ["userId", "user_id", "playerId", "player_id"]) || result.uid;
  const level = getValue(scoped, ["level", "userLevel", "user_level"]);
  const rank = getValue(scoped, ["rank", "playerRank", "player_rank"]);
  const power = getValue(scoped, ["totalPower", "teamPower", "power", "talent"]);
  const bio = getValue(scoped, ["bio", "introduction", "profileComment"]);
  const team = getArray(objects, ["team", "teamMembers", "team_members", "mainTeam", "main_team"]);
  const cards = getArray(objects, ["cards", "cardList", "card_list", "userCards", "user_cards"]);

  results.replaceChildren();
  const card = createNode("section", "player-result-card");
  const header = createNode("div", "player-result-head");
  const heading = createNode("div");
  heading.append(createNode("div", "msk-card-kicker", "公開玩家資料"));
  heading.append(createNode("h2", "", name));
  heading.append(createNode("p", "", "UID " + uid));
  header.append(heading, createNode("span", "player-source-pill", "資料來源 " + result.source + " " + result.region.toUpperCase()));
  card.append(header);

  const stats = createNode("div", "player-stat-grid");
  const fields = [
    ["玩家等級", level == null ? "未提供" : level],
    ["玩家排名", rank == null ? "未提供" : rank],
    ["隊伍戰力", power == null ? "未提供" : Number(power).toLocaleString()],
    ["公開卡片資料", cards.length ? cards.length + " 筆" : "未提供"],
  ];
  for (const [label, value] of fields) {
    const item = createNode("div", "player-stat");
    item.append(createNode("small", "", label), createNode("strong", "", value));
    stats.append(item);
  }
  card.append(stats);

  if (bio) card.append(createNode("p", "player-status", bio));
  if (team.length) {
    card.append(createNode("h3", "", "公開隊伍資料"));
    const list = createNode("div", "player-team-list");
    team.slice(0, 6).forEach((member, index) => {
      const title = member?.characterName || member?.character_name || member?.cardName || member?.card_name || member?.name || member?.characterId || member?.cardId || "隊伍成員 " + (index + 1);
      const value = member?.talent ?? member?.power ?? member?.cardPower ?? "";
      list.append(createNode("div", "player-team-row", ""));
      const row = list.lastElementChild;
      row.append(createNode("span", "", title), createNode("span", "", value === "" ? "" : "戰力 " + Number(value).toLocaleString()));
    });
    card.append(list);
  } else {
    card.append(createNode("div", "player-empty-note", "資料來源沒有提供可辨識的隊伍資料 這不代表玩家沒有隊伍"));
  }
  if (!level && !rank && !power && !team.length && !cards.length) {
    card.append(createNode("div", "player-empty-note", "已取得公開資料 但沒有找到可顯示的玩家欄位 請稍後再試"));
  }
  card.append(createNode("p", "player-status", "資料來源 Hi Sekai 台灣區 " + new Date(result.fetchedAt).toLocaleString().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim() + (result.cached ? " 快取資料" : " 最新查詢")));
  results.append(card);
}
function messageFor(error) {
  if (error?.code === "UID_INVALID") return "UID 格式錯誤 請只輸入數字";
  if (error?.code === "UPSTREAM_HTTP_ERROR") {
    if (error.details?.status === 404) return "找不到這個玩家 請確認 UID";
    if (error.details?.status === 429) return "查詢太頻繁 請稍後再試";
    return "資料來源暫時無法查詢 狀態碼 " + error.details?.status;
  }
  if (error?.code === "REQUEST_TIMEOUT") return "資料來源回應逾時 請稍後再試";
  if (error?.code === "NETWORK_ERROR") return "目前無法連線到資料來源 請稍後再試";
  if (error?.code === "UPSTREAM_INVALID_JSON") return "資料來源格式異常 暫時無法讀取";
  return "查詢失敗 " + (error?.message || "未知錯誤");
}
async function lookup(rawUid) {
  const uid = String(rawUid ?? "").trim();
  const input = $("#playerUid");
  if (input) input.value = uid;
  if (button) { button.disabled = true; button.textContent = "查詢中"; }
  if (status) status.textContent = "正在讀取台灣區公開資料";
  results?.replaceChildren();
  try {
    const result = await provider.getProfile(uid);
    renderProfile(result);
    if (status) status.textContent = "查詢完成 以下為資料來源提供的公開內容";
    window.PJSEKAI?.toast(result.cached ? "已載入快取玩家資料" : "玩家資料已載入");
  } catch (error) {
    if (status) status.textContent = messageFor(error);
    window.PJSEKAI?.toast("玩家資料查詢失敗");
  } finally {
    if (button) { button.disabled = false; button.textContent = "查詢公開資料"; }
  }
}
$("#playerLookupForm")?.addEventListener("submit", (event) => {
  event.preventDefault();
  lookup($("#playerUid")?.value);
});
$("#homePlayerLookup")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const uid = $("#homePlayerUid")?.value;
  $("#playerUid").value = uid;
  window.PJSEKAI?.go("profile");
  lookup(uid);
});
