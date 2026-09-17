import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { recommendations, type RecommendationStatus } from "@/lib/db/schema";

export const runtime = "nodejs";

const STATUSES: RecommendationStatus[] = ["proposed", "accepted", "done", "dismissed"];

/** PATCH { status?: RecommendationStatus, feedbackNote?: string } */
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/recommendations/[id]">) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { status?: string; feedbackNote?: string };
  const patch: Partial<typeof recommendations.$inferInsert> = { updatedAt: new Date() };
  if (body.status) {
    if (!STATUSES.includes(body.status as RecommendationStatus)) return NextResponse.json({ error: "bad status" }, { status: 400 });
    patch.status = body.status as RecommendationStatus;
  }
  if (typeof body.feedbackNote === "string") patch.feedbackNote = body.feedbackNote.slice(0, 2000);
  const row = getDb().update(recommendations).set(patch).where(eq(recommendations.id, Number(id))).returning().get();
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ id: row.id, status: row.status, feedbackNote: row.feedbackNote });
}
