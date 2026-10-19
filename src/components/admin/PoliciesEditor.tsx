import { useState } from "react";
import { FormattedText } from "@/components/formatted-text";
import { ORIGINAL_WAIVERS, type Waiver } from "@/data/registration";

const inputCls =
  "h-10 w-full rounded-lg border border-input bg-card px-3.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";
const areaCls =
  "w-full rounded-lg border border-input bg-card px-3.5 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";
const labelCls = "block text-xs font-semibold text-muted-foreground";

const slug = (t: string) =>
  t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "policy";

export function PoliciesEditor({ waivers, onChange }: { waivers: Waiver[]; onChange: (w: Waiver[]) => void }) {
  const [openId, setOpenId] = useState<string | null>(waivers[0]?.id ?? null);
  const [preview, setPreview] = useState<Record<string, boolean>>({});
  const upd = (id: string, patch: Partial<Waiver>) => onChange(waivers.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= waivers.length) return;
    const next = [...waivers];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const add = () => {
    const id = `${slug("new policy")}-${crypto.randomUUID().slice(0, 4)}`;
    onChange([...waivers, { id, title: "New Policy", summary: "", text: "" }]);
    setOpenId(id);
  };
  const remove = (w: Waiver) => {
    if (!confirm(`Remove "${w.title}"? Programs using it will stop asking families to agree to it once you save.`)) return;
    onChange(waivers.filter((x) => x.id !== w.id));
  };
  const restore = () => {
    if (!confirm("Restore the original six policies? Your edits to them will be replaced. Save afterwards to apply.")) return;
    const custom = waivers.filter((w) => !ORIGINAL_WAIVERS.some((o) => o.id === w.id));
    onChange([...ORIGINAL_WAIVERS.map((w) => ({ ...w })), ...custom]);
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Waivers & Policies</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Families must open each policy and check I AGREE before registering. Pick which policies apply to each program in the Program Builder.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={restore} className="cursor-pointer rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-accent">Restore Originals</button>
            <button type="button" onClick={add} className="cursor-pointer rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">+ Add Policy</button>
          </div>
        </div>
        <div className="mt-4 rounded-xl bg-muted/60 p-3.5 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground">Formatting</p>
          <p className="mt-1">Leave a blank line between paragraphs. A short line on its own becomes a heading (or start it with ##). Start lines with "-" for bullets. Wrap words in **double asterisks** for bold. "Label: text" shows the label in bold.</p>
        </div>
      </div>

      {waivers.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center">
          <p className="font-semibold">No policies yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Families won't be asked to agree to anything until you add one.</p>
          <button type="button" onClick={add} className="mt-4 cursor-pointer rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">+ Add Policy</button>
        </div>
      )}

      {waivers.map((w, i) => {
        const open = openId === w.id;
        return (
          <div key={w.id} className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="flex items-center gap-2 px-4 py-3 sm:px-5">
              <button type="button" aria-expanded={open} onClick={() => setOpenId(open ? null : w.id)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`shrink-0 transition-transform ${open ? "rotate-90" : ""}`}><path d="m9 6 6 6-6 6" /></svg>
                <span className="truncate font-bold">{w.title || "Untitled Policy"}</span>
                {!w.text.trim() && <span className="shrink-0 rounded-full bg-warning px-2.5 py-0.5 text-xs font-bold text-warning-foreground">No text</span>}
              </button>
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="h-8 cursor-pointer rounded-lg border border-border px-2.5 text-xs font-semibold hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40">↑</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === waivers.length - 1} aria-label="Move down" className="h-8 cursor-pointer rounded-lg border border-border px-2.5 text-xs font-semibold hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40">↓</button>
            </div>
            {open && (
              <div className="space-y-4 border-t border-border p-4 sm:p-5">
                <label className={labelCls}>Policy Title
                  <input value={w.title} onChange={(e) => upd(w.id, { title: e.target.value })} className={`${inputCls} mt-1.5`} />
                </label>
                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className={labelCls}>Full Policy Text</span>
                    <div className="flex rounded-lg border border-border p-0.5 text-xs font-semibold">
                      <button type="button" onClick={() => setPreview({ ...preview, [w.id]: false })} className={`cursor-pointer rounded-md px-3 py-1 ${!preview[w.id] ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Edit</button>
                      <button type="button" onClick={() => setPreview({ ...preview, [w.id]: true })} className={`cursor-pointer rounded-md px-3 py-1 ${preview[w.id] ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Preview</button>
                    </div>
                  </div>
                  {preview[w.id] ? (
                    <div className="min-h-40 rounded-lg border border-border bg-muted/50 p-4 text-sm leading-relaxed text-foreground">
                      {w.text.trim() ? <FormattedText text={w.text} /> : <p className="text-muted-foreground">Nothing to preview yet.</p>}
                    </div>
                  ) : (
                    <textarea rows={12} value={w.text} onChange={(e) => upd(w.id, { text: e.target.value })} className={areaCls} />
                  )}
                </div>
                <div className="flex justify-end">
                  <button type="button" onClick={() => remove(w)} className="cursor-pointer rounded-full border border-destructive/40 px-4 py-2 text-sm font-semibold text-destructive hover:bg-destructive/10">Remove Policy</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
