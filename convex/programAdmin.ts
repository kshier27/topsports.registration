import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { authComponent } from "./auth";
import { logActivity } from "./activity";

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

/** Staff: every managed program (drafts included). */
export const listManaged = query({
  args: {},
  handler: async (ctx) => {
    const user = (await authComponent.getAuthUser(ctx)) as BetterAuthUser | null;
    if (!user || !isStaff(user)) return null;
    return await ctx.db.query("managedPrograms").collect();
  },
});

/** Public: published managed programs only. */
export const listPublished = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("managedPrograms").collect();
    return rows.filter((r) => r.published && !r.archived).map((r) => ({ programId: r.programId, data: r.data }));
  },
});

type ProgramShape = {
  id?: unknown;
  locationSlug?: unknown;
  name?: unknown;
  category?: unknown;
  season?: unknown;
  sessions?: unknown;
  options?: unknown;
};

/** Staff: create or update a program from its full JSON definition. */
export const saveProgram = mutation({
  args: { data: v.string(), published: v.boolean() },
  handler: async (ctx, args) => {
    const user = (await authComponent.getAuthUser(ctx)) as BetterAuthUser | null;
    if (!user) throw new Error("Not authenticated");
    if (!isStaff(user)) throw new Error("Only staff can edit programs");
    let p: ProgramShape;
    try {
      p = JSON.parse(args.data) as ProgramShape;
    } catch {
      throw new Error("Invalid program data");
    }
    const str = (x: unknown) => (typeof x === "string" ? x.trim() : "");
    const programId = str(p.id);
    const name = str(p.name);
    const locationSlug = str(p.locationSlug);
    if (!programId || !name || !locationSlug) throw new Error("Program needs an id, name and location");
    if (!Array.isArray(p.sessions) || p.sessions.length === 0) throw new Error("Add at least one session");
    if (!Array.isArray(p.options) || p.options.length === 0) throw new Error("Add at least one pricing option");
    const existing = await ctx.db
      .query("managedPrograms")
      .withIndex("by_programId", (q) => q.eq("programId", programId))
      .first();
    const row = {
      programId,
      locationSlug,
      name,
      category: str(p.category) || "Camps",
      season: str(p.season),
      published: args.published,
      data: args.data,
      updatedAt: Date.now(),
      updatedBy: user.email,
    };
    await logActivity(ctx, user.email, existing ? "Edited program" : "Created program", `${name} (${locationSlug})${args.published ? " · published" : " · draft"}`);
    if (existing) {
      await ctx.db.patch(existing._id, row);
      return existing._id;
    }
    return await ctx.db.insert("managedPrograms", row);
  },
});

/** Staff: publish / unpublish. */
export const setPublished = mutation({
  args: { programId: v.string(), published: v.boolean() },
  handler: async (ctx, args) => {
    const user = (await authComponent.getAuthUser(ctx)) as BetterAuthUser | null;
    if (!user) throw new Error("Not authenticated");
    if (!isStaff(user)) throw new Error("Only staff can edit programs");
    const row = await ctx.db
      .query("managedPrograms")
      .withIndex("by_programId", (q) => q.eq("programId", args.programId))
      .first();
    if (!row) throw new Error("Save the program first");
    await ctx.db.patch(row._id, { published: args.published, updatedAt: Date.now(), updatedBy: user.email });
    await logActivity(ctx, user.email, args.published ? "Published program" : "Unpublished program", row.name);
    return row._id;
  },
});

/** Staff: short-lived URL to upload a program photo to file storage. */
export const generateImageUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const user = (await authComponent.getAuthUser(ctx)) as BetterAuthUser | null;
    if (!user) throw new Error("Not authenticated");
    if (!isStaff(user)) throw new Error("Only staff can upload photos");
    return await ctx.storage.generateUploadUrl();
  },
});

/** Staff: turn an uploaded file into a permanent public URL. */
export const resolveImageUrl = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const user = (await authComponent.getAuthUser(ctx)) as BetterAuthUser | null;
    if (!user) throw new Error("Not authenticated");
    if (!isStaff(user)) throw new Error("Only staff can upload photos");
    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) throw new Error("Upload not found");
    return url;
  },
});

/** Staff: delete a managed program (seed programs revert to their defaults). */
export const deleteProgram = mutation({
  args: { programId: v.string() },
  handler: async (ctx, args) => {
    const user = (await authComponent.getAuthUser(ctx)) as BetterAuthUser | null;
    if (!user) throw new Error("Not authenticated");
    if (!isStaff(user)) throw new Error("Only staff can edit programs");
    const row = await ctx.db
      .query("managedPrograms")
      .withIndex("by_programId", (q) => q.eq("programId", args.programId))
      .first();
    const reg = await ctx.db
      .query("registrations")
      .withIndex("by_programId", (q) => q.eq("programId", args.programId))
      .first();
    if (reg) throw new Error("This program has registrations (active or past) and can't be deleted. Unpublish it instead.");
    if (row) await ctx.db.delete(row._id);
    await logActivity(ctx, user.email, "Deleted program", row?.name ?? args.programId);
    return args.programId;
  },
});
