"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createScheduledTransfer(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const accountId = String(formData.get("account_id") || "");
  const recipient = String(formData.get("recipient") || "").trim();
  const amountText = String(formData.get("amount") || "").trim();
  const description = String(formData.get("description") || "").trim().slice(0, 160);
  const frequency = String(formData.get("frequency") || "once");
  const scheduledFor = String(formData.get("scheduled_for_utc") || "");
  const amountMinor = Math.round(Number(amountText) * 100);
  const due = new Date(scheduledFor);

  if (!accountId || !/^\d{10}$/.test(recipient) || !/^\d+(\.\d{1,2})?$/.test(amountText) ||
      !Number.isSafeInteger(amountMinor) || amountMinor <= 0 ||
      !["once", "weekly", "monthly"].includes(frequency) || !scheduledFor || Number.isNaN(due.getTime())) {
    redirect("/dashboard/scheduled-transfers?error=Check%20the%20transfer%20details.");
  }
  const now = Date.now();
  if (due.getTime() < now + 5 * 60 * 1000 || due.getTime() > now + 366 * 24 * 60 * 60 * 1000) {
    redirect("/dashboard/scheduled-transfers?error=Choose%20a%20date%20at%20least%205%20minutes%20ahead%20and%20within%2012%20months.");
  }

  const { error } = await supabase.from("scheduled_transfers").insert({
    user_id: user.id,
    from_account_id: accountId,
    recipient_account_number: recipient,
    amount_minor: amountMinor,
    description: description || null,
    frequency,
    scheduled_for: due.toISOString(),
  });
  if (error) redirect("/dashboard/scheduled-transfers?error=Unable%20to%20save%20this%20schedule.%20Check%20the%20source%20account.");
  revalidatePath("/dashboard/scheduled-transfers");
  redirect("/dashboard/scheduled-transfers?success=1");
}

export async function cancelScheduledTransfer(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const id = String(formData.get("schedule_id") || "");
  if (!id) redirect("/dashboard/scheduled-transfers?error=Invalid%20schedule.");
  const { error } = await supabase.from("scheduled_transfers")
    .update({ status: "cancelled" })
    .eq("id", id).eq("user_id", user.id).eq("status", "scheduled");
  if (error) redirect("/dashboard/scheduled-transfers?error=Unable%20to%20cancel%20this%20schedule.");
  revalidatePath("/dashboard/scheduled-transfers");
  redirect("/dashboard/scheduled-transfers?success=cancelled");
}
