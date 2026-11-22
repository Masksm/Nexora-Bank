import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const SOURCE = "https://www.bundesbank.de/resource/blob/602632/3a97fff9893732591adbbfcb70c1c4e8/472B63F073F071307366337C94F8C870/blz-aktuell-txt-data.txt";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to use bank lookup." }, { status: 401 });
  const blz = (request.nextUrl.searchParams.get("blz") || "").replace(/\D/g, "");
  if (!/^\d{8}$/.test(blz)) {
    return NextResponse.json({ error: "A German IBAN must contain an 8-digit bank routing code after the check digits." }, { status: 400 });
  }

  try {
    const response = await fetch(SOURCE, {
      headers: { Accept: "text/plain, */*" },
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      return NextResponse.json({ error: "The Bundesbank directory is temporarily unavailable." }, { status: 503 });
    }
    const file = await response.text();
    const record = file.split(/\r?\n/).find((line) =>
      line.length >= 159 &&
      line.slice(0, 8) === blz &&
      line.slice(8, 9) === "1" &&
      line.slice(158, 159) !== "D"
    );
    if (!record) {
      return NextResponse.json({ found: false, source: "Deutsche Bundesbank public bank sort-code file" }, { status: 404 });
    }
    return NextResponse.json({
      found: true,
      bankName: record.slice(9, 67).trim(),
      postalCode: record.slice(67, 72).trim(),
      city: record.slice(72, 107).trim(),
      bic: record.slice(139, 150).trim() || null,
      bankCode: blz,
      source: "Deutsche Bundesbank public bank sort-code file",
      dataValidity: "Quarterly publication; public non-binding copy",
    });
  } catch {
    return NextResponse.json({ error: "The Bundesbank directory could not be reached. Enter the bank name manually." }, { status: 503 });
  }
}
