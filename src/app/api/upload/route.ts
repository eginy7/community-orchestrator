import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { communities, groups, type GroupKind } from "@/lib/db/schema";
import { inferGroupKind, looksLikeAnnouncementChannel } from "@/lib/groupKind";
import { ingestExport } from "@/lib/ingest";
import { guessGroupNameFromFilename } from "@/lib/parser/unzip";
import { GOAL_OPTIONS } from "@/lib/goals";
import { getCommunity } from "@/lib/queries";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * multipart/form-data: file, and optionally groupId | newGroupName (+ newGroupKind), communityName.
 *
 * Zero-config path: with just a file, the community is created on first upload (named from
 * `communityName` or a default), the group is created from the export's filename, and its kind
 * is inferred from the name and from who writes in it. The raw file lives only in memory.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "חסר קובץ" }, { status: 400 });

  const db = getDb();
  let community = getCommunity();
  let createdCommunity = false;
  if (!community) {
    const name = String(form.get("communityName") ?? "").trim() || "הקהילה שלי";
    community = db.insert(communities).values({ name, goals: GOAL_OPTIONS }).returning().get();
    createdCommunity = true;
  }

  let groupId = Number(form.get("groupId") ?? 0);
  let createdGroup: { id: number; name: string; kind: GroupKind } | null = null;
  if (!groupId) {
    const requested = String(form.get("newGroupName") ?? "").trim();
    const groupName = requested || guessGroupNameFromFilename(file.name) || "";
    if (!groupName || /^_?chat$/i.test(groupName)) {
      return NextResponse.json({ error: "לא זוהה שם קבוצה משם הקובץ. שנו את שם הקובץ ל־«WhatsApp Chat - שם הקבוצה.txt» או בחרו קבוצה קיימת" }, { status: 422 });
    }
    const existing = db
      .select({ id: groups.id })
      .from(groups)
      .where(and(eq(groups.communityId, community.id), eq(groups.name, groupName)))
      .get();
    if (existing) groupId = existing.id;
    else {
      const inferred = inferGroupKind(groupName);
      const kindParam = String(form.get("newGroupKind") ?? "");
      const kind = (kindParam || inferred.kind) as GroupKind;
      const row = db
        .insert(groups)
        .values({ communityId: community.id, name: groupName, kind, purpose: inferred.purpose, isAnnouncement: kind === "announcement" })
        .returning({ id: groups.id, name: groups.name, kind: groups.kind })
        .get();
      groupId = row.id;
      createdGroup = row;
    }
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const summary = ingestExport({ groupId, filename: file.name, bytes });

    // Broadcast-shaped group with no announcement channel yet → this is the announcement channel.
    let promotedToAnnouncement = false;
    if (createdGroup && createdGroup.kind !== "announcement" && looksLikeAnnouncementChannel({ messageCount: summary.textMessages, senderCount: summary.members })) {
      const hasAnnouncement = db
        .select({ id: groups.id })
        .from(groups)
        .where(and(eq(groups.communityId, community.id), eq(groups.isAnnouncement, true)))
        .get();
      if (!hasAnnouncement) {
        db.update(groups).set({ kind: "announcement", isAnnouncement: true, purpose: "הודעות רשמיות לכל הקהילה" }).where(eq(groups.id, groupId)).run();
        promotedToAnnouncement = true;
      }
    }

    const group = db.select({ name: groups.name, kind: groups.kind }).from(groups).where(eq(groups.id, groupId)).get()!;
    return NextResponse.json({ groupId, groupName: group.name, groupKind: group.kind, createdCommunity, createdGroup: !!createdGroup, promotedToAnnouncement, ...summary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "שגיאה בקריאת הקובץ";
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}
