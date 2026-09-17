/**
 * Insert a synthetic "done" analysis run so the Home UI can be exercised without an API key.
 * Uses real message ids from the DB as evidence (so quotes render), and only pseudonym ids.
 *   pnpm tsx scripts/seed-demo-run.ts
 */
import { desc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { analysisRuns, communities, groups, memberProfiles, members, messages, recommendations, threads, topics } from "@/lib/db/schema";

const db = getDb();
const community = db.select().from(communities).get();
if (!community) throw new Error("run scripts/seed.ts first");
const group = db.select().from(groups).get()!;
const ms = db.select().from(members).orderBy(desc(members.messageCount)).limit(2).all();
if (ms.length < 2) throw new Error("need at least 2 members");
const [a, b] = ms.map((m) => m.id);
const msgs = db.select({ id: messages.id, memberId: messages.memberId }).from(messages).orderBy(desc(messages.id)).limit(400).all().filter((m) => m.memberId && m.memberId.length > 0);
const evA = msgs.filter((m) => m.memberId === a).slice(0, 2);
const evB = msgs.filter((m) => m.memberId === b).slice(0, 2);

const run = db
  .insert(analysisRuns)
  .values({
    communityId: community.id,
    status: "done",
    stage: "B",
    params: { sinceMs: null, groupIds: [group.id] },
    communityPulse: `השבוע הקהילה עסוקה בעיקר בבניית סוכנים עם Claude Code ובשאלות על דפלוי. @${a} ו-@${b} מובילים את רוב השיחה, ויש כמה שאלות פתוחות שאף אחד לא ענה עליהן.`,
    progress: { stage: "B", chunksDone: 4, chunksTotal: 4, currentGroup: null, tokensIn: 360000, tokensOut: 41000, cacheRead: 250000, costUsd: 3.2, log: ["demo"] },
    startedAt: new Date(),
    finishedAt: new Date(),
  })
  .returning()
  .get();

db.insert(recommendations)
  .values([
    {
      runId: run.id,
      communityId: community.id,
      rank: 1,
      type: "connect",
      tier: "do_now",
      title: `חבר/י בין @${a} ל-@${b}`,
      why: `@${a} שאל/ה כמה פעמים על אינטגרציה של סוכן קולי עם Twilio, ו-@${b} שיתף/ה לפני חודשיים פרויקט דומה. הם לא דיברו ישירות.`,
      whyNow: "השאלה עלתה שוב השבוע ונשארה בלי מענה.",
      evidence: [...evA, ...evB].map((m) => ({ message_id: m.id, member_id: m.memberId!, why_relevant: "הודעה רלוונטית לחיבור" })),
      people: [
        { member_id: a, role: "introducee", reason: "מחפש/ת עזרה בסוכן קולי" },
        { member_id: b, role: "introducee", reason: "בנה/תה סוכן קולי עם Twilio" },
      ],
      whereGroupId: null,
      action: "לפתוח קבוצת וואטסאפ קטנה עם שניהם ולשלוח את ההודעה.",
      readyMessage: `היי @${a} ו-@${b} 👋\nרציתי לחבר ביניכם: @${a} בונה עכשיו סוכן קולי ומתלבט/ת על Twilio, ו-@${b} כבר עבר/ה את הדרך הזאת עם פרויקט דומה לפני כמה חודשים.\nנראה לי שיש לכם על מה לדבר 🙂`,
      extras: { agenda: [], first_task: null, timeline: null, expected_impact: "שאלה פתוחה נסגרת ונוצר חיבור בין שני בילדרים פעילים" },
      confidence: "high",
    },
    {
      runId: run.id,
      communityId: community.id,
      rank: 2,
      type: "working_group",
      tier: "organize",
      title: "להקים קבוצת עבודה של שבועיים: Voice Agents Builders",
      why: "כמה חברים דיברו באופן עצמאי על סוכנים קוליים בשבועיים האחרונים.",
      whyNow: "המומנטום גבוה עכשיו; בעוד חודש זה יתפזר.",
      evidence: evA.map((m) => ({ message_id: m.id, member_id: m.memberId!, why_relevant: "דיון על סוכנים קוליים" })),
      people: [
        { member_id: a, role: "participant", reason: "בונה סוכן קולי" },
        { member_id: b, role: "lead", reason: "ניסיון קודם, מסביר/ה טוב" },
      ],
      whereGroupId: group.id,
      action: "לפרסם את הודעת הקיקאוף בקבוצה ולפתוח קבוצה ייעודית למי שמצטרף.",
      readyMessage: "מי בונה סוכנים קוליים? 🎙️\nפותחים קבוצת עבודה של שבועיים: כל אחד בונה ומפרסם flow קולי אחד עד סוף השבועיים, ונעשה demo day קטן בסוף.\nתגידו 'בפנים' 👇",
      extras: { agenda: ["קיקאוף: מה כל אחד בונה", "שבוע 1: prototype", "שבוע 2: פוליש + demo day"], first_task: "לשתף בקבוצה משפט אחד על ה-flow שאתם בונים", timeline: "שבועיים, demo day ביום חמישי", expected_impact: "4-7 פרויקטים מפורסמים, קשרים בין הבונים" },
      confidence: "medium",
    },
    {
      runId: run.id,
      communityId: community.id,
      rank: 3,
      type: "event",
      tier: "plan",
      title: "סשן בנייה של 60 דקות: Claude Code מאפס לדפלוי",
      why: "Claude Code הוא הנושא הצומח ביותר בקבוצה.",
      whyNow: "יש כרגע שני חברים שיכולים להנחות.",
      evidence: evB.map((m) => ({ message_id: m.id, member_id: m.memberId!, why_relevant: "שיתוף על Claude Code" })),
      people: [{ member_id: b, role: "host", reason: "שיתף/ה דפלוי מלא" }],
      whereGroupId: group.id,
      action: "לתאם תאריך עם המנחה ולפרסם בקבוצת ההודעות.",
      readyMessage: "סשן בנייה חי: Claude Code מאפס לדפלוי 🚀\n60 דקות, בונים ביחד, שואלים בזמן אמת.\nמי רוצה להצטרף? 🙋",
      extras: { agenda: ["10 דק׳ setup", "35 דק׳ בנייה חיה", "15 דק׳ שאלות"], first_task: null, timeline: "בשבועיים הקרובים", expected_impact: "עשרות משתתפים, תוכן מוקלט לקהילה" },
      confidence: "medium",
    },
  ])
  .run();

db.insert(topics)
  .values([
    { runId: run.id, name: "Claude Code", aliases: ["claude code"], summary: "שאלות על דפלוי, hooks ו-skills", memberIds: [a, b], messageIds: evB.map((m) => m.id), groupIds: [group.id], momentum: "rising", workshopPotential: "high" },
    { runId: run.id, name: "סוכנים קוליים", aliases: ["voice agents"], summary: "Twilio, latency, TTS", memberIds: [a], messageIds: evA.map((m) => m.id), groupIds: [group.id], momentum: "steady", workshopPotential: "medium" },
  ])
  .run();

db.insert(memberProfiles)
  .values([
    { runId: run.id, memberId: a, oneLiner: "בונה סוכן קולי, שואל/ת הרבה ומיישם/ת מהר", interests: ["voice agents", "Claude Code"], expertise: ["Next.js"], asks: evA.map((m) => ({ text: "עזרה עם Twilio", message_id: m.id, resolved: false })), offers: [], projects: [], roleSignals: ["builder", "asker"], groupIds: [group.id], richness: 6 },
    { runId: run.id, memberId: b, oneLiner: "עוזר/ת לאחרים, שיתף/ה דפלוי מלא של סוכן", interests: ["Claude Code"], expertise: ["Twilio", "Cloudflare"], asks: [], offers: evB.map((m) => ({ text: "הצעת עזרה", message_id: m.id })), projects: [], roleSignals: ["helper", "potential_host"], groupIds: [group.id], richness: 8 },
  ])
  .run();

db.insert(threads)
  .values([{ runId: run.id, groupId: group.id, kind: "unanswered", title: "איך מורידים latency בסוכן קולי?", summary: "שאלה ללא מענה מלפני יומיים", status: "open", memberIds: [a], messageIds: evA.map((m) => m.id), ts: new Date() }])
  .run();

console.log(`demo run #${run.id} inserted with 3 recommendations`);
