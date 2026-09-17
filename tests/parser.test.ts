import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseExport } from "@/lib/parser/whatsapp";
import { normalizeName, normalizePhone, stripBidi, isPhoneLike } from "@/lib/parser/normalize";
import { guessGroupNameFromFilename } from "@/lib/parser/unzip";

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");

describe("parseExport — iOS", () => {
  const result = parseExport(fixture("ios_chat.txt"));

  it("detects the iOS format and parses every header line", () => {
    expect(result.format).toBe("ios");
    expect(result.unparsedLines).toBe(0);
    expect(result.messages).toHaveLength(10);
    expect(result.dateOrder).toBe("dmy");
  });

  it("classifies system events (no sender or bidi-prefixed body)", () => {
    const kinds = result.messages.map((m) => m.kind);
    expect(kinds[0]).toBe("system"); // encryption notice attributed to the group
    expect(kinds[1]).toBe("system"); // "added"
    expect(kinds[8]).toBe("system"); // "left"
  });

  it("joins multi-line messages and strips bidi marks", () => {
    const dana = result.messages[2];
    expect(dana.sender).toBe("דנה כהן");
    expect(dana.kind).toBe("text");
    expect(dana.text).toContain("Claude Code\nומחפשת");
    expect(dana.text).not.toMatch(/[‎‏]/);
  });

  it("marks attachments and 'omitted' lines as media, keeping captions", () => {
    expect(result.messages[3].kind).toBe("media");
    expect(result.messages[3].text).toBe("");
    expect(result.messages[5].kind).toBe("media");
    const video = result.messages[9];
    expect(video.kind).toBe("media");
    expect(video.text).toContain("Cloudflare");
  });

  it("marks deleted messages and strips the edited suffix", () => {
    expect(result.messages[6].kind).toBe("deleted");
    expect(result.messages[7].text).toBe("תודה!");
  });

  it("keeps unsaved-contact senders as phone strings", () => {
    const m = result.messages[4];
    expect(m.sender).toBe("+972 50-000-0001");
    expect(isPhoneLike(m.sender!)).toBe(true);
  });

  it("parses day-first timestamps", () => {
    const ts = result.messages[2].ts;
    expect(ts.getFullYear()).toBe(2026);
    expect(ts.getMonth()).toBe(8); // September
    expect(ts.getDate()).toBe(1);
    expect(ts.getHours()).toBe(9);
    expect(ts.getMinutes()).toBe(5);
    expect(ts.getSeconds()).toBe(32);
  });
});

describe("parseExport — Android", () => {
  const result = parseExport(fixture("android_chat.txt"));

  it("detects the Android format", () => {
    expect(result.format).toBe("android");
    expect(result.messages).toHaveLength(7);
    expect(result.unparsedLines).toBe(0);
  });

  it("handles system lines without a sender", () => {
    expect(result.messages[0].kind).toBe("system");
    expect(result.messages[0].sender).toBeNull();
    expect(result.messages[1].kind).toBe("system");
  });

  it("handles <Media omitted>, deleted and multi-line", () => {
    expect(result.messages[3].kind).toBe("media");
    expect(result.messages[5].kind).toBe("deleted");
    expect(result.messages[2].text).toBe("היי כולם! אני בונה סוכן קולי\nומחפשת עזרה");
  });

  it("parses two-digit years", () => {
    expect(result.messages[6].ts.getFullYear()).toBe(2026);
    expect(result.messages[6].ts.getDate()).toBe(13);
  });
});

describe("parseExport — iOS 2026 variant ('[date] - Sender: text', month-first)", () => {
  const result = parseExport(fixture("ios2026_chat.txt"));

  it("strips the dash, detects month-first dates and parses every header", () => {
    expect(result.format).toBe("ios");
    expect(result.dateOrder).toBe("mdy");
    expect(result.unparsedLines).toBe(1); // encryption notice without a timestamp
    expect(result.messages).toHaveLength(4);
    expect(result.messages[0].kind).toBe("system");
    expect(result.messages[0].sender).toBeNull();
    expect(result.messages[1].sender).toBe("דנה כהן");
    expect(result.messages[1].text).toContain("Claude Code");
    expect(result.messages[2].sender).toBe("+972 50-000-0002");
    expect(result.messages[2].text).toBe("כן, עבד לי מעולה\nעם כמה שינויים");
    expect(result.messages[2].ts.getMonth()).toBe(4);
    expect(result.messages[2].ts.getDate()).toBe(19);
    expect(result.messages[2].ts.getHours()).toBe(11);
    expect(result.messages[3].kind).toBe("media");
  });
});

describe("parseExport — edge cases", () => {
  it("handles CRLF, BOM and 12-hour clocks", () => {
    const r = parseExport("﻿[9/17/26, 3:16:00 PM] Test Customer: hello\r\n[9/17/26, 3:17:00 AM] Test Customer: bye\r\n");
    expect(r.messages).toHaveLength(2);
    expect(r.messages[0].ts.getHours()).toBe(15);
    expect(r.messages[1].ts.getHours()).toBe(3);
  });

  it("detects month-first order when a second component exceeds 12", () => {
    const r = parseExport("[9/17/26, 3:16:00 PM] Test Customer: hello\n");
    expect(r.dateOrder).toBe("mdy");
    expect(r.messages[0].ts.getMonth()).toBe(8);
  });

  it("counts junk lines before the first header", () => {
    const r = parseExport("garbage\n[01/09/2026, 09:05:32] Test Customer: hi\n");
    expect(r.unparsedLines).toBe(1);
    expect(r.messages).toHaveLength(1);
  });
});

describe("normalize", () => {
  it("normalizes names deterministically", () => {
    expect(normalizeName("‎דנה  כהן ")).toBe("דנה כהן");
    expect(normalizeName("דנה כהן")).toBe(normalizeName("‏דנה כהן"));
  });

  it("normalizes Israeli phones to international digits", () => {
    expect(normalizePhone("+972 50-000-0001")).toBe("972500000001");
    expect(normalizePhone("050-000-0001")).toBe("972500000001");
    expect(normalizePhone("‎+972 50-000-0001")).toBe("972500000001");
    expect(normalizePhone("hello")).toBeNull();
  });

  it("strips every bidi control character", () => {
    expect(stripBidi("‎‏‪‮⁦⁩﻿x")).toBe("x");
  });
});

describe("guessGroupNameFromFilename", () => {
  it("extracts the group name from iOS and Android filenames", () => {
    expect(guessGroupNameFromFilename("WhatsApp Chat - בונים AI.zip")).toBe("בונים AI");
    expect(guessGroupNameFromFilename("WhatsApp Chat with Jobs.txt")).toBe("Jobs");
    expect(guessGroupNameFromFilename("_chat.txt")).toBeNull();
    expect(guessGroupNameFromFilename("chat.txt")).toBeNull();
    expect(guessGroupNameFromFilename("שאלות ועזרה ❓ (1).zip")).toBe("שאלות ועזרה ❓");
    expect(guessGroupNameFromFilename("בונים AI.zip")).toBe("בונים AI");
  });
});
