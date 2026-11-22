import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: cors });

function decimalUnits(value: string | number, decimals: number): bigint | null {
  const raw = String(value).trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(raw)) return null;
  const [whole, fraction = ""] = raw.split(".");
  if (fraction.length > decimals) return null;
  return BigInt(whole) * (10n ** BigInt(decimals)) + BigInt((fraction + "0".repeat(decimals)).slice(0, decimals) || "0");
}

async function verifyTron(address: string, txHash: string, expected: string) {
  const contract = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
  const url = new URL(`https://api.trongrid.io/v1/accounts/${encodeURIComponent(address)}/transactions/trc20`);
  url.searchParams.set("only_confirmed", "true");
  url.searchParams.set("limit", "200");
  url.searchParams.set("contract_address", contract);
  url.searchParams.set("order_by", "block_timestamp,desc");
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`TRON explorer returned HTTP ${response.status}.`);
  const payload = await response.json();
  const transfers = (payload.data ?? []).filter((item: any) =>
    String(item.transaction_id ?? "").toLowerCase() === txHash.toLowerCase()
  );
  if (!transfers.length) return { state: "not_found", confirmations: 0, detail: "Transaction was not found in the confirmed TRC-20 history for this receiving address." };
  const expectedUnits = decimalUnits(expected, 6);
  const allMatch = transfers.every((item: any) =>
    String(item.token_info?.address ?? "") === contract && String(item.to ?? "") === address
  );
  const receivedUnits = transfers.reduce((sum: bigint, item: any) => {
    const units = decimalUnits(String(item.value ?? ""), 6);
    return sum + (units ?? 0n);
  }, 0n);
  if (!allMatch || expectedUnits === null || receivedUnits !== expectedUnits) {
    return { state: "mismatch", confirmations: 1, detail: "The transaction exists, but its token contract, receiving address or total amount does not match this payment instruction." };
  }
  return { state: "verified", confirmations: 1, detail: "Confirmed USDT TRC-20 transfer matched the payment instruction. TRON solidified transaction history was used." };
}

async function verifyBitcoin(address: string, txHash: string, expected: string) {
  const response = await fetch(`https://mempool.space/api/tx/${encodeURIComponent(txHash)}`, { headers: { accept: "application/json" } });
  if (response.status === 404) return { state: "not_found", confirmations: 0, detail: "Transaction hash was not found on Bitcoin mainnet." };
  if (!response.ok) throw new Error(`Bitcoin explorer returned HTTP ${response.status}.`);
  const tx = await response.json();
  const matchingOutputs = (tx.vout ?? []).filter((output: any) => output.scriptpubkey_address === address);
  if (!matchingOutputs.length) return { state: "mismatch", confirmations: 0, detail: "The transaction does not pay the receiving Bitcoin address in this instruction." };
  const receivedSats = matchingOutputs.reduce((sum: bigint, output: any) => {
    const amount = Number(output.value);
    return sum + (Number.isSafeInteger(amount) && amount >= 0 ? BigInt(amount) : 0n);
  }, 0n);
  const expectedSats = decimalUnits(expected, 8);
  if (expectedSats === null || receivedSats !== expectedSats) {
    return { state: "mismatch", confirmations: 0, detail: "The Bitcoin outputs to the receiving address do not equal the exact expected BTC amount." };
  }
  let confirmations = 0;
  if (tx.status?.confirmed && Number.isInteger(tx.status.block_height)) {
    const tipResponse = await fetch("https://mempool.space/api/blocks/tip/height");
    if (!tipResponse.ok) throw new Error("Could not retrieve the Bitcoin confirmation height.");
    const tip = Number(await tipResponse.text());
    confirmations = Math.max(0, tip - Number(tx.status.block_height) + 1);
  }
  return {
    state: confirmations >= 2 ? "verified" : "pending",
    confirmations,
    detail: confirmations >= 2
      ? "Bitcoin transaction is confirmed and the exact amount reached the receiving address."
      : "The transaction is visible, but it has not reached the required two Bitcoin confirmations.",
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed." });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token || token === authHeader) return json(401, { error: "Sign in to verify a payment." });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    const user = authData.user;
    if (authError || !user) return json(401, { error: "Your session is invalid. Sign in again." });
    if ((user.app_metadata as any)?.role && (user.app_metadata as any).role !== "customer") {
      return json(403, { error: "Only the customer who received this payment instruction can submit its transaction hash." });
    }

    const body = await req.json();
    const procedureId = String(body.procedure_id ?? "");
    const txHash = String(body.transaction_hash ?? "").trim();
    if (!/^[a-fA-F0-9]{64}$/.test(txHash) || !procedureId) {
      return json(400, { error: "Enter a valid 64-character transaction hash." });
    }

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: procedure, error: procedureError } = await admin
      .from("support_payment_procedures")
      .select("id,conversation_id,customer_user_id,cryptocurrency,network,wallet_address,expected_amount,amount_currency,status,transaction_hash,verification_status")
      .eq("id", procedureId).maybeSingle();
    if (procedureError || !procedure) return json(404, { error: "Payment instruction not found." });
    if (procedure.customer_user_id !== user.id) return json(403, { error: "This payment instruction does not belong to your account." });
    if (procedure.status !== "awaiting_payment") return json(409, { error: "This payment instruction is no longer awaiting payment." });
    if (procedure.verification_status === "verified") return json(409, { error: "This payment instruction already has a verified blockchain transaction." });

    const asset = String(procedure.cryptocurrency).toUpperCase();
    const network = String(procedure.network).toUpperCase();
    if (!((asset === "USDT" && network === "TRON (TRC20)") || (asset === "BTC" && network === "BITCOIN"))) {
      return json(400, { error: "This asset/network pair is not enabled for automatic verification." });
    }
    const { data: duplicate } = await admin.from("support_payment_procedures")
      .select("id").ilike("transaction_hash", txHash).neq("id", procedureId).limit(1).maybeSingle();
    if (duplicate) return json(409, { error: "This transaction hash has already been submitted for another payment instruction." });

    let result;
    if (asset === "USDT") {
      if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(procedure.wallet_address)) return json(400, { error: "The stored TRON receiving address has an unsupported format. Contact support." });
      result = await verifyTron(procedure.wallet_address, txHash, String(procedure.expected_amount));
    } else {
      if (!/^(bc1[ac-hj-np-z02-9]{11,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(procedure.wallet_address)) return json(400, { error: "The stored Bitcoin receiving address has an unsupported format. Contact support." });
      result = await verifyBitcoin(procedure.wallet_address, txHash, String(procedure.expected_amount));
    }

    const checkedAt = new Date().toISOString();
    const { error: updateError } = await admin.from("support_payment_procedures").update({
      verification_status: result.state,
      transaction_hash: txHash,
      verification_checked_at: checkedAt,
      verification_confirmations: result.confirmations,
      verification_result: { provider: asset === "USDT" ? "TronGrid" : "mempool.space", detail: result.detail, network, asset },
      verified_at: result.state === "verified" ? checkedAt : null,
    }).eq("id", procedureId);
    if (updateError) {
      if (updateError.code === "23505") return json(409, { error: "This transaction hash has already been used." });
      throw updateError;
    }

    await admin.from("support_payment_procedure_audit").insert({
      procedure_id: procedureId, actor_user_id: user.id, actor_role: "customer",
      action: "blockchain_verification_" + result.state,
      details: { transaction_hash: txHash, provider: asset === "USDT" ? "TronGrid" : "mempool.space", confirmations: result.confirmations, detail: result.detail, checked_at: checkedAt },
    });
    const message = result.state === "verified"
      ? `BLOCKCHAIN PAYMENT VERIFIED\nThe transaction was independently checked against public ${network} records. The exact asset, receiving address and amount matched. Confirmations: ${result.confirmations}. A staff member will complete the payment review. This verification does not itself credit a bank balance.`
      : result.state === "pending"
        ? `BLOCKCHAIN PAYMENT DETECTED, AWAITING CONFIRMATIONS\n${result.detail} Current confirmations: ${result.confirmations}. Nexora will not mark this payment as verified until the confirmation requirement is met.`
        : result.state === "mismatch"
          ? `PAYMENT COULD NOT BE MATCHED\n${result.detail} No payment has been confirmed.`
          : `TRANSACTION NOT FOUND\n${result.detail} Check the transaction hash and network, then try again.`;
    await admin.from("support_messages").insert({
      conversation_id: procedure.conversation_id, sender_user_id: null, sender_role: "system", body: message,
    });
    return json(200, { status: result.state, confirmations: result.confirmations, message: result.detail });
  } catch (error) {
    console.error("verify-crypto-payment failed", error);
    return json(502, { error: error instanceof Error ? error.message : "Blockchain verification is temporarily unavailable. Try again later." });
  }
});
