"use client";

import { useState } from "react";
import { ChevronDownIcon, MessageCircleQuestionIcon, SendHorizontalIcon, SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { AskPerson, AskResponse } from "@/lib/askview";
import { useLocale, useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { CopyMessageButton } from "./CopyMessageButton";

const KEEP_LAST = 3;

interface QA {
  id: number;
  question: string;
  result: AskResponse;
}

/** Free-question box over the cached community model. Keeps the last few answers so a demo can ask several questions. */
export function AskCommunity({ profileCount }: { profileCount: number }) {
  const { t, dir } = useLocale();
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [history, setHistory] = useState<QA[]>([]);
  const example = t("ask.example");

  const ask = async () => {
    const q = question.trim();
    if (!q || pending) return;
    setPending(q);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<AskResponse> & { error?: string };
      if (!res.ok || typeof data.answer !== "string") {
        toast.error(data.error ?? t("ask.failed"));
        return;
      }
      setHistory((h) => [{ id: Date.now(), question: q, result: data as AskResponse }, ...h].slice(0, KEEP_LAST));
      setQuestion("");
    } catch {
      toast.error(t("ask.failedNetwork"));
    } finally {
      setPending(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <MessageCircleQuestionIcon className="size-5 text-primary" />
          {t("ask.title")}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{t("ask.subtitle")}</p>
      </CardHeader>
      <CardContent className="space-y-5">
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void ask();
          }}
        >
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={example}
            dir="auto"
            maxLength={500}
            disabled={pending !== null}
            className="h-10 flex-1 text-base md:text-sm"
            aria-label={t("ask.inputAria")}
          />
          <Button type="submit" disabled={pending !== null || !question.trim()} className="h-10 sm:w-auto">
            {/* The send arrow points along the reading direction. */}
            <SendHorizontalIcon className={cn("size-4", dir === "rtl" && "-scale-x-100")} />
            {t("ask.submit")}
          </Button>
        </form>

        {pending ? <Thinking question={pending} profileCount={profileCount} /> : null}

        {history.length ? (
          <ul className="space-y-4">
            {history.map((qa, i) => (
              <li key={qa.id}>
                <Answer qa={qa} latest={i === 0} />
              </li>
            ))}
          </ul>
        ) : !pending ? (
          <p className="text-xs text-muted-foreground">{t("ask.examplesLine", { a: example, b: t("ask.example2"), c: t("ask.example3") })}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Thinking({ question, profileCount }: { question: string; profileCount: number }) {
  const { t, dateLocale } = useLocale();
  return (
    <div className="rounded-lg border border-dashed bg-muted/30 p-4" role="status" aria-live="polite">
      <div className="mb-2 text-sm font-medium" dir="auto">
        {question}
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="relative flex size-2.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
          <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
        </span>
        <SparklesIcon className="size-4 animate-pulse text-primary" />
        <span>{t("ask.thinking", { n: profileCount.toLocaleString(dateLocale) })}</span>
      </div>
      <div className="mt-3 space-y-2">
        <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}

function Answer({ qa, latest }: { qa: QA; latest: boolean }) {
  const t = useT();
  const { result } = qa;
  const seconds = Math.max(1, Math.round(result.elapsedMs / 1000));
  return (
    <div className={cn("rounded-lg border p-4", latest ? "bg-background" : "bg-muted/20 opacity-90")}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm font-semibold" dir="auto">
          {qa.question}
        </div>
        <span className="text-xs text-muted-foreground" dir="ltr">
          {t("ask.costLine", { cost: result.costUsd.toFixed(2), seconds })}
        </span>
      </div>
      <p className="text-sm leading-relaxed whitespace-pre-wrap [unicode-bidi:plaintext]" dir="auto">
        {result.answer}
      </p>

      {result.people.length ? (
        <ul className="mt-4 space-y-3">
          {result.people.map((p) => (
            <Person key={p.id} person={p} />
          ))}
        </ul>
      ) : null}

      {result.suggestedMessage ? (
        <div className="mt-4">
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("ask.suggestedMessage")}</div>
          <Textarea readOnly value={result.suggestedMessage} dir="auto" className="min-h-28 text-sm leading-relaxed [unicode-bidi:plaintext]" />
          <div className="mt-2 flex gap-2">
            <CopyMessageButton text={result.suggestedMessage} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Person({ person }: { person: AskPerson }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const n = person.quotes.length;
  return (
    <li className="flex items-start gap-3">
      <Avatar className="mt-0.5 size-8">
        <AvatarFallback className="text-[11px]">{person.initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="font-medium text-sm" dir="auto">
          {person.short}
        </div>
        <div className="text-sm text-muted-foreground" dir="auto">
          {person.why}
        </div>
        {n ? (
          <>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
              aria-expanded={open}
            >
              <ChevronDownIcon className={cn("size-3.5 transition-transform", open && "rotate-180")} />
              {open ? t("ask.hideQuotes") : t("ask.showQuotes", { n })}
            </button>
            {open ? (
              <ul className="mt-2 space-y-2">
                {person.quotes.map((q) => (
                  <li key={q.messageId} className="rounded-lg border bg-muted/40 p-3 text-sm">
                    <div className="mb-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <span>«{q.groupName}»</span>
                      <span dir="ltr">· {q.date}</span>
                    </div>
                    <blockquote dir="auto" className="whitespace-pre-wrap leading-relaxed [unicode-bidi:plaintext]">
                      {q.text}
                    </blockquote>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </div>
    </li>
  );
}
