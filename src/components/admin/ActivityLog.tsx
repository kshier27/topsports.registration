import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

export function ActivityLog() {
  const rows = useQuery(api.activity.listActivity, {});
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => !t || `${r.actor} ${r.action} ${r.detail}`.toLowerCase().includes(t));
  }, [rows, q]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Every program edit, publish, delete, coupon change, credit grant and refund decision made in the Staff Portal. Showing the latest 300.</p>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by staff email, action or program" className="h-10 w-full max-w-md rounded-lg border border-input bg-card px-3.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
      {rows === undefined ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />)}</div>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          {rows.length === 0 ? "No staff activity recorded yet. Changes will appear here as soon as staff edit programs, coupons, credit or refunds." : "No activity matches your search."}
        </div>
      ) : (
        <div className="divide-y divide-border rounded-2xl border border-border bg-card">
          {list.map((r) => (
            <div key={r._id} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-semibold">{r.action}</p>
                <p className="truncate text-sm text-muted-foreground">{r.detail}</p>
              </div>
              <div className="shrink-0 text-xs text-muted-foreground sm:text-right">
                <p className="font-semibold text-foreground">{r.actor}</p>
                <p>{new Date(r.createdAt).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
