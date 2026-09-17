import { NextResponse, type NextRequest } from "next/server";
import { createRun, isRunActive, runAnalysis } from "@/lib/analysis/runner";
import { getCommunity, getRun } from "@/lib/queries";

export const runtime = "nodejs";

/**
 * POST { sinceDays?: number, groupIds?: number[], resumeRunId?: number, stage?: "all" | "B" }
 * Creates (or resumes) a run and starts it in-process without awaiting.
 */
export async function POST(req: NextRequest) {
  const community = getCommunity();
  if (!community) return NextResponse.json({ error: "אין קהילה מוגדרת" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { sinceDays?: number; groupIds?: number[]; resumeRunId?: number; stage?: "all" | "B" };

  let runId: number;
  if (body.resumeRunId) {
    const run = getRun(body.resumeRunId);
    if (!run) return NextResponse.json({ error: "ריצה לא נמצאה" }, { status: 404 });
    runId = run.id;
  } else {
    const days = body.sinceDays ?? 90;
    runId = createRun({
      communityId: community.id,
      sinceMs: days > 0 ? Date.now() - days * 86_400_000 : null,
      groupIds: body.groupIds?.length ? body.groupIds : undefined,
    });
  }

  if (!isRunActive(runId)) {
    void runAnalysis(runId, { stage: body.stage ?? "all" }).catch(() => {
      /* status + error are persisted by the runner */
    });
  }
  return NextResponse.json({ runId });
}
