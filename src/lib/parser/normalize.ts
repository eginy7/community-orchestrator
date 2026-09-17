/**
 * Text normalization helpers shared by the parser and the pseudonymizer.
 * WhatsApp exports (especially iOS) sprinkle bidi control characters and
 * non-standard spaces that break naive regexes and make the same sender
 * look like two different people.
 */

// LRM, RLM, LRE/RLE/PDF/LRO/RLO, isolates, BOM
const BIDI_RE = /[‎‏‪-‮⁦-⁩﻿]/g;
// narrow no-break space (iOS puts it before AM/PM), no-break space
const ODD_SPACE_RE = /[  ]/g;

export function stripBidi(s: string): string {
  return s.replace(BIDI_RE, "");
}

export function normalizeSpaces(s: string): string {
  return s.replace(ODD_SPACE_RE, " ").replace(/[ \t]+/g, " ").trim();
}

/** Canonical form of a display name used as a pseudonym key. */
export function normalizeName(s: string): string {
  return normalizeSpaces(stripBidi(s).normalize("NFKC"));
}

/**
 * Digits-only phone in international form without "+".
 * "050-000-0000" -> "972500000000", "+972 50-000-0000" -> "972500000000".
 * Returns null when the input is not phone-like.
 */
export function normalizePhone(s: string): string | null {
  let digits = stripBidi(s).replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 10 && digits.startsWith("0")) digits = "972" + digits.slice(1);
  if (digits.length === 9 && digits.startsWith("5")) digits = "972" + digits;
  if (digits.length < 9 || digits.length > 15) return null;
  return digits;
}

/** A WhatsApp sender that is an unsaved contact shows up as a phone number. */
export function isPhoneLike(s: string): boolean {
  const t = normalizeSpaces(stripBidi(s));
  return /^\+?[\d\s\-().‑]{8,20}$/.test(t) && /\d{7,}/.test(t.replace(/\D/g, ""));
}
