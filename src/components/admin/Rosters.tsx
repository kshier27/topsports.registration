import { useMemo, useState } from "react";
import { byStartDesc } from "@/lib/format";
import { useQuery } from "convex/react";
import { RosterGroups } from "@/components/admin/RosterGroups";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { LOCATIONS, SEED_PROGRAMS, parseProgram, formatDob, sessionLocation, type Program } from "@/data/registration";
import { CoachSheet } from "@/components/admin/MoreReports";
import { StaffNote } from "@/components/admin/StaffTools";

const inputCls =
  "h-10 w-full rounded-lg border border-input bg-card px-3.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";
const labelCls = "block text-xs font-semibold text-muted-foreground";

type RosterReg = {
  _id: string;
  userId: string;
  staffNote?: string;
  childName: string;
  childDob: string;
  parentName: string;
  parentEmail: string;
  parentPhone?: string;
  jerseySize?: string;
  friendRequest?: string;
  medicalNotes?: string;
  authorizedPickup?: string;
  guardian2Name?: string;
  guardian2Phone?: string;
  emergencyContact?: string;
  childSchool?: string;
  childAddress?: string;
  customAnswers?: { question: string; answer: string }[];
  status: string;
};

type Col = { id: string; label: string; get?: (r: RosterReg) => string; custom?: boolean };

const DEFAULT_COLS: Col[] = [
  { id: "player", label: "Player Name", get: (r) => r.childName },
  { id: "dob", label: "Player DOB", get: (r) => (r.childDob ? formatDob(r.childDob) : "") },
  { id: "parent", label: "Parent Name", get: (r) => r.parentName },
  { id: "phone", label: "Parent Phone", get: (r) => r.parentPhone ?? "" },
  { id: "jersey", label: "Jersey Size", get: (r) => r.jerseySize ?? "" },
  { id: "friend", label: "Friend Request", get: (r) => r.friendRequest ?? "" },
  { id: "medical", label: "Medical Information", get: (r) => r.medicalNotes ?? "" },
];

const EXTRA_COLS: Col[] = [
  { id: "pickup", label: "Authorized Pickup", get: (r) => r.authorizedPickup ?? "" },
  { id: "email", label: "Parent Email", get: (r) => r.parentEmail },
  { id: "g2", label: "Guardian 2", get: (r) => [r.guardian2Name, r.guardian2Phone].filter(Boolean).join(" · ") },
  { id: "emergency", label: "Emergency Contact", get: (r) => r.emergencyContact ?? "" },
  { id: "school", label: "School", get: (r) => r.childSchool ?? "" },
  { id: "address", label: "Address", get: (r) => r.childAddress ?? "" },
  { id: "answers", label: "Program Questions", get: (r) => (r.customAnswers ?? []).map((a) => `${a.question}: ${a.answer}`).join(" · ") },
];

function downloadCsv(filename: string, rows: string[][]) {
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const blob = new Blob([rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  toast.success(`Downloaded ${filename}`);
}

export function RosterList() {
  const regs = useQuery(api.reports.allRegistrations, {}) as RosterReg[] | null | undefined;
  const managed = useQuery(api.programAdmin.listManaged, {});
  const catalog = useMemo(() => {
    const map = new Map<string, Program>(SEED_PROGRAMS.map((p) => [p.id, p]));
    for (const m of managed ?? []) {
      const p = parseProgram(m.data);
      if (p) map.set(p.id, p);
    }
    return [...map.values()];
  }, [managed]);

  const [loc, setLoc] = useState(LOCATIONS[0].slug);
  const [programId, setProgramId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [cols, setCols] = useState<Col[]>(DEFAULT_COLS);
  const [newCol, setNewCol] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [medicalOnly, setMedicalOnly] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [coach, setCoach] = useState(false);
  const [grouping, setGrouping] = useState(false);
  const [byGroup, setByGroup] = useState(false);
  const togglePick = (id: string) => setPicked((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));

  const programs = catalog.filter((p) => p.locationSlug === loc).sort(byStartDesc);
  const program = programs.find((p) => p.id === programId) ?? programs[0];
  const session = program?.sessions.find((s) => s.id === sessionId) ?? program?.sessions[0];
  const location = LOCATIONS.find((l) => l.slug === loc);
  const groupRows = useQuery(api.rosterGroups.listForSession, program && session ? { programId: program.id, sessionId: session.id } : "skip");
  const groupOf = useMemo(() => Object.fromEntries((groupRows ?? []).map((g) => [g.registrationId, g.group])) as Record<string, string>, [groupRows]);
  const hasGroups = Object.keys(groupOf).length > 0;

  const roster = useMemo(() => {
    if (!regs || !program || !session) return [];
    return regs
      .filter((r) => (r as unknown as { programId: string }).programId === program.id && (r as unknown as { sessionId: string }).sessionId === session.id && (r.status === "confirmed" || r.status === "refund_pending"))
      .filter((r) => !medicalOnly || !!(r.medicalNotes && r.medicalNotes.trim()) || !!(r as unknown as { authorizedPickup?: string }).authorizedPickup)
      .sort((a, b) => (byGroup ? (groupOf[a._id] || "~").localeCompare(groupOf[b._id] || "~") : 0) || a.childName.localeCompare(b.childName));
  }, [regs, program, session, medicalOnly, byGroup, groupOf]);

  const addCol = (c: Col) => !cols.some((x) => x.id === c.id) && setCols([...cols, c]);
  const addCustom = () => {
    const n = newCol.trim();
    if (!n) return;
    addCol({ id: `custom-${n.toLowerCase()}`, label: n, custom: true });
    setNewCol("");
  };
  const cell = (r: RosterReg, c: Col) => (c.id === "group" ? groupOf[r._id] ?? "" : c.custom ? values[`${r._id}|${c.id}`] ?? "" : c.get?.(r) ?? "");
  const shownCols: Col[] = hasGroups && !cols.some((c) => c.id === "group") ? [{ id: "group", label: "Group" }, ...cols] : cols;

  const exportCsv = () => {
    if (!program || !session) return;
    downloadCsv(`roster-${program.id}-${session.id}.csv`, [
      [`${program.name} — ${session.label} (${session.dates})`],
      shownCols.map((c) => c.label),
      ...roster.map((r) => shownCols.map((c) => cell(r, c))),
    ]);
  };

  const pickedRows = roster.filter((r) => picked.includes(r._id));
  const emailPicked = () => {
    const emails = [...new Set(pickedRows.map((r) => r.parentEmail).filter(Boolean))];
    if (emails.length === 0) return;
    window.location.href = `mailto:?bcc=${encodeURIComponent(emails.join(","))}&subject=${encodeURIComponent(`${program?.name ?? ""} — ${session?.label ?? ""}`)}`;
  };
  const exportPicked = () => {
    if (!program || !session) return;
    downloadCsv(`roster-${program.id}-${session.id}-selected.csv`, [[`${program.name} — ${session.label} (${session.dates})`], shownCols.map((c) => c.label), ...pickedRows.map((r) => shownCols.map((c) => cell(r, c)))]);
  };

  if (catalog.length === 0) return <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Create a program first, then its rosters appear here.</p>;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 rounded-2xl border border-border bg-card p-5 sm:grid-cols-3 print:hidden">
        <label className={labelCls}>1. Location
          <select value={loc} onChange={(e) => { setLoc(e.target.value); setProgramId(""); setSessionId(""); }} className={`${inputCls} mt-1.5`}>
            {LOCATIONS.map((l) => <option key={l.slug} value={l.slug}>{l.name}</option>)}
          </select>
        </label>
        <label className={labelCls}>2. Program
          <select value={program?.id ?? ""} onChange={(e) => { setProgramId(e.target.value); setSessionId(""); }} disabled={programs.length === 0} className={`${inputCls} mt-1.5`}>
            {programs.length === 0 && <option>No programs at this location</option>}
            {programs.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.season}</option>)}
          </select>
        </label>
        <label className={labelCls}>3. Session
          <select value={session?.id ?? ""} onChange={(e) => setSessionId(e.target.value)} disabled={!program} className={`${inputCls} mt-1.5`}>
            {program?.sessions.map((s) => <option key={s.id} value={s.id}>{s.label} · {s.dates}</option>)}
          </select>
        </label>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 print:hidden">
        <p className="text-sm font-bold">Roster Columns</p>
        <p className="text-xs text-muted-foreground">Remove any column, add saved registration fields, or add a blank column to fill in.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {cols.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
              {c.label}
              <button onClick={() => setCols(cols.filter((x) => x.id !== c.id))} aria-label={`Remove ${c.label}`} className="cursor-pointer text-muted-foreground hover:text-destructive">×</button>
            </span>
          ))}
          {[...DEFAULT_COLS, ...EXTRA_COLS].filter((c) => !cols.some((x) => x.id === c.id)).map((c) => (
            <button key={c.id} onClick={() => addCol(c)} className="cursor-pointer rounded-full border border-dashed border-border px-3 py-1 text-xs font-semibold text-muted-foreground hover:bg-accent">+ {c.label}</button>
          ))}
          <form onSubmit={(e) => { e.preventDefault(); addCustom(); }} className="flex gap-2">
            <input value={newCol} onChange={(e) => setNewCol(e.target.value)} placeholder="Custom Column" className="h-8 w-36 rounded-full border border-input bg-card px-3 text-xs outline-none focus:ring-2 focus:ring-ring" />
            <button className="cursor-pointer rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground">Add</button>
          </form>
        </div>
      </div>

      {grouping && !coach && program && session && (
        <RosterGroups programId={program.id} sessionId={session.id} title={`${program.name} — ${session.label}`} players={roster} groups={groupOf} onClose={() => setGrouping(false)} />
      )}
      {coach && program && session && <CoachSheet program={program} sessionId={session.id} rows={byGroup || hasGroups ? [...roster].sort((a, b) => (groupOf[a._id] || "~").localeCompare(groupOf[b._id] || "~") || a.childName.localeCompare(b.childName)).map((r) => (groupOf[r._id] ? { ...r, childName: `${r.childName} [${groupOf[r._id]}]` } : r)) : roster} onClose={() => setCoach(false)} />}
      {!coach && program && session && (
        <div className="print-roster overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex flex-wrap items-end justify-between gap-4 bg-primary px-5 py-5 text-primary-foreground print:bg-primary">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider opacity-80">{location?.name ?? "TOP Sports"} · Roster</p>
              <h2 className="display-condensed mt-1 text-2xl font-black italic md:text-3xl">{program.name}</h2>
              <p className="mt-1 text-sm font-semibold">{session.label} · {session.dates}{medicalOnly ? " · Medical & Pickup Report" : ""}</p>
              <p className="text-xs opacity-85">{session.days} · {session.time} · {sessionLocation(program, session)}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-primary-foreground/15 px-4 py-2 text-center">
                <p className="text-2xl font-bold leading-none">{roster.length}</p>
                <p className="text-xs font-bold uppercase tracking-wider opacity-85">of {session.capacity}</p>
              </div>
              <div className="flex flex-wrap gap-2 print:hidden">
                <button onClick={() => setMedicalOnly((m) => !m)} className={`cursor-pointer rounded-full px-4 py-2 text-sm font-semibold ${medicalOnly ? "bg-destructive text-white" : "border border-primary-foreground/50 hover:bg-primary-foreground/10"}`}>{medicalOnly ? "Showing Medical & Pickup" : "Medical & Pickup Report"}</button>
                <button onClick={() => { setGrouping((g) => !g); setCoach(false); }} disabled={roster.length === 0} className={`cursor-pointer rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50 ${grouping ? "bg-primary-foreground text-primary" : "border border-primary-foreground/50 hover:bg-primary-foreground/10"}`}>Groups</button>
                {hasGroups && <button onClick={() => setByGroup((b) => !b)} className={`cursor-pointer rounded-full px-4 py-2 text-sm font-semibold ${byGroup ? "bg-primary-foreground text-primary" : "border border-primary-foreground/50 hover:bg-primary-foreground/10"}`}>{byGroup ? "Sorted by Group" : "Sort by Group"}</button>}
                <button onClick={() => setCoach(true)} disabled={roster.length === 0} className="cursor-pointer rounded-full border border-primary-foreground/50 px-4 py-2 text-sm font-semibold hover:bg-primary-foreground/10 disabled:opacity-50">Coach Sheet</button>
                <button onClick={() => window.print()} disabled={roster.length === 0} className="cursor-pointer rounded-full bg-primary-foreground px-4 py-2 text-sm font-semibold text-primary hover:opacity-90 disabled:opacity-50">Print</button>
                <button onClick={exportCsv} disabled={roster.length === 0} className="cursor-pointer rounded-full border border-primary-foreground/50 px-4 py-2 text-sm font-semibold hover:bg-primary-foreground/10 disabled:opacity-50">Export CSV</button>
              </div>
            </div>
          </div>

          {roster.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/50 px-4 py-2.5 text-sm print:hidden">
              <label className="inline-flex cursor-pointer items-center gap-2 font-semibold">
                <input type="checkbox" className="h-4 w-4 accent-primary" checked={picked.length > 0 && pickedRows.length === roster.length} onChange={(e) => setPicked(e.target.checked ? roster.map((r) => r._id) : [])} aria-label="Select all players" />
                {pickedRows.length > 0 ? `${pickedRows.length} selected` : "Select all"}
              </label>
              {pickedRows.length > 0 && (
                <div className="ml-auto flex flex-wrap gap-2">
                  <button onClick={emailPicked} className="h-9 cursor-pointer rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90">Email Parents</button>
                  <button onClick={exportPicked} className="h-9 cursor-pointer rounded-full border border-border bg-card px-4 text-xs font-semibold hover:bg-accent">Export Selected</button>
                  <button onClick={() => setPicked([])} className="h-9 cursor-pointer rounded-full px-3 text-xs font-semibold text-muted-foreground hover:text-foreground">Clear</button>
                </div>
              )}
            </div>
          )}
          {regs === undefined ? (
            <div className="space-y-2 p-5">{[0, 1, 2].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />)}</div>
          ) : roster.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted-foreground">No players registered in this session yet. Confirmed registrations appear here automatically.</p>
          ) : (
            <>
            <ul className="divide-y divide-border md:hidden print:hidden">
              {roster.map((r, idx) => (
                <li key={r._id} className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    <input type="checkbox" checked={picked.includes(r._id)} onChange={() => togglePick(r._id)} className="mt-1 h-5 w-5 shrink-0 accent-primary" aria-label={`Select ${r.childName}`} />
                    <div className="min-w-0">
                      <p className="font-semibold">
                        <span className="mr-1.5 text-xs text-muted-foreground">{idx + 1}.</span>{r.childName}
                        {r.medicalNotes?.trim() && <span className="ml-2 rounded-full bg-destructive px-2 py-0.5 text-xs font-bold text-destructive-foreground" title="Medical notes">⚠ Medical</span>}
                        {r.status === "refund_pending" && <span className="ml-2 rounded-full bg-warning px-2 py-0.5 text-xs font-bold text-warning-foreground">Refund Pending</span>}
                        {groupOf[r._id] && <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-accent-foreground">{groupOf[r._id]}</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">{cols.filter((c) => !c.custom && c.id !== "player" && c.id !== "medical").slice(0, 3).map((c) => cell(r, c)).filter(Boolean).join(" · ")}</p>
                      {r.medicalNotes?.trim() && <p className="mt-1 text-xs font-semibold text-destructive">{r.medicalNotes}</p>}
                      <StaffNote key={`${r._id}-${r.staffNote ?? ""}`} registrationId={r._id} userId={r.userId} initial={r.staffNote} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block print:block">
              <table className="w-full min-w-[860px] text-sm print:min-w-0 print:text-xs">
                <thead className="bg-secondary text-left text-xs font-bold uppercase tracking-wider text-secondary-foreground">
                  <tr>
                    <th className="w-8 px-3 py-3 print:hidden"><span className="sr-only">Select</span></th>
                    <th className="w-10 px-3 py-3">#</th>
                    {shownCols.map((c) => <th key={c.id} className="px-3 py-3">{c.label}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {roster.map((r, idx) => (
                    <tr key={r._id} className="align-top odd:bg-card even:bg-muted/40 print:break-inside-avoid">
                      <td className="px-3 py-2.5 print:hidden"><input type="checkbox" checked={picked.includes(r._id)} onChange={() => togglePick(r._id)} className="h-4 w-4 accent-primary" aria-label={`Select ${r.childName}`} /></td>
                      <td className="px-3 py-2.5 text-xs font-bold text-muted-foreground">{idx + 1}</td>
                      {shownCols.map((c) => (
                        <td key={c.id} className="px-3 py-2.5">
                          {c.id === "group" ? (
                            groupOf[r._id] ? <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-accent-foreground">{groupOf[r._id]}</span> : <span className="text-muted-foreground">—</span>
                          ) : c.custom ? (
                            <input value={values[`${r._id}|${c.id}`] ?? ""} onChange={(e) => setValues({ ...values, [`${r._id}|${c.id}`]: e.target.value })} className="h-8 w-full min-w-24 rounded-md border border-input bg-card px-2 text-xs outline-none focus:ring-2 focus:ring-ring print:border-0 print:bg-transparent" />
                          ) : c.id === "player" ? (
                            <span className="font-semibold">{r.medicalNotes?.trim() && <span className="mr-1.5 text-destructive print:hidden" title="Medical notes" aria-label="Has medical notes">⚠</span>}{r.childName}{r.status === "refund_pending" && <span className="ml-2 rounded-full bg-warning px-2 py-0.5 text-xs font-bold text-warning-foreground">Refund Pending</span>}<StaffNote key={`${r._id}-${r.staffNote ?? ""}`} registrationId={r._id} userId={r.userId} initial={r.staffNote} /></span>
                          ) : c.id === "medical" ? (
                            r.medicalNotes ? <span className="font-semibold text-destructive">{r.medicalNotes}</span> : <span className="text-muted-foreground">None</span>
                          ) : (
                            cell(r, c) || <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
