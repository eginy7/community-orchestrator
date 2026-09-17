"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import { FileArchiveIcon, Loader2Icon, SmartphoneIcon, SparklesIcon, UploadCloudIcon, XCircleIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLocale } from "@/lib/i18n/client";
import { kindLabel } from "./GroupsEditor";
import { ImportBoard, IMPORT_STEPS, type BoardGroup, type BoardPending } from "./ImportBoard";

interface GroupInfo {
  id: number;
  name: string;
  kind: string;
  messageCount: number;
  memberCount: number;
  firstTs: number | null;
  lastTs: number | null;
}

interface UploadResult {
  groupName: string;
  groupKind: string;
  createdGroup: boolean;
  promotedToAnnouncement: boolean;
  inserted: number;
  parsed: number;
  members: number;
  firstTs: string | null;
  lastTs: string | null;
  format: string;
}

interface Row {
  file: File;
  /** numeric group id, "auto" (derive from filename), or "" when the user must choose */
  groupId: string;
  guessedName: string;
  state: "idle" | "uploading" | "done" | "error";
  /** Simulated pipeline position (0..3) while the server works; used for the loading animation. */
  step: number;
  result?: UploadResult;
  error?: string;
}

const AUTO = "auto";

function guessGroupName(filename: string): string {
  let base = filename.replace(/\.(zip|txt)$/i, "").trim().replace(/\s*\(\d+\)$/, "").trim();
  const m = /^WhatsApp Chat (?:-|with) (.+)$/i.exec(base);
  if (m) base = m[1].trim();
  return /^_?chat$/i.test(base) ? "" : base;
}

interface Props {
  firstTime: boolean;
  communityName: string | null;
  groups: GroupInfo[];
  latestRun: { id: number; status: string } | null;
  /** Once a full historical run exists, later runs read only a recent window on top of that memory. */
  hasCompletedRun: boolean;
  estimate: { messages: number; estTokens: number; estCostUsd: number } | null;
}

export function UploadPanel({ firstTime, communityName: initialCommunityName, groups, latestRun, hasCompletedRun, estimate }: Props) {
  const router = useRouter();
  const { t, dateLocale } = useLocale();
  const [rows, setRows] = useState<Row[]>([]);
  const [communityName, setCommunityName] = useState(initialCommunityName ?? t("upload.defaultCommunityName"));
  const [days, setDays] = useState("7");
  const [starting, setStarting] = useState(false);
  const communityNameRef = useRef(communityName);
  communityNameRef.current = communityName;
  // `t` is stable per locale; captured in refs so the upload loop does not restart on a language switch.
  const tRef = useRef(t);
  tRef.current = t;

  const fmtDate = (v: number | string | null | undefined) => (v ? new Date(v).toLocaleDateString(dateLocale) : "—");
  const num = (n: number) => n.toLocaleString(dateLocale);

  const uploadRow = useCallback(
    async (index: number, row: Row) => {
      const tt = tRef.current;
      setRows((r) => r.map((x, j) => (j === index ? { ...x, state: "uploading", step: 0, error: undefined } : x)));
      // The server answers only when the whole file is ingested, so pace the visible steps by file size.
      const tick = Math.min(1500, Math.max(350, (row.file.size / 1_000_000) * 800));
      const timer = setInterval(() => {
        setRows((r) => r.map((x, j) => (j === index && x.state === "uploading" ? { ...x, step: Math.min(x.step + 1, IMPORT_STEPS.length - 1) } : x)));
      }, tick);
      const fd = new FormData();
      fd.append("file", row.file);
      fd.append("communityName", communityNameRef.current.trim() || tt("upload.fallbackCommunityName"));
      if (row.groupId !== AUTO && row.groupId) fd.append("groupId", row.groupId);
      try {
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const json = (await res.json()) as UploadResult & { error?: string };
        if (!res.ok) throw new Error(json.error ?? tt("common.error"));
        setRows((r) => r.map((x, j) => (j === index ? { ...x, state: "done", step: IMPORT_STEPS.length, result: json } : x)));
        if (json.promotedToAnnouncement) toast.info(tt("upload.promotedToast", { name: json.groupName }));
      } catch (err) {
        setRows((r) => r.map((x, j) => (j === index ? { ...x, state: "error", error: err instanceof Error ? err.message : tt("common.error") } : x)));
      } finally {
        clearInterval(timer);
      }
    },
    [],
  );

  const onDrop = useCallback(
    (accepted: File[]) => {
      const startIndex = rows.length;
      const newRows: Row[] = accepted.map((file) => {
        const guess = guessGroupName(file.name);
        const match = groups.find((g) => g.name.trim() === guess);
        return { file, groupId: match ? String(match.id) : AUTO, guessedName: guess || file.name.replace(/\.(zip|txt)$/i, ""), state: "idle", step: 0 };
      });
      setRows((r) => [...r, ...newRows]);
      // Zero-config: start importing immediately, one file at a time so the server stays responsive.
      (async () => {
        for (let i = 0; i < newRows.length; i++) await uploadRow(startIndex + i, newRows[i]);
        router.refresh();
      })();
    },
    [groups, rows.length, uploadRow, router],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/zip": [".zip"], "text/plain": [".txt"] },
    multiple: true,
  });

  const startAnalysis = async () => {
    setStarting(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sinceDays: hasCompletedRun ? Number(days) || 0 : 0 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? t("common.error"));
      router.push(`/analysis/${json.runId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("upload.startFailed"));
      setStarting(false);
    }
  };

  const doneRows = rows.filter((r) => r.state === "done");
  const uploading = rows.some((r) => r.state === "uploading" || r.state === "idle");

  // Board: groups already in the DB plus the ones that just landed in this session.
  const boardGroups: BoardGroup[] = groups.map((g) => ({
    key: `g${g.id}`,
    name: g.name,
    kind: g.kind,
    kindLabel: kindLabel(g.kind, t),
    messageCount: g.messageCount,
    memberCount: g.memberCount,
    fresh: false,
  }));
  for (const r of doneRows) {
    const res = r.result!;
    const existing = boardGroups.find((g) => g.name === res.groupName);
    if (existing) {
      if (!groups.some((g) => g.name === res.groupName && g.messageCount > 0)) existing.fresh = true;
      existing.kind = res.groupKind;
      existing.kindLabel = kindLabel(res.groupKind, t);
      existing.messageCount = Math.max(existing.messageCount, res.inserted);
      existing.memberCount = Math.max(existing.memberCount, res.members);
    } else {
      boardGroups.push({ key: `f${r.file.name}`, name: res.groupName, kind: res.groupKind, kindLabel: kindLabel(res.groupKind, t), messageCount: res.inserted, memberCount: res.members, fresh: true });
    }
  }
  const boardPending: BoardPending[] = rows.filter((r) => r.state === "uploading" || r.state === "idle").map((r) => ({ key: r.file.name, name: r.guessedName, step: r.step }));
  const failedRows = rows.filter((r) => r.state === "error");
  const hasData = useMemo(() => groups.some((g) => g.messageCount > 0) || doneRows.length > 0, [groups, doneRows.length]);

  return (
    <div className="mt-8 space-y-8">
      {firstTime ? (
        <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
          <Card size="sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <SmartphoneIcon className="size-4" /> {t("upload.howToExport")}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-relaxed space-y-3">
              <div>
                <div className="font-medium">{t("upload.iphone")}</div>
                <ol className="list-decimal ps-5 space-y-0.5 text-muted-foreground">
                  <li>{t("upload.iphone1")}</li>
                  <li>{t("upload.iphone2")}</li>
                  <li>{t("upload.iphone3")}</li>
                  <li>{t("upload.iphone4")}</li>
                </ol>
              </div>
              <div>
                <div className="font-medium">{t("upload.android")}</div>
                <ol className="list-decimal ps-5 space-y-0.5 text-muted-foreground">
                  <li>{t("upload.android1")}</li>
                  <li>{t("upload.android2")}</li>
                  <li>{t("upload.android3")}</li>
                </ol>
              </div>
              <p className="text-muted-foreground">{t("upload.repeatNote")}</p>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <SparklesIcon className="size-4" /> {t("upload.whatHappens")}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-relaxed space-y-3">
              <ul className="list-disc ps-5 space-y-1 text-muted-foreground">
                <li>{t("upload.auto1")}</li>
                <li>{t("upload.auto2")}</li>
                <li>{t("upload.auto3")}</li>
                <li>{t("upload.auto4")}</li>
                <li>{t("upload.auto5")}</li>
              </ul>
              <div className="grid gap-1.5 pt-1">
                <Label htmlFor="communityName">{t("upload.communityNameLabel")}</Label>
                <Input id="communityName" value={communityName} onChange={(e) => setCommunityName(e.target.value)} dir="auto" />
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div
        {...getRootProps()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 text-center transition-colors ${isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/60"}`}
      >
        <input {...getInputProps()} />
        <UploadCloudIcon className="size-12 text-muted-foreground" />
        <p className="mt-3 text-lg font-medium">{t("upload.dropTitle")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("upload.dropHint")}</p>
      </div>

      {rows.length || groups.some((g) => g.messageCount > 0) ? (
        <ImportBoard
          communityName={communityName.trim() || t("upload.boardFallbackName")}
          groups={boardGroups}
          pending={boardPending}
          failed={failedRows.length}
          totalFiles={rows.length}
          doneFiles={doneRows.length}
        />
      ) : null}

      {failedRows.length ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("upload.failedFiles")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {rows.map((row, i) =>
              row.state !== "error" ? null : (
                <div key={i} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1.1fr_1fr_1.3fr] sm:items-center">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileArchiveIcon className="size-5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium" dir="auto">
                        {row.file.name}
                      </div>
                      <div className="text-xs text-muted-foreground">{(row.file.size / 1024).toFixed(0)} KB</div>
                    </div>
                  </div>
                  <Select value={row.groupId === AUTO ? "" : row.groupId} onValueChange={(v) => setRows((r) => r.map((x, j) => (j === i ? { ...x, groupId: v ?? "" } : x)))}>
                    <SelectTrigger className="min-w-44">
                      <SelectValue placeholder={t("upload.chooseExisting")} />
                    </SelectTrigger>
                    <SelectContent>
                      {groups.map((g) => (
                        <SelectItem key={g.id} value={String(g.id)}>
                          {g.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="flex flex-wrap items-center gap-2 text-sm text-destructive">
                    <XCircleIcon className="size-4" /> {row.error}
                    <Button size="sm" variant="outline" onClick={() => uploadRow(i, row)}>
                      {t("common.retry")}
                    </Button>
                  </span>
                </div>
              ),
            )}
          </CardContent>
        </Card>
      ) : null}

      {groups.length ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("upload.detected")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("upload.colGroup")}</TableHead>
                  <TableHead>{t("upload.colKind")}</TableHead>
                  <TableHead className="text-end">{t("upload.colMessages")}</TableHead>
                  <TableHead className="text-end">{t("upload.colWriters")}</TableHead>
                  <TableHead>{t("upload.colRange")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="font-medium" dir="auto">
                      {g.name}
                    </TableCell>
                    <TableCell>
                      <Badge variant={g.kind === "announcement" ? "default" : "outline"}>{kindLabel(g.kind, t)}</Badge>
                    </TableCell>
                    <TableCell className="text-end tabular-nums">{num(g.messageCount)}</TableCell>
                    <TableCell className="text-end tabular-nums">{num(g.memberCount)}</TableCell>
                    <TableCell dir="ltr" className="text-end text-muted-foreground">
                      {g.messageCount ? `${fmtDate(g.firstTs)} – ${fmtDate(g.lastTs)}` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-3 text-xs text-muted-foreground">
              {t("upload.fixHintBefore")}
              <a href="/onboarding" className="underline">
                {t("upload.fixHintLink")}
              </a>
              {t("upload.fixHintAfter")}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-primary/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SparklesIcon className="size-5 text-primary" /> {hasCompletedRun ? t("upload.weeklyCheckin") : t("upload.firstScan")}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          {hasCompletedRun ? (
            <div className="grid gap-1.5">
              <Label htmlFor="days">{t("upload.daysLabel")}</Label>
              <Input id="days" type="number" min={0} value={days} onChange={(e) => setDays(e.target.value)} className="w-32" dir="ltr" />
              <span className="text-xs text-muted-foreground">{t("upload.daysHint")}</span>
            </div>
          ) : (
            <p className="max-w-xl text-sm text-muted-foreground leading-relaxed">
              {t("upload.firstScanBody")}
              {estimate && estimate.messages > 0 ? (
                <>
                  {" "}
                  {t("upload.estimateBefore", { messages: num(estimate.messages), ktokens: num(Math.round(estimate.estTokens / 1000)) })} <span dir="ltr">~${estimate.estCostUsd}</span>.
                </>
              ) : null}
            </p>
          )}
          <Button size="lg" onClick={startAnalysis} disabled={!hasData || starting || uploading}>
            {starting ? <Loader2Icon className="size-4 animate-spin" /> : <SparklesIcon className="size-4" />}
            {hasCompletedRun ? t("upload.analyzeWeek") : t("upload.analyzeAll")}
          </Button>
          {latestRun ? (
            <Button variant="link" onClick={() => router.push(latestRun.status === "done" ? "/home" : `/analysis/${latestRun.id}`)}>
              {latestRun.status === "done" ? t("upload.lastResults") : t("upload.runningNow")}
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
