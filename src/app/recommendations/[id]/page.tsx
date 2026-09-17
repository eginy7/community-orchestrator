import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { RecommendationCard } from "@/components/RecommendationCard";
import { Button } from "@/components/ui/button";
import { showRealNames } from "@/lib/display";
import { dirOf, getLocale, getT } from "@/lib/i18n/server";
import { getCommunity, getGroups, getMessagesByIds, getRecommendation } from "@/lib/queries";
import { toRecommendationView } from "@/lib/viewmodel";

export const dynamic = "force-dynamic";

export default async function RecommendationPage({ params }: PageProps<"/recommendations/[id]">) {
  const { id } = await params;
  const rec = getRecommendation(Number(id));
  if (!rec) notFound();
  const community = getCommunity();
  const real = await showRealNames();
  const locale = await getLocale();
  const t = getT(locale);
  // "Back" points toward the start of the reading direction.
  const BackIcon = dirOf(locale) === "rtl" ? ArrowRightIcon : ArrowLeftIcon;
  const groupsById = new Map((community ? getGroups(community.id) : []).map((g) => [g.id, g]));
  const messagesById = getMessagesByIds(rec.evidence.map((e) => e.message_id));
  const view = toRecommendationView(rec, real, groupsById, messagesById, locale);
  return (
    <AppShell communityName={community?.name} realNames={real}>
      <div className="mx-auto max-w-2xl space-y-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/home">
            <BackIcon className="size-4" /> {t("common.backHome")}
          </Link>
        </Button>
        <RecommendationCard rec={view} />
      </div>
    </AppShell>
  );
}
