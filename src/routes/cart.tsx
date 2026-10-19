import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useCart } from "@/lib/commerce";
import { useFamily } from "@/lib/family";
import { catalogState } from "@/components/catalog-sync";
import { bundleDiscounts, decodeLine, formatOutDate, formatPrice, getLocation, lineTax, sessionName, sessionLocation } from "@/data/registration";

export const Route = createFileRoute("/cart")({ component: CartPage });

export function useCartTotals() {
  const { items, subtotal } = useCart();
  const tax = items.reduce((s, i) => s + lineTax(i.productId) * i.quantity, 0);
  return { subtotal, tax, total: subtotal + tax };
}

function lastLocation(): string | null {
  try {
    const s = localStorage.getItem("top_last_location");
    return s && getLocation(s) ? s : null;
  } catch {
    return null;
  }
}

function CartPage() {
  const { items, removeItem, addItem, updateQuantity } = useCart();
  const fam = useFamily();
  const { subtotal, tax, total } = useCartTotals();
  const last = lastLocation();

  // Never show totals from a half-loaded catalog.
  if (items.length > 0 && !catalogState.loaded) {
    return (
      <div className="mx-auto grid max-w-7xl animate-pulse gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_360px] lg:px-8" aria-busy="true" aria-label="Loading cart">
        <div className="space-y-3"><div className="h-10 w-32 rounded bg-muted" /><div className="h-32 rounded-2xl bg-muted" /><div className="h-32 rounded-2xl bg-muted" /></div>
        <div className="h-72 rounded-2xl bg-muted" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-4 py-28 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M2.5 3.5h2.6l2.4 11.2a1.6 1.6 0 0 0 1.6 1.3h8.7a1.6 1.6 0 0 0 1.6-1.2l1.6-6.8H6.2" /></svg>
        </div>
        <h1 className="display-condensed mt-5 text-4xl font-black italic md:text-5xl">Your Cart Is Empty</h1>
        <p className="mt-2 text-muted-foreground">Pick a program to start a registration.</p>
        {last ? (
          <Link to="/$location" params={{ location: last }} className="mt-6 inline-flex rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground transition-all hover:scale-105">Back to TOP Sports {getLocation(last)?.name}</Link>
        ) : (
          <Link to="/" hash="locations" className="mt-6 inline-flex rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground transition-all hover:scale-105">Choose a Location</Link>
        )}
      </div>
    );
  }

  const bundle = bundleDiscounts(items.map((i) => ({ lineId: i.productId, price: i.price * i.quantity })));
  const savings = Math.min(subtotal, bundle.total);

  // Group lines by child so families can check each child at a glance.
  const groups = new Map<string, typeof items>();
  for (const i of items) {
    const d = decodeLine(i.productId);
    const key = d?.childId ?? "other";
    groups.set(key, [...(groups.get(key) ?? []), i]);
  }

  const remove = (i: (typeof items)[number]) => {
    removeItem(i.productId);
    toast("Registration removed", {
      description: i.name,
      action: { label: "Undo", onClick: () => addItem({ productId: i.productId, name: i.name, price: i.price, imageUrl: i.imageUrl }) },
    });
  };

  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 sm:py-12 lg:grid-cols-[1fr_360px] lg:px-8">
      <div className="min-w-0">
        <h1 className="display-condensed text-4xl font-black italic md:text-5xl">Cart</h1>
        {savings > 0 && (
          <div className="mt-4 rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm font-semibold">
            You're saving {formatPrice(savings)} with sibling and multi-session discounts.
          </div>
        )}
        <div className="mt-6 space-y-6">
          {[...groups.entries()].map(([childId, lines]) => {
            const child = childId === "other" ? undefined : fam.childById(childId);
            const groupTotal = lines.reduce((s, i) => s + i.price * i.quantity, 0);
            return (
              <section key={childId}>
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <h2 className="text-xl font-bold">{child ? `${child.firstName} ${child.lastName}` : "Other Items"}</h2>
                  <span className="text-sm text-muted-foreground">{lines.length} registration{lines.length > 1 ? "s" : ""} · {formatPrice(groupTotal)}</span>
                </div>
                <div className="space-y-3">
                  {lines.map((i) => {
                    const d = decodeLine(i.productId);
                    return (
                      <div key={i.productId} className="rounded-2xl border border-border bg-card p-4">
                        <div className="flex gap-3 sm:gap-4">
                          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-muted sm:h-20 sm:w-20">
                            {i.imageUrl ? <img src={i.imageUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" /> : null}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-bold leading-snug">{d ? `${d.program.name} — ${sessionName(d.session)}` : i.name}</p>
                            {d && (
                              <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                                {(() => { const ch = fam.childById(d.childId); return ch ? <p><span className="font-semibold text-foreground">Participant:</span> {ch.firstName} {ch.lastName}</p> : null; })()}
                                {d.session.dates?.trim() && <p><span className="font-semibold text-foreground">Dates:</span> {d.session.dates}</p>}
                                <p>{[d.session.days, d.session.time, sessionLocation(d.program, d.session)].filter((x) => x?.trim()).join(" · ")}</p>
                                {d.addOns.length > 0 && <p>+ {d.addOns.map((a) => a.name).join(", ")}</p>}
                                {(d.program.outDates?.length ?? 0) > 0 && <p><span className="font-semibold text-foreground">Out Dates:</span> {d.program.outDates!.map((o) => formatOutDate(o.date)).join(", ")}</p>}
                                {fam.friendRequests[i.productId] && <p className="text-xs">Friend request: {fam.friendRequests[i.productId]}</p>}
                              </div>
                            )}
                          </div>
                        </div>
                        {d && d.session.capacity > 0 && d.session.enrolled >= d.session.capacity && (
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm">
                            <span className="font-semibold">This session just filled up.</span>
                            <div className="flex gap-2">
                              <button onClick={() => remove(i)} className="h-9 cursor-pointer rounded-full border border-border bg-card px-3.5 text-xs font-semibold hover:bg-accent">Remove</button>
                              <Link to="/programs/$programId" params={{ programId: d.program.id }} onClick={() => removeItem(i.productId)} className="inline-flex h-9 items-center rounded-full bg-primary px-3.5 text-xs font-semibold text-primary-foreground">Join Waitlist</Link>
                            </div>
                          </div>
                        )}
                        {i.quantity > 1 && (
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warning bg-warning/15 px-3.5 py-2.5 text-sm">
                            <span className="font-semibold">Added {i.quantity} times for the same participant</span>
                            <div className="flex items-center gap-1 rounded-full border border-border bg-card p-1">
                              <button onClick={() => updateQuantity(i.productId, i.quantity - 1)} aria-label="Remove one" className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-lg font-bold hover:bg-accent">−</button>
                              <span className="w-6 text-center font-bold">{i.quantity}</span>
                              <button onClick={() => updateQuantity(i.productId, i.quantity + 1)} aria-label="Add one" className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-lg font-bold hover:bg-accent">+</button>
                            </div>
                          </div>
                        )}
                        <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
                          <button onClick={() => remove(i)} className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-full px-4 text-sm font-semibold text-destructive hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>
                            Remove
                          </button>
                          <span className="text-lg font-bold">{formatPrice(i.price * i.quantity)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
        {last && (
          <Link to="/$location" params={{ location: last }} className="mt-6 inline-flex rounded-full border border-border px-5 py-2.5 text-sm font-semibold hover:bg-accent">+ Add another program</Link>
        )}
      </div>
      <Summary subtotal={subtotal} tax={tax} total={total} credit={fam.credit} savings={savings} bundle={bundle}>
        <Link to="/checkout" className="block w-full rounded-full bg-primary px-5 py-3 text-center font-bold text-primary-foreground shadow-md transition-all hover:scale-[1.02]">Review & Pay</Link>
      </Summary>
    </div>
  );
}

export function Summary({ subtotal, tax, total, credit, savings = 0, bundle, children }: { subtotal: number; tax: number; total: number; credit: number; savings?: number; bundle?: { sibling: number; multiWeek: number }; children: React.ReactNode }) {
  const afterSavings = Math.max(0, total - savings);
  const applied = Math.min(credit, afterSavings);
  return (
    <aside className="h-fit space-y-3 rounded-2xl border border-border bg-card p-6 lg:sticky lg:top-24">
      <h2 className="text-xl font-bold">Order Summary</h2>
      <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span>{formatPrice(subtotal)}</span></div>
      <div className="flex justify-between text-sm"><span className="text-muted-foreground">HST (13%, if applicable)</span><span>{formatPrice(tax)}</span></div>
      {bundle && bundle.sibling > 0 && <div className="flex justify-between text-sm text-success"><span>Sibling Savings</span><span>-{formatPrice(bundle.sibling)}</span></div>}
      {bundle && bundle.multiWeek > 0 && <div className="flex justify-between text-sm text-success"><span>Multi-Week / Multi-Session Savings</span><span>-{formatPrice(bundle.multiWeek)}</span></div>}
      {applied > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Account credit</span><span>-{formatPrice(applied)}</span></div>}
      <div className="flex items-baseline justify-between border-t border-border pt-3">
        <span className="font-semibold">Estimated Total (CAD)</span>
        <span className="text-2xl font-bold">{formatPrice(afterSavings - applied)}</span>
      </div>
      <p className="text-xs text-muted-foreground">Coupons can be added on the next step.</p>
      {children}
      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <img src="/brand-logo.svg" alt="" className="h-3.5 w-3.5 dark:invert" /> Secure checkout by Stripe
      </p>
    </aside>
  );
}
