"use client";

import { useState } from "react";
import { Eye, X, ExternalLink } from "lucide-react";
import type { SupportedLocale } from "@/lib/locale";
import { pageText } from "@/lib/page-translations";

export function AdminReceiptPreview({ url, filename, mimeType, locale }: {
  url: string;
  filename: string;
  mimeType: string;
  locale: SupportedLocale;
}) {
  const [open, setOpen] = useState(false);
  const t = (value: string) => pageText(locale, value);
  return (
    <>
      <button type="button" className="admin-receipt-preview-trigger" onClick={() => setOpen(true)}>
        <Eye size={14}/> {t("View receipt")}
      </button>
      {open && (
        <div className="admin-receipt-preview-backdrop" role="presentation" onMouseDown={event => {
          if (event.target === event.currentTarget) setOpen(false);
        }}>
          <section className="admin-receipt-preview-modal" role="dialog" aria-modal="true" aria-labelledby="admin-receipt-preview-title">
            <header>
              <div><span>{t("Payment evidence")}</span><h2 id="admin-receipt-preview-title">{filename}</h2></div>
              <button type="button" onClick={() => setOpen(false)} aria-label={t("Close")}><X size={20}/></button>
            </header>
            <div className="admin-receipt-preview-content">
              {mimeType === "application/pdf" ? <iframe title={filename} src={url}/> : <img src={url} alt={filename}/>}
            </div>
            <footer>
              <a href={url} target="_blank" rel="noreferrer">{t("Open original file")} <ExternalLink size={13}/></a>
              <button type="button" onClick={() => setOpen(false)}>{t("Close preview")}</button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
