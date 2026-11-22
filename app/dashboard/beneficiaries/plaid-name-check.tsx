"use client";

import { useState } from "react";
import Script from "next/script";
import type { SupportedLocale } from "@/lib/locale";
import { pageText } from "@/lib/page-translations";

declare global {
  interface Window {
    Plaid?: {
      create: (config: {
        token: string;
        onSuccess: (publicToken: string, metadata: unknown) => void;
        onExit?: () => void;
      }) => { open: () => void };
    };
  }
}

export default function PlaidNameCheck({ beneficiaryId, locale }: {
  beneficiaryId: string;
  locale: SupportedLocale;
}) {
  const t = (value: string) => pageText(locale, value);
  const [scriptReady, setScriptReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [matched, setMatched] = useState<boolean | null>(null);

  async function startCheck() {
    if (busy) return;
    if (!window.Plaid) {
      setMessage(t("Bank connection is still loading. Try again."));
      return;
    }
    setBusy(true);
    setMessage("");
    setMatched(null);
    try {
      const tokenResponse = await fetch("/api/bank-account-verification/link-token", { method: "POST" });
      const tokenData = await tokenResponse.json();
      if (!tokenResponse.ok || !tokenData.link_token) throw new Error(tokenData.error || "Unable to start bank connection.");

      const handler = window.Plaid.create({
        token: tokenData.link_token,
        onSuccess: async (publicToken) => {
          setMessage(t("Checking the account-holder name…"));
          try {
            const response = await fetch("/api/bank-account-verification/check-name", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ publicToken, beneficiaryId }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "The name check could not be completed.");
            setMatched(Boolean(result.matched));
            setMessage(result.matched
              ? `${t("Name matched")}: ${result.matchedName}`
              : t(result.message || "The account-holder name did not match."));
          } catch (error) {
            setMatched(false);
            setMessage(error instanceof Error ? t(error.message) : t("The name check could not be completed."));
          } finally {
            setBusy(false);
          }
        },
        onExit: () => setBusy(false),
      });
      handler.open();
    } catch (error) {
      setMessage(error instanceof Error ? t(error.message) : t("Unable to start bank connection."));
      setBusy(false);
    }
  }

  return (
    <div className="beneficiary-name-check">
      <Script src="https://cdn.plaid.com/link/v2/stable/link-initialize.js" strategy="afterInteractive" onReady={() => setScriptReady(true)} />
      <button type="button" onClick={startCheck} disabled={busy || !scriptReady}>
        {busy ? t("Checking…") : t("Check account-holder name")}
      </button>
      {message && <small className={matched === true ? "name-check-match" : matched === false ? "name-check-no-match" : ""} role="status">{message}</small>}
    </div>
  );
}
