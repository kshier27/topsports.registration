import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { authComponent } from "./auth";
import { offerNextSpot } from "./waitlist";
import { internal } from "./_generated/api";
import { assertChangeAllowed } from "./programLookup";

/** Admin fee withheld on refund-to-card requests (cents). */
export const REFUND_ADMIN_FEE_CENTS = 5000;

interface BetterAuthUser {
  _id: string;
  email: string;
  name?: string | null;
}

/** Staff = emails listed in the STAFF_EMAILS env var (comma separated). */
/** Super Admins always have full staff access. */
export const SUPER_ADMINS = ["kevin@topsports.ca"];

export function isSuperAdmin(user: { email?: string | null } | null): boolean {
  return !!user?.email && SUPER_ADMINS.includes(user.email.toLowerCase());
}

/** Staff = super admins, invited staff (staffMembers table) or STAFF_EMAILS env. */
export async function isStaff(ctx: { db: QueryCtx["db"] }, user: BetterAuthUser | null): Promise<boolean> {
  if (!user?.email) return false;
  const email = user.email.toLowerCase();
  if (SUPER_ADMINS.includes(email)) return true;
  const invited = await ctx.db.query("staffMembers").withIndex("by_email", (q) => q.eq("email", email)).first();
  if (invited) return true;
  const list = (process.env.STAFF_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(user.email.toLowerCase());
}

/** Whether the signed-in user can review refunds. */
export const amIStaff = query({
  args: {},
  handler: async (ctx) => {
    const user = (await authComponent.getAuthUser(ctx)) as BetterAuthUser | null;
    return await isStaff(ctx, user);
  },
});

async function creditBalance(ctx: QueryCtx, userId: string): Promise<number> {
  const rows = await ctx.db
    .query("ledger")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return rows
    .filter((r) => r.type === "credit" || r.type === "credit_used")
    .reduce((s, r) => s + r.amountCents, 0);
}

/** Family account summary: credit balance + full ledger (newest first). */
export const getAccount = query({
  args: {},
  handler: async (ctx) => {
    const user = (await authComponent.getAuthUser(ctx)) as BetterAuthUser | null;
    if (!user) return null;
    const ledger = await ctx.db
      .query("ledger")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
    const refunds = await ctx.db
      .query("refundRequests")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    return { creditCents: await creditBalance(ctx, user._id), ledger, refunds };
  },
});

/** Family: every registration row owned by the signed-in user. */
export const myRegistrations = query({
  args: {},
  handler: async (ctx) => {
    const user = (await authComponent.getAuthUser(ctx)) as BetterAuthUser | null;
    if (!user) return null;
    return await ctx.db
      .query("registrations")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
  },
});

/** Record the payment ledger entry for a registration created at checkout. */
export const recordPayment = mutation({
  args: { registrationId: v.id("registrations"), description: v.string(), creditUsedCents: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = (await authComponent.getAuthUser(ctx)) as BetterAuthUser | null;
    if (!user) throw new Error("Not authenticated");
    const reg = await ctx.db.get(args.registrationId);
    if (!reg || reg.userId !== user._id) throw new Error("Registration not found");
    const now = Date.now();
    const used = Math.max(0, Math.round(args.creditUsedCents ?? 0));
    if (used > 0) {
      const balance = await creditBalance(ctx, user._id);
      if (used > balance) throw new Error("Not enough account credit");
      await ctx.db.insert("ledger", { userId: user._id, type: "credit_used", description: "Account credit applied at checkout", amountCents: -used, registrationId: reg._id, createdAt: now });
    }
    await ctx.db.insert("ledger", { userId: user._id, type: "payment", description: args.description, amountCents: -reg.amountCents, registrationId: reg._id, createdAt: now });
    return reg._id;
  },
});

/**
 * Move a confirmed registration to another session/option of the same program.
 * Price difference settles through account credit; upgrades are blocked when
 * credit is insufficient. The original row is kept (status "transferred").
 */
export const transferRegistration = mutation({
  args: {
    id: v.id("registrations"),
    sessionId: v.string(),
    amountCents: v.number(),
    description: v.string(),
  },
  handler: async (ctx, args) => {
    const user = (await authComponent.getAuthUser(ctx)) as BetterAuthUser | null;
    if (!user) throw new Error("Not authenticated");
    const old = await ctx.db.get(args.id);
    if (!old || old.userId !== user._id) throw new Error("Registration not found");
    if (old.status !== "confirmed") throw new Error("Only confirmed registrations can be transferred");
    await assertChangeAllowed(ctx, old.programId);
    const newAmount = Math.max(0, Math.round(args.amountCents));
    const diff = old.amountCents - newAmount; // + = family is owed
    if (diff < 0) {
      const balance = await creditBalance(ctx, user._id);
      if (balance < -diff) throw new Error("Not enough account credit to cover the price difference");
    }
    const { _id, _creationTime, ...rest } = old;
    void _id;
    void _creationTime;
    const nextId = await ctx.db.insert("registrations", {
      ...rest,
      sessionId: args.sessionId,
      amountCents: newAmount,
      status: "confirmed",
      transferredFrom: old._id,
      transferredTo: undefined,
    });
    await ctx.db.patch(old._id, { status: "transferred", transferredTo: nextId });
    if (old.sessionId !== args.sessionId) await offerNextSpot(ctx, old.programId, old.sessionId);
    const now = Date.now();
    await ctx.scheduler.runAfter(0, internal.notify.sendLocationCopy, {
      locationSlug: old.locationSlug,
      subject: `Transfer — ${old.childName}`,
      lines: [args.description, `Participant: ${old.childName}`, `Parent: ${old.parentName} (${old.parentEmail})`, `New amount: ${(newAmount / 100).toFixed(2)}`, `Program: ${old.programId} · Session: ${args.sessionId}`],
    });
    await ctx.db.insert("ledger", { userId: user._id, type: "transfer", description: args.description, amountCents: 0, registrationId: nextId, createdAt: now });
    if (diff > 0) await ctx.db.insert("ledger", { userId: user._id, type: "credit", description: "Price difference from transfer", amountCents: diff, registrationId: nextId, createdAt: now });
    if (diff < 0) await ctx.db.insert("ledger", { userId: user._id, type: "credit_used", description: "Credit applied to transfer upgrade", amountCents: diff, registrationId: nextId, createdAt: now });
    return { id: nextId, diffCents: diff };
  },
});

/**
 * Withdraw from a confirmed registration.
 * - "credit": full paid value goes to account credit immediately.
 * - "refund": creates a pending refund request (paid less admin fee) for staff review.
 */
export const withdrawRegistration = mutation({
  args: {
    id: v.id("registrations"),
    method: v.union(v.literal("credit"), v.literal("refund")),
    description: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = (await authComponent.getAuthUser(ctx)) as BetterAuthUser | null;
    if (!user) throw new Error("Not authenticated");
    const reg = await ctx.db.get(args.id);
    if (!reg || reg.userId !== user._id) throw new Error("Registration not found");
    if (reg.status !== "confirmed") throw new Error("This registration is no longer active");
    const now = Date.now();
    if (args.method === "credit") throw new Error("Account credit withdrawals are no longer offered");
    await assertChangeAllowed(ctx, reg.programId);
    // Eligibility (30 days before start / May 31 for summer camps) is checked in the
    // registration screen; eligible refunds are approved automatically.
    const refundCents = Math.max(0, reg.amountCents - REFUND_ADMIN_FEE_CENTS);
    await ctx.db.patch(reg._id, { status: "refunded" });
    const requestId = await ctx.db.insert("refundRequests", {
      userId: user._id,
      registrationId: reg._id,
      paidCents: reg.amountCents,
      adminFeeCents: Math.min(reg.amountCents, REFUND_ADMIN_FEE_CENTS),
      refundCents,
      reason: args.reason,
      status: "approved",
      createdAt: now,
      processedAt: now,
    });
    await offerNextSpot(ctx, reg.programId, reg.sessionId);
    await ctx.scheduler.runAfter(0, internal.staffOps.processStripeRefund, { requestId });
    await ctx.db.insert("ledger", { userId: user._id, type: "refund", description: "Refund to card (less $50 admin fee)", amountCents: refundCents, registrationId: reg._id, createdAt: now });
    await ctx.scheduler.runAfter(0, internal.notify.sendLocationCopy, {
      locationSlug: reg.locationSlug,
      subject: `Refund Approved — ${reg.childName}`,
      lines: [`Withdrawal: ${args.description}`, `Participant: ${reg.childName}`, `Parent: ${reg.parentName} (${reg.parentEmail})`, `Paid: ${(reg.amountCents / 100).toFixed(2)} · Admin fee: $50.00 · Refund: ${(refundCents / 100).toFixed(2)}`, args.reason ? `Reason: ${args.reason}` : "Reason: not given"],
    });
    return { amountCents: refundCents, pending: false };
  },
});

/** Cancel a pending refund request and restore the registration. */
export const cancelRefundRequest = mutation({
  args: { id: v.id("refundRequests") },
  handler: async (ctx, args) => {
    const user = (await authComponent.getAuthUser(ctx)) as BetterAuthUser | null;
    if (!user) throw new Error("Not authenticated");
    const req = await ctx.db.get(args.id);
    if (!req || req.userId !== user._id) throw new Error("Request not found");
    if (req.status !== "pending") throw new Error("This request has already been processed");
    await ctx.db.patch(req._id, { status: "cancelled", processedAt: Date.now() });
    await ctx.db.patch(req.registrationId, { status: "confirmed" });
    return req._id;
  },
});

/**
 * Staff: approve or decline a refund request. Approval writes the refund to the
 * ledger and marks the registration refunded; decline restores it.
 */
export const processRefundRequest = mutation({
  args: { id: v.id("refundRequests"), decision: v.union(v.literal("approved"), v.literal("declined")) },
  handler: async (ctx, args) => {
    const user = (await authComponent.getAuthUser(ctx)) as BetterAuthUser | null;
    if (!user) throw new Error("Not authenticated");
    if (!(await isStaff(ctx, user))) throw new Error("Only staff can process refund requests");
    const req = await ctx.db.get(args.id);
    if (!req) throw new Error("Request not found");
    if (req.status !== "pending") throw new Error("This request has already been processed");
    const now = Date.now();
    await ctx.db.patch(req._id, { status: args.decision, processedAt: now });
    {
      const r0 = await ctx.db.get(req.registrationId);
      await ctx.db.insert("activityLog", { actor: user.email, action: args.decision === "approved" ? "Approved refund" : "Declined refund", detail: `${r0?.childName ?? "Registration"} · ${(req.refundCents / 100).toFixed(2)}`, createdAt: now });
    }
    if (args.decision === "approved") {
      await ctx.db.patch(req.registrationId, { status: "refunded" });
      const reg = await ctx.db.get(req.registrationId);
      if (reg) await offerNextSpot(ctx, reg.programId, reg.sessionId);
      await ctx.scheduler.runAfter(0, internal.staffOps.processStripeRefund, { requestId: req._id });
      await ctx.db.insert("ledger", { userId: req.userId, type: "refund", description: "Refund to card (less $50 admin fee)", amountCents: req.refundCents, registrationId: req.registrationId, createdAt: now });
    } else {
      await ctx.db.patch(req.registrationId, { status: "confirmed" });
    }
    return req._id;
  },
});

/** Staff: pending refund requests, oldest first. */
export const listPendingRefunds = query({
  args: {},
  handler: async (ctx) => {
    const user = (await authComponent.getAuthUser(ctx)) as BetterAuthUser | null;
    if (!user || !(await isStaff(ctx, user))) return [];
    const rows = await ctx.db
      .query("refundRequests")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("asc")
      .collect();
    return await Promise.all(rows.map(async (r) => ({ ...r, registration: await ctx.db.get(r.registrationId) })));
  },
});
