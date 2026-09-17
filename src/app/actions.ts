"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/server";

const ONE_YEAR = 60 * 60 * 24 * 365;

/** Toggle between real names and pseudonyms (for screenshots / public demos). */
export async function toggleNames(): Promise<void> {
  const jar = await cookies();
  const current = jar.get("show_names")?.value !== "0";
  jar.set("show_names", current ? "0" : "1", { path: "/", maxAge: ONE_YEAR });
  revalidatePath("/", "layout");
}

/** Switch the UI language (Hebrew/RTL or English/LTR). The value arrives from the client, so it is validated. */
export async function setLocale(locale: unknown): Promise<void> {
  if (!isLocale(locale)) return;
  const jar = await cookies();
  jar.set(LOCALE_COOKIE, locale, { path: "/", maxAge: ONE_YEAR });
  revalidatePath("/", "layout");
}
