import "server-only";
import { getSqlite } from "@/lib/db/client";
import type { Recommendation } from "@/lib/db/schema";
import { humanize, shortName } from "@/lib/display";
import type { EvidenceMessage } from "@/lib/queries";
import type { RecommendationView } from "@/lib/viewmodel";

/**
 * "מה פספסתי" — the hero card's one-line hook.
 * Computed from the cited messages' timestamps and groups (never from an LLM call),
 * so it can say things like "בהפרש של 4 חודשים" or "הדיון נעצר לפני 12 ימים" with real numbers.
 */

export interface MissedHook {
  hook: string;
  firstSeen: Date | null;
  lastSeen: Date | null;
  groupCount: number;
}

export interface MissedHero {
  view: RecommendationView;
  hook: MissedHook;
}

const MAX_HOOK_CHARS = 110;
const DAY_MS = 86_400_000;
const CO_INTERACTION_WINDOW_MS = 600_000;

/** Hebrew span with singular / dual / plural forms: "יום אחד", "יומיים", "6 ימים", "שבועיים", "4 חודשים". */
export function formatSpan(ms: number): string {
  const days = Math.round(Math.abs(ms) / DAY_MS);
  if (days < 1) return "פחות מיום";
  if (days < 14) return count(days, "יום אחד", "יומיים", "ימים");
  if (days < 49) return count(Math.round(days / 7), "שבוע אחד", "שבועיים", "שבועות");
  const months = Math.round(days / 30.44);
  if (months < 18) return count(months, "חודש אחד", "חודשיים", "חודשים");
  return count(Math.round(days / 365.25), "שנה אחת", "שנתיים", "שנים");
}

function count(n: number, one: string, two: string, many: string): string {
  if (n <= 1) return one;
  if (n === 2) return two;
  return `${n} ${many}`;
}

function peopleWord(n: number): string {
  return count(n, "חבר אחד", "שני חברים", "חברים");
}

function messagesWord(n: number): string {
  return count(n, "הודעה אחת", "שתי הודעות", "הודעות");
}

function groupsWord(n: number): string {
  if (n <= 1) return "בקבוצה אחת";
  if (n === 2) return "בשתי קבוצות";
  return `ב-${n} קבוצות`;
}

function timesWord(n: number): string {
  return count(n, "פעם אחת", "פעמיים", "פעמים");
}

/** "דנה ויוסי" for Hebrew names, "דנה ו-M0204" when the second token is Latin / numeric. */
function joinPair(a: string, b: string): string {
  return /^[֐-׿]/.test(b) ? `${a} ו${b}` : `${a} ו-${b}`;
}

/** Cut to the character budget on a word boundary. */
function clip(s: string, max = MAX_HOOK_CHARS): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).trimEnd()}…`;
}

/**
 * How many times did two members post in the same group within 10 minutes of each other?
 * Same window and message kinds as computeCoInteractions (analysis/merge.ts), for one pair only.
 */
export function countPairCoInteractions(a: string, b: string): number {
  if (!a || !b || a === b) return 0;
  const row = getSqlite()
    .prepare(
      `SELECT count(*) AS c
       FROM messages a
       JOIN messages b
         ON b.group_id = a.group_id
        AND b.ts > a.ts AND b.ts <= a.ts + ?
        AND b.kind IN ('text','media')
       WHERE a.kind IN ('text','media')
         AND ((a.member_id = ? AND b.member_id = ?) OR (a.member_id = ? AND b.member_id = ?))`,
    )
    .get(CO_INTERACTION_WINDOW_MS, a, b, b, a) as { c: number } | undefined;
  return row?.c ?? 0;
}

export function buildMissedHook(rec: Recommendation, messagesById: Map<number, EvidenceMessage>, real: boolean, now = Date.now()): MissedHook {
  const msgs = rec.evidence.flatMap((e) => {
    const m = messagesById.get(e.message_id);
    return m ? [m] : [];
  });

  if (msgs.length === 0) {
    return { hook: clip(humanize(rec.whyNow, real)), firstSeen: null, lastSeen: null, groupCount: 0 };
  }

  const times = msgs.map((m) => m.ts.getTime());
  const firstMs = Math.min(...times);
  const lastMs = Math.max(...times);
  const firstSeen = new Date(firstMs);
  const lastSeen = new Date(lastMs);
  const groupCount = new Set(msgs.map((m) => m.groupId)).size;
  const peopleIds = rec.people.length ? rec.people.map((p) => p.member_id) : [...new Set(msgs.flatMap((m) => (m.memberId ? [m.memberId] : [])))];
  const span = lastMs - firstMs;
  const base = { firstSeen, lastSeen, groupCount };

  if (rec.type === "connect") {
    const introducees = rec.people.filter((p) => p.role === "introducee").map((p) => p.member_id);
    const pair = (introducees.length >= 2 ? introducees : peopleIds).slice(0, 2);
    if (pair.length === 2) {
      const co = countPairCoInteractions(pair[0], pair[1]);
      const gap = span < DAY_MS ? "באותו יום" : `בהפרש של ${formatSpan(span)}`;
      const tail = co === 0 ? "ומעולם לא כתבו באותה שיחה" : co <= 5 ? `וכתבו זה לצד זה רק ${timesWord(co)}` : `וכתבו זה לצד זה ${timesWord(co)}`;
      const named = `${joinPair(shortName(pair[0], real), shortName(pair[1], real))} דיברו על אותו נושא ${gap} ${tail}`;
      const generic = `שני חברים דיברו על אותו נושא ${gap} ${tail}`;
      return { ...base, hook: named.length <= MAX_HOOK_CHARS ? named : clip(generic) };
    }
  }

  if (rec.type === "revive") {
    const ago = now - lastMs;
    const stopped = ago < DAY_MS ? "הדיון נעצר היום בלי מענה" : `הדיון נעצר לפני ${formatSpan(ago)} בלי מענה`;
    return { ...base, hook: clip(`${peopleWord(peopleIds.length)}, ${messagesWord(msgs.length)} ${groupsWord(groupCount)} · ${stopped}`) };
  }

  // working_group / event / initiative / ritual — and connect without a clear pair.
  const over = span < DAY_MS ? "ביום אחד" : `על פני ${formatSpan(span)}`;
  return { ...base, hook: clip(`${peopleWord(peopleIds.length)}, ${messagesWord(msgs.length)} בנושא הזה, ${over} ${groupsWord(groupCount)}`) };
}

/**
 * The hero for /home: the top-ranked recommendation of the run that is still open
 * (Stage B already puts the most surprising find at rank 1). Null when nothing qualifies.
 */
export function pickMissedHero(recs: Recommendation[], views: RecommendationView[], messagesById: Map<number, EvidenceMessage>, real: boolean): MissedHero | null {
  const viewsById = new Map(views.map((v) => [v.id, v]));
  const candidates = [...recs].sort((a, b) => a.rank - b.rank);
  const rec = candidates.find((r) => r.status !== "dismissed" && r.status !== "done") ?? candidates[0];
  if (!rec) return null;
  const view = viewsById.get(rec.id);
  if (!view) return null;
  return { view, hook: buildMissedHook(rec, messagesById, real) };
}
