import Link from "next/link";
import { cookies } from "next/headers";
import type { SupportedLocale } from "@/lib/locale";
import { pageText } from "@/lib/page-translations";
import { signUp } from "@/app/auth/actions";

type Props = { searchParams: Promise<{ error?: string; success?: string }> };

export default async function RegisterPage({ searchParams }: Props) {
  const locale = ((await cookies()).get("nexora_locale")?.value || "en") as SupportedLocale;
  const t = (value: string) => pageText(locale, value);
  const params = await searchParams;
  return (
    <main className="auth-page">
      <div className="auth-panel">
        <Link className="brand" href="/"><span className="brand-mark">N</span><span>NEXORA<span className="brand-light"> BANK</span></span></Link>
        <div className="auth-kicker">{t("GET STARTED")}</div>
        <h1>{t("A better way")}<br /><em>{t("to manage money.")}</em></h1>
        <p className="auth-intro">{t("Create your Nexora profile in a few steps.")}</p>
        {params.error && <p className="form-message error" role="alert">{t(params.error)}</p>}
        {params.success && <p className="form-message success" role="status">{t(params.success)}</p>}
        <form action={signUp} className="auth-form">
          <label htmlFor="fullName">{t("Full name")}</label>
          <input id="fullName" name="fullName" type="text" autoComplete="name" placeholder={t("Your full name")} minLength={2} required />
          <label htmlFor="email">{t("Email address")}</label>
          <input id="email" name="email" type="email" autoComplete="email" placeholder={t("you@example.com")} required />
          <label htmlFor="password">{t("Create password")}</label>
          <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
          <label htmlFor="confirmPassword">{t("Confirm password")}</label>
          <input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={10} required />
          <button className="auth-submit" type="submit">{t("Create account")} <span>↗</span></button>
        </form>
        <p className="auth-switch">{t("Already have an account?")} <Link href="/login">{t("Sign in")}</Link></p>

      </div>
      <aside className="auth-aside"><div className="auth-aside-mark">N</div><p>{t("Your finances,")}<br /><em>{t("with room to breathe.")}</em></p><span>{t("THE NEXORA EXPERIENCE")}</span></aside>
    </main>
  );
}
