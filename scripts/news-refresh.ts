/**
 * Refresh the "AI news worth talking about" brief from the CLI (one real web-search call).
 *
 *   pnpm tsx scripts/news-refresh.ts            # refresh, save, print counts + titles/sources
 *   pnpm tsx scripts/news-refresh.ts --dry-run  # refresh but do not save
 *
 * Output is counts, titles and sources only — never member data.
 */
import { config as loadEnv } from "dotenv";
import { parseArgs } from "node:util";

loadEnv({ path: [".env.local", ".env"], quiet: true });

const { values } = parseArgs({ options: { "dry-run": { type: "boolean", default: false } } });

async function main() {
  const [{ getDb }, { communities }, { refreshNews }, { saveNewsBrief }] = await Promise.all([
    import("@/lib/db/client"),
    import("@/lib/db/schema"),
    import("@/lib/analysis/news"),
    import("@/lib/news"),
  ]);
  const community = getDb().select().from(communities).get();
  if (!community) {
    console.error("no community yet — run scripts/seed.ts first");
    process.exit(1);
  }

  const t0 = Date.now();
  const result = await refreshNews({ communityId: community.id });
  const seconds = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`news refresh — ${result.items.length} items — mode ${result.mode} — ${result.searches} searches — ${result.dropped} dropped — ${seconds}s`);
  console.log(`  tokens in ${result.usage.tokensIn.toLocaleString()} / out ${result.usage.tokensOut.toLocaleString()} / cache read ${result.usage.cacheRead.toLocaleString()} — ~$${result.costUsd.toFixed(3)}`);
  console.log(`  matched against run #${result.runId ?? "none"}`);
  for (const [i, it] of result.items.entries()) {
    console.log(`  ${i + 1}. ${it.title} — ${it.source}${it.published_at ? ` (${it.published_at})` : ""} — topics: ${it.related_topics.length} — group: ${it.suggested_group_id ?? "announcement"}`);
  }
  if (values["dry-run"]) {
    console.log("dry run — not saved");
    return;
  }
  const brief = saveNewsBrief({ communityId: community.id, runId: result.runId, items: result.items, tokensIn: result.usage.tokensIn, tokensOut: result.usage.tokensOut, costUsd: result.costUsd });
  console.log(`saved news brief #${brief.id}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
