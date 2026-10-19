import { catalogState } from "@/components/catalog-sync";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ProgramImage } from "@/components/program-image";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useCart } from "@/lib/commerce";
import { useFamily } from "@/lib/family";
import { useJoinWaitlist } from "@/components/waitlist";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormattedText } from "@/components/formatted-text";
import { BottomCartBar } from "@/components/bottom-cart-bar";
import {
  isEligible,
  FINANCE,
  isCamp,
  eligibilityLabel,
  asksJersey,
  encodeLine,
  JERSEY_SIZES,
  programWaivers,
  formatPrice,
  getLocation,
  programsFor,
  programTags,
  sessionName,
  sessionPrice,
  sessionLocation,
  sessionSlots,
  withOption,
  sessionFromPrice,
  sessionKey,
  sessionAddress,
  mapsUrl,
  fromPrice,
  fromPriceNow,
  LOCATIONS,
  formatOutDate,
  formatDob,
  priceFor,
  altDiscounts,
  earlyBird,
  describeDiscount,
  chargesHst,
  regWindow,
  type Program,
  type ProgramCategory,
} from "@/data/registration";
import { byStartDesc } from "@/lib/format";

export const Route = createFileRoute("/$location")({ component: LocationPage });

const CATS: ("All" | ProgramCategory)[] = ["All", "Camps", "Hockey", "Soccer", "Lacrosse"];

function LocationPage() {
  const { location } = Route.useParams();
  const loc = getLocation(location);
  const [cat, setCat] = useState<(typeof CATS)[number]>("All");
  const [q, setQ] = useState("");
  const [born, setBorn] = useState("");
  const fam = useFamily();
  useEffect(() => {
    if (loc) try { localStorage.setItem("top_last_location", loc.slug); } catch { /* ignore */ }
  }, [loc]);
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 18 }, (_, i) => String(thisYear - 2 - i));
  const kidYears = fam.children.filter((c) => c.dob).map((c) => ({ id: c.id, label: `${c.firstName} (${c.dob.slice(0, 4)})`, year: c.dob.slice(0, 4) }));

  const programs = useMemo(() => {
    if (!loc) return [];
    return programsFor(loc.slug)
      .filter((p) => (cat === "All" || p.category === cat) && p.name.toLowerCase().includes(q.toLowerCase()) && (!born || isEligible(p, `${born}-06-15`)))
      .sort(byStartDesc);
  }, [loc, cat, q, born]);

  if (!loc) {
    return (
      <div className="mx-auto max-w-lg px-4 py-28 text-center">
        <h1 className="display-condensed text-4xl font-black italic md:text-5xl">Page Not Found</h1>
        <p className="mt-3 text-muted-foreground">We couldn't find that page. Choose a location to see its programs.</p>
        <div className="mt-6 grid grid-cols-2 gap-2">
          {LOCATIONS.map((l) => (
            <Link key={l.slug} to="/$location" params={{ location: l.slug }} className="inline-flex min-h-11 items-center justify-center rounded-full border border-border bg-card px-4 font-semibold hover:bg-accent">{l.name}</Link>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <section className="relative overflow-hidden bg-gradient-to-br from-[#060d24] via-[#0b1a45] to-[#14306e]">
        <img src={loc.image} alt="" decoding="async" fetchPriority="high" className="absolute inset-0 h-full w-full object-cover opacity-25" />
        <div className="absolute inset-0 bg-black/25" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6 md:py-16 lg:px-8">
          <h1 className="display-condensed text-4xl font-black italic leading-none tracking-tight text-white [word-spacing:0.25em] sm:text-5xl md:text-6xl">
            <span>TOP</span>{" "}<span>Sports</span>{" "}<span>{loc.name}</span>
          </h1>
        </div>
      </section>

      <div className="sticky top-16 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-2 sm:gap-3 sm:px-6 sm:py-3 lg:px-8">
          <div className="flex flex-wrap gap-1">
            {CATS.map((c) => (
              <button
                key={c}
                onClick={() => setCat(c)}
                aria-pressed={cat === c}
                className={`inline-flex min-h-11 cursor-pointer items-center rounded-full px-3.5 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring sm:min-h-10 ${cat === c ? "bg-primary text-primary-foreground" : "bg-muted text-foreground/75 hover:bg-accent"}`}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="ml-auto flex w-full gap-2 sm:w-auto">
            <select
              value={born}
              onChange={(e) => setBorn(e.target.value)}
              aria-label="Filter by birth year"
              className="h-9 min-w-0 flex-1 rounded-full border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring sm:h-10 sm:w-40 sm:flex-none"
            >
              <option value="">Any birth year</option>
              {kidYears.length > 0 && (
                <optgroup label="My children">
                  {kidYears.map((k) => <option key={k.id} value={k.year}>{k.label}</option>)}
                </optgroup>
              )}
              <optgroup label="Born in">
                {years.map((y) => <option key={y} value={y}>Born {y}</option>)}
              </optgroup>
            </select>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search programs…"
              aria-label="Search programs"
              className="h-9 min-w-0 flex-1 rounded-full border border-input bg-card px-4 text-sm outline-none focus:ring-2 focus:ring-ring sm:h-10 sm:w-56 sm:flex-none"
            />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {!catalogState.loaded ? (
            <div role="status" aria-label="Loading programs" className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="overflow-hidden rounded-2xl border border-border bg-card">
                  <div className="aspect-[16/10] animate-pulse bg-muted" />
                  <div className="space-y-2 p-3">
                    <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
        ) : programs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-6 py-16 text-center">
            <p className="text-lg font-semibold">No programs match</p>
            <p className="mt-1 text-sm text-muted-foreground">Try another sport, birth year or clear your search.</p>
            <button onClick={() => { setCat("All"); setQ(""); setBorn(""); }} className="mt-5 cursor-pointer rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">Show all programs</button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
            {programs.map((p) => <ProgramCard key={p.id} program={p} />)}
          </div>
        )}
      </div>
      <BottomCartBar />
    </div>
  );
}

function cardBadge(p: Program): { label: string; cls: string } | null {
  const win = regWindow(p);
  if (!win.open && p.regOpens && new Date(p.regOpens).getTime() > Date.now()) return { label: `Opens ${formatOutDate(p.regOpens.slice(0, 10))}`, cls: "bg-info text-info-foreground" };
  if (!win.open) return { label: "Registration Closed", cls: "bg-muted text-foreground" };
  if (p.sessions.length > 0 && p.sessions.every((s) => s.enrolled >= s.capacity)) return { label: "Full · Waitlist Open", cls: "bg-destructive text-destructive-foreground" };
  const closes = p.regCloses ? new Date(p.regCloses).getTime() : NaN;
  if (Number.isFinite(closes) && closes - Date.now() < 7 * 86400000) return { label: "Closes Soon", cls: "bg-warning text-warning-foreground" };
  if (p.sessions.some((s) => s.capacity - s.enrolled < 15)) return { label: "Spots Limited", cls: "bg-warning text-warning-foreground" };
  return null;
}

function ProgramCard({ program: p }: { program: Program }) {
  const badge = cardBadge(p);
  return (
    <Link to="/programs/$programId" params={{ programId: p.id }} className="group block overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-ring sm:rounded-2xl">
      <div className="relative aspect-[16/10] overflow-hidden bg-muted sm:aspect-[4/3]">
        {badge && <span className={`absolute left-2 top-2 z-10 rounded-full px-2 py-0.5 text-xs font-bold sm:left-3 sm:top-3 sm:px-2.5 sm:text-xs ${badge.cls}`}>{badge.label}</span>}
        <ProgramImage src={p.image} alt={p.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
      </div>
      <div className="space-y-1 p-3 sm:space-y-1.5 sm:p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground sm:text-xs">{p.category}</span>
          {programTags(p).map((t) => <span key={t} className="rounded-full bg-secondary px-2 py-0.5 text-xs font-bold text-secondary-foreground">{t}</span>)}
        </div>
        <p className="line-clamp-2 text-sm font-bold leading-snug sm:text-base">{p.name}</p>
        <p className="text-xs text-muted-foreground sm:text-sm">{eligibilityLabel(p)} · {p.season}</p>
        <p className="text-sm font-semibold sm:pt-1 sm:text-base">from {(() => { const fp = fromPriceNow(p); return fp.now < fp.was ? <><s className="font-normal text-muted-foreground">{formatPrice(fp.was)}</s> <span className="text-success">{formatPrice(fp.now)}</span></> : formatPrice(fp.was); })()}{chargesHst(p) && <span className="ml-1 text-xs font-normal text-muted-foreground">+ HST</span>}</p>
      </div>
    </Link>
  );
}

export function ProgramRow({ program: p, open, onToggle }: { program: Program; open: boolean; onToggle: () => void }) {
  const from = fromPrice(p);
  return (
    <div className={`overflow-hidden rounded-2xl border bg-card shadow-sm transition-all ${open ? "border-primary/40 shadow-lg" : "border-border"}`}>
      <button onClick={onToggle} className="flex w-full cursor-pointer items-center gap-4 p-4 text-left sm:p-5">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-muted sm:h-20 sm:w-20">
          <ProgramImage src={p.image} alt={p.name} className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-accent-foreground">{p.category}</span>
            {programTags(p).map((t) => <span key={t} className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-bold text-secondary-foreground">{t}</span>)}
            <span className="text-xs text-muted-foreground">{p.season}</span>
          </div>
          <h3 className="mt-1 truncate text-lg font-bold">{p.name}</h3>
          <Link to="/programs/$programId" params={{ programId: p.id }} onClick={(e) => e.stopPropagation()} className="text-xs font-semibold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">Program details</Link>
          <p className="text-sm text-muted-foreground">{eligibilityLabel(p)} · {p.venue} · {p.sessions.length} session{p.sessions.length > 1 ? "s" : ""}</p>
        </div>
        <div className="hidden text-right sm:block">
          <p className="text-xs text-muted-foreground">from</p>
          <p className="text-lg font-bold">{formatPrice(from)}</p>
          {chargesHst(p) && <p className="text-xs text-muted-foreground">+ HST</p>}
        </div>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && <RegisterPanel program={p} />}
    </div>
  );
}

export function RegisterPanel({ program: p }: { program: Program }) {
  const family = useFamily();
  const { addItem } = useCart();
  const [sessionIds, setSessionIds] = useState<string[]>([]);
  const [slotBy, setSlotBy] = useState<Record<string, string[]>>({});
  const picked = (sid: string) => slotBy[sid] ?? [];
  const toggleSlot = (sid: string, tid: string) => {
    const cur = picked(sid);
    setSlotBy({ ...slotBy, [sid]: cur.includes(tid) ? cur.filter((x) => x !== tid) : [...cur, tid] });
  };
  const slotsOf = (sid: string) => sessionSlots(p.sessions.find((x) => x.id === sid) ?? ({ slots: [] } as unknown as Program["sessions"][number]));
  const optionId = p.options[0]?.id ?? "std";
  const [addOnsBy, setAddOnsBy] = useState<Record<string, string[]>>({});
  const [altBy, setAltBy] = useState<Record<string, string>>({});
  const alts = altDiscounts(p);
  const eb = earlyBird(p);
  const [childIds, setChildIds] = useState<string[]>([]);
  const [friendBy, setFriendBy] = useState<Record<string, string>>({});
  const [pickupBy, setPickupBy] = useState<Record<string, string[]>>({});
  const [answersBy, setAnswersBy] = useState<Record<string, Record<string, string>>>({});
  const questions = (p.questions ?? []).filter((q) => q.label.trim());
  const pickupsOf = (cid: string) => pickupBy[cid] ?? [""];
  const setPickups = (cid: string, list: string[]) => setPickupBy({ ...pickupBy, [cid]: list });
  const setAnswer = (cid: string, qid: string, val: string) => setAnswersBy({ ...answersBy, [cid]: { ...(answersBy[cid] ?? {}), [qid]: val } });
  const [sizes, setSizes] = useState<Record<string, string>>({});
  const navigate = useNavigate();
  // Pre-fill jersey size and custom answers from each child's most recent registration.
  useEffect(() => {
    const nextSizes = { ...sizes };
    const nextAnswers = { ...answersBy };
    let changed = false;
    for (const cid of childIds) {
      const past = [...family.registrations].filter((r) => r.childId === cid).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      if (!nextSizes[cid]) {
        const js = past.find((r) => r.jerseySize)?.jerseySize;
        if (js) { nextSizes[cid] = js; changed = true; }
      }
      if (!nextAnswers[cid] && questions.length) {
        const prev: Record<string, string> = {};
        for (const q of questions) {
          const hit = past.flatMap((r) => r.answers ?? []).find((a) => a.question.trim().toLowerCase() === q.label.trim().toLowerCase());
          if (hit?.answer) prev[q.id] = hit.answer;
        }
        if (Object.keys(prev).length) { nextAnswers[cid] = prev; changed = true; }
      }
    }
    if (changed) { setSizes(nextSizes); setAnswersBy(nextAnswers); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childIds]);
  const [accepted, setAccepted] = useState<string[]>([]);
  const [signature, setSignature] = useState("");
  const [openWaiver, setOpenWaiver] = useState<string | null>(null);
  const [mStep, setMStep] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const needJersey = asksJersey(p);
  const waivers = programWaivers(p);
  const missingProfile = childIds.filter((id) => {
    const c = family.childById(id);
    return !c?.address || !c?.school || !c?.emergencyName || !c?.emergencyPhone;
  });
  const missingConfirm = childIds.filter((id) => !missingProfile.includes(id) && !(family.childById(id)?.confirmedSeasons ?? []).includes(p.season));
  const confirmSeason = (id: string, on: boolean) => {
    const c = family.childById(id);
    if (!c) return;
    const list = (c.confirmedSeasons ?? []).filter((x) => x !== p.season);
    family.updateChild({ ...c, confirmedSeasons: on ? [...list, p.season] : list });
  };
  const missingSize = needJersey ? childIds.filter((id) => !sizes[id]) : [];
  const sigOk = (s: string) => {
    const w = s.trim().split(/\s+/).filter(Boolean);
    return w.length >= 2 && w.every((x) => /^[A-Za-zÀ-ÿ'’-]{2,}$/.test(x) && /[A-Za-zÀ-ÿ]{2}/.test(x));
  };
  const signed = waivers.length === 0 || sigOk(signature);
  const allWaivers = waivers.every((w) => accepted.includes(w.id)) && signed;
  const missingAnswers = childIds.filter((cid) => questions.some((q) => q.required && !(answersBy[cid]?.[q.id] ?? "").trim()));
  const win = regWindow(p);
  const missingSlot = sessionIds.filter((sid) => slotsOf(sid).length > 0 && picked(sid).length === 0);
  const formReady = win.open && missingSlot.length === 0 && childIds.length > 0 && missingProfile.length === 0 && missingConfirm.length === 0 && missingSize.length === 0 && missingAnswers.length === 0 && allWaivers;

  const waitlist = useJoinWaitlist();
  const isFull = (id: string) => {
    const s = p.sessions.find((x) => x.id === id);
    return !!s && s.enrolled >= s.capacity;
  };
  const openIds = sessionIds.filter((id) => !isFull(id));
  const fullIds = sessionIds.filter(isFull);
  const addOnsFor = (sid: string) => p.addOns.filter((a) => (addOnsBy[sid] ?? []).includes(a.id));
  const addOnSum = (sid: string) => addOnsFor(sid).reduce((s, a) => s + a.price, 0);
  const chosen = (sid: string, tid?: string) => {
    const s = p.sessions.find((x) => x.id === sid);
    if (!s) return undefined;
    return withOption(s, tid ? slotsOf(sid).find((t) => t.id === tid) : undefined);
  };
  // One unit per picked option (or the session itself when it has no options).
  const units = openIds.flatMap((sid) => (slotsOf(sid).length > 0 ? picked(sid).filter((tid) => slotsOf(sid).some((t) => t.id === tid)).map((tid) => ({ sid, tid: tid as string | undefined })) : [{ sid, tid: undefined as string | undefined }]));
  const lineFee = (sid: string, childId?: string, tid?: string) => {
    const s = chosen(sid, tid);
    if (!s) return 0;
    return priceFor(p, s, childId ? altBy[childId] : undefined).price;
  };
  const comboPerChild = openIds.reduce((t, sid) => {
    const ss = p.sessions.find((x) => x.id === sid);
    const n = slotsOf(sid).length > 0 ? picked(sid).length : 0;
    return t + (n > 1 ? (n - 1) * Math.max(0, ss?.comboDiscount ?? 0) : 0);
  }, 0);
  // Price shows as soon as a session option is picked (one participant assumed until children are chosen).
  const priceKids: (string | undefined)[] = childIds.length ? childIds : [undefined];
  const comboTotal = comboPerChild * priceKids.length;
  const total = Math.max(0, priceKids.reduce<number>((sum, cid) => sum + units.reduce((t, u) => t + lineFee(u.sid, cid, u.tid) + addOnSum(u.sid), 0), 0) - comboTotal);
  const addOnCount = openIds.reduce((n, sid) => n + addOnsFor(sid).length, 0);
  const toggleAddOn = (sid: string, aid: string) => {
    const cur = addOnsBy[sid] ?? [];
    setAddOnsBy({ ...addOnsBy, [sid]: cur.includes(aid) ? cur.filter((x) => x !== aid) : [...cur, aid] });
  };
  const toggle = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const joinWaitlist = async () => {
    const items = childIds.flatMap((childId) => {
      const child = family.childById(childId)!;
      return fullIds.map((sessionId) => ({
        programId: p.id,
        locationSlug: p.locationSlug,
        sessionId,
        optionId,
        childLocalId: childId,
        childName: `${child.firstName} ${child.lastName}`.trim(),
        childDob: child.dob,
      }));
    });
    if (await waitlist.run(items, family.guardian.name)) setSessionIds(openIds);
  };

  const add = () => {
    for (const childId of childIds) {
      const child = family.childById(childId)!;
      for (const { sid: sessionId, tid } of units) {
        const s = chosen(sessionId, tid)!;
        const addOnIds = addOnsFor(sessionId).map((a) => a.id);
        const discountId = altBy[childId] || undefined;
        const slot = tid ? slotsOf(sessionId).find((t) => t.id === tid) : undefined;
        const lineId = encodeLine({ programId: p.id, sessionId: sessionKey(sessionId, slot?.id), optionId, childId, addOnIds, discountId });
        const fr = (friendBy[childId] ?? "").trim();
        if (fr) family.setFriendRequest(lineId, fr);
        family.setRegDetails(lineId, { heardAbout: family.heardAbout, jerseySize: needJersey ? sizes[childId] : undefined, pickupPerson: pickupsOf(childId).map((x) => x.trim()).filter(Boolean).join("; ") || undefined, answers: questions.map((q) => ({ question: q.label.trim(), answer: (answersBy[childId]?.[q.id] ?? "").trim() })).filter((x) => x.answer), waivers: waivers.map((w) => w.id), waiverSnapshot: waivers.map((w) => ({ id: w.id, title: w.title, text: w.text ?? "" })), signature: signature.trim(), acceptedAt: new Date().toISOString() });
        addItem({ productId: lineId, name: `${p.name} — ${s.label} · ${child.firstName}`, price: priceFor(p, s, discountId).price + addOnSum(sessionId), imageUrl: p.image });
      }
    }
    const n = units.length * childIds.length;
    const keep = { sessionIds, slotBy, addOnsBy };
    const addedIds = new Set(childIds);
    // Clear the registration form so the next pick starts fresh.
    setSessionIds([]); setSlotBy({}); setAddOnsBy({}); setAltBy({}); setChildIds([]); setFriendBy({}); setPickupBy({}); setAnswersBy({}); setSizes({}); setAccepted([]); setSignature(""); setMStep(0);
    const sibling = family.children.find((c) => !addedIds.has(c.id) && !family.registrations.some((r) => r.childId === c.id && r.lineId.split("|")[1] === p.id));
    const moreSessions = p.sessions.filter((x) => !sessionIds.includes(x.id) && x.enrolled < x.capacity).length;
    const nudge = sibling && FINANCE.siblingPct > 0
      ? `Add ${sibling.firstName} too and save ${FINANCE.siblingPct}% on their registration.`
      : isCamp(p) && moreSessions > 0 && FINANCE.extraWeek > 0
        ? `Add another week and save ${formatPrice(FINANCE.extraWeek)} on each extra week.`
        : "You can register another child or session anytime before checkout.";
    const secondary = sibling
      ? { label: `Add ${sibling.firstName}`, run: () => { setSessionIds(keep.sessionIds); setSlotBy(keep.slotBy); setAddOnsBy(keep.addOnsBy); setChildIds([sibling.id]); } }
      : { label: isCamp(p) ? "Add Another Week" : "Register Another Child", run: () => window.scrollTo({ top: 0, behavior: "smooth" }) };
    toast.custom((t) => (
      <div className="w-[min(92vw,380px)] rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-lg">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success text-success-foreground" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">{n} registration{n > 1 ? "s" : ""} added to cart</p>
            <p className="mt-0.5 text-sm leading-snug text-muted-foreground">{nudge}</p>
          </div>
          <button type="button" onClick={() => toast.dismiss(t)} aria-label="Close" className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground">✕</button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => { toast.dismiss(t); secondary.run(); }} className="h-10 cursor-pointer truncate rounded-full border border-border bg-card px-3.5 text-sm font-semibold hover:bg-accent">{secondary.label}</button>
          <button type="button" onClick={() => { toast.dismiss(t); void navigate({ to: "/checkout" }); }} className="h-10 cursor-pointer rounded-full bg-primary px-3.5 text-sm font-bold text-primary-foreground hover:bg-primary/90">Checkout →</button>
        </div>
      </div>
    ), { duration: 9000 });
  };

  const blockedMsg = !win.open ? (win.message ?? "Registration is closed.") : "Please complete the full registration form before proceeding";
  const needSessions = sessionIds.length === 0 || missingSlot.length > 0;
  const needChild = childIds.length === 0;
  const needDetails = missingProfile.length > 0 || missingConfirm.length > 0 || missingSize.length > 0 || missingAnswers.length > 0;
  const showHst = chargesHst(p) || (addOnCount > 0 && p.category !== "Camps");
  const nameOf = (id: string) => family.childById(id)?.firstName ?? "participant";
  const todo: string[] = [];
  if (sessionIds.length === 0) todo.push("Choose a session");
  for (const sid of missingSlot) todo.push(`Pick an option for ${sessionName(p.sessions.find((x) => x.id === sid)!)}`);
  if (needChild) todo.push("Choose a participant");
  for (const id of missingProfile) todo.push(`Complete ${nameOf(id)}'s profile (address, school, emergency contact)`);
  for (const id of missingConfirm) todo.push(`Confirm ${nameOf(id)}'s info is up to date`);
  for (const id of missingSize) todo.push(`Jersey size for ${nameOf(id)}`);
  for (const id of missingAnswers) todo.push(`Answer required questions for ${nameOf(id)}`);
  if (waivers.length > 0 && !waivers.every((w) => accepted.includes(w.id))) todo.push("Agree to each waiver & policy");
  if (waivers.length > 0 && !signed) todo.push("Type your full name to sign");
  const todoBlock = !win.open ? (
    <p className="text-xs font-semibold text-destructive">{blockedMsg}</p>
  ) : todo.length > 0 ? (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
      <p className="text-xs font-bold">Still needed to continue:</p>
      <ul className="mt-1.5 space-y-1">
        {todo.map((t) => <li key={t} className="flex gap-1.5 text-xs"><span className="font-bold text-destructive" aria-hidden>*</span><span>{t}</span></li>)}
      </ul>
    </div>
  ) : null;
  const summaryBody = (
    <>
      {openIds.length === 0 && <p className="text-sm text-muted-foreground">No sessions selected yet.</p>}
      {openIds.filter((id) => slotsOf(id).length > 0 && picked(id).length === 0).map((id) => {
        const s = chosen(id)!;
        return <Row key={id} k={`${sessionName(s)} · pick an option`} v="—" />;
      })}
      {units.map((u) => {
        const s = chosen(u.sid, u.tid)!;
        const pr = priceFor(p, s);
        return (
          <div key={`${u.sid}~${u.tid ?? ""}`} className="space-y-1">
            <Row k={s.label} v={formatPrice(pr.price)} />
            {addOnsFor(u.sid).map((a) => <Row key={a.id} k={`  + ${a.name}`} v={`+${formatPrice(a.price)}`} />)}
          </div>
        );
      })}
      {comboTotal > 0 && <Row k="Multi-Session Discount" v={`−${formatPrice(comboTotal)}`} />}
      {childIds.filter((c) => altBy[c]).map((c) => { const d = alts.find((x) => x.id === altBy[c]); const ch = family.childById(c); return d ? <Row key={c} k={`${ch?.firstName}: ${d.label}`} v={describeDiscount(d)} /> : null; })}
      <Row k="Children" v={childIds.length ? `× ${childIds.length}` : "Pick a participant"} />
      {fullIds.length > 0 && <Row k="Waitlist requests" v={`${fullIds.length} × ${childIds.length}`} />}
      <div className="flex items-baseline justify-between border-t border-border pt-3">
        <span className="font-semibold">Subtotal</span>
        <span className="text-2xl font-bold">{formatPrice(total)}</span>
      </div>
      {showHst && <p className="text-xs text-muted-foreground">HST (13%) applied at checkout (if applicable)</p>}
    </>
  );
  const mSteps: { key: string; title: string; ok: boolean }[] = [
    { key: "sessions", title: "Sessions", ok: !needSessions },
    ...(p.addOns.length > 0 ? [{ key: "addons", title: "Add-Ons", ok: true }] : []),
    { key: "child", title: "Participant", ok: !needChild },
    ...(childIds.length > 0 ? [{ key: "details", title: "Details", ok: !needDetails }] : []),
    ...(waivers.length > 0 ? [{ key: "waivers", title: "Waivers", ok: allWaivers }] : []),
    { key: "review", title: "Review", ok: true },
  ];
  const mIdx = Math.min(mStep, mSteps.length - 1);
  const mCur = mSteps[mIdx];
  const mHide = (key: string) => (mCur.key === key ? "" : "max-lg:hidden");
  const goStep = (i: number) => {
    setMStep(Math.max(0, Math.min(i, mSteps.length - 1)));
    requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const addLabel = total && childIds.length ? "Add to Cart" : total ? "Pick a Participant" : fullIds.length && childIds.length ? "No Open Sessions Selected" : "Pick a Session & Child";

  return (
    <div ref={panelRef} className="grid scroll-mt-20 gap-6 border-t border-border bg-muted/40 p-4 pb-40 sm:p-6 sm:pb-40 lg:grid-cols-[1fr_320px] lg:pb-6">
      <div className="min-w-0 space-y-6">
        <div className="lg:hidden">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
            <span>Step {mIdx + 1} of {mSteps.length}</span>
            <span className="text-foreground">{mCur.title}</span>
          </div>
          <div className="mt-2 flex gap-1.5" role="list" aria-label="Registration steps">
            {mSteps.map((st, i) => (
              <button key={st.key} type="button" role="listitem" onClick={() => (i <= mIdx || mSteps.slice(0, i).every((x) => x.ok)) && goStep(i)} aria-label={`Step ${i + 1}: ${st.title}`} aria-current={i === mIdx ? "step" : undefined} className={`h-1.5 flex-1 cursor-pointer rounded-full transition-colors ${i === mIdx ? "bg-primary" : i < mIdx && st.ok ? "bg-success" : "bg-border"}`} />
            ))}
          </div>
        </div>
        {win.message && (
          <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3.5 text-sm font-semibold ${win.open ? "border-border bg-card" : "border-destructive/40 bg-destructive/10 text-destructive"}`}>
            <span>{win.message}</span>
            {!win.open && p.regOpens && new Date(p.regOpens).getTime() > Date.now() && (() => {
              const at = new Date(p.regOpens);
              const f = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
              const end = new Date(at.getTime() + 30 * 60000);
              const url = typeof window !== "undefined" ? window.location.href : "";
              const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//TOP Sports//EN", "BEGIN:VEVENT", `UID:${p.id}-opens@topsports.ca`, `DTSTAMP:${f(new Date())}`, `DTSTART:${f(at)}`, `DTEND:${f(end)}`, `SUMMARY:Registration opens: ${p.name}`, `DESCRIPTION:Register at ${url}`, "BEGIN:VALARM", "TRIGGER:-PT15M", "ACTION:DISPLAY", `DESCRIPTION:${p.name} registration opens in 15 minutes`, "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
              return (
                <a href={"data:text/calendar;charset=utf-8," + encodeURIComponent(ics)} download={`${p.id}-registration-opens.ics`} onClick={() => toast.success("Reminder saved. Your calendar will alert you 15 minutes before registration opens.")} className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
                  Notify Me
                </a>
              );
            })()}
          </div>
        )}
        {eb && (
          <div className="rounded-xl border border-success/40 bg-success/10 p-3.5 text-sm">
            <span className="font-bold">{eb.label || "Early-Bird"}: {describeDiscount(eb)}</span> every session — register by {formatOutDate(eb.deadline!)}.
          </div>
        )}
        <Step n={1} title="Choose Sessions" incomplete={needSessions} className={mHide("sessions")}>
          <p className="-mt-1 mb-2 text-xs text-muted-foreground">Tap one or more sessions to select them. Full sessions can be added to the waitlist.</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {p.sessions.map((s) => {
              const full = s.enrolled >= s.capacity;
              const left = s.capacity - s.enrolled;
              const on = sessionIds.includes(s.id);
              const pr = priceFor(p, s);
              const multi = sessionSlots(s).length > 0;
              const fromP = sessionFromPrice(p, s);
              const showPill = full || left < 10;
              return (
                <button
                  key={s.id}
                  onClick={() => toggle(sessionIds, setSessionIds, s.id)}
                  className={`cursor-pointer rounded-xl border p-3.5 text-left transition-all ${on ? "border-primary bg-primary text-primary-foreground" : full ? "border-dashed border-border bg-card hover:border-primary/40" : "border-border bg-card hover:border-primary/40"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{sessionName(s)}</span>
                    <span className="ml-auto text-right text-sm font-bold">
                      {multi ? <>from {formatPrice(priceFor(p, { ...s, price: fromP }).price)}</> : <>{pr.price < pr.base && <span className={`mr-1.5 text-xs font-semibold line-through ${on ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{formatPrice(pr.base)}</span>}
                      {formatPrice(pr.price)}</>}
                    </span>
                    {showPill && (
                      <span className={`inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full px-2.5 py-1 text-center text-xs font-bold leading-none ${full ? "bg-destructive text-destructive-foreground" : "bg-warning text-warning-foreground"}`}>
                        {full ? "Full · Join Waitlist" : `${left} left`}
                      </span>
                    )}
                  </div>
                  <p className={`mt-1 text-xs ${on ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{multi ? `${sessionSlots(s).length} registration options — pick one after selecting` : <>{s.days} · {s.time} · {s.dates} ·{" "}</>}
                    {!multi && <>
                    <span role="link" tabIndex={0} onClick={(e) => { e.stopPropagation(); window.open(mapsUrl(sessionLocation(p, s), sessionAddress(p, s)), "_blank", "noopener"); }} onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); window.open(mapsUrl(sessionLocation(p, s), sessionAddress(p, s)), "_blank", "noopener"); } }} className="font-semibold underline underline-offset-2">{sessionLocation(p, s)}</span>
                    {sessionAddress(p, s) && <span> ({sessionAddress(p, s)})</span>}</>}
                  </p>
                </button>
              );
            })}
          </div>
          {sessionIds.filter((sid) => slotsOf(sid).length > 0 && !isFull(sid)).map((sid) => {
            const ss = p.sessions.find((x) => x.id === sid)!;
            return (
              <div key={sid} className="mt-3 rounded-xl border border-border bg-card p-3.5">
                <p className="text-sm font-bold">
                  Choose an Option for {sessionName(ss)}
                  {picked(sid).length === 0 && <span className="ml-1 text-destructive" aria-label="Required">*</span>}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{(ss.comboDiscount ?? 0) > 0 ? <span className="font-semibold text-success">Pick multiple sessions and Save {formatPrice(ss.comboDiscount!)} on each additional option</span> : "Pick one or more options."}</p>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {slotsOf(sid).map((t) => {
                    const full = t.capacity > 0 && t.enrolled >= t.capacity;
                    const sel = picked(sid).includes(t.id);
                    const os = withOption(ss, t);
                    const op = priceFor(p, os);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        disabled={full}
                        onClick={() => toggleSlot(sid, t.id)}
                        aria-pressed={sel}
                        className={`cursor-pointer rounded-lg border px-3.5 py-2.5 text-left text-sm transition-all disabled:cursor-not-allowed disabled:opacity-50 ${sel ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/40"}`}
                      >
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="font-semibold">{t.label}</span>
                          <span className="text-sm font-bold">{formatPrice(op.price)}</span>
                        </span>
                        <span className={`mt-0.5 block text-xs ${sel ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                          {[os.days, os.time, os.dates].filter((x) => x?.trim()).join(" · ")}
                        </span>
                        <span className={`block text-xs ${sel ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                          {sessionLocation(p, os)}{sessionAddress(p, os) ? ` (${sessionAddress(p, os)})` : ""}{full ? " · Full" : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </Step>

        {(p.outDates?.length ?? 0) > 0 && (
          <div className={`rounded-xl border border-warning/50 bg-warning/10 p-3.5 ${mHide("sessions")}`}>
            <p className="text-sm font-bold">No Program On These Dates</p>
            <ul className="mt-1 space-y-0.5 text-xs text-foreground">
              {p.outDates!.map((o) => <li key={o.id}>{formatOutDate(o.date)}{o.note ? ` — ${o.note}` : ""}</li>)}
            </ul>
          </div>
        )}

        {p.addOns.length > 0 && (
          <Step n={2} title="Add-Ons" className={mHide("addons")}>
            {openIds.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border bg-card p-4 text-sm text-muted-foreground">Choose a session first, then pick add-ons for each one.</p>
            ) : (
            <div className="space-y-3">
              {openIds.map((sid) => {
                const ss = p.sessions.find((x) => x.id === sid)!;
                return (
            <div key={sid} className="rounded-xl border border-border bg-card p-3.5">
            <p className="mb-2 text-sm font-semibold">{sessionName(ss)}</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {p.addOns.map((a) => {
                const on = (addOnsBy[sid] ?? []).includes(a.id);
                return (
                  <button key={a.id} onClick={() => toggleAddOn(sid, a.id)} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 text-left transition-all ${on ? "border-primary bg-accent" : "border-border bg-card hover:border-primary/40"}`}>
                    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${on ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
                      {on && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5"><path d="M20 6 9 17l-5-5" /></svg>}
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">{a.name} +{formatPrice(a.price)}</span>
                      <span className="text-xs text-muted-foreground">{a.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            </div>
                );
              })}
            </div>
            )}
          </Step>
        )}

        <Step n={p.addOns.length > 0 ? 3 : 2} title="Choose Participant" incomplete={needChild} className={mHide("child")}>
          {family.children.length === 0 ? (
            <Link to="/account" className="inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">Add a child to your family</Link>
          ) : (
            <div className="flex flex-wrap gap-2">
              {family.children.map((c) => {
                const ok = isEligible(p, c.dob);
                const on = childIds.includes(c.id);
                return (
                  <button key={c.id} disabled={!ok} onClick={() => toggle(childIds, setChildIds, c.id)} className={`cursor-pointer rounded-full border px-4 py-2 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50 ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/40"}`}>
                    {c.firstName} · {formatDob(c.dob)}{!ok && " (not eligible)"}
                  </button>
                );
              })}
              <Link to="/account" className="rounded-full border border-dashed border-border px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground">+ Add child</Link>
              {family.children.filter((c) => !isEligible(p, c.dob)).map((c) => (
                <p key={`why-${c.id}`} className="w-full text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{c.firstName}</span> was born {Number((c.dob || "").slice(0, 4)) || "in an unlisted year"}. This program is for children {eligibilityLabel(p).replace("Born", "born")}.{" "}
                  <Link to="/$location" params={{ location: p.locationSlug }} className="font-semibold text-primary hover:underline">See other programs →</Link>
                </p>
              ))}
            </div>
          )}
        </Step>

        {childIds.length > 0 && (
          <Step n={p.addOns.length > 0 ? 4 : 3} title="Participant Details" incomplete={needDetails} className={mHide("details")}>
            <div className="space-y-3">
              {childIds.map((id) => {
                const c = family.childById(id);
                if (!c) return null;
                const incomplete = missingProfile.includes(id);
                return (
                  <div key={id} className="rounded-xl border border-border bg-card p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold">{c.firstName} {c.lastName}</p>
                        {incomplete ? (
                          <p className="text-xs font-semibold text-destructive"><span aria-hidden>* </span>Missing address, school or emergency contact</p>
                        ) : (
                          <p className="text-xs text-muted-foreground">{c.address}, {c.city} · {c.school}{c.grade ? ` (${c.grade})` : ""} · Emergency: {c.emergencyName}</p>
                        )}
                      </div>
                      <Link to="/account" className="shrink-0 rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold hover:bg-accent">{incomplete ? "Complete profile" : "Edit"}</Link>
                    </div>
                    {!incomplete && (
                      <label className={`mt-3 flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-xs ${(c.confirmedSeasons ?? []).includes(p.season) ? "border-success/40 bg-success/10" : "border-warning bg-warning/15"}`}>
                        <input type="checkbox" checked={(c.confirmedSeasons ?? []).includes(p.season)} onChange={(e) => confirmSeason(id, e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-primary" />
                        <span>
                          <span className="block font-semibold text-foreground">I confirm {c.firstName}'s info is up to date for {p.season} <span className="text-destructive">*</span></span>
                          <span className="mt-0.5 block text-muted-foreground">Medical: {c.medical?.trim() || "None listed"} · Emergency: {c.emergencyName} {c.emergencyPhone}{c.emergencyRelationship ? ` (${c.emergencyRelationship})` : ""} · Pickup names are entered below. Once a season, then it's remembered. Something changed? Tap Edit.</span>
                        </span>
                      </label>
                    )}
                    {alts.length > 0 && (
                      <label className="mt-3 block text-xs font-semibold text-muted-foreground">Pricing
                        <select value={altBy[id] ?? ""} onChange={(e) => setAltBy({ ...altBy, [id]: e.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-input bg-card px-3.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring sm:w-72">
                          <option value="">Standard Price</option>
                          {alts.map((d) => <option key={d.id} value={d.id}>{d.label} — {describeDiscount(d)}</option>)}
                        </select>
                      </label>
                    )}
                    <label className="mt-3 block text-xs font-semibold text-muted-foreground">Friend Request (Optional)
                      <input value={friendBy[id] ?? ""} onChange={(e) => setFriendBy({ ...friendBy, [id]: e.target.value })} placeholder="e.g. Ava Chen" className="mt-1.5 h-10 w-full rounded-lg border border-input bg-card px-3.5 text-sm font-normal text-foreground outline-none focus:ring-2 focus:ring-ring sm:w-72" />
                      <span className="mt-1 block font-normal">Limit of 1 friend request per participant.</span>
                    </label>
                    <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3.5">
                      <p className="text-xs font-semibold text-foreground">Authorized Pickup Names (Optional)</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">Anyone other than the listed parents/guardians who may pick up this participant. Photo ID may be requested.</p>
                      <div className="mt-2 space-y-2">
                        {pickupsOf(id).map((val, pi) => (
                          <div key={pi} className="flex gap-2">
                            <input value={val} onChange={(e) => setPickups(id, pickupsOf(id).map((x, j) => (j === pi ? e.target.value : x)))} placeholder="Name, relationship & phone — e.g. Jane Doe (Aunt) 416-555-0199" className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-card px-3.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring sm:max-w-md" />
                            {pickupsOf(id).length > 1 && (
                              <button type="button" onClick={() => setPickups(id, pickupsOf(id).filter((_, j) => j !== pi))} aria-label="Remove pickup person" className="h-10 shrink-0 cursor-pointer rounded-lg px-3 text-xs font-semibold text-destructive hover:bg-destructive/10">Remove</button>
                            )}
                          </div>
                        ))}
                      </div>
                      {pickupsOf(id).length < 4 && (
                        <button type="button" onClick={() => setPickups(id, [...pickupsOf(id), ""])} className="mt-2 cursor-pointer rounded-full border border-dashed border-border px-3.5 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground">+ Add Pickup Person</button>
                      )}
                    </div>
                    {questions.map((q) => (
                      <label key={q.id} className="mt-3 block text-xs font-semibold text-muted-foreground">{q.label}{q.required ? <span className="text-destructive"> *</span> : " (Optional)"}
                        {q.type === "yesno" ? (
                          <select value={answersBy[id]?.[q.id] ?? ""} onChange={(e) => setAnswer(id, q.id, e.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-input bg-card px-3.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring sm:w-56">
                            <option value="">Select</option>
                            <option value="Yes">Yes</option>
                            <option value="No">No</option>
                          </select>
                        ) : (
                          <input value={answersBy[id]?.[q.id] ?? ""} onChange={(e) => setAnswer(id, q.id, e.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-input bg-card px-3.5 text-sm font-normal text-foreground outline-none focus:ring-2 focus:ring-ring sm:max-w-md" />
                        )}
                      </label>
                    ))}
                    {needJersey && (
                      <label className="mt-3 block text-xs font-semibold text-muted-foreground">Jersey / Uniform Size <span className="text-destructive">*</span>
                        <select value={sizes[id] ?? ""} onChange={(e) => setSizes({ ...sizes, [id]: e.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-input bg-card px-3.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring sm:w-56">
                          <option value="">Select a size</option>
                          {JERSEY_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          </Step>
        )}

        {waivers.length > 0 && (
          <Step n={(p.addOns.length > 0 ? 4 : 3) + (childIds.length > 0 ? 1 : 0)} title="Waivers & Policies" incomplete={!allWaivers} className={mHide("waivers")}>
            <div className="space-y-2">
              {waivers.map((w) => {
                const on = accepted.includes(w.id);
                return (
                  <div key={w.id} className={`rounded-xl border p-3.5 transition-all ${on ? "border-primary bg-accent" : "border-border bg-card"}`}>
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => (on ? setAccepted(accepted.filter((x) => x !== w.id)) : setOpenWaiver(w.id))}
                        aria-label={`Agree to ${w.title}`}
                        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-primary"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">{w.title}</span>
                        <button type="button" onClick={() => setOpenWaiver(w.id)} className="mt-1 cursor-pointer text-xs font-semibold text-primary underline-offset-2 hover:underline">Read Full Text</button>
                      </span>
                      {on && <span className="shrink-0 rounded-full bg-success px-2.5 py-0.5 text-xs font-bold text-success-foreground">Agreed</span>}
                    </div>
                  </div>
                );
              })}
              <label className="mt-2 block rounded-xl border border-border bg-muted/40 p-3.5 text-xs font-semibold text-foreground">
                Parent / Guardian Signature <span className="text-destructive">*</span>
                <input value={signature} onChange={(e) => setSignature(e.target.value)} autoComplete="name" placeholder="First and last name" aria-invalid={!!signature.trim() && !sigOk(signature)} className="mt-1.5 h-11 w-full rounded-lg border border-input bg-card px-3.5 text-base italic text-foreground outline-none focus:ring-2 focus:ring-ring sm:max-w-md" />
                <span className="mt-1.5 block font-normal text-muted-foreground">Type your full first and last name. This is your electronic signature on the policies above.</span>
              </label>
              {!allWaivers && <p className="text-xs text-muted-foreground">{waivers.every((w) => accepted.includes(w.id)) ? "Type your full name to sign." : "Open each policy and check “I AGREE”, then type your full name to sign."}</p>}
            </div>
            <Dialog open={!!openWaiver} onOpenChange={(o) => !o && setOpenWaiver(null)}>
              {(() => {
                const w = waivers.find((x) => x.id === openWaiver);
                if (!w) return null;
                const on = accepted.includes(w.id);
                return (
                  <DialogContent className="z-[80] flex h-[100dvh] max-w-lg flex-col bg-card max-sm:max-w-none max-sm:rounded-none max-sm:border-0 max-sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:h-auto">
                    <DialogHeader>
                      <DialogTitle>{w.title}</DialogTitle>
                      <DialogDescription>Read the full policy below, then check I AGREE.</DialogDescription>
                    </DialogHeader>
                    <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-muted/50 p-4 text-sm leading-relaxed text-foreground sm:max-h-[50vh] sm:flex-none"><FormattedText text={w.text} /></div>
                    <label className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 transition-all ${on ? "border-primary bg-accent" : "border-border"}`}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => {
                          if (on) { setAccepted(accepted.filter((x) => x !== w.id)); return; }
                          setAccepted([...accepted, w.id]);
                          setTimeout(() => setOpenWaiver(null), 350);
                        }}
                        className="h-5 w-5 shrink-0 accent-primary"
                      />
                      <span className="text-sm font-bold tracking-wide">I AGREE</span>
                    </label>
                  </DialogContent>
                );
              })()}
            </Dialog>
          </Step>
        )}

        <div className={`space-y-3 rounded-2xl border border-border bg-card p-5 lg:hidden ${mCur.key === "review" ? "" : "hidden"}`}>
          <h4 className="text-lg font-bold">Review & Summary</h4>
          {summaryBody}
          {todoBlock}
          <button disabled={!total || !formReady} onClick={add} className="w-full cursor-pointer rounded-full bg-primary px-5 py-3 font-bold text-primary-foreground shadow-md transition-all hover:scale-[1.02] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100">{addLabel}</button>
          {fullIds.length > 0 && (
            <div className="space-y-2 rounded-xl border border-dashed border-border p-3">
              <p className="text-xs text-muted-foreground">
                {fullIds.length} selected session{fullIds.length > 1 ? "s are" : " is"} full. Join the waitlist free — if a spot opens you'll get 24 hours to claim it, and pay only then.
              </p>
              <button disabled={!childIds.length || waitlist.busy} onClick={joinWaitlist} className="w-full cursor-pointer rounded-full border-2 border-primary px-5 py-2.5 text-sm font-bold text-primary disabled:cursor-not-allowed disabled:opacity-40">
                {!waitlist.signedIn ? "Sign in to join waitlist" : waitlist.busy ? "Joining…" : childIds.length ? "Join waitlist" : "Pick a child to join waitlist"}
              </button>
              {!waitlist.signedIn && <Link to="/checkout" className="block text-center text-xs font-semibold text-muted-foreground underline">Sign in or create a family account</Link>}
            </div>
          )}
        </div>
      </div>

      <div className={`fixed inset-x-0 bottom-0 z-[60] border-t border-border bg-card px-4 pt-3 shadow-[0_-8px_24px_rgba(0,0,0,0.1)] pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:hidden ${openWaiver ? "hidden" : ""}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Subtotal{childIds.length > 1 ? ` · ${childIds.length} children` : ""}</p>
            <p className="text-lg font-bold leading-tight">{formatPrice(total)}</p>
            {!mCur.ok && <p className="truncate text-xs font-semibold text-destructive">Finish the items marked *</p>}
            {mCur.key === "review" && !formReady && <p className="truncate text-xs font-semibold text-destructive">{win.open ? "Some steps aren't finished" : blockedMsg}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {mIdx > 0 && (
              <button type="button" onClick={() => goStep(mIdx - 1)} className="h-11 cursor-pointer rounded-full border border-border bg-card px-4 text-sm font-semibold hover:bg-accent">Back</button>
            )}
            {mCur.key === "review" ? (
              <button disabled={!total || !formReady} onClick={add} className="h-11 cursor-pointer rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground shadow-md transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40">{addLabel}</button>
            ) : (
              <button type="button" disabled={!mCur.ok} onClick={() => goStep(mIdx + 1)} className="h-11 cursor-pointer rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground shadow-md transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40">Next: {mSteps[mIdx + 1]?.title}</button>
            )}
          </div>
        </div>
      </div>
      <aside className="hidden h-fit space-y-3 rounded-2xl border border-border bg-card p-5 lg:sticky lg:top-24 lg:block">
        <h4 className="text-lg font-bold">Summary</h4>
        {summaryBody}
        {todoBlock}
        <button disabled={!total || !formReady} onClick={add} className="w-full cursor-pointer rounded-full bg-primary px-5 py-3 font-bold text-primary-foreground shadow-md transition-all hover:scale-[1.02] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100">
          {addLabel}
        </button>
        {fullIds.length > 0 && (
          <div className="space-y-2 rounded-xl border border-dashed border-border p-3">
            <p className="text-xs text-muted-foreground">
              {fullIds.length} selected session{fullIds.length > 1 ? "s are" : " is"} full. Join the waitlist free — if a spot opens you'll get 24 hours to claim it, and pay only then.
            </p>
            <button disabled={!childIds.length || waitlist.busy} onClick={joinWaitlist} className="w-full cursor-pointer rounded-full border-2 border-primary px-5 py-2.5 text-sm font-bold text-primary transition-all hover:bg-primary hover:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40">
              {!waitlist.signedIn ? "Sign in to join waitlist" : waitlist.busy ? "Joining…" : childIds.length ? "Join waitlist" : "Pick a child to join waitlist"}
            </button>
            {!waitlist.signedIn && <Link to="/checkout" className="block text-center text-xs font-semibold text-muted-foreground underline">Sign in or create a family account</Link>}
          </div>
        )}
      </aside>
    </div>
  );
}

function Step({ n, title, incomplete, className = "", children }: { n: number; title: string; incomplete?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-2xl border border-border bg-background p-4 shadow-sm sm:p-5 ${className}`}>
      <p className="mb-3 flex items-center gap-2 text-base font-bold">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-xs text-secondary-foreground">{n}</span>
        {title}
        {incomplete && <span className="text-base leading-none text-destructive" aria-label="Not finished" title="Not finished">*</span>}
        {incomplete === false && <span className="ml-auto text-xs font-semibold text-success">✓ Done</span>}
      </p>
      {children}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-semibold">{v}</span>
    </div>
  );
}
