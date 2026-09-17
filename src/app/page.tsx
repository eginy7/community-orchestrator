import { redirect } from "next/navigation";
import { getCommunity, getLatestRun } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** The upload screen is the front door: it explains the export and defines the community from the files. */
export default function RootPage() {
  const community = getCommunity();
  if (!community) redirect("/upload");
  const run = getLatestRun(community.id);
  if (run?.status === "done") redirect("/home");
  if (run && (run.status === "running" || run.status === "queued")) redirect(`/analysis/${run.id}`);
  redirect("/upload");
}
