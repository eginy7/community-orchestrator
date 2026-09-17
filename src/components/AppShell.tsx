import Link from "next/link";
import { BellIcon, EyeIcon, EyeOffIcon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toggleNames } from "@/app/actions";
import type { WeeklyReminder } from "@/lib/queries";

interface Props {
  communityName?: string | null;
  realNames: boolean;
  /** Shown as a banner when more than a week passed since the last upload. */
  reminder?: WeeklyReminder | null;
  children: React.ReactNode;
}

const NAV = [
  { href: "/home", label: "הבית" },
  { href: "/upload", label: "העלאה" },
  { href: "/onboarding", label: "הגדרות" },
];

export function AppShell({ communityName, realNames, reminder, children }: Props) {
  return (
    <div className="min-h-full flex flex-col">
      <header className="border-b bg-card/60 backdrop-blur sticky top-0 z-20">
        <div className="mx-auto max-w-6xl px-4 h-14 flex items-center gap-6">
          <Link href="/home" className="flex items-center gap-2 font-semibold">
            <SparklesIcon className="size-5 text-primary" />
            <span>Community Orchestrator</span>
            {communityName ? <span className="text-muted-foreground font-normal">· {communityName}</span> : null}
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            {NAV.filter((n) => communityName || n.href !== "/onboarding").map((n) => (
              <Button key={n.href} asChild variant="ghost" size="sm">
                <Link href={n.href}>{n.label}</Link>
              </Button>
            ))}
          </nav>
          <form action={toggleNames} className="ms-auto">
            <Button type="submit" variant="outline" size="sm" title={realNames ? "הצג פסאודונימים (לצילומי מסך)" : "הצג שמות אמיתיים"}>
              {realNames ? <EyeIcon className="size-4" /> : <EyeOffIcon className="size-4" />}
              <span className="hidden sm:inline">{realNames ? "שמות אמיתיים" : "פסאודונימים"}</span>
            </Button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-8 flex-1">
        {reminder ? (
          <div className="mb-8 flex flex-wrap items-center gap-3 rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm dark:border-amber-700/50 dark:bg-amber-950/40">
            <BellIcon className="size-5 shrink-0 text-amber-600" />
            <div className="flex-1 min-w-60">
              <div className="font-medium">זמן לצ׳ק-אין השבועי</div>
              <div className="text-muted-foreground">
                עברו {reminder.daysSinceUpload} ימים מההעלאה האחרונה ({reminder.lastUploadAt.toLocaleDateString("he-IL")}). ייצאו את השיחות של השבוע ותגלו מה הקהילה צריכה עכשיו.
              </div>
            </div>
            <Button asChild size="sm">
              <Link href="/upload">להעלאת השיחות</Link>
            </Button>
          </div>
        ) : null}
        {children}
      </main>
    </div>
  );
}
