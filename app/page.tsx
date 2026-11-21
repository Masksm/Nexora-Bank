import Link from "next/link";
import { cookies } from "next/headers";
import type { SupportedLocale } from "@/lib/locale";
import { pageText } from "@/lib/page-translations";
import {
  ArrowUpRight,
  ArrowRight,
  ShieldCheck,
  CreditCard,
  Globe2,
  Sparkles,
} from "lucide-react";

const features = [
  {
    icon: ArrowUpRight,
    title: "Move money with clarity",
    description: "A clean transfer experience with clear details at every step.",
  },
  {
    icon: CreditCard,
    title: "Cards that fit your life",
    description: "Manage virtual card details and controls from one place.",
  },
  {
    icon: ShieldCheck,
    title: "Security built in",
    description: "Account activity, session visibility and layered access controls.",
  },
];

export default async function Home() {
  const locale = ((await cookies()).get("nexora_locale")?.value || "en") as SupportedLocale;
  const t = (value: string) => pageText(locale, value);
  return (
    <main>
      <nav className="nav shell">
        <Link className="brand" href="/" aria-label="Nexora Bank home">
          <span className="brand-mark">N</span>
          <span>NEXORA<span className="brand-light"> BANK</span></span>
        </Link>
        <div className="nav-links">
          <Link href="#experience">{t("Experience")}</Link>
          <Link href="#security">{t("Security")}</Link>
        </div>
        <Link className="nav-cta" href="/login">Sign in <ArrowUpRight size={16} /></Link>
      </nav>

      <section className="hero shell">
        <div className="hero-copy">
          <div className="eyebrow"><span className="pulse" /> {t("A clearer way to bank")}</div>
          <h1>{t("Your money.")}<br /><em>{t("In better")}</em> {t("hands.")}</h1>
          <p className="hero-text">
            A considered banking experience that puts clarity, control and
            confidence at the centre of every interaction.
          </p>
          <div className="hero-actions">
            <Link className="button-primary" href="/register">{t("Open an account")} <ArrowRight size={17} /></Link>
            <Link className="text-link" href="#experience">{t("Explore Nexora")} <ArrowUpRight size={16} /></Link>
          </div>
          <div className="trust-note"><ShieldCheck size={16} /> {t("Designed around privacy and control")}</div>
        </div>

        <div className="visual-wrap" aria-label="Illustration of a Nexora digital banking card">
          <div className="visual-orbit orbit-one" />
          <div className="visual-orbit orbit-two" />
          <div className="float-label label-top"><span className="label-dot" /> {t("ACCOUNT OVERVIEW")} <span>USD</span></div>
          <div className="bank-card">
            <div className="card-top"><span className="card-brand">NEXORA</span><span className="chip" /></div>
            <div className="card-caption">{t("YOUR EVERYDAY ACCOUNT")}</div>
            <div className="card-balance">$24,680<span>.50</span></div>
            <div className="card-bottom"><span>•••• &nbsp;•••• &nbsp;•••• &nbsp; 4829</span><span className="card-network">VISA</span></div>
          </div>
          <div className="float-label label-bottom"><span className="activity-icon"><Sparkles size={15} /></span><span><b>{t("All in one place")}</b><small>{t("Money, made manageable")}</small></span></div>
          <div className="visual-caption">{t("A more thoughtful relationship with money.")}</div>
        </div>
      </section>

      <section className="feature-section" id="experience">
        <div className="shell">
          <div className="section-heading">
            <div><div className="eyebrow">{t("THE NEXORA EXPERIENCE")}</div><h2>{t("Everything important.")}<br /><em>{t("Nothing in the way.")}</em></h2></div>
            <p>{t("Everyday banking should feel straightforward. We bring the essentials together in one calm, connected experience.")}</p>
          </div>
          <div className="feature-grid">
            {features.map(({ icon: Icon, title, description }, index) => (
              <article className="feature-card" key={title}>
                <div className="feature-number">0{index + 1}</div>
                <div className="feature-icon"><Icon size={21} strokeWidth={1.7} /></div>
                <h3>{t(title)}</h3><p>{t(description)}</p>
                <ArrowUpRight className="feature-arrow" size={18} />
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="security-band" id="security">
        <div className="shell security-inner">
          <div className="security-symbol"><ShieldCheck size={25} /></div>
          <div><div className="eyebrow">{t("CONTROL IS PART OF THE DESIGN")}</div><h2>{t("Confidence, at every step.")}</h2></div>
          <p>{t("Clear activity records, thoughtful account controls and security-conscious foundations.")}</p>
          <Globe2 className="security-globe" size={58} strokeWidth={0.8} />
        </div>
      </section>

      <footer className="footer shell">
        <Link className="brand" href="/"><span className="brand-mark">N</span><span>NEXORA<span className="brand-light"> BANK</span></span></Link>
        <span>© {new Date().getFullYear()} Nexora Bank. A digital banking experience.</span>
        <Link className="footer-note" href="/policy">{t("Policies")}</Link>
      </footer>
    </main>
  );
}
