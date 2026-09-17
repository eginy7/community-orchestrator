import { BrainIcon, SparklesIcon } from "lucide-react";
import { RecommendationCard } from "@/components/RecommendationCard";
import { Badge } from "@/components/ui/badge";
import { dateLocaleOf, getLocale, getT } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";
import type { MissedHook } from "@/lib/missed";
import type { RecommendationView } from "@/lib/viewmodel";

/**
 * "מה פספסתי" — hero frame for the rank-1 recommendation.
 * The hook line is computed from the cited messages (lib/missed.ts); the card underneath is the
 * regular RecommendationCard, so the details drawer, copy button and status actions are shared.
 * Server component.
 */

interface Props {
  view: RecommendationView;
  hook: MissedHook;
  className?: string;
}

export async function MissedCard({ view, hook, className }: Props) {
  const locale = await getLocale();
  const t = getT(locale);
  const fmtDate = (d: Date) => d.toLocaleDateString(dateLocaleOf(locale), { day: "numeric", month: "numeric", year: "2-digit" });
  const memory = [
    hook.firstSeen ? t("missed.firstSeen", { date: fmtDate(hook.firstSeen) }) : null,
    hook.lastSeen ? t("missed.lastSeen", { date: fmtDate(hook.lastSeen) }) : null,
    hook.groupCount > 0 ? (hook.groupCount === 1 ? t("missed.oneGroup") : t("missed.nGroups", { n: hook.groupCount })) : null,
    view.evidence.length > 0 ? t("missed.evidence", { n: view.evidence.length }) : null,
  ].filter((s): s is string => s !== null);

  return (
    <section aria-labelledby="missed-title" className={cn("rounded-2xl bg-linear-to-br from-violet-500/70 via-fuchsia-400/40 to-amber-400/70 p-px shadow-lg shadow-violet-500/10", className)}>
      <div className="rounded-[calc(1rem-1px)] bg-linear-to-br from-violet-500/10 via-card to-amber-400/10 p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
              <SparklesIcon className="size-3.5" />
              {t("missed.surprising")}
            </div>
            <h2 id="missed-title" className="text-2xl sm:text-3xl font-bold tracking-tight">
              {t("missed.title")}
            </h2>
            <p className="mt-2 max-w-3xl text-lg sm:text-xl font-medium leading-snug text-start [unicode-bidi:plaintext]">{hook.hook}</p>
          </div>
          {memory.length ? (
            <Badge variant="outline" className="h-auto gap-1.5 whitespace-normal border-violet-500/30 bg-background/70 px-2.5 py-1 text-xs font-normal text-muted-foreground">
              <BrainIcon className="size-3.5 text-violet-600 dark:text-violet-300" />
              <span>
                <span className="font-medium text-foreground">{t("missed.memory")}</span> · {memory.join(" · ")}
              </span>
            </Badge>
          ) : null}
        </div>
        <RecommendationCard rec={view} />
      </div>
    </section>
  );
}
