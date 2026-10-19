import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { authComponent } from "./auth";
import { isStaff } from "./registrationOps";
import { logActivity } from "./activity";

interface AuthUser {
  _id: string;
  email: string;
  name?: string | null;
}

async function me(ctx: QueryCtx | MutationCtx) {
  return (await authComponent.getAuthUser(ctx)) as AuthUser | null;
}

async function requireStaff(ctx: MutationCtx): Promise<AuthUser> {
  const user = await me(ctx);
  if (!user) throw new Error("Not authenticated");
  if (!(await isStaff(ctx, user))) throw new Error("Only staff can do this");
  return user;
}

/* ───────────── Private staff notes ───────────── */

export const setStaffNote = mutation({
  args: { registrationId: v.string(), userId: v.string(), note: v.string() },
  handler: async (ctx, args) => {
    const user = await requireStaff(ctx);
    const existing = await ctx.db
      .query("staffNotes")
      .withIndex("by_registration", (q) => q.eq("registrationId", args.registrationId))
      .first();
    const note = args.note.trim().slice(0, 2000);
    if (existing && !note) {
      await ctx.db.delete(existing._id);
      return null;
    }
    if (existing) await ctx.db.patch(existing._id, { note, updatedBy: user.email, updatedAt: Date.now() });
    else if (note) await ctx.db.insert("staffNotes", { registrationId: args.registrationId, userId: args.userId, note, updatedBy: user.email, updatedAt: Date.now() });
    await logActivity(ctx, user.email, "Staff note", note ? `Updated note on registration ${args.registrationId.slice(-6)}` : "Removed a note");
    return null;
  },
});

/* ───────────── Archive programs ───────────── */

export const archiveProgram = mutation({
  args: { programId: v.string(), archived: v.boolean(), data: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireStaff(ctx);
    const row = await ctx.db
      .query("managedPrograms")
      .withIndex("by_programId", (q) => q.eq("programId", args.programId))
      .first();
    if (row) {
      await ctx.db.patch(row._id, { archived: args.archived, updatedAt: Date.now(), updatedBy: user.email });
      await logActivity(ctx, user.email, args.archived ? "Archived program" : "Restored program", row.name);
      return row._id;
    }
    if (!args.data) throw new Error("Save the program first");
    const p = JSON.parse(args.data) as { id: string; name: string; locationSlug: string; category?: string; season?: string };
    const id = await ctx.db.insert("managedPrograms", {
      programId: p.id,
      locationSlug: p.locationSlug,
      name: p.name,
      category: p.category ?? "Camps",
      season: p.season ?? "",
      published: false,
      archived: args.archived,
      data: args.data,
      updatedAt: Date.now(),
      updatedBy: user.email,
    });
    await logActivity(ctx, user.email, args.archived ? "Archived program" : "Restored program", p.name);
    return id;
  },
});

/* ───────────── Staff-entered registrations ───────────── */

export const staffCreateRegistration = mutation({
  args: {
    programId: v.string(),
    locationSlug: v.string(),
    sessionId: v.string(),
    childName: v.string(),
    childDob: v.string(),
    parentName: v.string(),
    parentEmail: v.string(),
    parentPhone: v.optional(v.string()),
    amountCents: v.number(),
    payment: v.string(), // offline | comp
    method: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireStaff(ctx);
    const email = args.parentEmail.trim().toLowerCase();
    if (!args.childName.trim() || !email || !args.parentName.trim()) throw new Error("Child, parent name and parent email are required");
    // Attach to the family's existing account when we can find one.
    const all = await ctx.db.query("registrations").collect();
    const match = all.find((r) => r.parentEmail.toLowerCase() === email && !r.userId.startsWith("offline:"));
    const userId = match?.userId ?? `offline:${email}`;
    const amount = args.payment === "comp" ? 0 : Math.max(0, Math.round(args.amountCents));
    const label = args.payment === "comp" ? "Comp" : `Paid offline${args.method ? ` (${args.method})` : ""}`;
    const now = Date.now();
    const id = await ctx.db.insert("registrations", {
      userId,
      programId: args.programId,
      locationSlug: args.locationSlug,
      sessionId: args.sessionId,
      childName: args.childName.trim(),
      childDob: args.childDob,
      parentName: args.parentName.trim(),
      parentEmail: email,
      parentPhone: args.parentPhone,
      amountCents: amount,
      status: "confirmed",
      history: [{ at: now, action: "staff_entered", by: user.email, detail: label, amountCents: amount }],
    });
    await ctx.db.insert("ledger", {
      userId,
      type: "payment",
      description: `${label} — entered by staff`,
      amountCents: -amount,
      registrationId: id,
      staffEmail: user.email,
      createdAt: now,
    });
    if (args.note?.trim()) await ctx.db.insert("staffNotes", { registrationId: id, userId, note: args.note.trim(), updatedBy: user.email, updatedAt: now });
    await logActivity(ctx, user.email, "Staff registration", `${args.childName} · ${label} · $${(amount / 100).toFixed(2)}`);
    return id;
  },
});

/* ───────────── Merge duplicate families ───────────── */

export const mergeFamilies = mutation({
  args: { fromUserId: v.string(), toUserId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireStaff(ctx);
    if (args.fromUserId === args.toUserId) throw new Error("Pick two different families");
    let moved = 0;
    const move = async (rows: { _id: any }[]) => {
      for (const r of rows) { await ctx.db.patch(r._id, { userId: args.toUserId }); moved++; }
    };
    await move(await ctx.db.query("registrations").withIndex("by_user", (q) => q.eq("userId", args.fromUserId)).collect());
    await move(await ctx.db.query("children").withIndex("by_user", (q) => q.eq("userId", args.fromUserId)).collect());
    await move(await ctx.db.query("ledger").withIndex("by_user", (q) => q.eq("userId", args.fromUserId)).collect());
    await move(await ctx.db.query("waitlist").withIndex("by_user", (q) => q.eq("userId", args.fromUserId)).collect());
    await move(await ctx.db.query("refundRequests").withIndex("by_user", (q) => q.eq("userId", args.fromUserId)).collect());
    await move(await ctx.db.query("staffNotes").withIndex("by_user", (q) => q.eq("userId", args.fromUserId)).collect());
    // Remove duplicate child profiles (same name + DOB) created by the second account.
    const kids = await ctx.db.query("children").withIndex("by_user", (q) => q.eq("userId", args.toUserId)).collect();
    const seen = new Set<string>();
    for (const k of kids) {
      const key = `${k.firstName} ${k.lastName}|${k.dob}`.toLowerCase();
      if (seen.has(key)) await ctx.db.delete(k._id);
      else seen.add(key);
    }
    await logActivity(ctx, user.email, "Merged families", `${moved} records moved into one account`);
    return moved;
  },
});

/* ───────────── Program emails: scheduled + history ───────────── */

export const listSentEmails = query({
  args: {},
  handler: async (ctx) => {
    const user = await me(ctx);
    if (!user || !(await isStaff(ctx, user))) return null;
    const rows = await ctx.db.query("sentEmails").withIndex("by_created").order("desc").take(100);
    return rows.map(({ payload: _p, ...r }) => r);
  },
});

export const scheduleEmail = mutation({
  args: { payload: v.string(), sendAt: v.number(), programId: v.string(), programName: v.string(), sessionLabel: v.string(), subject: v.string() },
  handler: async (ctx, args) => {
    const user = await requireStaff(ctx);
    if (args.sendAt < Date.now() + 60_000) throw new Error("Pick a time at least a minute from now");
    const id = await ctx.db.insert("sentEmails", {
      programId: args.programId,
      programName: args.programName,
      sessionLabel: args.sessionLabel,
      subject: args.subject,
      payload: args.payload,
      status: "scheduled",
      sendAt: args.sendAt,
      createdBy: user.email,
      createdAt: Date.now(),
    });
    await ctx.scheduler.runAt(args.sendAt, makeFunctionReference<"action", { id: typeof id }>("staffOps:sendScheduledEmail"), { id });
    await logActivity(ctx, user.email, "Scheduled email", `${args.programName}: ${args.subject}`);
    return id;
  },
});

export const cancelScheduledEmail = mutation({
  args: { id: v.id("sentEmails") },
  handler: async (ctx, args) => {
    const user = await requireStaff(ctx);
    const row = await ctx.db.get(args.id);
    if (!row || row.status !== "scheduled") throw new Error("Only scheduled emails can be cancelled");
    await ctx.db.patch(row._id, { status: "cancelled" });
    await logActivity(ctx, user.email, "Cancelled scheduled email", row.subject);
    return row._id;
  },
});

export const listStaffTemplates = query({
  args: {},
  handler: async (ctx) => {
    const user = await me(ctx);
    if (!user || !(await isStaff(ctx, user))) return null;
    const rows = await ctx.db.query("staffEmailTemplates").collect();
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const saveStaffTemplate = mutation({
  args: { name: v.string(), subject: v.string(), body: v.string() },
  handler: async (ctx, args) => {
    const user = await requireStaff(ctx);
    const name = args.name.trim().slice(0, 80);
    if (!name) throw new Error("Give the template a name");
    const existing = await ctx.db.query("staffEmailTemplates").withIndex("by_name", (q) => q.eq("name", name)).first();
    const row = { name, subject: args.subject.slice(0, 300), body: args.body.slice(0, 20000), createdBy: user.email, updatedAt: Date.now() };
    await logActivity(ctx, user.email, existing ? "Updated email template" : "Saved email template", name);
    if (existing) {
      await ctx.db.patch(existing._id, row);
      return existing._id;
    }
    return await ctx.db.insert("staffEmailTemplates", row);
  },
});

export const deleteStaffTemplate = mutation({
  args: { id: v.id("staffEmailTemplates") },
  handler: async (ctx, args) => {
    const user = await requireStaff(ctx);
    const row = await ctx.db.get(args.id);
    if (!row) return null;
    await ctx.db.delete(row._id);
    await logActivity(ctx, user.email, "Deleted email template", row.name);
    return row._id;
  },
});

export const getEmailRow = internalQuery({
  args: { id: v.id("sentEmails") },
  handler: async (ctx, args) => await ctx.db.get(args.id),
});

export const recordEmail = internalMutation({
  args: {
    id: v.optional(v.id("sentEmails")),
    status: v.string(),
    sentCount: v.number(),
    failedCount: v.number(),
    programId: v.optional(v.string()),
    programName: v.optional(v.string()),
    sessionLabel: v.optional(v.string()),
    subject: v.optional(v.string()),
    createdBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.id) {
      await ctx.db.patch(args.id, { status: args.status, sentCount: args.sentCount, failedCount: args.failedCount });
      return args.id;
    }
    const now = Date.now();
    return await ctx.db.insert("sentEmails", {
      programId: args.programId ?? "",
      programName: args.programName ?? "",
      sessionLabel: args.sessionLabel ?? "",
      subject: args.subject ?? "",
      payload: "",
      status: args.status,
      sendAt: now,
      sentCount: args.sentCount,
      failedCount: args.failedCount,
      createdBy: args.createdBy ?? "",
      createdAt: now,
    });
  },
});

export const whoAmI = internalQuery({
  args: {},
  handler: async (ctx) => (await me(ctx))?.email ?? "",
});

/* ───────────── Co-parent / second guardian access ───────────── */

export const myFamilyAccess = query({
  args: {},
  handler: async (ctx) => {
    const user = await me(ctx);
    if (!user) return null;
    const invited = await ctx.db.query("familyMembers").withIndex("by_owner", (q) => q.eq("ownerUserId", user._id)).collect();
    const toMe = await ctx.db.query("familyMembers").withIndex("by_email", (q) => q.eq("email", user.email.toLowerCase())).collect();
    return { invited, toMe };
  },
});

export const inviteCoParent = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const user = await me(ctx);
    if (!user) throw new Error("Sign in first");
    const email = args.email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Enter a valid email");
    if (email === user.email.toLowerCase()) throw new Error("That's your own email");
    const existing = (await ctx.db.query("familyMembers").withIndex("by_owner", (q) => q.eq("ownerUserId", user._id)).collect()).find((m) => m.email === email);
    if (existing) throw new Error("This person already has access or an invite");
    const id = await ctx.db.insert("familyMembers", { ownerUserId: user._id, ownerName: user.name ?? user.email, email, status: "invited", invitedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.notify.sendFamilyNotice, {
      to: email,
      parentName: "",
      subject: `${user.name ?? "A parent"} shared their TOP Sports family account with you`,
      lines: [
        `${user.name ?? user.email} invited you to share their TOP Sports family account.`,
        "Create your own login (or sign in) with this email address, then open My Family and tap Accept to see the family's children, schedule and receipts.",
      ],
    });
    return id;
  },
});

export const acceptCoParent = mutation({
  args: { id: v.id("familyMembers") },
  handler: async (ctx, args) => {
    const user = await me(ctx);
    if (!user) throw new Error("Sign in first");
    const m = await ctx.db.get(args.id);
    if (!m || m.email !== user.email.toLowerCase()) throw new Error("Invite not found");
    await ctx.db.patch(m._id, { status: "active", memberUserId: user._id, acceptedAt: Date.now() });
    return m._id;
  },
});

export const removeCoParent = mutation({
  args: { id: v.id("familyMembers") },
  handler: async (ctx, args) => {
    const user = await me(ctx);
    if (!user) throw new Error("Sign in first");
    const m = await ctx.db.get(args.id);
    if (!m || (m.ownerUserId !== user._id && m.email !== user.email.toLowerCase())) throw new Error("Not found");
    await ctx.db.delete(m._id);
    return null;
  },
});

/** Co-parent: the shared family's children and registrations (read-only). */
export const sharedFamilies = query({
  args: {},
  handler: async (ctx) => {
    const user = await me(ctx);
    if (!user) return null;
    const links = (await ctx.db.query("familyMembers").withIndex("by_member", (q) => q.eq("memberUserId", user._id)).collect()).filter((m) => m.status === "active");
    return await Promise.all(
      links.map(async (l) => ({
        id: l._id,
        ownerName: l.ownerName,
        children: await ctx.db.query("children").withIndex("by_user", (q) => q.eq("userId", l.ownerUserId)).collect(),
        registrations: (await ctx.db.query("registrations").withIndex("by_user", (q) => q.eq("userId", l.ownerUserId)).collect()).filter((r) => r.status === "confirmed" || r.status === "refund_pending"),
        payments: (await ctx.db.query("ledger").withIndex("by_user", (q) => q.eq("userId", l.ownerUserId)).collect()).filter((x) => x.type === "payment" || x.type === "refund"),
      })),
    );
  },
});
