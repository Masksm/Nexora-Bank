import Link from "next/link";
import {redirect} from "next/navigation";
import {cookies} from "next/headers";
import {ArrowLeft,Globe2,Wallet} from "lucide-react";
import type {SupportedLocale} from "@/lib/locale";
import {pageText} from "@/lib/page-translations";
import {createClient} from "@/lib/supabase/server";
import {openCurrencyAccount} from "./actions";
import {ConversionForm} from "./conversion-form";
export const dynamic="force-dynamic";
const currencies=["USD","EUR","GBP","NGN","CAD","AUD","CHF","SGD","ZAR"];
function money(amount:number,currency:string,locale:SupportedLocale){return new Intl.NumberFormat(locale,{style:"currency",currency}).format(amount/100);}
export default async function CurrenciesPage({searchParams}:{searchParams:Promise<{error?:string;opened?:string;converted?:string}>}){
 const locale=((await cookies()).get("nexora_locale")?.value||"en") as SupportedLocale;const t=(v:string)=>pageText(locale,v);
 const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect("/login");
 const [{data:accounts,error},params]=await Promise.all([supabase.from("account_balances").select("account_id,account_number,account_name,currency,status,balance_minor").eq("user_id",user.id).order("currency"),searchParams]);
 const rows=accounts??[];
 return <main className="workspace-shell"><header className="workspace-header"><Link href="/dashboard" className="workspace-back"><ArrowLeft size={16}/> {t("Overview")}</Link><span className="workspace-overline">NEXORA BANK · MULTI-CURRENCY</span></header><section className="workspace-intro"><div><span className="workspace-kicker">GLOBAL ACCOUNTS</span><h1>Multi-currency accounts</h1><p>Hold separate balances in supported currencies and exchange between your own accounts.</p></div><Globe2 size={25}/></section>
 {params.error&&<div className="workspace-alert">{params.error}</div>}{params.opened&&<div className="transfer-success">Currency account opened.</div>}{params.converted&&<div className="transfer-success">Currency conversion posted to your ledger.</div>}
 {error?<div className="workspace-alert">Unable to load currency accounts.</div>:<section className="workspace-panel"><div className="workspace-panel-heading"><div><span className="workspace-kicker">YOUR CURRENCY BALANCES</span><h2>Account balances</h2></div><Wallet size={18}/></div><div className="currency-account-grid">{rows.map(a=><article key={a.account_id}><span>{a.currency}</span><strong>{money(Number(a.balance_minor),a.currency,locale)}</strong><small>{a.account_name} · {a.account_number}</small><em>{a.status}</em></article>)}</div></section>}
 <section className="workspace-panel currency-open-panel"><div className="workspace-panel-heading"><div><span className="workspace-kicker">ADD A CURRENCY</span><h2>Open another currency account</h2></div></div><form action={openCurrencyAccount} className="transfer-form"><label>Account currency<select name="currency" defaultValue="EUR">{currencies.filter(c=>!rows.some(a=>a.currency===c)).map(c=><option key={c} value={c}>{c}</option>)}</select></label><button type="submit" disabled={rows.length>=currencies.length}>Open currency account</button></form></section>
 {rows.length>1&&<ConversionForm accounts={rows.map(a=>({...a,balance_minor:Number(a.balance_minor)}))}/>}
 <p className="workspace-disclaimer">Exchange rates are indicative reference rates from a third-party provider and may be delayed. Nexora currently applies no conversion fee. These are internal ledger balances; external deposits, withdrawals and international payments require a licensed banking partner.</p>
 </main>;
}
