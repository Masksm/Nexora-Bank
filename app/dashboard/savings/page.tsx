import Link from "next/link";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowDownToLine, ArrowUpFromLine, PiggyBank, Plus, Target } from "lucide-react";
import type { SupportedLocale } from "@/lib/locale";
import { pageText } from "@/lib/page-translations";
import { createClient } from "@/lib/supabase/server";
import { createSavingsGoal, moveSavingsGoalFunds } from "./actions";

export const dynamic = "force-dynamic";
type Props = { searchParams: Promise<{ error?: string; success?: string }> };
function money(minor: number, locale: SupportedLocale = "en") {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(minor / 100);
}

export default async function SavingsPage({ searchParams }: Props) {
  const locale = ((await cookies()).get("nexora_locale")?.value || "en") as SupportedLocale;
  const t = (value: string) => pageText(locale, value);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [goalResult, entryResult, accountResult, params] = await Promise.all([
    supabase.from("savings_goals").select("id,name,target_minor,target_date,status,created_at").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("savings_goal_entries").select("id,goal_id,account_id,amount_minor,created_at").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("account_balances").select("account_id,account_name,nickname,account_number,currency,status,balance_minor").eq("user_id", user.id),
    searchParams,
  ]);
  const goals = goalResult.data ?? [];
  const entries = entryResult.data ?? [];
  const accounts = accountResult.data ?? [];
  const activeAccounts = accounts.filter((account) => account.status === "active");
  const entriesByGoal = new Map<string, typeof entries>();
  for (const entry of entries) {
    const current = entriesByGoal.get(entry.goal_id) ?? [];
    current.push(entry);
    entriesByGoal.set(entry.goal_id, current);
  }
  const totalSaved = goals.reduce((sum, goal) => sum + (entriesByGoal.get(goal.id) ?? []).reduce((n, entry) => n + Number(entry.amount_minor), 0), 0);
  const activeCount = goals.filter((goal) => goal.status === "active").length;

  return <main className="workspace-shell savings-shell">
    <header className="workspace-header"><Link href="/dashboard" className="workspace-back"><ArrowLeft size={16}/> {t("Overview")}</Link><span className="workspace-overline">NEXORA BANK · PERSONAL FINANCE</span></header>
    <section className="workspace-intro savings-intro"><div><span className="workspace-kicker">SAVE WITH PURPOSE</span><h1>Savings goals</h1><p>Give your plans a target, a timeline and a clear place to grow.</p></div><div className="workspace-total"><span>TOTAL SAVED IN GOALS</span><strong>{money(totalSaved, locale)}</strong></div></section>
    {params.error && <div className="workspace-alert">{params.error}</div>}
    {params.success && <div className="transfer-success">{params.success === "goal_created" ? "Your savings goal has been created." : params.success === "contribution" ? "Your contribution has been posted." : "Your withdrawal has been posted."}</div>}
    {(goalResult.error || entryResult.error || accountResult.error) && <div className="workspace-alert">Savings information could not be loaded completely. Refresh the page and try again.</div>}
    <section className="savings-overview-grid">
      <article className="savings-stat-card"><span><PiggyBank size={17}/> TOTAL SAVED</span><strong>{money(totalSaved, locale)}</strong><small>Across all your savings goals</small></article>
      <article className="savings-stat-card"><span><Target size={17}/> ACTIVE GOALS</span><strong>{activeCount}</strong><small>{goals.length} goals created</small></article>
      <article className="savings-stat-card"><span><ArrowDownToLine size={17}/> CONTRIBUTIONS</span><strong>{entries.filter((entry) => Number(entry.amount_minor) > 0).length}</strong><small>Successful contributions</small></article>
    </section>
    <section className="workspace-panel savings-create-panel">
      <div className="workspace-panel-heading"><div><span className="workspace-kicker">START SOMETHING</span><h2>Create a savings goal</h2></div><Plus size={18}/></div>
      <form action={createSavingsGoal} className="savings-create-form">
        <label>Goal name<input name="name" minLength={2} maxLength={60} placeholder="e.g. New laptop" required/></label>
        <label>Target amount (USD)<input name="target_amount" type="number" min="1" max="999999999" step="0.01" placeholder="2,500.00" required/></label>
        <label>Target date <span className="savings-optional">(optional)</span><input name="target_date" type="date" min={new Date().toISOString().slice(0,10)}/></label>
        <button type="submit">Create goal <Plus size={15}/></button>
      </form>
    </section>
    <section className="savings-goals-section">
      <div className="savings-section-heading"><div><span className="workspace-kicker">YOUR PLAN</span><h2>Your savings goals</h2></div><span className="workspace-count">{goals.length} goals</span></div>
      {goals.length === 0 ? <div className="workspace-empty"><PiggyBank size={27}/><h2>No savings goals yet</h2><p>Create a goal above and start setting money aside from an active account.</p></div> :
        <div className="savings-goals-grid">{goals.map((goal) => {
          const goalEntries = entriesByGoal.get(goal.id) ?? [];
          const balance = goalEntries.reduce((sum, entry) => sum + Number(entry.amount_minor), 0);
          const target = Number(goal.target_minor);
          const percent = Math.min(100, Math.max(0, Math.round((balance / target) * 100)));
          return <article className="savings-goal-card" key={goal.id}>
            <div className="savings-goal-top"><span className="savings-goal-icon"><Target size={19}/></span><span className={"savings-goal-status " + goal.status}>{goal.status}</span></div>
            <h3>{goal.name}</h3><div className="savings-goal-balance">{money(balance, locale)}<small> saved of {money(target, locale)}</small></div>
            <div className="savings-progress-track"><span style={{ width: percent + "%" }}/></div>
            <div className="savings-progress-meta"><strong>{percent}%</strong><span>{goal.target_date ? "Target " + new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(goal.target_date + "T00:00:00")) : "No target date"}</span></div>
            {goal.status === "active" && activeAccounts.length > 0 && <div className="savings-money-actions"><form action={moveSavingsGoalFunds}>
              <input type="hidden" name="goal_id" value={goal.id}/><input type="hidden" name="direction" value="contribution"/><input type="hidden" name="idempotency_key" value={randomUUID()}/>
              <label>Add money<input name="amount" type="number" min="0.01" max="999999999" step="0.01" placeholder="Amount" required/></label>
              <label>From account<select name="account_id" required>{activeAccounts.map((account) => <option key={account.account_id} value={account.account_id}>{account.nickname || account.account_name} · ••••{account.account_number.slice(-4)}</option>)}</select></label>
              <button type="submit"><ArrowDownToLine size={14}/> Contribute</button>
            </form></div>}
            {balance > 0 && activeAccounts.length > 0 && <div className="savings-money-actions savings-withdraw"><form action={moveSavingsGoalFunds}>
              <input type="hidden" name="goal_id" value={goal.id}/><input type="hidden" name="direction" value="withdrawal"/><input type="hidden" name="idempotency_key" value={randomUUID()}/>
              <label>Withdraw amount<input name="amount" type="number" min="0.01" max={(balance / 100).toFixed(2)} step="0.01" placeholder="Amount" required/></label>
              <label>To account<select name="account_id" required>{activeAccounts.map((account) => <option key={account.account_id} value={account.account_id}>{account.nickname || account.account_name} · ••••{account.account_number.slice(-4)}</option>)}</select></label>
              <button type="submit"><ArrowUpFromLine size={14}/> Withdraw</button>
            </form></div>}
            {goalEntries.length > 0 && <div className="savings-recent-entries"><strong>Recent activity</strong>{goalEntries.slice(0,3).map((entry) => <div key={entry.id}><span>{Number(entry.amount_minor) > 0 ? "Contribution" : "Withdrawal"} · {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(entry.created_at))}</span><b className={Number(entry.amount_minor) > 0 ? "positive" : ""}>{Number(entry.amount_minor) > 0 ? "+" : "−"}{money(Math.abs(Number(entry.amount_minor)), locale)}</b></div>)}</div>}
          </article>;
        })}</div>}
    </section>
    <p className="workspace-disclaimer">Savings contributions and withdrawals are recorded as balanced entries in your Nexora ledger. Only posted transactions change account balances.</p>
  </main>;
}
