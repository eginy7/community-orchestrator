import { MinusIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react";
import { dateLocaleOf, getLocale, getT, type MessageKey } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";
import { getMomentum, type MomentumTrend } from "@/lib/momentum";

const TONE: Record<MomentumTrend, { icon: typeof TrendingUpIcon; labelKey: MessageKey; text: string; ring: string }> = {
  up: { icon: TrendingUpIcon, labelKey: "momentum.up", text: "text-emerald-600 dark:text-emerald-400", ring: "border-emerald-300/60 bg-emerald-50/60 dark:border-emerald-800/60 dark:bg-emerald-950/30" },
  flat: { icon: MinusIcon, labelKey: "momentum.flat", text: "text-muted-foreground", ring: "border-border bg-card/60" },
  down: { icon: TrendingDownIcon, labelKey: "momentum.down", text: "text-rose-600 dark:text-rose-400", ring: "border-rose-300/60 bg-rose-50/60 dark:border-rose-900/60 dark:bg-rose-950/30" },
};

function pctChange(current: number, previous: number): string | null {
  if (previous <= 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  return `${pct >= 0 ? "+" : "−"}${Math.abs(pct)}%`;
}

/** Compact header tile: 0..100 momentum score, trend arrow and a one-line breakdown. Server component. */
export async function MomentumScore({ communityId, className }: { communityId: number; className?: string }) {
  const locale = await getLocale();
  const t = getT(locale);
  const num = dateLocaleOf(locale);
  const m = getMomentum(communityId);
  const tone = TONE[m.trend];
  const Icon = tone.icon;
  const change = pctChange(m.parts.messagesPerWeek, m.parts.prevMessagesPerWeek);
  const answered = Math.round(m.parts.answeredRatio * 100);

  return (
    <div className={cn("flex items-center gap-3 rounded-xl border px-4 py-2.5", tone.ring, className)} title={t("momentum.changeTitle", { delta: `${m.delta >= 0 ? "+" : ""}${m.delta}` })}>
      <div className={cn("flex items-baseline gap-1.5 tabular-nums", tone.text)}>
        <span className="text-3xl font-bold leading-none">{m.score}</span>
        <Icon className="size-5 self-center" aria-label={t(tone.labelKey)} />
      </div>
      <div className="min-w-0 text-start">
        <div className="text-sm font-medium leading-tight">{t("momentum.title")}</div>
        <div className="truncate text-xs text-muted-foreground">
          {t("momentum.line", {
            messages: m.parts.messagesPerWeek.toLocaleString(num),
            change: change ? ` (${change})` : "",
            members: m.parts.activeMembers.toLocaleString(num),
            answered,
          })}
        </div>
      </div>
    </div>
  );
}
