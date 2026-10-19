import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useCart } from "@/lib/commerce";
import { useFamily, type Registration } from "@/lib/family";
import { decodeLine, formatDob, formatOutDate, formatPrice, getLocation, sessionLocation, sessionName } from "@/data/registration";
import { useSession } from "@/lib/auth-client";
import { locationEmail, calendarEvent, icsEscape } from "@/lib/format";

export const Route = createFileRoute("/checkout/success")({ component: CheckoutSuccess });

const icsDay = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

function icsFor(regs: Registration[], childOf: (id: string) => { firstName: string; lastName: string } | undefined): string {
  const ev = regs.map((r) => {
    const d = decodeLine(r.lineId);
    if (!d) return "";
    const e = calendarEvent(d, childOf(r.childId));
    const lines = ["BEGIN:VEVENT", `UID:${r.id}@topsports.ca`];
    if (Number.isFinite(e.start.getTime())) {
      const end = new Date((Number.isFinite(e.end.getTime()) ? e.end : e.start).getTime() + 86400000);
      lines.push(`DTSTART;VALUE=DATE:${icsDay(e.start)}`, `DTEND;VALUE=DATE:${icsDay(end)}`);
    }
    lines.push(`SUMMARY:${icsEscape(e.title)}`, `LOCATION:${icsEscape(e.location)}`, `DESCRIPTION:${icsEscape(e.details)}`, "END:VEVENT");
    return lines.join("\r\n");
  }).filter(Boolean);
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//TOP Sports//Registration//EN\r\n${ev.join("\r\n")}\r\nEND:VCALENDAR`;
}

type Receipt = { regs: Registration[]; credit: number; coupon?: { code: string; discount: number }; date: string };

function CheckoutSuccess() {
  const { clearCart } = useCart();
  const fam = useFamily();
  const { data: session } = useSession();
  const redeem = useMutation(api.coupons.redeemCoupon);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  useEffect(() => {
    clearCart();
    const raw = sessionStorage.getItem("top_pending_regs");
    const credit = Number(sessionStorage.getItem("top_pending_credit") ?? 0);
    const couponRaw = sessionStorage.getItem("top_pending_coupon");
    const coupon = couponRaw ? (JSON.parse(couponRaw) as { code: string; discount: number }) : undefined;
    if (raw) {
      const parsed = JSON.parse(raw) as Registration[];
      fam.addRegistrations(parsed, (r) => {
        const d = decodeLine(r.lineId);
        return `Payment — ${fam.childById(r.childId)?.firstName ?? "Child"}, ${d ? `${d.program.name} (${d.session.label})` : "Registration"}`;
      });
      const rec: Receipt = { regs: parsed, credit, coupon, date: new Date().toISOString() };
      setReceipt(rec);
      sessionStorage.setItem("top_last_receipt", JSON.stringify(rec));
      sessionStorage.removeItem("top_pending_regs");
    } else {
      const last = sessionStorage.getItem("top_last_receipt");
      if (last) setReceipt(JSON.parse(last) as Receipt);
    }
    if (credit > 0) fam.spendCredit(credit);
    sessionStorage.removeItem("top_pending_credit");
    sessionStorage.removeItem("top_pending_coupon");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (session && receipt?.coupon && !sessionStorage.getItem(`top_redeemed_${receipt.date}`)) {
      sessionStorage.setItem(`top_redeemed_${receipt.date}`, "1");
      void redeem({ code: receipt.coupon.code, discountCents: Math.round(receipt.coupon.discount * 100) }).catch(() => undefined);
    }
  }, [session, receipt, redeem]);

  const regs = receipt?.regs ?? [];
  const subtotal = regs.reduce((s, r) => s + r.amount, 0);
  const tax = regs.reduce((s, r) => s + r.tax, 0);
  const couponOff = receipt?.coupon?.discount ?? 0;
  const bundleOff = Number(sessionStorage.getItem("top_pending_bundle") ?? 0) || 0;
  const paid = Math.max(0, subtotal + tax - bundleOff - couponOff - (receipt?.credit ?? 0));
  const calHref = `data:text/calendar;charset=utf-8,${encodeURIComponent(icsFor(regs, (id) => fam.childById(id)))}`;
  const slugs = [...new Set(regs.map((r) => decodeLine(r.lineId)?.program.locationSlug).filter((s): s is string => !!s))];

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success text-success-foreground">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
        </div>
        <h1 className="display-condensed mt-5 text-4xl font-black italic md:text-5xl">You're Registered!</h1>
        <p className="mt-2 text-muted-foreground">A receipt is on its way to {session?.user.email ?? fam.guardian.email}.</p>
      </div>

      {regs.length > 0 && (
        <>
          <section className="mt-10 rounded-2xl border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-5">
              <h2 className="text-xl font-bold">Purchase Overview</h2>
              <span className="text-xs text-muted-foreground">{new Date(receipt!.date).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })}</span>
            </div>
            <div className="divide-y divide-border">
              {regs.map((r) => {
                const d = decodeLine(r.lineId);
                const c = fam.childById(r.childId);
                if (!d) return null;
                return (
                  <div key={r.id} className="grid gap-2 p-5 sm:grid-cols-[1fr_auto]">
                    <div>
                      <p className="font-bold">{d.program.name} — {sessionName(d.session)}</p>
                      <dl className="mt-1 grid grid-cols-[110px_1fr] gap-x-3 gap-y-0.5 text-sm">
                        <dt className="text-muted-foreground">Participant</dt><dd className="font-semibold">{c ? `${c.firstName} ${c.lastName} · ${formatDob(c.dob)}` : "—"}</dd>
                        <dt className="text-muted-foreground">Dates</dt><dd>{d.session.dates}</dd>
                        <dt className="text-muted-foreground">Schedule</dt><dd>{d.session.days} · {d.session.time}</dd>
                        <dt className="text-muted-foreground">Location</dt><dd>{sessionLocation(d.program, d.session)}</dd>
                        {(d.program.outDates?.length ?? 0) > 0 && (<><dt className="text-muted-foreground">Out Dates</dt><dd>{d.program.outDates!.map((o) => `${formatOutDate(o.date)}${o.note ? ` (${o.note})` : ""}`).join(", ")}</dd></>)}
                        {d.addOns.length > 0 && (<><dt className="text-muted-foreground">Add-Ons</dt><dd>{d.addOns.map((a) => a.name).join(", ")}</dd></>)}
                      </dl>
                    </div>
                    <div className="sm:text-right">
                      <p className="font-semibold">{formatPrice(r.amount)}</p>
                      {r.tax > 0 && <p className="text-xs text-muted-foreground">+ {formatPrice(r.tax)} HST</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="mt-6 rounded-2xl border border-border bg-card p-5">
            <h2 className="text-xl font-bold">Receipt</h2>
            <div className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatPrice(subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">HST (13%, if applicable)</span><span>{formatPrice(tax)}</span></div>
              {bundleOff > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Family Savings</span><span>-{formatPrice(bundleOff)}</span></div>}
              {couponOff > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Coupon {receipt?.coupon?.code}</span><span>-{formatPrice(couponOff)}</span></div>}
              {(receipt?.credit ?? 0) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Account Credit</span><span>-{formatPrice(receipt!.credit)}</span></div>}
              <div className="flex justify-between border-t border-border pt-2 text-base font-bold"><span>Total Paid (CAD)</span><span>{formatPrice(paid)}</span></div>
            </div>
          </section>

          <section className="mt-6 rounded-2xl border border-border bg-card p-5">
            <h2 className="text-xl font-bold">Club Contact</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {slugs.map((s) => (
                <a key={s} href={`mailto:${locationEmail(s)}`} className="rounded-xl border border-border p-3.5 text-sm hover:bg-accent">
                  <span className="block font-semibold">TOP Sports {getLocation(s)?.name ?? s}</span>
                  <span className="text-primary">{locationEmail(s)}</span>
                </a>
              ))}
            </div>
          </section>
        </>
      )}

      <div className="mt-8 flex flex-wrap justify-center gap-3 print:hidden">
        {regs.length > 0 && <a href={calHref} download="top-sports-schedule.ics" className="inline-flex rounded-full border border-border px-5 py-2.5 font-semibold hover:bg-accent">Add to Calendar</a>}
        {regs.length > 0 && <button onClick={() => window.print()} className="cursor-pointer rounded-full border border-border px-5 py-2.5 font-semibold hover:bg-accent">Print Receipt</button>}
        {regs.length > 0 && (
          <button
            onClick={() => {
              const text = `TOP Sports registration confirmed:\n${regs.map((r) => { const d = decodeLine(r.lineId); return d ? `- ${d.program.name} — ${d.session.label} (${d.session.dates}, ${d.session.days} ${d.session.time})` : ""; }).filter(Boolean).join("\n")}`;
              if (navigator.share) void navigator.share({ title: "TOP Sports Registration", text }).catch(() => {});
              else window.location.href = `mailto:?subject=${encodeURIComponent("TOP Sports Registration Confirmation")}&body=${encodeURIComponent(text)}`;
            }}
            className="cursor-pointer rounded-full border border-border px-5 py-2.5 font-semibold hover:bg-accent"
          >
            Share Confirmation
          </button>
        )}
        <Link to="/dashboard" className="inline-flex rounded-full bg-primary px-5 py-2.5 font-semibold text-primary-foreground hover:bg-primary/90">View My Schedule</Link>
      </div>
    </div>
  );
}
