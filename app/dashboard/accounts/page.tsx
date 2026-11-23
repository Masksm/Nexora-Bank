import Link from "next/link";
import { cookies } from "next/headers";
import type { SupportedLocale } from "@/lib/locale";
import { pageText } from "@/lib/page-translations";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Wallet } from "lucide-react";
import { CopyButton } from "../copy-button";
import { updateAccountNickname, setDashboardAccount } from "../actions";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
type Props = { searchParams: Promise<{ error?: string; success?: string }> };

function money(amountMinor: number, currency = "USD", locale: SupportedLocale = "en") {
  return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 2 }).format(amountMinor / 100);
}

export default async function AccountsPage({ searchParams }: Props) {
  const locale = ((await cookies()).get("nexora_locale")?.value || "en") as SupportedLocale;
  const t = (value: string) => pageText(locale, value);
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: accounts, error }, { data: profile }] = await Promise.all([supabase.from("account_balances")
    .select("account_id,account_number,account_name,nickname,account_type,currency,status,balance_minor")
    .eq("user_id", user.id), supabase.from("profiles").select("dashboard_account_id").eq("user_id", user.id).maybeSingle()]);

  const activeAccounts = (accounts ?? []).filter(account => account.status === "active");
  const selectedOverviewAccountId = activeAccounts.some(account => account.account_id === profile?.dashboard_account_id) ? profile?.dashboard_account_id : activeAccounts[0]?.account_id;

  const total = (accounts ?? []).filter(account => account.currency === "USD").reduce((sum, account) => sum + Number(account.balance_minor ?? 0), 0);

  return (
    <main className="workspace-shell">
      <header className="workspace-header">
        <Link href="/dashboard" className="workspace-back"><ArrowLeft size={16}/> {t("Overview")}</Link>
        <span className="workspace-overline">NEXORA BANK · {t("PERSONAL")}</span>
      </header>
      <section className="workspace-intro">
        <div><span className="workspace-kicker">{t("YOUR MONEY, ORGANIZED")}</span><h1>{t("Accounts")}</h1><p>{t("View your account details and available balances.")}</p></div>
        <div className="workspace-total"><span>{t("USD BALANCE TOTAL")}</span><strong>{money(total, "USD", locale)}</strong></div>
      </section>
      {params.error && <div className="workspace-alert">{params.error}</div>}
      {params.success && <div className="transfer-success">{params.success === "overview" ? t("Overview account updated.") : t("Account nickname updated.")}</div>}
      {error ? <div className="workspace-alert">{t("We couldn’t load your accounts. Please refresh and try again.")}</div> :
        (accounts ?? []).length === 0 ? <div className="workspace-empty"><Wallet size={25}/><h2>{t("No account yet")}</h2><p>{t("Your checking account will appear here after registration is completed.")}</p></div> :
        <section className="account-list">
          {(accounts ?? []).map((account) => (
            <article className="account-detail-card" key={account.account_id}>
              <div className="account-detail-top"><span className="account-detail-icon"><Wallet size={20}/></span><span className={account.status === "active" ? "account-status" : "account-status inactive"}>{t(account.status)}</span></div>
              <div className="account-detail-name"><span>{t(account.account_type.toLowerCase())} {t("ACCOUNT")}</span><h2>{account.nickname || account.account_name}</h2></div>
              <strong className="account-detail-balance">{money(Number(account.balance_minor), account.currency, locale)}</strong>
              <div className="account-number-line"><div><span>{t("ACCOUNT NUMBER")}</span><strong>{account.account_number}</strong></div><CopyButton value={account.account_number} locale={locale}/></div>
              <form action={updateAccountNickname} className="account-nickname-form"><input type="hidden" name="account_id" value={account.account_id}/><label>{t("Account nickname")}<input name="nickname" defaultValue={account.nickname || ""} maxLength={40} minLength={2} placeholder={account.account_name}/></label><button type="submit">{t("Save name")}</button></form>
              <div className="account-detail-foot"><span>{account.currency} · {account.account_type}</span><Link href="/dashboard/transfers">{t("Make a transfer")} <ArrowUpRight size={14}/></Link></div>
              {account.status === "active" && <form action={setDashboardAccount} className="account-overview-choice">
                <input type="hidden" name="account_id" value={account.account_id}/>
                <span>{selectedOverviewAccountId === account.account_id ? t("Shown on your overview") : t("Choose this account for your overview")}</span>
                <button type="submit" disabled={profile?.dashboard_account_id === account.account_id}>{profile?.dashboard_account_id === account.account_id ? t("Currently selected") : t("Show on overview")}</button>
              </form>}
            </article>
          ))}
        </section>}
      
    </main>
  );
}
