"use client";

import { useState } from "react";
import { Moon, Sun } from "lucide-react";

export default function ThemeToggle({ initialTheme = "light", labels }: {
  initialTheme?: "light" | "dark";
  labels: { light: string; dark: string; description: string };
}) {
  const [theme, setTheme] = useState<"light" | "dark">(initialTheme);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `nexora_theme=${next}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  }

  return (
    <div className="theme-preference-row">
      <span className="theme-preference-icon">{theme === "dark" ? <Moon size={18}/> : <Sun size={18}/>}</span>
      <span className="theme-preference-copy"><strong>{theme === "dark" ? labels.dark : labels.light}</strong><small>{labels.description}</small></span>
      <button type="button" role="switch" aria-checked={theme === "dark"} aria-label={theme === "dark" ? labels.dark : labels.light} className={`theme-switch ${theme === "dark" ? "is-on" : ""}`} onClick={toggleTheme}>
        <span/>
      </button>
    </div>
  );
}
