import Link from "next/link";
import { cookies } from "next/headers";
import type { SupportedLocale } from "@/lib/locale";
import { pageText } from "@/lib/page-translations";
import { redirect } from "next/navigation";
import { LogOut, Save, ShieldCheck, UserRound, MapPin, FileCheck, Settings2, Languages } from "lucide-react";
import { signOut } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/server";
import { updateProfile } from "../actions";
import IdentityDocuments from "./identity-documents";
import SettingsPopupSection from "./settings-popup-section";
import ThemeToggle from "./theme-toggle";

export const dynamic = "force-dynamic";
type Props = { searchParams: Promise<{ error?: string; success?: string }> };

const countries = [
  ["NG", "Nigeria"], ["US", "United States"], ["GB", "United Kingdom"], ["ES", "Spain"],
  ["FR", "France"], ["DE", "Germany"], ["PT", "Portugal"], ["BR", "Brazil"],
  ["CA", "Canada"], ["GH", "Ghana"], ["KE", "Kenya"], ["ZA", "South Africa"],
  ["IN", "India"], ["AE", "United Arab Emirates"], ["XX", "Other / not listed"],
];

export default async function SettingsPage({ searchParams }: Props) {
  const cookieStore = await cookies();
  const locale = (cookieStore.get("nexora_locale")?.value || "en") as SupportedLocale;
  const theme = cookieStore.get("nexora_theme")?.value === "dark" ? "dark" : "light";
  const t = (value: string) => pageText(locale, value);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: documents }, { data: verification }, params] = await Promise.all([
    supabase.from("profiles").select("first_name,last_name,display_name,phone,date_of_birth,country_code,address_line1,address_line2,city,region,postal_code,preferred_timezone,preferred_language").eq("user_id", user.id).maybeSingle(),
    supabase.from("identity_documents").select("id,document_type,file_name,review_status,rejection_reason,uploaded_at").eq("user_id", user.id).order("uploaded_at", { ascending: false }),
    supabase.from("customer_verifications").select("status,rejection_reason,submitted_at,reviewed_at").eq("user_id", user.id).maybeSingle(),
    searchParams,
  ]);
  const displayName = profile?.display_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ");
  const completionFields = [profile?.first_name, profile?.last_name, profile?.phone, profile?.date_of_birth, profile?.country_code, profile?.address_line1, profile?.city, profile?.region];
  const completedFields = completionFields.filter((value) => Boolean(String(value ?? "").trim())).length;
  const completionPercent = Math.round(completedFields / completionFields.length * 100);
  const kycStatus = verification?.status || "not_started";
  const hiddenProfile = <>
    <input type="hidden" name="display_name" value={displayName || "Customer"}/>
    <input type="hidden" name="first_name" value={profile?.first_name ?? ""}/>
    <input type="hidden" name="last_name" value={profile?.last_name ?? ""}/>
    <input type="hidden" name="phone" value={profile?.phone ?? ""}/>
    <input type="hidden" name="date_of_birth" value={profile?.date_of_birth ?? ""}/>
    <input type="hidden" name="country_code" value={profile?.country_code?.trim() || "NG"}/>
    <input type="hidden" name="address_line1" value={profile?.address_line1 ?? ""}/>
    <input type="hidden" name="address_line2" value={profile?.address_line2 ?? ""}/>
    <input type="hidden" name="city" value={profile?.city ?? ""}/>
    <input type="hidden" name="region" value={profile?.region ?? ""}/>
    <input type="hidden" name="postal_code" value={profile?.postal_code ?? ""}/>
    <input type="hidden" name="preferred_timezone" value={profile?.preferred_timezone ?? "Africa/Lagos"}/>
  </>;

  return (
    <main className="workspace-shell settings-shell">
      <header className="workspace-header"><Link href="/dashboard" className="workspace-back">← {t("Overview")}</Link><span className="workspace-overline">NEXORA BANK · {t("ACCOUNT SETTINGS")}</span></header>
      <section className="workspace-intro"><div><span className="workspace-kicker">{t("ACCOUNT CENTRE")}</span><h1>{t("Settings")}</h1><p>{t("Manage your personal details, address, identity documents and account preferences.")}</p></div></section>
      {params.error && <div className="workspace-alert" role="alert">{t(params.error)}</div>}
      {params.success && <div className="transfer-success" role="status">{t("Your profile details have been saved.")}</div>}

      <div className="settings-popup-list">
        <SettingsPopupSection title={t("Personal information")} description={t("Keep your contact and identity details up to date.")} icon={<UserRound size={18}/>}>
          <div className="workspace-panel-heading"><div><span className="workspace-kicker">{t("PROFILE")}</span><h2>{t("Personal details")}</h2></div></div>
          <form action={updateProfile} className="transfer-form settings-form"><div className="settings-form-grid">
            <label>{t("First name")}<input name="first_name" defaultValue={profile?.first_name ?? ""} autoComplete="given-name" maxLength={80}/></label>
            <label>{t("Last name")}<input name="last_name" defaultValue={profile?.last_name ?? ""} autoComplete="family-name" maxLength={80}/></label>
            <label className="settings-span-two">{t("Display name")}<input name="display_name" defaultValue={displayName} minLength={2} maxLength={100} required autoComplete="nickname"/></label>
            <label>{t("Email address")}<input value={user.email ?? ""} readOnly disabled autoComplete="email"/></label>
            <label>{t("Phone number")}<input name="phone" type="tel" defaultValue={profile?.phone ?? ""} maxLength={30} placeholder="+1..." autoComplete="tel"/></label>
            <label>{t("Date of birth")}<input name="date_of_birth" type="date" defaultValue={profile?.date_of_birth ?? ""} max={new Date().toISOString().slice(0,10)} autoComplete="bday"/></label>
            <label>{t("Country / region")}<select name="country_code" defaultValue={profile?.country_code?.trim() || "NG"}>{countries.map(([code,name])=><option key={code} value={code}>{name}</option>)}</select></label>
          </div>
          <input type="hidden" name="preferred_language" value={profile?.preferred_language || "auto"}/>{hiddenProfile}
          <div className="settings-form-actions"><p>{t("Your email address is managed through your sign-in credentials.")}</p><button type="submit"><Save size={15}/> {t("Save personal details")}</button></div></form>
        </SettingsPopupSection>

        <SettingsPopupSection title={t("Residential address")} description={t("Your address and regional details.")} icon={<MapPin size={18}/>}>
          <div className="workspace-panel-heading"><div><span className="workspace-kicker">{t("ADDRESS DETAILS")}</span><h2>{t("Where you live")}</h2></div></div>
          <form action={updateProfile} className="transfer-form settings-form"><div className="settings-form-grid">
            <label className="settings-span-two">{t("Address line 1")}<input name="address_line1" defaultValue={profile?.address_line1 ?? ""} maxLength={160} autoComplete="address-line1" placeholder={t("Street address")}/></label>
            <label className="settings-span-two">{t("Address line 2 (optional)")}<input name="address_line2" defaultValue={profile?.address_line2 ?? ""} maxLength={160} autoComplete="address-line2" placeholder={t("Apartment, suite or unit")}/></label>
            <label>{t("City")}<input name="city" defaultValue={profile?.city ?? ""} maxLength={100} autoComplete="address-level2"/></label>
            <label>{t("State / province")}<input name="region" defaultValue={profile?.region ?? ""} maxLength={100} autoComplete="address-level1"/></label>
            <label>{t("Postal code")}<input name="postal_code" defaultValue={profile?.postal_code ?? ""} maxLength={24} autoComplete="postal-code"/></label>
            <label>{t("Time zone")}<input name="preferred_timezone" defaultValue={profile?.preferred_timezone ?? "Africa/Lagos"} maxLength={80} placeholder="Africa/Lagos"/></label>
          </div>
          <input type="hidden" name="display_name" value={displayName || "Customer"}/><input type="hidden" name="first_name" value={profile?.first_name ?? ""}/><input type="hidden" name="last_name" value={profile?.last_name ?? ""}/><input type="hidden" name="phone" value={profile?.phone ?? ""}/><input type="hidden" name="date_of_birth" value={profile?.date_of_birth ?? ""}/><input type="hidden" name="country_code" value={profile?.country_code?.trim() || "NG"}/><input type="hidden" name="preferred_language" value={profile?.preferred_language || "auto"}/>
          <div className="settings-form-actions"><p>{t("Address details are optional and can be updated at any time.")}</p><button type="submit"><Save size={15}/> {t("Save address")}</button></div></form>
        </SettingsPopupSection>

        <SettingsPopupSection title={t("Identity documents")} description={t("Submit and track identity document reviews.")} icon={<FileCheck size={18}/>}>
          <section className="workspace-panel kyc-customer-summary"><div className="kyc-summary-top"><div><span className="workspace-kicker">{t("PROFILE READINESS")}</span><h2>{t("Profile completion")}</h2><p>{t("Complete your personal details and submit an identity document for review.")}</p></div><strong>{completionPercent}%</strong></div><div className="kyc-progress-track"><span style={{width:completionPercent+"%"}}/></div><div className="kyc-summary-bottom"><span>{completedFields} {t("of 8 profile details completed")}</span><span className={"kyc-customer-status "+kycStatus}>{t(kycStatus.replaceAll("_"," "))}</span></div>
          {kycStatus==="rejected" && verification?.rejection_reason && <div className="kyc-customer-rejection"><strong>{t("Action required")}</strong><p>{verification.rejection_reason}</p><span>{t("Upload a corrected document below. Your previous submission remains in your record.")}</span></div>}
          {kycStatus==="verified" && <p className="kyc-customer-verified">{t("Your identity documents have passed Nexora's internal review.")}</p>}
          {kycStatus==="submitted" && <p className="kyc-customer-pending">{t("Your documents have been received and are waiting for review.")}</p>}
          {kycStatus==="under_review" && <p className="kyc-customer-pending">{t("Your documents are currently being reviewed.")}</p>}</section>
          <section className="workspace-panel settings-panel"><div className="workspace-panel-heading"><div><span className="workspace-kicker">{t("IDENTITY RECORDS")}</span><h2>{t("Documents")}</h2></div><span className="workspace-count">{documents?.length ?? 0} {t("uploaded")}</span></div><IdentityDocuments userId={user.id} locale={locale} initialDocuments={(documents??[]) as Array<{id:string;document_type:"passport"|"national_id"|"drivers_license";file_name:string;review_status:"submitted"|"under_review"|"verified"|"rejected";rejection_reason:string|null;uploaded_at:string}>}/></section>
        </SettingsPopupSection>

        <SettingsPopupSection title={t("Preferences")} description={t("Choose your display language and regional format.")} icon={<Languages size={18}/>}>
          <div className="workspace-panel-heading"><div><span className="workspace-kicker">{t("REGIONAL PREFERENCES")}</span><h2>{t("Display language")}</h2></div></div>
          <form action={updateProfile} className="transfer-form settings-form"><div className="settings-form-grid">
            <label className="settings-span-two">{t("Display language")}<select name="preferred_language" defaultValue={profile?.preferred_language || "auto"}>
              <option value="auto">{t("Automatic (based on location and browser)")}</option><option value="en">English</option><option value="es">Español</option><option value="fr">Français</option><option value="pt">Português</option><option value="de">Deutsch</option>
            </select></label>
          </div>{hiddenProfile}<div className="settings-form-actions"><p>{t("Automatic mode uses your detected country first, then your browser language.")}</p><button type="submit"><Save size={15}/> {t("Save preferences")}</button></div></form>
          <div className="workspace-panel-heading theme-section-heading"><div><span className="workspace-kicker">{t("APPEARANCE")}</span><h2>{t("Appearance")}</h2></div></div>
          <ThemeToggle initialTheme={theme} labels={{light:t("Light mode"),dark:t("Dark mode"),description:t("Choose a comfortable appearance for every Nexora page.")}}/>
        </SettingsPopupSection>

        <SettingsPopupSection title={t("Security and access")} description={t("Review devices and protect your account.")} icon={<ShieldCheck size={18}/>}>
          <div className="settings-link-panel"><div><strong>{t("Security and devices")}</strong><span>{t("Review active sessions, recognised devices and sign-in activity.")}</span></div><Link href="/dashboard/security">{t("Manage security")} <ShieldCheck size={15}/></Link></div>
          <div className="settings-link-panel"><div><strong>{t("Account preferences")}</strong><span>{t("Your language is detected from your location and browser unless you choose a language manually.")}</span></div><span className="settings-link-note"><Settings2 size={15}/> {t("Profile preferences")}</span></div>
        </SettingsPopupSection>

        <SettingsPopupSection title={t("Sign out")} description={t("End your current Nexora Bank session on this device.")} icon={<LogOut size={18}/>}>
          <form action={signOut}><button type="submit" className="settings-signout-button"><LogOut size={15}/> {t("Sign out")}</button></form>
        </SettingsPopupSection>
      </div>
    </main>
  );
}
