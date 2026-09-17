import { describe, expect, it } from "vitest";
import { decideAccess, safeNextPath, type Visitor } from "@/lib/auth/gate";
import { normalizePhone, phoneTail } from "@/lib/auth/phone";
import { parseAdminEmails, roleOf } from "@/lib/auth/roles";

const anon: Visitor = { kind: "anonymous" };
const admin: Visitor = { kind: "user", role: "admin" };
const viewer: Visitor = { kind: "user", role: "viewer" };
const unauthorized: Visitor = { kind: "unauthorized" };

describe("decideAccess — dev fallback", () => {
  it("never redirects when auth is disabled, whoever the visitor is", () => {
    for (const pathname of ["/", "/home", "/upload", "/ask", "/api/ask", "/api/run", "/login", "/onboarding"]) {
      for (const visitor of [anon, admin, viewer, unauthorized]) {
        expect(decideAccess({ pathname, visitor, authEnabled: false })).toEqual({ action: "next" });
      }
    }
  });
});

describe("decideAccess — auth enabled", () => {
  const on = { authEnabled: true };

  it("lets everyone reach the public routes", () => {
    for (const pathname of ["/login", "/auth/callback", "/_next/static/x.js", "/favicon.ico", "/logo.svg"]) {
      expect(decideAccess({ pathname, visitor: anon, ...on })).toEqual({ action: "next" });
    }
  });

  it("sends anonymous visitors to /login with the original path in ?next=", () => {
    expect(decideAccess({ pathname: "/home", visitor: anon, ...on })).toEqual({ action: "redirect", to: "/login?next=%2Fhome" });
    expect(decideAccess({ pathname: "/ask", search: "?q=1", visitor: anon, ...on })).toEqual({ action: "redirect", to: "/login?next=%2Fask%3Fq%3D1" });
  });

  it("answers 401 JSON on API routes for anonymous visitors", () => {
    expect(decideAccess({ pathname: "/api/ask", visitor: anon, ...on })).toEqual({ action: "json", status: 401, error: "Unauthorized" });
    expect(decideAccess({ pathname: "/api/ask", visitor: unauthorized, ...on })).toEqual({ action: "json", status: 401, error: "Unauthorized" });
  });

  it("flags a signed-in but unauthorized account on the login screen", () => {
    expect(decideAccess({ pathname: "/home", visitor: unauthorized, ...on })).toEqual({ action: "redirect", to: "/login?error=unauthorized" });
    expect(decideAccess({ pathname: "/login", visitor: unauthorized, ...on })).toEqual({ action: "next" });
  });

  it("admins get everything and are bounced off /login", () => {
    for (const pathname of ["/", "/home", "/upload", "/onboarding", "/ask", "/api/ask", "/api/anything"]) {
      expect(decideAccess({ pathname, visitor: admin, ...on })).toEqual({ action: "next" });
    }
    expect(decideAccess({ pathname: "/login", visitor: admin, ...on })).toEqual({ action: "redirect", to: "/" });
  });

  it("viewers only get /ask and /api/ask", () => {
    expect(decideAccess({ pathname: "/ask", visitor: viewer, ...on })).toEqual({ action: "next" });
    expect(decideAccess({ pathname: "/api/ask", visitor: viewer, ...on })).toEqual({ action: "next" });
    expect(decideAccess({ pathname: "/home", visitor: viewer, ...on })).toEqual({ action: "redirect", to: "/ask" });
    expect(decideAccess({ pathname: "/", visitor: viewer, ...on })).toEqual({ action: "redirect", to: "/ask" });
    expect(decideAccess({ pathname: "/api/run", visitor: viewer, ...on })).toEqual({ action: "json", status: 403, error: "Forbidden" });
    expect(decideAccess({ pathname: "/login", visitor: viewer, ...on })).toEqual({ action: "redirect", to: "/ask" });
  });
});

describe("safeNextPath", () => {
  it("keeps same-origin paths and rejects everything else", () => {
    expect(safeNextPath("/home")).toBe("/home");
    expect(safeNextPath("/ask?x=1")).toBe("/ask?x=1");
    expect(safeNextPath("https://evil.example/")).toBe("/");
    expect(safeNextPath("//evil.example/")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
    expect(safeNextPath("/login?next=/x")).toBe("/");
    expect(safeNextPath(null, "/ask")).toBe("/ask");
  });
});

describe("roles", () => {
  const admins = parseAdminEmails(" Admin@Example.com, second@example.com ,");

  it("matches admin emails case-insensitively", () => {
    expect(roleOf({ email: "admin@example.com" }, admins)).toBe("admin");
    expect(roleOf({ email: "SECOND@example.com", phone: "+972500000000" }, admins)).toBe("admin");
  });

  it("makes phone users viewers and rejects unknown emails", () => {
    expect(roleOf({ phone: "972500000000" }, admins)).toBe("viewer");
    expect(roleOf({ email: "someone@example.com" }, admins)).toBeNull();
    expect(roleOf({}, admins)).toBeNull();
  });
});

describe("normalizePhone", () => {
  it("turns Israeli formats into E.164", () => {
    expect(normalizePhone("050-000-0000")).toBe("+972500000000");
    expect(normalizePhone("0500000000")).toBe("+972500000000");
    expect(normalizePhone("972500000000")).toBe("+972500000000");
    expect(normalizePhone("+972 50-000-0000")).toBe("+972500000000");
    expect(normalizePhone("00972500000000")).toBe("+972500000000");
  });

  it("keeps other international numbers and rejects junk", () => {
    expect(normalizePhone("+1 555 000 0000")).toBe("+15550000000");
    expect(normalizePhone("abc")).toBeNull();
    expect(normalizePhone("12")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });

  it("phoneTail shows only the last digits", () => {
    expect(phoneTail("+972500000000")).toBe("···0000");
  });
});
