import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useFamily, type Child } from "@/lib/family";
import { useSession } from "@/lib/auth-client";
import { FamilySignIn } from "@/components/family-signin";
import { CoParentAccess } from "@/components/co-parent";
import { SignedWaivers, type SignedWaiverRow } from "@/components/signed-waivers";
import { decodeLine, formatDob, formatPrice, isCamp, programWaivers, sessionLocation, sessionRange } from "@/data/registration";

/** Only the mandatory fields count toward "profile complete". */
const PROFILE_FIELDS: (keyof Child)[] = ["firstName", "lastName", "dob", "address", "city", "postalCode", "school", "emergencyName", "emergencyPhone", "emergencyRelationship"];
const profilePct = (c: Child) => Math.round((PROFILE_FIELDS.filter((k) => String(c[k] ?? "").trim()).length / PROFILE_FIELDS.length) * 100);

const icsDate = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
function icsHref(title: string, dates: string, season: string, location: string, details: string) {
  const [a, b] = sessionRange(dates, season);
  const end = new Date(b.getTime() + 86400000);
  const esc = (x: string) => x.replace(/[,;\\]/g, (m) => "\\" + m).replace(/\n/g, "\\n");
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//TOP Sports//Registration//EN", "BEGIN:VEVENT", `UID:${crypto.randomUUID()}@topsports.ca`, `DTSTAMP:${icsDate(new Date())}T000000Z`, `DTSTART;VALUE=DATE:${icsDate(a)}`, `DTEND;VALUE=DATE:${icsDate(end)}`, `SUMMARY:${esc(title)}`, `LOCATION:${esc(location)}`, `DESCRIPTION:${esc(details)}`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  return "data:text/calendar;charset=utf-8," + encodeURIComponent(ics);
}
function googleHref(title: string, dates: string, season: string, location: string, details: string) {
  const [a, b] = sessionRange(dates, season);
  const end = new Date(b.getTime() + 86400000);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${icsDate(a)}/${icsDate(end)}&location=${encodeURIComponent(location)}&details=${encodeURIComponent(details)}`;
}

const REQ_STEPS = ["Requested", "Approved", "Refunded"] as const;
import { SITE } from "@/lib/site-settings";
import { calendarEvent } from "@/lib/format";

const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const Route = createFileRoute("/account")({ component: AccountPage });

const emptyChild = { firstName: "", lastName: "", dob: "", medical: "", gender: "", address: "", city: "", postalCode: "", school: "", grade: "", healthCard: "", emergencyName: "", emergencyPhone: "", emergencyRelationship: "" };

const GRADES = ["Pre-K", "JK", "SK", ...Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`)];
const CITIES = ["Toronto", "Oakville", "Mississauga", "Burlington", "Milton", "Markham", "Richmond Hill", "Vaughan", "Aurora", "Newmarket", "Whitby", "Oshawa", "Ajax", "Pickering", "Brampton"];
const GUARDIAN_REL = ["Mother", "Father", "Stepmother", "Stepfather", "Grandparent", "Legal Guardian", "Other"];
const EMERGENCY_REL = ["Grandparent", "Aunt", "Uncle", "Adult Sibling", "Family Friend", "Neighbour", "Nanny / Caregiver", "Other Relative"];
const MEDICAL = ["Peanut / nut allergy", "Tree nut allergy", "Dairy allergy", "Egg allergy", "Bee sting allergy", "Asthma", "Diabetes", "Epilepsy", "ADHD", "Autism", "Requires EpiPen", "Requires inhaler"];
const splitMedical = (m?: string) => (m ?? "").split(/\s*;\s*/).map((x) => x.trim()).filter(Boolean);

const fromChild = (c: Child) => ({ ...emptyChild, ...Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined)) }) as typeof emptyChild;

function AccountPage() {
  const { data: session, isPending } = useSession();
  if (isPending)
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <div className="h-64 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  if (!session)
    return (
      <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
        <h1 className="display-condensed mb-6 text-4xl font-black italic md:text-5xl">My Family</h1>
        <div className="rounded-2xl border border-border bg-card p-8">
          <FamilySignIn note="Sign in once and we'll keep you signed in on this device." />
        </div>
      </div>
    );
  return <AccountContent />;
}

function AccountContent() {
  const fam = useFamily();
  const [g, setG] = useState(fam.guardian);
  const [g2, setG2] = useState(fam.guardian2 ?? { name: "", email: "", phone: "", relationship: "" });
  const [draft, setDraft] = useState(emptyChild);
  const [editing, setEditing] = useState<Child | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [medInput, setMedInput] = useState("");

  const saveChild = (e: React.FormEvent) => {
    e.preventDefault();
    const norm = (x?: string) => (x ?? "").trim().toLowerCase();
    const parents = [fam.guardian?.name, fam.guardian2?.name].map(norm).filter(Boolean);
    if (parents.includes(norm(draft.emergencyName))) {
      toast.error("Emergency contact must be someone other than a parent or guardian on this account");
      return;
    }
    const parentPhones = [fam.guardian?.phone, fam.guardian2?.phone].map((x) => (x ?? "").replace(/\D/g, "")).filter(Boolean);
    if (parentPhones.includes((draft.emergencyPhone ?? "").replace(/\D/g, ""))) {
      toast.error("Emergency contact phone can't be a parent or guardian's phone number");
      return;
    }
    draft.city = (draft.city ?? "").trim();
    draft.medical = (draft.medical ?? "").trim();
    if (editing) {
      fam.updateChild({ ...editing, ...draft });
      toast.success(`${draft.firstName} updated`);
    } else {
      fam.addChild(draft);
      toast.success(`${draft.firstName} added to your family`);
    }
    setDraft(emptyChild);
    setEditing(null);
    setFormOpen(false);
    setMedInput("");
  };
  const meds = splitMedical(draft.medical);
  const setMeds = (list: string[]) => setDraft({ ...draft, medical: list.join("; ") });
  const toggleMed = (m: string) => setMeds(meds.includes(m) ? meds.filter((x) => x !== m) : [...meds, m]);
  const addCustomMed = () => {
    const v = medInput.trim();
    if (!v) return;
    if (!meds.some((x) => x.toLowerCase() === v.toLowerCase())) setMeds([...meds, v]);
    setMedInput("");
  };

  const inputCls = "h-10 w-full rounded-lg border border-input bg-card px-3.5 text-sm outline-none focus:ring-2 focus:ring-ring";
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const childDirty = editing ? !same(draft, fromChild(editing)) : !same(draft, emptyChild);
  const gDirty = !same(g, fam.guardian);
  const g2Base = fam.guardian2 ?? { name: "", email: "", phone: "", relationship: "" };
  const norm2 = (x: { name?: string; email?: string; phone?: string; relationship?: string }) => [x.name ?? "", x.email ?? "", x.phone ?? "", x.relationship ?? ""];
  const g2Dirty = !same(norm2(g2), norm2(g2Base));
  const saveCls = "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display-condensed text-4xl font-black italic md:text-5xl">The {fam.guardian.name.split(" ").slice(-1)[0]} Family</h1>
        </div>
        <div className="rounded-2xl border border-border bg-card px-5 py-3 text-right">
          <p className="text-xs text-muted-foreground">Account credit</p>
          <p className="text-2xl font-bold">{formatPrice(fam.credit)}</p>
        </div>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        <section className="space-y-4 rounded-2xl border border-border bg-card p-6 lg:col-span-2">
          <h2 className="text-xl font-bold">Children</h2>
          {fam.children.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No children yet. Tap Add a Child below to get started.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {fam.children.map((c) => (
                <div key={c.id} className="rounded-xl border border-border p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold">{c.firstName} {c.lastName}</p>
                      <p className="text-sm text-muted-foreground">DOB {c.dob}{c.school ? ` · ${c.school}` : ""}</p>
                      {c.address && <p className="text-xs text-muted-foreground">{c.address}, {c.city} {c.postalCode}</p>}
                      {(() => {
                        const pct = profilePct(c);
                        return (
                          <div className="mt-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className={pct === 100 ? "font-semibold text-success" : "font-semibold text-foreground"}>{pct === 100 ? "Profile complete" : `Profile ${pct}% complete`}</span>
                              {pct < 100 && <button type="button" onClick={() => { setEditing(c); setDraft(fromChild(c)); setFormOpen(true); }} className="cursor-pointer font-semibold text-primary hover:underline">Finish</button>}
                            </div>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${c.firstName}'s profile completeness`}>
                              <div className={`h-full rounded-full ${pct === 100 ? "bg-success" : "bg-primary"}`} style={{ width: `${pct}%` }} />
                            </div>
                            {pct < 100 && <p className="mt-1 text-xs text-muted-foreground">Fill in the required address, school and emergency contact details so registration is faster.</p>}
                          </div>
                        );
                      })()}
                      {splitMedical(c.medical).length > 0 && <div className="mt-1 flex flex-wrap gap-1">{splitMedical(c.medical).map((m) => <span key={m} className="inline-flex rounded-full bg-warning px-2.5 py-0.5 text-xs font-semibold text-warning-foreground">{m}</span>)}</div>}
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => { setEditing(c); setDraft(fromChild(c)); setFormOpen(true); }} className="cursor-pointer rounded-md px-2.5 py-1 text-xs font-semibold hover:bg-accent">Edit</button>
                      <button onClick={() => { fam.removeChild(c.id); toast(`${c.firstName} removed`); }} className="cursor-pointer rounded-md px-2.5 py-1 text-xs font-semibold text-destructive hover:bg-destructive/10">Remove</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {!formOpen ? (
            <button type="button" aria-expanded={false} onClick={() => { setEditing(null); setDraft(emptyChild); setFormOpen(true); }} className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-dashed border-border px-4 py-3 text-sm font-semibold hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
              <span>+ Add a Child</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            </button>
          ) : (
          <form onSubmit={saveChild} className="grid gap-3 rounded-xl bg-muted/60 p-4 sm:grid-cols-2">
            <div className="flex items-center justify-between gap-2 sm:col-span-2">
              <p className="text-sm font-bold">{editing ? `Edit ${editing.firstName}` : "Add a Child"}</p>
              <button type="button" aria-expanded={true} onClick={() => { setFormOpen(false); setEditing(null); setDraft(emptyChild); setMedInput(""); }} className="cursor-pointer rounded-md px-2.5 py-1 text-xs font-semibold hover:bg-accent">Close ✕</button>
            </div>
            <input required placeholder="First name" value={draft.firstName} onChange={(e) => setDraft({ ...draft, firstName: e.target.value })} className={inputCls} />
            <input required placeholder="Last name" value={draft.lastName} onChange={(e) => setDraft({ ...draft, lastName: e.target.value })} className={inputCls} />
            <label className="text-xs text-muted-foreground">Date of birth
              <input required type="date" value={draft.dob} onChange={(e) => setDraft({ ...draft, dob: e.target.value })} className={`${inputCls} mt-1`} />
            </label>
            <div className="text-xs text-muted-foreground sm:col-span-2">
              <p>Medical / allergies <span className="font-normal">(pick all that apply, or leave blank for none)</span></p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {MEDICAL.map((m) => (
                  <button type="button" key={m} aria-pressed={meds.includes(m)} onClick={() => toggleMed(m)} className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring ${meds.includes(m) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-accent"}`}>{meds.includes(m) ? "✓ " : ""}{m}</button>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <input placeholder="Add another condition or allergy" value={medInput} onChange={(e) => setMedInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomMed(); } }} className={inputCls} aria-label="Add a medical condition or allergy" />
                <button type="button" onClick={addCustomMed} className="h-10 shrink-0 cursor-pointer rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-accent">Add</button>
              </div>
              {meds.filter((m) => !MEDICAL.includes(m)).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {meds.filter((m) => !MEDICAL.includes(m)).map((m) => (
                    <span key={m} className="inline-flex items-center gap-1.5 rounded-full bg-warning px-3 py-1 text-xs font-semibold text-warning-foreground">{m}<button type="button" onClick={() => toggleMed(m)} aria-label={`Remove ${m}`} className="cursor-pointer font-bold">×</button></span>
                  ))}
                </div>
              )}
            </div>
            <label className="text-xs text-muted-foreground">Gender
              <select value={draft.gender} onChange={(e) => setDraft({ ...draft, gender: e.target.value })} className={`${inputCls} mt-1 text-foreground`}>
                <option value="">Select</option><option>Male</option><option>Female</option><option>Non-binary</option><option>Prefer not to say</option>
              </select>
            </label>
            <label className="text-xs text-muted-foreground">Health card # (OHIP)
              <input placeholder="Optional" value={draft.healthCard} onChange={(e) => setDraft({ ...draft, healthCard: e.target.value })} className={`${inputCls} mt-1`} />
            </label>
            <p className="pt-1 text-xs font-bold uppercase tracking-wider text-muted-foreground sm:col-span-2">Home address</p>
            <input required placeholder="Street address" value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} className={`${inputCls} sm:col-span-2`} />
            <select required value={CITIES.includes(draft.city ?? "") || !draft.city ? draft.city : "__other"} onChange={(e) => setDraft({ ...draft, city: e.target.value === "__other" ? " " : e.target.value })} className={`${inputCls} text-foreground`} aria-label="City">
              <option value="">Select city</option>
              {CITIES.map((c) => <option key={c}>{c}</option>)}
              <option value="__other">Other…</option>
            </select>
            {draft.city && !CITIES.includes(draft.city) && <input required placeholder="Enter city" value={draft.city.trim()} onChange={(e) => setDraft({ ...draft, city: e.target.value || " " })} className={inputCls} />}
            <input required placeholder="Postal code" value={draft.postalCode} onChange={(e) => setDraft({ ...draft, postalCode: e.target.value })} className={inputCls} />
            <p className="pt-1 text-xs font-bold uppercase tracking-wider text-muted-foreground sm:col-span-2">School</p>
            <input required placeholder="School name" value={draft.school} onChange={(e) => setDraft({ ...draft, school: e.target.value })} className={inputCls} />
            <select value={draft.grade} onChange={(e) => setDraft({ ...draft, grade: e.target.value })} className={`${inputCls} text-foreground`} aria-label="Grade">
              <option value="">Select grade (September)</option>
              {GRADES.map((g) => <option key={g}>{g}</option>)}
            </select>
            <p className="pt-1 text-xs font-bold uppercase tracking-wider text-muted-foreground sm:col-span-2">Emergency Contact</p>
            <p className="-mt-2 text-xs text-muted-foreground sm:col-span-2">Must be someone other than a parent or guardian on this account, in case we can't reach you.</p>
            <input required placeholder="Full name" value={draft.emergencyName} onChange={(e) => setDraft({ ...draft, emergencyName: e.target.value })} className={inputCls} />
            <select required value={draft.emergencyRelationship ?? ""} onChange={(e) => setDraft({ ...draft, emergencyRelationship: e.target.value })} className={`${inputCls} text-foreground`} aria-label="Relationship to child">
              <option value="">Relationship to child</option>
              {EMERGENCY_REL.map((r) => <option key={r}>{r}</option>)}
            </select>
            <input required type="tel" placeholder="Phone" value={draft.emergencyPhone} onChange={(e) => setDraft({ ...draft, emergencyPhone: e.target.value })} className={`${inputCls} sm:col-span-2`} />
            <div className="flex gap-2 sm:col-span-2">
              <button disabled={!childDirty} className="cursor-pointer rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40">{editing ? "Save changes" : "Add child"}</button>
              <button type="button" onClick={() => { setEditing(null); setDraft(emptyChild); setFormOpen(false); setMedInput(""); }} className="cursor-pointer rounded-full px-5 py-2.5 text-sm font-semibold hover:bg-accent">Cancel</button>
            </div>
          </form>
          )}
        </section>

        <section className="h-fit space-y-3 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-xl font-bold">Primary Guardian</h2>
          <form onSubmit={(e) => { e.preventDefault(); if (!gDirty) return; fam.updateGuardian(g); toast.success("Guardian details saved"); }} className="space-y-3">
            <input required value={g.name} onChange={(e) => setG({ ...g, name: e.target.value })} className={inputCls} aria-label="Name" />
            <input required type="email" value={g.email} onChange={(e) => setG({ ...g, email: e.target.value })} className={inputCls} aria-label="Email" />
            <input required type="tel" inputMode="tel" autoComplete="tel" value={g.phone} onChange={(e) => setG({ ...g, phone: e.target.value })} className={inputCls} aria-label="Phone" />
            <button disabled={!gDirty} className={`w-full cursor-pointer rounded-full border border-border px-5 py-2.5 text-sm font-semibold hover:bg-accent ${saveCls}`}>Save</button>
          </form>
          <h2 className="pt-4 text-xl font-bold">Second Parent / Guardian</h2>
          <p className="text-xs text-muted-foreground">Optional. Added as a contact on every registration.</p>
          <form onSubmit={(e) => { e.preventDefault(); fam.updateGuardian2(g2.name.trim() ? g2 : undefined); toast.success(g2.name.trim() ? "Second guardian saved" : "Second guardian removed"); }} className="space-y-3">
            <input placeholder="Full name" value={g2.name} onChange={(e) => setG2({ ...g2, name: e.target.value })} className={inputCls} />
            <select value={g2.relationship ?? ""} onChange={(e) => setG2({ ...g2, relationship: e.target.value })} className={`${inputCls} text-foreground`} aria-label="Relationship">
              <option value="">Relationship to child</option>
              {GUARDIAN_REL.map((r) => <option key={r}>{r}</option>)}
            </select>
            <input type="email" required={!!g2.name.trim()} placeholder="Email" value={g2.email} onChange={(e) => setG2({ ...g2, email: e.target.value })} className={inputCls} />
            <input type="tel" required={!!g2.name.trim()} placeholder="Phone" value={g2.phone} onChange={(e) => setG2({ ...g2, phone: e.target.value })} className={inputCls} />
            <div className="flex gap-2">
              <button disabled={!g2Dirty} className={`flex-1 cursor-pointer rounded-full border border-border px-5 py-2.5 text-sm font-semibold hover:bg-accent ${saveCls}`}>Save</button>
              {fam.guardian2 && <button type="button" onClick={() => { fam.updateGuardian2(undefined); setG2({ name: "", email: "", phone: "", relationship: "" }); toast("Second guardian removed"); }} className="cursor-pointer rounded-full px-4 py-2.5 text-sm font-semibold text-destructive hover:bg-destructive/10">Remove</button>}
            </div>
          </form>
        </section>
      </div>

      <section className="mt-6 rounded-2xl border border-border bg-card p-6">
        <h2 className="text-xl font-bold">Registrations</h2>
        {fam.registrations.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm text-muted-foreground">No registrations yet.</p>
            <Link to="/" hash="locations" className="mt-4 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">Browse programs</Link>
          </div>
        ) : (
          <div className="mt-4 divide-y divide-border">
            {fam.registrations.map((r) => {
              const d = decodeLine(r.lineId);
              const child = fam.childById(r.childId);
              if (!d) return null;
              return (
                <div key={r.id} className="space-y-3 py-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{d.program.name} — {d.session.label}</p>
                      <p className="text-sm text-muted-foreground">{child?.firstName ?? "Child"} · {d.session.dates} · {d.session.time}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <RegStatusPill status={r.status ?? "confirmed"} />
                      <span className="font-semibold">{formatPrice(r.amount + r.tax)}</span>
                    </div>
                  </div>
                  {(r.status ?? "confirmed") === "confirmed" && (() => {
                    const ev = calendarEvent(d, child);
                    const title = ev.title;
                    const loc = ev.location;
                    const det = ev.details;
                    return (
                      <div className="flex flex-wrap gap-2">
                        <a href={googleHref(title, d.session.dates, d.program.season, loc, det)} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-full border border-border px-3.5 text-xs font-semibold hover:bg-accent">Add to Google Calendar</a>
                        <a href={icsHref(title, d.session.dates, d.program.season, loc, det)} download={`${d.program.name.replace(/[^a-z0-9]+/gi, "-")}.ics`} className="inline-flex h-9 items-center rounded-full border border-border px-3.5 text-xs font-semibold hover:bg-accent">Apple / Outlook (.ics)</a>
                      </div>
                    );
                  })()}
                  <RefundTracker regId={r.id} />
                </div>
              );
            })}
          </div>
        )}
      </section>

      <FamilyWaivers />

      <CoParentAccess />

      <TaxReceipts />
    </div>
  );
}

function RegStatusPill({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    confirmed: ["Confirmed", "bg-success text-success-foreground"],
    refund_pending: ["Refund Requested", "bg-warning text-warning-foreground"],
    refunded: ["Refunded", "bg-muted text-foreground"],
    credited: ["Credited", "bg-info text-info-foreground"],
    transferred: ["Transferred", "bg-info text-info-foreground"],
  };
  const [label, cls] = map[status] ?? map.confirmed;
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${cls}`}>{label}</span>;
}

/** Refund request progress: Requested → Approved → Refunded (or Declined/Cancelled). */
function RefundTracker({ regId }: { regId: string }) {
  const fam = useFamily();
  const req = (fam.refundRequests ?? []).filter((q) => q.registrationId === regId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!req) return null;
  const reg = fam.registrations.find((x) => x.id === regId);
  if (req.status === "declined" || req.status === "cancelled")
    return <p className="rounded-lg bg-muted px-3.5 py-2 text-xs text-muted-foreground">Refund request {req.status} {req.processedAt ? `on ${new Date(req.processedAt).toLocaleDateString("en-CA")}` : ""}. Contact your location team with any questions.</p>;
  const stage = reg?.status === "refunded" ? 2 : req.status === "approved" ? 1 : 0;
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-3.5">
      <p className="text-xs font-semibold">Refund of {formatPrice(req.refund)} · requested {new Date(req.createdAt).toLocaleDateString("en-CA")}</p>
      <ol className="mt-2 grid grid-cols-3 gap-2" aria-label="Refund status">
        {REQ_STEPS.map((label, i) => (
          <li key={label} className="space-y-1">
            <div className={`h-1.5 rounded-full ${i <= stage ? "bg-primary" : "bg-border"}`} />
            <p className={`text-xs font-semibold ${i <= stage ? "text-foreground" : "text-muted-foreground"}`} aria-current={i === stage ? "step" : undefined}>{i === 0 ? "Pending review" : label}</p>
          </li>
        ))}
      </ol>
      {stage === 0 && <p className="mt-2 text-xs text-muted-foreground">Our staff review requests within 2–3 business days. Refunds take 5–10 business days to reach your card once approved.</p>}
    </div>
  );
}

/** Year-end child care expense receipts for camp registrations (one per child, per year). */
function TaxReceipts() {
  const fam = useFamily();
  const rows = fam.registrations
    .filter((r) => (r.status ?? "confirmed") === "confirmed")
    .map((r) => ({ r, d: decodeLine(r.lineId), child: fam.childById(r.childId) }))
    .filter((x) => x.d && isCamp(x.d.program) && x.child);
  const years = [...new Set(rows.map((x) => new Date(x.r.createdAt).getFullYear()))].sort((a, b) => b - a);
  const [year, setYear] = useState<number>(years[0] ?? new Date().getFullYear());
  const inYear = rows.filter((x) => new Date(x.r.createdAt).getFullYear() === year);
  const kids = [...new Map(inYear.map((x) => [x.child!.id, x.child!])).values()];

  const print = (childId: string) => {
    const child = fam.childById(childId);
    if (!child) return;
    const lines = inYear.filter((x) => x.child!.id === childId);
    const total = lines.reduce((s, x) => s + x.r.amount + x.r.tax, 0);
    const body = lines
      .map((x) => `<tr><td>${escHtml(x.d!.program.name)} — ${escHtml(x.d!.session.label)}</td><td>${escHtml(x.d!.session.dates)}</td><td>${escHtml(sessionLocation(x.d!.program, x.d!.session))}</td><td style="text-align:right">${formatPrice(x.r.amount + x.r.tax)}</td></tr>`)
      .join("");
    const w = window.open("", "_blank");
    if (!w) { toast.error("Allow pop-ups to print your receipt."); return; }
    w.document.write(`<!doctype html><html><head><title>Child Care Expense Receipt ${year} — ${escHtml(child.firstName)} ${escHtml(child.lastName)}</title><style>body{font-family:Arial,sans-serif;color:#1b2a57;max-width:760px;margin:32px auto;padding:0 20px}h1{font-size:22px;margin:0}.band{background:#1b2a57;color:#fff;padding:20px;border-radius:10px;margin-bottom:20px;-webkit-print-color-adjust:exact;print-color-adjust:exact}table{width:100%;border-collapse:collapse;font-size:13px}th,td{border-bottom:1px solid #dde3ee;padding:8px;text-align:left}th{background:#eef3fa}.total td{font-weight:bold;font-size:15px}.small{font-size:12px;color:#55617f}</style></head><body><div class="band"><p style="margin:0;font-size:11px;letter-spacing:2px;text-transform:uppercase">${escHtml(SITE.orgName)}</p><h1>Child Care Expense Receipt — ${year}</h1></div><p><strong>Child:</strong> ${escHtml(child.firstName)} ${escHtml(child.lastName)} (born ${escHtml(formatDob(child.dob))})<br/><strong>Paid by:</strong> ${escHtml(fam.guardian.name)}${fam.guardian.email ? ` · ${escHtml(fam.guardian.email)}` : ""}<br/><strong>Issued:</strong> ${new Date().toLocaleDateString("en-CA")}</p><table><thead><tr><th>Program</th><th>Dates</th><th>Venue</th><th style="text-align:right">Amount Paid</th></tr></thead><tbody>${body}<tr class="total"><td colspan="3">Total Eligible Child Care Expenses</td><td style="text-align:right">${formatPrice(total)}</td></tr></tbody></table><p class="small">This receipt lists day camp fees paid to ${escHtml(SITE.orgName)} in ${year} for the child named above, for use when claiming child care expenses. Refunded or transferred registrations are excluded. Amounts shown are before any account credit or coupon applied to the full order.</p><p class="small">Questions: ${escHtml(SITE.supportEmail || "info@topsports.ca")}</p><script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  };

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Tax Receipts</h2>
          <p className="text-sm text-muted-foreground">Child care expense receipts for camp registrations, one per child per year.</p>
        </div>
        {years.length > 1 && (
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="h-10 rounded-lg border border-input bg-card px-3.5 text-sm">
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        )}
      </div>
      {kids.length === 0 ? (
        <p className="mt-4 rounded-xl bg-muted p-5 text-center text-sm text-muted-foreground">No camp registrations yet. Receipts appear here once you register for a camp.</p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {kids.map((c) => {
            const total = inYear.filter((x) => x.child!.id === c.id).reduce((s, x) => s + x.r.amount + x.r.tax, 0);
            return (
              <div key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-4">
                <div className="min-w-0">
                  <p className="font-semibold">{c.firstName} {c.lastName}</p>
                  <p className="text-sm text-muted-foreground">{year} · {formatPrice(total)}</p>
                </div>
                <button onClick={() => print(c.id)} className="inline-flex h-10 shrink-0 cursor-pointer items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Download Receipt</button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** Every policy a parent agreed to at registration, one record per child per program. */
function FamilyWaivers() {
  const fam = useFamily();
  const rows: SignedWaiverRow[] = [];
  for (const r of fam.registrations) {
    if (r.status === "transferred") continue;
    const d = decodeLine(r.lineId);
    if (!d) continue;
    const child = fam.childById(r.childId);
    const ids = r.waivers?.length ? r.waivers : programWaivers(d.program).map((w) => w.id);
    if (ids.length === 0) continue;
    const at = r.signedAt ?? fam.regDetails[r.lineId]?.acceptedAt ?? r.createdAt;
    rows.push({
      id: r.id,
      parentName: fam.guardian.name,
      signedAt: new Date(at),
      childName: child ? `${child.firstName} ${child.lastName}` : "Child",
      programName: d.program.name,
      sessionLabel: d.session.label,
      dates: d.session.dates,
      location: sessionLocation(d.program, d.session),
      waiverIds: ids,
      snapshot: r.waiverSnapshot ?? fam.regDetails[r.lineId]?.waiverSnapshot,
      signature: r.signature ?? fam.regDetails[r.lineId]?.signature,
    });
  }
  return <SignedWaivers rows={rows} intro="The policies you agreed to for each child and program. View the full text or print a copy any time." />;
}
