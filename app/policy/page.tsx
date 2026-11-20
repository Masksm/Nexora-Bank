import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";

export const metadata = {
  title: "Policies | Nexora Bank",
  description: "Important information about Nexora Bank account records and service limitations.",
};

export default function PolicyPage() {
  return (
    <main className="workspace-shell policy-shell">
      <header className="workspace-header">
        <Link href="/" className="workspace-back"><ArrowLeft size={16}/> Back to Nexora</Link>
        <span className="workspace-overline">NEXORA BANK · POLICIES</span>
      </header>
      <section className="workspace-intro">
        <div><span className="workspace-kicker">IMPORTANT INFORMATION</span><h1>Service policy</h1><p>Please review the following information about the services and account records available through Nexora.</p></div>
      </section>
      <article className="workspace-panel policy-card">
        <div className="policy-section">
          <div className="policy-icon"><ShieldCheck size={20}/></div>
          <div><h2>Nature of the service</h2>
            <p>Nexora is a software-based banking interface and account-management experience. It is not a licensed bank or deposit-taking institution, and it does not provide access to regulated banking services.</p>
          </div>
        </div>
        <div className="policy-section">
          <h2>Account balances and transaction records</h2>
          <p>Balances, transfers, deposits, withdrawals, and other transaction activity displayed in Nexora are maintained within an internal ledger. They are generated or recorded within the application and do not represent funds held at a financial institution.</p>
          <p>Transactions shown in the application do not move money through external banks, card networks, payment processors, or other real-world settlement systems. A transaction record or receipt is not proof of an external payment or settlement.</p>
        </div>
        <div className="policy-section">
          <h2>No deposit protection</h2>
          <p>Funds displayed in Nexora are not deposits and are not covered by deposit insurance or a deposit-protection scheme. Do not use the application to store funds or submit credentials for another financial service.</p>
        </div>
        <div className="policy-section">
          <h2>Use of account information</h2>
          <p>Keep your sign-in credentials private and use a unique password. Account information and activity are provided for use within the Nexora application.</p>
        </div>
        <p className="policy-updated">If you continue to use Nexora, you acknowledge these service limitations.</p>
      </article>
    </main>
  );
}
