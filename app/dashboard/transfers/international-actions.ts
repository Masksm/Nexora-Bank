"use server";

import { createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

function externalPayloadHash(values:string[]) {
 const canonical=values.map(value=>`${Buffer.byteLength(value,"utf8")}:${value}`).join("|");
 return createHash("sha256").update(canonical).digest("hex");
}
async function currentDeviceFingerprint() {
 const cookieStore=await cookies();const requestHeaders=await headers();
 const deviceId=cookieStore.get("nexora_device_id")?.value||"";
 const userAgent=(requestHeaders.get("user-agent")||"Unknown user agent").slice(0,1000);
 if(!/^[a-f0-9-]{36}$/i.test(deviceId)) return null;
 return createHash("sha256").update(`${deviceId}|${userAgent}`).digest("hex");
}
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
 const otpCode=String(formData.get("otp_code")||"").trim();
 if(!sourceAccountId||!/^[A-Z]{2}$/.test(country)||bankName.length<2||beneficiaryName.length<2||!/^\d+(\.\d{1,2})?$/.test(amountText)||!/^\d{6}$/.test(pin))
  return {error:"Check the recipient details, amount and six-digit transaction PIN."};
 const amountMinor=Math.round(Number(amountText)*100);
 if(!Number.isSafeInteger(amountMinor)||amountMinor<=0)return {error:"Enter a valid transfer amount."};
 if(otpCode&&!/^\d{6}$/.test(otpCode))return {error:"Enter the six-digit email verification code."};
 const payloadHash=externalPayloadHash([sourceAccountId,String(amountMinor),country,bankName,beneficiaryName,accountNumber,routingNumber,sortCode,iban,bic]);
 const cookieStore=await cookies();const challengeId=cookieStore.get("nexora_transfer_otp_challenge")?.value||"";
 const {data,error}=await supabase.rpc("submit_external_transfer_request",{
  p_source_account_id:sourceAccountId,p_amount_minor:amountMinor,p_destination_country:country,
  p_bank_name:bankName,p_beneficiary_name:beneficiaryName,p_account_number:accountNumber||null,
  p_routing_number:routingNumber||null,p_sort_code:sortCode||null,p_iban:iban||null,p_bic:bic||null,
  p_pin:pin,p_otp_challenge_id:otpCode&&challengeId?challengeId:null,p_otp_code:otpCode||null
 });
 const result=Array.isArray(data)?data[0]:data;
 if(error)return {error:error.message};
 if(result?.status==="pin_invalid"||result?.status==="pin_locked")return {error:await pinFailureMessage(supabase,result.status)};
 if(result?.status==="otp_invalid")return {error:"The verification code is incorrect, expired, or does not match these transfer details."};
 if(result?.status==="otp_required"){
  if(otpCode)return {error:"Email verification is required before this transfer can be submitted."};
  const fingerprint=await currentDeviceFingerprint();
  if(!fingerprint)return {error:"Your device could not be verified. Sign in again."};
  const {data:otpData,error:otpError}=await supabase.functions.invoke("nexora-email-otp",{body:{purpose:"transfer",device_fingerprint:fingerprint,payload_hash:payloadHash}});
  if(otpError||!otpData?.success||!otpData?.challenge_id)return {error:otpData?.error||otpError?.message||"The transfer verification email could not be sent."};
  cookieStore.set("nexora_transfer_otp_challenge",String(otpData.challenge_id),{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:"/",maxAge:10*60});
  return {status:"otp_required"};
 }
 cookieStore.set("nexora_transfer_otp_challenge","",{path:"/",maxAge:0});
 revalidatePath("/dashboard");revalidatePath("/dashboard/transfers");revalidatePath("/dashboard/transactions");
 redirect("/dashboard/transfers?external=queued&reference="+encodeURIComponent(result?.reference||""));
}
