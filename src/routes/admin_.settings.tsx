import { compressImage } from "@/lib/compress-image";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useSession, signInWithEmail } from "@/lib/auth-client";
import { defaultSettings, parseSettings, type FinanceSettings, type LocationSettings, type SiteSettings } from "@/lib/site-settings";
import { formatPrice, type GlobalAddOn, type ProgramCategory } from "@/data/registration";
import { PoliciesEditor } from "@/components/admin/PoliciesEditor";

export const Route = createFileRoute("/admin_/settings")({ component: SettingsPage });

const inputCls =
  "h-10 w-full rounded-lg border border-input bg-card px-3.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";
const areaCls =
  "w-full rounded-lg border border-input bg-card px-3.5 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";
const labelCls = "block text-xs font-semibold text-muted-foreground";
const cardCls = "rounded-2xl border border-border bg-card p-5 sm:p-6";

type Section = "general" | "locations" | "finances" | "policies" | "users" | "tools";
const SECTIONS: { id: Section; label: string }[] = [
  { id: "general", label: "Hub Site" },
  { id: "locations", label: "Locations" },
  { id: "finances", label: "Finances" },
  { id: "policies", label: "Waivers & Policies" },
  { id: "users", label: "User Management" },
  { id: "tools", label: "Tools & Shortcuts" },
];

function SettingsPage() {
  const { data: session, isPending } = useSession();
  const isSuper = useQuery(api.siteAdmin.amISuperAdmin, session ? {} : "skip");
  if (isPending || (session && isSuper === undefined))
    return <Wrap><div className="h-40 animate-pulse rounded-2xl bg-muted" /></Wrap>;
  if (!session) return <Wrap><SuperSignIn /></Wrap>;
  if (!isSuper)
    return (
      <Wrap>
        <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-8 text-center">
          <h2 className="text-xl font-bold">Super Admin Only</h2>
          <p className="mt-2 text-sm text-muted-foreground">Settings are restricted to the TOP Sports Super Admin.</p>
          <Link to="/admin" className="mt-6 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">Back to Staff Portal</Link>
        </div>
      </Wrap>
    );
  return <SettingsEditor />;
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="display-condensed mb-6 text-4xl font-black italic md:text-5xl">Settings</h1>
      {children}
    </div>
  );
}

function SuperSignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        const r = await signInWithEmail(email, password);
        setLoading(false);
        if (!r.success) setError(r.error?.message ?? "Could not sign in");
      }}
      className="mx-auto max-w-md space-y-4 rounded-2xl border border-border bg-card p-8"
    >
      <h2 className="text-xl font-bold">Super Admin Sign In</h2>
      {error && <p className="rounded-lg bg-destructive/10 px-3.5 py-2 text-sm text-destructive">{error}</p>}
      <label className={labelCls}>Email<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={`${inputCls} mt-1.5`} /></label>
      <label className={labelCls}>Password<input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputCls} mt-1.5`} /></label>
      <button disabled={loading} className="w-full cursor-pointer rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
        {loading ? "Please wait..." : "Sign In"}
      </button>
    </form>
  );
}

function SettingsEditor() {
  const saved = useQuery(api.siteAdmin.getSettings, {});
  const save = useMutation(api.siteAdmin.saveSettings);
  const [draft, setDraft] = useState<SiteSettings | null>(null);
  const [section, setSection] = useState<Section>("general");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (saved !== undefined && !dirty) setDraft(parseSettings(saved?.data));
  }, [saved, dirty]);

  if (!draft) return <Wrap><div className="h-40 animate-pulse rounded-2xl bg-muted" /></Wrap>;

  const update = (patch: Partial<SiteSettings>) => {
    setDraft({ ...draft, ...patch });
    setDirty(true);
  };
  const updateLoc = (slug: string, patch: Partial<LocationSettings>) =>
    update({ locations: draft.locations.map((l) => (l.slug === slug ? { ...l, ...patch } : l)) });

  const onSave = async () => {
    setSaving(true);
    try {
      await save({ data: JSON.stringify(draft) });
      setDirty(false);
      toast.success("Settings saved — live on the site now");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save settings");
    } finally {
      setSaving(false);
    }
  };

  const isSettingsSection = section === "general" || section === "locations" || section === "finances" || section === "policies";

  return (
    <div className="mx-auto max-w-5xl px-4 pb-28 pt-10 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display-condensed text-4xl font-black italic md:text-5xl">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Super Admin only.{saved?.updatedAt ? ` Last saved ${new Date(saved.updatedAt).toLocaleString("en-CA")}.` : " Using default settings."}
          </p>
        </div>
        <Link to="/admin" className="rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-accent">← Staff Portal</Link>
      </div>

      <div className="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex min-w-max gap-1 border-b border-border">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={`-mb-px cursor-pointer border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${section === s.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {section === "general" && <GeneralSection draft={draft} update={update} />}
      {section === "locations" && <LocationsSection draft={draft} updateLoc={updateLoc} />}
      {section === "finances" && <FinancesSection draft={draft} update={update} />}
      {section === "policies" && <PoliciesEditor waivers={draft.waivers} onChange={(waivers) => update({ waivers })} />}
      {section === "users" && <UsersSection locations={draft.locations} />}
      {section === "tools" && (
        <ToolsSection
          onReset={() => {
            if (!confirm("Reset hub and location settings to the original defaults? Save afterwards to apply.")) return;
            setDraft(defaultSettings());
            setDirty(true);
          }}
        />
      )}

      {isSettingsSection && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <span className="text-xs text-muted-foreground sm:text-sm">{dirty ? "You have unsaved changes" : "All changes saved"}</span>
            <div className="flex gap-2">
              {dirty && (
                <button onClick={() => { setDirty(false); setDraft(parseSettings(saved?.data)); }} className="cursor-pointer rounded-full border border-border px-4 py-2.5 text-sm font-semibold hover:bg-accent">
                  Discard
                </button>
              )}
              <button disabled={!dirty || saving} onClick={onSave} className="cursor-pointer rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {saving ? "Saving..." : "Save Settings"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GeneralSection({ draft, update }: { draft: SiteSettings; update: (p: Partial<SiteSettings>) => void }) {
  return (
    <div className="space-y-6">
      <div className={cardCls}>
        <h2 className="text-xl font-bold">Main Hub Page</h2>
        <p className="mt-1 text-sm text-muted-foreground">The home page families land on before choosing a location.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className={labelCls}>Organization Name<input value={draft.orgName} onChange={(e) => update({ orgName: e.target.value })} className={`${inputCls} mt-1.5`} /></label>
          <label className={labelCls}>Hub Headline<input value={draft.hubTitle} onChange={(e) => update({ hubTitle: e.target.value })} className={`${inputCls} mt-1.5`} /></label>
          <label className={`${labelCls} sm:col-span-2`}>Hub Subheader (Optional)<input value={draft.hubSubtitle} onChange={(e) => update({ hubSubtitle: e.target.value })} placeholder="e.g. Summer 2027 registration is now open" className={`${inputCls} mt-1.5`} /></label>
        </div>
      </div>

      <div className={cardCls}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">Announcement Banner</h2>
            <p className="mt-1 text-sm text-muted-foreground">Shows a banner across the top of every family-facing page.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={draft.announcementOn}
            onClick={() => update({ announcementOn: !draft.announcementOn })}
            className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors ${draft.announcementOn ? "bg-primary" : "bg-muted"}`}
          >
            <span className={`inline-block h-5 w-5 rounded-full bg-card shadow transition-transform ${draft.announcementOn ? "translate-x-6" : "translate-x-1"}`} />
          </button>
        </div>
        <textarea rows={2} value={draft.announcement} onChange={(e) => update({ announcement: e.target.value })} placeholder="e.g. Early-bird pricing ends March 31!" className={`${areaCls} mt-4`} />
      </div>

      <StockPhotosCard photos={draft.stockPhotos} onChange={(stockPhotos) => update({ stockPhotos })} />

      <div className={cardCls}>
        <h2 className="text-xl font-bold">Contact & Footer</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className={labelCls}>Main Support Email<input type="email" value={draft.supportEmail} onChange={(e) => update({ supportEmail: e.target.value })} className={`${inputCls} mt-1.5`} /></label>
          <label className={labelCls}>Main Support Phone (Optional)<input value={draft.supportPhone} onChange={(e) => update({ supportPhone: e.target.value })} className={`${inputCls} mt-1.5`} /></label>
          <label className={`${labelCls} sm:col-span-2`}>Footer Description<textarea rows={3} value={draft.footerBlurb} onChange={(e) => update({ footerBlurb: e.target.value })} className={`${areaCls} mt-1.5`} /></label>
        </div>
      </div>
    </div>
  );
}

function StockPhotosCard({ photos, onChange }: { photos: string[]; onChange: (p: string[]) => void }) {
  const genUrl = useMutation(api.siteAdmin.generateUploadUrl);
  const fileUrl = useMutation(api.siteAdmin.fileUrl);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const add = (url: string) => {
    if (photos.includes(url)) return toast("That photo is already in the library");
    onChange([...photos, url]);
  };
  const upload = async (files: FileList) => {
    setBusy(true);
    const added: string[] = [];
    try {
      for (const raw of Array.from(files)) {
        if (!raw.type.startsWith("image/")) continue;
        const f = await compressImage(raw);
        if (f.size > 8 * 1024 * 1024) { toast.error(`${f.name} is over 8 MB`); continue; }
        const url = await genUrl({});
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": f.type }, body: f });
        if (!res.ok) throw new Error("Upload failed");
        const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
        added.push(await fileUrl({ storageId }));
      }
      if (added.length) {
        onChange([...photos, ...added.filter((a) => !photos.includes(a))]);
        toast.success(`${added.length} photo${added.length > 1 ? "s" : ""} added — remember to save`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={cardCls}>
      <h2 className="text-xl font-bold">Stock Photo Library</h2>
      <p className="mt-1 text-sm text-muted-foreground">These photos are offered as quick picks in the program builder and on location photos. Removing a photo here doesn't remove it from programs already using it.</p>
      {photos.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No stock photos yet. Upload your own below.</div>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {photos.map((src) => (
            <div key={src} className="group relative aspect-[4/3] overflow-hidden rounded-xl bg-muted">
              <img src={src} alt="Stock" loading="lazy" decoding="async" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => onChange(photos.filter((x) => x !== src))}
                className="absolute right-2 top-2 cursor-pointer rounded-full bg-destructive px-3 py-1 text-xs font-semibold text-destructive-foreground shadow"
                aria-label="Remove photo"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      <input ref={ref} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) void upload(e.target.files); e.target.value = ""; }} />
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button type="button" disabled={busy} onClick={() => ref.current?.click()} className="h-10 shrink-0 cursor-pointer rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
          {busy ? "Uploading..." : "Upload Photos"}
        </button>
        <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="…or paste an image link" className={inputCls} />
        <button type="button" onClick={() => { if (link.trim()) { add(link.trim()); setLink(""); } }} className="h-10 shrink-0 cursor-pointer rounded-full border border-border px-5 text-sm font-semibold hover:bg-accent">Add Link</button>
      </div>
    </div>
  );
}

function ImagePicker({ value, onChange, stock = [] }: { value: string; onChange: (url: string) => void; stock?: string[] }) {
  const genUrl = useMutation(api.siteAdmin.generateUploadUrl);
  const fileUrl = useMutation(api.siteAdmin.fileUrl);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const upload = async (raw: File) => {
    if (!raw.type.startsWith("image/")) return toast.error("Please choose an image file");
    const f = await compressImage(raw);
    if (f.size > 8 * 1024 * 1024) return toast.error("Image must be under 8 MB");
    setBusy(true);
    try {
      const url = await genUrl({});
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": f.type }, body: f });
      if (!res.ok) throw new Error("Upload failed");
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      onChange(await fileUrl({ storageId }));
      toast.success("Photo uploaded — remember to save");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <div className="relative aspect-[16/9] overflow-hidden rounded-xl bg-muted">
        {value ? <img src={value} alt="Location" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No photo</div>}
        {busy && <div className="absolute inset-0 flex items-center justify-center bg-background/70 text-sm font-semibold">Uploading...</div>}
      </div>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => ref.current?.click()} className="cursor-pointer rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90">Upload Photo</button>
        {stock.slice(0, 8).map((s) => (
          <button key={s} type="button" onClick={() => onChange(s)} className={`h-9 w-12 cursor-pointer overflow-hidden rounded-md border-2 ${value === s ? "border-primary" : "border-transparent"}`} aria-label="Use stock photo">
            <img src={s} alt="" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Or paste an image link" className={inputCls} />
    </div>
  );
}

function LocationsSection({ draft, updateLoc }: { draft: SiteSettings; updateLoc: (slug: string, p: Partial<LocationSettings>) => void }) {
  const [open, setOpen] = useState<string>(draft.locations[0]?.slug ?? "");
  return (
    <div className="space-y-3">
      {draft.locations.map((l) => {
        const isOpen = open === l.slug;
        return (
          <div key={l.slug} className="overflow-hidden rounded-2xl border border-border bg-card">
            <button onClick={() => setOpen(isOpen ? "" : l.slug)} className="flex w-full cursor-pointer items-center gap-3 p-4 text-left hover:bg-accent/40">
              <img src={l.image} alt="" className="h-12 w-16 shrink-0 rounded-lg bg-muted object-cover" />
              <div className="min-w-0 flex-1">
                <div className="font-bold">{l.name}</div>
                <div className="truncate text-xs text-muted-foreground">/{l.slug} · {l.email}</div>
              </div>
              <span className="text-muted-foreground">{isOpen ? "−" : "+"}</span>
            </button>
            {isOpen && (
              <div className="grid gap-6 border-t border-border p-5 lg:grid-cols-2">
                <div className="space-y-4">
                  <label className={labelCls}>Location Name<input value={l.name} onChange={(e) => updateLoc(l.slug, { name: e.target.value })} className={`${inputCls} mt-1.5`} /></label>
                  <label className={labelCls}>Region<input value={l.region} onChange={(e) => updateLoc(l.slug, { region: e.target.value })} className={`${inputCls} mt-1.5`} /></label>
                  <label className={labelCls}>Description (Location Page Hero)<textarea rows={3} value={l.blurb} onChange={(e) => updateLoc(l.slug, { blurb: e.target.value })} className={`${areaCls} mt-1.5`} /></label>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className={labelCls}>Location Email<input type="email" value={l.email} onChange={(e) => updateLoc(l.slug, { email: e.target.value })} className={`${inputCls} mt-1.5`} /></label>
                    <label className={labelCls}>Location Phone<input value={l.phone} onChange={(e) => updateLoc(l.slug, { phone: e.target.value })} className={`${inputCls} mt-1.5`} /></label>
                  </div>
                  <p className="text-xs text-muted-foreground">Registration, refund and transfer copies go to the location email. It's also shown to families as the club contact.</p>
                  <VenueEditor venues={l.venues} addresses={l.venueAddresses ?? {}} onChange={(venues, venueAddresses) => updateLoc(l.slug, { venues, venueAddresses })} />
                </div>
                <div>
                  <span className={labelCls}>Location Photo (Home Card & Location Page)</span>
                  <div className="mt-1.5"><ImagePicker value={l.image} stock={draft.stockPhotos} onChange={(image) => updateLoc(l.slug, { image })} /></div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function VenueEditor({ venues, addresses, onChange }: { venues: string[]; addresses: Record<string, string>; onChange: (v: string[], a: Record<string, string>) => void }) {
  const [next, setNext] = useState("");
  const [nextAddr, setNextAddr] = useState("");
  const add = () => {
    const v = next.trim();
    if (!v || venues.includes(v)) return;
    onChange([...venues, v], { ...addresses, [v]: nextAddr.trim() });
    setNext("");
    setNextAddr("");
  };
  const remove = (v: string) => {
    const a = { ...addresses };
    delete a[v];
    onChange(venues.filter((x) => x !== v), a);
  };
  return (
    <div>
      <span className={labelCls}>Venues & Addresses</span>
      <p className="mt-1 text-xs text-muted-foreground">Venues appear in the Program Builder dropdowns. Families tap the venue name to open its address in Google Maps.</p>
      <div className="mt-2 space-y-2">
        {venues.map((v) => (
          <div key={v} className="rounded-lg border border-border bg-muted/50 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">{v}</span>
              <button type="button" onClick={() => remove(v)} className="cursor-pointer rounded-md px-2 py-1 text-xs font-semibold text-destructive hover:bg-destructive/10" aria-label={`Remove ${v}`}>Remove</button>
            </div>
            <input value={addresses[v] ?? ""} onChange={(e) => onChange(venues, { ...addresses, [v]: e.target.value })} placeholder="Street address, city, postal code" className={`${inputCls} mt-2`} />
          </div>
        ))}
        {venues.length === 0 && <span className="text-xs text-muted-foreground">No venues yet.</span>}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input value={next} onChange={(e) => setNext(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder="New venue name" className={inputCls} />
        <input value={nextAddr} onChange={(e) => setNextAddr(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder="Address" className={inputCls} />
        <button type="button" onClick={add} className="h-10 cursor-pointer rounded-lg border border-border px-4 text-sm font-semibold hover:bg-accent">Add Venue</button>
      </div>
    </div>
  );
}

function UsersSection({ locations }: { locations: LocationSettings[] }) {
  const data = useQuery(api.siteAdmin.listStaff, {});
  const invite = useMutation(api.siteAdmin.inviteStaff);
  const remove = useMutation(api.siteAdmin.removeStaff);
  const resend = useMutation(api.siteAdmin.resendInvite);
  const updateStaff = useMutation(api.siteAdmin.updateStaff);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [locs, setLocs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const siteUrl = typeof window !== "undefined" ? window.location.origin : "";
  const nameOf = (slug: string) => locations.find((l) => l.slug === slug)?.name ?? slug;

  const onInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await invite({ email, name: name || undefined, locations: locs.length ? locs : undefined, siteUrl });
      toast.success(`Invite sent to ${email}`);
      setEmail(""); setName(""); setLocs([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message.replace(/^.*Uncaught Error: /, "").split("\n")[0] : "Could not invite");
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(`${siteUrl}/admin`);
    toast.success("Sign-in link copied (for staff who already have a login)");
  };

  return (
    <div className="space-y-6">
      <form onSubmit={onInvite} className={cardCls}>
        <h2 className="text-xl font-bold">Invite Staff</h2>
        <p className="mt-1 text-sm text-muted-foreground">Invited staff get access to the Staff Portal (programs, financials, rosters, waitlists, refunds, coupons and emails). Only you can open Settings.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className={labelCls}>Email<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={`${inputCls} mt-1.5`} /></label>
          <label className={labelCls}>Name (Optional)<input value={name} onChange={(e) => setName(e.target.value)} className={`${inputCls} mt-1.5`} /></label>
        </div>
        <div className="mt-4">
          <span className={labelCls}>Locations (Leave Blank for All)</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {locations.map((l) => {
              const on = locs.includes(l.slug);
              return (
                <button key={l.slug} type="button" onClick={() => setLocs(on ? locs.filter((x) => x !== l.slug) : [...locs, l.slug])} className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${on ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent"}`}>
                  {l.name}
                </button>
              );
            })}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <button disabled={busy} className="cursor-pointer rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">{busy ? "Inviting..." : "Send Invite"}</button>
          <button type="button" onClick={() => void copyLink()} className="cursor-pointer rounded-full border border-border px-5 py-2.5 text-sm font-semibold hover:bg-accent">Copy Staff Sign-In Link</button>
        </div>
      </form>

      <div className={cardCls}>
        <h2 className="text-xl font-bold">People With Access</h2>
        {data === undefined ? (
          <div className="mt-4 h-24 animate-pulse rounded-xl bg-muted" />
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {(data?.superAdmins ?? []).map((e) => (
              <li key={e} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0"><div className="truncate font-semibold">{e}</div><div className="text-xs text-muted-foreground">All locations · Settings access</div></div>
                <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-bold text-primary-foreground">Super Admin</span>
              </li>
            ))}
            {(data?.staff ?? []).map((s) => (
              <li key={s._id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <button type="button" onClick={() => setEditId(s._id)} className="max-w-full cursor-pointer truncate text-left font-semibold text-primary underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring">{s.name ? `${s.name} · ` : ""}{s.email}</button>
                  <div className="text-xs text-muted-foreground">
                    {s.locations?.length ? s.locations.map(nameOf).join(", ") : "All locations"} · Invited {new Date(s.invitedAt).toLocaleDateString("en-CA")} ·{" "}
                    {s.acceptedAt ? "Login created" : s.emailStatus === "sent" ? "Invite emailed" : s.emailStatus === "sending" ? "Sending invite..." : "Email didn't send — copy their invite link"}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-bold text-secondary-foreground">Staff</span>
                  {!s.acceptedAt && s.inviteToken && (
                    <button type="button" onClick={() => void navigator.clipboard.writeText(`${siteUrl}/admin?invite=${s.inviteToken}`).then(() => toast.success("Invite link copied — send it only to this person"))} className="cursor-pointer rounded-full border border-border px-3 py-1.5 text-xs font-semibold hover:bg-accent">Copy Invite Link</button>
                  )}
                  <select
                    value={s.locations?.length === 1 ? s.locations[0] : s.locations?.length ? "multi" : ""}
                    onChange={(e) => void updateStaff({ id: s._id, name: s.name, locations: e.target.value && e.target.value !== "multi" ? [e.target.value] : e.target.value === "multi" ? s.locations : undefined }).then(() => toast.success("Access updated"))}
                    className="h-9 rounded-lg border border-input bg-card px-2.5 text-xs"
                    aria-label="Location access"
                  >
                    <option value="">All Locations</option>
                    {s.locations && s.locations.length > 1 && <option value="multi">{s.locations.map(nameOf).join(", ")}</option>}
                    {locations.map((l) => <option key={l.slug} value={l.slug}>{l.name}</option>)}
                  </select>
                  <button onClick={() => void resend({ id: s._id, siteUrl }).then(() => toast.success("Invite resent"))} className="cursor-pointer rounded-full border border-border px-3 py-1.5 text-xs font-semibold hover:bg-accent">Resend</button>
                  <button onClick={() => { if (confirm(`Remove staff access for ${s.email}?`)) void remove({ id: s._id }).then(() => toast(`${s.email} removed`)); }} className="cursor-pointer rounded-full border border-destructive/40 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10">Remove</button>
                </div>
              </li>
            ))}
            {(data?.envStaff ?? []).map((e) => (
              <li key={e} className="flex items-center justify-between gap-2 py-3">
                <div className="min-w-0"><div className="truncate font-semibold">{e}</div><div className="text-xs text-muted-foreground">Legacy staff list</div></div>
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold">Staff</span>
              </li>
            ))}
            {data && data.staff.length === 0 && data.envStaff.length === 0 && (
              <li className="py-6 text-center text-sm text-muted-foreground">No staff invited yet. Use the form above to add your first team member.</li>
            )}
          </ul>
        )}
        {editId && data?.staff.find((x) => x._id === editId) && (
          <StaffEditor
            key={editId}
            member={data.staff.find((x) => x._id === editId)!}
            locations={locations}
            onClose={() => setEditId(null)}
            onSave={async (n, l) => { await updateStaff({ id: editId as never, name: n, locations: l }); toast.success("Employee updated"); setEditId(null); }}
            onDelete={async () => { await remove({ id: editId as never }); toast("Employee removed"); setEditId(null); }}
          />
        )}
      </div>
    </div>
  );
}

function StaffEditor({ member, locations, onClose, onSave, onDelete }: {
  member: { email: string; name?: string; locations?: string[] };
  locations: LocationSettings[];
  onClose: () => void;
  onSave: (name: string, locs: string[] | undefined) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [name, setName] = useState(member.name ?? "");
  const [all, setAll] = useState(!member.locations?.length);
  const [locs, setLocs] = useState<string[]>(member.locations ?? []);
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } catch (e) { toast.error(e instanceof Error ? e.message : "Something went wrong"); } finally { setBusy(false); } };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={`Edit ${member.email}`} onClick={onClose}>
      <div className="w-full max-w-lg rounded-t-2xl bg-card p-6 shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-bold">Edit Employee</h3>
            <p className="truncate text-sm text-muted-foreground">{member.email}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="h-9 w-9 cursor-pointer rounded-full hover:bg-accent">✕</button>
        </div>
        <div className="mt-5 space-y-4">
          <label className="block text-xs font-semibold text-muted-foreground">Name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="mt-1.5 h-10 w-full rounded-lg border border-input bg-card px-3.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <div>
            <p className="text-xs font-semibold text-muted-foreground">Location Access</p>
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} className="h-4 w-4 accent-primary" />All locations</label>
            {!all && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                {locations.map((l) => (
                  <label key={l.slug} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                    <input type="checkbox" checked={locs.includes(l.slug)} onChange={(e) => setLocs(e.target.checked ? [...locs, l.slug] : locs.filter((x) => x !== l.slug))} className="h-4 w-4 accent-primary" />{l.name}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          {confirmDel ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-destructive">Remove all staff access?</span>
              <button type="button" disabled={busy} onClick={() => void run(onDelete)} className="cursor-pointer rounded-full bg-destructive px-4 py-2 text-sm font-semibold text-white hover:bg-destructive/90 disabled:opacity-50">Yes, Delete</button>
              <button type="button" onClick={() => setConfirmDel(false)} className="cursor-pointer rounded-full px-4 py-2 text-sm font-semibold hover:bg-accent">Keep</button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmDel(true)} className="cursor-pointer rounded-full border border-destructive/40 px-4 py-2 text-sm font-semibold text-destructive hover:bg-destructive/10">Delete Employee</button>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="cursor-pointer rounded-full px-4 py-2 text-sm font-semibold hover:bg-accent">Cancel</button>
            <button type="button" disabled={busy || (!all && locs.length === 0)} onClick={() => void run(() => onSave(name, all ? undefined : locs))} className="cursor-pointer rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">Save Changes</button>
          </div>
        </div>
        {!all && locs.length === 0 && <p className="mt-2 text-xs text-destructive">Pick at least one location, or choose All locations.</p>}
      </div>
    </div>
  );
}

function ToolsSection({ onReset }: { onReset: () => void }) {
  const tools = [
    { title: "Programs", body: "Create, duplicate, publish and price programs, sessions, add-ons, discounts and questions." },
    { title: "Financials", body: "Gross, refunds, net revenue, credits and discounts by location and sport, with CSV export." },
    { title: "Rosters", body: "Print or export session rosters with custom columns." },
    { title: "Waitlists & Refunds", body: "Offer freed spots and review older refund requests." },
    { title: "Coupons & Credit", body: "Create coupon codes and add account credit to families." },
    { title: "Email Families", body: "Message everyone in a program or session." },
  ];
  return (
    <div className="space-y-6">
      <div className={cardCls}>
        <h2 className="text-xl font-bold">Staff Portal Tools</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {tools.map((t) => (
            <Link key={t.title} to="/admin" className="rounded-xl border border-border p-4 transition-colors hover:bg-accent">
              <div className="font-semibold">{t.title} →</div>
              <p className="mt-1 text-xs text-muted-foreground">{t.body}</p>
            </Link>
          ))}
        </div>
      </div>
      <div className={cardCls}>
        <h2 className="text-xl font-bold">Built-In Platform Settings</h2>
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
          <li><span className="font-semibold text-foreground">Stripe Payments & Payouts:</span> Store tab in the left sidebar of your Shipper workspace.</li>
          <li><span className="font-semibold text-foreground">Email Templates:</span> Shipper project settings → Email.</li>
          <li><span className="font-semibold text-foreground">Domain & Analytics:</span> Shipper project settings → Domain / Analytics.</li>
        </ul>
      </div>
      <div className={`${cardCls} border-destructive/30`}>
        <h2 className="text-xl font-bold">Reset Hub & Locations</h2>
        <p className="mt-1 text-sm text-muted-foreground">Restores the original names, descriptions, photos and contact emails. Programs and registrations are not affected.</p>
        <button onClick={onReset} className="mt-4 cursor-pointer rounded-full border border-destructive/40 px-5 py-2.5 text-sm font-semibold text-destructive hover:bg-destructive/10">Reset to Defaults</button>
      </div>
    </div>
  );
}

const SPORTS: ProgramCategory[] = ["Camps", "Hockey", "Soccer", "Lacrosse"];

function FinancesSection({ draft, update }: { draft: SiteSettings; update: (p: Partial<SiteSettings>) => void }) {
  const f = draft.finance;
  const payments = useQuery(api.commerce.paymentsStatus, {});
  const setF = (patch: Partial<FinanceSettings>) => update({ finance: { ...f, ...patch } });
  const updAo = (i: number, patch: Partial<GlobalAddOn>) => setF({ globalAddOns: f.globalAddOns.map((g, j) => (j === i ? { ...g, ...patch } : g)) });
  const num = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const sample = 299;
  const net = sample * (1 - f.feePct / 100);
  return (
    <div className="space-y-6">
      <div className={cardCls}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Stripe Payments</h2>
            <p className="mt-1 text-sm text-muted-foreground">Card payments, refunds and payouts run through your Stripe account.</p>
          </div>
          {payments === undefined ? (
            <span className="h-6 w-28 animate-pulse rounded-full bg-muted" />
          ) : payments.connected ? (
            <span className="rounded-full bg-success px-3 py-1 text-xs font-bold text-success-foreground">Connected</span>
          ) : (
            <span className="rounded-full bg-warning px-3 py-1 text-xs font-bold text-warning-foreground">Not Connected</span>
          )}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border p-4">
            <p className="text-sm font-semibold">Update Stripe API Key</p>
            <p className="mt-1 text-xs text-muted-foreground">For security, secret keys are never typed into the website. Open the <span className="font-semibold text-foreground">Store</span> tab in your Shipper workspace sidebar → Settings → Connect Stripe, or ask in the builder chat to "connect Stripe payments" for the secure key card.</p>
          </div>
          <div className="rounded-xl border border-border p-4">
            <p className="text-sm font-semibold">Stripe Dashboard</p>
            <p className="mt-1 text-xs text-muted-foreground">Payouts, disputes, receipts and payment history.</p>
            <a href="https://dashboard.stripe.com" target="_blank" rel="noreferrer" className="mt-3 inline-flex rounded-full border border-border px-4 py-2 text-xs font-semibold hover:bg-accent">Open Stripe Dashboard ↗</a>
          </div>
        </div>
      </div>

      <div className={cardCls}>
        <h2 className="text-xl font-bold">Revenue Reporting</h2>
        <p className="mt-1 text-sm text-muted-foreground">Used to calculate Net Revenue on the Program Manager and Financial Reports. Doesn't change what families pay.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className={labelCls}>Processing Fee Deducted (%)
            <input type="number" min={0} max={30} step="0.1" value={f.feePct} onChange={(e) => setF({ feePct: Math.min(30, Math.max(0, num(e.target.value))) })} className={`${inputCls} mt-1.5`} />
          </label>
          <div className="rounded-xl bg-muted/60 p-4 text-sm">
            <p className="text-xs text-muted-foreground">Example on a {formatPrice(sample)} HST-free registration</p>
            <p className="mt-1 font-semibold">Net Revenue: {formatPrice(net)} <span className="font-normal text-muted-foreground">({formatPrice(sample - net)} in fees)</span></p>
          </div>
        </div>
      </div>

      <div className={cardCls}>
        <h2 className="text-xl font-bold">Automatic Family Savings</h2>
        <p className="mt-1 text-sm text-muted-foreground">Applied automatically at checkout, no code needed. Set either to 0 to turn it off.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className={labelCls}>Sibling Savings (% off each extra child)
            <input type="number" min={0} max={100} value={f.siblingPct} onChange={(e) => setF({ siblingPct: Math.min(100, Math.max(0, num(e.target.value))) })} className={`${inputCls} mt-1.5`} />
          </label>
          <label className={labelCls}>Multi-Week Savings ($ off each extra camp week)
            <input type="number" min={0} value={f.extraWeek} onChange={(e) => setF({ extraWeek: Math.max(0, num(e.target.value)) })} className={`${inputCls} mt-1.5`} />
          </label>
        </div>
      </div>

      <div className={cardCls}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Global Add-Ons</h2>
            <p className="mt-1 text-sm text-muted-foreground">Offered on every program (or only the sports you pick) when switched on — e.g. jerseys, t-shirts.</p>
          </div>
          <button
            type="button"
            onClick={() => setF({ globalAddOns: [...f.globalAddOns, { id: `g-${crypto.randomUUID().slice(0, 6)}`, name: "", description: "", price: 0, taxable: true, enabled: true, categories: [] }] })}
            className="cursor-pointer rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-accent"
          >
            + Add Global Add-On
          </button>
        </div>
        {f.globalAddOns.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-border p-6 text-center">
            <p className="text-sm text-muted-foreground">No global add-ons yet.</p>
            <button type="button" onClick={() => setF({ globalAddOns: [{ id: `g-${crypto.randomUUID().slice(0, 6)}`, name: "TOP Sports Jersey", description: "Official program jersey, yours to keep", price: 45, taxable: true, enabled: false, categories: [] }] })} className="mt-3 cursor-pointer rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Start With a Jersey</button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {f.globalAddOns.map((g, i) => (
              <div key={g.id} className={`space-y-3 rounded-xl border p-4 ${g.enabled ? "border-primary/40 bg-accent/40" : "border-border bg-muted/40"}`}>
                <div className="flex items-center justify-between gap-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${g.enabled ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"}`}>{g.enabled ? "On — Shown to Families" : "Off"}</span>
                  <button type="button" role="switch" aria-checked={g.enabled} onClick={() => updAo(i, { enabled: !g.enabled })} className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors ${g.enabled ? "bg-primary" : "bg-border"}`}>
                    <span className={`inline-block h-5 w-5 rounded-full bg-card shadow transition-transform ${g.enabled ? "translate-x-6" : "translate-x-1"}`} />
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr_0.6fr]">
                  <label className={labelCls}>Name<input value={g.name} onChange={(e) => updAo(i, { name: e.target.value })} placeholder="e.g. Team T-Shirt" className={`${inputCls} mt-1.5`} /></label>
                  <label className={labelCls}>Description<input value={g.description} onChange={(e) => updAo(i, { description: e.target.value })} className={`${inputCls} mt-1.5`} /></label>
                  <label className={labelCls}>Price (CAD)<input type="number" min={0} step="0.01" value={g.price} onChange={(e) => updAo(i, { price: Math.max(0, num(e.target.value)) })} className={`${inputCls} mt-1.5`} /></label>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">Applies to:</span>
                  {SPORTS.map((c) => {
                    const on = g.categories.includes(c);
                    return (
                      <button key={c} type="button" onClick={() => updAo(i, { categories: on ? g.categories.filter((x) => x !== c) : [...g.categories, c] })} className={`cursor-pointer rounded-full px-3 py-1 text-xs font-semibold ${on ? "bg-primary text-primary-foreground" : "border border-border hover:bg-accent"}`}>{c}</button>
                    );
                  })}
                  <span className="text-xs text-muted-foreground">{g.categories.length ? "" : "(none picked = all programs)"}</span>
                  <label className="ml-auto flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={g.taxable} onChange={(e) => updAo(i, { taxable: e.target.checked })} className="h-4 w-4 accent-primary" />Charge HST (non-camps)</label>
                  <button type="button" onClick={() => { if (confirm(`Remove ${g.name || "this add-on"}?`)) setF({ globalAddOns: f.globalAddOns.filter((_, j) => j !== i) }); }} className="cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10">Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={cardCls}>
        <h2 className="text-xl font-bold">Fixed Policies</h2>
        <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
          <li><span className="font-semibold text-foreground">HST:</span> 13%, never charged on camps.</li>
          <li><span className="font-semibold text-foreground">Refund Admin Fee:</span> $50 per refund.</li>
          <li><span className="font-semibold text-foreground">Refund Deadline:</span> May 31 for summer camps, otherwise 30 days before start.</li>
        </ul>
      </div>
    </div>
  );
}
