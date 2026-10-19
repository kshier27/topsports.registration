import { query } from "./_generated/server";
import { v } from "convex/values";
import { authComponent } from "./auth";

// Type for Better Auth user (for TypeScript)
interface BetterAuthUser {
  _id: string;
  email: string;
  name?: string | null;
  image?: string | null;
  emailVerified?: boolean;
  createdAt: number;
  updatedAt: number;
}

// List all children for the authenticated user
// Available as: api.queries.listChildren OR api.queries.getMyChildren
export const listChildren = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx) as BetterAuthUser | null;
    if (!user) return [];

    return await ctx.db
      .query("children")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect();
  },
});

// Alias for listChildren - use whichever name you prefer
export const getMyChildren = listChildren;

// Get a single children by ID (only if owned by user)
export const getChildren = query({
  args: { id: v.id("children") },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx) as BetterAuthUser | null;
    if (!user) return null;

    const item = await ctx.db.get(args.id);
    if (!item || item.userId !== user._id) return null;
    return item;
  },
});

// List all registrations for the authenticated user
// Available as: api.queries.listRegistrations OR api.queries.getMyRegistrations
export const listRegistrations = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx) as BetterAuthUser | null;
    if (!user) return [];

    return await ctx.db
      .query("registrations")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect();
  },
});

// Alias for listRegistrations - use whichever name you prefer
export const getMyRegistrations = listRegistrations;

// Get a single registration by ID (only if owned by user)
export const getRegistration = query({
  args: { id: v.id("registrations") },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx) as BetterAuthUser | null;
    if (!user) return null;

    const item = await ctx.db.get(args.id);
    if (!item || item.userId !== user._id) return null;
    return item;
  },
});
