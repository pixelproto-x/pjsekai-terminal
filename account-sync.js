const GOOGLE_CLIENT_ID = "724422617291-j4req87o5hn7bckbpom1fnpflqumbl2q.apps.googleusercontent.com";
const API_BASE = "https://pjsekai-player-api.a0983439343.workers.dev";
const ACCOUNT_SCOPE_KEY = "pjskCloudAccountSub";
const ACCESS_TOKEN_SESSION_KEY = "pjskGoogleAccessToken";
const ACCESS_TOKEN_EXPIRES_AT_KEY = "pjskGoogleAccessTokenExpiresAt";
const SYNC_KEYS = [
  "sekaiTheme", "sekaiGlassOpacity", "pjskAnniversaryCover",
  "pjskSongFavorites", "pjskSongRecords", "pjskSongPlaylists",
  "pjskSongRegion", "pjskSongViewV1", "pjskUiStateV1",
  "pjskLastPlayerLookup", "pjskSavedPlayersV2", "pjskPlayerHistoryV1"
];

let accessToken = "";
let applyingCloud = false;
let syncRunning = false;
let syncQueued = false;
let lastCloudUpdatedAt = null;
let cloudPollTimer = 0;

const button = document.getElementById("googleAccountButton");
const status = document.getElementById("googleAccountStatus");
const signOutButton = document.getElementById("googleAccountSignOut");

function showStatus(message) {
  if (status) status.textContent = message;
}

function snapshot() {
  const data = {};
  for (const key of SYNC_KEYS) {
    const value = localStorage.getItem(key);
    if (value === null) continue;

    // The active page and scroll position belong to this device, never the account.
    if (key === "pjskUiStateV1") {
      try {
        const state = JSON.parse(value);
        if (state && typeof state === "object" && !Array.isArray(state)) {
          const { activePage, scrollY, ...sharedState } = state;
          data[key] = JSON.stringify(sharedState);
        }
      } catch {}
      continue;
    }
    data[key] = value;
  }
  return data;
}

function applySnapshot(data) {
  applyingCloud = true;
  try {
    for (const key of SYNC_KEYS) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        if (key === "pjskUiStateV1") {
          // Merge shared controls while retaining this device's own route and scroll.
          let localState = {};
          let incomingState = {};
          try {
            localState = JSON.parse(localStorage.getItem(key) || "{}") || {};
            incomingState = JSON.parse(String(data[key]) || "{}") || {};
          } catch {}
          const mergedState = {
            ...incomingState,
            activePage: localState.activePage || "home",
            scrollY: Number(localState.scrollY) || 0,
            savedAt: localState.savedAt || incomingState.savedAt || Date.now()
          };
          localStorage.setItem(key, JSON.stringify(mergedState));
        } else {
          localStorage.setItem(key, String(data[key]));
        }
      } else if (key !== "pjskUiStateV1") {
        localStorage.removeItem(key);
      }
    }
  } finally {
    applyingCloud = false;
  }

  // Update visible controls and lists in place. Do not reload the whole page:
  // a reload resets scroll position, animations and the user's current view.
  window.PJSEKAI?.applyCloudSettings?.();
  window.PJSEKAI?.applyCloudUiState?.();
  window.PJSEKAI?.refreshCloudSongData?.();
  window.dispatchEvent(new Event("pjsk:cloud-data-applied"));
}

function clearGoogleSession(message = "Google 登入已逾期，請重新登入") {
  accessToken = "";
  sessionStorage.removeItem(ACCESS_TOKEN_SESSION_KEY);
  sessionStorage.removeItem(ACCESS_TOKEN_EXPIRES_AT_KEY);
  clearInterval(cloudPollTimer);
  cloudPollTimer = 0;
  syncQueued = false;
  if (signOutButton) signOutButton.hidden = true;
  if (button) {
    button.textContent = "使用 Google 登入";
    button.disabled = false;
  }
  showStatus(message);
}

async function api(method, body) {
  const response = await fetch(API_BASE + "/api/account/data", {
    method,
    headers: {
      Authorization: "Bearer " + accessToken,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) {
    clearGoogleSession();
    const error = new Error("GOOGLE_AUTH_EXPIRED");
    error.status = 401;
    throw error;
  }
  if (!response.ok) throw new Error(payload.error || "SYNC_FAILED");
  return payload;
}

// Serialize writes. A slow earlier request can no longer finish after a newer
// request and overwrite the newer snapshot.
async function syncNow() {
  if (!accessToken || applyingCloud) return;
  if (syncRunning) {
    syncQueued = true;
    return;
  }

  syncRunning = true;
  try {
    do {
      syncQueued = false;
      const result = await api("PUT", { data: snapshot() });
      lastCloudUpdatedAt = result.updatedAt || lastCloudUpdatedAt;
    } while (syncQueued && accessToken);
    showStatus("已即時同步至 Google 帳號");
  } catch (error) {
    showStatus("同步失敗：" + error.message);
  } finally {
    syncRunning = false;
  }
}

function scheduleSync() {
  if (!accessToken || applyingCloud) return;
  syncQueued = true;
  syncNow();
}

async function pullCloudChanges() {
  if (!accessToken || applyingCloud || syncRunning || syncQueued) return;
  try {
    const cloud = await api("GET");
    if (!accessToken || syncQueued || syncRunning) return;
    if (cloud.accountSub !== localStorage.getItem(ACCOUNT_SCOPE_KEY)) return;
    if (cloud.updatedAt && cloud.updatedAt !== lastCloudUpdatedAt) {
      lastCloudUpdatedAt = cloud.updatedAt;
      applySnapshot(cloud.data || {});
      showStatus("已接收其他裝置的最新變更");
    }
  } catch {
    // A temporary network failure must not interrupt the local interface.
  }
}

// Watch only actual changes to allowlisted persistent data. Clicks, scrolling,
// typing in unrelated fields and page navigation must not upload a snapshot.
const originalSetItem = Storage.prototype.setItem;
const originalRemoveItem = Storage.prototype.removeItem;
Storage.prototype.setItem = function(key, value) {
  const oldValue = this.getItem(String(key));
  originalSetItem.call(this, key, value);
  if (this === localStorage && SYNC_KEYS.includes(String(key)) &&
      oldValue !== String(value)) scheduleSync();
};
Storage.prototype.removeItem = function(key) {
  const oldValue = this.getItem(String(key));
  originalRemoveItem.call(this, key);
  if (this === localStorage && SYNC_KEYS.includes(String(key)) &&
      oldValue !== null) scheduleSync();
};

function signOut() {
  clearGoogleSession("尚未登入");
}

const ACCOUNT_BACKUP_PREFIX = "pjskCloudBackup:";

function readAccountBackup(subject) {
  try {
    const saved = localStorage.getItem(ACCOUNT_BACKUP_PREFIX + subject);
    const data = saved ? JSON.parse(saved) : {};
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

async function finishAccountConnection(cloud) {
  const subject = String(cloud.accountSub || "");
  if (!subject) throw new Error("GOOGLE_IDENTITY_INVALID");

  const previousSubject = localStorage.getItem(ACCOUNT_SCOPE_KEY);
  const localData = snapshot();
  let accountLocalData = localData;

  if (previousSubject && previousSubject !== subject) {
    // Preserve the previous account's local copy before changing account scope.
    // Never merge one Google account's settings into another account.
    try {
      localStorage.setItem(ACCOUNT_BACKUP_PREFIX + previousSubject, JSON.stringify(localData));
    } catch {}
    accountLocalData = readAccountBackup(subject);
    showStatus("正在切換 Google 帳號並載入該帳號的資料…");
  }

  lastCloudUpdatedAt = cloud.updatedAt || null;
  const cloudData = cloud.data || {};
  // Cloud values win, while account-scoped local backups fill keys not yet in
  // the cloud. This also prevents a newly selected account from inheriting
  // the previous account's local settings.
  const mergedData = { ...accountLocalData, ...cloudData };
  const missingCloudKeys = Object.keys(mergedData).some(
    (key) => !Object.prototype.hasOwnProperty.call(cloudData, key)
  );

  if (Object.keys(cloudData).length) {
    if (missingCloudKeys) await api("PUT", { data: mergedData });
    applySnapshot(mergedData);
  } else {
    await api("PUT", { data: mergedData });
    applySnapshot(mergedData);
    showStatus("已將這台裝置的資料首次備份至雲端");
  }

  localStorage.setItem(ACCOUNT_SCOPE_KEY, subject);
  if (button) {
    button.textContent = "已連結 Google 帳號";
    button.disabled = false;
  }
  if (signOutButton) signOutButton.hidden = false;
  if (!cloudPollTimer) cloudPollTimer = window.setInterval(pullCloudChanges, 15000);
}

async function onGoogleCredential(response) {
  accessToken = response.access_token || "";
  if (!accessToken) {
    if (button) button.disabled = false;
    showStatus(response.error ? "Google 登入未完成：" + response.error : "Google 沒有回傳授權權杖");
    return;
  }

  sessionStorage.setItem(ACCESS_TOKEN_SESSION_KEY, accessToken);
  const expiresIn = Number(response.expires_in);
  if (Number.isFinite(expiresIn) && expiresIn > 0) {
    // Leave a 60-second safety margin before Google's one-hour token expiry.
    sessionStorage.setItem(ACCESS_TOKEN_EXPIRES_AT_KEY, String(Date.now() + Math.max(0, expiresIn - 60) * 1000));
  } else {
    sessionStorage.removeItem(ACCESS_TOKEN_EXPIRES_AT_KEY);
  }
  if (button) button.disabled = true;
  showStatus("正在載入雲端資料…");
  try {
    await finishAccountConnection(await api("GET"));
    window.PJSEKAI?.toast("Google 帳號已連結");
  } catch (error) {
    clearGoogleSession(error.status === 401
      ? "Google 授權無效，請重新登入"
      : "登入成功，但資料同步失敗：" + error.message);
    if (button) button.disabled = false;
  }
}

window.addEventListener("storage", (event) => {
  if (SYNC_KEYS.includes(event.key)) scheduleSync();
});
window.addEventListener("focus", pullCloudChanges);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") pullCloudChanges();
});

async function initializeGoogleSignIn() {
  if (!button) return;
  try {
    await new Promise((resolve, reject) => {
      if (window.google?.accounts?.oauth2) return resolve();
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    });

    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: "openid email profile",
      callback: onGoogleCredential,
      error_callback: (error) => {
        if (error.type === "popup_closed") showStatus("已取消 Google 登入");
        else showStatus("Google 登入視窗無法開啟，請允許彈出式視窗後重試");
        if (button) button.disabled = false;
      }
    });

    button.addEventListener("click", () => {
      if (button.disabled) return;
      button.disabled = true;
      showStatus("正在開啟 Google 帳號授權視窗…");
      tokenClient.requestAccessToken({ prompt: "select_account" });
    });
    showStatus("按下按鈕即可使用 Google 帳號登入並同步資料");
  } catch {
    showStatus("Google 登入元件載入失敗，請檢查網路後重新整理");
  }
}

async function restoreSession() {
  const savedToken = sessionStorage.getItem(ACCESS_TOKEN_SESSION_KEY);
  if (!savedToken) return;

  const expiresAt = Number(sessionStorage.getItem(ACCESS_TOKEN_EXPIRES_AT_KEY));
  // Tokens saved before expiry tracking was added are deliberately not reused.
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() + 30000) {
    clearGoogleSession();
    return;
  }

  accessToken = savedToken;
  if (button) button.disabled = true;
  showStatus("正在確認 Google 登入狀態…");
  try {
    await finishAccountConnection(await api("GET"));
    showStatus("Google 帳號已連結，雲端設定與資料已同步");
    if (!cloudPollTimer) cloudPollTimer = window.setInterval(pullCloudChanges, 15000);
  } catch {
    clearGoogleSession();
  }
}

signOutButton?.addEventListener("click", () => {
  if (!accessToken) return;
  if (!window.confirm("確定要登出 Google 帳號嗎？登出後將停止雲端同步。")) return;
  signOut();
});
initializeGoogleSignIn().then(() => restoreSession());
