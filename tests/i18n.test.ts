import { describe, expect, it } from "vitest";
import { createT, dateLocaleOf, dirOf, en, he, interpolate, isLocale, type Messages } from "@/lib/i18n/messages";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("i18n dictionary", () => {
  it("en has exactly the keys of he, with the same placeholders", () => {
    const areas = Object.keys(he) as Array<keyof Messages>;
    expect(Object.keys(en).sort()).toEqual([...areas].sort());
    for (const area of areas) {
      const heArea = he[area] as Record<string, string>;
      const enArea = en[area] as Record<string, string>;
      expect(Object.keys(enArea).sort(), `area ${area}`).toEqual(Object.keys(heArea).sort());
      for (const k of Object.keys(heArea)) {
        expect(enArea[k], `${area}.${k} is empty`).not.toBe("");
        expect(placeholders(enArea[k]), `${area}.${k} placeholders`).toEqual(placeholders(heArea[k]));
      }
    }
  });

  it("goal labels in he are the stored values", async () => {
    const { GOALS } = await import("@/lib/goals");
    for (const g of GOALS) expect(he.goals[g.key]).toBe(g.value);
  });

  it("t() interpolates and falls back to the key", () => {
    const t = createT("en");
    expect(t("importBoard.failedSuffix", { n: 3 })).toBe(" · 3 files failed");
    expect(createT("he")("missed.inGroupsMany", { n: 4 })).toBe("ב-4 קבוצות");
    expect(interpolate("{a} / {b}", { a: 1 })).toBe("1 / {b}");
    // @ts-expect-error unknown key
    expect(t("nope.missing")).toBe("nope.missing");
  });

  it("locale helpers", () => {
    expect(isLocale("he")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(dirOf("he")).toBe("rtl");
    expect(dirOf("en")).toBe("ltr");
    expect(dateLocaleOf("he")).toBe("he-IL");
    expect(dateLocaleOf("en")).toBe("en-GB");
  });
});
