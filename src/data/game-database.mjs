export const REGION_REPOSITORIES = Object.freeze({
  jp: "sekai-master-db-diff",
  tw: "sekai-master-db-tc-diff",
  en: "sekai-master-db-en-diff",
  kr: "sekai-master-db-kr-diff",
  cn: "sekai-master-db-cn-diff"
});

export const GAME_DATABASE_FILES = Object.freeze([
  "cards",
  "gameCharacters",
  "characterProfiles",
  "cardRarities",
  "skills",
  "honors",
  "honorGroups",
  "events",
  "eventCards", "eventDeckBonuses", "eventTotalPowerLimits", "eventSkillScoreUpLimits", "eventRarityBonusRates", "musics", "musicDifficulties"
]);

export const GAME_DATABASE_BUNDLES = Object.freeze({
  cards: Object.freeze(["cards", "gameCharacters", "characterProfiles", "cardRarities", "skills"]),
  characters: Object.freeze(["gameCharacters", "characterProfiles"]),
  honors: Object.freeze(["honors", "honorGroups", "gameCharacters"]),
  events: Object.freeze(["events", "eventCards", "eventDeckBonuses", "eventTotalPowerLimits", "eventSkillScoreUpLimits", "eventRarityBonusRates", "cards", "gameCharacters"]),
  score: Object.freeze(["musics", "musicDifficulties"])
});

const DATA_ROOT = "https://sekai-world.github.io";
const DEFAULT_TTL = 6 * 60 * 60 * 1000;
const CACHE_DB = "pjsk-game-database";
const CACHE_STORE = "regional-data";

function isRecordArray(value) {
  return Array.isArray(value) && value.every((item) => item && typeof item === "object" && !Array.isArray(item));
}

function createIndexedDbCache(indexedDBImpl) {
  if (!indexedDBImpl?.open) return null;

  let databasePromise;
  const open = () => {
    if (!databasePromise) {
      databasePromise = new Promise((resolve) => {
        try {
          const request = indexedDBImpl.open(CACHE_DB, 1);
          request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(CACHE_STORE)) {
              request.result.createObjectStore(CACHE_STORE);
            }
          };
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => resolve(null);
          request.onblocked = () => resolve(null);
        } catch {
          resolve(null);
        }
      });
    }
    return databasePromise;
  };

  return {
    async get(key) {
      const db = await open();
      if (!db) return null;
      return new Promise((resolve) => {
        try {
          const request = db.transaction(CACHE_STORE, "readonly").objectStore(CACHE_STORE).get(key);
          request.onsuccess = () => resolve(request.result || null);
          request.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      });
    },
    async set(key, value) {
      const db = await open();
      if (!db) return false;
      return new Promise((resolve) => {
        try {
          const transaction = db.transaction(CACHE_STORE, "readwrite");
          transaction.objectStore(CACHE_STORE).put(value, key);
          transaction.oncomplete = () => resolve(true);
          transaction.onerror = () => resolve(false);
          transaction.onabort = () => resolve(false);
        } catch {
          resolve(false);
        }
      });
    }
  };
}

export function createGameDatabaseClient({
  fetchImpl = globalThis.fetch,
  cache = createIndexedDbCache(globalThis.indexedDB),
  now = () => Date.now(),
  ttl = DEFAULT_TTL
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl 必須是函式");

  const inFlight = new Map();

  async function loadDataset(region, file, { force = false } = {}) {
    const repository = REGION_REPOSITORIES[region];
    if (!repository) throw new RangeError("不支援的伺服器：" + region);
    if (!GAME_DATABASE_FILES.includes(file)) throw new RangeError("不支援的資料集：" + file);

    const key = region + ":" + file;
    if (!force && inFlight.has(key)) return inFlight.get(key);

    const task = (async () => {
      const cached = await cache?.get(key);
      const isFresh = cached && isRecordArray(cached.data) && now() - cached.savedAt < ttl;
      if (!force && isFresh) {
        return { data: cached.data, region, file, source: "cache", updatedAt: cached.savedAt };
      }

      const url = DATA_ROOT + "/" + repository + "/" + file + ".json";
      try {
        const response = await fetchImpl(url, { headers: { Accept: "application/json" } });
        if (!response?.ok) throw new Error("資料來源回應 " + (response?.status ?? "無狀態碼"));
        const data = await response.json();
        if (!isRecordArray(data)) throw new TypeError(file + ".json 格式不正確");
        const savedAt = now();
        await cache?.set(key, { data, savedAt });
        return { data, region, file, source: "network", updatedAt: savedAt };
      } catch (error) {
        if (cached && isRecordArray(cached.data)) {
          return {
            data: cached.data,
            region,
            file,
            source: "stale-cache",
            updatedAt: cached.savedAt,
            warning: error instanceof Error ? error.message : "更新失敗"
          };
        }
        throw error;
      }
    })();

    inFlight.set(key, task);
    try {
      return await task;
    } finally {
      if (inFlight.get(key) === task) inFlight.delete(key);
    }
  }

  async function loadBundle(region, bundle, options) {
    const files = GAME_DATABASE_BUNDLES[bundle];
    if (!files) throw new RangeError("不支援的資料組合：" + bundle);
    const results = await Promise.all(files.map((file) => loadDataset(region, file, options)));
    return {
      region,
      bundle,
      datasets: Object.fromEntries(results.map((result) => [result.file, result.data])),
      sources: Object.fromEntries(results.map((result) => [result.file, result.source])),
      warnings: results.filter((result) => result.warning).map((result) => ({ file: result.file, message: result.warning })),
      updatedAt: Math.min(...results.map((result) => result.updatedAt))
    };
  }

  return Object.freeze({ loadDataset, loadBundle });
}

export const gameDatabaseClient = createGameDatabaseClient();
