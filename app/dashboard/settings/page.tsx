import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, LogOut, Save, ShieldCheck, UserRound, MapPin, FileCheck, Settings2 } from "lucide-react";
import { signOut } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/server";
import { updateProfile } from "../actions";
import IdentityDocuments from "./identity-documents";

export const dynamic = "force-dynamic";
type Props = { searchParams: Promise<{ error?: string; success?: string }> };

const countries = [
  ["NG", "Nigeria"], ["US", "United States"], ["GB", "United Kingdom"], ["ES", "Spain"],
  ["FR", "France"], ["DE", "Germany"], ["PT", "Portugal"], ["BR", "Brazil"],
  ["CA", "Canada"], ["GH", "Ghana"], ["KE", "Kenya"], ["ZA", "South Africa"],
  ["IN", "India"], ["AE", "United Arab Emirates"], ["OTHER", "Other"],
];

export default async function SettingsPage({ searchParams }: Props) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: documents }, params] = await Promise.all([
    supabase.from("profiles").select("first_name,last_name,display_name,phone,date_of_birth,country_code,address_line1,address_line2,city,region,postal_code,preferred_timezone").eq("user_id", user.id).maybeSingle(),
    supabase.from("identity_documents").select("id,document_type,file_name,review_status,uploaded_at").eq("user_id", user.id).order("uploaded_at", { ascending: false }),
    searchParams,
  ]);
  const displayName = profile?.display_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ");

  return (
    <main className="workspace-shell settings-shell">
      <header className="workspace-header">
        <Link href="/dashboard" className="workspace-back"><ArrowLeft size={16} /> Overview</Link>
        <span className="workspace-overline">NEXORA BANK · ACCOUNT SETTINGS</span>
      </header>
      <section className="workspace-intro">
        <div><span className="workspace-kicker">ACCOUNT CENTRE</span><h1>Settings</h1><p>Manage your personal details, address, identity documents and account preferences.</p></div>
      </section>

      {params.error && <div className="workspace-alert" role="alert">{params.error}</div>}
      {params.success && <div className="transfer-success" role="status">Your profile details have been saved.</div>}

      <section className="settings-section-heading"><div className="settings-section-icon"><UserRound size={18}/></div><div><h2>Personal information</h2><p>Keep your contact and identity details up to date.</p></div></section>
      <section className="workspace-panel settings-panel">
        <div className="workspace-panel-heading"><div><span className="workspace-kicker">PROFILE</span><h2>Personal details</h2></div></div>
        <form action={updateProfile} className="transfer-form settings-form">
          <div className="settings-form-grid">
            <label>First name<input name="first_name" defaultValue={profile?.first_name ?? ""} autoComplete="given-name" maxLength={80}/></label>
            <label>Last name<input name="last_name" defaultValue={profile?.last_name ?? ""} autoComplete="family-name" maxLength={80}/></label>
            <label className="settings-span-two">Display name<input name="display_name" defaultValue={displayName} minLength={2} maxLength={100} required autoComplete="nickname"/></label>
            <label>Email address<input value={user.email ?? ""} readOnly disabled autoComplete="email"/></label>
            <label>Phone number<input name="phone" type="tel" defaultValue={profile?.phone ?? ""} maxLength={30} placeholder="+234..." autoComplete="tel"/></label>
            <label>Date of birth<input name="date_of_birth" type="date" defaultValue={profile?.date_of_birth ?? ""} max={new Date().toISOString().slice(0,10)} autoComplete="bday"/></label>
            <label>Country / region<select name="country_code" defaultValue={profile?.country_code?.trim() || "NG"}>{countries.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>
          </div>
          <div className="settings-form-actions"><p>Your email address is managed through your sign-in credentials.</p><button type="submit"><Save size={15}/> Save personal details</button></div>
        </form>
      </section>

      <section className="settings-section-heading"><div className="settings-section-icon"><MapPin size={18}/></div><div><h2>Residential address</h2><p>Your address and regional preferences.</p></div></section>
      <section className="workspace-panel settings-panel">
        <div className="workspace-panel-heading"><div><span className="workspace-kicker">ADDRESS DETAILS</span><h2>Where you live</h2></div></div>
        <form action={updateProfile} className="transfer-form settings-form">
          <div className="settings-form-grid">
            <label className="settings-span-two">Address line 1<input name="address_line1" defaultValue={profile?.address_line1 ?? ""} maxLength={160} autoComplete="address-line1" placeholder="Street address"/></label>
            <label className="settings-span-two">Address line 2 (optional)<input name="address_line2" defaultValue={profile?.address_line2 ?? ""} maxLength={160} autoComplete="address-line2" placeholder="Apartment, suite or unit"/></label>
            <label>City<input name="city" defaultValue={profile?.city ?? ""} maxLength={100} autoComplete="address-level2"/></label>
            <label>State / province<input name="region" defaultValue={profile?.region ?? ""} maxLength={100} autoComplete="address-level1"/></label>
            <label>Postal code<input name="postal_code" defaultValue={profile?.postal_code ?? ""} maxLength={24} autoComplete="postal-code"/></label>
            <label>Time zone<input name="preferred_timezone" defaultValue={profile?.preferred_timezone ?? "Africa/Lagos"} maxLength={80} placeholder="Africa/Lagos"/></label>
          </div>
          <input type="hidden" name="display_name" value={displayName || "Customer"}/>
          <input type="hidden" name="first_name" value={profile?.first_name ?? ""}/>
          <input type="hidden" name="last_name" value={profile?.last_name ?? ""}/>
          <input type="hidden" name="phone" value={profile?.phone ?? ""}/>
          <input type="hidden" name="date_of_birth" value={profile?.date_of_birth ?? ""}/>
          <input type="hidden" name="country_code" value={profile?.country_code?.trim() || "NG"}/>
          <div className="settings-form-actions"><p>Address details are optional and can be updated at any time.</p><button type="submit"><Save size={15}/> Save address</button></div>
        </form>
      </section>

      <section className="settings-section-heading"><div className="settings-section-icon"><FileCheck size={18}/></div><div><h2>Identity documents</h2><p>Submit an identity document for account records.</p></div></section>
      <section className="workspace-panel settings-panel">
        <div className="workspace-panel-heading"><div><span className="workspace-kicker">IDENTITY RECORDS</span><h2>Documents</h2></div><span className="workspace-count">{documents?.length ?? 0} uploaded</span></div>
        <IdentityDocuments userId={user.id} initialDocuments={(documents ?? []) as Array<{id:string;document_type:"passport"|"national_id"|"drivers_license";file_name:string;review_status:"submitted"|"under_review"|"verified"|"rejected";uploaded_at:string}>}/>
      </section>

      <section className="settings-section-heading"><div className="settings-section-icon"><ShieldCheck size={18}/></div><div><h2>Security and access</h2><p>Review devices and protect your account.</p></div></section>
      <section className="workspace-panel settings-link-panel">
        <div><strong>Security and devices</strong><span>Review active sessions, recognised devices and sign-in activity.</span></div>
        <Link href="/dashboard/security">Manage security <ShieldCheck size={15}/></Link>
      </section>
      <section className="workspace-panel settings-link-panel">
        <div><strong>Account preferences</strong><span>Your regional details and time zone are saved with your profile.</span></div>
        <span className="settings-link-note"><Settings2 size={15}/> Profile preferences</span>
      </section>

      <section className="workspace-panel settings-signout-panel">
        <div><span className="workspace-kicker">ACCOUNT ACCESS</span><h2>Sign out</h2><p>End your current Nexora Bank session on this device.</p></div>
        <form action={signOut}><button type="submit" className="settings-signout-button"><LogOut size={15}/> Sign out</button></form>
      </section>
    </main>
  );
}
