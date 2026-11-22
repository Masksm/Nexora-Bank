import Link from "next/link";
import { cookies } from "next/headers";
import type { SupportedLocale } from "@/lib/locale";
import { pageText } from "@/lib/page-translations";
import { redirect } from "next/navigation";
import { ArrowLeft, MessageCircle, Send, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createSupportRequest } from "./actions";
import { SupportLiveChat } from "./support-live-chat";
import { CustomerReceiptViewer } from "./customer-receipt-viewer";
import { PaymentProcedureCard } from "./payment-procedure-card";

export const dynamic = "force-dynamic";
type Props = { searchParams: Promise<{ error?: string; ticket?: string }> };

const categories = [
  ["account","Account access or balance"],["transfer","Transfer or payment"],["card","Virtual card"],["security","Security or suspicious activity"],["profile","Profile and personal details"],["general","Something else"],
];


export default async function HelpPage({ searchParams }: Props) {
  const locale = ((await cookies()).get("nexora_locale")?.value || "en") as SupportedLocale;
  const t = (value: string) => pageText(locale, value);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  const [{ data: tickets }, { data: accounts }] = await Promise.all([
    supabase.from("support_conversations").select("id,subject,category,status,created_at,updated_at").eq("user_id",user.id).order("updated_at",{ascending:false}),
    supabase.from("bank_accounts").select("account_number").eq("user_id",user.id),
  ]);
  const selected = (tickets ?? []).find((ticket)=>ticket.id===params.ticket) ?? (params.ticket ? null : (tickets ?? [])[0]);
  const { data: messages } = selected ? await supabase.from("support_messages").select("id,sender_role,body,created_at").eq("conversation_id",selected.id).order("created_at") : {data:[]};
  const { data: paymentProcedures } = selected ? await supabase.from("support_payment_procedures").select("id,cryptocurrency,network,wallet_address,expected_amount,amount_currency,payment_reference,purpose,status,customer_acknowledged_at,created_at,cancellation_reason,verification_status,transaction_hash,verification_confirmations,verification_result").eq("conversation_id",selected.id).order("created_at",{ascending:false}) : {data:[]};
  const procedureIds=(paymentProcedures??[]).map(procedure=>procedure.id);
  const {data:receiptRows}=procedureIds.length?await supabase.from("support_payment_receipts").select("id,procedure_id,original_filename,mime_type,file_size_bytes,review_status,submitted_at,review_note,storage_path").in("procedure_id",procedureIds).order("submitted_at",{ascending:false}):{data:[]};
  const receiptsByProcedure=new Map<string,Array<{id:string;original_filename:string;mime_type:string;file_size_bytes:number;review_status:string;submitted_at:string;review_note:string|null;signedUrl:string|null}>>();
  for(const receipt of receiptRows??[]){const {data}=await supabase.storage.from("payment-receipts").createSignedUrl(receipt.storage_path,600);const list=receiptsByProcedure.get(receipt.procedure_id)??[];list.push({...receipt,signedUrl:data?.signedUrl??null});receiptsByProcedure.set(receipt.procedure_id,list);}
  return <main className="workspace-shell">
    <header className="workspace-header"><Link href="/dashboard" className="workspace-back"><ArrowLeft size={16}/> {t("Overview")}</Link><span className="workspace-overline">{t("NEXORA BANK · SUPPORT")}</span></header>
    <section className="workspace-intro"><div><span className="workspace-kicker">{t("WE’RE HERE TO HELP")}</span><h1>{t("Help centre")}</h1><p>{t("Send a request and continue the conversation with customer care.")}</p></div></section>
    {params.error && <div className="workspace-alert">{params.error}</div>}
    <section className="support-layout">
      <div className="workspace-panel support-new">
        <div className="workspace-panel-heading"><div><span className="workspace-kicker">{t("GUIDED INTAKE")}</span><h2>{t("Tell us what happened")}</h2></div><MessageCircle size={19}/></div>
        <form action={createSupportRequest} className="transfer-form">
          <label>{t("What do you need help with?")}<select name="category" defaultValue="general">{categories.map(([value,label])=><option key={value} value={value}>{t(label)}</option>)}</select></label>
          <label>{t("Subject")}<input name="subject" maxLength={120} placeholder={t("Briefly describe the issue")} required/></label>
          <label>{t("Related account (optional)")}<select name="account_number" defaultValue=""><option value="">{t("Not applicable")}</option>{(accounts ?? []).map((account)=><option key={account.account_number} value={account.account_number}>{account.account_number}</option>)}</select></label>
          <label>{t("How urgent is it?")}<select name="urgency"><option value="normal">{t("Normal")}</option><option value="high">{t("High")}</option><option value="critical">{t("Urgent security concern")}</option></select></label>
          <label>{t("Explain the issue")}<textarea name="details" rows={4} minLength={10} maxLength={3500} placeholder={t("Include what happened, when it happened, and any error message. Do not include passwords or verification codes.")} required/></label>
          <button type="submit">{t("Send to customer care")} <Send size={15}/></button>
        </form>
        <div className="support-assistant"><ShieldCheck size={17}/><div><strong>{t("Guided support assistant")}</strong></div></div>
      </div>
      <div className="workspace-panel support-tickets">
        <div className="workspace-panel-heading"><div><span className="workspace-kicker">{t("YOUR REQUESTS")}</span><h2>{t("Support conversations")}</h2></div><span className="workspace-count">{tickets?.length ?? 0}</span></div>
        {(tickets ?? []).length===0 ? <div className="workspace-empty"><MessageCircle size={24}/><h2>{t("No requests yet")}</h2><p>{t("New support requests will appear here.")}</p></div> : <div className="support-ticket-list">{(tickets ?? []).map((ticket)=><Link key={ticket.id} href={`/dashboard/help?ticket=${ticket.id}`} className={selected?.id===ticket.id?"support-ticket selected":"support-ticket"}><strong>{ticket.subject}</strong><span>{ticket.category.replaceAll("_"," ")} · {ticket.status.replaceAll("_"," ")}</span><small>{new Date(ticket.updated_at).toLocaleString()}</small></Link>)}</div>}
      </div>
    </section>
    {selected && <section className="workspace-panel support-thread">
      <div className="workspace-panel-heading"><div><span className="workspace-kicker">{t("CONVERSATION")}</span><h2>{selected.subject}</h2></div><span className="workspace-count">{selected.status.replaceAll("_"," ")}</span></div>
      <div className="support-payment-procedures">{(paymentProcedures ?? []).map((procedure)=><PaymentProcedureCard key={procedure.id} procedure={procedure} conversationId={selected.id} receipts={receiptsByProcedure.get(procedure.id)??[]} locale={locale}/>)}</div>
      <SupportLiveChat conversationId={selected.id} initialMessages={messages??[]} viewerRole="customer" locale={locale} disabled={selected.status==="resolved"||selected.status==="closed"}/>
    </section>}
    <p className="workspace-disclaimer">{t("Never share passwords, one-time codes, full card numbers or other sensitive credentials in support messages.")}</p>
  </main>;
}
