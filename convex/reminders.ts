import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { loadReplyBook, pickReplyTo } from "./replyTo";
import { allPrograms } from "./programLookup";
import { sessionRange, sessionName } from "../src/data/registration";

type Reminder = {
  to: string;
  locationSlug: string;
  parentName: string;
  childName: string;
  programName: string;
  session: string;
  days: string;
  time: string;
  venue: string;
  outDates: string;
  startDate: string;
  subject?: string;
  message?: string;
  whatToBring?: string;
};

const DEFAULT_BRING = "Water bottle, weather-appropriate clothing, any required equipment and a nut-free lunch & snacks for camps.";

/** Replace {child}, {parent}, {program}, {session}, {startDate}, {venue} in custom text. */
function fill(t: string, m: Reminder): string {
  return t
    .replace(/\{child\}/gi, m.childName)
    .replace(/\{parent\}/gi, m.parentName)
    .replace(/\{program\}/gi, m.programName)
    .replace(/\{session\}/gi, m.session)
    .replace(/\{startDate\}/gi, m.startDate)
    .replace(/\{venue\}/gi, m.venue);
}
const paras = (t: string) => esc(t).split(/\n{2,}/).map((x) => `<p>${x.replace(/\n/g, "<br/>")}</p>`).join("");

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Families whose program (with reminders on) starts exactly 3 days from today. */
export const dueReminders = internalQuery({
  args: {},
  handler: async (ctx): Promise<Reminder[]> => {
    const programs = (await allPrograms(ctx)).filter((p) => p.remindersEnabled !== false);
    const out: Reminder[] = [];
    for (const p of programs) {
      const daysBefore = Math.min(30, Math.max(1, Math.round(p.reminderEmail?.daysBefore ?? 3)));
      const target = new Date();
      target.setDate(target.getDate() + daysBefore);
      const key = target.toDateString();
      const starting = p.sessions.filter((s) => sessionRange(s.dates, p.season)[0].toDateString() === key);
      if (starting.length === 0) continue;
      const regs = await ctx.db
        .query("registrations")
        .withIndex("by_programId", (q) => q.eq("programId", p.id))
        .collect();
      for (const s of starting) {
        for (const r of regs.filter((x) => x.sessionId === s.id && x.status === "confirmed")) {
          out.push({
            to: r.parentEmail,
            locationSlug: r.locationSlug || p.locationSlug,
            parentName: r.parentName.split(" ")[0] || "there",
            childName: r.childName.split(" ")[0],
            programName: p.name,
            session: sessionName(s),
            days: s.days,
            time: s.time,
            venue: s.location || p.venue,
            outDates: (p.outDates ?? []).map((o) => `${o.date}${o.note ? ` (${o.note})` : ""}`).join(", ") || "None",
            startDate: target.toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" }),
            subject: p.reminderEmail?.subject?.trim() || undefined,
            message: p.reminderEmail?.message?.trim() || undefined,
            whatToBring: p.reminderEmail?.whatToBring?.trim() || undefined,
          });
        }
      }
    }
    return out;
  },
});

/** Daily: email a "starts soon" reminder 3 days before each session. */
export const sendProgramReminders = internalAction({
  args: {},
  handler: async (ctx) => {
    const url = process.env.SHIPPER_EMAIL_URL;
    const token = process.env.SHIPPER_EMAIL_TOKEN;
    if (!url || !token) return { sent: 0 };
    const list: Reminder[] = await ctx.runQuery(internal.reminders.dueReminders, {});
    const book = await loadReplyBook(ctx);
    let sent = 0;
    for (const m of list) {
      const html = `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;padding:24px 0;font-family:Arial,sans-serif"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#1b2a57;color:#ffffff;padding:24px"><p style="margin:0;font-size:12px;letter-spacing:2px;text-transform:uppercase">TOP Sports</p><h1 style="margin:6px 0 0;font-size:22px">${esc(m.childName)}'s Program Starts ${esc(m.startDate)}</h1></td></tr>
<tr><td style="padding:24px;color:#1b2a57;font-size:14px;line-height:1.6">
${m.message ? paras(fill(m.message, m)) : `<p>Hi ${esc(m.parentName)}, this is a friendly reminder that <strong>${esc(m.programName)}</strong> starts soon.</p>`}
<table cellpadding="6" style="font-size:14px;color:#1b2a57">
<tr><td><strong>Session</strong></td><td>${esc(m.session)}</td></tr>
<tr><td><strong>Schedule</strong></td><td>${esc(m.days)} · ${esc(m.time)}</td></tr>
<tr><td><strong>Venue</strong></td><td>${esc(m.venue)}</td></tr>
<tr><td><strong>Out Dates</strong></td><td>${esc(m.outDates)}</td></tr>
</table>
<p><strong>What to bring:</strong> ${esc(fill(m.whatToBring ?? DEFAULT_BRING, m))}</p>
<p>See your full schedule anytime in My Schedule.</p></td></tr></table></td></tr></table>`;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Shipper-Token": token },
          body: JSON.stringify({ to: m.to, replyTo: pickReplyTo(book, m.locationSlug), subject: m.subject ? fill(m.subject, m) : `Reminder: ${m.programName} Starts ${m.startDate}`, html }),
        });
        if (res.ok) sent++;
      } catch {
        /* continue */
      }
    }
    return { sent };
  },
});
