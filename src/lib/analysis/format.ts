import type { MessageKind } from "@/lib/db/schema";

export interface FormattableMessage {
  id: number;
  ts: Date | number;
  memberId: string | null;
  text: string;
  kind: MessageKind;
}

const MAX_BODY_CHARS = 1200;

const pad = (n: number) => String(n).padStart(2, "0");

export function fmtTs(ts: Date | number): string {
  const d = typeof ts === "number" ? new Date(ts) : ts;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** One message -> one line: `#4821 [03/09 14:22] M0042: text`. Returns null for lines not worth sending. */
export function formatMessageLine(m: FormattableMessage): string | null {
  if (m.kind === "system" || m.kind === "deleted") return null;
  if (!m.memberId) return null;
  let body = m.text.replace(/\s*\n\s*/g, " ⏎ ").replace(/\s+/g, " ").trim();
  if (m.kind === "media") {
    if (!body) return null; // bare attachment without a caption carries no signal
    body = `[מדיה] ${body}`;
  }
  if (!body) return null;
  if (body.length > MAX_BODY_CHARS) body = body.slice(0, MAX_BODY_CHARS) + " …";
  return `#${m.id} [${fmtTs(m.ts)}] ${m.memberId}: ${body}`;
}

export function formatMessages(msgs: FormattableMessage[]): string {
  const lines: string[] = [];
  for (const m of msgs) {
    const line = formatMessageLine(m);
    if (line) lines.push(line);
  }
  return lines.join("\n");
}

export interface RosterEntry {
  memberId: string;
  messageCount: number;
  firstTs: Date | number | null;
}

/** Compact roster block for the system prompt: `M0042 (312 msgs, since 03/2026)`. */
export function formatRoster(entries: RosterEntry[]): string {
  return entries
    .sort((a, b) => b.messageCount - a.messageCount)
    .map((e) => {
      const since = e.firstTs ? new Date(e.firstTs) : null;
      const sinceStr = since ? `, since ${pad(since.getMonth() + 1)}/${since.getFullYear()}` : "";
      return `${e.memberId} (${e.messageCount} msgs${sinceStr})`;
    })
    .join("\n");
}
