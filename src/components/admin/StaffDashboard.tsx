import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { LOCATIONS, SEED_PROGRAMS, parseProgram, sessionRange, formatPrice, netRevenue, type Program } from "@/data/registration";

type Reg = { _id: string; _creationTime: number; programId: string; sessionId: string; locationSlug: string; childName: string; status: string; amountCents: number; medicalNotes?: string };
type Wait = { status: string; locationSlug: string };

const MONTH = 30 * 86400000;

/** Staff landing view: per-location snapshot of what's running, new regs, refunds and waitlists. */
export function StaffDashboard({ onGo }: { onGo: (tab: string) => void }) {
  const regs = useQuery(api.reports.allRegistrations, {}) as Reg[] | null | undefined;
  const managed = useQuery(api.programAdmin.listManaged, {});
  const pending = useQuery(api.registrationOps.listPendingRefunds, {}) as { locationSlug?: string; programId?: string }[] | null | undefined;
  const waits = useQuery(api.waitlist.listAll, {}) as Wait[] | null | undefined;
  const [loc, setLoc] = useState<string>("all");

  const catalog = useMemo(() => {
    const map = new Map<string, Program>(SEED_PROGRAMS.map((p) => [p.id, p]));
    for (const m of managed ?? []) {
      const p = parseProgram(m.data);
      if (p) map.set(p.id, p);
    }
    return map;
  }, [managed]);

  if (regs === undefined) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true" aria-label="Loading dashboard">
        {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted" />)}
      </div>
    );
  }
  if (regs === null) return <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Staff access is required to view the dashboard.</p>;

  const now = Date.now();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const locs = loc === "all" ? LOCATIONS : LOCATIONS.filter((l) => l.slug === loc);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter by location">
        {[{ slug: "all", name: "All Locations" }, ...LOCATIONS].map((l) => (
          <button key={l.slug} role="tab" aria-selected={loc === l.slug} onClick={() => setLoc(l.slug)} className={`cursor-pointer rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring ${loc === l.slug ? "bg-primary text-primary-foreground" : "bg-muted text-foreground/75 hover:bg-accent"}`}>{l.name}</button>
        ))}
      </div>

      {locs.map((l) => {
        const active = regs.filter((r) => r.locationSlug === l.slug && (r.status === "confirmed" || r.status === "refund_pending"));
        const newMonth = active.filter((r) => now - r._creationTime < MONTH);
        const grossMonth = newMonth.reduce((s, r) => s + r.amountCents, 0) / 100;
        const netMonth = newMonth.reduce((s, r) => s + netRevenue(r.amountCents / 100, catalog.get(r.programId)), 0);
        const refunds = (pending ?? []).filter((q) => (q.locationSlug ?? catalog.get(q.programId ?? "")?.locationSlug) === l.slug).length;
        const waiting = (waits ?? []).filter((w) => w.locationSlug === l.slug && (w.status === "waiting" || w.status === "offered")).length;
        const runningToday = [...catalog.values()].filter((p) => p.locationSlug === l.slug).flatMap((p) =>
          p.sessions.filter((s) => {
            try {
              const [a, b] = sessionRange(s.dates, p.season);
              return a.getTime() <= today.getTime() && b.getTime() >= today.getTime();
            } catch { return false; }
          }).map((s) => ({ p, s, count: active.filter((r) => r.programId === p.id && r.sessionId === s.id).length })),
        );
        const medical = active.filter((r) => r.medicalNotes?.trim() && runningToday.some((x) => x.p.id === r.programId && x.s.id === r.sessionId)).length;
        return (
          <section key={l.slug} className="rounded-2xl border border-border bg-card p-5">
            <h2 className="display-condensed text-2xl font-black italic md:text-3xl">TOP Sports {l.name}</h2>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              <Stat label="New Registrations (30 days)" value={String(newMonth.length)} sub={`${formatPrice(grossMonth)} gross`} onClick={() => onGo("attendance")} />
              <Stat label="Net Revenue (30 days)" value={formatPrice(netMonth)} sub="After HST & processing fees" onClick={() => onGo("finance")} />
              <Stat label="Pending Refunds" value={String(refunds)} tone={refunds > 0 ? "warn" : undefined} onClick={() => onGo("refunds")} />
              <Stat label="On Waitlists" value={String(waiting)} onClick={() => onGo("waitlist")} />
              <Stat label="Active Registrations" value={String(active.length)} />
            </div>
            <div className="mt-5">
              <h3 className="text-lg font-bold">Running Today</h3>
              {runningToday.length === 0 ? (
                <p className="mt-2 rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">No sessions running today at {l.name}.</p>
              ) : (
                <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
                  {runningToday.map(({ p, s, count }) => (
                    <li key={`${p.id}-${s.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{p.name} — {s.label}</p>
                        <p className="text-xs text-muted-foreground">{s.days} · {s.time}</p>
                      </div>
                      <span className="shrink-0 font-semibold">{count} / {s.capacity}</span>
                    </li>
                  ))}
                </ul>
              )}
              {medical > 0 && <p className="mt-2 text-xs font-semibold text-destructive">⚠ {medical} player{medical > 1 ? "s" : ""} with medical notes in today's sessions.</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Stat({ label, value, sub, tone, onClick }: { label: string; value: string; sub?: string; tone?: "warn"; onClick?: () => void }) {
  const cls = `rounded-xl border p-4 text-left transition-colors ${tone === "warn" ? "border-warning bg-warning/15" : "border-border bg-background"} ${onClick ? "cursor-pointer hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring" : ""}`;
  const body = (
    <>
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </>
  );
  return onClick ? <button onClick={onClick} className={cls}>{body}</button> : <div className={cls}>{body}</div>;
}
