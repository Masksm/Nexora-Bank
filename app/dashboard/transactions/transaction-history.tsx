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
    day: String(date.getDate()).padStart(2, "0"),
    monthLabel: date.toLocaleDateString("en-US", { month: "long" }),
    dayLabel: date.toLocaleDateString("en-US", { weekday: "short", day: "numeric" }),
  };
}

export default function TransactionHistory({ transactions }: { transactions: HistoryTransaction[] }) {
  const latestDate = useMemo(() => {
    if (!transactions.length) return null;
    return dateParts(transactions.reduce((latest, item) =>
      new Date(item.created_at).getTime() > new Date(latest.created_at).getTime() ? item : latest
    ).created_at);
  }, [transactions]);

  const [year, setYear] = useState<string | null>(() => latestDate?.year ?? null);
  const [month, setMonth] = useState<string | null>(() => latestDate?.month ?? null);
  const [day, setDay] = useState<string | null>(() => latestDate?.day ?? null);

  const years = useMemo(() => [...new Set(transactions.map((item) => dateParts(item.created_at).year))]
    .sort((a, b) => Number(b) - Number(a)), [transactions]);

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
      if (parts.year === year && parts.month === month) values.set(parts.day, parts.dayLabel);
    });
    return [...values.entries()].sort(([a], [b]) => Number(b) - Number(a));
  }, [transactions, year, month]);

  const visible = useMemo(() => transactions.filter((item) => {
    const parts = dateParts(item.created_at);
    return (!year || parts.year === year) &&
      (!month || parts.month === month) &&
      (!day || parts.day === day);
  }), [transactions, year, month, day]);

  function chooseYear(value: string) {
    if (!value) {
      setYear(null);
      setMonth(null);
      setDay(null);
      return;
    }
    const newestMonth = transactions
      .filter((item) => dateParts(item.created_at).year === value)
      .map((item) => dateParts(item.created_at).month)
      .sort((a, b) => Number(b) - Number(a))[0] ?? null;
    const newestDay = newestMonth ? transactions
      .filter((item) => {
        const parts = dateParts(item.created_at);
        return parts.year === value && parts.month === newestMonth;
      })
      .map((item) => dateParts(item.created_at).day)
      .sort((a, b) => Number(b) - Number(a))[0] ?? null : null;
    setYear(value);
    setMonth(newestMonth);
    setDay(newestDay);
  }

  function chooseMonth(value: string) {
    if (!value || !year) {
      setMonth(null);
      setDay(null);
      return;
    }
    const newestDay = transactions
      .filter((item) => {
        const parts = dateParts(item.created_at);
        return parts.year === year && parts.month === value;
      })
      .map((item) => dateParts(item.created_at).day)
      .sort((a, b) => Number(b) - Number(a))[0] ?? null;
    setMonth(value);
    setDay(newestDay);
  }

  return (
    <>
      <div className="history-filter-panel">
        <div className="history-filter-heading">
          <div><span className="workspace-kicker">FIND ACTIVITY</span><strong>Browse by date</strong></div>
          <button type="button" className={!year ? "history-reset active" : "history-reset"} onClick={() => { setYear(null); setMonth(null); setDay(null); }}>All history</button>
        </div>
        <div className="history-date-selectors">
          <label className="history-date-field">
            <span>YEAR</span>
            <select value={year ?? ""} onChange={(event) => chooseYear(event.target.value)}>
              <option value="">All years</option>
              {years.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="history-date-field">
            <span>MONTH</span>
            <select value={month ?? ""} disabled={!year} onChange={(event) => chooseMonth(event.target.value)}>
              <option value="">All months</option>
              {months.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="history-date-field">
            <span>DAY</span>
            <select value={day ?? ""} disabled={!year || !month} onChange={(event) => setDay(event.target.value || null)}>
              <option value="">All days</option>
              {days.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
        <div className="history-filter-summary">
          {year ? [year, month ? months.find(([value]) => value === month)?.[1] : null, day ? days.find(([value]) => value === day)?.[1] : null].filter(Boolean).join(" · ") : "Showing every recorded date"}
          <span>{visible.length} {visible.length === 1 ? "transaction" : "transactions"}</span>
        </div>
      </div>

      {visible.length === 0 ? <div className="workspace-empty"><p>No transactions were recorded for this date.</p></div> :
        <div className="transaction-list">
          {visible.map((transaction) => {
            const incoming = transaction.amount_minor > 0;
            return <Link href={`/dashboard/transactions/${transaction.id}`} className="transaction-row transaction-row-link" key={transaction.id}>
              <span className={incoming ? "transaction-icon incoming" : "transaction-icon"}>{incoming ? <ArrowDownLeft size={18}/> : <ArrowUpRight size={18}/>}</span>
              <div className="transaction-description"><strong>{transaction.description || transaction.transaction_type.replaceAll("_", " ")}</strong><span>{new Date(transaction.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} · {transaction.reference}</span></div>
              <div className="transaction-amount"><strong className={incoming ? "positive" : ""}>{incoming ? "+" : "−"}{money(transaction.amount_minor, transaction.currency)}</strong><span className={"transaction-status " + (transaction.review_required ? "review" : transaction.status)}>{transaction.review_required ? "Under review" : transaction.status}</span></div>
            </Link>;
          })}
        </div>}
    </>
  );
}
