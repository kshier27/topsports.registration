import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { authComponent } from "./auth";

/** How long a family has to claim an offered spot. */
export const OFFER_HOURS = 24;
const OFFER_MS = OFFER_HOURS * 60 * 60 * 1000;

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

async function me(ctx: QueryCtx): Promise<BetterAuthUser | null> {
  return (await authComponent.getAuthUser(ctx)) as BetterAuthUser | null;
}

async function sessionQueue(ctx: QueryCtx, programId: string, sessionId: string) {
  return await ctx.db
    .query("waitlist")
    .withIndex("by_session", (q) => q.eq("programId", programId).eq("sessionId", sessionId))
    .order("asc")
    .collect();
}

async function withPosition(ctx: QueryCtx, e: Doc<"waitlist">) {
  if (e.status !== "waiting") return { ...e, position: null as number | null };
  const queue = await sessionQueue(ctx, e.programId, e.sessionId);
  const ahead = queue.filter((x) => x.status === "waiting" && x.createdAt < e.createdAt).length;
  return { ...e, position: ahead + 1 };
}

async function makeOffer(ctx: MutationCtx, id: Id<"waitlist">) {
  const now = Date.now();
  await ctx.db.patch(id, { status: "offered", offeredAt: now, offerExpiresAt: now + OFFER_MS });
  await ctx.scheduler.runAfter(OFFER_MS, internal.waitlist.expireOffer, { id });
  const e = await ctx.db.get(id);
  if (e?.parentEmail) {
    const site = process.env.SITE_URL ?? "";
    await ctx.scheduler.runAfter(0, internal.notify.sendFamilyNotice, {
      to: e.parentEmail,
      parentName: e.parentName,
      locationSlug: e.locationSlug,
      subject: `A spot opened for ${e.childName.split(" ")[0]}!`,
      lines: [
        `Good news! A spot just opened for ${e.childName} and it's being held for you for ${OFFER_HOURS} hours.`,
        `Sign in to My Family${site ? ` (${site}/account)` : ""} and tap Claim Spot, then complete checkout before ${new Date(now + OFFER_MS).toLocaleString("en-CA", { timeZone: "America/Toronto", dateStyle: "medium", timeStyle: "short" })} (Toronto time).`,
        "If you don't claim it in time, the spot moves to the next family on the waitlist.",
      ],
    });
  }
}

/**
 * A spot just opened in this session: offer it to the longest-waiting family.
 * Called automatically after withdrawals, transfers, approved refunds,
 * declined/expired offers and cancelled offers.
 */
export async function offerNextSpot(ctx: MutationCtx, programId: string, sessionId: string) {
  const queue = await sessionQueue(ctx, programId, sessionId);
  const next = queue.find((e) => e.status === "waiting");
  if (!next) return null;
  await makeOffer(ctx, next._id);
  return next._id;
}

/** Family: join the waitlist for a full session. */
export const join = mutation({
  args: {
    programId: v.string(),
    locationSlug: v.string(),
    sessionId: v.string(),
    optionId: v.string(),
    childLocalId: v.optional(v.string()),
    childName: v.string(),
    childDob: v.string(),
    parentName: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await me(ctx);
    if (!user) throw new Error("Sign in to join the waitlist");
    const queue = await sessionQueue(ctx, args.programId, args.sessionId);
    const existing = queue.find(
      (e) => e.userId === user._id && e.childName.toLowerCase() === args.childName.toLowerCase() && (e.status === "waiting" || e.status === "offered"),
    );
    if (existing) return { id: existing._id, position: null, duplicate: true };
    const position = queue.filter((e) => e.status === "waiting").length + 1;
    const id = await ctx.db.insert("waitlist", {
      ...args,
      userId: user._id,
      parentEmail: user.email,
      parentName: args.parentName || user.name || "",
      status: "waiting",
      createdAt: Date.now(),
    });
    return { id, position, duplicate: false };
  },
});

/** Family: every waitlist entry they own (newest first) with queue position. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await me(ctx);
    if (!user) return null;
    const rows = await ctx.db
      .query("waitlist")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
    const visible = rows.filter((r) => r.status !== "cancelled").slice(0, 30);
    return await Promise.all(visible.map((r) => withPosition(ctx, r)));
  },
});

/** Family: leave the waitlist (or give up an offered spot). */
export const leave = mutation({
  args: { id: v.id("waitlist") },
  handler: async (ctx, args) => {
    const user = await me(ctx);
    if (!user) throw new Error("Not authenticated");
    const e = await ctx.db.get(args.id);
    if (!e || e.userId !== user._id) throw new Error("Waitlist entry not found");
    if (e.status !== "waiting" && e.status !== "offered") throw new Error("This entry is no longer active");
    await ctx.db.patch(e._id, { status: e.status === "offered" ? "declined" : "cancelled", resolvedAt: Date.now() });
    if (e.status === "offered") await offerNextSpot(ctx, e.programId, e.sessionId);
    return e._id;
  },
});

/** Family: claim an offered spot (they then complete checkout). */
export const acceptOffer = mutation({
  args: { id: v.id("waitlist") },
  handler: async (ctx, args) => {
    const user = await me(ctx);
    if (!user) throw new Error("Not authenticated");
    const e = await ctx.db.get(args.id);
    if (!e || e.userId !== user._id) throw new Error("Waitlist entry not found");
    if (e.status !== "offered") throw new Error("This offer is no longer available");
    if ((e.offerExpiresAt ?? 0) < Date.now()) throw new Error("This offer has expired");
    await ctx.db.patch(e._id, { status: "accepted", resolvedAt: Date.now() });
    return e._id;
  },
});

/** Scheduled: an unclaimed offer lapses and moves to the next family in line. */
export const expireOffer = internalMutation({
  args: { id: v.id("waitlist") },
  handler: async (ctx, args) => {
    const e = await ctx.db.get(args.id);
    if (!e || e.status !== "offered") return;
    if ((e.offerExpiresAt ?? 0) > Date.now() + 1000) return;
    await ctx.db.patch(e._id, { status: "expired", resolvedAt: Date.now() });
    await offerNextSpot(ctx, e.programId, e.sessionId);
  },
});

/** Staff: every active and recently resolved waitlist entry. */
export const listAll = query({
  args: {},
  handler: async (ctx) => {
    const user = await me(ctx);
    if (!user || !isStaff(user)) return [];
    const rows = await ctx.db.query("waitlist").order("desc").take(500);
    const active = rows.filter((r) => r.status !== "cancelled");
    return await Promise.all(active.map((r) => withPosition(ctx, r)));
  },
});

/** Staff: offer a spot now — to a specific family, or the next in line. */
export const staffOffer = mutation({
  args: { id: v.optional(v.id("waitlist")), programId: v.optional(v.string()), sessionId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await me(ctx);
    if (!isStaff(user)) throw new Error("Only staff can offer spots");
    if (args.id) {
      const e = await ctx.db.get(args.id);
      if (!e || e.status !== "waiting") throw new Error("Only waiting families can be offered a spot");
      await makeOffer(ctx, e._id);
      return e._id;
    }
    if (!args.programId || !args.sessionId) throw new Error("Choose a session");
    const id = await offerNextSpot(ctx, args.programId, args.sessionId);
    if (!id) throw new Error("Nobody is waiting for this session");
    return id;
  },
});

/** Staff: remove an entry from the queue. */
export const staffRemove = mutation({
  args: { id: v.id("waitlist") },
  handler: async (ctx, args) => {
    const user = await me(ctx);
    if (!isStaff(user)) throw new Error("Only staff can remove waitlist entries");
    const e = await ctx.db.get(args.id);
    if (!e) throw new Error("Entry not found");
    await ctx.db.patch(e._id, { status: "cancelled", resolvedAt: Date.now() });
    if (e.status === "offered") await offerNextSpot(ctx, e.programId, e.sessionId);
    return e._id;
  },
});
