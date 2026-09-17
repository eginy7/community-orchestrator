"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { communities, groups, type GroupKind } from "@/lib/db/schema";
import { getCommunity } from "@/lib/queries";


const KINDS: GroupKind[] = ["general", "help", "jobs", "projects", "topic", "announcement"];

/**
 * Saves the community + its groups from the onboarding form.
 * Fields: name, goals[] (checkbox values), group_name[], group_purpose[], group_kind[], announcement (index).
 */
export async function saveOnboarding(formData: FormData): Promise<void> {
  const db = getDb();
  const name = String(formData.get("name") ?? "").trim() || "הקהילה שלי";
  const goals = formData.getAll("goals").map(String).filter(Boolean);

  const existing = getCommunity();
  const communityId = existing
    ? (db.update(communities).set({ name, goals }).where(eq(communities.id, existing.id)).run(), existing.id)
    : db.insert(communities).values({ name, goals }).returning({ id: communities.id }).get().id;

  const names = formData.getAll("group_name").map(String);
  const purposes = formData.getAll("group_purpose").map(String);
  const kinds = formData.getAll("group_kind").map(String);
  const announcementIdx = Number(formData.get("announcement") ?? -1);

  const current = db.select().from(groups).where(eq(groups.communityId, communityId)).all();
  const byName = new Map(current.map((g) => [g.name, g]));

  names.forEach((rawName, i) => {
    const gName = rawName.trim();
    if (!gName) return;
    const kind = (KINDS.includes(kinds[i] as GroupKind) ? kinds[i] : "general") as GroupKind;
    const isAnnouncement = i === announcementIdx || kind === "announcement";
    const values = { name: gName, purpose: (purposes[i] ?? "").trim(), kind: isAnnouncement ? ("announcement" as GroupKind) : kind, isAnnouncement };
    const prev = byName.get(gName);
    if (prev) db.update(groups).set(values).where(eq(groups.id, prev.id)).run();
    else db.insert(groups).values({ communityId, ...values }).run();
  });

  redirect("/upload");
}
