import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { useCart, useCheckout } from "@/lib/commerce";
import { useFamily } from "@/lib/family";
import { bundleDiscounts, FINANCE, decodeLine, formatDob, formatPrice, lineTax, sessionLocation, sessionName } from "@/data/registration";
import { useCartTotals } from "../cart";
import { useSession } from "@/lib/auth-client";
import { CLOUD_CREDIT_KEY } from "@/lib/cloud-sync";
import { FamilySignIn } from "@/components/family-signin";

export const Route = createFileRoute("/checkout/")({ component: CheckoutPage });

const PENDING_KEY = "top_pending_regs";
export const COUPON_KEY = "top_pending_coupon";

function CheckoutPage() {
  const { items } = useCart();
  const fam = useFamily();
  const { checkoutReady } = useCheckout();
  const createCheckout = useAction(api.regCheckout.createRegistrationCheckout);
  const navigate = useNavigate();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const { subtotal, tax, total } = useCartTotals();
  const agree = true;
  const { data: session, isPending: sessionPending } = useSession();
  const [codeInput, setCodeInput] = useState("");
  const [applied, setApplied] = useState<string | null>(null);
  const coupon = useQuery(api.coupons.validateCoupon, applied ? { code: applied } : "skip");

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-4 py-28 text-center">
        <h1 className="display-condensed text-4xl font-black italic md:text-5xl">Nothing to Check Out</h1>
        <Link to="/" hash="locations" className="mt-6 inline-flex rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground">Browse Programs</Link>
      </div>
    );
  }

  const couponOk = !!coupon?.ok;
  const couponDiscount = couponOk
    ? Math.min(subtotal, coupon!.kind === "percent" ? Math.round(subtotal * (coupon!.value ?? 0)) / 100 : (coupon!.value ?? 0) / 100)
    : 0;
  const bundle = bundleDiscounts(items.map((i) => ({ lineId: i.productId, price: i.price * i.quantity })));
  const bundleOff = Math.min(subtotal, bundle.total);
  const afterCoupon = Math.max(0, total - bundleOff - couponDiscount);
  const creditApplied = Math.min(fam.credit, afterCoupon);
  const due = Math.max(0, afterCoupon - creditApplied);


  const pay = async () => {
    const pending = items.flatMap((i) => {
      const d = decodeLine(i.productId);
      if (!d) return [];
      return [{ id: crypto.randomUUID(), lineId: i.productId, childId: d.childId, friendRequest: fam.friendRequests[i.productId] ?? "", jerseySize: fam.regDetails[i.productId]?.jerseySize, pickupPerson: fam.regDetails[i.productId]?.pickupPerson, answers: fam.regDetails[i.productId]?.answers, heardAbout: fam.regDetails[i.productId]?.heardAbout ?? fam.heardAbout, waivers: fam.regDetails[i.productId]?.waivers, waiverSnapshot: fam.regDetails[i.productId]?.waiverSnapshot, signature: fam.regDetails[i.productId]?.signature, signedAt: fam.regDetails[i.productId]?.acceptedAt, amount: i.price * i.quantity, tax: lineTax(i.productId) * i.quantity, createdAt: new Date().toISOString() }];
    });
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    sessionStorage.setItem("top_pending_credit", String(creditApplied));
    sessionStorage.setItem(CLOUD_CREDIT_KEY, String(Math.round(creditApplied * 100)));
    sessionStorage.setItem("top_pending_bundle", String(bundleOff));
    if (couponOk && coupon?.code) sessionStorage.setItem(COUPON_KEY, JSON.stringify({ code: coupon.code, discount: couponDiscount }));
    else sessionStorage.removeItem(COUPON_KEY);
    const framed = window.self !== window.top;
    const popup = framed && due > 0 ? window.open("", "_blank") : null;
    setIsRedirecting(true);
    try {
      const origin = window.location.origin;
      const res = await createCheckout({
        items: items.map((i) => ({ lineId: i.productId, quantity: i.quantity })),
        couponCode: couponOk && coupon?.code ? coupon.code : undefined,
        useCredit: creditApplied > 0,
        successUrl: origin + "/checkout/success?session_id={CHECKOUT_SESSION_ID}",
        cancelUrl: origin + "/checkout",
      });
      if (res.free) {
        popup?.close();
        void navigate({ to: "/checkout/success" });
        return;
      }
      if (popup) popup.location.href = res.url;
      else if (framed) window.open(res.url, "_blank");
      else window.location.href = res.url;
    } catch (e) {
      popup?.close();
      setIsRedirecting(false);
      const raw = e && typeof e === "object" && "data" in e && typeof (e as { data: unknown }).data === "string" ? (e as { data: string }).data : e instanceof Error ? e.message : "";
      const msg = /full|capacity|spots/i.test(raw)
        ? "A session in your cart just filled up. Remove it from your cart or join its waitlist, then try again."
        : /closed|not open|registration window/i.test(raw)
          ? "Registration for one of these programs is closed. Remove it from your cart to continue."
          : /network|fetch|offline/i.test(raw)
            ? "We couldn't reach the payment service. Check your connection and tap Pay again. You haven't been charged."
            : raw || "Checkout couldn't start. You haven't been charged. Please try again, or contact your location team if it keeps happening.";
      const full = /full|capacity|spots/i.test(raw);
      toast.error(msg, { duration: 10000, ...(full ? { action: { label: "Fix in Cart", onClick: () => void navigate({ to: "/cart" }) } } : {}) });
    }
  };

  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_380px] lg:px-8">
      <div className="space-y-6">
        <h1 className="display-condensed text-4xl font-black italic md:text-5xl">Review Registration</h1>

        {sessionPending ? (
          <div className="h-28 animate-pulse rounded-2xl bg-muted" />
        ) : session ? (
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">Registering As</p>
            <p className="font-bold">{session.user.name || fam.guardian.name}</p>
            <p className="text-sm text-muted-foreground">{session.user.email} · {fam.guardian.phone}</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-5">
            <FamilySignIn note="Sign in so your registration, receipts and account credit are saved to your family account and our program staff can see your child on their roster." />
          </div>
        )}

        <section className="rounded-2xl border border-border bg-card">
          <h2 className="border-b border-border p-5 text-xl font-bold">Purchase Overview</h2>
          <div className="divide-y divide-border">
            {items.map((i) => {
              const d = decodeLine(i.productId);
              const c = d ? fam.childById(d.childId) : undefined;
              const t = lineTax(i.productId) * i.quantity;
              return (
                <div key={i.productId} className="grid gap-3 p-5 sm:grid-cols-[1fr_auto]">
                  <div className="space-y-1">
                    <p className="font-bold">{d ? `${d.program.name} — ${sessionName(d.session)}` : i.name}</p>
                    {d && (
                      <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-0.5 text-sm">
                        <dt className="text-muted-foreground">Participant</dt><dd className="font-semibold">{c ? `${c.firstName} ${c.lastName} · ${formatDob(c.dob)}` : "—"}</dd>
                        <dt className="text-muted-foreground">Dates</dt><dd>{d.session.dates}</dd>
                        <dt className="text-muted-foreground">Schedule</dt><dd>{d.session.days} · {d.session.time}</dd>
                        <dt className="text-muted-foreground">Location</dt><dd>{sessionLocation(d.program, d.session)}</dd>
                        {d.addOns.length > 0 && (<><dt className="text-muted-foreground">Add-Ons</dt><dd>{d.addOns.map((a) => a.name).join(", ")}</dd></>)}
                        {fam.friendRequests[i.productId] && (<><dt className="text-muted-foreground">Friend Request</dt><dd>{fam.friendRequests[i.productId]}</dd></>)}
                      </dl>
                    )}
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="font-bold">{formatPrice(i.price * i.quantity)}</p>
                    {t > 0 && <p className="text-xs text-muted-foreground">+ {formatPrice(t)} HST</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>


      </div>

      <aside className="h-fit space-y-4 rounded-2xl border border-border bg-card p-6 lg:sticky lg:top-24">
        <h2 className="text-xl font-bold">Receipt</h2>
        <div className="space-y-1.5 text-sm">
          {items.map((i) => {
            const d = decodeLine(i.productId);
            const c = d ? fam.childById(d.childId) : undefined;
            return (
              <div key={i.productId} className="flex justify-between gap-3">
                <span className="text-muted-foreground">{d ? `${d.program.name} — ${d.session.label}` : i.name}{c ? ` · ${c.firstName}` : ""}</span>
                <span className="shrink-0">{formatPrice(i.price * i.quantity)}</span>
              </div>
            );
          })}
        </div>
        <div className="space-y-1.5 border-t border-border pt-3 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatPrice(subtotal)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">HST (13%, if applicable)</span><span>{formatPrice(tax)}</span></div>
          {bundle.sibling > 0 && <div className="flex justify-between text-success"><span>Sibling Savings ({FINANCE.siblingPct}%)</span><span>-{formatPrice(bundle.sibling)}</span></div>}
          {bundle.multiWeek > 0 && <div className="flex justify-between text-success"><span>Multi-Week Savings (${FINANCE.extraWeek}/extra week)</span><span>-{formatPrice(bundle.multiWeek)}</span></div>}
          {couponDiscount > 0 && <div className="flex justify-between text-success"><span>Coupon {coupon?.code}</span><span>-{formatPrice(couponDiscount)}</span></div>}
          {creditApplied > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Account Credit</span><span>-{formatPrice(creditApplied)}</span></div>}
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Coupon Code</p>
          {couponOk ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-success/50 bg-success/10 px-3.5 py-2 text-sm">
              <span><span className="font-mono font-bold">{coupon?.code}</span>{coupon?.description ? ` · ${coupon.description}` : ""}</span>
              <button onClick={() => { setApplied(null); setCodeInput(""); }} className="cursor-pointer text-xs font-semibold text-destructive">Remove</button>
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); if (codeInput.trim()) setApplied(codeInput.trim().toUpperCase()); }} className="flex gap-2">
              <input value={codeInput} onChange={(e) => { setCodeInput(e.target.value.toUpperCase()); setApplied(null); }} placeholder="Enter code" className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-card px-3.5 text-sm uppercase outline-none focus:ring-2 focus:ring-ring" />
              <button className="cursor-pointer rounded-lg border border-border px-4 text-sm font-semibold hover:bg-accent">Apply</button>
            </form>
          )}
          {applied && coupon && !coupon.ok && <p className="mt-1.5 text-xs font-semibold text-destructive">{coupon.error}</p>}
          {fam.credit > 0 && <p className="mt-2 text-xs text-muted-foreground">You have {formatPrice(fam.credit)} account credit — applied automatically.</p>}
        </div>

        <div className="flex items-baseline justify-between border-t border-border pt-3">
          <span className="font-semibold">Total Due (CAD)</span>
          <span className="text-2xl font-bold">{formatPrice(due)}</span>
        </div>
        <button
          onClick={pay}
          disabled={!session || !agree || isRedirecting || (checkoutReady === false && due > 0)}
          className="w-full cursor-pointer rounded-full bg-primary px-5 py-3 font-bold text-primary-foreground shadow-md transition-all hover:scale-[1.02] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
        >
          {!session ? "Sign In to Continue" : checkoutReady === false && due > 0 ? "Registration Isn't Accepting Payments Yet" : isRedirecting ? "Redirecting to Stripe…" : due === 0 ? "Complete Registration" : agree ? `Pay ${formatPrice(due)}` : "Accept Waiver to Continue"}
        </button>
        <p className="text-center text-xs text-muted-foreground">Card details are entered securely on Stripe's hosted page.</p>
      </aside>
    </div>
  );
}
