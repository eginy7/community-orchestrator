import type { TFunction } from "@/lib/i18n/messages";

/**
 * Community goal presets offered during onboarding (from the product brief).
 * The Hebrew `value` is the canonical stored string (it is what goes to the model);
 * `key` picks the translated label shown in the UI.
 */
export const GOALS = [
  { key: "connections", value: "להגדיל חיבורים משמעותיים בין חברים" },
  { key: "collaborate", value: "לעזור לחברים לשתף פעולה ולבנות יחד" },
  { key: "events", value: "ליצור יותר אירועים וסדנאות" },
  { key: "workingGroups", value: "להקים קבוצות עבודה ממוקדות" },
  { key: "quietMembers", value: "להגדיל השתתפות של חברים שקטים" },
  { key: "learn", value: "לעזור לחברים ללמוד אחד מהשני" },
] as const;

export type GoalKey = (typeof GOALS)[number]["key"];

/** Stored values, in display order. */
export const GOAL_OPTIONS: string[] = GOALS.map((g) => g.value);

/** UI label for a stored goal value; unknown (custom) values are shown as-is. */
export function goalLabel(value: string, t: TFunction): string {
  const g = GOALS.find((x) => x.value === value);
  return g ? t(`goals.${g.key}`) : value;
}
