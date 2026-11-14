const $ = (selector, root = document) => root.querySelector(selector);
const pages = [...document.querySelectorAll(".page")];
const tabs = [...document.querySelectorAll(".tab")];
const bottomBar = $(".bottom-bar");
const tabIndicator = $(".tab-indicator");

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
  "virtual-singer": "虛擬歌手 · VIRTUAL SINGER",
  "leo-need": "Leo/need · BLUE HORIZON",
  "more-more-jump": "MORE MORE JUMP! · IDOL BLOOM",
  "vivid-bad-squad": "Vivid BAD SQUAD · STREET BEAT",
  "wonderlands-showtime": "Wonderlands×Showtime · SHOWTIME",
  nightcord: "25時 Nightcord · AFTER THE END",
};
let toastTimer;

export function go(route, updateHash = true) {
  const next = validRoutes.has(route) ? route : "home";
  pages.forEach((page) => page.classList.toggle("active", page.dataset.page === next));
  tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.go === next));
  syncTabIndicator();
  if (updateHash && location.hash !== "#" + next) history.replaceState({}, "", "#" + next);
  window.scrollTo({ top: 0, behavior: "smooth" });
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
$("#opacityRange")?.addEventListener("input", (event) => applyOpacity(event.target.value));
$("#homeBrand")?.addEventListener("click", () => go("home"));
$("#scrollTopBtn")?.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
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
  if (status) status.textContent = "目前主題：" + themeNames[theme];
  try { localStorage.setItem("sekaiTheme", theme); } catch {}
}
function applyOpacity(value) {
  const amount = Math.max(0, Math.min(100, Number(value) || 0));
  const opacity = amount / 100;
  const root = document.documentElement;
  root.style.setProperty("--glass-opacity", opacity.toFixed(3));
  root.style.setProperty("--shell-opacity", Math.max(.06, opacity * .55).toFixed(3));
  root.style.setProperty("--sub-glass-opacity", Math.max(.12, opacity * .82).toFixed(3));
  root.style.setProperty("--highlight-opacity", Math.min(.36, opacity + .08).toFixed(3));
  root.style.setProperty("--dark-glass-opacity", Math.min(.72, .30 + opacity * .72).toFixed(3));
  if ($("#opacityRange")) $("#opacityRange").value = String(amount);
  if ($("#opacityValue")) $("#opacityValue").textContent = amount + "%";
  document.querySelectorAll("[data-opacity]").forEach((button) => button.classList.toggle("active", Number(button.dataset.opacity) === amount));
  try { localStorage.setItem("sekaiGlassOpacity", String(amount)); } catch {}
}
try {
  applyTheme(localStorage.getItem("sekaiTheme") || "virtual-singer");
  applyOpacity(localStorage.getItem("sekaiGlassOpacity") ?? 22);
} catch {
  applyTheme("virtual-singer");
  applyOpacity(22);
}
go(location.hash.slice(1) || "home", false);
