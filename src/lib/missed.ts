import "server-only";
import { getSqlite } from "@/lib/db/client";
import type { Recommendation } from "@/lib/db/schema";
import { humanize, shortName } from "@/lib/display";
import { createT, type Locale, type MessageKey, type TFunction } from "@/lib/i18n/messages";
import type { EvidenceMessage } from "@/lib/queries";
import type { RecommendationView } from "@/lib/viewmodel";

/**
 * "מה פספסתי" — the hero card's one-line hook.
 * Computed from the cited messages' timestamps and groups (never from an LLM call),
 * so it can say things like "בהפרש של 4 חודשים" or "הדיון נעצר לפני 12 ימים" with real numbers.
 * Sentences are built per UI locale from the i18n dictionary (`missed.*` keys).
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

type PluralKeys = { one: MessageKey; two: MessageKey; many: MessageKey };
const DAYS: PluralKeys = { one: "missed.dayOne", two: "missed.dayTwo", many: "missed.dayMany" };
const WEEKS: PluralKeys = { one: "missed.weekOne", two: "missed.weekTwo", many: "missed.weekMany" };
const MONTHS: PluralKeys = { one: "missed.monthOne", two: "missed.monthTwo", many: "missed.monthMany" };
const YEARS: PluralKeys = { one: "missed.yearOne", two: "missed.yearTwo", many: "missed.yearMany" };
const PEOPLE: PluralKeys = { one: "missed.peopleOne", two: "missed.peopleTwo", many: "missed.peopleMany" };
const MESSAGES: PluralKeys = { one: "missed.messagesOne", two: "missed.messagesTwo", many: "missed.messagesMany" };
const IN_GROUPS: PluralKeys = { one: "missed.inGroupsOne", two: "missed.inGroupsTwo", many: "missed.inGroupsMany" };
const TIMES: PluralKeys = { one: "missed.timesOne", two: "missed.timesTwo", many: "missed.timesMany" };

/** Singular / dual / plural: "יום אחד", "יומיים", "6 ימים" — or "one day", "two days", "6 days". */
function count(t: TFunction, n: number, keys: PluralKeys): string {
  if (n <= 1) return t(keys.one);
  if (n === 2) return t(keys.two);
  return t(keys.many, { n });
}

/** Human span: "שבועיים", "4 חודשים" / "two weeks", "4 months". */
export function formatSpan(ms: number, locale: Locale = "he"): string {
  const t = createT(locale);
  const days = Math.round(Math.abs(ms) / DAY_MS);
  if (days < 1) return t("missed.spanLessThanDay");
  if (days < 14) return count(t, days, DAYS);
  if (days < 49) return count(t, Math.round(days / 7), WEEKS);
  const months = Math.round(days / 30.44);
  if (months < 18) return count(t, months, MONTHS);
  return count(t, Math.round(days / 365.25), YEARS);
}

/** "דנה ויוסי" for Hebrew names, "דנה ו-M0204" when the second token is Latin / numeric; "A and B" in English. */
function joinPair(t: TFunction, a: string, b: string): string {
  return /^[֐-׿]/.test(b) ? t("missed.pair", { a, b }) : t("missed.pairLatin", { a, b });
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

export function buildMissedHook(rec: Recommendation, messagesById: Map<number, EvidenceMessage>, real: boolean, now = Date.now(), locale: Locale = "he"): MissedHook {
  const t = createT(locale);
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
  const people = count(t, peopleIds.length, PEOPLE);
  const messages = count(t, msgs.length, MESSAGES);
  const groups = count(t, groupCount, IN_GROUPS);

  if (rec.type === "connect") {
    const introducees = rec.people.filter((p) => p.role === "introducee").map((p) => p.member_id);
    const pair = (introducees.length >= 2 ? introducees : peopleIds).slice(0, 2);
    if (pair.length === 2) {
      const co = countPairCoInteractions(pair[0], pair[1]);
      const gap = span < DAY_MS ? t("missed.gapSameDay") : t("missed.gapApart", { span: formatSpan(span, locale) });
      const tail = co === 0 ? t("missed.tailNever") : t(co <= 5 ? "missed.tailFew" : "missed.tailMany", { times: count(t, co, TIMES) });
      const named = t("missed.connectNamed", { pair: joinPair(t, shortName(pair[0], real, locale), shortName(pair[1], real, locale)), gap, tail });
      const generic = t("missed.connectGeneric", { gap, tail });
      return { ...base, hook: named.length <= MAX_HOOK_CHARS ? named : clip(generic) };
    }
  }

  if (rec.type === "revive") {
    const ago = now - lastMs;
    const stopped = ago < DAY_MS ? t("missed.stoppedToday") : t("missed.stoppedAgo", { span: formatSpan(ago, locale) });
    return { ...base, hook: clip(t("missed.reviveHook", { people, messages, groups, stopped })) };
  }

  // working_group / event / initiative / ritual — and connect without a clear pair.
  const over = span < DAY_MS ? t("missed.overOneDay") : t("missed.overSpan", { span: formatSpan(span, locale) });
  return { ...base, hook: clip(t("missed.defaultHook", { people, messages, over, groups })) };
}

/**
 * The hero for /home: the top-ranked recommendation of the run that is still open
 * (Stage B already puts the most surprising find at rank 1). Null when nothing qualifies.
 */
export function pickMissedHero(recs: Recommendation[], views: RecommendationView[], messagesById: Map<number, EvidenceMessage>, real: boolean, locale: Locale = "he"): MissedHero | null {
  const viewsById = new Map(views.map((v) => [v.id, v]));
  const candidates = [...recs].sort((a, b) => a.rank - b.rank);
  const rec = candidates.find((r) => r.status !== "dismissed" && r.status !== "done") ?? candidates[0];
  if (!rec) return null;
  const view = viewsById.get(rec.id);
  if (!view) return null;
  return { view, hook: buildMissedHook(rec, messagesById, real, Date.now(), locale) };
}
