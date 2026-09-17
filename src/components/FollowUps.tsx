import { CheckCircle2Icon, CircleDashedIcon, CircleHelpIcon, CircleIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { FollowUp, FollowUpOutcome } from "@/lib/db/schema";
import { humanize } from "@/lib/display";
import { cn } from "@/lib/utils";

/**
 * "What happened since last week": Stage B's report on the previous run's recommendations,
 * grounded in database facts. Server component — names are resolved here, at render time.
 */

const OUTCOME: Record<FollowUpOutcome, { label: string; icon: React.ComponentType<{ className?: string }>; variant: "default" | "outline"; className?: string }> = {
  happened: { label: "קרה", icon: CheckCircle2Icon, variant: "default", className: "border-0 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" },
  partially: { label: "חלקית", icon: CircleDashedIcon, variant: "default", className: "border-0 bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" },
  not_yet: { label: "עדיין לא", icon: CircleIcon, variant: "default", className: "border-0 bg-muted text-muted-foreground" },
  unknown: { label: "לא ידוע", icon: CircleHelpIcon, variant: "outline" },
};

export function FollowUps({ run, real }: { run: { followUps: FollowUp[] | null }; real: boolean }) {
  const items = run.followUps ?? [];
  if (items.length === 0) return null;
  const happened = items.filter((f) => f.outcome === "happened").length;
  const partially = items.filter((f) => f.outcome === "partially").length;

  return (
    <section className="mb-10">
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="text-xl font-semibold">מה קרה מאז השבוע שעבר</h2>
        <span className="text-sm text-muted-foreground">
          {happened} מתוך {items.length} קרו{partially ? `, ${partially} חלקית` : ""}
        </span>
      </div>
      <ul className="divide-y rounded-xl border bg-card text-card-foreground">
        {items.map((f, i) => {
          const O = OUTCOME[f.outcome] ?? OUTCOME.unknown;
          const Icon = O.icon;
          return (
            <li key={i} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
              <Badge variant={O.variant} className={cn("gap-1 shrink-0 sm:mt-0.5", O.className)}>
                <Icon className="size-3" />
                {O.label}
              </Badge>
              <div className="min-w-0 flex-1">
                <p className="font-medium leading-snug" dir="auto">
                  {humanize(f.previous_title, real)}
                </p>
                {f.note ? (
                  <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground" dir="auto">
                    {humanize(f.note, real)}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
