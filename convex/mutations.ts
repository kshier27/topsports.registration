import { mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { authComponent } from "./auth";
import { findProgram } from "./programLookup";
import { formatOutDate } from "../src/data/registration";

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

// Create a new children
export const createChildren = mutation({
  args: {
    firstName: v.string(),
    lastName: v.string(),
    dob: v.string(),
    medicalNotes: v.optional(v.string()),
    address: v.optional(v.string()),
    school: v.optional(v.string()),
    emergencyContact: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx) as BetterAuthUser | null;
    if (!user) throw new Error("Not authenticated");

    const id = await ctx.db.insert("children", {
      address: args.address,
      school: args.school,
      emergencyContact: args.emergencyContact,
      userId: user._id,
      firstName: args.firstName,
      lastName: args.lastName,
      dob: args.dob,
      medicalNotes: args.medicalNotes,
    });
    const doc = await ctx.db.get(id);
    await ctx.scheduler.runAfter(0, internal.automations.onDataEvent, {
      table: "children",
      event: "create",
      document: doc ? JSON.stringify(doc) : undefined,
    });
    return id;
  },
});

// Update a children (only if owned by user)
export const updateChildren = mutation({
  args: {
    id: v.id("children"),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    dob: v.optional(v.string()),
    medicalNotes: v.optional(v.optional(v.string())),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx) as BetterAuthUser | null;
    if (!user) throw new Error("Not authenticated");

    const existing = await ctx.db.get(args.id);
    if (!existing || existing.userId !== user._id) {
      throw new Error("Not found or not authorized");
    }

    const { id, ...updates } = args;
    // Filter out undefined values
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );

    await ctx.db.patch(args.id, cleanUpdates);
    const doc = await ctx.db.get(args.id);
    await ctx.scheduler.runAfter(0, internal.automations.onDataEvent, {
      table: "children",
      event: "update",
      document: doc ? JSON.stringify(doc) : undefined,
    });
    return args.id;
  },
});

// Delete a children (only if owned by user)
export const deleteChildren = mutation({
  args: { id: v.id("children") },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx) as BetterAuthUser | null;
    if (!user) throw new Error("Not authenticated");

    const existing = await ctx.db.get(args.id);
    if (!existing || existing.userId !== user._id) {
      throw new Error("Not found or not authorized");
    }

    await ctx.db.delete(args.id);
    await ctx.scheduler.runAfter(0, internal.automations.onDataEvent, {
      table: "children",
      event: "delete",
      document: JSON.stringify(existing),
    });
    return args.id;
  },
});

// Create a new registration
export const createRegistration = mutation({
  args: {
    programId: v.string(),
    locationSlug: v.string(),
    sessionId: v.string(),
    childName: v.string(),
    childDob: v.string(),
    parentName: v.string(),
    parentEmail: v.string(),
    friendRequest: v.optional(v.string()),
    jerseySize: v.optional(v.string()),
    heardAbout: v.optional(v.string()),
    parentPhone: v.optional(v.string()),
    guardian2Name: v.optional(v.string()),
    guardian2Email: v.optional(v.string()),
    guardian2Phone: v.optional(v.string()),
    waiversAccepted: v.optional(v.array(v.string())),
    waiverSnapshot: v.optional(v.array(v.object({ id: v.string(), title: v.string(), text: v.string() }))),
    signatureName: v.optional(v.string()),
    signedAt: v.optional(v.number()),
    childAddress: v.optional(v.string()),
    childSchool: v.optional(v.string()),
    emergencyContact: v.optional(v.string()),
    authorizedPickup: v.optional(v.string()),
    customAnswers: v.optional(v.array(v.object({ question: v.string(), answer: v.string() }))),
    amountCents: v.number(),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx) as BetterAuthUser | null;
    if (!user) throw new Error("Not authenticated");

    const id = await ctx.db.insert("registrations", {
      jerseySize: args.jerseySize,
      heardAbout: args.heardAbout,
      parentPhone: args.parentPhone,
      guardian2Name: args.guardian2Name,
      guardian2Email: args.guardian2Email,
      guardian2Phone: args.guardian2Phone,
      waiversAccepted: args.waiversAccepted,
      waiverSnapshot: args.waiverSnapshot,
      signatureName: args.signatureName?.trim() || undefined,
      signedAt: args.signedAt,
      childAddress: args.childAddress,
      childSchool: args.childSchool,
      emergencyContact: args.emergencyContact,
      authorizedPickup: args.authorizedPickup,
      customAnswers: args.customAnswers,
      userId: user._id,
      programId: args.programId,
      locationSlug: args.locationSlug,
      sessionId: args.sessionId,
      childName: args.childName,
      childDob: args.childDob,
      parentName: args.parentName,
      parentEmail: args.parentEmail,
      friendRequest: args.friendRequest,
      amountCents: args.amountCents,
      status: args.status,
    });
    const regProgram = await findProgram(ctx, args.programId);
    const outDatesLine = (regProgram?.outDates?.length ?? 0) > 0
      ? `Out dates: ${regProgram!.outDates!.map((o) => `${formatOutDate(o.date)}${o.note ? ` (${o.note})` : ""}`).join(", ")}`
      : "Out dates: none";
    await ctx.scheduler.runAfter(0, internal.notify.sendLocationCopy, {
      locationSlug: args.locationSlug,
      subject: `New Registration — ${args.childName}`,
      lines: [
        `Participant: ${args.childName} (DOB ${args.childDob})`,
        `Program: ${args.programId} · Session: ${args.sessionId}`,
        `Parent: ${args.parentName} (${args.parentEmail}${args.parentPhone ? `, ${args.parentPhone}` : ""})`,
        args.guardian2Name ? `Second guardian: ${args.guardian2Name} (${args.guardian2Email ?? ""})` : "Second guardian: none",
        `Amount paid: ${(args.amountCents / 100).toFixed(2)}`,
        args.friendRequest ? `Friend request: ${args.friendRequest}` : "Friend request: none",
        args.jerseySize ? `Jersey size: ${args.jerseySize}` : "",
        outDatesLine,
      ].filter(Boolean),
    });
    const doc = await ctx.db.get(id);
    await ctx.scheduler.runAfter(0, internal.automations.onDataEvent, {
      table: "registrations",
      event: "create",
      document: doc ? JSON.stringify(doc) : undefined,
    });
    return id;
  },
});

// Update a registration (only if owned by user)
export const updateRegistration = mutation({
  args: {
    id: v.id("registrations"),
    programId: v.optional(v.string()),
    locationSlug: v.optional(v.string()),
    sessionId: v.optional(v.string()),
    childName: v.optional(v.string()),
    childDob: v.optional(v.string()),
    parentName: v.optional(v.string()),
    parentEmail: v.optional(v.string()),
    friendRequest: v.optional(v.optional(v.string())),
    amountCents: v.optional(v.number()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx) as BetterAuthUser | null;
    if (!user) throw new Error("Not authenticated");

    const existing = await ctx.db.get(args.id);
    if (!existing || existing.userId !== user._id) {
      throw new Error("Not found or not authorized");
    }

    const { id, ...updates } = args;
    // Filter out undefined values
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );

    await ctx.db.patch(args.id, cleanUpdates);
    const doc = await ctx.db.get(args.id);
    await ctx.scheduler.runAfter(0, internal.automations.onDataEvent, {
      table: "registrations",
      event: "update",
      document: doc ? JSON.stringify(doc) : undefined,
    });
    return args.id;
  },
});

// Delete a registration (only if owned by user)
export const deleteRegistration = mutation({
  args: { id: v.id("registrations") },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx) as BetterAuthUser | null;
    if (!user) throw new Error("Not authenticated");

    const existing = await ctx.db.get(args.id);
    if (!existing || existing.userId !== user._id) {
      throw new Error("Not found or not authorized");
    }

    await ctx.db.delete(args.id);
    await ctx.scheduler.runAfter(0, internal.automations.onDataEvent, {
      table: "registrations",
      event: "delete",
      document: JSON.stringify(existing),
    });
    return args.id;
  },
});
