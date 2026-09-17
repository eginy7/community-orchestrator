import Link from "next/link";
import { redirect } from "next/navigation";
import { SparklesIcon } from "lucide-react";
import { signOut } from "@/app/auth/actions";
import { LoginPanel } from "@/components/LoginPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isAuthEnabled } from "@/lib/auth/env";
import { homeFor, safeNextPath } from "@/lib/auth/gate";
import { getSession, isSignedInButUnauthorized } from "@/lib/auth/session";
import { authT } from "@/lib/i18n/auth";
import { getLocale } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const t = authT(await getLocale());
  const params = await searchParams;

  if (!isAuthEnabled()) {
    return (
      <Shell brand={t("brand")}>
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{t("notConfiguredTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("notConfiguredBody")}</p>
            <Button asChild>
              <Link href="/">{t("backToApp")}</Link>
            </Button>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  // The proxy already bounces signed-in users; this covers direct renders (e.g. after a cookie refresh).
  const session = await getSession();
  if (session) redirect(homeFor(session.role));

  const stuck = await isSignedInButUnauthorized();
  return (
    <Shell brand={t("brand")}>
      <LoginPanel next={safeNextPath(first(params.next), "/")} error={stuck ? "unauthorized" : (first(params.error) ?? null)} />
      {stuck ? (
        <form action={signOut}>
          <Button type="submit" variant="link" size="sm" className="text-muted-foreground">
            {t("switchAccount")}
          </Button>
        </form>
      ) : null}
    </Shell>
  );
}

function Shell({ brand, children }: { brand: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-full flex-1 flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="flex items-center gap-2 font-semibold">
        <SparklesIcon className="size-5 text-primary" />
        <span>{brand}</span>
      </div>
      {children}
    </main>
  );
}
