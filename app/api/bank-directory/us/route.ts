import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RoutingDirectoryResponse = {
  status?: string;
  data?: {
    aba_number?: string;
    bank_name?: string;
    city?: string;
    state?: string;
  };
  error?: { message?: string };
};

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to use bank lookup." }, { status: 401 });
  const routing = (request.nextUrl.searchParams.get("routing") || "").trim();
  if (!/^\d{9}$/.test(routing)) {
    return NextResponse.json({ error: "Enter a 9-digit ABA routing number." }, { status: 400 });
  }

  try {
    const response = await fetch(`https://bankrouting.io/api/v1/aba/${routing}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(5000),
    });

    if (response.status === 404) {
      return NextResponse.json({ error: "No matching institution was found for that routing number." }, { status: 404 });
    }
    if (response.status === 429) {
      return NextResponse.json({ error: "Bank directory is temporarily busy. You can enter the bank name manually." }, { status: 503 });
    }
    if (!response.ok) {
      return NextResponse.json({ error: "Bank directory lookup is temporarily unavailable." }, { status: 502 });
    }

    const result = await response.json() as RoutingDirectoryResponse;
    const bankName = result.data?.bank_name?.trim();
    if (result.status !== "success" || !bankName || result.data?.aba_number !== routing) {
      return NextResponse.json({ error: "The routing number could not be matched to a bank." }, { status: 404 });
    }

    return NextResponse.json({
      bankName: bankName.slice(0, 120),
      city: result.data?.city?.slice(0, 80) || null,
      state: result.data?.state?.slice(0, 2) || null,
      source: "routing-directory",
      verifiedFor: "bank-directory-match-only",
    });
  } catch {
    return NextResponse.json({ error: "Bank directory lookup timed out. You can enter the bank name manually." }, { status: 504 });
  }
}
