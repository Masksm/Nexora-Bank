"use server";
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
