"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function submitTransfer(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const accountId = String(formData.get("account_id") || "");
  const recipient = String(formData.get("recipient") || "").trim();
  const amountText = String(formData.get("amount") || "");
  const description = String(formData.get("description") || "").trim();
  if (!accountId || !/^\d{10}$/.test(recipient) || !/^\d+(\.\d{1,2})?$/.test(amountText)) {
    redirect("/dashboard/transfers?error=Check%20the%20account%20number%20and%20amount.");
  }
  const amountMinor = Math.round(Number(amountText) * 100);
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) redirect("/dashboard/transfers?error=Enter%20a%20valid%20amount.");
  const { data, error } = await supabase.rpc("transfer_funds", {
    p_from_account_id: accountId,
    p_recipient_account_number: recipient,
    p_amount_minor: amountMinor,
    p_description: description.slice(0, 160) || null,
    p_idempotency_key: randomUUID(),
  });
  if (error) redirect(`/dashboard/transfers?error=${encodeURIComponent(error.message)}`);
  const result = Array.isArray(data) ? data[0] : data;
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/accounts");
  revalidatePath("/dashboard/transactions");
  if (result?.status === "review") redirect("/dashboard/transfers?review=1");
  redirect("/dashboard/transfers?success=1");
}
