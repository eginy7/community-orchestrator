import type { Role } from "./roles";

/**
 * Route-access decision for the proxy. Pure so it can be unit-tested without Next.
 *
 * - public: `/login`, `/auth/*`, Next internals and static files
 * - viewer-allowed: `/ask`, `/api/ask`
 * - everything else: admin only
 */

export type Visitor =
  | { kind: "anonymous" }
  /** Signed in with Supabase but neither an admin email nor a phone user. */
  | { kind: "unauthorized" }
  | { kind: "user"; role: Role };

export type Decision =
  | { action: "next" }
  | { action: "redirect"; to: string }
  | { action: "json"; status: 401 | 403; error: string };

const STATIC_FILE = /\.[a-z0-9]+$/i;

export function isPublicPath(pathname: string): boolean {
  if (pathname === "/login") return true;
  if (pathname === "/auth" || pathname.startsWith("/auth/")) return true;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname === "/favicon.ico") return true;
  return STATIC_FILE.test(pathname);
}

export function isViewerPath(pathname: string): boolean {
  return pathname === "/ask" || pathname === "/api/ask";
}

function isApi(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

/** `/` for admins, `/ask` for viewers. */
export function homeFor(role: Role): string {
  return role === "admin" ? "/" : "/ask";
}

export function decideAccess(input: { pathname: string; search?: string; visitor: Visitor; authEnabled: boolean }): Decision {
  const { pathname, visitor, authEnabled } = input;
  const search = input.search ?? "";
  if (!authEnabled) return { action: "next" };

  if (isPublicPath(pathname)) {
    // A signed-in user has no business on the login screen.
    if (pathname === "/login" && visitor.kind === "user") return { action: "redirect", to: homeFor(visitor.role) };
    return { action: "next" };
  }

  if (visitor.kind === "anonymous" || visitor.kind === "unauthorized") {
    if (isApi(pathname)) return { action: "json", status: 401, error: "Unauthorized" };
    if (visitor.kind === "unauthorized") return { action: "redirect", to: "/login?error=unauthorized" };
    return { action: "redirect", to: `/login?next=${encodeURIComponent(pathname + search)}` };
  }

  if (visitor.role === "admin") return { action: "next" };

  // Viewer.
  if (isViewerPath(pathname)) return { action: "next" };
  if (isApi(pathname)) return { action: "json", status: 403, error: "Forbidden" };
  return { action: "redirect", to: "/ask" };
}

/** Only same-origin absolute paths survive; anything else falls back to `fallback`. */
export function safeNextPath(raw: string | null | undefined, fallback = "/"): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  if (/[\r\n\\]/.test(raw)) return fallback;
  if (raw.startsWith("/login") || raw.startsWith("/auth/")) return fallback;
  return raw;
}
