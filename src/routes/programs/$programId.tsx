import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ProgramImage } from "@/components/program-image";
import { FormattedText } from "@/components/formatted-text";
import { BottomCartBar } from "@/components/bottom-cart-bar";
import { parseProgram, getLocation, getProgram, PROGRAMS, formatPrice, fromPrice, fromPriceNow, chargesHst, mapsUrl, programAddress, eligibilityLabel } from "@/data/registration";
import { RegisterPanel } from "../$location";
import { catalogState } from "@/components/catalog-sync";

export const Route = createFileRoute("/programs/$programId")({ component: ProgramDetail });

function ProgramDetail() {
  const { programId } = Route.useParams();
  const preview = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("preview") === "1";
  const draft = preview && typeof window !== "undefined" ? parseProgram(localStorage.getItem("top_preview_program") ?? "") : null;
  const p = draft && draft.id === programId ? draft : getProgram(programId);
  const [open, setOpen] = useState(false);
  if (!p && !catalogState.loaded) {
    return (
      <div className="mx-auto max-w-7xl animate-pulse space-y-4 px-4 py-10 sm:px-6 lg:px-8" aria-busy="true" aria-label="Loading program">
        <div className="h-4 w-40 rounded bg-muted" />
        <div className="h-12 w-2/3 rounded bg-muted" />
        <div className="h-5 w-1/2 rounded bg-muted" />
        <div className="mt-8 h-96 rounded-2xl bg-muted" />
      </div>
    );
  }
  if (!p) {
    return (
      <div className="mx-auto max-w-lg px-4 py-28 text-center">
        <h1 className="display-condensed text-4xl font-black italic md:text-5xl">Program Not Found</h1>
        <Link to="/programs" className="mt-6 inline-flex rounded-full bg-primary px-5 py-2.5 font-semibold text-primary-foreground">All Programs</Link>
      </div>
    );
  }
  const loc = getLocation(p.locationSlug);
  const related = PROGRAMS.filter((x) => x.locationSlug === p.locationSlug && x.id !== p.id).slice(0, 4);
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      {draft && draft.id === programId && (
        <div className="mb-4 rounded-xl border border-warning bg-warning/15 px-4 py-3 text-sm font-semibold">Staff preview: this is how families will see this program. Changes you haven't saved or published aren't live yet.</div>
      )}
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        <Link to="/" className="font-semibold hover:text-foreground">Locations</Link>
        <span aria-hidden>›</span>
        <Link to="/$location" params={{ location: p.locationSlug }} className="font-semibold hover:text-foreground">{loc?.name}</Link>
        <span aria-hidden>›</span>
        <span>{p.category}</span>
        <span aria-hidden>›</span>
        <span className="truncate font-semibold text-foreground" aria-current="page">{p.name}</span>
      </nav>
      <div className="mt-4">
        <h1 className="display-condensed text-4xl font-black italic md:text-5xl">{p.name}</h1>
        <p className="mt-3 text-sm">{eligibilityLabel(p)} ·{" "}
          <a href={mapsUrl(p.venue, programAddress(p))} target="_blank" rel="noreferrer" className="font-semibold text-primary underline-offset-2 hover:underline">{p.venue}</a>
          {programAddress(p) && <span className="text-muted-foreground"> ({programAddress(p)})</span>} · {p.season}</p>
        <p className="mt-3 text-base font-bold">from {(() => { const fp = fromPriceNow(p); return fp.now < fp.was ? <><s className="text-base font-bold text-muted-foreground">{formatPrice(fp.was)}</s> <span className="text-success">{formatPrice(fp.now)}</span></> : formatPrice(fp.was); })()} {chargesHst(p) && <span className="text-sm font-semibold text-muted-foreground">+ HST</span>}</p>
        {p.description.trim() && (() => {
          const plain = p.description.replace(/\*\*/g, "").replace(/^#{1,3}\s+/gm, "").replace(/^[-*•]\s+/gm, "").replace(/\s*\n+\s*/g, " ").trim();
          const canExpand = plain.length > 110 || p.description.trim().includes("\n");
          return (
            <div className="mt-5 rounded-2xl border border-border bg-card px-5 py-4 text-base font-normal">
              <h2 className="mb-2 text-base font-bold text-foreground">About This Program</h2>
              {open ? (
                <FormattedText text={p.description} />
              ) : (
                <p className="line-clamp-2 text-base font-normal leading-relaxed text-muted-foreground">{plain}</p>
              )}
              {canExpand && (
                <button
                  type="button"
                  onClick={() => setOpen(!open)}
                  aria-expanded={open}
                  className="mt-2 inline-flex cursor-pointer items-center gap-1.5 text-sm font-bold text-primary underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {open ? "Show less" : "Read more"}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}><path d="m6 9 6 6 6-6" /></svg>
                </button>
              )}
            </div>
          );
        })()}
      </div>
      <div className="mt-8 overflow-clip rounded-2xl border border-border bg-card">
        <RegisterPanel program={p} />
      </div>
      {related.length > 0 && (
        <div className="mt-14">
          <h2 className="text-xl font-bold">Similar Programs</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {related.map((r) => (
              <Link key={r.id} to="/programs/$programId" params={{ programId: r.id }} className="group flex items-center gap-3 rounded-xl border border-border bg-card p-2.5 transition-all hover:-translate-y-0.5 hover:shadow-md">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted"><ProgramImage src={r.image} alt={r.name} className="h-full w-full object-cover" /></div>
                <div className="min-w-0"><p className="truncate text-sm font-bold">{r.name}</p><p className="truncate text-xs text-muted-foreground">{r.season} · from {formatPrice(fromPrice(r))}</p></div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <BottomCartBar />
    </div>
  );
}
