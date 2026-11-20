import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowDownLeft, ArrowUpRight, Bell, Contact, CreditCard, FileText,
  HelpCircle, LayoutDashboard, LogOut, Plus, Settings, ShieldCheck, Wallet,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";

export const dynamic = "force-dynamic";

function money(amountMinor: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency, minimumFractionDigits: 2,
  }).format(Math.abs(amountMinor) / 100);
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric",
  }).format(new Date(value));
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");

  const [{ data: profile }, { data: accounts, error: accountError }, { count: unreadCount }] = await Promise.all([
    supabase.from("profiles").select("first_name,last_name,display_name").eq("user_id", user.id).maybeSingle(),
    supabase.from("account_balances")
      .select("account_id,account_number,account_name,account_type,currency,status,balance_minor")
      .eq("user_id", user.id),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
  ]);

  const displayName = profile?.display_name ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
    user.email?.split("@")[0] || "there";
  const primary = accounts?.[0];
  const totalMinor = (accounts ?? []).reduce((sum, account) =>
    sum + (account.currency === "USD" ? Number(account.balance_minor ?? 0) : 0), 0);
  const accountIds = (accounts ?? []).map(account => account.account_id);

  const { data: entries, error: entriesError } = accountIds.length
    ? await supabase.from("ledger_entries")
      .select("transaction_id,account_id,amount_minor,currency,created_at")
      .in("account_id", accountIds).order("created_at", { ascending: false }).limit(100)
    : { data: [], error: null };
  const transactionIds = [...new Set((entries ?? []).map(entry => entry.transaction_id))];
  const { data: transactions, error: transactionsError } = transactionIds.length
    ? await supabase.from("ledger_transactions")
      .select("id,reference,transaction_type,status,description,created_at,metadata")
      .in("id", transactionIds).order("created_at", { ascending: false })
    : { data: [], error: null };

  const entryByTransaction = new Map<string, { amount_minor: number; currency: string }>();
  for (const entry of entries ?? []) {
    const current = entryByTransaction.get(entry.transaction_id);
    if (!current || Math.abs(Number(entry.amount_minor)) > Math.abs(current.amount_minor)) {
      entryByTransaction.set(entry.transaction_id, { amount_minor: Number(entry.amount_minor), currency: entry.currency });
    }
  }
  const recentTransactions = (transactions ?? []).slice(0, 5);
  const postedIds = new Set((transactions ?? []).filter(transaction => transaction.status === "posted").map(transaction => transaction.id));
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthEntries = (entries ?? []).filter(entry =>
    postedIds.has(entry.transaction_id) && new Date(entry.created_at) >= monthStart);
  const moneyIn = monthEntries.reduce((sum, entry) => sum + Math.max(0, Number(entry.amount_minor)), 0);
  const moneyOut = monthEntries.reduce((sum, entry) => sum + Math.max(0, -Number(entry.amount_minor)), 0);
  const activityError = Boolean(entriesError || transactionsError);

  return (
    <main className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <Link className="brand" href="/"><span className="brand-mark">N</span><span>NEXORA<span className="brand-light"> BANK</span></span></Link>
        <div className="sidebar-label">YOUR BANK</div>
        <nav className="dashboard-nav" aria-label="Main navigation">
          <Link className="active" href="/dashboard"><LayoutDashboard size={17}/> Overview</Link>
          <Link href="/dashboard/accounts"><Wallet size={17}/> Accounts</Link>
          <Link href="/dashboard/beneficiaries"><Contact size={17}/> Beneficiaries</Link>
          <Link href="/dashboard/transfers"><ArrowUpRight size={17}/> Transfers</Link>
          <Link href="/dashboard/cards"><CreditCard size={17}/> Cards</Link>
          <Link href="/dashboard/transactions"><FileText size={17}/> Transactions</Link>
        </nav>
        <div className="sidebar-label sidebar-bottom-label">PREFERENCES</div>
        <nav className="dashboard-nav">
          <Link href="/dashboard/notifications"><Bell size={17}/> Notifications{Number(unreadCount ?? 0) > 0 && <span className="nav-count">{unreadCount}</span>}</Link>
          <Link href="/dashboard/settings"><Settings size={17}/> Settings</Link>
          <Link href="/dashboard/security"><ShieldCheck size={17}/> Security</Link>
          <Link href="/dashboard/help"><HelpCircle size={17}/> Help centre</Link>
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
          <div className="topbar-right"><span className="secure-indicator"><ShieldCheck size={15}/> Secure session</span><Link href="/dashboard/notifications" className="notification-button" aria-label={Number(unreadCount ?? 0) ? `Notifications, ${unreadCount} unread` : "Notifications"}><Bell size={18}/>{Number(unreadCount ?? 0) > 0 && <i className="notification-dot"/>}</Link></div>
        </header>

        <div className="dashboard-welcome"><div><p>YOUR FINANCES, IN FOCUS</p><h2>Good day, {displayName.split(" ")[0]}.</h2><span>Here’s what’s happening with your account.</span></div><div className="welcome-date">{new Intl.DateTimeFormat("en-US",{weekday:"long",month:"long",day:"numeric"}).format(new Date())}</div></div>

        <section className="dashboard-summary-grid">
          <article className="summary-card balance-card">
            <div className="summary-label">TOTAL AVAILABLE BALANCE <Wallet size={17}/></div>
            <div className="summary-amount">{money(totalMinor)}</div>
            <div className="summary-foot">Across your USD accounts</div>
          </article>
          <article className="summary-card">
            <div className="summary-label">MONEY IN THIS MONTH <ArrowDownLeft size={17}/></div>
            <div className="summary-amount">{money(moneyIn)}</div>
            <div className="summary-foot">Posted credits to your accounts</div>
          </article>
          <article className="summary-card">
            <div className="summary-label">MONEY OUT THIS MONTH <ArrowUpRight size={17}/></div>
            <div className="summary-amount">{money(moneyOut)}</div>
            <div className="summary-foot">Posted debits from your accounts</div>
          </article>
        </section>

        <section className="dashboard-content-grid">
          <article className="dashboard-panel account-panel">
            <div className="panel-heading"><div><span className="panel-kicker">YOUR ACCOUNTS</span><h3>Account overview</h3></div><Link href="/dashboard/accounts">View accounts <ArrowUpRight size={15}/></Link></div>
            {accountError ? <p className="dashboard-empty">We couldn’t load your accounts. Refresh the page to try again.</p> :
              primary ? <div className="account-row"><div className="account-symbol"><Wallet size={19}/></div><div className="account-details"><strong>{primary.account_name}</strong><span>{primary.account_type} · {primary.account_number}</span></div><div className="account-balance"><strong>{money(Number(primary.balance_minor), primary.currency)}</strong><span>{primary.status}</span></div></div> :
              <div className="dashboard-empty">No bank account is linked to this profile yet.</div>}
            {primary && <div className="account-card-foot"><span>Account number</span><strong>{primary.account_number}</strong></div>}
          </article>

          <article className="dashboard-panel quick-panel">
            <div className="panel-heading"><div><span className="panel-kicker">SHORTCUTS</span><h3>Quick actions</h3></div></div>
            <div className="quick-actions">
              <Link href="/dashboard/transfers"><span><ArrowUpRight size={18}/></span>Send money</Link>
              <Link href="/dashboard/beneficiaries"><span><Plus size={18}/></span>Add beneficiary</Link>
              <Link href="/dashboard/transactions"><span><FileText size={18}/></span>Transactions</Link>
              <Link href="/dashboard/cards"><span><CreditCard size={18}/></span>Manage cards</Link>
            </div>
          </article>
        </section>

        <section className="dashboard-panel activity-panel">
          <div className="panel-heading"><div><span className="panel-kicker">ACCOUNT ACTIVITY</span><h3>Recent transactions</h3></div><Link href="/dashboard/transactions">View all <ArrowUpRight size={15}/></Link></div>
          {activityError ? <p className="dashboard-empty">We couldn’t load recent activity. Refresh the page to try again.</p> :
            recentTransactions.length === 0 ? <div className="activity-empty"><div className="empty-icon"><FileText size={21}/></div><strong>No transactions yet</strong><span>Your account activity will appear here when transactions are recorded.</span></div> :
            <div className="dashboard-recent-list">
              {recentTransactions.map(transaction => {
                const entry = entryByTransaction.get(transaction.id);
                const amount = entry?.amount_minor ?? 0;
                const incoming = amount > 0;
                const review = (transaction.metadata as { review_required?: boolean; synthetic_demo?: boolean } | null)?.review_required === true;
                const synthetic = (transaction.metadata as { synthetic_demo?: boolean } | null)?.synthetic_demo === true;
                return <article className="dashboard-recent-row" key={transaction.id}>
                  <span className={incoming ? "recent-transaction-icon incoming" : "recent-transaction-icon"}>{incoming ? <ArrowDownLeft size={17}/> : <ArrowUpRight size={17}/>}</span>
                  <div className="recent-transaction-description"><strong>{transaction.description || transaction.transaction_type.replaceAll("_", " ")}</strong><span>{dateLabel(transaction.created_at)} · Ref {transaction.reference}{synthetic ? " · Sample history" : ""}</span></div>
                  <div className="recent-transaction-amount"><strong className={incoming ? "positive" : ""}>{incoming ? "+" : "−"}{money(amount, entry?.currency ?? "USD")}</strong><span className={"transaction-status " + (review ? "review" : transaction.status)}>{review ? "Under review" : transaction.status}</span></div>
                </article>;
              })}
            </div>}
        </section>
        <footer className="dashboard-disclaimer">Nexora Bank is a portfolio application. Balances and transfers are internal ledger records, not real funds or bank services.</footer>
      </section>
    </main>
  );
}
