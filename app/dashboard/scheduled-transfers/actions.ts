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
  const pin = String(formData.get("pin") || "").trim();
  const scheduledFor = String(formData.get("scheduled_for_utc") || "");
  const amountMinor = Math.round(Number(amountText) * 100);
  const due = new Date(scheduledFor);

  if (!accountId || !/^\d{10}$/.test(recipient) || !/^\d+(\.\d{1,2})?$/.test(amountText) ||
      !Number.isSafeInteger(amountMinor) || amountMinor <= 0 ||
      !["once", "weekly", "monthly"].includes(frequency) || !/^\d{6}$/.test(pin) || !scheduledFor || Number.isNaN(due.getTime())) {
    redirect("/dashboard/scheduled-transfers?error=Check%20the%20transfer%20details.");
  }
  const now = Date.now();
  if (due.getTime() < now + 5 * 60 * 1000 || due.getTime() > now + 366 * 24 * 60 * 60 * 1000) {
    redirect("/dashboard/scheduled-transfers?error=Choose%20a%20date%20at%20least%205%20minutes%20ahead%20and%20within%2012%20months.");
  }

  const { data, error } = await supabase.rpc("create_scheduled_transfer_with_pin", {
    p_from_account_id: accountId,
    p_recipient_account_number: recipient,
    p_amount_minor: amountMinor,
    p_description: description || null,
    p_frequency: frequency,
    p_scheduled_for: due.toISOString(),
    p_pin: pin,
  });
  if (error) {
    await supabase.rpc("record_operations_event", { p_severity: "warning", p_category: "transfer", p_service: "Scheduled transfers", p_operation: "schedule_creation_failed", p_error_code: error.code || "SCHEDULE_CREATE_FAILED", p_request_path: "/dashboard/scheduled-transfers" });
    redirect("/dashboard/scheduled-transfers?error=" + encodeURIComponent(error.message));
  }
  if (!data) redirect("/dashboard/scheduled-transfers?error=Incorrect%20PIN%20or%20PIN%20temporarily%20locked.");
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
