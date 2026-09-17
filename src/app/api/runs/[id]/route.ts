import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { isRunActive } from "@/lib/analysis/runner";
import { getDb } from "@/lib/db/client";
import { chunks, groups } from "@/lib/db/schema";
import { getRun, getRunSummary } from "@/lib/queries";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: RouteContext<"/api/runs/[id]">) {
  const { id } = await ctx.params;
  const run = getRun(Number(id));
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
  const chunkRows = getDb()
    .select({ id: chunks.id, seq: chunks.seq, status: chunks.status, tokenEstimate: chunks.tokenEstimate, messageCount: chunks.messageCount, groupName: groups.name, error: chunks.error })
    .from(chunks)
    .innerJoin(groups, eq(groups.id, chunks.groupId))
    .where(eq(chunks.runId, run.id))
    .orderBy(asc(chunks.groupId), asc(chunks.seq))
    .all();
  const summary = getRunSummary(run.id);
  return NextResponse.json({
    chunks: chunkRows,
    messagesRead: summary.messagesRead,
    durationMs: summary.durationMs,
    id: run.id,
    status: run.status,
    stage: run.stage,
    active: isRunActive(run.id),
    progress: run.progress,
    error: run.error,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
  });
}
