import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { messages } from "@/lib/db/schema";
import { formatMessageLine, type FormattableMessage } from "./format";
import { estimateTokens } from "./tokens";

export interface ChunkPlan {
  groupId: number;
  seq: number;
  fromTs: number;
  toTs: number;
  messageCount: number;
  tokenEstimate: number;
}

/** Leaves room for system prompt + roster (~8K) and up to 32K of output inside the context window. */
export const DEFAULT_CHUNK_TOKENS = 110_000;

const startOfDay = (ts: number) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Load the messages Claude will actually see for a group (text + captioned media), oldest first. */
export function loadGroupMessages(groupId: number, sinceMs: number | null): FormattableMessage[] {
  const db = getDb();
  const rows = db
    .select({ id: messages.id, ts: messages.ts, memberId: messages.memberId, text: messages.text, kind: messages.kind })
    .from(messages)
    .where(
      and(
        eq(messages.groupId, groupId),
        inArray(messages.kind, ["text", "media"]),
        ...(sinceMs ? [gte(messages.ts, new Date(sinceMs))] : []),
      ),
    )
    .orderBy(asc(messages.ts), asc(messages.id))
    .all();
  return rows.map((r) => ({ ...r, ts: r.ts.getTime() }));
}

/**
 * Greedy chronological packing with day-boundary splits.
 * A single day that exceeds the budget is split mid-day by message count.
 */
export function planChunks(groupId: number, msgs: FormattableMessage[], maxTokens = DEFAULT_CHUNK_TOKENS): ChunkPlan[] {
  const days = new Map<number, { tokens: number; msgs: FormattableMessage[] }>();
  for (const m of msgs) {
    const line = formatMessageLine(m);
    if (!line) continue;
    const day = startOfDay(m.ts as number);
    const bucket = days.get(day) ?? { tokens: 0, msgs: [] };
    bucket.tokens += estimateTokens(line) + 1;
    bucket.msgs.push(m);
    days.set(day, bucket);
  }

  const plans: ChunkPlan[] = [];
  let cur: FormattableMessage[] = [];
  let curTokens = 0;
  const flush = () => {
    if (cur.length === 0) return;
    plans.push({
      groupId,
      seq: plans.length,
      fromTs: cur[0].ts as number,
      toTs: cur[cur.length - 1].ts as number,
      messageCount: cur.length,
      tokenEstimate: curTokens,
    });
    cur = [];
    curTokens = 0;
  };

  for (const day of [...days.keys()].sort((a, b) => a - b)) {
    const bucket = days.get(day)!;
    if (bucket.tokens > maxTokens) {
      // Oversized day: flush what we have, then split the day itself.
      flush();
      for (const m of bucket.msgs) {
        const t = estimateTokens(formatMessageLine(m)!) + 1;
        if (curTokens + t > maxTokens) flush();
        cur.push(m);
        curTokens += t;
      }
      flush();
      continue;
    }
    if (curTokens + bucket.tokens > maxTokens) flush();
    cur.push(...bucket.msgs);
    curTokens += bucket.tokens;
  }
  flush();
  return plans;
}

/** Messages belonging to one planned chunk (inclusive ts range). */
export function messagesForChunk(all: FormattableMessage[], plan: { fromTs: Date | number; toTs: Date | number }): FormattableMessage[] {
  const from = typeof plan.fromTs === "number" ? plan.fromTs : plan.fromTs.getTime();
  const to = typeof plan.toTs === "number" ? plan.toTs : plan.toTs.getTime();
  return all.filter((m) => (m.ts as number) >= from && (m.ts as number) <= to);
}
