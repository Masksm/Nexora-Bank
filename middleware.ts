import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { resolveLocale } from "@/lib/locale";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
        Object.entries(headers).forEach(([name, value]) =>
          response.headers.set(name, value)
        );
      },
    },
  });

  // Do not insert unrelated work between client creation and getClaims().
  const { data, error } = await supabase.auth.getClaims();
  const claims = error ? null : data?.claims;
  const path = request.nextUrl.pathname;
  const isCustomerArea = path.startsWith("/dashboard");
  const isAdminArea = path.startsWith("/admin");
  const isSuperAdminArea = path.startsWith("/super-admin");
  const appMetadata = claims?.app_metadata as { role?: string } | undefined;
  const isAdmin = appMetadata?.role === "admin";
  const isSuperAdmin = appMetadata?.role === "super_admin";
  const isPrivileged = isAdmin || isSuperAdmin;

  if (claims?.sub) {
    const { error: auditRequestError } = await supabase.rpc("record_activity_request", {
      p_path: path,
      p_method: request.method,
      p_user_agent: request.headers.get("user-agent")?.slice(0, 500) || null,
      p_ip_address: request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
    });
    if (auditRequestError) {
      console.error("Nexora request audit failed:", auditRequestError.code || "UNKNOWN");
    }
  }

  if (claims?.sub) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("preferred_language,country_code")
      .eq("user_id", String(claims.sub))
      .maybeSingle();
    const locale = resolveLocale(
      profile?.preferred_language,
      request.headers.get("accept-language"),
      request.headers.get("x-vercel-ip-country") || request.headers.get("cf-ipcountry") || profile?.country_code,
    );
    response.cookies.set("nexora_locale", locale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    });
  } else {
    const locale = resolveLocale(
      "auto",
      request.headers.get("accept-language"),
      request.headers.get("x-vercel-ip-country") || request.headers.get("cf-ipcountry") || null,
    );
    response.cookies.set("nexora_locale", locale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      sameSite: "lax",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    });
  }

  const redirectWithSession = (target: URL) => {
    const redirectResponse = NextResponse.redirect(target);
    response.cookies.getAll().forEach(({ name, value, ...options }) => {
      redirectResponse.cookies.set(name, value, options);
    });
    for (const name of ["Cache-Control", "Expires", "Pragma"]) {
      const value = response.headers.get(name);
      if (value) redirectResponse.headers.set(name, value);
    }
    return redirectResponse;
  };

  if ((isCustomerArea || isAdminArea || isSuperAdminArea) && !claims) {
    const target = request.nextUrl.clone();
    target.pathname = "/login";
    target.search = "";
    target.searchParams.set("next", path);
    return redirectWithSession(target);
  }

  if ((isCustomerArea || isAdminArea || isSuperAdminArea) && claims?.session_id && claims?.sub) {
    const { data: sessionRecord } = await supabase
      .from("user_sessions")
      .select("revoked_at")
      .eq("auth_session_id", String(claims.session_id))
      .eq("user_id", String(claims.sub))
      .maybeSingle();
    if (sessionRecord?.revoked_at) {
      await supabase.auth.signOut({ scope: "local" });
      const target = request.nextUrl.clone();
      target.pathname = "/login";
      target.search = "?error=This%20session%20has%20been%20revoked.%20Please%20sign%20in%20again.";
      return redirectWithSession(target);
    }

    const { error: activityError } = await supabase.rpc("touch_session_activity");
    if (activityError) {
      console.error("Nexora session activity update failed:", activityError.code || "UNKNOWN");
    }
  }

  if (isAdminArea && !isPrivileged) {
    const target = request.nextUrl.clone();
    target.pathname = isSuperAdmin ? "/super-admin" : "/dashboard";
    target.search = "";
    return redirectWithSession(target);
  }

  if (isSuperAdminArea && !isSuperAdmin) {
    const target = request.nextUrl.clone();
    target.pathname = isSuperAdmin ? "/super-admin" : isAdmin ? "/admin" : "/dashboard";
    target.search = "";
    return redirectWithSession(target);
  }

  if (isCustomerArea && isPrivileged) {
    const target = request.nextUrl.clone();
    target.pathname = isSuperAdmin ? "/super-admin" : "/admin";
    target.search = "";
    return redirectWithSession(target);
  }

  if (claims && (path === "/login" || path === "/register")) {
    const target = request.nextUrl.clone();
    target.pathname = isAdmin ? "/admin" : "/dashboard";
    target.search = "";
    return redirectWithSession(target);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
