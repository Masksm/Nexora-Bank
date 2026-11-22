import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ArrowLeft, ShieldCheck, Users, UserCog, CalendarDays, Activity } from "lucide-react";
import type { SupportedLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";
import { pageText } from "@/lib/page-translations";

export const dynamic = "force-dynamic";
type Person = {user_id:string;email:string;role:string;display_name:string;account_count:number;assigned_customer_count:number};
type Event = {id:string;created_at:string;event_name:string;event_source:string;entity_table:string;entity_id:string|null;actor_email:string|null;actor_role:string;details:unknown};

export default async function SuperAdminAuditPage({searchParams}:{searchParams:Promise<{role?:string;user?:string;year?:string;month?:string;day?:string}>}) {
  const supabase=await createClient();
  const {data:{user:sessionUser}}=await supabase.auth.getUser();
  const {data:claims,error}=await supabase.auth.getClaims();
  const meta=claims?.claims?.app_metadata as {role?:string}|undefined;
  if(!sessionUser||error||meta?.role!=="super_admin") redirect("/login");
  const params=await searchParams;
  const role=params.role==="staff"?"staff":"member";
  const locale=((await cookies()).get("nexora_locale")?.value||"en") as SupportedLocale;
  const t=(value:string)=>pageText(locale,value);
  const {data:directory,error:directoryError}=await supabase.rpc("super_admin_directory");
  const people=(directory??[]) as Person[];
  const accounts=people.filter(p=>role==="staff"?p.role==="admin":!["admin","super_admin"].includes(p.role));
  const selected=accounts.find(p=>p.user_id===params.user)??null;
  let events:Event[]=[];
  let sourceError:string|null=null;
  if(selected){
    const activityQuery=supabase.from("activity_audit_events").select("id,created_at,event_name,event_source,entity_table,entity_id,actor_email,actor_role,details").order("created_at",{ascending:false});
    const [activity,legacy,logins]=await Promise.all([
      role==="staff"?activityQuery.eq("actor_user_id",selected.user_id):activityQuery.or("actor_user_id.eq."+selected.user_id+",subject_user_id.eq."+selected.user_id),
      role==="staff"?supabase.from("admin_audit_logs").select("id,action,entity_type,entity_id,reason,before_state,after_state,created_at").eq("admin_user_id",selected.user_id).order("created_at",{ascending:false}).limit(300):Promise.resolve({data:[],error:null}),
      supabase.from("login_history").select("id,event_type,device_label,approximate_location,created_at").eq("user_id",selected.user_id).order("created_at",{ascending:false}).limit(300)
    ]);
    if(activity.error) sourceError=activity.error.message;
    events=(activity.data??[]).map(e=>({...e,actor_email:e.actor_email,details:e.details})) as Event[];
    for(const item of legacy.data??[]) events.push({id:"legacy-"+item.id,created_at:item.created_at,event_name:item.action,event_source:"admin_audit_logs",entity_table:item.entity_type,entity_id:item.entity_id,actor_email:selected.email,actor_role:"admin",details:{reason:item.reason,before:item.before_state,after:item.after_state}});
    for(const item of logins.data??[]) events.push({id:"login-"+item.id,created_at:item.created_at,event_name:"authentication."+item.event_type,event_source:"login_history",entity_table:"login_history",entity_id:item.id,actor_email:selected.email,actor_role:role==="staff"?"admin":"customer",details:{device:item.device_label,location:item.approximate_location}});
    const receiptQuery=supabase.from("support_payment_receipts").select("id,original_filename,mime_type,file_size_bytes,review_status,submitted_at,review_note,storage_path").order("submitted_at",{ascending:false}).limit(200);
    const {data:receipts}=role==="staff"?await receiptQuery.eq("reviewed_by",selected.user_id):await receiptQuery.eq("customer_user_id",selected.user_id);
    receiptCards=await Promise.all((receipts??[]).map(async receipt=>{const {data}=await supabase.storage.from("payment-receipts").createSignedUrl(receipt.storage_path,600);return {...receipt,signedUrl:data?.signedUrl??null};}));
    events.sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime());
  }
  const years=[...new Set(events.map(e=>new Date(e.created_at).getFullYear().toString()))].sort((a,b)=>Number(b)-Number(a));
  const months=[...new Set(events.filter(e=>!params.year||new Date(e.created_at).getFullYear().toString()===params.year).map(e=>String(new Date(e.created_at).getMonth()+1).padStart(2,"0")))].sort((a,b)=>Number(a)-Number(b));
  const days=[...new Set(events.filter(e=>(!params.year||new Date(e.created_at).getFullYear().toString()===params.year)&&(!params.month||String(new Date(e.created_at).getMonth()+1).padStart(2,"0")===params.month)).map(e=>String(new Date(e.created_at).getDate()).padStart(2,"0")))].sort((a,b)=>Number(a)-Number(b));
  const visible=events.filter(e=>{const d=new Date(e.created_at);return(!params.year||d.getFullYear().toString()===params.year)&&(!params.month||String(d.getMonth()+1).padStart(2,"0")===params.month)&&(!params.day||String(d.getDate()).padStart(2,"0")===params.day);});
  return <main className="admin-shell">
    <aside className="admin-sidebar"><Link className="admin-brand" href="/super-admin"><span>N</span>{t("NEXORA")} <i>{t("SUPER ADMIN")}</i></Link><div className="admin-side-label">EXECUTIVE CONTROL</div><nav><Link href="/super-admin"><Activity size={16}/> {t("Overview")}</Link><Link className="selected" href="/super-admin/audit"><ShieldCheck size={16}/> Global audit log</Link><Link href="/admin"><UserCog size={16}/> {t("Legacy admin operations")}</Link></nav></aside>
    <section className="admin-main">
      <header className="admin-topbar"><div><span>EXECUTIVE GOVERNANCE / FORENSIC ACTIVITY</span><h1>Global audit log</h1></div><Link href="/super-admin"><ArrowLeft size={15}/> Overview</Link></header>
      <section className="admin-welcome"><div><span>ACCOUNT ACTIVITY TRACE</span><h2>Every recorded action, by account</h2><p>Choose a staff administrator or member account to inspect its activity history.</p></div><ShieldCheck size={24}/></section>
      <div className="audit-role-tabs"><Link className={role==="staff"?"active":""} href="/super-admin/audit?role=staff"><UserCog size={16}/> Staff administrator accounts ({people.filter(p=>p.role==="admin").length})</Link><Link className={role==="member"?"active":""} href="/super-admin/audit?role=member"><Users size={16}/> Member accounts ({people.filter(p=>!["admin","super_admin"].includes(p.role)).length})</Link></div>
      {directoryError?<p className="admin-alert error">{directoryError.message}</p>:!selected?<section className="admin-panel"><div className="admin-panel-heading"><div><span>{role==="staff"?"STAFF DIRECTORY":"MEMBER DIRECTORY"}</span><h2>Select an account</h2></div><span>{accounts.length} accounts</span></div>{!accounts.length?<p className="admin-empty">No accounts in this category.</p>:<div className="audit-account-list">{accounts.map(person=><Link key={person.user_id} href={"/super-admin/audit?role="+role+"&user="+person.user_id} className="audit-account"><span className="audit-account-icon">{role==="staff"?<UserCog size={18}/>:<Users size={18}/>}</span><span><strong>{person.display_name||person.email}</strong><small>{person.email} · {person.user_id}</small></span><span className="audit-account-meta">{person.account_count} accounts</span></Link>)}</div>}</section>:<>
        <section className="admin-panel"><div className="admin-panel-heading"><div><span>{role==="staff"?"STAFF ADMINISTRATOR":"MEMBER ACCOUNT"} · SELECTED PROFILE</span><h2>{selected.display_name||selected.email}</h2><p>{selected.email} · {selected.user_id}</p></div><Link href={"/super-admin/audit?role="+role}>Change account</Link></div>
          <form method="get" className="audit-date-filter"><input type="hidden" name="role" value={role}/><input type="hidden" name="user" value={selected.user_id}/><label>YEAR<select name="year" defaultValue={params.year??""}><option value="">All years</option>{years.map(y=><option key={y} value={y}>{y}</option>)}</select></label><label>MONTH<select name="month" defaultValue={params.month??""}><option value="">All months</option>{months.map(m=><option key={m} value={m}>{new Date(2000,Number(m)-1,1).toLocaleDateString(locale,{month:"long"})}</option>)}</select></label><label>DATE<select name="day" defaultValue={params.day??""}><option value="">All dates</option>{days.map(d=><option key={d} value={d}>{d}</option>)}</select></label><button type="submit"><CalendarDays size={15}/> Apply date filter</button><Link href={"/super-admin/audit?role="+role+"&user="+selected.user_id}>Clear</Link></form>
          <div className="audit-result-summary"><span>{visible.length} recorded events</span><span>{params.year||"All years"}{params.month?" · "+new Date(2000,Number(params.month)-1,1).toLocaleDateString(locale,{month:"long"}):""}{params.day?" · "+params.day:""}</span></div>
          {sourceError?<p className="admin-alert error">Unable to load all activity records: {sourceError}</p>:!visible.length?<p className="admin-empty">No activity was recorded for this account and date selection.</p>:<div className="audit-event-list">{visible.map(event=><article className="audit-event" key={event.id}><div className="audit-event-top"><strong>{event.event_name.replaceAll("_"," ")}</strong><time>{new Date(event.created_at).toLocaleString(locale,{dateStyle:"medium",timeStyle:"medium"})}</time></div><div className="audit-event-meta"><span>{event.entity_table}</span><span>{event.event_source}</span><span>{event.actor_role}</span>{event.entity_id&&<code>{event.entity_id}</code>}</div><details><summary>View recorded details</summary><pre>{JSON.stringify(event.details,null,2)}</pre></details></article>)}</div>}
        </section>
        <section className="admin-panel audit-receipts"><div className="admin-panel-heading"><div><span>PAYMENT EVIDENCE ARCHIVE</span><h2>{role==="staff"?"Receipts reviewed by this staff member":"Receipts submitted by this member"}</h2></div><span>{receiptCards.length} files</span></div>{!receiptCards.length?<p className="admin-empty">No payment receipts are linked to this account.</p>:<div className="audit-receipt-list">{receiptCards.map(receipt=><article key={receipt.id}><div><strong>{receipt.original_filename}</strong><small>{new Date(receipt.submitted_at).toLocaleString(locale)} · {receipt.review_status.replaceAll("_"," ")} · {(receipt.file_size_bytes/1024/1024).toFixed(2)} MB</small>{receipt.review_note&&<p>{receipt.review_note}</p>}</div>{receipt.signedUrl?<a href={receipt.signedUrl} target="_blank" rel="noreferrer">View receipt</a>:<span>Preview unavailable</span>}</article>)}</div>}</section>
      </>}
    </section>
  </main>;
}
