"use client";

import { useState } from "react";
import { superAdminDeleteAccount } from "./actions";

export function DeleteAccountForm({ userId, email }: { userId: string; email: string }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return <button type="button" className="super-delete-start" onClick={() => setConfirming(true)}>Delete account</button>;
  }
  return (
    <form action={superAdminDeleteAccount} className="super-delete-confirm">
      <input type="hidden" name="user_id" value={userId}/>
      <label>Type <strong>{email}</strong> to confirm
        <input type="email" name="confirm_email" placeholder="Account email" autoComplete="off" required/>
      </label>
      <div>
        <button type="button" className="super-delete-cancel" onClick={() => setConfirming(false)}>Cancel</button>
        <button type="submit" className="super-delete-submit">Permanently delete</button>
      </div>
    </form>
  );
}
