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
  if (error) {
    await supabase.rpc("record_failed_signin");
    redirect("/login?error=Unable%20to%20sign%20in.%20Check%20your%20details.");
  }

  let blockedDevice = false;
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
    const { error: trackingError } = await supabase.rpc("record_login_context_v2", {
      p_fingerprint: fingerprint,
      p_device_label: deviceLabel(userAgent),
      p_user_agent: userAgent,
      p_ip_address: ipAddress || null,
      p_approximate_location: location || null,
    });
    if (trackingError) {
      if (/device has been blocked/i.test(trackingError.message || "")) {
        blockedDevice = true;
      } else {
        await supabase.rpc("record_operations_event", { p_severity: "error", p_category: "database", p_service: "Authentication", p_operation: "login_context_record_failed", p_error_code: trackingError.code || "LOGIN_CONTEXT_FAILED", p_request_path: "/login" });
      // Keep authentication available, but make tracking failures observable
      // in server logs without recording IPs, tokens, or other personal data.
        console.error("Nexora login tracking failed:", trackingError.code || "UNKNOWN");
      }
    }
  } catch {
    // Authentication remains available when device telemetry is temporarily unavailable.
  }
  if (blockedDevice) {
    await supabase.auth.signOut({ scope: "local" });
    redirect("/login?error=This%20device%20has%20been%20blocked.%20Contact%20Nexora%20support.");
  }
  redirect(next);
}

const RECOVERY_CODE_TTL_SECONDS = 10 * 60;

export async function sendPasswordRecoveryCode(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (!validEmail(email)) redirect("/forgot-password?step=request&error=Enter%20a%20valid%20email%20address.");

  const supabase = await createClient();
  // Restore the original delivery path: Supabase Auth sends the recovery OTP
  // through the project's configured Auth SMTP provider. The Reset Password
  // email template must render {{ .Token }} for the six-digit code.
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) {
    console.error("Nexora password recovery request failed:", error.code || "UNKNOWN");
    redirect("/forgot-password?step=request&error=Unable%20to%20send%20a%20recovery%20code.%20Please%20try%20again%20later.");
  }

  const cookieStore = await cookies();
  const expiresAt = Date.now() + RECOVERY_CODE_TTL_SECONDS * 1000;
  cookieStore.set("nexora_recovery_email", email, {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "strict", path: "/", maxAge: RECOVERY_CODE_TTL_SECONDS,
  });
  cookieStore.set("nexora_recovery_expires_at", String(expiresAt), {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "strict", path: "/", maxAge: RECOVERY_CODE_TTL_SECONDS,
  });
  cookieStore.set("nexora_recovery_verified", "", {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "strict", path: "/", maxAge: 0,
  });
  redirect("/forgot-password?step=verify");
}

export async function verifyPasswordRecoveryCode(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();
  const cookieStore = await cookies();
  const email = cookieStore.get("nexora_recovery_email")?.value ?? "";
  const expiresAt = Number(cookieStore.get("nexora_recovery_expires_at")?.value ?? 0);
  if (!/^\d{6}$/.test(token)) {
    redirect("/forgot-password?step=verify&error=Enter%20the%20six-digit%20code%20sent%20to%20your%20email.");
  }
  if (!validEmail(email) || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    cookieStore.set("nexora_recovery_email", "", { path: "/", maxAge: 0 });
    cookieStore.set("nexora_recovery_expires_at", "", { path: "/", maxAge: 0 });
    redirect("/forgot-password?step=request&error=Your%20recovery%20code%20has%20expired.%20Request%20a%20new%20code.");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "recovery" });
  if (error) {
    // Supabase deliberately reports wrong, already-used and expired OTPs with
    // the same otp_expired response. Our server-side 10-minute deadline lets
    // the app distinguish an expired Nexora code from a rejected code while
    // never treating the client countdown as proof of identity.
    const message = Date.now() >= expiresAt
      ? "Your%20recovery%20code%20has%20expired.%20Request%20a%20new%20one."
      : "That%20code%20is%20incorrect%20or%20is%20no%20longer%20the%20latest%20code.%20Check%20the%20newest%20email.";
    redirect(`/forgot-password?step=verify&error=${message}`);
  }
  cookieStore.set("nexora_recovery_verified", "1", {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "strict", path: "/", maxAge: RECOVERY_CODE_TTL_SECONDS,
  });
  redirect("/forgot-password?step=update");
}

export async function updateRecoveredPassword(formData: FormData) {
  const cookieStore = await cookies();
  if (cookieStore.get("nexora_recovery_verified")?.value !== "1") {
    redirect("/forgot-password?step=request&error=Verify%20your%20email%20code%20before%20changing%20your%20password.");
  }
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmPassword") ?? "");
  if (password.length < 10 || password !== confirmation) {
    redirect("/forgot-password?step=update&error=Use%20a%20password%20of%20at%20least%2010%20characters%20and%20confirm%20it.");
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect("/forgot-password?step=update&error=The%20password%20could%20not%20be%20updated.%20Verify%20the%20code%20again.");
  await supabase.auth.signOut({ scope: "local" });
  cookieStore.set("nexora_recovery_email", "", { path: "/", maxAge: 0 });
  cookieStore.set("nexora_recovery_expires_at", "", { path: "/", maxAge: 0 });
  cookieStore.set("nexora_recovery_verified", "", { path: "/", maxAge: 0 });
  redirect("/login?success=Your%20password%20has%20been%20updated.%20Sign%20in%20with%20your%20new%20password.");
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

  // Revoke this session through a scoped database function. Customers cannot
  // directly edit session fingerprints, trust state, or revocation timestamps.
  try {
    await supabase.rpc("revoke_current_user_session");
  } catch {
    // Always complete logout even if the session-history update is unavailable.
  }

  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}
