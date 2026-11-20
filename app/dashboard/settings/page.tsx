import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, LogOut, Save } from "lucide-react";
import { signOut } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/server";
import { updateProfile } from "../actions";

export const dynamic="force-dynamic";
type Props={searchParams:Promise<{error?:string;success?:string}>};

export default async function SettingsPage({searchParams}:Props){
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)redirect("/login");
  const [{data:profile},params]=await Promise.all([
    supabase.from("profiles").select("first_name,last_name,display_name,phone,country_code").eq("user_id",user.id).maybeSingle(),
    searchParams,
  ]);
  const displayName=profile?.display_name||[profile?.first_name,profile?.last_name].filter(Boolean).join(" ");
  return <main className="workspace-shell"><header className="workspace-header"><Link href="/dashboard" className="workspace-back"><ArrowLeft size={16}/> Overview</Link><span className="workspace-overline">NEXORA BANK · PREFERENCES</span></header><section className="workspace-intro"><div><span className="workspace-kicker">YOUR PROFILE</span><h1>Settings</h1><p>Manage the basic details shown in your Nexora profile.</p></div></section>
    {params.error&&<div className="workspace-alert">{params.error}</div>}{params.success&&<div className="transfer-success">Profile details saved.</div>}
    <section className="workspace-panel settings-panel"><div className="workspace-panel-heading"><div><span className="workspace-kicker">PERSONAL INFORMATION</span><h2>Profile details</h2></div></div><form action={updateProfile} className="transfer-form"><label>Display name<input name="display_name" defaultValue={displayName} minLength={2} maxLength={100} required/></label><label>Email address<input value={user.email??""} readOnly disabled/></label><label>Phone number (optional)<input name="phone" type="tel" defaultValue={profile?.phone??""} maxLength={30} placeholder="+234..."/></label><label>Country code<input value={profile?.country_code??"NG"} readOnly disabled/></label><button type="submit">Save profile <Save size={15}/></button></form></section><section className="workspace-panel settings-signout-panel"><div><span className="workspace-kicker">ACCOUNT ACCESS</span><h2>Sign out</h2><p>End your current Nexora Bank session on this device.</p></div><form action={signOut}><button type="submit" className="settings-signout-button"><LogOut size={15}/> Sign out</button></form></section></main>;
}
