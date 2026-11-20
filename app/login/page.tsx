import Link from "next/link";
import { signIn } from "@/app/auth/actions";

type Props = { searchParams: Promise<{ error?: string; next?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  return (
    <main className="auth-page">
      <div className="auth-panel">
        <Link className="brand" href="/"><span className="brand-mark">N</span><span>NEXORA<span className="brand-light"> BANK</span></span></Link>
        <div className="auth-kicker">WELCOME BACK</div>
        <h1>Good to have<br /><em>you back.</em></h1>
        <p className="auth-intro">Sign in to access your Nexora account.</p>
        {params.error && <p className="form-message error" role="alert">{params.error}</p>}
        <form action={signIn} className="auth-form">
          <input type="hidden" name="next" value={params.next ?? "/dashboard"} />
          <label htmlFor="email">Email address</label>
          <input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" minLength={8} required />
          <button className="auth-submit" type="submit">Sign in <span>↗</span></button>
        </form>
        <p className="auth-switch">New to Nexora? <Link href="/register">Create an account</Link></p>
        <p className="auth-footnote">Nexora is a portfolio banking application. No real funds are held or transferred.</p>
      </div>
      <aside className="auth-aside"><div className="auth-aside-mark">N</div><p>Banking should feel<br /><em>clear, calm and in control.</em></p><span>THE NEXORA EXPERIENCE</span></aside>
    </main>
  );
}
