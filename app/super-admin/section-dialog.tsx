"use client";

import { useEffect, useState, type ReactNode } from "react";
import { X, ArrowUpRight } from "lucide-react";

type Props = { id?: string; title: string; eyebrow: string; description: string; count: string | number; icon: ReactNode; children: ReactNode };

export function SuperAdminDialog({ id, title, eyebrow, description, count, icon, children }: Props) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKeyDown); document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      <button type="button" id={id} className="super-section-card" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}>
        <span className="super-section-icon">{icon}</span>
        <span className="super-section-copy"><small>{eyebrow}</small><strong>{title}</strong><span>{description}</span></span>
        <span className="super-section-meta"><b>{count}</b><span>Open section <ArrowUpRight size={13}/></span></span>
      </button>
      {open && (
        <div className="super-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <section className="super-dialog" role="dialog" aria-modal="true" aria-label={title}>
            <header className="super-dialog-header"><div><small>{eyebrow}</small><h2>{title}</h2></div><button type="button" onClick={() => setOpen(false)} aria-label="Close section"><X size={19}/></button></header>
            <div className="super-dialog-content">{children}</div>
          </section>
        </div>
      )}
    </>
  );
}
