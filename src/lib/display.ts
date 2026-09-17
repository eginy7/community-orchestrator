import "server-only";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db/client";
import { groups } from "@/lib/db/schema";
import { getPseudonymStore } from "@/lib/pseudonym/store";

/**
 * De-pseudonymization for display. Runs only on the server, at render time.
 * A cookie lets the community manager switch to pseudonyms for screenshots / public demos.
 */

const TOKEN_RE = /@?\b(M\d{4,})\b/g;
// Group references the model writes as "G6" / "(G6/G2)" — replaced with «group name».
const GROUP_RE = /\bG(\d{1,4})\b/g;

let groupNames: Map<number, string> | null = null;
function groupName(id: number): string | null {
  if (!groupNames) groupNames = new Map(getDb().select({ id: groups.id, name: groups.name }).from(groups).all().map((g) => [g.id, g.name]));
  return groupNames.get(id) ?? null;
}
/** Call after groups change (uploads, settings). */
export function invalidateGroupNames(): void {
  groupNames = null;
}

export async function showRealNames(): Promise<boolean> {
  const jar = await cookies();
  return jar.get("show_names")?.value !== "0";
}

export function resolveName(id: string, real: boolean): string {
  if (!real) return id.replace(/^@/, "");
  return getPseudonymStore().displayName(id.replace(/^@/, ""));
}

/**
 * Replace M#### / @M#### tokens with display names and G## tokens with «group names».
 * mode "ui" (default) shortens unsaved contacts to "חבר/ה ···1234" so screens stay readable;
 * mode "message" keeps the full number, because the copied WhatsApp text must identify the person.
 */
export function humanize(text: string, real: boolean, mode: "ui" | "message" = "ui"): string {
  const withGroups = text.replace(GROUP_RE, (m, id: string) => {
    const name = groupName(Number(id));
    return name ? `«${name}»` : m;
  });
  if (!real) return withGroups.replace(/@(M\d{4,})/g, "$1");
  return withGroups.replace(TOKEN_RE, (_m, id: string) => (mode === "ui" ? shortName(id, true) : resolveName(id, true)));
}

/**
 * First name / short handle for chips and avatars.
 * Members the exporting phone had not saved appear as phone numbers; show only the last digits.
 */
export function shortName(id: string, real: boolean): string {
  const full = resolveName(id, real);
  if (!real) return full;
  if (full.startsWith("+")) return `חבר/ה ···${full.replace(/\D/g, "").slice(-4)}`;
  return full.split(/\s+/).slice(0, 2).join(" ");
}

export function initials(id: string, real: boolean): string {
  const name = resolveName(id, real);
  if (!real) return name.replace(/^M0*/, "").slice(-2) || "?";
  if (name.startsWith("+")) return name.replace(/\D/g, "").slice(-2);
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("");
}
