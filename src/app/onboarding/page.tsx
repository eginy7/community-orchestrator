import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { GroupsEditor } from "@/components/GroupsEditor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { showRealNames } from "@/lib/display";
import { getLocale, getT } from "@/lib/i18n/server";
import { getCommunity, getGroups } from "@/lib/queries";
import { GOALS } from "@/lib/goals";
import { saveOnboarding } from "./actions";

export const dynamic = "force-dynamic";

// Seed rows for a community without groups. These are stored data (WhatsApp group names / purposes), so they stay Hebrew.
const DEFAULT_GROUPS = [
  { name: "כללי", purpose: "דיון כללי, חדשות AI, שיתופים", kind: "general" },
  { name: "שאלות ועזרה", purpose: "שאלות טכניות ועזרה הדדית", kind: "help" },
  { name: "משרות", purpose: "משרות, פרילנס והזדמנויות", kind: "jobs" },
  { name: "פרויקטים אישיים", purpose: "בנייה בפומבי, דמואים, פידבק", kind: "projects" },
  { name: "הודעות", purpose: "הודעות רשמיות לכל הקהילה", kind: "announcement" },
];

export default async function OnboardingPage() {
  const community = getCommunity();
  // No community yet → the upload screen defines it. Settings are for refining afterwards.
  if (!community) redirect("/upload");
  const real = await showRealNames();
  const t = getT(await getLocale());
  const groups = getGroups(community.id);
  const initialGroups = groups.length
    ? groups.map((g) => ({ name: g.name, purpose: g.purpose, kind: g.kind }))
    : DEFAULT_GROUPS;
  const announcementIdx = groups.length ? groups.findIndex((g) => g.isAnnouncement) : DEFAULT_GROUPS.findIndex((g) => g.kind === "announcement");

  return (
    <AppShell communityName={community.name} realNames={real}>
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight">{t("onboarding.title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("onboarding.subtitle")}</p>

        <form action={saveOnboarding} className="mt-8 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("onboarding.communityCard")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-2">
                <Label htmlFor="name">{t("onboarding.nameLabel")}</Label>
                <Input id="name" name="name" defaultValue={community.name} required dir="auto" />
              </div>
              <div className="grid gap-2">
                <Label>{t("onboarding.goalsLabel")}</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {GOALS.map((g) => (
                    <label key={g.key} className="flex items-center gap-2 text-sm">
                      {/* The Hebrew value is what gets stored and sent to the model; only the label is translated. */}
                      <Checkbox name="goals" value={g.value} defaultChecked={community.goals.includes(g.value)} />
                      {t(`goals.${g.key}`)}
                    </label>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("onboarding.groupsCard")}</CardTitle>
              <CardDescription>{t("onboarding.groupsDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <GroupsEditor initial={initialGroups} announcementIdx={announcementIdx} />
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" size="lg">
              {t("onboarding.save")}
            </Button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
