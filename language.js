(() => {
  "use strict";

  const STORAGE_KEY = "pjskInterfaceLanguage";
  const SOURCE_LANGUAGE = "zh-TW";
  const languages = [
    ["af", "Afrikaans"], ["sq", "Shqip"], ["am", "አማርኛ"], ["ar", "العربية"],
    ["hy", "Հայերեն"], ["az", "Azərbaycanca"], ["eu", "Euskara"], ["be", "Беларуская"],
    ["bn", "বাংলা"], ["bs", "Bosanski"], ["bg", "Български"], ["ca", "Català"],
    ["zh-CN", "简体中文"], ["zh-TW", "繁體中文"], ["hr", "Hrvatski"], ["cs", "Čeština"],
    ["da", "Dansk"], ["nl", "Nederlands"], ["en", "English"], ["et", "Eesti"],
    ["fi", "Suomi"], ["fr", "Français"], ["gl", "Galego"], ["ka", "ქართული"],
    ["de", "Deutsch"], ["el", "Ελληνικά"], ["gu", "ગુજરાતી"], ["he", "עברית"],
    ["hi", "हिन्दी"], ["hu", "Magyar"], ["is", "Íslenska"], ["id", "Bahasa Indonesia"],
    ["ga", "Gaeilge"], ["it", "Italiano"], ["ja", "日本語"], ["jv", "Basa Jawa"],
    ["kn", "ಕನ್ನಡ"], ["kk", "Қазақша"], ["km", "ខ្មែរ"], ["ko", "한국어"],
    ["lo", "ລາວ"], ["lv", "Latviešu"], ["lt", "Lietuvių"], ["mk", "Македонски"],
    ["ms", "Bahasa Melayu"], ["ml", "മലയാളം"], ["mr", "मराठी"], ["mn", "Монгол"],
    ["my", "မြန်မာ"], ["ne", "नेपाली"], ["no", "Norsk"], ["fa", "فارسی"],
    ["pl", "Polski"], ["pt", "Português"], ["pa", "ਪੰਜਾਬੀ"], ["ro", "Română"],
    ["ru", "Русский"], ["sr", "Српски"], ["si", "සිංහල"], ["sk", "Slovenčina"],
    ["sl", "Slovenščina"], ["es", "Español"], ["sw", "Kiswahili"], ["sv", "Svenska"],
    ["tl", "Filipino"], ["ta", "தமிழ்"], ["te", "తెలుగు"], ["th", "ไทย"],
    ["tr", "Türkçe"], ["uk", "Українська"], ["ur", "اردو"], ["uz", "O‘zbekcha"],
    ["vi", "Tiếng Việt"], ["cy", "Cymraeg"], ["yi", "ייִדיש"], ["zu", "isiZulu"]
  ];
  const supported = new Map(languages.map(([code, name]) => [code, name]));
  const translateCodes = languages.map(([code]) => code).filter((code) => code !== SOURCE_LANGUAGE);
  const root = document.documentElement;

  function detectBrowserLanguage() {
    const preferences = Array.isArray(navigator.languages) && navigator.languages.length
      ? navigator.languages
      : [navigator.language || SOURCE_LANGUAGE];
    for (const preference of preferences) {
      const normalized = String(preference).replace("_", "-").toLowerCase();
      if (normalized.startsWith("zh-")) {
        if (/(hant|tw|hk|mo)/i.test(normalized)) return "zh-TW";
        if (/(hans|cn|sg)/i.test(normalized)) return "zh-CN";
      }
      const base = normalized.split("-")[0];
      if (supported.has(base)) return base;
    }
    return SOURCE_LANGUAGE;
  }

  function readPreference() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "auto" || supported.has(saved)) return saved;
      localStorage.setItem(STORAGE_KEY, "auto");
    } catch {}
    return "auto";
  }

  function writeTranslateCookie(language) {
    const value = language === SOURCE_LANGUAGE ? "" : "/" + SOURCE_LANGUAGE + "/" + language;
    const expires = "; expires=" + (language === SOURCE_LANGUAGE ? "Thu, 01 Jan 1970 00:00:00 GMT" : "Fri, 31 Dec 9999 23:59:59 GMT");
    document.cookie = "googtrans=" + value + "; path=/" + expires + "; SameSite=Lax";
  }

  function effectiveLanguage(value) {
    return value === "auto" ? detectBrowserLanguage() : value;
  }

  const preference = readPreference();
  const activeLanguage = effectiveLanguage(preference);
  root.lang = activeLanguage;
  root.dataset.interfaceLanguage = activeLanguage;
  writeTranslateCookie(activeLanguage);

  let styledSelectSequence = 0;

  function enhanceStyledSelect(select) {
    if (!(select instanceof HTMLSelectElement) || select.multiple || select.size > 1) return null;
    if (["homePlayerRegion", "playerRegion", "songRegion"].includes(select.id)) return null;
    if (select.closest(".server-picker") || select.dataset.styledSelect === "true") return select.closest(".styled-select") || null;

    select.dataset.styledSelect = "true";
    const wrapper = document.createElement("div");
    wrapper.className = "styled-select";
    wrapper.dataset.styledSelectFor = select.id || "select";
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "styled-select-trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-label", select.getAttribute("aria-label") || select.labels?.[0]?.textContent?.trim() || "選擇項目");
    const menu = document.createElement("div");
    menu.className = "styled-select-menu";
    menu.id = "styled-select-menu-" + (++styledSelectSequence);
    menu.setAttribute("role", "listbox");
    menu.setAttribute("popover", "manual");
    menu.hidden = true;
    trigger.setAttribute("aria-controls", menu.id);

    const parent = select.parentNode;
    if (!parent) {
      delete select.dataset.styledSelect;
      return null;
    }
    parent.insertBefore(wrapper, select);
    wrapper.append(select, trigger, menu);
    select.classList.add("styled-select-native");
    select.tabIndex = -1;
    select.setAttribute("aria-hidden", "true");

    const placeMenu = () => {
      const rect = trigger.getBoundingClientRect();
      const margin = 8;
      const gap = 7;
      const below = window.innerHeight - rect.bottom - gap - margin;
      const above = rect.top - gap - margin;
      const maxHeight = Math.max(120, Math.min(310, Math.max(below, above)));
      const openBelow = below >= Math.min(180, maxHeight) || below >= above;
      menu.style.position = "fixed";
      menu.style.zIndex = "2147483647";
      menu.style.left = Math.max(margin, Math.min(rect.left, window.innerWidth - rect.width - margin)) + "px";
      menu.style.width = Math.min(rect.width, window.innerWidth - margin * 2) + "px";
      menu.style.maxHeight = maxHeight + "px";
      menu.style.top = openBelow
        ? Math.min(window.innerHeight - maxHeight - margin, rect.bottom + gap) + "px"
        : Math.max(margin, rect.top - maxHeight - gap) + "px";
      menu.style.overflowY = "auto";
    };

    const close = (restoreFocus = false) => {
      if (menu.matches(":popover-open")) {
        try { menu.hidePopover(); } catch {}
      }
      menu.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      wrapper.classList.remove("is-open");
      ["position", "z-index", "left", "top", "width", "max-height", "overflow-y"].forEach((property) => menu.style.removeProperty(property));
      if (restoreFocus && trigger.isConnected) trigger.focus({ preventScroll: true });
    };

    const refresh = () => {
      const selected = select.selectedOptions[0];
      trigger.textContent = selected?.textContent?.trim() || "請選擇";
      trigger.disabled = select.disabled;
      menu.replaceChildren();
      [...select.options].forEach((option) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "styled-select-option" + (option.value === select.value ? " is-selected" : "");
        item.setAttribute("role", "option");
        item.setAttribute("aria-selected", option.value === select.value ? "true" : "false");
        item.disabled = option.disabled || Boolean(option.parentElement?.disabled);
        item.textContent = option.textContent.trim();
        item.addEventListener("click", () => {
          if (item.disabled) return;
          select.value = option.value;
          select.dispatchEvent(new Event("input", { bubbles: true }));
          select.dispatchEvent(new Event("change", { bubbles: true }));
          refresh();
          close(true);
        });
        menu.append(item);
      });
    };

    trigger.addEventListener("click", () => {
      const opening = menu.hidden;
      document.querySelectorAll(".styled-select.is-open").forEach((other) => other._closeStyledSelect?.());
      if (!opening) return;
      refresh();
      menu.hidden = false;
      try {
        if (typeof menu.showPopover === "function") menu.showPopover();
      } catch {}
      trigger.setAttribute("aria-expanded", "true");
      wrapper.classList.add("is-open");
      placeMenu();
    });

    document.addEventListener("click", (event) => {
      if (!wrapper.contains(event.target) && !menu.contains(event.target)) close();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && wrapper.classList.contains("is-open")) {
        event.preventDefault();
        close(true);
      }
    });
    window.addEventListener("resize", () => { if (!menu.hidden) placeMenu(); }, { passive: true });
    window.addEventListener("scroll", () => { if (!menu.hidden) placeMenu(); }, true);
    select.addEventListener("change", refresh);

    wrapper._refreshStyledSelect = refresh;
    wrapper._closeStyledSelect = close;
    refresh();
    return wrapper;
  }

  function refreshStyledSelect(select) {
    const element = typeof select === "string" ? document.querySelector(select) : select;
    element?.closest(".styled-select")?._refreshStyledSelect?.();
  }

  function enhanceSelectTree(rootNode = document) {
    if (rootNode instanceof HTMLSelectElement) {
      enhanceStyledSelect(rootNode);
      return;
    }
    rootNode.querySelectorAll?.("select").forEach(enhanceStyledSelect);
  }

  window.enhanceStyledSelect = enhanceStyledSelect;
  window.refreshStyledSelect = refreshStyledSelect;

  function initializeSelector() {
    const select = document.getElementById("interfaceLanguageSelect");
    const status = document.getElementById("interfaceLanguageStatus");
    if (!select) return;
    for (const [code, name] of languages) {
      const option = document.createElement("option");
      option.value = code;
      option.textContent = name;
      select.append(option);
    }
    select.value = preference;
    enhanceStyledSelect(select);
    enhanceStyledSelect(document.getElementById("anniversaryCoverSelect"));
    if (status) {
      const name = activeLanguage === SOURCE_LANGUAGE ? "繁體中文" : supported.get(activeLanguage);
      status.textContent = preference === "auto"
        ? "已依瀏覽器語言設定 " + name + " 翻譯由 Google 翻譯提供"
        : "目前使用 " + name + " 翻譯由 Google 翻譯提供";
    }
    select.addEventListener("change", () => {
      const next = select.value === "auto" || supported.has(select.value) ? select.value : "auto";
      try { localStorage.setItem(STORAGE_KEY, next); } catch {}
      writeTranslateCookie(effectiveLanguage(next));
      location.reload();
    });
  }

  window.googleTranslateElementInit = function googleTranslateElementInit() {
    if (!window.google?.translate?.TranslateElement) return;
    new window.google.translate.TranslateElement({
      pageLanguage: SOURCE_LANGUAGE,
      includedLanguages: translateCodes.join(","),
      autoDisplay: false,
      layout: window.google.translate.TranslateElement.InlineLayout.SIMPLE
    }, "google_translate_element");
  };

  initializeSelector();

  // Only the two appearance-setting selectors use the custom settings popup.
  // Song, player-workspace, and game-tool controls stay native like the working song filters.
  const script = document.createElement("script");
  script.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
  script.async = true;
  script.onerror = () => {
    const status = document.getElementById("interfaceLanguageStatus");
    if (status) status.textContent = "翻譯服務暫時無法載入 請稍後再試 繁體中文仍可正常使用";
  };
  document.head.append(script);
})();
