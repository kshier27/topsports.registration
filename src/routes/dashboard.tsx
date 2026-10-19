import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useFamily, type Registration, type LedgerType } from "@/lib/family";
import { ManageRegistration, changeEligibility } from "@/components/manage-registration";
import { MyWaitlist } from "@/components/waitlist";
import { decodeLine, formatPrice, formatDob, formatOutDate, type DecodedLine } from "@/data/registration";
import { toast } from "sonner";
import { WeekCalendar } from "@/components/week-calendar";
import { calendarEvent, icsEscape } from "@/lib/format";

export const Route = createFileRoute("/dashboard")({ component: DashboardPage });

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Item = { reg: Registration; d: DecodedLine; start: Date; end: Date };

function parseRange(dates: string, season: string): [Date, Date] {
  const base = Number(season.match(/\d{4}/)?.[0] ?? new Date().getFullYear());
  const spansYear = /\d{4}\s*[–-]\s*\d{2}/.test(season);
  const parse = (s: string) => {
    const [m, day] = s.trim().split(/\s+/);
    const mi = Math.max(0, MONTHS.indexOf(m));
    const year = spansYear && mi < 6 ? base + 1 : base;
    return new Date(year, mi, Number(day) || 1);
  };
  const [a, b] = dates.split("–");
  const start = parse(a);
  return [start, b ? parse(b) : start];
}

function icsDate(d: Date) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function buildIcs(items: Item[], childOf: (id: string) => { firstName: string; lastName: string } | undefined) {
  const ev = items.map(({ reg, d, start, end }) => {
    const e = calendarEvent(d, childOf(reg.childId));
    const endPlus = new Date(end);
    endPlus.setDate(endPlus.getDate() + 1);
    return [
      "BEGIN:VEVENT",
      `UID:${reg.id}@topsports.ca`,
      `DTSTART;VALUE=DATE:${icsDate(start)}`,
      `DTEND;VALUE=DATE:${icsDate(endPlus)}`,
      `SUMMARY:${icsEscape(e.title)}`,
      `LOCATION:${icsEscape(e.location)}`,
      `DESCRIPTION:${icsEscape(e.details)}`,
      "END:VEVENT",
    ].join("\n");
  });
  return `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//TOP Sports//Registration//EN\n${ev.join("\n")}\nEND:VCALENDAR`;
}

type Tab = "schedule" | "registrations" | "history";

function DashboardPage() {
  const fam = useFamily();
  const [tab, setTab] = useState<Tab>("registrations");
  const [childFilter, setChildFilter] = useState<string>("all");
  const [managing, setManaging] = useState<Registration | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [view, setView] = useState<"week" | "list">("list");
  const openOverview = (id: string) => {
    setFocusId(id);
    setTab("registrations");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const reg of fam.registrations) {
      const d = decodeLine(reg.lineId);
      if (!d) continue;
      const [start, end] = parseRange(d.session.dates, d.program.season);
      out.push({ reg, d, start, end });
    }
    return out.sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [fam.registrations]);

  const filtered = childFilter === "all" ? items : items.filter((i) => i.reg.childId === childFilter);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isActive = (i: Item) => (i.reg.status ?? "confirmed") === "confirmed";
  const upcoming = filtered.filter((i) => isActive(i) && i.end >= today);
  const past = filtered.filter((i) => !(isActive(i) && i.end >= today));
  const childName = (id: string) => fam.childById(id)?.firstName ?? "Child";
  const calHref = `data:text/calendar;charset=utf-8,${encodeURIComponent(buildIcs(filtered, (id) => fam.childById(id)))}`;

  const byMonth = upcoming.reduce<Record<string, Item[]>>((acc, i) => {
    const k = `${MONTHS[i.start.getMonth()]} ${i.start.getFullYear()}`;
    (acc[k] ??= []).push(i);
    return acc;
  }, {});

  const history = [...fam.ledger].sort((a, b) => b.date.localeCompare(a.date));
  const ledgerLabel: Record<LedgerType, string> = { payment: "Payment", refund: "Refund", credit: "Credit", credit_used: "Credit used", transfer: "Transfer" };

  const tabCls = (t: Tab) =>
    `cursor-pointer rounded-full px-4 py-2 text-sm font-semibold transition-colors ${tab === t ? "bg-primary text-primary-foreground" : "text-foreground/75 hover:bg-accent hover:text-accent-foreground"}`;

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">My Programs</p>
          <h1 className="display-condensed text-4xl font-black italic md:text-5xl">Hi, {fam.guardian.name.split(" ")[0]}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {filtered.length > 0 && (
            <a href={calHref} download="top-sports-schedule.ics" className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-semibold hover:bg-accent">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
              Sync to Calendar
            </a>
          )}
          <Link to="/account" className="inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Manage Family</Link>
        </div>
      </div>

      <MyWaitlist />

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-full border border-border bg-card p-1">
          <button className={tabCls("registrations")} onClick={() => setTab("registrations")}>Registrations</button>
          <button className={tabCls("schedule")} onClick={() => setTab("schedule")}>Schedule</button>
          <button className={tabCls("history")} onClick={() => setTab("history")}>History</button>
        </div>
        {tab !== "history" && fam.children.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {[{ id: "all", firstName: "Everyone" }, ...fam.children].map((c) => (
              <button
                key={c.id}
                onClick={() => setChildFilter(c.id)}
                className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${childFilter === c.id ? "border-primary bg-accent text-accent-foreground" : "border-border hover:bg-accent"}`}
              >
                {c.firstName}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-5">
        {items.length === 0 ? (
          <Empty />
        ) : tab === "schedule" ? (
          <div className="space-y-4">
          <div role="group" aria-label="Schedule view" className="inline-flex gap-1 rounded-full border border-border bg-card p-1">
            {([["list", "List"], ["week", "Week"]] as const).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)} className={`cursor-pointer rounded-full px-4 py-1.5 text-sm font-semibold ${view === k ? "bg-primary text-primary-foreground" : "text-foreground/75 hover:bg-accent"}`}>{l}</button>
            ))}
          </div>
          {view === "week" ? (
            <WeekCalendar
              onOpen={openOverview}
              items={filtered.filter(isActive).map((i) => ({ id: i.reg.id, title: `${i.d.program.name} · ${i.d.session.label}`, child: childName(i.reg.childId), time: i.d.session.time, days: i.d.session.days, venue: i.d.program.venue, start: i.start, end: i.end, outDates: (i.d.program.outDates ?? []).map((o) => o.date) }))}
            />
          ) : upcoming.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Nothing upcoming for this child.</p>
          ) : (
            <div className="space-y-8">
              {Object.entries(byMonth).map(([month, list]) => (
                <section key={month}>
                  <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">{month}</h3>
                  <div className="space-y-3">
                    {list.map((i) => (
                      <button type="button" key={i.reg.id} onClick={() => openOverview(i.reg.id)} className="flex w-full cursor-pointer gap-4 rounded-2xl border border-border bg-card p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring">
                        <div className="flex w-16 shrink-0 flex-col items-center justify-center rounded-xl bg-accent py-2 text-accent-foreground">
                          <span className="text-xs font-bold uppercase">{MONTHS[i.start.getMonth()]}</span>
                          <span className="text-2xl font-bold leading-none">{i.start.getDate()}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-bold">{i.d.program.name}</p>
                            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">{i.d.session.label} ({i.d.session.dates})</span>
                          </div>
                          <p className="mt-0.5 text-sm text-muted-foreground">{i.d.session.dates} · {i.d.session.days} · {i.d.session.time}</p>
                          <p className="text-sm text-muted-foreground">{i.d.program.venue}</p>
                          {(() => { const c = fam.childById(i.reg.childId); return c ? <p className="mt-1 text-sm"><span className="text-muted-foreground">Participant:</span> <span className="font-semibold">{c.firstName} {c.lastName} · {formatDob(c.dob)}</span></p> : null; })()}
                          {(i.d.program.outDates?.length ?? 0) > 0 && (
                            <p className="mt-1 text-xs text-foreground"><span className="font-bold">Out Dates:</span> {i.d.program.outDates!.map((o) => `${formatOutDate(o.date)}${o.note ? ` (${o.note})` : ""}`).join(" · ")}</p>
                          )}
                        </div>
                        <span className="flex shrink-0 flex-col items-end gap-2">
                          <span className="rounded-full bg-secondary px-3 py-1 text-xs font-bold text-secondary-foreground">{childName(i.reg.childId)}</span>
                          <span className="text-xs font-semibold text-primary">View →</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
          </div>
        ) : tab === "registrations" ? (
          <div className="space-y-4">
          {focusId && (
            <button type="button" onClick={() => setFocusId(null)} className="cursor-pointer rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-accent">← Show All Registrations</button>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            {[...upcoming, ...past].filter((i) => !focusId || i.reg.id === focusId).map((i) => {
              const status = i.reg.status ?? "confirmed";
              const done = status === "confirmed" && i.end < today;
              const canManage = status === "confirmed" && !done;
              const elig = changeEligibility(i.reg);
              const badge = done
                ? { t: "Completed", c: "bg-muted text-muted-foreground" }
                : status === "confirmed"
                  ? { t: "Confirmed", c: "bg-success text-success-foreground" }
                  : status === "transferred"
                    ? { t: "Transferred", c: "bg-info text-info-foreground" }
                    : status === "credited"
                      ? { t: "Withdrawn · credited", c: "bg-warning text-warning-foreground" }
                      : status === "refund_pending"
                        ? { t: "Refund pending", c: "bg-warning text-warning-foreground" }
                        : { t: "Refunded", c: "bg-muted text-muted-foreground" };
              const pending = status === "refund_pending" ? fam.pendingRefundFor(i.reg.id) : undefined;
              return (
                <div key={i.reg.id} className="rounded-2xl border border-border bg-card p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{i.d.program.season} · {i.d.program.category}</p>
                      <p className="mt-1 text-lg font-bold">{i.d.program.name}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${badge.c}`}>{badge.t}</span>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <dt className="text-muted-foreground">Participant</dt><dd className="font-semibold">{fam.childById(i.reg.childId)?.firstName ?? "—"} {fam.childById(i.reg.childId)?.lastName ?? ""}</dd>
                    <dt className="text-muted-foreground">Date of Birth</dt><dd className="font-semibold">{fam.childById(i.reg.childId) ? formatDob(fam.childById(i.reg.childId)!.dob) : "—"}</dd>
                    {(i.d.program.outDates?.length ?? 0) > 0 && (<><dt className="text-muted-foreground">Out Dates</dt><dd className="font-semibold">{i.d.program.outDates!.map((o) => `${formatOutDate(o.date)}${o.note ? ` (${o.note})` : ""}`).join(", ")}</dd></>)}
                    <dt className="text-muted-foreground">Session</dt><dd className="font-semibold">{i.d.session.label} · {i.d.session.dates}</dd>
                    <dt className="text-muted-foreground">Schedule</dt><dd className="font-semibold">{i.d.session.days} · {i.d.session.time}</dd>
                    <dt className="text-muted-foreground">Location</dt><dd className="font-semibold">{i.d.session.location || i.d.program.venue}</dd>
                    <dt className="text-muted-foreground">Option</dt><dd className="font-semibold">{i.d.option.label}</dd>
                    <dt className="text-muted-foreground">Add-Ons</dt><dd className="font-semibold">{i.d.addOns.length ? i.d.addOns.map((a) => a.name).join(", ") : "None"}</dd>
                    <dt className="text-muted-foreground">Friend Request</dt><dd className="font-semibold">{i.reg.friendRequest || "—"}</dd>
                    <dt className="text-muted-foreground">Paid</dt><dd className="font-semibold">{formatPrice(i.reg.amount + i.reg.tax)}</dd>
                  </dl>
                  {pending && (
                    <div className="mt-4 rounded-xl border border-border bg-muted p-3.5 text-sm">
                      <p className="font-semibold">Refund of {formatPrice(pending.refund)} under review</p>
                      <p className="text-muted-foreground">Requested {new Date(pending.createdAt).toLocaleDateString("en-CA", { month: "short", day: "numeric" })} · {formatPrice(pending.paid)} paid less {formatPrice(pending.adminFee)} admin fee</p>
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {pending && (
                      <button
                        onClick={() => {
                          if (fam.cancelRefundRequest(i.reg.id)) toast.success("Refund request cancelled — your spot is confirmed");
                        }}
                        className="cursor-pointer rounded-full border border-border px-3.5 py-2 text-xs font-semibold hover:bg-accent"
                      >
                        Cancel refund request
                      </button>
                    )}
                    {canManage && (
                      <button
                        disabled={!elig.eligible}
                        title={elig.eligible ? undefined : `Closed ${elig.deadlineText}`}
                        onClick={() => setManaging(i.reg)}
                        className="cursor-pointer rounded-full bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
                      >
                        {elig.eligible ? "Transfer or Withdraw" : "Transfers & Refunds Closed"}
                      </button>
                    )}
                  </div>
                  {canManage && (
                    <p className="mt-2 text-xs text-muted-foreground">{elig.eligible ? `Transfers and refunds available until ${elig.deadlineText} ($50 admin fee).` : `${elig.rule}. Closed ${elig.deadlineText}.`}</p>
                  )}
                </div>
              );
            })}
          </div>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="border-b border-border text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <tr><th className="px-5 py-3">Date</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">Description</th><th className="px-5 py-3 text-right">Amount</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {history.map((l) => (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap px-5 py-3.5 text-muted-foreground">{new Date(l.date).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}</td>
                    <td className="px-5 py-3.5"><span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">{ledgerLabel[l.type]}</span></td>
                    <td className="px-5 py-3.5 font-semibold">{l.description}</td>
                    <td className={`px-5 py-3.5 text-right font-semibold ${l.amount > 0 ? "text-success" : ""}`}>{l.amount === 0 ? "—" : `${l.amount > 0 ? "+" : "−"}${formatPrice(Math.abs(l.amount))}`}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-border font-bold">
                <tr><td className="px-5 py-3.5" colSpan={3}>Available Account Credit</td><td className="px-5 py-3.5 text-right">{formatPrice(fam.credit)}</td></tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
      {managing && <ManageRegistration reg={managing} open={!!managing} onOpenChange={(o) => !o && setManaging(null)} />}
    </div>
  );
}


function Empty() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
      <p className="text-lg font-bold">No Registrations Yet</p>
      <p className="mt-1 text-sm text-muted-foreground">Once you register, your family's full schedule shows up here.</p>
      <Link to="/" hash="locations" className="mt-5 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Find a Program</Link>
    </div>
  );
}
