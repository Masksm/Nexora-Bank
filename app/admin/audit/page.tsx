import Link from "next/link";
import { cookies } from "next/headers";
import type { SupportedLocale } from "@/lib/locale";
import { pageText } from "@/lib/page-translations";
import { redirect } from "next/navigation";
import { ArrowLeft, ClipboardList, LogOut, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";

export const dynamic="force-dynamic";

export default async function AdminAuditPage(){
  const locale = ((await cookies()).get("nexora_locale")?.value || "en") as SupportedLocale;
  const t = (value: string) => pageText(locale, value);
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  const {data:claims,error}=await supabase.auth.getClaims();
  const meta=claims?.claims?.app_metadata as {role?:string}|undefined;
  if(!user||error||!["admin", "super_admin"].includes(meta?.role ?? ""))redirect("/login");
  const {data:logs, error:logsError}=await supabase.from("admin_audit_logs").select("id,action,entity_type,entity_id,reason,before_state,after_state,created_at").order("created_at",{ascending:false}).limit(200);
  return <main className="admin-shell"><aside className="admin-sidebar"><Link className="admin-brand" href="/admin"><span>N</span>{t("NEXORA")} <i>{t("ADMIN")}</i></Link><div className="admin-side-label">{t("CONTROL CENTRE")}</div><nav><Link href="/admin">{t("Overview")}</Link><Link href="/admin/reviews">{t("Security reviews")}</Link><Link href="/admin/support">{t("Support inbox")}</Link><Link className="selected" href="/admin/audit">{t("Audit log")}</Link></nav><div className="admin-sidebar-foot"><ShieldCheck size={16}/><span>{t("Administrator session")}</span><form action={signOut}><button className="admin-logout-button" type="submit"><LogOut size={15}/> {t("Sign out")}</button></form></div></aside><section className="admin-main"><header className="admin-topbar"><div><span>{t("ADMINISTRATION / GOVERNANCE")}</span><h1>{t("Audit log")}</h1></div><Link href="/admin"><ArrowLeft size={15}/> {t("Overview")}</Link></header><section className="admin-panel"><div className="admin-panel-heading"><div><span>{t("IMMUTABLE ADMIN HISTORY")}</span><h2>{t("Administrative actions")}</h2></div><ClipboardList size={18}/></div>{logsError?<p className="admin-empty">{t("Unable to load audit records.")}</p>:!logs?.length?<p className="admin-empty">{t("No administrator actions have been recorded yet.")}</p>:<div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>{t("Action")}</th><th>{t("Entity")}</th><th>{t("Reason")}</th><th>{t("Time")}</th></tr></thead><tbody>{logs.map(log=><tr key={log.id}><td><strong>{t(log.action.replaceAll("_"," "))}</strong><small>{t(log.entity_type.replaceAll("_"," "))} · {log.entity_id?.slice(0,12)??"—"}</small></td><td>{t(log.entity_type.replaceAll("_"," "))}</td><td>{log.reason??"—"}</td><td>{new Date(log.created_at).toLocaleString(locale)}</td></tr>)}</tbody></table></div>}</section><p className="admin-disclaimer">{t("Audit entries are created by database operations. This page is read-only; it does not edit or delete historical records.")}</p></section></main>;
}
