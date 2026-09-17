/**
 * Run the analysis pipeline from the CLI.
 *
 *   pnpm tsx scripts/analyze.ts --dry-run                       # plan chunks + cost estimate, no API calls
 *   pnpm tsx scripts/analyze.ts --since 2026-06-19 --max-chunks 1 --stage A
 *   pnpm tsx scripts/analyze.ts --run 3 --stage B               # re-run the orchestrator on an existing run
 *   pnpm tsx scripts/analyze.ts --run 3                         # resume a crashed run
 *
 * Output is counts and Hebrew log lines only — never message text or names.
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { analysisRuns, communities, recommendations } from "@/lib/db/schema";
import { createRun, runAnalysis } from "@/lib/analysis/runner";

const { values } = parseArgs({
  options: {
    run: { type: "string" },
    since: { type: "string" },
    groups: { type: "string" },
    "max-chunks": { type: "string" },
    "dry-run": { type: "boolean", default: false },
    stage: { type: "string", default: "all" },
    effort: { type: "string" },
    instruction: { type: "string" },
    days: { type: "string" },
  },
});

async function main() {
  const db = getDb();
  const community = db.select().from(communities).get();
  if (!community) {
    console.error("no community yet — run scripts/seed.ts first");
    process.exit(1);
  }

  let runId: number;
  if (values.run) {
    runId = Number(values.run);
  } else {
    // Same rule as the UI: first completed run reads everything; later runs default to the last 7 days.
    const hasCompleted = db.select({ id: analysisRuns.id }).from(analysisRuns).where(eq(analysisRuns.status, "done")).get();
    const days = values.days !== undefined ? Number(values.days) : hasCompleted ? 7 : 0;
    const sinceMs = values.since ? new Date(values.since).getTime() : days > 0 ? Date.now() - days * 86_400_000 : null;
    runId = createRun({
      communityId: community.id,
      sinceMs,
      groupIds: values.groups ? values.groups.split(",").map(Number) : undefined,
      maxChunks: values["max-chunks"] ? Number(values["max-chunks"]) : undefined,
    });
    console.log(`created run #${runId} (${sinceMs ? `since ${new Date(sinceMs).toISOString().slice(0, 10)}` : "full history"})`);
  }

  const stage = values.stage as "A" | "B" | "all";
  const t0 = Date.now();
  try {
    await runAnalysis(runId, {
      stage,
      dryRun: values["dry-run"],
      effortB: values.effort as "medium" | "high" | "xhigh" | undefined,
      extraInstruction: values.instruction,
    });
  } finally {
    const run = db.select().from(analysisRuns).where(eq(analysisRuns.id, runId)).get()!;
    console.log(`\nrun #${runId} — ${run.status} — ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    for (const line of run.progress?.log ?? []) console.log("  " + line);
    if (run.progress) {
      const p = run.progress;
      console.log(`  tokens in ${p.tokensIn.toLocaleString()} / out ${p.tokensOut.toLocaleString()} / cache read ${p.cacheRead.toLocaleString()} — ~$${p.costUsd}`);
    }
    if (run.status === "done" && stage !== "A") {
      if (run.followUps?.length) {
        console.log(`\n${run.followUps.length} follow-ups on the previous plan:`);
        for (const f of run.followUps) console.log(`  [${f.outcome}] ${f.previous_title} — ${f.note}`);
      }
      const recs = db.select().from(recommendations).where(eq(recommendations.runId, runId)).all();
      console.log(`\n${recs.length} recommendations:`);
      for (const r of recs) console.log(`  ${r.rank}. [${r.tier}/${r.type}/${r.confidence}] ${r.title} — people: ${r.people.map((p) => p.member_id).join(",")} — evidence: ${r.evidence.length}`);
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
