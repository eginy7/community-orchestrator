import { getSqlite } from "@/lib/db/client";

/**
 * Server-side only (reads the SQLite file directly; no "server-only" import so vitest can load it).
 * Community momentum: a 0..100 health score computed from the DB alone (no LLM).
 * Compares the last 14 days with the 14 days before them.
 */

export type MomentumTrend = "up" | "flat" | "down";

export interface MomentumParts {
  messagesPerWeek: number;
  prevMessagesPerWeek: number;
  activeMembers: number;
  prevActiveMembers: number;
  /** Share of questions that got a reply from someone else within 24h (0..1). */
  answeredRatio: number;
  prevAnsweredRatio: number;
  newMembers: number;
}

export interface Momentum {
  score: number;
  trend: MomentumTrend;
  /** Score minus the same formula applied to the previous window. */
  delta: number;
  parts: MomentumParts;
}

const DAY = 86_400_000;
const WINDOW = 14 * DAY;
const BASELINE = 56 * DAY; // 8 weeks
const WEEKS_PER_WINDOW = 2;
const TREND_THRESHOLD = 5;

const WEIGHTS = { activity: 0.4, active: 0.25, answered: 0.25, newMembers: 0.1 } as const;
/** Messages/week at this multiple of the 8-week average earns full activity marks. */
const ACTIVITY_FULL_AT = 1.5;
/** This share of the 8-week audience posting in the window earns full active-member marks. */
const ACTIVE_FULL_AT = 0.75;
/** New members in the window = 8% of the 8-week audience (at least 3) earns full marks. */
const NEW_FULL_SHARE = 0.08;
const NEW_FULL_MIN = 3;

interface WindowStats {
  messages: number;
  activeMembers: number;
  questions: number;
  answered: number;
  newMembers: number;
}

interface Baseline {
  messagesPerWeek: number;
  audience: number;
}

const QUESTION = `(m.text LIKE '%?%' OR m.text LIKE '%؟%')`;

/** One statement for messages / active members / questions / answered questions in [from, to). */
function windowStats(communityId: number, from: number, to: number): WindowStats {
  const sqlite = getSqlite();
  const row = sqlite
    .prepare(
      `SELECT count(*) AS messages,
              count(DISTINCT m.member_id) AS activeMembers,
              coalesce(sum(CASE WHEN ${QUESTION} THEN 1 ELSE 0 END), 0) AS questions,
              coalesce(sum(CASE WHEN ${QUESTION} AND EXISTS (
                SELECT 1 FROM messages r
                WHERE r.group_id = m.group_id
                  AND r.member_id IS NOT NULL
                  AND r.member_id <> m.member_id
                  AND r.kind IN ('text','media')
                  AND r.ts > m.ts AND r.ts <= m.ts + ${DAY}
              ) THEN 1 ELSE 0 END), 0) AS answered
       FROM messages m JOIN groups g ON g.id = m.group_id
       WHERE g.community_id = ? AND m.kind IN ('text','media') AND m.member_id IS NOT NULL
         AND m.ts >= ? AND m.ts < ?`,
    )
    .get(communityId, from, to) as Omit<WindowStats, "newMembers">;
  const fresh = sqlite.prepare(`SELECT count(*) AS n FROM members WHERE community_id = ? AND first_seen >= ? AND first_seen < ?`).get(communityId, from, to) as { n: number };
  return { ...row, newMembers: fresh.n };
}

/** 8-week average messages/week and distinct posting members, for the 8 weeks ending at `to`. */
function baseline(communityId: number, to: number): Baseline {
  const row = getSqlite()
    .prepare(
      `SELECT count(*) AS n, count(DISTINCT m.member_id) AS audience
       FROM messages m JOIN groups g ON g.id = m.group_id
       WHERE g.community_id = ? AND m.kind IN ('text','media') AND m.member_id IS NOT NULL
         AND m.ts >= ? AND m.ts < ?`,
    )
    .get(communityId, to - BASELINE, to) as { n: number; audience: number };
  return { messagesPerWeek: row.n / (BASELINE / (7 * DAY)), audience: row.audience };
}

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

function scoreWindow(w: WindowStats, b: Baseline): number {
  const perWeek = w.messages / WEEKS_PER_WINDOW;
  const activity = clamp01(b.messagesPerWeek > 0 ? perWeek / b.messagesPerWeek / ACTIVITY_FULL_AT : 0);
  const active = clamp01(b.audience > 0 ? w.activeMembers / b.audience / ACTIVE_FULL_AT : 0);
  const answered = clamp01(w.questions > 0 ? w.answered / w.questions : 0);
  const fresh = clamp01(w.newMembers / Math.max(NEW_FULL_MIN, b.audience * NEW_FULL_SHARE));
  const raw = 100 * (WEIGHTS.activity * activity + WEIGHTS.active * active + WEIGHTS.answered * answered + WEIGHTS.newMembers * fresh);
  return Math.round(Math.min(100, Math.max(0, raw)));
}

export function getMomentum(communityId: number, now = Date.now()): Momentum {
  const curFrom = now - WINDOW;
  const prevFrom = curFrom - WINDOW;

  const cur = windowStats(communityId, curFrom, now);
  const prev = windowStats(communityId, prevFrom, curFrom);
  const score = scoreWindow(cur, baseline(communityId, now));
  const prevScore = scoreWindow(prev, baseline(communityId, curFrom));
  const delta = score - prevScore;
  const trend: MomentumTrend = delta >= TREND_THRESHOLD ? "up" : delta <= -TREND_THRESHOLD ? "down" : "flat";

  return {
    score,
    trend,
    delta,
    parts: {
      messagesPerWeek: Math.round(cur.messages / WEEKS_PER_WINDOW),
      prevMessagesPerWeek: Math.round(prev.messages / WEEKS_PER_WINDOW),
      activeMembers: cur.activeMembers,
      prevActiveMembers: prev.activeMembers,
      answeredRatio: cur.questions > 0 ? cur.answered / cur.questions : 0,
      prevAnsweredRatio: prev.questions > 0 ? prev.answered / prev.questions : 0,
      newMembers: cur.newMembers,
    },
  };
}
