import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { getDb, getSqlite } from "@/lib/db/client";
import { groupMembers, groups, members, uploads } from "@/lib/db/schema";
import { parseExport, type ParsedMessage } from "@/lib/parser/whatsapp";
import { extractChatText } from "@/lib/parser/unzip";
import { getPseudonymStore } from "@/lib/pseudonym/store";
import { createRedactor } from "@/lib/pseudonym/redact";

export interface IngestSummary {
  uploadId: number;
  format: string;
  parsed: number;
  /** text + captioned media — the messages Claude will actually read */
  textMessages: number;
  inserted: number;
  skippedDuplicates: number;
  members: number;
  firstTs: Date | null;
  lastTs: Date | null;
  unparsedLines: number;
}

/**
 * Parse an export in memory, pseudonymize, and bulk-insert into SQLite.
 * The raw file is never written to disk. Only ids and redacted text are persisted.
 */
export function ingestExport(opts: { groupId: number; filename: string; bytes: Uint8Array }): IngestSummary {
  const db = getDb();
  const sqlite = getSqlite();
  const store = getPseudonymStore();
  const redactor = createRedactor(store);

  const group = db.select().from(groups).where(eq(groups.id, opts.groupId)).get();
  if (!group) throw new Error("קבוצה לא נמצאה");

  const text = extractChatText(opts.filename, opts.bytes);
  const parsed = parseExport(text);
  const sha256 = createHash("sha256").update(opts.bytes).digest("hex");

  // Allocate pseudonyms for every sender first so body redaction can map phones/names -> ids.
  const senderIds = new Map<string, string>();
  for (const m of parsed.messages) {
    if (m.sender && !senderIds.has(m.sender)) senderIds.set(m.sender, store.getOrCreate(m.sender));
  }
  store.save();

  const insertMsg = sqlite.prepare(
    `INSERT OR IGNORE INTO messages (group_id, member_id, ts, text, kind, upload_id, dedupe_hash)
     VALUES (@groupId, @memberId, @ts, @text, @kind, @uploadId, @hash)`,
  );
  const upsertMember = sqlite.prepare(
    `INSERT INTO members (id, community_id, first_seen, last_seen, message_count)
     VALUES (@id, @communityId, @ts, @ts, 0)
     ON CONFLICT(id) DO UPDATE SET
       first_seen = min(first_seen, excluded.first_seen),
       last_seen  = max(last_seen, excluded.last_seen)`,
  );

  let inserted = 0;
  let firstTs: Date | null = null;
  let lastTs: Date | null = null;

  const uploadRow = db
    .insert(uploads)
    .values({
      groupId: opts.groupId,
      filename: opts.filename,
      format: parsed.format,
      sha256,
      messageCount: parsed.messages.length,
      insertedCount: 0,
    })
    .returning({ id: uploads.id })
    .get();

  const run = sqlite.transaction((msgs: ParsedMessage[]) => {
    for (const m of msgs) {
      const memberId = m.sender ? senderIds.get(m.sender)! : null;
      const ts = m.ts.getTime();
      if (Number.isNaN(ts)) continue;
      const body = m.kind === "text" || m.kind === "media" ? redactor.redact(m.text) : m.kind === "system" ? redactor.redact(m.text) : "";
      if (memberId) upsertMember.run({ id: memberId, communityId: group.communityId, ts });
      const hash = createHash("sha1")
        .update(`${Math.floor(ts / 60_000)}|${memberId ?? "-"}|${m.kind}|${body}`)
        .digest("hex");
      const info = insertMsg.run({ groupId: opts.groupId, memberId, ts, text: body, kind: m.kind, uploadId: uploadRow.id, hash });
      if (info.changes > 0) {
        inserted++;
        if (!firstTs || m.ts < firstTs) firstTs = m.ts;
        if (!lastTs || m.ts > lastTs) lastTs = m.ts;
      }
    }
  });
  run(parsed.messages);

  recomputeMemberStats(opts.groupId);

  db.update(uploads)
    .set({ insertedCount: inserted, firstTs, lastTs })
    .where(eq(uploads.id, uploadRow.id))
    .run();

  return {
    uploadId: uploadRow.id,
    format: parsed.format,
    parsed: parsed.messages.length,
    textMessages: parsed.messages.filter((m) => (m.kind === "text" || m.kind === "media") && m.text).length,
    inserted,
    skippedDuplicates: parsed.messages.length - inserted,
    members: senderIds.size,
    firstTs,
    lastTs,
    unparsedLines: parsed.unparsedLines,
  };
}

/** Recompute per-group and per-member activity counters from the messages table. */
export function recomputeMemberStats(groupId: number): void {
  const db = getDb();
  const sqlite = getSqlite();
  sqlite
    .prepare(
      `INSERT INTO group_members (group_id, member_id, message_count, first_ts, last_ts)
       SELECT group_id, member_id, count(*), min(ts), max(ts)
       FROM messages WHERE group_id = ? AND member_id IS NOT NULL AND kind IN ('text','media')
       GROUP BY group_id, member_id
       ON CONFLICT(group_id, member_id) DO UPDATE SET
         message_count = excluded.message_count, first_ts = excluded.first_ts, last_ts = excluded.last_ts`,
    )
    .run(groupId);
  db.run(sql`
    UPDATE members SET
      message_count = (SELECT coalesce(sum(message_count),0) FROM group_members gm WHERE gm.member_id = members.id),
      first_seen = (SELECT min(first_ts) FROM group_members gm WHERE gm.member_id = members.id),
      last_seen  = (SELECT max(last_ts)  FROM group_members gm WHERE gm.member_id = members.id)
    WHERE id IN (SELECT member_id FROM group_members WHERE group_id = ${groupId})
  `);
  void groupMembers;
  void members;
}
