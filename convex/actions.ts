/**
 * Automation Actions
 *
 * Define internalAction functions here as automation targets.
 * Reference by path: "actions:functionName" (e.g. "actions:onTodoCreated")
 *
 * HOW TRIGGERS WORK:
 * - scheduled:  engine calls action with {}
 *               (no payload — fetch all data you need via ctx.runQuery)
 * - data_event: engine calls action with { eventPayload: "<JSON string of the document>" }
 *               Parse with: const doc = args.eventPayload ? JSON.parse(args.eventPayload) : null
 *
 * ARGS CONTRACT — do not deviate:
 *   data_event → args: { eventPayload: v.optional(v.string()) }
 *   scheduled  → args: {}
 *
 * NEVER use ctx.db inside actions — use ctx.runQuery / ctx.runMutation for all DB access.
 */
import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";


// ─── SAMPLE: DATA-EVENT action ───────────────────────────────────────────────
// Triggered when a document is created/updated/deleted in the target table.
// Receives the full document as a JSON string in args.eventPayload.
// Reference by path: "actions:yourFunctionName"
//
// export const onDataUpdated = internalAction({
//   args: { eventPayload: v.optional(v.string()) },
//   handler: async (ctx, args) => {
//     try {
//       const doc = args.eventPayload ? JSON.parse(args.eventPayload) : null;
//       if (!doc) return { success: false, error: "No event payload" };
//       // Validate fields from your schema before using them:
//       if (doc.userId === undefined) return { success: false, error: "Payload missing field: userId" };
//       const { userId, _id } = doc;
//       // Fetch related data: use ctx.runQuery / ctx.runMutation — NEVER ctx.db
//       return { success: true };
//     } catch (err) {
//       return { success: false, error: err instanceof Error ? err.message : String(err) };
//     }
//   },
// });

// ─── SAMPLE: SCHEDULED action ────────────────────────────────────────────────
// Triggered on a timer (interval, cron, or once). Receives no payload.
// Reference by path: "actions:yourFunctionName"
//
// export const dailyDigest = internalAction({
//   args: {},
//   handler: async (ctx, _args) => {
//     try {
//       // Fetch data via ctx.runQuery, write via ctx.runMutation
//       return { success: true };
//     } catch (err) {
//       return { success: false, error: err instanceof Error ? err.message : String(err) };
//     }
//   },
// });
