// Shipper password recovery version: convex-better-auth-0.12.3+better-auth-1.6.15+shipper.4
/**
 * Generated auth settings for shipper.auth.ts
 * These flags are managed by Shipper Cloud project auth settings.
 */
export const SHIPPER_AUTH_TEMPLATE_VERSION = "convex-better-auth-0.12.3+better-auth-1.6.15+shipper.4" as const;
export const AUTH_CONFIG = {
      authEnabled: true,
      signupEnabled: true,
      emailPasswordEnabled: true,
      googleEnabled: false,
      anonymousEnabled: false,
      passwordResetEnabled: true,
      passwordResetTemplateSlug: "password-reset",
      passwordResetPath: "/reset-password",
      passwordResetTokenExpiresIn: 3600,
    } as const;

export type AuthConfig = typeof AUTH_CONFIG;
