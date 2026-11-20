"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.auth.getClaims();
  const role = data?.claims?.app_metadata as { role?: string } | undefined;
  if (!user || error || role?.role !== "admin") redirect("/login");
  return supabase;
}

function amountToMinor(value: FormDataEntryValue | null) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || !/^\d+(\.\d{1,2})?$/.test(String(value))) {
    throw new Error("Enter a valid positive amount with no more than two decimal places.");
  }
  const minor = Math.round(amount * 100);
  if (!Number.isSafeInteger(minor) || minor > 9000000000000000) throw new Error("Amount is outside the supported range.");
  return minor;
}

function resultUrl(kind: string, message: string): never {
  redirect(`/admin?kind=${encodeURIComponent(kind)}&message=${encodeURIComponent(message)}`);
}

export async function adjustBalance(formData: FormData) {
  try {
    const supabase = await requireAdmin();
    const accountId = String(formData.get("account_id") || "");
    const direction = String(formData.get("direction") || "");
    const amountMinor = amountToMinor(formData.get("amount"));
    const reason = String(formData.get("reason") || "").trim();
    if (!accountId || !["credit", "debit"].includes(direction) || reason.length < 8) {
      throw new Error("Choose an account, direction and a reason of at least 8 characters.");
    }
    const { error } = await supabase.rpc("admin_adjust_balance", {
      p_account_id: accountId, p_direction: direction, p_amount_minor: amountMinor, p_reason: reason,
    });
    if (error) throw error;
    revalidatePath("/admin");
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/accounts");
    revalidatePath("/dashboard/transactions");
    resultUrl("success", "Ledger adjustment posted successfully.");
  } catch (error) {
    resultUrl("error", error instanceof Error ? error.message : "The adjustment could not be completed.");
  }
}

export async function generateDemoHistory(formData: FormData) {
  try {
    const supabase = await requireAdmin();
    const accountId = String(formData.get("account_id") || "");
    const targetMinor = amountToMinor(formData.get("target_amount"));
    const startYear = Number(formData.get("start_year") || 2019);
    const pairs = Number(formData.get("pairs") || 24);
    if (!accountId || !Number.isInteger(startYear) || !Number.isInteger(pairs)) {
      throw new Error("Check the selected account, start year and activity count.");
    }
    const { error } = await supabase.rpc("admin_generate_demo_history", {
      p_account_id: accountId, p_target_balance_minor: targetMinor,
      p_start_year: startYear, p_pairs: pairs,
    });
    if (error) throw error;
    revalidatePath("/admin");
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/accounts");
    revalidatePath("/dashboard/transactions");
    resultUrl("success", "Synthetic historical activity generated. The account balance matches the target.");
  } catch (error) {
    resultUrl("error", error instanceof Error ? error.message : "Demo history could not be generated.");
  }
}

export async function setAccountStatus(formData: FormData) {
  try {
    const supabase = await requireAdmin();
    const accountId = String(formData.get("account_id") || "");
    const status = String(formData.get("status") || "");
    const reason = String(formData.get("reason") || "").trim();
    if (!accountId || !["active", "frozen", "blocked"].includes(status) || reason.length < 8) {
      throw new Error("Choose an account and status, and provide a reason of at least 8 characters.");
    }
    const { error } = await supabase.rpc("admin_set_account_status", {
      p_account_id: accountId, p_status: status, p_reason: reason,
    });
    if (error) throw error;
    revalidatePath("/admin");
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/accounts");
    resultUrl("success", "Account status updated.");
  } catch (error) {
    resultUrl("error", error instanceof Error ? error.message : "Account status could not be changed.");
  }
}
