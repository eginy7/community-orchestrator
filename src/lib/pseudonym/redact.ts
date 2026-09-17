import { normalizePhone } from "@/lib/parser/normalize";
import type { PseudonymStore } from "./store";

/**
 * Remove personal identifiers that appear INSIDE message bodies.
 * Sender names are handled by the store; this covers phones people paste,
 * @-mentions (WhatsApp exports them as "@972…"), and known member names.
 */

// Israeli mobile in local or international form, tolerant of separators.
const IL_PHONE_RE = /(?<!\d)(?:\+?972[-\s.]?|0)5\d[-\s.]?\d{3}[-\s.]?\d{4}(?!\d)/g;
// Any other international number.
const INTL_PHONE_RE = /(?<![\d\w])\+\d[\d\s\-().]{6,17}\d(?!\d)/g;
// WhatsApp mention token.
const MENTION_RE = /@(\d{9,15})\b/g;

const PHONE_PLACEHOLDER = "[טלפון]";

// Very short or generic names would over-redact ordinary words.
const MIN_NAME_LEN = 4;
const STOP_NAMES = new Set(["test", "admin", "whatsapp", "claude", "user"]);

export interface Redactor {
  redact(text: string): string;
}

export function createRedactor(store: PseudonymStore): Redactor {
  // Build one alternation regex for known names; rebuilt lazily when the store grows.
  let builtFor = -1;
  let nameRe: RegExp | null = null;

  const ensureNameRe = () => {
    if (builtFor === store.size()) return;
    const names = store
      .knownNames()
      .filter(({ name }) => name.length >= MIN_NAME_LEN && !STOP_NAMES.has(name.toLowerCase()) && !/^\+?\d/.test(name));
    builtFor = store.size();
    if (names.length === 0) {
      nameRe = null;
      return;
    }
    const alternation = names.map(({ name }) => escapeRe(name)).join("|");
    // \b does not understand Hebrew letters — use Unicode letter/number lookarounds instead.
    nameRe = new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternation})(?![\\p{L}\\p{N}])`, "gu");
  };

  const phoneToToken = (raw: string) => {
    const digits = normalizePhone(raw);
    const id = digits ? store.lookupPhone(digits) : null;
    return id ? `@${id}` : PHONE_PLACEHOLDER;
  };

  return {
    redact(text: string): string {
      if (!text) return text;
      let out = text.replace(MENTION_RE, (_m, digits: string) => {
        const id = store.lookupPhone(normalizePhone(digits) ?? digits);
        return id ? `@${id}` : PHONE_PLACEHOLDER;
      });
      out = out.replace(IL_PHONE_RE, phoneToToken);
      out = out.replace(INTL_PHONE_RE, phoneToToken);
      ensureNameRe();
      if (nameRe) {
        out = out.replace(nameRe, (m) => {
          const id = store.lookup(m);
          return id ? `@${id}` : m;
        });
      }
      return out;
    },
  };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
