import { useMemo, useState } from "react";

export type WeekItem = {
  id: string;
  title: string;
  child: string;
  time: string;
  days: string;
  venue: string;
  start: Date;
  end: Date;
  outDates: string[];
};

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Which weekdays (0 = Sunday) a schedule string like "Mon–Fri" or "Saturdays" covers. */
export function weekdaysFor(days: string): number[] {
  const s = days.toLowerCase();
  const range = s.match(/(sun|mon|tue|wed|thu|fri|sat)[a-z]*\s*(?:–|-|to)\s*(sun|mon|tue|wed|thu|fri|sat)/);
  if (range) {
    const a = DAY_KEYS.indexOf(range[1]);
    const b = DAY_KEYS.indexOf(range[2]);
    const out: number[] = [];
    for (let i = a; ; i = (i + 1) % 7) {
      out.push(i);
      if (i === b || out.length > 7) break;
    }
    return out;
  }
  const found = DAY_KEYS.map((k, i) => (s.includes(k) ? i : -1)).filter((i) => i >= 0);
  if (/daily|every day/.test(s)) return [0, 1, 2, 3, 4, 5, 6];
  if (/weekday/.test(s) || found.length === 0) return [1, 2, 3, 4, 5];
  return found;
}

function mondayOf(d: Date) {
  const m = new Date(d);
  m.setHours(0, 0, 0, 0);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const short = (d: Date) => d.toLocaleDateString("en-CA", { month: "short", day: "numeric" });

export function WeekCalendar({ items, onOpen }: { items: WeekItem[]; onOpen: (id: string) => void }) {
  const firstUpcoming = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const next = items.filter((i) => i.end >= today).sort((a, b) => a.start.getTime() - b.start.getTime())[0];
    return next && next.start > today ? next.start : today;
  }, [items]);
  const [week, setWeek] = useState(() => mondayOf(firstUpcoming));

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(week);
    d.setDate(week.getDate() + i);
    return d;
  });

  const shift = (n: number) => {
    const d = new Date(week);
    d.setDate(d.getDate() + n * 7);
    setWeek(d);
  };

  const onDay = (d: Date) =>
    items.filter((i) => {
      const day0 = new Date(i.start); day0.setHours(0, 0, 0, 0);
      const day1 = new Date(i.end); day1.setHours(23, 59, 59, 999);
      return d >= day0 && d <= day1 && weekdaysFor(i.days).includes(d.getDay());
    });

  const todayIso = iso(new Date());
  const weekCount = days.reduce((n, d) => n + onDay(d).length, 0);

  return (
    <section aria-label="Weekly calendar" className="rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div>
          <p className="font-bold">Week of {short(days[0])} – {short(days[6])}</p>
          <p className="text-sm text-muted-foreground">{weekCount === 0 ? "Nothing scheduled this week" : `${weekCount} program day${weekCount === 1 ? "" : "s"} this week`}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => shift(-1)} aria-label="Previous week" className="h-10 cursor-pointer rounded-full border border-border px-4 text-sm font-semibold hover:bg-accent">←</button>
          <button type="button" onClick={() => setWeek(mondayOf(new Date()))} className="h-10 cursor-pointer rounded-full border border-border px-4 text-sm font-semibold hover:bg-accent">This Week</button>
          <button type="button" onClick={() => shift(1)} aria-label="Next week" className="h-10 cursor-pointer rounded-full border border-border px-4 text-sm font-semibold hover:bg-accent">→</button>
        </div>
      </div>
      <ol className="divide-y divide-border md:grid md:grid-cols-7 md:divide-x md:divide-y-0">
        {days.map((d, idx) => {
          const list = onDay(d);
          const isToday = iso(d) === todayIso;
          return (
            <li key={idx} className={`p-3 md:min-h-[180px] ${isToday ? "bg-accent/40" : ""}`}>
              <p className={`mb-2 text-xs font-bold uppercase tracking-wider ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                {DAY_LABELS[idx]} <span className="text-foreground">{d.getDate()}</span>{isToday ? " · Today" : ""}
              </p>
              {list.length === 0 ? (
                <p className="text-xs text-muted-foreground md:hidden">No programs</p>
              ) : (
                <div className="space-y-2">
                  {list.map((i) => {
                    const out = i.outDates.includes(iso(d));
                    return (
                      <button
                        type="button"
                        key={i.id}
                        onClick={() => onOpen(i.id)}
                        className={`w-full cursor-pointer rounded-lg border p-2.5 text-left text-xs transition-colors hover:border-primary focus-visible:ring-2 focus-visible:ring-ring ${out ? "border-dashed border-border bg-muted text-muted-foreground line-through" : "border-border bg-background"}`}
                      >
                        <span className="block font-bold text-foreground">{i.child}</span>
                        <span className="block font-semibold">{i.title}</span>
                        <span className="block text-muted-foreground">{i.time}</span>
                        {out && <span className="mt-1 block font-semibold not-italic text-destructive no-underline">Out date, no program</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
