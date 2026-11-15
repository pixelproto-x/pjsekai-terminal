function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function firstValue(objects, keys) {
  for (const object of objects) {
    for (const key of keys) {
      const value = object?.[key];
      if (value !== undefined && value !== null && value !== "" && typeof value !== "object") {
        return value;
      }
    }
  }
  return null;
}

export function extractPlayerIdentity(data, fallbackUid = "") {
  const root = asObject(data) || {};
  const gameData = asObject(root.userGamedata)
    || asObject(root.user_gamedata)
    || asObject(root.user)
    || root;
  const profile = asObject(root.userProfile)
    || asObject(root.user_profile)
    || asObject(root.profile);

  const records = [gameData, profile, root];
  return {
    name: firstValue(records, ["name", "nickname", "userName", "playerName", "displayName"]) || "未提供名稱",
    uid: String(firstValue([gameData, profile, root], ["userId", "user_id", "playerId", "player_id"]) ?? fallbackUid),
    // Project SEKAI stores the player's account level in userGamedata.rank.
    // Do not search nested cards/characters: their level/rank fields are unrelated.
    level: firstValue([gameData], ["rank", "level", "userLevel", "user_level"]),
  };
}

const PLAYER_RANKING_KEYS = Object.freeze([
  "playerRank", "player_rank", "userRank", "user_rank",
  "ranking", "rankingPosition", "ranking_position",
  "rankPosition", "rank_position", "eventRank", "event_rank",
]);

export function extractPlayerRanking(data) {
  const root = asObject(data) || {};
  const gameData = asObject(root.userGamedata)
    || asObject(root.user_gamedata)
    || asObject(root.user)
    || root;
  const profile = asObject(root.userProfile)
    || asObject(root.user_profile)
    || asObject(root.profile)
    || {};
  return firstValue([gameData, profile, root], PLAYER_RANKING_KEYS);
}


const PLAYER_POWER_KEYS = Object.freeze([
  "totalPower", "total_power", "totalPowerValue", "total_power_value",
  "teamPower", "team_power", "teamTalent", "team_talent",
  "totalTalent", "total_talent", "talentPower", "talent_power",
  "deckPower", "deck_power", "powerValue", "power_value", "power", "talent",
]);
const DECK_CONTAINER_KEYS = Object.freeze([
  "userDecks", "user_decks", "decks", "team", "teams",
  "mainTeam", "main_team", "userTeam", "user_team",
  "deck", "userDeck", "user_deck", "deckInfo", "teamInfo",
  "data", "result", "profile", "userProfile", "user_profile",
  "userGamedata", "user_gamedata", "player", "user",
]);
const NON_DECK_KEYS = /card|character|member|support|leader/i;

function publishedDeckPower(value, depth = 0, seen = new WeakSet()) {
  if (depth > 6 || value == null) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = publishedDeckPower(item, depth + 1, seen);
      if (found != null) return found;
    }
    return null;
  }
  const object = asObject(value);
  if (!object || seen.has(object)) return null;
  seen.add(object);
  const direct = firstValue([object], PLAYER_POWER_KEYS);
  if (direct != null && Number.isFinite(Number(direct)) && Number(direct) > 0) return direct;
  for (const key of DECK_CONTAINER_KEYS) {
    if (NON_DECK_KEYS.test(key)) continue;
    const child = object[key];
    if (child && typeof child === "object") {
      const found = publishedDeckPower(child, depth + 1, seen);
      if (found != null) return found;
    }
  }
  for (const [key, child] of Object.entries(object)) {
    if (/^\d+$/.test(key) && child && typeof child === "object") {
      const found = publishedDeckPower(child, depth + 1, seen);
      if (found != null) return found;
    }
  }
  return null;
}

export function extractPlayerPower(data) {
  const root = asObject(data) || {};
  const roots = [root];
  for (const key of ["data", "result", "profile", "userProfile", "user_profile", "player", "user"]) {
    const child = asObject(root[key]);
    if (child) roots.push(child);
  }
  const gameData = roots.map((item) => asObject(item.userGamedata)
    || asObject(item.user_gamedata)).filter(Boolean);
  const profile = roots.map((item) => asObject(item.userProfile)
    || asObject(item.user_profile)).filter(Boolean);
  const accountObjects = [...gameData, ...profile, ...roots];
  const accountPower = firstValue(accountObjects, PLAYER_POWER_KEYS);
  if (accountPower != null && Number.isFinite(Number(accountPower)) && Number(accountPower) > 0) {
    return accountPower;
  }
  for (const item of roots) {
    const found = publishedDeckPower(item.userDecks ?? item.user_decks ?? item.decks
      ?? item.team ?? item.teams ?? item.mainTeam ?? item.main_team);
    if (found != null) return found;
  }
  return null;
}
