"use node";
import { action, internalAction } from "./_generated/server";
import { internal, api, components } from "./_generated/api";
import { v } from "convex/values";
import Stripe from "stripe";
import { loadReplyBook, pickReplyTo, type ReplyBook } from "./replyTo";

type AudReg = {
  programId: string;
  sessionId: string;
  childName: string;
  parentName: string;
  parentEmail: string;
  guardian2Name?: string;
  guardian2Email?: string;
};

type CatSlot = { id: string; label: string; dates?: string; days?: string; time?: string };
type CatSession = { id: string; name: string; dates: string; days: string; time: string; slots?: CatSlot[] };
type CatProgram = { id: string; name: string; venue: string; location: string; locationSlug: string; season: string; category: string; sessions: CatSession[] };

type Audience = {
  mode: "program" | "multi" | "filtered" | "everyone";
  programId?: string;
  programIds?: string[];
  sessionKeys?: string[]; // "sid" (whole session) or "sid~slotId" (one option)
  locations?: string[];
  seasons?: string[];
  categories?: string[];
};

type EmailArgs = {
  audience: Audience;
  label: string;
  day?: string;
  includeSecondGuardian?: boolean;
  subject: string;
  body: string;
  replyTo?: string;
  catalog: CatProgram[];
};

// Older scheduled payloads (before audiences existed).
type LegacyArgs = {
  programId: string;
  sessionId?: string;
  day?: string;
  includeSecondGuardian?: boolean;
  subject: string;
  body: string;
  program: { name: string; venue: string; location: string; season: string; sessions: { id: string; name: string; dates: string; days: string; time: string }[] };
};

const fill = (tpl: string, vars: Record<string, string>) =>
  tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vars[k] ?? "");

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const slotV = v.object({ id: v.string(), label: v.string(), dates: v.optional(v.string()), days: v.optional(v.string()), time: v.optional(v.string()) });
const emailArgs = {
  audience: v.object({
    mode: v.union(v.literal("program"), v.literal("multi"), v.literal("filtered"), v.literal("everyone")),
    programId: v.optional(v.string()),
    programIds: v.optional(v.array(v.string())),
    sessionKeys: v.optional(v.array(v.string())),
    locations: v.optional(v.array(v.string())),
    seasons: v.optional(v.array(v.string())),
    categories: v.optional(v.array(v.string())),
  }),
  label: v.string(),
  day: v.optional(v.string()),
  includeSecondGuardian: v.optional(v.boolean()),
  subject: v.string(),
  body: v.string(),
  replyTo: v.optional(v.string()),
  catalog: v.array(v.object({
    id: v.string(), name: v.string(), venue: v.string(), location: v.string(), locationSlug: v.string(), season: v.string(), category: v.string(),
    sessions: v.array(v.object({ id: v.string(), name: v.string(), dates: v.string(), days: v.string(), time: v.string(), slots: v.optional(v.array(slotV)) })),
  })),
};

function normalize(a: EmailArgs | LegacyArgs): EmailArgs {
  if ("audience" in a) return a;
  return {
    audience: { mode: "program", programId: a.programId, sessionKeys: a.sessionId ? [a.sessionId] : [] },
    label: a.program.name,
    day: a.day,
    includeSecondGuardian: a.includeSecondGuardian,
    subject: a.subject,
    body: a.body,
    catalog: [{ id: a.programId, name: a.program.name, venue: a.program.venue, location: a.program.location, locationSlug: "", season: a.program.season, category: "", sessions: a.program.sessions }],
  };
}

type Recipient = { email: string; name: string; children: string[]; reg?: AudReg };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildRecipients(ctx: any, args: EmailArgs): Promise<Recipient[]> {
  const data = (await ctx.runQuery(internal.staffQueries.audienceData, {})) as { regs: AudReg[] };
  const cat = new Map(args.catalog.map((p) => [p.id, p]));
  const a = args.audience;
  const keys = a.sessionKeys ?? [];
  const sessionMatch = (sid: string) => keys.length === 0 || keys.some((k) => sid === k || (!k.includes("~") && sid.startsWith(`${k}~`)));
  const inList = (list: string[] | undefined, val: string) => !list || list.length === 0 || list.includes(val);

  const regs = data.regs.filter((r) => {
    if (a.mode === "program") return r.programId === a.programId && sessionMatch(r.sessionId);
    if (a.mode === "multi") return (a.programIds ?? []).includes(r.programId);
    if (a.mode === "filtered") {
      const p = cat.get(r.programId);
      if (!p) return false;
      return inList(a.locations, p.locationSlug) && inList(a.seasons, p.season) && inList(a.categories, p.category);
    }
    return true;
  });

  const byEmail = new Map<string, Recipient>();
  const add = (email: string | undefined, name: string, child: string | undefined, reg?: AudReg) => {
    const key = (email ?? "").trim().toLowerCase();
    if (!key || !key.includes("@")) return;
    const cur = byEmail.get(key) ?? { email: key, name, children: [], reg };
    if (child) {
      const first = child.split(" ")[0];
      if (first && !cur.children.includes(first)) cur.children.push(first);
    }
    if (!cur.reg && reg) cur.reg = reg;
    if (!cur.name && name) cur.name = name;
    byEmail.set(key, cur);
  };
  for (const r of regs) {
    add(r.parentEmail, r.parentName, r.childName, r);
    if (args.includeSecondGuardian && r.guardian2Email) add(r.guardian2Email, r.guardian2Name ?? "", r.childName, r);
  }

  if (a.mode === "everyone") {
    let cursor: string | null = null;
    for (let i = 0; i < 40; i++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const page: any = await ctx.runQuery(components.betterAuth.adapter.findMany, {
        model: "user",
        paginationOpts: { numItems: 500, cursor },
      });
      for (const u of (page?.page ?? []) as { email?: string; name?: string | null }[]) add(u.email, u.name ?? "", undefined);
      if (page?.isDone || !page?.continueCursor) break;
      cursor = page.continueCursor;
    }
  }
  return [...byEmail.values()];
}

function varsFor(rc: Recipient, args: EmailArgs): Record<string, string> {
  const p = rc.reg ? args.catalog.find((x) => x.id === rc.reg!.programId) : undefined;
  const [baseSid, slotId] = (rc.reg?.sessionId ?? "").split("~");
  const s = p?.sessions.find((x) => x.id === baseSid);
  const slot = slotId ? s?.slots?.find((t) => t.id === slotId) : undefined;
  const kids = rc.children;
  return {
    parentName: rc.name.split(" ")[0] || "there",
    childName: kids.length === 0 ? "your child" : kids.length === 1 ? kids[0] : `${kids.slice(0, -1).join(", ")} & ${kids[kids.length - 1]}`,
    programName: p?.name ?? "",
    sessionName: s ? `${s.name}${slot ? ` (${slot.label})` : ""}` : "",
    dates: slot?.dates || s?.dates || "",
    days: slot?.days || s?.days || "",
    time: slot?.time || s?.time || "",
    venue: p?.venue ?? "",
    location: p?.location ?? "",
    season: p?.season ?? "",
    day: args.day ?? "",
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sendOne(to: string, args: EmailArgs, vars: Record<string, string>, replyTo: string): Promise<"sent" | "skipped" | "failed"> {
  const url = process.env.SHIPPER_EMAIL_URL;
  const token = process.env.SHIPPER_EMAIL_TOKEN;
  if (!url || !token) throw new Error("Email is not configured");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shipper-Token": token },
    body: JSON.stringify({
      to,
      replyTo,
      templateSlug: "program-message",
      templateData: {
        subject: fill(args.subject, vars),
        message: esc(fill(args.body, vars)).replace(/\n/g, "<br/>"),
        ...vars,
      },
    }),
  });
  if (!res.ok) return "failed";
  const data = await res.json().catch(() => ({}));
  return data?.skipped ? "skipped" : "sent";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deliver(ctx: any, raw: EmailArgs | LegacyArgs): Promise<{ sent: number; skipped: number; failed: number }> {
  const args = normalize(raw);
  if (!process.env.SHIPPER_EMAIL_URL || !process.env.SHIPPER_EMAIL_TOKEN) throw new Error("Email is not configured");
  const recipients = await buildRecipients(ctx, args);
  const book = await loadReplyBook(ctx);
  let sent = 0, skipped = 0, failed = 0;
  for (const rc of recipients) {
    const r = await sendOne(rc.email, args, varsFor(rc, args), replyFor(book, rc, args));
    if (r === "sent") sent++;
    else if (r === "skipped") skipped++;
    else failed++;
  }
  return { sent, skipped, failed };
}

/** Manual override → the recipient's program location inbox → support email (Entire Database). */
function replyFor(book: ReplyBook, rc: Recipient | undefined, args: EmailArgs): string {
  if (args.audience.mode === "everyone") return pickReplyTo(book, undefined, args.replyTo);
  const p = rc?.reg ? args.catalog.find((x) => x.id === rc.reg!.programId) : undefined;
  const fallbackProgram = args.audience.mode === "program" ? args.catalog.find((x) => x.id === args.audience.programId) : undefined;
  const slug = p?.locationSlug || fallbackProgram?.locationSlug || undefined;
  return pickReplyTo(book, slug, args.replyTo);
}

/** Staff: which address replies go to for this send (first matching family). */
export const previewReplyTo = action({
  args: emailArgs,
  handler: async (ctx, args): Promise<{ replyTo: string; varies: boolean }> => {
    await assertStaff(ctx);
    const a = args as EmailArgs;
    const book = await loadReplyBook(ctx);
    if (a.replyTo?.trim() || a.audience.mode === "everyone") return { replyTo: replyFor(book, undefined, a), varies: false };
    const list = await buildRecipients(ctx, a);
    const all = new Set(list.map((rc) => replyFor(book, rc, a)));
    return { replyTo: list.length ? replyFor(book, list[0], a) : replyFor(book, undefined, a), varies: all.size > 1 };
  },
});

async function assertStaff(ctx: { runQuery: (...a: never[]) => unknown }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ok = (await (ctx as any).runQuery(api.registrationOps.amIStaff, {})) as boolean;
  if (!ok) throw new Error("Only staff can send family emails");
}

/** Staff: how many unique email addresses an audience reaches, with a few examples. */
export const previewAudience = action({
  args: emailArgs,
  handler: async (ctx, args): Promise<{ count: number; sample: string[] }> => {
    await assertStaff(ctx);
    const list = await buildRecipients(ctx, args as EmailArgs);
    return { count: list.length, sample: list.slice(0, 5).map((r) => r.email) };
  },
});

/** Staff: send one test copy to yourself, filled with the first recipient's details. */
export const sendTestEmail = action({
  args: emailArgs,
  handler: async (ctx, args): Promise<{ to: string }> => {
    await assertStaff(ctx);
    const me: string = await ctx.runQuery(internal.staffTools.whoAmI, {});
    if (!me) throw new Error("Sign in again to send a test");
    const list = await buildRecipients(ctx, args as EmailArgs);
    const sample: Recipient = list[0] ?? { email: me, name: "Jane Sample", children: ["William"] };
    const a = { ...(args as EmailArgs), subject: `[TEST] ${args.subject}` };
    const r = await sendOne(me, a, varsFor(sample, a), replyFor(await loadReplyBook(ctx), list[0], a));
    if (r === "failed") throw new Error("The test email could not be sent");
    return { to: me };
  },
});

/** Staff: email an audience now. */
export const sendProgramEmail = action({
  args: emailArgs,
  handler: async (ctx, args): Promise<{ sent: number; skipped: number; failed: number }> => {
    await assertStaff(ctx);
    const res = await deliver(ctx, args as EmailArgs);
    const createdBy: string = await ctx.runQuery(internal.staffTools.whoAmI, {});
    const a = args.audience;
    await ctx.runMutation(internal.staffTools.recordEmail, {
      status: res.failed && !res.sent ? "failed" : "sent",
      sentCount: res.sent,
      failedCount: res.failed,
      programId: a.mode === "program" ? a.programId ?? "" : a.mode,
      programName: args.label,
      sessionLabel: a.mode === "program" ? ((a.sessionKeys ?? []).length ? `${a.sessionKeys!.length} session pick${a.sessionKeys!.length === 1 ? "" : "s"}` : "All sessions") : a.mode === "everyone" ? "Entire database" : a.mode === "multi" ? `${(a.programIds ?? []).length} programs` : "Filtered audience",
      subject: args.subject,
      createdBy,
    });
    return res;
  },
});

/** Scheduled: send an email queued with "Send Later". */
export const sendScheduledEmail = internalAction({
  args: { id: v.id("sentEmails") },
  handler: async (ctx, args) => {
    const row = await ctx.runQuery(internal.staffTools.getEmailRow, { id: args.id });
    if (!row || row.status !== "scheduled") return;
    try {
      const res = await deliver(ctx, JSON.parse(row.payload) as EmailArgs | LegacyArgs);
      await ctx.runMutation(internal.staffTools.recordEmail, { id: args.id, status: res.failed && !res.sent ? "failed" : "sent", sentCount: res.sent, failedCount: res.failed });
    } catch {
      await ctx.runMutation(internal.staffTools.recordEmail, { id: args.id, status: "failed", sentCount: 0, failedCount: 0 });
    }
  },
});

/** Send an approved refund back to the card through Stripe. */
export const processStripeRefund = internalAction({
  args: { requestId: v.id("refundRequests") },
  handler: async (ctx, args) => {
    const key = process.env.STRIPE_SECRET_KEY;
    const info = await ctx.runQuery(internal.staffQueries.refundInfo, { requestId: args.requestId });
    if (!info) return;
    if (!key) {
      await ctx.runMutation(internal.staffQueries.setRefundStripe, { requestId: args.requestId, stripeStatus: "not_connected" });
      return;
    }
    if (!info.sessionId) {
      await ctx.runMutation(internal.staffQueries.setRefundStripe, { requestId: args.requestId, stripeStatus: "no_payment_found" });
      return;
    }
    try {
      const stripe = new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
      const session = await stripe.checkout.sessions.retrieve(info.sessionId);
      const pi = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
      if (!pi) throw new Error("no payment intent");
      const refund = await stripe.refunds.create(
        { payment_intent: pi, amount: info.refundCents, metadata: { refundRequestId: args.requestId } },
        { idempotencyKey: `refund-${args.requestId}` },
      );
      await ctx.runMutation(internal.staffQueries.setRefundStripe, { requestId: args.requestId, stripeStatus: refund.status ?? "pending", stripeRefundId: refund.id });
    } catch (e) {
      await ctx.runMutation(internal.staffQueries.setRefundStripe, { requestId: args.requestId, stripeStatus: `failed: ${e instanceof Error ? e.message : "error"}`.slice(0, 200) });
    }
  },
});
