import type { RecommendationView } from "@/lib/viewmodel";

/**
 * Text drafts composed from a recommendation view.
 * Pure string builders, no server-only imports — used by client components.
 */

const WORKING_GROUP_PREFIX = /^\s*(?:הקם|הקמת|פתח|פתיחת|צור|יצירת)?\s*קבוצת\s+עבודה\s*[:\-–—]\s*/u;

/** Turns a recommendation title into a group name: strips a leading "הקם קבוצת עבודה:"-style prefix and wrapping quotes. */
export function deriveGroupName(title: string): string {
  const stripped = title.replace(WORKING_GROUP_PREFIX, "").trim();
  const unquoted = stripped.replace(/^[«"“'‘]+|[»"”'’]+$/gu, "").trim();
  return unquoted || title.trim();
}

/** First sentence of a paragraph (up to the first ./!/? followed by whitespace or end). */
export function firstSentence(text: string): string {
  const trimmed = text.trim();
  const m = /^([\s\S]*?[.!?])(?:\s|$)/u.exec(trimmed);
  return (m ? m[1] : trimmed).trim();
}

/**
 * One multi-part text the manager pastes when opening a working group:
 * name, description, members, opening message, first task, timeline, agenda.
 * Empty parts are skipped so the draft never shows a bare label.
 */
export function buildKickoffDraft(view: RecommendationView): string {
  const parts: string[] = [];
  parts.push(`שם הקבוצה: ${deriveGroupName(view.title)}`);

  const description = firstSentence(view.why);
  if (description) parts.push(`תיאור: ${description}`);

  const members = view.people.map((p) => p.short).filter(Boolean);
  if (members.length) parts.push(`חברים: ${members.join(", ")}`);

  if (view.readyMessage.trim()) parts.push(`\nהודעת פתיחה:\n${view.readyMessage.trim()}`);

  const extras = view.extras;
  const tail: string[] = [];
  if (extras?.firstTask) tail.push(`משימה ראשונה: ${extras.firstTask}`);
  if (extras?.timeline) tail.push(`לוח זמנים: ${extras.timeline}`);
  if (tail.length) parts.push(`\n${tail.join("\n")}`);

  if (extras?.agenda.length) {
    const agenda = extras.agenda.map((a, i) => `${i + 1}. ${a}`).join("\n");
    parts.push(`\nמבנה:\n${agenda}`);
  }

  return parts.join("\n");
}

/** Plain-text description for a calendar event: why, numbered agenda, suggested hosts, and the ready message. */
export function buildEventDescription(view: RecommendationView): string {
  const parts: string[] = [];
  if (view.why.trim()) parts.push(view.why.trim());

  if (view.extras?.agenda.length) {
    parts.push(`אג׳נדה:\n${view.extras.agenda.map((a, i) => `${i + 1}. ${a}`).join("\n")}`);
  }

  // `roleKey` is the raw role id; the label check keeps older/synthetic views (and Hebrew-only fixtures) working.
  const hosts = view.people.filter((p) => p.roleKey === "host" || p.role === "מנחה" || p.role === "host").map((p) => p.name);
  if (hosts.length) parts.push(`מנחים מוצעים: ${hosts.join(", ")}`);

  if (view.readyMessage.trim()) parts.push(`הודעה מוכנה:\n${view.readyMessage.trim()}`);

  return parts.join("\n\n");
}
