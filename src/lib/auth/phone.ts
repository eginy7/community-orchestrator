/**
 * Normalizes what a person types into E.164 for Supabase phone auth. Israeli numbers are the
 * common case ("050-000-0000" → "+972500000000"); anything already international is kept.
 */
export function normalizePhone(raw: string): string | null {
  let s = raw.replace(/[\s\-().]/g, "");
  if (s.startsWith("00")) s = `+${s.slice(2)}`;
  if (s.startsWith("+")) {
    return /^\+[1-9]\d{7,14}$/.test(s) ? s : null;
  }
  if (!/^\d+$/.test(s)) return null;
  if (s.startsWith("972")) s = s.slice(3);
  if (s.startsWith("0")) s = s.slice(1);
  // Israeli mobile/landline without the leading zero: 8–9 digits.
  if (!/^[1-9]\d{7,8}$/.test(s)) return null;
  return `+972${s}`;
}

/** "+972500000000" → "···0000" for display without exposing the whole number. */
export function phoneTail(phone: string, digits = 4): string {
  const d = phone.replace(/\D/g, "");
  return `···${d.slice(-digits)}`;
}
