import { useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";

type Player = { _id: string; childName: string; childDob: string; medicalNotes?: string };

const inputCls = "h-10 w-full rounded-lg border border-input bg-card px-3.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";

/** Staff: split one session roster into groups (Group A/B/C, by birth year, etc.). */
export function RosterGroups({ programId, sessionId, title, players, groups, onClose }: {
  programId: string;
  sessionId: string;
  title: string;
  players: Player[];
  groups: Record<string, string>;
  onClose: () => void;
}) {
  const assign = useMutation(api.rosterGroups.assign);
  const [draft, setDraft] = useState<Record<string, string>>(groups);
  const [names, setNames] = useState<string[]>(() => {
    const used = [...new Set(Object.values(groups).filter(Boolean))];
    return used.length ? used : ["Group A", "Group B", "Group C"];
  });
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(groups), [groups]);

  const dirty = players.some((p) => (draft[p._id] ?? "") !== (groups[p._id] ?? ""));
  const unassigned = players.filter((p) => !draft[p._id]);
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of players) if (draft[p._id]) m[draft[p._id]] = (m[draft[p._id]] ?? 0) + 1;
    return m;
  }, [draft, players]);

  const addName = () => {
    const n = newName.trim();
    if (!n || names.includes(n)) return;
    setNames([...names, n]);
    setNewName("");
  };
  const byBirthYear = () => {
    const next: Record<string, string> = {};
    const years = new Set<string>();
    for (const p of players) {
      const y = p.childDob?.slice(0, 4);
      if (!y) continue;
      next[p._id] = `Born ${y}`;
      years.add(`Born ${y}`);
    }
    setDraft(next);
    setNames([...years].sort());
  };
  const evenSplit = () => {
    if (names.length === 0) return;
    const sorted = [...players].sort((a, b) => (a.childDob ?? "").localeCompare(b.childDob ?? ""));
    const next: Record<string, string> = {};
    const size = Math.ceil(sorted.length / names.length);
    sorted.forEach((p, i) => (next[p._id] = names[Math.min(names.length - 1, Math.floor(i / size))]));
    setDraft(next);
  };
  const save = async () => {
    setBusy(true);
    try {
      await assign({ programId, sessionId, assignments: players.map((p) => ({ registrationId: p._id, group: draft[p._id] ?? "" })) });
      toast.success("Groups saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save groups");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-5 print:hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold">Groups — {title}</h3>
          <p className="text-sm text-muted-foreground">Assign each player to a group. Groups show on the roster, print and Coach Sheet.</p>
        </div>
        <button type="button" onClick={onClose} className="h-10 cursor-pointer rounded-full border border-border px-4 text-sm font-semibold hover:bg-accent">Done</button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {names.map((n) => (
          <span key={n} className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
            {n} <span className="text-muted-foreground">({counts[n] ?? 0})</span>
            <button type="button" aria-label={`Remove ${n}`} onClick={() => { setNames(names.filter((x) => x !== n)); setDraft(Object.fromEntries(Object.entries(draft).map(([k, g]) => [k, g === n ? "" : g]))); }} className="cursor-pointer text-muted-foreground hover:text-destructive">×</button>
          </span>
        ))}
        <form onSubmit={(e) => { e.preventDefault(); addName(); }} className="flex gap-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New group name" className="h-8 w-36 rounded-full border border-input bg-card px-3 text-xs outline-none focus:ring-2 focus:ring-ring" />
          <button className="cursor-pointer rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground">Add</button>
        </form>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={byBirthYear} className="h-9 cursor-pointer rounded-full border border-border px-4 text-xs font-semibold hover:bg-accent">Group by Birth Year</button>
        <button type="button" onClick={evenSplit} disabled={names.length === 0 || players.length === 0} className="h-9 cursor-pointer rounded-full border border-border px-4 text-xs font-semibold hover:bg-accent disabled:opacity-40">Split Evenly (oldest first)</button>
        <button type="button" onClick={() => setDraft({})} className="h-9 cursor-pointer rounded-full px-3 text-xs font-semibold text-muted-foreground hover:text-foreground">Clear All</button>
      </div>

      {players.length === 0 ? (
        <p className="rounded-xl bg-muted p-6 text-center text-sm text-muted-foreground">No players in this session yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {[...players].sort((a, b) => a.childName.localeCompare(b.childName)).map((p) => (
            <li key={p._id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{p.medicalNotes?.trim() && <span className="mr-1.5 text-destructive" aria-label="Has medical notes">⚠</span>}{p.childName}</p>
                <p className="text-xs text-muted-foreground">Born {p.childDob?.slice(0, 4) || "—"}</p>
              </div>
              <select value={draft[p._id] ?? ""} onChange={(e) => setDraft({ ...draft, [p._id]: e.target.value })} aria-label={`Group for ${p.childName}`} className={`${inputCls} w-44`}>
                <option value="">Unassigned</option>
                {[...new Set([...names, ...(draft[p._id] ? [draft[p._id]] : [])])].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{unassigned.length > 0 ? `${unassigned.length} player${unassigned.length === 1 ? "" : "s"} not in a group yet.` : "Every player is in a group."}</p>
        <button type="button" onClick={() => void save()} disabled={busy || !dirty} className="h-10 cursor-pointer rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40">{busy ? "Saving…" : dirty ? "Save Groups" : "Saved"}</button>
      </div>
    </div>
  );
}
