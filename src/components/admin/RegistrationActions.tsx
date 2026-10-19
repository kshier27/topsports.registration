import { useMemo, useState } from "react";
import { byStartDesc } from "@/lib/format";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LOCATIONS, formatDob, formatPrice, type Program } from "@/data/registration";

export type ActionReg = {
  _id: string;
  userId: string;
  programId: string;
  sessionId: string;
  childName: string;
  childDob: string;
  parentName: string;
  parentEmail: string;
  parentPhone?: string;
  amountCents: number;
  status: string;
  history?: { at: number; action: string; by: string; detail: string; amountCents?: number }[];
};

type Mode = "menu" | "transfer" | "refund" | "credit";

const inputCls = "h-10 w-full rounded-lg border border-input bg-card px-3.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";
const labelCls = "block text-xs font-semibold text-muted-foreground";
const ACTIVE = (s: string) => s === "confirmed" || s === "refund_pending";
const when = (t: number) => new Date(t).toLocaleString("en-CA", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

export function RegistrationActions({ reg, catalog, onClose, onViewFamily }: { reg: ActionReg | null; catalog: Map<string, Program>; onClose: () => void; onViewFamily: (userId: string) => void }) {
  const [mode, setMode] = useState<Mode>("menu");
  const close = () => {
    setMode("menu");
    onClose();
  };
  return (
    <Dialog open={!!reg} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-background sm:max-w-xl">
        {reg && <Body key={reg._id} reg={reg} catalog={catalog} mode={mode} setMode={setMode} onDone={close} onViewFamily={onViewFamily} />}
      </DialogContent>
    </Dialog>
  );
}

function sessionName(catalog: Map<string, Program>, programId: string, sessionId: string) {
  const p = catalog.get(programId);
  const [sid, slotId] = sessionId.split("~");
  const s = p?.sessions.find((x) => x.id === sid);
  const slot = slotId ? s?.slots?.find((t) => t.id === slotId) : undefined;
  return `${p?.name ?? programId}${s ? ` — ${s.label}` : ""}${slot ? ` (${slot.label})` : ""}`;
}

function Body({ reg, catalog, mode, setMode, onDone, onViewFamily }: { reg: ActionReg; catalog: Map<string, Program>; mode: Mode; setMode: (m: Mode) => void; onDone: () => void; onViewFamily: (userId: string) => void }) {
  const active = ACTIVE(reg.status);
  const fam = useQuery(api.reports.familyDetail, { userId: reg.userId });
  const txns = (fam?.ledger ?? []).filter((l) => l.registrationId === reg._id || (reg.history ?? []).length > 0 && l.registrationId && l.description.includes(reg.childName));
  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-xl font-bold">{reg.childName}</DialogTitle>
        <DialogDescription>
          {sessionName(catalog, reg.programId, reg.sessionId)} · DOB {reg.childDob ? formatDob(reg.childDob) : "—"}
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl bg-muted p-3"><p className="text-xs text-muted-foreground">Parent</p><p className="truncate font-semibold">{reg.parentName}</p><p className="truncate text-xs text-muted-foreground">{reg.parentEmail}</p></div>
        <div className="rounded-xl bg-muted p-3"><p className="text-xs text-muted-foreground">Paid · Status</p><p className="font-semibold">{formatPrice(reg.amountCents / 100)}</p><p className="text-xs capitalize text-muted-foreground">{reg.status.replace("_", " ")}</p></div>
      </div>

      {mode === "menu" && (
        <div className="space-y-4">
          {active ? (
            <div className="grid gap-2 sm:grid-cols-3">
              <button onClick={() => setMode("transfer")} className="cursor-pointer rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold hover:border-primary hover:bg-accent">Transfer</button>
              <button onClick={() => setMode("refund")} className="cursor-pointer rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold hover:border-primary hover:bg-accent">Refund</button>
              <button onClick={() => setMode("credit")} className="cursor-pointer rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold hover:border-primary hover:bg-accent">Credit</button>
            </div>
          ) : (
            <p className="rounded-xl border border-border bg-muted p-3 text-sm text-muted-foreground">This registration is no longer active, so it can't be transferred, refunded or credited again.</p>
          )}
          <History reg={reg} txns={txns} />
          <button onClick={() => onViewFamily(reg.userId)} className="w-full cursor-pointer rounded-full border border-border px-5 py-2.5 text-sm font-semibold hover:bg-accent">View Family Account →</button>
        </div>
      )}
      {mode === "transfer" && <TransferForm reg={reg} catalog={catalog} onBack={() => setMode("menu")} onDone={onDone} />}
      {(mode === "refund" || mode === "credit") && <MoneyForm reg={reg} kind={mode} onBack={() => setMode("menu")} onDone={onDone} />}
    </>
  );
}

function History({ reg, txns }: { reg: ActionReg; txns: { _id: string; type: string; description: string; amountCents: number; createdAt: number; staffEmail?: string }[] }) {
  const items = [
    ...(reg.history ?? []).map((h, i) => ({ key: `h${i}`, at: h.at, title: h.action, detail: h.detail, by: h.by })),
    ...txns.filter((t) => t.type === "payment" || t.type === "credit_used").map((t) => ({ key: t._id, at: t.createdAt, title: t.type === "payment" ? "Payment" : "Credit Applied", detail: `${t.description} · ${formatPrice(Math.abs(t.amountCents) / 100)}`, by: t.staffEmail ?? "Family checkout" })),
  ].sort((a, b) => b.at - a.at);
  return (
    <section>
      <h3 className="text-lg font-bold">Transaction History</h3>
      {items.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">No transfers, refunds or credits on this registration yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
          {items.map((i) => (
            <li key={i.key} className="px-3 py-2.5 text-sm">
              <p className="font-semibold">{i.title}</p>
              <p className="text-xs text-muted-foreground">{i.detail}</p>
              <p className="text-xs text-muted-foreground">{when(i.at)} · By {i.by}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MoneyForm({ reg, kind, onBack, onDone }: { reg: ActionReg; kind: "refund" | "credit"; onBack: () => void; onDone: () => void }) {
  const refund = useMutation(api.staffRegOps.staffRefund);
  const credit = useMutation(api.staffRegOps.staffCredit);
  const [amount, setAmount] = useState((reg.amountCents / 100).toFixed(2));
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const cents = Math.round(Number(amount) * 100);
  const valid = Number.isFinite(cents) && cents >= 0 && cents <= reg.amountCents;
  const label = kind === "refund" ? "Refund" : "Credit";
  const submit = async () => {
    if (!valid) return toast.error(`Enter an amount between $0.00 and ${formatPrice(reg.amountCents / 100)}`);
    setBusy(true);
    try {
      if (kind === "refund") await refund({ id: reg._id as Id<"registrations">, amountCents: cents, reason: reason.trim() || undefined });
      else await credit({ id: reg._id as Id<"registrations">, amountCents: cents, reason: reason.trim() || undefined });
      toast.success(kind === "refund" ? `Refunded ${formatPrice(cents / 100)}. ${reg.parentName} has been emailed.` : `Credited ${formatPrice(cents / 100)}. ${reg.parentName} has been emailed.`);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message.replace(/^.*Uncaught Error: /, "").split("\n")[0] : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <button onClick={onBack} className="cursor-pointer text-sm font-semibold text-muted-foreground hover:text-foreground">← Back</button>
      <p className="text-sm text-muted-foreground">
        {kind === "refund"
          ? "Refunds go back to the original card through Stripe. The player is removed from the roster, and the amount is taken out of revenue."
          : "The player is removed from the roster and the amount is added to the family's account credit, which applies automatically at their next checkout."}
      </p>
      <label className={labelCls}>{label} Amount (CAD), max {formatPrice(reg.amountCents / 100)}
        <input type="number" min={0} step="0.01" max={reg.amountCents / 100} value={amount} onChange={(e) => setAmount(e.target.value)} className={`${inputCls} mt-1.5`} />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setAmount((reg.amountCents / 100).toFixed(2))} className="cursor-pointer rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold hover:bg-accent">Full amount</button>
        {kind === "refund" && reg.amountCents > 5000 && <button type="button" onClick={() => setAmount(((reg.amountCents - 5000) / 100).toFixed(2))} className="cursor-pointer rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold hover:bg-accent">Less $50 admin fee</button>}
      </div>
      <label className={labelCls}>Note to Family (optional)
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="e.g. Program cancelled due to low enrolment" className="mt-1.5 w-full rounded-lg border border-input bg-card px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
      </label>
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
        <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
        <span>I understand this cancels {reg.childName}'s registration and emails the family. This can't be undone.</span>
      </label>
      <button disabled={!confirm || !valid || busy} onClick={() => void submit()} className="w-full cursor-pointer rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
        {busy ? "Working…" : `${label} ${valid ? formatPrice(cents / 100) : ""} & Cancel Registration`}
      </button>
    </div>
  );
}

function TransferForm({ reg, catalog, onBack, onDone }: { reg: ActionReg; catalog: Map<string, Program>; onBack: () => void; onDone: () => void }) {
  const transfer = useMutation(api.staffRegOps.staffTransfer);
  const regs = useQuery(api.reports.allRegistrations, {}) as { _id: string; programId: string; sessionId: string; status: string }[] | null | undefined;
  const current = catalog.get(reg.programId);
  const [programId, setProgramId] = useState(reg.programId);
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const programs = useMemo(() => [...catalog.values()].filter((p) => !current || p.locationSlug === current.locationSlug).sort(byStartDesc), [catalog, current]);
  const program = catalog.get(programId);

  const choices = useMemo(() => {
    if (!program) return [];
    const act = (regs ?? []).filter((r) => r.programId === program.id && ACTIVE(r.status) && r._id !== reg._id);
    const out: { id: string; label: string; left: number | null }[] = [];
    for (const s of program.sessions) {
      const inS = act.filter((r) => r.sessionId.split("~")[0] === s.id).length;
      const sLeft = s.capacity > 0 ? s.capacity - inS : null;
      if (s.slots?.length && (s.multi ?? true)) {
        for (const t of s.slots) {
          const inT = act.filter((r) => r.sessionId === `${s.id}~${t.id}`).length;
          const tLeft = t.capacity > 0 ? t.capacity - inT : null;
          const left = sLeft === null ? tLeft : tLeft === null ? sLeft : Math.min(sLeft, tLeft);
          out.push({ id: `${s.id}~${t.id}`, label: `${s.label} — ${t.label}`, left });
        }
      } else out.push({ id: s.id, label: `${s.label}${s.dates ? ` · ${s.dates}` : ""}`, left: sLeft });
    }
    return out.filter((c) => !(program.id === reg.programId && c.id === reg.sessionId));
  }, [program, regs, reg]);

  const chosen = choices.find((c) => c.id === target);
  const submit = async () => {
    if (!chosen) return toast.error("Pick a session to transfer to");
    if (chosen.left !== null && chosen.left <= 0) return toast.error("That session is full");
    setBusy(true);
    try {
      await transfer({ id: reg._id as Id<"registrations">, programId, sessionId: target, reason: reason.trim() || undefined });
      toast.success(`${reg.childName} transferred. ${reg.parentName} has been emailed.`);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message.replace(/^.*Uncaught Error: /, "").split("\n")[0] : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <button onClick={onBack} className="cursor-pointer text-sm font-semibold text-muted-foreground hover:text-foreground">← Back</button>
      <p className="text-sm text-muted-foreground">Move {reg.childName} to another session at {LOCATIONS.find((l) => l.slug === current?.locationSlug)?.name ?? "this location"}. Only sessions marked Available can be picked. The amount paid carries over.</p>
      <label className={labelCls}>Program
        <select value={programId} onChange={(e) => { setProgramId(e.target.value); setTarget(""); }} className={`${inputCls} mt-1.5`}>
          {programs.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.season}</option>)}
        </select>
      </label>
      <div>
        <p className={labelCls}>Session</p>
        {regs === undefined ? (
          <div className="mt-1.5 h-20 animate-pulse rounded-xl bg-muted" />
        ) : choices.length === 0 ? (
          <p className="mt-1.5 rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">No other sessions in this program. Pick a different program.</p>
        ) : (
          <div className="mt-1.5 space-y-2">
            {choices.map((c) => {
              const full = c.left !== null && c.left <= 0;
              return (
                <button key={c.id} disabled={full} onClick={() => setTarget(c.id)} className={`flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${target === c.id ? "border-primary bg-accent" : "border-border bg-card hover:border-primary/50"}`}>
                  <span className="font-semibold">{c.label}</span>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${full ? "bg-muted text-muted-foreground" : "bg-success text-success-foreground"}`}>{full ? "Not Available" : "Available"}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <label className={labelCls}>Note to Family (optional)
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="e.g. Moved at parent's request" className="mt-1.5 w-full rounded-lg border border-input bg-card px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
      </label>
      <button disabled={!chosen || busy} onClick={() => void submit()} className="w-full cursor-pointer rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
        {busy ? "Transferring…" : "Transfer Registration"}
      </button>
    </div>
  );
}
