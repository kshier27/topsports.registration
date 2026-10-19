import { useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { LOCATIONS, PROGRAMS, getLocation, sessionName } from "@/data/registration";
import { STARTER_TEMPLATES } from "@/data/email-templates";

const FIELDS = ["parentName", "childName", "programName", "sessionName", "dates", "days", "time", "venue", "location", "season", "day"];
const inputCls = "h-10 w-full rounded-lg border border-input bg-card px-3.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";
const labelCls = "block text-xs font-semibold text-muted-foreground";
const chip = (on: boolean) => `cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${on ? "bg-primary text-primary-foreground" : "border border-border hover:bg-accent"}`;

type Mode = "program" | "multi" | "filtered" | "everyone";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_RE = /(mon|tue|wed|thu|fri|sat|sun)[a-z]*/gi;
/** Weekday indexes (0 = Mon) mentioned in a days string like "Mon – Fri" or "Mondays & Wednesdays". */
function daysIn(str?: string): Set<number> {
  const out = new Set<number>();
  if (!str) return out;
  const s = str.toLowerCase();
  if (/daily|every day|7 days/.test(s)) { for (let i = 0; i < 7; i++) out.add(i); return out; }
  const idx = (w: string) => DAY_NAMES.findIndex((d) => w.toLowerCase().startsWith(d.toLowerCase()));
  const range = /(mon|tue|wed|thu|fri|sat|sun)[a-z]*\s*(?:–|—|-|to)\s*(mon|tue|wed|thu|fri|sat|sun)[a-z]*/gi;
  let m: RegExpExecArray | null;
  while ((m = range.exec(s))) {
    const a = idx(m[1]), b = idx(m[2]);
    for (let i = a; ; i = (i + 1) % 7) { out.add(i); if (i === b) break; }
  }
  for (const w of s.match(DAY_RE) ?? []) out.add(idx(w));
  return out;
}

const LEGACY_STARTERS: { name: string; subject: string; body: string }[] = [
  { name: "Program Reminder", subject: "Reminder: {{programName}} starts soon", body: "Hi {{parentName}},\n\nA reminder that {{childName}}'s {{programName}} ({{sessionName}}) runs {{dates}}, {{days}}, {{time}} at {{venue}}.\n\nPlease arrive 10 minutes early for drop-off.\n\nSee you soon,\nTOP Sports" },
  { name: "Weather / Closure", subject: "Update for {{day}}: {{programName}}", body: "Hi {{parentName}},\n\nDue to weather, {{programName}} at {{venue}} is cancelled on {{day}}. We'll be in touch about a make-up date.\n\nThank you for understanding,\nTOP Sports" },
  { name: "What to Bring", subject: "What to bring to {{programName}}", body: "Hi {{parentName}},\n\nFor {{childName}}'s {{programName}}, please pack:\n- Water bottle\n- Nut-free lunch and snacks\n- Running shoes\n- Sunscreen and a hat\n\nSee you at {{venue}}!\nTOP Sports" },
  { name: "Registration Open", subject: "Registration is open for {{season}}", body: "Hi {{parentName}},\n\nRegistration for our next season is now open. Spots fill quickly, so sign in to My Programs to reserve your place.\n\nThanks for being part of TOP Sports!" },
];

const LEGACY_NAMES = new Set(LEGACY_STARTERS.map((t) => t.name));
const STARTER_GROUPS = [...new Set(STARTER_TEMPLATES.map((t) => t.group))];

export function ProgramEmail() {
  const send = useAction(api.staffOps.sendProgramEmail);
  const preview = useAction(api.staffOps.previewAudience);
  const sendTest = useAction(api.staffOps.sendTestEmail);
  const previewReply = useAction(api.staffOps.previewReplyTo);
  const schedule = useMutation(api.staffTools.scheduleEmail);
  const saved = useQuery(api.staffTools.listStaffTemplates, {});
  const saveTpl = useMutation(api.staffTools.saveStaffTemplate);
  const delTpl = useMutation(api.staffTools.deleteStaffTemplate);

  const [mode, setMode] = useState<Mode>("program");
  const [later, setLater] = useState(false);
  const [sendAt, setSendAt] = useState("");
  const [loc, setLoc] = useState(LOCATIONS[0].slug);
  const programs = PROGRAMS.filter((p) => p.locationSlug === loc);
  const [programId, setProgramId] = useState(programs[0]?.id ?? "");
  const program = PROGRAMS.find((p) => p.id === programId);
  const [keys, setKeys] = useState<string[]>([]);
  const [fLocs, setFLocs] = useState<string[]>([]);
  const [multiIds, setMultiIds] = useState<string[]>([]);
  const [mLoc, setMLoc] = useState("");
  const [mVenue, setMVenue] = useState("");
  const [mDays, setMDays] = useState<number[]>([]);
  const [mSeason, setMSeason] = useState("");
  const [mCat, setMCat] = useState("");
  const [mSearch, setMSearch] = useState("");
  const [fSeasons, setFSeasons] = useState<string[]>([]);
  const [fCats, setFCats] = useState<string[]>([]);
  const [day, setDay] = useState("");
  const [both, setBoth] = useState(true);
  const [subject, setSubject] = useState("{{programName}} update for {{childName}}");
  const [body, setBody] = useState("Hi {{parentName}},\n\nA quick note about {{childName}}'s {{programName}} — {{sessionName}} at {{venue}}.\n\n\n\nSee you soon,\nTOP Sports");
  const [busy, setBusy] = useState(false);
  const [replyTo, setReplyTo] = useState("");
  const [replyInfo, setReplyInfo] = useState<{ replyTo: string; varies: boolean } | null>(null);
  const [reach, setReach] = useState<{ count: number; sample: string[] } | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [tplName, setTplName] = useState("");

  const seasons = useMemo(() => [...new Set(PROGRAMS.map((p) => p.season).filter(Boolean))].sort(), []);
  const cats = useMemo(() => [...new Set(PROGRAMS.map((p) => p.category).filter(Boolean))].sort(), []);
  const toggle = (list: string[], set: (v: string[]) => void, val: string) => { set(list.includes(val) ? list.filter((x) => x !== val) : [...list, val]); setReach(null); };

  const venuesOf = (p: (typeof PROGRAMS)[number]) => [...new Set([p.venue, ...p.sessions.flatMap((s) => [s.location, ...(s.slots ?? []).map((t) => t.location)])].map((x) => (x ?? "").trim()).filter(Boolean))];
  const daysOf = (p: (typeof PROGRAMS)[number]) => { const d = new Set<number>(); for (const s of p.sessions) { daysIn(s.days).forEach((i) => d.add(i)); for (const t of s.slots ?? []) daysIn(t.days).forEach((i) => d.add(i)); } return d; };
  const mVenues = useMemo(() => [...new Set(PROGRAMS.filter((p) => !mLoc || p.locationSlug === mLoc).flatMap(venuesOf))].sort(), [mLoc]);
  const shown = useMemo(() => PROGRAMS.filter((p) => {
    if (mLoc && p.locationSlug !== mLoc) return false;
    if (mVenue && !venuesOf(p).includes(mVenue)) return false;
    if (mSeason && p.season !== mSeason) return false;
    if (mCat && p.category !== mCat) return false;
    if (mDays.length) { const d = daysOf(p); if (!mDays.some((i) => d.has(i))) return false; }
    if (mSearch.trim() && !p.name.toLowerCase().includes(mSearch.trim().toLowerCase())) return false;
    return true;
  }), [mLoc, mVenue, mSeason, mCat, mDays, mSearch]);
  const allShownOn = shown.length > 0 && shown.every((p) => multiIds.includes(p.id));
  const selectShown = () => { setMultiIds(allShownOn ? multiIds.filter((id) => !shown.some((p) => p.id === id)) : [...new Set([...multiIds, ...shown.map((p) => p.id)])]); setReach(null); };

  const insert = (f: string) => setBody((b) => `${b}{{${f}}}`);

  const label = () => {
    if (mode === "everyone") return "Entire database";
    if (mode === "program") return program?.name ?? "";
    if (mode === "multi") {
      const names = PROGRAMS.filter((p) => multiIds.includes(p.id)).map((p) => p.name);
      return names.length <= 3 ? names.join(", ") : `${names.length} programs: ${names.slice(0, 2).join(", ")} + ${names.length - 2} more`;
    }
    const parts = [
      fLocs.length ? fLocs.map((s) => getLocation(s)?.name ?? s).join(", ") : "All locations",
      fSeasons.length ? fSeasons.join(", ") : "All seasons",
      fCats.length ? fCats.join(", ") : "All sports",
    ];
    return parts.join(" · ");
  };

  const buildPayload = () => ({
    audience: {
      mode,
      programId: mode === "program" ? program?.id : undefined,
      sessionKeys: mode === "program" ? keys : undefined,
      programIds: mode === "multi" ? multiIds : undefined,
      locations: mode === "filtered" ? fLocs : undefined,
      seasons: mode === "filtered" ? fSeasons : undefined,
      categories: mode === "filtered" ? fCats : undefined,
    },
    label: label(),
    day: day || undefined,
    includeSecondGuardian: both,
    subject,
    body,
    replyTo: replyTo.trim() || undefined,
    catalog: PROGRAMS.map((p) => ({
      id: p.id,
      name: p.name,
      venue: p.venue,
      location: getLocation(p.locationSlug)?.name ?? "",
      locationSlug: p.locationSlug,
      season: p.season,
      category: p.category,
      sessions: p.sessions.map((s) => ({
        id: s.id, name: sessionName(s), dates: s.dates, days: s.days, time: s.time,
        slots: (s.slots ?? []).map((t) => ({ id: t.id, label: t.label, dates: t.dates, days: t.days, time: t.time })),
      })),
    })),
  });

  const checkReach = async () => {
    try { setReach(await preview(buildPayload())); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not count recipients"); }
  };

  const replyOk = !replyTo.trim() || /^\S+@\S+\.\S+$/.test(replyTo.trim());
  const checkReply = async () => {
    try { setReplyInfo(await previewReply(buildPayload())); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not check reply-to"); }
  };

  const test = async () => {
    try { const r = await sendTest(buildPayload()); toast.success(`Test sent to ${r.to}`); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not send test"); }
  };

  const submit = async () => {
    if (mode === "program" && !program) return;
    if (mode === "multi" && multiIds.length === 0) { toast.error("Pick at least one program"); return; }
    if (mode === "everyone" && !confirmAll) { toast.error("Tick the box to confirm emailing every family"); return; }
    setBusy(true);
    try {
      const payload = buildPayload();
      if (later) {
        const at = new Date(sendAt).getTime();
        if (!sendAt || !Number.isFinite(at)) throw new Error("Pick a date and time to send");
        await schedule({
          payload: JSON.stringify(payload),
          sendAt: at,
          programId: mode === "program" ? program!.id : mode === "multi" ? multiIds.join(",") : mode,
          programName: payload.label,
          sessionLabel: mode === "program" ? (keys.length ? `${keys.length} session pick${keys.length === 1 ? "" : "s"}` : "All sessions") : mode === "everyone" ? "Entire database" : mode === "multi" ? `${multiIds.length} program${multiIds.length === 1 ? "" : "s"}` : "Filtered audience",
          subject,
        });
        toast.success(`Scheduled for ${new Date(at).toLocaleString("en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`);
        setLater(false);
        setSendAt("");
        return;
      }
      const res = await send(payload);
      if (res.sent + res.failed + res.skipped === 0) toast("No families match this selection yet.");
      else toast.success(`Sent ${res.sent} email${res.sent === 1 ? "" : "s"}${res.failed ? ` · ${res.failed} failed` : ""}`);
      setConfirmAll(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send emails");
    } finally {
      setBusy(false);
    }
  };

  const applyTpl = (t: { subject: string; body: string }) => { setSubject(t.subject); setBody(t.body); toast.success("Template loaded"); };
  const save = async () => {
    try { await saveTpl({ name: tplName, subject, body }); toast.success("Template saved"); setTplName(""); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not save template"); }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5 rounded-2xl border border-border bg-card p-4 sm:p-6">
        {/* Audience */}
        <section className="space-y-3 rounded-xl border border-border p-4">
          <h3 className="text-lg font-bold">1. Who Gets It</h3>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Audience">
            {([["program", "One Program"], ["multi", "Multiple Programs"], ["filtered", "By Location, Season or Sport"], ["everyone", "Entire Database"]] as const).map(([m, l]) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => { setMode(m); setReach(null); setConfirmAll(false); }} className={chip(mode === m)}>{l}</button>
            ))}
          </div>

          {mode === "program" && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={labelCls}>Location
                  <select value={loc} onChange={(e) => { setLoc(e.target.value); const first = PROGRAMS.find((p) => p.locationSlug === e.target.value); setProgramId(first?.id ?? ""); setKeys([]); setReach(null); }} className={`${inputCls} mt-1.5`}>
                    {LOCATIONS.map((l) => <option key={l.slug} value={l.slug}>TOP Sports {l.name}</option>)}
                  </select>
                </label>
                <label className={labelCls}>Program
                  <select value={programId} onChange={(e) => { setProgramId(e.target.value); setKeys([]); setReach(null); }} className={`${inputCls} mt-1.5`}>
                    {programs.length === 0 && <option value="">No programs at this location</option>}
                    {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
              </div>
              {program && (
                <div>
                  <p className={labelCls}>Sessions & Session Options <span className="font-normal">(none ticked = every session)</span></p>
                  <div className="mt-1.5 max-h-64 space-y-1.5 overflow-auto rounded-lg bg-muted/50 p-2.5">
                    {program.sessions.map((s) => (
                      <div key={s.id}>
                        <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={keys.includes(s.id)} onChange={() => toggle(keys, setKeys, s.id)} className="h-4 w-4 accent-primary" /><span className="font-semibold">{sessionName(s)}</span><span className="text-xs text-muted-foreground">{s.dates}</span></label>
                        {(s.slots ?? []).length > 0 && (
                          <div className="ml-6 mt-1 space-y-1">
                            {(s.slots ?? []).map((t) => {
                              const k = `${s.id}~${t.id}`;
                              return <label key={k} className="flex cursor-pointer items-center gap-2 text-xs"><input type="checkbox" checked={keys.includes(k) || keys.includes(s.id)} disabled={keys.includes(s.id)} onChange={() => toggle(keys, setKeys, k)} className="h-3.5 w-3.5 accent-primary" />{t.label || "Option"}{t.time ? ` · ${t.time}` : ""}</label>;
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {mode === "multi" && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Narrow the list, then tick the programs to email, for example every program at one venue on Mondays. Every session of each ticked program is included.</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className={labelCls}>Location
                  <select value={mLoc} onChange={(e) => { setMLoc(e.target.value); setMVenue(""); }} className={`${inputCls} mt-1.5`}>
                    <option value="">All locations</option>
                    {LOCATIONS.map((l) => <option key={l.slug} value={l.slug}>TOP Sports {l.name}</option>)}
                  </select>
                </label>
                <label className={labelCls}>Venue
                  <select value={mVenue} onChange={(e) => setMVenue(e.target.value)} className={`${inputCls} mt-1.5`}>
                    <option value="">All venues</option>
                    {mVenues.map((vn) => <option key={vn} value={vn}>{vn}</option>)}
                  </select>
                </label>
                <label className={labelCls}>Search
                  <input value={mSearch} onChange={(e) => setMSearch(e.target.value)} placeholder="Program name" className={`${inputCls} mt-1.5`} />
                </label>
                <label className={labelCls}>Season
                  <select value={mSeason} onChange={(e) => setMSeason(e.target.value)} className={`${inputCls} mt-1.5`}>
                    <option value="">All seasons</option>
                    {seasons.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label className={labelCls}>Sport
                  <select value={mCat} onChange={(e) => setMCat(e.target.value)} className={`${inputCls} mt-1.5`}>
                    <option value="">All sports</option>
                    {cats.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              </div>
              <div>
                <p className={labelCls}>Runs on <span className="font-normal">(any of the ticked days)</span></p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {DAY_NAMES.map((d, i) => <button key={d} type="button" aria-pressed={mDays.includes(i)} onClick={() => setMDays(mDays.includes(i) ? mDays.filter((x) => x !== i) : [...mDays, i])} className={chip(mDays.includes(i))}>{d}</button>)}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground"><span className="font-bold text-foreground">{multiIds.length}</span> selected · {shown.length} shown</p>
                <div className="flex gap-2">
                  <button type="button" onClick={selectShown} disabled={shown.length === 0} className="cursor-pointer rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold hover:bg-accent disabled:opacity-50">{allShownOn ? "Untick All Shown" : "Tick All Shown"}</button>
                  <button type="button" onClick={() => { setMultiIds([]); setReach(null); }} disabled={multiIds.length === 0} className="cursor-pointer rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold hover:bg-accent disabled:opacity-50">Clear</button>
                </div>
              </div>
              <div className="max-h-72 space-y-1 overflow-auto rounded-lg bg-muted/50 p-2.5">
                {shown.length === 0 && <p className="p-4 text-center text-xs text-muted-foreground">No programs match these filters. Try clearing a filter.</p>}
                {shown.map((p) => {
                  const d = daysOf(p);
                  return (
                    <label key={p.id} className="flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-card">
                      <input type="checkbox" checked={multiIds.includes(p.id)} onChange={() => toggle(multiIds, setMultiIds, p.id)} className="mt-0.5 h-4 w-4 accent-primary" />
                      <span className="min-w-0">
                        <span className="block font-semibold">{p.name}</span>
                        <span className="block text-xs text-muted-foreground">{getLocation(p.locationSlug)?.name ?? p.locationSlug} · {p.venue} · {p.season}{d.size ? ` · ${DAY_NAMES.filter((_, i) => d.has(i)).join(", ")}` : ""}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
              {multiIds.some((id) => !shown.some((p) => p.id === id)) && <p className="text-xs text-muted-foreground">Some ticked programs are hidden by your filters. They're still included.</p>}
            </div>
          )}

          {mode === "filtered" && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Families with an active registration in any matching program. Leave a row empty to include all.</p>
              <div><p className={labelCls}>Regions / Locations</p><div className="mt-1.5 flex flex-wrap gap-1.5">{LOCATIONS.map((l) => <button key={l.slug} type="button" onClick={() => toggle(fLocs, setFLocs, l.slug)} className={chip(fLocs.includes(l.slug))}>{l.name}</button>)}</div></div>
              <div><p className={labelCls}>Seasons</p><div className="mt-1.5 flex flex-wrap gap-1.5">{seasons.length === 0 ? <span className="text-xs text-muted-foreground">No seasons yet</span> : seasons.map((s) => <button key={s} type="button" onClick={() => toggle(fSeasons, setFSeasons, s)} className={chip(fSeasons.includes(s))}>{s}</button>)}</div></div>
              <div><p className={labelCls}>Sports</p><div className="mt-1.5 flex flex-wrap gap-1.5">{cats.map((c) => <button key={c} type="button" onClick={() => toggle(fCats, setFCats, c)} className={chip(fCats.includes(c))}>{c}</button>)}</div></div>
            </div>
          )}

          {mode === "everyone" && (
            <div className="space-y-2 rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm">
              <p>Emails every family account, plus every parent on a current registration. Each address gets one copy.</p>
              <p className="text-xs text-muted-foreground">Program fields like {"{{programName}}"} are blank for families without a registration, so keep the wording general.</p>
              <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={confirmAll} onChange={(e) => setConfirmAll(e.target.checked)} className="h-4 w-4 accent-primary" />I understand this emails the entire database</label>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelCls}>Specific day for {"{{day}}"} (optional)
              <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className={`${inputCls} mt-1.5`} />
            </label>
            <label className="flex cursor-pointer items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={both} onChange={(e) => { setBoth(e.target.checked); setReach(null); }} className="h-4 w-4 accent-primary" />Also email the second parent/guardian</label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => void checkReach()} disabled={(mode === "program" && !program) || (mode === "multi" && multiIds.length === 0)} className="cursor-pointer rounded-full border border-border px-4 py-2 text-xs font-semibold hover:bg-accent disabled:opacity-50">Count Recipients</button>
            {reach && <p className="text-sm"><span className="font-bold">{reach.count}</span> email address{reach.count === 1 ? "" : "es"}{reach.sample.length > 0 && <span className="text-muted-foreground"> · e.g. {reach.sample.slice(0, 3).join(", ")}</span>}</p>}
          </div>
        </section>

        {/* Message */}
        <section className="space-y-3 rounded-xl border border-border p-4">
          <h3 className="text-lg font-bold">2. Message</h3>
          <div>
            <p className={labelCls}>Start from a template <span className="font-normal">({STARTER_TEMPLATES.length} ready-made, fully written. Edit anything before sending)</span></p>
            <div className="mt-1.5 max-h-72 space-y-3 overflow-auto rounded-lg bg-muted/50 p-3">
              {STARTER_GROUPS.map((g) => (
                <div key={g}>
                  <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">{g}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {STARTER_TEMPLATES.filter((t) => t.group === g).map((t) => <button key={t.name} type="button" title={LEGACY_NAMES.has(t.name) ? "Updated template" : t.subject} onClick={() => applyTpl(t)} className={`${chip(false)} bg-card`}>{t.name}</button>)}
                  </div>
                </div>
              ))}
            </div>
            {(saved ?? []).length > 0 && <p className={`${labelCls} mt-3`}>Your saved templates</p>}
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {(saved ?? []).map((t) => (
                <span key={t._id} className="inline-flex items-center rounded-full border border-primary/40 bg-accent text-xs font-semibold text-accent-foreground">
                  <button type="button" onClick={() => applyTpl(t)} className="cursor-pointer py-1.5 pl-3.5 pr-1.5">★ {t.name}</button>
                  <button type="button" aria-label={`Delete template ${t.name}`} onClick={() => { if (confirm(`Delete the "${t.name}" template?`)) void delTpl({ id: t._id as Id<"staffEmailTemplates"> }).then(() => toast.success("Template deleted")); }} className="cursor-pointer rounded-full px-2 py-1.5 hover:text-destructive">✕</button>
                </span>
              ))}
            </div>
          </div>
          <div>
            <label className={labelCls}>Reply-to <span className="font-normal">(optional, for this send only)</span>
              <input type="email" value={replyTo} onChange={(e) => { setReplyTo(e.target.value); setReplyInfo(null); }} placeholder="Leave blank to use the location inbox" className={`${inputCls} mt-1.5 ${replyOk ? "" : "border-destructive"}`} />
            </label>
            {!replyOk && <p className="mt-1 text-xs text-destructive">Enter a full email address, e.g. coach@topsports.ca</p>}
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{replyTo.trim() ? "Parent replies go to this address." : mode === "everyone" ? "Blank = replies go to the support email in Settings." : "Blank = replies go to each family's program location inbox (Settings → Locations)."}</span>
              <button type="button" onClick={() => void checkReply()} disabled={!replyOk || (mode === "program" && !program)} className="cursor-pointer rounded-full border border-border px-2.5 py-1 font-semibold text-foreground hover:bg-accent disabled:opacity-50">Check Reply-to</button>
              {replyInfo && <span className="font-semibold text-foreground">→ {replyInfo.replyTo}{replyInfo.varies ? " (and other location inboxes)" : ""}</span>}
            </div>
          </div>
          <label className={labelCls}>Subject<input value={subject} onChange={(e) => setSubject(e.target.value)} className={`${inputCls} mt-1.5`} /></label>
          <label className={labelCls}>Message
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={18} className="mt-1.5 w-full rounded-lg border border-input bg-card px-3.5 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <div>
            <p className={labelCls}>Insert fill field</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {FIELDS.map((f) => <button key={f} type="button" onClick={() => insert(f)} className="cursor-pointer rounded-full border border-border px-2.5 py-1 font-mono text-xs hover:bg-accent">{`{{${f}}}`}</button>)}
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className={`${labelCls} min-w-0 flex-1`}>Save as template
              <input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="e.g. Camp Week Reminder" className={`${inputCls} mt-1.5`} />
            </label>
            <button type="button" disabled={!tplName.trim() || !subject.trim() || !body.trim()} onClick={() => void save()} className="h-10 cursor-pointer rounded-full border border-border px-4 text-sm font-semibold hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50">Save Template</button>
          </div>
        </section>

        {/* Send */}
        <section className="space-y-3 rounded-xl border border-border p-4">
          <h3 className="text-lg font-bold">3. Send</h3>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="When to send">
            <button type="button" role="radio" aria-checked={!later} onClick={() => setLater(false)} className={chip(!later)}>Send Now</button>
            <button type="button" role="radio" aria-checked={later} onClick={() => setLater(true)} className={chip(later)}>Send Later</button>
          </div>
          {later && (
            <label className={labelCls}>Send on (your local time)
              <input type="datetime-local" value={sendAt} onChange={(e) => setSendAt(e.target.value)} className={`${inputCls} mt-1.5`} />
              <span className="mt-1 block font-normal">Families who match at send time receive it. Cancel any time from the list below.</span>
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!subject.trim() || !body.trim() || !replyOk} onClick={() => void test()} className="cursor-pointer rounded-full border border-border px-5 py-3 text-sm font-semibold hover:bg-accent disabled:opacity-50">Send Test to Me</button>
            <button disabled={busy || !replyOk || (mode === "program" && !program) || (mode === "multi" && multiIds.length === 0) || (mode === "everyone" && !confirmAll) || !subject.trim() || !body.trim() || (later && !sendAt)} onClick={() => void submit()} className="cursor-pointer rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
              {busy ? (later ? "Scheduling…" : "Sending…") : later ? "Schedule Email" : mode === "everyone" ? "Send to Entire Database" : "Send to Families"}
            </button>
          </div>
        </section>
      </div>
      <aside className="h-fit space-y-2 rounded-2xl border border-border bg-card p-5 text-sm lg:sticky lg:top-24">
        <h4 className="text-lg font-bold">Audience</h4>
        <p className="rounded-xl bg-accent p-3.5 text-accent-foreground">{label() || "Pick a program"}</p>
        {mode === "multi" && <p className="text-muted-foreground">{multiIds.length} program{multiIds.length === 1 ? "" : "s"} · all sessions</p>}
        {mode === "program" && program && <p className="text-muted-foreground">{keys.length ? `${keys.length} session pick${keys.length === 1 ? "" : "s"}` : "All sessions"} · {program.venue}</p>}
        <p className="text-xs text-muted-foreground">Each address gets one email, even with several children. {"{{childName}}"} lists all of that family's children, e.g. "William & Emma".</p>
        <p className="text-xs text-muted-foreground">"Send Test to Me" sends one copy to your own email, filled with the first matching family's details.</p>
      </aside>
    </div>
  );
}
