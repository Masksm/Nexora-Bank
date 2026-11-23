import Link from "next/link";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import type { SupportedLocale } from "@/lib/locale";
import { pageText } from "@/lib/page-translations";
import { redirect } from "next/navigation";
import { ArrowLeft, CreditCard, Lock, Plus, Unlock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createCard, updateCardStatus } from "../actions";

export const dynamic="force-dynamic";

type Props={searchParams:Promise<{error?:string;success?:string}>};

function visualCardDetails(id:string,network:string,last4:string){
  const digest=createHash("sha256").update(id).digest("hex");
  const digits=Array.from(digest).map(char=>(parseInt(char,16)%10).toString()).join("");
  const prefix=network==="mastercard"?"55":"4";
  const base=prefix+digits.slice(0, network==="mastercard"?9:10)+last4.padStart(4,"0").slice(-4);
  let sum=0;
  for(let index=0;index<base.length;index++){
    let digit=Number(base[base.length-1-index]);
    if(index%2===0){digit*=2;if(digit>9)digit-=9;}
    sum+=digit;
  }
  const check=(10-(sum%10))%10;
  return {
    number:(base+check).replace(/(.{4})/g,"$1 ").trim(),
    cvv:digits.slice(10,13),
  };
}


export default async function CardsPage({searchParams}:Props){
  const locale = ((await cookies()).get("nexora_locale")?.value || "en") as SupportedLocale;
  const t = (value: string) => pageText(locale, value);
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)redirect("/login");
  const [{data:cards},{data:accounts},params]=await Promise.all([
    supabase.from("virtual_cards").select("id,account_id,cardholder_name,network,last4,expiry_month,expiry_year,status,created_at").eq("user_id",user.id).order("created_at",{ascending:false}),
    supabase.from("bank_accounts").select("id,account_number,account_name,status").eq("user_id",user.id),
    searchParams,
  ]);
  const activeAccounts=(accounts??[]).filter(a=>a.status==="active");
  return <main className="workspace-shell"><header className="workspace-header"><Link href="/dashboard" className="workspace-back"><ArrowLeft size={16}/> {t("Overview")}</Link><span className="workspace-overline">{t("NEXORA BANK · CARDS")}</span></header><section className="workspace-intro"><div><span className="workspace-kicker">{t("DIGITAL WALLET")}</span><h1>{t("Virtual cards")}</h1><p>{t("Manage your Nexora virtual card previews.")}</p></div></section>
    {params.error&&<div className="workspace-alert">{params.error}</div>}{params.success&&<div className="transfer-success">{t("Card settings updated.")}</div>}
    <section className="card-preview-grid">{(cards??[]).map(card=>{const details=visualCardDetails(card.id,card.network,card.last4);return <article key={card.id} className="virtual-card-preview"><div className="virtual-card-top"><span>{t("NEXORA")}</span><CreditCard size={22}/></div><div className="virtual-card-chip"/><strong className="virtual-card-number">{details.number}</strong><div className="virtual-card-bottom"><span>{card.cardholder_name}<small>{t("CARDHOLDER")}</small></span><span>{String(card.expiry_month).padStart(2,"0")}/{String(card.expiry_year).slice(-2)}<small>{t("VALID THRU")}</small></span><span>{details.cvv}<small>CVV</small></span></div><div className="virtual-card-disclosure">Visual card details only · not issued for external purchases</div><div className="virtual-card-controls"><span className={card.status==="active"?"account-status":"account-status inactive"}>{t(card.status)}</span><form action={updateCardStatus}><input type="hidden" name="card_id" value={card.id}/><input type="hidden" name="status" value={card.status==="active"?"frozen":"active"}/><button type="submit" aria-label={t(card.status==="active"?"Freeze card":"Activate card")}>{card.status==="active"?<Lock size={15}/>:<Unlock size={15}/>}</button></form></div></article>})}</section>
    <section className="workspace-panel card-create"><div className="workspace-panel-heading"><div><span className="workspace-kicker">{t("CARD MANAGEMENT")}</span><h2>{t("Create a virtual card preview")}</h2></div><Plus size={18}/></div><form action={createCard} className="transfer-form"><label>{t("Linked account")}<select name="account_id" required>{activeAccounts.map(a=><option key={a.id} value={a.id}>{a.account_name} · {a.account_number}</option>)}</select></label><button type="submit" disabled={!activeAccounts.length}>{t("Create card preview")}</button></form></section>
    
  </main>;
}
