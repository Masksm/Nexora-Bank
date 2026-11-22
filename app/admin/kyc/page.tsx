import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { SupportedLocale } from "@/lib/locale";
import { pageText } from "@/lib/page-translations";
import { ArrowLeft, FileCheck2, FileText, LogOut, ShieldCheck, UserRound, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";
import { reviewIdentityDocument } from "../actions";

export const dynamic = "force-dynamic";
type Props = { searchParams: Promise<{ kind?: string; message?: string }> };

type ProfileRow = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  phone: string | null;
  date_of_birth: string | null;
  country_code: string;
  address_line1: string | null;
  city: string | null;
  region: string | null;
};

function completion(profile?: ProfileRow) {
  if (!profile) return 0;
  const fields = [
    profile.first_name, profile.last_name, profile.phone, profile.date_of_birth,
    profile.country_code, profile.address_line1, profile.city, profile.region,
  ];
  return Math.round(fields.filter((value) => Boolean(String(value ?? "").trim())).length / fields.length * 100);
}

function documentLabel(value: string) {
  if (value === "passport") return "Passport";
  if (value === "national_id") return "National identity card";
  if (value === "drivers_license") return "Driver's licence";
  return "Identity document";
}

export default async function AdminKycPage({ searchParams }: Props) {
  const locale = ((await cookies()).get("nexora_locale")?.value || "en") as SupportedLocale;
  const t = (value: string) => pageText(locale, value);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const meta = claims?.claims?.app_metadata as { role?: string } | undefined;
  if (!user || claimsError || !["admin", "super_admin"].includes(meta?.role ?? "")) redirect("/login");

  const [docsResult, attemptsResult, params] = await Promise.all([
    supabase.from("identity_documents")
      .select("id,user_id,document_type,storage_path,file_name,content_type,file_size_bytes,review_status,rejection_reason,uploaded_at,reviewed_at")
      .order("uploaded_at", { ascending: false }).limit(200),
    supabase.from("identity_verification_attempts")
      .select("id,user_id,identity_document_id,provider,provider_reference,status,document_integrity_status,document_authenticity_status,liveness_status,decision_source,result_summary,created_at,reviewed_at")
      .order("created_at", { ascending: false }).limit(300),
    searchParams,
  ]);
  const documents = docsResult.data ?? [];
  const attempts = attemptsResult.data ?? [];
  const attemptMap = new Map<string, (typeof attempts)[number]>();
  for (const attempt of attempts) if (!attemptMap.has(attempt.identity_document_id)) attemptMap.set(attempt.identity_document_id, attempt);
  const documentUserIds = [...new Set(documents.map((doc) => doc.user_id))];
  const [profilesResult, verificationsResult] = await Promise.all([
    supabase.from("profiles")
      .select("user_id,first_name,last_name,display_name,phone,date_of_birth,country_code,address_line1,city,region,created_at")
      .order("created_at", { ascending: false }).limit(200),
    supabase.from("customer_verifications")
      .select("user_id,status,rejection_reason,submitted_at,reviewed_at").limit(200),
  ]);

  const documentProfilesResult = documentUserIds.length ? await supabase.from("profiles")
    .select("user_id,first_name,last_name,display_name,phone,date_of_birth,country_code,address_line1,city,region")
    .in("user_id", documentUserIds) : { data: [] };
  const allProfiles = [...(profilesResult.data ?? []), ...(documentProfilesResult.data ?? [])];
  const profileMap = new Map(allProfiles.map((profile) => [profile.user_id, profile as ProfileRow] as const));
  const verificationMap = new Map((verificationsResult.data ?? []).map((verification) => [verification.user_id, verification] as const));
  const profileRows = (profilesResult.data ?? []) as ProfileRow[];
  const signedEntries = await Promise.all(documents.filter((doc) => ["submitted", "under_review"].includes(doc.review_status)).map(async (doc) => {
    const { data } = await supabase.storage.from("identity-documents").createSignedUrl(doc.storage_path, 300);
    return [doc.id, data?.signedUrl ?? null] as const;
  }));
  const signedMap = new Map(signedEntries);
  const pendingCount = documents.filter((doc) => ["submitted", "under_review"].includes(doc.review_status)).length;
  const verifiedCount = documents.filter((doc) => doc.review_status === "verified").length;
  const rejectedCount = documents.filter((doc) => doc.review_status === "rejected").length;

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <Link className="admin-brand" href="/admin"><span>N</span>{t("NEXORA")} <i>{t("ADMIN")}</i></Link>
        <div className="admin-side-label">{t("CONTROL CENTRE")}</div>
        <nav>
          <Link href="/admin">{t("Overview")}</Link>
          <Link className="selected" href="/admin/kyc"><FileCheck2 size={16}/> {t("KYC review")}</Link>
          <Link href="/admin/reviews">{t("Security reviews")}</Link>
          <Link href="/admin/support">{t("Support inbox")}</Link>
          <Link href="/admin/audit">{t("Audit log")}</Link>
        </nav>
        <div className="admin-sidebar-foot"><ShieldCheck size={16}/><span>{t("Administrator session")}</span><form action={signOut}><button className="admin-logout-button" type="submit"><LogOut size={15}/> {t("Sign out")}</button></form></div>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar"><div><span>{t("ADMINISTRATION / CUSTOMER DUE DILIGENCE")}</span><h1>{t("KYC and identity review")}</h1></div><Link href="/admin"><ArrowLeft size={15}/> {t("Overview")}</Link></header>
        {params.message && <div className={params.kind === "error" ? "admin-alert error" : "admin-alert success"} role="status">{params.message}</div>}

        <section className="admin-stats kyc-stats">
          <article><span><FileText size={17}/> {t("AWAITING REVIEW")}</span><strong>{pendingCount}</strong><small>{t("Submitted or under review")}</small></article>
          <article><span><ShieldCheck size={17}/> {t("VERIFIED DOCUMENTS")}</span><strong>{verifiedCount}</strong><small>{t("Documents approved by an administrator")}</small></article>
          <article><span><UserRound size={17}/> {t("REJECTED DOCUMENTS")}</span><strong>{rejectedCount}</strong><small>{t("Replacement may be submitted by the customer")}</small></article>
        </section>

        <section className="admin-panel kyc-profile-panel">
          <div className="admin-panel-heading"><div><span>{t("CUSTOMER ONBOARDING")}</span><h2>{t("Profile completion overview")}</h2></div><span>{profileRows.length} customers · latest 200</span></div>
          {!profileRows.length ? <p className="admin-empty">{t("No customer profiles were found.")}</p> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>{t("Customer")}</th><th>{t("Contact")}</th><th>{t("Profile completion")}</th><th>{t("KYC status")}</th></tr></thead><tbody>{profileRows.map((profile) => { const status = verificationMap.get(profile.user_id)?.status || "not_started"; const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.display_name || "Name not provided"; return <tr key={profile.user_id}><td><strong>{name}</strong><small><code>{profile.user_id.slice(0, 12)}…</code></small></td><td>{profile.phone || "Not provided"}<small>{profile.country_code?.trim() || "Country not set"}</small></td><td><div className="kyc-table-progress"><span>{completion(profile)}%</span><i><b style={{ width: completion(profile) + "%" }}/></i></div></td><td><span className={"admin-status " + (status === "verified" ? "active" : status === "rejected" ? "blocked" : "pending")}>{status.replace("_", " ")}</span></td></tr>; })}</tbody></table></div>}
        </section>

        <section className="admin-panel kyc-panel">
          <div className="admin-panel-heading"><div><span>{t("IDENTITY DOCUMENT REGISTER")}</span><h2>{t("Customer submissions")}</h2></div><span>{documents.length} records · latest 200</span></div>
          {docsResult.error ? <p className="admin-empty">{t("Unable to load identity documents. Check administrator review permissions.")}</p> :
            documents.length === 0 ? <p className="admin-empty">{t("No identity documents have been submitted yet.")}</p> :
            <div className="kyc-review-list">
              {documents.map((doc) => {
                const profile = profileMap.get(doc.user_id);
                const verification = verificationMap.get(doc.user_id);
                const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.display_name || "Name not provided";
                const url = signedMap.get(doc.id);
                const canReview = ["submitted", "under_review"].includes(doc.review_status);
                return (
                  <article className="kyc-review-card" key={doc.id}>
                    <div className="kyc-review-top">
                      <div><span className="kyc-doc-type">{documentLabel(doc.document_type)}</span><h3>{fullName}</h3><small>{t("Customer ID")} <code>{doc.user_id.slice(0, 12)}…</code> · Uploaded {new Date(doc.uploaded_at).toLocaleString(locale)}</small></div>
                      <span className={"admin-status " + (doc.review_status === "verified" ? "active" : doc.review_status === "rejected" ? "blocked" : "pending")}>{doc.review_status.replace("_", " ")}</span>
                    </div>
                    <div className="kyc-customer-details">
                      <div><span>{t("PHONE")}</span><strong>{profile?.phone || "Not provided"}</strong></div>
                      <div><span>{t("DATE OF BIRTH")}</span><strong>{profile?.date_of_birth || "Not provided"}</strong></div>
                      <div><span>{t("COUNTRY")}</span><strong>{profile?.country_code?.trim() || "Not provided"}</strong></div>
                      <div><span>{t("ADDRESS")}</span><strong>{[profile?.address_line1, profile?.city, profile?.region].filter(Boolean).join(", ") || "Not provided"}</strong></div>
                      <div><span>{t("PROFILE COMPLETION")}</span><strong>{completion(profile)}%</strong></div>
                      <div><span>{t("CUSTOMER KYC STATUS")}</span><strong className="kyc-capitalize">{verification?.status || "not started"}</strong></div>
                    </div>
                    <div className="kyc-file-row">
                      <div><FileText size={16}/><span><strong>{doc.file_name}</strong><small>{doc.content_type} · {(Number(doc.file_size_bytes) / 1024 / 1024).toFixed(2)} MB</small></span></div>
                      {url ? <Link href={url} target="_blank" rel="noreferrer"><ExternalLink size={14}/> {t("Open private document")}</Link> : <span className="kyc-file-unavailable">{t("Preview unavailable")}</span>}
                    </div>
                    {(() => {
                      const attempt = attemptMap.get(doc.id);
                      return attempt ? (
                        <div className="kyc-automated-result">
                          <div><span>{t("VERIFICATION PROVIDER")}</span><strong>{attempt.provider === "persona_sandbox" ? "Persona" : "Nexora verification workflow"}</strong></div>
                          <div><span>{t("PROVIDER STATUS")}</span><strong>{attempt.status.replaceAll("_", " ")}</strong></div>
                          <div><span>{t("DOCUMENT CHECK")}</span><strong>{attempt.document_authenticity_status.replaceAll("_", " ")}</strong></div>
                          <div><span>{t("LIVENESS CHECK")}</span><strong>{attempt.liveness_status.replaceAll("_", " ")}</strong></div>
                          <p>{attempt.result_summary || "No additional provider result."}</p>
                        </div>
                      ) : <p className="kyc-automated-result-empty">{t("No automated verification attempt has been started.")}</p>;
                    })()}
                    {doc.review_status === "rejected" && doc.rejection_reason && <div className="kyc-rejection-note"><strong>{t("Recorded rejection reason")}</strong><p>{doc.rejection_reason}</p></div>}
                    {canReview && <div className="kyc-review-actions">
                      {doc.review_status === "submitted" && <form action={reviewIdentityDocument}><input type="hidden" name="document_id" value={doc.id}/><button name="decision" value="under_review" type="submit" className="kyc-secondary-button">{t("Mark under review")}</button></form>}
                      <form action={reviewIdentityDocument}><input type="hidden" name="document_id" value={doc.id}/><button name="decision" value="verified" type="submit" className="kyc-approve-button">{t("Verify document")}</button></form>
                      <form action={reviewIdentityDocument} className="kyc-reject-form"><input type="hidden" name="document_id" value={doc.id}/><textarea name="rejection_reason" minLength={8} maxLength={500} placeholder={t("Explain what is wrong and what the customer should correct")} required/><button name="decision" value="rejected" type="submit" className="kyc-reject-button">{t("Reject with reason")}</button></form>
                    </div>}
                  </article>
                );
              })}
            </div>}
        </section>
      </section>
    </main>
  );
}
