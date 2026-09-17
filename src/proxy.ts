import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv, isAuthEnabled } from "@/lib/auth/env";
import { decideAccess, type Visitor } from "@/lib/auth/gate";
import { roleFromEnv } from "@/lib/auth/roles";

/**
 * Next 16 proxy (formerly middleware): refreshes the Supabase session cookie on every request
 * (the standard @supabase/ssr pattern) and gates routes by role. See `src/lib/auth/gate.ts`.
 *
 * When Supabase is not configured this is a passthrough — the app behaves as it did before auth.
 */
export async function proxy(request: NextRequest) {
  // Passthrough when Supabase is not configured OR AUTH_DISABLED is set (local kill-switch).
  if (!isAuthEnabled()) return NextResponse.next();
  const env = getSupabaseEnv();
  if (!env) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [k, v] of Object.entries(headers)) response.headers.set(k, v);
      },
    },
  });

  // getUser() validates the token with Supabase and triggers the refresh above when needed.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let visitor: Visitor = { kind: "anonymous" };
  if (user) {
    const role = roleFromEnv({ email: user.email, phone: user.phone });
    visitor = role ? { kind: "user", role } : { kind: "unauthorized" };
  }

  const { pathname, search } = request.nextUrl;
  const decision = decideAccess({ pathname, search, visitor, authEnabled: true });

  if (decision.action === "next") return response;

  if (decision.action === "json") {
    const out = NextResponse.json({ error: decision.error }, { status: decision.status });
    copyCookies(response, out);
    return out;
  }

  const out = NextResponse.redirect(new URL(decision.to, request.url));
  copyCookies(response, out);
  return out;
}

/** Any refreshed session cookies must ride along on the redirect / JSON response too. */
function copyCookies(from: NextResponse, to: NextResponse) {
  for (const c of from.cookies.getAll()) to.cookies.set(c);
}

export const config = {
  // Skip Next internals and static assets; everything else (pages, API, server actions) is gated.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|json|woff2?)$).*)"],
};
