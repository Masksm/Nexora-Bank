export const supportedLocales = ["en", "es", "fr", "pt", "de"] as const;
export type SupportedLocale = (typeof supportedLocales)[number];
export type LanguagePreference = "auto" | SupportedLocale;

const countryLocale: Record<string, SupportedLocale> = {
  NG: "en", GH: "en", KE: "en", ZA: "en", US: "en", GB: "en", CA: "en", IE: "en", AU: "en", NZ: "en", IN: "en", AE: "en", SG: "en",
  ES: "es", MX: "es", AR: "es", CO: "es", CL: "es", PE: "es", VE: "es", EC: "es", UY: "es", CR: "es", PA: "es",
  FR: "fr", BE: "fr", LU: "fr", MC: "fr",
  PT: "pt", BR: "pt",
  DE: "de", AT: "de", CH: "de",
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

  // In automatic mode, a detected country takes priority over browser language.
  // The middleware supplies the edge country when available, then the saved profile country.
  const countryLocaleMatch = countryLocale[(countryCode || "").toUpperCase()];
  if (countryLocaleMatch) return countryLocaleMatch;

  const browserLanguages = (acceptLanguage || "")
    .split(",")
    .map((entry) => entry.split(";")[0].trim().toLowerCase())
    .filter(Boolean);

  for (const language of browserLanguages) {
    const base = language.split("-")[0];
    if ((supportedLocales as readonly string[]).includes(base)) return base as SupportedLocale;
  }

  return "en";
}
