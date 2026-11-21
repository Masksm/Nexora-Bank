import type { Metadata } from "next";
import { cookies } from "next/headers";
import { isLanguagePreference, type SupportedLocale } from "@/lib/locale";
import "./globals.css";
import "./theme.css";
import "./auth.css";
import "./dashboard/dashboard.css";
import "./dashboard/workspace.css";
import "./admin/admin.css";

export const metadata: Metadata = {
  title: "Nexora Bank | Banking, made clear",
  description: "A modern digital banking experience.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const savedLocale = cookieStore.get("nexora_locale")?.value || "en";
  const theme = cookieStore.get("nexora_theme")?.value === "dark" ? "dark" : "light";
  const locale: SupportedLocale = isLanguagePreference(savedLocale) && savedLocale !== "auto"
    ? savedLocale
    : "en";

  return (
    <html lang={locale} data-theme={theme}>
      <body>{children}</body>
    </html>
  );
}
