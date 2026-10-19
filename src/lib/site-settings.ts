import { FINANCE, LOCATIONS, ORIGINAL_WAIVERS, STOCK, WAIVERS, rebuildCatalog, type GlobalAddOn, type Location, type Waiver } from "@/data/registration";

export type LocationSettings = {
  slug: string;
  name: string;
  region: string;
  blurb: string;
  image: string;
  email: string;
  phone: string;
  venues: string[];
  /** Street address per venue name. */
  venueAddresses: Record<string, string>;
};

export type FinanceSettings = {
  /** % withheld for card processing, used for net revenue reporting. */
  feePct: number;
  /** Automatic sibling savings (% off each extra child). */
  siblingPct: number;
  /** Automatic $ off each extra camp week for the same child. */
  extraWeek: number;
  globalAddOns: GlobalAddOn[];
};

export type SiteSettings = {
  orgName: string;
  hubTitle: string;
  hubSubtitle: string;
  announcementOn: boolean;
  announcement: string;
  supportEmail: string;
  supportPhone: string;
  footerBlurb: string;
  locations: LocationSettings[];
  finance: FinanceSettings;
  /** Photo library offered in every image picker (super admin managed). */
  stockPhotos: string[];
  /** Waivers & policies families agree to (super admin managed). */
  waivers: Waiver[];
};

const defaultEmail = (slug: string) => (slug === "toronto" ? "info@topsports.ca" : `${slug}@topsports.ca`);

const ORIGINAL: Location[] = LOCATIONS.map((l) => ({ ...l, venues: [...l.venues] }));

export function defaultFinance(): FinanceSettings {
  return { feePct: 4, siblingPct: 10, extraWeek: 25, globalAddOns: [] };
}

export function defaultSettings(): SiteSettings {
  return {
    orgName: "TOP Sports",
    hubTitle: "Choose Your Location",
    hubSubtitle: "",
    announcementOn: false,
    announcement: "",
    supportEmail: "info@topsports.ca",
    supportPhone: "",
    footerBlurb:
      "Register for Ontario's premier youth multi-sport organization, proudly offering hockey, soccer, lacrosse, and camps in Toronto, Oakville, York, and Whitby.",
    locations: ORIGINAL.map((l) => ({
      slug: l.slug,
      name: l.name,
      region: l.region,
      blurb: l.blurb,
      image: l.image,
      email: defaultEmail(l.slug),
      phone: "",
      venues: [...l.venues],
      venueAddresses: { ...(l.venueAddresses ?? {}) },
    })),
    finance: defaultFinance(),
    stockPhotos: Object.values(STOCK),
    waivers: ORIGINAL_WAIVERS.map((w) => ({ ...w })),
  };
}

/** Live settings used across the site (mutated in place when staff save). */
export const SITE: SiteSettings = defaultSettings();

const clamp = (n: unknown, lo: number, hi: number, d: number) => {
  const x = Number(n);
  return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d;
};

export function parseSettings(raw: string | null | undefined): SiteSettings {
  const base = defaultSettings();
  if (!raw) return base;
  try {
    const s = JSON.parse(raw) as Partial<SiteSettings>;
    const locs = base.locations.map((d) => {
      const o = { ...d, ...(s.locations ?? []).find((x) => x.slug === d.slug) };
      return { ...o, venueAddresses: o.venueAddresses && typeof o.venueAddresses === "object" ? o.venueAddresses : {} };
    });
    const f = { ...base.finance, ...(s.finance ?? {}) };
    const finance: FinanceSettings = {
      feePct: clamp(f.feePct, 0, 30, 4),
      siblingPct: clamp(f.siblingPct, 0, 100, 10),
      extraWeek: clamp(f.extraWeek, 0, 1000, 25),
      globalAddOns: Array.isArray(f.globalAddOns) ? f.globalAddOns.map((g) => ({ ...g, categories: Array.isArray(g.categories) ? g.categories : [] })) : [],
    };
    const stockPhotos = Array.isArray(s.stockPhotos) ? s.stockPhotos.filter((x) => typeof x === "string" && x.trim()) : base.stockPhotos;
    const waivers = Array.isArray(s.waivers)
      ? s.waivers.filter((w) => w && typeof w.id === "string" && typeof w.title === "string").map((w) => ({ id: w.id, title: w.title, summary: w.summary ?? "", text: typeof w.text === "string" ? w.text : "" }))
      : base.waivers;
    return { ...base, ...s, locations: locs, finance, stockPhotos, waivers };
  } catch {
    return base;
  }
}

export function applySiteSettings(s: SiteSettings) {
  Object.assign(SITE, s);
  for (const l of LOCATIONS) {
    const o = s.locations.find((x) => x.slug === l.slug);
    if (!o) continue;
    l.name = o.name || l.name;
    l.region = o.region;
    l.blurb = o.blurb;
    l.image = o.image || l.image;
    if (o.venues.length) l.venues = o.venues;
    l.venueAddresses = { ...(o.venueAddresses ?? {}) };
  }
  Object.assign(FINANCE, s.finance);
  WAIVERS.splice(0, WAIVERS.length, ...s.waivers.map((w) => ({ ...w })));
  rebuildCatalog();
}

export function locationContact(slugOrName: string): { email: string; phone: string } | undefined {
  const k = slugOrName.toLowerCase();
  const l = SITE.locations.find((x) => k.includes(x.slug) || k.includes(x.name.toLowerCase()));
  return l ? { email: l.email, phone: l.phone } : undefined;
}
