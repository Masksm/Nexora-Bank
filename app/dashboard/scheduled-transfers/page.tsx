import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarClock, XCircle } from "lucide-react";
import type { SupportedLocale } from "@/lib/locale";
import { pageText } from "@/lib/page-translations";
import { createClient } from "@/lib/supabase/server";
import ScheduleTransferForm from "./schedule-form";
import { cancelScheduledTransfer } from "./actions";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ error?: string; success?: string }> };

function money(minor: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(minor / 100);
}

export default async function ScheduledTransfersPage({ searchParams }: Props) {
  const locale = ((await cookies()).get("nexora_locale")?.value || "en") as SupportedLocale;
  const t = (value: string) => pageText(locale, value);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [accountResult, scheduleResult, params] = await Promise.all([
    supabase.from("account_balances").select("account_id,account_number,account_name,nickname,balance_minor,status,currency").eq("user_id", user.id),
    supabase.from("scheduled_transfers").select("id,from_account_id,recipient_account_number,amount_minor,description,frequency,scheduled_for,status,last_error,last_transaction_id").eq("user_id", user.id).order("scheduled_for", { ascending: true }),
    searchParams,
  ]);
  const accounts = (accountResult.data ?? []).filter((a) => a.status === "active");
  const accountNames = new Map((accountResult.data ?? []).map((a) => [a.account_id, a.nickname || a.account_name]));
  const accountCurrencies = new Map((accountResult.data ?? []).map((a) => [a.account_id, a.currency]));
  const schedules = scheduleResult.data ?? [];
  return <main className="workspace-shell">
    <header className="workspace-header"><Link href="/dashboard/transfers" className="workspace-back"><ArrowLeft size={16}/> {t("Transfers")}</Link><span className="workspace-overline">{t("NEXORA BANK · PAYMENTS")}</span></header>
    <section className="workspace-intro"><div><span className="workspace-kicker">{t("PLAN AHEAD")}</span><h1>{t("Scheduled transfers")}</h1><p>{t("Set up one-time or recurring transfers for a future date.")}</p></div></section>
    {params.error && <div className="workspace-alert">{params.error}</div>}
    {params.success && <div className="transfer-success">{params.success === "cancelled" ? "Scheduled transfer cancelled." : "Your scheduled transfer has been saved."}</div>}
    {scheduleResult.error && <div className="workspace-alert">{t("Scheduled transfers could not be loaded. Refresh the page.")}</div>}
    <section className="workspace-panel transfer-panel">
      <div className="workspace-panel-heading"><div><span className="workspace-kicker">{t("NEW SCHEDULE")}</span><h2>{t("Create a scheduled transfer")}</h2></div></div>
      {accounts.length ? <ScheduleTransferForm accounts={accounts} locale={locale}/> : <div className="workspace-alert">{t("No active account is available for scheduling.")}</div>}
    </section>
    <section className="workspace-panel scheduled-list-panel">
      <div className="workspace-panel-heading"><div><span className="workspace-kicker">{t("YOUR PAYMENT PLAN")}</span><h2>{t("Scheduled activity")}</h2></div><span className="workspace-count">{schedules.length} schedules</span></div>
      {schedules.length === 0 ? <div className="workspace-empty"><CalendarClock size={25}/><h2>{t("No scheduled transfers")}</h2><p>{t("Future payments you create will appear here.")}</p></div> :
        <div className="scheduled-list">{schedules.map((item) => <article className="scheduled-row" key={item.id}>
          <div className="scheduled-row-main"><strong>{item.description || "Scheduled transfer"}</strong><span>{accountNames.get(item.from_account_id) || "Account"} · To ••••{item.recipient_account_number.slice(-4)}</span><small>{new Date(item.scheduled_for).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })} · {t(item.frequency.replaceAll("_"," "))}</small></div>
          <div className="scheduled-row-side"><strong>{money(Number(item.amount_minor),accountCurrencies.get(item.from_account_id)||"USD")}</strong><span className={"scheduled-status " + item.status}>{t(item.status.replaceAll("_", " "))}</span>
            {item.status === "scheduled" && <form action={cancelScheduledTransfer}><input type="hidden" name="schedule_id" value={item.id}/><button type="submit" aria-label={t("Cancel scheduled transfer")}><XCircle size={15}/> {t("Cancel")}</button></form>}
            {item.last_error && <small className="scheduled-error">{item.last_error}</small>}
            {item.last_transaction_id && <Link href={"/dashboard/transactions/" + item.last_transaction_id}>{t("View transaction")}</Link>}
          </div>
        </article>)}</div>}
    </section>
    <p className="workspace-disclaimer">{t("At the scheduled time, Nexora submits the transfer for security review. Balances change only after approval. Recurring schedules pause while the latest transfer is awaiting review.")}</p>
  </main>;
}
