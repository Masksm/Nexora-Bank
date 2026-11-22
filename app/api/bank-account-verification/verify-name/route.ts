import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const supportedCountries = new Set([
  "AT","BE","HR","CY","EE","FI","FR","DE","GR","IE","IT","LV","LT","LU",
  "MT","NL","PT","SK","SI","ES","GB",
]);

function validIban(value: string) {
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(value)) return false;
  const rearranged = value.slice(4) + value.slice(0, 4);
  let remainder = 0;
  for (const character of rearranged) {
    const digits = character >= "A" && character <= "Z" ? String(character.charCodeAt(0) - 55) : character;
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });

  let body: { beneficiaryId?: string; consent?: boolean };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const beneficiaryId = String(body.beneficiaryId || "");
  if (!/^[0-9a-f-]{36}$/i.test(beneficiaryId)) {
    return NextResponse.json({ error: "Select a valid beneficiary." }, { status: 400 });
  }
  if (body.consent !== true) {
    return NextResponse.json({ error: "Consent is required before sending the IBAN and recipient name to the verification provider." }, { status: 400 });
  }

  const { data: beneficiary, error } = await supabase.from("beneficiaries")
    .select("beneficiary_name,iban,country_code")
    .eq("id", beneficiaryId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !beneficiary) return NextResponse.json({ error: "Beneficiary not found." }, { status: 404 });
  if (!beneficiary.iban || !supportedCountries.has(beneficiary.country_code)) {
    return NextResponse.json({ error: "Account-name verification is currently available for IBANs from the UK and 20 SEPA countries." }, { status: 400 });
  }
  if (beneficiary.iban.slice(0, 2) !== beneficiary.country_code || !validIban(beneficiary.iban)) {
    return NextResponse.json({ error: "Enter a valid IBAN before checking the account-holder name." }, { status: 400 });
  }

  try {
    const response = await fetch("https://sandbox.iban.com/clients/api/verify/v3/", {
      method: "POST",
      headers: {
        "x-api-key": "testkey",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ IBAN: beneficiary.iban, name: beneficiary.beneficiary_name }),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    const result = await response.json() as {
      query?: { success?: boolean };
      result?: { valid?: boolean | null; name_match?: "yes" | "partial" | "no" | "unavailable"; bic?: string };
      error?: string;
    };

    if (!response.ok) {
      const messages: Record<string,string> = {
        SANDBOX_NOT_SUPPORTED_IBAN: "No account-name result is available for this IBAN.",
        INVALID_IBAN_CHECKSUM: "The IBAN checksum is invalid.",
        COUNTRY_NOT_SUPPORTED: "This country is not supported by the verification sandbox.",
        MISSING_INPUT_NAME: "Enter the recipient account-holder name.",
        MISSING_INPUT_IBAN: "Enter a valid IBAN.",
      };
      return NextResponse.json({ error: messages[result.error || ""] || "The verification sandbox rejected this request.", providerCode: result.error }, { status: 422 });
    }

    const nameMatch = result.result?.name_match || "unavailable";
    const status = nameMatch === "yes" ? "match"
      : nameMatch === "partial" ? "partial_match"
      : nameMatch === "no" ? "no_match" : "unavailable";

    return NextResponse.json({
      status,
      nameMatch,
      valid: result.result?.valid ?? null,
      bic: result.result?.bic || null,
      provider: "IBAN.com BAV Sandbox",
      sandbox: true,
    });
  } catch {
    return NextResponse.json({ error: "The account-name service could not be reached. Try again." }, { status: 503 });
  }
}
