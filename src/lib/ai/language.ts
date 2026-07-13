import type { Locale } from "@/i18n/routing"

const LANGUAGE_NAMES: Record<Locale, string> = {
  de: "German (Deutsch)",
  en: "English",
}

/** Maps an app locale to a language name the LLM can be instructed to write in. */
export function languageNameForLocale(locale: string): string {
  return LANGUAGE_NAMES[locale as Locale] ?? LANGUAGE_NAMES.en
}
