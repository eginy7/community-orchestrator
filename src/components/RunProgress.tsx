"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2Icon, CircleDashedIcon, Loader2Icon, RotateCcwIcon, XCircleIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { RunProgress as RunProgressData } from "@/lib/db/schema";

interface ChunkState {
  id: number;
  seq: number;
  status: "pending" | "running" | "done" | "failed";
  tokenEstimate: number;
  messageCount: number;
  groupName: string;
  error: string | null;
}

interface RunState {
  chunks: ChunkState[];
  id: number;
  status: "queued" | "running" | "done" | "failed";
  stage: "A" | "merge" | "B";
  active: boolean;
  progress: RunProgressData | null;
  error: string | null;
}

const STAGE_LABEL = { A: "שלב א׳ · קריאת הקבוצות", merge: "מיזוג המודל", B: "שלב ב׳ · בניית התוכנית" } as const;

export function RunProgress({ runId }: { runId: number }) {
  const router = useRouter();
  const [state, setState] = useState<RunState | null>(null);
  const [resuming, setResuming] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [runningSince, setRunningSince] = useState<Record<number, number>>({});
  const [stageBSince, setStageBSince] = useState<number | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch(`/api/runs/${runId}`, { cache: "no-store" });
        if (res.ok && alive) {
          const json = (await res.json()) as RunState;
          setState(json);
          setStageBSince((prev) => (json.status === "running" && json.stage === "B" ? (prev ?? Date.now()) : null));
          setRunningSince((prev) => {
            const next: Record<number, number> = {};
            for (const c of json.chunks ?? []) if (c.status === "running") next[c.id] = prev[c.id] ?? Date.now();
            return next;
          });
          if (json.status === "done") {
            setTimeout(() => router.push("/home"), 1200);
            return;
          }
        }
      } catch {
        /* keep polling */
      }
      if (alive) setTimeout(tick, 2000);
    };
    tick();
    return () => {
      alive = false;
    };
  }, [runId, router]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [state?.progress?.log.length]);

  // Track when each chunk was first seen running so we can show elapsed time (a big chunk takes 5–10 min).
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);


  const p = state?.progress;
  const pct =
    state?.status === "done" ? 100 : !p ? 0 : p.stage === "A" ? (p.chunksTotal ? Math.round((p.chunksDone / p.chunksTotal) * 80) : 5) : p.stage === "merge" ? 85 : 92;

  const resume = async () => {
    setResuming(true);
    await fetch("/api/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ resumeRunId: runId }) });
    setResuming(false);
  };

  return (
    <div className="mt-8 space-y-6">
      <Card>
        <CardContent className="space-y-4 pt-2">
          <div className="flex items-center gap-3">
            {state?.status === "done" ? (
              <CheckCircle2Icon className="size-6 text-emerald-600" />
            ) : state?.status === "failed" ? (
              <XCircleIcon className="size-6 text-destructive" />
            ) : (
              <Loader2Icon className="size-6 animate-spin text-primary" />
            )}
            <div className="flex-1">
              <div className="font-medium">
                {state?.status === "done" ? "הניתוח הסתיים — עוברים לדף הבית" : state?.status === "failed" ? "הניתוח נעצר" : state ? STAGE_LABEL[state.stage] : "מתחבר…"}
              </div>
              {p && p.stage === "A" && p.chunksTotal ? (
                <div className="text-sm text-muted-foreground">
                  {p.chunksDone}/{p.chunksTotal} צ׳אנקים{p.currentGroup ? ` · עכשיו: «${p.currentGroup}»` : ""}
                </div>
              ) : null}
              {state?.status === "running" && state.stage === "B" ? (
                <div className="text-sm text-muted-foreground">
                  קריאה אחת על כל מודל הקהילה. לוקח 5–10 דקות
                  {stageBSince ? (
                    <span dir="ltr" className="tabular-nums">
                      {" "}
                      · {Math.floor((now - stageBSince) / 60000)}:{String(Math.floor(((now - stageBSince) % 60000) / 1000)).padStart(2, "0")}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
            {p ? (
              <div className="text-end text-sm tabular-nums text-muted-foreground" dir="ltr">
                <div>{(p.tokensIn + p.cacheRead).toLocaleString()} in · {p.tokensOut.toLocaleString()} out</div>
                <div>~${p.costUsd.toFixed(2)}</div>
              </div>
            ) : null}
          </div>
          <Progress value={pct} />
          {state?.status === "failed" ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <span className="flex-1 text-destructive">{state.error}</span>
              <Button size="sm" variant="outline" onClick={resume} disabled={resuming || state.active}>
                <RotateCcwIcon className="size-4" /> המשך מאיפה שנעצר
              </Button>
            </div>
          ) : null}
          {state?.status === "done" && state.chunks?.some((c) => c.status === "failed") ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm">
              <span className="flex-1 text-muted-foreground">הניתוח הסתיים, אבל {state.chunks.filter((c) => c.status === "failed").length} צ׳אנקים לא נקראו. אפשר להשלים אותם ולבנות את התוכנית מחדש.</span>
              <Button size="sm" variant="outline" onClick={resume} disabled={resuming || state.active}>
                <RotateCcwIcon className="size-4" /> השלם צ׳אנקים חסרים
              </Button>
            </div>
          ) : null}
          {state?.status === "queued" && !state.active ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm">
              <span className="flex-1 text-muted-foreground">הריצה לא פעילה (אולי השרת אותחל).</span>
              <Button size="sm" variant="outline" onClick={resume} disabled={resuming}>
                <RotateCcwIcon className="size-4" /> הפעל
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {state?.chunks?.length ? (
        <Card>
          <CardContent className="pt-2">
            <div className="mb-2 flex items-baseline justify-between">
              <div className="text-sm font-medium">הצ׳אנקים</div>
              <div className="text-xs text-muted-foreground">צ׳אנק גדול (100K+ טוקנים) לוקח 5–10 דקות. שניים רצים במקביל.</div>
            </div>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {state.chunks.map((c) => {
                const since = runningSince[c.id];
                const elapsed = since ? Math.floor((now - since) / 1000) : 0;
                return (
                  <li key={c.id} className={cn("flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm", c.status === "running" && "border-primary/40 bg-primary/5", c.status === "failed" && "border-destructive/40")}>
                    {c.status === "done" ? (
                      <CheckCircle2Icon className="size-4 shrink-0 text-emerald-600" />
                    ) : c.status === "running" ? (
                      <Loader2Icon className="size-4 shrink-0 animate-spin text-primary" />
                    ) : c.status === "failed" ? (
                      <XCircleIcon className="size-4 shrink-0 text-destructive" />
                    ) : (
                      <CircleDashedIcon className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate" dir="auto">
                      {c.groupName}
                      {state.chunks.filter((x) => x.groupName === c.groupName).length > 1 ? ` · ${c.seq + 1}` : ""}
                    </span>
                    <span className="ms-auto shrink-0 text-xs tabular-nums text-muted-foreground" dir="ltr">
                      {c.status === "running" && since ? `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")} · ` : ""}
                      {Math.round(c.tokenEstimate / 1000)}K
                    </span>
                  </li>
                );
              })}
            </ul>
            {state.chunks.some((c) => c.status === "failed") && state.status === "running" ? (
              <p className="mt-2 text-xs text-muted-foreground">צ׳אנק שנכשל לא עוצר את הריצה. בסיום אפשר ללחוץ «המשך» כדי להשלים אותו.</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div ref={logRef} className="max-h-80 overflow-y-auto rounded-lg border bg-muted/40 p-4 font-mono text-xs leading-relaxed" dir="rtl">
        {p?.log.length ? p.log.map((line, i) => <div key={i}>{line}</div>) : <span className="text-muted-foreground">ממתין ללוג…</span>}
      </div>
    </div>
  );
}
