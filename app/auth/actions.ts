"use server";

import { createHash, randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function safeNext(value: FormDataEntryValue | null) {
  const path = typeof value === "string" ? value : "";
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("\\") ? path : "/dashboard";
}

const validEmail = (email: string) => /^\S+@\S+\.\S+$/.test(email);

function deviceLabel(userAgent: string) {
  const browser = /Edg\//.test(userAgent) ? "Microsoft Edge" : /Firefox\//.test(userAgent) ? "Firefox" : /Chrome\//.test(userAgent) ? "Chrome" : /Safari\//.test(userAgent) ? "Safari" : "Unknown browser";
  const platform = /iPhone|iPad/.test(userAgent) ? "Apple mobile device" : /Android/.test(userAgent) ? "Android device" : /Windows/.test(userAgent) ? "Windows computer" : /Mac OS/.test(userAgent) ? "Mac computer" : /Linux/.test(userAgent) ? "Linux computer" : "Unknown device";
  return `${platform} · ${browser}`;
}

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));

  if (!validEmail(email) || password.length < 8) {
    redirect("/login?error=Enter%20a%20valid%20email%20and%20password.");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect("/login?error=Unable%20to%20sign%20in.%20Check%20your%20details.");

  try {
    const cookieStore = await cookies();
    const requestHeaders = await headers();
    const existingDeviceId = cookieStore.get("nexora_device_id")?.value;
    const deviceId = existingDeviceId && /^[a-f0-9-]{36}$/i.test(existingDeviceId) ? existingDeviceId : randomUUID();
    cookieStore.set("nexora_device_id", deviceId, {
      httpOnly: true, secure: process.env.NODE_ENV === "production",
      sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365,
    });
    const userAgent = (requestHeaders.get("user-agent") || "Unknown user agent").slice(0, 1000);
    const fingerprint = createHash("sha256").update(`${deviceId}|${userAgent}`).digest("hex");
    const ipAddress = (requestHeaders.get("x-forwarded-for") || "").split(",")[0].trim();
    const city = requestHeaders.get("x-vercel-ip-city");
    const region = requestHeaders.get("x-vercel-ip-country-region");
    const country = requestHeaders.get("x-vercel-ip-country");
    const location = [city, region, country].filter(Boolean).join(", ").slice(0, 120);
    await supabase.rpc("record_login_context_v2", {
      p_fingerprint: fingerprint,
      p_device_label: deviceLabel(userAgent),
      p_user_agent: userAgent,
      p_ip_address: ipAddress || null,
      p_approximate_location: location || null,
    });
  } catch {
    // The login remains valid. Transfers fail closed into manual review if no trusted session record exists.
  }
  redirect(next);
}

export async function signUp(formData: FormData) {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (fullName.length < 2 || !validEmail(email) || password.length < 10 || password !== confirmPassword) {
    redirect("/register?error=Check%20your%20details.%20Use%20a%2010-character%20password%20and%20matching%20confirmation.");
  }

  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: new URL("/auth/confirm", siteUrl).toString(),
    },
  });

  if (error) redirect("/register?error=Unable%20to%20create%20your%20account.%20Please%20try%20again.");
  if (data.session) redirect("/dashboard");
  redirect("/register?success=Check%20your%20email%20to%20confirm%20your%20account.");
}

export async function signOut() {
  const supabase = await createClient();

  // Revoke the current app session record before ending only this device's
  // Supabase session. Other devices remain signed in.
  try {
    const { data } = await supabase.auth.getClaims();
    const claims = data?.claims as { session_id?: string } | undefined;
    const { data: { user } } = await supabase.auth.getUser();

    if (user?.id && claims?.session_id) {
      await supabase
        .from("user_sessions")
        .update({ revoked_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("auth_session_id", claims.session_id)
        .is("revoked_at", null);
    }
  } catch {
    // Always complete logout even if the session-history update is unavailable.
  }

  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}
