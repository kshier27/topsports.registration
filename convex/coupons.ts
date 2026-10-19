import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { authComponent } from "./auth";
import { isStaff } from "./registrationOps";
import { logActivity } from "./activity";

interface AuthUser {
  _id: string;
  email: string;
  name?: string | null;
}

const norm = (c: string) => c.trim().toUpperCase().replace(/\s+/g, "");

type CouponCheck = { ok: boolean; error?: string; code?: string; kind?: string; value?: number; description?: string };

/** Public: check a code at checkout. */
export const validateCoupon = query({
  args: { code: v.string() },
  handler: async (ctx, args): Promise<CouponCheck> => {
    const code = norm(args.code);
    if (!code) return { ok: false, error: "Enter a code." };
    const c = await ctx.db.query("coupons").withIndex("by_code", (q) => q.eq("code", code)).first();
    if (!c || !c.active) return { ok: false, error: "That code isn't valid." };
    if (c.expiresAt && c.expiresAt < Date.now()) return { ok: false, error: "This code has expired." };
    if (c.maxUses && c.uses >= c.maxUses) return { ok: false, error: "This code has been fully redeemed." };
    return { ok: true, code: c.code, kind: c.kind, value: c.value, description: c.description ?? "" };
  },
});

/** Family: record a redemption after a successful checkout. */
export const redeemCoupon = mutation({
  args: { code: v.string(), discountCents: v.number() },
  handler: async (ctx, args) => {
    const user = (await authComponent.getAuthUser(ctx)) as AuthUser | null;
    if (!user) throw new ConvexError("Not authenticated");
    const c = await ctx.db.query("coupons").withIndex("by_code", (q) => q.eq("code", norm(args.code))).first();
    if (!c) return null;
    await ctx.db.patch(c._id, { uses: c.uses + 1 });
    await ctx.db.insert("couponRedemptions", { code: c.code, userId: user._id, discountCents: Math.max(0, Math.round(args.discountCents)), createdAt: Date.now() });
    return c._id;
  },
});

async function requireStaff(ctx: QueryCtx) {
  const user = (await authComponent.getAuthUser(ctx)) as AuthUser | null;
  if (!user || !(await isStaff(ctx, user))) throw new ConvexError("Staff only");
  return user;
}

/** Staff: all coupons with redemption totals. */
export const listCoupons = query({
  args: {},
  handler: async (ctx) => {
    const user = (await authComponent.getAuthUser(ctx)) as AuthUser | null;
    if (!user || !(await isStaff(ctx, user))) return [];
    const rows = await ctx.db.query("coupons").order("desc").collect();
    return await Promise.all(
      rows.map(async (c) => {
        const red = await ctx.db.query("couponRedemptions").withIndex("by_code", (q) => q.eq("code", c.code)).collect();
        return { ...c, discountTotalCents: red.reduce((s, r) => s + r.discountCents, 0) };
      }),
    );
  },
});

export const createCoupon = mutation({
  args: {
    code: v.string(),
    kind: v.union(v.literal("percent"), v.literal("amount")),
    value: v.number(),
    description: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    maxUses: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireStaff(ctx);
    const code = norm(args.code);
    if (code.length < 3) throw new ConvexError("Codes need at least 3 characters.");
    if (args.value <= 0) throw new ConvexError("Discount must be more than 0.");
    if (args.kind === "percent" && args.value > 100) throw new ConvexError("Percent can't exceed 100.");
    const dupe = await ctx.db.query("coupons").withIndex("by_code", (q) => q.eq("code", code)).first();
    if (dupe) throw new ConvexError(`${code} already exists.`);
    await logActivity(ctx, user.email, "Created coupon", `${code} · ${args.kind === "percent" ? `${args.value}% off` : `${(args.value / 100).toFixed(2)} off`}`);
    return await ctx.db.insert("coupons", {
      code,
      kind: args.kind,
      value: args.value,
      description: args.description,
      expiresAt: args.expiresAt,
      maxUses: args.maxUses,
      active: true,
      uses: 0,
      createdBy: user.email,
      createdAt: Date.now(),
    });
  },
});

export const setCouponActive = mutation({
  args: { id: v.id("coupons"), active: v.boolean() },
  handler: async (ctx, args) => {
    const u = await requireStaff(ctx);
    const c = await ctx.db.get(args.id);
    await ctx.db.patch(args.id, { active: args.active });
    await logActivity(ctx, u.email, args.active ? "Activated coupon" : "Paused coupon", c?.code ?? "");
    return args.id;
  },
});

export const deleteCoupon = mutation({
  args: { id: v.id("coupons") },
  handler: async (ctx, args) => {
    const u = await requireStaff(ctx);
    const c = await ctx.db.get(args.id);
    await ctx.db.delete(args.id);
    await logActivity(ctx, u.email, "Deleted coupon", c?.code ?? "");
    return args.id;
  },
});

/** Staff: add account credit to a parent, found by the email they register with. */
export const grantCredit = mutation({
  args: { email: v.string(), amountCents: v.number(), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const staff = await requireStaff(ctx);
    const email = args.email.trim().toLowerCase();
    const amount = Math.round(args.amountCents);
    if (amount <= 0) throw new ConvexError("Credit must be more than $0.");
    const regs = await ctx.db.query("registrations").collect();
    let userId = regs.find((r) => r.parentEmail.toLowerCase() === email)?.userId;
    if (!userId) {
      const wl = await ctx.db.query("waitlist").collect();
      userId = wl.find((w) => w.parentEmail.toLowerCase() === email)?.userId;
    }
    if (!userId) throw new ConvexError("No family account with that email has registered or joined a waitlist yet.");
    await ctx.db.insert("ledger", {
      userId,
      type: "credit",
      description: args.note?.trim() ? `Account credit — ${args.note.trim()}` : `Account credit added by ${staff.email}`,
      amountCents: amount,
      createdAt: Date.now(),
    });
    await logActivity(ctx, staff.email, "Granted account credit", `${(amount / 100).toFixed(2)} to ${email}${args.note?.trim() ? ` · ${args.note.trim()}` : ""}`);
    return userId;
  },
});
