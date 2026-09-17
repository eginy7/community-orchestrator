"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

/** Toggle between real names and pseudonyms (for screenshots / public demos). */
export async function toggleNames(): Promise<void> {
  const jar = await cookies();
  const current = jar.get("show_names")?.value !== "0";
  jar.set("show_names", current ? "0" : "1", { path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
}
