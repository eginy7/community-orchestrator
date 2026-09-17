import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { costUsd, getAnthropic, MODEL, usageOf, type UsageTotals } from "@/lib/anthropic";
import { getDb } from "@/lib/db/client";
import { analysisRuns, communities, groups, topics, type Group, type NewsItem, type Topic } from "@/lib/db/schema";
import { sanitizeNewsItems } from "@/lib/newsview";
import { NewsOutput } from "./schemas";

const MAX_OUTPUT_TOKENS = 12_000;
const MAX_SEARCHES = 8;
const TOP_TOPICS = 15;
/** Web search is billed per search on top of tokens ($10 per 1,000 searches). */
const WEB_SEARCH_USD = 0.01;

export interface NewsResult {
  items: NewsItem[];
  usage: UsageTotals;
  /** Token cost plus the per-search web-search fee. */
  costUsd: number;
  runId: number | null;
  searches: number;
  /** Items the model returned that were dropped for a missing/invalid url or a duplicate url. */
  dropped: number;
  elapsedMs: number;
  /** "single" = web search + structured output in one call; "two_step" = prose notes, then a cheap conversion call. */
  mode: "single" | "two_step";
}

const WEB_SEARCH_TOOL: Anthropic.WebSearchTool20260209 = { type: "web_search_20260209", name: "web_search", max_uses: MAX_SEARCHES };

/**
 * "AI news worth talking about": search the web for the week's AI news and rank it against the
 * community's hot topics, producing one WhatsApp-ready talking point per item.
 *
 * Input from the DB is topic-level only (names, aliases, summaries, momentum, member counts) plus
 * the goals and group list — no member ids or message text reach the prompt.
 */
export async function refreshNews(opts: { communityId: number }): Promise<NewsResult> {
  const started = Date.now();
  const db = getDb();
  const community = db.select().from(communities).where(eq(communities.id, opts.communityId)).get();
  if (!community) throw new Error(`community ${opts.communityId} not found`);
  const run = db
    .select()
    .from(analysisRuns)
    .where(and(eq(analysisRuns.communityId, opts.communityId), eq(analysisRuns.status, "done")))
    .orderBy(desc(analysisRuns.id))
    .get();
  const groupRows = run?.params.groupIds.length
    ? db.select().from(groups).where(inArray(groups.id, run.params.groupIds)).all()
    : db.select().from(groups).where(eq(groups.communityId, opts.communityId)).all();
  const topicRows = run
    ? db
        .select()
        .from(topics)
        .where(eq(topics.runId, run.id))
        .all()
        .sort((a, b) => b.memberIds.length - a.memberIds.length)
        .slice(0, TOP_TOPICS)
    : [];

  const system = buildNewsSystem();
  const user = buildNewsUser({ today: new Date().toISOString().slice(0, 10), communityName: community.name, goals: community.goals, groups: groupRows, topics: topicRows });

  const client = getAnthropic();
  let raw: NewsOutput;
  let usage: UsageTotals;
  let searches: number;
  let mode: NewsResult["mode"] = "single";
  try {
    ({ output: raw, usage, searches } = await singleCall(client, system, user));
  } catch (err) {
    // Some API versions reject a server tool together with output_config.format (400). Fall back to two calls.
    if (err instanceof Anthropic.BadRequestError) {
      mode = "two_step";
      ({ output: raw, usage, searches } = await twoStepCall(client, system, user));
    } else {
      throw err;
    }
  }

  const items = sanitizeNewsItems(raw.items, { topicNames: topicRows.map((t) => t.name), groupIds: groupRows.map((g) => g.id) });
  return {
    items,
    usage,
    costUsd: costUsd(usage) + searches * WEB_SEARCH_USD,
    runId: run?.id ?? null,
    searches,
    dropped: Math.max(0, raw.items.length - items.length),
    elapsedMs: Date.now() - started,
    mode,
  };
}

interface CallOutcome {
  output: NewsOutput;
  usage: UsageTotals;
  searches: number;
}

const emptyUsage = (): UsageTotals => ({ tokensIn: 0, tokensOut: 0, cacheRead: 0, cacheWrite: 0 });
const addUsage = (a: UsageTotals, b: UsageTotals): UsageTotals => ({
  tokensIn: a.tokensIn + b.tokensIn,
  tokensOut: a.tokensOut + b.tokensOut,
  cacheRead: a.cacheRead + b.cacheRead,
  cacheWrite: a.cacheWrite + b.cacheWrite,
});

const countSearches = (m: Anthropic.Message) => m.content.filter((b) => b.type === "server_tool_use" && b.name === "web_search").length;
const textBlocks = (m: Anthropic.Message) => m.content.filter((b): b is Anthropic.TextBlock => b.type === "text");

/**
 * Stream one request, continuing once on `pause_turn` (the server tool loop was paused mid-turn:
 * hand the assistant content back as-is and let the model finish).
 */
async function streamWithPause(client: Anthropic, params: Anthropic.MessageStreamParams, label: string): Promise<{ message: Anthropic.Message; usage: UsageTotals; searches: number }> {
  let usage = emptyUsage();
  let searches = 0;
  let messages = params.messages;
  let message: Anthropic.Message | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    message = await client.messages.stream({ ...params, messages }).finalMessage();
    usage = addUsage(usage, usageOf(message));
    searches += countSearches(message);
    if (message.stop_reason === "refusal") throw new Error(`${label}: the model refused${message.stop_details?.explanation ? ` (${message.stop_details.explanation})` : ""}`);
    if (message.stop_reason === "max_tokens") throw new Error(`${label}: output exceeded max_tokens`);
    if (message.stop_reason !== "pause_turn") break;
    messages = [...messages, { role: "assistant", content: message.content as unknown as Anthropic.ContentBlockParam[] }];
  }
  if (!message) throw new Error(`${label}: no response`);
  if (message.stop_reason === "pause_turn") throw new Error(`${label}: the model paused twice without finishing`);
  return { message, usage, searches };
}

/** Parse the LAST text block: with a server tool in the loop the model may emit prose before searching. */
function parseNewsOutput(message: Anthropic.Message, label: string): NewsOutput {
  const blocks = textBlocks(message);
  const text = blocks.at(-1)?.text?.trim() ?? "";
  if (!text) throw new Error(`${label}: empty response`);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${label}: response was not JSON`);
  }
  const parsed = NewsOutput.safeParse(json);
  if (!parsed.success) throw new Error(`${label}: output did not match schema (${parsed.error.issues.length} issues)`);
  return parsed.data;
}

async function singleCall(client: Anthropic, system: string, user: string): Promise<CallOutcome> {
  // The plain {type, schema} form (without the helper's `parse`) keeps the SDK from trying to parse
  // every intermediate text block as JSON while the model is still searching.
  const { schema } = zodOutputFormat(NewsOutput);
  const { message, usage, searches } = await streamWithPause(
    client,
    {
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system,
      messages: [{ role: "user", content: user }],
      tools: [WEB_SEARCH_TOOL],
      output_config: { effort: "medium", format: { type: "json_schema", schema } },
    },
    "News",
  );
  return { output: parseNewsOutput(message, "News"), usage, searches };
}

/** Fallback: (1) web search → prose notes, (2) cheap structured conversion of the notes. */
async function twoStepCall(client: Anthropic, system: string, user: string): Promise<CallOutcome> {
  const first = await streamWithPause(
    client,
    {
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system,
      messages: [{ role: "user", content: `${user}\n\nWrite your findings as structured prose notes (one block per item with every field named), not JSON.` }],
      tools: [WEB_SEARCH_TOOL],
      output_config: { effort: "medium" },
    },
    "News (search)",
  );
  const notes = textBlocks(first.message)
    .map((b) => b.text)
    .join("\n\n")
    .trim();
  if (!notes) throw new Error("News (search): empty notes");

  const second = await streamWithPause(
    client,
    {
      model: MODEL,
      max_tokens: 8_000,
      system: "Convert the editor's notes into the requested JSON exactly. Keep Hebrew text as written, keep urls verbatim, do not invent items.",
      messages: [{ role: "user", content: `Editor's notes:\n\n${notes}` }],
      output_config: { effort: "low", format: { type: "json_schema", schema: zodOutputFormat(NewsOutput).schema } },
    },
    "News (convert)",
  );
  return { output: parseNewsOutput(second.message, "News (convert)"), usage: addUsage(first.usage, second.usage), searches: first.searches + second.searches };
}

// ---- prompts

function buildNewsSystem(): string {
  return `You are the news editor of a Hebrew-speaking WhatsApp community of AI builders (developers, founders, product people who ship with LLMs). Each week you pick the few AI news items this specific community would actually want to talk about, and you turn each one into a talking point its manager can post.

Rules:
- Use web_search to find AI news from the LAST 7 DAYS only: major model / tool releases, Claude and Anthropic, OpenAI, Google, open-source models, agent tooling and coding agents, and the Israeli AI ecosystem. Prefer primary sources (official blogs, release notes) or reputable tech press. Skip rumours and opinion pieces.
- Pick 5-8 items. Prefer items that touch a topic the community is already discussing (listed in the user message with momentum); a strong item with no matching topic is still fine.
- Write in Hebrew (product names, model names and company names stay in English). Factual, no hype.
- suggested_post: a warm message in the voice of a peer who happens to lead the community, ready to paste into WhatsApp as-is, under 100 words, ending with a question that invites members to share their experience or opinion. It may include the link.
- suggested_group_id: the best group for the post from the given list (G<id>), or null for the announcement group.
- Never mention or invent people, member ids (M####) or quotes from the community. Only topics.
- Respond with the requested JSON only.`;
}

function buildNewsUser(ctx: { today: string; communityName: string; goals: string[]; groups: Group[]; topics: Topic[] }): string {
  const momentumWord: Record<string, string> = { rising: "rising", steady: "steady", fading: "fading" };
  const topicLines = ctx.topics.length
    ? ctx.topics.map(
        (t) =>
          `- «${t.name}»${t.aliases.length ? ` (${t.aliases.slice(0, 4).join(", ")})` : ""} — momentum: ${momentumWord[t.momentum] ?? t.momentum}, ${t.memberIds.length} members involved${t.summary ? ` — ${t.summary}` : ""}`,
      )
    : ["- (no analysed topics yet — pick the week's most important AI-builder news)"];
  const groupLines = ctx.groups.map((g) => `- G${g.id} «${g.name}» — ${g.kind}${g.isAnnouncement ? " (announcement channel)" : ""}${g.purpose ? ` — ${g.purpose}` : ""}`);
  return `Today is ${ctx.today}. Community: «${ctx.communityName}».
Goals: ${ctx.goals.length ? ctx.goals.join("; ") : "(none given)"}

## Topics the community is discussing right now
${topicLines.join("\n")}

## Groups
${groupLines.join("\n")}

Search for AI news from ${daysBefore(ctx.today, 7)} to ${ctx.today} and produce the brief. related_topics must use the exact topic names from the list above (or be empty).`;
}

function daysBefore(isoDay: string, days: number): string {
  return new Date(Date.parse(isoDay) - days * 86_400_000).toISOString().slice(0, 10);
}
