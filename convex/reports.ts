import { query } from "./_generated/server";
import { v } from "convex/values";
import { authComponent } from "./auth";

interface BetterAuthUser {
  _id: string;
  email: string;
  name?: string | null;
}

/** Super Admins always have full staff access. */
const SUPER_ADMINS = ["kevin@topsports.ca"];

function isStaff(user: BetterAuthUser | null): boolean {
  if (!user?.email) return false;
  if (SUPER_ADMINS.includes(user.email.toLowerCase())) return true;
  const list = (process.env.STAFF_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(user.email.toLowerCase());
}

/** Staff: every registration, joined with the child's medical notes when available. */
export const allRegistrations = query({
  args: {},
  handler: async (ctx) => {
    const user = (await authComponent.getAuthUser(ctx)) as BetterAuthUser | null;
    if (!user || !isStaff(user)) return null;
    const regs = await ctx.db.query("registrations").collect();
    const children = await ctx.db.query("children").collect();
    const byKey = new Map<string, (typeof children)[number]>();
    for (const c of children) byKey.set(`${c.userId}|${`${c.firstName} ${c.lastName}`.trim().toLowerCase()}`, c);
    const notes = await ctx.db.query("staffNotes").collect();
    const noteFor = new Map<string, string>();
    for (const n of notes) if (n.registrationId) noteFor.set(n.registrationId, n.note);
    // The child's CURRENT profile overrides what was copied at registration time,
    // so profile edits reach every roster automatically.
    return regs.map((r) => {
      const c = byKey.get(`${r.userId}|${r.childName.trim().toLowerCase()}`);
      return {
        ...r,
        medicalNotes: c?.medicalNotes ?? "",
        emergencyContact: c?.emergencyContact?.trim() ? c.emergencyContact : r.emergencyContact,
        childAddress: c?.address?.trim() ? c.address : r.childAddress,
        childSchool: c?.school?.trim() ? c.school : r.childSchool,
        staffNote: noteFor.get(r._id) ?? "",
      };
    });
  },
});

/** Staff: one family's children, registrations, ledger, waitlist and refunds. */
export const familyDetail = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const user = (await authComponent.getAuthUser(ctx)) as BetterAuthUser | null;
    if (!user || !isStaff(user)) return null;
    const registrations = await ctx.db.query("registrations").withIndex("by_user", (q) => q.eq("userId", args.userId)).collect();
    const children = await ctx.db.query("children").withIndex("by_user", (q) => q.eq("userId", args.userId)).collect();
    const ledger = await ctx.db.query("ledger").withIndex("by_user", (q) => q.eq("userId", args.userId)).collect();
    const waitlist = await ctx.db.query("waitlist").withIndex("by_user", (q) => q.eq("userId", args.userId)).collect();
    const refunds = await ctx.db.query("refundRequests").withIndex("by_user", (q) => q.eq("userId", args.userId)).collect();
    const latest = [...registrations].sort((a, b) => b._creationTime - a._creationTime)[0];
    return {
      parent: latest
        ? { name: latest.parentName, email: latest.parentEmail, phone: latest.parentPhone ?? "", guardian2: [latest.guardian2Name, latest.guardian2Email, latest.guardian2Phone].filter(Boolean).join(" · ") }
        : waitlist[0]
          ? { name: waitlist[0].parentName, email: waitlist[0].parentEmail, phone: "", guardian2: "" }
          : null,
      children,
      registrations: registrations.sort((a, b) => b._creationTime - a._creationTime),
      ledger: ledger.sort((a, b) => b.createdAt - a.createdAt),
      waitlist,
      refunds,
      creditCents: ledger.filter((l) => l.type === "credit" || l.type === "credit_used").reduce((s, l) => s + l.amountCents, 0),
    };
  },
});

/** Staff: full ledger + refund requests for financial reporting. */
export const financials = query({
  args: {},
  handler: async (ctx) => {
    const user = (await authComponent.getAuthUser(ctx)) as BetterAuthUser | null;
    if (!user || !isStaff(user)) return null;
    const ledger = await ctx.db.query("ledger").collect();
    const refunds = await ctx.db.query("refundRequests").collect();
    const regs = await ctx.db.query("registrations").collect();
    const regMap = new Map(regs.map((r) => [r._id as string, r]));
    const redemptions = await ctx.db.query("couponRedemptions").collect();
    return {
      redemptions: redemptions.map((r) => ({ code: r.code, discountCents: r.discountCents, createdAt: r.createdAt })),
      ledger: ledger.map((l) => {
        const reg = l.registrationId ? regMap.get(l.registrationId as string) : undefined;
        return {
          ...l,
          programId: reg?.programId ?? "",
          locationSlug: reg?.locationSlug ?? "",
          childName: reg?.childName ?? "",
          parentEmail: reg?.parentEmail ?? "",
          regStatus: reg?.status ?? "",
        };
      }),
      refunds: refunds.map((r) => ({ ...r, registration: regMap.get(r.registrationId as string) ?? null })),
    };
  },
});
