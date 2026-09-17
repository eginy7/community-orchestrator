import { eq, inArray, sql } from "drizzle-orm";
import { getDb, getSqlite } from "@/lib/db/client";
import { groupMembers, memberProfiles, members, threads, topics, type Cited } from "@/lib/db/schema";
import type { NotableThread, StageAOutput } from "./schemas";

/**
 * Pure-TS merge of Stage A fragments into one community model, plus persistence.
 * No LLM calls here — this is where we add facts only the database knows
 * (group membership, activity, who already talked to whom).
 */

export interface MergedProfile {
  memberId: string;
  oneLiner: string;
  interests: string[];
  expertise: string[];
  asks: Array<Cited & { resolved: boolean }>;
  offers: Cited[];
  projects: Cited[];
  roleSignals: string[];
  groupIds: number[];
  richness: number;
}

export interface MergedTopic {
  name: string;
  aliases: string[];
  summary: string;
  memberIds: string[];
  messageIds: number[];
  groupIds: number[];
  momentum: "rising" | "steady" | "fading";
  workshopPotential: "high" | "medium" | "low";
}

export interface MergedThread extends NotableThread {
  groupId: number;
}

export interface MergedModel {
  profiles: MergedProfile[];
  topics: MergedTopic[];
  threads: MergedThread[];
  observations: Array<{ groupId: number; text: string }>;
}

export interface ChunkResultInput {
  groupId: number;
  /** Chronological position, so later chunks win ties (momentum, one-liner). */
  seq: number;
  output: StageAOutput;
}

const MAX_EVIDENCE_PER_FIELD = 8;

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s\-_]+/g, " ");

function unionStrings(target: string[], incoming: string[], cap = 12): string[] {
  const seen = new Set(target.map(norm));
  for (const s of incoming) {
    const k = norm(s);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    target.push(s.trim());
    if (target.length >= cap) break;
  }
  return target;
}

function unionCited<T extends Cited>(target: T[], incoming: T[]): T[] {
  const seen = new Set(target.map((c) => c.message_id));
  for (const c of incoming) {
    if (seen.has(c.message_id)) continue;
    seen.add(c.message_id);
    target.push(c);
  }
  // keep the most recent evidence (higher message id ≈ later)
  return target.sort((a, b) => b.message_id - a.message_id).slice(0, MAX_EVIDENCE_PER_FIELD);
}

export function mergeStageA(results: ChunkResultInput[]): MergedModel {
  const ordered = [...results].sort((a, b) => a.groupId - b.groupId || a.seq - b.seq);

  const profiles = new Map<string, MergedProfile>();
  const topicMap = new Map<string, MergedTopic>();
  const aliasIndex = new Map<string, string>(); // normalized alias -> canonical key
  const mergedThreads: MergedThread[] = [];
  const observations: Array<{ groupId: number; text: string }> = [];

  for (const r of ordered) {
    for (const p of r.output.profiles) {
      const cur = profiles.get(p.member_id) ?? {
        memberId: p.member_id,
        oneLiner: "",
        interests: [],
        expertise: [],
        asks: [],
        offers: [],
        projects: [],
        roleSignals: [],
        groupIds: [],
        richness: 0,
      };
      if (p.one_liner && (cur.oneLiner === "" || p.one_liner.length > cur.oneLiner.length * 0.7)) cur.oneLiner = p.one_liner;
      unionStrings(cur.interests, p.interests);
      unionStrings(cur.expertise, p.expertise);
      cur.asks = unionCited(cur.asks, p.asks);
      cur.offers = unionCited(cur.offers, p.offers);
      cur.projects = unionCited(cur.projects, p.projects);
      unionStrings(cur.roleSignals, p.role_signals, 6);
      if (!cur.groupIds.includes(r.groupId)) cur.groupIds.push(r.groupId);
      profiles.set(p.member_id, cur);
    }

    for (const t of r.output.topics) {
      const keys = [t.name, ...t.aliases].map(norm).filter(Boolean);
      let canonical = keys.map((k) => aliasIndex.get(k)).find(Boolean);
      if (!canonical) {
        canonical = norm(t.name);
        topicMap.set(canonical, {
          name: t.name,
          aliases: [],
          summary: t.summary,
          memberIds: [],
          messageIds: [],
          groupIds: [],
          momentum: t.momentum,
          workshopPotential: t.workshop_potential,
        });
      }
      const cur = topicMap.get(canonical)!;
      for (const k of keys) aliasIndex.set(k, canonical);
      unionStrings(cur.aliases, [t.name, ...t.aliases].filter((a) => norm(a) !== norm(cur.name)), 8);
      cur.memberIds = [...new Set([...cur.memberIds, ...t.member_ids])];
      cur.messageIds = [...new Set([...cur.messageIds, ...t.message_ids])].sort((a, b) => b - a).slice(0, 40);
      if (!cur.groupIds.includes(r.groupId)) cur.groupIds.push(r.groupId);
      // Later chunks describe the current state better.
      cur.momentum = t.momentum;
      if (t.summary.length > cur.summary.length) cur.summary = t.summary;
      const rank = { high: 3, medium: 2, low: 1 } as const;
      if (rank[t.workshop_potential] > rank[cur.workshopPotential]) cur.workshopPotential = t.workshop_potential;
    }

    for (const th of r.output.threads) mergedThreads.push({ ...th, groupId: r.groupId });
    if (r.output.group_observations) observations.push({ groupId: r.groupId, text: r.output.group_observations });
  }

  for (const p of profiles.values()) {
    p.richness = p.interests.length + p.expertise.length + p.asks.length * 2 + p.offers.length * 2 + p.projects.length * 2;
  }

  return {
    profiles: [...profiles.values()],
    topics: [...topicMap.values()].sort((a, b) => b.memberIds.length - a.memberIds.length),
    threads: mergedThreads,
    observations,
  };
}

/** Replace this run's derived tables with the merged model. */
export function persistMerged(runId: number, model: MergedModel): void {
  const db = getDb();
  const sqlite = getSqlite();

  // Membership from the DB beats membership inferred from chunks.
  const membership = new Map<string, number[]>();
  for (const row of db.select({ memberId: groupMembers.memberId, groupId: groupMembers.groupId }).from(groupMembers).all()) {
    const arr = membership.get(row.memberId) ?? [];
    arr.push(row.groupId);
    membership.set(row.memberId, arr);
  }
  const knownMembers = new Set(db.select({ id: members.id }).from(members).all().map((m) => m.id));

  sqlite.transaction(() => {
    db.delete(memberProfiles).where(eq(memberProfiles.runId, runId)).run();
    db.delete(topics).where(eq(topics.runId, runId)).run();
    db.delete(threads).where(eq(threads.runId, runId)).run();

    for (const p of model.profiles) {
      if (!knownMembers.has(p.memberId)) continue;
      db.insert(memberProfiles)
        .values({
          runId,
          memberId: p.memberId,
          oneLiner: p.oneLiner,
          interests: p.interests,
          expertise: p.expertise,
          asks: p.asks,
          offers: p.offers,
          projects: p.projects,
          roleSignals: p.roleSignals,
          groupIds: membership.get(p.memberId) ?? p.groupIds,
          richness: p.richness,
        })
        .run();
    }
    for (const t of model.topics) {
      db.insert(topics)
        .values({
          runId,
          name: t.name,
          aliases: t.aliases,
          summary: t.summary,
          memberIds: t.memberIds,
          messageIds: t.messageIds,
          groupIds: t.groupIds,
          momentum: t.momentum,
          workshopPotential: t.workshopPotential,
        })
        .run();
    }
    for (const th of model.threads) {
      const lastMsg = th.message_ids.length ? Math.max(...th.message_ids) : null;
      const ts = lastMsg ? (sqlite.prepare("SELECT ts FROM messages WHERE id = ?").get(lastMsg) as { ts: number } | undefined)?.ts : undefined;
      db.insert(threads)
        .values({
          runId,
          groupId: th.groupId,
          kind: th.kind,
          title: th.title,
          summary: th.summary,
          status: th.status,
          memberIds: th.member_ids,
          messageIds: th.message_ids,
          ts: ts ? new Date(ts) : null,
        })
        .run();
    }
  })();
}

export interface CoInteraction {
  a: string;
  b: string;
  count: number;
}

/**
 * Pairs of members who posted in the same group within 10 minutes of each other at least
 * `minCount` times. A cheap proxy for "these two already talk", so Stage B never proposes
 * introducing people who obviously know each other.
 */
export function computeCoInteractions(groupIds: number[], sinceMs: number | null, minCount = 3): CoInteraction[] {
  if (groupIds.length === 0) return [];
  const sqlite = getSqlite();
  const placeholders = groupIds.map(() => "?").join(",");
  const rows = sqlite
    .prepare(
      `SELECT a.member_id AS a, b.member_id AS b, count(*) AS c
       FROM messages a
       JOIN messages b
         ON b.group_id = a.group_id
        AND b.ts > a.ts AND b.ts <= a.ts + 600000
        AND b.member_id IS NOT NULL AND b.member_id <> a.member_id
        AND b.kind IN ('text','media')
       WHERE a.group_id IN (${placeholders})
         AND a.member_id IS NOT NULL AND a.kind IN ('text','media')
         ${sinceMs ? "AND a.ts >= ?" : ""}
       GROUP BY min(a.member_id, b.member_id), max(a.member_id, b.member_id)
       HAVING c >= ?`,
    )
    .all(...groupIds, ...(sinceMs ? [sinceMs] : []), minCount) as Array<{ a: string; b: string; c: number }>;
  return rows.map((r) => ({ a: r.a < r.b ? r.a : r.b, b: r.a < r.b ? r.b : r.a, count: r.c }));
}

/** Activity facts per member for the Stage B document. */
export function memberActivity(memberIds: string[]): Map<string, { messageCount: number; lastSeen: number | null; groupIds: number[] }> {
  const db = getDb();
  const out = new Map<string, { messageCount: number; lastSeen: number | null; groupIds: number[] }>();
  if (memberIds.length === 0) return out;
  const rows = db
    .select({ id: members.id, messageCount: members.messageCount, lastSeen: members.lastSeen })
    .from(members)
    .where(inArray(members.id, memberIds))
    .all();
  for (const r of rows) out.set(r.id, { messageCount: r.messageCount, lastSeen: r.lastSeen?.getTime() ?? null, groupIds: [] });
  const gm = db
    .select({ memberId: groupMembers.memberId, groupId: groupMembers.groupId })
    .from(groupMembers)
    .where(inArray(groupMembers.memberId, memberIds))
    .all();
  for (const r of gm) out.get(r.memberId)?.groupIds.push(r.groupId);
  void sql;
  return out;
}
