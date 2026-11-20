import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Download, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import TransactionHistory from "./transaction-history";

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: accounts, error: accountError } = await supabase
    .from("bank_accounts").select("id,account_number").eq("user_id", user.id);
  const accountIds = (accounts ?? []).map((account) => account.id);

  // Read the ledger in pages. Supabase's default response cap must never silently
  // turn a customer's older history into missing records.
  const allEntries: Array<{ transaction_id: string; account_id: string; amount_minor: number; currency: string; created_at: string }> = [];
  let entriesError: unknown = accountError;
  if (!accountError && accountIds.length) {
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase.from("ledger_entries")
        .select("transaction_id,account_id,amount_minor,currency,created_at")
        .in("account_id", accountIds)
        .order("created_at", { ascending: false })
        .order("transaction_id", { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (error) { entriesError = error; break; }
      allEntries.push(...(data ?? []));
      if (!data || data.length < pageSize) break;
    }
  }

  const transactionIds = [...new Set(allEntries.map((entry) => entry.transaction_id))];
  const allTransactions: Array<{
    id: string; reference: string; transaction_type: string; status: string;
    description: string | null; created_at: string; metadata: { review_required?: boolean } | null;
  }> = [];
  let transactionsError: unknown = null;
  // Chunk .in() requests to avoid oversized PostgREST URLs for long histories.
  for (let offset = 0; offset < transactionIds.length; offset += 300) {
    const batch = transactionIds.slice(offset, offset + 300);
    const { data, error } = await supabase.from("ledger_transactions")
      .select("id,reference,transaction_type,status,description,created_at,metadata")
      .in("id", batch);
    if (error) { transactionsError = error; break; }
    allTransactions.push(...(data ?? []));
  }

  const entryByTransaction = new Map<string, { amount_minor: number; currency: string }>();
  for (const entry of allEntries) {
    const current = entryByTransaction.get(entry.transaction_id);
    if (!current || Math.abs(Number(entry.amount_minor)) > Math.abs(current.amount_minor)) {
      entryByTransaction.set(entry.transaction_id, { amount_minor: Number(entry.amount_minor), currency: entry.currency });
    }
  }

  const failed = Boolean(entriesError || transactionsError);
  const history = allTransactions
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .map((transaction) => {
      const entry = entryByTransaction.get(transaction.id);
      return {
        id: transaction.id,
        reference: transaction.reference,
        transaction_type: transaction.transaction_type,
        status: transaction.status,
        description: transaction.description,
        created_at: transaction.created_at,
            review_required: transaction.metadata?.review_required === true,
        amount_minor: entry?.amount_minor ?? 0,
        currency: entry?.currency ?? "USD",
      };
    });

  return (
    <main className="workspace-shell">
      <header className="workspace-header"><Link href="/dashboard" className="workspace-back"><ArrowLeft size={16}/> Overview</Link><span className="workspace-overline">NEXORA BANK · PERSONAL</span></header>
      <section className="workspace-intro"><div><span className="workspace-kicker">A CLEAR RECORD</span><h1>Transactions</h1><p>Review all activity recorded against your accounts.</p></div></section>
      <section className="workspace-panel">
        <div className="workspace-panel-heading"><div><span className="workspace-kicker">ACCOUNT ACTIVITY</span><h2>Transaction history</h2></div><div className="transaction-tools"><span className="workspace-count">{history.length} records</span><Link href="/dashboard/transactions/export" className="workspace-download"><Download size={14}/> Export CSV</Link></div></div>
        {failed ? <div className="workspace-alert">We couldn’t load the complete transaction history. Please refresh and try again.</div> :
          history.length === 0 ? <div className="workspace-empty"><FileText size={25}/><h2>No transactions yet</h2><p>Once a transaction is posted, it will appear here.</p></div> :
          <TransactionHistory transactions={history}/>}
      </section>
      <p className="workspace-disclaimer">This history reflects internal ledger activity only. It is not a bank statement or proof of real-world payment.</p>
    </main>
  );
}
