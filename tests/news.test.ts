import { describe, expect, it } from "vitest";
import type { NewsItem } from "@/lib/db/schema";
import { NEWS_DICT, newsT } from "@/lib/i18n/news";
import { isHttpUrl, normalizeIsoDate, parseGroupToken, resolveNewsGroup, sanitizeNewsItems, toNewsBriefView, type NewsGroupRef } from "@/lib/newsview";

// Fully fictional fixtures — invented groups, topics and urls on reserved example domains.
const GROUPS: NewsGroupRef[] = [
  { id: 1, name: "כללי", isAnnouncement: false },
  { id: 2, name: "עזרה טכנית", isAnnouncement: false },
  { id: 9, name: "הודעות", isAnnouncement: true },
];
const TOPICS = ["Claude Code", "סוכנים קוליים", "RAG"];

const item = (over: Partial<NewsItem> = {}): Partial<NewsItem> => ({
  title: "מודל חדש שוחרר",
  summary: "תקציר קצר.",
  url: "https://example.com/a",
  source: "Example News",
  published_at: "2026-09-15",
  related_topics: ["Claude Code"],
  why_now: "הקהילה דיברה על זה.",
  suggested_post: "מה דעתכם?",
  suggested_group_id: "G2",
  ...over,
});

describe("isHttpUrl", () => {
  it("accepts http(s) and rejects everything else", () => {
    expect(isHttpUrl("https://example.com/x")).toBe(true);
    expect(isHttpUrl(" http://example.org ")).toBe(true);
    expect(isHttpUrl("ftp://example.com")).toBe(false);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("example.com/no-scheme")).toBe(false);
    expect(isHttpUrl("")).toBe(false);
    expect(isHttpUrl(null)).toBe(false);
    expect(isHttpUrl(42)).toBe(false);
  });
});

describe("sanitizeNewsItems", () => {
  it("drops items without a valid http(s) url and de-duplicates by url", () => {
    const out = sanitizeNewsItems(
      [item(), item({ url: "not a url" }), item({ url: undefined }), item({ url: "https://example.com/a/" }), item({ url: "HTTPS://EXAMPLE.COM/A" }), item({ url: "https://example.com/b" })],
      { topicNames: TOPICS, groupIds: [1, 2, 9] },
    );
    expect(out.map((i) => i.url)).toEqual(["https://example.com/a", "https://example.com/b"]);
  });

  it("keeps only known topic names (case-insensitive) and normalises the group token", () => {
    const [a] = sanitizeNewsItems([item({ related_topics: ["claude code", "Unknown", "RAG", "rag"], suggested_group_id: "2" })], { topicNames: TOPICS, groupIds: [1, 2, 9] });
    expect(a.related_topics).toEqual(["Claude Code", "RAG"]);
    expect(a.suggested_group_id).toBe("G2");
    const [b] = sanitizeNewsItems([item({ suggested_group_id: "G77" })], { topicNames: TOPICS, groupIds: [1, 2, 9] });
    expect(b.suggested_group_id).toBeNull();
    const [c] = sanitizeNewsItems([item({ suggested_group_id: null })], { topicNames: TOPICS, groupIds: [1, 2, 9] });
    expect(c.suggested_group_id).toBeNull();
  });

  it("strips member tokens, normalises dates, falls back to the host as source and caps at 8", () => {
    const [a] = sanitizeNewsItems([item({ title: "חדשות עם @M0042 בפנים", summary: "M1234 אמר משהו", source: "", published_at: "2026-09-15T10:00:00Z" })], { topicNames: TOPICS, groupIds: [] });
    expect(a.title).toBe("חדשות עם בפנים");
    expect(a.summary).toBe("אמר משהו");
    expect(a.source).toBe("example.com");
    expect(a.published_at).toBe("2026-09-15");
    const many = Array.from({ length: 12 }, (_, i) => item({ url: `https://example.com/${i}` }));
    expect(sanitizeNewsItems(many, { topicNames: [], groupIds: [] })).toHaveLength(8);
    expect(sanitizeNewsItems([item({ title: "" })], { topicNames: [], groupIds: [] })).toHaveLength(0);
  });
});

describe("dates and group tokens", () => {
  it("normalizeIsoDate", () => {
    expect(normalizeIsoDate("2026-09-15")).toBe("2026-09-15");
    expect(normalizeIsoDate("2026-09-15T08:00:00.000Z")).toBe("2026-09-15");
    expect(normalizeIsoDate("garbage")).toBeNull();
    expect(normalizeIsoDate(null)).toBeNull();
  });
  it("parseGroupToken", () => {
    expect(parseGroupToken("G12")).toBe(12);
    expect(parseGroupToken("g3")).toBe(3);
    expect(parseGroupToken("7")).toBe(7);
    expect(parseGroupToken("M0001")).toBeNull();
    expect(parseGroupToken(null)).toBeNull();
  });
});

describe("resolveNewsGroup", () => {
  it("resolves known ids, falls back to the announcement group, or null without one", () => {
    expect(resolveNewsGroup("G2", GROUPS)?.name).toBe("עזרה טכנית");
    expect(resolveNewsGroup(null, GROUPS)?.name).toBe("הודעות");
    expect(resolveNewsGroup("G500", GROUPS)?.name).toBe("הודעות");
    expect(resolveNewsGroup("G500", GROUPS.filter((g) => !g.isAnnouncement))).toBeNull();
  });
});

describe("toNewsBriefView", () => {
  it("maps a stored brief to the display shape and applies the injected humanizer", () => {
    const items = sanitizeNewsItems([item(), item({ url: "https://example.com/b", suggested_group_id: null, suggested_post: "פוסט ל-G1" })], { topicNames: TOPICS, groupIds: [1, 2, 9] });
    const view = toNewsBriefView({ id: 3, runId: 11, createdAt: new Date("2026-09-17T10:00:00Z"), costUsd: 0.123456, items }, GROUPS, (text, mode) => (mode === "message" ? text.replace(/\bG(\d+)\b/g, "«$1»") : text));
    expect(view.id).toBe(3);
    expect(view.runId).toBe(11);
    expect(view.createdAt).toBe("2026-09-17T10:00:00.000Z");
    expect(view.costUsd).toBe(0.123);
    expect(view.items).toHaveLength(2);
    expect(view.items[0]).toMatchObject({ url: "https://example.com/a", groupId: 2, groupName: "עזרה טכנית", relatedTopics: ["Claude Code"], publishedAt: "2026-09-15", source: "Example News" });
    expect(view.items[1]).toMatchObject({ groupId: 9, groupName: "הודעות", suggestedPost: "פוסט ל-«1»" });
  });
});

describe("news dictionary", () => {
  it("en mirrors he keys and placeholders", () => {
    const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    const heKeys = Object.keys(NEWS_DICT.he).sort();
    expect(Object.keys(NEWS_DICT.en).sort()).toEqual(heKeys);
    for (const k of heKeys as Array<keyof typeof NEWS_DICT.he>) {
      expect(NEWS_DICT.en[k], `${k} is empty`).not.toBe("");
      expect(placeholders(NEWS_DICT.en[k]), `${k} placeholders`).toEqual(placeholders(NEWS_DICT.he[k]));
    }
    expect(newsT("en")("refreshed", { n: 6 })).toBe("Found 6 relevant news items");
    expect(newsT("he")("postIn", { group: "כללי" })).toBe("לפרסם ב-«כללי»");
  });
});
