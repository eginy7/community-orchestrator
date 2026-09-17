"use client";

import { createContext, useContext, useMemo } from "react";
import { createT, dateLocaleOf, DEFAULT_LOCALE, dirOf, type Locale, type TFunction } from "./messages";

export interface LocaleContextValue {
  locale: Locale;
  t: TFunction;
  dir: "rtl" | "ltr";
  /** BCP-47 tag for `toLocaleDateString` / `toLocaleString`. */
  dateLocale: "he-IL" | "en-GB";
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function build(locale: Locale): LocaleContextValue {
  return { locale, t: createT(locale), dir: dirOf(locale), dateLocale: dateLocaleOf(locale) };
}

export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const value = useMemo(() => build(locale), [locale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/** Locale, direction and `t` for client components. Falls back to Hebrew outside a provider (tests, isolated renders). */
export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext) ?? build(DEFAULT_LOCALE);
}

export function useT(): TFunction {
  return useLocale().t;
}
