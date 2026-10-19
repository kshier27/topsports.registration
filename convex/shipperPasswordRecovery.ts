/**
 * Shipper-managed password recovery delivery.
 * Shipper auth template version: convex-better-auth-0.12.3+better-auth-1.6.15+shipper.4
 */
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

export const sendPasswordResetEmail = internalAction({
  args: {
    email: v.string(),
    name: v.string(),
    resetUrl: v.string(),
    expiresAt: v.number(),
    attempt: v.number(),
  },
  handler: async (ctx, args): Promise<void> => {
    if (Date.now() >= args.expiresAt) return;
    const endpoint = process.env.SHIPPER_AUTH_EMAIL_URL;
    const token = process.env.SHIPPER_AUTH_EMAIL_TOKEN;
    if (!endpoint || !token) {
      throw new Error("Password recovery email is not configured");
    }

    let retryDelayMs = 5000 * Math.pow(5, args.attempt);
    let retryable = true;
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Shipper-Token": token },
        body: JSON.stringify({ to: args.email, name: args.name, resetUrl: args.resetUrl }),
      });
      if (response.ok) {
        const result: { success: boolean; skipped?: boolean } = await response.json();
        if (result.success === true && result.skipped !== true) return;
        retryable = false;
      } else {
        retryable = response.status === 429 || response.status >= 500;
      }
      const retryAfterSeconds = Number(response.headers.get("Retry-After"));
      if (response.status === 429 && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
        retryDelayMs = Math.max(retryDelayMs, retryAfterSeconds * 1000);
      }
      // Keep reset links, recipients and provider response bodies out of logs.
      console.error("Password recovery delivery failed", { status: response.status });
    } catch {
      console.error("Password recovery delivery failed: network error");
    }

    if (retryable && args.attempt < 2 && Date.now() + retryDelayMs < args.expiresAt) {
      await ctx.scheduler.runAfter(retryDelayMs, internal.shipperPasswordRecovery.sendPasswordResetEmail, {
        ...args,
        attempt: args.attempt + 1,
      });
      return;
    }
    throw new Error("Password recovery email could not be delivered");
  },
});
