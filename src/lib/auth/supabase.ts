import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getSupabaseEnv } from "./env";

export { isAuthEnabled } from "./env";
/** The browser client lives in its own module because this one imports `next/headers`. */
export { createBrowserSupabase } from "./supabase-browser";

/**
 * Supabase client for server components, route handlers and server actions (cookie-backed session).
 * Throws when auth is not configured — callers check `isAuthEnabled()` first (see `getSession()`).
 */
export async function createServerSupabase(): Promise<SupabaseClient> {
  const env = getSupabaseEnv();
  if (!env) throw new Error("Supabase auth is not configured (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)");
  const jar = await cookies();
  return createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return jar.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) jar.set(name, value, options);
        } catch {
          // Server components cannot write cookies; the proxy refreshes the session on every request instead.
        }
      },
    },
  });
}
