import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./en.json";
import tr from "./tr.json";

export const LANGUAGES = ["en", "tr"] as const;
export type Language = (typeof LANGUAGES)[number];

/** Picks the saved language, or Turkish when the system language is Turkish. */
export function resolveLanguage(saved: string | null | undefined): Language {
  if (saved === "en" || saved === "tr") return saved;
  return navigator.language.toLowerCase().startsWith("tr") ? "tr" : "en";
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, tr: { translation: tr } },
  lng: resolveLanguage(null),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
