import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { LOCATIONS, SEED_PROGRAMS, parseProgram, formatPrice, formatDob, type Program } from "@/data/registration";
import { FamilyView } from "@/components/admin/ProgramDetail";

const inputCls = "h-10 w-full rounded-lg border border-input bg-card px-3.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";
const ACTIVE = (s: string) => s === "confirmed" || s === "refund_pending";

type Reg = {
  _id: string;
  _creationTime: number;
  userId: string;
  programId: string;
  sessionId: string;
  locationSlug: string;
  childName: string;
  childDob: string;
  parentName: string;
  parentEmail: string;
  parentPhone?: string;
  jerseySize?: string;
  heardAbout?: string;
  amountCents: number;
  status: string;
};

function useCatalog() {
  const managed = useQuery(api.programAdmin.listManaged, {});
  return useMemo(() => {
    const map = new Map<string, Program>(SEED_PROGRAMS.map((p) => [p.id, p]));
    for (const m of managed ?? []) {
      const p = parseProgram(m.data);
      if (p) map.set(p.id, p);
    }
    return map;
  }, [managed]);
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const blob = new Blob([rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  toast.success(`Downloaded ${filename}`);
}

const locName = (slug: string) => LOCATIONS.find((l) => l.slug === slug)?.name ?? slug;

/** One search box across every program and location. */
export function GlobalSearch() {
  const regs = useQuery(api.reports.allRegistrations, {}) as Reg[] | null | undefined;
  const catalog = useCatalog();
  const [q, setQ] = useState("");
  const [family, setFamily] = useState<string | null>(null);

  const families = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (term.length < 2 || !regs) return [];
    const map = new Map<string, { userId: string; parent: string; email: string; phone: string; kids: Set<string>; regs: Reg[] }>();
    for (const r of regs) {
      const hay = `${r.childName} ${r.parentName} ${r.parentEmail} ${r.parentPhone ?? ""}`.toLowerCase();
      if (!hay.includes(term)) continue;
      const f = map.get(r.userId) ?? { userId: r.userId, parent: r.parentName, email: r.parentEmail, phone: r.parentPhone ?? "", kids: new Set<string>(), regs: [] };
      f.kids.add(r.childName);
      f.regs.push(r);
      map.set(r.userId, f);
    }
    return [...map.values()].slice(0, 25);
  }, [q, regs]);

  if (family) return <FamilyView userId={family} catalog={catalog} onBack={() => setFamily(null)} backLabel="Back to Search" />;

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="sr-only">Search children or parents</span>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search any child, parent, email or phone" className={`${inputCls} h-12 text-base`} />
      </label>
      {regs === undefined ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />)}</div>
      ) : q.trim().length < 2 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Type at least 2 letters to search every program and location.</p>
      ) : families.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No families match "{q}".</p>
      ) : (
        <ul className="space-y-3">
          {families.map((f) => (
            <li key={f.userId}>
              <button type="button" onClick={() => setFamily(f.userId)} className="w-full cursor-pointer rounded-2xl border border-border bg-card p-4 text-left transition-all hover:border-primary hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold">{f.parent} <span className="text-sm font-normal text-muted-foreground">· {f.email}{f.phone ? ` · ${f.phone}` : ""}</span></p>
                  <span className="text-xs font-semibold text-primary">Open Family Account →</span>
                </div>
                <p className="mt-1 text-sm">Children: {[...f.kids].join(", ")}</p>
                <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  {f.regs.slice(0, 4).map((r) => (
                    <li key={r._id}>{r.childName} · {catalog.get(r.programId)?.name ?? r.programId} · {locName(r.locationSlug)} · <span className="capitalize">{r.status.replace("_", " ")}</span></li>
                  ))}
                  {f.regs.length > 4 && <li>+ {f.regs.length - 4} more</li>}
                </ul>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Jersey sheet, coupons, heard-about, year-over-year and accounting export. */
export function MoreReports() {
  const regs = useQuery(api.reports.allRegistrations, {}) as Reg[] | null | undefined;
  const fin = useQuery(api.reports.financials, {});
  const catalog = useCatalog();
  const [loc, setLoc] = useState("all");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const inLoc = (slug: string) => loc === "all" || slug === loc;
  const active = (regs ?? []).filter((r) => ACTIVE(r.status) && inLoc(r.locationSlug));

  const jersey = useMemo(() => {
    const byProg = new Map<string, Map<string, number>>();
    for (const r of active) {
      if (!r.jerseySize) continue;
      const m = byProg.get(r.programId) ?? new Map<string, number>();
      m.set(r.jerseySize, (m.get(r.jerseySize) ?? 0) + 1);
      byProg.set(r.programId, m);
    }
    return [...byProg.entries()];
  }, [active]);

  const heard = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of active) m.set(r.heardAbout || "Not given", (m.get(r.heardAbout || "Not given") ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [active]);

  const coupons = useMemo(() => {
    const m = new Map<string, { uses: number; cents: number }>();
    for (const r of fin?.redemptions ?? []) {
      const x = m.get(r.code) ?? { uses: 0, cents: 0 };
      m.set(r.code, { uses: x.uses + 1, cents: x.cents + r.discountCents });
    }
    return [...m.entries()].sort((a, b) => b[1].uses - a[1].uses);
  }, [fin]);

  const yoy = useMemo(() => {
    const thisYear = new Date().getFullYear();
    return LOCATIONS.filter((l) => inLoc(l.slug)).map((l) => {
      const rows = (regs ?? []).filter((r) => r.locationSlug === l.slug && ACTIVE(r.status));
      const yr = (y: number) => rows.filter((r) => new Date(r._creationTime).getFullYear() === y);
      const a = yr(thisYear), b = yr(thisYear - 1);
      return { name: l.name, now: a.length, nowRev: a.reduce((s, r) => s + r.amountCents, 0), prev: b.length, prevRev: b.reduce((s, r) => s + r.amountCents, 0) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regs, loc]);

  const exportAccounting = () => {
    const [y, m] = month.split("-").map(Number);
    const from = new Date(y, m - 1, 1).getTime(), to = new Date(y, m, 1).getTime();
    const rows = (fin?.ledger ?? []).filter((l) => l.createdAt >= from && l.createdAt < to && (l.type === "payment" || l.type === "refund") && inLoc(l.locationSlug));
    const feePct = 4;
    const out: (string | number)[][] = [["Date", "Type", "Location", "Program", "Participant", "Parent Email", "Gross", "HST", "Processing Fee (est.)", "Net", "Description", "Staff"]];
    let gross = 0, hst = 0, fee = 0;
    for (const l of rows.sort((a, b) => a.createdAt - b.createdAt)) {
      const p = catalog.get(l.programId);
      const amt = (l.type === "payment" ? Math.abs(l.amountCents) : -Math.abs(l.amountCents)) / 100;
      const taxable = p ? p.taxable !== false && p.category !== "Camps" && !/camp/i.test(p.name) : false;
      const tax = taxable ? amt - amt / 1.13 : 0;
      const f = l.type === "payment" ? amt * (feePct / 100) : 0;
      gross += amt; hst += tax; fee += f;
      out.push([new Date(l.createdAt).toISOString().slice(0, 10), l.type === "payment" ? "Payment" : "Refund", locName(l.locationSlug), p?.name ?? l.programId, l.childName, l.parentEmail, amt.toFixed(2), tax.toFixed(2), f.toFixed(2), (amt - tax - f).toFixed(2), l.description, l.staffEmail ?? ""]);
    }
    out.push([], ["Totals", "", "", "", "", "", gross.toFixed(2), hst.toFixed(2), fee.toFixed(2), (gross - hst - fee).toFixed(2)]);
    downloadCsv(`accounting-${month}${loc === "all" ? "" : `-${loc}`}.csv`, out);
  };

  const card = "rounded-2xl border border-border bg-card p-5";
  if (regs === undefined || fin === undefined) return <div className="grid gap-4 md:grid-cols-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-48 animate-pulse rounded-2xl bg-muted" />)}</div>;

  return (
    <div className="space-y-6">
      <label className="block max-w-xs text-xs font-semibold text-muted-foreground">Location
        <select value={loc} onChange={(e) => setLoc(e.target.value)} className={`${inputCls} mt-1.5`}>
          <option value="all">All locations</option>
          {LOCATIONS.map((l) => <option key={l.slug} value={l.slug}>{l.name}</option>)}
        </select>
      </label>

      <section className={card}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold">Accounting Export</h3>
            <p className="text-xs text-muted-foreground">Monthly payments and refunds with HST and estimated processing fees, ready for QuickBooks or your accountant.</p>
          </div>
          <div className="flex gap-2">
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={`${inputCls} w-44`} aria-label="Month" />
            <button onClick={exportAccounting} className="h-10 cursor-pointer rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Export CSV</button>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={card}>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-lg font-bold">Jersey Order Sheet</h3>
            {jersey.length > 0 && <button onClick={() => downloadCsv("jersey-orders.csv", [["Program", "Size", "Count"], ...jersey.flatMap(([id, m]) => [...m.entries()].map(([s, n]) => [catalog.get(id)?.name ?? id, s, n]))])} className="cursor-pointer rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold hover:bg-accent">Export</button>}
          </div>
          {jersey.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No jersey sizes recorded yet.</p> : (
            <div className="mt-3 space-y-3">
              {jersey.map(([id, m]) => (
                <div key={id}>
                  <p className="text-sm font-semibold">{catalog.get(id)?.name ?? id} <span className="font-normal text-muted-foreground">· {[...m.values()].reduce((a, b) => a + b, 0)} total</span></p>
                  <div className="mt-1 flex flex-wrap gap-1.5">{[...m.entries()].map(([s, n]) => <span key={s} className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-accent-foreground">{s}: {n}</span>)}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={card}>
          <h3 className="text-lg font-bold">Coupon Report</h3>
          {coupons.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No coupons have been used yet.</p> : (
            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1.5">Code</th><th>Uses</th><th className="text-right">Total Discount</th></tr></thead>
              <tbody className="divide-y divide-border">{coupons.map(([c, x]) => <tr key={c}><td className="py-2 font-semibold">{c}</td><td>{x.uses}</td><td className="text-right">{formatPrice(x.cents / 100)}</td></tr>)}</tbody>
            </table>
          )}
        </section>

        <section className={card}>
          <h3 className="text-lg font-bold">How Families Heard About Us</h3>
          {heard.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No registrations yet.</p> : (
            <ul className="mt-3 space-y-2">
              {heard.map(([k, n]) => {
                const pct = Math.round((n / Math.max(1, active.length)) * 100);
                return (
                  <li key={k} className="text-sm">
                    <div className="flex justify-between"><span>{k}</span><span className="font-semibold">{n} · {pct}%</span></div>
                    <div className="mt-1 h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className={card}>
          <h3 className="text-lg font-bold">This Year vs. Last Year</h3>
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1.5">Location</th><th>{new Date().getFullYear()}</th><th>{new Date().getFullYear() - 1}</th><th className="text-right">Change</th></tr></thead>
            <tbody className="divide-y divide-border">
              {yoy.map((r) => {
                const ch = r.prev ? Math.round(((r.now - r.prev) / r.prev) * 100) : null;
                return (
                  <tr key={r.name}>
                    <td className="py-2 font-semibold">{r.name}</td>
                    <td>{r.now} <span className="text-xs text-muted-foreground">· {formatPrice(r.nowRev / 100)}</span></td>
                    <td>{r.prev} <span className="text-xs text-muted-foreground">· {formatPrice(r.prevRev / 100)}</span></td>
                    <td className={`text-right font-semibold ${ch === null ? "text-muted-foreground" : ch >= 0 ? "text-success" : "text-destructive"}`}>{ch === null ? "—" : `${ch > 0 ? "+" : ""}${ch}%`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">Counts active registrations by the date they were made.</p>
        </section>
      </div>
    </div>
  );
}

/** Printable day-of coach sheet for one session. */
export function CoachSheet({ program, sessionId, rows, onClose }: { program: Program; sessionId: string; rows: { _id: string; childName: string; childDob: string; parentName: string; parentPhone?: string; medicalNotes?: string; authorizedPickup?: string; emergencyContact?: string; jerseySize?: string }[]; onClose: () => void }) {
  const s = program.sessions.find((x) => x.id === sessionId);
  return (
    <div className="print-roster rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Coach Sheet · {new Date().toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" })}</p>
          <h3 className="display-condensed text-2xl font-black italic md:text-3xl">{program.name}</h3>
          <p className="text-sm text-muted-foreground">{s?.label} · {s?.dates} · {s?.time} · {program.venue}</p>
        </div>
        <div className="flex gap-2 print:hidden">
          <button onClick={() => window.print()} className="cursor-pointer rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Print</button>
          <button onClick={onClose} className="cursor-pointer rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-accent">Close</button>
        </div>
      </div>
      {rows.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">No players in this session.</p> : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 print:grid-cols-2">
          {rows.map((r, i) => (
            <div key={r._id} className={`break-inside-avoid rounded-xl border p-3 text-sm ${r.medicalNotes?.trim() ? "border-destructive" : "border-border"}`}>
              <div className="flex items-start justify-between gap-2">
                <p className="font-bold">{i + 1}. {r.childName}</p>
                <span className="inline-block h-5 w-5 shrink-0 rounded border-2 border-foreground/60" aria-hidden="true" />
              </div>
              <p className="text-xs text-muted-foreground">DOB {r.childDob ? formatDob(r.childDob) : "—"}{r.jerseySize ? ` · Jersey ${r.jerseySize}` : ""}</p>
              {r.medicalNotes?.trim() && <p className="mt-1 text-xs font-bold text-destructive">⚠ {r.medicalNotes}</p>}
              <p className="mt-1 text-xs"><span className="font-semibold">Parent:</span> {r.parentName}{r.parentPhone ? ` · ${r.parentPhone}` : ""}</p>
              <p className="text-xs"><span className="font-semibold">Pickup:</span> {r.authorizedPickup || "Parent only"}</p>
              <p className="text-xs"><span className="font-semibold">Emergency:</span> {r.emergencyContact || "—"}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
