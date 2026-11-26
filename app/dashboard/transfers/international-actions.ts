"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

async function pinFailureMessage(supabase:ServerSupabaseClient,status:string) {
 if(status==="pin_locked") return "Your transaction PIN is temporarily blocked after four incorrect attempts. Try again after 15 minutes.";
 const {data}=await supabase.rpc("get_transaction_pin_status");const row=Array.isArray(data)?data[0]:data;
 if(row?.is_locked) return "Your transaction PIN is temporarily blocked after four incorrect attempts. Try again after 15 minutes.";
 const remaining=Number(row?.attempts_remaining??3);
 return `Incorrect transaction PIN. ${remaining} attempt${remaining===1?"":"s"} remaining before a 15-minute block.`;
}
export async function submitExternalTransferRequest(formData:FormData) {
 const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect("/login");
 const sourceAccountId=String(formData.get("source_account_id")||"");
 const country=String(formData.get("country")||"").toUpperCase();
 const bankName=String(formData.get("bank_name")||"").trim();
 const beneficiaryName=String(formData.get("beneficiary_name")||"").trim();
 const accountNumber=String(formData.get("account_number")||"").trim();
 const routingNumber=String(formData.get("routing_number")||"").trim();
 const sortCode=String(formData.get("sort_code")||"").replace(/\D/g,"");
 const iban=String(formData.get("iban")||"").replace(/\s/g,"").toUpperCase();
 const bic=String(formData.get("bic")||"").trim().toUpperCase();
 const amountText=String(formData.get("amount")||"").trim();
 const pin=String(formData.get("pin")||"").trim();
 if(!sourceAccountId||!/^[A-Z]{2}$/.test(country)||bankName.length<2||beneficiaryName.length<2||!/^\d+(\.\d{1,2})?$/.test(amountText)||!/^\d{6}$/.test(pin))
  return {error:"Check the recipient details, amount and six-digit transaction PIN."};
 const amountMinor=Math.round(Number(amountText)*100);
 if(!Number.isSafeInteger(amountMinor)||amountMinor<=0)return {error:"Enter a valid transfer amount."};
 const {data,error}=await supabase.rpc("submit_external_transfer_request",{
  p_source_account_id:sourceAccountId,p_amount_minor:amountMinor,p_destination_country:country,
  p_bank_name:bankName,p_beneficiary_name:beneficiaryName,p_account_number:accountNumber||null,
  p_routing_number:routingNumber||null,p_sort_code:sortCode||null,p_iban:iban||null,p_bic:bic||null,
  p_pin:pin
 });
 const result=Array.isArray(data)?data[0]:data;
 if(error)return {error:error.message};
 if(result?.status==="pin_invalid"||result?.status==="pin_locked")return {error:await pinFailureMessage(supabase,result.status)};
 revalidatePath("/dashboard");revalidatePath("/dashboard/transfers");revalidatePath("/dashboard/transactions");
 if(!result?.request_id||!result?.reference)return {error:"The transfer request was submitted, but its tracking reference could not be loaded. Refresh your transfers page."};
 return {status:"submitted",requestId:String(result.request_id),reference:String(result.reference)};
}


export async function getExternalTransferStatus(requestId:string) {
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)return {error:"Authentication required."};
 if(!/^[0-9a-f-]{36}$/i.test(requestId))return {error:"Invalid transfer reference."};
 const {data,error}=await supabase.from("external_transfer_requests")
  .select("reference,status,admin_reason")
  .eq("id",requestId).eq("user_id",user.id).maybeSingle();
 if(error||!data)return {error:"Transfer status is temporarily unavailable."};
 return {reference:data.reference,status:data.status,reason:data.admin_reason};
}
