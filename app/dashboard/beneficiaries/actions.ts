"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const ibanLengths:Record<string,number>={
  GB:22,AT:20,BE:16,BG:22,CH:21,CY:28,CZ:24,DE:22,DK:18,EE:20,ES:24,FI:18,
  FR:27,GB:22,GR:27,HR:21,HU:28,IE:22,IS:26,IT:27,LI:21,LT:20,LU:20,
  LV:21,MC:27,MD:24,ME:22,MK:19,MT:31,NL:18,NO:15,PL:28,PT:25,RO:24,
  RS:22,SE:24,SI:19,SK:24,SM:27,TR:26,UA:29,VA:22
};
const ibanCountries = new Set(Object.keys(ibanLengths).filter((code)=>code!=="GB"));
const supportedCountries = new Set(["NX","US","GB",...ibanCountries]);

function validIban(value:string){
  if(!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(value)) return false;
  const rearranged=value.slice(4)+value.slice(0,4);
  let remainder=0;
  for(const character of rearranged){
    const digits=character>="A"&&character<="Z" ? String(character.charCodeAt(0)-55) : character;
    for(const digit of digits) remainder=(remainder*10+Number(digit))%97;
  }
  return remainder===1;
}

function validUsRouting(value:string){
  if(value.length!==9 || [...value].some(character=>character<"0" || character>"9")) return false;
  const digits=value.split("").map(Number);
  return (3*(digits[0]+digits[3]+digits[6])+7*(digits[1]+digits[4]+digits[7])+(digits[2]+digits[5]+digits[8]))%10===0;
}

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
  if(country==="US" && (!validUsRouting(routing) || !/^\d{4,17}$/.test(account))){
    redirect("/dashboard/beneficiaries?error=Enter%20a%209-digit%20US%20routing%20number%20and%20valid%20account%20number.");
  }
  if(country==="GB" && (!/^\d{6}$/.test(sortCode) || !/^\d{8}$/.test(account))){
    redirect("/dashboard/beneficiaries?error=Enter%20a%206-digit%20UK%20sort%20code%20and%208-digit%20account%20number.");
  }
  if(country==="GB" && iban && (iban.length!==22 || !validIban(iban) || iban.slice(8,14)!==sortCode || iban.slice(14,22)!==account)){
    redirect("/dashboard/beneficiaries?error=The%20UK%20IBAN%20does%20not%20match%20the%20sort%20code%20and%20account%20number.");
  }
  if(ibanCountries.has(country) && (iban.length!==ibanLengths[country] || !validIban(iban) || iban.slice(0,2)!==country)){
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
    account_number:ibanCountries.has(country) ? null : account,
    routing_number:country==="US"?routing:null,
    sort_code:country==="GB"?sortCode:null,
    iban:country==="GB"&&iban?iban:ibanCountries.has(country)?iban:null,
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
