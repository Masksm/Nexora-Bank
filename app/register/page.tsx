import Link from "next/link";
import { signUp } from "@/app/auth/actions";

type Props = { searchParams: Promise<{ error?: string; success?: string }> };

export default async function RegisterPage({ searchParams }: Props) {
  const params = await searchParams;
  return (
    <main className="auth-page">
      <div className="auth-panel">
        <Link className="brand" href="/"><span className="brand-mark">N</span><span>NEXORA<span className="brand-light"> BANK</span></span></Link>
        <div className="auth-kicker">GET STARTED</div>
        <h1>A better way<br /><em>to manage money.</em></h1>
        <p className="auth-intro">Create your Nexora profile in a few steps.</p>
        {params.error && <p className="form-message error" role="alert">{params.error}</p>}
        {params.success && <p className="form-message success" role="status">{params.success}</p>}
        <form action={signUp} className="auth-form">
          <label htmlFor="fullName">Full name</label>
          <input id="fullName" name="fullName" type="text" autoComplete="name" placeholder="Your full name" minLength={2} required />
          <label htmlFor="email">Email address</label>
          <input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
          <label htmlFor="password">Create password</label>
          <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
          <label htmlFor="confirmPassword">Confirm password</label>
          <input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={10} required />
          <button className="auth-submit" type="submit">Create account <span>↗</span></button>
        </form>
        <p className="auth-switch">Already have an account? <Link href="/login">Sign in</Link></p>

      </div>
      <aside className="auth-aside"><div className="auth-aside-mark">N</div><p>Your finances,<br /><em>with room to breathe.</em></p><span>THE NEXORA EXPERIENCE</span></aside>
    </main>
  );
}
