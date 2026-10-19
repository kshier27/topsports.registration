import type { QueryCtx } from "./_generated/server";
import { SEED_PROGRAMS as PROGRAMS, globalAddOnsFor, refundDeadline, type GlobalAddOn, type Program } from "../src/data/registration";

export type ServerFinance = { feePct: number; siblingPct: number; extraWeek: number; globalAddOns: GlobalAddOn[] };

/** Super-admin finance settings stored in siteSettings (key "site"). */
export async function loadFinance(ctx: { db: QueryCtx["db"] }): Promise<ServerFinance> {
  const d: ServerFinance = { feePct: 4, siblingPct: 10, extraWeek: 25, globalAddOns: [] };
  const row = await ctx.db.query("siteSettings").withIndex("by_key", (q) => q.eq("key", "site")).first();
  if (!row) return d;
  try {
    const f = (JSON.parse(row.data) as { finance?: Partial<ServerFinance> }).finance ?? {};
    const n = (x: unknown, def: number) => (Number.isFinite(Number(x)) ? Number(x) : def);
    return {
      feePct: n(f.feePct, d.feePct),
      siblingPct: Math.min(100, Math.max(0, n(f.siblingPct, d.siblingPct))),
      extraWeek: Math.max(0, n(f.extraWeek, d.extraWeek)),
      globalAddOns: Array.isArray(f.globalAddOns) ? f.globalAddOns : [],
    };
  } catch {
    return d;
  }
}

function withGlobals(p: Program, fin?: ServerFinance): Program {
  if (!fin) return p;
  return { ...p, addOns: [...(p.addOns ?? []).filter((a) => !a.id.startsWith("g-")), ...globalAddOnsFor(p, fin.globalAddOns)] };
}

/** Resolve a program: staff-managed version first, then the built-in catalog. */
export async function findProgram(ctx: { db: QueryCtx["db"] }, programId: string, fin?: ServerFinance): Promise<Program | null> {
  const row = await ctx.db
    .query("managedPrograms")
    .withIndex("by_programId", (q) => q.eq("programId", programId))
    .first();
  if (row) {
    try {
      return withGlobals(JSON.parse(row.data) as Program, fin);
    } catch {
      /* fall through */
    }
  }
  const seed = PROGRAMS.find((p) => p.id === programId);
  return seed ? withGlobals(seed, fin) : null;
}

/** All programs (managed override built-in), used by the reminder job. */
export async function allPrograms(ctx: { db: QueryCtx["db"] }): Promise<Program[]> {
  const rows = await ctx.db.query("managedPrograms").collect();
  const map = new Map<string, Program>();
  for (const p of PROGRAMS) map.set(p.id, p);
  for (const r of rows) {
    try {
      map.set(r.programId, JSON.parse(r.data) as Program);
    } catch {
      /* skip */
    }
  }
  return [...map.values()];
}

/** Server-side refund/transfer eligibility (30 days before start; May 31 for summer camps). */
export async function assertChangeAllowed(ctx: { db: QueryCtx["db"] }, programId: string): Promise<void> {
  const p = await findProgram(ctx, programId);
  if (!p) return;
  if (Date.now() > refundDeadline(p).getTime()) {
    throw new Error("The refund and transfer deadline for this program has passed.");
  }
}
