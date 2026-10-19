import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { LOCATIONS, SEED_PROGRAMS, formatPrice, parseProgram, netRevenue, FINANCE, type Program } from "@/data/registration";

const SPORTS = ["Camps", "Hockey", "Soccer", "Lacrosse"];

const inputCls =
  "h-10 w-full rounded-lg border border-input bg-card px-3.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";
const labelCls = "block text-xs font-semibold text-muted-foreground";
const btnOutline = "cursor-pointer rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50";
const btnPrimary = "cursor-pointer rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50";

const dollars = (cents: number) => formatPrice(cents / 100);
const locName = (slug: string) => LOCATIONS.find((l) => l.slug === slug)?.name ?? (slug || "—");

function useProgramCatalog(): Map<string, Program> {
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
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(esc).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  toast.success(`Downloaded ${filename}`);
}

function ageOn(dob: string, asOf: string): number | null {
  const d = new Date(dob);
  const ref = new Date(asOf || Date.now());
  if (Number.isNaN(d.getTime())) return null;
  let a = ref.getFullYear() - d.getFullYear();
  const m = ref.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < d.getDate())) a--;
  return a;
}

const today = () => new Date().toISOString().slice(0, 10);

function Skeleton() {
  return <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />)}</div>;
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
      <p className="font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

/* ----------------------------- Financial report ---------------------------- */

export function FinancialReport() {
  const data = useQuery(api.reports.financials, {});
  const catalog = useProgramCatalog();
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(today());
  const [loc, setLoc] = useState("all");
  const [sport, setSport] = useState("all");

  const start = new Date(`${from}T00:00:00`).getTime();
  const end = new Date(`${to}T23:59:59`).getTime();
  const rows = useMemo(() => {
    if (!data) return [];
    return data.ledger
      .filter((l) => l.createdAt >= start && l.createdAt <= end && (loc === "all" || l.locationSlug === loc) && (sport === "all" || catalog.get(l.programId)?.category === sport))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [data, start, end, loc, sport, catalog]);

  const totals = useMemo(() => {
    const sum = (t: string) => rows.filter((r) => r.type === t).reduce((s, r) => s + Math.abs(r.amountCents), 0);
    const payments = sum("payment");
    const refunds = sum("refund");
    // Net of HST (where charged) and 4% processing, on what was kept after refunds.
    const net = rows.reduce((s, r) => {
      if (r.type !== "payment" && r.type !== "refund") return s;
      const amt = (r.type === "payment" ? 1 : -1) * Math.abs(r.amountCents);
      return s + netRevenue(amt, catalog.get(r.programId));
    }, 0);
    const unfiltered = loc === "all" && sport === "all";
    const discounts = unfiltered ? (data?.redemptions ?? []).filter((d) => d.createdAt >= start && d.createdAt <= end).reduce((s, d) => s + d.discountCents, 0) : null;
    return { gross: Math.max(0, payments - refunds), refunds, credits: sum("credit"), creditUsed: sum("credit_used"), net, discounts, count: rows.filter((r) => r.type === "payment").length };
  }, [rows, catalog, data, start, end, loc, sport]);

  const byProgram = useMemo(() => {
    const m = new Map<string, { name: string; location: string; regs: number; gross: number; refunds: number; credits: number; net: number }>();
    for (const r of rows) {
      if (!r.programId) continue;
      const cur = m.get(r.programId) ?? { name: catalog.get(r.programId)?.name ?? r.programId, location: locName(r.locationSlug), regs: 0, gross: 0, refunds: 0, credits: 0, net: 0 };
      const amt = Math.abs(r.amountCents);
      if (r.type === "payment") { cur.regs++; cur.gross += amt; cur.net += netRevenue(amt, catalog.get(r.programId)); }
      if (r.type === "refund") cur.net -= netRevenue(amt, catalog.get(r.programId));
      if (r.type === "refund") cur.refunds += amt;
      if (r.type === "credit") cur.credits += amt;
      m.set(r.programId, cur);
    }
    return [...m.values()].sort((a, b) => b.gross - a.gross);
  }, [rows, catalog]);

  const pendingRefunds = (data?.refunds ?? []).filter((r) => r.status === "pending");
  const pendingCents = pendingRefunds.reduce((s, r) => s + r.refundCents, 0);

  const exportLedger = () =>
    downloadCsv(`transactions-${from}-to-${to}.csv`, [
      ["Date", "Type", "Description", "Program", "Location", "Child", "Parent email", "Amount (CAD)"],
      ...rows.map((r) => [
        new Date(r.createdAt).toISOString().slice(0, 10),
        r.type,
        r.description,
        catalog.get(r.programId)?.name ?? r.programId,
        locName(r.locationSlug),
        r.childName,
        r.parentEmail,
        (r.amountCents / 100).toFixed(2),
      ]),
    ]);

  const exportSummary = () =>
    downloadCsv(`program-summary-${from}-to-${to}.csv`, [
      ["Program", "Location", "Registrations", "Gross Collected (CAD)", "Refunds (CAD)", "Credits Given (CAD)", `Net Revenue excl. HST & ${FINANCE.feePct}% fees (CAD)`],
      ...byProgram.map((p) => [p.name, p.location, p.regs, (Math.max(0, p.gross - p.refunds) / 100).toFixed(2), (p.refunds / 100).toFixed(2), (p.credits / 100).toFixed(2), (p.net / 100).toFixed(2)]),
    ]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 rounded-2xl border border-border bg-card p-4 sm:p-5 lg:grid-cols-[1fr_1fr_1.1fr_1.1fr_auto]">
        <label className={labelCls}>From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inputCls} mt-1.5`} /></label>
        <label className={labelCls}>To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${inputCls} mt-1.5`} /></label>
        <label className={labelCls}>Location
          <select value={loc} onChange={(e) => setLoc(e.target.value)} className={`${inputCls} mt-1.5`}>
            <option value="all">All Locations</option>
            {LOCATIONS.map((l) => <option key={l.slug} value={l.slug}>{l.name}</option>)}
          </select>
        </label>
        <label className={labelCls}>Sport
          <select value={sport} onChange={(e) => setSport(e.target.value)} className={`${inputCls} mt-1.5`}>
            <option value="all">All Sports</option>
            {SPORTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <div className="col-span-2 flex items-end gap-2 lg:col-span-1">
          <button onClick={exportSummary} disabled={byProgram.length === 0} className={btnOutline}>Summary CSV</button>
          <button onClick={exportLedger} disabled={rows.length === 0} className={btnPrimary}>Transactions CSV</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ["Gross Collected", dollars(totals.gross), `${totals.count} payments, excl. refunds`],
          ["Total Refunds Issued", dollars(totals.refunds), pendingRefunds.length ? `${dollars(pendingCents)} pending review` : "To card"],
          ["Net Revenue", dollars(totals.net), `Net of 13% HST & ${FINANCE.feePct}% fees`],
          ["Credits Given", dollars(totals.credits), `${dollars(totals.creditUsed)} redeemed`],
          ["Discounts Given", totals.discounts === null ? "—" : dollars(totals.discounts), totals.discounts === null ? "Coupons: all locations & sports only" : "Coupon codes redeemed"],
        ].map(([k, v, sub]) => (
          <div key={k} className="rounded-2xl border border-border bg-card p-4 sm:p-5">
            <p className="text-xs text-muted-foreground">{k}</p>
            <p className="mt-1 truncate text-2xl font-bold">{v}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
          </div>
        ))}
      </div>

      {data === undefined ? <Skeleton /> : rows.length === 0 ? (
        <Empty title="No transactions in this range" body="Payments, credits and refunds appear here as families register. Try widening the date range or choosing all locations." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <div className="border-b border-border px-5 py-3 font-bold">Revenue by Program</div>
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-border text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <tr><th className="px-5 py-3">Program</th><th className="px-5 py-3">Location</th><th className="px-5 py-3">Regs</th><th className="px-5 py-3">Gross</th><th className="px-5 py-3">Refunds</th><th className="px-5 py-3">Credits</th><th className="px-5 py-3 text-right">Net Revenue</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {byProgram.map((p) => (
                  <tr key={p.name + p.location}>
                    <td className="px-5 py-3 font-semibold">{p.name}</td>
                    <td className="px-5 py-3">{p.location}</td>
                    <td className="px-5 py-3">{p.regs}</td>
                    <td className="px-5 py-3">{dollars(Math.max(0, p.gross - p.refunds))}</td>
                    <td className="px-5 py-3">{dollars(p.refunds)}</td>
                    <td className="px-5 py-3">{dollars(p.credits)}</td>
                    <td className="px-5 py-3 text-right font-bold">{dollars(p.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <div className="border-b border-border px-5 py-3 font-bold">Transactions</div>
            <div className="divide-y divide-border md:hidden">
              {rows.slice(0, 100).map((r) => (
                <div key={r._id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-semibold">{r.description}</p>
                    <p className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleDateString("en-CA")} · <span className="capitalize">{r.type.replace("_", " ")}</span>{r.childName ? ` · ${r.childName}` : ""}</p>
                  </div>
                  <p className="shrink-0 font-semibold">{dollars(Math.abs(r.amountCents))}</p>
                </div>
              ))}
            </div>
            <table className="hidden w-full min-w-[720px] text-sm md:table">
              <thead className="border-b border-border text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <tr><th className="px-5 py-3">Date</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">Description</th><th className="px-5 py-3">Child</th><th className="px-5 py-3 text-right">Amount</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.slice(0, 100).map((r) => (
                  <tr key={r._id}>
                    <td className="px-5 py-3 whitespace-nowrap">{new Date(r.createdAt).toLocaleDateString("en-CA")}</td>
                    <td className="px-5 py-3"><span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold capitalize">{r.type.replace("_", " ")}</span></td>
                    <td className="px-5 py-3">{r.description}</td>
                    <td className="px-5 py-3">{r.childName || "—"}</td>
                    <td className="px-5 py-3 text-right font-semibold">{dollars(Math.abs(r.amountCents))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 100 && <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">Showing 100 of {rows.length}. Export the CSV for the full list.</p>}
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------- Refund review ------------------------------ */

export function RefundQueue() {
  const pending = useQuery(api.registrationOps.listPendingRefunds, {});
  const processRefund = useMutation(api.registrationOps.processRefundRequest);
  const catalog = useProgramCatalog();
  const [busy, setBusy] = useState<string | null>(null);

  const decide = async (id: Id<"refundRequests">, decision: "approved" | "declined") => {
    setBusy(id);
    try {
      await processRefund({ id, decision });
      toast.success(decision === "approved" ? "Refund approved — issue it in Stripe" : "Request declined, spot restored");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not process request");
    } finally {
      setBusy(null);
    }
  };

  if (pending === undefined) return <Skeleton />;
  if (pending.length === 0) return <Empty title="No refund requests waiting" body="When a family asks for a refund to card, it lands here for approval." />;

  return (
    <div className="space-y-3">
      {pending.map((r) => {
        const reg = r.registration;
        const prog = reg ? catalog.get(reg.programId) : undefined;
        return (
          <div key={r._id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5">
            <div>
              <p className="font-semibold">{reg?.childName ?? "Unknown child"} · {prog?.name ?? reg?.programId}</p>
              <p className="text-sm text-muted-foreground">{reg?.parentName} ({reg?.parentEmail}) · requested {new Date(r.createdAt).toLocaleDateString("en-CA")}</p>
              {r.reason && <p className="mt-1 text-sm">"{r.reason}"</p>}
              <p className="mt-1 text-xs text-muted-foreground">Paid {dollars(r.paidCents)} − {dollars(r.adminFeeCents)} admin fee</p>
            </div>
            <div className="flex items-center gap-3">
              <p className="text-2xl font-bold">{dollars(r.refundCents)}</p>
              <button disabled={busy === r._id} onClick={() => void decide(r._id, "declined")} className={btnOutline}>Decline</button>
              <button disabled={busy === r._id} onClick={() => void decide(r._id, "approved")} className={btnPrimary}>Approve</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
