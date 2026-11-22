"use client";

import { useState } from "react";
import { superAdminDeleteAccount } from "./actions";
import type { SupportedLocale } from "@/lib/locale";
import { pageText } from "@/lib/page-translations";

export function DeleteAccountForm({ userId, email, locale }: { userId: string; email: string; locale: SupportedLocale }) {
  const t=(value:string)=>pageText(locale,value);
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return <button type="button" className="super-delete-start" onClick={() => setConfirming(true)}>{t("Delete account")}</button>;
  }
  return (
    <form action={superAdminDeleteAccount} className="super-delete-confirm">
      <input type="hidden" name="user_id" value={userId}/>
      <label>{t("Type")} <strong>{email}</strong> to confirm
        <input type="email" name="confirm_email" placeholder={t("Account email")} autoComplete="off" required/>
      </label>
      <div>
        <button type="button" className="super-delete-cancel" onClick={() => setConfirming(false)}>{t("Cancel")}</button>
        <button type="submit" className="super-delete-submit">{t("Permanently delete")}</button>
      </div>
    </form>
  );
}
