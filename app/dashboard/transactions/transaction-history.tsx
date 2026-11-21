"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import type { SupportedLocale } from "@/lib/locale";
import { pageText } from "@/lib/page-translations";

type HistoryTransaction = {
  id: string;
  reference: string;
  {t("transaction")}_type: string;
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

function dateParts(value: string, locale: SupportedLocale) {
  const date = new Date(value);
  return {
    year: String(date.getFullYear()),
    month: String(date.getMonth() + 1).padStart(2, "0"),
    day: String(date.getDate()).padStart(2, "0"),
    monthLabel: date.toLocaleDateString(locale, { month: "long" }),
    dayLabel: date.toLocaleDateString(locale, { weekday: "short", day: "numeric" }),
  };
}

export default function TransactionHistory({ {t("transaction")}s, locale }: { {t("transaction")}s: HistoryTransaction[]; locale: SupportedLocale }) {\n  const t = (value: string) => pageText(locale, value);
  const latestDate = useMemo(() => {
    if (!{t("transaction")}s.length) return null;
    return dateParts({t("transaction")}s.reduce((latest, item) =>
      new Date(item.created_at).getTime() > new Date(latest.created_at).getTime() ? item : latest
    ).created_at);
  }, [{t("transaction")}s, locale]);

  const [year, setYear] = useState<string | null>(() => latestDate?.year ?? null);
  const [month, setMonth] = useState<string | null>(() => latestDate?.month ?? null);
  const [day, setDay] = useState<string | null>(() => latestDate?.day ?? null);

  const years = useMemo(() => [...new Set({t("transaction")}s.map((item) => dateParts(item.created_at, locale).year))]
    .sort((a, b) => Number(b) - Number(a)), [{t("transaction")}s, locale]);

  const months = useMemo(() => {
    if (!year) return [];
    const values = new Map<string, string>();
    {t("transaction")}s.forEach((item) => {
      const parts = dateParts(item.created_at, locale);
      if (parts.year === year) values.set(parts.month, parts.monthLabel);
    });
    return [...values.entries()].sort(([a], [b]) => Number(a) - Number(b));
  }, [{t("transaction")}s, year, locale]);

  const days = useMemo(() => {
    if (!year || !month) return [];
    const values = new Map<string, string>();
    {t("transaction")}s.forEach((item) => {
      const parts = dateParts(item.created_at, locale);
      if (parts.year === year && parts.month === month) values.set(parts.day, parts.dayLabel);
    });
    return [...values.entries()].sort(([a], [b]) => Number(b) - Number(a));
  }, [{t("transaction")}s, year, month, locale]);

  const visible = useMemo(() => {t("transaction")}s.filter((item) => {
    const parts = dateParts(item.created_at, locale);
    return (!year || parts.year === year) &&
      (!month || parts.month === month) &&
      (!day || parts.day === day);
  }), [{t("transaction")}s, year, month, day, locale]);

  function chooseYear(value: string) {
    if (!value) {
      setYear(null);
      setMonth(null);
      setDay(null);
      return;
    }
    const newestMonth = {t("transaction")}s
      .filter((item) => dateParts(item.created_at, locale).year === value)
      .map((item) => dateParts(item.created_at, locale).month)
      .sort((a, b) => Number(b) - Number(a))[0] ?? null;
    const newestDay = newestMonth ? {t("transaction")}s
      .filter((item) => {
        const parts = dateParts(item.created_at, locale);
        return parts.year === value && parts.month === newestMonth;
      })
      .map((item) => dateParts(item.created_at, locale).day)
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
    const newestDay = {t("transaction")}s
      .filter((item) => {
        const parts = dateParts(item.created_at, locale);
        return parts.year === year && parts.month === value;
      })
      .map((item) => dateParts(item.created_at, locale).day)
      .sort((a, b) => Number(b) - Number(a))[0] ?? null;
    setMonth(value);
    setDay(newestDay);
  }

  return (
    <>
      <div className="history-filter-panel">
        <div className="history-filter-heading">
          <div><span className="workspace-kicker">{t("FIND ACTIVITY")}</span><strong>{t("Browse by date")}</strong></div>
          <button type="button" className={!year ? "history-reset active" : "history-reset"} onClick={() => { setYear(null); setMonth(null); setDay(null); }}>{t("All history")}</button>
        </div>
        <div className="history-date-selectors">
          <label className="history-date-field">
            <span>{t("YEAR")}</span>
            <select value={year ?? ""} onChange={(event) => chooseYear(event.target.value)}>
              <option value="">{t("All years")}</option>
              {years.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="history-date-field">
            <span>{t("MONTH")}</span>
            <select value={month ?? ""} disabled={!year} onChange={(event) => chooseMonth(event.target.value)}>
              <option value="">{t("All months")}</option>
              {months.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="history-date-field">
            <span>{t("DAY")}</span>
            <select value={day ?? ""} disabled={!year || !month} onChange={(event) => setDay(event.target.value || null)}>
              <option value="">{t("All days")}</option>
              {days.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
        <div className="history-filter-summary">
          {year ? [year, month ? months.find(([value]) => value === month)?.[1] : null, day ? days.find(([value]) => value === day)?.[1] : null].filter(Boolean).join(" · ") : "{t("Showing every recorded date")}"}
          <span>{visible.length} {visible.length === 1 ? "{t("transaction")}" : "{t("transaction")}s"}</span>
        </div>
      </div>

      {visible.length === 0 ? <div className="workspace-empty"><p>No {t("transaction")}s were recorded for this date.</p></div> :
        <div className="{t("transaction")}-list">
          {visible.map(({t("transaction")}) => {
            const incoming = {t("transaction")}.amount_minor > 0;
            return <Link href={`/dashboard/{t("transaction")}s/${{t("transaction")}.id}`} className="{t("transaction")}-row {t("transaction")}-row-link" key={{t("transaction")}.id}>
              <span className={incoming ? "{t("transaction")}-icon incoming" : "{t("transaction")}-icon"}>{incoming ? <ArrowDownLeft size={18}/> : <ArrowUpRight size={18}/>}</span>
              <div className="{t("transaction")}-description"><strong>{{t("transaction")}.description || {t("transaction")}.{t("transaction")}_type.replaceAll("_", " ")}</strong><span>{new Date({t("transaction")}.created_at).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })} · {{t("transaction")}.reference}</span></div>
              <div className="{t("transaction")}-amount"><strong className={incoming ? "positive" : ""}>{incoming ? "+" : "−"}{money({t("transaction")}.amount_minor, {t("transaction")}.currency)}</strong><span className={"{t("transaction")}-status " + ({t("transaction")}.review_required ? "review" : {t("transaction")}.status)}>{{t("transaction")}.review_required ? "{t("Under review")}" : {t("transaction")}.status}</span></div>
            </Link>;
          })}
        </div>}
    </>
  );
}
