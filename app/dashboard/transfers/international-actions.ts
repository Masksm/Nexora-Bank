"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function submitExternalTransferRequest(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const sourceAccountId = String(formData.get("source_account_id") || "");
  const country = String(formData.get("country") || "").toUpperCase();
  const bankName = String(formData.get("bank_name") || "").trim();
  const beneficiaryName = String(formData.get("beneficiary_name") || "").trim();
  const accountNumber = String(formData.get("account_number") || "").trim();
  const routingNumber = String(formData.get("routing_number") || "").trim();
  const sortCode = String(formData.get("sort_code") || "").replace(/\D/g, "");
  const iban = String(formData.get("iban") || "").replace(/\s/g, "").toUpperCase();
  const bic = String(formData.get("bic") || "").trim().toUpperCase();
  const amountText = String(formData.get("amount") || "").trim();
  const pin = String(formData.get("pin") || "").trim();

  if (!sourceAccountId || !/^[A-Z]{2}$/.test(country) || bankName.length < 2 ||
      beneficiaryName.length < 2 || !/^\d+(\.\d{1,2})?$/.test(amountText) ||
      !/^\d{6}$/.test(pin)) {
    redirect("/dashboard/transfers?error=" + encodeURIComponent("Check the recipient details, amount and six-digit transaction PIN."));
  }
  const amountMinor = Math.round(Number(amountText) * 100);
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    redirect("/dashboard/transfers?error=" + encodeURIComponent("Enter a valid transfer amount."));
  }

  const { data, error } = await supabase.rpc("submit_external_transfer_request", {
    p_source_account_id: sourceAccountId,
    p_amount_minor: amountMinor,
    p_destination_country: country,
    p_bank_name: bankName,
    p_beneficiary_name: beneficiaryName,
    p_account_number: accountNumber || null,
    p_routing_number: routingNumber || null,
    p_sort_code: sortCode || null,
    p_iban: iban || null,
    p_bic: bic || null,
    p_pin: pin,
  });
  if (error) {
    await supabase.rpc("record_operations_event", {
      p_severity: "warning",
      p_category: "transfer",
      p_service: "International transfer review",
      p_operation: "external_transfer_request_rejected",
      p_error_code: "EXTERNAL_TRANSFER_REQUEST_REJECTED",
      p_request_path: "/dashboard/transfers",
    });
    redirect("/dashboard/transfers?error=" + encodeURIComponent(error.message));
  }
  const result = Array.isArray(data) ? data[0] : data;
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/transfers");
  revalidatePath("/dashboard/transactions");
  redirect("/dashboard/transfers?external=queued&reference=" + encodeURIComponent(result?.reference || ""));
}
