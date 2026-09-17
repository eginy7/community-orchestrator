import Link from "next/link";
import { BellIcon, EyeIcon, EyeOffIcon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toggleNames } from "@/app/actions";
import { LanguageToggle } from "@/components/LanguageToggle";
import { UserMenu } from "@/components/UserMenu";
import { dateLocaleOf, getLocale, getT, type MessageKey } from "@/lib/i18n/server";
import type { WeeklyReminder } from "@/lib/queries";

interface Props {
  communityName?: string | null;
  realNames: boolean;
  /** Shown as a banner when more than a week passed since the last upload. */
  reminder?: WeeklyReminder | null;
  children: React.ReactNode;
}

const NAV: Array<{ href: "/home" | "/upload" | "/onboarding"; labelKey: MessageKey }> = [
  { href: "/home", labelKey: "nav.home" },
  { href: "/upload", labelKey: "nav.upload" },
  { href: "/onboarding", labelKey: "nav.settings" },
];

export async function AppShell({ communityName, realNames, reminder, children }: Props) {
  const locale = await getLocale();
  const t = getT(locale);
  return (
    <div className="min-h-full flex flex-col">
      <header className="border-b bg-card/60 backdrop-blur sticky top-0 z-20">
        <div className="mx-auto max-w-6xl px-4 h-14 flex items-center gap-6">
          <Link href="/home" className="flex items-center gap-2 font-semibold">
            <SparklesIcon className="size-5 text-primary" />
            <span>{t("common.brand")}</span>
            {communityName ? <span className="text-muted-foreground font-normal">· {communityName}</span> : null}
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            {NAV.filter((n) => communityName || n.href !== "/onboarding").map((n) => (
              <Button key={n.href} asChild variant="ghost" size="sm">
                <Link href={n.href}>{t(n.labelKey)}</Link>
              </Button>
            ))}
          </nav>
          <div className="ms-auto flex items-center gap-3">
            {/* Shown next to the names toggle; the pseudonym map never leaves this machine. */}
            <span className="hidden md:inline text-xs text-muted-foreground">{realNames ? t("nav.privacyCaption") : t("nav.demoCaption")}</span>
            <form action={toggleNames}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="submit" variant="outline" size="sm" aria-label={realNames ? t("nav.showPseudonymsAria") : t("nav.showRealNamesTitle")}>
                    {realNames ? <EyeIcon className="size-4" /> : <EyeOffIcon className="size-4" />}
                    <span className="hidden sm:inline">{realNames ? t("nav.realNames") : t("nav.pseudonyms")}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-start">
                  {realNames ? t("nav.realNamesTooltip") : t("nav.pseudonymsTooltip")}
                </TooltipContent>
              </Tooltip>
            </form>
            <LanguageToggle />
          <UserMenu />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-8 flex-1">
        {reminder ? (
          <div className="mb-8 flex flex-wrap items-center gap-3 rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm dark:border-amber-700/50 dark:bg-amber-950/40">
            <BellIcon className="size-5 shrink-0 text-amber-600" />
            <div className="flex-1 min-w-60">
              <div className="font-medium">{t("nav.reminderTitle")}</div>
              <div className="text-muted-foreground">
                {t("nav.reminderBody", { days: reminder.daysSinceUpload, date: reminder.lastUploadAt.toLocaleDateString(dateLocaleOf(locale)) })}
              </div>
            </div>
            <Button asChild size="sm">
              <Link href="/upload">{t("nav.reminderCta")}</Link>
            </Button>
          </div>
        ) : null}
        {children}
      </main>
    </div>
  );
}
