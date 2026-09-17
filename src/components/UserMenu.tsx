import { LogOutIcon } from "lucide-react";
import { signOut } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { phoneTail } from "@/lib/auth/phone";
import { getSession } from "@/lib/auth/session";
import { authT } from "@/lib/i18n/auth";
import { getLocale } from "@/lib/i18n/server";

/**
 * Who is signed in + sign-out (server component). Renders nothing in the dev fallback (auth off)
 * or when nobody is signed in. Mount it in the app header: `<UserMenu />`.
 */
export async function UserMenu({ className }: { className?: string }) {
  const session = await getSession();
  if (!session || session.dev) return null;
  const t = authT(await getLocale());
  const who = session.email ?? (session.phone ? phoneTail(session.phone) : session.userId.slice(0, 8));
  return (
    <div className={className ?? "flex items-center gap-2 text-sm"}>
      <span className="text-muted-foreground" dir="ltr" title={t("signedInAs")}>
        {who}
      </span>
      <form action={signOut}>
        <Button type="submit" variant="ghost" size="sm">
          <LogOutIcon className="size-4" />
          {t("signOut")}
        </Button>
      </form>
    </div>
  );
}
