import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { formatPrice } from "@/data/registration";

const inputCls = "h-10 w-full rounded-lg border border-input bg-card px-3.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";
const labelCls = "block text-xs font-semibold text-muted-foreground";
const errMsg = (e: unknown) => (e && typeof e === "object" && "data" in e && typeof (e as { data: unknown }).data === "string" ? (e as { data: string }).data : "Something went wrong. Please try again.");

export function CouponsCredit() {
  const coupons = useQuery(api.coupons.listCoupons, {});
  const create = useMutation(api.coupons.createCoupon);
  const setActive = useMutation(api.coupons.setCouponActive);
  const remove = useMutation(api.coupons.deleteCoupon);
  const grant = useMutation(api.coupons.grantCredit);

  const [code, setCode] = useState("");
  const [kind, setKind] = useState<"percent" | "amount">("percent");
  const [value, setValue] = useState("");
  const [desc, setDesc] = useState("");
  const [expires, setExpires] = useState("");
  const [maxUses, setMaxUses] = useState("");

  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const addCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(value);
    try {
      await create({
        code,
        kind,
        value: kind === "amount" ? Math.round(n * 100) : n,
        description: desc.trim() || undefined,
        expiresAt: expires ? new Date(`${expires}T23:59:59`).getTime() : undefined,
        maxUses: maxUses ? Number(maxUses) : undefined,
      });
      toast.success(`${code.toUpperCase()} created`);
      setCode(""); setValue(""); setDesc(""); setExpires(""); setMaxUses("");
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const addCredit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await grant({ email, amountCents: Math.round(Number(amount) * 100), note: note.trim() || undefined });
      toast.success(`${formatPrice(Number(amount))} credit added to ${email}`);
      setEmail(""); setAmount(""); setNote("");
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <section className="space-y-5">
        <form onSubmit={addCoupon} className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-xl font-bold">Create Coupon Code</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelCls}>Code<input required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="SUMMER25" className={`${inputCls} mt-1.5 uppercase`} /></label>
            <label className={labelCls}>Description<input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Summer launch promo" className={`${inputCls} mt-1.5`} /></label>
            <label className={labelCls}>Discount Type
              <select value={kind} onChange={(e) => setKind(e.target.value as "percent" | "amount")} className={`${inputCls} mt-1.5`}>
                <option value="percent">% Off</option>
                <option value="amount">$ Off</option>
              </select>
            </label>
            <label className={labelCls}>{kind === "percent" ? "Percent Off" : "Amount Off (CAD)"}<input required type="number" min="0.01" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} className={`${inputCls} mt-1.5`} /></label>
            <label className={labelCls}>Expires (Optional)<input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} className={`${inputCls} mt-1.5`} /></label>
            <label className={labelCls}>Max Uses (Optional)<input type="number" min="1" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} className={`${inputCls} mt-1.5`} /></label>
          </div>
          <button className="cursor-pointer rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Create Code</button>
        </form>

        <div className="rounded-2xl border border-border bg-card">
          <h2 className="border-b border-border p-5 text-xl font-bold">Coupon Codes</h2>
          {coupons === undefined ? (
            <div className="m-5 h-20 animate-pulse rounded-xl bg-muted" />
          ) : coupons.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No coupon codes yet. Create one above and families can enter it at checkout.</p>
          ) : (
            <div className="divide-y divide-border">
              {coupons.map((c) => {
                const expired = !!c.expiresAt && c.expiresAt < Date.now();
                return (
                  <div key={c._id} className="flex flex-wrap items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-bold">{c.code}</span>
                        <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-bold text-secondary-foreground">{c.kind === "percent" ? `${c.value}% Off` : `${formatPrice(c.value / 100)} Off`}</span>
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${!c.active || expired ? "bg-muted text-muted-foreground" : "bg-success text-success-foreground"}`}>{expired ? "Expired" : c.active ? "Active" : "Paused"}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {c.description ? `${c.description} · ` : ""}Used {c.uses}{c.maxUses ? ` / ${c.maxUses}` : ""} · {formatPrice(c.discountTotalCents / 100)} discounted{c.expiresAt ? ` · Expires ${new Date(c.expiresAt).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}` : ""}
                      </p>
                    </div>
                    <button onClick={() => void setActive({ id: c._id, active: !c.active })} className="cursor-pointer rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold hover:bg-accent">{c.active ? "Pause" : "Activate"}</button>
                    <button onClick={() => { if (confirm(`Delete ${c.code}?`)) void remove({ id: c._id }); }} className="cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10">Delete</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <form onSubmit={addCredit} className="h-fit space-y-4 rounded-2xl border border-border bg-card p-5">
        <h2 className="text-xl font-bold">Add Account Credit</h2>
        <p className="text-sm text-muted-foreground">Credit is added to the parent's family account and applied automatically at their next checkout.</p>
        <label className={labelCls}>Parent Email<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="parent@email.com" className={`${inputCls} mt-1.5`} /></label>
        <label className={labelCls}>Credit Amount (CAD)<input required type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${inputCls} mt-1.5`} /></label>
        <label className={labelCls}>Note (Optional)<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Goodwill credit — rained-out week" className={`${inputCls} mt-1.5`} /></label>
        <button className="w-full cursor-pointer rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Add Credit</button>
      </form>
    </div>
  );
}
