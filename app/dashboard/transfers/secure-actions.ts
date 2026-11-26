"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

function parseTransfer(formData: FormData) {
 const accountId=String(formData.get("account_id")||"");
 const recipient=String(formData.get("recipient")||"").trim();
 const amountText=String(formData.get("amount")||"");
 const description=String(formData.get("description")||"").trim().slice(0,160);
 const pin=String(formData.get("pin")||"").trim();
 if(!accountId||!/^\d{10}$/.test(recipient)||!/^\d+(\.\d{1,2})?$/.test(amountText)||!/^\d{6}$/.test(pin)) {
  return {error:"Check the account number, amount and transaction PIN."};
 }
 const amountMinor=Math.round(Number(amountText)*100);
 if(!Number.isSafeInteger(amountMinor)||amountMinor<=0) return {error:"Enter a valid amount."};
 return {accountId,recipient,amountMinor,description,pin};
}

async function pinFailureMessage(supabase:ServerSupabaseClient,status:string) {
 if(status==="pin_locked") return "Your transaction PIN is temporarily blocked after four incorrect attempts. Try again after 15 minutes.";
 const {data}=await supabase.rpc("get_transaction_pin_status");
 const row=Array.isArray(data)?data[0]:data;
 if(row?.is_locked) return "Your transaction PIN is temporarily blocked after four incorrect attempts. Try again after 15 minutes.";
 const remaining=Number(row?.attempts_remaining??3);
 return `Incorrect transaction PIN. ${remaining} attempt${remaining===1?"":"s"} remaining before a 15-minute block.`;
}

async function finishTransferViews() {
 revalidatePath("/dashboard");
 revalidatePath("/dashboard/accounts");
 revalidatePath("/dashboard/transactions");
 revalidatePath("/dashboard/transfers");
}

export async function submitTransferWithPin(formData:FormData) {
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user) redirect("/login");
 const parsed=parseTransfer(formData);
 if("error" in parsed) return {error:parsed.error};
 const {accountId,recipient,amountMinor,description,pin}=parsed;
 const {data,error}=await supabase.rpc("transfer_funds_with_pin",{
  p_from_account_id:accountId,p_recipient_account_number:recipient,p_amount_minor:amountMinor,
  p_description:description||null,p_idempotency_key:randomUUID(),p_pin:pin,
 });
 const result=Array.isArray(data)?data[0]:data;
 const requiresOtp=Boolean(error?.message?.includes("DEVICE_OTP_REQUIRED"))||result?.status==="otp_required";
 if(error&&!requiresOtp) {
  await supabase.rpc("record_operations_event",{p_severity:"warning",p_category:"transfer",p_service:"Internal transfers",p_operation:"transfer_rejected",p_error_code:error.code||"TRANSFER_REJECTED",p_request_path:"/dashboard/transfers"});
  return {error:error.message};
 }
 if(result?.status==="pin_invalid"||result?.status==="pin_locked") return {error:await pinFailureMessage(supabase,result.status)};
 await finishTransferViews();
 if(result?.status==="review") redirect("/dashboard/transfers?review=1");
 redirect("/dashboard/transfers?success=1");
}

