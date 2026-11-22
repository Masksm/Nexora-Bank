import Link from "next/link";
import { cookies } from "next/headers";
import type { SupportedLocale } from "@/lib/locale";
import { pageText } from "@/lib/page-translations";
import { redirect } from "next/navigation";
import { ArrowLeft, Laptop, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { signOutOtherSessions } from "../actions";

export const dynamic="force-dynamic";
type Props={searchParams:Promise<{error?:string;success?:string}>};

export default async function SecurityPage({searchParams}:Props){
  const locale = ((await cookies()).get("nexora_locale")?.value || "en") as SupportedLocale;
  const t = (value: string) => pageText(locale, value);
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)redirect("/login");
  const {data:claims}=await supabase.auth.getClaims();
  const currentSessionId=String(claims?.claims?.session_id||"");
  const [{data:devices},{data:sessions},{data:history},params]=await Promise.all([
    supabase.from("trusted_devices").select("id,device_label,is_trusted,first_seen_at,last_seen_at,ip_address").eq("user_id",user.id).order("last_seen_at",{ascending:false}),
    supabase.from("user_sessions").select("id,auth_session_id,device_label,approximate_location,ip_address,last_seen_at,created_at,revoked_at").eq("user_id",user.id).order("last_seen_at",{ascending:false}),
    supabase.from("login_history").select("id,event_type,device_label,ip_address,created_at").eq("user_id",user.id).order("created_at",{ascending:false}).limit(20),
    searchParams,
  ]);
  return <main className="workspace-shell"><header className="workspace-header"><Link href="/dashboard" className="workspace-back"><ArrowLeft size={16}/> {t("Overview")}</Link><span className="workspace-overline">{t("NEXORA BANK · PROTECTION")}</span></header><section className="workspace-intro"><div><span className="workspace-kicker">{t("ACCOUNT PROTECTION")}</span><h1>{t("Security")}</h1><p>{t("Review devices and recent sign-in activity.")}</p></div></section>
    {params.error&&<div className="workspace-alert">{params.error}</div>}{params.success&&<div className="transfer-success">{t("Other refresh-token sessions have been revoked. Existing access tokens may remain valid until they expire.")}</div>}
    <section className="workspace-panel"><div className="workspace-panel-heading"><div><span className="workspace-kicker">{t("RECOGNIZED DEVICES")}</span><h2>{t("Your devices")}</h2></div><ShieldCheck size={18}/></div>{!devices?.length?<div className="workspace-empty"><Laptop size={24}/><h2>{t("No device history")}</h2><p>{t("Your device will appear after the next successful sign-in.")}</p></div>:<div className="security-device-list">{devices.map(d=><article key={d.id}><Laptop size={19}/><div><strong>{d.device_label}</strong><span>{d.ip_address??"IP unavailable"} · Last sign-in {new Date(d.last_seen_at).toLocaleString(locale)}</span></div><span className={d.is_trusted?"account-status":"account-status inactive"}>{t(d.is_trusted?"Trusted":"Review required")}</span></article>)}</div>}</section>
    <section className="workspace-panel security-sessions"><div className="workspace-panel-heading"><div><span className="workspace-kicker">{t("SESSION HISTORY")}</span><h2>{t("Recent sessions")}</h2></div></div>{!sessions?.length?<p className="workspace-empty">{t("No session records are available yet.")}</p>:<div className="security-device-list">{sessions.map(s=><article key={s.id}><ShieldCheck size={18}/><div><strong>{s.device_label??"Unknown device"}{s.auth_session_id===currentSessionId?" · This device":""}</strong><span>{s.approximate_location??"Location unavailable"} · {s.ip_address??"IP unavailable"} · Last active {new Date(s.last_seen_at).toLocaleString(locale)}</span></div><span className={s.revoked_at?"account-status inactive":"account-status"}>{s.revoked_at?"Revoked":s.auth_session_id===currentSessionId?"Current":"Active"}</span></article>)}</div>}</section>
    <section className="workspace-panel security-history"><div className="workspace-panel-heading"><div><span className="workspace-kicker">{t("RECENT ACCESS")}</span><h2>{t("Sign-in history")}</h2></div></div>{!history?.length?<p className="workspace-empty">{t("No sign-in history is available yet.")}</p>:<div className="notification-list">{history.map(h=><article className="notification-row" key={h.id}><span className="notification-symbol"><ShieldCheck size={17}/></span><div><strong>{h.event_type.replaceAll("_"," ")}</strong><p>{h.device_label??"Unknown device"} · {h.ip_address??"IP unavailable"}</p><small>{new Date(h.created_at).toLocaleString(locale)}</small></div></article>)}</div>}</section>
    <section className="workspace-panel session-panel"><div className="workspace-panel-heading"><div><span className="workspace-kicker">{t("ACTIVE SESSIONS")}</span><h2>{t("Sign out other devices")}</h2></div></div><p className="admin-help">{t("This revokes other refresh-token sessions. Access tokens already issued can remain valid until their expiry.")}</p><form action={signOutOtherSessions} className="transfer-form"><button type="submit">{t("Sign out other sessions")}</button></form></section>
  </main>;
}
