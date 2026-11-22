import Link from "next/link";
import { cookies } from "next/headers";
import { getMessages } from "@/lib/messages";
import { pageText } from "@/lib/page-translations";
import { isLanguagePreference, type SupportedLocale } from "@/lib/locale";
import { redirect } from "next/navigation";
import {
  ArrowDownLeft, ArrowUpRight, Bell, Contact, CreditCard, FileText, Activity, CalendarClock,
  HelpCircle, LayoutDashboard, LogOut, Plus, Settings, ShieldCheck, Wallet, PiggyBank,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";

export const dynamic = "force-dynamic";

function money(amountMinor: number, currency = "USD", locale: SupportedLocale = "en") {
  return new Intl.NumberFormat(locale, {
    style: "currency", currency, minimumFractionDigits: 2,
  }).format(Math.abs(amountMinor) / 100);
}

function dateLabel(value: string, locale: SupportedLocale = "en") {
  return new Intl.DateTimeFormat(locale, {
    month: "short", day: "numeric", year: "numeric",
  }).format(new Date(value));
}

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const savedLocale = cookieStore.get("nexora_locale")?.value || "en";
  const locale = (isLanguagePreference(savedLocale) && savedLocale !== "auto" ? savedLocale : "en") as SupportedLocale;
  const messages = getMessages(locale);
  const t = (key: keyof typeof messages) => messages[key];
  const pt = (value: string) => pageText(locale, value);
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");

  const [{ data: profile }, { data: accounts, error: accountError }, { count: unreadCount }] = await Promise.all([
    supabase.from("profiles").select("first_name,last_name,display_name").eq("user_id", user.id).maybeSingle(),
    supabase.from("account_balances")
      .select("account_id,account_number,account_name,nickname,account_type,currency,status,balance_minor")
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

  // Load the complete account ledger in bounded pages. The dashboard's monthly
  // totals must not silently become inaccurate after the first 100 records.
  const entries: Array<{ transaction_id: string; account_id: string; amount_minor: number; currency: string; created_at: string }> = [];
  let entriesError: unknown = null;
  if (accountIds.length) {
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase.from("ledger_entries")
        .select("transaction_id,account_id,amount_minor,currency,created_at")
        .in("account_id", accountIds)
        .order("created_at", { ascending: false })
        .order("transaction_id", { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (error) { entriesError = error; break; }
      entries.push(...(data ?? []));
      if (!data || data.length < pageSize) break;
    }
  }

  const transactionIds = [...new Set(entries.map(entry => entry.transaction_id))];
  const transactions: Array<{ id: string; reference: string; transaction_type: string; status: string; description: string | null; created_at: string; metadata: { review_required?: boolean } | null }> = [];
  let transactionsError: unknown = null;
  // Chunk IDs to keep PostgREST request URLs within practical limits.
  for (let offset = 0; offset < transactionIds.length; offset += 300) {
    const batch = transactionIds.slice(offset, offset + 300);
    const { data, error } = await supabase.from("ledger_transactions")
      .select("id,reference,transaction_type,status,description,created_at,metadata")
      .in("id", batch);
    if (error) { transactionsError = error; break; }
    transactions.push(...(data ?? []));
  }
  transactions.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

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
        <div className="sidebar-label">{t("nav.yourBank")}</div>
        <nav className="dashboard-nav" aria-label={t("Main navigation")}>
          <Link className="active" href="/dashboard"><LayoutDashboard size={17}/> {t("nav.overview")}</Link>
          <Link href="/dashboard/accounts"><Wallet size={17}/> {t("nav.accounts")}</Link>
          <Link href="/dashboard/beneficiaries"><Contact size={17}/> {t("nav.beneficiaries")}</Link>
          <Link href="/dashboard/transfers"><ArrowUpRight size={17}/> {t("nav.transfers")}</Link>
          <Link href="/dashboard/cards"><CreditCard size={17}/> {t("nav.cards")}</Link>
          <Link href="/dashboard/transactions"><FileText size={17}/> {t("nav.transactions")}</Link>
          <Link href="/dashboard/analytics"><Activity size={17}/> {pt("Analytics")}</Link>
          <Link href="/dashboard/statements"><FileText size={17}/> {pt("Statements")}</Link>
          <Link href="/dashboard/scheduled-transfers"><CalendarClock size={17}/> {pt("Scheduled transfers")}</Link>
          <Link href="/dashboard/savings"><PiggyBank size={17}/> {pt("Savings goals")}</Link>
        </nav>
        <div className="sidebar-label sidebar-bottom-label">{t("nav.preferences")}</div>
        <nav className="dashboard-nav">
          <Link href="/dashboard/notifications"><Bell size={17}/> {t("nav.notifications")}{Number(unreadCount ?? 0) > 0 && <span className="nav-count">{unreadCount}</span>}</Link>
          <Link href="/dashboard/settings"><Settings size={17}/> {t("nav.settings")}</Link>
          <Link href="/dashboard/security"><ShieldCheck size={17}/> {t("nav.security")}</Link>
          <Link href="/dashboard/help"><HelpCircle size={17}/> {t("nav.help")}</Link>
        </nav>
        <div className="sidebar-footer">
          <div className="avatar">{displayName.slice(0,1).toUpperCase()}</div>
          <div className="sidebar-user"><strong>{displayName}</strong><span>{user.email}</span></div>
          <form action={signOut}><button className="logout-button" type="submit" aria-label={t("nav.signOut")}><LogOut size={17}/></button></form>
        </div>
      </aside>

      <section className="dashboard-main">
        <header className="dashboard-topbar">
          <div><span className="dashboard-eyebrow">{t("dashboard.eyebrow")}</span><h1>{t("nav.overview")}</h1></div>
          <div className="topbar-right"><span className="secure-indicator"><ShieldCheck size={15}/> {t("dashboard.secureSession")}</span><Link href="/dashboard/notifications" className="notification-button" aria-label={Number(unreadCount ?? 0) ? `Notifications, ${unreadCount} unread` : "Notifications"}><Bell size={18}/>{Number(unreadCount ?? 0) > 0 && <i className="notification-dot"/>}</Link></div>
        </header>

        <div className="dashboard-welcome"><div><p>{t("dashboard.welcomeEyebrow")}</p><h2>{t("dashboard.greeting")}, {displayName.split(" ")[0]}.</h2><span>{t("dashboard.welcome")}</span></div><div className="welcome-date">{new Intl.DateTimeFormat(locale,{weekday:"long",month:"long",day:"numeric"}).format(new Date())}</div></div>

        <section className="dashboard-summary-grid">
          <article className="summary-card balance-card">
            <div className="summary-label">{t("dashboard.totalBalance")} <Wallet size={17}/></div>
            <div className="summary-amount">{money(totalMinor, "USD", locale)}</div>
            <div className="summary-foot">{t("dashboard.acrossAccounts")}</div>
          </article>
          <article className="summary-card">
            <div className="summary-label">{t("dashboard.moneyIn")} <ArrowDownLeft size={17}/></div>
            <div className="summary-amount">{money(moneyIn, "USD", locale)}</div>
            <div className="summary-foot">{t("dashboard.postedCredits")}</div>
          </article>
          <article className="summary-card">
            <div className="summary-label">{t("dashboard.moneyOut")} <ArrowUpRight size={17}/></div>
            <div className="summary-amount">{money(moneyOut, "USD", locale)}</div>
            <div className="summary-foot">{t("dashboard.postedDebits")}</div>
          </article>
        </section>

        <section className="dashboard-content-grid">
          <article className="dashboard-panel account-panel">
            <div className="panel-heading"><div><span className="panel-kicker">{t("dashboard.accounts")}</span><h3>{t("dashboard.accountOverview")}</h3></div><Link href="/dashboard/accounts">{t("dashboard.viewAccounts")} <ArrowUpRight size={15}/></Link></div>
            {accountError ? <p className="dashboard-empty">{t("dashboard.loadingAccounts")}</p> :
              primary ? <div className="account-row"><div className="account-symbol"><Wallet size={19}/></div><div className="account-details"><strong>{primary.nickname || primary.account_name}</strong><span>{primary.account_type} · {primary.account_number}</span></div><div className="account-balance"><strong>{money(Number(primary.balance_minor), primary.currency, locale)}</strong><span>{primary.status}</span></div></div> :
              <div className="dashboard-empty">{t("dashboard.noAccount")}</div>}
            {primary && <div className="account-card-foot"><span>{t("dashboard.accountNumber")}</span><strong>{primary.account_number}</strong></div>}
          </article>

          <article className="dashboard-panel quick-panel">
            <div className="panel-heading"><div><span className="panel-kicker">{t("dashboard.shortcuts")}</span><h3>{t("dashboard.quickActions")}</h3></div></div>
            <div className="quick-actions">
              <Link href="/dashboard/transfers"><span><ArrowUpRight size={18}/></span>{t("dashboard.sendMoney")}</Link>
              <Link href="/dashboard/beneficiaries"><span><Plus size={18}/></span>{t("dashboard.addBeneficiary")}</Link>
              <Link href="/dashboard/transactions"><span><FileText size={18}/></span>{t("nav.transactions")}</Link>
              <Link href="/dashboard/cards"><span><CreditCard size={18}/></span>{t("dashboard.manageCards")}</Link>
              <Link href="/dashboard/analytics"><span><Activity size={18}/></span>{pt("Spending analytics")}</Link>
              <Link href="/dashboard/scheduled-transfers"><span><CalendarClock size={18}/></span>{pt("Schedule a transfer")}</Link>
              <Link href="/dashboard/savings"><span><PiggyBank size={18}/></span>{pt("Savings goals")}</Link>
            </div>
          </article>
        </section>

        <section className="dashboard-panel activity-panel">
          <div className="panel-heading"><div><span className="panel-kicker">{t("dashboard.activity")}</span><h3>{t("dashboard.recentTransactions")}</h3></div><Link href="/dashboard/transactions">{t("dashboard.viewAll")} <ArrowUpRight size={15}/></Link></div>
          {activityError ? <p className="dashboard-empty">{t("dashboard.loadingActivity")}</p> :
            recentTransactions.length === 0 ? <div className="activity-empty"><div className="empty-icon"><FileText size={21}/></div><strong>{t("dashboard.noTransactions")}</strong><span>{t("dashboard.activityAppears")}</span></div> :
            <div className="dashboard-recent-list">
              {recentTransactions.map(transaction => {
                const entry = entryByTransaction.get(transaction.id);
                const amount = entry?.amount_minor ?? 0;
                const incoming = amount > 0;
                const review = (transaction.metadata as { review_required?: boolean; synthetic_demo?: boolean } | null)?.review_required === true;
                return <article className="dashboard-recent-row" key={transaction.id}>
                  <span className={incoming ? "recent-transaction-icon incoming" : "recent-transaction-icon"}>{incoming ? <ArrowDownLeft size={17}/> : <ArrowUpRight size={17}/>}</span>
                  <div className="recent-transaction-description"><strong>{transaction.description || pt(transaction.transaction_type.replaceAll("_", " "))}</strong><span>{dateLabel(transaction.created_at, locale)} · Ref {transaction.reference}</span></div>
                  <div className="recent-transaction-amount"><strong className={incoming ? "positive" : ""}>{incoming ? "+" : "−"}{money(amount, entry?.currency ?? "USD", locale)}</strong><span className={"transaction-status " + (review ? "review" : transaction.status)}>{review ? t("dashboard.underReview") : pt(transaction.status)}</span></div>
                </article>;
              })}
            </div>}
        </section>

      </section>
    </main>
  );
}
