import { action, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import Stripe from "stripe";
import { authComponent } from "./auth";
import { findProgram, loadFinance } from "./programLookup";
import { HST_RATE, isCamp, priceFor, withOption, formatOutDate } from "../src/data/registration";

interface AuthUser {
  _id: string;
  email: string;
  name?: string | null;
}

type PricedLine = { lineId: string; name: string; priceCents: number; taxCents: number; camp: boolean; incSibling: boolean; incMulti: boolean; comboCents: number };

const PROGRAM_INCENTIVE_CENTS = 5000;

/** Mirrors bundleDiscounts() in src/data/registration.ts, in cents. */
function bundleCents(lines: PricedLine[], qty: Map<string, number>, siblingPct: number, extraWeek: number): number {
  const byChild = new Map<string, { total: number; lines: PricedLine[] }>();
  for (const l of lines) {
    const childId = l.lineId.split("|")[4];
    const g = byChild.get(childId) ?? { total: 0, lines: [] };
    g.total += l.priceCents * (qty.get(l.lineId) ?? 1);
    g.lines.push(l);
    byChild.set(childId, g);
  }
  const groups = [...byChild.values()].sort((a, b) => b.total - a.total);
  let off = 0;
  groups.slice(1).forEach((g) => { off += g.total * (siblingPct / 100); });
  for (const g of groups) {
    const per = new Map<string, number>();
    for (const l of g.lines) if (l.camp) per.set(l.lineId.split("|")[1], (per.get(l.lineId.split("|")[1]) ?? 0) + 1);
    for (const n of per.values()) if (n > 1) off += (n - 1) * extraWeek * 100;
  }
  const kids = new Map<string, Set<string>>();
  const weeks = new Map<string, number>();
  for (const l of lines) {
    const [, programId, , , childId] = l.lineId.split("|");
    if (l.incSibling) { const s = kids.get(programId) ?? new Set<string>(); s.add(childId); kids.set(programId, s); }
    if (l.incMulti) { const k = `${programId}|${childId}`; weeks.set(k, (weeks.get(k) ?? 0) + 1); }
  }
  for (const s of kids.values()) if (s.size > 1) off += (s.size - 1) * PROGRAM_INCENTIVE_CENTS;
  for (const n of weeks.values()) if (n > 1) off += (n - 1) * PROGRAM_INCENTIVE_CENTS;
  const combos = new Map<string, { n: number; c: number }>();
  for (const l of lines) {
    if (!l.comboCents) continue;
    const [, programId, sessionId, , childId] = l.lineId.split("|");
    const [baseSid, slotId] = (sessionId ?? "").split("~");
    if (!slotId) continue;
    const k = `${programId}|${baseSid}|${childId}`;
    const g = combos.get(k) ?? { n: 0, c: l.comboCents };
    g.n += 1;
    combos.set(k, g);
  }
  for (const g of combos.values()) if (g.n > 1) off += (g.n - 1) * g.c;
  return Math.round(off);
}
type CheckoutContext = {
  email: string | null;
  creditCents: number;
  coupon: { code: string; kind: string; value: number } | null;
  lines: PricedLine[];
  siblingPct: number;
  extraWeek: number;
};

const cents = (n: number) => Math.round(n * 100);
const norm = (c: string) => c.trim().toUpperCase().replace(/\s+/g, "");

/**
 * Internal: price every cart line from the server-side program catalog (never
 * the browser), plus the family's real credit balance and a validated coupon.
 */
export const checkoutContext = internalQuery({
  args: { lineIds: v.array(v.string()), couponCode: v.optional(v.string()) },
  handler: async (ctx, args): Promise<CheckoutContext> => {
    const user = (await authComponent.getAuthUser(ctx)) as AuthUser | null;
    let creditCents = 0;
    if (user) {
      const rows = await ctx.db.query("ledger").withIndex("by_user", (q) => q.eq("userId", user._id)).collect();
      creditCents = Math.max(0, rows.filter((r) => r.type === "credit" || r.type === "credit_used").reduce((s, r) => s + r.amountCents, 0));
    }
    let coupon: CheckoutContext["coupon"] = null;
    if (args.couponCode) {
      const c = await ctx.db.query("coupons").withIndex("by_code", (q) => q.eq("code", norm(args.couponCode!))).first();
      if (c && c.active && !(c.expiresAt && c.expiresAt < Date.now()) && !(c.maxUses && c.uses >= c.maxUses)) {
        coupon = { code: c.code, kind: c.kind, value: c.value };
      }
    }
    const fin = await loadFinance(ctx);
    const lines: PricedLine[] = [];
    for (const lineId of args.lineIds) {
      const [tag, programId, sessionId, , , addons, discountId] = lineId.split("|");
      if (tag !== "reg") continue;
      const p = await findProgram(ctx, programId, fin);
      if (!p) continue;
      const [baseSid, slotId] = (sessionId ?? "").split("~");
      const s = p.sessions.find((x) => x.id === baseSid);
      if (!s) continue;
      const slot = slotId ? (s.slots ?? []).find((t) => t.id === slotId) : undefined;
      if (slotId && !slot) continue;
      const base = priceFor(p, withOption(s, slot), discountId).price;
      const addOns = addons && addons !== "-" ? p.addOns.filter((a) => addons.split("+").includes(a.id)) : [];
      const price = base + addOns.reduce((t, a) => t + a.price, 0);
      const taxable = isCamp(p) ? 0 : (p.taxable ? base : 0) + addOns.filter((a) => a.taxable).reduce((t, a) => t + a.price, 0);
      lines.push({
        lineId,
        name: `${p.name} — ${s.label}${slot ? ` (${slot.label})` : ""}${(p.outDates?.length ?? 0) > 0 ? ` · Out Dates: ${p.outDates!.map((o) => formatOutDate(o.date)).join(", ")}` : ""}`,
        priceCents: cents(price),
        taxCents: Math.round(taxable * HST_RATE * 100),
        camp: isCamp(p),
        incSibling: !!p.incentives?.sibling,
        incMulti: !!p.incentives?.multiWeek,
        comboCents: slot ? cents(Math.max(0, s.comboDiscount ?? 0)) : 0,
      });
    }
    return { email: user?.email ?? null, creditCents, coupon, lines, siblingPct: fin.siblingPct, extraWeek: fin.extraWeek };
  },
});

/**
 * Family checkout: creates a Stripe Checkout Session for the cart where the
 * charged amount already has the coupon and account credit taken off, so the
 * card is charged exactly the Total Due shown on the receipt.
 */
export const createRegistrationCheckout = action({
  args: {
    items: v.array(v.object({ lineId: v.string(), quantity: v.number() })),
    couponCode: v.optional(v.string()),
    useCredit: v.boolean(),
    successUrl: v.string(),
    cancelUrl: v.string(),
  },
  handler: async (ctx, args): Promise<{ url: string; free: boolean; dueCents: number }> => {
    const info: CheckoutContext = await ctx.runQuery(internal.regCheckout.checkoutContext, {
      lineIds: args.items.map((i) => i.lineId),
      couponCode: args.couponCode,
    });
    if (!info.email) throw new ConvexError("Please sign in to complete your registration.");
    if (info.lines.length === 0) throw new ConvexError("None of the programs in your cart are available.");

    const qty = new Map(args.items.map((i) => [i.lineId, Math.max(1, Math.floor(i.quantity))]));
    const subtotal = info.lines.reduce((s, l) => s + l.priceCents * (qty.get(l.lineId) ?? 1), 0);
    const tax = info.lines.reduce((s, l) => s + l.taxCents * (qty.get(l.lineId) ?? 1), 0);
    const bundle = Math.min(subtotal, bundleCents(info.lines, qty, info.siblingPct, info.extraWeek));
    const total = subtotal + tax - bundle;
    const couponOff = info.coupon
      ? Math.min(subtotal, info.coupon.kind === "percent" ? Math.round((subtotal * info.coupon.value) / 100) : Math.round(info.coupon.value))
      : 0;
    const afterCoupon = Math.max(0, total - couponOff);
    const creditOff = args.useCredit ? Math.min(info.creditCents, afterCoupon) : 0;
    const due = Math.max(0, afterCoupon - creditOff);

    // Fully covered by coupon/credit: nothing to charge.
    if (due === 0) {
      return { url: args.successUrl.replace("{CHECKOUT_SESSION_ID}", "covered"), free: true, dueCents: 0 };
    }
    if (due < 50) throw new ConvexError("The amount due is below Stripe's $0.50 minimum. Please contact your location.");

    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new ConvexError("Payments are not connected yet.");
    const stripe = new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = info.lines.map((l) => ({
      price_data: { currency: "cad", product_data: { name: l.name }, unit_amount: l.priceCents },
      quantity: qty.get(l.lineId) ?? 1,
    }));
    if (tax > 0) {
      lineItems.push({ price_data: { currency: "cad", product_data: { name: "HST (13%)" }, unit_amount: tax }, quantity: 1 });
    }

    const reduction = bundle + couponOff + creditOff;
    let discounts: Stripe.Checkout.SessionCreateParams.Discount[] | undefined;
    try {
      if (reduction > 0) {
        const label = [bundle > 0 ? "Family Savings" : "", info.coupon && couponOff > 0 ? `Coupon ${info.coupon.code}` : "", creditOff > 0 ? "Account Credit" : ""].filter(Boolean).join(" + ");
        const c = await stripe.coupons.create({ amount_off: reduction, currency: "cad", duration: "once", max_redemptions: 1, name: label.slice(0, 40) });
        discounts = [{ coupon: c.id }];
      }
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: lineItems,
        customer_email: info.email,
        success_url: args.successUrl,
        cancel_url: args.cancelUrl,
        ...(discounts ? { discounts } : {}),
        metadata: { couponCode: info.coupon?.code ?? "", creditCents: String(creditOff), couponCents: String(couponOff) },
      });
      await ctx.runMutation(internal.commerce.recordOrder, {
        stripeSessionId: session.id,
        items: info.lines.map((l) => ({ productId: l.lineId, name: l.name, price: l.priceCents + l.taxCents, quantity: qty.get(l.lineId) ?? 1 })),
        amountTotal: session.amount_total ?? due,
        currency: "cad",
        status: "pending",
        customerEmail: info.email,
      });
      await ctx.runMutation(internal.abandoned.recordPendingCart, {
        email: info.email,
        stripeSessionId: session.id,
        summary: info.lines.map((l) => l.name).join(", ").slice(0, 500),
        dueCents: due,
      });
      if (!session.url) throw new Error("Stripe did not return a checkout URL.");
      return { url: session.url, free: false, dueCents: due };
    } catch (err) {
      throw new ConvexError(err instanceof Error ? `Stripe rejected the checkout: ${err.message}` : "Stripe rejected the checkout.");
    }
  },
});
