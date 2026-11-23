"use client";

import { useState } from "react";
import type { SupportedLocale } from "@/lib/locale";
import { pageText } from "@/lib/page-translations";

export default function BavNameCheck({ beneficiaryId, locale }: {
  beneficiaryId: string;
  locale: SupportedLocale;
}) {
  const t = (value: string) => pageText(locale, value);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"match"|"partial_match"|"no_match"|"unavailable"|null>(null);
  const [bic, setBic] = useState("");

  async function verifyName() {
    if (!consent || busy) return;
    setBusy(true);
    setMessage("");
    setStatus(null);
    setBic("");
    try {
      const response = await fetch("/api/bank-account-verification/verify-name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ beneficiaryId, consent: true }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The name check could not be completed.");
      setStatus(result.status);
      setBic(result.bic || "");
      const labels: Record<string,string> = {
        match: "Name matched",
        partial_match: "Close name match",
        no_match: "Name does not match",
        unavailable: "Name check unavailable",
      };
      setMessage(t(result.message || labels[result.status] || "Name check unavailable"));
    } catch (error) {
      setMessage(error instanceof Error ? t(error.message) : t("The name check could not be completed."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="beneficiary-name-check">
      <label className="directory-consent-row">
        <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
        {t("I agree to send the IBAN and recipient name to the verification provider for a name check.")}
      </label>
      <button type="button" onClick={verifyName} disabled={!consent || busy}>
        {busy ? t("Checking…") : t("Verify account-holder name")}
      </button>
      {message && <small className={status === "match" ? "name-check-match" : status === "no_match" ? "name-check-no-match" : ""} role="status">{message}{bic ? ` · BIC ${bic}` : ""}</small>}
    </div>
  );
}
