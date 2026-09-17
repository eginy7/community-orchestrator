import { describe, expect, it } from "vitest";
import { buildIcs, escapeIcsText, foldLine, nextTuesdayAt, slugify } from "@/lib/ics";

const octets = (s: string) => new TextEncoder().encode(s).length;

/** Reverses RFC 5545 folding so we can check nothing was lost. */
const unfold = (ics: string) => ics.replace(/\r\n[ \t]/g, "");

describe("escapeIcsText", () => {
  it("escapes commas, semicolons, backslashes and newlines", () => {
    expect(escapeIcsText("a,b;c\\d")).toBe("a\\,b\\;c\\\\d");
    expect(escapeIcsText("line1\nline2\r\nline3")).toBe("line1\\nline2\\nline3");
  });

  it("leaves Hebrew text intact", () => {
    expect(escapeIcsText("סדנה: מסלולי קריירה")).toBe("סדנה: מסלולי קריירה");
  });
});

describe("foldLine", () => {
  it("returns short lines as-is", () => {
    expect(foldLine("SUMMARY:קצר")).toEqual(["SUMMARY:קצר"]);
  });

  it("folds long lines to at most 75 octets, continuation lines start with a space, and unfolding restores the text", () => {
    const long = "DESCRIPTION:" + "דנה כהן מציעה סדנה על מסלולי קריירה. ".repeat(6);
    const folded = foldLine(long);
    expect(folded.length).toBeGreaterThan(1);
    for (const l of folded) expect(octets(l)).toBeLessThanOrEqual(75);
    for (const l of folded.slice(1)) expect(l.startsWith(" ")).toBe(true);
    expect(unfold(folded.join("\r\n"))).toBe(long);
  });

  it("never splits inside a multi-byte character", () => {
    const long = "X:" + "א".repeat(200);
    for (const l of foldLine(long)) {
      // A broken UTF-8 sequence would round-trip to U+FFFD.
      expect(new TextDecoder("utf-8", { fatal: true }).decode(new TextEncoder().encode(l))).toBe(l);
    }
  });
});

describe("nextTuesdayAt", () => {
  it("picks the coming Tuesday at 18:00 local time", () => {
    const thursday = new Date(2026, 8, 17, 10, 30); // 17.09.2026 is a Thursday
    const d = nextTuesdayAt(18, thursday);
    expect(d.getDay()).toBe(2);
    expect(d.getHours()).toBe(18);
    expect(d.getMinutes()).toBe(0);
    expect(d.getDate()).toBe(22);
  });

  it("jumps a full week when today is already Tuesday", () => {
    const tuesday = new Date(2026, 8, 15, 9, 0);
    const d = nextTuesdayAt(18, tuesday);
    expect(d.getDate()).toBe(22);
    expect(d.getDay()).toBe(2);
  });
});

describe("buildIcs", () => {
  const now = new Date(2026, 8, 17, 12, 0, 0);
  const ics = buildIcs({
    id: 42,
    title: "סדנה: מסלולי קריירה, חלק א; מפגש פתיחה",
    description: "למה\n\nאג׳נדה:\n1. הכרות\n2. דיון\n\nמנחים מוצעים: דנה כהן",
    now,
  });

  it("has the VCALENDAR/VEVENT envelope and required properties", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("PRODID:");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
    expect(ics).toContain("UID:rec-42@community-orchestrator");
    expect(ics).toContain("DURATION:PT90M");
    expect(ics).toMatch(/DTSTAMP:\d{8}T\d{6}Z/);
  });

  it("escapes SUMMARY and DESCRIPTION", () => {
    const flat = unfold(ics);
    expect(flat).toContain("SUMMARY:סדנה: מסלולי קריירה\\, חלק א\\; מפגש פתיחה");
    expect(flat).toContain("DESCRIPTION:למה\\n\\nאג׳נדה:\\n1. הכרות\\n2. דיון\\n\\nמנחים מוצעים: דנה כהן");
  });

  it("keeps every physical line within 75 octets and uses CRLF", () => {
    const lines = ics.split("\r\n");
    expect(ics).not.toMatch(/[^\r]\n/);
    for (const l of lines) expect(octets(l)).toBeLessThanOrEqual(75);
  });

  it("places DTSTART in the future relative to now, on a Tuesday at 18:00", () => {
    const m = /DTSTART:(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/.exec(ics);
    expect(m).not.toBeNull();
    const [, y, mo, d, h, mi, s] = m!.map(Number);
    const start = new Date(y, mo - 1, d, h, mi, s);
    expect(start.getTime()).toBeGreaterThan(now.getTime());
    expect(start.getDay()).toBe(2);
    expect(start.getHours()).toBe(18);
  });

  it("uses a real wall clock when `now` is omitted, so DTSTART is still in the future", () => {
    const out = buildIcs({ id: 1, title: "בדיקה" });
    const m = /DTSTART:(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/.exec(out)!;
    const [, y, mo, d, h, mi, s] = m.map(Number);
    expect(new Date(y, mo - 1, d, h, mi, s).getTime()).toBeGreaterThan(Date.now());
  });
});

describe("slugify", () => {
  it("keeps Hebrew letters and joins words with dashes", () => {
    expect(slugify("סדנה: מסלולי קריירה!")).toBe("סדנה-מסלולי-קריירה");
  });

  it("falls back when nothing survives", () => {
    expect(slugify("!!!", "rec-7")).toBe("rec-7");
  });
});
