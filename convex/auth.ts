// Shipper password recovery version: convex-better-auth-0.12.3+better-auth-1.6.15+shipper.4
/**
 * Better Auth Setup for Convex (Local Install)
 * Uses local schema for admin plugin support
 * Shipper auth template version: convex-better-auth-0.12.3+better-auth-1.6.15+shipper.4
 * @see https://convex-better-auth.netlify.app/features/local-install
 */
import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { anonymous, genericOAuth, admin } from "better-auth/plugins";
import { apiKey } from "@better-auth/api-key";
import { createAccessControl } from "better-auth/plugins/access";
import {
  adminAc,
  defaultStatements,
  userAc,
} from "better-auth/plugins/admin/access";
import { components, internal } from "./_generated/api";
import { DataModel } from "./_generated/dataModel";
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { betterAuth, type BetterAuthOptions } from "better-auth/minimal";
import authConfig from "./auth.config";
import authSchema from "./betterAuth/schema";
import { requireActionCtx } from "@convex-dev/better-auth/utils";
import { AUTH_CONFIG } from "../shipper.auth";

const rawSiteUrl = process.env.SITE_URL || "";
const normalizeOrigin = (url: string | null): string | null => {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    if (!url.startsWith("http")) return null;
    return url.split("/").slice(0, 3).join("/");
  }
};
const siteUrl = normalizeOrigin(rawSiteUrl) || rawSiteUrl;
const configuredOrigins = (process.env.SHIPPER_TRUSTED_ORIGINS || "")
  .split(",")
  .map((origin) => normalizeOrigin(origin.trim()))
  .filter((origin): origin is string => Boolean(origin));
const isLocalhostSiteUrl =
  siteUrl.startsWith("http://localhost") ||
  siteUrl.startsWith("http://127.0.0.1");
const enableEmbeddedPreviewCookies = !isLocalhostSiteUrl;
const convexSiteUrl =
  process.env.CONVEX_SITE_URL ||
  process.env.VITE_CONVEX_SITE_URL ||
  process.env.EXPO_PUBLIC_CONVEX_SITE_URL ||
  "";

// Create the Better Auth component client with LOCAL schema
// This enables admin plugin and other plugins that require schema changes
export const authComponent = createClient<DataModel, typeof authSchema>(
  components.betterAuth,
  {
    local: {
      schema: authSchema,
    },
  }
);

// Static trusted origins for CORS
const staticOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:3003",
];

const ac = createAccessControl({
  ...defaultStatements,
} as const);

const adminRole = ac.newRole({
  ...adminAc.statements,
} as const);

const userRole = ac.newRole({
  ...userAc.statements,
} as const);

const serviceAdminRole = ac.newRole({
  ...adminAc.statements,
} as const);

type AuthStatsPoint = {
  total: number;
  byProvider: Record<string, number>;
};

type AuthStatsGrouped = Record<string, AuthStatsPoint>;

function getConfiguredBaseUrl(): string {
  return process.env.BETTER_AUTH_BASE_URL || convexSiteUrl || siteUrl;
}

/**
 * Get trusted origins array for Better Auth CORS
 * Includes: static origins, SITE_URL, and Modal preview URLs (*.modal.host)
 */
async function getTrustedOrigins(request?: Request): Promise<string[]> {
  const origins = [
    ...staticOrigins,
    ...configuredOrigins,
    "https://*.modal.host",
    "https://*.shipper.now",
    "http://*.localhost:3003",
    "https://*.localhost:3003",
  ];
  if (siteUrl) origins.push(siteUrl);

  const add = (value: string | null | undefined, source: string) => {
    if (!value) return;

    try {
      const parsed = new URL(value);
      const host = parsed.hostname;
      const allowed =
        host.endsWith(".modal.host") ||
        host.endsWith(".shipper.now") ||
        host === "localhost" ||
        host === "127.0.0.1" ||
        (host.endsWith(".localhost") && parsed.port === "3003") ||
        configuredOrigins.includes(parsed.origin);

      if (allowed) origins.push(parsed.origin);
    } catch {}
  };

  add(request?.headers.get("origin"), "header.origin");
  add(request?.headers.get("referer"), "header.referer");

  try {
    if (request) {
      const url = new URL(request.url);
      add(url.searchParams.get("callbackURL"), "query.callbackURL");
      add(url.searchParams.get("callback"), "query.callback");
      add(url.searchParams.get("redirectTo"), "query.redirectTo");
    }
  } catch {}

  try {
    if (request && request.method !== "GET" && request.method !== "HEAD") {
      const clonedRequest = request.clone();
      const rawBody = await clonedRequest.text();

      if (rawBody) {
        try {
          const body = JSON.parse(rawBody) as Record<string, unknown>;

          add(
            typeof body.callbackURL === "string" ? body.callbackURL : null,
            "body.callbackURL"
          );
          add(
            typeof body.callback === "string" ? body.callback : null,
            "body.callback"
          );
          add(
            typeof body.redirectTo === "string" ? body.redirectTo : null,
            "body.redirectTo"
          );
        } catch {
          const formFields = new URLSearchParams(rawBody);

          add(formFields.get("callbackURL"), "form.callbackURL");
          add(formFields.get("callback"), "form.callback");
          add(formFields.get("redirectTo"), "form.redirectTo");
        }
      }
    }
  } catch {}

  return [...new Set(origins)];
}

function inferSignupProvider(request?: Request | null): string {
  if (!request) return "unknown";

  try {
    const url = new URL(request.url);
    const providerId = url.searchParams.get("providerId")?.toLowerCase();

    if (providerId === "shipper-google") {
      return "shipper-google";
    }
    if (url.pathname.includes("/sign-up/email")) {
      return "email";
    }
    if (url.pathname.includes("/sign-in/anonymous")) {
      return "anonymous";
    }
    if (url.pathname.includes("/oauth2") || url.pathname.includes("/callback")) {
      return "shipper-google";
    }
  } catch {}

  return "unknown";
}

function isSignupRequest(request?: Request | null): boolean {
  if (!request) return false;

  try {
    const { pathname } = new URL(request.url);
    if (pathname.includes("/sign-up")) return true;
    if (pathname.includes("/oauth2")) return true;
    if (pathname.includes("/callback")) return true;
    if (pathname.includes("/sign-in/anonymous")) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Create Better Auth options.
 * Returns a configured Better Auth options object for Convex.
 * Compatible with @convex-dev/better-auth@0.10.x
 */
export const createAuthOptions = (ctx: GenericCtx<DataModel>) => {
  const plugins = [
    crossDomain({ siteUrl }),
    convex({ authConfig }),
    admin({
      ac,
      roles: {
        admin: adminRole,
        user: userRole,
        "service-admin": serviceAdminRole,
      },
    }),
    apiKey({
      enableSessionForAPIKeys: true,
    }),

    ...(AUTH_CONFIG.authEnabled && AUTH_CONFIG.googleEnabled
      ? [genericOAuth({
      config: [{
        // Convex analyzes adapter.ts during deploy, before managed OAuth env
        // values are always surfaced to that analysis step. Avoid eager throws here.
        // 🚫 DO NOT MODIFY OR REMOVE THIS CONFIGURATION (Used by Shipper Cloud)
        providerId: "shipper-google",
        discoveryUrl: `${process.env.SHIPPER_AUTH_PROXY_URL}/.well-known/openid-configuration`,
        clientId: process.env.SHIPPER_OAUTH_CLIENT_ID!,
        clientSecret: process.env.SHIPPER_OAUTH_CLIENT_SECRET!,
        scopes: ["openid", "email", "profile"],
        prompt: "login",
        pkce: true,
        responseMode: "query",
        disableSignUp: !AUTH_CONFIG.signupEnabled,
        // 🚫 DO NOT MODIFY OR REMOVE THIS CONFIGURATION
      }],
    })]
      : []),
    ...(AUTH_CONFIG.authEnabled &&
      AUTH_CONFIG.anonymousEnabled &&
      AUTH_CONFIG.signupEnabled
      ? [anonymous()]
      : []),
  ];

  return {
    // Convex analyzes adapter.ts during deploy, before env values are always
    // surfaced to that analysis step. Avoid eager throws here.
    secret: process.env.BETTER_AUTH_SECRET!,
    trustedOrigins: getTrustedOrigins,
    database: authComponent.adapter(ctx),
    baseURL: getConfiguredBaseUrl(),
    emailAndPassword: {
      enabled: AUTH_CONFIG.authEnabled && AUTH_CONFIG.emailPasswordEnabled,
      requireEmailVerification: false,
      disableSignUp: !AUTH_CONFIG.signupEnabled,
      resetPasswordTokenExpiresIn: AUTH_CONFIG.passwordResetTokenExpiresIn,
      revokeSessionsOnPasswordReset: true,
      ...(AUTH_CONFIG.authEnabled && AUTH_CONFIG.emailPasswordEnabled && AUTH_CONFIG.passwordResetEnabled ? {
        sendResetPassword: async ({ user, url }: { user: { email: string; name: string }; url: string }) => {
          await requireActionCtx(ctx).scheduler.runAfter(0, internal.shipperPasswordRecovery.sendPasswordResetEmail, {
            email: user.email,
            name: user.name,
            resetUrl: url,
            expiresAt: Date.now() + AUTH_CONFIG.passwordResetTokenExpiresIn * 1000,
            attempt: 0,
          });
        },
      } : {}),
    },
    advanced: {
      defaultCookieAttributes: {
        sameSite: enableEmbeddedPreviewCookies ? "none" : "lax",
        secure: enableEmbeddedPreviewCookies,
      },
      crossSubDomainCookies: {
        enabled: true,
      },
    },
    // User configuration with admin plugin fields
    user: {
      additionalFields: {
        name: {
          type: "string",
          required: false,
        },
        // Admin plugin required fields
        role: {
          type: "string",
          required: false,
          defaultValue: "user",
        },
        banned: {
          type: "boolean",
          required: false,
          defaultValue: false,
        },
        banReason: {
          type: "string",
          required: false,
        },
        banExpires: {
          type: "number",
          required: false,
        },
        isAnonymous: {
          type: "boolean",
          required: false,
        },
      },
    },
    plugins,
    databaseHooks: {
      user: {
        create: {
          before: async (
            _userData: any,
            hookCtx: any,
          ) => {
            if (!AUTH_CONFIG.signupEnabled && isSignupRequest(hookCtx?.request)) {
              return false;
            }

            return true;
          },
          after: async (
            _user: any,
            hookCtx: any,
          ) => {
            try {
              const provider = inferSignupProvider(hookCtx?.request);
              await recordSignupInternal(hookCtx, provider, ctx);
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : String(error);
              if (errorMessage.toLowerCase().includes("permit on this funrun")) {
                return;
              }
              console.warn("[auth] Failed to record signup", error);
            }

             try {
              await (ctx as any).runMutation(
                (internal as any).automations.onDataEvent,
                {
                  table: "user",
                  event: "create",
                  document: JSON.stringify({
                    id: _user.id,
                    email: _user.email,
                    name: _user.name ?? null,
                    createdAt: _user.createdAt,
                  }),
                }
              );
            } catch {
              // Must not block signup
            }
          },
        },
      },
      session: {
        create: {
          after: async (session) => {
            try {
              await (ctx as any).runMutation(
                (internal as any).automations.onDataEvent,
                {
                  table: "session",
                  event: "create",
                  document: JSON.stringify({
                    userId: session.userId,
                    createdAt: session.createdAt,
                  }),
                }
              );
            } catch {
              // Must not block login
            }
          },
        },
      },
    },
  } satisfies BetterAuthOptions;
};

/**
 * Create Better Auth instance.
 * Compatible with @convex-dev/better-auth@0.10.x
 */
export const createAuth = (ctx: GenericCtx<DataModel>) => {
  return betterAuth(createAuthOptions(ctx));
};

// ============================================================================
// USER TYPE - Define explicit type for Better Auth user
// ============================================================================

/**
 * Better Auth user type with admin plugin fields.
 * This provides type safety for user queries.
 */
interface BetterAuthUser {
  _id: string;
  email: string;
  name?: string | null;
  image?: string | null;
  emailVerified?: boolean;
  createdAt: number;
  updatedAt: number;
  isAnonymous?: boolean | null;
  // Admin plugin fields
  role?: string;
  banned?: boolean;
  banReason?: string;
  banExpires?: number;
}

// ============================================================================
// USER QUERIES - For settings panel and general use
// ============================================================================

/**
 * Get the current authenticated user
 */
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx) as BetterAuthUser | null;
    if (!user) return null;

    return {
      id: user._id,
      _id: user._id, // Alias for compatibility - use either id or _id
      email: user.email,
      name: user.name ?? null,
      image: user.image ?? null,
      emailVerified: user.emailVerified,
      isAnonymous: user.isAnonymous ?? false,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  },
});

/**
 * Get user by email address
 *
 * This is the recommended way to look up other users.
 * Email lookups use an index and avoid ID format issues.
 */
export const getUserByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const user = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "user",
      where: [{ field: "email", value: email }],
    }) as BetterAuthUser | null;
    if (!user) return null;

    return {
      id: user._id,
      email: user.email,
      name: user.name ?? null,
      image: user.image ?? null,
      isAnonymous: user.isAnonymous ?? false,
      createdAt: user.createdAt,
    };
  },
});

/**
 * List all users (for admin dashboard)
 *
 * Uses the Better Auth component's findMany to query users.
 */
export const listAllUsers = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 100 }) => {
    // Use the component's findMany to query users
    const result = await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "user",
      sortBy: {
        field: "createdAt",
        direction: "desc",
      },
      paginationOpts: { numItems: limit, cursor: null },
    });

    return result.page.map((user: any) => ({
      id: user._id,
      email: user.email,
      name: user.name ?? null,
      image: user.image ?? null,
      emailVerified: user.emailVerified,
      isAnonymous: user.isAnonymous ?? false,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      role: user.role ?? "user",
      banned: user.banned ?? false,
    }));
  },
});

// ============================================================================
// ADMIN MUTATIONS - For user management via deploy key
// ============================================================================

/**
 * Delete a user and all their associated data (sessions, accounts)
 * This mutation is called via deploy key from Shipper's admin dashboard.
 * It properly cleans up all Better Auth related data for the user.
 */
export const deleteUser = mutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    // Delete all sessions for this user
    const sessions = await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "session",
      where: [{ field: "userId", value: userId }],
      paginationOpts: { numItems: 100, cursor: null },
    });

    for (const session of sessions.page) {
      await ctx.runMutation(components.betterAuth.adapter.deleteOne, {
        input: {
          model: "session",
          where: [{ field: "_id", value: session._id }],
        },
      });
    }

    // Delete all accounts for this user
    const accounts = await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "account",
      where: [{ field: "userId", value: userId }],
      paginationOpts: { numItems: 100, cursor: null },
    });

    for (const account of accounts.page) {
      await ctx.runMutation(components.betterAuth.adapter.deleteOne, {
        input: {
          model: "account",
          where: [{ field: "_id", value: account._id }],
        },
      });
    }

    // Delete the user
    await ctx.runMutation(components.betterAuth.adapter.deleteOne, {
      input: {
        model: "user",
        where: [{ field: "_id", value: userId }],
      },
    });

    return { success: true };
  },
});

/**
 * Drop every JWT signing key so the next token request generates a fresh one.
 *
 * Shipper calls this after a template rewrite when the key on file no longer
 * matches the algorithm the auth config signs with. That happens to projects
 * provisioned before the provider moved to RS256: they hold an Ed25519 key,
 * the rewrite hands them the RS256 config, and from then on every
 * /api/auth/convex/token request fails on key import with a bare 500 while
 * sign-in keeps working. Deleting the key is the fix; Better Auth mints a
 * matching one on the next request. Sessions are untouched - only the cache
 * of short-lived tokens goes stale, and it refreshes itself.
 *
 * Guarded by BETTER_AUTH_SECRET, which Shipper sets on this deployment and
 * nobody else holds. Without the guard anyone who knew the site URL could
 * wipe the keys at will. It is a public mutation only because Shipper reaches
 * this deployment over the HTTP functions API, which cannot address internal
 * functions.
 */
export const resetSigningKeys = mutation({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    const expected = process.env.BETTER_AUTH_SECRET;
    if (!expected || secret !== expected) {
      throw new Error("Unauthorized");
    }

    const keys = await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "jwks",
      paginationOpts: { numItems: 100, cursor: null },
    });

    for (const key of keys.page) {
      await ctx.runMutation(components.betterAuth.adapter.deleteOne, {
        input: {
          model: "jwks",
          where: [{ field: "_id", value: key._id }],
        },
      });
    }

    return { deleted: keys.page.length };
  },
});

// ============================================================================
// AUTH STATS - Analytics for Shipper Dashboard
// ============================================================================

function normalizeSignupProvider(provider: string): string {
  const normalized = provider.trim().toLowerCase();

  if (
    normalized === "shipper-google" ||
    normalized === "google" ||
    normalized === "google-oauth"
  ) {
    return "google";
  }
  if (
    normalized === "credential" ||
    normalized === "credentials" ||
    normalized === "email" ||
    normalized === "email-password" ||
    normalized === "email_and_password" ||
    normalized === "password"
  ) {
    return "email";
  }
  if (normalized === "anonymous" || normalized === "guest") {
    return "anonymous";
  }

  return normalized || "unknown";
}

function incrementAuthStats(
  grouped: AuthStatsGrouped,
  date: string,
  provider: string,
  incrementBy = 1,
) {
  if (!grouped[date]) {
    grouped[date] = { total: 0, byProvider: {} };
  }

  grouped[date].total += incrementBy;
  grouped[date].byProvider[provider] =
    (grouped[date].byProvider[provider] ?? 0) + incrementBy;
}

function toIsoDate(timestamp: number): string {
  return new Date(timestamp).toISOString().split("T")[0];
}

async function readAllAuthRows(
  ctx: any,
  model: "user" | "account",
): Promise<any[]> {
  const rows: any[] = [];
  const pageSize = 200;
  let cursor: string | null = null;

  for (let pageNumber = 0; pageNumber < 50; pageNumber += 1) {
    const pageResult: any = await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model,
      paginationOpts: { numItems: pageSize, cursor },
    });

    rows.push(...(pageResult?.page ?? []));

    const nextCursor: string | null = pageResult?.continueCursor ?? null;
    if (pageResult?.isDone || !nextCursor || nextCursor === cursor) {
      break;
    }
    cursor = nextCursor;
  }

  return rows;
}

async function getAuthStatsFromUsers(
  ctx: any,
  startDateStr: string,
): Promise<AuthStatsGrouped> {
  const startTime = Date.parse(`${startDateStr}T00:00:00.000Z`);
  if (Number.isNaN(startTime)) {
    return {};
  }

  const users = await readAllAuthRows(ctx, "user");
  const usersInRange = users.filter(
    (user) => typeof user?.createdAt === "number" && user.createdAt >= startTime,
  );

  if (usersInRange.length === 0) {
    return {};
  }

  const accounts = await readAllAuthRows(ctx, "account");
  const providerByUserId = new Map<string, string>();

  for (const account of accounts) {
    const userId = typeof account?.userId === "string" ? account.userId : null;
    if (!userId) continue;

    const normalizedProvider = normalizeSignupProvider(account?.providerId ?? "unknown");
    const existing = providerByUserId.get(userId);

    if (!existing || existing === "unknown") {
      providerByUserId.set(userId, normalizedProvider);
      continue;
    }

    if (existing !== "google" && normalizedProvider === "google") {
      providerByUserId.set(userId, normalizedProvider);
    }
  }

  const grouped: AuthStatsGrouped = {};
  for (const user of usersInRange) {
    const date = toIsoDate(user.createdAt);
    const provider =
      providerByUserId.get(user._id) ??
      (user?.isAnonymous ? "anonymous" : "email");
    incrementAuthStats(grouped, date, provider, 1);
  }

  return grouped;
}

async function recordSignupInternal(
  ctx: any,
  provider: string,
  fallbackCtx?: any,
): Promise<void> {
  const primaryCtx = ctx ?? fallbackCtx;
  const secondaryCtx = fallbackCtx ?? ctx;
  const db =
    primaryCtx?.db ??
    primaryCtx?.ctx?.db ??
    primaryCtx?.context?.db ??
    primaryCtx?.request?.ctx?.db ??
    secondaryCtx?.db ??
    secondaryCtx?.ctx?.db ??
    secondaryCtx?.context?.db ??
    secondaryCtx?.request?.ctx?.db ??
    null;

  if (!db || typeof db.query !== "function") {
    return;
  }

  const normalizedProvider = normalizeSignupProvider(provider);
  const today = new Date().toISOString().split("T")[0];

  try {
    const existing = await db
      .query("authStats")
      .withIndex("date_provider", (q: any) =>
        q.eq("date", today).eq("provider", normalizedProvider),
      )
      .first();

    if (existing) {
      await db.patch(existing._id, {
        signups: existing.signups + 1,
        lastUpdated: Date.now(),
      });
      return;
    }

    await db.insert("authStats", {
      date: today,
      provider: normalizedProvider,
      signups: 1,
      lastUpdated: Date.now(),
    });
  } catch {
    // Older deployments may not have authStats yet. Keep auth flows working.
  }
}

/**
 * Get signup stats for date range
 * Used by Shipper Dashboard analytics charts
 */
export const getAuthStats = query({
  args: {
    days: v.optional(v.number()),
  },
  handler: async (ctx, { days = 7 }) => {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - Math.max(days - 1, 0));
    const startDateStr = startDate.toISOString().split("T")[0];

    let stats: Array<{
      date: string;
      provider: string;
      signups: number;
    }> = [];

    try {
      stats = await (ctx.db as any)
        .query("authStats")
        .withIndex("date", (query: any) => query.gte("date", startDateStr))
        .collect();
    } catch {
      stats = [];
    }

    let grouped: AuthStatsGrouped = {};

    for (const stat of stats) {
      const normalizedProvider = normalizeSignupProvider(stat.provider);
      incrementAuthStats(grouped, stat.date, normalizedProvider, stat.signups);
    }

    if (Object.keys(grouped).length === 0) {
      grouped = await getAuthStatsFromUsers(ctx, startDateStr);
    }

    return {
      stats: grouped,
      days,
      startDate: startDateStr,
    };
  },
});

/**
 * Ban or unban a user
 * Called via deploy key from Shipper dashboard
 */
export const banUser = mutation({
  args: {
    userId: v.string(),
    banned: v.boolean(),
    banReason: v.optional(v.string()),
    banExpires: v.optional(v.number()),
  },
  handler: async (ctx, { userId, banned, banReason, banExpires }) => {
    await ctx.runMutation(components.betterAuth.adapter.updateOne, {
      input: {
        model: "user",
        where: [{ field: "_id", value: userId }],
        update: {
          banned,
          banReason: banReason ?? null,
          banExpires: banExpires ?? null,
        },
      },
    });

    return { success: true };
  },
});

/**
 * Update user role
 * Called via deploy key from Shipper dashboard
 */
export const updateUserRole = mutation({
  args: {
    userId: v.string(),
    role: v.string(),
  },
  handler: async (ctx, { userId, role }) => {
    await ctx.runMutation(components.betterAuth.adapter.updateOne, {
      input: {
        model: "user",
        where: [{ field: "_id", value: userId }],
        update: { role },
      },
    });

    return { success: true };
  },
});

/**
 * List users with pagination
 * Returns users for admin dashboard
 */
export const listUsers = query({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, { limit = 50, cursor }) => {
    const result = await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "user",
      sortBy: { field: "createdAt", direction: "desc" },
      paginationOpts: {
        numItems: limit,
        cursor: cursor ? JSON.parse(cursor) : null,
      },
    });

    return {
      users: result.page.map((user: any) => ({
        id: user._id,
        email: user.email,
        name: user.name ?? null,
        image: user.image ?? null,
        emailVerified: user.emailVerified ?? false,
        createdAt: user.createdAt,
        isAnonymous: user.isAnonymous ?? false,
        role: user.role ?? "user",
        banned: user.banned ?? false,
        banReason: user.banReason ?? null,
      })),
      nextCursor: result.continueCursor ? JSON.stringify(result.continueCursor) : null,
      hasMore: result.isDone === false,
    };
  },
});
