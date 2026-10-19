import { mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { authComponent } from "./auth";
import { isStaff } from "./registrationOps";
import { offerNextSpot } from "./waitlist";
import { internal } from "./_generated/api";
import { findProgram } from "./programLookup";

interface BetterAuthUser {
  _id: string;
  email: string;
  name?: string | null;
}

const ACTIVE = (s: string) => s === "confirmed" || s === "refund_pending";
const dollars = (c: number) => `$${(c / 100).toFixed(2)}`;

async function requireStaff(ctx: MutationCtx): Promise<BetterAuthUser> {
  const user = (await authComponent.getAuthUser(ctx)) as BetterAuthUser | null;
  if (!user) throw new Error("Not authenticated");
  if (!(await isStaff(ctx, user))) throw new Error("Only staff can change registrations");
  return user;
}

async function loadActive(ctx: MutationCtx, id: Id<"registrations">): Promise<Doc<"registrations">> {
  const reg = await ctx.db.get(id);
  if (!reg) throw new Error("Registration not found");
  if (!ACTIVE(reg.status)) throw new Error("This registration is already cancelled, refunded, credited or transferred");
  return reg;
}

async function describe(ctx: MutationCtx, programId: string, sessionId: string) {
  const p = await findProgram(ctx, programId);
  const [baseSid, slotId] = sessionId.split("~");
  const s = p?.sessions.find((x) => x.id === baseSid);
  const slot = slotId ? s?.slots?.find((t) => t.id === slotId) : undefined;
  return { program: p, session: s, slot, label: `${p?.name ?? programId}${s ? ` — ${s.label}` : ""}${slot ? ` (${slot.label})` : ""}` };
}

async function notifyFamily(ctx: MutationCtx, reg: Doc<"registrations">, subject: string, lines: string[]) {
  await ctx.scheduler.runAfter(0, internal.notify.sendFamilyNotice, { to: reg.parentEmail, parentName: reg.parentName, subject, lines, locationSlug: reg.locationSlug });
  await ctx.scheduler.runAfter(0, internal.notify.sendLocationCopy, { locationSlug: reg.locationSlug, subject: `${subject} — ${reg.childName}`, lines: [...lines, `Parent: ${reg.parentName} (${reg.parentEmail})`] });
}

/** Staff: refund a registration to card. The player is removed from the roster. */
export const staffRefund = mutation({
  args: { id: v.id("registrations"), amountCents: v.number(), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const staff = await requireStaff(ctx);
    const reg = await loadActive(ctx, args.id);
    const amount = Math.round(args.amountCents);
    if (amount < 0 || amount > reg.amountCents) throw new Error(`Refund must be between $0.00 and ${dollars(reg.amountCents)}`);
    const now = Date.now();
    const { label } = await describe(ctx, reg.programId, reg.sessionId);
    // Close any family refund request still waiting on this registration.
    const open = await ctx.db.query("refundRequests").withIndex("by_user", (q) => q.eq("userId", reg.userId)).collect();
    for (const r of open) if (r.registrationId === reg._id && r.status === "pending") await ctx.db.patch(r._id, { status: "cancelled", processedAt: now, processedBy: staff.email });
    const requestId = await ctx.db.insert("refundRequests", {
      userId: reg.userId,
      registrationId: reg._id,
      paidCents: reg.amountCents,
      adminFeeCents: reg.amountCents - amount,
      refundCents: amount,
      reason: args.reason,
      status: "approved",
      createdAt: now,
      processedAt: now,
      processedBy: staff.email,
    });
    await ctx.db.patch(reg._id, {
      status: "refunded",
      history: [...(reg.history ?? []), { at: now, action: "Refunded", by: staff.email, detail: `${dollars(amount)} refunded to card${args.reason ? ` · ${args.reason}` : ""}`, amountCents: amount }],
    });
    if (amount > 0) {
      await ctx.db.insert("ledger", { userId: reg.userId, type: "refund", description: `Refund to card — ${label} (${reg.childName})`, amountCents: amount, registrationId: reg._id, staffEmail: staff.email, createdAt: now });
      await ctx.scheduler.runAfter(0, internal.staffOps.processStripeRefund, { requestId });
    }
    await ctx.db.insert("activityLog", { actor: staff.email, action: "Refunded registration", detail: `${reg.childName} · ${label} · ${dollars(amount)}`, createdAt: now });
    await offerNextSpot(ctx, reg.programId, reg.sessionId);
    await notifyFamily(ctx, reg, "Registration Refunded", [
      `${reg.childName}'s registration in ${label} has been cancelled and refunded.`,
      `Refund amount: ${dollars(amount)} back to the original card. Refunds usually appear within 5–10 business days.`,
      ...(args.reason ? [`Note from our team: ${args.reason}`] : []),
    ]);
    return { refundCents: amount };
  },
});

/** Staff: cancel a registration and give the family account credit. */
export const staffCredit = mutation({
  args: { id: v.id("registrations"), amountCents: v.number(), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const staff = await requireStaff(ctx);
    const reg = await loadActive(ctx, args.id);
    const amount = Math.round(args.amountCents);
    if (amount < 0 || amount > reg.amountCents) throw new Error(`Credit must be between $0.00 and ${dollars(reg.amountCents)}`);
    const now = Date.now();
    const { label } = await describe(ctx, reg.programId, reg.sessionId);
    await ctx.db.patch(reg._id, {
      status: "credited",
      history: [...(reg.history ?? []), { at: now, action: "Credited", by: staff.email, detail: `${dollars(amount)} added as account credit${args.reason ? ` · ${args.reason}` : ""}`, amountCents: amount }],
    });
    if (amount > 0) await ctx.db.insert("ledger", { userId: reg.userId, type: "credit", description: `Account credit — ${label} (${reg.childName})`, amountCents: amount, registrationId: reg._id, staffEmail: staff.email, createdAt: now });
    await ctx.db.insert("activityLog", { actor: staff.email, action: "Credited registration", detail: `${reg.childName} · ${label} · ${dollars(amount)}`, createdAt: now });
    await offerNextSpot(ctx, reg.programId, reg.sessionId);
    await notifyFamily(ctx, reg, "Registration Cancelled — Account Credit Issued", [
      `${reg.childName}'s registration in ${label} has been cancelled.`,
      `${dollars(amount)} has been added to your TOP Sports account as credit. It applies automatically at your next checkout.`,
      ...(args.reason ? [`Note from our team: ${args.reason}`] : []),
    ]);
    return { creditCents: amount };
  },
});

/** Staff: move a registration to another program/session that has open spots. Amount paid carries over. */
export const staffTransfer = mutation({
  args: { id: v.id("registrations"), programId: v.string(), sessionId: v.string(), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const staff = await requireStaff(ctx);
    const old = await loadActive(ctx, args.id);
    if (old.programId === args.programId && old.sessionId === args.sessionId) throw new Error("Pick a different session to transfer to");
    const target = await describe(ctx, args.programId, args.sessionId);
    if (!target.program || !target.session) throw new Error("That program or session no longer exists");
    const [baseSid, slotId] = args.sessionId.split("~");
    if (target.session.slots?.length && !slotId) throw new Error("Pick a session option to transfer to");
    const regs = await ctx.db.query("registrations").withIndex("by_programId", (q) => q.eq("programId", args.programId)).collect();
    const active = regs.filter((r) => ACTIVE(r.status) && r._id !== old._id);
    const inSession = active.filter((r) => r.sessionId.split("~")[0] === baseSid).length;
    if (target.session.capacity > 0 && inSession >= target.session.capacity) throw new Error(`${target.label} is full. Transfers are only possible into sessions with open spots.`);
    if (target.slot && target.slot.capacity > 0) {
      const inSlot = active.filter((r) => r.sessionId === args.sessionId).length;
      if (inSlot >= target.slot.capacity) throw new Error(`${target.label} is full. Transfers are only possible into options with open spots.`);
    }
    const from = await describe(ctx, old.programId, old.sessionId);
    const now = Date.now();
    const { _id, _creationTime, history, ...rest } = old;
    void _id;
    void _creationTime;
    const entry = { at: now, action: "Transferred", by: staff.email, detail: `${from.label} → ${target.label}${args.reason ? ` · ${args.reason}` : ""}` };
    const nextId = await ctx.db.insert("registrations", {
      ...rest,
      programId: args.programId,
      locationSlug: target.program.locationSlug,
      sessionId: args.sessionId,
      status: "confirmed",
      transferredFrom: old._id,
      transferredTo: undefined,
      history: [...(history ?? []), entry],
    });
    await ctx.db.patch(old._id, { status: "transferred", transferredTo: nextId, history: [...(history ?? []), entry] });
    await ctx.db.insert("ledger", { userId: old.userId, type: "transfer", description: `Transfer: ${from.label} → ${target.label} (${old.childName})`, amountCents: 0, registrationId: nextId, staffEmail: staff.email, createdAt: now });
    await ctx.db.insert("activityLog", { actor: staff.email, action: "Transferred registration", detail: `${old.childName} · ${from.label} → ${target.label}`, createdAt: now });
    await offerNextSpot(ctx, old.programId, old.sessionId);
    const s = target.slot ?? target.session;
    await notifyFamily(ctx, old, "Registration Transferred", [
      `${old.childName} has been moved from ${from.label} to ${target.label}.`,
      `New schedule: ${[s.days ?? target.session.days, s.time ?? target.session.time, s.dates ?? target.session.dates].filter(Boolean).join(" · ")}`,
      `Location: ${s.location || target.session.location || target.program.venue}`,
      `Your original payment of ${dollars(old.amountCents)} carries over. No extra payment is needed.`,
      ...(args.reason ? [`Note from our team: ${args.reason}`] : []),
    ]);
    return { id: nextId };
  },
});
