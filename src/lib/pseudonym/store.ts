import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { isPhoneLike, normalizeName, normalizePhone } from "@/lib/parser/normalize";
import { DATA_DIR } from "@/lib/paths";

/**
 * Deterministic pseudonym map: real display name / phone  ->  "M0123".
 *
 * This file (data/pseudonyms.json) is the ONLY place real member identifiers live.
 * Everything else — SQLite, prompts sent to Claude, logs, fixtures — sees only ids.
 * The directory is gitignored.
 */

export interface PseudonymEntry {
  /** What the UI shows when de-pseudonymizing. */
  display: string;
  names: string[];
  phones: string[];
}

interface StoreFile {
  version: 1;
  next: number;
  byKey: Record<string, string>;
  members: Record<string, PseudonymEntry>;
}

export const PSEUDONYM_RE = /@?\bM\d{4,}\b/g;

export class PseudonymStore {
  private data: StoreFile;
  private dirty = false;

  constructor(private readonly path: string = `${DATA_DIR}/pseudonyms.json`) {
    this.data = existsSync(path)
      ? (JSON.parse(readFileSync(path, "utf8")) as StoreFile)
      : { version: 1, next: 1, byKey: {}, members: {} };
  }

  /** Key for a sender string exactly as it appears in an export. */
  static keyFor(sender: string): { key: string; kind: "phone" | "name"; canonical: string } {
    if (isPhoneLike(sender)) {
      const phone = normalizePhone(sender);
      if (phone) return { key: `phone:${phone}`, kind: "phone", canonical: phone };
    }
    const name = normalizeName(sender);
    return { key: `name:${name.toLowerCase()}`, kind: "name", canonical: name };
  }

  /** Returns the stable id for this sender, allocating one on first sight. */
  getOrCreate(sender: string): string {
    const { key, kind, canonical } = PseudonymStore.keyFor(sender);
    const existing = this.data.byKey[key];
    if (existing) return existing;
    const id = `M${String(this.data.next++).padStart(4, "0")}`;
    this.data.byKey[key] = id;
    this.data.members[id] = {
      display: kind === "phone" ? `+${canonical}` : canonical,
      names: kind === "name" ? [canonical] : [],
      phones: kind === "phone" ? [canonical] : [],
    };
    this.dirty = true;
    return id;
  }

  /** Lookup without allocation (used by the redactor for phones/names inside bodies). */
  lookup(sender: string): string | null {
    return this.data.byKey[PseudonymStore.keyFor(sender).key] ?? null;
  }

  lookupPhone(digits: string): string | null {
    return this.data.byKey[`phone:${digits}`] ?? null;
  }

  resolve(id: string): PseudonymEntry | null {
    return this.data.members[id.replace(/^@/, "")] ?? null;
  }

  displayName(id: string): string {
    return this.resolve(id)?.display ?? id;
  }

  /** All known display names with their ids, longest first (for body redaction). */
  knownNames(): Array<{ name: string; id: string }> {
    const out: Array<{ name: string; id: string }> = [];
    for (const [id, e] of Object.entries(this.data.members)) {
      for (const n of e.names) out.push({ name: n, id });
    }
    return out.sort((a, b) => b.name.length - a.name.length);
  }

  size(): number {
    return Object.keys(this.data.members).length;
  }

  /** Atomic write (tmp + rename) so a crash mid-ingest never corrupts the map. */
  save(): void {
    if (!this.dirty) return;
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 1), "utf8");
    renameSync(tmp, this.path);
    this.dirty = false;
  }
}

let singleton: PseudonymStore | null = null;
/** Process-wide store (Next dev server + scripts). */
export function getPseudonymStore(): PseudonymStore {
  if (!singleton) singleton = new PseudonymStore();
  return singleton;
}
