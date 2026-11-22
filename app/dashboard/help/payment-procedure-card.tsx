"use client";

import { useState } from "react";
import { acknowledgePaymentProcedure } from "./actions";

type Procedure = {
  id: string;
  cryptocurrency: string;
  network: string;
  wallet_address: string;
  expected_amount: string | number;
  amount_currency: string;
  payment_reference: string;
  purpose: string;
  status: string;
  customer_acknowledged_at: string | null;
  created_at: string;
  cancellation_reason: string | null;
};

export function PaymentProcedureCard({procedure,conversationId}:{procedure:Procedure;conversationId:string}) {
  const [copied,setCopied] = useState(false);
  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(procedure.wallet_address);
      setCopied(true);
      window.setTimeout(()=>setCopied(false),1800);
    } catch {
      setCopied(false);
    }
  }
  return <article className="support-payment-card">
    <div className="support-payment-heading"><span>PAYMENT INSTRUCTION</span><strong>{procedure.status.replaceAll("_"," ")}</strong></div>
    <p>{procedure.status==="cancelled" ? "This payment instruction has been cancelled. Do not send funds to the address below." : "Review the payment details carefully. Only send the exact asset over the selected network."}</p>
    <dl>
      <div><dt>Cryptocurrency</dt><dd>{procedure.cryptocurrency}</dd></div>
      <div><dt>Network</dt><dd>{procedure.network}</dd></div>
      <div><dt>Expected amount</dt><dd>{String(procedure.expected_amount)} {procedure.amount_currency}</dd></div>
      <div><dt>Payment reference</dt><dd>{procedure.payment_reference}</dd></div>
      <div><dt>Purpose</dt><dd>{procedure.purpose}</dd></div>
    </dl>
    <div className="support-payment-address"><span>Receiving wallet address</span><code>{procedure.wallet_address}</code><button type="button" onClick={copyAddress} disabled={procedure.status==="cancelled"}>{copied?"Copied":"Copy address"}</button></div>
    <div className="support-payment-warning">Security notice: Nexora staff will never ask for your password, one-time codes, private keys or recovery phrase. Never share them.</div>
    {procedure.status==="awaiting_payment" && <form action={acknowledgePaymentProcedure}><input type="hidden" name="procedure_id" value={procedure.id}/><input type="hidden" name="conversation_id" value={conversationId}/><button type="submit" disabled={Boolean(procedure.customer_acknowledged_at)}>{procedure.customer_acknowledged_at?"Details acknowledged":"I have read and understood these details"}</button></form>}
    {procedure.status==="cancelled" && procedure.cancellation_reason && <small>Cancellation reason: {procedure.cancellation_reason}</small>}
    <small>Issued {new Date(procedure.created_at).toLocaleString()}</small>
  </article>;
}
