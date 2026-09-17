"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDaysIcon, CheckCircle2Icon, FlameIcon, Link2Icon, MegaphoneIcon, RefreshCwIcon, UsersIcon, XCircleIcon } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { RecommendationView } from "@/lib/viewmodel";
import { CopyMessageButton } from "./CopyMessageButton";

const TYPE_STYLE: Record<RecommendationView["type"], { icon: React.ComponentType<{ className?: string }>; className: string }> = {
  connect: { icon: Link2Icon, className: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200" },
  working_group: { icon: UsersIcon, className: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200" },
  event: { icon: CalendarDaysIcon, className: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" },
  initiative: { icon: FlameIcon, className: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200" },
  revive: { icon: RefreshCwIcon, className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" },
  ritual: { icon: MegaphoneIcon, className: "bg-stone-200 text-stone-800 dark:bg-stone-800 dark:text-stone-200" },
};

const CONFIDENCE_LABEL: Record<string, string> = { high: "ביטחון גבוה", medium: "ביטחון בינוני", low: "ביטחון נמוך" };

export function RecommendationCard({ rec }: { rec: RecommendationView }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(rec.status);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const T = TYPE_STYLE[rec.type];
  const done = status === "done";
  const dismissed = status === "dismissed";

  const setStatusRemote = (next: RecommendationView["status"]) => {
    startTransition(async () => {
      const res = await fetch(`/api/recommendations/${rec.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (res.ok) {
        setStatus(next);
        toast.success(next === "done" ? "סומן כבוצע" : next === "dismissed" ? "סומן כלא רלוונטי" : "עודכן");
        router.refresh();
      } else toast.error("העדכון נכשל");
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
              <span className="text-xs text-muted-foreground">{CONFIDENCE_LABEL[rec.confidence] ?? rec.confidence}</span>
              {rec.whereGroupName ? <span className="text-xs text-muted-foreground">· ב«{rec.whereGroupName}»</span> : null}
              {done ? (
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle2Icon className="size-3" /> בוצע
                </Badge>
              ) : null}
              {dismissed ? <Badge variant="outline">לא רלוונטי</Badge> : null}
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
              פרטים והוכחות
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-full data-[side=left]:sm:max-w-xl overflow-y-auto">
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
              <Section title="למה">
                <p className="text-sm leading-relaxed">{rec.why}</p>
              </Section>

              <Section title="מי מעורב">
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

              <Section title={`הוכחות מהשיחות (${rec.evidence.length})`}>
                <ul className="space-y-3">
                  {rec.evidence.map((e) => (
                    <li key={e.messageId} className="rounded-lg border bg-muted/40 p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground mb-1">
                        <span className="font-medium text-foreground" dir="auto">
                          {e.author}
                        </span>
                        <span>· «{e.groupName}»</span>
                        <span dir="ltr">· {e.date}</span>
                      </div>
                      <blockquote dir="auto" className="whitespace-pre-wrap leading-relaxed [unicode-bidi:plaintext]">
                        {e.text}
                      </blockquote>
                      {e.whyRelevant ? <div className="mt-1.5 text-xs text-muted-foreground">↳ {e.whyRelevant}</div> : null}
                    </li>
                  ))}
                </ul>
              </Section>

              <Section title="הצעד הבא">
                <p className="text-sm leading-relaxed">{rec.action}</p>
                {rec.extras ? (
                  <div className="mt-3 grid gap-2 text-sm">
                    {rec.extras.agenda.length ? (
                      <div>
                        <div className="font-medium mb-1">אג׳נדה / מבנה</div>
                        <ol className="list-decimal ps-5 space-y-0.5">
                          {rec.extras.agenda.map((a, i) => (
                            <li key={i}>{a}</li>
                          ))}
                        </ol>
                      </div>
                    ) : null}
                    {rec.extras.firstTask ? (
                      <div>
                        <span className="font-medium">משימה ראשונה: </span>
                        {rec.extras.firstTask}
                      </div>
                    ) : null}
                    {rec.extras.timeline ? (
                      <div>
                        <span className="font-medium">לוח זמנים: </span>
                        {rec.extras.timeline}
                      </div>
                    ) : null}
                    {rec.extras.expectedImpact ? (
                      <div>
                        <span className="font-medium">השפעה צפויה: </span>
                        {rec.extras.expectedImpact}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </Section>

              <Section title={rec.whereGroupName ? `הודעה מוכנה לשליחה ב«${rec.whereGroupName}»` : "הודעה מוכנה לשליחה"}>
                <Textarea readOnly value={rec.readyMessage} dir="auto" className="min-h-40 text-sm leading-relaxed [unicode-bidi:plaintext]" />
                <div className="mt-2 flex gap-2">
                  <CopyMessageButton text={rec.readyMessage} />
                </div>
              </Section>

              <Separator />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant={done ? "secondary" : "default"} disabled={pending} onClick={() => setStatusRemote(done ? "proposed" : "done")}>
                  <CheckCircle2Icon className="size-4" />
                  {done ? "בטל סימון" : "בוצע"}
                </Button>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => setStatusRemote(dismissed ? "proposed" : "dismissed")}>
                  <XCircleIcon className="size-4" />
                  {dismissed ? "החזר" : "לא רלוונטי"}
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
        <CopyMessageButton text={rec.readyMessage} />
        {!done && !dismissed ? (
          <Button size="sm" variant="ghost" className="ms-auto text-muted-foreground" disabled={pending} onClick={() => setStatusRemote("done")}>
            <CheckCircle2Icon className="size-4" /> בוצע
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
