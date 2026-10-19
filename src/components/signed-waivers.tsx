import { useState } from "react";
import { toast } from "sonner";
import { WAIVERS } from "@/data/registration";
import { SITE } from "@/lib/site-settings";

export type SignedWaiverRow = {
  id: string;
  parentName: string;
  signedAt: Date;
  childName: string;
  programName: string;
  sessionLabel: string;
  dates: string;
  location: string;
  waiverIds: string[];
  /** Exact wording agreed at signing, when saved. */
  snapshot?: { id: string; title: string; text: string }[];
  /** Full name the parent typed as their signature. */
  signature?: string;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmtDate = (d: Date) => d.toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" });
const fmtTime = (d: Date) => d.toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" });
const policyOf = (r: SignedWaiverRow, id: string) => r.snapshot?.find((w) => w.id === id) ?? WAIVERS.find((w) => w.id === id);

function printRows(rows: SignedWaiverRow[], title: string) {
  const w = window.open("", "_blank");
  if (!w) {
    toast.error("Allow pop-ups to print signed waivers.");
    return;
  }
  const blocks = rows
    .map((r) => {
      const items = r.waiverIds
        .map((id) => {
          const p = policyOf(r, id);
          return `<div class="pol"><h3>${esc(p?.title ?? id)}</h3>${p?.text ? `<p>${esc(p.text).replace(/\n/g, "<br/>")}</p>` : ""}</div>`;
        })
        .join("");
      return `<section><table><tr><th>Parent / Guardian</th><td>${esc(r.parentName)}</td></tr><tr><th>Date Agreed</th><td>${esc(fmtDate(r.signedAt))} at ${esc(fmtTime(r.signedAt))}</td></tr><tr><th>Child</th><td>${esc(r.childName)}</td></tr><tr><th>Program</th><td>${esc(r.programName)}${r.sessionLabel ? ` — ${esc(r.sessionLabel)}` : ""}</td></tr><tr><th>Dates</th><td>${esc(r.dates)}</td></tr><tr><th>Location</th><td>${esc(r.location)}</td></tr>${r.signature ? `<tr><th>Signature</th><td style="font-family:Georgia,serif;font-style:italic;font-size:16px">${esc(r.signature)}</td></tr>` : ""}</table>${items}<p class="sig">${r.signature ? `Signed electronically by ${esc(r.signature)} (typed full name) after ticking "I agree" for each policy above during online registration.` : `Agreed electronically by ${esc(r.parentName)} by ticking "I agree" for each policy above during online registration.`} ${r.snapshot?.length ? "Policy wording shown is the exact text agreed at signing." : "Policy wording shown is the current version; this registration predates saved copies."}</p></section>`;
    })
    .join("");
  w.document.write(`<!doctype html><html><head><title>${esc(title)}</title><style>body{font-family:Arial,sans-serif;color:#1b2a57;max-width:760px;margin:32px auto;padding:0 20px;font-size:13px}h1{font-size:20px;margin:0 0 4px}section{border-top:2px solid #1b2a57;padding-top:14px;margin-top:22px;page-break-inside:avoid}table{border-collapse:collapse;width:100%;margin-bottom:10px}th{text-align:left;width:150px;padding:4px 8px 4px 0;color:#55617f;font-weight:600}td{padding:4px 0}h3{font-size:14px;margin:12px 0 4px}.pol p{margin:0;line-height:1.5}.sig{margin-top:12px;font-size:12px;color:#55617f;font-style:italic}</style></head><body><p style="margin:0;font-size:11px;letter-spacing:2px;text-transform:uppercase">${esc(SITE.orgName)}</p><h1>${esc(title)}</h1>${blocks}<script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
}

export function SignedWaivers({ rows, heading = "Signed Waivers", intro, compact }: { rows: SignedWaiverRow[]; heading?: string; intro?: string; compact?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const sorted = [...rows].sort((a, b) => b.signedAt.getTime() - a.signedAt.getTime());

  return (
    <section className={`rounded-2xl border border-border bg-card ${compact ? "p-5 sm:p-6" : "mt-6 p-6"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className={compact ? "font-bold" : "text-xl font-bold"}>{heading}</h2>
          {intro && <p className="text-sm text-muted-foreground">{intro}</p>}
        </div>
        {sorted.length > 0 && (
          <button type="button" onClick={() => printRows(sorted, heading)} className="inline-flex h-10 cursor-pointer items-center rounded-full border border-border px-4 text-sm font-semibold hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
            Print All
          </button>
        )}
      </div>

      {sorted.length === 0 ? (
        <p className="mt-4 rounded-xl bg-muted p-5 text-center text-sm text-muted-foreground">No signed waivers yet. They appear here after a registration is completed.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {sorted.map((r) => {
            const isOpen = open === r.id;
            return (
              <li key={r.id} className="rounded-xl border border-border">
                <div className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="min-w-0 space-y-0.5 text-sm">
                    <p className="font-semibold">{r.programName}{r.sessionLabel ? ` — ${r.sessionLabel}` : ""}</p>
                    <p className="text-muted-foreground">{r.dates} · {r.location}</p>
                    <p><span className="text-muted-foreground">Child:</span> <span className="font-semibold">{r.childName}</span></p>
                    <p><span className="text-muted-foreground">Agreed by:</span> <span className="font-semibold">{r.parentName}</span> <span className="text-muted-foreground">on {fmtDate(r.signedAt)} at {fmtTime(r.signedAt)}</span></p>
                    {r.signature && <p><span className="text-muted-foreground">Signed:</span> <span className="text-base font-semibold italic">{r.signature}</span></p>}
                    <p className="text-muted-foreground">{r.waiverIds.length} {r.waiverIds.length === 1 ? "policy" : "policies"} agreed{r.snapshot?.length ? " · exact wording saved" : ""}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : r.id)} className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-border px-3.5 text-xs font-semibold hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
                      {isOpen ? "Hide" : "View"} <span aria-hidden className={`transition-transform ${isOpen ? "rotate-180" : ""}`}>▾</span>
                    </button>
                    <button type="button" onClick={() => printRows([r], `Signed Waivers — ${r.childName}, ${r.programName}`)} className="inline-flex h-9 cursor-pointer items-center rounded-full border border-border px-3.5 text-xs font-semibold hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
                      Print
                    </button>
                  </div>
                </div>
                {isOpen && (
                  <div className="space-y-3 border-t border-border bg-muted/40 p-4">
                    {!r.snapshot?.length && <p className="text-xs italic text-muted-foreground">This registration was made before exact wording was saved, so the current policy text is shown.</p>}
                    {r.waiverIds.map((id) => {
                      const p = policyOf(r, id);
                      return (
                        <div key={id}>
                          <p className="flex items-center gap-2 text-sm font-semibold"><span className="rounded-full bg-success px-2 py-0.5 text-xs font-bold text-success-foreground">✓ Agreed</span>{p?.title ?? id}</p>
                          {p?.text && <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">{p.text}</p>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
