import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type PlaidAccount = { account_id?: string; owners?: Array<{ names?: string[] }> };
type PlaidAuthAccount = { account_id?: string; numbers?: { ach?: Array<{ account?: string }> } };

function normalizeName(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function plaidPost(path: string, body: Record<string, unknown>) {
  const response = await fetch(`https://sandbox.plaid.com/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.PLAID_CLIENT_ID,
      secret: process.env.PLAID_SECRET,
      ...body,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error((result as { error_message?: string }).error_message || "The bank verification request failed.");
  return result;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });

  if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET || (process.env.PLAID_ENV || "sandbox") !== "sandbox") {
    return NextResponse.json({ error: "Plaid Sandbox is not configured." }, { status: 503 });
  }

  let body: { publicToken?: string; beneficiaryId?: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const publicToken = String(body.publicToken || "");
  const beneficiaryId = String(body.beneficiaryId || "");
  if (!publicToken.startsWith("public-") || !/^[0-9a-f-]{36}$/i.test(beneficiaryId)) {
    return NextResponse.json({ error: "A valid bank connection and beneficiary are required." }, { status: 400 });
  }

  const { data: beneficiary, error } = await supabase.from("beneficiaries")
    .select("beneficiary_name,account_number,country_code")
    .eq("id", beneficiaryId).eq("user_id", user.id).maybeSingle();
  if (error || !beneficiary) return NextResponse.json({ error: "Beneficiary not found." }, { status: 404 });
  if (beneficiary.country_code !== "US" || !beneficiary.account_number) {
    return NextResponse.json({ error: "Sandbox account-name comparison is currently available for US accounts only." }, { status: 400 });
  }

  try {
    const exchange = await plaidPost("item/public_token/exchange", { public_token: publicToken }) as { access_token?: string };
    if (!exchange.access_token) throw new Error("The bank connection could not be exchanged.");

    const [identity, auth] = await Promise.all([
      plaidPost("identity/get", { access_token: exchange.access_token }) as Promise<{ accounts?: PlaidAccount[] }>,
      plaidPost("auth/get", { access_token: exchange.access_token }) as Promise<{ numbers?: { ach?: Array<{ account?: string; account_id?: string }> }; accounts?: PlaidAuthAccount[] }>,
    ]);

    const expectedAccount = String(beneficiary.account_number).replace(/\D/g, "");
    const accountId = (auth.numbers?.ach || []).find((item) =>
      String(item.account || "").replace(/\D/g, "") === expectedAccount
    )?.account_id;
    if (!accountId) {
      return NextResponse.json({
        matched: false,
        result: "account_not_matched",
        message: "The linked Sandbox account number does not match the saved beneficiary account.",
      });
    }

    const identityAccount = (identity.accounts || []).find((item) => item.account_id === accountId);
    const names = (identityAccount?.owners || []).flatMap((owner) => owner.names || []).filter(Boolean);
    const target = normalizeName(beneficiary.beneficiary_name);
    const matchedName = names.find((name) => normalizeName(name) === target) || null;

    return NextResponse.json({
      matched: Boolean(matchedName),
      result: matchedName ? "exact_name_match" : names.length ? "name_mismatch" : "owner_name_unavailable",
      matchedName,
      bankNames: names.slice(0, 3),
      message: matchedName ? "The account-holder name matched in the Sandbox identity response." : "The saved recipient name did not exactly match the Sandbox account-holder name.",
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "The bank name check failed.",
    }, { status: 502 });
  }
}
