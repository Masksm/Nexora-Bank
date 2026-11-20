"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function addBeneficiary(formData:FormData){
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)redirect("/login");
  const name=String(formData.get("name")||"").trim().slice(0,100);
  const account=String(formData.get("account_number")||"").trim();
  const nickname=String(formData.get("nickname")||"").trim().slice(0,60);
  if(name.length<2||!/^\d{10}$/.test(account))redirect("/dashboard/beneficiaries?error=Enter%20a%20valid%20name%20and%2010-digit%20account%20number.");
  const {error}=await supabase.from("beneficiaries").insert({user_id:user.id,beneficiary_name:name,account_number:account,bank_name:"Nexora Bank",nickname:nickname||null});
  if(error)redirect(`/dashboard/beneficiaries?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/dashboard/beneficiaries");
  redirect("/dashboard/beneficiaries?success=1");
}

export async function removeBeneficiary(formData:FormData){
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)redirect("/login");
  const id=String(formData.get("id")||"");
  const {error}=await supabase.from("beneficiaries").delete().eq("id",id).eq("user_id",user.id);
  if(error)redirect(`/dashboard/beneficiaries?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/dashboard/beneficiaries");
  redirect("/dashboard/beneficiaries?success=1");
}
