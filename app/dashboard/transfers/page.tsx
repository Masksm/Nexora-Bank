import Link from "next/link";
import { cookies } from "next/headers";
import type { SupportedLocale } from "@/lib/locale";
import { pageText } from "@/lib/page-translations";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowUpRight, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { submitTransfer } from "./actions";

type Props = { searchParams: Promise<{ error?: string; success?: string; review?: string }> };

export const dynamic = "force-dynamic";

function money(minor: number, locale: SupportedLocale = "en") {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(minor / 100);
}

export default async function TransfersPage({ searchParams }: Props) {
  const locale = ((await cookies()).get("nexora_locale")?.value || "en") as SupportedLocale;
  const t = (value: string) => pageText(locale, value);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [{ data: accounts }, params] = await Promise.all([
    supabase.from("account_balances").select("account_id,account_number,account_name,status,balance_minor").eq("user_id", user.id),
    searchParams,
  ]);
  const activeAccounts = (accounts ?? []).filter((account) => account.status === "active");
  const blocked = (accounts ?? []).some((account) => account.status === "blocked" || account.status === "frozen");

  return <main className="workspace-shell">
    <header className="workspace-header"><Link href="/dashboard" className="workspace-back"><ArrowLeft size={16}/> {t("Overview")}</Link><span className="workspace-overline">NEXORA BANK · {t("PAYMENTS")}</span></header>
    <section className="workspace-intro"><div><span className="workspace-kicker">{t("MOVE MONEY")}</span><h1>{t("Transfers")}</h1><p>{t("Send an internal transfer to another active Nexora account.")}</p></div></section>
    {params.error && <div className="workspace-alert">{params.error}</div>}
    {params.success && <div className="transfer-success"><ShieldCheck size={19}/> {t("Transfer posted successfully. Your ledger has been updated.")}</div>}
    {params.review && <div className="transfer-review"><ShieldCheck size={19}/><div><strong>{t("Transfer held for security review")}</strong><p>{t("This device is not yet trusted. The transfer has not changed either account balance. Customer care will review it before it can be posted.")}</p><Link href="/dashboard/help">{t("Contact customer care")} <ArrowUpRight size={14}/></Link></div></div>}
    {activeAccounts.length === 0 ? <div className="workspace-alert">Transfers are unavailable for this account. {t("Contact customer care")} to resolve the account restriction.</div> :
      <section className="workspace-panel transfer-panel">
        <div className="workspace-panel-heading"><div><span className="workspace-kicker">{t("NEW PAYMENT")}</span><h2>{t("Transfer details")}</h2></div></div>
        <form action={submitTransfer} className="transfer-form">
          <label>{t("Pay from")}<select name="account_id" required>{activeAccounts.map((account)=><option key={account.account_id} value={account.account_id}>{account.account_name} · {account.account_number} · {money(Number(account.balance_minor), locale)}</option>)}</select></label>
          <label>{t("Recipient account number")}<input name="recipient" inputMode="numeric" pattern="[0-9]{10}" maxLength={10} placeholder={t("10-digit Nexora account number")} required/></label>
          <label>{t("Amount (USD)")}<input name="amount" type="number" min="0.01" step="0.01" placeholder="250.00" required/></label>
          <label>{t("Description (optional)")}<input name="description" maxLength={160} placeholder={t("What is this transfer for?")}/></label>
          <button type="submit">{t("Review and send transfer")} <ArrowUpRight size={15}/></button>
          <p>{t("Transfers from new or unrecognized devices are held for manual security review before processing.")}</p>
        </form>
      </section>}
    {blocked && <p className="workspace-disclaimer">{t("One or more accounts are restricted. Transfers are only available from active accounts.")}</p>}
  </main>;
}
