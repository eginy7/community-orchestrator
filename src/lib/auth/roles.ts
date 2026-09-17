/** Role mapping shared by the proxy and the server session helpers. Pure, no framework imports. */

export type Role = "admin" | "viewer";

/** Parses the comma-separated `ADMIN_EMAILS` env value into a lowercase set. */
export function parseAdminEmails(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export interface RoleInput {
  email?: string | null;
  phone?: string | null;
}

/**
 * Email listed in ADMIN_EMAILS → admin; otherwise a verified phone → viewer; otherwise null
 * (signed in with an account that is not allowed in).
 */
export function roleOf(user: RoleInput, adminEmails: Set<string>): Role | null {
  const email = user.email?.trim().toLowerCase();
  if (email && adminEmails.has(email)) return "admin";
  if (user.phone && user.phone.trim()) return "viewer";
  return null;
}

/** Same as `roleOf`, reading ADMIN_EMAILS from the environment. */
export function roleFromEnv(user: RoleInput): Role | null {
  return roleOf(user, parseAdminEmails(process.env.ADMIN_EMAILS));
}
