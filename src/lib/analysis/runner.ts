import { and, desc, eq, inArray } from "drizzle-orm";
import { costUsd, type UsageTotals } from "@/lib/anthropic";
import { getDb, getSqlite } from "@/lib/db/client";
import {
  analysisRuns,
  chunks,
  communities,
  groupMembers,
  groups,
  members,
  messages,
  recommendations,
  type Group,
  type RunProgress,
} from "@/lib/db/schema";
import { loadGroupMessages, messagesForChunk, planChunks, DEFAULT_CHUNK_TOKENS } from "./chunker";
import { buildPreviousPlan } from "./followups";
import { formatMessages, formatRoster, type FormattableMessage } from "./format";
import { mergeStageA, persistMerged, type ChunkResultInput } from "./merge";
import type { GroupContext } from "./prompts";
import type { StageAOutput } from "./schemas";
import { runStageA } from "./stageA";
import { buildCommunityModelDoc, runStageB } from "./stageB";
import { calibrateTokens } from "./tokens";

const CONCURRENCY = 2;

const running = (globalThis as unknown as { __communityRuns?: Set<number> }).__communityRuns ?? new Set<number>();
(globalThis as unknown as { __communityRuns?: Set<number> }).__communityRuns = running;

export function isRunActive(runId: number): boolean {
  return running.has(runId);
}

/** Create a run row. The caller then fires `runAnalysis(id)` without awaiting it. */
export function createRun(opts: { communityId: number; sinceMs: number | null; groupIds?: number[]; maxChunks?: number }): number {
  const db = getDb();
  const groupIds =
    opts.groupIds ??
    db
      .select({ id: groups.id })
      .from(groups)
      .where(eq(groups.communityId, opts.communityId))
      .all()
      .map((g) => g.id);
  const row = db
    .insert(analysisRuns)
    .values({
      communityId: opts.communityId,
      status: "queued",
      stage: "A",
      params: { sinceMs: opts.sinceMs, groupIds, maxChunks: opts.maxChunks },
      progress: emptyProgress(),
    })
    .returning({ id: analysisRuns.id })
    .get();
  return row.id;
}

function emptyProgress(): RunProgress {
  return { stage: "A", chunksDone: 0, chunksTotal: 0, currentGroup: null, tokensIn: 0, tokensOut: 0, cacheRead: 0, costUsd: 0, log: [] };
}

class Progress {
  private p: RunProgress;
  private usage: UsageTotals = { tokensIn: 0, tokensOut: 0, cacheRead: 0, cacheWrite: 0 };
  constructor(private readonly runId: number, initial?: RunProgress | null) {
    this.p = initial ?? emptyProgress();
  }
  log(line: string) {
    this.p.log.push(`${new Date().toLocaleTimeString("he-IL")} · ${line}`);
    if (this.p.log.length > 200) this.p.log.splice(0, this.p.log.length - 200);
    this.flush();
  }
  addUsage(u: UsageTotals) {
    this.usage.tokensIn += u.tokensIn;
    this.usage.tokensOut += u.tokensOut;
    this.usage.cacheRead += u.cacheRead;
    this.usage.cacheWrite += u.cacheWrite;
    this.p.tokensIn = this.usage.tokensIn;
    this.p.tokensOut = this.usage.tokensOut;
    this.p.cacheRead = this.usage.cacheRead;
    this.p.costUsd = Math.round(costUsd(this.usage) * 100) / 100;
  }
  set(patch: Partial<RunProgress>) {
    Object.assign(this.p, patch);
    this.flush();
  }
  get value() {
    return this.p;
  }
  flush() {
    getDb().update(analysisRuns).set({ progress: this.p, stage: this.p.stage }).where(eq(analysisRuns.id, this.runId)).run();
  }
}

export interface RunOptions {
  /** "A" runs extraction only, "B" reruns the orchestrator on the existing merged model. */
  stage?: "A" | "B" | "all";
  dryRun?: boolean;
  effortB?: "medium" | "high" | "xhigh";
  extraInstruction?: string;
}

/**
 * The whole pipeline for one run. Safe to call again after a crash: chunks already `done`
 * are skipped, so a dev-server reload mid-run costs nothing.
 */
export async function runAnalysis(runId: number, opts: RunOptions = {}): Promise<void> {
  if (running.has(runId)) return;
  running.add(runId);
  const db = getDb();
  const run = db.select().from(analysisRuns).where(eq(analysisRuns.id, runId)).get();
  if (!run) {
    running.delete(runId);
    throw new Error(`run ${runId} not found`);
  }
  const progress = new Progress(runId, run.progress);
  const stage = opts.stage ?? "all";

  try {
    db.update(analysisRuns).set({ status: "running", startedAt: run.startedAt ?? new Date(), error: null }).where(eq(analysisRuns.id, runId)).run();
    const community = db.select().from(communities).where(eq(communities.id, run.communityId)).get()!;
    const groupRows = db.select().from(groups).where(inArray(groups.id, run.params.groupIds)).all();
    const sinceMs = run.params.sinceMs;

    if (stage === "A" || stage === "all") {
      progress.set({ stage: "A" });
      await stageAForRun(runId, community.name, community.goals, groupRows, sinceMs, run.params.maxChunks, progress, opts.dryRun ?? false);
      if (opts.dryRun) {
        db.update(analysisRuns).set({ status: "queued" }).where(eq(analysisRuns.id, runId)).run();
        return;
      }
      progress.set({ stage: "merge", currentGroup: null });
      const done = db.select().from(chunks).where(and(eq(chunks.runId, runId), eq(chunks.status, "done"))).all();
      const fresh: ChunkResultInput[] = done.map((c) => ({ groupId: c.groupId, seq: c.seq, output: c.result as StageAOutput }));
      // Community memory: an incremental run only read the recent window, so carry forward the
      // extraction results of the previous completed run for everything before that window.
      const memory = sinceMs ? carriedForwardResults(run.communityId, runId, sinceMs) : [];
      if (memory.length) progress.log(`זיכרון קהילה: ${memory.length} צ'אנקים מריצות קודמות נטענו בלי קריאה ל-API`);
      const merged = mergeStageA([...memory, ...fresh]);
      persistMerged(runId, merged);
      progress.log(`מיזוג: ${merged.profiles.length} פרופילים, ${merged.topics.length} נושאים, ${merged.threads.length} שיחות`);
    }

    if (stage === "B" || stage === "all") {
      progress.set({ stage: "B" });
      const doc = buildCommunityModelDoc({ community, groups: groupRows, runId, sinceMs });
      progress.log(`מסמך הקהילה: ~${doc.tokenEstimate.toLocaleString()} טוקנים, ${doc.memberCount} חברים, ${doc.topicCount} נושאים, ${doc.threadCount} שיחות, ${doc.pairCount} זוגות`);
      const known = knownForStageB(groupRows.map((g) => g.id));
      // Feedback loop: on every run after the first, Stage B sees last week's plan together with
      // what the database shows happened since, and reports on each item in `follow_ups`.
      const previousPlan = buildPreviousPlan({ communityId: community.id, currentRunId: runId, groupIds: groupRows.map((g) => g.id) });
      if (previousPlan) {
        progress.log(`משוב: ${previousPlan.itemCount} המלצות מריצה #${previousPlan.prevRunId} (מאז ${new Date(previousPlan.sinceMs).toLocaleDateString("he-IL")}) נבדקות מול הנתונים`);
      }
      const result = await runStageB(doc, known, { effort: opts.effortB, extraInstruction: opts.extraInstruction, previousPlan: previousPlan?.text });
      progress.addUsage(result.usage);
      persistRecommendations(runId, community.id, result.output);
      db.update(analysisRuns)
        .set({ communityPulse: result.output.community_pulse, followUps: previousPlan ? result.output.follow_ups : null })
        .where(eq(analysisRuns.id, runId))
        .run();
      progress.log(
        `שלב ב׳: ${result.output.recommendations.length} המלצות (נפסלו ${result.drops.droppedRecommendations}, ids לא מוכרים: ${result.drops.unknownMembers + result.drops.unknownMessages})` +
          (previousPlan ? ` · מעקב: ${result.output.follow_ups.length} דיווחים, ${result.output.follow_ups.filter((f) => f.outcome === "happened").length} קרו` : ""),
      );
    }

    db.update(analysisRuns).set({ status: "done", finishedAt: new Date() }).where(eq(analysisRuns.id, runId)).run();
    progress.log("הסתיים");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    db.update(analysisRuns).set({ status: "failed", error: msg }).where(eq(analysisRuns.id, runId)).run();
    progress.log(`שגיאה: ${msg}`);
    throw err;
  } finally {
    running.delete(runId);
  }
}

async function stageAForRun(
  runId: number,
  communityName: string,
  goals: string[],
  groupRows: Group[],
  sinceMs: number | null,
  maxChunks: number | undefined,
  progress: Progress,
  dryRun: boolean,
): Promise<void> {
  const db = getDb();
  const allMsgs = new Map<number, FormattableMessage[]>();

  // Plan chunks once per run; later invocations resume from the table.
  let chunkRows = db.select().from(chunks).where(eq(chunks.runId, runId)).all();
  if (chunkRows.length === 0) {
    // Calibrate the Hebrew chars→tokens ratio BEFORE planning, otherwise chunks come out ~50% too big.
    if (!dryRun) {
      const biggest = [...groupRows].sort((a, b) => b.id - a.id)[0];
      const sample = groupRows
        .map((g) => {
          const msgs = loadGroupMessages(g.id, g.isAnnouncement ? null : sinceMs);
          allMsgs.set(g.id, msgs);
          return { g, msgs };
        })
        .sort((a, b) => b.msgs.length - a.msgs.length)[0];
      void biggest;
      if (sample && sample.msgs.length > 50) {
        const ratio = await calibrateTokens(formatMessages(sample.msgs.slice(0, 600)).slice(0, 40_000));
        progress.log(`כיול טוקנים: ${ratio.toFixed(2)} תווים לטוקן`);
      }
    }
    for (const g of groupRows) {
      // The announcement channel is small and its history matters — always take all of it.
      const msgs = allMsgs.get(g.id) ?? loadGroupMessages(g.id, g.isAnnouncement ? null : sinceMs);
      allMsgs.set(g.id, msgs);
      const plans = planChunks(g.id, msgs, DEFAULT_CHUNK_TOKENS);
      for (const p of plans) {
        db.insert(chunks)
          .values({ runId, groupId: p.groupId, seq: p.seq, fromTs: new Date(p.fromTs), toTs: new Date(p.toTs), messageCount: p.messageCount, tokenEstimate: p.tokenEstimate })
          .run();
      }
      progress.log(`«${g.name}»: ${msgs.length} הודעות → ${plans.length} צ'אנקים (~${plans.reduce((s, p) => s + p.tokenEstimate, 0).toLocaleString()} טוקנים)`);
    }
    chunkRows = db.select().from(chunks).where(eq(chunks.runId, runId)).all();
  }

  let pending = chunkRows.filter((c) => c.status !== "done");
  if (maxChunks !== undefined) pending = pending.slice(0, maxChunks);
  progress.set({ chunksTotal: maxChunks !== undefined ? Math.min(chunkRows.length, maxChunks) : chunkRows.length, chunksDone: chunkRows.length - chunkRows.filter((c) => c.status !== "done").length });

  if (dryRun) {
    const est = pending.reduce((s, c) => s + c.tokenEstimate, 0);
    progress.log(`dry-run: ${pending.length} צ'אנקים ממתינים, ~${est.toLocaleString()} טוקני קלט, עלות משוערת ~$${((est * 5 + pending.length * 12_000 * 25) / 1e6).toFixed(2)}`);
    return;
  }
  if (pending.length === 0) return;

  const contexts = new Map<number, { ctx: GroupContext; roster: Set<string> }>();
  const contextFor = (g: Group) => {
    let c = contexts.get(g.id);
    if (!c) {
      const gm = db
        .select({ memberId: groupMembers.memberId, messageCount: groupMembers.messageCount, firstTs: groupMembers.firstTs })
        .from(groupMembers)
        .where(eq(groupMembers.groupId, g.id))
        .all();
      c = {
        ctx: {
          communityName,
          goals,
          groupId: g.id,
          groupName: g.name,
          purpose: g.purpose,
          kind: g.kind,
          isAnnouncement: g.isAnnouncement,
          rosterText: formatRoster(gm.map((r) => ({ memberId: r.memberId, messageCount: r.messageCount, firstTs: r.firstTs }))),
        },
        roster: new Set(gm.map((r) => r.memberId)),
      };
      contexts.set(g.id, c);
    }
    return c;
  };

  function getMsgs(groupId: number): FormattableMessage[] {
    let m = allMsgs.get(groupId);
    if (!m) {
      const g = groupRows.find((x) => x.id === groupId)!;
      m = loadGroupMessages(groupId, g.isAnnouncement ? null : sinceMs);
      allMsgs.set(groupId, m);
    }
    return m;
  }

  // Simple worker pool. Chunks of the same group share a cached prefix, so keep group order.
  const queue = [...pending].sort((a, b) => a.groupId - b.groupId || a.seq - b.seq);
  let failures = 0;
  const worker = async () => {
    for (;;) {
      const c = queue.shift();
      if (!c) return;
      const g = groupRows.find((x) => x.id === c.groupId)!;
      const { ctx, roster } = contextFor(g);
      const msgs = messagesForChunk(getMsgs(c.groupId), c);
      progress.set({ currentGroup: g.name });
      db.update(chunks).set({ status: "running", error: null }).where(eq(chunks.id, c.id)).run();
      try {
        const res = await withBackoff(() => runStageA(ctx, msgs, roster));
        db.update(chunks)
          .set({ status: "done", result: res.output, tokensIn: res.usage.tokensIn, tokensOut: res.usage.tokensOut, cacheRead: res.usage.cacheRead })
          .where(eq(chunks.id, c.id))
          .run();
        progress.addUsage(res.usage);
        progress.set({ chunksDone: progress.value.chunksDone + 1 });
        progress.log(
          `«${g.name}» צ'אנק ${c.seq + 1}: ${res.output.profiles.length} פרופילים, ${res.output.topics.length} נושאים, ${res.output.threads.length} שיחות` +
            (res.drops.unknownMembers + res.drops.unknownMessages ? ` (נפסלו ${res.drops.unknownMembers + res.drops.unknownMessages} ids)` : "") +
            (res.usage.cacheRead ? ` · cache ${Math.round((res.usage.cacheRead / Math.max(1, res.usage.tokensIn + res.usage.cacheRead)) * 100)}%` : ""),
        );
      } catch (err) {
        failures++;
        const msg = err instanceof Error ? err.message : String(err);
        db.update(chunks).set({ status: "failed", error: msg }).where(eq(chunks.id, c.id)).run();
        progress.log(`«${g.name}» צ'אנק ${c.seq + 1} נכשל: ${msg.slice(0, 160)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
  if (failures > 0 && failures === pending.length) throw new Error("כל הצ'אנקים נכשלו");
}

/** Retry on rate limits / overload with exponential backoff and jitter (on top of the SDK's own retries). */
async function withBackoff<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let delay = 5_000;
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      const status = (err as { status?: number }).status;
      const retryable = status === 429 || status === 529 || (status !== undefined && status >= 500);
      if (!retryable || i >= attempts) throw err;
      await new Promise((r) => setTimeout(r, delay + Math.random() * 2_000));
      delay = Math.min(delay * 2, 60_000);
    }
  }
}

/**
 * Stage A results from the latest previous completed run whose chunks end before `sinceMs`.
 * Older chunks get negative seq numbers so that fresh chunks win ties during the merge.
 */
function carriedForwardResults(communityId: number, currentRunId: number, sinceMs: number): ChunkResultInput[] {
  const db = getDb();
  const prev = db
    .select({ id: analysisRuns.id })
    .from(analysisRuns)
    .where(and(eq(analysisRuns.communityId, communityId), eq(analysisRuns.status, "done")))
    .orderBy(desc(analysisRuns.id))
    .all()
    .find((r) => r.id !== currentRunId);
  if (!prev) return [];
  const prevChunks = db.select().from(chunks).where(and(eq(chunks.runId, prev.id), eq(chunks.status, "done"))).all();
  return prevChunks
    .filter((c) => c.toTs.getTime() < sinceMs && c.result)
    .map((c) => ({ groupId: c.groupId, seq: c.seq - 100_000, output: c.result as StageAOutput }));
}

function knownForStageB(groupIds: number[]) {
  const db = getDb();
  const sqlite = getSqlite();
  const memberIds = new Set(db.select({ id: members.id }).from(members).all().map((m) => m.id));
  const placeholders = groupIds.map(() => "?").join(",");
  const rows = sqlite.prepare(`SELECT id, member_id FROM messages WHERE group_id IN (${placeholders})`).all(...groupIds) as Array<{ id: number; member_id: string | null }>;
  const messageOwner = new Map<number, string | null>(rows.map((r) => [r.id, r.member_id]));
  void messages;
  return { memberIds, messageOwner, groupIds: new Set(groupIds) };
}

function persistRecommendations(runId: number, communityId: number, out: { recommendations: Array<import("./schemas").RecommendationOut> }): void {
  const db = getDb();
  getSqlite().transaction(() => {
    db.delete(recommendations).where(eq(recommendations.runId, runId)).run();
    out.recommendations.forEach((r, i) => {
      db.insert(recommendations)
        .values({
          runId,
          communityId,
          rank: i + 1,
          type: r.type,
          tier: r.tier,
          title: r.title,
          why: r.why,
          whyNow: r.why_now,
          evidence: r.evidence,
          people: r.people,
          whereGroupId: r.where_group_id ? Number(r.where_group_id) : null,
          action: r.action,
          readyMessage: r.ready_message,
          extras: r.extras,
          confidence: r.confidence,
        })
        .run();
    });
  })();
}
