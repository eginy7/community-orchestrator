/**
 * CLI ingest for development. Creates the community/group if missing and ingests one export.
 * Prints counts only — never message text or names.
 *
 * pnpm tsx scripts/seed.ts --community "בונים AI" --group "שאלות ועזרה" --kind help \
 *   --purpose "שאלות טכניות ועזרה הדדית" --file "/path/WhatsApp Chat - X.zip" [--announcement]
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { parseArgs } from "node:util";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { communities, groups, type GroupKind } from "@/lib/db/schema";
import { ingestExport } from "@/lib/ingest";

const { values } = parseArgs({
  options: {
    community: { type: "string", default: "בונים AI" },
    group: { type: "string" },
    kind: { type: "string", default: "general" },
    purpose: { type: "string", default: "" },
    file: { type: "string" },
    announcement: { type: "boolean", default: false },
  },
});

if (!values.group || !values.file) {
  console.error("usage: seed.ts --group <name> --file <export> [--kind general|help|jobs|projects|topic|announcement] [--purpose ...] [--announcement]");
  process.exit(1);
}

const db = getDb();

let community = db.select().from(communities).where(eq(communities.name, values.community!)).get();
if (!community) {
  community = db.insert(communities).values({ name: values.community!, goals: [] }).returning().get();
  console.log(`created community #${community.id}`);
}

let group = db
  .select()
  .from(groups)
  .where(and(eq(groups.communityId, community.id), eq(groups.name, values.group)))
  .get();
if (!group) {
  group = db
    .insert(groups)
    .values({
      communityId: community.id,
      name: values.group,
      kind: values.kind as GroupKind,
      purpose: values.purpose ?? "",
      isAnnouncement: values.announcement ?? false,
    })
    .returning()
    .get();
  console.log(`created group #${group.id}`);
}

const bytes = new Uint8Array(readFileSync(values.file));
const t0 = Date.now();
const summary = ingestExport({ groupId: group.id, filename: basename(values.file), bytes });
console.log(JSON.stringify({ groupId: group.id, ms: Date.now() - t0, ...summary }, null, 2));
