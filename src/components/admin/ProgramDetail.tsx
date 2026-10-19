import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { RegistrationActions, type ActionReg } from "./RegistrationActions";
import { SignedWaivers } from "@/components/signed-waivers";
import { LOCATIONS, FINANCE, formatDob, formatPrice, netRevenue, sessionLocation, eligibilityLabel, programWaivers, type Program } from "@/data/registration";

type Reg = {
  _id: string;
  _creationTime: number;
  userId: string;
  programId: string;
  sessionId: string;
  childName: string;
  childDob: string;
  parentName: string;
  parentEmail: string;
  parentPhone?: string;
  jerseySize?: string;
  friendRequest?: string;
  medicalNotes?: string;
  amountCents: number;
  status: string;
  history?: ActionReg["history"];
};

const ACTIVE = (s: string) => s === "confirmed" || s === "refund_pending";

const STATUS_LABEL: Record<string, string> = {
  confirmed: "Confirmed",
  refund_pending: "Refund Pending",
  refunded: "Refunded",
  withdrawn: "Withdrawn",
  transferred: "Transferred",
  credited: "Credited",
  pending: "Pending Payment",
  cancelled: "Cancelled",
};

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "confirmed"
      ? "bg-success text-success-foreground"
      : status === "refund_pending" || status === "pending"
        ? "bg-warning text-warning-foreground"
        : "bg-muted text-muted-foreground";
  return <span className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${cls}`}>{STATUS_LABEL[status] ?? status}</span>;
}

export function ProgramDetail({ program, catalog, onBack }: { program: Program; catalog: Map<string, Program>; onBack: () => void }) {
  const regs = useQuery(api.reports.allRegistrations, {}) as Reg[] | null | undefined;
  const [sessionId, setSessionId] = useState<string>("all");
  const [family, setFamily] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Reg | null>(null);
  const fin = useQuery(api.reports.financials, {});
  const money = useMemo(() => {
    const rows = (fin?.ledger ?? []).filter((l) => l.programId === program.id);
    const sum = (t: string) => rows.filter((r) => r.type === t).reduce((s, r) => s + Math.abs(r.amountCents), 0);
    const payments = sum("payment");
    const refunds = sum("refund");
    const net = rows.reduce((s, r) => (r.type === "payment" ? s + netRevenue(Math.abs(r.amountCents), program) : r.type === "refund" ? s - netRevenue(Math.abs(r.amountCents), program) : s), 0);
    return { gross: Math.max(0, payments - refunds), refunds, credits: sum("credit"), net, count: rows.filter((r) => r.type === "payment").length };
  }, [fin, program]);
  const needle = q.trim().toLowerCase();
  const matches = (r: Reg) => !needle || [r.childName, r.parentName, r.parentEmail, r.parentPhone ?? ""].some((x) => x.toLowerCase().includes(needle));

  const programRegs = useMemo(() => (regs ?? []).filter((r) => r.programId === program.id), [regs, program.id]);
  const activeBySession = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of programRegs) if (ACTIVE(r.status)) m.set(r.sessionId.split("~")[0], (m.get(r.sessionId.split("~")[0]) ?? 0) + 1);
    return m;
  }, [programRegs]);

  if (family) return <FamilyView userId={family} catalog={catalog} onBack={() => setFamily(null)} backLabel={`← Back to ${program.name}`} />;

  const location = LOCATIONS.find((l) => l.slug === program.locationSlug);
  const sessions = sessionId === "all" ? program.sessions : program.sessions.filter((s) => s.id === sessionId);
  const totalCap = program.sessions.reduce((a, s) => a + s.capacity, 0);
  const totalEnr = program.sessions.reduce((a, s) => a + (activeBySession.get(s.id) ?? 0), 0);

  return (
    <div className="space-y-6">
      <RegistrationActions reg={picked} catalog={catalog} onClose={() => setPicked(null)} onViewFamily={(id) => { setPicked(null); setFamily(id); }} />
      <button onClick={onBack} className="cursor-pointer text-sm font-semibold text-muted-foreground hover:text-foreground">← All Programs</button>

      <div className="rounded-2xl bg-primary p-5 text-primary-foreground sm:p-6">
        <p className="text-xs font-bold uppercase tracking-wider opacity-80">{location?.name ?? "TOP Sports"} · {program.category}</p>
        <h2 className="display-condensed mt-1 text-2xl font-black italic md:text-3xl">{program.name}</h2>
        <p className="mt-1 text-sm opacity-85">{program.season} · {eligibilityLabel(program)} · {program.venue}</p>
        <div className="mt-4 grid grid-cols-3 gap-2 sm:max-w-lg">
          {[
            ["Enrolled", regs === undefined ? "…" : `${totalEnr} / ${totalCap}`],
            ["Spots Remaining", regs === undefined ? "…" : String(Math.max(0, totalCap - totalEnr))],
            ["Capacity Filled", regs === undefined ? "…" : `${totalCap ? Math.round((totalEnr / totalCap) * 100) : 0}%`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-primary-foreground/15 px-3 py-2 text-center">
              <p className="text-xl font-bold leading-none">{v}</p>
              <p className="mt-1 text-xs font-bold uppercase tracking-wider opacity-85">{k}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ["Gross Revenue", formatPrice(money.gross / 100), "Payments less refunds"],
          ["Net Revenue", formatPrice(money.net / 100), `After HST & ${FINANCE.feePct}% processing`],
          ["Refunds", formatPrice(money.refunds / 100), "Returned to cards"],
          ["Credits Issued", formatPrice(money.credits / 100), "Account credit"],
          ["Payments", String(money.count), "Paid registrations"],
        ].map(([k, v, h]) => (
          <div key={k} className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs font-semibold text-muted-foreground">{k}</p>
            <p className="mt-1 truncate text-2xl font-bold">{fin === undefined ? "…" : v}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{h}</p>
          </div>
        ))}
      </div>

      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search rosters by player, parent, email or phone…" className="h-10 w-full rounded-full border border-input bg-card px-4 text-sm outline-none focus:ring-2 focus:ring-ring" />

      <div className="flex gap-2 overflow-x-auto pb-1">
        {[{ id: "all", label: "All Sessions" }, ...program.sessions.map((s) => ({ id: s.id, label: s.label }))].map((s) => (
          <button key={s.id} onClick={() => setSessionId(s.id)} className={`shrink-0 cursor-pointer whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors ${sessionId === s.id ? "bg-primary text-primary-foreground" : "border border-border hover:bg-accent"}`}>
            {s.label}
          </button>
        ))}
      </div>

      {regs === undefined ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />)}</div>
      ) : (
        sessions.map((s) => {
          const all = programRegs.filter((r) => r.sessionId.split("~")[0] === s.id && ACTIVE(r.status));
          const roster = all.filter(matches).sort((a, b) => a.childName.localeCompare(b.childName));
          const enr = all.length;
          if (needle && roster.length === 0 && sessionId === "all") return null;
          const pct = s.capacity ? Math.min(100, Math.round((enr / s.capacity) * 100)) : 0;
          return (
            <section key={s.id} className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4 sm:p-5">
                <div className="min-w-0">
                  <p className="font-bold">{s.label} · {s.dates}</p>
                  <p className="text-xs text-muted-foreground">{s.days} · {s.time} · {sessionLocation(program, s)}</p>
                </div>
                <div className="w-full sm:w-56">
                  <div className="flex justify-between text-xs font-semibold">
                    <span>{enr} enrolled</span>
                    <span className="text-muted-foreground">{Math.max(0, s.capacity - enr)} of {s.capacity} left</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full ${enr >= s.capacity ? "bg-destructive" : "bg-primary"}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </div>
              {roster.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">{needle ? `No players match "${q}" in this session.` : "No players registered in this session yet."}</p>
              ) : (
                <ul className="divide-y divide-border">
                  {roster.map((r, i) => (
                    <li key={r._id}>
                      <button onClick={() => setPicked(r)} className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent sm:px-5">
                        <span className="w-6 shrink-0 text-xs font-bold text-muted-foreground">{i + 1}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{r.childName}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {r.childDob ? formatDob(r.childDob) : "—"} · {r.parentName}{r.parentPhone ? ` · ${r.parentPhone}` : ""}
                          </span>
                          {r.medicalNotes && <span className="block truncate text-xs font-semibold text-destructive">Medical: {r.medicalNotes}</span>}
                        </span>
                        {r.status !== "confirmed" && <StatusBadge status={r.status} />}
                        <span className="shrink-0 text-sm font-semibold text-primary">Manage →</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}

export function FamilyView({ userId, catalog, onBack, backLabel }: { userId: string; catalog: Map<string, Program>; onBack: () => void; backLabel: string }) {
  const data = useQuery(api.reports.familyDetail, { userId });
  if (data === undefined) return <div className="space-y-3"><div className="h-28 animate-pulse rounded-2xl bg-muted" /><div className="h-48 animate-pulse rounded-2xl bg-muted" /></div>;
  if (data === null) return <p className="rounded-2xl border border-border p-8 text-center text-sm text-muted-foreground">You don't have access to family accounts.</p>;

  const paid = data.registrations.filter((r) => ACTIVE(r.status));
  const totalPaid = data.ledger.filter((l) => l.type === "payment").reduce((s, l) => s + Math.abs(l.amountCents), 0);

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="cursor-pointer text-sm font-semibold text-muted-foreground hover:text-foreground">{backLabel}</button>

      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Family Account</p>
        <h2 className="display-condensed mt-1 text-2xl font-black italic md:text-3xl">{data.parent?.name ?? "Family"}</h2>
        <div className="mt-2 space-y-0.5 text-sm text-muted-foreground">
          {data.parent?.email && <p><a href={`mailto:${data.parent.email}`} className="text-primary hover:underline">{data.parent.email}</a></p>}
          {data.parent?.phone && <p><a href={`tel:${data.parent.phone}`} className="hover:underline">{data.parent.phone}</a></p>}
          {data.parent?.guardian2 && <p>Guardian 2: {data.parent.guardian2}</p>}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
          {[
            ["Active Registrations", String(paid.length)],
            ["All Registrations", String(data.registrations.length)],
            ["Total Paid", formatPrice(totalPaid / 100)],
            ["Account Credit", formatPrice(Math.max(0, data.creditCents) / 100)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-muted p-3">
              <p className="text-xs text-muted-foreground">{k}</p>
              <p className="mt-0.5 truncate text-lg font-bold">{v}</p>
            </div>
          ))}
        </div>
      </div>

      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <h3 className="text-lg font-bold">Children</h3>
        {data.children.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No saved children on this account. Names below come from registrations.</p>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {data.children.map((c) => (
              <li key={c._id} className="rounded-xl border border-border p-4">
                <p className="font-semibold">{c.firstName} {c.lastName}</p>
                <p className="text-xs text-muted-foreground">{c.dob ? formatDob(c.dob) : "—"}{c.school ? ` · ${c.school}` : ""}</p>
                {c.medicalNotes && <p className="mt-1 text-xs font-semibold text-destructive">Medical: {c.medicalNotes}</p>}
                {c.emergencyContact && <p className="mt-1 text-xs text-muted-foreground">Emergency: {c.emergencyContact}</p>}
                {c.address && <p className="mt-1 text-xs text-muted-foreground">{c.address}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <h3 className="text-lg font-bold">Registration History</h3>
        {data.registrations.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No registrations yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {data.registrations.map((r) => {
              const p = catalog.get(r.programId);
              const s = p?.sessions.find((x) => x.id === r.sessionId);
              return (
                <li key={r._id} className="flex flex-wrap items-start justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{p?.name ?? r.programId}{s ? ` — ${s.label}` : ""}</p>
                    <p className="text-xs text-muted-foreground">{r.childName} · {s?.dates ?? r.sessionId} · Registered {new Date(r._creationTime).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{formatPrice(r.amountCents / 100)}</span>
                    <StatusBadge status={r.status} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <SignedWaivers
        compact
        heading="Signed Waivers"
        intro="Policies this family agreed to at registration."
        rows={data.registrations.filter((r) => r.status !== "transferred").flatMap((r) => {
          const p = catalog.get(r.programId);
          const s = p?.sessions.find((x) => x.id === r.sessionId);
          const ids = r.waiversAccepted?.length ? r.waiversAccepted : p ? programWaivers(p).map((w) => w.id) : [];
          if (ids.length === 0) return [];
          return [{
            id: r._id,
            parentName: r.parentName,
            signedAt: new Date(r.signedAt ?? r._creationTime),
            signature: r.signatureName,
            snapshot: r.waiverSnapshot,
            childName: r.childName,
            programName: p?.name ?? r.programId,
            sessionLabel: s?.label ?? "",
            dates: s?.dates ?? r.sessionId,
            location: p && s ? sessionLocation(p, s) : p?.venue ?? "",
            waiverIds: ids,
          }];
        })}
      />

      {data.waitlist.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
          <h3 className="text-lg font-bold">Waitlists</h3>
          <ul className="mt-3 divide-y divide-border">
            {data.waitlist.map((w) => {
              const p = catalog.get(w.programId);
              const s = p?.sessions.find((x) => x.id === w.sessionId);
              return (
                <li key={w._id} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
                  <span>{p?.name ?? w.programId}{s ? ` — ${s.label}` : ""} · {w.childName}</span>
                  <span className="font-semibold capitalize text-muted-foreground">{w.status}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <h3 className="text-lg font-bold">Account Activity</h3>
        {data.ledger.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No payments, refunds or credits yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {data.ledger.map((l) => (
              <li key={l._id} className="flex items-start justify-between gap-3 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold">{l.description}</p>
                  <p className="text-xs text-muted-foreground">{new Date(l.createdAt).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })} · <span className="capitalize">{l.type.replace("_", " ")}</span>{l.staffEmail ? ` · By ${l.staffEmail}` : ""}</p>
                </div>
                <span className={`shrink-0 font-semibold ${l.amountCents >= 0 ? "text-success" : ""}`}>{l.amountCents >= 0 ? "+" : "−"}{formatPrice(Math.abs(l.amountCents) / 100)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
