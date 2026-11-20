import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Wallet } from "lucide-react";
import { CopyButton } from "../copy-button";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function money(amountMinor: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2 }).format(amountMinor / 100);
}

export default async function AccountsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: accounts, error } = await supabase.from("account_balances")
    .select("account_id,account_number,account_name,account_type,currency,status,balance_minor")
    .eq("user_id", user.id);

  const total = (accounts ?? []).reduce((sum, account) => sum + Number(account.balance_minor ?? 0), 0);

  return (
    <main className="workspace-shell">
      <header className="workspace-header">
        <Link href="/dashboard" className="workspace-back"><ArrowLeft size={16}/> Overview</Link>
        <span className="workspace-overline">NEXORA BANK · PERSONAL</span>
      </header>
      <section className="workspace-intro">
        <div><span className="workspace-kicker">YOUR MONEY, ORGANIZED</span><h1>Accounts</h1><p>View your account details and available balances.</p></div>
        <div className="workspace-total"><span>COMBINED USD BALANCE</span><strong>{money(total)}</strong></div>
      </section>
      {error ? <div className="workspace-alert">We couldn’t load your accounts. Please refresh and try again.</div> :
        (accounts ?? []).length === 0 ? <div className="workspace-empty"><Wallet size={25}/><h2>No account yet</h2><p>Your checking account will appear here after registration is completed.</p></div> :
        <section className="account-list">
          {(accounts ?? []).map((account) => (
            <article className="account-detail-card" key={account.account_id}>
              <div className="account-detail-top"><span className="account-detail-icon"><Wallet size={20}/></span><span className={account.status === "active" ? "account-status" : "account-status inactive"}>{account.status}</span></div>
              <div className="account-detail-name"><span>{account.account_type} ACCOUNT</span><h2>{account.account_name}</h2></div>
              <strong className="account-detail-balance">{money(Number(account.balance_minor), account.currency)}</strong>
              <div className="account-number-line"><div><span>ACCOUNT NUMBER</span><strong>{account.account_number}</strong></div><CopyButton value={account.account_number}/></div>
              <div className="account-detail-foot"><span>{account.currency} · {account.account_type}</span><Link href="/dashboard/transfers">Make a transfer <ArrowUpRight size={14}/></Link></div>
            </article>
          ))}
        </section>}
      <p className="workspace-disclaimer">Balances are calculated from posted internal ledger entries. Nexora Bank does not hold or transfer real-world funds.</p>
    </main>
  );
}
