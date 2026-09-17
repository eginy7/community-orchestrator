import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, getSqlite } from "@/lib/db/client";
import type { RunSummary } from "@/lib/run-summary";
import {
  analysisRuns,
  chunks,
  communities,
  groups,
  memberProfiles,
  messages,
  recommendations,
  threads,
  topics,
  uploads,
  type FollowUp,
  type Group,
  type Recommendation,
} from "@/lib/db/schema";

/** Read helpers used by server components and API routes. */

export function getCommunity() {
  return getDb().select().from(communities).orderBy(communities.id).get() ?? null;
}

export function getGroups(communityId: number) {
  return getDb().select().from(groups).where(eq(groups.communityId, communityId)).orderBy(groups.id).all();
}

export interface GroupStats {
  id: number;
  name: string;
  kind: Group["kind"];
  purpose: string;
  isAnnouncement: boolean;
  messageCount: number;
  memberCount: number;
  firstTs: number | null;
  lastTs: number | null;
  uploads: number;
}

export function getGroupStats(communityId: number): GroupStats[] {
  getDb();
  const rows = getSqlite()
    .prepare(
      `SELECT g.id, g.name, g.kind, g.purpose, g.is_announcement AS isAnnouncement,
              (SELECT count(*) FROM messages m WHERE m.group_id = g.id) AS messageCount,
              (SELECT count(*) FROM group_members gm WHERE gm.group_id = g.id) AS memberCount,
              (SELECT min(ts) FROM messages m WHERE m.group_id = g.id) AS firstTs,
              (SELECT max(ts) FROM messages m WHERE m.group_id = g.id) AS lastTs,
              (SELECT count(*) FROM uploads u WHERE u.group_id = g.id) AS uploads
       FROM groups g WHERE g.community_id = ? ORDER BY g.id`,
    )
    .all(communityId) as Array<Omit<GroupStats, "isAnnouncement"> & { isAnnouncement: number }>;
  return rows.map((r) => ({ ...r, isAnnouncement: r.isAnnouncement === 1 }));
}

export function getLatestRun(communityId: number, status?: "done") {
  const db = getDb();
  return (
    db
      .select()
      .from(analysisRuns)
      .where(status ? and(eq(analysisRuns.communityId, communityId), eq(analysisRuns.status, status)) : eq(analysisRuns.communityId, communityId))
      .orderBy(desc(analysisRuns.id))
      .get() ?? null
  );
}

export function getRun(runId: number) {
  return getDb().select().from(analysisRuns).where(eq(analysisRuns.id, runId)).get() ?? null;
}

/** Stage B's report on the previous run's plan. Empty on the first run or before Stage B finished. */
export function getFollowUps(runId: number): FollowUp[] {
  return getDb().select({ followUps: analysisRuns.followUps }).from(analysisRuns).where(eq(analysisRuns.id, runId)).get()?.followUps ?? [];
}

export function getRecommendations(runId: number): Recommendation[] {
  return getDb().select().from(recommendations).where(eq(recommendations.runId, runId)).orderBy(recommendations.rank).all();
}

export function getRecommendation(id: number): Recommendation | null {
  return getDb().select().from(recommendations).where(eq(recommendations.id, id)).get() ?? null;
}

export interface EvidenceMessage {
  id: number;
  groupId: number;
  groupName: string;
  memberId: string | null;
  ts: Date;
  text: string;
}

/** Real quotes, fetched by id — never taken from the model output. */
export function getMessagesByIds(ids: number[]): Map<number, EvidenceMessage> {
  const out = new Map<number, EvidenceMessage>();
  if (ids.length === 0) return out;
  const rows = getDb()
    .select({ id: messages.id, groupId: messages.groupId, groupName: groups.name, memberId: messages.memberId, ts: messages.ts, text: messages.text })
    .from(messages)
    .innerJoin(groups, eq(groups.id, messages.groupId))
    .where(inArray(messages.id, ids))
    .all();
  for (const r of rows) out.set(r.id, r);
  return out;
}

export function getTopics(runId: number, limit = 12) {
  return getDb()
    .select()
    .from(topics)
    .where(eq(topics.runId, runId))
    .orderBy(sql`json_array_length(${topics.memberIds}) desc`)
    .limit(limit)
    .all();
}

export function getTopProfiles(runId: number, limit = 12) {
  return getDb().select().from(memberProfiles).where(eq(memberProfiles.runId, runId)).orderBy(desc(memberProfiles.richness)).limit(limit).all();
}

/** Number of member profiles in a run — shown in the "ask the community" loading state. */
export function getProfileCount(runId: number): number {
  const row = getDb().select({ n: sql<number>`count(*)` }).from(memberProfiles).where(eq(memberProfiles.runId, runId)).get();
  return row?.n ?? 0;
}

export function getOpenThreads(runId: number, limit = 12) {
  return getDb()
    .select({
      id: threads.id,
      kind: threads.kind,
      title: threads.title,
      summary: threads.summary,
      status: threads.status,
      memberIds: threads.memberIds,
      messageIds: threads.messageIds,
      ts: threads.ts,
      groupName: groups.name,
    })
    .from(threads)
    .innerJoin(groups, eq(groups.id, threads.groupId))
    .where(and(eq(threads.runId, runId), inArray(threads.kind, ["unanswered", "stalled", "collab_signal"])))
    .orderBy(desc(threads.ts))
    .limit(limit)
    .all();
}

export function getUploads(communityId: number) {
  return getDb()
    .select({ id: uploads.id, filename: uploads.filename, groupName: groups.name, messageCount: uploads.messageCount, insertedCount: uploads.insertedCount, firstTs: uploads.firstTs, lastTs: uploads.lastTs, createdAt: uploads.createdAt })
    .from(uploads)
    .innerJoin(groups, eq(groups.id, uploads.groupId))
    .where(eq(groups.communityId, communityId))
    .orderBy(desc(uploads.id))
    .all();
}

/** When did the community manager last upload anything? Drives the weekly check-in reminder. */
export function getLastUploadAt(communityId: number): Date | null {
  getDb();
  const row = getSqlite()
    .prepare(`SELECT max(u.created_at) AS ts FROM uploads u JOIN groups g ON g.id = u.group_id WHERE g.community_id = ?`)
    .get(communityId) as { ts: number | null } | undefined;
  return row?.ts ? new Date(row.ts) : null;
}

export interface WeeklyReminder {
  daysSinceUpload: number;
  lastUploadAt: Date;
}

/** Non-null when more than 7 days passed since the last upload. */
export function getWeeklyReminder(communityId: number, now = Date.now()): WeeklyReminder | null {
  const last = getLastUploadAt(communityId);
  if (!last) return null;
  const days = Math.floor((now - last.getTime()) / 86_400_000);
  return days >= 7 ? { daysSinceUpload: days, lastUploadAt: last } : null;
}

export interface CorpusEstimate {
  messages: number;
  estTokens: number;
  estCostUsd: number;
}

/** Rough size/cost of analysing everything currently in the database (used before the first full run). */
export function getCorpusEstimate(communityId: number, sinceMs: number | null = null): CorpusEstimate {
  getDb();
  const row = getSqlite()
    .prepare(
      `SELECT count(*) AS n, coalesce(sum(length(m.text)), 0) AS chars
       FROM messages m JOIN groups g ON g.id = m.group_id
       WHERE g.community_id = ? AND m.kind IN ('text','media') AND m.text <> '' ${sinceMs ? "AND m.ts >= ?" : ""}`,
    )
    .get(...(sinceMs ? [communityId, sinceMs] : [communityId])) as { n: number; chars: number };
  // ~28 chars of "#id [dd/mm hh:mm] M0000: " prefix per line; Hebrew ≈ 2.2 chars/token.
  const estTokens = Math.round((row.chars + row.n * 28) / 2.2);
  const chunks = Math.max(1, Math.ceil(estTokens / 110_000));
  const estCostUsd = (estTokens * 5 + chunks * 12_000 * 25) / 1e6 + 0.8;
  return { messages: row.n, estTokens, estCostUsd: Math.round(estCostUsd * 10) / 10 };
}

/** What a run read and cost — for the "ניתחתי N הודעות ב-$X · M דקות" line. */
export function getRunSummary(runId: number): RunSummary {
  const run = getRun(runId);
  const row = getDb()
    .select({ n: sql<number>`coalesce(sum(${chunks.messageCount}), 0)` })
    .from(chunks)
    .where(and(eq(chunks.runId, runId), eq(chunks.status, "done")))
    .get();
  const durationMs = run?.startedAt && run.finishedAt ? run.finishedAt.getTime() - run.startedAt.getTime() : null;
  return { messagesRead: row?.n ?? 0, costUsd: run?.progress?.costUsd ?? 0, durationMs };
}
