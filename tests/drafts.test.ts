import { describe, expect, it } from "vitest";
import { buildEventDescription, buildKickoffDraft, deriveGroupName, firstSentence } from "@/lib/drafts";
import { evidenceSummary, formatDuration, gapCaption, relativeLabel } from "@/lib/timeline";
import type { RecommendationView } from "@/lib/viewmodel";

const DAY = 86_400_000;

// Fully synthetic fixture — fictional names, no real message text.
const view: RecommendationView = {
  id: 7,
  rank: 1,
  type: "working_group",
  typeLabel: "קבוצת עבודה",
  tier: "organize",
  title: "הקם קבוצת עבודה: «מסלולי קריירה בפינטק»",
  why: "שלושה חברים שאלו על מעבר קריירה. אין כרגע מקום מרוכז לזה.",
  whyNow: "השאלה עלתה שוב השבוע.",
  action: "לפתוח קבוצה ולהזמין את השלושה.",
  readyMessage: "היי! פותחים קבוצה קטנה על מסלולי קריירה. מי בעניין?",
  people: [
    { id: "m1", name: "דנה כהן", short: "דנה", initials: "דכ", role: "מנחה", reason: "הובילה שיחה דומה" },
    { id: "m2", name: "יוסי לוי", short: "יוסי", initials: "יל", role: "משתתף/ת", reason: "שאל על זה" },
  ],
  evidence: [],
  extras: { agenda: ["הכרות", "מיפוי צרכים"], firstTask: "לאסוף שאלות", timeline: "פגישה ראשונה תוך שבועיים", expectedImpact: "מענה ממוקד" },
  whereGroupName: "קהילה ראשית",
  confidence: "high",
  status: "proposed",
};

describe("deriveGroupName", () => {
  it("strips a leading working-group prefix and wrapping quotes", () => {
    expect(deriveGroupName("הקם קבוצת עבודה: «מסלולי קריירה בפינטק»")).toBe("מסלולי קריירה בפינטק");
    expect(deriveGroupName("קבוצת עבודה - חינוך פיננסי")).toBe("חינוך פיננסי");
  });

  it("returns the title unchanged when there is no prefix", () => {
    expect(deriveGroupName("סדנת ערב")).toBe("סדנת ערב");
  });
});

describe("firstSentence", () => {
  it("takes up to the first terminator", () => {
    expect(firstSentence("שלושה חברים שאלו. אין מקום מרוכז.")).toBe("שלושה חברים שאלו.");
    expect(firstSentence("בלי נקודה")).toBe("בלי נקודה");
  });
});

describe("buildKickoffDraft", () => {
  it("composes every section in order and numbers the agenda", () => {
    const draft = buildKickoffDraft(view);
    const idx = (s: string) => draft.indexOf(s);
    expect(idx("שם הקבוצה: מסלולי קריירה בפינטק")).toBe(0);
    expect(idx("תיאור: שלושה חברים שאלו על מעבר קריירה.")).toBeGreaterThan(0);
    expect(idx("חברים: דנה, יוסי")).toBeGreaterThan(idx("תיאור:"));
    expect(idx("הודעת פתיחה:\nהיי!")).toBeGreaterThan(idx("חברים:"));
    expect(idx("משימה ראשונה: לאסוף שאלות")).toBeGreaterThan(idx("הודעת פתיחה:"));
    expect(idx("לוח זמנים: פגישה ראשונה תוך שבועיים")).toBeGreaterThan(idx("משימה ראשונה:"));
    expect(draft.endsWith("מבנה:\n1. הכרות\n2. מיפוי צרכים")).toBe(true);
  });

  it("skips empty sections", () => {
    const draft = buildKickoffDraft({ ...view, extras: null, people: [] });
    expect(draft).not.toContain("חברים:");
    expect(draft).not.toContain("מבנה:");
    expect(draft).not.toContain("לוח זמנים:");
  });
});

describe("buildEventDescription", () => {
  it("lists hosts by role and includes the agenda and message", () => {
    const d = buildEventDescription(view);
    expect(d).toContain("מנחים מוצעים: דנה כהן");
    expect(d).not.toContain("יוסי לוי");
    expect(d).toContain("1. הכרות");
    expect(d).toContain("הודעה מוכנה:");
  });
});

describe("timeline helpers", () => {
  it("uses Hebrew dual forms", () => {
    expect(formatDuration(1)).toBe("יום אחד");
    expect(formatDuration(2)).toBe("יומיים");
    expect(formatDuration(5)).toBe("5 ימים");
    expect(formatDuration(14)).toBe("שבועיים");
    expect(formatDuration(21)).toBe("3 שבועות");
    expect(formatDuration(61)).toBe("חודשיים");
    expect(formatDuration(120)).toBe("4 חודשים");
    expect(formatDuration(730)).toBe("שנתיים");
  });

  it("labels relative time", () => {
    const now = Date.UTC(2026, 8, 17, 12);
    expect(relativeLabel(now, now)).toBe("היום");
    expect(relativeLabel(now - DAY, now)).toBe("אתמול");
    expect(relativeLabel(now - 3 * DAY, now)).toBe("השבוע");
    expect(relativeLabel(now - 120 * DAY, now)).toBe("לפני 4 חודשים");
  });

  it("only captions gaps of at least 14 days", () => {
    const t = Date.UTC(2026, 0, 1);
    expect(gapCaption(t, t + 5 * DAY)).toBeNull();
    expect(gapCaption(t, t + 120 * DAY)).toBe("↓ 4 חודשים אחר כך");
  });

  it("summarises count, span and group count", () => {
    const t = Date.UTC(2026, 0, 1);
    const items = [
      { ts: t, groupName: "א" },
      { ts: t + 60 * DAY, groupName: "ב" },
      { ts: t + 120 * DAY, groupName: "א" },
    ];
    expect(evidenceSummary(items)).toBe("3 הוכחות על פני 4 חודשים בשתי קבוצות");
    expect(evidenceSummary([items[0]])).toBe("הוכחה אחת בקבוצה אחת");
  });
});
