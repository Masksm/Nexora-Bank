"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function updateProfile(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const displayName = String(formData.get("display_name") || "").trim().slice(0, 100);
  const firstName = String(formData.get("first_name") || "").trim().slice(0, 80);
  const lastName = String(formData.get("last_name") || "").trim().slice(0, 80);
  const phone = String(formData.get("phone") || "").trim().slice(0, 30);
  const dateOfBirth = String(formData.get("date_of_birth") || "").trim();
  const countryCode = String(formData.get("country_code") || "").trim().toUpperCase();
  const addressLine1 = String(formData.get("address_line1") || "").trim().slice(0, 160);
  const addressLine2 = String(formData.get("address_line2") || "").trim().slice(0, 160);
  const city = String(formData.get("city") || "").trim().slice(0, 100);
  const region = String(formData.get("region") || "").trim().slice(0, 100);
  const postalCode = String(formData.get("postal_code") || "").trim().slice(0, 24);
  const timezone = String(formData.get("preferred_timezone") || "").trim().slice(0, 80);
  const preferredLanguage = String(formData.get("preferred_language") || "auto").trim();

  if (displayName.length < 2) redirect("/dashboard/settings?error=Enter%20a%20valid%20display%20name.");
  if (!/^[A-Z]{2}$/.test(countryCode)) redirect("/dashboard/settings?error=Choose%20a%20valid%20two-letter%20country%20code.");
  if (dateOfBirth && (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || dateOfBirth > new Date().toISOString().slice(0, 10))) {
    redirect("/dashboard/settings?error=Enter%20a%20valid%20date%20of%20birth.");
  }
  if (timezone && !/^[A-Za-z_+-]+(?:\/[A-Za-z0-9_+-]+)*$/.test(timezone)) {
    redirect("/dashboard/settings?error=Enter%20a%20valid%20time%20zone%20identifier.");
  }

  const { error } = await supabase.from("profiles").update({
    display_name: displayName,
    first_name: firstName || null,
    last_name: lastName || null,
    phone: phone || null,
    date_of_birth: dateOfBirth || null,
    country_code: countryCode,
    address_line1: addressLine1 || null,
    address_line2: addressLine2 || null,
    city: city || null,
    region: region || null,
    postal_code: postalCode || null,
    preferred_timezone: timezone || null,
    preferred_language: preferredLanguage,
    updated_at: new Date().toISOString(),
  }).eq("user_id", user.id);

  if (error) redirect("/dashboard/settings?error=Unable%20to%20save%20your%20profile%20details.");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
  redirect("/dashboard/settings?success=1");
}

export async function markNotificationsRead() {
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect("/login");
  const {error}=await supabase.from("notifications").update({read_at:new Date().toISOString()}).eq("user_id",user.id).is("read_at",null);
  if(error) redirect("/dashboard/notifications?error=Unable%20to%20update%20notifications.");
  revalidatePath("/dashboard/notifications");
  redirect("/dashboard/notifications?success=1");
}

export async function createCard(formData:FormData) {
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect("/login");
  const accountId=String(formData.get("account_id")||"");
  const {error}=await supabase.rpc("create_virtual_card",{p_account_id:accountId});
  if(error) redirect(`/dashboard/cards?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/dashboard/cards");
  redirect("/dashboard/cards?success=1");
}

export async function updateCardStatus(formData:FormData) {
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect("/login");
  const cardId=String(formData.get("card_id")||"");
  const status=String(formData.get("status")||"");
  if(!cardId||!["active","frozen"].includes(status)) redirect("/dashboard/cards?error=Invalid%20card%20request.");
  const {error}=await supabase.rpc("set_virtual_card_status",{p_card_id:cardId,p_status:status});
  if(error) redirect(`/dashboard/cards?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/dashboard/cards");
  redirect("/dashboard/cards?success=1");
}

export async function signOutOtherSessions() {
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect("/login");
  const {data:claims}=await supabase.auth.getClaims();
  const sessionId=String(claims?.claims?.session_id||"");
  if(sessionId){
    await supabase.from("user_sessions").update({revoked_at:new Date().toISOString()})
      .eq("user_id",user.id).neq("auth_session_id",sessionId).is("revoked_at",null);
  }
  const {error}=await supabase.auth.signOut({scope:"others"});
  if(error) redirect("/dashboard/security?error=Unable%20to%20revoke%20other%20sessions.");
  revalidatePath("/dashboard/security");
  redirect("/dashboard/security?success=1");
}
