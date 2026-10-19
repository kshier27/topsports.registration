import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { loadReplyBook } from "./replyTo";
import { v } from "convex/values";

const DAY = 24 * 60 * 60 * 1000;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const recordPendingCart = internalMutation({
  args: { email: v.string(), stripeSessionId: v.string(), summary: v.string(), dueCents: v.number() },
  handler: async (ctx, args) => {
    await ctx.db.insert("pendingCarts", { ...args, reminded: false, createdAt: Date.now() });
  },
});

type Due = { id: string; email: string; summary: string; dueCents: number };

/** Unpaid checkouts older than 24h (and under 3 days), one per email, not yet reminded. */
export const dueCarts = internalQuery({
  args: {},
  handler: async (ctx): Promise<Due[]> => {
    const now = Date.now();
    const rows = await ctx.db.query("pendingCarts").withIndex("by_reminded", (q) => q.eq("reminded", false)).take(500);
    const out: Due[] = [];
    const seen = new Set<string>();
    for (const r of rows) {
      if (now - r.createdAt < DAY || now - r.createdAt > 3 * DAY) continue;
      const order = await ctx.db.query("orders").withIndex("by_session", (q) => q.eq("stripeSessionId", r.stripeSessionId)).first();
      if (order?.status === "paid") continue;
      // Skip if the same family paid any later checkout.
      const later = await ctx.db.query("orders").withIndex("by_created", (q) => q.gt("createdAt", r.createdAt)).collect();
      if (later.some((o) => o.status === "paid" && (o.customerEmail ?? "").toLowerCase() === r.email.toLowerCase())) continue;
      if (seen.has(r.email)) continue;
      seen.add(r.email);
      out.push({ id: r._id, email: r.email, summary: r.summary, dueCents: r.dueCents });
    }
    return out;
  },
});

export const markReminded = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("pendingCarts").withIndex("by_reminded", (q) => q.eq("reminded", false)).take(500);
    for (const r of rows) if (r.email === args.email) await ctx.db.patch(r._id, { reminded: true });
  },
});

/** Hourly: remind families who started checkout 24h ago but never paid. */
export const sendAbandonedCartReminders = internalAction({
  args: {},
  handler: async (ctx) => {
    const url = process.env.SHIPPER_EMAIL_URL;
    const token = process.env.SHIPPER_EMAIL_TOKEN;
    if (!url || !token) return { sent: 0 };
    const list: Due[] = await ctx.runQuery(internal.abandoned.dueCarts, {});
    const book = await loadReplyBook(ctx);
    let sent = 0;
    for (const c of list) {
      const html = `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;padding:24px 0;font-family:Arial,sans-serif"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#1b2a57;color:#ffffff;padding:24px"><p style="margin:0;font-size:12px;letter-spacing:2px;text-transform:uppercase">TOP Sports</p><h1 style="margin:6px 0 0;font-size:22px">Your Registration Isn't Finished Yet</h1></td></tr>
<tr><td style="padding:24px;color:#1b2a57;font-size:14px;line-height:1.6">
<p>Hi there, you started registering but didn't complete payment, so your spot isn't held yet.</p>
<p><strong>In your cart:</strong> ${esc(c.summary)}</p>
<p><strong>Total due:</strong> $${(c.dueCents / 100).toFixed(2)} CAD</p>
<p>Spots fill up quickly. Sign in on the same device and open your cart to finish registering.</p></td></tr></table></td></tr></table>`;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Shipper-Token": token },
          body: JSON.stringify({ to: c.email, replyTo: book.support, subject: "Finish Your TOP Sports Registration", html }),
        });
        if (res.ok) sent++;
      } catch {
        /* continue */
      }
      await ctx.runMutation(internal.abandoned.markReminded, { email: c.email });
    }
    return { sent };
  },
});
