import { normalizeSpaces, stripBidi } from "./normalize";

export type MessageKind = "text" | "media" | "system" | "deleted";

export interface ParsedMessage {
  ts: Date;
  /** Display name or phone as it appears in the export. null for system events. */
  sender: string | null;
  text: string;
  kind: MessageKind;
}

export type ExportFormat = "ios" | "android" | "unknown";

export interface ParseResult {
  format: ExportFormat;
  messages: ParsedMessage[];
  /** Lines before the first recognised message header (usually 0). */
  unparsedLines: number;
  dateOrder: "dmy" | "mdy";
}

// [17/09/2026, 15:16:00] rest      |  [9/17/26, 3:16:00 PM] rest
const IOS_RE =
  /^\[(\d{1,2})[./-](\d{1,2})[./-](\d{2,4}),? (\d{1,2}):(\d{2})(?::(\d{2}))? ?([AaPp]\.?[Mm]\.?)?\] (.*)$/;
// 17/09/26, 15:16 - rest           |  9/17/26, 3:16 PM - rest
const ANDROID_RE =
  /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4}),? (\d{1,2}):(\d{2})(?::(\d{2}))? ?([AaPp]\.?[Mm]\.?)? - (.*)$/;

const MEDIA_RE =
  /^(?:<attached: [^>]*>|<Media omitted>|<מדיה הושמטה>|(?:image|video|audio|sticker|GIF|document|Contact card|voice message) omitted|(?:תמונה|סרטון|אודיו|סטיקר|מסמך|הודעה קולית|כרטיס איש קשר) הושמט[הו]?|null)(?:\s.*)?$/i;

const DELETED_RE =
  /^(?:This message was deleted\.?|You deleted this message\.?|הודעה זו נמחקה\.?|מחקת את ההודעה הזו\.?|ההודעה הזו נמחקה\.?)$/;

const EDITED_SUFFIX_RE = /\s*<(?:This message was edited|הודעה זו נערכה)>\s*$/;

// Sender-attributed lines that are really group events.
const SYSTEM_BODY_RE =
  /^(?:Messages and calls are end-to-end encrypted.*|ההודעות והשיחות מוצפנות.*|.*\b(?:added|removed|left|joined|created (?:this )?group|changed (?:the|this) (?:group|subject)|changed their phone number|joined using this group|pinned a message|turned on disappearing|turned off disappearing|was added|were added)\b.*|.*(?:הצטרף|הצטרפה|הצטרפו|יצא|יצאה|הוסיף|הוסיפה|הסיר|הסירה|נוצרה הקבוצה|יצר את הקבוצה|יצרה את הקבוצה|שינה את|שינתה את|נעץ|נעצה)(?:\s|$).*)$/;

interface Header {
  d: number;
  m: number;
  y: number;
  hh: number;
  mm: number;
  ss: number;
  ampm: string | undefined;
  rest: string;
}

function matchHeader(line: string): { header: Header; format: ExportFormat } | null {
  let m = IOS_RE.exec(line);
  let format: ExportFormat = "ios";
  if (!m) {
    m = ANDROID_RE.exec(line);
    format = "android";
  }
  if (!m) return null;
  return {
    format,
    header: {
      d: Number(m[1]),
      m: Number(m[2]),
      y: Number(m[3]),
      hh: Number(m[4]),
      mm: Number(m[5]),
      ss: m[6] ? Number(m[6]) : 0,
      ampm: m[7]?.replace(/\./g, "").toUpperCase(),
      rest: m[8],
    },
  };
}

function toDate(h: Header, order: "dmy" | "mdy"): Date {
  const day = order === "dmy" ? h.d : h.m;
  const month = order === "dmy" ? h.m : h.d;
  const year = h.y < 100 ? 2000 + h.y : h.y;
  let hour = h.hh;
  if (h.ampm === "PM" && hour < 12) hour += 12;
  if (h.ampm === "AM" && hour === 12) hour = 0;
  return new Date(year, month - 1, day, hour, h.mm, h.ss);
}

/**
 * Israeli exports are day-first. Detect month-first only when the data proves it
 * (a first component > 12 never happens in mdy; a second component > 12 never in dmy).
 */
function detectDateOrder(headers: Header[]): "dmy" | "mdy" {
  let firstOver12 = 0;
  let secondOver12 = 0;
  for (const h of headers) {
    if (h.d > 12) firstOver12++;
    if (h.m > 12) secondOver12++;
  }
  if (secondOver12 > 0 && firstOver12 === 0) return "mdy";
  return "dmy";
}

function splitSender(rest: string): { sender: string | null; body: string; bodyHadBidi: boolean } {
  // Sender part never contains ": " in practice; take the first occurrence.
  const idx = rest.indexOf(": ");
  if (idx <= 0) {
    return { sender: null, body: rest, bodyHadBidi: false };
  }
  const rawSender = rest.slice(0, idx);
  const rawBody = rest.slice(idx + 2);
  // iOS prefixes system/media bodies with U+200E — a useful hint before we strip it.
  const bodyHadBidi = /^[‎‏]/.test(rawBody);
  return { sender: normalizeSpaces(stripBidi(rawSender)), body: rawBody, bodyHadBidi };
}

function classify(sender: string | null, body: string, bodyHadBidi: boolean): { kind: MessageKind; text: string } {
  let text = normalizeSpaces(stripBidi(body)).replace(EDITED_SUFFIX_RE, "");
  if (sender === null) return { kind: "system", text };
  if (MEDIA_RE.test(text)) {
    // keep a caption if one follows the attachment marker
    const caption = text.replace(/^<attached: [^>]*>\s*/, "").replace(/^.*?omitted\s*/i, "");
    text = caption && caption !== text ? caption : "";
    return { kind: "media", text };
  }
  if (DELETED_RE.test(text)) return { kind: "deleted", text: "" };
  if (bodyHadBidi && SYSTEM_BODY_RE.test(text)) return { kind: "system", text };
  return { kind: "text", text };
}

/**
 * Parse a WhatsApp chat export (iOS `_chat.txt` or Android `WhatsApp Chat with X.txt`).
 * Handles both header formats, multi-line messages, bidi marks, media/system/deleted markers.
 * Never logs or throws on message content.
 */
export function parseExport(raw: string): ParseResult {
  const text = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const lines = text.split("\n");

  type Pending = { header: Header; bodyLines: string[] };
  const pending: Pending[] = [];
  let format: ExportFormat = "unknown";
  let unparsedLines = 0;
  let current: Pending | null = null;

  for (const rawLine of lines) {
    // Header detection must ignore leading bidi marks and odd spaces but keep the body intact.
    const probe = normalizeSpaces(stripBidi(rawLine));
    const hit = matchHeader(probe);
    if (hit) {
      if (format === "unknown") format = hit.format;
      // Re-derive `rest` from the raw line so we keep the bidi hint on the body.
      // Newer iOS exports write "[date] - Sender: text" — drop the dash so the sender parses cleanly.
      const rawRest = (rawRestOf(rawLine, hit.format) ?? hit.header.rest).replace(/^([\u200e\u200f]*)- /, "$1");
      current = { header: { ...hit.header, rest: rawRest }, bodyLines: [] };
      pending.push(current);
    } else if (current) {
      current.bodyLines.push(rawLine);
    } else if (rawLine.trim() !== "") {
      unparsedLines++;
    }
  }

  const dateOrder = detectDateOrder(pending.map((p) => p.header));
  const messages: ParsedMessage[] = [];
  for (const p of pending) {
    const { sender, body, bodyHadBidi } = splitSender(p.header.rest);
    const fullBody = [body, ...p.bodyLines].join("\n").replace(/\n+$/, "");
    const { kind, text: cleaned } = classify(sender, fullBody, bodyHadBidi);
    messages.push({ ts: toDate(p.header, dateOrder), sender, text: cleaned, kind });
  }

  return { format, messages, unparsedLines, dateOrder };
}

/**
 * The part of the raw line after the timestamp, with bidi marks intact.
 * iOS: everything after the first "] ". Android: everything after the first " - ".
 * Timestamps never contain those separators, so this is safe.
 */
function rawRestOf(rawLine: string, format: ExportFormat): string | null {
  const sep = format === "ios" ? "] " : " - ";
  const idx = rawLine.indexOf(sep);
  if (idx < 0) return null;
  return rawLine.slice(idx + sep.length);
}
