"use server";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {createClient} from "@/lib/supabase/server";
type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;
async function pinFailure(supabase:ServerSupabaseClient){
 const {data}=await supabase.rpc("get_transaction_pin_status");
 const row=Array.isArray(data)?data[0]:data;
 if(row?.is_locked)return "Your transaction PIN is temporarily blocked after four incorrect attempts. Try again after 15 minutes.";
 const remaining=Number(row?.attempts_remaining??3);
 return `Incorrect transaction PIN. ${remaining} attempt${remaining===1?"":"s"} remaining before a 15-minute block.`;
}
export async function openCurrencyAccount(formData:FormData){
 const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect("/login");
 const currency=String(formData.get("currency")||"");
 const {error}=await supabase.rpc("open_currency_account",{p_currency:currency});
 if(error)redirect("/dashboard/currencies?error="+encodeURIComponent(error.message));
 revalidatePath("/dashboard/currencies");revalidatePath("/dashboard/accounts");redirect("/dashboard/currencies?opened=1");
}
export async function convertCurrency(formData:FormData){
 const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect("/login");
 const from=String(formData.get("from_account")||"");const to=String(formData.get("to_account")||"");const quote=String(formData.get("quote_id")||"");const pin=String(formData.get("pin")||"");const amount=String(formData.get("amount")||"");
 if(!from||!to||!quote||!/^\d{6}$/.test(pin)||!/^\d+(\.\d{1,2})?$/.test(amount))redirect("/dashboard/currencies?error=Review%20the%20conversion%20details.");
 const minor=Math.round(Number(amount)*100);if(!Number.isSafeInteger(minor)||minor<=0)redirect("/dashboard/currencies?error=Enter%20a%20valid%20amount.");
 const {data,error}=await supabase.rpc("convert_currency",{p_from_account_id:from,p_to_account_id:to,p_quote_id:quote,p_amount_minor:minor,p_pin:pin});
 if(error){
  await supabase.rpc("record_operations_event",{p_severity:"warning",p_category:"transfer",p_service:"FX conversion",p_operation:"conversion_rejected",p_error_code:error.code||"CONVERSION_REJECTED",p_request_path:"/dashboard/currencies"});
  redirect("/dashboard/currencies?error="+encodeURIComponent(error.message));
 }
 if(!data||(Array.isArray(data)&&data.length===0)){
  await supabase.rpc("record_operations_event",{p_severity:"warning",p_category:"authentication",p_service:"Transaction authorization",p_operation:"pin_rejected",p_error_code:"PIN_REJECTED",p_request_path:"/dashboard/currencies"});
  redirect("/dashboard/currencies?error="+encodeURIComponent(await pinFailure(supabase)));
 }
 revalidatePath("/dashboard/currencies");revalidatePath("/dashboard/accounts");revalidatePath("/dashboard/transactions");
 redirect("/dashboard/currencies?converted=1");
}
