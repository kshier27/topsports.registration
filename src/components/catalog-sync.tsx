import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { applyManagedPrograms, parseProgram, type Program } from "@/data/registration";
import { applySiteSettings, parseSettings } from "@/lib/site-settings";

/** True once staff-published programs have loaded (used for skeleton states). */
export const catalogState = { loaded: false };

/** Pulls staff-published programs + super-admin site settings and layers them over the seed data. */
export function CatalogSync({ children }: { children: React.ReactNode }) {
  const published = useQuery(api.programAdmin.listPublished, {});
  const settings = useQuery(api.siteAdmin.getSettings, {});
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!published) return;
    const list = published.map((r) => parseProgram(r.data)).filter((p): p is Program => p !== null);
    applyManagedPrograms(list);
    catalogState.loaded = true;
    setVersion((v) => v + 1);
  }, [published]);
  useEffect(() => {
    if (settings === undefined) return;
    applySiteSettings(parseSettings(settings?.data));
    setVersion((v) => v + 1);
  }, [settings]);
  return <div key={version} className="contents">{children}</div>;
}
