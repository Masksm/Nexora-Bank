import Link from "next/link";
import { cookies } from "next/headers";
import type { SupportedLocale } from "@/lib/locale";
import { pageText } from "@/lib/page-translations";
import { redirect } from "next/navigation";
import { ArrowLeft, Contact, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { addBeneficiary, removeBeneficiary } from "./actions";

export const dynamic="force-dynamic";
type Props={searchParams:Promise<{error?:string;success?:string}>};

export default async function BeneficiariesPage({searchParams}:Props){
  const locale = ((await cookies()).get("nexora_locale")?.value || "en") as SupportedLocale;
  const t = (value: string) => pageText(locale, value);
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)redirect("/login");
  const [{data:beneficiaries,error},params]=await Promise.all([
    supabase.from("beneficiaries").select("id,beneficiary_name,account_number,bank_name,nickname,created_at").eq("user_id",user.id).order("created_at",{ascending:false}),
    searchParams,
  ]);
  return <main className="workspace-shell"><header className="workspace-header"><Link href="/dashboard" className="workspace-back"><ArrowLeft size={16}/> {t("Overview")}</Link><span className="workspace-overline">NEXORA BANK · RECIPIENTS</span></header><section className="workspace-intro"><div><span className="workspace-kicker">{t("SAVED RECIPIENTS")}</span><h1>{t("Beneficiaries")}</h1><p>Save Nexora account numbers for quicker transfers.</p></div></section>
    {params.error&&<div className="workspace-alert">{params.error}</div>}{params.success&&<div className="transfer-success">Beneficiary list updated.</div>}
    <section className="workspace-panel"><div className="workspace-panel-heading"><div><span className="workspace-kicker">{t("ADD RECIPIENT")}</span><h2>{t("New beneficiary")}</h2></div><Contact size={18}/></div><form action={addBeneficiary} className="transfer-form"><label>{t("Recipient full name")}<input name="name" minLength={2} maxLength={100} required placeholder="Recipient name"/></label><label>Nexora account number<input name="account_number" inputMode="numeric" pattern="[0-9]{10}" maxLength={10} required placeholder="10-digit account number"/></label><label>{t("Nickname (optional)")}<input name="nickname" maxLength={60} placeholder="e.g. Rent"/></label><button type="submit">{t("Save beneficiary")}</button></form></section>
    <section className="workspace-panel beneficiary-list"><div className="workspace-panel-heading"><div><span className="workspace-kicker">{t("YOUR RECIPIENTS")}</span><h2>{t("Saved beneficiaries")}</h2></div><span className="workspace-count">{beneficiaries?.length??0}</span></div>{error?<p className="workspace-alert">Unable to load beneficiaries.</p>:!beneficiaries?.length?<div className="workspace-empty"><Contact size={24}/><h2>{t("No beneficiaries yet")}</h2><p>{t("Saved recipients will appear here.")}</p></div>:<div className="notification-list">{beneficiaries.map(b=><article key={b.id} className="beneficiary-row"><span className="notification-symbol"><Contact size={17}/></span><div><strong>{b.nickname||b.beneficiary_name}</strong><p>{b.beneficiary_name} · {b.account_number}</p><small>{b.bank_name}</small></div><form action={removeBeneficiary}><input type="hidden" name="id" value={b.id}/><button type="submit" aria-label="Remove beneficiary"><Trash2 size={15}/></button></form></article>)}</div>}</section>
    <p className="workspace-disclaimer">Beneficiaries are saved recipients for Nexora internal transfers only.</p>
  </main>;
}
