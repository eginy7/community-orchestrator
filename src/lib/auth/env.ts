/**
 * Supabase auth configuration. Client-safe: only reads `NEXT_PUBLIC_*` vars and never imports
 * `next/headers`, so both the browser client and the proxy can use it.
 *
 * Dev fallback: when the two public vars are missing, auth is OFF and the app behaves exactly as it
 * did before auth existed (everyone is admin, nothing redirects).
 */

export interface SupabaseEnv {
  url: string;
  anonKey: string;
}

export function getSupabaseEnv(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  return url && anonKey ? { url, anonKey } : null;
}

/** True only when both `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set. */
export function isAuthEnabled(): boolean {
  // Local kill-switch: keep the Supabase keys in .env.local but run without login (e.g. before Google is configured).
  if (process.env.AUTH_DISABLED === "true" || process.env.AUTH_DISABLED === "1") return false;
  return getSupabaseEnv() !== null;
}
