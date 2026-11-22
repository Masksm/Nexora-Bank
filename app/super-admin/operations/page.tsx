import Link from "next/link";
import {redirect} from "next/navigation";
import {cookies} from "next/headers";
import {Activity,ArrowLeft,Database,Globe,ShieldAlert,HardDrive,Radio,Server,ArrowUpRight} from "lucide-react";
import {createClient} from "@/lib/supabase/server";
import type {SupportedLocale} from "@/lib/locale";
import {pageText} from "@/lib/page-translations";
export const dynamic="force-dynamic";
type Event={id:string;occurred_at:string;severity:string;category:string;service:string;operation:string;status_code:number|null;error_code:string|null;request_path:string|null;duration_ms:number|null};
export default async function OperationsPage({searchParams}:{searchParams:Promise<{category?:string;severity?:string}>}){
 const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();const {data:claims,error:authError}=await supabase.auth.getClaims();const role=claims?.claims?.app_metadata as {role?:string}|undefined;if(!user||authError||role?.role!=="super_admin")redirect("/login");
 const params=await searchParams;const locale=((await cookies()).get("nexora_locale")?.value||"en") as SupportedLocale;const t=(v:string)=>pageText(locale,v);
 let query=supabase.from("operations_events").select("id,occurred_at,severity,category,service,operation,status_code,error_code,request_path,duration_ms").order("occurred_at",{ascending:false}).limit(250);
 if(params.category)query=query.eq("category",params.category);if(params.severity)query=query.eq("severity",params.severity);
 const [{data:events,error:eventsError},{error:dbError},{error:storageError}]=await Promise.all([
  query,
  supabase.from("bank_accounts").select("id").limit(1),
  supabase.storage.from("payment-receipts").list(user.id,{limit:1})
 ]);
 const rows=(events??[]) as Event[];const since=Date.now()-86400000;const recent=rows.filter(e=>new Date(e.occurred_at).getTime()>=since);
 const count=(category:string)=>recent.filter(e=>e.category===category&&["error","critical"].includes(e.severity)).length;
 const status=(ok:boolean)=>ok?"Operational":"Degraded / unavailable";
 return <main className="admin-shell"><aside className="admin-sidebar"><Link className="admin-brand" href="/super-admin"><span>N</span>NEXORA <i>SUPER ADMIN</i></Link><div className="admin-side-label">EXECUTIVE CONTROL</div><nav><Link href="/super-admin"><ArrowLeft size={16}/> Overview</Link><Link className="selected" href="/super-admin/operations"><Activity size={16}/> Operations monitoring</Link><Link href="/super-admin/audit"><ShieldAlert size={16}/> Global audit log</Link></nav></aside><section className="admin-main">
 <header className="admin-topbar"><div><span>PLATFORM RELIABILITY / GLOBAL OPERATIONS</span><h1>System health and operations</h1></div><span className="admin-status active">Current probes</span></header>
 <div className="admin-welcome"><div><span>OPERATIONS MONITORING</span><h2>Service health</h2><p>Recent failures and direct service probes. Event coverage depends on instrumented operations.</p></div><Link className="admin-shortcut" href="/super-admin/audit">Open global audit <ArrowUpRight size={14}/></Link></div>
 <section className="admin-stats"><article><span><Database size={17}/> DATABASE</span><strong>{status(!dbError)}</strong><small>{dbError?.message??"Authenticated query succeeded"}</small></article><article><span><HardDrive size={17}/> STORAGE</span><strong>{status(!storageError)}</strong><small>{storageError?.message??"Private receipt bucket reachable"}</small></article><article><span><Activity size={17}/> ERRORS · 24H</span><strong>{recent.filter(e=>["error","critical"].includes(e.severity)).length}</strong><small>{rows.length} events loaded</small></article></section>
 <section className="admin-stats"><article><span><ArrowUpRight size={17}/> TRANSFER FAILURES</span><strong>{count("transfer")}</strong><small>Last 24 hours</small></article><article><span><Globe size={17}/> API FAILURES</span><strong>{count("api")}</strong><small>Last 24 hours</small></article><article><span><ShieldAlert size={17}/> AUTH FAILURES</span><strong>{count("authentication")}</strong><small>Last 24 hours</small></article></section>
 <section className="admin-stats"><article><span><Radio size={17}/> REALTIME</span><strong>Event-based</strong><small>{count("realtime")} recorded failures · no continuous connection probe</small></article><article><span><Server size={17}/> AUTHENTICATION SERVICE</span><strong>{status(true)}</strong><small>Current Super Admin session authenticated</small></article><article><span><Database size={17}/> DATABASE ERRORS</span><strong>{count("database")}</strong><small>Last 24 hours</small></article></section>
 <section className="admin-panel"><div className="admin-panel-heading"><div><span>INCIDENT STREAM</span><h2>Recent operations events</h2></div><span>{rows.length} records</span></div><form className="admin-search" method="get"><select name="category" defaultValue={params.category||""}><option value="">All services</option>{["database","transfer","api","authentication","realtime","storage","service"].map(x=><option key={x}>{x}</option>)}</select><select name="severity" defaultValue={params.severity||""}><option value="">All severity</option>{["info","warning","error","critical"].map(x=><option key={x}>{x}</option>)}</select><button>Filter</button></form>
 {eventsError?<p className="admin-empty">Could not load operations events: {eventsError.message}</p>:!rows.length?<p className="admin-empty">No operations events have been recorded yet. Instrumented failures will appear here.</p>:<div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Time</th><th>Severity</th><th>Category</th><th>Service / operation</th><th>HTTP</th><th>Error code</th><th>Path</th><th>Duration</th></tr></thead><tbody>{rows.map(e=><tr key={e.id}><td>{new Date(e.occurred_at).toLocaleString(locale)}</td><td><span className={"admin-status "+(e.severity==="critical"?"blocked":e.severity==="error"?"frozen":"active")}>{e.severity}</span></td><td>{e.category}</td><td><strong>{e.service}</strong><small>{e.operation}</small></td><td>{e.status_code??"—"}</td><td><code>{e.error_code??"—"}</code></td><td><code>{e.request_path??"—"}</code></td><td>{e.duration_ms===null?"—":e.duration_ms+" ms"}</td></tr>)}</tbody></table></div>}
 </section><p className="admin-disclaimer">This console reports instrumented application failures and live database/storage probes. It is not a full external uptime monitor, and it cannot observe uninstrumented API requests or realtime disconnections.</p>
 </section></main>;
}
