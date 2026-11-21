import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import type { SupportedLocale } from "@/lib/locale";
import { pageText } from "@/lib/page-translations";
import { createClient } from "@/lib/supabase/server";
import PrintButton from "../print-button";

export const dynamic = "force-dynamic";
type Props = { searchParams: Promise<{ from?: string; to?: string }> };
function money(minor:number,locale:SupportedLocale){return new Intl.NumberFormat(locale,{style:"currency",currency:"USD"}).format(minor/100);}

export default async function StatementsPage({searchParams}:Props){
  const locale=((await cookies()).get("nexora_locale")?.value||"en") as SupportedLocale;
  const t=(value:string)=>pageText(locale,value);
  const params=await searchParams;
  const validDate=(value?:string)=>{
    if(!value||!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed=new Date(value+"T00:00:00.000Z");
    return !Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;
  };
  const from=validDate(params.from)?params.from!:null;
  const to=validDate(params.to)?params.to!:null;
  const invalidRange=Boolean((params.from&&!validDate(params.from))||(params.to&&!validDate(params.to))||(from&&to&&from>to));
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)redirect("/login");
  const {data:accounts,error:accountError}=await supabase.from("bank_accounts").select("id,account_number,account_name,nickname").eq("user_id",user.id);
  const ids=(accounts??[]).map(a=>a.id);
  const entries:Array<{transaction_id:string;account_id:string;amount_minor:number;currency:string;created_at:string}>=[];
  let failed=Boolean(accountError||invalidRange);
  if(ids.length&&!failed){
    for(let offset=0;;offset+=1000){
      let query=supabase.from("ledger_entries").select("transaction_id,account_id,amount_minor,currency,created_at").in("account_id",ids).order("created_at",{ascending:false}).range(offset,offset+999);
      if(from)query=query.gte("created_at",new Date(from+"T00:00:00.000Z").toISOString());
      if(to)query=query.lt("created_at",new Date(new Date(to+"T00:00:00.000Z").getTime()+86400000).toISOString());
      const {data,error}=await query;
      if(error){failed=true;break;}
      entries.push(...(data??[]));
      if(!data||data.length<1000)break;
    }
  }
  const txIds=[...new Set(entries.map(e=>e.transaction_id))];
  const transactions:Array<{id:string;reference:string;transaction_type:string;status:string;description:string|null;created_at:string}>=[];
  for(let offset=0;offset<txIds.length&&!failed;offset+=300){
    const {data,error}=await supabase.from("ledger_transactions").select("id,reference,transaction_type,status,description,created_at").in("id",txIds.slice(offset,offset+300));
    if(error){failed=true;break;}transactions.push(...(data??[]));
  }
  const tx=new Map(transactions.map(t=>[t.id,t]));
  const accountNames=new Map((accounts??[]).map(a=>[a.id,a.nickname||a.account_name]));
  const rows=entries.filter(e=>tx.get(e.transaction_id)?.status==="posted").map(e=>({...e,transaction:tx.get(e.transaction_id)!})).sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime());
  const credits=rows.reduce((s,e)=>s+Math.max(0,Number(e.amount_minor)),0);
  const debits=rows.reduce((s,e)=>s+Math.max(0,-Number(e.amount_minor)),0);
  return <main className="workspace-shell statement-shell">
    <header className="workspace-header no-print"><Link href="/dashboard/transactions" className="workspace-back"><ArrowLeft size={16}/> {t("Transactions")}</Link><span className="workspace-overline">NEXORA BANK · STATEMENTS</span></header>
    <section className="workspace-intro no-print"><div><span className="workspace-kicker">ACCOUNT RECORDS</span><h1>Statements</h1><p>Review posted account activity for a selected period.</p></div><PrintButton label="Save as PDF"/></section>
    <form className="statement-filter no-print" method="get"><label>From<input type="date" name="from" defaultValue={from??""}/></label><label>To<input type="date" name="to" defaultValue={to??""}/></label><button type="submit">Apply dates</button><Link href="/dashboard/statements">Clear</Link></form>
    <section className="statement-document">
      <div className="statement-brand"><div><strong>NEXORA BANK</strong><span>ACCOUNT STATEMENT</span></div><FileText size={28}/></div>
      <div className="statement-meta"><div><span>ACCOUNT HOLDER</span><strong>{user.email}</strong></div><div><span>STATEMENT PERIOD</span><strong>{from||"All available"} to {to||"Present"}</strong></div><div><span>GENERATED</span><strong>{new Date().toLocaleDateString(locale,{dateStyle:"long"})}</strong></div></div>
      <div className="statement-totals"><div><span>Total credits</span><strong>{money(credits,locale)}</strong></div><div><span>Total debits</span><strong>{money(debits,locale)}</strong></div><div><span>Net movement</span><strong>{money(credits-debits,locale)}</strong></div></div>
      {invalidRange?<div className="workspace-alert">Enter valid dates and ensure the start date is on or before the end date.</div>:failed?<div className="workspace-alert">We could not load a complete statement. Refresh and try again.</div>:rows.length===0?<div className="workspace-empty"><p>No posted transactions were found for this period.</p></div>:
      <div className="statement-table-wrap"><table className="statement-table"><thead><tr><th>Date</th><th>Account</th><th>Description</th><th>Reference</th><th>Status</th><th className="numeric">Amount</th></tr></thead><tbody>{rows.map((row,index)=><tr key={row.transaction_id+"-"+row.account_id+"-"+index}><td>{new Date(row.created_at).toLocaleDateString(locale)}</td><td>{accountNames.get(row.account_id)||"Account"}</td><td>{row.transaction.description||row.transaction.transaction_type.replaceAll("_"," ")}</td><td>{row.transaction.reference}</td><td>Posted</td><td className="numeric">{money(Number(row.amount_minor),locale)}</td></tr>)}</tbody></table></div>}
      <p className="statement-footnote">This statement is generated from Nexora&apos;s internal ledger records. It is not proof of a real-world deposit or payment.</p>
    </section>
  </main>;
}
