import Link from "next/link";
import { cookies } from "next/headers";
import type { SupportedLocale } from "@/lib/locale";
import { pageText } from "@/lib/page-translations";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, Clock3, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import PrintButton from "../../print-button";
import { CopyButton } from "../../copy-button";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

function money(amountMinor: number, currency = "USD", locale: SupportedLocale = "en") {
  return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 2 }).format(Math.abs(amountMinor) / 100);
}

export default async function TransactionReceiptPage({ params }: Props) {
  const locale = ((await cookies()).get("nexora_locale")?.value || "en") as SupportedLocale;
  const t = (value: string) => pageText(locale, value);
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
  const metadata = transaction.metadata as { review_required?: boolean; source_account?: string; destination_account_number?: string; scheduled_execution?: boolean; amount_minor?: number } | null;
  const total = Number(metadata?.amount_minor ?? Math.max(...entries.map((entry) => Math.abs(Number(entry.amount_minor)))));
  const incoming = entries.some(entry => Number(entry.amount_minor) > 0);
  const review = metadata?.review_required === true;
  const statusLabel = review ? "Under review" : transaction.status.replaceAll("_", " ");

  return <main className="workspace-shell receipt-shell">
    <header className="workspace-header no-print"><Link href="/dashboard/transactions" className="workspace-back"><ArrowLeft size={16}/> {t("Transactions")}</Link><span className="workspace-overline">{t("NEXORA BANK · TRANSACTION RECORD")}</span></header>
    <section className="workspace-intro no-print"><div><span className="workspace-kicker">{t("TRANSACTION DETAILS")}</span><h1>{t("Transaction record")}</h1><p>{t("Review the details recorded for this account activity.")}</p></div><PrintButton label="Download receipt"/></section>
    <article className="workspace-panel receipt-card">
      <div className="receipt-status"><span className={review ? "receipt-status-icon pending" : "receipt-status-icon"}>{review ? <Clock3 size={22}/> : <CheckCircle2 size={22}/>}</span><strong>{statusLabel}</strong><small>{transaction.posted_at ? "Posted " + new Date(transaction.posted_at).toLocaleString(locale) : "Recorded " + new Date(transaction.created_at).toLocaleString(locale)}</small></div>
      <div className="receipt-amount"><span>{transaction.description || transaction.transaction_type.replaceAll("_", " ")}</span><strong>{incoming ? "+" : ""}{money(total, entries[0].currency, locale)}</strong></div>
      <div className="receipt-details">
        <div><span>{t("REFERENCE NUMBER")}</span><strong>{transaction.reference}</strong><CopyButton value={transaction.reference}/></div>
        <div><span>{t("TRANSACTION TYPE")}</span><strong>{transaction.transaction_type.replaceAll("_", " ")}</strong></div>
        <div><span>{t("DATE & TIME")}</span><strong>{new Date(transaction.created_at).toLocaleString(locale)}</strong></div>
        <div><span>{t("STATUS")}</span><strong className="receipt-capitalize">{statusLabel}</strong></div>
        {metadata?.source_account && <div><span>{t("FROM ACCOUNT")}</span><strong>•••• {metadata.source_account.slice(-4)}</strong></div>}
        {metadata?.destination_account_number && <div><span>{t("TO ACCOUNT")}</span><strong>•••• {metadata.destination_account_number.slice(-4)}</strong></div>}
        {metadata?.scheduled_execution && <div><span>{t("PAYMENT METHOD")}</span><strong>{t("Scheduled transfer")}</strong></div>}
        <div><span>{t("POSTING TIME")}</span><strong>{transaction.posted_at ? new Date(transaction.posted_at).toLocaleString(locale) : "Awaiting approval"}</strong></div>

      </div>
      <div className="receipt-ledger"><div className="receipt-ledger-heading"><FileText size={15}/> {t("ACCOUNT ENTRIES")}</div>{entries.map((entry,index)=>{const account=accountById.get(entry.account_id);const amount=Number(entry.amount_minor);return <div className="receipt-ledger-row" key={index}><div><strong>{account?.account_name ?? "Account"}</strong><span>Account ending {account?.account_number?.slice(-4) ?? "••••"}</span></div><strong className={amount>0?"positive":""}>{amount>0?"+":"−"}{money(amount,entry.currency,locale)}</strong></div>})}</div>
      <p className="receipt-footnote">{t("This receipt records activity in Nexora internal ledger. A pending or under-review transaction has not changed the account balance.")}</p>
    </article>
  </main>;
}
