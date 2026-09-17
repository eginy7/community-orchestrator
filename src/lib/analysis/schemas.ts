import { z } from "zod";

/**
 * Structured-output schemas for both analysis stages.
 * Keep them to objects / arrays / strings / ints / enums / nullable — the API's grammar
 * compiler rejects refinements like .min()/.regex() and open records.
 */

const Cited = z.object({
  text: z.string().describe("Short Hebrew paraphrase of what was said, no names"),
  message_id: z.number().int().describe("The #id of the message this comes from"),
});

export const ProfileFragment = z.object({
  member_id: z.string().describe("Roster id, e.g. M0042. Never invent ids."),
  one_liner: z.string().describe("One Hebrew sentence: who this person is in the community"),
  interests: z.array(z.string()),
  expertise: z.array(z.string()),
  asks: z.array(Cited.extend({ resolved: z.boolean() })).describe("Things they asked for / needed help with"),
  offers: z.array(Cited).describe("Help, knowledge or resources they offered"),
  projects: z.array(Cited).describe("Things they are building or shipped"),
  role_signals: z.array(z.enum(["helper", "asker", "builder", "connector", "potential_host", "newcomer"])),
});

export const TopicSignal = z.object({
  name: z.string().describe("Short canonical Hebrew/English topic name, e.g. 'Claude Code', 'סוכנים קוליים'"),
  aliases: z.array(z.string()),
  summary: z.string(),
  member_ids: z.array(z.string()),
  message_ids: z.array(z.number().int()),
  momentum: z.enum(["rising", "steady", "fading"]),
  workshop_potential: z.enum(["high", "medium", "low"]),
});

export const NotableThread = z.object({
  kind: z.enum(["unanswered", "stalled", "collab_signal", "hot"]),
  title: z.string(),
  summary: z.string(),
  status: z.enum(["open", "resolved", "stalled"]),
  member_ids: z.array(z.string()),
  message_ids: z.array(z.number().int()),
});

export const StageAOutput = z.object({
  profiles: z.array(ProfileFragment),
  topics: z.array(TopicSignal),
  threads: z.array(NotableThread),
  group_observations: z.string().describe("2-4 Hebrew sentences about how this group behaves"),
});
export type StageAOutput = z.infer<typeof StageAOutput>;
export type ProfileFragment = z.infer<typeof ProfileFragment>;
export type TopicSignal = z.infer<typeof TopicSignal>;
export type NotableThread = z.infer<typeof NotableThread>;

export const RecommendationSchema = z.object({
  type: z.enum(["connect", "working_group", "event", "initiative", "revive", "ritual"]),
  tier: z.enum(["do_now", "organize", "plan"]),
  title: z.string().describe("Short Hebrew title, imperative, e.g. 'חבר/י בין @M0042 ל-@M0107'"),
  why: z.string().describe("Hebrew. The reasoning, grounded in the evidence"),
  why_now: z.string().describe("Hebrew. What makes this timely this week"),
  people: z.array(
    z.object({
      member_id: z.string(),
      role: z.enum(["introducee", "participant", "host", "lead"]),
      reason: z.string(),
    }),
  ),
  evidence: z.array(
    z.object({
      message_id: z.number().int(),
      member_id: z.string(),
      why_relevant: z.string(),
    }),
  ),
  where_group_id: z.string().nullable().describe("Group id (G12) where this should happen, or null for a private message"),
  action: z.string().describe("Hebrew. The exact next step for the community manager"),
  ready_message: z.string().describe("Hebrew WhatsApp-ready message. Address people as @M#### tokens."),
  extras: z.object({
    agenda: z.array(z.string()),
    first_task: z.string().nullable(),
    timeline: z.string().nullable(),
    expected_impact: z.string(),
  }),
  confidence: z.enum(["high", "medium", "low"]),
});

/** Report on one item of last week's plan. Only produced when the user message carries a previous plan. */
export const FollowUpSchema = z.object({
  previous_title: z.string().describe("The title of last week's recommendation, copied verbatim"),
  outcome: z.enum(["happened", "partially", "not_yet", "unknown"]),
  note: z.string().describe("Hebrew, at most 25 words, grounded in the numbers shown (e.g. co-interactions, messages since)"),
});

export const StageBOutput = z.object({
  community_pulse: z.string().describe("2-3 Hebrew sentences: the state of the community this week"),
  follow_ups: z.array(FollowUpSchema).describe("One item per recommendation of last week's plan; empty array when no previous plan was given"),
  recommendations: z.array(RecommendationSchema),
});
export type StageBOutput = z.infer<typeof StageBOutput>;
export type RecommendationOut = z.infer<typeof RecommendationSchema>;
export type FollowUpOut = z.infer<typeof FollowUpSchema>;

/** "Ask the community" — one free question answered from the cached community model. */
export const AskOutput = z.object({
  answer: z.string().describe("Hebrew. Concise, grounded answer to the manager's question"),
  people: z.array(
    z.object({
      member_id: z.string().describe("Roster id, e.g. M0042. Never invent ids."),
      why: z.string().describe("Hebrew. Why this person is relevant to the question"),
      message_ids: z.array(z.number().int()).describe("Evidence message ids from the model"),
    }),
  ),
  suggested_message: z
    .string()
    .nullable()
    .describe("Optional Hebrew WhatsApp-ready message the manager could send (e.g. asking the person to help). Address people as @M#### tokens. null when not useful."),
});
export type AskOutput = z.infer<typeof AskOutput>;

/** "AI news worth talking about" — fresh AI news matched to the community's hot topics. Simple types only (grammar compiler). */
export const NewsItemSchema = z.object({
  title: z.string().describe("Hebrew headline, short"),
  summary: z.string().describe("Hebrew. 2-3 factual sentences on what happened"),
  url: z.string().describe("Canonical http(s) link to the source article or announcement"),
  source: z.string().describe("Publisher / site name, e.g. 'Anthropic', 'TechCrunch', 'Geektime'"),
  published_at: z.string().nullable().describe("Publication date as ISO 8601 (YYYY-MM-DD), best effort; null when unknown"),
  related_topics: z.array(z.string()).describe("Community topic names from the given list that this news touches; may be empty"),
  why_now: z.string().describe("Hebrew. One sentence linking the news to what members were discussing"),
  suggested_post: z.string().describe("Hebrew WhatsApp-ready message, warm peer voice, under 100 words, ends with a question that invites discussion"),
  suggested_group_id: z.string().nullable().describe("One of the given group ids (G12), or null for the announcement group"),
});

export const NewsOutput = z.object({
  items: z.array(NewsItemSchema).describe("5-8 items, most relevant to the community first"),
});
export type NewsOutput = z.infer<typeof NewsOutput>;
export type NewsItemOut = z.infer<typeof NewsItemSchema>;
