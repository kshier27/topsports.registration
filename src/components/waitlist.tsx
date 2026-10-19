import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { useSession } from "@/lib/auth-client";
import { useCart } from "@/lib/commerce";
import { encodeLine, formatPrice, getProgram, LOCATIONS, sessionPrice } from "@/data/registration";

type Entry = Doc<"waitlist"> & { position: number | null };

const errMsg = (e: unknown) => (e instanceof Error ? e.message.replace(/^.*Uncaught Error: /, "").split("\n")[0] : "Something went wrong");

const STATUS: Record<string, { label: string; cls: string }> = {
  waiting: { label: "Waiting", cls: "bg-accent text-accent-foreground" },
  offered: { label: "Spot offered", cls: "bg-success text-success-foreground" },
  accepted: { label: "Claimed", cls: "bg-primary text-primary-foreground" },
  declined: { label: "Passed", cls: "bg-muted text-muted-foreground" },
  expired: { label: "Offer expired", cls: "bg-muted text-muted-foreground" },
  cancelled: { label: "Removed", cls: "bg-muted text-muted-foreground" },
};

function timeLeft(ms: number) {
  if (ms <= 0) return "expired";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
}

function describe(e: Entry) {
  const p = getProgram(e.programId);
  const s = p?.sessions.find((x) => x.id === e.sessionId);
  return { program: p, session: s, title: p?.name ?? e.programId, when: s ? `${s.label} · ${s.dates}` : e.sessionId };
}

export function StatusPill({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.waiting;
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${s.cls}`}>{s.label}</span>;
}

/** Family: waitlist entries + claimable offers, shown on My Schedule. */
export function MyWaitlist() {
  const { data: session } = useSession();
  const rows = useQuery(api.waitlist.mine, session ? {} : "skip") as Entry[] | null | undefined;
  const accept = useMutation(api.waitlist.acceptOffer);
  const leave = useMutation(api.waitlist.leave);
  const { addItem } = useCart();
  const [busy, setBusy] = useState<string | null>(null);

  if (!session || !rows || rows.length === 0) return null;
  const active = rows.filter((r) => r.status === "waiting" || r.status === "offered");
  const past = rows.filter((r) => r.status !== "waiting" && r.status !== "offered").slice(0, 5);

  const claim = async (e: Entry) => {
    const { program, session: s } = describe(e);
    if (!program || !s || !e.childLocalId) return toast.error("This program is no longer available online — please contact the office.");
    const optId = program.options.find((o) => o.id === e.optionId)?.id ?? program.options[0]?.id ?? e.optionId;
    setBusy(e._id);
    try {
      await accept({ id: e._id });
      const lineId = encodeLine({ programId: program.id, sessionId: s.id, optionId: optId, childId: e.childLocalId, addOnIds: [] });
      addItem({ productId: lineId, name: `${program.name} — ${s.label} · ${e.childName.split(" ")[0]}`, price: sessionPrice(program, s), imageUrl: program.image });
      toast.success("Spot claimed — it's in your cart. Complete checkout to confirm.");
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(null);
    }
  };

  const drop = async (e: Entry) => {
    setBusy(e._id);
    try {
      await leave({ id: e._id });
      toast.success(e.status === "offered" ? "Spot released to the next family" : "Removed from the waitlist");
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="mt-8 rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold">Waitlists</h2>
        <p className="text-xs text-muted-foreground">When a spot opens, the next family in line gets 24 hours to claim it.</p>
      </div>
      {active.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">You're not waiting on any sessions right now.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {active.map((e) => {
            const d = describe(e);
            const offered = e.status === "offered";
            const price = d.program && d.session ? sessionPrice(d.program, d.session) : undefined;
            return (
              <li key={e._id} className={`flex flex-wrap items-center gap-4 py-4 ${offered ? "-mx-3 rounded-xl bg-success/10 px-3" : ""}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill status={e.status} />
                    {e.status === "waiting" && e.position && <span className="text-xs font-semibold text-muted-foreground">#{e.position} in line</span>}
                    {offered && e.offerExpiresAt && <span className="text-xs font-semibold text-foreground">{timeLeft(e.offerExpiresAt - Date.now())}</span>}
                  </div>
                  <p className="mt-1 font-semibold">{e.childName} — {d.title}</p>
                  <p className="text-sm text-muted-foreground">{d.when}{price ? ` · ${formatPrice(price)}` : ""}</p>
                </div>
                <div className="flex gap-2">
                  {offered && (
                    <button disabled={busy === e._id} onClick={() => claim(e)} className="cursor-pointer rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50">
                      Claim spot
                    </button>
                  )}
                  <button disabled={busy === e._id} onClick={() => drop(e)} className="cursor-pointer rounded-full border border-border px-4 py-2.5 text-sm font-semibold hover:bg-accent disabled:opacity-50">
                    {offered ? "Pass" : "Leave"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {past.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-semibold text-muted-foreground hover:text-foreground">Past waitlist activity</summary>
          <ul className="mt-2 space-y-1.5">
            {past.map((e) => (
              <li key={e._id} className="flex flex-wrap items-center gap-2 text-muted-foreground">
                <StatusPill status={e.status} /> {e.childName} — {describe(e).title} ({describe(e).when})
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

/** Join-the-waitlist action used inside the registration panel. */
export function useJoinWaitlist() {
  const { data: session } = useSession();
  const join = useMutation(api.waitlist.join);
  const [busy, setBusy] = useState(false);
  const run = async (items: { programId: string; locationSlug: string; sessionId: string; optionId: string; childLocalId: string; childName: string; childDob: string }[], parentName: string) => {
    if (!session) {
      toast.error("Sign in to your family account to join a waitlist.");
      return false;
    }
    setBusy(true);
    try {
      const res: { duplicate: boolean; position: number | null }[] = [];
      for (const it of items) res.push(await join({ ...it, parentName }));
      const fresh = res.filter((r) => !r.duplicate);
      const pos = fresh.map((r) => r.position).filter(Boolean);
      toast.success(
        fresh.length === 0
          ? "Already on the waitlist for that session."
          : `Added to ${fresh.length} waitlist${fresh.length > 1 ? "s" : ""}${pos.length === 1 ? ` — #${pos[0]} in line` : ""}. We'll email you when a spot opens.`,
      );
      return true;
    } catch (e) {
      toast.error(errMsg(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { run, busy, signedIn: !!session };
}

/** Staff: waitlist queues by session, with manual offer/remove controls. */
export function WaitlistAdmin() {
  const rows = useQuery(api.waitlist.listAll, {}) as Entry[] | undefined;
  const offer = useMutation(api.waitlist.staffOffer);
  const remove = useMutation(api.waitlist.staffRemove);
  const [loc, setLoc] = useState("all");
  const [showResolved, setShowResolved] = useState(false);

  const groups = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const r of rows ?? []) {
      if (loc !== "all" && r.locationSlug !== loc) continue;
      if (!showResolved && r.status !== "waiting" && r.status !== "offered") continue;
      const k = `${r.programId}|${r.sessionId}`;
      map.set(k, [...(map.get(k) ?? []), r]);
    }
    return [...map.entries()].map(([k, list]) => ({ key: k, list: list.sort((a, b) => a.createdAt - b.createdAt) }));
  }, [rows, loc, showResolved]);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  if (rows === undefined) return <div className="h-40 animate-pulse rounded-2xl bg-muted" />;
  const waiting = rows.filter((r) => r.status === "waiting").length;
  const offered = rows.filter((r) => r.status === "offered").length;
  const claimed = rows.filter((r) => r.status === "accepted").length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[["Waiting", waiting], ["Offers open", offered], ["Spots claimed", claimed], ["Sessions with a queue", new Set(rows.filter((r) => r.status === "waiting").map((r) => r.sessionId)).size]].map(([k, val]) => (
          <div key={k} className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{k}</p>
            <p className="mt-1 text-2xl font-bold">{val}</p>
          </div>
        ))}
      </div>
      <p className="rounded-xl border border-border bg-muted/50 p-4 text-sm text-muted-foreground">
        Spots are offered automatically, oldest request first, whenever a family withdraws, transfers out or receives an approved refund. Each offer is held for 24 hours, then passes to the next family. Use <strong className="text-foreground">Offer next spot</strong> after raising a session's capacity.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {[{ slug: "all", name: "All locations" }, ...LOCATIONS].map((l) => (
          <button key={l.slug} onClick={() => setLoc(l.slug)} className={`cursor-pointer rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${loc === l.slug ? "bg-primary text-primary-foreground" : "bg-muted text-foreground/75 hover:bg-accent"}`}>
            {l.name}
          </button>
        ))}
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
          Show resolved
        </label>
      </div>
      {groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center">
          <p className="font-semibold">No families on a waitlist</p>
          <p className="mt-1 text-sm text-muted-foreground">When a session fills up, families can join its waitlist from the registration page.</p>
        </div>
      ) : (
        groups.map(({ key, list }) => {
          const d = describe(list[0]);
          const hasWaiting = list.some((r) => r.status === "waiting");
          return (
            <div key={key} className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/40 px-5 py-3">
                <div>
                  <p className="font-bold">{d.title}</p>
                  <p className="text-sm text-muted-foreground">{d.when}{d.session ? ` · ${d.session.enrolled}/${d.session.capacity} enrolled` : ""}</p>
                </div>
                <button disabled={!hasWaiting} onClick={() => act(() => offer({ programId: list[0].programId, sessionId: list[0].sessionId }), "Spot offered to the next family")} className="cursor-pointer rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40">
                  Offer next spot
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    <tr><th className="px-5 py-2.5">#</th><th className="px-3 py-2.5">Child</th><th className="px-3 py-2.5">Parent</th><th className="px-3 py-2.5">Joined</th><th className="px-3 py-2.5">Status</th><th className="px-5 py-2.5 text-right">Actions</th></tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {list.map((r) => (
                      <tr key={r._id}>
                        <td className="px-5 py-3 font-semibold">{r.position ?? "—"}</td>
                        <td className="px-3 py-3 font-semibold">{r.childName}</td>
                        <td className="px-3 py-3"><span className="block">{r.parentName}</span><span className="text-xs text-muted-foreground">{r.parentEmail}</span></td>
                        <td className="px-3 py-3 text-muted-foreground">{new Date(r.createdAt).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}</td>
                        <td className="px-3 py-3"><StatusPill status={r.status} />{r.status === "offered" && r.offerExpiresAt && <span className="ml-2 text-xs text-muted-foreground">{timeLeft(r.offerExpiresAt - Date.now())}</span>}</td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            {r.status === "waiting" && <button onClick={() => act(() => offer({ id: r._id as Id<"waitlist"> }), `Spot offered to ${r.childName}`)} className="cursor-pointer rounded-full border border-border px-3 py-1.5 text-xs font-semibold hover:bg-accent">Offer</button>}
                            {(r.status === "waiting" || r.status === "offered") && <button onClick={() => act(() => remove({ id: r._id as Id<"waitlist"> }), "Removed from waitlist")} className="cursor-pointer rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10">Remove</button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })
      )}
      <p className="text-xs text-muted-foreground">Need help? Families can always view their spot in line on <Link to="/dashboard" className="underline">My Schedule</Link>.</p>
    </div>
  );
}
