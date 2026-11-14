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
const validRoutes = new Set(pages.map((page) => page.dataset.page));
const themeNames = {
  classroom: "教室 · Classroom SEKAI",
  stage: "舞台 · Stage SEKAI",
  street: "街頭 · Street SEKAI",
  wonderland: "奇幻 · Wonderland SEKAI",
  empty: "無人 · Empty SEKAI",
  virtual: "虛擬 · Virtual Singer SEKAI",
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
  const theme = Object.hasOwn(themeNames, value) ? value : "virtual";
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
  applyTheme(localStorage.getItem("sekaiTheme") || "virtual");
  applyOpacity(localStorage.getItem("sekaiGlassOpacity") ?? 22);
} catch {
  applyTheme("virtual");
  applyOpacity(22);
}
go(location.hash.slice(1) || "home", false);
