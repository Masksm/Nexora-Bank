"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const supportedCountries = new Set(["NX","US","GB","DE","FR","NL","ES","IE"]);

export async function addBeneficiary(formData:FormData){
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)redirect("/login");

  const country=String(formData.get("country_code")||"").trim().toUpperCase();
  const name=String(formData.get("name")||"").trim().slice(0,100);
  const bank=String(formData.get("bank_name")||"").trim().slice(0,120);
  const nickname=String(formData.get("nickname")||"").trim().slice(0,60);
  const account=String(formData.get("account_number")||"").trim();
  const routing=String(formData.get("routing_number")||"").replace(/[^0-9]/g,"");
  const sortCode=String(formData.get("sort_code")||"").replace(/[^0-9]/g,"");
  const iban=String(formData.get("iban")||"").replace(/\s/g,"").toUpperCase();
  const bic=String(formData.get("bic")||"").replace(/\s/g,"").toUpperCase();

  if(!supportedCountries.has(country) || name.length<2 || bank.length<2){
    redirect("/dashboard/beneficiaries?error=Enter%20a%20valid%20recipient%20name%2C%20country%20and%20bank.");
  }
  if(country==="NX" && !/^\d{10}$/.test(account)){
    redirect("/dashboard/beneficiaries?error=Enter%20a%2010-digit%20Nexora%20account%20number.");
  }
  if(country==="US" && (!/^\d{9}$/.test(routing) || !/^\d{4,17}$/.test(account))){
    redirect("/dashboard/beneficiaries?error=Enter%20a%209-digit%20US%20routing%20number%20and%20valid%20account%20number.");
  }
  if(country==="GB" && (!/^\d{6}$/.test(sortCode) || !/^\d{8}$/.test(account))){
    redirect("/dashboard/beneficiaries?error=Enter%20a%206-digit%20UK%20sort%20code%20and%208-digit%20account%20number.");
  }
  if(["DE","FR","NL","ES","IE"].includes(country) && !/^[A-Z]{2}[0-9A-Z]{13,32}$/.test(iban)){
    redirect("/dashboard/beneficiaries?error=Enter%20a%20valid%20IBAN.");
  }
  if(bic && !/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic)){
    redirect("/dashboard/beneficiaries?error=Enter%20a%20valid%20BIC%20or%20leave%20it%20blank.");
  }

  const payload={
    user_id:user.id,
    beneficiary_name:name,
    bank_name:bank,
    nickname:nickname||null,
    country_code:country,
    account_number:country==="DE"||country==="FR"||country==="NL"||country==="ES"||country==="IE" ? null : account,
    routing_number:country==="US"?routing:null,
    sort_code:country==="GB"?sortCode:null,
    iban:["DE","FR","NL","ES","IE"].includes(country)?iban:null,
    bic:bic||null,
    verification_status:"unverified",
    verification_method:null,
    verified_at:null,
    provider_reference:null,
  };
  const {error}=await supabase.from("beneficiaries").insert(payload);
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
