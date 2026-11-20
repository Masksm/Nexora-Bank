import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, ArrowUpFromLine, LogOut, RotateCcw, ShieldCheck, Users, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { adjustBalance, generateDemoHistory, resetDemoHistory, setAccountStatus } from "./actions";
import { signOut } from "@/app/auth/actions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ kind?: string; message?: string; q?: string }>;

function money(minor: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(minor / 100);
}

export default async function AdminPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const appMetadata = claimsData?.claims?.app_metadata as { role?: string } | undefined;
  if (!user || claimsError || appMetadata?.role !== "admin") redirect("/dashboard");

  const [{ data: accounts, error }, params] = await Promise.all([
    supabase.from("account_balances").select("account_id,user_id,account_number,account_name,account_type,currency,status,balance_minor").not("user_id", "is", null).order("account_number"),
    searchParams,
  ]);
  const rows = accounts ?? [];
  const search = (params.q || "").trim().toLowerCase();
  const displayedRows = search ? rows.filter((row) => row.account_number.toLowerCase().includes(search) || row.account_name.toLowerCase().includes(search) || row.user_id.toLowerCase().includes(search)) : rows;
  const totalMinor = rows.reduce((sum, row) => sum + Number(row.balance_minor || 0), 0);
  const activeCount = rows.filter((row) => row.status === "active").length;

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <Link className="admin-brand" href="/"><span>N</span>NEXORA <i>ADMIN</i></Link>
        <div className="admin-side-label">CONTROL CENTRE</div>
        <nav><Link className="selected" href="/admin"><Activity size={17}/> Overview</Link><a href="#customers"><Users size={17}/> Customers</a><a href="#ledger"><Wallet size={17}/> Ledger operations</a><Link href="/admin/reviews">Security reviews</Link><Link href="/admin/support">Support inbox</Link><Link href="/admin/audit">Audit log</Link></nav>
        <div className="admin-sidebar-foot"><ShieldCheck size={16}/><span>Administrator session</span><form action={signOut}><button className="admin-logout-button" type="submit"><LogOut size={15}/> Sign out</button></form></div>
      </aside>
      <section className="admin-main">
        <header className="admin-topbar"><div><span>ADMINISTRATION / OVERVIEW</span><h1>Control centre</h1></div></header>
        <div className="admin-welcome"><div><span>SECURE ADMINISTRATION</span><h2>Bank operations</h2><p>Manage customer accounts and internal demo-ledger activity.</p></div><div className="admin-identity"><ShieldCheck size={18}/><span>{user.email}<small>Administrator</small></span></div></div>
        {params.message && <div className={params.kind === "error" ? "admin-alert error" : "admin-alert success"}>{params.message}</div>}
        <section className="admin-stats">
          <article><span><Users size={17}/> CUSTOMER ACCOUNTS</span><strong>{rows.length}</strong><small>Accounts in the ledger</small></article>
          <article><span><Wallet size={17}/> AGGREGATE BALANCE</span><strong>{money(totalMinor)}</strong><small>Across listed USD accounts</small></article>
          <article><span><ShieldCheck size={17}/> ACTIVE ACCOUNTS</span><strong>{activeCount}</strong><small>Currently permitted status</small></article>
        </section>

        <section className="admin-panel" id="customers">
          <div className="admin-panel-heading"><div><span>CUSTOMER DIRECTORY</span><h2>Customer accounts</h2></div><span>{displayedRows.length} of {rows.length}</span></div>
          <form className="admin-search" action="/admin" method="get"><input name="q" defaultValue={params.q || ""} placeholder="Search account number, name or customer ID"/><button type="submit">Search</button></form>
          {error ? <p className="admin-empty">Could not load customer accounts. Check the administrator database policies.</p> : rows.length === 0 ? <p className="admin-empty">No customer accounts have been created yet.</p> :
            <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Account</th><th>Account number</th><th>Balance</th><th>Status</th><th>Customer ID</th></tr></thead><tbody>
              {displayedRows.map((row) => <tr key={row.account_id}><td><strong>{row.account_name}</strong><small>{row.account_type} · {row.currency}</small></td><td>{row.account_number}</td><td>{money(Number(row.balance_minor))}</td><td><span className={"admin-status " + row.status}>{row.status}</span></td><td><code>{row.user_id.slice(0, 8)}…</code></td></tr>)}
            </tbody></table></div>}
        </section>

        <section className="admin-operations" id="ledger">
          <article className="admin-panel">
            <div className="admin-panel-heading"><div><span>MANUAL LEDGER ENTRY</span><h2>Credit or debit account</h2></div><ArrowUpFromLine size={18}/></div>
            <p className="admin-help">Post one ordinary adjustment. It immediately changes the customer’s ledger balance and appears as a transaction.</p>
            <form action={adjustBalance} className="admin-form">
              <label>Customer account<select name="account_id" required defaultValue=""><option value="" disabled>Select an account</option>{rows.map((row)=><option key={row.account_id} value={row.account_id}>{row.account_number} · {row.account_name} · {money(Number(row.balance_minor))}</option>)}</select></label>
              <div className="admin-form-grid"><label>Operation<select name="direction" defaultValue="credit"><option value="credit">Credit / money in</option><option value="debit">Debit / money out</option></select></label><label>Amount (USD)<input name="amount" type="number" min="0.01" step="0.01" placeholder="2500.00" required/></label></div>
              <label>Source or reason<input name="reason" minLength={8} maxLength={240} placeholder="e.g. Demo funding allocation" required/></label>
              <button type="submit" disabled={!rows.length}>Post ledger adjustment</button>
            </form>
          </article>

          <article className="admin-panel">
            <div className="admin-panel-heading"><div><span>SYNTHETIC HISTORY BUILDER</span><h2>Generate demo activity</h2></div><Activity size={18}/></div>
            <p className="admin-help">Creates the selected number of clearly labelled historical transactions, including the opening balance. Credits and debits use independently randomized amounts and descriptions. Total incoming and outgoing activity is balanced, so the final balance remains exactly at the target.</p>
            <form action={generateDemoHistory} className="admin-form">
              <label>Empty customer account<select name="account_id" required defaultValue=""><option value="" disabled>Select an account</option>{rows.filter((row)=>Number(row.balance_minor)===0).map((row)=><option key={row.account_id} value={row.account_id}>{row.account_number} · {row.account_name}</option>)}</select></label>
              <label>Target opening and final balance (USD)<input name="target_amount" type="number" min="0.01" step="0.01" placeholder="100000000.00" required/></label>
              <div className="admin-form-grid"><label>History begins<select name="start_year" defaultValue="2019">{Array.from({length:new Date().getFullYear()-2019+1},(_,i)=>2019+i).map((year)=><option key={year} value={year}>{year}</option>)}</select></label><label>Total transactions<select name="transactions" defaultValue="100"><option value="50">50 transactions</option><option value="100">100 transactions</option><option value="150">150 transactions</option><option value="200">200 transactions</option><option value="250">250 transactions</option></select></label></div>
              <button type="submit" className="secondary" disabled={!rows.some((row)=>Number(row.balance_minor)===0)}>Generate synthetic history</button>
              <small className="admin-warning">This action requires an empty account. It cannot overwrite existing transactions. Synthetic activity is marked in ledger metadata and audit logs.</small>
            </form>
          </article>

          <article className="admin-panel">
            <div className="admin-panel-heading"><div><span>DEMO DATA MAINTENANCE</span><h2>Reset generated account history</h2></div><RotateCcw size={18}/></div>
            <p className="admin-help">Permanently removes the selected account’s generated synthetic transactions and restores its balance to zero. Real customer transactions are protected: if the account contains any non-demo activity, the reset is rejected without changing anything.</p>
            <form action={resetDemoHistory} className="admin-form">
              <label>Account to reset<select name="account_id" required defaultValue=""><option value="" disabled>Select an account</option>{rows.map((row)=><option key={row.account_id} value={row.account_id}>{row.account_number} · {row.account_name} · {money(Number(row.balance_minor))}</option>)}</select></label>
              <label>Confirm by entering the exact 10-digit account number<input name="confirm_account_number" inputMode="numeric" pattern="[0-9]{10}" minLength={10} maxLength={10} placeholder="Enter account number" required/></label>
              <label>Reason for reset<input name="reason" minLength={8} maxLength={240} placeholder="e.g. Rebuild synthetic demo history" required/></label>
              <button type="submit" className="admin-danger-button" disabled={!rows.length}>Permanently reset generated history</button>
              <small className="admin-danger-warning">Irreversible. Only transactions marked as synthetic demo history can be removed. The action is recorded in the administrator audit log.</small>
            </form>
          </article>

          <article className="admin-panel">
            <div className="admin-panel-heading"><div><span>ACCOUNT CONTROLS</span><h2>Freeze or block account</h2></div><ShieldCheck size={18}/></div>
            <p className="admin-help">Frozen and blocked accounts cannot send or receive transfers through the current transfer engine.</p>
            <form action={setAccountStatus} className="admin-form">
              <label>Customer account<select name="account_id" required defaultValue=""><option value="" disabled>Select an account</option>{rows.map((row)=><option key={row.account_id} value={row.account_id}>{row.account_number} · {row.account_name} ({row.status})</option>)}</select></label>
              <div className="admin-form-grid"><label>New status<select name="status"><option value="active">Active / unblock</option><option value="frozen">Frozen</option><option value="blocked">Blocked</option></select></label><label>Reason<input name="reason" minLength={8} maxLength={240} placeholder="Reason for status change" required/></label></div>
              <button type="submit" className="secondary" disabled={!rows.length}>Update account status</button>
            </form>
          </article>
        </section>
        <footer className="admin-disclaimer">Nexora is a portfolio simulation. All balances and generated transactions are synthetic internal ledger records, not real money or bank services.</footer>
      </section>
    </main>
  );
}
