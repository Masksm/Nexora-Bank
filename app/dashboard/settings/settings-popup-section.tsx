"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronRight, X } from "lucide-react";

export default function SettingsPopupSection({ title, description, icon, children }: {
  title: string;
  description: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button type="button" className="settings-popup-trigger" onClick={() => setOpen(true)}>
        <span className="settings-popup-icon">{icon}</span>
        <span className="settings-popup-copy"><strong>{title}</strong><small>{description}</small></span>
        <ChevronRight size={18} />
      </button>
      {open && (
        <div className="settings-popup-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}>
          <section className="settings-popup-dialog" role="dialog" aria-modal="true" aria-label={title}>
            <header className="settings-popup-header">
              <div><h2>{title}</h2><p>{description}</p></div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close section"><X size={19}/></button>
            </header>
            <div className="settings-popup-content">{children}</div>
          </section>
        </div>
      )}
    </>
  );
}
