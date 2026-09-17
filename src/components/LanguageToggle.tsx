import { setLocale } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { getLocale, getT, type Locale } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";

const OPTIONS: Array<{ locale: Locale; labelKey: "nav.langHe" | "nav.langEn"; lang: string }> = [
  { locale: "he", labelKey: "nav.langHe", lang: "he" },
  { locale: "en", labelKey: "nav.langEn", lang: "en" },
];

/** Two-button language switch (server component). Sets the `locale` cookie via a server action and re-renders the layout. */
export async function LanguageToggle({ className }: { className?: string }) {
  const locale = await getLocale();
  const t = getT(locale);
  return (
    <form aria-label={t("nav.languageLabel")} className={cn("inline-flex items-center rounded-md border bg-background p-0.5 text-xs", className)}>
      {OPTIONS.map((o) => {
        const active = o.locale === locale;
        return (
          <Button
            key={o.locale}
            type="submit"
            formAction={setLocale.bind(null, o.locale)}
            variant={active ? "secondary" : "ghost"}
            size="sm"
            lang={o.lang}
            aria-pressed={active}
            className={cn("h-6 min-w-9 px-2 text-xs", active ? "font-semibold" : "text-muted-foreground")}
          >
            {t(o.labelKey)}
          </Button>
        );
      })}
    </form>
  );
}
