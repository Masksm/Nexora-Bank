"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function amountToMinor(raw: FormDataEntryValue | null) {
  const value = String(raw ?? "").trim();
  if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const minor = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}

async function authenticatedClient() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return supabase;
}

export async function createSavingsGoal(formData: FormData) {
  const supabase = await authenticatedClient();
  const name = String(formData.get("name") ?? "").trim();
  const targetMinor = amountToMinor(formData.get("target_amount"));
  const targetDateValue = String(formData.get("target_date") ?? "").trim();
  const targetDate = targetDateValue || null;
  if (name.length < 2 || name.length > 60 || !targetMinor) redirect("/dashboard/savings?error=Enter%20a%20valid%20goal%20name%20and%20target%20amount.");
  if (targetDate && !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) redirect("/dashboard/savings?error=Choose%20a%20valid%20target%20date.");

  const { error } = await supabase.rpc("create_savings_goal", { p_name: name, p_target_minor: targetMinor, p_target_date: targetDate });
  if (error) redirect("/dashboard/savings?error=" + encodeURIComponent(error.message));
  revalidatePath("/dashboard/savings");
  revalidatePath("/dashboard");
  redirect("/dashboard/savings?success=goal_created");
}

export async function moveSavingsGoalFunds(formData: FormData) {
  const supabase = await authenticatedClient();
  const goalId = String(formData.get("goal_id") ?? "");
  const accountId = String(formData.get("account_id") ?? "");
  const direction = String(formData.get("direction") ?? "");
  const amountMinor = amountToMinor(formData.get("amount"));
  const idempotencyKey = String(formData.get("idempotency_key") ?? "");
  const pin = String(formData.get("pin") ?? "").trim();
  if (!goalId || !accountId || !["contribution", "withdrawal"].includes(direction) || !amountMinor || idempotencyKey.length < 8 || !/^\d{6}$/.test(pin)) {
    redirect("/dashboard/savings?error=Check%20the%20savings%20amount%20and%20account%20details.");
  }

  const { data, error } = await supabase.rpc("move_savings_goal_funds_with_pin", {
    p_goal_id: goalId, p_account_id: accountId, p_amount_minor: amountMinor,
    p_direction: direction, p_idempotency_key: idempotencyKey, p_pin: pin,
  });
  if (error) redirect("/dashboard/savings?error=" + encodeURIComponent(error.message));
  if (!data) { await supabase.rpc("record_operations_event", { p_severity: "warning", p_category: "authentication", p_service: "Transaction authorization", p_operation: "pin_rejected", p_error_code: "PIN_REJECTED", p_request_path: "/dashboard/savings" }); redirect("/dashboard/savings?error=Incorrect%20PIN%20or%20PIN%20temporarily%20locked."); }
  revalidatePath("/dashboard/savings");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/accounts");
  revalidatePath("/dashboard/transactions");
  redirect("/dashboard/savings?success=" + direction);
}
