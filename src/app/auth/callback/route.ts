import { NextResponse, type NextRequest } from "next/server";
import { isAuthEnabled } from "@/lib/auth/env";
import { safeNextPath } from "@/lib/auth/gate";
import { createServerSupabase } from "@/lib/auth/supabase";

export const runtime = "nodejs";

/**
 * OAuth (Google) landing: exchanges the `code` for a session cookie and sends the user on to `next`.
 * `next` is restricted to same-origin paths so the callback cannot be used as an open redirect.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const base = siteOrigin(request);
  if (!isAuthEnabled()) return NextResponse.redirect(new URL("/", base));

  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"), "/");
  if (code) {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, base));
  }
  return NextResponse.redirect(new URL("/login?error=oauth", base));
}

/** Honour the reverse-proxy host in production so the redirect lands on the public URL. */
function siteOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (process.env.NODE_ENV !== "development" && forwardedHost) {
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    return `${proto}://${forwardedHost}`;
  }
  return request.nextUrl.origin;
}
