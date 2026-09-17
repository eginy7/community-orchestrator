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
import { KIND_OPTIONS } from "./GroupsEditor";
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

const fmtDate = (v: number | string | null | undefined) => (v ? new Date(v).toLocaleDateString("he-IL") : "—");
const kindLabel = (k: string) => KIND_OPTIONS.find((o) => o.value === k)?.label ?? k;

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
  const [rows, setRows] = useState<Row[]>([]);
  const [communityName, setCommunityName] = useState(initialCommunityName ?? "בונים AI");
  const [days, setDays] = useState("7");
  const [starting, setStarting] = useState(false);
  const communityNameRef = useRef(communityName);
  communityNameRef.current = communityName;

  const uploadRow = useCallback(
    async (index: number, row: Row) => {
      setRows((r) => r.map((x, j) => (j === index ? { ...x, state: "uploading", step: 0, error: undefined } : x)));
      // The server answers only when the whole file is ingested, so pace the visible steps by file size.
      const tick = Math.min(1500, Math.max(350, (row.file.size / 1_000_000) * 800));
      const timer = setInterval(() => {
        setRows((r) => r.map((x, j) => (j === index && x.state === "uploading" ? { ...x, step: Math.min(x.step + 1, IMPORT_STEPS.length - 1) } : x)));
      }, tick);
      const fd = new FormData();
      fd.append("file", row.file);
      fd.append("communityName", communityNameRef.current.trim() || "הקהילה שלי");
      if (row.groupId !== AUTO && row.groupId) fd.append("groupId", row.groupId);
      try {
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const json = (await res.json()) as UploadResult & { error?: string };
        if (!res.ok) throw new Error(json.error ?? "שגיאה");
        setRows((r) => r.map((x, j) => (j === index ? { ...x, state: "done", step: IMPORT_STEPS.length, result: json } : x)));
        if (json.promotedToAnnouncement) toast.info(`«${json.groupName}» זוהתה כקבוצת ההודעות של הקהילה`);
      } catch (err) {
        setRows((r) => r.map((x, j) => (j === index ? { ...x, state: "error", error: err instanceof Error ? err.message : "שגיאה" } : x)));
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
      if (!res.ok) throw new Error(json.error ?? "שגיאה");
      router.push(`/analysis/${json.runId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "לא הצלחתי להתחיל ניתוח");
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
    kindLabel: kindLabel(g.kind),
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
      existing.kindLabel = kindLabel(res.groupKind);
      existing.messageCount = Math.max(existing.messageCount, res.inserted);
      existing.memberCount = Math.max(existing.memberCount, res.members);
    } else {
      boardGroups.push({ key: `f${r.file.name}`, name: res.groupName, kind: res.groupKind, kindLabel: kindLabel(res.groupKind), messageCount: res.inserted, memberCount: res.members, fresh: true });
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
                <SmartphoneIcon className="size-4" /> איך מייצאים צ׳אט מוואטסאפ
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-relaxed space-y-3">
              <div>
                <div className="font-medium">iPhone</div>
                <ol className="list-decimal ps-5 space-y-0.5 text-muted-foreground">
                  <li>פתחו את הקבוצה ולחצו על שמה למעלה</li>
                  <li>גללו למטה ← «ייצוא צ׳אט»</li>
                  <li>בחרו «ללא מדיה»</li>
                  <li>שתפו ל-AirDrop למק, או שמרו ב«קבצים» / שלחו במייל לעצמכם</li>
                </ol>
              </div>
              <div>
                <div className="font-medium">Android</div>
                <ol className="list-decimal ps-5 space-y-0.5 text-muted-foreground">
                  <li>פתחו את הקבוצה ← ⋮ ← «עוד»</li>
                  <li>«ייצוא צ׳אט» ← «ללא מדיה»</li>
                  <li>שמרו ב-Drive או שלחו לעצמכם</li>
                </ol>
              </div>
              <p className="text-muted-foreground">
                חזרו על זה לכל קבוצה בקהילה, כולל קבוצת ההודעות. כל ההיסטוריה שיש — הזיכרון של Claude נבנה ממנה.
              </p>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <SparklesIcon className="size-4" /> מה קורה אוטומטית
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-relaxed space-y-3">
              <ul className="list-disc ps-5 space-y-1 text-muted-foreground">
                <li>שם הקבוצה נלקח משם הקובץ (למשל «WhatsApp Chat - שאלות ועזרה.zip»)</li>
                <li>סוג הקבוצה מזוהה מהשם: שאלות, משרות, פרויקטים, כללי, נושא</li>
                <li>קבוצה שרק אחד-שניים כותבים בה מסומנת כקבוצת ההודעות</li>
                <li>שמות וטלפונים מוחלפים במזהים אנונימיים לפני שכל דבר נשמר או נשלח ל-Claude</li>
                <li>הקבצים עצמם לא נשמרים בדיסק</li>
              </ul>
              <div className="grid gap-1.5 pt-1">
                <Label htmlFor="communityName">שם הקהילה</Label>
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
        <p className="mt-3 text-lg font-medium">גררו לכאן את כל קבצי הייצוא (zip או txt)</p>
        <p className="mt-1 text-sm text-muted-foreground">כמה קבוצות בבת אחת. הייבוא מתחיל מיד.</p>
      </div>

      {rows.length || groups.some((g) => g.messageCount > 0) ? (
        <ImportBoard
          communityName={communityName.trim() || "הקהילה"}
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
            <CardTitle>קבצים שלא נקלטו</CardTitle>
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
                      <SelectValue placeholder="בחרו קבוצה קיימת" />
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
                      נסה שוב
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
            <CardTitle>הקהילה כפי שזוהתה</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>קבוצה</TableHead>
                  <TableHead>סוג</TableHead>
                  <TableHead className="text-end">הודעות</TableHead>
                  <TableHead className="text-end">כותבים</TableHead>
                  <TableHead>טווח</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="font-medium" dir="auto">
                      {g.name}
                    </TableCell>
                    <TableCell>
                      <Badge variant={g.kind === "announcement" ? "default" : "outline"}>{kindLabel(g.kind)}</Badge>
                    </TableCell>
                    <TableCell className="text-end tabular-nums">{g.messageCount.toLocaleString("he-IL")}</TableCell>
                    <TableCell className="text-end tabular-nums">{g.memberCount.toLocaleString("he-IL")}</TableCell>
                    <TableCell dir="ltr" className="text-end text-muted-foreground">
                      {g.messageCount ? `${fmtDate(g.firstTs)} – ${fmtDate(g.lastTs)}` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-3 text-xs text-muted-foreground">
              משהו זוהה לא נכון? אפשר לתקן שם, סוג ומטרה ב<a href="/onboarding" className="underline">הגדרות</a>.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-primary/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SparklesIcon className="size-5 text-primary" /> {hasCompletedRun ? "צ׳ק-אין שבועי" : "הסריקה הראשונה: כל ההיסטוריה"}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          {hasCompletedRun ? (
            <div className="grid gap-1.5">
              <Label htmlFor="days">כמה ימים אחורה לקרוא לעומק</Label>
              <Input id="days" type="number" min={0} value={days} onChange={(e) => setDays(e.target.value)} className="w-32" dir="ltr" />
              <span className="text-xs text-muted-foreground">ההיסטוריה כבר בזיכרון של Claude. 0 = לקרוא הכול מחדש.</span>
            </div>
          ) : (
            <p className="max-w-xl text-sm text-muted-foreground leading-relaxed">
              בפעם הראשונה Claude קורא את כל מה שהעליתם ובונה את הזיכרון של הקהילה: מי כל אחד, מה מעניין אותו, מה נשאל ולא נענה. מהשבוע הבא
              תעלו רק את השיחות החדשות ותבחרו כמה ימים אחורה לקרוא לעומק.
              {estimate && estimate.messages > 0 ? (
                <>
                  {" "}
                  במאגר כרגע {estimate.messages.toLocaleString("he-IL")} הודעות, כ-{Math.round(estimate.estTokens / 1000).toLocaleString("he-IL")} אלף טוקנים, עלות משוערת{" "}
                  <span dir="ltr">~${estimate.estCostUsd}</span>.
                </>
              ) : null}
            </p>
          )}
          <Button size="lg" onClick={startAnalysis} disabled={!hasData || starting || uploading}>
            {starting ? <Loader2Icon className="size-4 animate-spin" /> : <SparklesIcon className="size-4" />}
            {hasCompletedRun ? "נתח את השבוע" : "נתח את כל ההיסטוריה"}
          </Button>
          {latestRun ? (
            <Button variant="link" onClick={() => router.push(latestRun.status === "done" ? "/home" : `/analysis/${latestRun.id}`)}>
              {latestRun.status === "done" ? "לתוצאות הניתוח האחרון" : "לניתוח שרץ עכשיו"}
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
