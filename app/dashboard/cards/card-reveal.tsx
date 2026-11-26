"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Copy, Eye, EyeOff, LockKeyhole, ShieldCheck, X } from "lucide-react";

type CardDetails = {
  number: string;
  expiry: string;
  cvv: string;
  previewOnly: true;
};

type Props = {
  cardId: string;
  network: string;
  last4: string;
  cardholder: string;
};

export function CardReveal({
  cardId,
  network,
  last4,
  cardholder,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [details, setDetails] = useState<CardDetails | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");
  const [showPin, setShowPin] = useState(false);
  const pinInput = useRef<HTMLInputElement>(null);

  const closeDialog = useCallback(() => {
    setOpen(false);
    setPin("");
    setDetails(null);
    setError("");
    setCopied("");
    setShowPin(false);
  }, []);

  useEffect(() => {
    if (open && !details) pinInput.current?.focus();
  }, [open, details]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDialog();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, closeDialog]);

  useEffect(() => {
    if (!details) return;
    const timeout = window.setTimeout(() => closeDialog(), 30_000);
    return () => window.clearTimeout(timeout);
  }, [details, closeDialog]);

  async function reveal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{6}$/.test(pin) || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/cards/${cardId}/reveal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "Unable to verify your PIN.");
        if (result.locked) setPin("");
        return;
      }
      setDetails(result as CardDetails);
      setPin("");
    } catch {
      setError("A connection error occurred. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copyValue(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(""), 1800);
    } catch {
      setError("Copy is unavailable in this browser. Select the value to copy it manually.");
    }
  }

  return (
    <>
      <button
        type="button"
        className="virtual-card-reveal-trigger"
        onClick={() => {
          setOpen(true);
          setError("");
        }}
        aria-label={`View protected details for card ending in ${last4}`}
      >
        <span className="virtual-card-top">
          <span>NEXORA</span>
          <span className="virtual-card-network">{network.toUpperCase()}</span>
        </span>
        <span className="virtual-card-chip" aria-hidden="true" />
        <strong className="virtual-card-number">•••• •••• •••• {last4}</strong>
        <span className="virtual-card-bottom">
          <span>{cardholder}<small>CARDHOLDER</small></span>
          <span>••/••<small>VALID THRU</small></span>
          <span>•••<small>CVV</small></span>
        </span>
        <span className="virtual-card-disclosure"><LockKeyhole size={12}/> PIN required to reveal details</span>
      </button>

      {open && (
        <div
          className="card-reveal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDialog();
          }}
        >
          <section
            className="card-reveal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`card-reveal-title-${cardId}`}
            aria-describedby={`card-reveal-description-${cardId}`}
          >
            <header className="card-reveal-header">
              <div className="card-reveal-heading-icon"><ShieldCheck size={19}/></div>
              <div>
                <h2 id={`card-reveal-title-${cardId}`}>{details ? "Card details" : "Verify your identity"}</h2>
                <p id={`card-reveal-description-${cardId}`}>
                  {details
                    ? "Your protected card preview details are visible temporarily."
                    : `Enter your transaction PIN to view the card ending in ${last4}.`}
                </p>
              </div>
              <button type="button" className="card-reveal-close" onClick={closeDialog} aria-label="Close card details"><X size={18}/></button>
            </header>

            {details ? (
              <div className="card-reveal-values">
                <div className="card-reveal-value">
                  <span>Card number</span>
                  <strong>{details.number}</strong>
                  <button type="button" onClick={() => copyValue("number", details.number.replaceAll(" ", ""))}><Copy size={14}/>{copied === "number" ? "Copied" : "Copy"}</button>
                </div>
                <div className="card-reveal-value-row">
                  <div className="card-reveal-value">
                    <span>Valid through</span>
                    <strong>{details.expiry}</strong>
                    <button type="button" onClick={() => copyValue("expiry", details.expiry)}><Copy size={14}/>{copied === "expiry" ? "Copied" : "Copy"}</button>
                  </div>
                  <div className="card-reveal-value">
                    <span>CVV</span>
                    <strong>{details.cvv}</strong>
                    <button type="button" onClick={() => copyValue("cvv", details.cvv)}><Copy size={14}/>{copied === "cvv" ? "Copied" : "Copy"}</button>
                  </div>
                </div>
                <p className="card-reveal-preview-note"></p>
                <button type="button" className="card-reveal-primary" onClick={closeDialog}><EyeOff size={15}/> Hide card details</button>
              </div>
            ) : (
              <form className="card-reveal-form" onSubmit={reveal}>
                <label htmlFor={`card-pin-${cardId}`}>Six-digit transaction PIN</label>
                <div className="card-reveal-pin-wrap">
                  <input
                    ref={pinInput}
                    id={`card-pin-${cardId}`}
                    type={showPin ? "text" : "password"}
                    inputMode="numeric"
                    autoComplete="off"
                    pattern="[0-9]{6}"
                    minLength={6}
                    maxLength={6}
                    value={pin}
                    onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="Enter your PIN"
                    required
                  />
                  <button type="button" onClick={() => setShowPin((value) => !value)} aria-label={showPin ? "Hide PIN" : "Show PIN"}>
                    {showPin ? <EyeOff size={17}/> : <Eye size={17}/>}
                  </button>
                </div>
                {error && <p className="card-reveal-error" role="alert">{error}</p>}
                <p className="card-reveal-hint"><LockKeyhole size={13}/> Your PIN is checked securely and is never stored by this page.</p>
                <button type="submit" className="card-reveal-primary" disabled={busy || pin.length !== 6}>
                  {busy ? "Verifying…" : "Verify PIN and reveal"}
                </button>
              </form>
            )}
          </section>
        </div>
      )}
    </>
  );
}
