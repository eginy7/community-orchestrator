import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { eq, inArray } from "drizzle-orm";
import { costUsd, getAnthropic, MODEL, usageOf, type UsageTotals } from "@/lib/anthropic";
import { getDb, getSqlite } from "@/lib/db/client";
import { analysisRuns, communities, groups, members } from "@/lib/db/schema";
import { buildStageBSystem } from "./prompts";
import { AskOutput } from "./schemas";
import { buildCommunityModelDoc } from "./stageB";

const MAX_OUTPUT_TOKENS = 6_000;

export interface AskResult {
  output: AskOutput;
  usage: UsageTotals;
  costUsd: number;
}

/**
 * "Ask the community": one Claude call over the community model of a completed run.
 *
 * Cost note: the system blocks are built with the very same functions Stage B uses
 * (`buildCommunityModelDoc` + `buildStageBSystem`), so they are byte-identical to the
 * Stage B request and hit its 1h prompt cache. The question goes into the user message only.
 */
export async function askCommunity(opts: { runId: number; question: string; language?: "he" | "en" }): Promise<AskResult> {
  const db = getDb();
  const run = db.select().from(analysisRuns).where(eq(analysisRuns.id, opts.runId)).get();
  if (!run) throw new Error(`run ${opts.runId} not found`);
  const community = db.select().from(communities).where(eq(communities.id, run.communityId)).get();
  if (!community) throw new Error(`community ${run.communityId} not found`);
  const groupRows = db.select().from(groups).where(inArray(groups.id, run.params.groupIds)).all();

  const doc = buildCommunityModelDoc({ community, groups: groupRows, runId: run.id, sinceMs: run.params.sinceMs });

  const client = getAnthropic();
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: buildStageBSystem(doc.text),
    messages: [{ role: "user", content: buildAskUser(new Date().toISOString().slice(0, 10), opts.question, opts.language) }],
    output_config: { effort: "medium", format: zodOutputFormat(AskOutput) },
  });

  let message: Anthropic.Message;
  try {
    message = await stream.finalMessage();
  } catch (err) {
    // The SDK parses structured output inside finalMessage(); a response cut off by max_tokens
    // surfaces here as a JSON parse error rather than as stop_reason === "max_tokens".
    if (err instanceof Error && /parse structured output|JSON/i.test(err.message)) {
      throw new Error(`Ask: output truncated or malformed (${err.message.slice(0, 120)})`);
    }
    throw err;
  }
  const usage = usageOf(message);
  if (message.stop_reason === "refusal") throw new Error("Ask: the model refused");
  if (message.stop_reason === "max_tokens") throw new Error("Ask: output exceeded max_tokens");

  const text = message.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
  const parsed = AskOutput.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error(`Ask: output did not match schema (${parsed.error.issues.length} issues)`);

  return { output: validateAsk(parsed.data, groupRows.map((g) => g.id)), usage, costUsd: costUsd(usage) };
}

/**
 * The question goes into the user message only, so the (cached) system prompt stays byte-identical.
 * `language: "en"` asks for an English answer for demos; the quoted WhatsApp material and people stay as they are.
 */
function buildAskUser(todayIso: string, question: string, language?: "he" | "en"): string {
  const base = `Today is ${todayIso}. The community manager asks: «${question.trim()}».

Answer from the community model only. Name people ONLY by roster ids (M####), cite message ids as evidence, Hebrew, concise. If nobody fits, say so honestly.
suggested_message: a WhatsApp-ready Hebrew message the manager could send (e.g. asking the relevant person to help), addressing people as @M#### tokens — or null if a message would not be useful.`;
  return language === "en" ? `${base}\n\nAnswer in English (people, quotes stay as they are).` : base;
}

const normId = (id: string) => id.trim().replace(/^@/, "");

/** Drop member ids not in `members` and message ids not in `messages` (within the run's groups). */
function validateAsk(out: AskOutput, groupIds: number[]): AskOutput {
  const db = getDb();
  const memberIds = new Set(db.select({ id: members.id }).from(members).all().map((m) => m.id));
  const cited = [...new Set(out.people.flatMap((p) => p.message_ids))];
  const knownMessages = new Set<number>();
  if (cited.length && groupIds.length) {
    const sqlite = getSqlite();
    const gp = groupIds.map(() => "?").join(",");
    const mp = cited.map(() => "?").join(",");
    const rows = sqlite.prepare(`SELECT id FROM messages WHERE group_id IN (${gp}) AND id IN (${mp})`).all(...groupIds, ...cited) as Array<{ id: number }>;
    for (const r of rows) knownMessages.add(r.id);
  }
  const people = out.people
    .map((p) => ({ ...p, member_id: normId(p.member_id), message_ids: [...new Set(p.message_ids)].filter((id) => knownMessages.has(id)) }))
    .filter((p) => memberIds.has(p.member_id));
  return { ...out, people };
}
