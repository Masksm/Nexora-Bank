import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const ibanLengths: Record<string, number> = {
  AD:24, AE:23, AL:28, AT:20, AZ:28, BA:20, BE:16, BG:22, BH:22, BR:29,
  CH:21, CR:22, CY:28, CZ:24, DE:22, DK:18, DO:28, EE:20, ES:24, FI:18,
  FO:18, FR:27, GB:22, GE:22, GI:23, GL:18, GR:27, GT:28, HR:21, HU:28,
  IE:22, IL:23, IS:26, IT:27, JO:30, KW:30, KZ:20, LB:28, LC:32, LI:21,
  LT:20, LU:20, LV:21, MC:27, MD:24, ME:22, MK:19, MR:27, MT:31, MU:30,
  NL:18, NO:15, PK:24, PL:28, PS:29, PT:25, QA:29, RO:24, RS:22, SA:24,
  SC:31, SE:24, SI:19, SK:24, SM:27, ST:25, SV:28, TL:23, TN:24, TR:26,
  UA:29, VA:22, VG:24, XK:20
};

function validIban(iban: string) {
  if (!/^[A-Z]{2}[0-9A-Z]+$/.test(iban)) return false;
  const expected = ibanLengths[iban.slice(0, 2)];
  if (!expected || iban.length !== expected) return false;
  let remainder = 0;
  for (const character of iban.slice(4) + iban.slice(0, 4)) {
    const digits = character >= "A" && character <= "Z" ? String(character.charCodeAt(0) - 55) : character;
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

export async function POST(request: NextRequest) {
  let body: { iban?: string; consent?: boolean };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const iban = String(body.iban || "").replace(/\s+/g, "").toUpperCase();
  if (!validIban(iban)) {
    return NextResponse.json({ error: "Enter a valid IBAN before looking up its bank." }, { status: 400 });
  }
  if (body.consent !== true) {
    return NextResponse.json({ error: "Consent is required before sending the IBAN to the external bank-directory provider." }, { status: 400 });
  }
  try {
    const response = await fetch("https://iban-analyzer.com/api/v1/public/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify([iban]),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (response.status === 429) {
      return NextResponse.json({ error: "The directory lookup limit has been reached. Try again later." }, { status: 429 });
    }
    if (!response.ok) {
      return NextResponse.json({ error: "The European bank directory is temporarily unavailable." }, { status: 503 });
    }
    const payload = await response.json() as { results?: Array<{ isValid?: boolean; bankDataAvailable?: boolean; bankDetails?: { bankName?: string; swiftCode?: string; bankCity?: string } }> };
    const result = payload.results?.[0];
    if (!result?.isValid || !result.bankDataAvailable || !result.bankDetails?.bankName) {
      return NextResponse.json({ found: false, message: "No bank record was available for this IBAN." }, { status: 404 });
    }
    return NextResponse.json({
      found: true,
      bankName: result.bankDetails.bankName,
      bic: result.bankDetails.swiftCode || null,
      city: result.bankDetails.bankCity || null,
      source: "IBAN Analyzer reference directory",
      accountHolderVerified: false,
    });
  } catch {
    return NextResponse.json({ error: "The European bank directory could not be reached." }, { status: 503 });
  }
}
