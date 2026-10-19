/**
 * Convex HTTP Routes
 * Required for Better Auth route handling + the Commerce Kit Stripe webhook.
 * @see https://convex-better-auth.netlify.app/
 *
 * Single-owner file: BOTH the auth routes and the commerce webhook are
 * registered here. Do not overwrite this with a payment-only router — that
 * drops authentication.
 */
import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "./auth";
import { stripeWebhook } from "./commerce";

const http = httpRouter();

// Register Better Auth routes with CORS enabled for client-side frameworks
authComponent.registerRoutes(http, createAuth, { cors: true });

// Commerce Kit - Stripe webhook.
http.route({
  path: "/commerce/stripe/webhook",
  method: "POST",
  handler: stripeWebhook,
});

export default http;
