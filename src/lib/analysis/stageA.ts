import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic, MODEL, usageOf, type UsageTotals } from "@/lib/anthropic";
import { fmtTs, formatMessages, type FormattableMessage } from "./format";
import { buildStageASystem, buildStageAUser, type GroupContext } from "./prompts";
import { StageAOutput } from "./schemas";
import { validateStageA, type DropStats, type KnownIds } from "./validate";

export interface StageAResult {
  output: StageAOutput;
  usage: UsageTotals;
  drops: DropStats;
  attempts: number;
}

const MAX_OUTPUT_TOKENS = 48_000;

/**
 * One Stage A call over one chunk. Streams (the input is ~100K tokens), parses the structured
 * output, validates every id against the chunk, and retries once with a "be terser" note when
 * the model overran max_tokens or produced something that did not parse.
 */
export async function runStageA(ctx: GroupContext, chunkMsgs: FormattableMessage[], knownMembers: Set<string>): Promise<StageAResult> {
  const client = getAnthropic();
  const chunkText = formatMessages(chunkMsgs);
  const from = fmtTs(chunkMsgs[0].ts);
  const to = fmtTs(chunkMsgs[chunkMsgs.length - 1].ts);
  const system = buildStageASystem(ctx);

  const known: KnownIds = {
    memberIds: knownMembers,
    messageOwner: new Map(chunkMsgs.map((m) => [m.id, m.memberId])),
  };

  const usage: UsageTotals = { tokensIn: 0, tokensOut: 0, cacheRead: 0, cacheWrite: 0 };
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const terser =
      attempt > 1
        ? "\n\nIMPORTANT: the previous attempt ran out of output space. This time keep it compact: at most 30 profiles (only the most substantive members), 10 topics, 10 threads, at most 3 cited items per list, and every text field under 12 words."
        : "";
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system,
      messages: [{ role: "user", content: buildStageAUser(chunkText, from, to) + terser }],
      output_config: { effort: "medium", format: zodOutputFormat(StageAOutput) },
    });
    let message: Anthropic.Message;
    try {
      message = await stream.finalMessage();
    } catch (err) {
      // The SDK parses structured output inside finalMessage(); a response cut off by max_tokens
      // surfaces here as a JSON parse error rather than as stop_reason === "max_tokens".
      if (err instanceof Error && /parse structured output|JSON/i.test(err.message)) {
        lastError = new Error(`Stage A: output truncated or malformed (${err.message.slice(0, 120)})`);
        continue;
      }
      throw err;
    }
    const u = usageOf(message);
    usage.tokensIn += u.tokensIn;
    usage.tokensOut += u.tokensOut;
    usage.cacheRead += u.cacheRead;
    usage.cacheWrite += u.cacheWrite;

    if (message.stop_reason === "refusal") {
      throw new Error("Stage A: the model refused this chunk");
    }
    if (message.stop_reason === "max_tokens") {
      lastError = new Error("Stage A: output exceeded max_tokens");
      continue;
    }
    const text = message.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      lastError = e;
      continue;
    }
    const result = StageAOutput.safeParse(parsed);
    if (!result.success) {
      lastError = result.error;
      continue;
    }
    const { out, stats } = validateStageA(result.data, known);
    return { output: out, usage, drops: stats, attempts: attempt };
  }
  throw lastError instanceof Error ? lastError : new Error("Stage A failed");
}
