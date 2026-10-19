import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { loadReplyBook } from "./replyTo";
import { v } from "convex/values";
import { authComponent } from "./auth";
import { isSuperAdmin, SUPER_ADMINS } from "./registrationOps";

type AuthUser = { _id: string; email: string; name?: string | null };

async function superUser(ctx: QueryCtx): Promise<AuthUser | null> {
  const user = (await authComponent.getAuthUser(ctx)) as AuthUser | null;
  return user && isSuperAdmin(user) ? user : null;
}

async function requireSuper(ctx: QueryCtx): Promise<AuthUser> {
  const user = await superUser(ctx);
  if (!user) throw new Error("Super Admin only");
  return user;
}

/** Public: saved site settings JSON (null = use built-in defaults). */
export const getSettings = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db.query("siteSettings").withIndex("by_key", (q) => q.eq("key", "site")).first();
    return row ? { data: row.data, updatedAt: row.updatedAt, updatedBy: row.updatedBy } : null;
  },
});

export const settingsInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db.query("siteSettings").withIndex("by_key", (q) => q.eq("key", "site")).first();
    return row?.data ?? null;
  },
});

export const amISuperAdmin = query({
  args: {},
  handler: async (ctx) => !!(await superUser(ctx)),
});

export const saveSettings = mutation({
  args: { data: v.string() },
  handler: async (ctx, args) => {
    const user = await requireSuper(ctx);
    JSON.parse(args.data);
    if (args.data.length > 400_000) throw new Error("Settings are too large");
    const row = await ctx.db.query("siteSettings").withIndex("by_key", (q) => q.eq("key", "site")).first();
    const patch = { data: args.data, updatedAt: Date.now(), updatedBy: user.email };
    if (row) await ctx.db.patch(row._id, patch);
    else await ctx.db.insert("siteSettings", { key: "site", ...patch });
  },
});

/** Image uploads for hub/location pictures. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireSuper(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const fileUrl = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    await requireSuper(ctx);
    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) throw new Error("Upload not found");
    return url;
  },
});

// ---------- User management ----------

function newToken(): string {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Public: look up a staff invite by its unique link token. */
export const inviteByToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    if (!args.token || args.token.length < 20) return null;
    const row = await ctx.db.query("staffMembers").withIndex("by_token", (q) => q.eq("inviteToken", args.token)).first();
    if (!row) return null;
    return { email: row.email, name: row.name ?? "", accepted: !!row.acceptedAt };
  },
});

/** Mark an invite accepted once the invited person has created their login. */
export const acceptInvite = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const user = (await authComponent.getAuthUser(ctx)) as AuthUser | null;
    if (!user) throw new Error("Sign in first");
    const row = await ctx.db.query("staffMembers").withIndex("by_token", (q) => q.eq("inviteToken", args.token)).first();
    if (!row || row.email !== user.email.toLowerCase()) throw new Error("This invite belongs to a different email");
    if (!row.acceptedAt) await ctx.db.patch(row._id, { acceptedAt: Date.now() });
  },
});

export const listStaff = query({
  args: {},
  handler: async (ctx) => {
    if (!(await superUser(ctx))) return null;
    const rows = await ctx.db.query("staffMembers").order("desc").collect();
    const envList = (process.env.STAFF_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
    return { superAdmins: SUPER_ADMINS, envStaff: envList, staff: rows };
  },
});

export const inviteStaff = mutation({
  args: { email: v.string(), name: v.optional(v.string()), locations: v.optional(v.array(v.string())), siteUrl: v.string() },
  handler: async (ctx, args) => {
    const user = await requireSuper(ctx);
    const email = args.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address");
    if (SUPER_ADMINS.includes(email)) throw new Error("That email is already the Super Admin");
    const existing = await ctx.db.query("staffMembers").withIndex("by_email", (q) => q.eq("email", email)).first();
    if (existing) throw new Error("That person already has staff access");
    const id = await ctx.db.insert("staffMembers", {
      email,
      name: args.name?.trim() || undefined,
      role: "staff",
      locations: args.locations,
      invitedBy: user.email,
      invitedAt: Date.now(),
      emailStatus: "sending",
      inviteToken: newToken(),
    });
    await ctx.scheduler.runAfter(0, internal.siteAdmin.sendInvite, { id, email, name: args.name ?? "", siteUrl: args.siteUrl });
    return id;
  },
});

export const updateStaff = mutation({
  args: { id: v.id("staffMembers"), name: v.optional(v.string()), locations: v.optional(v.array(v.string())) },
  handler: async (ctx, args) => {
    await requireSuper(ctx);
    await ctx.db.patch(args.id, { name: args.name?.trim() || undefined, locations: args.locations });
  },
});

export const removeStaff = mutation({
  args: { id: v.id("staffMembers") },
  handler: async (ctx, args) => {
    await requireSuper(ctx);
    await ctx.db.delete(args.id);
  },
});

export const resendInvite = mutation({
  args: { id: v.id("staffMembers"), siteUrl: v.string() },
  handler: async (ctx, args) => {
    await requireSuper(ctx);
    const row = await ctx.db.get(args.id);
    if (!row) throw new Error("Not found");
    await ctx.db.patch(args.id, { emailStatus: "sending", inviteToken: row.acceptedAt ? row.inviteToken : row.inviteToken ?? newToken() });
    await ctx.scheduler.runAfter(0, internal.siteAdmin.sendInvite, { id: args.id, email: row.email, name: row.name ?? "", siteUrl: args.siteUrl });
  },
});

export const setInviteStatus = internalMutation({
  args: { id: v.id("staffMembers"), status: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (row) await ctx.db.patch(args.id, { emailStatus: args.status });
  },
});

export const inviteRow = internalQuery({
  args: { id: v.id("staffMembers") },
  handler: async (ctx, args) => await ctx.db.get(args.id),
});

export const sendInvite = internalAction({
  args: { id: v.id("staffMembers"), email: v.string(), name: v.string(), siteUrl: v.string() },
  handler: async (ctx, args) => {
    const url = process.env.SHIPPER_EMAIL_URL;
    const token = process.env.SHIPPER_EMAIL_TOKEN;
    if (!url || !token) {
      await ctx.runMutation(internal.siteAdmin.setInviteStatus, { id: args.id, status: "share_link" });
      return;
    }
    const row = await ctx.runQuery(internal.siteAdmin.inviteRow, { id: args.id });
    const link = `${args.siteUrl.replace(/\/$/, "")}/admin?invite=${row?.inviteToken ?? ""}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Shipper-Token": token },
        body: JSON.stringify({
          to: args.email,
          replyTo: (await loadReplyBook(ctx)).support,
          templateSlug: "program-message",
          templateData: {
            subject: "You're Invited to the TOP Sports Staff Portal",
            parentName: args.name.split(" ")[0] || "there",
            message: `You've been given staff access to TOP Sports Registration.<br/><br/><a href="${link}">Click here to accept your invite</a> and create your staff login for ${args.email}. This link is unique to you, so please don't share it.`,
          },
        }),
      });
      const data = res.ok ? await res.json().catch(() => ({})) : null;
      // 403 = the address has no account yet; the invite still works via the shared link.
      await ctx.runMutation(internal.siteAdmin.setInviteStatus, { id: args.id, status: res.ok && !data?.skipped ? "sent" : "share_link" });
    } catch {
      await ctx.runMutation(internal.siteAdmin.setInviteStatus, { id: args.id, status: "share_link" });
    }
  },
});
