import { and, desc, eq, lt } from "drizzle-orm";
import { getDb, getSqlite } from "@/lib/db/client";
import { analysisRuns, recommendations, type RecommendationStatus, type RecommendationType } from "@/lib/db/schema";

/**
 * The feedback loop ("what happened since last week?").
 *
 * Before Stage B runs, we look up the previous completed run's recommendations and compute,
 * from the database alone, what the community did since that run finished: did the two people
 * we wanted to introduce start writing next to each other, did the group we pointed at wake up.
 * The facts are rendered into a compact text block that goes into the Stage B USER message
 * (never into the cached system blocks), and Stage B reports on each item in `follow_ups`.
 *
 * Everything here is keyed by pseudonym ids (M####) and group ids (G##). No names, no text.
 */

/** Same 10-minute window as `computeCoInteractions` in merge.ts. */
const CO_INTERACTION_WINDOW_MS = 600_000;
/** For working groups / events we only look at pairs among the first N people. */
const MAX_PEOPLE_FOR_PAIRS = 6;
const MAX_NOTE_CHARS = 200;

export interface PreviousPlanItem {
  rank: number;
  type: RecommendationType;
  title: string;
  status: RecommendationStatus;
  feedbackNote: string | null;
  /** Pseudonym ids, in the order the model listed them. */
  people: string[];
  whereGroupId: number | null;
}

export interface PairFact {
  a: string;
  b: string;
  count: number;
}

export interface PlanItemFacts {
  /** Every pair among the (capped) people of the item, including zero counts. */
  pairs: PairFact[];
  /** Messages since the previous run, per person. Missing key = 0. */
  messagesByPerson: Record<string, number>;
  /** Activity in `whereGroupId` since the previous run, when the item pointed at a group. */
  group: { groupId: number; messages: number; authors: number } | null;
}

export interface PreviousPlan {
  prevRunId: number;
  sinceMs: number;
  itemCount: number;
  text: string;
}

/** Unordered, de-duplicated pairs among the first `MAX_PEOPLE_FOR_PAIRS` ids, each sorted (a < b). */
export function pairsOf(ids: string[]): Array<[string, string]> {
  const unique = [...new Set(ids)].slice(0, MAX_PEOPLE_FOR_PAIRS);
  const out: Array<[string, string]> = [];
  for (let i = 0; i < unique.length; i++) {
    for (let j = i + 1; j < unique.length; j++) {
      const [a, b] = unique[i] < unique[j] ? [unique[i], unique[j]] : [unique[j], unique[i]];
      out.push([a, b]);
    }
  }
  return out;
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** The latest run of this community that completed before the current one. */
export function findPreviousRun(communityId: number, currentRunId: number): { id: number; finishedAt: Date | null; createdAt: Date } | null {
  return (
    getDb()
      .select({ id: analysisRuns.id, finishedAt: analysisRuns.finishedAt, createdAt: analysisRuns.createdAt })
      .from(analysisRuns)
      .where(and(eq(analysisRuns.communityId, communityId), eq(analysisRuns.status, "done"), lt(analysisRuns.id, currentRunId)))
      .orderBy(desc(analysisRuns.id))
      .get() ?? null
  );
}

export function loadPreviousPlanItems(prevRunId: number): PreviousPlanItem[] {
  return getDb()
    .select({
      rank: recommendations.rank,
      type: recommendations.type,
      title: recommendations.title,
      status: recommendations.status,
      feedbackNote: recommendations.feedbackNote,
      people: recommendations.people,
      whereGroupId: recommendations.whereGroupId,
    })
    .from(recommendations)
    .where(eq(recommendations.runId, prevRunId))
    .orderBy(recommendations.rank)
    .all()
    .map((r) => ({ ...r, people: r.people.map((p) => p.member_id) }));
}

/**
 * Facts from the messages table since `sinceMs`, restricted to `groupIds` (the groups of the
 * current run). One SQL round-trip per fact kind for all items together, then split per item.
 */
export function gatherPlanFacts(items: PreviousPlanItem[], groupIds: number[], sinceMs: number): PlanItemFacts[] {
  const sqlite = getSqlite();
  const allPeople = [...new Set(items.flatMap((it) => it.people.slice(0, MAX_PEOPLE_FOR_PAIRS)))];
  const pairCounts = new Map<string, number>();
  const msgCounts = new Map<string, number>();

  if (allPeople.length > 0 && groupIds.length > 0) {
    const gPh = groupIds.map(() => "?").join(",");
    const mPh = allPeople.map(() => "?").join(",");
    const pairRows = sqlite
      .prepare(
        `SELECT min(a.member_id, b.member_id) AS a, max(a.member_id, b.member_id) AS b, count(*) AS c
         FROM messages a
         JOIN messages b
           ON b.group_id = a.group_id
          AND b.ts > a.ts AND b.ts <= a.ts + ${CO_INTERACTION_WINDOW_MS}
          AND b.member_id IS NOT NULL AND b.member_id <> a.member_id
          AND b.kind IN ('text','media')
          AND b.member_id IN (${mPh})
         WHERE a.group_id IN (${gPh})
           AND a.member_id IN (${mPh})
           AND a.kind IN ('text','media')
           AND a.ts >= ?
         GROUP BY min(a.member_id, b.member_id), max(a.member_id, b.member_id)`,
      )
      .all(...allPeople, ...groupIds, ...allPeople, sinceMs) as Array<{ a: string; b: string; c: number }>;
    for (const r of pairRows) pairCounts.set(pairKey(r.a, r.b), r.c);

    const msgRows = sqlite
      .prepare(
        `SELECT member_id AS id, count(*) AS c
         FROM messages
         WHERE group_id IN (${gPh}) AND member_id IN (${mPh}) AND kind IN ('text','media') AND ts >= ?
         GROUP BY member_id`,
      )
      .all(...groupIds, ...allPeople, sinceMs) as Array<{ id: string; c: number }>;
    for (const r of msgRows) msgCounts.set(r.id, r.c);
  }

  const groupStmt = sqlite.prepare(
    `SELECT count(*) AS n, count(DISTINCT member_id) AS authors
     FROM messages
     WHERE group_id = ? AND ts >= ? AND kind IN ('text','media') AND member_id IS NOT NULL`,
  );

  return items.map((it) => {
    const people = it.people.slice(0, MAX_PEOPLE_FOR_PAIRS);
    const pairs = pairsOf(people).map(([a, b]) => ({ a, b, count: pairCounts.get(pairKey(a, b)) ?? 0 }));
    const messagesByPerson: Record<string, number> = {};
    for (const p of people) messagesByPerson[p] = msgCounts.get(p) ?? 0;
    let group: PlanItemFacts["group"] = null;
    if (it.whereGroupId !== null) {
      const row = groupStmt.get(it.whereGroupId, sinceMs) as { n: number; authors: number } | undefined;
      group = { groupId: it.whereGroupId, messages: row?.n ?? 0, authors: row?.authors ?? 0 };
    }
    return { pairs, messagesByPerson, group };
  });
}

/** One line per item, English keys, pseudonym ids only. */
export function renderPreviousPlan(items: PreviousPlanItem[], facts: PlanItemFacts[], sinceIso: string): string {
  const lines = items.map((it, i) => {
    const f = facts[i];
    const parts = [`${it.rank}. ${it.type} — status: ${it.status} — «${it.title.replace(/\s+/g, " ").trim()}»`];
    const people = it.people.slice(0, MAX_PEOPLE_FOR_PAIRS);
    if (people.length) parts.push(`people ${people.join(",")}`);
    if (f.pairs.length === 1) {
      parts.push(`co-interactions since: ${f.pairs[0].count}`);
    } else if (f.pairs.length > 1) {
      const active = f.pairs.filter((p) => p.count > 0).sort((x, y) => y.count - x.count);
      parts.push(
        active.length
          ? `co-interacting pairs since: ${active.map((p) => `${p.a}↔${p.b} ${p.count}`).join(", ")} (${active.length} of ${f.pairs.length} pairs)`
          : `co-interacting pairs since: none (0 of ${f.pairs.length} pairs)`,
      );
    }
    if (people.length) parts.push(`messages since: ${people.map((p) => `${p} ${f.messagesByPerson[p] ?? 0}`).join(", ")}`);
    if (f.group) parts.push(`group G${f.group.groupId} since: ${f.group.messages} msgs by ${f.group.authors} authors`);
    if (it.feedbackNote?.trim()) parts.push(`manager note: «${it.feedbackNote.replace(/\s+/g, " ").trim().slice(0, MAX_NOTE_CHARS)}»`);
    return parts.join(" — ");
  });
  return [`## Last week's plan (rank, type, status set by the manager, title) and what the data shows since ${sinceIso}`, ...lines].join("\n");
}

/**
 * Everything Stage B needs about last week, or null on the first run (or when the previous
 * run produced no recommendations).
 */
export function buildPreviousPlan(opts: { communityId: number; currentRunId: number; groupIds: number[] }): PreviousPlan | null {
  const prev = findPreviousRun(opts.communityId, opts.currentRunId);
  if (!prev) return null;
  const items = loadPreviousPlanItems(prev.id);
  if (items.length === 0) return null;
  const sinceMs = (prev.finishedAt ?? prev.createdAt).getTime();
  const facts = gatherPlanFacts(items, opts.groupIds, sinceMs);
  return {
    prevRunId: prev.id,
    sinceMs,
    itemCount: items.length,
    text: renderPreviousPlan(items, facts, new Date(sinceMs).toISOString().slice(0, 10)),
  };
}
