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
  "totalPower", "total_power", "teamPower", "team_power",
  "power", "powerValue", "power_value",
]);

export function extractPlayerPower(data) {
  const root = asObject(data) || {};
  const gameData = asObject(root.userGamedata)
    || asObject(root.user_gamedata)
    || asObject(root.user)
    || root;
  const profile = asObject(root.userProfile)
    || asObject(root.user_profile)
    || asObject(root.profile)
    || {};
  const decks = Array.isArray(root.userDecks) ? root.userDecks
    : Array.isArray(root.user_decks) ? root.user_decks : [];
  // Prefer account/profile-level totals; only use published deck totals as fallback.
  // Never sum individual card power values or character stats.
  return firstValue([gameData, profile, root, ...decks], PLAYER_POWER_KEYS);
}
