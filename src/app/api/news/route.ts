import { NextResponse } from "next/server";
import { refreshNews } from "@/lib/analysis/news";
import { humanize, showRealNames } from "@/lib/display";
import { getLocale } from "@/lib/i18n/server";
import { newsT } from "@/lib/i18n/news";
import { getLatestNewsBrief, saveNewsBrief } from "@/lib/news";
import { toNewsBriefView, type NewsBriefView } from "@/lib/newsview";
import { getCommunity, getGroups } from "@/lib/queries";

export const runtime = "nodejs";
export const maxDuration = 300;

/** GET → latest brief (display-ready) or `{ brief: null }`. */
export async function GET() {
  const t = newsT(await getLocale());
  const community = getCommunity();
  if (!community) return NextResponse.json({ error: t("errNoCommunity") }, { status: 400 });
  const brief = getLatestNewsBrief(community.id);
  if (!brief) return NextResponse.json({ brief: null });
  return NextResponse.json({ brief: await toView(brief, community.id) });
}

/** POST → search the web, save a new brief, return it display-ready. */
export async function POST() {
  const t = newsT(await getLocale());
  const community = getCommunity();
  if (!community) return NextResponse.json({ error: t("errNoCommunity") }, { status: 400 });

  let result;
  try {
    result = await refreshNews({ communityId: community.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: t("errFailed", { msg: msg.slice(0, 200) }) }, { status: 502 });
  }
  const brief = saveNewsBrief({
    communityId: community.id,
    runId: result.runId,
    items: result.items,
    tokensIn: result.usage.tokensIn,
    tokensOut: result.usage.tokensOut,
    costUsd: result.costUsd,
  });
  return NextResponse.json({ brief: await toView(brief, community.id), elapsedMs: result.elapsedMs, searches: result.searches });
}

async function toView(brief: Parameters<typeof toNewsBriefView>[0], communityId: number): Promise<NewsBriefView> {
  const real = await showRealNames();
  return toNewsBriefView(brief, getGroups(communityId), (text, mode) => humanize(text, real, mode));
}
