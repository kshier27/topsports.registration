import type { Program, DecodedLine } from "@/data/registration";
import { sessionRange, sessionLocation, sessionAddress, formatOutDate } from "@/data/registration";

const FULL_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "July 13–17, 2027" · "June 29 – July 3, 2027" · "Dec 29, 2026 – Jan 2, 2027" */
export function fullDateRange(a: Date, b: Date): string {
  if (!Number.isFinite(a.getTime())) return "";
  const m = (d: Date) => FULL_MONTHS[d.getMonth()];
  if (!Number.isFinite(b.getTime()) || a.getTime() === b.getTime()) return `${m(a)} ${a.getDate()}, ${a.getFullYear()}`;
  if (a.getFullYear() !== b.getFullYear()) return `${m(a)} ${a.getDate()}, ${a.getFullYear()} – ${m(b)} ${b.getDate()}, ${b.getFullYear()}`;
  if (a.getMonth() !== b.getMonth()) return `${m(a)} ${a.getDate()} – ${m(b)} ${b.getDate()}, ${b.getFullYear()}`;
  return `${m(a)} ${a.getDate()}–${b.getDate()}, ${a.getFullYear()}`;
}

/** Calendar event content: organization, program, dates, times, venue (with address) and participating child. */
export function calendarEvent(d: DecodedLine, child?: { firstName: string; lastName: string } | null) {
  const [a, b] = sessionRange(d.session.dates, d.program.season);
  const venue = sessionLocation(d.program, d.session);
  const address = sessionAddress(d.program, d.session);
  const childName = child ? `${child.firstName} ${child.lastName}`.trim() : "";
  const program = d.session.label ? `${d.program.name} — ${d.session.label}` : d.program.name;
  const times = [d.session.days, d.session.time].filter((x) => x?.trim()).join(" · ");
  const out = (d.program.outDates ?? []).map((o) => `${formatOutDate(o.date)}${o.note ? ` (${o.note})` : ""}`);
  const lines = [
    "TOP Sports",
    program,
    fullDateRange(a, b),
    times,
    venue,
    address && address !== venue ? address : "",
    childName ? `Child: ${childName}` : "",
    out.length ? `Out Dates: ${out.join(", ")}` : "",
  ].filter(Boolean);
  return {
    title: `TOP Sports — ${d.program.name}${childName ? ` (${childName})` : ""}`,
    location: address ? `${venue}, ${address}` : venue,
    details: lines.join("\n"),
    start: a,
    end: b,
  };
}

/** Escape text for an ICS field. */
export const icsEscape = (x: string) => x.replace(/[,;\\]/g, (m) => "\\" + m).replace(/\n/g, "\\n");
import { locationContact } from "@/lib/site-settings";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SMALL = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "of", "on", "or", "the", "to", "with"]);

/** "photo & media release policy" -> "Photo & Media Release Policy" */
export function titleCase(s: string): string {
  return s
    .split(/(\s+)/)
    .map((w, i) => {
      if (/^\s+$/.test(w) || !w) return w;
      const lower = w.toLowerCase();
      if (i > 0 && SMALL.has(lower)) return lower;
      if (/[A-Z].*[A-Z]/.test(w)) return w; // keep acronyms like TOP, HST
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join("");
}

/** Start date of a "Jul 6 – Jul 10" style range within a season like "Summer 2027" or "Winter 2026–27". */
export function rangeStart(dates: string, season: string): Date {
  const base = Number(season.match(/\d{4}/)?.[0] ?? new Date().getFullYear());
  const spansYear = /\d{4}\s*[–-]\s*\d{2}/.test(season);
  const [m = "", day] = dates.split(/\s[–-]\s|–/)[0].trim().split(/\s+/);
  const mi = MONTHS.indexOf(m.slice(0, 1).toUpperCase() + m.slice(1, 3).toLowerCase());
  if (mi < 0) return new Date(NaN);
  const year = spansYear && mi < 6 ? base + 1 : base;
  return new Date(year, mi, Number(day) || 1);
}

/** Earliest session start for a program. */
export function programStart(p: Program): number {
  const all: string[] = [];
  for (const s of p.sessions) {
    if (s.dates) all.push(s.dates);
    if (s.multi !== false) for (const t of s.slots ?? []) if (t.dates?.trim()) all.push(t.dates);
  }
  const times = all.map((d) => rangeStart(d, p.season || "").getTime()).filter((n) => Number.isFinite(n));
  return times.length ? Math.min(...times) : Number.MAX_SAFE_INTEGER;
}

/** Last session end date for a program (used to push finished programs to the end). */
function programEnd(p: Program): number {
  const ends = p.sessions
    .map((s) => {
      const parts = (s.dates || "").split(/\s[–-]\s|–/);
      return rangeStart(parts[1] ?? parts[0] ?? "", p.season || "").getTime();
    })
    .filter((n) => Number.isFinite(n));
  return ends.length ? Math.max(...ends) : Number.MAX_SAFE_INTEGER;
}

/** Ordered by first session date, soonest first. Programs that have already finished go last. */
export function byStartDesc(a: Program, b: Program): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const doneA = programEnd(a) < today.getTime() ? 1 : 0;
  const doneB = programEnd(b) < today.getTime() ? 1 : 0;
  return doneA - doneB || programStart(a) - programStart(b) || a.name.localeCompare(b.name);
}

/** Alias with a clearer name. */
export const bySoonestStart = byStartDesc;

/** Club contact for a location: Toronto = info@, others = city@. */
export function locationEmail(slugOrName: string): string {
  const custom = locationContact(slugOrName)?.email;
  if (custom) return custom;
  const s = slugOrName.toLowerCase();
  if (s.includes("toronto")) return "info@topsports.ca";
  if (s.includes("york")) return "york@topsports.ca";
  if (s.includes("oakville")) return "oakville@topsports.ca";
  if (s.includes("whitby")) return "whitby@topsports.ca";
  return "info@topsports.ca";
}
