"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function safeNext(value: FormDataEntryValue | null) {
  const path = typeof value === "string" ? value : "";
  return path.startsWith("/") && !path.startsWith("//") ? path : "/dashboard";
}

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));

  if (!email || !/^\\S+@\\S+\\.\\S+$/.test(email) || password.length < 8) {
    redirect("/login?error=Enter%20a%20valid%20email%20and%20password.");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect("/login?error=Unable%20to%20sign%20in.%20Check%20your%20details.");
  redirect(next);
}

export async function signUp(formData: FormData) {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (fullName.length < 2 || !/^\\S+@\\S+\\.\\S+$/.test(email) || password.length < 10 || password !== confirmPassword) {
    redirect("/register?error=Check%20your%20details.%20Use%20a%2010-character%20password%20and%20matching%20confirmation.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });

  if (error) redirect("/register?error=Unable%20to%20create%20your%20account.%20Please%20try%20again.");
  if (data.session) redirect("/dashboard");
  redirect("/register?success=Check%20your%20email%20to%20confirm%20your%20account.");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
