import { ChevronDownIcon, ExternalLinkIcon, MegaphoneIcon, NewspaperIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { humanize } from "@/lib/display";
import { dateLocaleOf, getLocale } from "@/lib/i18n/server";
import { newsT } from "@/lib/i18n/news";
import { getLatestNewsBrief } from "@/lib/news";
import { toNewsBriefView, type NewsItemView } from "@/lib/newsview";
import { getGroups } from "@/lib/queries";
import { CopyMessageButton } from "./CopyMessageButton";
import { NewsRefreshButton } from "./NewsRefreshButton";

/**
 * "AI news worth talking about": the latest web-searched brief, matched to the community's topics.
 * Server component — group names and «group» tokens are resolved here, at render time.
 */
export async function NewsBriefs({ communityId, real }: { communityId: number; real: boolean }) {
  const locale = await getLocale();
  const t = newsT(locale);
  const dateLocale = dateLocaleOf(locale);
  const fmtDate = (iso: string, withTime = false) =>
    new Date(iso).toLocaleDateString(dateLocale, withTime ? { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "2-digit", year: "2-digit" });

  const row = getLatestNewsBrief(communityId);
  const brief = row ? toNewsBriefView(row, getGroups(communityId), (text, mode) => humanize(text, real, mode)) : null;

  return (
    <section className="mb-10">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <NewspaperIcon className="size-5 text-primary" />
            {t("title")}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {brief ? (
              <>
                {t("updatedAt", { date: fmtDate(brief.createdAt, true) })} · {t("itemsCount", { n: brief.items.length })}
                {brief.costUsd ? <span dir="ltr"> · {t("costLine", { cost: brief.costUsd.toFixed(2) })}</span> : null}
              </>
            ) : (
              t("subtitle")
            )}
          </p>
        </div>
        <NewsRefreshButton />
      </div>

      {!brief || brief.items.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">{t("empty")}</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {brief.items.map((item) => (
            <NewsCard key={item.url} item={item} t={t} fmtDate={fmtDate} />
          ))}
        </div>
      )}
    </section>
  );
}

function NewsCard({ item, t, fmtDate }: { item: NewsItemView; t: ReturnType<typeof newsT>; fmtDate: (iso: string) => string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base leading-snug">
          <a href={item.url} target="_blank" rel="noopener" className="inline-flex items-start gap-1.5 hover:underline" dir="auto">
            <span>{item.title}</span>
            <ExternalLinkIcon className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
          </a>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          <span dir="auto">{item.source}</span>
          {item.publishedAt ? <span dir="ltr"> · {fmtDate(item.publishedAt)}</span> : null}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {item.summary ? (
          <p className="text-sm leading-relaxed text-muted-foreground" dir="auto">
            {item.summary}
          </p>
        ) : null}

        {item.whyNow || item.relatedTopics.length ? (
          <div className="rounded-lg bg-muted/40 p-3 text-sm">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("whyNow")}</div>
            {item.whyNow ? (
              <p className="leading-relaxed" dir="auto">
                {item.whyNow}
              </p>
            ) : null}
            {item.relatedTopics.length ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {item.relatedTopics.map((name) => (
                  <Badge key={name} variant="outline" className="font-normal" dir="auto">
                    {name}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MegaphoneIcon className="size-3.5" />
          <span dir="auto">{item.groupName ? t("postIn", { group: item.groupName }) : t("postAnywhere")}</span>
        </p>

        {item.suggestedPost ? (
          <details className="group rounded-lg border bg-muted/30">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
              <span>{t("suggestedPost")}</span>
              <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t px-3 pb-3 pt-2">
              <Textarea readOnly value={item.suggestedPost} dir="auto" className="min-h-28 text-sm leading-relaxed [unicode-bidi:plaintext]" />
              <div className="mt-2 flex gap-2">
                <CopyMessageButton text={item.suggestedPost} />
              </div>
            </div>
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
}
