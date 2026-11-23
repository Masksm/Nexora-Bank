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
 <section className="workspace-panel currency-how-it-works"><div className="workspace-panel-heading"><div><span className="workspace-kicker">HOW CURRENCY CONVERSION WORKS</span><h2>Move money between your own currency accounts</h2></div></div><div className="currency-explanation-grid"><div><strong>1. Choose the source</strong><p>Select the account and amount you want to convert, for example 1,000 USD from your USD account.</p></div><div><strong>2. Choose the destination</strong><p>Select another currency account you own, such as your EUR account. Nexora requests an exchange quote.</p></div><div><strong>3. Review and confirm</strong><p>Review the rate and estimated amount, then confirm with your six-digit transaction PIN.</p></div><div><strong>4. Both balances update</strong><p>The USD account is debited and the EUR account is credited through paired ledger entries. The conversion appears in your transaction history.</p></div></div><p className="currency-conversion-boundary">This is an internal conversion between Nexora accounts. It is not an external bank transfer or a cash exchange. The application ledger records these balances; real-world funds and external FX settlement require a licensed banking partner.</p></section>
 {params.error&&<div className="workspace-alert">{params.error}</div>}{params.opened&&<div className="transfer-success">Currency account opened.</div>}{params.converted&&<div className="transfer-success">Currency conversion posted to your ledger.</div>}
 {error?<div className="workspace-alert">Unable to load currency accounts.</div>:<section className="workspace-panel"><div className="workspace-panel-heading"><div><span className="workspace-kicker">YOUR CURRENCY BALANCES</span><h2>Account balances</h2></div><Wallet size={18}/></div><div className="currency-account-grid">{rows.map(a=><article key={a.account_id}><span>{a.currency}</span><strong>{money(Number(a.balance_minor),a.currency,locale)}</strong><small>{a.account_name} · {a.account_number}</small><em>{a.status}</em></article>)}</div></section>}
 <section className="workspace-panel currency-open-panel"><div className="workspace-panel-heading"><div><span className="workspace-kicker">ADD A CURRENCY</span><h2>Open another currency account</h2></div></div><form action={openCurrencyAccount} className="transfer-form"><label>Account currency<select name="currency" defaultValue="EUR">{currencies.filter(c=>!rows.some(a=>a.currency===c)).map(c=><option key={c} value={c}>{c}</option>)}</select></label><button type="submit" disabled={rows.length>=currencies.length}>Open currency account</button></form></section>
 {rows.filter(a=>a.status==="active").length>1&&<ConversionForm accounts={rows.filter(a=>a.status==="active").map(a=>({...a,balance_minor:Number(a.balance_minor)}))}/>}
 <p className="workspace-disclaimer">Exchange rates are indicative reference rates from a third-party provider and may be delayed. Nexora currently applies no conversion fee. These are internal ledger balances; external deposits, withdrawals and international payments require a licensed banking partner.</p>
 </main>;
}
