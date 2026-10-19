import { createFileRoute, Link } from "@tanstack/react-router";
import { ProgramImage } from "@/components/program-image";
import { useMemo, useState } from "react";
import { LOCATIONS, PROGRAMS, decodeLine, formatPrice, programTags, fromPrice, eligibilityLabel } from "@/data/registration";
import { useFamily } from "@/lib/family";
import { byStartDesc } from "@/lib/format";
import { BottomCartBar } from "@/components/bottom-cart-bar";

export const Route = createFileRoute("/programs/")({ component: ProgramsPage });

function ProgramsPage() {
  const family = useFamily();
  // Locations this family has registered at before (from their registration history).
  const homeSlugs = useMemo(() => {
    const set = new Set<string>();
    for (const r of family.registrations) {
      const d = decodeLine(r.lineId);
      if (d) set.add(d.program.locationSlug);
    }
    return [...set];
  }, [family.registrations]);
  const hasHistory = homeSlugs.length > 0;
  const [loc, setLoc] = useState<string | null>(null);
  const active = loc ?? (hasHistory ? "mine" : "all");

  const list = PROGRAMS.filter((p) =>
    active === "all" ? true : active === "mine" ? homeSlugs.includes(p.locationSlug) : p.locationSlug === active,
  ).sort(byStartDesc);
  const homeNames = LOCATIONS.filter((l) => homeSlugs.includes(l.slug)).map((l) => l.name);
  const chips = [
    ...(hasHistory ? [{ slug: "mine", name: homeNames.length === 1 ? `My location · ${homeNames[0]}` : "My locations" }] : []),
    ...(hasHistory ? [] : [{ slug: "all", name: "All locations" }]),
    ...LOCATIONS,
    ...(hasHistory ? [{ slug: "all", name: "All locations" }] : []),
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="display-condensed text-4xl font-black italic md:text-5xl">All Programs</h1>
      {hasHistory && active === "mine" && (
        <p className="mt-2 text-sm text-muted-foreground">
          Showing programs at {homeNames.join(" & ")}, based on your past registrations.
        </p>
      )}
      <div className="mt-6 flex flex-wrap gap-1.5">
        {chips.map((l) => (
          <button key={l.slug} onClick={() => setLoc(l.slug)} className={`cursor-pointer rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${active === l.slug ? "bg-primary text-primary-foreground" : "bg-muted text-foreground/75 hover:bg-accent"}`}>
            {l.name}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border px-6 py-16 text-center">
          <p className="text-lg font-semibold">No programs here yet</p>
          <button onClick={() => setLoc("all")} className="mt-5 cursor-pointer rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">Show all locations</button>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-5 md:grid-cols-3 lg:grid-cols-4">
          {list.map((p) => (
            <Link key={p.id} to="/programs/$programId" params={{ programId: p.id }} className="group block overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
              <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                {p.sessions.length > 0 && p.sessions.every((s) => s.enrolled >= s.capacity) ? (
                  <span className="absolute left-3 top-3 z-10 rounded-full bg-destructive px-2.5 py-0.5 text-xs font-bold text-destructive-foreground">Full · Waitlist Open</span>
                ) : p.sessions.some((s) => s.capacity - s.enrolled < 15) ? (
                  <span className="absolute left-3 top-3 z-10 rounded-full bg-warning px-2.5 py-0.5 text-xs font-bold text-warning-foreground">Spots Limited</span>
                ) : null}
                <ProgramImage src={p.image} alt={p.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
              </div>
              <div className="space-y-1.5 p-4">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{p.category}</span>
                  {programTags(p).map((t) => (
                    <span key={t} className="rounded-full bg-secondary px-2 py-0.5 text-xs font-bold text-secondary-foreground">{t}</span>
                  ))}
                </div>
                <p className="line-clamp-2 font-bold">{p.name}</p>
                <p className="text-sm text-muted-foreground">{eligibilityLabel(p)} · {p.season}</p>
                <p className="pt-1 font-semibold">from {formatPrice(fromPrice(p))}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
      <BottomCartBar />
    </div>
  );
}
