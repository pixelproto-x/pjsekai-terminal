const GOOGLE_CLIENT_ID = "724422617291-j4req87o5hn7bckbpom1fnpflqumbl2q.apps.googleusercontent.com";
const API_BASE = "https://pjsekai-player-api.a0983439343.workers.dev";
const ACCOUNT_SCOPE_KEY = "pjskCloudAccountSub";
const SYNC_KEYS = [
  "sekaiTheme", "sekaiGlassOpacity", "pjskAnniversaryCover", "pjskUiStateV1",
  "pjskSongFavorites", "pjskSongRecords", "pjskSongPlaylists", "pjskSongRegion", "pjskSongViewV1",
  "pjskSavedPlayersV1", "pjskPlayerHistoryV1", "pjskLastPlayerLookup"
];
let idToken = "";
let syncTimer = 0;
let applyingCloud = false;

const button = document.getElementById("googleAccountButton");
const status = document.getElementById("googleAccountStatus");
const signOutButton = document.getElementById("googleAccountSignOut");
function showStatus(message) {
  if (status) status.textContent = message;
}
function googleSubject(token) {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(payload)).sub || "";
  } catch {
    return "";
  }
}
function snapshot() {
  const data = {};
  for (const key of SYNC_KEYS) {
    const value = localStorage.getItem(key);
    if (value !== null) data[key] = value;
  }
  return data;
}
function applySnapshot(data) {
  let changed = false;
  applyingCloud = true;
  try {
    for (const key of SYNC_KEYS) {
      const hasValue = Object.prototype.hasOwnProperty.call(data, key);
      const nextValue = hasValue ? String(data[key]) : null;
      const currentValue = localStorage.getItem(key);
      if (currentValue !== nextValue) changed = true;
      if (hasValue) localStorage.setItem(key, nextValue);
      else localStorage.removeItem(key);
    }
  } finally {
    applyingCloud = false;
  }
  if (changed) {
    showStatus("雲端資料已載入，正在套用設定…");
    window.location.reload();
    return;
  }
  showStatus("雲端資料已同步");
}
async function api(method, body) {
  const response = await fetch(API_BASE + "/api/account/data", {
    method,
    headers: {
      Authorization: "Bearer " + idToken,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "SYNC_FAILED");
  return payload;
}
async function syncNow() {
  if (!idToken || applyingCloud) return;
  try {
    await api("PUT", { data: snapshot() });
    showStatus("已同步至 Google 帳號");
  } catch (error) {
    showStatus("同步失敗：" + error.message);
  }
}
function scheduleSync() {
  if (!idToken || applyingCloud) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncNow, 900);
}
function signOut() {
  idToken = "";
  clearTimeout(syncTimer);
  window.google?.accounts?.id?.disableAutoSelect?.();
  if (signOutButton) signOutButton.hidden = true;
  if (button) {
    button.textContent = "使用 Google 登入";
    button.disabled = false;
  }
  showStatus("尚未登入");
}
async function onGoogleCredential(response) {
  idToken = response.credential || "";
  if (!idToken) return showStatus("Google 登入沒有回傳身分憑證");
  if (button) button.disabled = true;
  showStatus("正在載入雲端資料…");
  try {
    const subject = googleSubject(idToken);
    if (!subject) throw new Error("GOOGLE_IDENTITY_INVALID");
    const previousSubject = localStorage.getItem(ACCOUNT_SCOPE_KEY);
    if (previousSubject && previousSubject !== subject) {
      for (const key of SYNC_KEYS) localStorage.removeItem(key);
      showStatus("正在切換 Google 帳號並隔離本機資料…");
    }
    const cloud = await api("GET");
    const cloudData = cloud.data || {};
    const hasCloudData = Object.keys(cloudData).length > 0;
    const localData = snapshot();
    if (hasCloudData) {
      applySnapshot(cloudData);
    } else {
      await api("PUT", { data: localData });
      showStatus("已將這台裝置的資料首次備份至雲端");
    }
    localStorage.setItem(ACCOUNT_SCOPE_KEY, subject);
    if (button) {
      button.textContent = "已連結 Google 帳號";
      button.disabled = false;
    }
    if (signOutButton) signOutButton.hidden = false;
    window.PJSEKAI?.toast("Google 帳號已連結");
  } catch (error) {
    idToken = "";
    if (signOutButton) signOutButton.hidden = true;
    showStatus("登入成功，但資料同步失敗：" + error.message);
    if (button) button.disabled = false;
  }
}
window.addEventListener("storage", (event) => {
  if (SYNC_KEYS.includes(event.key)) scheduleSync();
});
document.addEventListener("input", scheduleSync);
document.addEventListener("change", scheduleSync);
document.addEventListener("click", scheduleSync);
window.addEventListener("pagehide", () => {
  if (idToken) {
    const payload = JSON.stringify({ data: snapshot() });
    const headers = new Headers({ Authorization: "Bearer " + idToken, "Content-Type": "application/json" });
    try { fetch(API_BASE + "/api/account/data", { method: "PUT", headers, body: payload, keepalive: true }); } catch {}
  }
});

async function initializeGoogleSignIn() {
  if (!button) return;
  try {
    await new Promise((resolve, reject) => {
      if (window.google?.accounts?.id) return resolve();
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    });
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: onGoogleCredential,
      auto_select: true,
      cancel_on_tap_outside: false
    });
    window.google.accounts.id.renderButton(button, {
      type: "standard", theme: "outline", size: "large",
      text: "signin_with", shape: "pill", width: 210
    });
    window.google.accounts.id.prompt();
    showStatus("可使用 Google 帳號登入並同步資料");
  } catch {
    showStatus("Google 登入元件載入失敗，請檢查網路後重新整理");
  }
}
signOutButton?.addEventListener("click", signOut);
initializeGoogleSignIn();
