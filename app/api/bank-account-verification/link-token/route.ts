import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });

  const clientId = process.env.PLAID_CLIENT_ID || "";
  const secret = process.env.PLAID_SECRET || "";
  const environment = process.env.PLAID_ENV || "sandbox";
  if (!clientId || !secret || environment !== "sandbox") {
    return NextResponse.json({ error: "Account-name verification is not configured yet." }, { status: 503 });
  }

  try {
    const response = await fetch("https://sandbox.plaid.com/link/token/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        secret,
        client_name: "Nexora Bank",
        language: "en",
        country_codes: ["US"],
        products: ["auth"],
        required_if_supported_products: ["identity"],
        user: { client_user_id: user.id },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    const result = await response.json() as { link_token?: string; error_message?: string };
    if (!response.ok || !result.link_token) {
      return NextResponse.json({ error: result.error_message || "Unable to start the bank connection." }, { status: 502 });
    }
    return NextResponse.json({ link_token: result.link_token });
  } catch {
    return NextResponse.json({ error: "The bank verification service could not be reached." }, { status: 503 });
  }
}
