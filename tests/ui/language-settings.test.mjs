import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../../index.html", import.meta.url), "utf8");
const language = await readFile(new URL("../../language.js", import.meta.url), "utf8");

assert.match(html, /id="interfaceLanguageSelect"/, "language selector is available in settings");
assert.match(html, /id="interfaceLanguageStatus"/, "language status is announced accessibly");
assert.match(html, /language\.js/, "language controller is loaded");
assert.match(language, /navigator\.languages/, "first visit checks the browser's preferred language list");
assert.match(language, /pjskInterfaceLanguage/, "manual language preference is persisted locally");
assert.match(language, /google\.translate\.TranslateElement/, "page translation is initialized");
assert.match(language, /includedLanguages: translateCodes\.join\(","\)/, "translation widget receives the supported language list");
assert.match(language, /location\.reload\(\)/, "changing language applies the new translation preference");
const languageCodes = [...language.matchAll(/\["([^"]+)",\s*"[^"]+"\]/g)].map((match) => match[1]);
assert.ok(languageCodes.length >= 70, "the language picker includes a broad set of commonly used and regional languages");
assert.equal(new Set(languageCodes).size, languageCodes.length, "language codes are unique");
assert.ok(languageCodes.includes("zh-TW") && languageCodes.includes("zh-CN") && languageCodes.includes("en") && languageCodes.includes("ja") && languageCodes.includes("ko"), "Traditional Chinese, Simplified Chinese, English, Japanese, and Korean are included");
