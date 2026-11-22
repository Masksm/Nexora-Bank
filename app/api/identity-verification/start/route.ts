import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });

  let body: { documentId?: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const documentId = String(body.documentId || "");
  if (!/^[0-9a-f-]{36}$/i.test(documentId)) {
    return NextResponse.json({ error: "Select a valid identity document." }, { status: 400 });
  }

  const { data: document, error: documentError } = await supabase
    .from("identity_documents")
    .select("id,user_id,review_status")
    .eq("id", documentId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (documentError || !document) {
    return NextResponse.json({ error: "Identity document not found." }, { status: 404 });
  }
  if (document.review_status === "verified") {
    return NextResponse.json({ error: "This document has already been approved." }, { status: 409 });
  }

  let provider: "nexora_sandbox" | "persona_sandbox" = "nexora_sandbox";
  let providerReference: string | null = null;
  let launchUrl: string | null = null;
  let resultSummary = "Your document has been submitted to the identity review workflow.";

  const personaKey = process.env.PERSONA_API_KEY || "";
  const personaTemplate = process.env.PERSONA_INQUIRY_TEMPLATE_ID || "";
  if (personaKey || personaTemplate) {
    if (!personaKey.startsWith("persona_sandbox_") || !personaTemplate.startsWith("itmpl_")) {
      return NextResponse.json({
        error: "The identity provider is not configured with a valid Persona Sandbox API key and inquiry template.",
      }, { status: 503 });
    }
    try {
      const response = await fetch("https://api.withpersona.com/api/v1/inquiries", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${personaKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "Persona-Version": "2026-09-29",
        },
        body: JSON.stringify({
          data: {
            attributes: {
              "inquiry-template-id": personaTemplate,
              "reference-id": user.id,
            },
          },
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
      });
      const payload = await response.json() as {
        data?: { id?: string; attributes?: { status?: string } };
        meta?: { "one-time-link"?: string };
        errors?: Array<{ detail?: string }>;
      };
      if (!response.ok || !payload.data?.id) {
        return NextResponse.json({
          error: payload.errors?.[0]?.detail || "The identity provider could not start a verification session.",
        }, { status: 502 });
      }
      provider = "persona_sandbox";
      providerReference = payload.data.id;
      launchUrl = payload.meta?.["one-time-link"] || null;
      resultSummary = "Complete the identity provider's sandbox session, then return for staff review.";
    } catch {
      return NextResponse.json({ error: "The identity provider could not be reached. Please try again." }, { status: 503 });
    }
  } else {
    resultSummary = "Your document is queued for staff review. Automated provider checks are not connected yet.";
  }

  const { data: attempt, error: startError } = await supabase.rpc("start_identity_verification", {
    p_document_id: documentId,
    p_provider: provider,
    p_provider_reference: providerReference,
    p_provider_launch_url: launchUrl,
    p_result_summary: resultSummary,
  });
  if (startError || !attempt) {
    return NextResponse.json({ error: startError?.message || "Unable to start identity verification." }, { status: 400 });
  }

  return NextResponse.json({
    attempt,
    provider,
    launchUrl,
    message: resultSummary,
  });
}
