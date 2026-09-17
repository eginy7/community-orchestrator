import { NextResponse, type NextRequest } from "next/server";
import { askCommunity } from "@/lib/analysis/ask";
import { humanize, initials, resolveName, shortName, showRealNames } from "@/lib/display";
import type { AskResponse } from "@/lib/askview";
import { getCommunity, getLatestRun, getMessagesByIds } from "@/lib/queries";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_QUESTION_CHARS = 500;

const fmtDate = (d: Date) => d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit" });

/**
 * POST { question: string } → AskResponse
 * Answers a free question from the community model of the latest completed run.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { question?: unknown };
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) return NextResponse.json({ error: "כתבו שאלה" }, { status: 400 });
  if (question.length > MAX_QUESTION_CHARS) return NextResponse.json({ error: `השאלה ארוכה מדי (עד ${MAX_QUESTION_CHARS} תווים)` }, { status: 400 });

  const community = getCommunity();
  if (!community) return NextResponse.json({ error: "אין קהילה מוגדרת" }, { status: 400 });
  const run = getLatestRun(community.id, "done");
  if (!run) return NextResponse.json({ error: "אין עדיין ניתוח שהסתיים — צריך להריץ ניתוח קודם" }, { status: 409 });

  const started = Date.now();
  let result;
  try {
    result = await askCommunity({ runId: run.id, question });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `השאלה נכשלה: ${msg.slice(0, 200)}` }, { status: 502 });
  }

  const real = await showRealNames();
  // Quotes come from the database by id — never from the model.
  const messagesById = getMessagesByIds([...new Set(result.output.people.flatMap((p) => p.message_ids))]);

  const payload: AskResponse = {
    answer: humanize(result.output.answer, real),
    people: result.output.people.map((p) => ({
      id: p.member_id,
      name: resolveName(p.member_id, real),
      short: shortName(p.member_id, real),
      initials: initials(p.member_id, real),
      why: humanize(p.why, real),
      quotes: p.message_ids.flatMap((id) => {
        const m = messagesById.get(id);
        return m ? [{ messageId: m.id, groupName: m.groupName, date: fmtDate(m.ts), text: humanize(m.text, real) }] : [];
      }),
    })),
    suggestedMessage: result.output.suggested_message ? humanize(result.output.suggested_message, real, "message") : null,
    costUsd: Math.round(result.costUsd * 1000) / 1000,
    elapsedMs: Date.now() - started,
  };
  return NextResponse.json(payload);
}
