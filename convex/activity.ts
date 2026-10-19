import { query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { authComponent } from "./auth";
import { isStaff } from "./registrationOps";

interface AuthUser {
  _id: string;
  email: string;
  name?: string | null;
}

/** Record a staff action in the activity log. */
export async function logActivity(ctx: MutationCtx, actor: string, action: string, detail: string): Promise<void> {
  await ctx.db.insert("activityLog", { actor, action, detail: detail.slice(0, 300), createdAt: Date.now() });
}

/** Staff: most recent 300 staff actions, newest first. */
export const listActivity = query({
  args: {},
  handler: async (ctx) => {
    const user = (await authComponent.getAuthUser(ctx)) as AuthUser | null;
    if (!user || !(await isStaff(ctx, user))) return [];
    return await ctx.db.query("activityLog").withIndex("by_created").order("desc").take(300);
  },
});
