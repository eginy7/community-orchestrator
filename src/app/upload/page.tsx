import { AppShell } from "@/components/AppShell";
import { UploadPanel } from "@/components/UploadPanel";
import { showRealNames } from "@/lib/display";
import { getLocale, getT } from "@/lib/i18n/server";
import { getCommunity, getCorpusEstimate, getGroupStats, getLatestRun } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  const community = getCommunity();
  const real = await showRealNames();
  const t = getT(await getLocale());
  const stats = community ? getGroupStats(community.id) : [];
  const latest = community ? getLatestRun(community.id) : null;
  const completed = community ? getLatestRun(community.id, "done") : null;
  const firstTime = !community || stats.every((g) => g.messageCount === 0);
  const estimate = community ? getCorpusEstimate(community.id) : null;

  return (
    <AppShell communityName={community?.name} realNames={real}>
      <div className="mx-auto max-w-4xl">
        {firstTime ? (
          <>
            <p className="text-sm font-medium text-primary">{t("upload.firstStep")}</p>
            <h1 className="mt-1 text-3xl sm:text-4xl font-bold tracking-tight">{t("upload.heroTitle")}</h1>
            <p className="mt-3 max-w-2xl text-lg text-muted-foreground leading-relaxed">{t("upload.heroBody")}</p>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-bold tracking-tight">{t("upload.title")}</h1>
            <p className="mt-2 text-muted-foreground">{t("upload.subtitle")}</p>
          </>
        )}
        <UploadPanel
          firstTime={firstTime}
          communityName={community?.name ?? null}
          groups={stats.map((g) => ({
            id: g.id,
            name: g.name,
            kind: g.kind,
            messageCount: g.messageCount,
            memberCount: g.memberCount,
            firstTs: g.firstTs,
            lastTs: g.lastTs,
          }))}
          latestRun={latest ? { id: latest.id, status: latest.status } : null}
          hasCompletedRun={!!completed}
          estimate={estimate}
        />
      </div>
    </AppShell>
  );
}
