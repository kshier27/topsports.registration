// TOP Sports registration seed data — locations, program groups, sessions,
// pricing options and add-ons. Each location has its own registration link
// (/toronto, /oakville, ...) so programs never mix on one dashboard.

export const HST_RATE = 0.13;

export type Location = {
  slug: string;
  name: string;
  region: string;
  blurb: string;
  venues: string[];
  /** Street address per venue name (managed in Settings → Locations). */
  venueAddresses?: Record<string, string>;
  image: string;
};

export type AddOn = {
  id: string;
  name: string;
  description: string;
  price: number;
  taxable: boolean;
};

export type PriceOption = {
  id: string;
  label: string;
  detail: string;
  price: number;
};

export type Session = {
  id: string;
  label: string;
  dates: string;
  days: string;
  time: string;
  capacity: number;
  enrolled: number;
  /** Price for this session / week (CAD). Falls back to the program's first legacy option. */
  price?: number;
  /** Where this session runs. Falls back to the program venue. */
  location?: string;
  /** Street address for this session's venue. Falls back to the program address. */
  address?: string;
  /** "This Session has multiple registration options" toggle. */
  multi?: boolean;
  /** Session options families pick after choosing this session (e.g. Mon 6pm Apr 17 – Jun 22 $299). */
  slots?: TimeSlot[];
  /** Combo deal: $ off each additional option of this session the same child picks. */
  comboDiscount?: number;
};

/** A session option. Empty fields fall back to the parent session. */
export type TimeSlot = {
  id: string;
  label: string;
  capacity: number;
  enrolled: number;
  dates?: string;
  days?: string;
  time?: string;
  price?: number;
  location?: string;
};

/** Session options with a name (empty list = session has a single fixed schedule). */
export function sessionSlots(s: Session): TimeSlot[] {
  if (s.multi === false) return [];
  return (s.slots ?? []).filter((t) => t.label.trim());
}

/** The session as it applies to one chosen option (dates, times, price, location overridden). */
export function withOption(s: Session, t?: TimeSlot): Session {
  if (!t) return s;
  const pick = (a: string | undefined, b: string) => (a?.trim() ? a.trim() : b);
  return {
    ...s,
    label: `${sessionName(s)} · ${t.label}`,
    dates: pick(t.dates, s.dates),
    days: pick(t.days, s.days),
    time: pick(t.time, t.days?.trim() || t.time?.trim() ? s.time : t.label),
    price: typeof t.price === "number" && Number.isFinite(t.price) ? t.price : s.price,
    location: pick(t.location, s.location ?? "") || undefined,
    address: t.location?.trim() && t.location.trim() !== (s.location ?? "").trim() ? undefined : s.address,
  };
}

/** Lowest price across a session's options (or the session price). */
export function sessionFromPrice(p: Program, s: Session): number {
  const opts = sessionSlots(s);
  return opts.length ? Math.min(...opts.map((t) => sessionPrice(p, withOption(s, t)))) : sessionPrice(p, s);
}

/** Street address for a venue, from Settings → Locations. */
export function venueAddress(locationSlug: string, venue: string): string {
  const l = LOCATIONS.find((x) => x.slug === locationSlug);
  return (l?.venueAddresses?.[venue.trim()] ?? "").trim();
}

/** Google Maps link for a venue name + address. */
export function mapsUrl(name: string, address?: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([name, address].filter(Boolean).join(", "))}`;
}

export type OutDate = { id: string; date: string; note: string };

/**
 * Staff-defined discount.
 * - alternative: families pick it per child at registration (goalie, pro-rated, sibling...).
 * - earlybird: applied automatically to every registration until the deadline date.
 */
export type Discount = {
  id: string;
  label: string;
  kind: "alternative" | "earlybird";
  mode: "percent" | "amount";
  value: number;
  /** YYYY-MM-DD, early-bird only (inclusive). */
  deadline?: string;
};

export type CustomQuestion = { id: string; label: string; type: "text" | "yesno"; required: boolean };

export type ProgramCategory = "Camps" | "Hockey" | "Soccer" | "Lacrosse";

export type Program = {
  id: string;
  locationSlug: string;
  name: string;
  category: ProgramCategory;
  season: string;
  ages: [number, number];
  ageAsOf: string;
  /** Eligible birth years [earliest, latest], inclusive. Overrides ages when set. */
  birthYears?: [number, number];
  /** "start" = age as of the program start date, "year" = as of Dec 31 of the program year. */
  ageAsOfMode?: "start" | "year";
  venue: string;
  /** Street address of the main venue. */
  venueAddress?: string;
  description: string;
  image: string;
  taxable: boolean;
  sessions: Session[];
  options: PriceOption[];
  addOns: AddOn[];
  /** Editable display tags (e.g. "Popular", "New", "Girls only"). */
  tags?: string[];
  /** @deprecated legacy single tag — migrated into tags. */
  badge?: string;
  /** Email families a reminder 3 days before their session starts (default on). */
  remindersEnabled?: boolean;
  /** Customizable pre-program welcome / reminder email. Blank fields use the defaults. */
  reminderEmail?: { subject?: string; message?: string; whatToBring?: string; daysBefore?: number };
  /** Ask for a jersey / uniform size on each registration. */
  askJerseySize?: boolean;
  /** Waiver ids families must accept for this program. Undefined = DEFAULT_WAIVERS. */
  waivers?: string[];
  /** Days with no program (holidays, facility closures). */
  outDates?: OutDate[];
  /** Extra questions asked per participant on this program's form. */
  questions?: CustomQuestion[];
  /** Alternative pricing + early-bird discounts. */
  discounts?: Discount[];
  /** Program-only automatic incentives, each $50 off. */
  incentives?: { sibling?: boolean; multiWeek?: boolean };
  /** Registration opens (local datetime, YYYY-MM-DDTHH:mm). Empty = open now. */
  regOpens?: string;
  /** Registration closes (local datetime, YYYY-MM-DDTHH:mm). Empty = never. */
  regCloses?: string;
};

/** Online processing fee withheld on card payments. */
/** Add-on offered on every program (optionally limited to some sports). */
export type GlobalAddOn = AddOn & { enabled: boolean; categories: ProgramCategory[] };

/** Super-admin finance settings (overwritten from Settings → Finances). */
export const FINANCE: { feePct: number; siblingPct: number; extraWeek: number; globalAddOns: GlobalAddOn[] } = {
  feePct: 4,
  siblingPct: 10,
  extraWeek: 25,
  globalAddOns: [],
};

/** Enabled global add-ons that apply to this program. Ids are always prefixed "g-". */
export function globalAddOnsFor(p: { category: string }, list: GlobalAddOn[]): AddOn[] {
  return (list ?? [])
    .filter((g) => g.enabled && g.name?.trim() && (!g.categories?.length || g.categories.includes(p.category as ProgramCategory)))
    .map((g) => ({ id: g.id.startsWith("g-") ? g.id : `g-${g.id}`, name: g.name, description: g.description, price: Number(g.price) || 0, taxable: g.taxable }));
}

export type RegState = "live" | "draft" | "closed";

/** Staff-facing status: Closed once the close date passes; Draft when unpublished or not yet open. */
export function regState(p: Program, published: boolean, now: number = Date.now()): RegState {
  const closes = p.regCloses ? new Date(p.regCloses).getTime() : NaN;
  if (Number.isFinite(closes) && closes < now) return "closed";
  const opens = p.regOpens ? new Date(p.regOpens).getTime() : NaN;
  if (!published || (Number.isFinite(opens) && opens > now)) return "draft";
  return "live";
}

export function formatDateTime(v: string): string {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString("en-CA", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Family-facing registration window. */
export function regWindow(p: Program, now: number = Date.now()): { open: boolean; message?: string } {
  const opens = p.regOpens ? new Date(p.regOpens).getTime() : NaN;
  const closes = p.regCloses ? new Date(p.regCloses).getTime() : NaN;
  if (Number.isFinite(opens) && opens > now) return { open: false, message: `Registration opens ${formatDateTime(p.regOpens!)}.` };
  if (Number.isFinite(closes) && closes < now) return { open: false, message: `Registration closed ${formatDateTime(p.regCloses!)}.` };
  return { open: true, message: Number.isFinite(closes) ? `Registration closes ${formatDateTime(p.regCloses!)}.` : undefined };
}

/** Revenue net of 13% HST (when charged) and the 4% online processing fee. */
export function netRevenue(amount: number, p?: Program): number {
  const preTax = p && chargesHst(p) ? amount / (1 + HST_RATE) : amount;
  return preTax * (1 - FINANCE.feePct / 100);
}

/** Camps never charge HST (registration or add-ons). */
export function isCamp(p: Program): boolean {
  return p.category === "Camps" || /camp/i.test(p.name);
}

/** Whether HST is added to this program's registration fee. */
export function chargesHst(p: Program): boolean {
  return p.taxable && !isCamp(p);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function discountOff(price: number, d: Discount): number {
  const off = d.mode === "percent" ? (price * d.value) / 100 : d.value;
  return round2(Math.min(price, Math.max(0, off)));
}

export function describeDiscount(d: Discount): string {
  return d.mode === "percent" ? `${d.value}% off` : `${formatPrice(d.value)} off`;
}

/** Active early-bird discount (earliest deadline still open), if any. */
export function earlyBird(p: Program, now: Date = new Date()): Discount | undefined {
  return (p.discounts ?? [])
    .filter((d) => d.kind === "earlybird" && d.value > 0 && d.deadline && now.getTime() <= new Date(`${d.deadline}T23:59:59`).getTime())
    .sort((a, b) => (a.deadline ?? "").localeCompare(b.deadline ?? ""))[0];
}

export function altDiscounts(p: Program): Discount[] {
  return (p.discounts ?? []).filter((d) => d.kind === "alternative" && d.value > 0 && d.label.trim());
}

/** Session price after the chosen alternative discount and any active early-bird. */
export function priceFor(p: Program, s: Session, altId?: string, now: Date = new Date()): { base: number; price: number; applied: Discount[] } {
  const base = sessionPrice(p, s);
  let price = base;
  const applied: Discount[] = [];
  const alt = altId ? altDiscounts(p).find((d) => d.id === altId) : undefined;
  if (alt) { price = round2(price - discountOff(price, alt)); applied.push(alt); }
  const eb = earlyBird(p, now);
  if (eb) { price = round2(price - discountOff(price, eb)); applied.push(eb); }
  return { base, price, applied };
}

export function formatDob(dob: string): string {
  const d = new Date(`${dob}T12:00:00`);
  return Number.isNaN(d.getTime()) ? dob : d.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

/** Price of one registration in a session. */
export function sessionPrice(p: Program, s: Session): number {
  return s.price ?? p.options[0]?.price ?? 0;
}

/** Lowest session price — used for "from $X" labels. */
export function fromPrice(p: Program): number {
  return p.sessions.length ? Math.min(...p.sessions.map((s) => sessionFromPrice(p, s))) : 0;
}

export function sessionLocation(p: Program, s: Session): string {
  return s.location?.trim() || p.venue;
}

export function sessionAddress(p: Program, s: Session): string {
  return venueAddress(p.locationSlug, sessionLocation(p, s)) || (sessionLocation(p, s) === p.venue ? (p.venueAddress ?? "").trim() : "");
}

export function programAddress(p: Program): string {
  return venueAddress(p.locationSlug, p.venue) || (p.venueAddress ?? "").trim();
}

export function formatOutDate(d: string): string {
  const dt = new Date(`${d}T12:00:00`);
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

export type Waiver = { id: string; title: string; summary: string; text: string };

export const WAIVERS: Waiver[] = [
  { id: "liability", title: "Assumption of Risk & Liability Release", summary: "Sport carries inherent risk of injury.", text: "I understand that participation in sport involves inherent risks, including physical injury. I release TOP Sports, its staff and venue partners from liability for injuries arising from normal participation, except in cases of gross negligence." },
  { id: "cancellation", title: "Cancellation & Refund Policy", summary: "Card refunds less a $50 admin fee; requests due 30 days before start (May 31 for summer camps).", text: "Withdrawals may be taken as full account credit at any time before the session starts. Refunds to the original card are subject to a $50 administration fee and must be requested at least 30 days before the program start date. For all summer camps, refund requests must be received by May 31. Approved refunds are returned to the original payment card. No card refunds are issued after the deadline, except for medical reasons with documentation." },
  { id: "media", title: "Photo & Media Release", summary: "TOP may use program photos and video.", text: "I grant TOP Sports permission to photograph and record my child during programs and to use these images in newsletters, social media and promotional materials. Names are never published alongside images." },
  { id: "medical", title: "Emergency Medical Consent", summary: "Staff may seek emergency treatment.", text: "In an emergency where I cannot be reached, I authorise TOP Sports staff to administer first aid and to arrange emergency medical treatment for my child. I accept responsibility for any related costs not covered by OHIP." },
  { id: "conduct", title: "Code of Conduct", summary: "Respect for coaches, teammates and facilities.", text: "My child and I agree to follow the TOP Sports code of conduct: respect for coaches, teammates, officials and facilities. Repeated or serious misconduct may result in removal from the program without refund." },
  { id: "pickup", title: "Pickup & Sign-Out Policy", summary: "Only authorised adults may pick up.", text: "Children will only be released to a parent/guardian or an authorised adult listed on the account, with photo ID. Late pickup after the posted end time may incur a fee of $1 per minute." },
];

export const DEFAULT_WAIVERS = ["liability", "cancellation", "medical", "conduct"];

/** Built-in policy text, used when the Super Admin hasn't customised policies. */
export const ORIGINAL_WAIVERS: Waiver[] = WAIVERS.map((w) => ({ ...w }));

export const JERSEY_SIZES = ["Youth XS", "Youth S", "Youth M", "Youth L", "Youth XL", "Adult S", "Adult M", "Adult L"];

export function programWaivers(p: Program): Waiver[] {
  const ids = p.waivers ?? DEFAULT_WAIVERS;
  return WAIVERS.filter((w) => ids.includes(w.id));
}

export function asksJersey(p: Program): boolean {
  return p.askJerseySize ?? p.category !== "Camps";
}

export const HEARD_ABOUT = ["Social Media", "Search Engine", "Past Participant", "Friend Referral"];

export const REFUND_ADMIN_FEE = 50;

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Parse a session's "Jul 6 – Jul 10" dates against the program season. */
export function sessionRange(dates: string, season: string): [Date, Date] {
  const base = Number(season.match(/\d{4}/)?.[0] ?? new Date().getFullYear());
  const spansYear = /\d{4}\s*[–-]\s*\d{2}/.test(season);
  const parse = (s: string) => {
    const [m, day] = s.trim().split(/\s+/);
    const mi = Math.max(0, MON.indexOf(m));
    const year = spansYear && mi < 6 ? base + 1 : base;
    return new Date(year, mi, Number(day) || 1);
  };
  const [a, b] = dates.split("–");
  const start = parse(a);
  return [start, b ? parse(b) : start];
}

/** Staff check: a Mon–Fri session must start Mon (or Tue after a holiday) and end Fri. */
export function weekdayIssue(season: string, dates: string, days: string): string | null {
  if (!/mon\w*\.?\s*(–|-|to)\s*fri/i.test(days) || !dates.includes("–")) return null;
  const [a, b] = sessionRange(dates, season);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  const D = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const issues: string[] = [];
  if (a.getDay() !== 1 && a.getDay() !== 2) issues.push(`starts on a ${D[a.getDay()]}`);
  if (b.getDay() !== 5) issues.push(`ends on a ${D[b.getDay()]}`);
  return issues.length ? `Check dates: Days says Mon – Fri, but in ${a.getFullYear()} this ${issues.join(" and ")}.` : null;
}

/** Lowest price today (early-bird applied) next to the regular from-price. */
export function fromPriceNow(p: Program): { was: number; now: number } {
  const was = fromPrice(p);
  const eb = earlyBird(p);
  return { was, now: eb ? Math.round((was - discountOff(was, eb)) * 100) / 100 : was };
}

/** Last day a card refund can be requested: May 31 for summer camps, otherwise 30 days before the program starts. */
export function refundDeadline(p: Program): Date {
  const starts = p.sessions.map((s) => sessionRange(s.dates, p.season)[0].getTime());
  const start = new Date(starts.length ? Math.min(...starts) : Date.now());
  if (p.category === "Camps" && /summer/i.test(p.season)) return new Date(start.getFullYear(), 4, 31, 23, 59, 59);
  const d = new Date(start);
  d.setDate(d.getDate() - 30);
  d.setHours(23, 59, 59);
  return d;
}

/** Session name exactly as staff typed it in the Program Builder. */
export function sessionName(s: Session): string {
  return s.label.trim() || s.dates || "Session";
}

const IMG = {
  hero2: "https://shipper-api-production-3b99.up.railway.app/api/v1/upload/cmvch9yyi0061me0sveqkpma2/stream",
  feature: "https://shipper-api-production-3b99.up.railway.app/api/v1/upload/cmvcha0i20063me0s7rpshhiu/stream",
  card: "https://shipper-api-production-3b99.up.railway.app/api/v1/upload/cmvch9ye0005zme0scunjhqc4/stream",
  banner: "https://shipper-api-production-3b99.up.railway.app/api/v1/upload/cmvcha1qs0067me0s6eomw2wh/stream",
  lacrosse: "https://shipper-api-production-3b99.up.railway.app/api/v1/upload/cmvcha14m0065me0si9y0d87s/stream",
};

export const STOCK = IMG;

export const LOCATIONS: Location[] = [
  {
    slug: "toronto",
    name: "Toronto",
    region: "Midtown Toronto",
    blurb: "Serving Midtown Toronto and beyond, a full player pathway from ages 4-18 across hockey, soccer, and lacrosse, and camps with the complete multi-sport model.",
    venues: ["North Toronto Memorial Arena", "De La Salle College", "St. Michael's College School"],
    image: IMG.hero2,
  },
  {
    slug: "oakville",
    name: "Oakville",
    region: "Halton Region",
    blurb: "Serving families across Halton region with recreational and competitive hockey, soccer, and lacrosse programs, sports camps and more!",
    venues: ["Linbrook School"],
    image: IMG.feature,
  },
  {
    slug: "york",
    name: "York Region",
    region: "York Region",
    blurb: "Recreational soccer, lacrosse and holiday camps.",
    venues: ["Richmond Hill Community Fields"],
    image: IMG.card,
  },
  {
    slug: "whitby",
    name: "Whitby",
    region: "Durham Region",
    blurb: "Our newest location brings TOP Sports to Durham Region — hockey, lacrosse, soccer, and camps. Registration is now open!",
    venues: ["Iroquois Park Sports Centre"],
    image: IMG.banner,
  },
];

const summerWeeks: [string, string][] = [
  ["Week 1", "Jul 5 – Jul 9"],
  ["Week 2", "Jul 12 – Jul 16"],
  ["Week 3", "Jul 19 – Jul 23"],
  ["Week 4", "Jul 26 – Jul 30"],
  ["Week 5", "Aug 3 – Aug 6"],
  ["Week 6", "Aug 9 – Aug 13"],
  ["Week 7", "Aug 16 – Aug 20"],
  ["Week 8", "Aug 23 – Aug 27"],
];

/** Camp lunch add-on (placeholder price). */
const lunch: AddOn = {
  id: "lunch",
  name: "Lunch Plan",
  description: "Healthy lunch + afternoon snack, delivered daily",
  price: 75,
  taxable: true,
};
/** Retired — jersey sizes are now asked per registration. */
export const jersey: AddOn = {
  id: "jersey",
  name: "TOP Camp Jersey",
  description: "Navy reversible practice jersey",
  price: 35,
  taxable: true,
};

/** Placeholder price for every session until staff set real pricing. */
const BASE_PRICE = 299;

type CityVenues = { slug: string; code: string; camp: string; arena: string; field: string; lacrosse: string };

const CITY_VENUES: CityVenues[] = [
  { slug: "toronto", code: "tor", camp: "De La Salle College", arena: "North Toronto Memorial Arena", field: "De La Salle College", lacrosse: "St. Michael's College School" },
  { slug: "oakville", code: "oak", camp: "Linbrook School", arena: "Oakville Arena (TBC)", field: "Linbrook School", lacrosse: "Linbrook School" },
  { slug: "york", code: "york", camp: "Richmond Hill Community Fields", arena: "York Region Arena (TBC)", field: "Richmond Hill Community Fields", lacrosse: "Richmond Hill Community Fields" },
  { slug: "whitby", code: "whi", camp: "Iroquois Park Sports Centre", arena: "Iroquois Park Sports Centre", field: "Iroquois Park Sports Centre", lacrosse: "Iroquois Park Sports Centre" },
];

const option: PriceOption = { id: "std", label: "Registration", detail: "Per session", price: BASE_PRICE };

const sess = (id: string, label: string, dates: string, days: string, time: string, capacity: number): Session => ({
  id, label, dates, days, time, capacity, enrolled: 0, price: BASE_PRICE,
});

const campWeeks = (prefix: string, time: string, capacity: number): Session[] =>
  summerWeeks.map(([label, dates], i) => sess(`${prefix}-w${i + 1}`, label, dates, "Mon – Fri", time, capacity));

function cityPrograms(c: CityVenues): Program[] {
  const base = { locationSlug: c.slug, image: "", taxable: true, tags: [] as string[], remindersEnabled: true, discounts: [] as Discount[] };
  return [
    {
      ...base,
      id: `${c.code}-sportplus`,
      name: "SportPlus Summer Camp",
      category: "Camps",
      season: "Summer 2027",
      ages: [6, 12],
      ageAsOf: "2027-07-01",
      venue: c.camp,
      description: "Full-day multi-sport camp: soccer, lacrosse, basketball and flag football with daily skill sessions, Colour Wars and TOP Olympics.",
      sessions: campWeeks(`${c.code}sp`, "9:00am – 4:00pm", 80),
      options: [option],
      addOns: [lunch],
    },
    {
      ...base,
      id: `${c.code}-hockey-camp`,
      name: "Summer Hockey Camp",
      category: "Hockey",
      season: "Summer 2027",
      ages: [5, 12],
      ageAsOf: "2027-07-01",
      venue: c.arena,
      description: "Daily on-ice development — power skating, skills stations and small-area games — plus off-ice multi-sport.",
      sessions: campWeeks(`${c.code}hk`, "9:00am – 4:00pm", 48),
      options: [option],
      addOns: [lunch],
    },
    {
      ...base,
      id: `${c.code}-rec-soccer`,
      name: "Rec Soccer Program",
      category: "Soccer",
      season: "Spring 2027",
      ages: [4, 12],
      ageAsOf: "2027-12-31",
      venue: c.field,
      description: "Canada Soccer pathway recreational program. Choose the stage that fits your player: Active Start, FUNdamentals or Learn-to-Train.",
      sessions: [
        sess(`${c.code}sc-as`, "Active Start (Ages 4–5)", "Apr 17 – Jun 19", "Saturdays", "9:00am – 10:00am", 40),
        sess(`${c.code}sc-fun`, "FUNdamentals (Ages 6–8)", "Apr 17 – Jun 19", "Saturdays", "10:15am – 11:30am", 48),
        sess(`${c.code}sc-ltt`, "Learn-to-Train (Ages 9–12)", "Apr 17 – Jun 19", "Saturdays", "11:45am – 1:15pm", 48),
      ],
      options: [option],
      addOns: [],
    },
    {
      ...base,
      id: `${c.code}-sixes-lacrosse`,
      name: "Sixes Lacrosse League",
      category: "Lacrosse",
      season: "Spring 2027",
      ages: [7, 14],
      ageAsOf: "2027-12-31",
      venue: c.lacrosse,
      description: "Fast, small-sided sixes lacrosse with weekly skills and games, grouped by age division.",
      sessions: [
        sess(`${c.code}lx-u9`, "U9", "Apr 13 – Jun 15", "Tuesdays", "5:30pm – 6:30pm", 36),
        sess(`${c.code}lx-u11`, "U11", "Apr 13 – Jun 15", "Tuesdays", "6:45pm – 7:45pm", 36),
        sess(`${c.code}lx-u13`, "U13", "Apr 15 – Jun 17", "Thursdays", "5:30pm – 6:45pm", 36),
        sess(`${c.code}lx-u15`, "U15", "Apr 15 – Jun 17", "Thursdays", "7:00pm – 8:15pm", 36),
      ],
      options: [option],
      addOns: [],
    },
    {
      ...base,
      id: `${c.code}-learn-to-play`,
      name: "Learn-to-Play Hockey Program",
      category: "Hockey",
      season: "Winter 2026–27",
      ages: [4, 8],
      ageAsOf: "2026-12-31",
      venue: c.arena,
      description: "Hockey Canada-aligned curriculum for first-time players. Full gear required.",
      sessions: [
        sess(`${c.code}ltp-sat`, "Saturday AM", "Jan 9 – Mar 20", "Saturdays", "8:00am – 9:00am", 30),
        sess(`${c.code}ltp-sun`, "Sunday PM", "Jan 10 – Mar 21", "Sundays", "4:00pm – 5:00pm", 30),
      ],
      options: [option],
      addOns: [],
    },
  ];
}

/** Built-in catalog: the same five programs at every location, all starting as drafts. */
export const SEED_PROGRAMS: Program[] = CITY_VENUES.flatMap(cityPrograms);

/**
 * Family-facing catalog: only staff-PUBLISHED programs (filled by
 * applyManagedPrograms). Seed programs are drafts until staff publish them.
 */
export const PROGRAMS: Program[] = [];


export function getLocation(slug: string): Location | undefined {
  return LOCATIONS.find((l) => l.slug === slug);
}

export function programsFor(slug: string): Program[] {
  return PROGRAMS.filter((p) => p.locationSlug === slug);
}


/**
 * Layer staff-published programs from the backend over the seed catalog.
 * Mutates PROGRAMS in place so every existing lookup (decodeLine, programsFor)
 * sees the live catalog.
 */
let RAW_PROGRAMS: Program[] = [];
export function applyManagedPrograms(managed: Program[]): void {
  RAW_PROGRAMS = managed;
  rebuildCatalog();
}

/** Re-layer global add-ons and sort by start date (soonest first). */
export function rebuildCatalog(): void {
  const list = RAW_PROGRAMS.map((p) => ({
    ...p,
    addOns: [...(p.addOns ?? []).filter((a) => !a.id.startsWith("g-")), ...globalAddOnsFor(p, FINANCE.globalAddOns)],
  })).sort((a, b) => programStart(a) - programStart(b));
  PROGRAMS.splice(0, PROGRAMS.length, ...list);
}

/** Earliest session start (ms) — used to order programs soonest first. */
export function programStart(p: Program): number {
  const t = p.sessions.map((s) => sessionRange(s.dates || "", p.season || "")[0].getTime()).filter((n) => Number.isFinite(n));
  return t.length ? Math.min(...t) : Number.MAX_SAFE_INTEGER;
}

export function parseProgram(json: string): Program | null {
  try {
    const p = JSON.parse(json) as Program;
    if (!p?.id || !Array.isArray(p.sessions)) return null;
    if (!Array.isArray(p.options)) p.options = [];
    const tags = Array.isArray(p.tags) ? p.tags : p.badge ? [p.badge] : [];
    return { ...p, tags, badge: undefined, addOns: Array.isArray(p.addOns) ? p.addOns : [], discounts: Array.isArray(p.discounts) ? p.discounts : [] };
  } catch {
    return null;
  }
}

export function programTags(p: Program): string[] {
  return p.tags ?? (p.badge ? [p.badge] : []);
}

export function getProgram(id: string): Program | undefined {
  return PROGRAMS.find((p) => p.id === id);
}

const fmt = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });
export function formatPrice(amount: number): string {
  return fmt.format(amount);
}

const isoDay = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** The date ages are measured on, per the program's "Age As Of" setting. */
export function ageAsOfDate(p: Program): string {
  const start = programStart(p);
  const hasStart = start !== Number.MAX_SAFE_INTEGER;
  if (p.ageAsOfMode === "year") return `${hasStart ? new Date(start).getFullYear() : new Date().getFullYear()}-12-31`;
  if (p.ageAsOfMode === "start" && hasStart) return isoDay(start);
  return p.ageAsOf || isoDay(hasStart ? start : Date.now());
}

/** Eligible birth years [earliest, latest]. Older programs derive them from their age range. */
export function birthYearsOf(p: Program): [number, number] {
  if (p.birthYears && p.birthYears.length === 2) return [Math.min(...p.birthYears), Math.max(...p.birthYears)];
  const y = Number(ageAsOfDate(p).slice(0, 4)) || new Date().getFullYear();
  return [y - p.ages[1], y - p.ages[0]];
}

/** Approximate ages for the birth-year range, measured on the Age As Of date. */
export function agesFor(p: Program): [number, number] {
  const y = Number(ageAsOfDate(p).slice(0, 4)) || new Date().getFullYear();
  const [a, b] = birthYearsOf(p);
  return [Math.max(0, y - b), Math.max(0, y - a)];
}

export function isEligible(p: Program, dob: string): boolean {
  const year = Number((dob || "").slice(0, 4));
  if (!year) return false;
  const [a, b] = birthYearsOf(p);
  return year >= a && year <= b;
}

export function eligibilityLabel(p: Program): string {
  const [a, b] = birthYearsOf(p);
  return a === b ? `Born ${a}` : `Born ${a}–${b}`;
}

export function ageOn(dob: string, asOf: string): number {
  const d = new Date(dob);
  const a = new Date(asOf);
  let age = a.getFullYear() - d.getFullYear();
  const m = a.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && a.getDate() < d.getDate())) age--;
  return age;
}

// Registration line encoding — each cart line is one child in one session.
// reg|programId|sessionId|optionId|childId|addon+addon[|discountId]
export function encodeLine(p: {
  programId: string;
  sessionId: string;
  optionId: string;
  childId: string;
  addOnIds: string[];
  discountId?: string;
}): string {
  const parts = ["reg", p.programId, p.sessionId, p.optionId, p.childId, p.addOnIds.join("+") || "-"];
  if (p.discountId) parts.push(p.discountId);
  return parts.join("|");
}

export type DecodedLine = {
  program: Program;
  session: Session;
  option: PriceOption;
  childId: string;
  addOns: AddOn[];
  /** Discounts applied to the session fee (alternative pricing, early-bird). */
  discounts: Discount[];
  /** Time slot picked within the session, if the session has slots. */
  slot?: TimeSlot;
};

/** Cart lines store "sessionId~slotId" in the session field when a time slot is picked. */
export function sessionKey(sessionId: string, slotId?: string): string {
  return slotId ? `${sessionId}~${slotId}` : sessionId;
}

export function decodeLine(id: string): DecodedLine | null {
  const [tag, programId, sessionId, optionId, childId, addons, discountId] = id.split("|");
  if (tag !== "reg") return null;
  const program = getProgram(programId);
  if (!program) return null;
  const [baseId, slotId] = (sessionId ?? "").split("~");
  const raw = program.sessions.find((s) => s.id === baseId);
  if (!raw) return null;
  const slot = slotId ? (raw.slots ?? []).find((t) => t.id === slotId) : undefined;
  const session: Session = withOption(raw, slot);
  const base = program.options.find((o) => o.id === optionId) ?? program.options[0] ?? { id: optionId || "std", label: "Registration", detail: "", price: 0 };
  const priced = priceFor(program, session, discountId);
  const option: PriceOption = { ...base, label: session.label, price: priced.price };
  const addOns = addons && addons !== "-" ? program.addOns.filter((a) => addons.split("+").includes(a.id)) : [];
  return { program, session, option, childId, addOns, discounts: priced.applied, slot };
}

/** HST owed on a single unit of a line, honouring per-product + per-add-on toggles. */
export function lineTax(id: string): number {
  const d = decodeLine(id);
  if (!d || isCamp(d.program)) return 0;
  const base = d.program.taxable ? d.option.price : 0;
  const extras = d.addOns.filter((a) => a.taxable).reduce((s, a) => s + a.price, 0);
  return Math.round((base + extras) * HST_RATE * 100) / 100;
}

/** Automatic multi-registration savings (no code needed). */
export const SIBLING_DISCOUNT_PERCENT = 10;
export const EXTRA_WEEK_DISCOUNT = 25;
/** Program-only sibling / multi-week incentive amount (CAD). */
export const PROGRAM_INCENTIVE = 50;

/**
 * Cart-level automatic discounts, in dollars:
 *  - Sibling: 10% off every child after the first (the child with the largest
 *    total stays full price).
 *  - Multi-week: $25 off each additional camp week a child takes in the same
 *    camp program.
 */
export function bundleDiscounts(lines: { lineId: string; price: number }[]): { sibling: number; multiWeek: number; total: number } {
  const byChild = new Map<string, { total: number; lines: { lineId: string; price: number }[] }>();
  for (const l of lines) {
    const [tag, , , , childId] = l.lineId.split("|");
    if (tag !== "reg" || !childId) continue;
    const g = byChild.get(childId) ?? { total: 0, lines: [] };
    g.total += l.price;
    g.lines.push(l);
    byChild.set(childId, g);
  }
  const groups = [...byChild.values()].sort((a, b) => b.total - a.total);
  let sibling = 0;
  groups.slice(1).forEach((g) => { sibling += (g.total * FINANCE.siblingPct) / 100; });
  let multiWeek = 0;
  for (const g of groups) {
    const perProgram = new Map<string, number>();
    for (const l of g.lines) {
      const programId = l.lineId.split("|")[1];
      const p = getProgram(programId);
      if (!p || !isCamp(p)) continue;
      perProgram.set(programId, (perProgram.get(programId) ?? 0) + 1);
    }
    for (const n of perProgram.values()) if (n > 1) multiWeek += (n - 1) * FINANCE.extraWeek;
  }
  // Program-only incentives ($50 each), set in the Program Builder.
  const kids = new Map<string, Set<string>>();
  const weeks = new Map<string, number>();
  for (const l of lines) {
    const [tag, programId, , , childId] = l.lineId.split("|");
    if (tag !== "reg" || !childId) continue;
    const p = getProgram(programId);
    if (!p?.incentives) continue;
    if (p.incentives.sibling) { const s = kids.get(programId) ?? new Set<string>(); s.add(childId); kids.set(programId, s); }
    if (p.incentives.multiWeek) { const k = `${programId}|${childId}`; weeks.set(k, (weeks.get(k) ?? 0) + 1); }
  }
  for (const s of kids.values()) if (s.size > 1) sibling += (s.size - 1) * PROGRAM_INCENTIVE;
  for (const n of weeks.values()) if (n > 1) multiWeek += (n - 1) * PROGRAM_INCENTIVE;
  // Session combo deals: $X off each extra option of the same session per child.
  const combos = new Map<string, { n: number; off: number }>();
  for (const l of lines) {
    const [tag, programId, sessionId, , childId] = l.lineId.split("|");
    if (tag !== "reg" || !childId) continue;
    const [baseSid, slotId] = (sessionId ?? "").split("~");
    if (!slotId) continue;
    const s = getProgram(programId)?.sessions.find((x) => x.id === baseSid);
    const off = Math.max(0, s?.comboDiscount ?? 0);
    if (!off) continue;
    const k = `${programId}|${baseSid}|${childId}`;
    const c = combos.get(k) ?? { n: 0, off };
    c.n += 1;
    combos.set(k, c);
  }
  let combo = 0;
  for (const c of combos.values()) if (c.n > 1) combo += (c.n - 1) * c.off;
  multiWeek += combo;
  sibling = Math.round(sibling * 100) / 100;
  return { sibling, multiWeek, total: Math.round((sibling + multiWeek) * 100) / 100 };
}
