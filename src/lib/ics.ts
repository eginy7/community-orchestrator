/**
 * Minimal iCalendar (RFC 5545) generator. Pure functions, safe in the browser and in tests.
 * Times are written as floating local time (no TZID), which every calendar app treats as "the user's own zone".
 */

export const ICS_PRODID = "-//Community Orchestrator//HE";
const MAX_OCTETS = 75;

export interface IcsOptions {
  /** Stable id, e.g. the recommendation id. Becomes `rec-<id>@community-orchestrator`. */
  id: number | string;
  title: string;
  description?: string;
  /** Event start in local time. Defaults to `nextTuesdayAt(18, now)`. */
  start?: Date;
  /** Event length in minutes. Default 90. */
  durationMinutes?: number;
  /** "Now", for DTSTAMP and for computing the default start. Defaults to the wall clock. */
  now?: Date;
}

/** Escapes TEXT values: backslash, semicolon, comma, and newlines (as literal `\n`). */
export function escapeIcsText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");
}

const encoder = new TextEncoder();
const octets = (s: string) => encoder.encode(s).length;

/**
 * Folds a content line so no physical line exceeds 75 octets; continuation lines start with a single space.
 * Splits between code points, never inside a multi-byte character.
 */
export function foldLine(line: string): string[] {
  if (octets(line) <= MAX_OCTETS) return [line];
  const out: string[] = [];
  let current = "";
  let budget = MAX_OCTETS;
  for (const ch of line) {
    const size = octets(ch);
    if (octets(current) + size > budget) {
      out.push(current);
      current = " ";
      budget = MAX_OCTETS;
    }
    current += ch;
  }
  if (current.length > 0) out.push(current);
  return out;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Floating local date-time: `20260922T180000`. */
export function formatIcsLocal(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/** UTC date-time for DTSTAMP: `20260917T091500Z`. */
export function formatIcsUtc(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** The next Tuesday at `hour`:00 local time. If today is Tuesday, a full week ahead. */
export function nextTuesdayAt(hour: number, now: Date = new Date()): Date {
  const TUESDAY = 2;
  let ahead = (TUESDAY - now.getDay() + 7) % 7;
  if (ahead === 0) ahead = 7;
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + ahead, hour, 0, 0, 0);
  return d;
}

/** Filename-safe slug that keeps Hebrew letters: "סדנת-מסלולי-קריירה". Falls back to `fallback` when nothing survives. */
export function slugify(text: string, fallback = "event"): string {
  const slug = text
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || fallback;
}

/** Builds a complete VCALENDAR with one VEVENT. Lines are CRLF-terminated and folded at 75 octets. */
export function buildIcs(opts: IcsOptions): string {
  const now = opts.now ?? new Date();
  const start = opts.start ?? nextTuesdayAt(18, now);
  const duration = opts.durationMinutes ?? 90;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${ICS_PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:rec-${opts.id}@community-orchestrator`,
    `DTSTAMP:${formatIcsUtc(now)}`,
    `DTSTART:${formatIcsLocal(start)}`,
    `DURATION:PT${duration}M`,
    `SUMMARY:${escapeIcsText(opts.title)}`,
  ];
  if (opts.description) lines.push(`DESCRIPTION:${escapeIcsText(opts.description)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");

  return lines.flatMap(foldLine).join("\r\n") + "\r\n";
}
