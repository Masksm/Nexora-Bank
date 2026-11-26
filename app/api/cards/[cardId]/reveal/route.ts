import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ cardId: string }> };

function buildPreviewDetails(id: string, network: string, last4: string) {
  const digest = createHash("sha256").update(id).digest("hex");
  const digits = Array.from(digest)
    .map((character) => (parseInt(character, 16) % 10).toString())
    .join("");
  const prefix = network === "mastercard" ? "55" : "4";
  const suffix = last4.padStart(4, "0").slice(-4);
  // These are preview-only numbers. Keep the persisted last4 as the actual
  // final four digits instead of appending a Luhn digit after it.
  const prefixLength = 16 - prefix.length - suffix.length;
  const numberPrefix = (prefix + digits.slice(0, prefixLength)).split("");
  let number = "";
  for (let candidate = 0; candidate <= 9; candidate += 1) {
    numberPrefix[numberPrefix.length - 1] = String(candidate);
    const attempt = numberPrefix.join("") + suffix;
    let sum = 0;
    for (let index = 0; index < attempt.length; index += 1) {
      let digit = Number(attempt[attempt.length - 1 - index]);
      if (index % 2 === 1) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
    }
    if (sum % 10 === 0) {
      number = attempt;
      break;
    }
  }
  if (!number) throw new Error("Unable to generate a valid preview card number.");
  return {
    number: number.replace(/(.{4})/g, "$1 ").trim(),
    cvv: digits.slice(10, 13),
  };
}

export async function POST(request: Request, context: RouteContext) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Your session has expired. Sign in again." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { cardId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(cardId)) {
    return NextResponse.json(
      { error: "Card not found." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  let body: { pin?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Enter your six-digit transaction PIN." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const pin = typeof body.pin === "string" ? body.pin.trim() : "";
  if (!/^\d{6}$/.test(pin)) {
    return NextResponse.json(
      { error: "Enter your six-digit transaction PIN." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { data: card, error: cardError } = await supabase
    .from("virtual_cards")
    .select("id,network,last4,expiry_month,expiry_year,status")
    .eq("id", cardId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (cardError || !card) {
    return NextResponse.json(
      { error: "Card not found." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { data: hasPin, error: pinStatusError } =
    await supabase.rpc("has_transaction_pin");
  if (pinStatusError) {
    return NextResponse.json(
      { error: "Unable to verify your transaction PIN right now." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!hasPin) {
    return NextResponse.json(
      { error: "Set up your transaction PIN in Security before viewing card details." },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { data: validPin, error: verifyError } = await supabase.rpc(
    "verify_virtual_card_details_pin",
    { p_pin: pin },
  );

  if (verifyError) {
    return NextResponse.json(
      { error: "Unable to verify your transaction PIN right now." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (validPin !== true) {
    const { data: status } = await supabase.rpc("get_transaction_pin_status");
    const statusRow = Array.isArray(status) ? status[0] : status;
    const locked = statusRow?.is_locked === true;
    const remaining = Number(statusRow?.attempts_remaining ?? 0);
    return NextResponse.json(
      {
        error: locked
          ? "Your transaction PIN is temporarily locked. Try again in 15 minutes."
          : `Incorrect PIN. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
        locked,
      },
      { status: locked ? 429 : 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const details = buildPreviewDetails(card.id, card.network, card.last4);
  return NextResponse.json(
    {
      number: details.number,
      expiry: `${String(card.expiry_month).padStart(2, "0")}/${String(card.expiry_year).slice(-2)}`,
      cvv: details.cvv,
      previewOnly: true,
    },
    {
      headers: {
        "Cache-Control": "no-store, private, max-age=0",
        Pragma: "no-cache",
      },
    },
  );
}
