import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { LOCATIONS, SEED_PROGRAMS, parseProgram, sessionName, formatPrice, sessionPrice, type Program } from "@/data/registration";

const inputCls = "h-10 w-full rounded-lg border border-input bg-card px-3.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";
const labelCls = "block text-xs font-semibold text-muted-foreground";
const card = "space-y-4 rounded-2xl border border-border bg-card p-5 sm:p-6";
const btn = "cursor-pointer rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50";

/** Every program staff can see: seed programs overlaid with saved (managed) ones. */
function useAllPrograms(): Program[] | undefined {
  const managed = useQuery(api.programAdmin.listManaged, {});
  return useMemo(() => {
    if (managed === undefined) return undefined;
    const map = new Map<string, Program>(SEED_PROGRAMS.map((p) => [p.id, p]));
    for (const m of managed ?? []) {
      if ((m as { archived?: boolean }).archived) { map.delete(m.programId); continue; }
      const p = parseProgram(m.data);
      if (p) map.set(p.id, p);
    }
    return [...map.values()];
  }, [managed]);
}

export function StaffTools() {
  const [tool, setTool] = useState<"register" | "season" | "merge">("register");
  const tools = [["register", "Staff Registration"], ["season", "Copy Last Season"], ["merge", "Merge Families"]] as const;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1.5">
        {tools.map(([k, l]) => (
          <button key={k} type="button" aria-pressed={tool === k} onClick={() => setTool(k)} className={`cursor-pointer rounded-full px-4 py-2 text-sm font-semibold ${tool === k ? "bg-primary text-primary-foreground" : "border border-border hover:bg-accent"}`}>{l}</button>
        ))}
      </div>
      {tool === "register" && <StaffRegistration />}
      {tool === "season" && <CopySeason />}
      {tool === "merge" && <MergeFamilies />}
    </div>
  );
}

function StaffRegistration() {
  const programs = useAllPrograms();
  const create = useMutation(api.staffTools.staffCreateRegistration);
  const [loc, setLoc] = useState(LOCATIONS[0].slug);
  const list = (programs ?? []).filter((p) => p.locationSlug === loc);
  const [programId, setProgramId] = useState("");
  const program = list.find((p) => p.id === programId) ?? list[0];
  const [sessionId, setSessionId] = useState("");
  const session = program?.sessions.find((s) => s.id === sessionId) ?? program?.sessions[0];
  const [f, setF] = useState({ child: "", dob: "", parent: "", email: "", phone: "", note: "", method: "Cash", amount: "" });
  const [payment, setPayment] = useState<"offline" | "comp">("offline");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, val: string) => setF({ ...f, [k]: val });
  const price = program && session ? sessionPrice(program, session) : 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!program || !session) return;
    setBusy(true);
    try {
      const amt = f.amount.trim() ? Number(f.amount) : price;
      await create({
        programId: program.id, locationSlug: program.locationSlug, sessionId: session.id,
        childName: f.child, childDob: f.dob, parentName: f.parent, parentEmail: f.email, parentPhone: f.phone || undefined,
        amountCents: Math.round((Number.isFinite(amt) ? amt : 0) * 100), payment, method: payment === "offline" ? f.method : undefined, note: f.note || undefined,
      });
      toast.success(`${f.child} registered in ${program.name}`);
      setF({ child: "", dob: "", parent: "", email: "", phone: "", note: "", method: "Cash", amount: "" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not register");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className={card}>
      <div>
        <h3 className="text-lg font-bold">Register a Child by Hand</h3>
        <p className="text-sm text-muted-foreground">For phone-ins, cash or cheque, e-transfer, comp spots and scholarships. The child goes straight onto the roster, and reports show it as Paid Offline or Comp.</p>
      </div>
      {programs === undefined ? <div className="h-24 animate-pulse rounded-xl bg-muted" /> : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className={labelCls}>Location
              <select value={loc} onChange={(e) => { setLoc(e.target.value); setProgramId(""); setSessionId(""); }} className={`${inputCls} mt-1.5`}>
                {LOCATIONS.map((l) => <option key={l.slug} value={l.slug}>{l.name}</option>)}
              </select>
            </label>
            <label className={labelCls}>Program
              <select value={program?.id ?? ""} onChange={(e) => { setProgramId(e.target.value); setSessionId(""); }} className={`${inputCls} mt-1.5`}>
                {list.length === 0 && <option value="">No programs at this location</option>}
                {list.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className={labelCls}>Session
              <select value={session?.id ?? ""} onChange={(e) => setSessionId(e.target.value)} className={`${inputCls} mt-1.5`}>
                {program?.sessions.map((s) => <option key={s.id} value={s.id}>{sessionName(s)} · {s.dates}</option>)}
              </select>
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelCls}>Child's full name<input required value={f.child} onChange={(e) => set("child", e.target.value)} className={`${inputCls} mt-1.5`} /></label>
            <label className={labelCls}>Date of birth<input required type="date" value={f.dob} onChange={(e) => set("dob", e.target.value)} className={`${inputCls} mt-1.5`} /></label>
            <label className={labelCls}>Parent name<input required value={f.parent} onChange={(e) => set("parent", e.target.value)} className={`${inputCls} mt-1.5`} /></label>
            <label className={labelCls}>Parent email<input required type="email" inputMode="email" value={f.email} onChange={(e) => set("email", e.target.value)} className={`${inputCls} mt-1.5`} /></label>
            <label className={labelCls}>Parent phone (optional)<input type="tel" inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} className={`${inputCls} mt-1.5`} /></label>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(["offline", "comp"] as const).map((k) => (
              <button key={k} type="button" aria-pressed={payment === k} onClick={() => setPayment(k)} className={`cursor-pointer rounded-full px-4 py-2 text-sm font-semibold ${payment === k ? "bg-primary text-primary-foreground" : "border border-border hover:bg-accent"}`}>{k === "offline" ? "Paid Offline" : "Comp / Scholarship ($0)"}</button>
            ))}
          </div>
          {payment === "offline" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={labelCls}>Payment method
                <select value={f.method} onChange={(e) => set("method", e.target.value)} className={`${inputCls} mt-1.5`}>
                  {["Cash", "Cheque", "E-transfer", "Card by phone", "Other"].map((m) => <option key={m}>{m}</option>)}
                </select>
              </label>
              <label className={labelCls}>Amount paid ($)<input inputMode="decimal" value={f.amount} placeholder={price.toFixed(2)} onChange={(e) => set("amount", e.target.value)} className={`${inputCls} mt-1.5`} /></label>
            </div>
          )}
          <label className={labelCls}>Private staff note (optional)<textarea value={f.note} onChange={(e) => set("note", e.target.value)} rows={2} className="mt-1.5 w-full rounded-lg border border-input bg-card px-3.5 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring" /></label>
          <p className="text-xs text-muted-foreground">If this email already has a family account, the registration is added to it. Otherwise it's held under the email until you merge it with their account in Merge Families.</p>
          <button disabled={busy || !program || !session} className={btn}>{busy ? "Registering…" : `Register · ${payment === "comp" ? "Comp" : formatPrice(f.amount.trim() ? Number(f.amount) || 0 : price)}`}</button>
        </>
      )}
    </form>
  );
}

const bumpIso = (s?: string) => (s && /^\d{4}/.test(s) ? `${Number(s.slice(0, 4)) + 1}${s.slice(4)}` : s);
const bumpSeason = (s: string) => s.replace(/\d{4}/g, (y) => String(Number(y) + 1)).replace(/(\d{4})\s*([–-])\s*(\d{2})\b/, (_m, a: string, d: string, b: string) => `${a}${d}${String(Number(b) + 1).padStart(2, "0").slice(-2)}`);

function CopySeason() {
  const programs = useAllPrograms();
  const save = useMutation(api.programAdmin.saveProgram);
  const seasons = useMemo(() => [...new Set((programs ?? []).map((p) => p.season).filter(Boolean))].sort(), [programs]);
  const [season, setSeason] = useState("");
  const [loc, setLoc] = useState("all");
  const [busy, setBusy] = useState(false);
  const picked = (programs ?? []).filter((p) => p.season === season && (loc === "all" || p.locationSlug === loc));

  const run = async () => {
    if (picked.length === 0) return;
    if (!confirm(`Create ${picked.length} draft program${picked.length === 1 ? "" : "s"} for ${bumpSeason(season)}? Nothing is published until you review each one.`)) return;
    setBusy(true);
    let made = 0;
    try {
      for (const src of picked) {
        const id = `prog-${crypto.randomUUID().slice(0, 6)}`;
        const copy: Program = {
          ...structuredClone(src),
          id,
          name: src.name.replace(/\d{4}/g, (y) => String(Number(y) + 1)),
          season: bumpSeason(src.season),
          sessions: src.sessions.map((s) => ({ ...s, id: `s-${crypto.randomUUID().slice(0, 6)}`, enrolled: 0, price: sessionPrice(src, s) })),
          outDates: (src.outDates ?? []).map((o) => ({ ...o, date: bumpIso(o.date) ?? o.date })),
          discounts: (src.discounts ?? []).map((d) => ({ ...d, deadline: bumpIso(d.deadline) })),
          regOpens: bumpIso(src.regOpens),
          regCloses: bumpIso(src.regCloses),
        };
        await save({ data: JSON.stringify(copy), published: false });
        made++;
      }
      toast.success(`${made} draft program${made === 1 ? "" : "s"} created for ${bumpSeason(season)}`);
    } catch (e) {
      toast.error(`${made} created, then: ${e instanceof Error ? e.message : "an error occurred"}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={card}>
      <div>
        <h3 className="text-lg font-bold">Copy Last Season</h3>
        <p className="text-sm text-muted-foreground">Copies every program in a season into next year as drafts. Years move forward by one in the season name, program name, registration open/close dates, out dates and early-bird deadlines. Rosters start empty.</p>
      </div>
      {programs === undefined ? <div className="h-16 animate-pulse rounded-xl bg-muted" /> : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelCls}>Season to copy
              <select value={season} onChange={(e) => setSeason(e.target.value)} className={`${inputCls} mt-1.5`}>
                <option value="">Choose a season</option>
                {seasons.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className={labelCls}>Location
              <select value={loc} onChange={(e) => setLoc(e.target.value)} className={`${inputCls} mt-1.5`}>
                <option value="all">All locations</option>
                {LOCATIONS.map((l) => <option key={l.slug} value={l.slug}>{l.name}</option>)}
              </select>
            </label>
          </div>
          {season && (
            <div className="rounded-xl bg-muted p-4 text-sm">
              {picked.length === 0 ? <p>No programs in {season} at this location.</p> : (
                <>
                  <p className="font-semibold">{picked.length} program{picked.length === 1 ? "" : "s"} → {bumpSeason(season)}</p>
                  <ul className="mt-1 list-disc pl-5 text-muted-foreground">{picked.slice(0, 8).map((p) => <li key={p.id}>{p.name}</li>)}{picked.length > 8 && <li>+ {picked.length - 8} more</li>}</ul>
                </>
              )}
            </div>
          )}
          <p className="rounded-xl border border-warning bg-warning/15 p-3 text-xs">Session dates like "Jul 6 – Aug 28" keep the same month and day. Check each draft's dates (weekdays shift each year), prices and times before publishing.</p>
          <button disabled={busy || picked.length === 0} onClick={() => void run()} className={btn}>{busy ? "Copying…" : "Create Next Season Drafts"}</button>
        </>
      )}
    </div>
  );
}

type FamilyRow = { userId: string; parentName: string; parentEmail: string; childName: string };

function MergeFamilies() {
  const regs = useQuery(api.reports.allRegistrations, {}) as FamilyRow[] | null | undefined;
  const merge = useMutation(api.staffTools.mergeFamilies);
  const [q, setQ] = useState("");
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const families = useMemo(() => {
    const map = new Map<string, { userId: string; names: Set<string>; emails: Set<string>; kids: Set<string>; count: number }>();
    for (const r of regs ?? []) {
      const f = map.get(r.userId) ?? { userId: r.userId, names: new Set(), emails: new Set(), kids: new Set(), count: 0 };
      f.names.add(r.parentName); f.emails.add(r.parentEmail); f.kids.add(r.childName); f.count++;
      map.set(r.userId, f);
    }
    return [...map.values()];
  }, [regs]);

  // Likely duplicates: different accounts sharing a child name or parent name.
  const suggestions = useMemo(() => {
    const out: [string, string, string][] = [];
    for (let i = 0; i < families.length; i++)
      for (let j = i + 1; j < families.length; j++) {
        const a = families[i], b = families[j];
        const kid = [...a.kids].find((k) => b.kids.has(k));
        const parent = [...a.names].find((n) => b.names.has(n));
        if (kid && parent) out.push([a.userId, b.userId, `${parent} · ${kid}`]);
      }
    return out.slice(0, 10);
  }, [families]);

  const term = q.trim().toLowerCase();
  const matches = term.length < 2 ? [] : families.filter((f) => `${[...f.names].join(" ")} ${[...f.emails].join(" ")} ${[...f.kids].join(" ")}`.toLowerCase().includes(term)).slice(0, 12);
  const label = (id: string | null) => { const f = families.find((x) => x.userId === id); return f ? `${[...f.names][0]} · ${[...f.emails][0]}` : "—"; };

  const run = async () => {
    if (!from || !to) return;
    if (!confirm(`Move everything from "${label(from)}" into "${label(to)}"? This can't be undone.`)) return;
    setBusy(true);
    try {
      const n = await merge({ fromUserId: from, toUserId: to });
      toast.success(`Merged · ${n} records moved`);
      setFrom(null); setTo(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not merge");
    } finally {
      setBusy(false);
    }
  };

  const pick = (id: string) => (!from ? setFrom(id) : id !== from ? setTo(id) : undefined);

  return (
    <div className={card}>
      <div>
        <h3 className="text-lg font-bold">Merge Duplicate Families</h3>
        <p className="text-sm text-muted-foreground">Moves registrations, children, payments, credit, waitlist entries, refund requests and staff notes from one account into another. Duplicate child profiles (same name and birthday) are removed.</p>
      </div>
      {regs === undefined ? <div className="h-16 animate-pulse rounded-xl bg-muted" /> : (
        <>
          {suggestions.length > 0 && (
            <div>
              <p className={labelCls}>Possible duplicates</p>
              <ul className="mt-1.5 space-y-1.5">
                {suggestions.map(([a, b, why]) => (
                  <li key={`${a}${b}`}><button type="button" onClick={() => { setFrom(b); setTo(a); }} className="w-full cursor-pointer rounded-xl border border-border px-3.5 py-2 text-left text-sm hover:bg-accent">{why} <span className="text-muted-foreground">· {label(a)} and {label(b)}</span></button></li>
                ))}
              </ul>
            </div>
          )}
          <label className={labelCls}>Find a family<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Parent, email or child" className={`${inputCls} mt-1.5`} /></label>
          {matches.length > 0 && (
            <ul className="space-y-1.5">
              {matches.map((f) => (
                <li key={f.userId}><button type="button" onClick={() => pick(f.userId)} className={`w-full cursor-pointer rounded-xl border px-3.5 py-2 text-left text-sm hover:bg-accent ${f.userId === from || f.userId === to ? "border-primary bg-accent" : "border-border"}`}>
                  <span className="font-semibold">{[...f.names].join(" / ")}</span> · {[...f.emails].join(", ")}<br /><span className="text-xs text-muted-foreground">Kids: {[...f.kids].join(", ")} · {f.count} registration{f.count === 1 ? "" : "s"}</span>
                </button></li>
              ))}
            </ul>
          )}
          <div className="grid gap-3 rounded-xl bg-muted p-4 text-sm sm:grid-cols-2">
            <p><span className="font-semibold">Merge from:</span> {label(from)}</p>
            <p><span className="font-semibold">Into (keep):</span> {label(to)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button disabled={busy || !from || !to} onClick={() => void run()} className={btn}>{busy ? "Merging…" : "Merge Families"}</button>
            {(from || to) && <button type="button" onClick={() => { setFrom(null); setTo(null); }} className="cursor-pointer rounded-full border border-border px-5 py-2.5 text-sm font-semibold hover:bg-accent">Clear</button>}
          </div>
        </>
      )}
    </div>
  );
}

/** Private, staff-only note on one registration. */
export function StaffNote({ registrationId, userId, initial }: { registrationId: string; userId: string; initial?: string }) {
  const save = useMutation(api.staffTools.setStaffNote);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(initial ?? "");
  const submit = async () => {
    try { await save({ registrationId, userId, note: text }); toast.success(text.trim() ? "Note saved" : "Note removed"); setOpen(false); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not save note"); }
  };
  if (!open)
    return (
      <div className="mt-1 print:hidden">
        {initial?.trim() && <p className="rounded-lg bg-info/15 px-2.5 py-1.5 text-xs"><span className="font-bold">Staff note:</span> {initial}</p>}
        <button type="button" onClick={(e) => { e.stopPropagation(); setText(initial ?? ""); setOpen(true); }} className="mt-1 cursor-pointer text-xs font-semibold text-primary hover:underline">{initial?.trim() ? "Edit note" : "+ Staff note"}</button>
      </div>
    );
  return (
    <div className="mt-1 space-y-1.5 print:hidden" onClick={(e) => e.stopPropagation()}>
      <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={2} aria-label="Private staff note" placeholder="Only staff can see this" className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
      <div className="flex gap-1.5">
        <button type="button" onClick={() => void submit()} className="cursor-pointer rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground">Save</button>
        <button type="button" onClick={() => setOpen(false)} className="cursor-pointer rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold hover:bg-accent">Cancel</button>
      </div>
    </div>
  );
}

/** Record of every program email sent or scheduled. */
export function SentEmails() {
  const rows = useQuery(api.staffTools.listSentEmails, {});
  const cancel = useMutation(api.staffTools.cancelScheduledEmail);
  const fmt = (t: number) => new Date(t).toLocaleString("en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const pill: Record<string, string> = { scheduled: "bg-info text-info-foreground", sent: "bg-success text-success-foreground", failed: "bg-destructive text-destructive-foreground", cancelled: "bg-muted text-muted-foreground" };
  return (
    <div className="mt-6 rounded-2xl border border-border bg-card p-5 sm:p-6">
      <h3 className="text-lg font-bold">Sent & Scheduled Emails</h3>
      {rows === undefined ? <div className="mt-3 h-16 animate-pulse rounded-xl bg-muted" /> : !rows || rows.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No program emails yet. Emails you send or schedule will be listed here.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {rows.map((r) => (
            <li key={r._id} className="flex flex-wrap items-start justify-between gap-2 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-semibold">{r.subject}</p>
                <p className="text-xs text-muted-foreground">{r.programName} · {r.sessionLabel} · by {r.createdBy.split("@")[0] || "staff"}</p>
                <p className="text-xs text-muted-foreground">{r.status === "scheduled" ? `Sends ${fmt(r.sendAt)}` : `${fmt(r.sendAt)}${r.sentCount !== undefined ? ` · ${r.sentCount} sent${r.failedCount ? ` · ${r.failedCount} failed` : ""}` : ""}`}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold capitalize ${pill[r.status] ?? "bg-muted"}`}>{r.status}</span>
                {r.status === "scheduled" && <button type="button" onClick={() => void cancel({ id: r._id as Id<"sentEmails"> }).then(() => toast("Scheduled email cancelled"))} className="cursor-pointer rounded-full border border-border px-3 py-1 text-xs font-semibold hover:bg-accent">Cancel</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
