import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, Clock3, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

function money(amountMinor: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2 }).format(Math.abs(amountMinor) / 100);
}

export default async function TransactionReceiptPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: accounts } = await supabase.from("bank_accounts")
    .select("id,account_number,account_name").eq("user_id", user.id);
  const accountIds = (accounts ?? []).map(account => account.id);
  if (!accountIds.length) notFound();

  const { data: entries } = await supabase.from("ledger_entries")
    .select("account_id,amount_minor,currency,created_at")
    .eq("transaction_id", id).in("account_id", accountIds);
  if (!entries?.length) notFound();

  const { data: transaction } = await supabase.from("ledger_transactions")
    .select("id,reference,transaction_type,status,description,created_at,posted_at,metadata")
    .eq("id", id).maybeSingle();
  if (!transaction) notFound();

  const accountById = new Map((accounts ?? []).map(account => [account.id, account]));
  const total = entries.reduce((sum, entry) => sum + Number(entry.amount_minor), 0);
  const incoming = entries.some(entry => Number(entry.amount_minor) > 0);
  const metadata = transaction.metadata as { review_required?: boolean; synthetic_demo?: boolean } | null;
  const review = metadata?.review_required === true;
  const statusLabel = review ? "Under review" : transaction.status.replaceAll("_", " ");

  return <main className="workspace-shell receipt-shell">
    <header className="workspace-header"><Link href="/dashboard/transactions" className="workspace-back"><ArrowLeft size={16}/> Transactions</Link><span className="workspace-overline">NEXORA BANK · TRANSACTION RECORD</span></header>
    <section className="workspace-intro"><div><span className="workspace-kicker">TRANSACTION DETAILS</span><h1>Transaction record</h1><p>Review the details recorded for this account activity.</p></div></section>
    <article className="workspace-panel receipt-card">
      <div className="receipt-status"><span className={review ? "receipt-status-icon pending" : "receipt-status-icon"}>{review ? <Clock3 size={22}/> : <CheckCircle2 size={22}/>}</span><strong>{statusLabel}</strong><small>{transaction.posted_at ? "Posted " + new Date(transaction.posted_at).toLocaleString("en-US") : "Recorded " + new Date(transaction.created_at).toLocaleString("en-US")}</small></div>
      <div className="receipt-amount"><span>{transaction.description || transaction.transaction_type.replaceAll("_", " ")}</span><strong>{incoming ? "+" : ""}{money(total, entries[0].currency)}</strong></div>
      <div className="receipt-details">
        <div><span>REFERENCE NUMBER</span><strong>{transaction.reference}</strong></div>
        <div><span>TRANSACTION TYPE</span><strong>{transaction.transaction_type.replaceAll("_", " ")}</strong></div>
        <div><span>DATE & TIME</span><strong>{new Date(transaction.created_at).toLocaleString("en-US")}</strong></div>
        <div><span>STATUS</span><strong className="receipt-capitalize">{statusLabel}</strong></div>

      </div>
      <div className="receipt-ledger"><div className="receipt-ledger-heading"><FileText size={15}/> ACCOUNT ENTRIES</div>{entries.map((entry,index)=>{const account=accountById.get(entry.account_id);const amount=Number(entry.amount_minor);return <div className="receipt-ledger-row" key={index}><div><strong>{account?.account_name ?? "Account"}</strong><span>Account ending {account?.account_number?.slice(-4) ?? "••••"}</span></div><strong className={amount>0?"positive":""}>{amount>0?"+":"−"}{money(amount,entry.currency)}</strong></div>})}</div>

    </article>
  </main>;
}
