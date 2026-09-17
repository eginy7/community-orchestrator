import Link from "next/link";
import { SparklesIcon } from "lucide-react";
import { AskCommunity } from "@/components/AskCommunity";
import { UserMenu } from "@/components/UserMenu";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireViewerOrAdmin } from "@/lib/auth/session";
import { authT } from "@/lib/i18n/auth";
import { getLocale } from "@/lib/i18n/server";
import { getCommunity, getLatestRun, getProfileCount } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** Viewer home: just the free "ask the community" box, no admin navigation. */
export default async function AskPage() {
  const session = await requireViewerOrAdmin();
  const t = authT(await getLocale());
  const community = getCommunity();
  const run = community ? getLatestRun(community.id, "done") : null;
  const profileCount = run ? getProfileCount(run.id) : 0;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b bg-card/60 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-4 px-4">
          <div className="flex items-center gap-2 font-semibold">
            <SparklesIcon className="size-5 text-primary" />
            <span>{t("brand")}</span>
            {community ? <span className="font-normal text-muted-foreground">· {community.name}</span> : null}
          </div>
          <div className="ms-auto flex items-center gap-2">
            {session.role === "admin" ? (
              <Button asChild variant="ghost" size="sm">
                <Link href="/">{t("adminHome")}</Link>
              </Button>
            ) : null}
            <UserMenu />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-8">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{t("askTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("askSubtitle")}</p>
        </div>

        {run ? (
          <AskCommunity profileCount={profileCount} />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t("askNotAnalyzed")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{t("askNotAnalyzedBody")}</p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
