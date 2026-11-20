"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function customer() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function createSupportRequest(formData: FormData) {
  const { supabase, user } = await customer();
  const category = String(formData.get("category") || "general");
  const subject = String(formData.get("subject") || "").trim().slice(0,120);
  const details = String(formData.get("details") || "").trim().slice(0,3500);
  const urgency = String(formData.get("urgency") || "normal");
  const accountNumber = String(formData.get("account_number") || "").trim().slice(0,10);
  if (!subject || details.length < 10 || !["account","transfer","card","security","profile","general"].includes(category)) {
    redirect("/dashboard/help?error=Please%20provide%20a%20subject%20and%20at%20least%2010%20characters%20of%20detail.");
  }
  const { data: ticket, error } = await supabase.from("support_conversations").insert({
    user_id: user.id, subject, category,
    intake_answers: { urgency, account_number: accountNumber || null, intake_version: "guided-v1" },
  }).select("id").single();
  if (error || !ticket) redirect("/dashboard/help?error=Unable%20to%20create%20your%20support%20request.");
  const { error: messageError } = await supabase.from("support_messages").insert({
    conversation_id: ticket.id, sender_user_id: user.id, sender_role: "customer", body: details,
  });
  if (messageError) redirect("/dashboard/help?error=Ticket%20created%20but%20the%20first%20message%20could%20not%20be%20saved.");
  revalidatePath("/dashboard/help");
  redirect(`/dashboard/help?ticket=${ticket.id}`);
}

export async function replySupportRequest(formData: FormData) {
  const { supabase, user } = await customer();
  const conversationId = String(formData.get("conversation_id") || "");
  const body = String(formData.get("body") || "").trim().slice(0,4000);
  if (!conversationId || body.length < 1) redirect("/dashboard/help?error=Enter%20a%20message.");
  const { error } = await supabase.from("support_messages").insert({
    conversation_id: conversationId, sender_user_id: user.id, sender_role: "customer", body,
  });
  if (error) redirect("/dashboard/help?error=Unable%20to%20send%20your%20message.");
  revalidatePath("/dashboard/help");
  redirect(`/dashboard/help?ticket=${conversationId}`);
}
