"use server";

import { redirect } from "next/navigation";
import { isAuthEnabled } from "@/lib/auth/env";
import { createServerSupabase } from "@/lib/auth/supabase";

/** Clears the Supabase session cookie and returns to the login screen. */
export async function signOut(): Promise<void> {
  if (isAuthEnabled()) {
    const supabase = await createServerSupabase();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
