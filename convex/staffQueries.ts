import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const registrationsFor = internalQuery({
  args: { programId: v.string(), sessionId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("registrations")
      .withIndex("by_programId", (q) => q.eq("programId", args.programId))
      .collect();
    return rows.filter(
      (r) => (r.status === "confirmed" || r.status === "refund_pending") && (!args.sessionId || r.sessionId === args.sessionId),
    );
  },
});

/** Every active registration plus every program definition, for audience building. */
export const audienceData = internalQuery({
  args: {},
  handler: async (ctx) => {
    const regs = (await ctx.db.query("registrations").collect()).filter(
      (r) => r.status === "confirmed" || r.status === "refund_pending",
    );
    const programs = await ctx.db.query("managedPrograms").collect();
    return {
      regs: regs.map((r) => ({
        programId: r.programId,
        sessionId: r.sessionId,
        childName: r.childName,
        parentName: r.parentName,
        parentEmail: r.parentEmail,
        guardian2Name: r.guardian2Name,
        guardian2Email: r.guardian2Email,
      })),
      programs: programs.map((p) => ({ programId: p.programId, data: p.data })),
    };
  },
});

/** Find the Stripe checkout session that paid for this refund's registration. */
export const refundInfo = internalQuery({
  args: { requestId: v.id("refundRequests") },
  handler: async (ctx, args) => {
    const req = await ctx.db.get(args.requestId);
    if (!req) return null;
    const reg = await ctx.db.get(req.registrationId);
    if (!reg) return null;
    const email = reg.parentEmail.toLowerCase();
    const orders = await ctx.db.query("orders").withIndex("by_created").order("desc").take(500);
    const match = orders.find(
      (o) =>
        o.status === "paid" &&
        (o.customerEmail ?? "").toLowerCase() === email &&
        o.amountTotal >= req.refundCents &&
        o.createdAt <= req.createdAt,
    );
    return { refundCents: req.refundCents, sessionId: match?.stripeSessionId ?? null };
  },
});

export const setRefundStripe = internalMutation({
  args: { requestId: v.id("refundRequests"), stripeStatus: v.string(), stripeRefundId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.requestId, { stripeStatus: args.stripeStatus, stripeRefundId: args.stripeRefundId });
  },
});
