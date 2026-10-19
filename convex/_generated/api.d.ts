/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as abandoned from "../abandoned.js";
import type * as actions from "../actions.js";
import type * as activity from "../activity.js";
import type * as auth from "../auth.js";
import type * as automations from "../automations.js";
import type * as commerce from "../commerce.js";
import type * as coupons from "../coupons.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as mutations from "../mutations.js";
import type * as notify from "../notify.js";
import type * as programAdmin from "../programAdmin.js";
import type * as programLookup from "../programLookup.js";
import type * as queries from "../queries.js";
import type * as regCheckout from "../regCheckout.js";
import type * as registrationOps from "../registrationOps.js";
import type * as reminders from "../reminders.js";
import type * as replyTo from "../replyTo.js";
import type * as reports from "../reports.js";
import type * as rosterGroups from "../rosterGroups.js";
import type * as shipperPasswordRecovery from "../shipperPasswordRecovery.js";
import type * as siteAdmin from "../siteAdmin.js";
import type * as staffAlerts from "../staffAlerts.js";
import type * as staffOps from "../staffOps.js";
import type * as staffQueries from "../staffQueries.js";
import type * as staffRegOps from "../staffRegOps.js";
import type * as staffTools from "../staffTools.js";
import type * as staffVerify from "../staffVerify.js";
import type * as waitlist from "../waitlist.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  abandoned: typeof abandoned;
  actions: typeof actions;
  activity: typeof activity;
  auth: typeof auth;
  automations: typeof automations;
  commerce: typeof commerce;
  coupons: typeof coupons;
  crons: typeof crons;
  http: typeof http;
  mutations: typeof mutations;
  notify: typeof notify;
  programAdmin: typeof programAdmin;
  programLookup: typeof programLookup;
  queries: typeof queries;
  regCheckout: typeof regCheckout;
  registrationOps: typeof registrationOps;
  reminders: typeof reminders;
  replyTo: typeof replyTo;
  reports: typeof reports;
  rosterGroups: typeof rosterGroups;
  shipperPasswordRecovery: typeof shipperPasswordRecovery;
  siteAdmin: typeof siteAdmin;
  staffAlerts: typeof staffAlerts;
  staffOps: typeof staffOps;
  staffQueries: typeof staffQueries;
  staffRegOps: typeof staffRegOps;
  staffTools: typeof staffTools;
  staffVerify: typeof staffVerify;
  waitlist: typeof waitlist;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("../betterAuth/_generated/component.js").ComponentApi<"betterAuth">;
};
