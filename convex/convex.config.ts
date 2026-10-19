/**
 * Convex App Configuration
 * Uses LOCAL Better Auth component for admin plugin support
 * @see https://convex-better-auth.netlify.app/features/local-install
 */
import { defineApp } from "convex/server";
import betterAuth from "./betterAuth/convex.config";

const app = defineApp();
app.use(betterAuth);

export default app;
