import { REGION_LABELS } from "./src/data/regions.mjs";
import { createCloudflarePlayerProvider } from "./src/data/cloudflare-player.mjs";
import { extractPlayerIdentity } from "./src/data/player-profile-fields.mjs";

const provider = createCloudflarePlayerProvider();
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
  for (const object of objects) for (const key of keys) {
    const value = object?.[key];
    if (value !== undefined && value !== null && value !== "" && typeof value !== "object") return value;
  }
  return null;
}
function getArray(objects, keys) {
  for (const object of objects) for (const key of keys) {
    if (Array.isArray(object?.[key]) && object[key].length) return object[key];
  }
  return [];
}
function createNode(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
}
function renderProfile(result, eventRanking = null) {
  const objects = allObjects(result.data);
  const identity = extractPlayerIdentity(result.data, result.uid);
  const root = result.data && typeof result.data === "object" ? result.data : {};
  const gameData = root.userGamedata || root.user_gamedata || root.user || root;
  const profileData = root.userProfile || root.user_profile || root.profile || {};
  const scoped = [gameData, profileData, root];
  const name = identity.name;
  const uid = identity.uid;
  const level = identity.level;
  const power = getValue(scoped, ["totalPower", "teamPower", "power", "talent"]);
  const bio = getValue(scoped, ["bio", "introduction", "profileComment"]);
  const team = getArray(objects, ["userDecks", "team", "teamMembers", "team_members", "mainTeam", "main_team"]);
  const characters = getArray(objects, ["userCharacters", "characters", "user_cards"]);

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
  for (const [label, value] of [
    ["玩家等級", level == null ? "未提供" : level],
    ["本期活動排名", eventRanking?.row?.rank ?? (eventRanking?.status === "NO_ACTIVE_EVENT" ? "目前沒有活動" : eventRanking?.status === "UNSUPPORTED_REGION" ? "此區暫不支援" : eventRanking?.status === "POINT_BOARD_UNAVAILABLE" ? "此活動沒有點數榜" : eventRanking?.status === "NOT_FOUND_TOP_2000" ? "前 2000 名未找到" : eventRanking?.error === "EVENT_DATA_PENDING" ? "資料收集中" : "暫時無法取得")],
    ["綜合力", power == null ? "未提供" : Number(power).toLocaleString()],
    ["公開角色資料", characters.length ? characters.length + " 筆" : "未提供"],
  ]) {
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
      const title = member?.name || member?.deckName || member?.characterName || member?.character_name || "隊伍 " + (member?.deckId ?? index + 1);
      const value = member?.talent ?? member?.power ?? member?.cardPower ?? (member?.leader ? "隊長卡片 " + member.leader : "");
      const row = createNode("div", "player-team-row");
      row.append(createNode("span", "", title), createNode("span", "", value === "" ? "" : typeof value === "number" ? "戰力 " + value.toLocaleString() : String(value)));
      list.append(row);
    });
    card.append(list);
  } else card.append(createNode("div", "player-empty-note", "資料來源沒有提供可辨識的隊伍資料 這不代表玩家沒有隊伍"));
  if (!level && !power && !team.length && !characters.length) {
    card.append(createNode("div", "player-empty-note", "已取得公開資料 但沒有找到可顯示的玩家欄位 請稍後再試"));
  }
  card.append(createNode("p", "player-status", "資料來源 " + result.source + " " + (REGION_LABELS[result.region] || result.region) + " " + new Date(result.fetchedAt).toLocaleString().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim() + (result.cached ? " 快取資料" : " 最新查詢")));
  results.append(card);
}
function normalizeEventRanking(payload) {
  if (!payload || typeof payload !== "object") return { status: "UNAVAILABLE", row: null };
  const row = payload.row ?? payload.ranking?.row ?? payload.ranking?.result?.row
    ?? (payload.ranking?.rank != null ? payload.ranking : null);
  if (row) return { ...payload, row };
  if (payload.status === "OK" && payload.ranking?.searchedTo >= 2000) {
    return { ...payload, status: "NOT_FOUND_TOP_2000", row: null };
  }
  return payload;
}
function messageFor(error) {
  if (error?.code === "UID_INVALID") return "UID 格式錯誤 請只輸入數字";
  if (error?.code === "UPSTREAM_HTTP_ERROR") {
    if (error.details?.status === 404) return "找不到這個玩家 請確認 UID";
    if (error.details?.status === 403) return "這個玩家沒有開放公開資料";
    if (error.details?.status === 429) return "查詢太頻繁 請稍後再試";
    return "資料來源暫時無法查詢 狀態碼 " + error.details?.status;
  }
  if (error?.code === "REQUEST_TIMEOUT") return "資料來源回應逾時 請稍後再試";
  if (error?.code === "NETWORK_ERROR") return "目前無法連線到資料來源 請稍後再試";
  if (error?.code === "UPSTREAM_INVALID_JSON") return "資料來源格式異常 暫時無法讀取";
  return "查詢失敗 " + (error?.message || "未知錯誤");
}
async function lookup(rawUid, requestedRegion) {
  const uid = String(rawUid ?? "").trim();
  const region = requestedRegion || $("#playerRegion")?.value || $("#homePlayerRegion")?.value || "tw";
  const input = $("#playerUid");
  if (input) input.value = uid;
  if (button) { button.disabled = true; button.textContent = "查詢中"; }
  if (status) status.textContent = "正在讀取" + (REGION_LABELS[region] || region) + "公開資料";
  results?.replaceChildren();
  try {
    const [profileResult, rankingResult] = await Promise.allSettled([
      provider.getProfile(uid, region),
      provider.getEventRanking(uid, region),
    ]);
    if (profileResult.status === "rejected") throw profileResult.reason;
    const result = profileResult.value;
    const eventRanking = rankingResult.status === "fulfilled"
      ? normalizeEventRanking(rankingResult.value)
      : { status: "UNAVAILABLE", row: null };
    renderProfile(result, eventRanking);
    if (status) status.textContent = "查詢完成 以下為資料來源提供的公開內容";
    window.PJSEKAI?.toast(result.cached ? "已載入快取玩家資料" : "玩家資料已載入");
  } catch (error) {
    if (status) status.textContent = messageFor(error);
    window.PJSEKAI?.toast(messageFor(error));
  } finally {
    if (button) { button.disabled = false; button.textContent = "查詢公開資料"; }
  }
}
$("#playerLookupForm")?.addEventListener("submit", (event) => {
  event.preventDefault();
  lookup($("#playerUid")?.value, $("#playerRegion")?.value);
});
$("#homePlayerLookup")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const uid = $("#homePlayerUid")?.value;
  const region = $("#homePlayerRegion")?.value || "tw";
  $("#playerUid").value = uid;
  $("#playerRegion").value = region;
  window.PJSEKAI?.syncServerSelect?.($("#playerRegion"));
  window.PJSEKAI?.go("profile");
  lookup(uid, region);
});
