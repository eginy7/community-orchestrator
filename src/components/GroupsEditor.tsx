"use client";

import { useState } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { GroupKind } from "@/lib/db/schema";
import { useT } from "@/lib/i18n/client";
import type { TFunction } from "@/lib/i18n/messages";

/** Group kinds in display order. `label` is the Hebrew default; use `kindLabel(kind, t)` for the current UI language. */
export const KIND_OPTIONS: Array<{ value: GroupKind; label: string }> = [
  { value: "general", label: "דיון כללי" },
  { value: "help", label: "שאלות ועזרה" },
  { value: "jobs", label: "משרות" },
  { value: "projects", label: "פרויקטים" },
  { value: "topic", label: "נושא ספציפי" },
  { value: "announcement", label: "הודעות" },
];

const KIND_SET = new Set<string>(KIND_OPTIONS.map((k) => k.value));

/** Localized label for a group kind; unknown kinds fall back to the raw value. */
export function kindLabel(kind: string, t: TFunction): string {
  return KIND_SET.has(kind) ? t(`kinds.${kind as GroupKind}`) : kind;
}

interface Row {
  name: string;
  purpose: string;
  kind: string;
}

export function GroupsEditor({ initial, announcementIdx }: { initial: Row[]; announcementIdx: number }) {
  const t = useT();
  const [rows, setRows] = useState<Row[]>(initial.length ? initial : [{ name: "", purpose: "", kind: "general" }]);
  const [announcement, setAnnouncement] = useState(announcementIdx);

  const update = (i: number, patch: Partial<Row>) => setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  const remove = (i: number) => {
    setRows((r) => r.filter((_, j) => j !== i));
    setAnnouncement((a) => (a === i ? -1 : a > i ? a - 1 : a));
  };

  return (
    <div className="space-y-3">
      <input type="hidden" name="announcement" value={announcement} />
      <div className="hidden sm:grid grid-cols-[1fr_1.4fr_10rem_5rem_2.5rem] gap-2 text-xs text-muted-foreground px-1">
        <span>{t("onboarding.colName")}</span>
        <span>{t("onboarding.colPurpose")}</span>
        <span>{t("onboarding.colKind")}</span>
        <span className="text-center">{t("onboarding.colAnnouncement")}</span>
        <span />
      </div>
      {rows.map((row, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_10rem_5rem_2.5rem] items-center">
          <Input name="group_name" value={row.name} onChange={(e) => update(i, { name: e.target.value })} placeholder={t("onboarding.namePlaceholder")} required dir="auto" />
          <Input name="group_purpose" value={row.purpose} onChange={(e) => update(i, { purpose: e.target.value })} placeholder={t("onboarding.purposePlaceholder")} dir="auto" />
          <input type="hidden" name="group_kind" value={row.kind} />
          <Select value={row.kind} onValueChange={(v) => update(i, { kind: v ?? "general" })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KIND_OPTIONS.map((k) => (
                <SelectItem key={k.value} value={k.value}>
                  {kindLabel(k.value, t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex justify-center">
            <input type="radio" name="announcement_radio" checked={announcement === i} onChange={() => setAnnouncement(i)} className="size-4 accent-primary" aria-label={t("onboarding.announcementRadio")} />
          </label>
          <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)} aria-label={t("onboarding.remove")}>
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => setRows((r) => [...r, { name: "", purpose: "", kind: "topic" }])}>
        <PlusIcon className="size-4" /> {t("onboarding.addGroup")}
      </Button>
    </div>
  );
}
