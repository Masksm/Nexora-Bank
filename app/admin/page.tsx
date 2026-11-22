import Link from "next/link";
import { cookies } from "next/headers";
import type { SupportedLocale } from "@/lib/locale";
import { pageText } from "@/lib/page-translations";
import { redirect } from "next/navigation";
import { Activity, ArrowUpFromLine, LogOut, RotateCcw, ShieldCheck, Users, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { adjustBalance, generateDemoHistory, resetDemoHistory, setAccountStatus } from "./actions";
import { signOut } from "@/app/auth/actions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ kind?: string; message?: string; q?: string }>;

function money(minor: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(minor / 100);
}

export default async function AdminPage({ searchParams }: { searchParams: SearchParams }) {
  const locale = ((await cookies()).get("nexora_locale")?.value || "en") as SupportedLocale;
  const t = (value: string) => pageText(locale, value);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const appMetadata = claimsData?.claims?.app_metadata as { role?: string } | undefined;
  if (!user || claimsError || !["admin", "super_admin"].includes(appMetadata?.role ?? "")) redirect("/dashboard");

  const [{ data: accounts, error }, params] = await Promise.all([
    supabase.from("account_balances").select("account_id,user_id,account_number,account_name,account_type,currency,status,balance_minor").not("user_id", "is", null).order("account_number"),
    searchParams,
  ]);
  const rows = accounts ?? [];
  const search = (params.q || "").trim().toLowerCase();
  const displayedRows = search ? rows.filter((row) => row.account_number.toLowerCase().includes(search) || row.account_name.toLowerCase().includes(search) || row.user_id.toLowerCase().includes(search)) : rows;
  const currencyTotals = new Map<string, number>();
  for (const row of rows) currencyTotals.set(row.currency, (currencyTotals.get(row.currency) || 0) + Number(row.balance_minor || 0));
  const totalDisplay = [...currencyTotals.entries()].map(([currency, amount]) => money(amount, currency)).join(" · ") || "—";
  const activeCount = rows.filter((row) => row.status === "active").length;

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <Link className="admin-brand" href="/"><span>N</span>{t("NEXORA")} <i>{t("ADMIN")}</i></Link>
        <div className="admin-side-label">{t("CONTROL CENTRE")}</div>
        <nav><Link className="selected" href="/admin"><Activity size={17}/> {t("Overview")}</Link><a href="#customers"><Users size={17}/> {t("Customers")}</a><a href="#ledger"><Wallet size={17}/> {t("Ledger operations")}</a><Link href="/admin/kyc">{t("KYC review")}</Link><Link href="/admin/reviews">{t("Security reviews")}</Link><Link href="/admin/support">{t("Support inbox")}</Link><Link href="/admin/audit">{t("Audit log")}</Link></nav>
        <div className="admin-sidebar-foot"><ShieldCheck size={16}/><span>{t("Administrator session")}</span><form action={signOut}><button className="admin-logout-button" type="submit"><LogOut size={15}/> {t("Sign out")}</button></form></div>
      </aside>
      <section className="admin-main">
        <header className="admin-topbar"><div><span>{t("ADMINISTRATION / OVERVIEW")}</span><h1>{t("Control centre")}</h1></div></header>
        <div className="admin-welcome"><div><span>{t("SECURE ADMINISTRATION")}</span><h2>{t("Bank operations")}</h2><p>{t("Manage customer accounts and ledger operations.")}</p></div><div className="admin-identity"><ShieldCheck size={18}/><span>{user.email}<small>{t("Administrator")}</small></span></div></div>
        {params.message && <div className={params.kind === "error" ? "admin-alert error" : "admin-alert success"}>{params.message}</div>}
        <section className="admin-stats">
          <article><span><Users size={17}/> {t("CUSTOMER ACCOUNTS")}</span><strong>{rows.length}</strong><small>{t("Accounts in the ledger")}</small></article>
          <article><span><Wallet size={17}/> {t("BALANCES BY CURRENCY")}</span><strong>{totalDisplay}</strong><small>{t("Separate totals by account currency")}</small></article>
          <article><span><ShieldCheck size={17}/> {t("ACTIVE ACCOUNTS")}</span><strong>{activeCount}</strong><small>{t("Currently permitted status")}</small></article>
        </section>

        <section className="admin-panel" id="customers">
          <div className="admin-panel-heading"><div><span>{t("CUSTOMER DIRECTORY")}</span><h2>{t("Customer accounts")}</h2></div><span>{displayedRows.length} of {rows.length}</span></div>
          <form className="admin-search" action="/admin" method="get"><input name="q" defaultValue={params.q || ""} placeholder={t("Search account number, name or customer ID")}/><button type="submit">{t("Search")}</button></form>
          {error ? <p className="admin-empty">{t("Could not load customer accounts. Check the administrator database policies.")}</p> : rows.length === 0 ? <p className="admin-empty">{t("No customer accounts have been created yet.")}</p> :
            <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>{t("Account")}</th><th>{t("Account number")}</th><th>{t("Balance")}</th><th>{t("Status")}</th><th>{t("Customer ID")}</th></tr></thead><tbody>
              {displayedRows.map((row) => <tr key={row.account_id}><td><strong>{row.account_name}</strong><small>{row.account_type} · {row.currency}</small></td><td>{row.account_number}</td><td>{money(Number(row.balance_minor), row.currency)}</td><td><span className={"admin-status " + row.status}>{t(row.status)}</span></td><td><code>{row.user_id.slice(0, 8)}…</code></td></tr>)}
            </tbody></table></div>}
        </section>

        <section className="admin-operations" id="ledger">
          <article className="admin-panel">
            <div className="admin-panel-heading"><div><span>{t("MANUAL LEDGER ENTRY")}</span><h2>{t("Credit or debit account")}</h2></div><ArrowUpFromLine size={18}/></div>
            <p className="admin-help">{t("Post one ordinary adjustment. It immediately changes the customer’s ledger balance and appears as a transaction.")}</p>
            <form action={adjustBalance} className="admin-form">
              <label>{t("Customer account")}<select name="account_id" required defaultValue=""><option value="" disabled>{t("Select an account")}</option>{rows.map((row)=><option key={row.account_id} value={row.account_id}>{row.account_number} · {row.account_name} · {money(Number(row.balance_minor), row.currency)}</option>)}</select></label>
              <div className="admin-form-grid"><label>{t("Operation")}<select name="direction" defaultValue="credit"><option value="credit">{t("Credit / money in")}</option><option value="debit">{t("Debit / money out")}</option></select></label><label>{t("Amount (account currency)")}<input name="amount" type="number" min="0.01" step="0.01" placeholder={t("2500.00")} required/></label></div>
              <label>{t("Source or reason")}<input name="reason" minLength={8} maxLength={240} placeholder={t("e.g. Account funding adjustment")} required/></label>
              <button type="submit" disabled={!rows.length}>{t("Post ledger adjustment")}</button>
            </form>
          </article>

          <article className="admin-panel">
            <div className="admin-panel-heading"><div><span>{t("ACCOUNT HISTORY MANAGEMENT")}</span><h2>{t("Generate account activity")}</h2></div><Activity size={18}/></div>
            <p className="admin-help">{t("Creates the selected number of historical transactions, including the opening balance. Credits and debits use independently randomized amounts and descriptions. Total incoming and outgoing activity is balanced, so the final balance remains exactly at the target.")}</p>
            <form action={generateDemoHistory} className="admin-form">
              <label>{t("Empty customer account")}<select name="account_id" required defaultValue=""><option value="" disabled>{t("Select an account")}</option>{rows.filter((row)=>row.currency==="USD" && Number(row.balance_minor)===0).map((row)=><option key={row.account_id} value={row.account_id}>{row.account_number} · {row.account_name}</option>)}</select></label>
              <label>{t("Target opening and final balance (USD)")}<input name="target_amount" type="number" min="0.01" step="0.01" placeholder={t("100000000.00")} required/></label>
              <div className="admin-form-grid"><label>{t("History begins")}<select name="start_year" defaultValue="2019">{Array.from({length:new Date().getFullYear()-2019+1},(_,i)=>2019+i).map((year)=><option key={year} value={year}>{year}</option>)}</select></label><label>{t("Total transactions")}<select name="transactions" defaultValue="100"><option value="50">{t("50 transactions")}</option><option value="100">{t("100 transactions")}</option><option value="150">{t("150 transactions")}</option><option value="200">{t("200 transactions")}</option><option value="250">{t("250 transactions")}</option></select></label></div>
              <button type="submit" className="secondary" disabled={!rows.some((row)=>row.currency==="USD" && Number(row.balance_minor)===0)}>{t("Generate account history")}</button>
              <small className="admin-warning">{t("This action requires an empty account. It cannot overwrite existing transactions. Generated activity is tracked in internal ledger metadata and audit logs.")}</small>
            </form>
          </article>

          <article className="admin-panel">
            <div className="admin-panel-heading"><div><span>{t("ACCOUNT HISTORY MANAGEMENT")}</span><h2>{t("Clear account history")}</h2></div><RotateCcw size={18}/></div>
            <p className="admin-help">{t("Permanently removes eligible generated transactions from the selected account and restores its balance to zero. Other transaction records are protected. If the account contains activity that is not eligible for removal, the operation is rejected without changing anything.")}</p>
            <form action={resetDemoHistory} className="admin-form">
              <label>{t("Account to reset")}<select name="account_id" required defaultValue=""><option value="" disabled>{t("Select an account")}</option>{rows.map((row)=><option key={row.account_id} value={row.account_id}>{row.account_number} · {row.account_name} · {money(Number(row.balance_minor), row.currency)}</option>)}</select></label>
              <label>{t("Confirm by entering the exact 10-digit account number")}<input name="confirm_account_number" inputMode="numeric" pattern="[0-9]{10}" minLength={10} maxLength={10} placeholder={t("Enter account number")} required/></label>
              <label>{t("Reason for reset")}<input name="reason" minLength={8} maxLength={240} placeholder={t("e.g. Rebuild account history")} required/></label>
              <button type="submit" className="admin-danger-button" disabled={!rows.length}>{t("Permanently clear eligible history")}</button>
              <small className="admin-danger-warning">{t("Irreversible. Only eligible generated transactions can be removed. The action is recorded in the administrator audit log.")}</small>
            </form>
          </article>

          <article className="admin-panel">
            <div className="admin-panel-heading"><div><span>{t("ACCOUNT CONTROLS")}</span><h2>{t("Freeze or block account")}</h2></div><ShieldCheck size={18}/></div>
            <p className="admin-help">{t("Frozen and blocked accounts cannot send or receive transfers through the current transfer engine.")}</p>
            <form action={setAccountStatus} className="admin-form">
              <label>{t("Customer account")}<select name="account_id" required defaultValue=""><option value="" disabled>{t("Select an account")}</option>{rows.map((row)=><option key={row.account_id} value={row.account_id}>{row.account_number} · {row.account_name} ({t(row.status)})</option>)}</select></label>
              <div className="admin-form-grid"><label>{t("New status")}<select name="status"><option value="active">{t("Active / unblock")}</option><option value="frozen">{t("Frozen")}</option><option value="blocked">{t("Blocked")}</option></select></label><label>{t("Reason")}<input name="reason" minLength={8} maxLength={240} placeholder={t("Reason for status change")} required/></label></div>
              <button type="submit" className="secondary" disabled={!rows.length}>{t("Update account status")}</button>
            </form>
          </article>
        </section>

      </section>
    </main>
  );
}
