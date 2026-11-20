"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";

type HistoryTransaction = {
  id: string;
  reference: string;
  transaction_type: string;
  status: string;
  description: string | null;
  created_at: string;
  synthetic_demo: boolean;
  review_required: boolean;
  amount_minor: number;
  currency: string;
};

function money(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2 }).format(Math.abs(amountMinor) / 100);
}

function dateParts(value: string) {
  const date = new Date(value);
  return {
    year: String(date.getFullYear()),
    month: String(date.getMonth() + 1).padStart(2, "0"),
    day: date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }),
    monthLabel: date.toLocaleDateString("en-US", { month: "long" }),
  };
}

export default function TransactionHistory({ transactions }: { transactions: HistoryTransaction[] }) {
  const [year, setYear] = useState<string | null>(null);
  const [month, setMonth] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);

  const years = useMemo(() => [...new Set(transactions.map((item) => dateParts(item.created_at).year))].sort((a, b) => Number(b) - Number(a)), [transactions]);
  const months = useMemo(() => {
    if (!year) return [];
    const values = new Map<string, string>();
    transactions.forEach((item) => {
      const parts = dateParts(item.created_at);
      if (parts.year === year) values.set(parts.month, parts.monthLabel);
    });
    return [...values.entries()].sort(([a], [b]) => Number(a) - Number(b));
  }, [transactions, year]);
  const days = useMemo(() => {
    if (!year || !month) return [];
    const values = new Map<string, string>();
    transactions.forEach((item) => {
      const parts = dateParts(item.created_at);
      if (parts.year === year && parts.month === month) values.set(parts.day, parts.day);
    });
    return [...values.keys()].sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  }, [transactions, year, month]);

  const visible = useMemo(() => transactions.filter((item) => {
    const parts = dateParts(item.created_at);
    return (!year || parts.year === year) && (!month || parts.month === month) && (!day || parts.day === day);
  }), [transactions, year, month, day]);

  function chooseYear(value: string) {
    setYear(value);
    setMonth(null);
    setDay(null);
  }
  function chooseMonth(value: string) {
    setMonth(value);
    setDay(null);
  }

  return (
    <>
      <div className="history-filter-panel">
        <div className="history-filter-heading">
          <div><span className="workspace-kicker">FIND ACTIVITY</span><strong>Browse by date</strong></div>
          <button type="button" className={!year ? "history-reset active" : "history-reset"} onClick={() => { setYear(null); setMonth(null); setDay(null); }}>All history</button>
        </div>
        <div className="history-filter-label">YEAR</div>
        <div className="history-filter-options">
          {years.map((value) => <button type="button" key={value} className={year === value ? "history-filter-chip selected" : "history-filter-chip"} onClick={() => chooseYear(value)}>{value}</button>)}
        </div>
        {year && <>
          <div className="history-filter-label">MONTH</div>
          <div className="history-filter-options">
            {months.map(([value, label]) => <button type="button" key={value} className={month === value ? "history-filter-chip selected" : "history-filter-chip"} onClick={() => chooseMonth(value)}>{label}</button>)}
          </div>
        </>}
        {year && month && <>
          <div className="history-filter-label">DAY</div>
          <div className="history-filter-options">
            {days.map((value) => <button type="button" key={value} className={day === value ? "history-filter-chip selected" : "history-filter-chip"} onClick={() => setDay(day === value ? null : value)}>{value}</button>)}
          </div>
        </>}
        <div className="history-filter-summary">{year ? [year, month ? months.find(([value]) => value === month)?.[1] : null, day].filter(Boolean).join(" · ") : "Showing every recorded year"} <span>{visible.length} {visible.length === 1 ? "transaction" : "transactions"}</span></div>
      </div>

      {visible.length === 0 ? <div className="workspace-empty"><p>No transactions were recorded for this date.</p></div> :
        <div className="transaction-list">
          {visible.map((transaction) => {
            const incoming = transaction.amount_minor > 0;
            return <Link href={`/dashboard/transactions/${transaction.id}`} className="transaction-row transaction-row-link" key={transaction.id}>
              <span className={incoming ? "transaction-icon incoming" : "transaction-icon"}>{incoming ? <ArrowDownLeft size={18}/> : <ArrowUpRight size={18}/>}</span>
              <div className="transaction-description"><strong>{transaction.description || transaction.transaction_type.replaceAll("_", " ")}</strong><span>{new Date(transaction.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} · {transaction.reference}{transaction.synthetic_demo ? " · Synthetic demo activity" : ""}</span></div>
              <div className="transaction-amount"><strong className={incoming ? "positive" : ""}>{incoming ? "+" : "−"}{money(transaction.amount_minor, transaction.currency)}</strong><span className={"transaction-status " + (transaction.review_required ? "review" : transaction.status)}>{transaction.review_required ? "Under review" : transaction.status}</span></div>
            </Link>;
          })}
        </div>}
    </>
  );
}
