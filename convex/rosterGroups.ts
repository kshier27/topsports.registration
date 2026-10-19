import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { authComponent } from "./auth";
import { isStaff } from "./registrationOps";

interface BetterAuthUser {
  _id: string;
  email: string;
  name?: string | null;
}

/** Staff: group assignments for one session roster. */
export const listForSession = query({
  args: { programId: v.string(), sessionId: v.string() },
  handler: async (ctx, args) => {
    const user = (await authComponent.getAuthUser(ctx)) as BetterAuthUser | null;
    if (!user || !(await isStaff(ctx, user))) return null;
    const rows = await ctx.db
      .query("rosterGroups")
      .withIndex("by_session", (q) => q.eq("programId", args.programId).eq("sessionId", args.sessionId))
      .collect();
    return rows.map((r) => ({ registrationId: r.registrationId, group: r.group }));
  },
});

/** Staff: set (or clear, with an empty group) the groups for several players at once. */
export const assign = mutation({
  args: {
    programId: v.string(),
    sessionId: v.string(),
    assignments: v.array(v.object({ registrationId: v.string(), group: v.string() })),
  },
  handler: async (ctx, args) => {
    const user = (await authComponent.getAuthUser(ctx)) as BetterAuthUser | null;
    if (!user) throw new Error("Not authenticated");
    if (!(await isStaff(ctx, user))) throw new Error("Only staff can assign groups");
    const existing = await ctx.db
      .query("rosterGroups")
      .withIndex("by_session", (q) => q.eq("programId", args.programId).eq("sessionId", args.sessionId))
      .collect();
    const byReg = new Map(existing.map((r) => [r.registrationId, r]));
    const now = Date.now();
    for (const a of args.assignments) {
      const group = a.group.trim();
      const row = byReg.get(a.registrationId);
      if (!group) {
        if (row) await ctx.db.delete(row._id);
        continue;
      }
      if (row) await ctx.db.patch(row._id, { group, updatedBy: user.email, updatedAt: now });
      else await ctx.db.insert("rosterGroups", { programId: args.programId, sessionId: args.sessionId, registrationId: a.registrationId, group, updatedBy: user.email, updatedAt: now });
    }
    return args.assignments.length;
  },
});
