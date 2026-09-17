import Link from "next/link";
import { ArrowUpRightIcon, MinusIcon, TrendingDownIcon, TrendingUpIcon, UploadIcon } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AskCommunity } from "@/components/AskCommunity";
import { FollowUps } from "@/components/FollowUps";
import { MissedCard } from "@/components/MissedCard";
import { NewsBriefs } from "@/components/NewsBriefs";
import { MomentumScore } from "@/components/MomentumScore";
import { RecommendationCard } from "@/components/RecommendationCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { humanize, resolveName, showRealNames } from "@/lib/display";
import type { RecommendationTier } from "@/lib/db/schema";
import { dateLocaleOf, getLocale, getT } from "@/lib/i18n/server";
import { pickMissedHero } from "@/lib/missed";
import { getCommunity, getGroups, getGroupStats, getLatestRun, getMessagesByIds, getOpenThreads, getProfileCount, getRecommendations, getRunSummary, getTopProfiles, getTopics, getWeeklyReminder } from "@/lib/queries";
import { formatRunSummary } from "@/lib/run-summary";
import { tierHint, tierLabel, toRecommendationView } from "@/lib/viewmodel";

export const dynamic = "force-dynamic";

const TIERS: RecommendationTier[] = ["do_now", "organize", "plan"];

export default async function HomePage() {
  const community = getCommunity();
  const real = await showRealNames();
  const locale = await getLocale();
  const t = getT(locale);
  const dateLocale = dateLocaleOf(locale);
  if (!community) {
    return (
      <AppShell realNames={real}>
        <Empty title={t("home.noCommunityTitle")} description={t("home.noCommunityBody")} cta={t("home.uploadCta")} href="/upload" />
      </AppShell>
    );
  }
  const run = getLatestRun(community.id, "done");
  const pendingRun = run ? null : getLatestRun(community.id);
  if (!run) {
    return (
      <AppShell communityName={community.name} realNames={real}>
        {pendingRun && (pendingRun.status === "running" || pendingRun.status === "queued") ? (
          <Empty title={t("home.runningTitle")} cta={t("home.runningCta")} href={`/analysis/${pendingRun.id}`} />
        ) : (
          <Empty title={t("home.noRunTitle")} description={t("home.noRunBody")} cta={t("home.noRunCta")} href="/upload" />
        )}
      </AppShell>
    );
  }

  const groups = getGroups(community.id);
  const groupsById = new Map(groups.map((g) => [g.id, g]));
  const recs = getRecommendations(run.id);
  const messageIds = [...new Set(recs.flatMap((r) => r.evidence.map((e) => e.message_id)))];
  const messagesById = getMessagesByIds(messageIds);
  const views = recs.map((r) => toRecommendationView(r, real, groupsById, messagesById, locale));
  const missed = pickMissedHero(recs, views, messagesById, real, locale);
  const profileCount = getProfileCount(run.id);

  const stats = getGroupStats(community.id);
  const totalMessages = stats.reduce((s, g) => s + g.messageCount, 0);
  const totalMembers = stats.reduce((s, g) => s + g.memberCount, 0);
  const topics = getTopics(run.id);
  const profiles = getTopProfiles(run.id);
  const threads = getOpenThreads(run.id);
  const openCount = views.filter((v) => v.status === "proposed" || v.status === "accepted").length;
  const reminder = getWeeklyReminder(community.id);
  const runSummary = getRunSummary(run.id);

  return (
    <AppShell communityName={community.name} realNames={real} reminder={reminder}>
      <section className="mb-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground mb-1">
              {run.finishedAt ? t("home.analysisFrom", { date: run.finishedAt.toLocaleDateString(dateLocale) }) : ""} ·{" "}
              {t("home.statsLine", { groups: groups.length, members: totalMembers.toLocaleString(dateLocale), messages: totalMessages.toLocaleString(dateLocale) })}
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{t("home.title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{formatRunSummary(runSummary, locale)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <MomentumScore communityId={community.id} className="max-w-full" />
            <Button asChild variant="outline">
              <Link href="/upload">
                <UploadIcon className="size-4" /> {t("home.reanalyze")}
              </Link>
            </Button>
          </div>
        </div>
        {run.communityPulse ? <p className="mt-4 max-w-3xl text-lg leading-relaxed text-muted-foreground">{humanize(run.communityPulse, real)}</p> : null}
        <p className="mt-2 text-sm text-muted-foreground">{t("home.pendingActions", { open: openCount, total: views.length })}</p>
      </section>

      {missed ? <MissedCard view={missed.view} hook={missed.hook} className="mb-10" /> : null}

      <FollowUps run={run} real={real} />

      <NewsBriefs communityId={community.id} real={real} />

      <section className="mb-10">
        <AskCommunity profileCount={profileCount} />
      </section>

      <div className="space-y-10">
        {TIERS.map((tier) => {
          const items = views.filter((v) => v.tier === tier && v.id !== missed?.view.id);
          if (items.length === 0) return null;
          return (
            <section key={tier}>
              <div className="mb-3 flex items-baseline gap-3">
                <h2 className="text-xl font-semibold">{tierLabel(tier, t)}</h2>
                <span className="text-sm text-muted-foreground">{tierHint(tier, t)}</span>
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
        <h2 className="mb-3 text-xl font-semibold">{t("home.whatsHappening")}</h2>
        <Tabs defaultValue="topics">
          <TabsList>
            <TabsTrigger value="topics">{t("home.tabTopics")}</TabsTrigger>
            <TabsTrigger value="people">{t("home.tabPeople")}</TabsTrigger>
            <TabsTrigger value="threads">{t("home.tabThreads")}</TabsTrigger>
          </TabsList>
          <TabsContent value="topics" className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 pt-3">
            {topics.map((topic) => (
              <Card key={topic.id} size="sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    {topic.momentum === "rising" ? <TrendingUpIcon className="size-4 text-emerald-600" /> : topic.momentum === "fading" ? <TrendingDownIcon className="size-4 text-rose-500" /> : <MinusIcon className="size-4 text-muted-foreground" />}
                    <span dir="auto">{topic.name}</span>
                    <span className="ms-auto text-xs font-normal text-muted-foreground">{t("home.topicMembers", { n: topic.memberIds.length })}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground leading-relaxed">
                  {topic.summary}
                  {topic.workshopPotential === "high" ? (
                    <Badge variant="secondary" className="mt-2">
                      {t("home.workshopFit")}
                    </Badge>
                  ) : null}
                </CardContent>
              </Card>
            ))}
            {topics.length === 0 ? <p className="text-sm text-muted-foreground">{t("home.noTopics")}</p> : null}
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
            {profiles.length === 0 ? <p className="text-sm text-muted-foreground">{t("home.noProfiles")}</p> : null}
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
                    «{th.groupName}» · {th.kind === "unanswered" ? t("home.threadUnanswered") : th.kind === "stalled" ? t("home.threadStalled") : t("home.threadCollab")}
                    {th.ts ? ` · ${th.ts.toLocaleDateString(dateLocale)}` : ""}
                  </p>
                </CardContent>
              </Card>
            ))}
            {threads.length === 0 ? <p className="text-sm text-muted-foreground">{t("home.noThreads")}</p> : null}
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
