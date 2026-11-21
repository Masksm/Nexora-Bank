import Link from "next/link";
import { cookies } from "next/headers";
import type { SupportedLocale } from "@/lib/locale";
import { pageText } from "@/lib/page-translations";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Wallet } from "lucide-react";
import { CopyButton } from "../copy-button";
import { updateAccountNickname } from "../actions";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function money(amountMinor: number, currency = "USD", locale: SupportedLocale = "en") {
  return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 2 }).format(amountMinor / 100);
}

export default async function AccountsPage() {
  const locale = ((await cookies()).get("nexora_locale")?.value || "en") as SupportedLocale;
  const t = (value: string) => pageText(locale, value);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: accounts, error } = await supabase.from("account_balances")
    .select("account_id,account_number,account_name,nickname,account_type,currency,status,balance_minor")
    .eq("user_id", user.id);

  const total = (accounts ?? []).reduce((sum, account) => sum + Number(account.balance_minor ?? 0), 0);

  return (
    <main className="workspace-shell">
      <header className="workspace-header">
        <Link href="/dashboard" className="workspace-back"><ArrowLeft size={16}/> {t("Overview")}</Link>
        <span className="workspace-overline">NEXORA BANK · {t("PERSONAL")}</span>
      </header>
      <section className="workspace-intro">
        <div><span className="workspace-kicker">{t("YOUR MONEY, ORGANIZED")}</span><h1>{t("Accounts")}</h1><p>{t("View your account details and available balances.")}</p></div>
        <div className="workspace-total"><span>{t("COMBINED USD BALANCE")}</span><strong>{money(total, "USD", locale)}</strong></div>
      </section>
      {error ? <div className="workspace-alert">{t("We couldn’t load your accounts. Please refresh and try again.")}</div> :
        (accounts ?? []).length === 0 ? <div className="workspace-empty"><Wallet size={25}/><h2>{t("No account yet")}</h2><p>{t("Your checking account will appear here after registration is completed.")}</p></div> :
        <section className="account-list">
          {(accounts ?? []).map((account) => (
            <article className="account-detail-card" key={account.account_id}>
              <div className="account-detail-top"><span className="account-detail-icon"><Wallet size={20}/></span><span className={account.status === "active" ? "account-status" : "account-status inactive"}>{account.status}</span></div>
              <div className="account-detail-name"><span>{account.account_type} ACCOUNT</span><h2>{account.nickname || account.account_name}</h2></div>
              <strong className="account-detail-balance">{money(Number(account.balance_minor), account.currency, locale)}</strong>
              <div className="account-number-line"><div><span>{t("ACCOUNT NUMBER")}</span><strong>{account.account_number}</strong></div><CopyButton value={account.account_number}/></div>
              <form action={updateAccountNickname} className="account-nickname-form"><input type="hidden" name="account_id" value={account.account_id}/><label>Account nickname<input name="nickname" defaultValue={account.nickname || ""} maxLength={40} minLength={2} placeholder={account.account_name}/></label><button type="submit">Save name</button></form>
              <div className="account-detail-foot"><span>{account.currency} · {account.account_type}</span><Link href="/dashboard/transfers">{t("Make a transfer")} <ArrowUpRight size={14}/></Link></div>
            </article>
          ))}
        </section>}
      <p className="workspace-disclaimer">Balances are calculated from posted internal ledger entries. Nexora Bank does not hold or transfer real-world funds.</p>
    </main>
  );
}
