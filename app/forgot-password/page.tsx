import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { SupportedLocale } from "@/lib/locale";
import { pageText } from "@/lib/page-translations";
import { createClient } from "@/lib/supabase/server";
import {
  sendPasswordRecoveryCode,
  updateRecoveredPassword,
} from "@/app/auth/actions";
import RecoveryCodeForm from "@/app/forgot-password/recovery-code-form";

type Props = { searchParams: Promise<{ step?: string; error?: string }> };

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage({ searchParams }: Props) {
  const locale = ((await cookies()).get("nexora_locale")?.value || "en") as SupportedLocale;
  const t = (value: string) => pageText(locale, value);
  const params = await searchParams;
  const cookieStore = await cookies();
  const hasRecoveryEmail = Boolean(cookieStore.get("nexora_recovery_email")?.value);
  const recoveryExpiresAt = Number(cookieStore.get("nexora_recovery_expires_at")?.value ?? 0);
  const verified = cookieStore.get("nexora_recovery_verified")?.value === "1";
  const step = params.step === "update" && verified ? "update"
    : params.step === "verify" && hasRecoveryEmail ? "verify" : "request";

  if (params.step === "verify" && !hasRecoveryEmail) {
    redirect("/forgot-password?step=request&error=Your%20recovery%20code%20has%20expired.%20Request%20a%20new%20code.");
  }

  if (step === "update") {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/forgot-password?step=request&error=Your%20recovery%20session%20expired.%20Request%20a%20new%20code.");
  }

  return (
    <main className="auth-page">
      <div className="auth-panel">
        <Link className="brand" href="/"><span className="brand-mark">N</span><span>NEXORA<span className="brand-light"> BANK</span></span></Link>
        <div className="auth-kicker">ACCOUNT RECOVERY</div>
        <h1>{step === "request" ? <>Reset your<br /><em>password.</em></> : step === "verify" ? <>Check your<br /><em>email.</em></> : <>Choose a new<br /><em>password.</em></>}</h1>
        <p className="auth-intro">{step === "request" ? "Enter the email address registered to your Nexora account." : step === "verify" ? "Enter the six-digit recovery code sent to your registered email." : "Your email has been verified. Set a new password for your account."}</p>
        {params.error && <p className="form-message error" role="alert">{params.error}</p>}
        {step === "request" ? (
          <form action={sendPasswordRecoveryCode} className="auth-form">
            <label htmlFor="email">{t("Email address")}</label>
            <input id="email" name="email" type="email" autoComplete="email" placeholder={t("you@example.com")} required />
            <button className="auth-submit" type="submit">Send recovery code <span>↗</span></button>
          </form>
        ) : step === "verify" ? (
          <RecoveryCodeForm expiresAt={recoveryExpiresAt} />
        ) : (
          <form action={updateRecoveredPassword} className="auth-form">
            <label htmlFor="password">New password</label>
            <input id="password" name="password" type="password" minLength={10} autoComplete="new-password" required />
            <label htmlFor="confirmPassword">Confirm new password</label>
            <input id="confirmPassword" name="confirmPassword" type="password" minLength={10} autoComplete="new-password" required />
            <button className="auth-submit" type="submit">Update password <span>↗</span></button>
          </form>
        )}
        <p className="auth-switch"><Link href="/login">Return to sign in</Link></p>
      </div>
      <aside className="auth-aside"><div className="auth-aside-mark">N</div><p>Security starts with<br /><em>verified access.</em></p><span>THE NEXORA EXPERIENCE</span></aside>
    </main>
  );
}
