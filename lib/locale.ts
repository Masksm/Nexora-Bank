export const supportedLocales = ["en", "es", "fr", "pt", "de"] as const;
export type SupportedLocale = (typeof supportedLocales)[number];
export type LanguagePreference = "auto" | SupportedLocale;

const countryLocale: Record<string, SupportedLocale> = {
  NG: "en", GH: "en", KE: "en", ZA: "en", US: "en", GB: "en", CA: "en",
  ES: "es", MX: "es", AR: "es", CO: "es", CL: "es",
  FR: "fr", BE: "fr",
  PT: "pt", BR: "pt",
  DE: "de", AT: "de",
};

export function isLanguagePreference(value: string): value is LanguagePreference {
  return value === "auto" || (supportedLocales as readonly string[]).includes(value);
}

export function resolveLocale(
  preference: string | null | undefined,
  acceptLanguage: string | null | undefined,
  countryCode: string | null | undefined,
): SupportedLocale {
  if (preference && preference !== "auto" && isLanguagePreference(preference)) {
    return preference as SupportedLocale;
  }

  const browserLanguages = (acceptLanguage || "")
    .split(",")
    .map((entry) => entry.split(";")[0].trim().toLowerCase())
    .filter(Boolean);

  for (const language of browserLanguages) {
    const base = language.split("-")[0];
    if ((supportedLocales as readonly string[]).includes(base)) return base as SupportedLocale;
  }

  return countryLocale[(countryCode || "").toUpperCase()] || "en";
}
