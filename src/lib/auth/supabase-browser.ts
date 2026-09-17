import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "./env";

let browserClient: SupabaseClient | null = null;

/** Supabase client for `"use client"` components. Throws when auth is not configured. */
export function createBrowserSupabase(): SupabaseClient {
  if (browserClient) return browserClient;
  const env = getSupabaseEnv();
  if (!env) throw new Error("Supabase auth is not configured (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)");
  browserClient = createBrowserClient(env.url, env.anonKey);
  return browserClient;
}
