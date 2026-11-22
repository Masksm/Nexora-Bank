"use client";

import { useState } from "react";
import { FileImage, FileText, X, ExternalLink } from "lucide-react";
import type { SupportedLocale } from "@/lib/locale";
import { pageText } from "@/lib/page-translations";

export type CustomerReceipt = {
  id: string;
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  review_status: string;
  submitted_at: string;
  signedUrl: string | null;
  review_note: string | null;
};

export function CustomerReceiptViewer({ receipts, locale }: { receipts: CustomerReceipt[]; locale: SupportedLocale }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<CustomerReceipt | null>(null);
  const t = (value: string) => pageText(locale, value);
  if (!receipts.length) return null;

  return (
    <>
      <button type="button" className="support-receipt-view-button" onClick={() => { setActive(null); setOpen(true); }}>
        <FileImage size={15}/> {t("View submitted receipts")} <span>{receipts.length}</span>
      </button>
      {open && (
        <div className="support-receipt-modal-backdrop" role="presentation" onMouseDown={event => {
          if (event.target === event.currentTarget) { setOpen(false); setActive(null); }
        }}>
          <section className="support-receipt-modal" role="dialog" aria-modal="true" aria-labelledby="customer-receipts-title">
            <header>
              <div>
                <span>{t("Payment evidence")}</span>
                <h2 id="customer-receipts-title">{active ? active.original_filename : t("Your submitted receipts")}</h2>
                <p>{active ? t("Private receipt preview") : t("Receipts uploaded to this payment instruction")}</p>
              </div>
              <button type="button" onClick={() => { setOpen(false); setActive(null); }} aria-label={t("Close")}><X size={19}/></button>
            </header>
            {active ? (
              <div className="support-receipt-preview">
                {active.signedUrl && active.mime_type === "application/pdf"
                  ? <iframe title={active.original_filename} src={active.signedUrl}/>
                  : active.signedUrl
                    ? <img src={active.signedUrl} alt={active.original_filename}/>
                    : <p>{t("Preview unavailable. The file is still securely recorded.")}</p>}
                <div className="support-receipt-preview-meta">
                  <span>{t(active.review_status.replaceAll("_", " "))} · {new Date(active.submitted_at).toLocaleString(locale)}</span>
                  {active.signedUrl && <a href={active.signedUrl} target="_blank" rel="noreferrer">{t("Open file")} <ExternalLink size={13}/></a>}
                  {active.review_note && <p>{active.review_note}</p>}
                </div>
                <button type="button" className="support-receipt-back" onClick={() => setActive(null)}>{t("Back to receipts")}</button>
              </div>
            ) : (
              <div className="support-receipt-items">
                {receipts.map(receipt => (
                  <button type="button" className="support-receipt-item" key={receipt.id} onClick={() => setActive(receipt)}>
                    <span className="support-receipt-file-icon">{receipt.mime_type === "application/pdf" ? <FileText size={19}/> : <FileImage size={19}/>}</span>
                    <span><strong>{receipt.original_filename}</strong><small>{new Date(receipt.submitted_at).toLocaleString(locale)} · {(receipt.file_size_bytes / 1024 / 1024).toFixed(2)} MB</small><small>{t(receipt.review_status.replaceAll("_", " "))}</small></span>
                    <b>{t("View")} ›</b>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
