import { internal } from "./_generated/api";

/** Default inbox for each location when Settings has no custom address. */
export function defaultLocationInbox(slug: string): string {
  const s = slug.toLowerCase();
  if (s === "toronto" || !["york", "oakville", "whitby"].includes(s)) return "info@topsports.ca";
  return `${s}@topsports.ca`;
}

const FALLBACK_SUPPORT = "info@topsports.ca";
const isEmail = (s: unknown): s is string => typeof s === "string" && /^\S+@\S+\.\S+$/.test(s.trim());

export type ReplyBook = { support: string; byLocation: Record<string, string> };

/** Read support + location inboxes from Settings (falls back to defaults). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadReplyBook(ctx: any): Promise<ReplyBook> {
  const book: ReplyBook = { support: FALLBACK_SUPPORT, byLocation: {} };
  try {
    const raw: string | null = await ctx.runQuery(internal.siteAdmin.settingsInternal, {});
    if (!raw) return book;
    const s = JSON.parse(raw) as { supportEmail?: string; locations?: { slug: string; email?: string }[] };
    if (isEmail(s.supportEmail)) book.support = s.supportEmail.trim();
    for (const l of s.locations ?? []) if (l?.slug && isEmail(l.email)) book.byLocation[l.slug] = l.email.trim();
  } catch {
    /* defaults */
  }
  return book;
}

/** Reply-to for an email: manual override → location inbox → support email. */
export function pickReplyTo(book: ReplyBook, locationSlug?: string, override?: string): string {
  if (isEmail(override)) return override.trim();
  if (locationSlug) return book.byLocation[locationSlug] ?? defaultLocationInbox(locationSlug);
  return book.support;
}
