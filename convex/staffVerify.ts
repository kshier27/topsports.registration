import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { authComponent } from "./auth";
import { isStaff } from "./registrationOps";
import { internal } from "./_generated/api";

interface BetterAuthUser {
  _id: string;
  email: string;
  name?: string | null;
}

const CODE_TTL = 10 * 60 * 1000; // 10 minutes
const TRUST_FOR = 12 * 60 * 60 * 1000; // a verified device stays trusted for 12 hours
const MAX_ATTEMPTS = 5;

/** Whether this staff member has passed the emailed code check on this device. */
export const status = query({
  args: { deviceId: v.string() },
  handler: async (ctx, args) => {
    const user = (await authComponent.getAuthUser(ctx)) as BetterAuthUser | null;
    if (!user || !(await isStaff(ctx, user))) return null;
    const email = user.email.toLowerCase();
    const row = await ctx.db.query("staffVerifications").withIndex("by_email_device", (q) => q.eq("email", email).eq("deviceId", args.deviceId)).first();
    const now = Date.now();
    return {
      verified: !!row?.verifiedUntil && row.verifiedUntil > now,
      codeSent: !!row && !row.verifiedUntil && row.expiresAt > now,
    };
  },
});

/** Email a fresh 6-digit sign-in code to the signed-in staff member. */
export const requestCode = mutation({
  args: { deviceId: v.string() },
  handler: async (ctx, args) => {
    const user = (await authComponent.getAuthUser(ctx)) as BetterAuthUser | null;
    if (!user) throw new Error("Not authenticated");
    if (!(await isStaff(ctx, user))) throw new Error("Staff access only");
    const email = user.email.toLowerCase();
    const now = Date.now();
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const row = await ctx.db.query("staffVerifications").withIndex("by_email_device", (q) => q.eq("email", email).eq("deviceId", args.deviceId)).first();
    if (row && row.createdAt > now - 30 * 1000 && !row.verifiedUntil) throw new Error("A code was just sent. Wait 30 seconds before asking for another.");
    if (row) await ctx.db.patch(row._id, { code, expiresAt: now + CODE_TTL, attempts: 0, verifiedUntil: undefined, createdAt: now });
    else await ctx.db.insert("staffVerifications", { email, deviceId: args.deviceId, code, expiresAt: now + CODE_TTL, attempts: 0, createdAt: now });
    await ctx.scheduler.runAfter(0, internal.notify.sendFamilyNotice, {
      to: user.email,
      parentName: user.name ?? "",
      subject: `Your TOP Sports Staff Portal code: ${code}`,
      lines: [
        `Your Staff Portal sign-in code is ${code}.`,
        "It expires in 10 minutes. If you didn't try to sign in, change your password and tell an administrator.",
      ],
    });
    return true;
  },
});

/** Check the code. A correct code trusts this device for 12 hours. */
export const verifyCode = mutation({
  args: { deviceId: v.string(), code: v.string() },
  handler: async (ctx, args) => {
    const user = (await authComponent.getAuthUser(ctx)) as BetterAuthUser | null;
    if (!user) throw new Error("Not authenticated");
    const email = user.email.toLowerCase();
    const row = await ctx.db.query("staffVerifications").withIndex("by_email_device", (q) => q.eq("email", email).eq("deviceId", args.deviceId)).first();
    const now = Date.now();
    if (!row || row.expiresAt < now) throw new Error("This code has expired. Send a new one.");
    if (row.attempts >= MAX_ATTEMPTS) throw new Error("Too many wrong codes. Send a new one.");
    if (row.code !== args.code.trim()) {
      await ctx.db.patch(row._id, { attempts: row.attempts + 1 });
      throw new Error("That code isn't right. Check the email and try again.");
    }
    await ctx.db.patch(row._id, { verifiedUntil: now + TRUST_FOR, code: "", expiresAt: 0 });
    await ctx.db.insert("activityLog", { actor: user.email, action: "Signed in", detail: "Passed two-step code check", createdAt: now });
    return true;
  },
});

/** Forget this device's trust (used on sign-out or idle timeout). */
export const forgetDevice = mutation({
  args: { deviceId: v.string() },
  handler: async (ctx, args) => {
    const user = (await authComponent.getAuthUser(ctx)) as BetterAuthUser | null;
    if (!user) return false;
    const email = user.email.toLowerCase();
    const row = await ctx.db.query("staffVerifications").withIndex("by_email_device", (q) => q.eq("email", email).eq("deviceId", args.deviceId)).first();
    if (row) await ctx.db.delete(row._id);
    return true;
  },
});
