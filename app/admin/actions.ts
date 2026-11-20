"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.auth.getClaims();
  const appMetadata = data?.claims?.app_metadata as { role?: string } | undefined;
  if (!user || error || appMetadata?.role !== "admin") redirect("/login");
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
  const supabase = await requireAdmin();
  try {
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
  } catch (error) {
    resultUrl("error", error instanceof Error ? error.message : "The adjustment could not be completed.");
  }
  resultUrl("success", "Ledger adjustment posted successfully.");
}

export async function generateDemoHistory(formData: FormData) {
  const supabase = await requireAdmin();
  try {
    const accountId = String(formData.get("account_id") || "");
    const targetMinor = amountToMinor(formData.get("target_amount"));
    const startYear = Number(formData.get("start_year") || 2019);
    const transactionCount = Number(formData.get("transactions") || 100);
    if (!accountId || !Number.isInteger(startYear) || !Number.isInteger(transactionCount) || transactionCount < 3 || transactionCount > 250) {
      throw new Error("Check the selected account, start year and activity count.");
    }
    const { error } = await supabase.rpc("admin_generate_demo_history", {
      p_account_id: accountId, p_target_balance_minor: targetMinor,
      p_start_year: startYear, p_pairs: transactionCount,
    });
    if (error) throw error;
    revalidatePath("/admin");
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/accounts");
    revalidatePath("/dashboard/transactions");
  } catch (error) {
    const details = error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message: unknown }).message)
        : "Unknown database error.";
    console.error("Demo history generation failed:", error);
    resultUrl("error", details.slice(0, 500));
  }
  resultUrl("success", "Synthetic historical activity generated. The account balance matches the target.");
}

export async function setAccountStatus(formData: FormData) {
  const supabase = await requireAdmin();
  try {
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
  } catch (error) {
    resultUrl("error", error instanceof Error ? error.message : "Account status could not be changed.");
  }
  resultUrl("success", "Account status updated.");
}

export async function reviewTransfer(formData: FormData) {
  const supabase = await requireAdmin();
  const transactionId = String(formData.get("transaction_id") || "");
  const decision = String(formData.get("decision") || "");
  const reason = String(formData.get("reason") || "").trim();
  if (!transactionId || !["approve","reject"].includes(decision) || reason.length < 8) {
    resultUrl("error", "Choose a decision and provide a reason of at least 8 characters.");
  }
  const { error } = await supabase.rpc("admin_review_transfer", {
    p_transaction_id: transactionId, p_decision: decision, p_reason: reason,
  });
  if (error) resultUrl("error", error.message);
  revalidatePath("/admin");
  revalidatePath("/admin/reviews");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/transactions");
  resultUrl("success", decision === "approve" ? "Transfer approved and posted." : "Transfer rejected.");
}

export async function setDeviceTrust(formData: FormData) {
  const supabase = await requireAdmin();
  const deviceId = String(formData.get("device_id") || "");
  const trusted = String(formData.get("trusted") || "") === "true";
  const reason = String(formData.get("reason") || "").trim();
  if (!deviceId || reason.length < 8) resultUrl("error", "A device and a reason of at least 8 characters are required.");
  const { error } = await supabase.rpc("admin_set_device_trust", {
    p_device_id: deviceId, p_trusted: trusted, p_reason: reason,
  });
  if (error) resultUrl("error", error.message);
  revalidatePath("/admin/reviews");
  resultUrl("success", trusted ? "Device marked as trusted." : "Device trust revoked.");
}

export async function adminReplySupport(formData: FormData) {
  const supabase = await requireAdmin();
  const conversationId = String(formData.get("conversation_id") || "");
  const body = String(formData.get("body") || "").trim().slice(0,4000);
  if (!conversationId || !body) resultUrl("error", "Enter a reply.");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { error } = await supabase.from("support_messages").insert({
    conversation_id: conversationId, sender_user_id: user.id, sender_role: "admin", body,
  });
  if (error) resultUrl("error", error.message);
  revalidatePath("/admin/support");
  resultUrl("success", "Reply sent to the customer.");
}

export async function updateSupportStatus(formData: FormData) {
  const supabase = await requireAdmin();
  const conversationId = String(formData.get("conversation_id") || "");
  const status = String(formData.get("status") || "");
  if (!conversationId || !["open","waiting_customer","waiting_admin","resolved","closed"].includes(status)) {
    resultUrl("error", "Choose a valid support status.");
  }
  const { error } = await supabase.from("support_conversations").update({ status, updated_at: new Date().toISOString() }).eq("id", conversationId);
  if (error) resultUrl("error", error.message);
  revalidatePath("/admin/support");
  resultUrl("success", "Support status updated.");
}

export async function revokeUserSession(formData: FormData) {
  const supabase = await requireAdmin();
  const sessionId = String(formData.get("session_id") || "");
  const reason = String(formData.get("reason") || "").trim();
  if (!sessionId || reason.length < 8) resultUrl("error", "Select a session and provide a reason of at least 8 characters.");
  const { error } = await supabase.rpc("admin_revoke_user_session", {
    p_session_record_id: sessionId, p_reason: reason,
  });
  if (error) resultUrl("error", error.message);
  revalidatePath("/admin/reviews");
  resultUrl("success", "Session revoked. The affected user will be signed out on their next protected request.");
}
