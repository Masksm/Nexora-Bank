"use server";
import { createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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

function transferPayloadHash(accountId:string,recipient:string,amountMinor:number,description:string) {
 const values=[accountId,recipient.trim(),String(amountMinor),description.trim()];
 const canonical=values.map(value=>`${Buffer.byteLength(value,"utf8")}:${value}`).join("|");
 return createHash("sha256").update(canonical).digest("hex");
}

async function currentDeviceFingerprint() {
 const cookieStore=await cookies();
 const requestHeaders=await headers();
 const deviceId=cookieStore.get("nexora_device_id")?.value||"";
 const userAgent=(requestHeaders.get("user-agent")||"Unknown user agent").slice(0,1000);
 if(!/^[a-f0-9-]{36}$/i.test(deviceId)) return null;
 return createHash("sha256").update(`${deviceId}|${userAgent}`).digest("hex");
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
  p_from_account_id:accountId,
  p_recipient_account_number:recipient,
  p_amount_minor:amountMinor,
  p_description:description||null,
  p_idempotency_key:crypto.randomUUID(),
  p_pin:pin,
  p_otp_challenge_id:null,
  p_otp_code:null,
 });
 if(error) {
  await supabase.rpc("record_operations_event",{p_severity:"warning",p_category:"transfer",p_service:"Internal transfers",p_operation:"transfer_rejected",p_error_code:error.code||"TRANSFER_REJECTED",p_request_path:"/dashboard/transfers"});
  return {error:error.message};
 }
 const result=Array.isArray(data)?data[0]:data;
 if(result?.status==="pin_invalid") return {error:"Incorrect PIN or PIN temporarily locked."};

 if(result?.status==="otp_required") {
  const fingerprint=await currentDeviceFingerprint();
  if(!fingerprint) return {error:"Your device could not be verified. Sign in again."};
  const claimsResult=await supabase.auth.getClaims();
  const sessionId=String(claimsResult.data?.claims?.session_id||"");
  if(!sessionId) return {error:"Your active device session could not be verified. Sign in again."};
  const payloadHash=transferPayloadHash(accountId,recipient,amountMinor,description);
  const {data:otpData,error:otpError}=await supabase.functions.invoke("nexora-email-otp",{
   body:{purpose:"transfer",device_fingerprint:fingerprint,payload_hash:payloadHash}
  });
  if(otpError||!otpData?.success||!otpData?.challenge_id) {
   return {error:otpData?.error||otpError?.message||"The transfer verification email could not be sent."};
  }
  const cookieStore=await cookies();
  cookieStore.set("nexora_transfer_otp_challenge",String(otpData.challenge_id),{
   httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:"/",maxAge:10*60
  });
  return {status:"otp_required"};
 }

 await finishTransferViews();
 if(result?.status==="review") redirect("/dashboard/transfers?review=1");
 redirect("/dashboard/transfers?success=1");
}

export async function completeTransferWithOtp(formData:FormData) {
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user) redirect("/login");
 const parsed=parseTransfer(formData);
 if("error" in parsed) return {error:parsed.error};
 const code=String(formData.get("otp_code")||"").trim();
 if(!/^\d{6}$/.test(code)) return {error:"Enter the six-digit email verification code."};
 const {accountId,recipient,amountMinor,description,pin}=parsed;
 const cookieStore=await cookies();
 const challengeId=cookieStore.get("nexora_transfer_otp_challenge")?.value||"";
 if(!challengeId) return {error:"Your transfer verification has expired. Submit the transfer again to request a new code."};

 const {data,error}=await supabase.rpc("transfer_funds_with_pin",{
  p_from_account_id:accountId,
  p_recipient_account_number:recipient,
  p_amount_minor:amountMinor,
  p_description:description||null,
  p_idempotency_key:crypto.randomUUID(),
  p_pin:pin,
  p_otp_challenge_id:challengeId,
  p_otp_code:code,
 });
 if(error) return {error:error.message};
 const result=Array.isArray(data)?data[0]:data;
 if(result?.status==="pin_invalid") return {error:"Incorrect PIN or PIN temporarily locked."};
 if(result?.status==="otp_invalid") return {error:"The verification code is incorrect, expired, or does not match these transfer details."};
 if(result?.status==="otp_required") return {error:"Email verification is required before this transfer can be submitted."};
 cookieStore.set("nexora_transfer_otp_challenge","",{path:"/",maxAge:0});
 await finishTransferViews();
 if(result?.status==="review") redirect("/dashboard/transfers?review=1");
 redirect("/dashboard/transfers?success=1");
}
