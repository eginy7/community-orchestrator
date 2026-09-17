import type { Locale } from "./messages";

/**
 * Strings of the "AI news worth talking about" section. Kept apart from `messages.ts` (owned by the
 * i18n work) in the same shape as `auth.ts`. `he` is the source of truth; `en` mirrors its keys.
 */
const he = {
  title: "חדשות AI ומה כדאי לדבר עליו",
  subtitle: "חדשות מהשבוע האחרון, מסוננות לפי מה שהקהילה כבר מדברת עליו — עם הודעה מוכנה לכל פריט.",
  updatedAt: "עודכן {date}",
  itemsCount: "{n} פריטים",
  costLine: "~${cost}",
  empty: "עוד לא נאספו חדשות. לחצו על רענון ו-Claude יחפש מה קרה השבוע ב-AI ויתאים את זה לנושאים החמים בקהילה.",
  refresh: "רענון חדשות",
  refreshing: "מחפש חדשות ומתאים לנושאי הקהילה…",
  refreshed: "נמצאו {n} חדשות רלוונטיות",
  refreshedNone: "לא נמצאו חדשות מתאימות השבוע",
  failed: "רענון החדשות נכשל: {msg}",
  failedNetwork: "רענון החדשות נכשל — בעיית רשת",
  whyNow: "למה עכשיו",
  relatedTopics: "נושאים קשורים",
  postIn: "לפרסם ב-«{group}»",
  postAnywhere: "לפרסם בקבוצה המתאימה",
  suggestedPost: "הודעה מוצעת",
  openSource: "לכתבה המקורית",
  publishedOn: "פורסם {date}",
  errNoCommunity: "עוד אין קהילה",
  errFailed: "רענון החדשות נכשל: {msg}",
} as const;

const en: Record<NewsKey, string> = {
  title: "AI news worth talking about",
  subtitle: "This week's AI news, filtered by what the community is already discussing — with a ready-to-post message for each item.",
  updatedAt: "Updated {date}",
  itemsCount: "{n} items",
  costLine: "~${cost}",
  empty: "No news collected yet. Hit refresh and Claude will search this week's AI news and match it to the community's hot topics.",
  refresh: "Refresh news",
  refreshing: "Searching the news and matching it to the community's topics…",
  refreshed: "Found {n} relevant news items",
  refreshedNone: "No matching news found this week",
  failed: "Refreshing the news failed: {msg}",
  failedNetwork: "Refreshing the news failed — network problem",
  whyNow: "Why now",
  relatedTopics: "Related topics",
  postIn: "Post in «{group}»",
  postAnywhere: "Post in the fitting group",
  suggestedPost: "Suggested post",
  openSource: "Open the source",
  publishedOn: "Published {date}",
  errNoCommunity: "There is no community yet",
  errFailed: "Refreshing the news failed: {msg}",
};

export type NewsKey = keyof typeof he;
export type NewsT = (key: NewsKey, vars?: Record<string, string | number>) => string;

export const NEWS_DICT: Record<Locale, Record<NewsKey, string>> = { he, en };

/** `t(key, vars?)` for the news section; `{name}` placeholders are filled from `vars`. */
export function newsT(locale: Locale): NewsT {
  const dict = NEWS_DICT[locale] ?? he;
  return (key, vars) => {
    const s = dict[key] ?? he[key];
    return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
  };
}
