import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * SQLite schema. Everything member-related is keyed by pseudonym id ("M0123").
 * Real names/phones never enter this database.
 */

export type GroupKind = "general" | "help" | "jobs" | "projects" | "topic" | "announcement";
export type MessageKind = "text" | "media" | "system" | "deleted";
export type RunStatus = "queued" | "running" | "done" | "failed";
export type RunStage = "A" | "merge" | "B";
export type ChunkStatus = "pending" | "running" | "done" | "failed";
export type RecommendationType = "connect" | "working_group" | "event" | "initiative" | "revive" | "ritual";
export type RecommendationTier = "do_now" | "organize" | "plan";
export type RecommendationStatus = "proposed" | "accepted" | "done" | "dismissed";

const now = sql`(unixepoch('subsec') * 1000)`;

export const communities = sqliteTable("communities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  goals: text("goals", { mode: "json" }).$type<string[]>().notNull().default([]),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
});

export const groups = sqliteTable(
  "groups",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    communityId: integer("community_id").notNull().references(() => communities.id),
    name: text("name").notNull(),
    purpose: text("purpose").notNull().default(""),
    kind: text("kind").$type<GroupKind>().notNull().default("general"),
    isAnnouncement: integer("is_announcement", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [uniqueIndex("groups_community_name").on(t.communityId, t.name)],
);

export const uploads = sqliteTable("uploads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  groupId: integer("group_id").notNull().references(() => groups.id),
  filename: text("filename").notNull(),
  format: text("format").notNull(),
  sha256: text("sha256").notNull(),
  messageCount: integer("message_count").notNull(),
  insertedCount: integer("inserted_count").notNull(),
  firstTs: integer("first_ts", { mode: "timestamp_ms" }),
  lastTs: integer("last_ts", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
});

export const members = sqliteTable("members", {
  /** Pseudonym id, e.g. "M0123". */
  id: text("id").primaryKey(),
  communityId: integer("community_id").notNull().references(() => communities.id),
  firstSeen: integer("first_seen", { mode: "timestamp_ms" }),
  lastSeen: integer("last_seen", { mode: "timestamp_ms" }),
  messageCount: integer("message_count").notNull().default(0),
});

export const groupMembers = sqliteTable(
  "group_members",
  {
    groupId: integer("group_id").notNull().references(() => groups.id),
    memberId: text("member_id").notNull().references(() => members.id),
    messageCount: integer("message_count").notNull().default(0),
    firstTs: integer("first_ts", { mode: "timestamp_ms" }),
    lastTs: integer("last_ts", { mode: "timestamp_ms" }),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.memberId] })],
);

export const messages = sqliteTable(
  "messages",
  {
    /** Plain integer so Claude can cite "#4821". */
    id: integer("id").primaryKey({ autoIncrement: true }),
    groupId: integer("group_id").notNull().references(() => groups.id),
    /** null for system events. */
    memberId: text("member_id").references(() => members.id),
    ts: integer("ts", { mode: "timestamp_ms" }).notNull(),
    text: text("text").notNull().default(""),
    kind: text("kind").$type<MessageKind>().notNull().default("text"),
    uploadId: integer("upload_id").references(() => uploads.id),
    /** sha1(minute|member|text) — makes re-uploading an overlapping export idempotent. */
    dedupeHash: text("dedupe_hash").notNull(),
  },
  (t) => [
    uniqueIndex("messages_group_dedupe").on(t.groupId, t.dedupeHash),
    index("messages_group_ts").on(t.groupId, t.ts),
    index("messages_member").on(t.memberId),
  ],
);

export interface RunProgress {
  stage: RunStage;
  chunksDone: number;
  chunksTotal: number;
  currentGroup: string | null;
  tokensIn: number;
  tokensOut: number;
  cacheRead: number;
  costUsd: number;
  /** Counts and stage names only — never message text or names. */
  log: string[];
}

export interface RunParams {
  sinceMs: number | null;
  groupIds: number[];
  maxChunks?: number;
}

export type FollowUpOutcome = "happened" | "partially" | "not_yet" | "unknown";

/** Stage B's report on one item of the previous run's plan ("what happened since last week"). */
export interface FollowUp {
  previous_title: string;
  outcome: FollowUpOutcome;
  /** Hebrew, grounded in the DB facts that were shown to the model. */
  note: string;
}

export const analysisRuns = sqliteTable("analysis_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  communityId: integer("community_id").notNull().references(() => communities.id),
  status: text("status").$type<RunStatus>().notNull().default("queued"),
  stage: text("stage").$type<RunStage>().notNull().default("A"),
  progress: text("progress", { mode: "json" }).$type<RunProgress>(),
  params: text("params", { mode: "json" }).$type<RunParams>().notNull(),
  communityPulse: text("community_pulse"),
  /** Null until Stage B ran with a previous completed run to compare against. */
  followUps: text("follow_ups", { mode: "json" }).$type<FollowUp[]>(),
  error: text("error"),
  startedAt: integer("started_at", { mode: "timestamp_ms" }),
  finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
});

export const chunks = sqliteTable(
  "chunks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: integer("run_id").notNull().references(() => analysisRuns.id),
    groupId: integer("group_id").notNull().references(() => groups.id),
    seq: integer("seq").notNull(),
    fromTs: integer("from_ts", { mode: "timestamp_ms" }).notNull(),
    toTs: integer("to_ts", { mode: "timestamp_ms" }).notNull(),
    messageCount: integer("message_count").notNull(),
    tokenEstimate: integer("token_estimate").notNull(),
    status: text("status").$type<ChunkStatus>().notNull().default("pending"),
    /** Validated Stage A output (JSON). */
    result: text("result", { mode: "json" }),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    cacheRead: integer("cache_read").notNull().default(0),
    error: text("error"),
  },
  (t) => [index("chunks_run").on(t.runId)],
);

export interface Cited {
  text: string;
  message_id: number;
}

export const memberProfiles = sqliteTable(
  "member_profiles",
  {
    memberId: text("member_id").notNull().references(() => members.id),
    runId: integer("run_id").notNull().references(() => analysisRuns.id),
    oneLiner: text("one_liner").notNull().default(""),
    interests: text("interests", { mode: "json" }).$type<string[]>().notNull().default([]),
    expertise: text("expertise", { mode: "json" }).$type<string[]>().notNull().default([]),
    asks: text("asks", { mode: "json" }).$type<Array<Cited & { resolved: boolean }>>().notNull().default([]),
    offers: text("offers", { mode: "json" }).$type<Cited[]>().notNull().default([]),
    projects: text("projects", { mode: "json" }).$type<Cited[]>().notNull().default([]),
    roleSignals: text("role_signals", { mode: "json" }).$type<string[]>().notNull().default([]),
    /** Derived from DB, not from Claude. */
    groupIds: text("group_ids", { mode: "json" }).$type<number[]>().notNull().default([]),
    richness: integer("richness").notNull().default(0),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [primaryKey({ columns: [t.runId, t.memberId] })],
);

export const topics = sqliteTable(
  "topics",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: integer("run_id").notNull().references(() => analysisRuns.id),
    name: text("name").notNull(),
    aliases: text("aliases", { mode: "json" }).$type<string[]>().notNull().default([]),
    summary: text("summary").notNull().default(""),
    memberIds: text("member_ids", { mode: "json" }).$type<string[]>().notNull().default([]),
    messageIds: text("message_ids", { mode: "json" }).$type<number[]>().notNull().default([]),
    groupIds: text("group_ids", { mode: "json" }).$type<number[]>().notNull().default([]),
    momentum: text("momentum").notNull().default("steady"),
    workshopPotential: text("workshop_potential").notNull().default("low"),
  },
  (t) => [index("topics_run").on(t.runId)],
);

export const threads = sqliteTable(
  "threads",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: integer("run_id").notNull().references(() => analysisRuns.id),
    groupId: integer("group_id").notNull().references(() => groups.id),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    status: text("status").notNull().default("open"),
    memberIds: text("member_ids", { mode: "json" }).$type<string[]>().notNull().default([]),
    messageIds: text("message_ids", { mode: "json" }).$type<number[]>().notNull().default([]),
    ts: integer("ts", { mode: "timestamp_ms" }),
  },
  (t) => [index("threads_run").on(t.runId)],
);

export interface RecommendationPerson {
  member_id: string;
  role: "introducee" | "participant" | "host" | "lead";
  reason: string;
}
export interface RecommendationEvidence {
  message_id: number;
  member_id: string;
  why_relevant: string;
}
export interface RecommendationExtras {
  agenda: string[];
  first_task: string | null;
  timeline: string | null;
  expected_impact: string;
}

export const recommendations = sqliteTable(
  "recommendations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: integer("run_id").notNull().references(() => analysisRuns.id),
    communityId: integer("community_id").notNull().references(() => communities.id),
    rank: integer("rank").notNull(),
    type: text("type").$type<RecommendationType>().notNull(),
    tier: text("tier").$type<RecommendationTier>().notNull(),
    title: text("title").notNull(),
    why: text("why").notNull(),
    whyNow: text("why_now").notNull(),
    evidence: text("evidence", { mode: "json" }).$type<RecommendationEvidence[]>().notNull().default([]),
    people: text("people", { mode: "json" }).$type<RecommendationPerson[]>().notNull().default([]),
    whereGroupId: integer("where_group_id").references(() => groups.id),
    action: text("action").notNull(),
    readyMessage: text("ready_message").notNull(),
    extras: text("extras", { mode: "json" }).$type<RecommendationExtras>(),
    confidence: text("confidence").notNull().default("medium"),
    status: text("status").$type<RecommendationStatus>().notNull().default("proposed"),
    feedbackNote: text("feedback_note"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [index("recommendations_run").on(t.runId)],
);

export type Community = typeof communities.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type Member = typeof members.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type AnalysisRun = typeof analysisRuns.$inferSelect;
export type Chunk = typeof chunks.$inferSelect;
export type MemberProfile = typeof memberProfiles.$inferSelect;
export type Topic = typeof topics.$inferSelect;
export type Thread = typeof threads.$inferSelect;
export type Recommendation = typeof recommendations.$inferSelect;
