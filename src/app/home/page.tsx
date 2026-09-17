import Link from "next/link";
import { ArrowUpRightIcon, MinusIcon, TrendingDownIcon, TrendingUpIcon, UploadIcon } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { RecommendationCard } from "@/components/RecommendationCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { humanize, resolveName, showRealNames } from "@/lib/display";
import type { RecommendationTier } from "@/lib/db/schema";
import { getCommunity, getGroups, getGroupStats, getLatestRun, getMessagesByIds, getOpenThreads, getRecommendations, getTopProfiles, getTopics, getWeeklyReminder } from "@/lib/queries";
import { TIER_HINT, TIER_LABEL, toRecommendationView } from "@/lib/viewmodel";

export const dynamic = "force-dynamic";

const TIERS: RecommendationTier[] = ["do_now", "organize", "plan"];

export default async function HomePage() {
  const community = getCommunity();
  const real = await showRealNames();
  if (!community) {
    return (
      <AppShell realNames={real}>
        <Empty title="עוד אין קהילה" description="ייצאו את הצ׳אטים של הקהילה והעלו אותם. Claude יגדיר את השאר." cta="להעלאת השיחות" href="/upload" />
      </AppShell>
    );
  }
  const run = getLatestRun(community.id, "done");
  const pendingRun = run ? null : getLatestRun(community.id);
  if (!run) {
    return (
      <AppShell communityName={community.name} realNames={real}>
        {pendingRun && (pendingRun.status === "running" || pendingRun.status === "queued") ? (
          <Empty title="הניתוח עדיין רץ" cta="למסך ההתקדמות" href={`/analysis/${pendingRun.id}`} />
        ) : (
          <Empty title="עוד אין ניתוח" description="העלו את ייצוא הקבוצות ותנו ל-Claude לקרוא את הקהילה." cta="להעלאת שיחות" href="/upload" />
        )}
      </AppShell>
    );
  }

  const groups = getGroups(community.id);
  const groupsById = new Map(groups.map((g) => [g.id, g]));
  const recs = getRecommendations(run.id);
  const messageIds = [...new Set(recs.flatMap((r) => r.evidence.map((e) => e.message_id)))];
  const messagesById = getMessagesByIds(messageIds);
  const views = recs.map((r) => toRecommendationView(r, real, groupsById, messagesById));

  const stats = getGroupStats(community.id);
  const totalMessages = stats.reduce((s, g) => s + g.messageCount, 0);
  const totalMembers = stats.reduce((s, g) => s + g.memberCount, 0);
  const topics = getTopics(run.id);
  const profiles = getTopProfiles(run.id);
  const threads = getOpenThreads(run.id);
  const openCount = views.filter((v) => v.status === "proposed" || v.status === "accepted").length;
  const reminder = getWeeklyReminder(community.id);

  return (
    <AppShell communityName={community.name} realNames={real} reminder={reminder}>
      <section className="mb-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground mb-1">
              {run.finishedAt ? `ניתוח מ-${run.finishedAt.toLocaleDateString("he-IL")}` : ""} · {groups.length} קבוצות · {totalMembers.toLocaleString("he-IL")} חברים פעילים ·{" "}
              {totalMessages.toLocaleString("he-IL")} הודעות
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">מה הקהילה שלך צריכה השבוע</h1>
          </div>
          <Button asChild variant="outline">
            <Link href="/upload">
              <UploadIcon className="size-4" /> העלאה וניתוח מחדש
            </Link>
          </Button>
        </div>
        {run.communityPulse ? <p className="mt-4 max-w-3xl text-lg leading-relaxed text-muted-foreground">{humanize(run.communityPulse, real)}</p> : null}
        <p className="mt-2 text-sm text-muted-foreground">
          {openCount} פעולות ממתינות מתוך {views.length}.
        </p>
      </section>

      <div className="space-y-10">
        {TIERS.map((tier) => {
          const items = views.filter((v) => v.tier === tier);
          if (items.length === 0) return null;
          return (
            <section key={tier}>
              <div className="mb-3 flex items-baseline gap-3">
                <h2 className="text-xl font-semibold">{TIER_LABEL[tier]}</h2>
                <span className="text-sm text-muted-foreground">{TIER_HINT[tier]}</span>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {items.map((rec) => (
                  <RecommendationCard key={rec.id} rec={rec} />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <section className="mt-14">
        <h2 className="mb-3 text-xl font-semibold">מה קורה בקהילה</h2>
        <Tabs defaultValue="topics">
          <TabsList>
            <TabsTrigger value="topics">נושאים חמים</TabsTrigger>
            <TabsTrigger value="people">חברים בולטים</TabsTrigger>
            <TabsTrigger value="threads">שיחות פתוחות</TabsTrigger>
          </TabsList>
          <TabsContent value="topics" className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 pt-3">
            {topics.map((t) => (
              <Card key={t.id} size="sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    {t.momentum === "rising" ? <TrendingUpIcon className="size-4 text-emerald-600" /> : t.momentum === "fading" ? <TrendingDownIcon className="size-4 text-rose-500" /> : <MinusIcon className="size-4 text-muted-foreground" />}
                    <span dir="auto">{t.name}</span>
                    <span className="ms-auto text-xs font-normal text-muted-foreground">{t.memberIds.length} חברים</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground leading-relaxed">
                  {t.summary}
                  {t.workshopPotential === "high" ? (
                    <Badge variant="secondary" className="mt-2">
                      מתאים לסדנה
                    </Badge>
                  ) : null}
                </CardContent>
              </Card>
            ))}
            {topics.length === 0 ? <p className="text-sm text-muted-foreground">אין נושאים עדיין.</p> : null}
          </TabsContent>
          <TabsContent value="people" className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 pt-3">
            {profiles.map((p) => (
              <Card key={p.memberId} size="sm">
                <CardHeader>
                  <CardTitle className="text-base" dir="auto">
                    {resolveName(p.memberId, real)}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-1.5">
                  <p className="text-muted-foreground leading-relaxed">{humanize(p.oneLiner, real)}</p>
                  {p.expertise.length ? (
                    <div className="flex flex-wrap gap-1">
                      {p.expertise.slice(0, 5).map((e) => (
                        <Badge key={e} variant="outline" className="font-normal">
                          {e}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  {p.roleSignals.length ? <p className="text-xs text-muted-foreground">{p.roleSignals.join(" · ")}</p> : null}
                </CardContent>
              </Card>
            ))}
            {profiles.length === 0 ? <p className="text-sm text-muted-foreground">אין פרופילים עדיין.</p> : null}
          </TabsContent>
          <TabsContent value="threads" className="grid gap-3 md:grid-cols-2 pt-3">
            {threads.map((th) => (
              <Card key={th.id} size="sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ArrowUpRightIcon className="size-4 text-muted-foreground" />
                    <span dir="auto">{humanize(th.title, real)}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground leading-relaxed">
                  <p>{humanize(th.summary, real)}</p>
                  <p className="mt-1 text-xs">
                    «{th.groupName}» · {th.kind === "unanswered" ? "ללא מענה" : th.kind === "stalled" ? "נעצר" : "אות לשיתוף פעולה"}
                    {th.ts ? ` · ${th.ts.toLocaleDateString("he-IL")}` : ""}
                  </p>
                </CardContent>
              </Card>
            ))}
            {threads.length === 0 ? <p className="text-sm text-muted-foreground">אין שיחות פתוחות.</p> : null}
          </TabsContent>
        </Tabs>
      </section>
    </AppShell>
  );
}

function Empty({ title, description, cta, href }: { title: string; description?: string; cta: string; href: string }) {
  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {description ? <p className="mt-2 text-muted-foreground">{description}</p> : null}
      <Button asChild className="mt-6">
        <Link href={href}>{cta}</Link>
      </Button>
    </div>
  );
}
