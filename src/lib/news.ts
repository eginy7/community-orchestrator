import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { newsBriefs, type NewsBrief, type NewsItem } from "@/lib/db/schema";

/** Read/write helpers for the AI-news briefs. Kept out of queries.ts on purpose. */

export function getLatestNewsBrief(communityId: number): NewsBrief | null {
  return getDb().select().from(newsBriefs).where(eq(newsBriefs.communityId, communityId)).orderBy(desc(newsBriefs.id)).get() ?? null;
}

export interface SaveNewsBriefInput {
  communityId: number;
  runId: number | null;
  items: NewsItem[];
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

export function saveNewsBrief(input: SaveNewsBriefInput): NewsBrief {
  return getDb()
    .insert(newsBriefs)
    .values({
      communityId: input.communityId,
      runId: input.runId,
      items: input.items,
      tokensIn: input.tokensIn,
      tokensOut: input.tokensOut,
      costUsd: input.costUsd,
    })
    .returning()
    .get();
}
