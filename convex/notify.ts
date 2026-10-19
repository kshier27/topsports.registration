import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { loadReplyBook, pickReplyTo } from "./replyTo";

/** Location inbox for each registration location. Toronto uses the main inbox. */
export function locationEmail(slug: string): string {
  const s = slug.toLowerCase();
  if (s === "toronto" || !["york", "oakville", "whitby"].includes(s)) return "info@topsports.ca";
  return `${s}@topsports.ca`;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Email a family about a change to their registration (refund, credit, transfer). */
export const sendFamilyNotice = internalAction({
  args: {
    to: v.string(),
    parentName: v.string(),
    subject: v.string(),
    lines: v.array(v.string()),
    locationSlug: v.optional(v.string()),
    replyTo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const url = process.env.SHIPPER_EMAIL_URL;
    const token = process.env.SHIPPER_EMAIL_TOKEN;
    if (!url || !token) {
      console.warn("Family notice skipped: email not configured");
      return { success: false };
    }
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Shipper-Token": token },
        body: JSON.stringify({
          to: args.to,
          replyTo: pickReplyTo(await loadReplyBook(ctx), args.locationSlug, args.replyTo),
          templateSlug: "program-message",
          templateData: {
            subject: args.subject,
            message: args.lines.map(esc).join("<br/><br/>"),
            parentName: args.parentName.split(" ")[0] || "there",
          },
        }),
      });
      if (!res.ok) {
        let msg = `Family notice failed: ${res.status}`;
        try {
          const err = await res.json();
          msg = err?.error?.message ?? msg;
        } catch {
          /* ignore */
        }
        console.warn(msg, args.to);
        return { success: false, error: msg };
      }
      const data = await res.json().catch(() => ({}));
      if (data?.skipped) {
        console.warn("Family notice skipped:", data.reason);
        return { success: false, skipped: true };
      }
      return { success: true };
    } catch (e) {
      console.warn("Family notice error", e);
      return { success: false };
    }
  },
});

/** Send a copy of a registration / refund / transfer notice to the location inbox. */
export const sendLocationCopy = internalAction({
  args: {
    locationSlug: v.string(),
    subject: v.string(),
    lines: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const url = process.env.SHIPPER_EMAIL_URL;
    const token = process.env.SHIPPER_EMAIL_TOKEN;
    if (!url || !token) {
      console.warn("Location copy skipped: email not configured");
      return { success: false };
    }
    let to = locationEmail(args.locationSlug);
    try {
      const raw: string | null = await ctx.runQuery(internal.siteAdmin.settingsInternal, {});
      const custom = raw ? (JSON.parse(raw).locations ?? []).find((l: { slug: string; email?: string }) => l.slug === args.locationSlug)?.email : undefined;
      if (custom && /@/.test(custom)) to = custom;
    } catch {
      /* fall back to default inbox */
    }
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Shipper-Token": token },
        body: JSON.stringify({
          to,
          replyTo: to,
          templateSlug: "program-message",
          templateData: {
            subject: args.subject,
            message: args.lines.map(esc).join("<br/>"),
            parentName: "Team",
          },
        }),
      });
      if (!res.ok) {
        let msg = `Location copy failed: ${res.status}`;
        try {
          const err = await res.json();
          msg = err?.error?.message ?? msg;
        } catch {
          /* ignore */
        }
        console.warn(msg, to);
        return { success: false, error: msg };
      }
      const data = await res.json().catch(() => ({}));
      if (data?.skipped) {
        console.warn("Location copy skipped:", data.reason);
        return { success: false, skipped: true };
      }
      return { success: true };
    } catch (e) {
      console.warn("Location copy error", e);
      return { success: false };
    }
  },
});
