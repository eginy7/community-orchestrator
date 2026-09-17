import type { StageAOutput, StageBOutput } from "./schemas";

/**
 * Hard validation of model output against what actually exists in the database.
 * Claude only ever sees pseudonym ids and message ids; anything it cites that we cannot
 * find is dropped (and counted) rather than trusted.
 */

export interface DropStats {
  unknownMembers: number;
  unknownMessages: number;
  droppedProfiles: number;
  droppedTopics: number;
  droppedThreads: number;
  droppedRecommendations: number;
}

export const emptyDrops = (): DropStats => ({
  unknownMembers: 0,
  unknownMessages: 0,
  droppedProfiles: 0,
  droppedTopics: 0,
  droppedThreads: 0,
  droppedRecommendations: 0,
});

export interface KnownIds {
  memberIds: Set<string>;
  /** message id -> member id (null for system) */
  messageOwner: Map<number, string | null>;
}

const normId = (id: string) => id.trim().replace(/^@/, "");

export function validateStageA(out: StageAOutput, known: KnownIds, stats: DropStats = emptyDrops()): { out: StageAOutput; stats: DropStats } {
  const keepMember = (id: string) => {
    const ok = known.memberIds.has(normId(id));
    if (!ok) stats.unknownMembers++;
    return ok;
  };
  const keepMsg = (id: number) => {
    const ok = known.messageOwner.has(id);
    if (!ok) stats.unknownMessages++;
    return ok;
  };
  const filterCited = <T extends { message_id: number }>(arr: T[]) => arr.filter((c) => keepMsg(c.message_id));

  const profiles = out.profiles
    .map((p) => ({ ...p, member_id: normId(p.member_id) }))
    .filter((p) => {
      if (!keepMember(p.member_id)) {
        stats.droppedProfiles++;
        return false;
      }
      return true;
    })
    .map((p) => ({
      ...p,
      asks: filterCited(p.asks),
      offers: filterCited(p.offers),
      projects: filterCited(p.projects),
    }));

  const topics = out.topics
    .map((t) => ({
      ...t,
      member_ids: t.member_ids.map(normId).filter(keepMember),
      message_ids: t.message_ids.filter(keepMsg),
    }))
    .filter((t) => {
      if (t.message_ids.length === 0) {
        stats.droppedTopics++;
        return false;
      }
      return true;
    });

  const threads = out.threads
    .map((t) => ({
      ...t,
      member_ids: t.member_ids.map(normId).filter(keepMember),
      message_ids: t.message_ids.filter(keepMsg),
    }))
    .filter((t) => {
      if (t.message_ids.length === 0) {
        stats.droppedThreads++;
        return false;
      }
      return true;
    });

  return { out: { ...out, profiles, topics, threads }, stats };
}

export interface KnownForStageB extends KnownIds {
  groupIds: Set<number>;
}

export function validateStageB(out: StageBOutput, known: KnownForStageB, stats: DropStats = emptyDrops()): { out: StageBOutput; stats: DropStats } {
  const recommendations = out.recommendations
    .map((r) => {
      const people = r.people
        .map((p) => ({ ...p, member_id: normId(p.member_id) }))
        .filter((p) => {
          const ok = known.memberIds.has(p.member_id);
          if (!ok) stats.unknownMembers++;
          return ok;
        });
      const evidence = r.evidence
        .map((e) => ({ ...e, member_id: normId(e.member_id) }))
        .filter((e) => {
          const owner = known.messageOwner.get(e.message_id);
          if (owner === undefined) {
            stats.unknownMessages++;
            return false;
          }
          // Re-attribute to the true author rather than trusting the model.
          if (owner && owner !== e.member_id) e.member_id = owner;
          return true;
        });
      let where_group_id = r.where_group_id;
      if (where_group_id) {
        const n = Number(where_group_id.replace(/^G/i, ""));
        where_group_id = Number.isFinite(n) && known.groupIds.has(n) ? String(n) : null;
      }
      return { ...r, people, evidence, where_group_id };
    })
    .filter((r) => {
      const peopleOk = r.type === "connect" ? r.people.length >= 2 : r.type === "ritual" || r.people.length >= 1;
      if (r.evidence.length === 0 || !peopleOk) {
        stats.droppedRecommendations++;
        return false;
      }
      return true;
    });
  return { out: { ...out, recommendations }, stats };
}
