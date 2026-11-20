import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Bell, CheckCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { markNotificationsRead } from "../actions";

export const dynamic="force-dynamic";
type Props={searchParams:Promise<{error?:string;success?:string}>};

export default async function NotificationsPage({searchParams}:Props){
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)redirect("/login");
  const [{data:items,error},params]=await Promise.all([
    supabase.from("notifications").select("id,title,body,category,read_at,created_at").eq("user_id",user.id).order("created_at",{ascending:false}).limit(100),
    searchParams,
  ]);
  const unread=(items??[]).filter(x=>!x.read_at).length;
  return <main className="workspace-shell"><header className="workspace-header"><Link href="/dashboard" className="workspace-back"><ArrowLeft size={16}/> Overview</Link><span className="workspace-overline">NEXORA BANK · ACTIVITY</span></header><section className="workspace-intro"><div><span className="workspace-kicker">STAY INFORMED</span><h1>Notifications</h1><p>Security alerts, transfer updates and account messages.</p></div>{unread>0&&<form action={markNotificationsRead}><button className="workspace-action-button" type="submit"><CheckCheck size={15}/> Mark all read</button></form>}</section>
    {params.error&&<div className="workspace-alert">{params.error}</div>}{params.success&&<div className="transfer-success">Notifications marked as read.</div>}
    <section className="workspace-panel">{error?<div className="workspace-alert">Unable to load notifications.</div>:(items??[]).length===0?<div className="workspace-empty"><Bell size={24}/><h2>You’re all caught up</h2><p>New account and security notifications will appear here.</p></div>:<div className="notification-list">{(items??[]).map(item=><article key={item.id} className={item.read_at?"notification-row":"notification-row unread"}><span className="notification-symbol"><Bell size={17}/></span><div><strong>{item.title}</strong><p>{item.body}</p><small>{item.category} · {new Date(item.created_at).toLocaleString()}</small></div>{!item.read_at&&<i/>}</article>)}</div>}</section></main>;
}
