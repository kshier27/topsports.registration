import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { allPrograms } from "./programLookup";

const ACTIVE = (s: string) => s === "confirmed" || s === "refund_pending";
const dollars = (c: number) => `$${(c / 100).toFixed(2)}`;
const LOCATION_SLUGS = ["toronto", "york", "oakville", "whitby"];

async function loadSent(ctx: MutationCtx) {
  const row = await ctx.db.query("siteSettings").withIndex("by_key", (q) => q.eq("key", "fillAlerts")).first();
  let sent: string[] = [];
  try {
    sent = row ? (JSON.parse(row.data) as string[]) : [];
  } catch {
    sent = [];
  }
  return { row, sent: new Set(sent) };
}

/**
 * Hourly: email the location inbox when a session (or session option)
 * reaches 90% full, and again when it is full. Each alert is sent once.
 */
export const checkSessionFill = internalMutation({
  args: {},
  handler: async (ctx) => {
    const programs = await allPrograms(ctx);
    const regs = (await ctx.db.query("registrations").collect()).filter((r) => ACTIVE(r.status));
    const counts = new Map<string, number>();
    for (const r of regs) {
      const k = `${r.programId}|${r.sessionId}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
      const base = r.sessionId.split("~")[0];
      if (base !== r.sessionId) counts.set(`${r.programId}|${base}`, (counts.get(`${r.programId}|${base}`) ?? 0) + 1);
    }
    const { row, sent } = await loadSent(ctx);
    let changed = false;
    for (const p of programs) {
      for (const s of p.sessions) {
        const targets = (s.slots ?? []).length > 0
          ? (s.slots ?? []).map((t) => ({ key: `${s.id}~${t.id}`, label: `${s.label} (${t.label})`, cap: t.capacity }))
          : [{ key: s.id, label: s.label, cap: s.capacity }];
        for (const t of targets) {
          if (!t.cap || t.cap <= 0) continue;
          const n = counts.get(`${p.id}|${t.key}`) ?? 0;
          const level = n >= t.cap ? "full" : n / t.cap >= 0.9 ? "90" : null;
          if (!level) continue;
          const id = `${p.id}|${t.key}|${level}`;
          if (sent.has(id)) continue;
          sent.add(id);
          changed = true;
          await ctx.scheduler.runAfter(0, internal.notify.sendLocationCopy, {
            locationSlug: p.locationSlug,
            subject: level === "full" ? `Session Full — ${p.name}` : `Session 90% Full — ${p.name}`,
            lines: [
              `${p.name} · ${t.label}`,
              `${n} of ${t.cap} spots taken${level === "full" ? ". New families can join the waitlist." : "."}`,
              `Dates: ${s.dates} · ${s.days} · ${s.time}`,
            ],
          });
        }
      }
    }
    if (!changed) return;
    const data = JSON.stringify([...sent].slice(-2000));
    if (row) await ctx.db.patch(row._id, { data, updatedAt: Date.now() });
    else await ctx.db.insert("siteSettings", { key: "fillAlerts", data, updatedAt: Date.now(), updatedBy: "system" });
  },
});

/** Mondays: weekly summary email to each location inbox. */
export const sendWeeklySummary = internalMutation({
  args: {},
  handler: async (ctx) => {
    const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const programs = await allPrograms(ctx);
    const names = new Map(programs.map((p) => [p.id, p.name]));
    const regs = await ctx.db.query("registrations").collect();
    const refunds = await ctx.db.query("refundRequests").collect();
    const waitlist = await ctx.db.query("waitlist").collect();
    const regById = new Map(regs.map((r) => [r._id as string, r]));
    for (const slug of LOCATION_SLUGS) {
      const recent = regs.filter((r) => r.locationSlug === slug && r._creationTime >= since && !r.transferredFrom);
      const kept = recent.filter((r) => ACTIVE(r.status));
      const revenue = kept.reduce((a, r) => a + r.amountCents, 0);
      const locRefunds = refunds.filter((f) => regById.get(f.registrationId as string)?.locationSlug === slug);
      const pending = locRefunds.filter((f) => f.status === "pending").length;
      const refundedWeek = locRefunds.filter((f) => f.status === "approved" && (f.processedAt ?? f.createdAt) >= since);
      const locWait = waitlist.filter((w) => w.locationSlug === slug);
      const waiting = locWait.filter((w) => w.status === "waiting").length;
      const joined = locWait.filter((w) => w.createdAt >= since).length;
      const offered = locWait.filter((w) => w.status === "offered").length;
      const byProgram = new Map<string, number>();
      for (const r of kept) byProgram.set(r.programId, (byProgram.get(r.programId) ?? 0) + 1);
      const top = [...byProgram.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, n]) => `• ${names.get(id) ?? id}: ${n}`);
      await ctx.scheduler.runAfter(0, internal.notify.sendLocationCopy, {
        locationSlug: slug,
        subject: "Weekly Summary — last 7 days",
        lines: [
          `New registrations: ${kept.length}`,
          `Revenue (gross): ${dollars(revenue)}`,
          `Refunds issued: ${refundedWeek.length} (${dollars(refundedWeek.reduce((a, f) => a + f.refundCents, 0))})`,
          `Pending refund requests: ${pending}`,
          `Waitlist: ${waiting} waiting · ${joined} joined this week · ${offered} offers open`,
          top.length ? "Top programs this week:" : "No new registrations this week.",
          ...top,
        ],
      });
    }
  },
});
