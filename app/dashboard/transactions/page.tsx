import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function money(amountMinor: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2 }).format(Math.abs(amountMinor) / 100);
}

export default async function TransactionsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: accounts } = await supabase.from("bank_accounts").select("id,account_number").eq("user_id", user.id);
  const accountIds = (accounts ?? []).map((account) => account.id);
  const { data: entries, error: entriesError } = accountIds.length
    ? await supabase.from("ledger_entries").select("transaction_id,account_id,amount_minor,currency,created_at").in("account_id", accountIds).order("created_at", { ascending: false }).limit(100)
    : { data: [], error: null };
  const transactionIds = [...new Set((entries ?? []).map((entry) => entry.transaction_id))];
  const { data: transactions, error: transactionsError } = transactionIds.length
    ? await supabase.from("ledger_transactions").select("id,reference,transaction_type,status,description,created_at,posted_at").in("id", transactionIds).order("created_at", { ascending: false })
    : { data: [], error: null };

  const entryByTransaction = new Map<string, { amount_minor: number; currency: string }>();
  for (const entry of entries ?? []) {
    const current = entryByTransaction.get(entry.transaction_id);
    if (!current || Math.abs(Number(entry.amount_minor)) > Math.abs(current.amount_minor)) {
      entryByTransaction.set(entry.transaction_id, { amount_minor: Number(entry.amount_minor), currency: entry.currency });
    }
  }
  const failed = Boolean(entriesError || transactionsError);

  return (
    <main className="workspace-shell">
      <header className="workspace-header"><Link href="/dashboard" className="workspace-back"><ArrowLeft size={16}/> Overview</Link><span className="workspace-overline">NEXORA BANK · PERSONAL</span></header>
      <section className="workspace-intro"><div><span className="workspace-kicker">A CLEAR RECORD</span><h1>Transactions</h1><p>Review activity recorded against your accounts.</p></div></section>
      <section className="workspace-panel">
        <div className="workspace-panel-heading"><div><span className="workspace-kicker">ACCOUNT ACTIVITY</span><h2>Recent transactions</h2></div><span className="workspace-count">{transactions?.length ?? 0} records</span></div>
        {failed ? <div className="workspace-alert">We couldn’t load transaction activity. Please refresh and try again.</div> :
          (transactions ?? []).length === 0 ? <div className="workspace-empty"><FileText size={25}/><h2>No transactions yet</h2><p>Once a transaction is posted, it will appear here.</p></div> :
          <div className="transaction-list">
            {(transactions ?? []).map((transaction) => {
              const entry = entryByTransaction.get(transaction.id);
              const amount = entry?.amount_minor ?? 0;
              const incoming = amount > 0;
              return <article className="transaction-row" key={transaction.id}>
                <span className={incoming ? "transaction-icon incoming" : "transaction-icon"}>{incoming ? <ArrowDownLeft size={18}/> : <ArrowUpRight size={18}/>}</span>
                <div className="transaction-description"><strong>{transaction.description || transaction.transaction_type.replaceAll("_", " ")}</strong><span>{new Date(transaction.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} · {transaction.reference}</span></div>
                <div className="transaction-amount"><strong className={incoming ? "positive" : ""}>{incoming ? "+" : "−"}{money(amount, entry?.currency ?? "USD")}</strong><span className={"transaction-status " + transaction.status}>{transaction.status}</span></div>
              </article>;
            })}
          </div>}
      </section>
      <p className="workspace-disclaimer">This history reflects internal ledger activity only. It is not a bank statement or proof of real-world payment.</p>
    </main>
  );
}
