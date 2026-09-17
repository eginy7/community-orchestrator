import type { NewsItem } from "@/lib/db/schema";

/**
 * Pure helpers for the "AI news worth talking about" section: validation of the model output,
 * group-id → group-name resolution and the display mapping shared by the API route and the
 * server component. No DB, no Next imports, so it is unit-testable as-is.
 */

export interface NewsGroupRef {
  id: number;
  name: string;
  isAnnouncement: boolean;
}

export interface NewsItemView {
  title: string;
  summary: string;
  url: string;
  source: string;
  /** ISO date (YYYY-MM-DD) or null. */
  publishedAt: string | null;
  relatedTopics: string[];
  whyNow: string;
  suggestedPost: string;
  /** Resolved target group; null when the model's suggestion did not match a group and there is no announcement group. */
  groupId: number | null;
  groupName: string | null;
}

export interface NewsBriefView {
  id: number;
  runId: number | null;
  /** ISO timestamp of the refresh. */
  createdAt: string;
  costUsd: number;
  items: NewsItemView[];
}

const MAX_ITEMS = 8;
// Pseudonym tokens must never appear in news copy; the model is told so, and we strip them as a backstop.
const MEMBER_TOKEN_RE = /@?\bM\d{4,}\b/g;

export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const u = new URL(value.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** "G12" / "g12" / "12" → 12; anything else → null. */
export function parseGroupToken(token: string | null | undefined): number | null {
  if (!token) return null;
  const m = /^\s*[Gg]?\s*(\d{1,6})\s*$/.exec(token);
  return m ? Number(m[1]) : null;
}

/**
 * Resolve the model's `suggested_group_id` to a group. Unknown ids and null fall back to the
 * announcement group (the section's documented default), or to nothing when there is none.
 */
export function resolveNewsGroup(token: string | null | undefined, groups: NewsGroupRef[]): NewsGroupRef | null {
  const id = parseGroupToken(token);
  if (id !== null) {
    const g = groups.find((x) => x.id === id);
    if (g) return g;
  }
  return groups.find((g) => g.isAnnouncement) ?? null;
}

const clean = (s: string) => s.replace(MEMBER_TOKEN_RE, "").replace(/[ \t]{2,}/g, " ").trim();

/** Best-effort ISO date: accepts "2026-09-15", "2026-09-15T10:00:00Z", "September 15, 2026"; otherwise null. */
export function normalizeIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const s = value.trim();
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  if (iso) return iso[1];
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

export interface SanitizeOptions {
  /** Known community topic names; `related_topics` is filtered to these (case-insensitive). Empty list keeps nothing. */
  topicNames: string[];
  /** Known group ids; a `suggested_group_id` outside this set becomes null. */
  groupIds: number[];
}

/**
 * Drop items without an http(s) url, de-duplicate by url, strip member tokens, keep only known
 * topic names, normalise the group token to "G<id>" or null, and cap the list.
 */
export function sanitizeNewsItems(raw: ReadonlyArray<Partial<NewsItem>>, opts: SanitizeOptions): NewsItem[] {
  const topicByLower = new Map(opts.topicNames.map((n) => [n.trim().toLowerCase(), n.trim()]));
  const groupIds = new Set(opts.groupIds);
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  for (const it of raw) {
    if (!isHttpUrl(it.url)) continue;
    const url = it.url.trim();
    const key = url.replace(/\/+$/, "").toLowerCase();
    if (seen.has(key)) continue;
    const title = clean(it.title ?? "");
    if (!title) continue;
    seen.add(key);
    const gid = parseGroupToken(it.suggested_group_id ?? null);
    const related = [...new Set((it.related_topics ?? []).map((t) => topicByLower.get(String(t).trim().toLowerCase())).filter((t): t is string => !!t))];
    out.push({
      title,
      summary: clean(it.summary ?? ""),
      url,
      source: clean(it.source ?? "") || safeHost(url),
      published_at: normalizeIsoDate(it.published_at),
      related_topics: related,
      why_now: clean(it.why_now ?? ""),
      suggested_post: clean(it.suggested_post ?? ""),
      suggested_group_id: gid !== null && groupIds.has(gid) ? `G${gid}` : null,
    });
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export interface NewsBriefRecord {
  id: number;
  runId: number | null;
  createdAt: Date;
  costUsd: number;
  items: NewsItem[];
}

/**
 * Display mapping. `humanize` is injected because the real one lives in a server-only module
 * (it resolves «group names» and, for messages, member names); tests pass the identity.
 */
export function toNewsBriefView(
  brief: NewsBriefRecord,
  groups: NewsGroupRef[],
  humanize: (text: string, mode: "ui" | "message") => string = (t) => t,
): NewsBriefView {
  return {
    id: brief.id,
    runId: brief.runId,
    createdAt: brief.createdAt.toISOString(),
    costUsd: Math.round(brief.costUsd * 1000) / 1000,
    items: brief.items.map((it) => {
      const g = resolveNewsGroup(it.suggested_group_id, groups);
      return {
        title: humanize(it.title, "ui"),
        summary: humanize(it.summary, "ui"),
        url: it.url,
        source: it.source,
        publishedAt: it.published_at,
        relatedTopics: it.related_topics,
        whyNow: humanize(it.why_now, "ui"),
        suggestedPost: humanize(it.suggested_post, "message"),
        groupId: g?.id ?? null,
        groupName: g?.name ?? null,
      };
    }),
  };
}
