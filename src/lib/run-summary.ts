/**
 * Pure formatting for the "what did this run cost" line. No DB imports — used by both the
 * client progress screen and the server-rendered home header.
 */

import { createT, dateLocaleOf, type Locale } from "@/lib/i18n/messages";

export interface RunSummary {
  /** Messages the run actually read (sum over chunks that finished). */
  messagesRead: number;
  costUsd: number;
  /** finishedAt - startedAt; null while the run is still going. */
  durationMs: number | null;
}

/** "ניתחתי 5,003 הודעות ב-$5.71 · 30 דקות" / "Analyzed 5,003 messages for $5.71 · 30 minutes" */
export function formatRunSummary({ messagesRead, costUsd, durationMs }: RunSummary, locale: Locale = "he"): string {
  const t = createT(locale);
  const num = dateLocaleOf(locale);
  const minutes = durationMs == null ? null : Math.max(1, Math.round(durationMs / 60_000));
  const base = t("runProgress.summary", { messages: messagesRead.toLocaleString(num), cost: costUsd.toFixed(2) });
  return minutes == null ? base : `${base}${t("runProgress.summaryMinutes", { minutes: minutes.toLocaleString(num) })}`;
}
