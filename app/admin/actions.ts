"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.auth.getClaims();
  const appMetadata = data?.claims?.app_metadata as { role?: string } | undefined;
  if (!user || error || !["admin", "super_admin"].includes(appMetadata?.role ?? "")) redirect("/login");
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
  resultUrl("success", "Account activity generated. The account balance matches the target.");
}

export async function resetDemoHistory(formData: FormData) {
  const supabase = await requireAdmin();
  try {
    const accountId = String(formData.get("account_id") || "");
    const confirmation = String(formData.get("confirm_account_number") || "").trim();
    const reason = String(formData.get("reason") || "").trim();
    if (!accountId || !/^\d{10}$/.test(confirmation) || reason.length < 8 || reason.length > 240) {
      throw new Error("Select an account, enter its exact 10-digit account number, and provide a reason of at least 8 characters.");
    }
    const { data, error } = await supabase.rpc("admin_reset_demo_history", {
      p_account_id: accountId,
      p_confirm_account_number: confirmation,
      p_reason: reason,
    });
    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data;
    const deleted = Number(result?.deleted_transactions || 0);
    revalidatePath("/admin");
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/accounts");
    revalidatePath("/dashboard/transactions");
    resultUrl("success", `History cleared. Removed ${deleted} eligible transactions and returned the account balance to zero.`);
  } catch (error) {
    const details = error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message: unknown }).message)
        : "Unknown database error.";
    console.error("Demo history reset failed:", error);
    resultUrl("error", details.slice(0, 500));
  }
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

export async function reviewExternalTransfer(formData: FormData) {
  const supabase = await requireAdmin();
  const requestId = String(formData.get("request_id") || "");
  const decision = String(formData.get("decision") || "");
  const reason = String(formData.get("reason") || "").trim();
  if (!requestId || !["approve", "reject"].includes(decision) || reason.length < 8) {
    redirect("/admin/reviews?kind=error&message=" + encodeURIComponent("Choose a decision and provide a review reason of at least 8 characters."));
  }
  const { data, error } = await supabase.rpc("admin_review_external_transfer", {
    p_request_id: requestId,
    p_decision: decision,
    p_reason: reason,
  });
  if (error) redirect("/admin/reviews?kind=error&message=" + encodeURIComponent(error.message));
  const result = Array.isArray(data) ? data[0] : data;
  revalidatePath("/admin/reviews");
  revalidatePath("/dashboard/transfers");
  redirect("/admin/reviews?external_result=" + decision + "&reference=" + encodeURIComponent(result?.reference || ""));
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


export async function recordIdentityVerificationResult(formData: FormData) {
  const supabase = await requireAdmin();
  const attemptId = String(formData.get("attempt_id") || "");
  const integrityStatus = String(formData.get("document_integrity_status") || "needs_review");
  const documentStatus = String(formData.get("document_authenticity_status") || "");
  const livenessStatus = String(formData.get("liveness_status") || "");
  const summary = String(formData.get("result_summary") || "").trim().slice(0, 500);
  if (!attemptId || !["not_checked", "valid_format", "invalid_format", "needs_review"].includes(integrityStatus)
      || !["not_checked", "provider_passed", "provider_failed", "manual_review"].includes(documentStatus)
      || !["not_started", "passed", "failed", "manual_review", "unavailable"].includes(livenessStatus)) {
    redirect("/admin/kyc?kind=error&message=Choose%20valid%20document%20and%20liveness%20results.");
  }
  const { error } = await supabase.rpc("admin_record_identity_verification_result", {
    p_attempt_id: attemptId,
    p_document_integrity_status: integrityStatus,
    p_document_authenticity_status: documentStatus,
    p_liveness_status: livenessStatus,
    p_result_summary: summary || null,
  });
  if (error) redirect("/admin/kyc?kind=error&message=" + encodeURIComponent(error.message));
  revalidatePath("/admin/kyc");
  revalidatePath("/dashboard/settings");
  redirect("/admin/kyc?kind=success&message=" + encodeURIComponent("Sandbox verification results saved."));
}

export async function reviewIdentityDocument(formData: FormData) {
  const supabase = await requireAdmin();
  const documentId = String(formData.get("document_id") || "");
  const decision = String(formData.get("decision") || "");
  const rejectionReason = String(formData.get("rejection_reason") || "").trim();
  if (!documentId || !["under_review", "verified", "rejected"].includes(decision)) {
    redirect("/admin/kyc?kind=error&message=Choose%20a%20valid%20document%20review%20decision.");
  }
  if (decision === "rejected" && (rejectionReason.length < 8 || rejectionReason.length > 500)) {
    redirect("/admin/kyc?kind=error&message=Provide%20a%20clear%20rejection%20reason%20between%208%20and%20500%20characters.");
  }
  const { error } = await supabase.rpc("admin_review_identity_document", {
    p_document_id: documentId,
    p_decision: decision,
    p_rejection_reason: decision === "rejected" ? rejectionReason : null,
  });
  if (error) {
    redirect("/admin/kyc?kind=error&message=" + encodeURIComponent(error.message));
  }
  revalidatePath("/admin/kyc");
  revalidatePath("/admin/audit");
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
  redirect("/admin/kyc?kind=success&message=" + encodeURIComponent(
    decision === "verified" ? "Identity document verified." :
    decision === "rejected" ? "Document rejected. The customer can see the reason and submit a replacement." :
    "Document moved into review."
  ));
}


export async function issueSupportPaymentProcedure(formData: FormData) {
  const supabase = await requireAdmin();
  const conversationId = String(formData.get("conversation_id") || "");
  const pair = String(formData.get("payment_pair") || "");
  const walletAddress = String(formData.get("wallet_address") || "").trim();
  const amountRaw = String(formData.get("expected_amount") || "").trim();
  const purpose = String(formData.get("purpose") || "").trim();
  const selected = pair === "USDT_TRON" ? { cryptocurrency: "USDT", network: "TRON (TRC20)", decimals: 6, addressPattern: /^T[1-9A-HJ-NP-Za-km-z]{33}$/ } : pair === "BTC_BITCOIN" ? { cryptocurrency: "BTC", network: "BITCOIN", decimals: 8, addressPattern: /^(bc1[ac-hj-np-z02-9]{11,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/ } : null;
  const parts = amountRaw.split(".");
  const validAmount = parts.length <= 2 && /^(0|[1-9]\d*)$/.test(parts[0] || "") && (parts.length === 1 || (parts[1].length > 0 && parts[1].length <= (selected?.decimals ?? 0) && /^\d+$/.test(parts[1])));
  const amount = Number(amountRaw);
  if (!conversationId || !selected || !selected.addressPattern.test(walletAddress) || !validAmount || !Number.isFinite(amount) || amount <= 0 || purpose.length < 3 || purpose.length > 500) {
    redirect("/admin/support?ticket=" + encodeURIComponent(conversationId) + "&kind=error&message=" + encodeURIComponent("Choose a supported asset/network, enter an address in the accepted format, and provide a valid amount and purpose."));
  }
  let addressChecksumValid = false;
  try {
    const validationResponse = selected.cryptocurrency === "USDT"
      ? await fetch("https://api.trongrid.io/wallet/validateaddress", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: walletAddress, visible: true }) })
      : await fetch("https://mempool.space/api/v1/validate-address/" + encodeURIComponent(walletAddress));
    if (!validationResponse.ok) throw new Error("Address validation service unavailable.");
    const validation = await validationResponse.json();
    addressChecksumValid = selected.cryptocurrency === "USDT" ? validation.result === true : validation.isvalid === true;
  } catch {
    redirect("/admin/support?ticket=" + encodeURIComponent(conversationId) + "&kind=error&message=" + encodeURIComponent("The network address validator is temporarily unavailable. No payment instruction was issued; try again later."));
  }
  if (!addressChecksumValid) {
    redirect("/admin/support?ticket=" + encodeURIComponent(conversationId) + "&kind=error&message=" + encodeURIComponent("The address checksum or network format is invalid. Recheck the receiving address in the selected wallet."));
  }
  const { error } = await supabase.rpc("create_support_payment_procedure", { p_conversation_id: conversationId, p_cryptocurrency: selected.cryptocurrency, p_network: selected.network, p_wallet_address: walletAddress, p_expected_amount: amountRaw, p_amount_currency: selected.cryptocurrency, p_purpose: purpose });
  if (error) redirect("/admin/support?ticket=" + encodeURIComponent(conversationId) + "&kind=error&message=" + encodeURIComponent(error.message));
  revalidatePath("/admin/support");
  redirect("/admin/support?ticket=" + encodeURIComponent(conversationId) + "&kind=success&message=" + encodeURIComponent("Payment instruction issued. The selected network and address format were validated."));
}

export async function reviewSupportPaymentReceipt(formData: FormData) {
  const supabase = await requireAdmin();
  const receiptId = String(formData.get("receipt_id") || "");
  const conversationId = String(formData.get("conversation_id") || "");
  const decision = String(formData.get("decision") || "");
  const note = String(formData.get("note") || "").trim();
  if (!receiptId || !conversationId || !["reviewed", "rejected"].includes(decision) || note.length < 3 || note.length > 500) {
    redirect("/admin/support?ticket=" + encodeURIComponent(conversationId) + "&kind=error&message=" + encodeURIComponent("Choose a receipt decision and provide a note."));
  }
  const { error } = await supabase.rpc("review_support_payment_receipt", {
    p_receipt_id: receiptId, p_decision: decision, p_note: note,
  });
  if (error) redirect("/admin/support?ticket=" + encodeURIComponent(conversationId) + "&kind=error&message=" + encodeURIComponent(error.message));
  revalidatePath("/admin/support");
  revalidatePath("/super-admin/audit");
  redirect("/admin/support?ticket=" + encodeURIComponent(conversationId) + "&kind=success&message=" + encodeURIComponent("Receipt review saved. Payment has not been marked as confirmed."));
}
