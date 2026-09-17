import "server-only";
import { redirect } from "next/navigation";
import { isAuthEnabled } from "./env";
import { roleFromEnv, type Role } from "./roles";
import { createServerSupabase } from "./supabase";

export type { Role } from "./roles";

export interface Session {
  userId: string;
  role: Role;
  email?: string;
  phone?: string;
  /** True when auth is not configured and everyone is treated as admin. */
  dev?: boolean;
}

export const DEV_SESSION: Session = { userId: "dev", role: "admin", dev: true };

/**
 * The signed-in user with their role, or null when anonymous / signed in but not allowed
 * (a Google account that is not in ADMIN_EMAILS and has no phone).
 */
export async function getSession(): Promise<Session | null> {
  if (!isAuthEnabled()) return DEV_SESSION;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const role = roleFromEnv({ email: user.email, phone: user.phone });
  if (!role) return null;
  return {
    userId: user.id,
    role,
    email: user.email || undefined,
    phone: user.phone || undefined,
  };
}

/** Distinguishes "nobody is signed in" from "signed in with an account we do not allow". */
export async function isSignedInButUnauthorized(): Promise<boolean> {
  if (!isAuthEnabled()) return false;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return !!user && roleFromEnv({ email: user.email, phone: user.phone }) === null;
}

/** Admin-only pages. Anonymous → /login, viewer → /ask. */
export async function requireAdmin(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/ask");
  return session;
}

/** Pages both roles may see (the ask box). Anonymous → /login. */
export async function requireViewerOrAdmin(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
