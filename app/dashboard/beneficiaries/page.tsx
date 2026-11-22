import Link from "next/link";
import { cookies } from "next/headers";
import type { SupportedLocale } from "@/lib/locale";
import { pageText } from "@/lib/page-translations";
import { redirect } from "next/navigation";
import { ArrowLeft, Contact, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import BeneficiaryForm from "./beneficiary-form";
import PlaidNameCheck from "./plaid-name-check";
import { removeBeneficiary } from "./actions";

export const dynamic="force-dynamic";
type Props={searchParams:Promise<{error?:string;success?:string}>};
const countryNames:Record<string,string>={NX:"Nexora Bank",US:"United States",GB:"United Kingdom",DE:"Germany",FR:"France",NL:"Netherlands",ES:"Spain",IE:"Ireland",AT:"Austria",BE:"Belgium",BG:"Bulgaria",CH:"Switzerland",CY:"Cyprus",CZ:"Czechia",DK:"Denmark",EE:"Estonia",FI:"Finland",GR:"Greece",HR:"Croatia",HU:"Hungary",IS:"Iceland",IT:"Italy",LI:"Liechtenstein",LT:"Lithuania",LU:"Luxembourg",LV:"Latvia",MC:"Monaco",MD:"Moldova",ME:"Montenegro",MK:"North Macedonia",MT:"Malta",NO:"Norway",PL:"Poland",PT:"Portugal",RO:"Romania",RS:"Serbia",SE:"Sweden",SI:"Slovenia",SK:"Slovakia",SM:"San Marino",TR:"Türkiye",UA:"Ukraine",VA:"Vatican City"};

function accountLabel(b: { country_code: string; routing_number: string | null; sort_code: string | null; account_number: string | null; iban: string | null }){
  if(b.country_code==="US") return `Routing: ${b.routing_number} · Account: ••••${String(b.account_number||"").slice(-4)}`;
  if(b.country_code==="GB") return `Sort code: ${b.sort_code} · Account: ••••${String(b.account_number||"").slice(-4)}`;
  if(b.iban) return `IBAN: ••••${b.iban.slice(-4)}`;
  return `Account: ${b.account_number}`;
}

export default async function BeneficiariesPage({searchParams}:Props){
  const locale = ((await cookies()).get("nexora_locale")?.value || "en") as SupportedLocale;
  const t = (value: string) => pageText(locale, value);
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)redirect("/login");
  const [{data:beneficiaries,error},params]=await Promise.all([
    supabase.from("beneficiaries").select("id,beneficiary_name,account_number,bank_name,nickname,country_code,routing_number,sort_code,iban,bic,verification_status,created_at").eq("user_id",user.id).order("created_at",{ascending:false}),
    searchParams,
  ]);
  return <main className="workspace-shell">
    <header className="workspace-header"><Link href="/dashboard" className="workspace-back"><ArrowLeft size={16}/> {t("Overview")}</Link><span className="workspace-overline">{t("NEXORA BANK · RECIPIENTS")}</span></header>
    <section className="workspace-intro"><div><span className="workspace-kicker">{t("SAVED RECIPIENTS")}</span><h1>{t("Beneficiaries")}</h1><p>{t("Save bank recipients from supported countries for future use.")}</p></div></section>
    {params.error&&<div className="workspace-alert">{params.error}</div>}{params.success&&<div className="transfer-success">{t("Beneficiary list updated.")}</div>}
    <section className="workspace-panel"><div className="workspace-panel-heading"><div><span className="workspace-kicker">{t("ADD RECIPIENT")}</span><h2>{t("New beneficiary")}</h2></div><Contact size={18}/></div><BeneficiaryForm locale={locale}/></section>
    <section className="workspace-panel beneficiary-list"><div className="workspace-panel-heading"><div><span className="workspace-kicker">{t("YOUR RECIPIENTS")}</span><h2>{t("Saved beneficiaries")}</h2></div><span className="workspace-count">{beneficiaries?.length??0}</span></div>
      {error?<p className="workspace-alert">{t("Unable to load beneficiaries.")}</p>:!beneficiaries?.length?<div className="workspace-empty"><Contact size={24}/><h2>{t("No beneficiaries yet")}</h2><p>{t("Saved recipients will appear here.")}</p></div>:<div className="notification-list">{beneficiaries.map(b=><article key={b.id} className="beneficiary-row"><span className="notification-symbol"><Contact size={17}/></span><div><strong>{b.nickname||b.beneficiary_name}</strong><p>{b.beneficiary_name} · {countryNames[b.country_code]||b.country_code}</p><small>{b.bank_name} · {accountLabel(b)}</small><small className="beneficiary-verification">{t(b.verification_status==="verified"?"Name verified": "Name not independently verified")}</small>{b.country_code==="US"&&<PlaidNameCheck beneficiaryId={b.id} locale={locale}/>}</div><form action={removeBeneficiary}><input type="hidden" name="id" value={b.id}/><button type="submit" aria-label={t("Remove beneficiary")}><Trash2 size={15}/></button></form></article>)}</div>}
    </section>
  </main>;
}
