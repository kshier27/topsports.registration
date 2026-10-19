import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { PROGRAMS, formatPrice } from "@/data/registration";

const inputCls = "h-10 w-full rounded-lg border border-input bg-card px-3.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";
const when = (t: number) => new Date(t).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });

function regLabel(programId: string, sessionId: string) {
  const p = PROGRAMS.find((x) => x.id === programId);
  const [sid, slotId] = sessionId.split("~");
  const s = p?.sessions.find((x) => x.id === sid);
  const slot = slotId ? s?.slots?.find((t) => t.id === slotId) : undefined;
  return `${p?.name ?? "Program"}${s ? ` — ${s.label}` : ""}${slot ? ` (${slot.label})` : ""}`;
}

/** Co-parent / second guardian access: invite, accept, and view shared families. */
export function CoParentAccess() {
  const access = useQuery(api.staffTools.myFamilyAccess, {});
  const shared = useQuery(api.staffTools.sharedFamilies, {});
  const invite = useMutation(api.staffTools.inviteCoParent);
  const accept = useMutation(api.staffTools.acceptCoParent);
  const remove = useMutation(api.staffTools.removeCoParent);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await invite({ email });
      toast.success(`Invite sent to ${email.trim()}`);
      setEmail("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send invite");
    } finally {
      setBusy(false);
    }
  };
  const drop = async (id: string, msg: string) => {
    if (!confirm(msg)) return;
    try { await remove({ id: id as Id<"familyMembers"> }); toast("Access removed"); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Could not remove access"); }
  };

  const pending = (access?.toMe ?? []).filter((m) => m.status === "invited");

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-6" aria-labelledby="coparent-h">
      <h2 id="coparent-h" className="text-xl font-bold">Co-Parent Access</h2>
      <p className="mt-1 text-sm text-muted-foreground">Invite a second parent or guardian. They create their own login with their own email and password, then see your children, schedule and receipts.</p>

      {pending.length > 0 && (
        <div className="mt-4 space-y-2">
          {pending.map((m) => (
            <div key={m._id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary bg-accent p-4 text-accent-foreground">
              <p className="text-sm"><span className="font-bold">{m.ownerName}</span> invited you to share their family account.</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => void accept({ id: m._id }).then(() => toast.success(`You now have access to ${m.ownerName}'s family`))} className="cursor-pointer rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Accept</button>
                <button type="button" onClick={() => void drop(m._id, "Decline this invite?")} className="cursor-pointer rounded-full border border-border bg-card px-5 py-2 text-sm font-semibold text-foreground hover:bg-muted">Decline</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={(e) => void send(e)} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="coparent-email">Co-parent email</label>
        <input id="coparent-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Their email address" className={inputCls} />
        <button disabled={busy || !email.trim()} className="h-10 shrink-0 cursor-pointer rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Sending…" : "Send Invite"}</button>
      </form>

      {access === undefined ? (
        <div className="mt-4 h-12 animate-pulse rounded-xl bg-muted" />
      ) : (access?.invited ?? []).length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">No one else has access to your family account yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
          {access!.invited.map((m) => (
            <li key={m._id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-semibold">{m.email}</p>
                <p className="text-xs text-muted-foreground">{m.status === "active" ? `Active since ${when(m.acceptedAt ?? m.invitedAt)}` : `Invited ${when(m.invitedAt)} · waiting for them to accept`}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${m.status === "active" ? "bg-success text-success-foreground" : "bg-warning text-warning-foreground"}`}>{m.status === "active" ? "Active" : "Invited"}</span>
                <button type="button" onClick={() => void drop(m._id, `Remove ${m.email}'s access to your family account?`)} className="cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10">Remove</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {(shared ?? []).map((f) => (
        <div key={f.id} className="mt-6 rounded-xl border border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-bold">{f.ownerName}'s Family <span className="ml-1 text-xs font-normal text-muted-foreground">(shared with you)</span></h3>
            <button type="button" onClick={() => void drop(f.id, `Leave ${f.ownerName}'s family account?`)} className="cursor-pointer rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold hover:bg-accent">Leave</button>
          </div>
          <p className="mt-2 text-sm"><span className="font-semibold">Children:</span> {f.children.length ? f.children.map((c) => `${c.firstName} ${c.lastName}`).join(", ") : "None yet"}</p>
          {f.registrations.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No active registrations.</p>
          ) : (
            <ul className="mt-2 space-y-1.5 text-sm">
              {f.registrations.map((r) => (
                <li key={r._id} className="rounded-lg bg-muted px-3 py-2"><span className="font-semibold">{r.childName}</span> · {regLabel(r.programId, r.sessionId)} · {formatPrice(r.amountCents / 100)}</li>
              ))}
            </ul>
          )}
          {f.payments.length > 0 && (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer font-semibold text-primary">Receipts ({f.payments.length})</summary>
              <ul className="mt-2 space-y-1">
                {f.payments.map((p) => <li key={p._id} className="flex justify-between gap-3 text-xs"><span className="truncate">{when(p.createdAt)} · {p.description}</span><span className="shrink-0 font-semibold">{formatPrice(Math.abs(p.amountCents) / 100)}</span></li>)}
              </ul>
            </details>
          )}
        </div>
      ))}
    </section>
  );
}
