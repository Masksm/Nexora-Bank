import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
const allowed=new Set(["USD","EUR","GBP","NGN","CAD","AUD","CHF","JPY","SGD","ZAR"]);
export async function POST(request:NextRequest){
 const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();
 if(!user)return NextResponse.json({error:"Authentication required"},{status:401});
 const body=await request.json().catch(()=>null);const base=String(body?.base||"").toUpperCase();const quote=String(body?.quote||"").toUpperCase();
 if(!allowed.has(base)||!allowed.has(quote)||base===quote)return NextResponse.json({error:"Unsupported currency pair"},{status:400});
 const started=Date.now();
 try{
  const response=await fetch("https://open.er-api.com/v6/latest/"+base,{cache:"no-store",signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw new Error("Exchange-rate provider returned HTTP "+response.status);
  const payload=await response.json() as {result?:string;rates?:Record<string,number>;time_last_update_utc?:string};
  const rate=payload.rates?.[quote];
  if(payload.result!=="success"||!rate||!Number.isFinite(rate)||rate<=0)throw new Error("No valid exchange rate was returned");
  const {data,error}=await supabase.rpc("create_fx_rate_quote",{p_base:base,p_quote:quote,p_rate:rate,p_source:"open.er-api.com"});
  if(error)throw error;
  const item=Array.isArray(data)?data[0]:data;
  return NextResponse.json({quoteId:item.quote_id,base,quote,rate:Number(item.rate),expiresAt:item.expires_at,providerUpdatedAt:payload.time_last_update_utc,source:"open.er-api.com",indicative:true});
 }catch(error){
  await supabase.rpc("record_operations_event",{p_severity:"error",p_category:"api",p_service:"FX rates",p_operation:"quote_fetch_failed",p_status_code:502,p_error_code:"FX_PROVIDER_UNAVAILABLE",p_request_path:"/api/fx/quote",p_duration_ms:Date.now()-started});
  return NextResponse.json({error:"Exchange rates are temporarily unavailable. No conversion was made."},{status:502});
 }
}
