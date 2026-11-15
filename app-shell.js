const $ = (selector, root = document) => root.querySelector(selector);
const pages = [...document.querySelectorAll(".page")];
const tabs = [...document.querySelectorAll(".tab")];
const bottomBar = $(".bottom-bar");
const tabIndicator = $(".tab-indicator");

// Preserve the current interface state across refreshes.
const UI_STATE_KEY = "pjskUiStateV1";
function readUiState() {
  try {
    const value = JSON.parse(localStorage.getItem(UI_STATE_KEY) || "null");
    return value && typeof value === "object" ? value : {};
  } catch { return {}; }
}
const savedUiState = readUiState();
let uiStateSaveTimer = 0;
function saveUiState() {
  clearTimeout(uiStateSaveTimer);
  const controls = {};
  document.querySelectorAll("input[id],select[id],textarea[id]").forEach((element) => {
    if (element.type === "password" || element.type === "file") return;
    controls[element.id] = element.type === "checkbox" || element.type === "radio"
      ? { checked: element.checked, value: element.value }
      : element.value;
  });
  const activePage = document.querySelector(".page.active")?.dataset.page || "home";
  try {
    localStorage.setItem(UI_STATE_KEY, JSON.stringify({
      controls,
      activePage,
      scrollY: window.scrollY,
      savedAt: Date.now(),
    }));
  } catch {}
}
function restoreUiState() {
  for (const [id, saved] of Object.entries(savedUiState.controls || {})) {
    const element = document.getElementById(id);
    if (!element) continue;
    if (saved && typeof saved === "object" && "checked" in saved) {
      element.checked = Boolean(saved.checked);
      if (saved.value != null) element.value = saved.value;
    } else if (typeof saved === "string" || typeof saved === "number") {
      element.value = String(saved);
    }
  }
}
restoreUiState();
let restoreScrollY = Number(savedUiState.scrollY) || 0;
let restoreScrollPending = true;
function restoreSavedScroll() {
  if (!restoreScrollPending) return;
  restoreScrollPending = false;
  if (restoreScrollY > 0) window.scrollTo({ top: restoreScrollY, behavior: "instant" });
}
function scheduleUiStateSave() {
  clearTimeout(uiStateSaveTimer);
  uiStateSaveTimer = setTimeout(saveUiState, 180);
}
document.addEventListener("input", scheduleUiStateSave, { passive: true });
document.addEventListener("change", scheduleUiStateSave);
window.addEventListener("pagehide", saveUiState);
window.addEventListener("beforeunload", saveUiState);

function syncTabIndicator() {
  const activeTab = tabs.find((tab) => tab.classList.contains("active"));
  if (!bottomBar || !tabIndicator || !activeTab) return;
  const barRect = bottomBar.getBoundingClientRect();
  const tabRect = activeTab.getBoundingClientRect();
  const left = tabRect.left - barRect.left - bottomBar.clientLeft;
  tabIndicator.style.setProperty("--tab-left", left + "px");
  tabIndicator.style.setProperty("--tab-w", tabRect.width + "px");
}

let indicatorDrag = null;
let suppressNextNavClick = false;
function nearestTabAt(clientX) {
  return tabs.reduce((nearest, tab) => {
    const rect = tab.getBoundingClientRect();
    const distance = Math.abs(clientX - (rect.left + rect.width / 2));
    return !nearest || distance < nearest.distance ? { tab, distance } : nearest;
  }, null)?.tab;
}

if (bottomBar && tabIndicator) {
  // Listen on the navigation container, not the decorative span. This remains
  // reliable when a tab or pseudo-element wins hit-testing over the bubble.
  bottomBar.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    const indicatorRect = tabIndicator.getBoundingClientRect();
    const insideIndicator = event.clientX >= indicatorRect.left &&
      event.clientX <= indicatorRect.right &&
      event.clientY >= indicatorRect.top &&
      event.clientY <= indicatorRect.bottom;
    if (!insideIndicator) return;

    const barRect = bottomBar.getBoundingClientRect();
    indicatorDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      offsetX: event.clientX - indicatorRect.left,
      barLeft: barRect.left + bottomBar.clientLeft,
      maxLeft: bottomBar.clientWidth - indicatorRect.width,
      moved: false,
    };
    suppressNextNavClick = false;
    bottomBar.classList.add("is-dragging");
    bottomBar.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  bottomBar.addEventListener("pointermove", (event) => {
    if (!indicatorDrag || event.pointerId !== indicatorDrag.pointerId) return;
    const deltaX = Math.abs(event.clientX - indicatorDrag.startX);
    if (deltaX > 4) indicatorDrag.moved = true;
    const left = Math.max(0, Math.min(indicatorDrag.maxLeft,
      event.clientX - indicatorDrag.barLeft - indicatorDrag.offsetX));
    tabIndicator.style.setProperty("--tab-left", left + "px");
  });

  const finishIndicatorDrag = (event, shouldNavigate) => {
    if (!indicatorDrag || event.pointerId !== indicatorDrag.pointerId) return;
    const nearest = nearestTabAt(event.clientX);
    suppressNextNavClick = indicatorDrag.moved;
    indicatorDrag = null;
    bottomBar.classList.remove("is-dragging");
    if (shouldNavigate && nearest) go(nearest.dataset.go);
    else syncTabIndicator();
  };
  bottomBar.addEventListener("pointerup", (event) => finishIndicatorDrag(event, true));
  bottomBar.addEventListener("pointercancel", (event) => finishIndicatorDrag(event, false));
  bottomBar.addEventListener("lostpointercapture", (event) => finishIndicatorDrag(event, false));
  bottomBar.addEventListener("click", (event) => {
    if (!suppressNextNavClick) return;
    suppressNextNavClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
}
const validRoutes = new Set(pages.map((page) => page.dataset.page));
const themeNames = {
  "virtual-singer": "虛擬歌手",
  "leo-need": "Leo need",
  "more-more-jump": "MORE MORE JUMP",
  "vivid-bad-squad": "Vivid BAD SQUAD",
  "wonderlands-showtime": "Wonderlands Showtime",
  nightcord: "25時 Nightcord",
};
let toastTimer;

export function go(route, updateHash = true) {
  const next = validRoutes.has(route) ? route : "home";
  pages.forEach((page) => page.classList.toggle("active", page.dataset.page === next));
  tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.go === next));
  syncTabIndicator();
  if (updateHash && location.hash !== "#" + next) history.replaceState({}, "", "#" + next);
  restoreScrollPending = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
  saveUiState();
}
window.PJSEKAI = { go, toast };

function toast(message) {
  const node = $("#toast");
  if (!node) return;
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("show"), 2300);
}
window.PJSEKAI.toast = toast;

document.addEventListener("click", (event) => {
  const nav = event.target.closest("[data-go]");
  if (nav) {
    event.preventDefault();
    go(nav.dataset.go);
    return;
  }
  const theme = event.target.closest(".theme-choice[data-theme]");
  if (theme) applyTheme(theme.dataset.theme);
  const preset = event.target.closest("[data-opacity]");
  if (preset) applyOpacity(preset.dataset.opacity);
});
const opacityRange = $("#opacityRange");
opacityRange?.addEventListener("input", (event) => {
  applyOpacity(event.currentTarget.value, { persist: false });
});
opacityRange?.addEventListener("change", (event) => {
  applyOpacity(event.currentTarget.value);
});
$("#homeBrand")?.addEventListener("click", () => go("home"));
$("#scrollTopBtn")?.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
const scrollTopButton = $("#scrollTopBtn");
function syncScrollTopButton() {
  if (!scrollTopButton) return;
  const visible = window.scrollY > 180;
  scrollTopButton.classList.toggle("is-visible", visible);
  // Remove focus before hiding the control from the accessibility tree.
  // Clicking the button scrolls to the top while it still owns focus.
  if (!visible && document.activeElement === scrollTopButton) scrollTopButton.blur();
  scrollTopButton.tabIndex = visible ? 0 : -1;
  scrollTopButton.setAttribute("aria-hidden", String(!visible));
}
window.addEventListener("scroll", syncScrollTopButton, { passive: true });
syncScrollTopButton();
window.addEventListener("hashchange", () => go(location.hash.slice(1), false));
window.addEventListener("resize", syncTabIndicator, { passive: true });

function applyTheme(value) {
  const theme = Object.hasOwn(themeNames, value) ? value : "virtual-singer";
  document.body.dataset.sekaiTheme = theme;
  document.querySelectorAll(".theme-choice").forEach((button) => {
    const active = button.dataset.theme === theme;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  const status = $("#themeStatus");
  if (status) status.textContent = "目前主題 " + themeNames[theme];
  try { localStorage.setItem("sekaiTheme", theme); } catch {}
}
const anniversaryCoverOptions = {
  "1": {
    label: "一週年",
    image: "https://pjsekai.sega.jp/assets/images/1st/ogp.png",
    officialUrl: "https://pjsekai.sega.jp/1st/index.html",
    headline: "群青讚歌",
    emphasis: "一週年紀念歌曲",
    copyType: "官方週年紀念歌曲名稱"
  },
  "2": {
    label: "二週年",
    image: "https://pjsekai.sega.jp/2nd/assets/img/ogp.jpg",
    officialUrl: "https://pjsekai.sega.jp/2nd/index.html",
    headline: "Journey",
    emphasis: "二週年紀念歌曲",
    copyType: "官方週年紀念歌曲名稱"
  },
  "3": {
    label: "三週年",
    image: "https://pjsekai.sega.jp/3rd/assets/images/common/0927_ogp.png",
    officialUrl: "https://pjsekai.sega.jp/3rd/index.html",
    headline: "門扉的另一側",
    emphasis: "嶄新的故事",
    copyType: "官方主視覺文案"
  },
  "4": {
    label: "四週年",
    image: "https://pjsekai.sega.jp/4th/assets/images/common/ogp.png",
    officialUrl: "https://pjsekai.sega.jp/4th/index.html",
    headline: "由心意創造的世界",
    emphasis: "",
    copyType: "官方主視覺文案"
  },
  "5": {
    label: "五週年",
    image: "https://pjsekai.sega.jp/5th/assets/images/index/kv/img_kv_pc.png",
    officialUrl: "https://pjsekai.sega.jp/5th/index.html",
    headline: "聲音連繫著未來",
    emphasis: "",
    copyType: "官方主視覺文案"
  },
  "6": {
    label: "六週年",
    image: "https://pjsekai.sega.jp/6th/assets/webp/index/fv/img_kv_miku_pc.webp",
    officialUrl: "https://pjsekai.sega.jp/6th/index.html",
    headline: "心意交會的故事",
    emphasis: "",
    copyType: "官方主視覺文案"
  }
};
function applyAnniversaryCover(value) {
  const year = Object.hasOwn(anniversaryCoverOptions, String(value)) ? String(value) : "6";
  const option = anniversaryCoverOptions[year];
  const hero = $(".anniversary-hero");
  if (hero) {
    hero.dataset.anniversaryCover = year;
    hero.style.setProperty("--anniversary-cover-image", 'url("' + option.image + '")');
    hero.setAttribute("aria-label", option.label + "主視覺");
  }
  const select = $("#anniversaryCoverSelect");
  if (select) select.value = year;
  const eyebrow = $("#anniversaryCoverEyebrow");
  if (eyebrow) eyebrow.textContent = "世界計畫" + option.label;
  const headline = $("#anniversaryCoverHeadline");
  if (headline) headline.textContent = option.headline;
  const emphasis = $("#anniversaryCoverEmphasis");
  if (emphasis) {
    emphasis.textContent = option.emphasis;
    emphasis.hidden = !option.emphasis;
  }
  if (hero) hero.dataset.anniversaryCopyType = option.copyType;
  const number = $("#anniversaryCoverNumber");
  if (number) number.textContent = year;
  const credit = $("#anniversaryCoverCredit");
  if (credit) {
    credit.href = option.officialUrl;
    credit.textContent = option.label + "官方網站";
  }
  const status = $("#anniversaryCoverStatus");
  if (status) status.textContent = "目前封面 " + option.label;
  try { localStorage.setItem("pjskAnniversaryCover", year); } catch {}
}
$("#anniversaryCoverSelect")?.addEventListener("change", (event) => {
  applyAnniversaryCover(event.target.value);
});
function applyOpacity(value, { persist = true, syncPresets = true } = {}) {
  const amount = Math.max(0, Math.min(55, Number(value) || 0));
  const opacity = amount / 100;
  const root = document.documentElement;
  root.style.setProperty("--glass-opacity", opacity.toFixed(3));
  root.style.setProperty("--shell-opacity", Math.max(.06, opacity * .55).toFixed(3));
  root.style.setProperty("--sub-glass-opacity", Math.max(.12, opacity * .82).toFixed(3));
  root.style.setProperty("--highlight-opacity", Math.min(.36, opacity + .08).toFixed(3));
  root.style.setProperty("--dark-glass-opacity", Math.min(.72, .30 + opacity * .72).toFixed(3));
  if ($("#opacityRange")) $("#opacityRange").value = String(amount);
  const opacityLevels = [
    { value: 12, label: "透亮" },
    { value: 22, label: "標準" },
    { value: 35, label: "柔和" },
    { value: 48, label: "清晰" }
  ];
  const closestLevel = opacityLevels.reduce((closest, level) =>
    Math.abs(level.value - amount) < Math.abs(closest.value - amount) ? level : closest
  );
  if ($("#opacityValue")) $("#opacityValue").textContent = `${closestLevel.label} ${amount}`;
  if ($("#opacityRange")) $("#opacityRange").setAttribute("aria-valuetext", `${closestLevel.label}，介面透明度 ${amount}%`);
  if (syncPresets) {
    document.querySelectorAll("[data-opacity]").forEach((button) => button.classList.toggle("active", Number(button.dataset.opacity) === amount));
  }
  if (persist) {
    try { localStorage.setItem("sekaiGlassOpacity", String(amount)); } catch {}
  }
}
window.PJSEKAI.applyCloudSettings = () => {
  applyTheme(localStorage.getItem("sekaiTheme") || "virtual-singer");
  applyOpacity(localStorage.getItem("sekaiGlassOpacity") ?? 22);
  applyAnniversaryCover(localStorage.getItem("pjskAnniversaryCover") || "6");
};

try {
  applyTheme(localStorage.getItem("sekaiTheme") || "virtual-singer");
  applyOpacity(localStorage.getItem("sekaiGlassOpacity") ?? 22);
  applyAnniversaryCover(localStorage.getItem("pjskAnniversaryCover") || "6");
} catch {
  applyTheme("virtual-singer");
  applyOpacity(22);
  applyAnniversaryCover("6");
}
go(savedUiState.activePage || location.hash.slice(1) || "home", false);
restoreScrollPending = true;
if (savedUiState.scrollY > 0) requestAnimationFrame(() => requestAnimationFrame(restoreSavedScroll));


const SERVER_FLAGS = {
  jp: { label: "日服", alt: "日本國旗", svg: '<rect width="60" height="40" fill="#fff"/><circle cx="30" cy="20" r="12" fill="#bc002d"/>' },
  tw: { label: "台服", alt: "台灣國旗", svg: '<rect width="60" height="40" fill="#fe0000"/><rect width="30" height="20" fill="#000095"/><g fill="#fff" transform="translate(15 10)"><circle r="5.5"/><path d="M0-8 1.3-5.2 4.2-6.2 3-3.2 6-2 3.2-.6 4.2 2.4 1.2 1.2 0 4-1.2 1.2-4.2 2.4-3.2-.6-6-2-3-3.2-4.2-6.2-1.3-5.2Z"/></g>' },
  en: { label: "國際服", globe: true, alt: "國際服" },
  kr: { label: "韓服", alt: "韓國國旗", svg: '<rect width="60" height="40" fill="#fff"/><g transform="translate(30 20)"><path d="M0-9a9 9 0 0 1 0 18 4.5 4.5 0 0 0 0-9 4.5 4.5 0 0 1 0-9" fill="#cd2e3a"/><path d="M0 9a9 9 0 0 1 0-18 4.5 4.5 0 0 0 0 9 4.5 4.5 0 0 1 0 9" fill="#0047a0"/></g><g stroke="#111" stroke-width="2.2"><path d="M8 7h10m-10 3h10M42 30h10m-10 3h10M8 30h10m-10 3h10M42 7h10m-10 3h10"/></g><path d="M8 7v6m10-6v6M42 27v6m10-6v6" stroke="#fff" stroke-width="1.2"/>' },
  cn: { label: "簡中服", alt: "中國國旗", svg: '<rect width="60" height="40" fill="#de2910"/><g fill="#ffde00"><path d="M12 5 13.7 10.2 19 10.2 14.7 13.4 16.3 18.5 12 15.3 7.7 18.5 9.3 13.4 5 10.2 10.3 10.2Z"/><path d="M24 4.5 24.7 6.5 26.8 6.5 25.1 7.8 25.7 9.8 24 8.6 22.3 9.8 22.9 7.8 21.2 6.5 23.3 6.5Z"/><path d="M28 10 28.7 12 30.8 12 29.1 13.3 29.7 15.3 28 14.1 26.3 15.3 26.9 13.3 25.2 12 27.3 12Z"/><path d="M28 18 28.7 20 30.8 20 29.1 21.3 29.7 23.3 28 22.1 26.3 23.3 26.9 21.3 25.2 20 27.3 20Z"/><path d="M24 24 24.7 26 26.8 26 25.1 27.3 25.7 29.3 24 28.1 22.3 29.3 22.9 27.3 21.2 26 23.3 26Z"/></g>' },
};

function serverIcon(region) {
  const info = SERVER_FLAGS[region] || SERVER_FLAGS.tw;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", info.globe ? "0 0 24 24" : "0 0 60 40");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", info.alt);
  svg.classList.add(info.globe ? "server-globe" : "server-flag-svg");
  if (info.globe) {
    svg.innerHTML = '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.4 2.5 3.5 5.5 3.5 9s-1.1 6.5-3.5 9c-2.4-2.5-3.5-5.5-3.5-9S9.6 5.5 12 3Z"/>';
  } else {
    svg.innerHTML = info.svg;
  }
  return svg;
}

function positionServerPickerMenu(wrapper) {
  const trigger = wrapper?.querySelector(".server-picker-trigger");
  const menu = wrapper?.querySelector(".server-picker-menu");
  if (!trigger || !menu || !menu.matches(":popover-open")) return;

  const triggerRect = trigger.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const margin = 12;
  const left = Math.max(margin, Math.min(triggerRect.left, window.innerWidth - menuRect.width - margin));
  const below = triggerRect.bottom + 8;
  const top = below + menuRect.height <= window.innerHeight - margin
    ? below
    : Math.max(margin, triggerRect.top - menuRect.height - 8);

  menu.style.left = left + "px";
  menu.style.top = top + "px";
}

function initServerSelect(select) {
  if (select.dataset.serverPickerReady) return;
  select.dataset.serverPickerReady = "true";
  const wrapper = document.createElement("div");
  wrapper.className = "server-picker";
  wrapper.dataset.serverPicker = select.id;
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "server-picker-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  const current = document.createElement("span");
  current.className = "server-picker-current";
  const chevron = document.createElement("span");
  chevron.className = "server-picker-chevron";
  chevron.setAttribute("aria-hidden", "true");
  chevron.textContent = "⌃";
  trigger.append(current, chevron);
  const menu = document.createElement("div");
  menu.className = "server-picker-menu";
  menu.setAttribute("popover", "manual");
  menu.setAttribute("role", "listbox");
  [...select.options].forEach((option) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "server-picker-option";
    item.dataset.value = option.value;
    item.setAttribute("role", "option");
    item.append(serverIcon(option.value), document.createTextNode(SERVER_FLAGS[option.value]?.label || option.textContent.trim()));
    item.addEventListener("click", () => {
      select.value = option.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      syncServerSelect(select);
      closeServerPicker(wrapper);
      trigger.focus();
    });
    menu.append(item);
  });
  select.classList.add("server-picker-native");
  select.tabIndex = -1;
  select.setAttribute("aria-hidden", "true");
  select.insertAdjacentElement("afterend", wrapper);
  wrapper.append(trigger, menu);
  trigger.addEventListener("click", () => {
    const open = menu.matches(":popover-open");
    document.querySelectorAll(".server-picker-menu:popover-open").forEach((node) => closeServerPicker(node.closest(".server-picker")));
    if (!open) {
      menu.showPopover();
      trigger.setAttribute("aria-expanded", "true");
      wrapper.classList.add("is-open");
      positionServerPickerMenu(wrapper);
    }
  });
  select.addEventListener("change", () => syncServerSelect(select));
  syncServerSelect(select);
}

function closeServerPicker(wrapper) {
  if (!wrapper) return;
  const menu = wrapper.querySelector(".server-picker-menu");
  const trigger = wrapper.querySelector(".server-picker-trigger");
  if (trigger) trigger.setAttribute("aria-expanded", "false");
  wrapper.classList.remove("is-open");
  if (!menu || !menu.matches(":popover-open")) return;
  menu.hidePopover();
  menu.style.removeProperty("left");
  menu.style.removeProperty("top");
}

function syncServerSelect(select) {
  const wrapper = document.querySelector('[data-server-picker="' + select.id + '"]');
  if (!wrapper) return;
  const info = SERVER_FLAGS[select.value] || SERVER_FLAGS.tw;
  const current = wrapper.querySelector(".server-picker-current");
  current.replaceChildren(serverIcon(select.value), document.createTextNode(info.label));
  wrapper.querySelectorAll(".server-picker-option").forEach((item) => {
    const active = item.dataset.value === select.value;
    item.classList.toggle("active", active);
    item.setAttribute("aria-selected", String(active));
  });
}

document.querySelectorAll("#homePlayerRegion,#playerRegion,#songRegion").forEach(initServerSelect);
document.addEventListener("click", (event) => {
  if (!event.target.closest(".server-picker")) {
    document.querySelectorAll(".server-picker.is-open").forEach(closeServerPicker);
  }
});
window.PJSEKAI = { ...(window.PJSEKAI || {}), syncServerSelect };

window.addEventListener("scroll", () => {
  document.querySelectorAll(".server-picker.is-open").forEach(positionServerPickerMenu);
}, true);
window.addEventListener("resize", () => {
  document.querySelectorAll(".server-picker.is-open").forEach(positionServerPickerMenu);
}, { passive: true });
