import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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
  const appMetadata = claims?.app_metadata as { role?: string } | undefined;
  const isAdmin = appMetadata?.role === "admin";

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

  if ((isCustomerArea || isAdminArea) && !claims) {
    const target = request.nextUrl.clone();
    target.pathname = "/login";
    target.search = "";
    target.searchParams.set("next", path);
    return redirectWithSession(target);
  }

  if ((isCustomerArea || isAdminArea) && claims?.session_id && claims?.sub) {
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
  }

  // Keep the customer and administrator experiences separate.
  if (isAdminArea && !isAdmin) {
    const target = request.nextUrl.clone();
    target.pathname = "/dashboard";
    target.search = "";
    return redirectWithSession(target);
  }

  if (isCustomerArea && isAdmin) {
    const target = request.nextUrl.clone();
    target.pathname = "/admin";
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
