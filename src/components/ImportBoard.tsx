"use client";

import { CheckCircle2Icon, FileSearchIcon, MegaphoneIcon, ShieldCheckIcon, SparklesIcon, UsersRoundIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

/**
 * The "community is forming" board shown while exports are being imported.
 * Every detected group pops in as a bubble; files still in flight show a shimmering placeholder
 * with the current pipeline step. Pure CSS animation (tw-animate-css), no extra deps.
 */

export const IMPORT_STEPS = [
  { label: "קורא את הקובץ", icon: FileSearchIcon },
  { label: "מזהה את הקבוצה", icon: UsersRoundIcon },
  { label: "מאנונם שמות וטלפונים", icon: ShieldCheckIcon },
  { label: "שומר הודעות", icon: CheckCircle2Icon },
] as const;

export interface BoardGroup {
  key: string;
  name: string;
  kind: string;
  kindLabel: string;
  messageCount: number;
  memberCount: number;
  /** true when this bubble just arrived in this session (animate in) */
  fresh: boolean;
}

export interface BoardPending {
  key: string;
  name: string;
  step: number;
}

interface Props {
  communityName: string;
  groups: BoardGroup[];
  pending: BoardPending[];
  failed: number;
  totalFiles: number;
  doneFiles: number;
}

export function ImportBoard({ communityName, groups, pending, failed, totalFiles, doneFiles }: Props) {
  const importing = pending.length > 0;
  const pct = totalFiles ? Math.round(((doneFiles + pending.reduce((s, p) => s + p.step / IMPORT_STEPS.length, 0)) / totalFiles) * 100) : 0;
  const totalMessages = groups.reduce((s, g) => s + g.messageCount, 0);
  const totalMembers = groups.reduce((s, g) => s + g.memberCount, 0);

  return (
    <div className="rounded-2xl border bg-linear-to-b from-primary/5 to-transparent p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className={cn("flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary", importing && "animate-pulse")}>
          <SparklesIcon className={cn("size-5", importing && "animate-spin [animation-duration:3s]")} />
        </div>
        <div className="flex-1 min-w-52">
          <div className="text-lg font-semibold">
            {importing ? (
              <span>
                Claude מכיר את «{communityName}»<AnimatedDots />
              </span>
            ) : failed && !groups.length ? (
              "לא הצלחנו לקרוא את הקבצים"
            ) : (
              `«${communityName}» מוכנה לניתוח`
            )}
          </div>
          <div className="text-sm text-muted-foreground tabular-nums">
            {groups.length} קבוצות · {totalMessages.toLocaleString("he-IL")} הודעות · {totalMembers.toLocaleString("he-IL")} כותבים
            {failed ? ` · ${failed} קבצים נכשלו` : ""}
          </div>
        </div>
        {totalFiles > 0 ? (
          <div className="w-full sm:w-56">
            <Progress value={pct} className="h-2" />
            <div className="mt-1 text-end text-xs text-muted-foreground tabular-nums" dir="ltr">
              {doneFiles}/{totalFiles}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        {groups.map((g, i) => (
          <div
            key={g.key}
            style={g.fresh ? { animationDelay: `${Math.min(i, 6) * 60}ms` } : undefined}
            className={cn(
              "flex items-center gap-3 rounded-full border bg-card ps-1.5 pe-4 py-1.5 shadow-sm",
              g.fresh && "animate-in fade-in zoom-in-50 duration-500 fill-mode-both",
            )}
          >
            <div className={cn("flex size-9 items-center justify-center rounded-full text-sm font-bold", g.kind === "announcement" ? "bg-amber-100 text-amber-800" : "bg-primary/10 text-primary")}>
              {g.kind === "announcement" ? <MegaphoneIcon className="size-4" /> : g.name.slice(0, 1)}
            </div>
            <div className="leading-tight">
              <div className="text-sm font-medium" dir="auto">
                {g.name}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
                <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-normal">
                  {g.kindLabel}
                </Badge>
                {g.messageCount.toLocaleString("he-IL")} הודעות · {g.memberCount}
              </div>
            </div>
          </div>
        ))}

        {pending.map((p) => {
          const Step = IMPORT_STEPS[Math.min(p.step, IMPORT_STEPS.length - 1)];
          return (
            <div key={p.key} className="flex items-center gap-3 rounded-full border border-dashed border-primary/40 bg-primary/5 ps-1.5 pe-4 py-1.5 animate-in fade-in duration-300">
              <div className="relative flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                <span className="absolute inset-0 rounded-full bg-primary/20 animate-ping [animation-duration:1.6s]" />
                <Step.icon className="relative size-4" />
              </div>
              <div className="leading-tight">
                <div className="text-sm font-medium" dir="auto">
                  {p.name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {Step.label}
                  <AnimatedDots />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {importing ? (
        <ol className="mt-5 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
          {IMPORT_STEPS.map((s, i) => {
            const active = pending.some((p) => p.step === i);
            return (
              <li key={s.label} className={cn("flex items-center gap-1.5 transition-colors", active && "text-primary font-medium")}>
                <s.icon className="size-3.5" /> {s.label}
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}

function AnimatedDots() {
  return (
    <span className="inline-flex w-5 justify-start" aria-hidden>
      <span className="animate-bounce [animation-delay:0ms]">.</span>
      <span className="animate-bounce [animation-delay:150ms]">.</span>
      <span className="animate-bounce [animation-delay:300ms]">.</span>
    </span>
  );
}
