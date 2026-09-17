import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { eq } from "drizzle-orm";
import { getAnthropic, MODEL, usageOf, type UsageTotals } from "@/lib/anthropic";
import { getDb } from "@/lib/db/client";
import { memberProfiles, threads, topics, type Community, type Group } from "@/lib/db/schema";
import { computeCoInteractions, memberActivity } from "./merge";
import { buildStageBSystem, buildStageBUser } from "./prompts";
import { StageBOutput } from "./schemas";
import { estimateTokens } from "./tokens";
import { validateStageB, type DropStats, type KnownForStageB } from "./validate";

const TARGET_DOC_TOKENS = 80_000;
const MAX_OUTPUT_TOKENS = 24_000;

export interface CommunityModelDoc {
  text: string;
  tokenEstimate: number;
  memberCount: number;
  topicCount: number;
  threadCount: number;
  pairCount: number;
}

const daysAgo = (ts: number | null, now: number) => (ts ? Math.max(0, Math.round((now - ts) / 86_400_000)) : null);

/**
 * Render the merged model into one compact document for the orchestrator.
 * Ordered so the most useful facts survive trimming: groups → members → topics → threads → pairs.
 */
export function buildCommunityModelDoc(opts: {
  community: Community;
  groups: Group[];
  runId: number;
  sinceMs: number | null;
  now?: number;
}): CommunityModelDoc {
  const db = getDb();
  const now = opts.now ?? Date.now();
  const groupIds = opts.groups.map((g) => g.id);

  const profiles = db.select().from(memberProfiles).where(eq(memberProfiles.runId, opts.runId)).all();
  const topicRows = db.select().from(topics).where(eq(topics.runId, opts.runId)).all();
  const threadRows = db.select().from(threads).where(eq(threads.runId, opts.runId)).all();
  const activity = memberActivity(profiles.map((p) => p.memberId));
  const pairs = computeCoInteractions(groupIds, opts.sinceMs);

  const groupById = new Map(opts.groups.map((g) => [g.id, g]));
  const gLabel = (id: number) => `G${id}`;

  // ---- members: rank by richness × activity, cap by budget
  const ranked = profiles
    .map((p) => {
      const act = activity.get(p.memberId);
      const recencyBoost = act?.lastSeen ? Math.max(0.5, 2 - (daysAgo(act.lastSeen, now) ?? 60) / 30) : 0.5;
      return { p, act, score: (p.richness + 1) * Math.log2((act?.messageCount ?? 0) + 2) * recencyBoost };
    })
    .sort((a, b) => b.score - a.score);

  const cited = (arr: Array<{ text: string; message_id: number; resolved?: boolean }>, cap = 4) =>
    arr
      .slice(0, cap)
      .map((c) => `${c.text} (#${c.message_id}${c.resolved === true ? " ✓" : c.resolved === false ? " ✗" : ""})`)
      .join("; ");

  const memberLines = ranked.map(({ p, act }) => {
    const parts = [
      `${p.memberId} | groups: ${(act?.groupIds ?? p.groupIds).map(gLabel).join(",") || "-"} | ${act?.messageCount ?? 0} msgs, last active ${daysAgo(act?.lastSeen ?? null, now) ?? "?"}d ago`,
      p.roleSignals.length ? `roles: ${p.roleSignals.join(",")}` : "",
      p.oneLiner,
      p.interests.length ? `interests: ${p.interests.join(", ")}` : "",
      p.expertise.length ? `expertise: ${p.expertise.join(", ")}` : "",
      p.asks.length ? `asks: ${cited(p.asks)}` : "",
      p.offers.length ? `offers: ${cited(p.offers)}` : "",
      p.projects.length ? `projects: ${cited(p.projects)}` : "",
    ].filter(Boolean);
    return parts.join(" | ");
  });

  const topicLines = topicRows
    .sort((a, b) => b.memberIds.length - a.memberIds.length)
    .map(
      (t) =>
        `«${t.name}»${t.aliases.length ? ` (${t.aliases.join(", ")})` : ""} — momentum: ${t.momentum}, workshop: ${t.workshopPotential} — groups ${t.groupIds.map(gLabel).join(",")} — ${t.memberIds.length} members [${t.memberIds.slice(0, 12).join(",")}${t.memberIds.length > 12 ? ",…" : ""}] — msgs ${t.messageIds.slice(0, 8).map((id) => `#${id}`).join(" ")} — ${t.summary}`,
    );

  const threadLines = threadRows
    .sort((a, b) => (b.ts?.getTime() ?? 0) - (a.ts?.getTime() ?? 0))
    .map(
      (th) =>
        `[${th.kind}/${th.status}] ${gLabel(th.groupId)} ${th.ts ? `${daysAgo(th.ts.getTime(), now)}d ago` : ""} — ${th.title} — members [${th.memberIds.join(",")}] — msgs ${th.messageIds.slice(0, 6).map((id) => `#${id}`).join(" ")} — ${th.summary}`,
    );

  const header = [
    `Community: «${opts.community.name}»`,
    `Goals: ${opts.community.goals.length ? opts.community.goals.join("; ") : "(none given)"}`,
    `Analysis window: ${opts.sinceMs ? `since ${new Date(opts.sinceMs).toISOString().slice(0, 10)}` : "full history"}`,
    "",
    "## Groups",
    ...opts.groups.map(
      (g) => `${gLabel(g.id)} «${g.name}» — ${g.kind}${g.isAnnouncement ? " (ANNOUNCEMENT CHANNEL)" : ""} — ${g.purpose || "(no purpose given)"}`,
    ),
    "",
  ].join("\n");

  const section = (title: string, lines: string[]) => `## ${title} (${lines.length})\n${lines.join("\n")}\n\n`;

  // ---- assemble within budget: shrink the tail sections first
  let memberCap = memberLines.length;
  let topicCap = Math.min(topicLines.length, 40);
  let threadCap = Math.min(threadLines.length, 60);
  let pairCap = Math.min(pairs.length, 400);
  let text = "";
  for (let i = 0; i < 12; i++) {
    const pairLines = pairs
      .sort((a, b) => b.count - a.count)
      .slice(0, pairCap)
      .map((p) => `${p.a}↔${p.b} (${p.count})`);
    text =
      header +
      section("Members (ranked by signal)", memberLines.slice(0, memberCap)) +
      section("Topics", topicLines.slice(0, topicCap)) +
      section("Open threads", threadLines.slice(0, threadCap)) +
      section("Already-interacting pairs (do NOT propose introducing these)", pairLines) +
      "## Notes\n- Groups are referenced as G<id>, members as M<id>, messages as #<id>.\n- 'already-interacting pairs' come from the database, not from inference.";
    const est = estimateTokens(text);
    if (est <= TARGET_DOC_TOKENS) break;
    // trim: pairs → threads → topics → members
    if (pairCap > 100) pairCap = Math.floor(pairCap * 0.5);
    else if (threadCap > 25) threadCap = Math.floor(threadCap * 0.7);
    else if (topicCap > 20) topicCap = Math.floor(topicCap * 0.7);
    else memberCap = Math.floor(memberCap * 0.75);
    void groupById;
  }

  return {
    text,
    tokenEstimate: estimateTokens(text),
    memberCount: Math.min(memberCap, memberLines.length),
    topicCount: Math.min(topicCap, topicLines.length),
    threadCount: Math.min(threadCap, threadLines.length),
    pairCount: Math.min(pairCap, pairs.length),
  };
}

export interface StageBResult {
  output: StageBOutput;
  usage: UsageTotals;
  drops: DropStats;
}

export async function runStageB(doc: CommunityModelDoc, known: KnownForStageB, opts?: { extraInstruction?: string; effort?: "medium" | "high" | "xhigh" }): Promise<StageBResult> {
  const client = getAnthropic();
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: buildStageBSystem(doc.text),
    messages: [{ role: "user", content: buildStageBUser(new Date().toISOString().slice(0, 10), opts?.extraInstruction) }],
    output_config: { effort: opts?.effort ?? "high", format: zodOutputFormat(StageBOutput) },
  });
  const message = await stream.finalMessage();
  const usage = usageOf(message);
  if (message.stop_reason === "refusal") throw new Error("Stage B: the model refused");
  if (message.stop_reason === "max_tokens") throw new Error("Stage B: output exceeded max_tokens");
  const text = message.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
  const parsed = StageBOutput.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error(`Stage B: output did not match schema (${parsed.error.issues.length} issues)`);
  const { out, stats } = validateStageB(parsed.data, known);
  return { output: out, usage, drops: stats };
}
