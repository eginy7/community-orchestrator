"use client";

import { useState } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const KIND_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "general", label: "דיון כללי" },
  { value: "help", label: "שאלות ועזרה" },
  { value: "jobs", label: "משרות" },
  { value: "projects", label: "פרויקטים" },
  { value: "topic", label: "נושא ספציפי" },
  { value: "announcement", label: "הודעות" },
];

interface Row {
  name: string;
  purpose: string;
  kind: string;
}

export function GroupsEditor({ initial, announcementIdx }: { initial: Row[]; announcementIdx: number }) {
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
        <span>שם הקבוצה</span>
        <span>מטרה</span>
        <span>סוג</span>
        <span className="text-center">הודעות</span>
        <span />
      </div>
      {rows.map((row, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_10rem_5rem_2.5rem] items-center">
          <Input name="group_name" value={row.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="שם" required dir="auto" />
          <Input name="group_purpose" value={row.purpose} onChange={(e) => update(i, { purpose: e.target.value })} placeholder="על מה הקבוצה" dir="auto" />
          <input type="hidden" name="group_kind" value={row.kind} />
          <Select value={row.kind} onValueChange={(v) => update(i, { kind: v ?? "general" })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KIND_OPTIONS.map((k) => (
                <SelectItem key={k.value} value={k.value}>
                  {k.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex justify-center">
            <input type="radio" name="announcement_radio" checked={announcement === i} onChange={() => setAnnouncement(i)} className="size-4 accent-primary" aria-label="קבוצת ההודעות" />
          </label>
          <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)} aria-label="הסר">
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => setRows((r) => [...r, { name: "", purpose: "", kind: "topic" }])}>
        <PlusIcon className="size-4" /> הוסף קבוצה
      </Button>
    </div>
  );
}
