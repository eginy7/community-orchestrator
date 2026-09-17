import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Point the DB at a throwaway directory BEFORE any module reads DATA_DIR; the real ./data stays untouched.
const dataDir = mkdtempSync(join(tmpdir(), "community-momentum-"));
process.env.COMMUNITY_DATA_DIR = dataDir;

type MomentumModule = typeof import("@/lib/momentum");
type ClientModule = typeof import("@/lib/db/client");
type SchemaModule = typeof import("@/lib/db/schema");

let momentum: MomentumModule;
let client: ClientModule;
let schema: SchemaModule;

beforeAll(async () => {
  momentum = await import("@/lib/momentum");
  client = await import("@/lib/db/client");
  schema = await import("@/lib/db/schema");
});

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

// Synthetic pseudonym ids only — nothing here maps to a real person.
const MEMBERS = ["M0001", "M0002", "M0003", "M0004", "M0005"] as const;
type MemberId = (typeof MEMBERS)[number];

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 8, 17, 12); // fixed "now" so the windows never move under the test

// Synthetic Hebrew filler — none of this is real message content.
const QUESTION = "מישהו יודע איך מתחילים?";
const ARABIC_QUESTION = "יש למישהו המלצה؟";
const STATEMENT = "תודה רבה, זה עזר לי מאוד";

interface Fixture {
  communityId: number;
  groupId: number;
}

let n = 0;

/** Creates a community with one group and all five members (first_seen = long ago unless overridden). */
function makeCommunity(name: string, firstSeen: Partial<Record<MemberId, number>> = {}): Fixture {
  const db = client.getDb();
  const communityId = db.insert(schema.communities).values({ name }).returning({ id: schema.communities.id }).get().id;
  const groupId = db.insert(schema.groups).values({ communityId, name: `${name} group` }).returning({ id: schema.groups.id }).get().id;
  for (const id of MEMBERS) {
    // Member ids are global (primary key), so each community gets its own suffix.
    db.insert(schema.members)
      .values({ id: `${id}-${communityId}`, communityId, firstSeen: new Date(firstSeen[id] ?? NOW - 365 * DAY) })
      .run();
  }
  return { communityId, groupId };
}

function post(f: Fixture, member: MemberId, ts: number, text: string) {
  client
    .getDb()
    .insert(schema.messages)
    .values({ groupId: f.groupId, memberId: `${member}-${f.communityId}`, ts: new Date(ts), text, kind: "text", dedupeHash: `h${n++}` })
    .run();
}

describe("getMomentum — answered ratio", () => {
  let f: Fixture;
  beforeAll(() => {
    f = makeCommunity("answered");
    const t = NOW - 12 * DAY; // everything below stays inside the current 14-day window
    // Q1: answered by someone else within 24h → counts.
    post(f, "M0001", t, QUESTION);
    post(f, "M0002", t + 2 * HOUR, STATEMENT);
    // Q2: only the asker "replies" → does NOT count.
    post(f, "M0003", t + 1 * DAY, QUESTION);
    post(f, "M0003", t + 1 * DAY + HOUR, STATEMENT);
    // Q3: someone else replies, but 25h later → does NOT count.
    post(f, "M0004", t + 3 * DAY, ARABIC_QUESTION);
    post(f, "M0005", t + 3 * DAY + 25 * HOUR, STATEMENT);
    // Q4 (Arabic question mark): answered within 24h → counts.
    post(f, "M0005", t + 6 * DAY, ARABIC_QUESTION);
    post(f, "M0001", t + 6 * DAY + 23 * HOUR, STATEMENT);
  });

  it("counts only replies by a different member within 24 hours", () => {
    const m = momentum.getMomentum(f.communityId, NOW);
    expect(m.parts.answeredRatio).toBeCloseTo(2 / 4, 5);
    expect(m.parts.prevAnsweredRatio).toBe(0);
    expect(m.parts.messagesPerWeek).toBe(4); // 8 messages over 2 weeks
    expect(m.parts.activeMembers).toBe(5);
    expect(m.parts.newMembers).toBe(0);
  });
});

describe("getMomentum — clamping and empty communities", () => {
  it("returns 0 with a flat trend when nothing was ever posted", () => {
    const f = makeCommunity("empty");
    const m = momentum.getMomentum(f.communityId, NOW);
    expect(m.score).toBe(0);
    expect(m.trend).toBe("flat");
    expect(m.delta).toBe(0);
    expect(m.parts).toEqual({ messagesPerWeek: 0, prevMessagesPerWeek: 0, activeMembers: 0, prevActiveMembers: 0, answeredRatio: 0, prevAnsweredRatio: 0, newMembers: 0 });
  });

  it("never exceeds 100 even when every component is saturated", () => {
    // Everyone joined this fortnight, everyone posts, every question is answered, nothing before → ratios blow past their caps.
    const f = makeCommunity("saturated", Object.fromEntries(MEMBERS.map((id) => [id, NOW - 3 * DAY])) as Record<MemberId, number>);
    for (let d = 0; d < 14; d++) {
      for (const member of MEMBERS) post(f, member, NOW - (d + 0.2) * DAY, QUESTION);
      // Two different repliers, so every asker (including each replier) gets an answer from someone else.
      post(f, "M0001", NOW - (d + 0.1) * DAY, STATEMENT);
      post(f, "M0002", NOW - (d + 0.1) * DAY + 60_000, STATEMENT);
    }
    const m = momentum.getMomentum(f.communityId, NOW);
    expect(m.score).toBeLessThanOrEqual(100);
    expect(m.score).toBeGreaterThanOrEqual(85);
    expect(Number.isInteger(m.score)).toBe(true);
    expect(m.parts.newMembers).toBe(5);
    expect(m.parts.answeredRatio).toBeCloseTo(1, 5);
  });
});

describe("getMomentum — trend", () => {
  function seed(name: string, current: number, previous: number): Fixture {
    const f = makeCommunity(name);
    // Steady background so both windows' 8-week baselines are meaningful: one exchange (2 msgs) per day, days 28–70 back.
    for (let d = 28; d < 70; d++) {
      post(f, "M0001", NOW - d * DAY, QUESTION);
      post(f, "M0002", NOW - d * DAY + HOUR, STATEMENT);
    }
    for (let i = 0; i < current; i++) {
      post(f, MEMBERS[i % 5], NOW - 1 * DAY - i * HOUR, QUESTION);
      post(f, MEMBERS[(i + 1) % 5], NOW - 1 * DAY - i * HOUR + 30 * 60_000, STATEMENT);
    }
    for (let i = 0; i < previous; i++) {
      post(f, MEMBERS[i % 5], NOW - 15 * DAY - i * HOUR, QUESTION);
      post(f, MEMBERS[(i + 1) % 5], NOW - 15 * DAY - i * HOUR + 30 * 60_000, STATEMENT);
    }
    return f;
  }

  it("is 'up' when this fortnight is much busier than the last one", () => {
    const m = momentum.getMomentum(seed("growing", 40, 2).communityId, NOW);
    expect(m.delta).toBeGreaterThanOrEqual(5);
    expect(m.trend).toBe("up");
    expect(m.parts.messagesPerWeek).toBeGreaterThan(m.parts.prevMessagesPerWeek);
    expect(m.score).toBeGreaterThanOrEqual(70);
  });

  it("is 'down' when this fortnight went quiet", () => {
    const m = momentum.getMomentum(seed("fading", 2, 40).communityId, NOW);
    expect(m.delta).toBeLessThanOrEqual(-5);
    expect(m.trend).toBe("down");
    expect(m.parts.messagesPerWeek).toBeLessThan(m.parts.prevMessagesPerWeek);
  });

  it("is 'flat' when both fortnights look alike", () => {
    // 14 exchanges per fortnight = the background rate, so both windows and both baselines are identical.
    const m = momentum.getMomentum(seed("steady", 14, 14).communityId, NOW);
    expect(Math.abs(m.delta)).toBeLessThan(5);
    expect(m.trend).toBe("flat");
  });
});
