import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
const allowed=new Set(["USD","EUR","GBP","NGN","CAD","AUD","CHF","SGD","ZAR"]);
export async function POST(request:NextRequest){
 const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();
 if(!user)return NextResponse.json({error:"Authentication required"},{status:401});
 const body=await request.json().catch(()=>null);const base=String(body?.base||"").toUpperCase();const quote=String(body?.quote||"").toUpperCase();
 if(!allowed.has(base)||!allowed.has(quote)||base===quote)return NextResponse.json({error:"Unsupported currency pair"},{status:400});
 const started=Date.now();
 try{
  const {data:{session}}=await supabase.auth.getSession();
  if(!session?.access_token)return NextResponse.json({error:"Authentication required"},{status:401});
  const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;const publishableKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!supabaseUrl||!publishableKey)throw new Error("Supabase environment is not configured");
  const response=await fetch(supabaseUrl+"/functions/v1/create-fx-quote",{method:"POST",cache:"no-store",signal:AbortSignal.timeout(12000),headers:{"Content-Type":"application/json","apikey":publishableKey,"Authorization":"Bearer "+session.access_token},body:JSON.stringify({base,quote})});
  const payload=await response.json();
  if(!response.ok)throw new Error(payload.error||"Exchange quote could not be created");
  return NextResponse.json(payload,{headers:{"Cache-Control":"no-store"}});
 }catch(error){
  await supabase.rpc("record_operations_event",{p_severity:"error",p_category:"api",p_service:"FX rates",p_operation:"quote_fetch_failed",p_status_code:502,p_error_code:"FX_PROVIDER_UNAVAILABLE",p_request_path:"/api/fx/quote",p_duration_ms:Date.now()-started});
  return NextResponse.json({error:"Exchange rates are temporarily unavailable. No conversion was made."},{status:502});
 }
}
