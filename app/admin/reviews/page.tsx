import Link from "next/link";
import { cookies } from "next/headers";
import type { SupportedLocale } from "@/lib/locale";
import { pageText } from "@/lib/page-translations";
import { redirect } from "next/navigation";
import { ArrowLeft, Check, LogOut, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";
import { reviewTransfer, setDeviceTrust, revokeUserSession } from "../actions";

export const dynamic = "force-dynamic";
type Props = { searchParams: Promise<{ kind?: string; message?: string }> };

function money(minor: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Math.abs(minor)/100);
}

export default async function AdminReviewsPage({searchParams}:Props) {
  const locale = ((await cookies()).get("nexora_locale")?.value || "en") as SupportedLocale;
  const t = (value: string) => pageText(locale, value);
  const supabase = await createClient();
  const {data:{user}} = await supabase.auth.getUser();
  const {data:claims,error:claimsError}=await supabase.auth.getClaims();
  const meta=claims?.claims?.app_metadata as {role?:string}|undefined;
  if(!user||claimsError||!["admin", "super_admin"].includes(meta?.role ?? "")) redirect("/login");
  const [{data:pending},{data:devices},{data:sessions},params]=await Promise.all([
    supabase.from("ledger_transactions").select("id,reference,description,metadata,created_at,status").eq("transaction_type","transfer").eq("status","pending").order("created_at",{ascending:true}),
    supabase.from("trusted_devices").select("id,user_id,device_label,user_agent,ip_address,is_trusted,first_seen_at,last_seen_at").order("last_seen_at",{ascending:false}).limit(100),
    supabase.from("user_sessions").select("id,user_id,auth_session_id,device_label,ip_address,approximate_location,last_seen_at,created_at,revoked_at").order("last_seen_at",{ascending:false}).limit(100),
    searchParams,
  ]);
  const reviewItems=(pending??[]).filter((tx)=>Boolean((tx.metadata as {review_required?:boolean}).review_required));
  const ids=reviewItems.map(x=>x.id);
  const {data:entries}=ids.length?await supabase.from("ledger_entries").select("transaction_id,account_id,amount_minor").in("transaction_id",ids):{data:[]};
  const accountIds=[...new Set((entries??[]).map(x=>x.account_id))];
  const {data:accounts}=accountIds.length?await supabase.from("bank_accounts").select("id,account_number,user_id,account_name").in("id",accountIds):{data:[]};
  const accountMap=new Map((accounts??[]).map(x=>[x.id,x]));
  const entryMap=new Map<string,{from?:string;to?:string;amount?:number;fromUser?:string}>(); 
  for(const entry of entries??[]){
    const account=accountMap.get(entry.account_id);
    const item=entryMap.get(entry.transaction_id)??{};
    if(Number(entry.amount_minor)<0){item.from=account?.account_number;item.fromUser=account?.user_id;item.amount=Number(entry.amount_minor);}
    else item.to=account?.account_number;
    entryMap.set(entry.transaction_id,item);
  }
  return <main className="admin-shell"><aside className="admin-sidebar"><Link className="admin-brand" href="/admin"><span>N</span>{t("NEXORA")} <i>{t("ADMIN")}</i></Link><div className="admin-side-label">{t("CONTROL CENTRE")}</div><nav><Link href="/admin">{t("Overview")}</Link><Link className="selected" href="/admin/reviews">{t("Security reviews")}</Link><Link href="/admin/support">{t("Support inbox")}</Link></nav><div className="admin-sidebar-foot"><ShieldCheck size={16}/><span>{t("Administrator session")}</span><form action={signOut}><button className="admin-logout-button" type="submit"><LogOut size={15}/> {t("Sign out")}</button></form></div></aside>
    <section className="admin-main"><header className="admin-topbar"><div><span>{t("ADMINISTRATION / SECURITY")}</span><h1>{t("Security reviews")}</h1></div><Link href="/admin"><ArrowLeft size={15}/> {t("Overview")}</Link></header>
      {params.message&&<div className={params.kind==="error"?"admin-alert error":"admin-alert success"}>{params.message}</div>}
      <section className="admin-panel admin-review-panel"><div className="admin-panel-heading"><div><span>{t("TRANSFER MONITORING")}</span><h2>{t("Transfers awaiting approval")}</h2></div><span>{reviewItems.length} pending</span></div>
        {!reviewItems.length?<p className="admin-empty">{t("No transfers are waiting for security review.")}</p>:<div className="admin-review-list">{reviewItems.map(tx=>{const item=entryMap.get(tx.id);return <article className="admin-review-card" key={tx.id}><div className="admin-review-meta"><ShieldAlert size={17}/><span><strong>{money(item?.amount??0)}</strong><small>{tx.reference} · {new Date(tx.created_at).toLocaleString()}</small></span></div><p>{item?.from??"Unknown source"} → {item?.to??"Unknown recipient"}</p><small>{tx.description||"Internal transfer"} · Customer ID {item?.fromUser?.slice(0,8)??"unknown"}</small><form action={reviewTransfer} className="admin-form"><input type="hidden" name="transaction_id" value={tx.id}/><label>{t("Review reason")}<input name="reason" minLength={8} maxLength={240} placeholder={t("Reason for approval or rejection")} required/></label><div className="admin-review-buttons"><button name="decision" value="approve" type="submit"><Check size={14}/> {t("Approve and post")}</button><button name="decision" value="reject" type="submit" className="reject"><X size={14}/> {t("Reject transfer")}</button></div></form></article>})}</div>}
      </section>
      <section className="admin-panel admin-device-panel"><div className="admin-panel-heading"><div><span>{t("DEVICE RECOGNITION")}</span><h2>{t("Known and unfamiliar devices")}</h2></div><span>{devices?.length??0} devices</span></div>
        {!devices?.length?<p className="admin-empty">{t("No device sign-ins have been recorded yet. Device records are created after the next successful login.")}</p>:<div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>{t("Device")}</th><th>{t("Customer ID")}</th><th>{t("Last sign-in")}</th><th>{t("Trust")}</th><th>{t("Control")}</th></tr></thead><tbody>{devices.map(d=><tr key={d.id}><td><strong>{d.device_label}</strong><small>{d.ip_address??"IP unavailable"}</small></td><td><code>{d.user_id.slice(0,8)}…</code></td><td>{new Date(d.last_seen_at).toLocaleString()}</td><td><span className={d.is_trusted?"admin-status active":"admin-status blocked"}>{d.is_trusted?"Trusted":"Untrusted"}</span></td><td><form action={setDeviceTrust} className="admin-inline-form"><input type="hidden" name="device_id" value={d.id}/><input type="hidden" name="trusted" value={d.is_trusted?"false":"true"}/><input name="reason" aria-label={t("Reason")} placeholder={t("Reason (8+ chars)")} minLength={8} required/><button type="submit" className="secondary">{d.is_trusted?"Revoke":"Trust device"}</button></form></td></tr>)}</tbody></table></div>}
      </section>
      <section className="admin-panel admin-device-panel"><div className="admin-panel-heading"><div><span>{t("SESSION MANAGEMENT")}</span><h2>{t("Customer sessions")}</h2></div><span>{(sessions??[]).filter(s=>!s.revoked_at).length} active records</span></div>
        {!sessions?.length?<p className="admin-empty">{t("No session records have been captured yet.")}</p>:<div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>{t("Device and location")}</th><th>{t("Customer ID")}</th><th>{t("Last sign-in")}</th><th>{t("Session")}</th><th>{t("Action")}</th></tr></thead><tbody>{sessions.map(s=><tr key={s.id}><td><strong>{s.device_label??"Unknown device"}</strong><small>{s.ip_address??"IP unavailable"} · {s.approximate_location??"Location unavailable"}</small></td><td><code>{s.user_id.slice(0,8)}…</code></td><td>{new Date(s.last_seen_at).toLocaleString()}</td><td><span className={s.revoked_at?"admin-status blocked":"admin-status active"}>{s.revoked_at?"Revoked":"Active"}</span></td><td>{!s.revoked_at&&<form action={revokeUserSession} className="admin-inline-form"><input type="hidden" name="session_id" value={s.id}/><input name="reason" aria-label={t("Revocation reason")} placeholder={t("Reason (8+ chars)")} minLength={8} required/><button type="submit" className="secondary">{t("Revoke session")}</button></form>}</td></tr>)}</tbody></table></div>}
      </section>
      <p className="admin-disclaimer">{t("Transfers from an unrecognized device remain pending and do not affect account balances until an administrator approves them. Device recognition is based on a persistent browser identifier and user-agent, not biometric identity verification.")}</p>
    </section>
  </main>;
}
