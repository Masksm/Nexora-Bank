import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowDownLeft, ArrowUpRight, Bell, CreditCard, FileText,
  HelpCircle, LayoutDashboard, LogOut, Plus, Settings, ShieldCheck, Wallet,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";

export const dynamic = "force-dynamic";

function money(amountMinor: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency, minimumFractionDigits: 2,
  }).format(amountMinor / 100);
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");

  const [{ data: profile }, { data: accounts, error: accountError }] = await Promise.all([
    supabase.from("profiles").select("first_name,last_name,display_name").eq("user_id", user.id).maybeSingle(),
    supabase.from("account_balances")
      .select("account_id,account_number,account_name,account_type,currency,status,balance_minor")
      .eq("user_id", user.id),
  ]);

  const displayName = profile?.display_name ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
    user.email?.split("@")[0] || "there";
  const primary = accounts?.[0];
  const totalMinor = (accounts ?? []).reduce((sum, account) =>
    sum + (account.currency === "USD" ? Number(account.balance_minor ?? 0) : 0), 0);

  return (
    <main className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <Link className="brand" href="/"><span className="brand-mark">N</span><span>NEXORA<span className="brand-light"> BANK</span></span></Link>
        <div className="sidebar-label">YOUR BANK</div>
        <nav className="dashboard-nav" aria-label="Main navigation">
          <a className="active" href="/dashboard"><LayoutDashboard size={17}/> Overview</a>
          <a href="/dashboard/accounts"><Wallet size={17}/> Accounts</a>
          <a href="/dashboard/transfers"><ArrowUpRight size={17}/> Transfers</a>
          <a href="/dashboard/cards"><CreditCard size={17}/> Cards</a>
          <a href="/dashboard/transactions"><FileText size={17}/> Transactions</a>
        </nav>
        <div className="sidebar-label sidebar-bottom-label">PREFERENCES</div>
        <nav className="dashboard-nav">
          <a href="/dashboard/notifications"><Bell size={17}/> Notifications</a>
          <a href="/dashboard/settings"><Settings size={17}/> Settings</a>
          <a href="/dashboard/security"><ShieldCheck size={17}/> Security</a>
          <a href="/dashboard/help"><HelpCircle size={17}/> Help centre</a>
        </nav>
        <div className="sidebar-footer">
          <div className="avatar">{displayName.slice(0,1).toUpperCase()}</div>
          <div className="sidebar-user"><strong>{displayName}</strong><span>{user.email}</span></div>
          <form action={signOut}><button className="logout-button" type="submit" aria-label="Sign out"><LogOut size={17}/></button></form>
        </div>
      </aside>

      <section className="dashboard-main">
        <header className="dashboard-topbar">
          <div><span className="dashboard-eyebrow">PERSONAL BANKING</span><h1>Overview</h1></div>
          <div className="topbar-right"><span className="secure-indicator"><ShieldCheck size={15}/> Secure session</span><button className="notification-button" aria-label="Notifications"><Bell size={18}/></button></div>
        </header>

        <div className="dashboard-welcome"><div><p>YOUR FINANCES, IN FOCUS</p><h2>Good day, {displayName.split(" ")[0]}.</h2><span>Here’s what’s happening with your account.</span></div><div className="welcome-date">{new Intl.DateTimeFormat("en-US",{weekday:"long",month:"long",day:"numeric"}).format(new Date())}</div></div>

        <section className="dashboard-summary-grid">
          <article className="summary-card balance-card">
            <div className="summary-label">TOTAL AVAILABLE BALANCE <Wallet size={17}/></div>
            <div className="summary-amount">{money(totalMinor)}</div>
            <div className="summary-foot">Across your USD accounts</div>
          </article>
          <article className="summary-card">
            <div className="summary-label">ACTIVE ACCOUNTS <CreditCard size={17}/></div>
            <div className="summary-amount">{(accounts ?? []).filter(a => a.status === "active").length}</div>
            <div className="summary-foot">Accounts in your profile</div>
          </article>
          <article className="summary-card">
            <div className="summary-label">ACCOUNT STATUS <ShieldCheck size={17}/></div>
            <div className="status-value"><span className={primary?.status === "active" ? "status-dot" : "status-dot pending"}/>{primary?.status ?? "Not available"}</div>
            <div className="summary-foot">Primary checking account</div>
          </article>
        </section>

        <section className="dashboard-content-grid">
          <article className="dashboard-panel account-panel">
            <div className="panel-heading"><div><span className="panel-kicker">YOUR ACCOUNTS</span><h3>Account overview</h3></div><a href="/dashboard/accounts">View accounts <ArrowUpRight size={15}/></a></div>
            {accountError ? <p className="dashboard-empty">We couldn’t load your accounts. Refresh the page to try again.</p> :
              primary ? <div className="account-row"><div className="account-symbol"><Wallet size={19}/></div><div className="account-details"><strong>{primary.account_name}</strong><span>{primary.account_type} · {primary.account_number}</span></div><div className="account-balance"><strong>{money(Number(primary.balance_minor), primary.currency)}</strong><span>{primary.status}</span></div></div> :
              <div className="dashboard-empty">No bank account is linked to this profile yet.</div>}
            {primary && <div className="account-card-foot"><span>Account number</span><strong>{primary.account_number}</strong></div>}
          </article>

          <article className="dashboard-panel quick-panel">
            <div className="panel-heading"><div><span className="panel-kicker">SHORTCUTS</span><h3>Quick actions</h3></div></div>
            <div className="quick-actions">
              <a href="/dashboard/transfers"><span><ArrowUpRight size={18}/></span>Send money</a>
              <a href="/dashboard/beneficiaries"><span><Plus size={18}/></span>Add beneficiary</a>
              <a href="/dashboard/transactions"><span><FileText size={18}/></span>Statements</a>
              <a href="/dashboard/cards"><span><CreditCard size={18}/></span>Manage cards</a>
            </div>
          </article>
        </section>

        <section className="dashboard-panel activity-panel">
          <div className="panel-heading"><div><span className="panel-kicker">ACCOUNT ACTIVITY</span><h3>Recent transactions</h3></div><a href="/dashboard/transactions">View all <ArrowUpRight size={15}/></a></div>
          <div className="activity-empty"><div className="empty-icon"><FileText size={21}/></div><strong>No transactions yet</strong><span>Your account activity will appear here when transactions are recorded.</span></div>
        </section>
        <footer className="dashboard-disclaimer">Nexora Bank is a portfolio application. Balances and transfers are internal ledger records, not real funds or bank services.</footer>
      </section>
    </main>
  );
}
