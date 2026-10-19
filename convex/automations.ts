/**
 * Automations Execution Engine + CRUD API
 *
 * Handles scheduled (daisy-chain) and data-event triggers.
 * Actions are Convex functions specified by actionPath (e.g. "actions:sendDailyReport").
 *
 * @see docs/SHIPPER_AUTOMATIONS_IMPLEMENTATION_PLAN.md
 */
import { mutation, query, internalMutation, internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

// Parse one cron field into a sorted list of valid values.
// Supports: "*", ranges like "1-5", steps like "*/5", lists like "8,17".
// Operates within [min, max] inclusive.
function parseCronField(field: string, min: number, max: number): number[] {
  const result: number[] = [];
  for (const part of field.split(",")) {
    if (part === "*") {
      for (let i = min; i <= max; i++) result.push(i);
    } else if (part.startsWith("*/")) {
      const step = parseInt(part.slice(2), 10);
      for (let i = min; i <= max; i += step) result.push(i);
    } else if (part.includes("/")) {
      const [range, stepStr] = part.split("/");
      const step = parseInt(stepStr, 10);
      const [rStart, rEnd] = range.split("-").map(Number);
      for (let i = rStart; i <= (isNaN(rEnd) ? max : rEnd); i += step) result.push(i);
    } else if (part.includes("-")) {
      const [start, end] = part.split("-").map(Number);
      for (let i = start; i <= end; i++) result.push(i);
    } else {
      const n = parseInt(part, 10);
      if (!isNaN(n)) result.push(n);
    }
  }
  return [...new Set(result)].sort((a, b) => a - b);
}

/**
 * Extract local time components for a UTC timestamp in the given timezone.
 * Uses Intl.DateTimeFormat which is available in Convex's V8 runtime.
 */
function getLocalComponents(
  utcMs: number,
  dtf: Intl.DateTimeFormat
): { month: number; day: number; dow: number; hour: number; minute: number } {
  const parts = dtf.formatToParts(new Date(utcMs));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    month:  parseInt(get("month"),  10),
    day:    parseInt(get("day"),    10),
    dow:    weekdays.indexOf(get("weekday")),
    hour:   parseInt(get("hour"),   10) % 24, // Intl can emit "24" for midnight
    minute: parseInt(get("minute"), 10),
  };
}

/** Get next run timestamp from schedule config */
function getNextRunTime(
  schedule: {
    type: "interval" | "cron" | "once";
    intervalMinutes?: number;
    cronExpression?: string;
    runAt?: number;
    timezone?: string;
  },
  lastRun: number
): number | null {
  if (schedule.type === "interval" && schedule.intervalMinutes) {
    return lastRun + schedule.intervalMinutes * 60 * 1000;
  }
  if (schedule.type === "cron" && schedule.cronExpression) {
    const parts = schedule.cronExpression.trim().split(/\s+/);
    if (parts.length !== 5) return null;
    const [mf, hf, df, monf, wf] = parts;
    const mins   = parseCronField(mf,   0, 59);
    const hours  = parseCronField(hf,   0, 23);
    const doms   = parseCronField(df,   1, 31);
    const months = parseCronField(monf, 1, 12);
    const dows   = parseCronField(wf,   0,  6);

    // Use stored timezone, fall back to UTC
    const tz = schedule.timezone ?? "UTC";

    // Create once — reused for every iteration to avoid per-call construction cost
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      month:   "numeric",
      day:     "numeric",
      hour:    "numeric",
      minute:  "numeric",
      weekday: "short",
      hour12:  false,
    });

    // Advance to the start of the next minute
    let cursor = Math.ceil((lastRun + 1) / 60_000) * 60_000;
    const limit = cursor + 366 * 24 * 60 * 60_000;

    while (cursor <= limit) {
      // Convert UTC cursor to local time in the target timezone
      const local = getLocalComponents(cursor, dtf);
      const domOk = df   === "*" || doms.includes(local.day);
      const dowOk = wf   === "*" || dows.includes(local.dow);
      if (
        months.includes(local.month) &&
        domOk && dowOk &&
        hours.includes(local.hour) &&
        mins.includes(local.minute)
      ) {
        return cursor;
      }
      cursor += 60_000;
    }
    return null;
  }
  if (schedule.type === "once" && schedule.runAt) {
    return schedule.runAt;
  }
  return null;
}

/**
 * Execute automation - creates run log, schedules action to run user code
 */
export const execute = internalMutation({
  args: {
    id: v.id("automations"),
    triggeredBy: v.union(
      v.literal("schedule"),
      v.literal("data_event"),
      v.literal("manual")
    ),
    eventPayload: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const automation = await ctx.db.get(args.id);
    if (!automation || !automation.enabled || automation.archived) return;

    // Enforce minimum interval between runs for scheduled triggers
    const MIN_INTERVAL_MS = 5 * 60 * 1000;
    if (automation.triggerType === "scheduled" && automation.lastRunAt && (Date.now() - automation.lastRunAt) < MIN_INTERVAL_MS) {
      return;
    }

    const startedAt = Date.now();
    const runId = await ctx.db.insert("automation_runs", {
      automationId: args.id,
      status: "running",
      startedAt,
      triggeredBy: args.triggeredBy,
      eventPayload: args.eventPayload,
    });

    await ctx.scheduler.runAfter(0, internal.automations.runAndComplete, {
      automationId: args.id,
      runId,
      actionPath: automation.actionPath,
      actionArgs: automation.actionArgs,
      eventPayload: args.eventPayload,
      schedule: automation.schedule,
      triggerType: automation.triggerType,
    });
  },
});

/**
 * Run user's action and report back (must be action - mutations can't run actions)
 */
export const runAndComplete = internalAction({
  args: {
    automationId: v.id("automations"),
    runId: v.id("automation_runs"),
    actionPath: v.string(),
    actionArgs: v.optional(v.string()),
    eventPayload: v.optional(v.string()),
    schedule: v.optional(v.any()),
    triggerType: v.string(),
  },
  handler: async (ctx, args) => {
    let status: "success" | "failure" = "success";
    let output: string | undefined;

    try {
      const [module, fn] = args.actionPath.split(":");
      if (!module || !fn) throw new Error(`Invalid actionPath: ${args.actionPath}`);

      const internalApi = internal as Record<string, Record<string, unknown>>;
      const mod = internalApi[module];
      if (!mod) throw new Error(`Module not found: ${module}`);
      const fnRef = mod[fn];
      if (!fnRef) throw new Error(`Function not found: ${args.actionPath}`);

      const actionArgs = args.actionArgs ? JSON.parse(args.actionArgs) : {};
      if (args.eventPayload !== undefined) {
        // Pass as JSON string — the action parses it with: JSON.parse(args.eventPayload)
        actionArgs.eventPayload = args.eventPayload;
      }

      const MAX_RUN_DURATION_MS = 3 * 60 * 1000; // 3 minutes
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error("Automation run exceeded maximum duration of 3 minutes")),
          MAX_RUN_DURATION_MS
        );
      });

      await Promise.race([ctx.runAction(fnRef as any, actionArgs), timeoutPromise]);
    } catch (err) {
      status = "failure";
      output = err instanceof Error ? err.message : String(err);
    }

    const completedAt = Date.now();
    const startedAt = await ctx.runQuery(internal.automations.getRunStartedAt, { runId: args.runId });
    const durationMs = completedAt - startedAt;

    await ctx.runMutation(internal.automations.completeRun, {
      runId: args.runId,
      automationId: args.automationId,
      status,
      output,
      completedAt,
      durationMs,
      schedule: args.schedule,
      triggerType: args.triggerType,
    });
  },
});

export const getRunStartedAt = internalQuery({
  args: { runId: v.id("automation_runs") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    return run?.startedAt ?? Date.now();
  },
});

export const completeRun = internalMutation({
  args: {
    runId: v.id("automation_runs"),
    automationId: v.id("automations"),
    status: v.union(v.literal("success"), v.literal("failure")),
    output: v.optional(v.string()),
    completedAt: v.number(),
    durationMs: v.number(),
    schedule: v.optional(v.any()),
    triggerType: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      status: args.status,
      completedAt: args.completedAt,
      durationMs: args.durationMs,
      output: args.output,
    });

    await ctx.db.patch(args.automationId, {
      lastRunAt: args.completedAt,
      lastRunStatus: args.status,
    });

    if (args.triggerType === "scheduled" && args.schedule) {
      const nextTime = getNextRunTime(args.schedule, args.completedAt);
      if (nextTime && args.schedule.type !== "once") {
        const schedulerId = await ctx.scheduler.runAt(
          nextTime,
          internal.automations.execute,
          { id: args.automationId, triggeredBy: "schedule" }
        );
        await ctx.db.patch(args.automationId, { nextScheduledRunId: schedulerId });
      }
    }
  },
});

/**
 * Parse a simple filter expression into condition objects.
 *
 * Syntax: 'field op value' joined by AND (case-insensitive)
 * Examples:
 *   status = active
 *   count > 5 AND role = admin
 *   user.status != disabled
 *   name contains john
 *
 * Operators: = != > >= < <= contains
 * Values: bare strings, numbers, booleans (true/false), or quoted strings.
 * Field names: alphanumeric + underscore + dot (for nested access).
 *
 * Returns null when the expression cannot be parsed.
 */
function parseSimpleFilter(
  filter: string
): Array<{ field: string; op: string; value: unknown }> | null {
  const symbolOps: Array<[string, string]> = [
    ["!=", "ne"],
    [">=", "gte"],
    ["<=", "lte"],
    [">",  "gt"],
    ["<",  "lt"],
    ["=",  "eq"],
  ];

  const stripQ = (s: string) => s.replace(/^['"]|['"]$/g, "");
  const coerce = (s: string): unknown => {
    if (s === "true") return true;
    if (s === "false") return false;
    const n = Number(s);
    if (s !== "" && !isNaN(n)) return n;
    return s;
  };

  const parts = filter.split(/s+ands+/i);
  const conditions: Array<{ field: string; op: string; value: unknown }> = [];

  for (const part of parts) {
    const p = part.trim();
    if (!p) continue;

    // field contains value
    const cm = p.match(/^([w.]+)s+containss+(.+)$/i);
    if (cm) {
      conditions.push({ field: cm[1], op: "contains", value: stripQ(cm[2].trim()) });
      continue;
    }

    // field [!=|>=|<=|>|<|=] value  (longest operators tested first)
    // None of the operator strings contain regex special chars, so use sym directly.
    let matched = false;
    for (const [sym, opCode] of symbolOps) {
      const m = p.match(new RegExp("^([\w.]+)\s*" + sym + "\s*(.+)$"));
      if (m) {
        conditions.push({ field: m[1], op: opCode, value: coerce(stripQ(m[2].trim())) });
        matched = true;
        break;
      }
    }
    if (!matched) return null;
  }

  return conditions;
}

/**
 * Evaluate a stored filter string against a parsed document.
 *
 * Accepts two formats:
 *   Simple (preferred): 'status = active', 'count > 5 AND role = admin'
 *     Ops: = != > >= < <= contains   (AND logic between conditions)
 *     Field supports dot-notation for nested access: user.role
 *   JSON array (legacy): [{"field":"status","op":"eq","value":"active"}]
 *
 * Safe defaults:
 *   - Unparseable filter  -> treated as no filter (returns true, do not block)
 *   - Empty conditions    -> returns true
 *   - Unknown operator    -> condition passes
 */
function matchesFilter(doc: Record<string, unknown>, filter: string): boolean {
  let conditions: Array<{ field: string; op: string; value: unknown }>;

  if (filter.trimStart().startsWith("[")) {
    // Legacy JSON array format
    try {
      conditions = JSON.parse(filter);
    } catch {
      return true;
    }
    if (!Array.isArray(conditions) || conditions.length === 0) return true;
  } else {
    const parsed = parseSimpleFilter(filter);
    if (!parsed) return true;
    conditions = parsed;
  }

  return conditions.every((cond) => {
    const fieldValue = cond.field.split(".").reduce<unknown>(
      (obj, key) =>
        obj !== null && obj !== undefined
          ? (obj as Record<string, unknown>)[key]
          : undefined,
      doc
    );
    switch (cond.op) {
      case "eq":
        return fieldValue === cond.value;
      case "ne":
        return fieldValue !== cond.value;
      case "gt":
        return typeof fieldValue === "number" && typeof cond.value === "number" && fieldValue > cond.value;
      case "gte":
        return typeof fieldValue === "number" && typeof cond.value === "number" && fieldValue >= cond.value;
      case "lt":
        return typeof fieldValue === "number" && typeof cond.value === "number" && fieldValue < cond.value;
      case "lte":
        return typeof fieldValue === "number" && typeof cond.value === "number" && fieldValue <= cond.value;
      case "contains":
        return typeof fieldValue === "string" && typeof cond.value === "string" && fieldValue.includes(cond.value);
      default:
        return true;
    }
  });
}

/**
 * Data event trigger - called from mutation hooks when table changes.
 * Matches automations by tableName + event, then evaluates the stored filter
 * against the document before scheduling the action.
 */
export const onDataEvent = internalMutation({
  args: {
    table: v.string(),
    event: v.union(v.literal("create"), v.literal("update"), v.literal("delete")),
    document: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const automations = await ctx.db
      .query("automations")
      .withIndex("by_trigger_type", (q) =>
        q.eq("triggerType", "data_event").eq("enabled", true)
      )
      .collect();

    const matching = automations.filter(
      (a) =>
        !a.archived &&
        a.dataEvent?.tableName === args.table &&
        a.dataEvent?.event === args.event
    );

    for (const automation of matching) {
      // Evaluate the stored filter against the document before firing.
      // If the document doesn't satisfy all conditions, skip this automation.
      if (automation.dataEvent?.filter) {
        if (!args.document) continue;
        try {
          const doc = JSON.parse(args.document) as Record<string, unknown>;
          if (!matchesFilter(doc, automation.dataEvent.filter)) continue;
        } catch {
          // Unparseable document — skip this run rather than fire blindly
          continue;
        }
      }

      await ctx.scheduler.runAfter(0, internal.automations.execute, {
        id: automation._id,
        triggeredBy: "data_event",
        eventPayload: args.document,
      });
    }
  },
});

// =============================================================================
// PUBLIC CRUD API
// =============================================================================

/** List automations, optionally filtered by archived status */
export const list = query({
  args: {
    archived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("automations").order("desc").collect();
    if (args.archived === true) {
      return all.filter((a) => a.archived === true);
    }
    if (args.archived === false) {
      return all.filter((a) => a.archived !== true);
    }
    return all;
  },
});

/** Create automation - schedules first run if scheduled + enabled */
export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    enabled: v.boolean(),
    triggerType: v.union(v.literal("scheduled"), v.literal("data_event")),
    schedule: v.optional(v.any()),
    dataEvent: v.optional(v.any()),
    actionPath: v.string(),
    actionArgs: v.optional(v.string()),
    type: v.optional(v.union(v.literal("email"), v.literal("general"))),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const id = await ctx.db.insert("automations", {
      ...args,
      archived: false,
      createdAt: now,
      updatedAt: now,
    });

    if (args.enabled && args.triggerType === "scheduled" && args.schedule) {
      const nextTime = getNextRunTime(args.schedule, now);
      if (nextTime) {
        const schedulerId = await ctx.scheduler.runAt(
          nextTime,
          internal.automations.execute,
          { id, triggeredBy: "schedule" }
        );
        await ctx.db.patch(id, { nextScheduledRunId: schedulerId });
      }
    }
    return id;
  },
});

/** Update automation - cancels and reschedules if schedule changed */
export const update = mutation({
  args: {
    id: v.id("automations"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
    archived: v.optional(v.boolean()),
    schedule: v.optional(v.any()),
    dataEvent: v.optional(v.any()),
    actionPath: v.optional(v.string()),
    actionArgs: v.optional(v.string()),
    type: v.optional(v.union(v.literal("email"), v.literal("general"))),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Automation not found");

    if (existing.nextScheduledRunId) {
      await ctx.scheduler.cancel(existing.nextScheduledRunId as any);
    }

    const now = Date.now();
    const newEnabled = updates.enabled ?? existing.enabled;
    const newSchedule = updates.schedule ?? existing.schedule;

    await ctx.db.patch(id, {
      ...updates,
      updatedAt: now,
      nextScheduledRunId: undefined,
    });

    if (newEnabled && existing.triggerType === "scheduled" && newSchedule) {
      const lastRun = existing.lastRunAt ?? now;
      const nextTime = getNextRunTime(newSchedule, lastRun);
      if (nextTime && newSchedule.type !== "once") {
        const schedulerId = await ctx.scheduler.runAt(
          nextTime,
          internal.automations.execute,
          { id, triggeredBy: "schedule" }
        );
        await ctx.db.patch(id, { nextScheduledRunId: schedulerId });
      }
    }
    return id;
  },
});

/** Delete automation - cancels pending scheduler */
export const remove = mutation({
  args: { id: v.id("automations") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Automation not found");
    if (existing.nextScheduledRunId) {
      await ctx.scheduler.cancel(existing.nextScheduledRunId as any);
    }
    await ctx.db.delete(args.id);
    return args.id;
  },
});

/** Toggle enabled - cancel on disable, schedule on enable */
export const toggle = mutation({
  args: { id: v.id("automations"), enabled: v.boolean() },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Automation not found");

    if (existing.nextScheduledRunId) {
      await ctx.scheduler.cancel(existing.nextScheduledRunId as any);
    }

    const now = Date.now();
    await ctx.db.patch(args.id, {
      enabled: args.enabled,
      updatedAt: now,
      nextScheduledRunId: undefined,
    });

    if (args.enabled && existing.triggerType === "scheduled" && existing.schedule) {
      const lastRun = existing.lastRunAt ?? now;
      const nextTime = getNextRunTime(existing.schedule, lastRun);
      if (nextTime && existing.schedule.type !== "once") {
        const schedulerId = await ctx.scheduler.runAt(
          nextTime,
          internal.automations.execute,
          { id: args.id, triggeredBy: "schedule" }
        );
        await ctx.db.patch(args.id, { nextScheduledRunId: schedulerId });
      }
    }
    return args.id;
  },
});

/** Archive automation - disables and cancels scheduled runs */
export const archive = mutation({
  args: { id: v.id("automations") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Automation not found");
    if (existing.nextScheduledRunId) {
      await ctx.scheduler.cancel(existing.nextScheduledRunId as any);
    }
    await ctx.db.patch(args.id, {
      archived: true,
      enabled: false,
      updatedAt: Date.now(),
      nextScheduledRunId: undefined,
    });
    return args.id;
  },
});

/** Restore automation from archive */
export const restore = mutation({
  args: { id: v.id("automations") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Automation not found");
    const now = Date.now();
    await ctx.db.patch(args.id, {
      archived: false,
      updatedAt: now,
    });
    if (existing.enabled && existing.triggerType === "scheduled" && existing.schedule) {
      const lastRun = existing.lastRunAt ?? now;
      const nextTime = getNextRunTime(existing.schedule, lastRun);
      if (nextTime && existing.schedule.type !== "once") {
        const schedulerId = await ctx.scheduler.runAt(
          nextTime,
          internal.automations.execute,
          { id: args.id, triggeredBy: "schedule" }
        );
        await ctx.db.patch(args.id, { nextScheduledRunId: schedulerId });
      }
    }
    return args.id;
  },
});

/** Run automation now (manual trigger) */
export const runNow = mutation({
  args: { id: v.id("automations") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Automation not found");
    await ctx.scheduler.runAfter(0, internal.automations.execute, {
      id: args.id,
      triggeredBy: "manual",
    });
    return args.id;
  },
});

/** List runs for an automation (for logs) */
export const listRuns = query({
  args: { automationId: v.id("automations"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    return await ctx.db
      .query("automation_runs")
      .withIndex("by_automation", (q) => q.eq("automationId", args.automationId))
      .order("desc")
      .take(limit);
  },
});

/**
 * Disable all automations globally — both scheduled and data-event.
 * - Sets enabled: false on every non-archived automation (stops data-event triggers)
 * - Cancels any pending scheduled runs
 * Called when the automations feature is turned off at the project level.
 */
export const disableAll = mutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("automations").collect();
    for (const automation of all) {
      if (automation.archived) continue;
      if (automation.nextScheduledRunId) {
        await ctx.scheduler.cancel(automation.nextScheduledRunId as any);
      }
      await ctx.db.patch(automation._id, {
        enabled: false,
        nextScheduledRunId: undefined,
        updatedAt: Date.now(),
      });
    }
  },
});

/**
 * Enable all automations globally — both scheduled and data-event.
 * - Sets enabled: true on every non-archived automation (resumes data-event triggers)
 * - Re-schedules next run for scheduled automations
 * Called when the automations feature is turned on at the project level.
 */
export const enableAll = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const all = await ctx.db.query("automations").collect();
    for (const automation of all) {
      if (automation.archived) continue;
      let nextScheduledRunId: string | undefined;
      if (automation.triggerType === "scheduled" && automation.schedule && automation.schedule.type !== "once") {
        const lastRun = automation.lastRunAt ?? now;
        const nextTime = getNextRunTime(automation.schedule, lastRun);
        if (nextTime) {
          nextScheduledRunId = await ctx.scheduler.runAt(
            nextTime,
            internal.automations.execute,
            { id: automation._id, triggeredBy: "schedule" }
          );
        }
      }
      await ctx.db.patch(automation._id, {
        enabled: true,
        updatedAt: now,
        nextScheduledRunId,
      });
    }
  },
});
