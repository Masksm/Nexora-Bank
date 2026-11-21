import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowDownLeft, ArrowUpRight, ChartNoAxesCombined } from "lucide-react";
import type { SupportedLocale } from "@/lib/locale";
import { pageText } from "@/lib/page-translations";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function money(minor: number, locale: SupportedLocale) {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(minor / 100);
}
function category(type: string, description: string | null) {
  const value = (type + " " + (description || "")).toLowerCase();
  if (value.includes("bill") || value.includes("electric") || value.includes("utility")) return "Bills & utilities";
  if (value.includes("card")) return "Card spending";
  if (value.includes("fee") || value.includes("charge")) return "Fees";
  if (value.includes("transfer")) return "Transfers";
  if (value.includes("deposit") || value.includes("credit")) return "Deposits";
  return "Other activity";
}

export default async function AnalyticsPage() {
  const locale = ((await cookies()).get("nexora_locale")?.value || "en") as SupportedLocale;
  const t = (value: string) => pageText(locale, value);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: accounts, error: accountError } = await supabase.from("bank_accounts").select("id").eq("user_id", user.id);
  const accountIds = (accounts ?? []).map((a) => a.id);
  const entries: Array<{ transaction_id: string; account_id: string; amount_minor: number; created_at: string }> = [];
  let failed = Boolean(accountError);
  if (accountIds.length && !failed) {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from("ledger_entries").select("transaction_id,account_id,amount_minor,created_at")
        .in("account_id", accountIds).order("created_at", { ascending: false }).range(offset, offset + 999);
      if (error) { failed = true; break; }
      entries.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
  }
  const ids = [...new Set(entries.map((e) => e.transaction_id))];
  const transactions: Array<{ id: string; transaction_type: string; status: string; description: string | null; created_at: string }> = [];
  for (let offset = 0; offset < ids.length && !failed; offset += 300) {
    const { data, error } = await supabase.from("ledger_transactions").select("id,transaction_type,status,description,created_at").in("id", ids.slice(offset, offset + 300));
    if (error) { failed = true; break; }
    transactions.push(...(data ?? []));
  }
  const tx = new Map(transactions.map((item) => [item.id, item]));
  const posted = entries.filter((entry) => tx.get(entry.transaction_id)?.status === "posted");
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
  const monthEntries = posted.filter((e) => new Date(e.created_at) >= monthStart);
  const income = monthEntries.reduce((sum,e) => sum + Math.max(0,Number(e.amount_minor)),0);
  const spending = monthEntries.reduce((sum,e) => sum + Math.max(0,-Number(e.amount_minor)),0);
  const categories = new Map<string, number>();
  for (const entry of posted) {
    if (Number(entry.amount_minor) >= 0) continue;
    const transaction = tx.get(entry.transaction_id);
    const name = category(transaction?.transaction_type || "", transaction?.description || null);
    categories.set(name, (categories.get(name) || 0) + Math.abs(Number(entry.amount_minor)));
  }
  const sortedCategories = [...categories.entries()].sort((a,b) => b[1]-a[1]).slice(0,6);
  const maxCategory = Math.max(1,...sortedCategories.map(([,value])=>value));
  const months = Array.from({length:6},(_,index)=>{const date=new Date();date.setDate(1);date.setMonth(date.getMonth()-(5-index));return {key:date.getFullYear()+"-"+date.getMonth(),label:date.toLocaleDateString(locale,{month:"short"}),start:new Date(date.getFullYear(),date.getMonth(),1),end:new Date(date.getFullYear(),date.getMonth()+1,1)};});
  const trend = months.map((month)=>{const rows=posted.filter((e)=>{const d=new Date(e.created_at);return d>=month.start&&d<month.end;});return {...month,in:rows.reduce((s,e)=>s+Math.max(0,Number(e.amount_minor)),0),out:rows.reduce((s,e)=>s+Math.max(0,-Number(e.amount_minor)),0)};});
  const maxTrend = Math.max(1,...trend.flatMap((m)=>[m.in,m.out]));
  return <main className="workspace-shell">
    <header className="workspace-header"><Link href="/dashboard" className="workspace-back"><ArrowLeft size={16}/> {t("Overview")}</Link><span className="workspace-overline">NEXORA BANK · INSIGHTS</span></header>
    <section className="workspace-intro"><div><span className="workspace-kicker">YOUR MONEY, AT A GLANCE</span><h1>Spending analytics</h1><p>Understand how money moves across your accounts.</p></div><Link href="/dashboard/statements" className="workspace-download">View statements</Link></section>
    {failed ? <div className="workspace-alert">We couldn’t load complete account activity. Refresh and try again.</div> : <>
      <section className="analytics-summary">
        <article className="analytics-stat"><span>This month · Money in</span><strong>{money(income,locale)}</strong><small><ArrowDownLeft size={14}/> Posted credits</small></article>
        <article className="analytics-stat"><span>This month · Money out</span><strong>{money(spending,locale)}</strong><small><ArrowUpRight size={14}/> Posted debits</small></article>
        <article className="analytics-stat"><span>This month · Net movement</span><strong className={income-spending>=0?"positive":""}>{money(income-spending,locale)}</strong><small>Credits less debits</small></article>
      </section>
      <section className="analytics-grid">
        <article className="workspace-panel analytics-panel"><div className="workspace-panel-heading"><div><span className="workspace-kicker">SIX-MONTH VIEW</span><h2>Income and spending</h2></div></div>
          <div className="trend-chart">{trend.map((m)=><div className="trend-column" key={m.key}><div className="trend-bars"><span className="trend-in" style={{height:Math.max(2,m.in/maxTrend*100)+"%"}}/><span className="trend-out" style={{height:Math.max(2,m.out/maxTrend*100)+"%"}}/></div><small>{m.label}</small></div>)}</div>
          <div className="analytics-legend"><span><i className="legend-in"/> Money in</span><span><i className="legend-out"/> Money out</span></div>
        </article>
        <article className="workspace-panel analytics-panel"><div className="workspace-panel-heading"><div><span className="workspace-kicker">POSTED DEBITS</span><h2>Spending categories</h2></div></div>
          {sortedCategories.length ? <div className="category-list">{sortedCategories.map(([name,value])=><div className="category-row" key={name}><div><strong>{name}</strong><b>{money(value,locale)}</b></div><span className="category-track"><i style={{width:(value/maxCategory*100)+"%"}}/></span></div>)}</div> : <div className="workspace-empty"><ChartNoAxesCombined size={24}/><p>Spending categories will appear after posted debits are recorded.</p></div>}
        </article>
      </section>
    </>}
    <p className="workspace-disclaimer">Analytics are calculated from posted internal ledger entries. Pending and rejected transfers are excluded. Categories are estimated from transaction descriptions and types.</p>
  </main>;
}
