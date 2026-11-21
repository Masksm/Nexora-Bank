import Link from "next/link";
import { cookies } from "next/headers";
import type { SupportedLocale } from "@/lib/locale";
import { pageText } from "@/lib/page-translations";
import { redirect } from "next/navigation";
import { ArrowLeft, LogOut, MessageCircle, Send, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";
import { adminReplySupport, updateSupportStatus } from "../actions";

export const dynamic = "force-dynamic";
type Props={searchParams:Promise<{ticket?:string;kind?:string;message?:string}>};

export default async function AdminSupportPage({searchParams}:Props){
  const locale = ((await cookies()).get("nexora_locale")?.value || "en") as SupportedLocale;
  const t = (value: string) => pageText(locale, value);
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  const {data:claims,error:claimsError}=await supabase.auth.getClaims();
  const meta=claims?.claims?.app_metadata as {role?:string}|undefined;
  if(!user||claimsError||!["admin", "super_admin"].includes(meta?.role ?? ""))redirect("/login");
  const params=await searchParams;
  const {data:tickets}=await supabase.from("support_conversations").select("id,user_id,subject,category,status,intake_answers,created_at,updated_at").order("updated_at",{ascending:false}).limit(100);
  const selected=(tickets??[]).find(t=>t.id===params.ticket)??(tickets??[])[0];
  const {data:messages}=selected?await supabase.from("support_messages").select("id,sender_role,body,created_at").eq("conversation_id",selected.id).order("created_at"):{data:[]};
  const answers=(selected?.intake_answers??{}) as {urgency?:string;account_number?:string|null};
  return <main className="admin-shell"><aside className="admin-sidebar"><Link className="admin-brand" href="/admin"><span>N</span>NEXORA <i>ADMIN</i></Link><div className="admin-side-label">{t("CONTROL CENTRE")}</div><nav><Link href="/admin">{t("Overview")}</Link><Link href="/admin/reviews">{t("Security reviews")}</Link><Link className="selected" href="/admin/support">{t("Support inbox")}</Link></nav><div className="admin-sidebar-foot"><ShieldCheck size={16}/><span>{t("Administrator session")}</span><form action={signOut}><button className="admin-logout-button" type="submit"><LogOut size={15}/> Sign out</button></form></div></aside>
    <section className="admin-main"><header className="admin-topbar"><div><span>{t("ADMINISTRATION / CUSTOMER CARE")}</span><h1>{t("Support inbox")}</h1></div><Link href="/admin"><ArrowLeft size={15}/> Overview</Link></header>
      {params.message&&<div className={params.kind==="error"?"admin-alert error":"admin-alert success"}>{params.message}</div>}
      <div className="admin-support-layout"><section className="admin-panel"><div className="admin-panel-heading"><div><span>INCOMING REQUESTS</span><h2>{t("Customer conversations")}</h2></div><span>{tickets?.length??0}</span></div>{!tickets?.length?<p className="admin-empty">{t("No support requests yet.")}</p>:<div className="admin-ticket-list">{tickets.map(t=><Link href={`/admin/support?ticket=${t.id}`} key={t.id} className={selected?.id===t.id?"admin-ticket selected":"admin-ticket"}><strong>{t.subject}</strong><span>{t.category} · {t.status}</span><small>{new Date(t.updated_at).toLocaleString()} · {t.user_id.slice(0,8)}…</small></Link>)}</div>}</section>
      {selected&&<section className="admin-panel"><div className="admin-panel-heading"><div><span>{t("CASE DETAILS")}</span><h2>{selected.subject}</h2></div><MessageCircle size={18}/></div><div className="admin-case-meta"><span>Customer: <code>{selected.user_id}</code></span><span>Category: {selected.category}</span><span>Urgency: {answers.urgency??"normal"}</span><span>Account: {answers.account_number??"Not specified"}</span></div><form action={updateSupportStatus} className="admin-case-status"><input type="hidden" name="conversation_id" value={selected.id}/><select name="status" defaultValue={selected.status}><option value="open">Open</option><option value="waiting_customer">Waiting for customer</option><option value="waiting_admin">Waiting for admin</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select><button type="submit" className="secondary">{t("Update status")}</button></form><div className="admin-support-messages">{(messages??[]).map(m=><article key={m.id} className={m.sender_role==="admin"?"admin-support-message staff":"admin-support-message"}><span>{m.sender_role==="admin"?"Nexora support":"Customer"} · {new Date(m.created_at).toLocaleString()}</span><p>{m.body}</p></article>)}</div><form action={adminReplySupport} className="admin-support-reply"><input type="hidden" name="conversation_id" value={selected.id}/><textarea name="body" rows={3} maxLength={4000} placeholder="Write a reply to the customer..." required/><button type="submit">Send reply <Send size={14}/></button></form></section>}</div>
      <p className="admin-disclaimer">Support messages may contain personal information. Do not request passwords, one-time codes, full card numbers or identity documents.</p>
    </section>
  </main>;
}
