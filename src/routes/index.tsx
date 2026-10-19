import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { LOCATIONS, getLocation, programsFor } from "@/data/registration";
import { SITE } from "@/lib/site-settings";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const [last, setLast] = useState<string | null>(null);
  useEffect(() => {
    try {
      const s = localStorage.getItem("top_last_location");
      if (s && getLocation(s)) setLast(s);
    } catch {
      /* ignore */
    }
  }, []);
  return (
    <section id="locations" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-14 sm:px-6 md:py-20 lg:px-8">
      {last && (
        <Link to="/$location" params={{ location: last }} className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-accent px-5 py-3.5 text-accent-foreground transition-all hover:shadow-md">
          <span className="text-sm"><span className="font-bold">Continue to TOP Sports {getLocation(last)?.name}</span></span>
          <span aria-hidden className="font-bold">→</span>
        </Link>
      )}
      <h1 className="display-condensed text-4xl font-black italic md:text-5xl">{SITE.hubTitle || "Choose Your Location"}</h1>
      {SITE.hubSubtitle && <p className="mt-3 max-w-2xl text-base text-muted-foreground md:text-lg">{SITE.hubSubtitle}</p>}
      <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-5 md:mt-10 lg:grid-cols-4">
        {LOCATIONS.map((l, i) => {
          const list = programsFor(l.slug);
          const count = list.length;
          const limited = list.some((p) => p.sessions.some((s) => s.capacity - s.enrolled < 15 && s.enrolled < s.capacity));
          return (
            <motion.div key={l.slug} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07, duration: 0.45 }}>
              <Link to="/$location" params={{ location: l.slug }} className="group block overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl focus-visible:ring-2 focus-visible:ring-ring">
                <div className="relative aspect-square overflow-hidden bg-muted sm:aspect-[4/3]">
                  <img src={l.image} alt={`${l.name} programs`} loading={i > 1 ? "lazy" : "eager"} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                  {limited && <span className="absolute left-2 top-2 rounded-full bg-warning px-2 py-0.5 text-xs font-bold text-warning-foreground sm:left-3 sm:top-3 sm:text-xs">Spots Limited</span>}
                  <span className="display-condensed absolute inset-x-3 bottom-3 text-2xl sm:inset-x-5 sm:bottom-4 sm:text-4xl font-black italic leading-none tracking-tight text-white drop-shadow">{l.name}</span>
                </div>
                <div className="space-y-1.5 p-3 sm:p-5">
                  <div className="flex items-center justify-between gap-1 text-xs sm:text-sm">
                    <span className="font-semibold">{count} program{count === 1 ? "" : "s"}</span>
                    <span className="font-semibold text-primary group-hover:underline">Register →</span>
                  </div>
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
