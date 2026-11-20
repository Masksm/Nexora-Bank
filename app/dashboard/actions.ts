"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function updateProfile(formData: FormData) {
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect("/login");
  const displayName=String(formData.get("display_name")||"").trim().slice(0,100);
  const phone=String(formData.get("phone")||"").trim().slice(0,30);
  if(displayName.length<2) redirect("/dashboard/settings?error=Enter%20a%20valid%20display%20name.");
  const {error}=await supabase.from("profiles").update({display_name:displayName,phone:phone||null,updated_at:new Date().toISOString()}).eq("user_id",user.id);
  if(error) redirect(`/dashboard/settings?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/dashboard");
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
