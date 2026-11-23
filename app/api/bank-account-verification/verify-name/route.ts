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

  const providersAttempted: string[] = [];

  // Provider 1: IBANTEST. Its API key is optional at deployment time,
  // but the service itself requires a registered key with free credits.
  const ibanTestKey = process.env.IBANTEST_API_KEY;
  if (ibanTestKey) {
    providersAttempted.push("IBANTEST");
    try {
      const response = await fetch(
        `https://api.ibantest.com/v1/validate-iban/${encodeURIComponent(iban)}`,
        {
          headers: {
            Authorization: `Bearer ${ibanTestKey}`,
            Accept: "application/json",
          },
          cache: "no-store",
          signal: AbortSignal.timeout(12000),
        },
      );
      const result = await response.json() as {
        valid?: boolean | string;
        ibanData?: { ibanExt?: string; countryCode?: string };
        bankData?: { description?: string; bic?: string };
        countryData?: { name?: string };
      };
      if (response.ok && typeof result.valid !== "undefined") {
        const valid = result.valid === true || result.valid === "true";
        return NextResponse.json({
          status: valid ? "valid" : "invalid",
          valid,
          provider: "IBANTEST",
          sandbox: false,
          bankName: result.bankData?.description || null,
          bic: result.bankData?.bic || null,
          formattedIban: result.ibanData?.ibanExt || iban,
          countryName: result.countryData?.name || null,
          providersAttempted,
          message: valid
            ? "The IBAN passed the provider's format, checksum and available bank-reference checks. This does not prove that the individual account is open or currently able to receive funds."
            : "The IBAN failed one or more validation checks. Correct the recipient details before continuing.",
        });
      }
    } catch {
      // Try the next configured provider.
    }
  }

  // Provider 2: IBANforge. Its keyless trial is used when no key is
  // configured; a free API key can be added later without code changes.
  providersAttempted.push("IBANforge");
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (process.env.IBANFORGE_API_KEY) {
      headers.Authorization = `Bearer ${process.env.IBANFORGE_API_KEY}`;
    }
    const response = await fetch("https://api.ibanforge.com/v1/iban/validate", {
      method: "POST",
      headers,
      body: JSON.stringify({ iban }),
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    const result = await response.json() as {
      valid?: boolean;
      error?: string;
      error_detail?: string;
      formatted?: string;
      bic?: { code?: string; bank_name?: string };
      bank_code_check?: { status?: string; register?: string; authoritative?: boolean };
      country?: { name?: string; code?: string };
      attribution?: { text?: string; url?: string };
    };
    if (response.ok && typeof result.valid === "boolean") {
      return NextResponse.json({
        status: result.valid ? "valid" : "invalid",
        valid: result.valid,
        provider: "IBANforge",
        sandbox: false,
        bankName: result.bic?.bank_name || null,
        bic: result.bic?.code || null,
        formattedIban: result.formatted || iban,
        countryName: result.country?.name || null,
        bankCodeStatus: result.bank_code_check?.status || "unknown",
        bankCodeRegister: result.bank_code_check?.register || null,
        bankCodeAuthoritative: result.bank_code_check?.authoritative ?? null,
        attribution: result.attribution || {
          text: "Powered by IBANforge",
          url: "https://ibanforge.com",
        },
        providersAttempted,
        message: result.valid
          ? "The IBAN passed format and checksum validation. Bank-reference information is shown separately where available. This does not prove that the individual account exists or is open."
          : result.error_detail || "The IBAN failed validation. Correct the recipient details before continuing.",
      });
    }
  } catch {
    // Try the sandbox fallback.
  }

  // Provider 3: IBAN.com Sandbox. This is deliberately reported as a
  // simulation, never as a real validation or bank confirmation.
  providersAttempted.push("IBAN.com Sandbox");
  try {
    const response = await fetch("https://sandbox.iban.com/clients/api/verify/v3/", {
      method: "POST",
      headers: {
        "x-api-key": "testkey",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ IBAN: iban, name }),
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    const result = await response.json() as {
      query?: { success?: boolean };
      result?: { valid?: boolean | null; name_match?: "yes" | "partial" | "no" | "unavailable"; bic?: string };
      error?: string;
    };
    if (response.ok && result.query?.success && result.result) {
      return NextResponse.json({
        status: "sandbox",
        valid: null,
        sandboxResult: result.result.valid ?? null,
        nameMatch: result.result.name_match || "unavailable",
        bic: result.result.bic || null,
        provider: "IBAN.com Sandbox",
        sandbox: true,
        providersAttempted,
        message: "The sandbox returned a simulated test response. It does not confirm that this recipient's real account exists, is open, or can receive a payment.",
      });
    }
  } catch {
    // All providers are unavailable; report this without guessing.
  }

  return NextResponse.json({
    status: "unavailable",
    valid: null,
    provider: null,
    sandbox: false,
    providersAttempted,
    error: "IBAN validation services are temporarily unavailable. No validation result was obtained. Try again later.",
    code: "ALL_PROVIDERS_UNAVAILABLE",
  }, { status: 503 });
}
