import type { Locale } from "./messages";

/**
 * Auth-screen strings. Kept apart from `messages.ts` (owned by the i18n work) so the auth layer
 * ships without touching the main dictionary. `he` is the source of truth; `en` mirrors its keys.
 */
const he = {
  brand: "Community Orchestrator",
  loginTitle: "התחברות",
  loginSubtitle: "מנהלי קהילה נכנסים עם Google. חברי קהילה נכנסים עם הטלפון ומקבלים קוד ב-SMS.",
  tabAdmin: "מנהל/ת קהילה",
  tabMember: "חבר/ת קהילה",
  google: "התחברות עם Google",
  googleHint: "רק כתובות שהוגדרו כמנהלות יכולות להיכנס.",
  phoneLabel: "מספר טלפון",
  phonePlaceholder: "050-000-0000",
  phoneHint: "מספר ישראלי (05X) או בינלאומי עם +.",
  sendCode: "שלח קוד",
  codeLabel: "הקוד שקיבלתם ב-SMS",
  codeSentTo: "שלחנו קוד בן 6 ספרות אל",
  verify: "אישור",
  changePhone: "מספר אחר",
  resend: "שלחו שוב",
  errPhoneInvalid: "מספר הטלפון לא תקין — נסו בפורמט 050-000-0000",
  errSendFailed: "שליחת הקוד נכשלה: {msg}",
  errCodeInvalid: "הקוד לא נכון או שפג תוקפו",
  errVerifyFailed: "האימות נכשל: {msg}",
  errGoogleFailed: "ההתחברות עם Google נכשלה: {msg}",
  errOauth: "ההתחברות עם Google לא הושלמה. נסו שוב.",
  errUnauthorized: "החשבון הזה לא מורשה להיכנס. מנהלי קהילה — ודאו שהכתובת הוגדרה ב-ADMIN_EMAILS; חברי קהילה — היכנסו עם הטלפון.",
  notConfiguredTitle: "אימות לא מוגדר",
  notConfiguredBody: "המערכת רצה במצב פיתוח — כל המשתמשים הם מנהלים. כדי להפעיל התחברות הגדירו NEXT_PUBLIC_SUPABASE_URL ו-NEXT_PUBLIC_SUPABASE_ANON_KEY (ראו README).",
  backToApp: "לאפליקציה",
  signOut: "התנתקות",
  askTitle: "שאלו את הקהילה",
  askSubtitle: "שאלה חופשית על האנשים והנושאים בקהילה — Claude עונה מתוך השיחות, עם ציטוטים אמיתיים.",
  askNotAnalyzed: "הקהילה עדיין לא נותחה",
  askNotAnalyzedBody: "מנהל/ת הקהילה עוד לא הריצו ניתוח. נסו שוב מאוחר יותר.",
  adminHome: "לממשק הניהול",
  signedInAs: "מחוברים בתור",
  switchAccount: "להתנתק ולהיכנס עם חשבון אחר",
} as const;

const en: Record<AuthKey, string> = {
  brand: "Community Orchestrator",
  loginTitle: "Sign in",
  loginSubtitle: "Community managers sign in with Google. Members sign in with their phone and an SMS code.",
  tabAdmin: "Community manager",
  tabMember: "Community member",
  google: "Continue with Google",
  googleHint: "Only addresses configured as managers can sign in.",
  phoneLabel: "Phone number",
  phonePlaceholder: "050-000-0000",
  phoneHint: "Israeli number (05X) or international with +.",
  sendCode: "Send code",
  codeLabel: "The code from the SMS",
  codeSentTo: "We sent a 6-digit code to",
  verify: "Verify",
  changePhone: "Use another number",
  resend: "Resend",
  errPhoneInvalid: "Invalid phone number — try the format 050-000-0000",
  errSendFailed: "Sending the code failed: {msg}",
  errCodeInvalid: "The code is wrong or has expired",
  errVerifyFailed: "Verification failed: {msg}",
  errGoogleFailed: "Google sign-in failed: {msg}",
  errOauth: "Google sign-in did not complete. Please try again.",
  errUnauthorized: "This account is not allowed in. Managers: make sure the address is listed in ADMIN_EMAILS; members: sign in with your phone.",
  notConfiguredTitle: "Authentication is not configured",
  notConfiguredBody: "The app is running in development mode — everyone is an admin. To enable sign-in set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see README).",
  backToApp: "Open the app",
  signOut: "Sign out",
  askTitle: "Ask the community",
  askSubtitle: "A free question about the people and topics in the community — Claude answers from the chats, with real quotes.",
  askNotAnalyzed: "The community has not been analyzed yet",
  askNotAnalyzedBody: "The community manager has not run an analysis yet. Please try again later.",
  adminHome: "Admin dashboard",
  signedInAs: "Signed in as",
  switchAccount: "Sign out and use another account",
};

export type AuthKey = keyof typeof he;
export type AuthT = (key: AuthKey, vars?: Record<string, string | number>) => string;

const DICT: Record<Locale, Record<AuthKey, string>> = { he, en };

/** `t(key, vars?)` for the auth screens; `{name}` placeholders are filled from `vars`. */
export function authT(locale: Locale): AuthT {
  const dict = DICT[locale] ?? he;
  return (key, vars) => {
    const s = dict[key] ?? he[key];
    return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
  };
}
