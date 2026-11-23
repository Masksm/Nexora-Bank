"use server";
import { createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function saveTransactionPin(formData: FormData) {
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user) redirect("/login");
 const current=String(formData.get("current_pin")||"").trim();
 const next=String(formData.get("new_pin")||"").trim();
 const confirm=String(formData.get("confirm_pin")||"").trim();
 if(!/^\d{6}$/.test(next)||next!==confirm) redirect("/dashboard/security?error=Enter%20matching%20six-digit%20PINs.");
 const {data:exists,error:statusError}=await supabase.rpc("has_transaction_pin");
 if(statusError) redirect("/dashboard/security?error=Could%20not%20check%20PIN%20status.");
 const result=exists
  ? await supabase.rpc("change_transaction_pin",{p_current_pin:current,p_new_pin:next})
  : await supabase.rpc("set_transaction_pin",{p_pin:next});
 if(result.error) redirect("/dashboard/security?error="+encodeURIComponent(result.error.message));
 if(exists && result.data!==true) redirect("/dashboard/security?error=The%20current%20PIN%20was%20incorrect%20or%20is%20temporarily%20locked.");
 revalidatePath("/dashboard/security");
 redirect("/dashboard/security?pin_saved=1");
}

function currentDeviceFingerprint(deviceId: string, userAgent: string) {
 return createHash("sha256").update(`${deviceId}|${userAgent}`).digest("hex");
}

export async function requestPinRecovery() {
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user) redirect("/login");
 const cookieStore=await cookies();
 const requestHeaders=await headers();
 const deviceId=cookieStore.get("nexora_device_id")?.value||"";
 const userAgent=(requestHeaders.get("user-agent")||"Unknown user agent").slice(0,1000);
 if(!/^[a-f0-9-]{36}$/i.test(deviceId)) redirect("/dashboard/security?error=Your%20device%20could%20not%20be%20verified.%20Sign%20in%20again.");
 const fingerprint=currentDeviceFingerprint(deviceId,userAgent);
 const payloadHash=createHash("sha256").update("nexora-pin-reset-v1").digest("hex");
 const {data,error}=await supabase.functions.invoke("nexora-email-otp",{
  body:{purpose:"pin_reset",device_fingerprint:fingerprint,payload_hash:payloadHash}
 });
 if(error||!data?.success||!data?.challenge_id) {
  const message=data?.error||error?.message||"The recovery code could not be sent.";
  redirect("/dashboard/security?error="+encodeURIComponent(message));
 }
 cookieStore.set("nexora_pin_recovery_challenge",String(data.challenge_id),{
  httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:"/",maxAge:10*60
 });
 redirect("/dashboard/security?pin_recovery=verify");
}

export async function completePinRecovery(formData:FormData) {
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user) redirect("/login");
 const code=String(formData.get("code")||"").trim();
 const next=String(formData.get("new_pin")||"").trim();
 const confirm=String(formData.get("confirm_pin")||"").trim();
 if(!/^\\d{6}$/.test(code)||!/^\\d{6}$/.test(next)||next!==confirm) {
  redirect("/dashboard/security?pin_recovery=verify&error=Enter%20the%20six-digit%20code%20and%20matching%20six-digit%20PINs.");
 }
 const cookieStore=await cookies();
 const challengeId=cookieStore.get("nexora_pin_recovery_challenge")?.value||"";
 const requestHeaders=await headers();
 const deviceId=cookieStore.get("nexora_device_id")?.value||"";
 const userAgent=(requestHeaders.get("user-agent")||"Unknown user agent").slice(0,1000);
 if(!challengeId||!/^[a-f0-9-]{36}$/i.test(deviceId)) {
  redirect("/dashboard/security?error=Your%20recovery%20session%20expired.%20Request%20a%20new%20code.");
 }
 const fingerprint=currentDeviceFingerprint(deviceId,userAgent);
 const {data,error}=await supabase.rpc("complete_transaction_pin_recovery",{
  p_challenge_id:challengeId,p_code:code,p_device_fingerprint:fingerprint,p_new_pin:next
 });
 if(error) redirect("/dashboard/security?pin_recovery=verify&error="+encodeURIComponent(error.message));
 if(data!==true) redirect("/dashboard/security?pin_recovery=verify&error=The%20code%20is%20invalid%20or%20expired.%20Request%20a%20new%20one.");
 cookieStore.set("nexora_pin_recovery_challenge","",{path:"/",maxAge:0});
 revalidatePath("/dashboard/security");
 redirect("/dashboard/security?pin_saved=1");
}
