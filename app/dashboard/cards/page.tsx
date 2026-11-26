import Link from "next/link";
import { cookies } from "next/headers";
import type { SupportedLocale } from "@/lib/locale";
import { pageText } from "@/lib/page-translations";
import { redirect } from "next/navigation";
import { ArrowLeft, CreditCard, Lock, Plus, Unlock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createCard, updateCardStatus } from "../actions";
import { CardReveal } from "./card-reveal";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ error?: string; success?: string; request?: string }> };

export default async function CardsPage({ searchParams }: Props) {
  const locale = ((await cookies()).get("nexora_locale")?.value || "en") as SupportedLocale;
  const t = (value: string) => pageText(locale, value);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: cards, error: cardsError }, { data: accounts }, params] = await Promise.all([
    supabase
      .from("virtual_cards")
      .select("id,account_id,cardholder_name,network,last4,expiry_month,expiry_year,status,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("bank_accounts")
      .select("id,account_number,account_name,status")
      .eq("user_id", user.id),
    searchParams,
  ]);

  const cardIds = (cards ?? []).map((card) => card.id);
  const { data: unfreezeRequests } = cardIds.length
    ? await supabase.from("virtual_card_unfreeze_requests")
        .select("id,card_id,status,review_reason,requested_at,reviewed_at")
        .in("card_id", cardIds).order("requested_at", { ascending: false })
    : { data: [] };
  const latestRequestByCard = new Map<string, NonNullable<typeof unfreezeRequests>[number]>();
  for (const request of unfreezeRequests ?? []) {
    if (!latestRequestByCard.has(request.card_id)) latestRequestByCard.set(request.card_id, request);
  }
  const activeAccounts = (accounts ?? []).filter((account) => account.status === "active");

  return (
    <main className="workspace-shell">
      <header className="workspace-header">
        <Link href="/dashboard" className="workspace-back"><ArrowLeft size={16}/> {t("Overview")}</Link>
        <span className="workspace-overline">NEXORA BANK · CARDS</span>
      </header>

      <section className="workspace-intro">
        <div>
          <span className="workspace-kicker">{t("DIGITAL WALLET")}</span>
          <h1>{t("Virtual cards")}</h1>
          <p>{t("Manage your Nexora virtual card previews.")}</p>
        </div>
      </section>

      {params.error && <div className="workspace-alert">{params.error}</div>}
      {params.success && <div className="transfer-success">{t("Card settings updated.")}</div>}
      {params.request === "pending" && <div className="transfer-success">Your unfreeze request has been submitted. The card remains frozen until an administrator approves it.</div>}
      {cardsError && <div className="workspace-alert">Your cards could not be loaded. Refresh the page and try again.</div>}

      <section className="card-preview-grid" aria-label="Your virtual cards">
        {(cards ?? []).map((card) => (
          <article key={card.id} className="virtual-card-preview">
            <CardReveal
              cardId={card.id}
              network={card.network}
              last4={card.last4}
              cardholder={card.cardholder_name}
            />
            <div className="virtual-card-controls">
              <span className={card.status === "active" ? "account-status" : "account-status inactive"}>{t(card.status)}</span>
              {card.status === "active" ? (
                <form action={updateCardStatus}>
                  <input type="hidden" name="card_id" value={card.id}/>
                  <input type="hidden" name="status" value="frozen"/>
                  <button type="submit" aria-label="Freeze card"><Lock size={15}/><span>Freeze</span></button>
                </form>
              ) : card.status === "frozen" ? (() => {
                const request = latestRequestByCard.get(card.id);
                return request?.status === "pending" ? (
                  <span className="account-status inactive">Unfreeze request pending admin review</span>
                ) : (
                  <form action={updateCardStatus}>
                    <input type="hidden" name="card_id" value={card.id}/>
                    <input type="hidden" name="status" value="active"/>
                    <button type="submit" aria-label="Request card unfreeze"><Unlock size={15}/><span>Request unfreeze</span></button>
                  </form>
                );
              })() : <span className="account-status inactive">{t(card.status)}</span>}
              {latestRequestByCard.get(card.id)?.status === "rejected" && latestRequestByCard.get(card.id)?.review_reason && (
                <small className="workspace-disclaimer">Previous request declined: {latestRequestByCard.get(card.id)?.review_reason}</small>
              )}
            </div>
          </article>
        ))}
        {!cardsError && !(cards ?? []).length && (
          <div className="workspace-empty card-empty-state">
            <CreditCard size={26}/>
            <h2>No virtual cards yet</h2>
            <p>Create a card preview linked to one of your active accounts.</p>
          </div>
        )}
      </section>

      {!cardsError && !(cards ?? []).length && <section className="workspace-panel card-create">
        <div className="workspace-panel-heading">
          <div>
            <span className="workspace-kicker">{t("CARD MANAGEMENT")}</span>
            <h2>{t("Create a virtual card preview")}</h2>
          </div>
          <Plus size={18}/>
        </div>
        <form action={createCard} className="transfer-form">
          <label>
            {t("Linked account")}
            <select name="account_id" required disabled={!activeAccounts.length}>
              {activeAccounts.map((account) => (
                <option key={account.id} value={account.id}>{account.account_name} · {account.account_number}</option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={!activeAccounts.length}>{t("Create card preview")}</button>
        </form>
        <p className="card-preview-footnote">Card details shown here are generated preview values. No payment-network card has been issued.</p>
      </section>}
    </main>
  );
}
