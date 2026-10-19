/**
 * Better Auth Provider Configuration
 * Shipper auth template version: convex-better-auth-0.12.3+better-auth-1.6.15+shipper.4
 * @see https://convex-better-auth.netlify.app/
 */
import type { AuthConfig } from "convex/server";
import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";

export default {
  providers: [
    getAuthConfigProvider(),
  ],
} satisfies AuthConfig;
