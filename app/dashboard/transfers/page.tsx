import Link from "next/link";
import { cookies } from "next/headers";
import type { SupportedLocale } from "@/lib/locale";
import { pageText } from "@/lib/page-translations";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Send, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { TransferDestination } from "./transfer-destination";

type Props = { searchParams: Promise<{ error?: string; success?: string; review?: string }> };

export const dynamic = "force-dynamic";

export default async function TransfersPage({ searchParams }: Props) {
  const locale = ((await cookies()).get("nexora_locale")?.value || "en") as SupportedLocale;
  const t = (value: string) => pageText(locale, value);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [{ data: accounts }, { data: beneficiaries }, params] = await Promise.all([
    supabase.from("account_balances").select("account_id,account_number,account_name,status,balance_minor").eq("user_id", user.id),
    supabase.from("beneficiaries").select("id,beneficiary_name,bank_name,country_code,account_number,routing_number,sort_code,iban,bic,verification_status").eq("user_id",user.id).order("created_at",{ascending:false}),
    searchParams,
  ]);
  const blocked = (accounts ?? []).some((account) => account.status === "blocked" || account.status === "frozen");

  return <main className="workspace-shell">
    <header className="workspace-header"><Link href="/dashboard" className="workspace-back"><ArrowLeft size={16}/> {t("Overview")}</Link><span className="workspace-overline">NEXORA BANK · {t("PAYMENTS")}</span></header>
    <section className="workspace-intro"><div><span className="workspace-kicker">{t("MOVE MONEY")}</span><h1>{t("Transfers")}</h1><p>{t("Send an internal transfer to another active Nexora account.")}</p></div><Link href="/dashboard/scheduled-transfers" className="workspace-download">{t("Schedule a transfer")}</Link></section>
    {params.error && <div className="workspace-alert">{params.error}</div>}
    {params.success && <div className="transfer-success"><ShieldCheck size={19}/> {t("Transfer posted successfully. Your ledger has been updated.")}</div>}
    {params.review && <div className="transfer-review"><ShieldCheck size={19}/><div><strong>{t("Transfer held for security review")}</strong><p>{t("This device is not yet trusted. The transfer has not changed either account balance. Customer care will review it before it can be posted.")}</p><Link href="/dashboard/help">{t("Contact customer care")} <ArrowUpRight size={14}/></Link></div></div>}
    <TransferDestination accounts={accounts??[]} beneficiaries={beneficiaries??[]} locale={locale}/>
    {blocked && <p className="workspace-disclaimer">{t("One or more accounts are restricted. Transfers are only available from active accounts.")}</p>}
  </main>;
}
