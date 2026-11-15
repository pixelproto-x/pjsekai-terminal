import { REGION_LABELS } from "./src/data/regions.mjs";
import { createCloudflarePlayerProvider } from "./src/data/cloudflare-player.mjs";
import { extractPlayerIdentity, extractPlayerPower } from "./src/data/player-profile-fields.mjs?v=20261115-uid-precision-fix1";

const provider = createCloudflarePlayerProvider();
const $ = (selector) => document.querySelector(selector);
const status = $("#playerLookupStatus");
const results = $("#playerLookupResults");
const button = $("#playerLookupButton");
let lookupGeneration = 0;

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
function renderProfile(result) {
  const objects = allObjects(result.data);
  const identity = extractPlayerIdentity(result.data, result.uid);
  const root = result.data && typeof result.data === "object" ? result.data : {};
  const gameData = root.userGamedata || root.user_gamedata || root.user || root;
  const profileData = root.userProfile || root.user_profile || root.profile || {};
  const scoped = [gameData, profileData, root];
  const name = identity.name;
  const uid = identity.uid;
  const level = identity.level;
  const power = extractPlayerPower(root);
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
const PLAYER_LOOKUP_CACHE_PREFIX = "pjskPlayerLookupCacheV3:";

function lookupCacheKey(uid, region) {
  return PLAYER_LOOKUP_CACHE_PREFIX + region + ":" + uid;
}
function readLookupCache(uid, region) {
  try {
    const saved = JSON.parse(localStorage.getItem(lookupCacheKey(uid, region)) || "null");
    if (!saved?.profile?.data || typeof saved.profile.data !== "object") return null;
    return {
      profile: { ...saved.profile, cached: true },
    };
  } catch { return null; }
}
function saveLookupCache(uid, region, profile) {
  try {
    localStorage.setItem(lookupCacheKey(uid, region), JSON.stringify({
      profile: {
        data: profile.data,
        uid: profile.uid,
        region: profile.region,
        source: profile.source,
        fetchedAt: profile.fetchedAt,
      },
      savedAt: Date.now(),
    }));
  } catch {
    // Storage quota or serialization errors must not break player lookup.
  }
}

function messageFor(error) {
  if (error?.code === "UID_INVALID") return "UID 格式錯誤 請只輸入數字";
  if (error?.code === "UPSTREAM_HTTP_ERROR") {
    if (error.details?.status === 409) return "這個 UID 在多個伺服器找到資料 暫時無法自動判斷伺服器";
    if (error.details?.status === 503) return "部分伺服器暫時無法查詢 請稍後再試";
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
async function lookup(rawUid) {
  const generation = ++lookupGeneration;
  const uid = String(rawUid ?? "").trim();
  const region = "auto";
  try { localStorage.setItem("pjskLastPlayerLookup", JSON.stringify({ uid, region })); } catch {}
  const input = $("#playerUid");
  if (input) input.value = uid;
  if (button) { button.disabled = true; button.textContent = "查詢中"; }
  if (status) status.textContent = "正在自動檢查五個伺服器的公開資料";
  const saved = readLookupCache(uid, region);
  if (saved) {
    renderProfile(saved.profile);
    if (status) status.textContent = "已還原上次查詢資料 正在背景更新";
  } else {
    results?.replaceChildren();
    if (status) status.textContent = "正在自動檢查五個伺服器的公開資料";
  }
  try {
    const result = await provider.getProfileAuto(uid);
    renderProfile(result);
    saveLookupCache(uid, region, result);
    if (status) status.textContent = "查詢完成 以下為資料來源提供的公開內容";
    window.PJSEKAI?.toast(result.cached ? "已載入快取玩家資料" : "玩家資料已載入");
  } catch (error) {
    if (saved) {
      if (status) status.textContent = "已保留上次查詢資料 本次更新失敗 " + messageFor(error);
    } else {
      if (status) status.textContent = messageFor(error);
      window.PJSEKAI?.toast(messageFor(error));
    }
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


// Restore the most recent player lookup after a refresh without changing the
// currently selected page.
try {
  const savedLookup = JSON.parse(localStorage.getItem("pjskLastPlayerLookup") || "null");
  if (savedLookup && /^[0-9]{1,20}$/.test(String(savedLookup.uid || ""))) {
    $("#playerUid").value = String(savedLookup.uid);
    $("#homePlayerUid").value = String(savedLookup.uid);
    lookup(savedLookup.uid);
  }
} catch {}
