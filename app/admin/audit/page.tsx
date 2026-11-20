import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ClipboardList, LogOut, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";

export const dynamic="force-dynamic";

export default async function AdminAuditPage(){
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  const {data:claims,error}=await supabase.auth.getClaims();
  const meta=claims?.claims?.app_metadata as {role?:string}|undefined;
  if(!user||error||meta?.role!=="admin")redirect("/login");
  const {data:logs, error:logsError}=await supabase.from("admin_audit_logs").select("id,action,entity_type,entity_id,reason,before_state,after_state,created_at").order("created_at",{ascending:false}).limit(200);
  return <main className="admin-shell"><aside className="admin-sidebar"><Link className="admin-brand" href="/admin"><span>N</span>NEXORA <i>ADMIN</i></Link><div className="admin-side-label">CONTROL CENTRE</div><nav><Link href="/admin">Overview</Link><Link href="/admin/reviews">Security reviews</Link><Link href="/admin/support">Support inbox</Link><Link className="selected" href="/admin/audit">Audit log</Link></nav><div className="admin-sidebar-foot"><ShieldCheck size={16}/><span>Administrator session</span><form action={signOut}><button className="admin-logout-button" type="submit"><LogOut size={15}/> Sign out</button></form></div></aside><section className="admin-main"><header className="admin-topbar"><div><span>ADMINISTRATION / GOVERNANCE</span><h1>Audit log</h1></div><Link href="/admin"><ArrowLeft size={15}/> Overview</Link></header><section className="admin-panel"><div className="admin-panel-heading"><div><span>IMMUTABLE ADMIN HISTORY</span><h2>Administrative actions</h2></div><ClipboardList size={18}/></div>{logsError?<p className="admin-empty">Unable to load audit records.</p>:!logs?.length?<p className="admin-empty">No administrator actions have been recorded yet.</p>:<div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Action</th><th>Entity</th><th>Reason</th><th>Time</th></tr></thead><tbody>{logs.map(log=><tr key={log.id}><td><strong>{log.action.replaceAll("_"," ")}</strong><small>{log.entity_type} · {log.entity_id?.slice(0,12)??"—"}</small></td><td>{log.entity_type}</td><td>{log.reason??"—"}</td><td>{new Date(log.created_at).toLocaleString()}</td></tr>)}</tbody></table></div>}</section><p className="admin-disclaimer">Audit entries are created by database operations. This page is read-only; it does not edit or delete historical records.</p></section></main>;
}
