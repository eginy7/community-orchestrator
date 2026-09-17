import type { GroupKind } from "@/lib/db/schema";

/**
 * Infer what a group is for from its WhatsApp name, so nobody has to configure it by hand.
 * The community manager can still refine kind/purpose later in settings.
 */

const RULES: Array<{ kind: GroupKind; re: RegExp; purpose: string }> = [
  { kind: "announcement", re: /הודעות|עדכונים|announce|broadcast|official|רשמי/i, purpose: "הודעות רשמיות לכל הקהילה" },
  { kind: "jobs", re: /משר|דרושים|עבודה|jobs?|hiring|career|פרילנס|freelance|gigs?/i, purpose: "משרות, פרילנס והזדמנויות" },
  { kind: "help", re: /שאל|עזרה|תמיכה|help|support|q&a|questions?|troubleshoot/i, purpose: "שאלות טכניות ועזרה הדדית" },
  { kind: "projects", re: /פרוי?יקט|כלים|build|projects?|showcase|demo|מה בניתי|ship|tools?/i, purpose: "פרויקטים אישיים, בנייה בפומבי ופידבק" },
  { kind: "general", re: /כללי|general|main|ראשי|lobby|קהילה|community|chat/i, purpose: "דיון כללי ושיתופים" },
];

export function inferGroupKind(name: string): { kind: GroupKind; purpose: string } {
  for (const r of RULES) if (r.re.test(name)) return { kind: r.kind, purpose: r.purpose };
  return { kind: "topic", purpose: `קבוצה בנושא «${name}»` };
}

/**
 * A group where almost nobody but one or two people write is a broadcast channel,
 * whatever its name says.
 */
export function looksLikeAnnouncementChannel(stats: { messageCount: number; senderCount: number }): boolean {
  return stats.messageCount >= 20 && stats.senderCount <= 3;
}
