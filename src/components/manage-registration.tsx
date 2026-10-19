import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { REFUND_ADMIN_FEE, useFamily, type Registration } from "@/lib/family";
import { decodeLine, encodeLine, formatPrice, lineTax, refundDeadline, sessionName, sessionPrice } from "@/data/registration";

type Mode = "transfer" | "withdraw";

/** Eligibility: 30 days before start for all programs; summer camps close May 31. */
export function changeEligibility(reg: Registration) {
  const d = decodeLine(reg.lineId);
  if (!d) return { eligible: false, deadline: new Date(), deadlineText: "", rule: "" };
  const deadline = refundDeadline(d.program);
  const summerCamp = d.program.category === "Camps" && /summer/i.test(d.program.season);
  return {
    eligible: new Date() <= deadline,
    deadline,
    deadlineText: deadline.toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" }),
    rule: summerCamp ? "Summer camp changes close May 31" : "Changes close 30 days before the program starts",
  };
}

export function ManageRegistration({ reg, open, onOpenChange }: { reg: Registration; open: boolean; onOpenChange: (o: boolean) => void }) {
  const fam = useFamily();
  const d = decodeLine(reg.lineId);
  const [mode, setMode] = useState<Mode>("transfer");
  const [sessionId, setSessionId] = useState("");
  const optionId = d?.option.id ?? "";
  const [reason, setReason] = useState("");

  const paid = Math.round((reg.amount + reg.tax) * 100) / 100;

  const quote = useMemo(() => {
    if (!d || !sessionId) return null;
    const lineId = encodeLine({ programId: d.program.id, sessionId, optionId, childId: reg.childId, addOnIds: d.addOns.map((a) => a.id) });
    const target = d.program.sessions.find((s) => s.id === sessionId);
    if (!target) return null;
    const amount = sessionPrice(d.program, target) + d.addOns.reduce((s, a) => s + a.price, 0);
    const tax = lineTax(lineId);
    const diff = Math.round((paid - (amount + tax)) * 100) / 100;
    return { lineId, amount, tax, diff };
  }, [d, sessionId, optionId, reg.childId, paid]);

  if (!d) return null;
  const { eligible, deadlineText, rule } = changeEligibility(reg);
  const child = fam.childById(reg.childId);
  const label = `${child?.firstName ?? "Child"}, ${d.program.name} (${d.session.label})`;
  const sessions = d.program.sessions.filter((s) => s.id !== d.session.id);
  const refundAmount = Math.max(0, paid - REFUND_ADMIN_FEE);

  const close = () => {
    onOpenChange(false);
    setSessionId("");
    setMode("transfer");
  };

  const doTransfer = () => {
    if (!quote || !eligible) return;
    const target = d.program.sessions.find((s) => s.id === sessionId);
    const res = fam.transferRegistration(reg.id, quote.lineId, quote.amount, quote.tax, `Transfer — ${child?.firstName ?? "Child"}, ${d.session.label} → ${target?.label ?? "new session"}`);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(res.diff > 0 ? `Transferred · ${formatPrice(res.diff)} added to account credit` : "Transfer confirmed");
    close();
  };

  const doWithdraw = () => {
    if (!eligible) return;
    const res = fam.cancelRegistration(reg.id, "refund", label, reason);
    if (!res.ok) {
      toast.error("This registration is no longer active.");
      return;
    }
    toast.success(`Refund of ${formatPrice(res.amount)} approved — it will be returned to your card`);
    setReason("");
    close();
  };

  const tab = (m: Mode, text: string) => (
    <button
      type="button"
      disabled={!eligible}
      onClick={() => setMode(m)}
      className={`flex-1 cursor-pointer rounded-full px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${mode === m && eligible ? "bg-primary text-primary-foreground" : "hover:bg-accent hover:text-accent-foreground"}`}
    >
      {text}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-background sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage Registration</DialogTitle>
          <DialogDescription>{label} · Paid {formatPrice(paid)}</DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 rounded-full border border-border bg-card p-1">
          {tab("transfer", "Transfer Session")}
          {tab("withdraw", "Withdraw & Refund")}
        </div>

        {!eligible ? (
          <div className="space-y-3 rounded-xl border border-border bg-muted p-4 text-sm">
            <p className="font-semibold">Transfers & Refunds Are Closed</p>
            <p className="text-muted-foreground">
              {rule}. The deadline for this registration was {deadlineText}, so it can no longer be transferred or refunded.
            </p>
            <p className="text-muted-foreground">Questions? Contact your location team.</p>
          </div>
        ) : mode === "transfer" ? (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">Available until {deadlineText}.</p>
            <div>
              <p className="mb-1.5 text-sm font-semibold">Move to Session</p>
              {sessions.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No other sessions available for this program.</p>
              ) : (
                <div className="space-y-2">
                  {sessions.map((s) => {
                    const full = s.enrolled >= s.capacity;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        disabled={full}
                        onClick={() => setSessionId(s.id)}
                        className={`flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border p-3.5 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${sessionId === s.id ? "border-primary bg-accent text-accent-foreground" : "border-border hover:bg-accent"}`}
                      >
                        <span>
                          <span className="font-semibold">{sessionName(s)}</span>
                          <span className="block text-muted-foreground">{s.dates} · {s.time}</span>
                        </span>
                        <span className={`inline-flex shrink-0 items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-bold ${full ? "bg-muted text-muted-foreground" : "bg-success text-success-foreground"}`}>
                          {full ? "Not Available" : "Available"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {quote && (
              <div className="space-y-1.5 rounded-xl bg-muted p-4 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Already Paid</span><span>{formatPrice(paid)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">New Total (Incl. HST)</span><span>{formatPrice(quote.amount + quote.tax)}</span></div>
                <div className="flex justify-between border-t border-border pt-1.5 font-bold">
                  <span>{quote.diff > 0 ? "Credit to Your Account" : quote.diff < 0 ? "Paid From Account Credit" : "Difference"}</span>
                  <span>{formatPrice(Math.abs(quote.diff))}</span>
                </div>
                {quote.diff < 0 && fam.credit < -quote.diff && (
                  <p className="text-xs font-semibold text-destructive">You have {formatPrice(fam.credit)} credit — choose a lower-priced option or contact us.</p>
                )}
              </div>
            )}
            <button type="button" disabled={!quote} onClick={doTransfer} className="w-full cursor-pointer rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
              Confirm Transfer
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl border border-primary bg-accent p-4 text-accent-foreground">
              <div className="flex items-center justify-between gap-3">
                <span>
                  <span className="block font-semibold">Refund to Card</span>
                  <span className="block text-sm opacity-80">{formatPrice(paid)} paid less {formatPrice(REFUND_ADMIN_FEE)} admin fee · approved automatically</span>
                </span>
                <span className="text-lg font-bold">{formatPrice(refundAmount)}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Available until {deadlineText}. A {formatPrice(REFUND_ADMIN_FEE)} admin fee applies to all refunds.</p>
            <div>
              <label htmlFor="refund-reason" className="mb-1.5 block text-sm font-semibold">Reason (Optional)</label>
              <textarea
                id="refund-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="e.g. Family moving out of province"
                className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <button type="button" onClick={doWithdraw} className="w-full cursor-pointer rounded-full bg-destructive px-5 py-3 text-sm font-semibold text-white transition-all hover:bg-destructive/90">
              Withdraw & Refund {formatPrice(refundAmount)}
            </button>
            <p className="text-center text-xs text-muted-foreground">Your spot is released to the waitlist and the refund is sent back to your card.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
