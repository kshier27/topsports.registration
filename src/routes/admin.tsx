import { compressImage } from "@/lib/compress-image";
import { createFileRoute, Link } from "@tanstack/react-router";
import { SITE } from "@/lib/site-settings";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useSession, signInWithEmail, signUpWithEmail, signOutUser } from "@/lib/auth-client";
import {
  LOCATIONS,
  SEED_PROGRAMS,
  STOCK,
  formatPrice,
  parseProgram,
  asksJersey,
  DEFAULT_WAIVERS,
  type CustomQuestion,
  WAIVERS,
  sessionPrice,
  fromPrice,
  regState,
  netRevenue,
  formatDateTime,
  programStart,
  type RegState,
  type AddOn,
  type Discount,
  type Program,
  type ProgramCategory,
  type Session,
  type TimeSlot,
  venueAddress,
  eligibilityLabel,
  birthYearsOf,
  agesFor,
  ageAsOfDate,
  weekdayIssue,
} from "@/data/registration";
import { FinancialReport, RefundQueue } from "@/components/admin/StaffReports";
import { RosterList } from "@/components/admin/Rosters";
import { byStartDesc } from "@/lib/format";
import { StaffDashboard } from "@/components/admin/StaffDashboard";
import { WaitlistAdmin } from "@/components/waitlist";
import { ProgramEmail } from "@/components/admin/ProgramEmail";
import { CouponsCredit } from "@/components/admin/CouponsCredit";
import { ProgramDetail } from "@/components/admin/ProgramDetail";
import { ActivityLog } from "@/components/admin/ActivityLog";
import { GlobalSearch, MoreReports } from "@/components/admin/MoreReports";
import { StaffTools, SentEmails } from "@/components/admin/StaffTools";
import { StaffTwoStep, StaffIdleTimeout } from "@/components/admin/StaffSecurity";

export const Route = createFileRoute("/admin")({ component: AdminPage });

const CATEGORIES: ProgramCategory[] = ["Camps", "Hockey", "Soccer", "Lacrosse"];
const inputCls =
  "h-10 w-full rounded-lg border border-input bg-card px-3.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";
const labelCls = "block text-xs font-semibold text-muted-foreground";

const uid = (p: string) => `${p}-${crypto.randomUUID().slice(0, 6)}`;

function blankProgram(): Program {
  return {
    id: uid("prog"),
    locationSlug: LOCATIONS[0].slug,
    name: "",
    category: "Camps",
    season: "Summer 2027",
    ages: [6, 12],
    ageAsOf: "2027-07-01",
    birthYears: [2015, 2021],
    ageAsOfMode: "start",
    venue: LOCATIONS[0].venues[0],
    description: "",
    image: STOCK.feature,
    taxable: false,
    sessions: [{ id: uid("s"), label: "Week 1", dates: "Jul 6 – Jul 10", days: "Mon – Fri", time: "9:00am – 4:00pm", capacity: 40, enrolled: 0, price: 550, location: LOCATIONS[0].venues[0] }],
    options: [{ id: "std", label: "Registration", detail: "", price: 550 }],
    addOns: [],
    outDates: [],
  };
}

function SessionOptionsEditor({ session: s, venues, onChange }: { session: Session; venues: string[]; onChange: (patch: Partial<Session>) => void }) {
  const isMulti = s.multi ?? (s.slots ?? []).length > 0;
  const slots = s.slots ?? [];
  const num = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const upd = (k: number, patch: Partial<TimeSlot>) => onChange({ slots: slots.map((x, m) => (m === k ? { ...x, ...patch } : x)) });
  const move = (k: number, dir: -1 | 1) => {
    const j = k + dir;
    if (j < 0 || j >= slots.length) return;
    const next = [...slots];
    [next[k], next[j]] = [next[j], next[k]];
    onChange({ slots: next });
  };
  const addOpt = () => {
    const last = slots[slots.length - 1];
    onChange({ multi: true, slots: [...slots, { id: uid("opt"), label: "", capacity: last?.capacity ?? 0, enrolled: 0, dates: last?.dates ?? s.dates, days: last?.days ?? s.days, time: last?.time ?? s.time, price: last?.price ?? s.price ?? 0, location: last?.location ?? s.location }] });
  };
  return (
    <div className={`space-y-3 rounded-lg border p-3 sm:col-span-2 lg:col-span-4 ${isMulti ? "border-primary bg-card" : "border-border bg-card"}`}>
      <label className="flex cursor-pointer items-start gap-3 text-sm">
        <input type="checkbox" checked={isMulti} onChange={(e) => { if (e.target.checked && slots.length === 0) addOpt(); else onChange({ multi: e.target.checked }); }} className="mt-0.5 h-4 w-4 accent-primary" />
        <span>
          <span className="font-semibold">This Session has multiple registration options</span>
          <span className="block text-xs text-muted-foreground">Families pick this session, then choose one option, such as a different day, time or age group. Each option has its own dates, times, price, location and spots.</span>
        </span>
      </label>
      {isMulti && (
        <div className="space-y-3">
          {slots.length === 0 && <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">No options yet. Add one so families can register for this session.</p>}
          {slots.map((t, k) => (
            <div key={t.id} className="grid items-end gap-3 rounded-lg bg-muted/50 p-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex items-center justify-between gap-2 sm:col-span-2 lg:col-span-4">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Option {k + 1}</span>
                <div className="flex gap-1">
                  <button type="button" onClick={() => move(k, -1)} disabled={k === 0} aria-label="Move option up" className="h-8 cursor-pointer rounded-lg border border-border bg-card px-3 text-xs font-semibold hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40">↑</button>
                  <button type="button" onClick={() => move(k, 1)} disabled={k === slots.length - 1} aria-label="Move option down" className="h-8 cursor-pointer rounded-lg border border-border bg-card px-3 text-xs font-semibold hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40">↓</button>
                  <button type="button" onClick={() => onChange({ slots: slots.filter((_, m) => m !== k) })} disabled={t.enrolled > 0} className="h-8 cursor-pointer rounded-lg px-3 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-40">Remove</button>
                </div>
              </div>
              <label className={`${labelCls} sm:col-span-2`}>Option Name<input value={t.label} placeholder="e.g. Monday 6pm" onChange={(e) => upd(k, { label: e.target.value })} className={`${inputCls} mt-1.5`} /></label>
              <label className={labelCls}>Dates<input value={t.dates ?? ""} placeholder="Apr 17 – Jun 22" onChange={(e) => upd(k, { dates: e.target.value })} className={`${inputCls} mt-1.5`} /></label>
              <label className={labelCls}>Days<input value={t.days ?? ""} placeholder="Mondays" onChange={(e) => upd(k, { days: e.target.value })} className={`${inputCls} mt-1.5`} /></label>
              <label className={labelCls}>Time<input value={t.time ?? ""} placeholder="6:00pm – 7:00pm" onChange={(e) => upd(k, { time: e.target.value })} className={`${inputCls} mt-1.5`} /></label>
              <label className={labelCls}>Price (CAD)<input type="number" min={0} step="0.01" value={t.price ?? s.price ?? 0} onChange={(e) => upd(k, { price: Math.max(0, num(e.target.value)) })} className={`${inputCls} mt-1.5`} /></label>
              <label className={labelCls}>Spots (0 = no limit)<input type="number" min={0} value={t.capacity} onChange={(e) => upd(k, { capacity: Math.max(0, num(e.target.value)) })} className={`${inputCls} mt-1.5`} /></label>
              <label className={labelCls}>Location
                <select value={t.location?.trim() || s.location?.trim() || venues[0] || ""} onChange={(e) => upd(k, { location: e.target.value })} className={`${inputCls} mt-1.5`}>
                  {[...new Set([...venues, ...(t.location?.trim() ? [t.location.trim()] : [])])].map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </label>
            </div>
          ))}
          <button type="button" onClick={addOpt} className="cursor-pointer rounded-full border border-border px-4 py-2 text-xs font-semibold hover:bg-accent">+ Add Session Option</button>
          <div className="grid items-end gap-3 rounded-lg border border-success/40 bg-success/10 p-3 sm:grid-cols-2">
            <label className={labelCls}>Multi-Session Discount: $ Off Each Additional Option
              <input type="number" min={0} step="0.01" value={s.comboDiscount ?? 0} onChange={(e) => onChange({ comboDiscount: Math.max(0, num(e.target.value)) })} className={`${inputCls} mt-1.5`} />
            </label>
            <p className="text-xs text-muted-foreground">Families can pick more than one option. When the same child takes 2+ options of this session, every option after the first gets this amount off. Set 0 for no multi-session discount.</p>
          </div>
        </div>
      )}
    </div>
  );
}


function BulkSessionEdit({ onApply }: { onApply: (patch: Partial<Session>) => void }) {
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState("");
  const [time, setTime] = useState("");
  const [days, setDays] = useState("");
  const [cap, setCap] = useState("");
  const apply = () => {
    const patch: Partial<Session> = {};
    if (price.trim() !== "" && Number.isFinite(Number(price))) patch.price = Math.max(0, Number(price));
    if (time.trim()) patch.time = time.trim();
    if (days.trim()) patch.days = days.trim();
    if (cap.trim() !== "" && Number.isFinite(Number(cap))) patch.capacity = Math.max(0, Math.floor(Number(cap)));
    if (Object.keys(patch).length === 0) { toast.error("Fill in at least one field to apply"); return; }
    onApply(patch);
    toast.success("Applied to every session. Save to keep the changes.");
    setPrice(""); setTime(""); setDays(""); setCap(""); setOpen(false);
  };
  return (
    <div className="rounded-xl border border-border">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full cursor-pointer items-center justify-between gap-2 px-4 py-3 text-sm font-semibold hover:bg-accent">
        Bulk Edit All Sessions <span aria-hidden>{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="grid items-end gap-3 border-t border-border p-4 sm:grid-cols-2 lg:grid-cols-5">
          <label className={labelCls}>Price (CAD)<input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Leave blank to keep" className={`${inputCls} mt-1.5`} /></label>
          <label className={labelCls}>Days<input value={days} onChange={(e) => setDays(e.target.value)} placeholder="Mon – Fri" className={`${inputCls} mt-1.5`} /></label>
          <label className={labelCls}>Time<input value={time} onChange={(e) => setTime(e.target.value)} placeholder="9:00am – 4:00pm" className={`${inputCls} mt-1.5`} /></label>
          <label className={labelCls}>Spots<input type="number" min={0} value={cap} onChange={(e) => setCap(e.target.value)} placeholder="Leave blank to keep" className={`${inputCls} mt-1.5`} /></label>
          <button type="button" onClick={apply} className="h-10 cursor-pointer rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Apply to All</button>
          <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-5">Only the fields you fill in are changed. Session options inside multi-option sessions keep their own prices and times.</p>
        </div>
      )}
    </div>
  );
}

type Row = { program: Program; published: boolean; managed: boolean; updatedBy?: string; updatedAt?: number; archived?: boolean };

function AdminPage() {
  const { data: session, isPending } = useSession();
  const staff = useQuery(api.registrationOps.amIStaff, session ? {} : "skip");

  if (isPending) return <Shell><div className="h-40 animate-pulse rounded-2xl bg-muted" /></Shell>;
  if (!session) return <Shell><StaffSignIn /></Shell>;
  if (staff === undefined) return <Shell><div className="h-40 animate-pulse rounded-2xl bg-muted" /></Shell>;
  if (!staff)
    return (
      <Shell>
        <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-8 text-center">
          <h2 className="text-xl font-bold">Staff Access Only</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {session.user.email} isn't on the TOP Sports staff list. Ask an administrator to add your email.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Link to="/" className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">Back to site</Link>
            <button onClick={() => void signOutUser()} className="cursor-pointer rounded-full border border-border px-5 py-2.5 text-sm font-semibold hover:bg-accent">Sign out</button>
          </div>
        </div>
      </Shell>
    );
  return (
    <StaffTwoStep email={session.user.email}>
      <StaffIdleTimeout />
      <StaffPortal email={session.user.email} />
    </StaffTwoStep>
  );
}

type Tab = "overview" | "programs" | "players" | "money" | "email" | "tools";
type Sub = "rosters" | "waitlist" | "finance" | "refunds" | "coupons" | "reports" | "staffTools" | "activity";
const TABS: { id: Tab; label: string; title: string }[] = [
  { id: "overview", label: "Dashboard", title: "Staff Dashboard" },
  { id: "programs", label: "Programs", title: "Program Manager" },
  { id: "players", label: "Rosters & Waitlists", title: "Rosters & Waitlists" },
  { id: "money", label: "Money & Reports", title: "Money & Reports" },
  { id: "email", label: "Email Families", title: "Email Families" },
  { id: "tools", label: "Staff Tools", title: "Staff Tools" },
];
const SUBS: Partial<Record<Tab, { id: Sub; label: string }[]>> = {
  players: [{ id: "rosters", label: "Rosters" }, { id: "waitlist", label: "Waitlists" }],
  money: [{ id: "finance", label: "Financials" }, { id: "refunds", label: "Refunds" }, { id: "coupons", label: "Coupons & Credit" }, { id: "reports", label: "Reports & Export" }],
  tools: [{ id: "staffTools", label: "Registrations, Seasons & Merging" }, { id: "activity", label: "Activity Log" }],
};
/** Old tab ids (used by Dashboard shortcuts) → new tab + section. */
const LEGACY: Record<string, [Tab, Sub?]> = {
  attendance: ["players", "rosters"], waitlist: ["players", "waitlist"],
  finance: ["money", "finance"], refunds: ["money", "refunds"], coupons: ["money", "coupons"], reports: ["money", "reports"],
  activity: ["tools", "activity"], tools: ["tools", "staffTools"], search: ["overview"], email: ["email"], programs: ["programs"], overview: ["overview"],
};

function StaffPortal({ email }: { email: string }) {
  const [tab, setTabState] = useState<Tab>("overview");
  const [sub, setSub] = useState<Partial<Record<Tab, Sub>>>({ players: "rosters", money: "finance", tools: "staffTools" });
  const go = (id: string) => {
    const [t, s] = LEGACY[id] ?? [id as Tab];
    setTabState(t);
    if (s) setSub((prev) => ({ ...prev, [t]: s }));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const setTab = (t: Tab) => setTabState(t);
  const pending = useQuery(api.registrationOps.listPendingRefunds, {});
  const pendingCount = pending?.length ?? 0;
  const bar = (
    <div className="-mx-4 mb-8 flex gap-1 overflow-x-auto border-b border-border px-4 print:hidden sm:mx-0 sm:flex-wrap sm:px-0">
      {TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => setTab(t.id)}
          className={`-mb-px inline-flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${tab === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          {t.label}
          {t.id === "money" && pendingCount > 0 && (
            <span className="rounded-full bg-warning px-2 py-0.5 text-xs font-bold text-warning-foreground">{pendingCount}</span>
          )}
        </button>
      ))}
      <Link to="/admin/faq" className="-mb-px ml-auto inline-flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-4 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground">
        Staff FAQ
      </Link>
    </div>
  );
  const title = TABS.find((t) => t.id === tab)?.title;
  if (tab === "programs") return <ProgramManager email={email} top={bar} />;
  const subs = SUBS[tab];
  const cur = sub[tab];
  return (
    <Shell title={title} top={bar}>
      {subs && (
        <div role="tablist" aria-label={`${title} sections`} className="mb-6 flex flex-wrap gap-2 print:hidden">
          {subs.map((s) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={cur === s.id}
              onClick={() => setSub((prev) => ({ ...prev, [tab]: s.id }))}
              className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors ${cur === s.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"}`}
            >
              {s.label}
              {s.id === "refunds" && pendingCount > 0 && (
                <span className="rounded-full bg-warning px-2 py-0.5 text-xs font-bold text-warning-foreground">{pendingCount}</span>
              )}
            </button>
          ))}
        </div>
      )}
      {tab === "overview" && (
        <div className="space-y-10">
          <section aria-label="Search families">
            <h2 className="mb-3 text-xl font-bold">Search Families</h2>
            <GlobalSearch />
          </section>
          <StaffDashboard onGo={go} />
        </div>
      )}
      {tab === "players" && cur === "rosters" && <RosterList />}
      {tab === "players" && cur === "waitlist" && <WaitlistAdmin />}
      {tab === "money" && cur === "finance" && <FinancialReport />}
      {tab === "money" && cur === "refunds" && <RefundQueue />}
      {tab === "money" && cur === "coupons" && <CouponsCredit />}
      {tab === "money" && cur === "reports" && <MoreReports />}
      {tab === "email" && <><ProgramEmail /><SentEmails /></>}
      {tab === "tools" && cur === "staffTools" && <StaffTools />}
      {tab === "tools" && cur === "activity" && <ActivityLog />}
    </Shell>
  );
}

function Shell({ children, title = "Program Manager", top }: { children: React.ReactNode; title?: string; top?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="display-condensed mb-6 text-4xl font-black italic md:text-5xl print:text-2xl">{title}</h1>
      {top}
      {children}
    </div>
  );
}

function StaffSignIn() {
  const token = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("invite") ?? "" : "";
  const invite = useQuery(api.siteAdmin.inviteByToken, token ? { token } : "skip");
  const accept = useMutation(api.siteAdmin.acceptInvite);
  const creating = !!token && !!invite && !invite.accepted;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (invite) { setEmail(invite.email); if (invite.name) setName(invite.name); }
  }, [invite]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (creating && password !== confirm) return setError("Passwords don't match");
    setLoading(true);
    const r = creating ? await signUpWithEmail(invite!.email, password, name) : await signInWithEmail(email, password);
    if (r.success && creating) await accept({ token }).catch(() => undefined);
    setLoading(false);
    if (!r.success) setError(r.error?.message ?? "Something went wrong");
  };
  if (token && invite === undefined) return <div className="mx-auto h-40 max-w-md animate-pulse rounded-2xl bg-muted" />;
  return (
    <form onSubmit={submit} className="mx-auto max-w-md space-y-4 rounded-2xl border border-border bg-card p-8">
      <h2 className="text-xl font-bold">{creating ? "Accept Your Staff Invite" : "Staff Sign In"}</h2>
      {token && invite === null && <p className="rounded-lg bg-destructive/10 px-3.5 py-2 text-sm text-destructive">This invite link isn't valid. Ask the Super Admin to resend your invite.</p>}
      {token && invite?.accepted && <p className="rounded-lg bg-muted px-3.5 py-2 text-sm text-muted-foreground">This invite has already been used. Sign in with your staff login below.</p>}
      {creating && <p className="text-sm text-muted-foreground">Create your staff login for <span className="font-semibold text-foreground">{invite!.email}</span>.</p>}
      {error && <p className="rounded-lg bg-destructive/10 px-3.5 py-2 text-sm text-destructive">{error}</p>}
      {creating && <label className={labelCls}>Full Name<input required value={name} onChange={(e) => setName(e.target.value)} className={`${inputCls} mt-1.5`} /></label>}
      {!creating && <label className={labelCls}>Email<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={`${inputCls} mt-1.5`} /></label>}
      <label className={labelCls}>Password<input required type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputCls} mt-1.5`} /></label>
      {creating && <label className={labelCls}>Confirm Password<input required type="password" minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} className={`${inputCls} mt-1.5`} /></label>}
      <button disabled={loading} className="w-full cursor-pointer rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
        {loading ? "Please wait..." : creating ? "Create Staff Login" : "Sign In"}
      </button>
      {!creating && <p className="text-center text-xs text-muted-foreground">Staff access is by invitation only. Use the unique link in your invite email to create your login.</p>}
    </form>
  );
}

function ProgramManager({ email, top }: { email: string; top?: React.ReactNode }) {
  const managed = useQuery(api.programAdmin.listManaged, {});
  const save = useMutation(api.programAdmin.saveProgram);
  const setPublished = useMutation(api.programAdmin.setPublished);
  const remove = useMutation(api.programAdmin.deleteProgram);
  const archive = useMutation(api.staffTools.archiveProgram);
  const [showArchived, setShowArchived] = useState(false);
  const [loc, setLoc] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<{ program: Program; published: boolean; isNew: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);

  const rows = useMemo<Row[]>(() => {
    const map = new Map<string, Row>(SEED_PROGRAMS.map((p) => [p.id, { program: p, published: false, managed: false }]));
    for (const m of managed ?? []) {
      const p = parseProgram(m.data);
      if (p) map.set(p.id, { program: p, published: m.published, managed: true, updatedBy: m.updatedBy, updatedAt: m.updatedAt, archived: !!m.archived });
    }
    return [...map.values()].sort((a, b) => byStartDesc(a.program, b.program) || programStart(a.program) - programStart(b.program));
  }, [managed]);

  const filtered = rows.filter(
    (r) => !!r.archived === showArchived && (loc === "all" || r.program.locationSlug === loc) && r.program.name.toLowerCase().includes(search.toLowerCase()),
  );

  const regs = useQuery(api.reports.allRegistrations, {});
  const catalog = useMemo(() => new Map(rows.map((r) => [r.program.id, r.program])), [rows]);
  const regCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of regs ?? []) if (r.status === "confirmed" || r.status === "refund_pending") m.set(r.programId, (m.get(r.programId) ?? 0) + 1);
    return m;
  }, [regs]);
  const anyRegCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of regs ?? []) m.set(r.programId, (m.get(r.programId) ?? 0) + 1);
    return m;
  }, [regs]);
  const paidRegs = (regs ?? []).filter((r) => r.status === "confirmed" || r.status === "refund_pending");
  const stats = {
    programs: rows.filter((r) => regState(r.program, r.published) === "live").length,
    enrolled: paidRegs.length,
    capacity: rows.reduce((s, r) => s + r.program.sessions.reduce((a, x) => a + x.capacity, 0), 0),
    capPct: 0,
    participants: new Set(paidRegs.map((r) => `${r.userId}|${r.childName.trim().toLowerCase()}`)).size,
    revenue: paidRegs.reduce((s, r) => s + netRevenue(r.amountCents / 100, catalog.get(r.programId)), 0),
  };

  stats.capPct = stats.capacity ? Math.round((stats.enrolled / stats.capacity) * 100) : 0;

  const onSave = async (program: Program, published: boolean) => {
    setSaving(true);
    try {
      await save({ data: JSON.stringify(program), published });
      toast.success(`${program.name} ${published ? "published" : "saved as draft"}`);
      setEditing(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save program");
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async (r: Row) => {
    try {
      if (!r.managed) await save({ data: JSON.stringify(r.program), published: !r.published });
      else await setPublished({ programId: r.program.id, published: !r.published });
      toast.success(`${r.program.name} ${r.published ? "hidden from families" : "published"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update");
    }
  };

  const onArchive = async (r: Row) => {
    if (!r.archived && !confirm(`Archive ${r.program.name}? It's hidden from families and this list, but rosters and financial history are kept.`)) return;
    try {
      await archive({ programId: r.program.id, archived: !r.archived, data: r.managed ? undefined : JSON.stringify(r.program) });
      toast.success(`${r.program.name} ${r.archived ? "restored" : "archived"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not archive");
    }
  };

  const onDuplicate = (r: Row) => {
    const src = r.program;
    const copy: Program = {
      ...structuredClone(src),
      id: uid("prog"),
      name: `${src.name} (Copy)`,
      sessions: src.sessions.map((s) => ({ ...s, id: uid("s"), enrolled: 0, price: sessionPrice(src, s) })),
      outDates: (src.outDates ?? []).map((o) => ({ ...o, id: uid("out") })),
    };
    setEditing({ program: copy, published: false, isNew: true });
    toast(`Editing a copy of ${src.name} — save to create it`);
  };

  const onDelete = async (r: Row): Promise<boolean> => {
    const isSeed = SEED_PROGRAMS.some((p) => p.id === r.program.id);
    const count = anyRegCount.get(r.program.id) ?? 0;
    if (regs === undefined) { toast.error("Still checking registrations — try again in a moment"); return false; }
    if (count > 0) { toast.error(`${r.program.name} has ${count} registration${count === 1 ? "" : "s"} and can't be deleted. Unpublish it instead.`); return false; }
    if (!confirm(isSeed ? `Reset ${r.program.name} to its original setup?` : `Delete ${r.program.name}? This program has no registrations. This can't be undone.`)) return false;
    if (!isSeed && !confirm(`Are you sure? "${r.program.name}" will be permanently deleted.`)) return false;
    try {
      await remove({ programId: r.program.id });
      toast(isSeed ? `${r.program.name} reset` : `${r.program.name} deleted`);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete");
      return false;
    }
  };

  const viewingProgram = viewing ? catalog.get(viewing) : undefined;
  if (viewingProgram && !editing)
    return (
      <Shell top={top}>
        <ProgramDetail program={viewingProgram} catalog={catalog} onBack={() => setViewing(null)} />
      </Shell>
    );

  const delBlocked = (id: string) => regs === undefined || (anyRegCount.get(id) ?? 0) > 0;
  const delTitle = (id: string) => ((anyRegCount.get(id) ?? 0) > 0 ? "Has registrations — can't be deleted" : undefined);

  if (editing)
    return (
      <Shell>
        <ProgramEditor
          initial={editing.program}
          initialPublished={editing.published}
          isNew={editing.isNew}
          saving={saving}
          onCancel={() => setEditing(null)}
          onSave={onSave}
          deleteInfo={(() => {
            const row = rows.find((x) => x.program.id === editing.program.id);
            if (editing.isNew || !row?.managed) return undefined;
            return {
              isSeed: SEED_PROGRAMS.some((x) => x.id === row.program.id),
              blocked: delBlocked(row.program.id),
              count: anyRegCount.get(row.program.id) ?? 0,
              onDelete: async () => { if (await onDelete(row)) setEditing(null); },
            };
          })()}
        />
      </Shell>
    );

  return (
    <Shell top={top}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex w-full justify-end gap-2">
          <button onClick={() => setEditing({ program: blankProgram(), published: false, isNew: true })} className="w-full cursor-pointer rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 sm:w-auto">
            + New Program
          </button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {([
          ["Live Programs", String(stats.programs), "Open for registration"],
          ["Capacity Filled", regs === undefined ? "…" : `${stats.capPct}%`, `${stats.enrolled} of ${stats.capacity} spots`],
          ["Total Participants", regs === undefined ? "…" : String(stats.participants), "Kids registered"],
          ["Total Revenue", regs === undefined ? "…" : formatPrice(stats.revenue), "Net of 13% HST & 4% fees"],
        ] as const).map(([k, v, sub]) => (
          <div key={k} className="rounded-2xl border border-border bg-card p-4 sm:p-5">
            <p className="text-xs text-muted-foreground">{k}</p>
            <p className="mt-1 truncate text-2xl font-bold">{v}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {["all", ...LOCATIONS.map((l) => l.slug)].map((s) => (
          <button key={s} onClick={() => setLoc(s)} className={`cursor-pointer whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors ${loc === s ? "bg-primary text-primary-foreground" : "border border-border hover:bg-accent"}`}>
            {s === "all" ? "All Locations" : LOCATIONS.find((l) => l.slug === s)?.name}
          </button>
        ))}
        <button onClick={() => setShowArchived((s) => !s)} aria-pressed={showArchived} className={`cursor-pointer whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors ${showArchived ? "bg-secondary text-secondary-foreground" : "border border-border hover:bg-accent"}`}>{showArchived ? "Showing Archived" : "Archived"}</button>
        <input placeholder="Search programs" value={search} onChange={(e) => setSearch(e.target.value)} className={`${inputCls} w-full sm:ml-auto sm:max-w-xs`} />
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-card">
        {managed === undefined ? (
          <div className="space-y-2 p-6">{[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm text-muted-foreground">No programs match that filter.</p>
            <button onClick={() => setEditing({ program: blankProgram(), published: false, isNew: true })} className="mt-4 cursor-pointer rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">Create a Program</button>
          </div>
        ) : (
          <>
          <div className="divide-y divide-border md:hidden">
            {filtered.map((r) => {
              const p = r.program;
              const cap = p.sessions.reduce((a, s) => a + s.capacity, 0);
              const enr = regCount.get(p.id) ?? 0;
              return (
                <div key={p.id} className="space-y-3 p-4">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <button onClick={() => setViewing(p.id)} className="cursor-pointer text-left font-semibold leading-tight text-primary hover:underline">{p.name || "Untitled Program"}</button>
                      <p className="mt-0.5 text-xs text-muted-foreground">{p.venue} · {p.category} · {p.season}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{cap ? Math.round((enr / cap) * 100) : 0}% full ({enr}/{cap}) · from {formatPrice(fromPrice(p))}</p>
                    </div>
                    <StatusPill state={regState(p, r.published)} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setEditing({ program: structuredClone(p), published: r.published, isNew: false })} className="h-10 cursor-pointer rounded-lg border border-border text-sm font-semibold hover:bg-accent">Edit</button>
                    <button onClick={() => onDuplicate(r)} className="h-10 cursor-pointer rounded-lg border border-border text-sm font-semibold hover:bg-accent">Duplicate</button>
                    <button onClick={() => void togglePublish(r)} className="h-10 cursor-pointer rounded-lg border border-border text-sm font-semibold hover:bg-accent">{r.published ? "Unpublish" : "Publish"}</button>
                    <button onClick={() => void onArchive(r)} className="h-10 cursor-pointer rounded-lg border border-border text-sm font-semibold hover:bg-accent">{r.archived ? "Restore" : "Archive"}</button>
                    {r.managed && <button onClick={() => { void onDelete(r); }} disabled={delBlocked(p.id)} title={delTitle(p.id)} className="h-10 cursor-pointer rounded-lg border border-border text-sm font-semibold text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-40">{SEED_PROGRAMS.some((s) => s.id === p.id) ? "Reset" : "Delete"}</button>}
                  </div>
                </div>
              );
            })}
          </div>
          <table className="hidden w-full min-w-[760px] text-sm md:table">
            <thead className="border-b border-border text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Program</th>
                <th className="px-5 py-3">Location</th>
                <th className="px-5 py-3">Capacity</th>
                <th className="px-5 py-3">From</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r) => {
                const p = r.program;
                const cap = p.sessions.reduce((a, s) => a + s.capacity, 0);
                const enr = regCount.get(p.id) ?? 0;
                const pct = cap ? Math.round((enr / cap) * 100) : 0;
                return (
                  <tr key={p.id} className="hover:bg-muted/40">
                    <td className="px-5 py-3.5">
                      <button onClick={() => setViewing(p.id)} className="cursor-pointer text-left font-semibold text-primary hover:underline">{p.name || "Untitled Program"}</button>
                      <p className="text-xs text-muted-foreground">{p.category} · {p.season} · {eligibilityLabel(p)}</p>
                    </td>
                    <td className="px-5 py-3.5">{p.venue}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div>
                        <span className="text-xs text-muted-foreground">{pct}% · {enr}/{cap}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 font-semibold">{formatPrice(fromPrice(p))}</td>
                    <td className="px-5 py-3.5">
                      <StatusPill state={regState(p, r.published)} />
                      {p.regOpens && regState(p, r.published) === "draft" && r.published && <p className="mt-1 text-xs text-muted-foreground">Opens {formatDateTime(p.regOpens)}</p>}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => setEditing({ program: structuredClone(p), published: r.published, isNew: false })} className="cursor-pointer rounded-md px-2.5 py-1.5 text-xs font-semibold hover:bg-accent">Edit</button>
                        <button onClick={() => onDuplicate(r)} className="cursor-pointer rounded-md px-2.5 py-1.5 text-xs font-semibold hover:bg-accent">Duplicate</button>
                        <button onClick={() => void togglePublish(r)} className="cursor-pointer rounded-md px-2.5 py-1.5 text-xs font-semibold hover:bg-accent">{r.published ? "Unpublish" : "Publish"}</button>
                        <button onClick={() => void onArchive(r)} className="cursor-pointer rounded-md px-2.5 py-1.5 text-xs font-semibold hover:bg-accent">{r.archived ? "Restore" : "Archive"}</button>
                        {r.managed && <button onClick={() => { void onDelete(r); }} disabled={delBlocked(p.id)} title={delTitle(p.id)} className="cursor-pointer rounded-md px-2.5 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-40">{SEED_PROGRAMS.some((s) => s.id === p.id) ? "Reset" : "Delete"}</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </>
        )}
      </div>
    </Shell>
  );
}

function StatusPill({ state }: { state: RegState }) {
  const cls = state === "live" ? "bg-success text-success-foreground" : state === "draft" ? "bg-warning text-warning-foreground" : "bg-destructive text-white";
  return <span className={`inline-flex shrink-0 items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-bold ${cls}`}>{state === "live" ? "Live" : state === "draft" ? "Draft" : "Closed"}</span>;
}

function ImageEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const genUrl = useMutation(api.programAdmin.generateImageUploadUrl);
  const resolve = useMutation(api.programAdmin.resolveImageUrl);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const upload = async (raw: File) => {
    if (!raw.type.startsWith("image/")) return toast.error("Choose an image file");
    const file = await compressImage(raw);
    if (file.size > 8 * 1024 * 1024) return toast.error("Images must be under 8 MB");
    setBusy(true);
    try {
      const postUrl = await genUrl({});
      const res = await fetch(postUrl, { method: "POST", headers: { "Content-Type": file.type }, body: file });
      if (!res.ok) throw new Error("Upload failed");
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      onChange(await resolve({ storageId }));
      toast.success("Photo uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3 md:col-span-2">
      <p className={labelCls}>Program Photo</p>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden rounded-xl border border-border bg-muted sm:w-56">
          {value ? <img src={value} alt="Program" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No photo</div>}
          {busy && <div className="absolute inset-0 flex items-center justify-center bg-background/70 text-sm font-semibold">Uploading…</div>}
        </div>
        <div className="flex-1 space-y-3">
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex h-10 cursor-pointer items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              {value ? "Replace Photo" : "Upload Photo"}
              <input type="file" accept="image/*" className="hidden" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
            </label>
            {value && <button type="button" onClick={() => onChange("")} className="h-10 cursor-pointer rounded-full border border-border px-5 text-sm font-semibold text-destructive hover:bg-destructive/10">Remove Photo</button>}
          </div>
          <div className="flex gap-2">
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="…or paste an image URL" className={inputCls} />
            <button type="button" onClick={() => { if (url.trim()) { onChange(url.trim()); setUrl(""); } }} className="h-10 shrink-0 cursor-pointer rounded-lg border border-border px-4 text-sm font-semibold hover:bg-accent">Use</button>
          </div>
          <div>
            <p className="mb-1.5 text-xs text-muted-foreground">Or pick a stock photo</p>
            <div className="flex flex-wrap gap-2">
              {SITE.stockPhotos.length === 0 && <p className="text-xs text-muted-foreground">No stock photos — add some in Settings → Hub Site.</p>}
              {SITE.stockPhotos.map((src) => (
                <button type="button" key={src} onClick={() => onChange(src)} className={`h-12 w-16 cursor-pointer overflow-hidden rounded-lg border-2 ${value === src ? "border-primary" : "border-transparent"}`}>
                  <img src={src} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProgramEditor({
  initial,
  initialPublished,
  isNew,
  saving,
  onCancel,
  onSave,
  deleteInfo,
}: {
  deleteInfo?: { isSeed: boolean; blocked: boolean; count: number; onDelete: () => Promise<void> };
  initial: Program;
  initialPublished: boolean;
  isNew: boolean;
  saving: boolean;
  onCancel: () => void;
  onSave: (p: Program, published: boolean) => void;
}) {
  const [p, setP] = useState<Program>(() => ({
    ...initial,
    sessions: initial.sessions.map((s) => ({ ...s, price: sessionPrice(initial, s), location: s.location ?? initial.venue })),
    outDates: initial.outDates ?? [],
    discounts: initial.discounts ?? [],
    questions: initial.questions ?? [],
  }));
  const location = LOCATIONS.find((l) => l.slug === p.locationSlug);
  const venueOptions = [...new Set([...(location?.venues ?? []), ...(p.venue?.trim() ? [p.venue.trim()] : [])])];
  const set = <K extends keyof Program>(k: K, val: Program[K]) => setP((prev) => ({ ...prev, [k]: val }));
  const [startJson] = useState(() => JSON.stringify(p));
  const dirty = JSON.stringify(p) !== startJson;
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);
  const cancel = () => { if (!dirty || window.confirm("You have unsaved changes to this program. Leave without saving?")) onCancel(); };

  const updSession = (i: number, patch: Partial<Session>) => set("sessions", p.sessions.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const duplicateSession = (i: number) => {
    const s = p.sessions[i];
    const copy = { ...s, id: uid("s"), label: `${s.label} (Copy)`, enrolled: 0, slots: s.slots?.map((t) => ({ ...t, id: uid("t"), enrolled: 0 })) };
    set("sessions", [...p.sessions.slice(0, i + 1), copy, ...p.sessions.slice(i + 1)]);
  };
  const moveSession = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= p.sessions.length) return;
    const next = [...p.sessions];
    [next[i], next[j]] = [next[j], next[i]];
    set("sessions", next);
  };
  const outDates = p.outDates ?? [];
  const updOut = (i: number, patch: Partial<{ date: string; note: string }>) => set("outDates", outDates.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  const updAddOn = (i: number, patch: Partial<AddOn>) => set("addOns", p.addOns.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const questions = p.questions ?? [];
  const updQ = (i: number, patch: Partial<CustomQuestion>) => set("questions", questions.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const discounts = p.discounts ?? [];
  const updDisc = (i: number, patch: Partial<Discount>) => set("discounts", discounts.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const addDisc = (kind: Discount["kind"]) => set("discounts", [...discounts, { id: uid("disc"), label: kind === "earlybird" ? "Early-Bird" : "", kind, mode: kind === "earlybird" ? "percent" : "amount", value: kind === "earlybird" ? 10 : 0, deadline: kind === "earlybird" ? "" : undefined }]);

  const submit = (published: boolean) => {
    if (!p.name.trim()) return toast.error("Give the program a name");
    if (p.sessions.length === 0) return toast.error("Add at least one session");
    if (p.sessions.some((s) => !(Number(s.price) > 0) && s.price !== 0)) return toast.error("Set a price for every session");
    if (outDates.some((o) => !o.date)) return toast.error("Pick a date for every out date (or remove it)");
    if (questions.some((q) => !q.label.trim())) return toast.error("Write every participant question (or remove it)");
    if (discounts.some((d) => d.kind === "alternative" && !d.label.trim())) return toast.error("Name every alternative pricing option");
    if (discounts.some((d) => d.kind === "earlybird" && !d.deadline)) return toast.error("Pick a deadline for every early-bird discount");
    if (discounts.some((d) => d.mode === "percent" && d.value > 100)) return toast.error("Percent discounts can't exceed 100%");
    { const [a, b] = p.birthYears ?? birthYearsOf(p); if (!a || !b || a > b) return toast.error("Birth Year From must be the same as or before Birth Year To"); }
    if (p.regOpens && p.regCloses && p.regOpens >= p.regCloses) return toast.error("Registration must open before it closes");
    const first = p.sessions[0];
    const options = p.options.length ? p.options.map((o, i) => (i === 0 ? { ...o, price: first.price ?? o.price } : o)) : [{ id: "std", label: "Registration", detail: "", price: first.price ?? 0 }];
    const fixed = { ...p, birthYears: birthYearsOf(p), ageAsOfMode: p.ageAsOfMode ?? "start" } as Program;
    onSave({ ...fixed, ages: agesFor(fixed), ageAsOf: ageAsOfDate(fixed), options, outDates: [...outDates].sort((a, b) => a.date.localeCompare(b.date)) }, published);
  };

  const num = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const section = "space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-6";
  const removeBtn = "h-10 shrink-0 cursor-pointer rounded-lg px-3 text-xs font-semibold text-destructive hover:bg-destructive/10";

  return (
    <div className="space-y-6">
      <div className="sticky top-16 z-30 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:px-4">
        <button onClick={cancel} className="cursor-pointer text-sm font-semibold text-muted-foreground hover:text-foreground">← All Programs{dirty && <span className="ml-2 rounded-full bg-warning px-2 py-0.5 text-xs font-bold text-warning-foreground">Unsaved Changes</span>}</button>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => { localStorage.setItem("top_preview_program", JSON.stringify(p)); window.open(`/programs/${p.id}?preview=1`, "_blank"); }} className="cursor-pointer rounded-full border border-border px-5 py-2.5 text-sm font-semibold hover:bg-accent">Preview</button>
          <button type="button" title={`${typeof window !== "undefined" ? window.location.origin : ""}/programs/${p.id}`} onClick={() => { const url = `${window.location.origin}/programs/${p.id}`; void navigator.clipboard.writeText(url).then(() => toast.success(initialPublished && !isNew ? "Public link copied" : "Link copied. It works for families once the program is published.")).catch(() => toast.error("Could not copy the link")); }} className="cursor-pointer rounded-full border border-border px-5 py-2.5 text-sm font-semibold hover:bg-accent">Copy Link</button>
          <button disabled={saving} onClick={() => submit(false)} className="cursor-pointer rounded-full border border-border px-5 py-2.5 text-sm font-semibold hover:bg-accent disabled:opacity-60">Save Draft</button>
          <button disabled={saving} onClick={() => submit(true)} className="cursor-pointer rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
            {saving ? "Saving..." : initialPublished || isNew ? "Save & Publish" : "Publish"}
          </button>
        </div>
      </div>


      <section className={section}>
        <h2 className="text-xl font-bold">{isNew ? "New Program" : `Edit ${initial.name}`}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <label className={labelCls}>Program Name<input value={p.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Summer Hockey Camp" className={`${inputCls} mt-1.5`} /></label>
          <label className={labelCls}>Season<input value={p.season} onChange={(e) => set("season", e.target.value)} className={`${inputCls} mt-1.5`} /></label>
          <label className={labelCls}>Location
            <select value={p.locationSlug} onChange={(e) => { const l = LOCATIONS.find((x) => x.slug === e.target.value); setP({ ...p, locationSlug: e.target.value, venue: l?.venues[0] ?? p.venue }); }} className={`${inputCls} mt-1.5`}>
              {LOCATIONS.map((l) => <option key={l.slug} value={l.slug}>{l.name}</option>)}
            </select>
          </label>
          <label className={labelCls}>Venue
            <select value={p.venue} onChange={(e) => set("venue", e.target.value)} className={`${inputCls} mt-1.5`}>
              {venueOptions.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
            <span className="mt-1 block font-normal">{venueAddress(p.locationSlug, p.venue) ? venueAddress(p.locationSlug, p.venue) : "No address yet."} Manage venues and addresses in Settings → Locations.</span>
          </label>
          <label className={labelCls}>Sport
            <select value={p.category} onChange={(e) => set("category", e.target.value as ProgramCategory)} className={`${inputCls} mt-1.5`}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <TagEditor tags={p.tags ?? (p.badge ? [p.badge] : [])} onChange={(tags) => setP({ ...p, tags, badge: undefined })} />
          <div className="space-y-1.5">
            <div className="grid grid-cols-3 gap-3">
              <label className={labelCls}>Birth Year From<input type="number" min={1990} max={2040} value={birthYearsOf(p)[0]} onChange={(e) => set("birthYears", [num(e.target.value), birthYearsOf(p)[1]])} className={`${inputCls} mt-1.5`} /></label>
              <label className={labelCls}>Birth Year To<input type="number" min={1990} max={2040} value={birthYearsOf(p)[1]} onChange={(e) => set("birthYears", [birthYearsOf(p)[0], num(e.target.value)])} className={`${inputCls} mt-1.5`} /></label>
              <label className={labelCls}>Age As Of
                <select value={p.ageAsOfMode ?? "start"} onChange={(e) => set("ageAsOfMode", e.target.value as "start" | "year")} className={`${inputCls} mt-1.5`}>
                  <option value="start">Program Start Date</option>
                  <option value="year">This Calendar Year</option>
                </select>
              </label>
            </div>
            <p className="text-xs text-muted-foreground">Children born {birthYearsOf(p)[0]}–{birthYearsOf(p)[1]} can register (about ages {agesFor(p)[0]}–{agesFor(p)[1]} as of {formatDateTime(`${ageAsOfDate(p)}T12:00`).split(",").slice(0, 2).join(",")}).</p>
          </div>
          <label className="flex items-center gap-3 self-end rounded-lg border border-border px-3.5 py-2.5 text-sm">
            <input type="checkbox" checked={p.taxable} onChange={(e) => set("taxable", e.target.checked)} className="h-4 w-4 accent-primary" />
            Charge 13% HST on registration fee
          </label>
          <label className="flex items-center gap-3 rounded-lg border border-border px-3.5 py-2.5 text-sm md:col-span-2">
            <input type="checkbox" checked={p.remindersEnabled !== false} onChange={(e) => set("remindersEnabled", e.target.checked)} className="h-4 w-4 accent-primary" />
            <span>Send Welcome / Reminder Email Before Program Starts <span className="block text-xs text-muted-foreground">Families get an email before their session starts with venue, times and out dates.</span></span>
          </label>
          {p.remindersEnabled !== false && (
            <div className="grid gap-3 rounded-xl border border-border bg-muted/40 p-4 md:col-span-2 md:grid-cols-4">
              <p className="text-sm font-bold md:col-span-4">Welcome Email <span className="block text-xs font-normal text-muted-foreground">Leave a field blank to use the default. You can use {"{child}"}, {"{parent}"}, {"{program}"}, {"{session}"}, {"{startDate}"} and {"{venue}"} — they're filled in for each family. Blank lines start new paragraphs.</span></p>
              <label className={`${labelCls} md:col-span-3`}>Subject<input value={p.reminderEmail?.subject ?? ""} placeholder="Reminder: {program} Starts {startDate}" onChange={(e) => set("reminderEmail", { ...p.reminderEmail, subject: e.target.value })} className={`${inputCls} mt-1.5`} /></label>
              <label className={labelCls}>Send (Days Before)<input type="number" min={1} max={30} value={p.reminderEmail?.daysBefore ?? 3} onChange={(e) => set("reminderEmail", { ...p.reminderEmail, daysBefore: Number(e.target.value) || 3 })} className={`${inputCls} mt-1.5`} /></label>
              <label className={`${labelCls} md:col-span-4`}>Message<textarea rows={5} value={p.reminderEmail?.message ?? ""} placeholder={"Hi {parent}, {child} starts {program} on {startDate}!\n\nDrop-off is at the main doors from 8:30am. Parking is available in the north lot."} onChange={(e) => set("reminderEmail", { ...p.reminderEmail, message: e.target.value })} className="mt-1.5 w-full rounded-lg border border-input bg-card px-3.5 py-2.5 text-sm font-normal text-foreground outline-none focus:ring-2 focus:ring-ring" /></label>
              <label className={`${labelCls} md:col-span-4`}>What to Bring<input value={p.reminderEmail?.whatToBring ?? ""} placeholder="Water bottle, weather-appropriate clothing, required equipment, nut-free lunch & snacks" onChange={(e) => set("reminderEmail", { ...p.reminderEmail, whatToBring: e.target.value })} className={`${inputCls} mt-1.5`} /></label>
            </div>
          )}
          <div className="space-y-2 md:col-span-2">
            <p className={labelCls}>Required Waivers & Policies <span className="font-normal">(edit the wording in Settings → Waivers & Policies)</span></p>
            <div className="grid gap-2 sm:grid-cols-2">
              {WAIVERS.map((w) => {
                const ids = p.waivers ?? DEFAULT_WAIVERS;
                const on = ids.includes(w.id);
                return (
                  <label key={w.id} className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3.5 py-2.5 text-sm ${on ? "border-primary bg-accent" : "border-border"}`}>
                    <input type="checkbox" checked={on} onChange={() => set("waivers", on ? ids.filter((x) => x !== w.id) : [...ids, w.id])} className="mt-0.5 h-4 w-4 accent-primary" />
                    <span className="font-semibold">{w.title}</span>
                  </label>
                );
              })}
            </div>
          </div>
          <label className={`${labelCls} md:col-span-2`}>Description
            <textarea rows={3} value={p.description} onChange={(e) => set("description", e.target.value)} className="mt-1.5 w-full rounded-lg border border-input bg-card px-3.5 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <ImageEditor value={p.image} onChange={(v) => set("image", v)} />
          <div className="grid gap-3 sm:grid-cols-2 md:col-span-2">
            <label className={labelCls}>Registration Opens<input type="datetime-local" value={p.regOpens ?? ""} onChange={(e) => set("regOpens", e.target.value)} className={`${inputCls} mt-1.5`} /></label>
            <label className={labelCls}>Registration Closes<input type="datetime-local" value={p.regCloses ?? ""} onChange={(e) => set("regCloses", e.target.value)} className={`${inputCls} mt-1.5`} /></label>
            <p className="text-xs text-muted-foreground sm:col-span-2">Before the open date the program shows as <span className="font-semibold">Draft</span>; after the close date it shows as <span className="font-semibold">Closed</span> and families can't add it to their cart.</p>
          </div>
        </div>
      </section>

      <section className={section}>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Sessions</h2>
          <button onClick={() => { const last = p.sessions[p.sessions.length - 1]; set("sessions", [...p.sessions, { id: uid("s"), label: `Week ${p.sessions.length + 1}`, dates: "", days: last?.days ?? "Mon – Fri", time: last?.time ?? "9:00am – 4:00pm", capacity: last?.capacity ?? 40, enrolled: 0, price: last?.price ?? 0, location: last?.location ?? p.venue }]); }} className="cursor-pointer rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-accent">+ Add Session</button>
        </div>
        {p.sessions.length > 1 && <BulkSessionEdit onApply={(patch) => set("sessions", p.sessions.map((s) => ({ ...s, ...patch })))} />}
        {p.sessions.length === 0 && <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No sessions yet — add one so families can register.</p>}
        {p.sessions.map((s, i) => (
          <div key={s.id} className="grid items-end gap-3 rounded-xl bg-muted/50 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-center justify-between gap-2 sm:col-span-2 lg:col-span-4">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Session {i + 1}</span>
              <div className="flex gap-1">
                <button type="button" onClick={() => moveSession(i, -1)} disabled={i === 0} aria-label="Move session up" className="h-8 cursor-pointer rounded-lg border border-border bg-card px-3 text-xs font-semibold hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40">↑ Up</button>
                <button type="button" onClick={() => moveSession(i, 1)} disabled={i === p.sessions.length - 1} aria-label="Move session down" className="h-8 cursor-pointer rounded-lg border border-border bg-card px-3 text-xs font-semibold hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40">↓ Down</button>
                <button type="button" onClick={() => duplicateSession(i)} aria-label="Duplicate session" className="h-8 cursor-pointer rounded-lg border border-border bg-card px-3 text-xs font-semibold hover:bg-accent">Duplicate</button>
              </div>
            </div>
            <label className={`${labelCls} sm:col-span-2`}>Session Name<input value={s.label} placeholder="e.g. Week 1, Saturday AM, U11" onChange={(e) => updSession(i, { label: e.target.value })} className={`${inputCls} mt-1.5`} /><span className="mt-1 block font-normal">Shown to families exactly as typed. Include the program name here if you want it.</span></label>
            <label className={labelCls}>Dates<input value={s.dates} placeholder="Jul 5 – Jul 9" onChange={(e) => updSession(i, { dates: e.target.value })} className={`${inputCls} mt-1.5`} />{weekdayIssue(p.season, s.dates, s.days) && <span role="alert" className="mt-1 block font-semibold text-destructive">{weekdayIssue(p.season, s.dates, s.days)}</span>}</label>
            <label className={labelCls}>Days<input value={s.days} onChange={(e) => updSession(i, { days: e.target.value })} className={`${inputCls} mt-1.5`} /></label>
            <label className={labelCls}>Time<input value={s.time} onChange={(e) => updSession(i, { time: e.target.value })} className={`${inputCls} mt-1.5`} /></label>
            <label className={labelCls}>Capacity<input type="number" min={s.enrolled} value={s.capacity} onChange={(e) => updSession(i, { capacity: Math.max(0, num(e.target.value)) })} className={`${inputCls} mt-1.5`} /></label>
            <label className={labelCls}>Price (CAD)<input type="number" min={0} step="0.01" value={s.price ?? 0} onChange={(e) => updSession(i, { price: Math.max(0, num(e.target.value)) })} className={`${inputCls} mt-1.5`} /></label>
            <label className={labelCls}>Location
              <select value={s.location?.trim() || p.venue} onChange={(e) => updSession(i, { location: e.target.value })} className={`${inputCls} mt-1.5`}>
                {[...new Set([...venueOptions, ...(s.location?.trim() ? [s.location.trim()] : [])])].map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <SessionOptionsEditor session={s} venues={venueOptions} onChange={(patch) => updSession(i, patch)} />
            <button onClick={() => set("sessions", p.sessions.filter((_, j) => j !== i))} disabled={s.enrolled > 0} title={s.enrolled > 0 ? "Has enrolled children" : "Remove"} className={`${removeBtn} disabled:cursor-not-allowed disabled:opacity-40`}>Remove</button>
            {s.enrolled > 0 && <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">{s.enrolled} enrolled · capacity can't go below that and the session can't be removed.</p>}
          </div>
        ))}
      </section>

      <section className={section}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Out Dates</h2>
            <p className="text-xs text-muted-foreground">Days with no program — holidays, facility closures. Shown to families when they register.</p>
          </div>
          <button onClick={() => set("outDates", [...outDates, { id: uid("out"), date: "", note: "" }])} className="cursor-pointer rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-accent">+ Add Out Date</button>
        </div>
        {outDates.length === 0 && <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No out dates — the program runs every scheduled day.</p>}
        {outDates.map((o, i) => (
          <div key={o.id} className="grid items-end gap-3 rounded-xl bg-muted/50 p-4 sm:grid-cols-[0.8fr_1.6fr_auto]">
            <label className={labelCls}>Date<input type="date" value={o.date} onChange={(e) => updOut(i, { date: e.target.value })} className={`${inputCls} mt-1.5`} /></label>
            <label className={labelCls}>Reason<input value={o.note} placeholder="e.g. Civic Holiday — no camp" onChange={(e) => updOut(i, { note: e.target.value })} className={`${inputCls} mt-1.5`} /></label>
            <button onClick={() => set("outDates", outDates.filter((_, j) => j !== i))} className={removeBtn}>Remove</button>
          </div>
        ))}
      </section>

      <section className={section}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Participant Questions</h2>
            <p className="text-xs text-muted-foreground">Extra questions asked for each child under Participant Details on this program's form. Answers appear on rosters.</p>
          </div>
          <button onClick={() => set("questions", [...questions, { id: uid("q"), label: "", type: "text", required: false }])} className="cursor-pointer rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-accent">+ Add Question</button>
        </div>
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border bg-muted/50 p-4 text-sm">
          <span><span className="font-semibold">Jersey / Uniform Size</span><span className="block text-xs text-muted-foreground">Required dropdown (Youth XS – Adult L) asked for each child. Shown on rosters.</span></span>
          <input type="checkbox" checked={asksJersey(p)} onChange={(e) => set("askJerseySize", e.target.checked)} className="h-5 w-5 shrink-0 accent-primary" />
        </label>
        {questions.length === 0 && <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No extra questions — families see the standard participant details only.</p>}
        {questions.map((q, i) => (
          <div key={q.id} className="grid items-end gap-3 rounded-xl bg-muted/50 p-4 sm:grid-cols-[1.8fr_0.8fr_auto_auto]">
            <label className={labelCls}>Question<input value={q.label} placeholder="e.g. Shooting Hand (Left / Right)" onChange={(e) => updQ(i, { label: e.target.value })} className={`${inputCls} mt-1.5`} /></label>
            <label className={labelCls}>Answer Type
              <select value={q.type} onChange={(e) => updQ(i, { type: e.target.value as CustomQuestion["type"] })} className={`${inputCls} mt-1.5`}>
                <option value="text">Short Answer</option>
                <option value="yesno">Yes / No</option>
              </select>
            </label>
            <label className="flex h-10 items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={q.required} onChange={(e) => updQ(i, { required: e.target.checked })} className="h-4 w-4 accent-primary" />Required</label>
            <button onClick={() => set("questions", questions.filter((_, j) => j !== i))} className={removeBtn}>Remove</button>
          </div>
        ))}
      </section>

      <section className={section}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Discounts & Alternative Pricing</h2>
            <p className="text-xs text-muted-foreground">Alternative pricing (goalie, pro-rated, sibling) is chosen per child at registration. Early-bird applies automatically until its deadline.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => addDisc("alternative")} className="cursor-pointer rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-accent">+ Alternative Pricing</button>
            <button onClick={() => addDisc("earlybird")} className="cursor-pointer rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-accent">+ Early-Bird</button>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {([
            ["sibling", "Multi-Sibling Discount", "$50 off each additional child registered in this program."],
            ["multiWeek", "Multi-Week Discount", "$50 off each additional session the same child takes in this program."],
          ] as const).map(([k, title, body]) => {
            const on = !!p.incentives?.[k];
            return (
              <label key={k} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-sm ${on ? "border-primary bg-accent" : "border-border"}`}>
                <input type="checkbox" checked={on} onChange={(e) => set("incentives", { ...(p.incentives ?? {}), [k]: e.target.checked })} className="mt-0.5 h-4 w-4 accent-primary" />
                <span><span className="font-semibold">{title}</span><span className="block text-xs text-muted-foreground">{body} Applies to this program only, automatically at checkout.</span></span>
              </label>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">Need another incentive (e.g. returning player, goalie)? Add it as Alternative Pricing below and set it to $50 off.</p>
        {discounts.length === 0 && <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No alternative pricing or early-bird — families pay the session price.</p>}
        {discounts.map((d, i) => (
          <div key={d.id} className="grid items-end gap-3 rounded-xl bg-muted/50 p-4 sm:grid-cols-2 lg:grid-cols-[auto_1.4fr_0.8fr_0.7fr_1fr_auto]">
            <span className={`h-fit self-center rounded-full px-2.5 py-1 text-xs font-bold ${d.kind === "earlybird" ? "bg-success text-success-foreground" : "bg-secondary text-secondary-foreground"}`}>{d.kind === "earlybird" ? "Early-Bird" : "Alternative"}</span>
            <label className={labelCls}>Label<input value={d.label} placeholder={d.kind === "earlybird" ? "Early-Bird" : "e.g. Goalie Rate, Pro-Rated (Joining Late)"} onChange={(e) => updDisc(i, { label: e.target.value })} className={`${inputCls} mt-1.5`} /></label>
            <label className={labelCls}>Type
              <select value={d.mode} onChange={(e) => updDisc(i, { mode: e.target.value as Discount["mode"] })} className={`${inputCls} mt-1.5`}>
                <option value="amount">$ Off</option>
                <option value="percent">% Off</option>
              </select>
            </label>
            <label className={labelCls}>{d.mode === "percent" ? "Percent" : "Amount (CAD)"}<input type="number" min={0} step="0.01" value={d.value} onChange={(e) => updDisc(i, { value: Math.max(0, num(e.target.value)) })} className={`${inputCls} mt-1.5`} /></label>
            {d.kind === "earlybird" ? (
              <label className={labelCls}>Register By<input type="date" value={d.deadline ?? ""} onChange={(e) => updDisc(i, { deadline: e.target.value })} className={`${inputCls} mt-1.5`} /></label>
            ) : <span className="hidden lg:block" />}
            <button onClick={() => set("discounts", discounts.filter((_, j) => j !== i))} className={removeBtn}>Remove</button>
          </div>
        ))}
      </section>

      <section className={section}>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Add-Ons</h2>
          <button onClick={() => set("addOns", [...p.addOns, { id: uid("ao"), name: "", description: "", price: 0, taxable: true }])} className="cursor-pointer rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-accent">+ Add Add-On</button>
        </div>
        {p.addOns.length === 0 && <p className="text-sm text-muted-foreground">Optional extras like lunch plans, extended care or jerseys.</p>}
        {p.addOns.map((a, i) => (
          <div key={a.id} className="grid items-end gap-3 rounded-xl bg-muted/50 p-4 sm:grid-cols-[1fr_1.4fr_0.6fr_auto_auto]">
            <label className={labelCls}>Name<input value={a.name} onChange={(e) => updAddOn(i, { name: e.target.value })} className={`${inputCls} mt-1.5`} /></label>
            <label className={labelCls}>Description<input value={a.description} onChange={(e) => updAddOn(i, { description: e.target.value })} className={`${inputCls} mt-1.5`} /></label>
            <label className={labelCls}>Price<input type="number" min={0} value={a.price} onChange={(e) => updAddOn(i, { price: Math.max(0, num(e.target.value)) })} className={`${inputCls} mt-1.5`} /></label>
            <label className="flex h-10 items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={a.taxable} onChange={(e) => updAddOn(i, { taxable: e.target.checked })} className="h-4 w-4 accent-primary" />HST</label>
            <button onClick={() => set("addOns", p.addOns.filter((_, j) => j !== i))} className={removeBtn}>Remove</button>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">Global add-ons (like jerseys) are managed in Settings → Finances and are added to every matching program automatically.</p>
      </section>

      {deleteInfo && (
        <section className="space-y-3 rounded-2xl border-2 border-destructive/40 bg-destructive/5 p-4 sm:p-6">
          <div>
            <h2 className="text-xl font-bold text-destructive">{deleteInfo.isSeed ? "Reset Program" : "Delete Program"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {deleteInfo.count > 0
                ? `This program has ${deleteInfo.count} registration${deleteInfo.count === 1 ? "" : "s"} (active or past) and can't be deleted. Unpublish it instead.`
                : deleteInfo.isSeed
                  ? "Restores this built-in program to its original setup. This can't be undone."
                  : "Permanently removes this program. Only possible because it has no registrations. You'll be asked to confirm twice."}
            </p>
          </div>
          <button
            type="button"
            disabled={deleteInfo.blocked || saving}
            onClick={() => void deleteInfo.onDelete()}
            className="inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-destructive px-6 text-sm font-bold text-white hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" /></svg>
            {deleteInfo.isSeed ? "Reset This Program" : "Delete This Program"}
          </button>
        </section>
      )}
    </div>
  );
}

function TagEditor({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const t = draft.trim();
    if (t && !tags.some((x) => x.toLowerCase() === t.toLowerCase())) onChange([...tags, t]);
    setDraft("");
  };
  return (
    <div className={labelCls}>
      Tags
      <div className={`${inputCls} mt-1.5 flex h-auto min-h-10 flex-wrap items-center gap-1.5 py-1.5`}>
        {tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-bold text-secondary-foreground">
            {t}
            <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))} className="cursor-pointer leading-none hover:opacity-70">×</button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); }
            else if (e.key === "Backspace" && !draft && tags.length) onChange(tags.slice(0, -1));
          }}
          onBlur={add}
          placeholder={tags.length ? "Add tag…" : "e.g. Popular, New — press Enter"}
          className="min-w-[8rem] flex-1 bg-transparent text-sm font-normal text-foreground outline-none"
        />
      </div>
    </div>
  );
}
