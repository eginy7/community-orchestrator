"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/client";
import { newsT } from "@/lib/i18n/news";
import type { NewsBriefView } from "@/lib/newsview";

type ButtonProps = React.ComponentProps<typeof Button>;

/** Triggers a web-searched news refresh, then re-renders the (server) section. */
export function NewsRefreshButton({ variant = "outline", size = "default", className }: { variant?: ButtonProps["variant"]; size?: ButtonProps["size"]; className?: string }) {
  const { locale } = useLocale();
  const t = newsT(locale);
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const refresh = async () => {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch("/api/news", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { brief?: NewsBriefView | null; error?: string };
      if (!res.ok || !data.brief) {
        toast.error(data.error ?? t("failed", { msg: res.statusText || res.status }));
        return;
      }
      const n = data.brief.items.length;
      toast.success(n ? t("refreshed", { n }) : t("refreshedNone"));
      router.refresh();
    } catch {
      toast.error(t("failedNetwork"));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={className}>
      <Button type="button" variant={variant} size={size} onClick={() => void refresh()} disabled={pending} aria-busy={pending}>
        {pending ? <Loader2Icon className="size-4 animate-spin" /> : <RefreshCwIcon className="size-4" />}
        {t("refresh")}
      </Button>
      {pending ? (
        <p className="mt-1.5 text-xs text-muted-foreground" role="status" aria-live="polite">
          {t("refreshing")}
        </p>
      ) : null}
    </div>
  );
}
