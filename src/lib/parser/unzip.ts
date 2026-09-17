import { unzipSync, strFromU8 } from "fflate";

/**
 * Extract the chat text from an uploaded file.
 * - `.zip` (iOS export): finds `_chat.txt` (or the first `.txt`), ignores media.
 * - `.txt`: returned as-is.
 */
export function extractChatText(filename: string, bytes: Uint8Array): string {
  if (filename.toLowerCase().endsWith(".zip") || looksLikeZip(bytes)) {
    const entries = unzipSync(bytes, {
      filter: (f) => f.name.toLowerCase().endsWith(".txt") && !f.name.startsWith("__MACOSX"),
    });
    const names = Object.keys(entries);
    if (names.length === 0) throw new Error("לא נמצא קובץ טקסט בתוך ה-zip");
    const preferred = names.find((n) => n.endsWith("_chat.txt")) ?? names[0];
    return strFromU8(entries[preferred]);
  }
  return strFromU8(bytes);
}

function looksLikeZip(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/**
 * Derive the group name from the export's filename.
 * "WhatsApp Chat - בונים AI.zip" -> "בונים AI"; "שאלות ועזרה ❓ (1).zip" -> "שאלות ועזרה ❓".
 * Returns null only for generic names like "_chat.txt" that carry no group name.
 */
export function guessGroupNameFromFilename(filename: string): string | null {
  let base = filename.replace(/\.(zip|txt)$/i, "").trim();
  base = base.replace(/\s*\(\d+\)$/, "").trim(); // browser duplicate suffix " (1)"
  const m = /^WhatsApp Chat (?:-|with) (.+)$/i.exec(base);
  if (m) base = m[1].trim();
  if (!base || /^_?chat$/i.test(base) || /^WhatsApp Chat$/i.test(base)) return null;
  return base;
}
