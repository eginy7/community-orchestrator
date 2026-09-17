"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDaysIcon,
  CalendarPlusIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  FlameIcon,
  Link2Icon,
  MegaphoneIcon,
  RefreshCwIcon,
  UsersIcon,
  XCircleIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { buildEventDescription, buildKickoffDraft, deriveGroupName } from "@/lib/drafts";
import { useLocale } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/messages";
import { buildIcs, slugify } from "@/lib/ics";
import { evidenceSummary, gapCaption, relativeLabel } from "@/lib/timeline";
import { cn } from "@/lib/utils";
import type { EvidenceView, RecommendationView } from "@/lib/viewmodel";
import { CopyMessageButton } from "./CopyMessageButton";

const TYPE_STYLE: Record<RecommendationView["type"], { icon: React.ComponentType<{ className?: string }>; className: string }> = {
  connect: { icon: Link2Icon, className: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200" },
  working_group: { icon: UsersIcon, className: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200" },
  event: { icon: CalendarDaysIcon, className: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" },
  initiative: { icon: FlameIcon, className: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200" },
  revive: { icon: RefreshCwIcon, className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" },
  ritual: { icon: MegaphoneIcon, className: "bg-stone-200 text-stone-800 dark:bg-stone-800 dark:text-stone-200" },
};

const CONFIDENCE_KEY: Record<string, MessageKey> = { high: "card.confidenceHigh", medium: "card.confidenceMedium", low: "card.confidenceLow" };

export function RecommendationCard({ rec }: { rec: RecommendationView }) {
  const { t, dir } = useLocale();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(rec.status);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const T = TYPE_STYLE[rec.type];
  const done = status === "done";
  const dismissed = status === "dismissed";
  // The drawer slides in from the end side of the reading direction (left in RTL, right in LTR).
  const sheetSide = dir === "rtl" ? "left" : "right";
  // Kickoff packs make sense wherever the manager is about to open something new.
  const showKickoff = rec.type === "working_group" || rec.type === "event" || rec.type === "initiative";
  // A calendar entry needs a date to anchor to: events always, working groups only when the plan names a timeline.
  const showCalendar = rec.type === "event" || (rec.type === "working_group" && Boolean(rec.extras?.timeline));
  const kickoffDraft = useMemo(() => (showKickoff ? buildKickoffDraft(rec) : ""), [rec, showKickoff]);
  const confidence = CONFIDENCE_KEY[rec.confidence];

  const downloadIcs = () => {
    try {
      const ics = buildIcs({ id: rec.id, title: rec.title, description: buildEventDescription(rec) });
      const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slugify(rec.title, `rec-${rec.id}`)}.ics`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(t("card.icsCreated"));
    } catch {
      toast.error(t("card.icsFailed"));
    }
  };

  const setStatusRemote = (next: RecommendationView["status"]) => {
    startTransition(async () => {
      const res = await fetch(`/api/recommendations/${rec.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (res.ok) {
        setStatus(next);
        toast.success(next === "done" ? t("card.toastDone") : next === "dismissed" ? t("card.toastDismissed") : t("card.toastUpdated"));
        router.refresh();
      } else toast.error(t("card.toastFailed"));
    });
  };

  return (
    <Card className={cn("relative transition-opacity", (done || dismissed) && "opacity-60")}>
      <CardHeader className="pb-2">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold tabular-nums">{rec.rank}</div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <Badge className={cn("gap-1 border-0", T.className)}>
                <T.icon className="size-3.5" />
                {rec.typeLabel}
              </Badge>
              <span className="text-xs text-muted-foreground">{confidence ? t(confidence) : rec.confidence}</span>
              {rec.whereGroupName ? <span className="text-xs text-muted-foreground">{t("card.inGroup", { name: rec.whereGroupName })}</span> : null}
              {done ? (
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle2Icon className="size-3" /> {t("card.done")}
                </Badge>
              ) : null}
              {dismissed ? <Badge variant="outline">{t("card.dismissed")}</Badge> : null}
            </div>
            <h3 className="text-lg font-semibold leading-snug">{rec.title}</h3>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground leading-relaxed">{rec.whyNow}</p>
        {rec.people.length ? (
          <div className="flex flex-wrap items-center gap-2">
            {rec.people.map((p) => (
              <Tooltip key={p.id}>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1.5 rounded-full border bg-background ps-1 pe-3 py-0.5 text-sm">
                    <Avatar className="size-6">
                      <AvatarFallback className="text-[10px]">{p.initials}</AvatarFallback>
                    </Avatar>
                    <span dir="auto">{p.short}</span>
                    <span className="text-xs text-muted-foreground">· {p.role}</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-start">{p.reason}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        ) : null}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm">
              {t("card.details")}
            </Button>
          </SheetTrigger>
          <SheetContent side={sheetSide} className="w-full data-[side=left]:sm:max-w-xl data-[side=right]:sm:max-w-xl overflow-y-auto">
            <SheetHeader className="text-start">
              <div className="flex items-center gap-2">
                <Badge className={cn("gap-1 border-0", T.className)}>
                  <T.icon className="size-3.5" />
                  {rec.typeLabel}
                </Badge>
              </div>
              <SheetTitle className="text-xl leading-snug">{rec.title}</SheetTitle>
              <SheetDescription className="text-start">{rec.whyNow}</SheetDescription>
            </SheetHeader>

            <div className="space-y-6 px-4 pb-8">
              <Section title={t("card.sectionWhy")}>
                <p className="text-sm leading-relaxed">{rec.why}</p>
              </Section>

              <Section title={t("card.sectionWho")}>
                <ul className="space-y-2">
                  {rec.people.map((p) => (
                    <li key={p.id} className="flex items-start gap-2 text-sm">
                      <Avatar className="size-7 mt-0.5">
                        <AvatarFallback className="text-[11px]">{p.initials}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium" dir="auto">
                          {p.name} <span className="text-xs text-muted-foreground font-normal">· {p.role}</span>
                        </div>
                        <div className="text-muted-foreground">{p.reason}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </Section>

              <Section title={t("card.sectionEvidence", { n: rec.evidence.length })}>
                <EvidenceTimeline items={rec.evidence} />
              </Section>

              <Section title={t("card.sectionNext")}>
                <p className="text-sm leading-relaxed">{rec.action}</p>
                {rec.extras ? (
                  <div className="mt-3 grid gap-2 text-sm">
                    {rec.extras.agenda.length ? (
                      <div>
                        <div className="font-medium mb-1">{t("card.agenda")}</div>
                        <ol className="list-decimal ps-5 space-y-0.5">
                          {rec.extras.agenda.map((a, i) => (
                            <li key={i}>{a}</li>
                          ))}
                        </ol>
                      </div>
                    ) : null}
                    {rec.extras.firstTask ? (
                      <div>
                        <span className="font-medium">{t("card.firstTask")}</span>
                        {rec.extras.firstTask}
                      </div>
                    ) : null}
                    {rec.extras.timeline ? (
                      <div>
                        <span className="font-medium">{t("card.timeline")}</span>
                        {rec.extras.timeline}
                      </div>
                    ) : null}
                    {rec.extras.expectedImpact ? (
                      <div>
                        <span className="font-medium">{t("card.impact")}</span>
                        {rec.extras.expectedImpact}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </Section>

              <Section title={rec.whereGroupName ? t("card.readyMessageIn", { name: rec.whereGroupName }) : t("card.readyMessage")}>
                <Textarea readOnly value={rec.readyMessage} dir="auto" className="min-h-40 text-sm leading-relaxed [unicode-bidi:plaintext]" />
                <div className="mt-2 flex flex-wrap gap-2">
                  <CopyMessageButton text={rec.readyMessage} />
                  {showCalendar ? (
                    <Button type="button" size="sm" variant="outline" onClick={downloadIcs}>
                      <CalendarPlusIcon className="size-4" />
                      {t("card.addToCalendarIcs")}
                    </Button>
                  ) : null}
                </div>
              </Section>

              {showKickoff ? (
                <Section title={t("card.kickoffTitle")}>
                  <details className="group rounded-lg border bg-muted/30">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm [&::-webkit-details-marker]:hidden">
                      <span>
                        <span className="font-medium" dir="auto">
                          {deriveGroupName(rec.title)}
                        </span>
                        <span className="text-muted-foreground">{t("card.kickoffHint")}</span>
                      </span>
                      <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="border-t px-3 pb-3 pt-2">
                      <Textarea readOnly value={kickoffDraft} dir="auto" className="min-h-56 text-sm leading-relaxed [unicode-bidi:plaintext]" />
                    </div>
                  </details>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <CopyMessageButton text={kickoffDraft} label={t("card.copyKickoff")} variant="secondary" />
                  </div>
                </Section>
              ) : null}

              <Separator />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant={done ? "secondary" : "default"} disabled={pending} onClick={() => setStatusRemote(done ? "proposed" : "done")}>
                  <CheckCircle2Icon className="size-4" />
                  {done ? t("card.unmark") : t("card.done")}
                </Button>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => setStatusRemote(dismissed ? "proposed" : "dismissed")}>
                  <XCircleIcon className="size-4" />
                  {dismissed ? t("card.restore") : t("card.dismissed")}
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
        <CopyMessageButton text={rec.readyMessage} />
        {showCalendar ? (
          <Button type="button" size="sm" variant="outline" onClick={downloadIcs}>
            <CalendarPlusIcon className="size-4" />
            {t("card.addToCalendar")}
          </Button>
        ) : null}
        {!done && !dismissed ? (
          <Button size="sm" variant="ghost" className="ms-auto text-muted-foreground" disabled={pending} onClick={() => setStatusRemote("done")}>
            <CheckCircle2Icon className="size-4" /> {t("card.done")}
          </Button>
        ) : null}
      </CardFooter>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      {children}
    </section>
  );
}

/**
 * Evidence as a vertical timeline, oldest at the top. The line sits on the start side (right in RTL);
 * a dot per quote, a caption for long gaps, and a one-line "memory" summary above.
 */
function EvidenceTimeline({ items }: { items: EvidenceView[] }) {
  const { t, locale } = useLocale();
  // Sheet content mounts only when opened, so this runs on the client; a lazy initializer keeps it stable across re-renders.
  const [now] = useState(() => Date.now());
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{t("card.noEvidence")}</p>;

  return (
    <div>
      <p className="mb-3 text-sm font-medium">{evidenceSummary(items, locale)}</p>
      <ol className="relative ms-1.5 border-s-2 border-border ps-5">
        {items.map((e, i) => {
          const caption = i > 0 ? gapCaption(items[i - 1].ts, e.ts, 14, locale) : null;
          return (
            <li key={e.messageId} className="relative pb-5 last:pb-0">
              {caption ? <div className="-mt-1 mb-3 text-xs text-muted-foreground">{caption}</div> : null}
              <span aria-hidden className="absolute top-1 -start-[27px] size-3 rounded-full border-2 border-background bg-primary shadow-sm" />
              <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                <span dir="ltr" className="font-medium tabular-nums text-foreground">
                  {e.date}
                </span>
                <span>· {relativeLabel(e.ts, now, locale)}</span>
                <span>· «{e.groupName}»</span>
              </div>
              <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                <div className="mb-1 text-xs font-medium" dir="auto">
                  {e.author}
                </div>
                <blockquote dir="auto" className="whitespace-pre-wrap leading-relaxed [unicode-bidi:plaintext]">
                  {e.text}
                </blockquote>
                {e.whyRelevant ? <div className="mt-1.5 text-xs text-muted-foreground">↳ {e.whyRelevant}</div> : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
