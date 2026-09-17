import "server-only";
import type { Group, Recommendation, RecommendationTier, RecommendationType } from "@/lib/db/schema";
import { humanize, initials, resolveName, shortName } from "@/lib/display";
import type { EvidenceMessage } from "@/lib/queries";

/** Serializable, already de-pseudonymized view of a recommendation for client components. */

export const TYPE_LABEL: Record<RecommendationType, string> = {
  connect: "חיבור בין אנשים",
  working_group: "קבוצת עבודה",
  event: "אירוע / סדנה",
  initiative: "יוזמה",
  revive: "החייאת דיון",
  ritual: "ריטואל קהילתי",
};

export const TIER_LABEL: Record<RecommendationTier, string> = {
  do_now: "לעשות עכשיו",
  organize: "לארגן",
  plan: "לתכנן",
};

export const TIER_HINT: Record<RecommendationTier, string> = {
  do_now: "ביטחון גבוה, מאמץ נמוך. אפשר לשלוח היום.",
  organize: "דורש כמה ימי הכנה.",
  plan: "יוזמה גדולה יותר לחודש הקרוב.",
};

const ROLE_LABEL = { introducee: "להכיר", participant: "משתתף/ת", host: "מנחה", lead: "מוביל/ה" } as const;

export interface PersonView {
  id: string;
  name: string;
  short: string;
  initials: string;
  role: string;
  reason: string;
}

export interface EvidenceView {
  messageId: number;
  author: string;
  authorId: string;
  groupName: string;
  date: string;
  text: string;
  whyRelevant: string;
}

export interface RecommendationView {
  id: number;
  rank: number;
  type: RecommendationType;
  typeLabel: string;
  tier: RecommendationTier;
  title: string;
  why: string;
  whyNow: string;
  action: string;
  readyMessage: string;
  people: PersonView[];
  evidence: EvidenceView[];
  extras: { agenda: string[]; firstTask: string | null; timeline: string | null; expectedImpact: string } | null;
  whereGroupName: string | null;
  confidence: string;
  status: Recommendation["status"];
}

const fmtDate = (d: Date) => d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit" });

export function toRecommendationView(
  rec: Recommendation,
  real: boolean,
  groupsById: Map<number, Group>,
  messagesById: Map<number, EvidenceMessage>,
): RecommendationView {
  return {
    id: rec.id,
    rank: rec.rank,
    type: rec.type,
    typeLabel: TYPE_LABEL[rec.type],
    tier: rec.tier,
    title: humanize(rec.title, real),
    why: humanize(rec.why, real),
    whyNow: humanize(rec.whyNow, real),
    action: humanize(rec.action, real),
    readyMessage: humanize(rec.readyMessage, real, "message"),
    people: rec.people.map((p) => ({
      id: p.member_id,
      name: resolveName(p.member_id, real),
      short: shortName(p.member_id, real),
      initials: initials(p.member_id, real),
      role: ROLE_LABEL[p.role] ?? p.role,
      reason: humanize(p.reason, real),
    })),
    evidence: rec.evidence.flatMap((e) => {
      const m = messagesById.get(e.message_id);
      if (!m) return [];
      return [
        {
          messageId: m.id,
          author: m.memberId ? resolveName(m.memberId, real) : "מערכת",
          authorId: m.memberId ?? "",
          groupName: m.groupName,
          date: fmtDate(m.ts),
          text: humanize(m.text, real),
          whyRelevant: humanize(e.why_relevant, real),
        },
      ];
    }),
    extras: rec.extras
      ? {
          agenda: rec.extras.agenda.map((a) => humanize(a, real)),
          firstTask: rec.extras.first_task ? humanize(rec.extras.first_task, real) : null,
          timeline: rec.extras.timeline,
          expectedImpact: humanize(rec.extras.expected_impact, real),
        }
      : null,
    whereGroupName: rec.whereGroupId ? (groupsById.get(rec.whereGroupId)?.name ?? null) : null,
    confidence: rec.confidence,
    status: rec.status,
  };
}
