import Link from "next/link";
import { cookies } from "next/headers";
import type { SupportedLocale } from "@/lib/locale";
import { pageText } from "@/lib/page-translations";
import { signIn } from "@/app/auth/actions";

type Props = { searchParams: Promise<{ error?: string; success?: string; next?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const locale = ((await cookies()).get("nexora_locale")?.value || "en") as SupportedLocale;
  const t = (value: string) => pageText(locale, value);
  const params = await searchParams;
  return (
    <main className="auth-page">
      <div className="auth-panel">
        <Link className="brand" href="/"><span className="brand-mark">N</span><span>NEXORA<span className="brand-light"> BANK</span></span></Link>
        <div className="auth-kicker">{t("WELCOME BACK")}</div>
        <h1>{t("Good to have")}<br /><em>{t("you back.")}</em></h1>
        <p className="auth-intro">{t("Sign in to access your Nexora account.")}</p>
        {params.error && <p className="form-message error" role="alert">{t(params.error)}</p>}
        {params.success && <p className="form-message success" role="status">{params.success}</p>}
        <form action={signIn} className="auth-form">
          <input type="hidden" name="next" value={params.next ?? "/dashboard"} />
          <label htmlFor="email">{t("Email address")}</label>
          <input id="email" name="email" type="email" autoComplete="email" placeholder={t("you@example.com")} required />
          <div className="auth-password-label"><label htmlFor="password">{t("Password")}</label><Link href="/forgot-password">Forgot password?</Link></div>
          <input id="password" name="password" type="password" autoComplete="current-password" minLength={8} required />
          <button className="auth-submit" type="submit">{t("Sign in")} <span>↗</span></button>
        </form>
        <p className="auth-switch">{t("New to Nexora?")} <Link href="/register">{t("Create an account")}</Link></p>
      
      </div>
      <aside className="auth-aside"><div className="auth-aside-mark">N</div><p>{t("Banking should feel")}<br /><em>{t("clear, calm and in control.")}</em></p><span>{t("THE NEXORA EXPERIENCE")}</span></aside>
    </main>
  );
}
