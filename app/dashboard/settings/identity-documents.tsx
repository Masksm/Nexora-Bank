"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { SupportedLocale } from "@/lib/locale";
import { pageText } from "@/lib/page-translations";

type IdentityDocument = {
  id: string;
  document_type: "passport" | "national_id" | "drivers_license";
  file_name: string;
  review_status: "submitted" | "under_review" | "verified" | "rejected";
  uploaded_at: string;
  rejection_reason: string | null;
};

type VerificationAttempt = {
  id: string;
  identity_document_id: string;
  provider: string;
  provider_reference: string | null;
  provider_launch_url: string | null;
  status: string;
  result_summary: string | null;
  created_at: string;
};

const labels: Record<IdentityDocument["document_type"], string> = {
  passport: "Passport",
  national_id: "National identity card",
  drivers_license: "Driver's licence",
};

export default function IdentityDocuments({ userId, initialDocuments, initialAttempts, locale }: {
  userId: string;
  initialDocuments: IdentityDocument[];
  initialAttempts: VerificationAttempt[];
  locale: SupportedLocale;
}) {
  const t = (value: string) => pageText(locale, value);
  const router = useRouter();
  const [documents, setDocuments] = useState(initialDocuments);
  const [attempts, setAttempts] = useState(initialAttempts);
  const [documentType, setDocumentType] = useState<IdentityDocument["document_type"]>("passport");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function uploadDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || busy) return;
    const allowed = ["application/pdf", "image/jpeg", "image/png"];
    if (!allowed.includes(file.type)) {
      setMessage(t("Choose a PDF, JPG or PNG file."));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setMessage(t("The document must be 10 MB or smaller."));
      return;
    }

    setBusy(true);
    setMessage("");
    const supabase = createClient();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "identity-document";
    const path = userId + "/" + crypto.randomUUID() + "-" + safeName;
    const { error: uploadError } = await supabase.storage.from("identity-documents").upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    if (uploadError) {
      setMessage(t("Document upload failed. Please try again."));
      setBusy(false);
      return;
    }

    const { data, error: recordError } = await supabase.from("identity_documents").insert({
      user_id: userId,
      document_type: documentType,
      storage_path: path,
      file_name: safeName,
      content_type: file.type,
      file_size_bytes: file.size,
    }).select("id,document_type,file_name,review_status,rejection_reason,uploaded_at").single();

    if (recordError || !data) {
      await supabase.storage.from("identity-documents").remove([path]);
      setMessage(t("The document could not be registered. Please try again."));
      setBusy(false);
      return;
    }

    setDocuments((current) => [data as IdentityDocument, ...current]);
    setFile(null);
    const input = document.getElementById("identity-file") as HTMLInputElement | null;
    if (input) input.value = "";
    setMessage(t("Document uploaded securely."));
    setBusy(false);
    router.refresh();
  }

  async function startVerification(document: IdentityDocument) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/identity-verification/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: document.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || t("Unable to start verification."));
      const attempt = result.attempt as VerificationAttempt;
      setAttempts((current) => [attempt, ...current.filter((item) => item.id !== attempt.id)]);
      setMessage(t("Identity verification has started."));
      if (result.launchUrl) window.open(result.launchUrl, "_blank", "noopener,noreferrer");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("Unable to start verification."));
    } finally {
      setBusy(false);
    }
  }

  async function removeDocument(document: IdentityDocument) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    const supabase = createClient();
    const { data: row, error: lookupError } = await supabase.from("identity_documents")
      .select("storage_path").eq("id", document.id).single();
    if (lookupError || !row) {
      setMessage(t("Unable to locate that document."));
      setBusy(false);
      return;
    }
    const { error: storageError } = await supabase.storage.from("identity-documents").remove([row.storage_path]);
    if (storageError) {
      setMessage(t("Unable to remove the stored file. Please try again."));
      setBusy(false);
      return;
    }
    const { error: deleteError } = await supabase.from("identity_documents").delete().eq("id", document.id);
    if (deleteError) {
      setMessage(t("The file was removed, but its record could not be updated. Contact support."));
      setBusy(false);
      return;
    }
    setDocuments((current) => current.filter((item) => item.id !== document.id));
    setMessage(t("Document removed."));
    setBusy(false);
  }

  return (
    <div className="identity-document-content">
      <form className="transfer-form identity-upload-form" onSubmit={uploadDocument}>
        <label>{t("Document type")}
          <select value={documentType} onChange={(event) => setDocumentType(event.target.value as IdentityDocument["document_type"])}>
            <option value="passport">{t("Passport")}</option>
            <option value="national_id">{t("National identity card")}</option>
            <option value="drivers_license">{t("Driver's licence")}</option>
          </select>
        </label>
        <label>{t("Choose document")}
          <input id="identity-file" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(event) => setFile(event.target.files?.[0] ?? null)} required />
        </label>
        <p>{t("PDF, JPG or PNG. Maximum file size: 10 MB. Files are stored privately. You and authorised identity-review staff can access them.")}</p>
        <button type="submit" disabled={!file || busy}>{busy ? t("Uploading…") : t("Upload identity document")}</button>
      </form>
      {message && <p className="identity-message" role="status">{message}</p>}
      <div className="identity-document-list">
        {documents.length === 0 ? (
          <p className="identity-empty">{t("No identity documents have been uploaded.")}</p>
        ) : documents.map((document) => (
          <article key={document.id} className="identity-document-row">
            <div>
              <strong>{t(labels[document.document_type])}</strong>
              <span>{document.file_name}</span>
              <small>{new Date(document.uploaded_at).toLocaleDateString(locale)} · {t(document.review_status.replaceAll("_", " "))}</small>
              {document.review_status === "rejected" && document.rejection_reason && <p className="identity-rejection-reason">{document.rejection_reason}</p>}
            </div>
            <div className="identity-document-actions">
              {document.review_status !== "verified" && (() => {
                const latest = attempts.find((item) => item.identity_document_id === document.id);
                return latest?.status === "pending" ? (
                  <div className="identity-verification-state">
                    <span>{t("Verification in progress")}</span>
                    {latest.provider_launch_url && <a href={latest.provider_launch_url} target="_blank" rel="noreferrer">{t("Continue verification")}</a>}
                  </div>
                ) : (
                  <button type="button" onClick={() => startVerification(document)} disabled={busy}>
                    {t(latest ? "Retry verification" : "Start verification")}
                  </button>
                );
              })()}
              {document.review_status === "submitted" && (
                <button type="button" onClick={() => removeDocument(document)} disabled={busy} aria-label={"Remove " + t(labels[document.document_type])}>
                  {t("Remove")}
                </button>
              )}
            </div>
          </article>
        ))}
      </div>

    </div>
  );
}
