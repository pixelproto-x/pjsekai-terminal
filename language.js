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
    document.cookie = "googtrans=" + value + "; path=/; domain=" + location.hostname + expires + "; SameSite=Lax";
  }

  function effectiveLanguage(value) {
    return value === "auto" ? detectBrowserLanguage() : value;
  }

  const preference = readPreference();
  const activeLanguage = effectiveLanguage(preference);
  root.lang = activeLanguage;
  root.dataset.interfaceLanguage = activeLanguage;
  writeTranslateCookie(activeLanguage);

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
    if (status) {
      const name = activeLanguage === SOURCE_LANGUAGE ? "繁體中文" : supported.get(activeLanguage);
      status.textContent = preference === "auto"
        ? "已依瀏覽器語言設定：" + name + "。翻譯由 Google 翻譯提供。"
        : "目前使用：" + name + "。翻譯由 Google 翻譯提供。";
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

  const script = document.createElement("script");
  script.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
  script.async = true;
  script.onerror = () => {
    const status = document.getElementById("interfaceLanguageStatus");
    if (status) status.textContent = "翻譯服務暫時無法載入，請稍後再試；繁體中文仍可正常使用。";
  };
  document.head.append(script);
})();
