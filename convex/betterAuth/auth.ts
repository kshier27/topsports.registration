/**
 * Static Auth Export for Schema Generation
 * Run: npx @better-auth/cli generate -y
 * Shipper auth template version: convex-better-auth-0.12.3+better-auth-1.6.15+shipper.4
 * @see https://convex-better-auth.netlify.app/features/local-install
 */
import { createAuth } from "../auth";

// Export a static instance for Better Auth schema generation
export const auth = createAuth({} as never);
