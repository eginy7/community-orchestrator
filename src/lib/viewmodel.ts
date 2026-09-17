import "server-only";
import type { Group, Recommendation, RecommendationTier, RecommendationType } from "@/lib/db/schema";
import { humanize, initials, resolveName, shortName } from "@/lib/display";
import { createT, dateLocaleOf, type Locale, type TFunction } from "@/lib/i18n/messages";
import type { EvidenceMessage } from "@/lib/queries";

/**
 * Serializable, already de-pseudonymized view of a recommendation for client components.
 * Labels (type, role) are resolved here in the UI locale, so client components render them as-is.
 */

const ROLES = ["introducee", "participant", "host", "lead"] as const;
type Role = (typeof ROLES)[number];

export function typeLabel(type: RecommendationType, t: TFunction): string {
  return t(`types.${type}`);
}

export function tierLabel(tier: RecommendationTier, t: TFunction): string {
  return t(`tiers.${tier}`);
}

export function tierHint(tier: RecommendationTier, t: TFunction): string {
  return t(`tierHints.${tier}`);
}

function roleLabel(role: string, t: TFunction): string {
  return (ROLES as readonly string[]).includes(role) ? t(`roles.${role as Role}`) : role;
}

export interface PersonView {
  id: string;
  name: string;
  short: string;
  initials: string;
  /** Localized role label for display. */
  role: string;
  /** Raw role id ("host", "lead", …) for logic such as picking event hosts. */
  roleKey?: string;
  reason: string;
}

export interface EvidenceView {
  messageId: number;
  author: string;
  authorId: string;
  groupName: string;
  /** dd.mm.yy, pre-formatted for display. */
  date: string;
  /** Epoch ms of the quoted message — lets the client build a timeline without re-parsing dates. */
  ts: number;
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

export function toRecommendationView(
  rec: Recommendation,
  real: boolean,
  groupsById: Map<number, Group>,
  messagesById: Map<number, EvidenceMessage>,
  locale: Locale = "he",
): RecommendationView {
  const t = createT(locale);
  const fmtDate = (d: Date) => d.toLocaleDateString(dateLocaleOf(locale), { day: "2-digit", month: "2-digit", year: "2-digit" });
  return {
    id: rec.id,
    rank: rec.rank,
    type: rec.type,
    typeLabel: typeLabel(rec.type, t),
    tier: rec.tier,
    title: humanize(rec.title, real),
    why: humanize(rec.why, real),
    whyNow: humanize(rec.whyNow, real),
    action: humanize(rec.action, real),
    readyMessage: humanize(rec.readyMessage, real, "message"),
    people: rec.people.map((p) => ({
      id: p.member_id,
      name: resolveName(p.member_id, real),
      short: shortName(p.member_id, real, locale),
      initials: initials(p.member_id, real),
      role: roleLabel(p.role, t),
      roleKey: p.role,
      reason: humanize(p.reason, real),
    })),
    evidence: rec.evidence
      .flatMap((e): EvidenceView[] => {
        const m = messagesById.get(e.message_id);
        if (!m) return [];
        return [
          {
            messageId: m.id,
            author: m.memberId ? resolveName(m.memberId, real) : t("common.systemAuthor"),
            authorId: m.memberId ?? "",
            groupName: m.groupName,
            date: fmtDate(m.ts),
            ts: m.ts.getTime(),
            text: humanize(m.text, real),
            whyRelevant: humanize(e.why_relevant, real),
          },
        ];
      })
      // Oldest first: the drawer renders these as a timeline.
      .sort((a, b) => a.ts - b.ts),
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
