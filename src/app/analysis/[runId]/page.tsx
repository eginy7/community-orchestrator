import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { RunProgress } from "@/components/RunProgress";
import { showRealNames } from "@/lib/display";
import { getCommunity, getRun } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AnalysisPage({ params }: PageProps<"/analysis/[runId]">) {
  const { runId } = await params;
  const run = getRun(Number(runId));
  if (!run) notFound();
  const community = getCommunity();
  const real = await showRealNames();
  return (
    <AppShell communityName={community?.name} realNames={real}>
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight">Claude קורא את הקהילה</h1>
        <p className="mt-2 text-muted-foreground">שלב א׳ קורא כל קבוצה ובונה פרופילים ונושאים. שלב ב׳ מחליט מה צריך לקרות השבוע.</p>
        <RunProgress runId={run.id} />
      </div>
    </AppShell>
  );
}
