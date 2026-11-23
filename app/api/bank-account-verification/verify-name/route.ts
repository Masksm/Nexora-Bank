import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const ibanCountries = new Set([
  "AT","BE","HR","CY","EE","FI","FR","DE","GR","IE","IT","LV","LT","LU",
  "MT","NL","PT","SK","SI","ES","GB",
]);

function validIban(value: string) {
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(value)) return false;
  const rearranged = value.slice(4) + value.slice(0, 4);
  let remainder = 0;
  for (const character of rearranged) {
    const digits = character >= "A" && character <= "Z"
      ? String(character.charCodeAt(0) - 55)
      : character;
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

function normalizeName(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en").replace(/[^a-z0-9]/g, "");
}

async function verifyNigeriaAccount(input: {
  accountNumber: string; bankName: string; recipientName: string;
}) {
  const apiKey = process.env.MONNIFY_API_KEY;
  const secretKey = process.env.MONNIFY_SECRET_KEY;
  if (!apiKey || !secretKey) {
    return NextResponse.json({
      error: "Live Nigerian account-name enquiry is not configured yet. Add the Monnify production API credentials to the server environment.",
      code: "PROVIDER_NOT_CONFIGURED",
    }, { status: 503 });
  }

  const baseUrl = "https://api.monnify.com";
  const auth = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${apiKey}:${secretKey}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const authData = await auth.json() as {
    requestSuccessful?: boolean; responseCode?: string;
    responseBody?: { accessToken?: string };
  };
  const token = authData.responseBody?.accessToken;
  if (!auth.ok || !authData.requestSuccessful || !token) {
    return NextResponse.json({ error: "The Nigerian bank verification provider could not authenticate.", code: "PROVIDER_AUTH_FAILED" }, { status: 502 });
  }

  const banksResponse = await fetch(`${baseUrl}/api/v1/banks`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const banksData = await banksResponse.json() as {
    requestSuccessful?: boolean;
    responseBody?: Array<{ name?: string; code?: string }>;
  };
  if (!banksResponse.ok || !banksData.requestSuccessful || !Array.isArray(banksData.responseBody)) {
    return NextResponse.json({ error: "The Nigerian bank directory is temporarily unavailable.", code: "BANK_DIRECTORY_UNAVAILABLE" }, { status: 503 });
  }

  const bank = banksData.responseBody.find(item =>
    normalizeName(item.name || "") === normalizeName(input.bankName)
  );
  if (!bank?.code) {
    return NextResponse.json({ error: "That bank was not found in the provider's current Nigerian bank directory. Select the official bank name and try again.", code: "BANK_NOT_SUPPORTED" }, { status: 422 });
  }

  const params = new URLSearchParams({ accountNumber: input.accountNumber, bankCode: bank.code });
  const verifyResponse = await fetch(`${baseUrl}/api/v2/disbursements/account/validate?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const verifyData = await verifyResponse.json() as {
    requestSuccessful?: boolean; responseCode?: string; responseMessage?: string;
    responseBody?: { accountNumber?: string; accountName?: string; bankCode?: string; bankName?: string };
  };
  const accountName = verifyData.responseBody?.accountName?.trim();
  if (!verifyResponse.ok || !verifyData.requestSuccessful || verifyData.responseCode !== "0" || !accountName) {
    return NextResponse.json({
      error: verifyData.responseMessage || "The bank could not confirm this account. Check the account number and bank, then retry.",
      code: "ACCOUNT_NOT_CONFIRMED",
    }, { status: 422 });
  }

  const match = normalizeName(accountName) === normalizeName(input.recipientName);
  return NextResponse.json({
    status: match ? "match" : "no_match",
    nameMatch: match ? "yes" : "no",
    accountName,
    bankName: verifyData.responseBody?.bankName || bank.name,
    accountNumber: input.accountNumber,
    provider: "Monnify Live Name Enquiry",
    sandbox: false,
    message: match
      ? "The bank returned this account-holder name and it matches the name entered."
      : "The bank returned a different account-holder name. Review it before proceeding.",
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });

  let body: {
    beneficiaryId?: string;
    consent?: boolean;
    manualRecipient?: {
      countryCode?: string; name?: string; iban?: string;
      accountNumber?: string; bankName?: string;
    };
  };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (body.consent !== true) {
    return NextResponse.json({ error: "Consent is required before sending recipient details to the verification provider." }, { status: 400 });
  }

  let countryCode = "";
  let name = "";
  let iban = "";
  let accountNumber = "";
  let bankName = "";
  if (body.beneficiaryId) {
    const beneficiaryId = String(body.beneficiaryId);
    if (!/^[0-9a-f-]{36}$/i.test(beneficiaryId)) {
      return NextResponse.json({ error: "Select a valid beneficiary." }, { status: 400 });
    }
    const { data: beneficiary, error } = await supabase.from("beneficiaries")
      .select("beneficiary_name,iban,country_code,account_number,bank_name")
      .eq("id", beneficiaryId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error || !beneficiary) return NextResponse.json({ error: "Beneficiary not found." }, { status: 404 });
    countryCode = String(beneficiary.country_code || "").toUpperCase();
    name = beneficiary.beneficiary_name;
    iban = String(beneficiary.iban || "").replace(/\s/g, "").toUpperCase();
    accountNumber = String(beneficiary.account_number || "");
    bankName = String(beneficiary.bank_name || "");
  } else {
    countryCode = String(body.manualRecipient?.countryCode || "").toUpperCase();
    name = String(body.manualRecipient?.name || "").trim().slice(0, 100);
    iban = String(body.manualRecipient?.iban || "").replace(/\s/g, "").toUpperCase();
    accountNumber = String(body.manualRecipient?.accountNumber || "").replace(/\D/g, "");
    bankName = String(body.manualRecipient?.bankName || "").trim().slice(0, 120);
  }

  if (name.length < 2) {
    return NextResponse.json({ error: "Enter the recipient account-holder name." }, { status: 400 });
  }

  if (countryCode === "NG") {
    if (!/^\d{10}$/.test(accountNumber) || !bankName) {
      return NextResponse.json({ error: "Enter a valid 10-digit Nigerian account number and select a bank." }, { status: 400 });
    }
    try {
      return await verifyNigeriaAccount({ accountNumber, bankName, recipientName: name });
    } catch {
      return NextResponse.json({ error: "The live Nigerian account-name service could not be reached. Try again." }, { status: 503 });
    }
  }

  if (!ibanCountries.has(countryCode)) {
    return NextResponse.json({
      error: "Live account-name confirmation is not currently available for this country's account format. Basic format checks are not bank confirmation.",
      code: "COUNTRY_NOT_SUPPORTED",
    }, { status: 422 });
  }
  if (iban.slice(0, 2) !== countryCode || !validIban(iban)) {
    return NextResponse.json({ error: "Enter a valid recipient IBAN for the selected country." }, { status: 400 });
  }

  const apiKey = process.env.IBAN_BAV_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      error: "Live IBAN name confirmation is not configured. The production IBAN.com BAV service requires an active production API key.",
      code: "PROVIDER_NOT_CONFIGURED",
    }, { status: 503 });
  }

  try {
    const response = await fetch("https://api.iban.com/clients/api/verify/v3/", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ IBAN: iban, name }),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    const result = await response.json() as {
      query?: { success?: boolean };
      result?: { valid?: boolean | null; name_match?: "yes" | "partial" | "no" | "unavailable"; bic?: string };
      error?: string;
    };

    if (!response.ok || result.query?.success === false) {
      const messages: Record<string, string> = {
        INVALID_IBAN_CHECKSUM: "The IBAN checksum is invalid.",
        COUNTRY_NOT_SUPPORTED: "This country is not covered by the live IBAN verification service.",
        MISSING_INPUT_NAME: "Enter the recipient account-holder name.",
        MISSING_INPUT_IBAN: "Enter a valid IBAN.",
      };
      return NextResponse.json({
        error: messages[result.error || ""] || "The live IBAN verification provider rejected this request.",
        code: result.error || "PROVIDER_ERROR",
      }, { status: 422 });
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
      provider: "IBAN.com Live Verification of Payee",
      sandbox: false,
      message: nameMatch === "yes"
        ? "The recipient bank confirmed an exact name match."
        : nameMatch === "partial"
          ? "The recipient bank returned a partial name match. Review the details carefully."
          : nameMatch === "no"
            ? "The recipient bank reported that the supplied name does not match."
            : "The recipient bank could not confirm the name at this time.",
    });
  } catch {
    return NextResponse.json({ error: "The live IBAN verification service could not be reached. Try again." }, { status: 503 });
  }
}
