/**
 * Sanity-check a real export WITHOUT printing any content or names.
 * Usage: pnpm tsx scripts/parse-check.ts "<path to .zip or .txt>"
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { parseExport } from "@/lib/parser/whatsapp";
import { extractChatText, guessGroupNameFromFilename } from "@/lib/parser/unzip";

const file = process.argv[2];
if (!file) {
  console.error("usage: pnpm tsx scripts/parse-check.ts <export.zip|chat.txt>");
  process.exit(1);
}

const bytes = new Uint8Array(readFileSync(file));
const text = extractChatText(basename(file), bytes);
const result = parseExport(text);

const byKind: Record<string, number> = {};
const senders = new Set<string>();
let phoneSenders = 0;
let multiline = 0;
let totalChars = 0;
for (const m of result.messages) {
  byKind[m.kind] = (byKind[m.kind] ?? 0) + 1;
  if (m.sender) {
    senders.add(m.sender);
    if (/^\+?\d/.test(m.sender)) phoneSenders++;
  }
  if (m.text.includes("\n")) multiline++;
  totalChars += m.text.length;
}
const first = result.messages[0]?.ts;
const last = result.messages.at(-1)?.ts;

console.log(
  JSON.stringify(
    {
      guessedGroupName: guessGroupNameFromFilename(basename(file)) ? "(detected)" : null,
      format: result.format,
      dateOrder: result.dateOrder,
      lines: text.split("\n").length,
      messages: result.messages.length,
      unparsedLines: result.unparsedLines,
      byKind,
      uniqueSenders: senders.size,
      phoneLikeSenders: phoneSenders,
      multilineMessages: multiline,
      textChars: totalChars,
      estTokens: Math.round(totalChars / 2.2),
      firstTs: first?.toISOString() ?? null,
      lastTs: last?.toISOString() ?? null,
    },
    null,
    2,
  ),
);
