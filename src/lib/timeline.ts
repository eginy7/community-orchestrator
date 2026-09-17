/**
 * Locale-aware helpers for laying out evidence quotes on a timeline (Hebrew dual forms by default).
 * Pure functions, safe to import from client components. Strings come from the `timeline.*` dictionary keys.
 */

import { createT, type Locale, type MessageKey, type TFunction } from "@/lib/i18n/messages";

const DAY_MS = 86_400_000;

type PluralKeys = { one: MessageKey; two: MessageKey; many: MessageKey };
const DAYS: PluralKeys = { one: "timeline.dayOne", two: "timeline.dayTwo", many: "timeline.dayMany" };
const WEEKS: PluralKeys = { one: "timeline.weekOne", two: "timeline.weekTwo", many: "timeline.weekMany" };
const MONTHS: PluralKeys = { one: "timeline.monthOne", two: "timeline.monthTwo", many: "timeline.monthMany" };
const YEARS: PluralKeys = { one: "timeline.yearOne", two: "timeline.yearTwo", many: "timeline.yearMany" };
const PROOFS: PluralKeys = { one: "timeline.proofsOne", two: "timeline.proofsTwo", many: "timeline.proofsMany" };
const IN_GROUPS: PluralKeys = { one: "timeline.inGroupsOne", two: "timeline.inGroupsTwo", many: "timeline.inGroupsMany" };

/** Whole days between two epoch-ms timestamps (never negative). */
export function daysBetween(a: number, b: number): number {
  return Math.floor(Math.abs(b - a) / DAY_MS);
}

/** Dual-aware unit: "יום" / "יומיים" / "3 ימים" — or "one day" / "two days" / "3 days". */
function unit(t: TFunction, n: number, keys: PluralKeys): string {
  if (n === 1) return t(keys.one);
  if (n === 2) return t(keys.two);
  return t(keys.many, { n });
}

/** Formats a span in days as the most natural duration ("יומיים", "3 שבועות", "4 חודשים", "שנתיים"). */
export function formatDuration(days: number, locale: Locale = "he"): string {
  const t = createT(locale);
  if (days < 1) return t("timeline.dayOne");
  if (days < 14) return unit(t, days, DAYS);
  if (days < 60) return unit(t, Math.round(days / 7), WEEKS);
  if (days < 700) return unit(t, Math.round(days / 30.44), MONTHS);
  return unit(t, Math.round(days / 365.25), YEARS);
}

/** Relative label for a past timestamp: "היום", "אתמול", "השבוע", "לפני 3 שבועות", "לפני 4 חודשים". */
export function relativeLabel(ts: number, now: number = Date.now(), locale: Locale = "he"): string {
  const t = createT(locale);
  const days = daysBetween(ts, now);
  if (ts > now) return t("timeline.soon");
  if (days === 0) return t("timeline.today");
  if (days === 1) return t("timeline.yesterday");
  if (days < 7) return t("timeline.thisWeek");
  return t("timeline.ago", { span: formatDuration(days, locale) });
}

/** Connector caption between two timeline dots, or null when the gap is too small to be worth calling out. */
export function gapCaption(prevTs: number, nextTs: number, minDays = 14, locale: Locale = "he"): string | null {
  const days = daysBetween(prevTs, nextTs);
  if (days < minDays) return null;
  return createT(locale)("timeline.gapCaption", { span: formatDuration(days, locale) });
}

/** "N הוכחות על פני X ב-K קבוצות" — the one-line memory summary above the timeline. */
export function evidenceSummary(items: ReadonlyArray<{ ts: number; groupName: string }>, locale: Locale = "he"): string {
  if (items.length === 0) return "";
  const t = createT(locale);
  const n = items.length;
  const groups = new Set(items.map((i) => i.groupName)).size;
  const tss = items.map((i) => i.ts);
  const span = formatDuration(daysBetween(Math.min(...tss), Math.max(...tss)), locale);
  const proofs = unit(t, n, PROOFS);
  const inGroups = unit(t, groups, IN_GROUPS);
  if (n === 1) return t("timeline.summarySingle", { proofs, groups: inGroups });
  return t("timeline.summary", { proofs, span, groups: inGroups });
}
