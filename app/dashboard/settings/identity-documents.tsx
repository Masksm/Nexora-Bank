"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import type { SupportedLocale } from "@/lib/locale";
import { pageText } from "@/lib/page-translations";

type IdentityDocument = {
  id: string;
  document_type: "passport" | "national_id" | "drivers_license";
  file_name: string;
  review_status: "submitted" | "under_review" | "verified" | "rejected";
  uploaded_at: string;
};

const labels: Record<IdentityDocument["document_type"], string> = {
  passport: "Passport",
  national_id: "National identity card",
  drivers_license: "Driver&apos;s licence",
};

export default function IdentityDocuments({ userId, initialDocuments }: {
  userId: string;
  initialDocuments: IdentityDocument[];
}) {
  const [documents, setDocuments] = useState(initialDocuments);
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
    }).select("id,document_type,file_name,review_status,uploaded_at").single();

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
        <label>Document type
          <select value={documentType} onChange={(event) => setDocumentType(event.target.value as IdentityDocument["document_type"])}>
            <option value="passport">{t("Passport")}</option>
            <option value="national_id">{t("National identity card")}</option>
            <option value="drivers_license">{t("Driver&apos;s licence")}</option>
          </select>
        </label>
        <label>Choose document
          <input id="identity-file" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(event) => setFile(event.target.files?.[0] ?? null)} required />
        </label>
        <p>{t("PDF, JPG or PNG. Maximum file size: 10 MB. Files are stored privately and are accessible only to your account under the current access rules.")}</p>
        <button type="submit" disabled={!file || busy}>{busy ? "Uploading…" : "Upload identity document"}</button>
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
              <small>{new Date(document.uploaded_at).toLocaleDateString()} · {document.review_status.replace("_", " ")}</small>
            </div>
            {document.review_status === "submitted" && (
              <button type="button" onClick={() => removeDocument(document)} disabled={busy} aria-label={"Remove " + t(labels[document.document_type])}>
                Remove
              </button>
            )}
          </article>
        ))}
      </div>
      <p className="identity-disclaimer">Uploading a document does not mean your identity has been verified. Verification status will only change after an authorised review.</p>
    </div>
  );
}
