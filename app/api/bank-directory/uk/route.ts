import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Branch = {
  BranchIdentification?: string;
  BranchName?: string;
  Organisation?: { Brand?: string[]; OrganisationName?: string };
  Address?: { TownName?: string; CountrySubDivision?: string; PostCode?: string };
};

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to use bank lookup." }, { status: 401 });
  const sortCode = (request.nextUrl.searchParams.get("sortCode") || "").replace(/\D/g, "");
  if (!/^\d{6}$/.test(sortCode)) {
    return NextResponse.json({ error: "Enter a 6-digit UK sort code." }, { status: 400 });
  }

  try {
    const response = await fetch("https://api.hsbc.com/open-banking/v2.2/branches", {
      headers: {
        Accept: "application/prs.openbanking.opendata.v2.2+json, application/json",
        "User-Agent": "NexoraBank/1.0 (bank directory lookup)",
      },
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      return NextResponse.json({ error: "The UK bank directory is temporarily unavailable." }, { status: 503 });
    }
    const payload = await response.json() as { data?: Branch[] };
    const branches = Array.isArray(payload.data) ? payload.data : [];
    const matches = branches.filter((branch) => (branch.BranchIdentification || "").replace(/\D/g, "") === sortCode);
    if (!matches.length) {
      return NextResponse.json({
        found: false,
        coverage: "HSBC UK branch directory",
        message: "No match was found in the free HSBC UK live directory. This source does not cover every UK bank.",
      }, { status: 404 });
    }
    const branch = matches[0];
    const brand = branch.Organisation?.Brand?.[0] || branch.Organisation?.OrganisationName || "HSBC";
    return NextResponse.json({
      found: true,
      bankName: brand,
      branchName: branch.BranchName || null,
      city: branch.Address?.TownName || null,
      postcode: branch.Address?.PostCode || null,
      source: "HSBC UK Open Banking live branch directory",
      coverage: "HSBC UK only",
    });
  } catch {
    return NextResponse.json({ error: "The UK bank directory could not be reached. Enter the bank name manually." }, { status: 503 });
  }
}
