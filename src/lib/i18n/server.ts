import "server-only";
import { cookies } from "next/headers";
import { createT, DEFAULT_LOCALE, isLocale, type Locale, type TFunction } from "./messages";

export { dirOf, dateLocaleOf, createT, isLocale, type Locale, type TFunction, type MessageKey } from "./messages";

export const LOCALE_COOKIE = "locale";

/** UI locale from the `locale` cookie; Hebrew when absent or unknown. */
export async function getLocale(): Promise<Locale> {
  const jar = await cookies();
  const v = jar.get(LOCALE_COOKIE)?.value;
  return isLocale(v) ? v : DEFAULT_LOCALE;
}

/** `t(key, vars?)` for server components and route handlers. */
export function getT(locale: Locale): TFunction {
  return createT(locale);
}
