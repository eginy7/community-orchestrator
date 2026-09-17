import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PlanItemFacts, PreviousPlanItem } from "@/lib/analysis/followups";
import type { FollowUp, RecommendationStatus, RecommendationType } from "@/lib/db/schema";

// Point the DB at a throwaway directory BEFORE any module reads DATA_DIR; the real ./data stays untouched.
const dataDir = mkdtempSync(join(tmpdir(), "community-followups-"));
process.env.COMMUNITY_DATA_DIR = dataDir;

type FollowupsModule = typeof import("@/lib/analysis/followups");
type PromptsModule = typeof import("@/lib/analysis/prompts");
type ClientModule = typeof import("@/lib/db/client");
type SchemaModule = typeof import("@/lib/db/schema");

let fu: FollowupsModule;
let prompts: PromptsModule;
let client: ClientModule;
let schema: SchemaModule;

beforeAll(async () => {
  fu = await import("@/lib/analysis/followups");
  prompts = await import("@/lib/analysis/prompts");
  client = await import("@/lib/db/client");
  schema = await import("@/lib/db/schema");
});

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

// Synthetic pseudonym ids only — nothing here maps to a real person.
const A = "M0001";
const B = "M0002";
const C = "M0003";
const D = "M0004";

describe("pairsOf", () => {
  it("returns sorted unordered pairs, de-duplicated and capped at 6 people", () => {
    expect(fu.pairsOf([B, A])).toEqual([[A, B]]);
    expect(fu.pairsOf([A, B, C])).toEqual([
      [A, B],
      [A, C],
      [B, C],
    ]);
    expect(fu.pairsOf([A, A, B])).toEqual([[A, B]]);
    const many = Array.from({ length: 9 }, (_, i) => `M${String(i + 1).padStart(4, "0")}`);
    expect(fu.pairsOf(many)).toHaveLength(15); // C(6,2)
    expect(fu.pairsOf([A])).toEqual([]);
  });
});

describe("renderPreviousPlan", () => {
  const items: PreviousPlanItem[] = [
    { rank: 1, type: "connect", title: "חבר/י בין @M0001 ל-@M0002", status: "done", feedbackNote: null, people: [A, B], whereGroupId: null },
    { rank: 2, type: "working_group", title: "קבוצת  עבודה\nסוכנים", status: "accepted", feedbackNote: "  דיברתי איתם  ", people: [A, C, D], whereGroupId: 7 },
    { rank: 3, type: "ritual", title: "ריטואל", status: "dismissed", feedbackNote: null, people: [], whereGroupId: 2 },
  ];
  const facts: PlanItemFacts[] = [
    { pairs: [{ a: A, b: B, count: 6 }], messagesByPerson: { [A]: 12, [B]: 4 }, group: null },
    {
      pairs: [
        { a: A, b: C, count: 0 },
        { a: A, b: D, count: 2 },
        { a: C, b: D, count: 0 },
      ],
      messagesByPerson: { [A]: 12, [C]: 0, [D]: 3 },
      group: { groupId: 7, messages: 40, authors: 9 },
    },
    { pairs: [], messagesByPerson: {}, group: { groupId: 2, messages: 0, authors: 0 } },
  ];

  it("renders one grounded line per item with English keys and pseudonym ids only", () => {
    const text = fu.renderPreviousPlan(items, facts, "2026-09-10");
    const lines = text.split("\n");
    expect(lines[0]).toBe("## Last week's plan (rank, type, status set by the manager, title) and what the data shows since 2026-09-10");
    expect(lines[1]).toBe("1. connect — status: done — «חבר/י בין @M0001 ל-@M0002» — people M0001,M0002 — co-interactions since: 6 — messages since: M0001 12, M0002 4");
    expect(lines[2]).toBe(
      "2. working_group — status: accepted — «קבוצת עבודה סוכנים» — people M0001,M0003,M0004 — co-interacting pairs since: M0001↔M0004 2 (1 of 3 pairs) — messages since: M0001 12, M0003 0, M0004 3 — group G7 since: 40 msgs by 9 authors — manager note: «דיברתי איתם»",
    );
    expect(lines[3]).toBe("3. ritual — status: dismissed — «ריטואל» — group G2 since: 0 msgs by 0 authors");
    expect(lines).toHaveLength(4);
  });

  it("goes into the Stage B user message with the follow-up instruction, after the plan request", () => {
    const plan = fu.renderPreviousPlan(items.slice(0, 1), facts.slice(0, 1), "2026-09-10");
    const msg = prompts.buildStageBUser("2026-09-17", "extra", plan);
    expect(msg.startsWith("Today is 2026-09-17.")).toBe(true);
    expect(msg.indexOf("## Last week's plan")).toBeGreaterThan(0);
    expect(msg).toContain("happened / partially / not_yet / unknown");
    expect(msg).toContain("do not re-propose connect pairs that now have co-interactions");
    expect(msg.endsWith("extra")).toBe(true);
    expect(prompts.buildStageBUser("2026-09-17")).not.toContain("Last week's plan");
  });
});

describe("gatherPlanFacts / buildPreviousPlan (in-memory community)", () => {
  const T0 = Date.UTC(2026, 8, 1); // previous run finished here
  let communityId: number;
  let g1: number;
  let g2: number;
  let prevRunId: number;
  let currentRunId: number;

  beforeAll(() => {
    const db = client.getDb(); // also applies ./drizzle migrations, including follow_ups
    communityId = db.insert(schema.communities).values({ name: "Test Community" }).returning({ id: schema.communities.id }).get().id;
    g1 = db.insert(schema.groups).values({ communityId, name: "G one" }).returning({ id: schema.groups.id }).get().id;
    g2 = db.insert(schema.groups).values({ communityId, name: "G two" }).returning({ id: schema.groups.id }).get().id;
    for (const id of [A, B, C, D]) db.insert(schema.members).values({ id, communityId }).run();

    let n = 0;
    const msg = (groupId: number, memberId: string | null, ts: number, kind: "text" | "system" = "text") =>
      db.insert(schema.messages).values({ groupId, memberId, ts: new Date(ts), text: "", kind, dedupeHash: `h${n++}` }).run();
    const min = 60_000;

    // Before the previous run: A and B already wrote close together — must NOT count.
    msg(g1, A, T0 - 60 * min);
    msg(g1, B, T0 - 59 * min);
    // After: three A↔B co-interactions in g1 (A then B within 10 min), one A→B too far apart.
    msg(g1, A, T0 + 10 * min);
    msg(g1, B, T0 + 12 * min);
    msg(g1, A, T0 + 100 * min);
    msg(g1, B, T0 + 105 * min);
    msg(g1, B, T0 + 200 * min);
    msg(g1, A, T0 + 209 * min);
    msg(g1, A, T0 + 400 * min);
    msg(g1, B, T0 + 420 * min); // 20 min later — outside the window
    // Different group within 10 minutes — must NOT count.
    msg(g2, A, T0 + 500 * min);
    msg(g1, B, T0 + 502 * min);
    // C only talks to D once; system message by nobody.
    msg(g2, C, T0 + 600 * min);
    msg(g2, D, T0 + 601 * min);
    msg(g2, null, T0 + 602 * min, "system");

    prevRunId = db
      .insert(schema.analysisRuns)
      .values({ communityId, status: "done", stage: "B", params: { sinceMs: null, groupIds: [g1, g2] }, finishedAt: new Date(T0) })
      .returning({ id: schema.analysisRuns.id })
      .get().id;
    const rec = (rank: number, type: RecommendationType, people: string[], whereGroupId: number | null, status: RecommendationStatus = "proposed") =>
      db
        .insert(schema.recommendations)
        .values({
          runId: prevRunId,
          communityId,
          rank,
          type,
          tier: "do_now",
          title: `t${rank} @${people[0] ?? "M0000"}`,
          why: "",
          whyNow: "",
          people: people.map((member_id) => ({ member_id, role: "participant" as const, reason: "" })),
          whereGroupId,
          action: "",
          readyMessage: "",
          status,
        })
        .run();
    rec(1, "connect", [A, B], null, "done");
    rec(2, "working_group", [A, C, D], g2, "accepted");
    rec(3, "ritual", [], g1);

    currentRunId = db
      .insert(schema.analysisRuns)
      .values({ communityId, status: "running", stage: "B", params: { sinceMs: null, groupIds: [g1, g2] } })
      .returning({ id: schema.analysisRuns.id })
      .get().id;
  });

  it("finds the latest completed run before the current one", () => {
    expect(fu.findPreviousRun(communityId, currentRunId)?.id).toBe(prevRunId);
    expect(fu.findPreviousRun(communityId, prevRunId)).toBeNull();
  });

  it("counts co-interactions, per-person messages and group activity only since the previous run", () => {
    const items = fu.loadPreviousPlanItems(prevRunId);
    expect(items.map((i) => i.people)).toEqual([[A, B], [A, C, D], []]);
    const facts = fu.gatherPlanFacts(items, [g1, g2], T0);

    expect(facts[0].pairs).toEqual([{ a: A, b: B, count: 3 }]);
    expect(facts[0].messagesByPerson).toEqual({ [A]: 5, [B]: 5 });
    expect(facts[0].group).toBeNull();

    expect(facts[1].pairs).toEqual([
      { a: A, b: C, count: 0 },
      { a: A, b: D, count: 0 },
      { a: C, b: D, count: 1 },
    ]);
    expect(facts[1].messagesByPerson).toEqual({ [A]: 5, [C]: 1, [D]: 1 });
    expect(facts[1].group).toEqual({ groupId: g2, messages: 3, authors: 3 });

    expect(facts[2].pairs).toEqual([]);
    // g1 after T0: A@10, B@12, A@100, B@105, B@200, A@209, A@400, B@420, B@502 — the pre-run pair is excluded.
    expect(facts[2].group).toEqual({ groupId: g1, messages: 9, authors: 2 });
  });

  it("builds the whole block for the runner, and returns null when there is no earlier run", () => {
    const plan = fu.buildPreviousPlan({ communityId, currentRunId, groupIds: [g1, g2] });
    expect(plan?.prevRunId).toBe(prevRunId);
    expect(plan?.itemCount).toBe(3);
    expect(plan?.sinceMs).toBe(T0);
    expect(plan?.text).toContain("since 2026-09-01");
    expect(plan?.text).toContain(`1. connect — status: done — «t1 @${A}» — people ${A},${B} — co-interactions since: 3 — messages since: ${A} 5, ${B} 5`);
    expect(plan?.text).toContain(`co-interacting pairs since: ${C}↔${D} 1 (1 of 3 pairs)`);
    expect(plan?.text).toContain(`group G${g2} since: 3 msgs by 3 authors`);
    expect(fu.buildPreviousPlan({ communityId, currentRunId: prevRunId, groupIds: [g1, g2] })).toBeNull();
  });

  it("persists follow_ups as JSON on the run row and reads them back", async () => {
    const { eq } = await import("drizzle-orm");
    const { getFollowUps } = await import("@/lib/queries");
    const db = client.getDb();
    const followUps: FollowUp[] = [{ previous_title: `t1 @${A}`, outcome: "happened", note: "כתבו זה לצד זה 3 פעמים" }];
    expect(getFollowUps(currentRunId)).toEqual([]);
    db.update(schema.analysisRuns).set({ followUps }).where(eq(schema.analysisRuns.id, currentRunId)).run();
    expect(getFollowUps(currentRunId)).toEqual(followUps);
    expect(getFollowUps(prevRunId)).toEqual([]);
  });
});
