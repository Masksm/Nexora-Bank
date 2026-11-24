"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { verifyPasswordRecoveryCode } from "@/app/auth/actions";

type Props = { expiresAt: number };

export default function RecoveryCodeForm({ expiresAt }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))
  );

  useEffect(() => {
    const update = () => setSecondsLeft(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [expiresAt]);

  const minutes = Math.floor(secondsLeft / 60).toString().padStart(2, "0");
  const seconds = (secondsLeft % 60).toString().padStart(2, "0");

  if (secondsLeft <= 0) {
    return (
      <div className="auth-form">
        <p className="form-message error" role="alert">Your recovery code has expired. Request a new code to continue.</p>
        <Link className="auth-submit" href="/forgot-password?step=request">Request a new code <span>↗</span></Link>
      </div>
    );
  }

  return (
    <form action={verifyPasswordRecoveryCode} className="auth-form">
      <label htmlFor="token">Recovery code</label>
      <input id="token" name="token" type="text" inputMode="numeric" pattern="[0-9]{4,12}" maxLength={12} autoComplete="one-time-code" placeholder="Enter code" required />
      <p className="auth-intro" aria-live="polite">
        Code expires in <strong>{minutes}:{seconds}</strong>. Only the newest code emailed to you can be used.
      </p>
      <button className="auth-submit" type="submit">Verify code <span>↗</span></button>
    </form>
  );
}
