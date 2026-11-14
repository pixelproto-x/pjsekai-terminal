const DEFAULT_NAMESPACE = "pjsekai-player-hub";
const DEFAULT_VERSION = "1";

export function createCache({
  storage = globalThis.localStorage ?? null,
  namespace = DEFAULT_NAMESPACE,
  version = DEFAULT_VERSION,
  now = () => Date.now(),
} = {}) {
  const memory = new Map();
  const prefix = namespace + ":" + version + ":";

  function readStorage(key) {
    try {
      const raw = storage?.getItem(prefix + key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writeStorage(key, value) {
    try { storage?.setItem(prefix + key, JSON.stringify(value)); } catch {}
  }

  function get(key) {
    const item = memory.get(key) ?? readStorage(key);
    if (!item || typeof item.expiresAt !== "number" || item.expiresAt <= now()) {
      memory.delete(key);
      try { storage?.removeItem(prefix + key); } catch {}
      return null;
    }
    memory.set(key, item);
    return item.value;
  }

  function set(key, value, ttlMs) {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new TypeError("ttlMs must be a positive finite number.");
    }
    const item = { value, expiresAt: now() + ttlMs };
    memory.set(key, item);
    writeStorage(key, item);
    return value;
  }

  function remove(key) {
    memory.delete(key);
    try { storage?.removeItem(prefix + key); } catch {}
  }

  function clear() {
    memory.clear();
    if (!storage) return;
    try {
      const keys = [];
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (key?.startsWith(prefix)) keys.push(key);
      }
      keys.forEach((key) => storage.removeItem(key));
    } catch {}
  }

  return Object.freeze({ get, set, remove, clear });
}
