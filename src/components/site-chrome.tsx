import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { clearFamily } from "@/lib/family";
import { useCart } from "@/lib/commerce";
import { useTheme } from "@/components/theme-provider";
import { LOCATIONS } from "@/data/registration";
import { signOutUser, useSession } from "@/lib/auth-client";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { SITE } from "@/lib/site-settings";

const LOGO_URL = "https://shipper-api-production-3b99.up.railway.app/api/v1/upload/cmvb1ylb10bico40si9te1zf3/stream";

export function Wordmark({ className = "h-11" }: { className?: string }) {
  return <img src={LOGO_URL} alt="TOP Sports" className={`${className} w-auto object-contain`} />;
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark" || (theme === "system" && typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label="Toggle theme"
      className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-foreground/80 transition-all duration-200 hover:bg-accent hover:text-accent-foreground"
    >
      {isDark ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
      )}
    </button>
  );
}

export function Header() {
  const { itemCount } = useCart();
  const { data: session } = useSession();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAdminPath = pathname.startsWith("/admin");
  const isStaff = useQuery(api.registrationOps.amIStaff, session ? {} : "skip") === true;
  const isAdmin = isAdminPath || isStaff;
  const signedIn = !!session && !isAdmin;
  const showFamily = !isAdmin;
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);
  const [bannerOpen, setBannerOpen] = useState(false);
  const [bannerHidden, setBannerHidden] = useState(() => {
    try { return typeof window !== "undefined" && sessionStorage.getItem("top_banner_hidden") === SITE.announcement; } catch { return false; }
  });
  const navigate = useNavigate();
  // Staff who sign in through the family pages go straight to the Staff Dashboard.
  useEffect(() => {
    if (isStaff && (pathname === "/account" || pathname === "/dashboard")) void navigate({ to: "/admin" });
  }, [isStaff, pathname, navigate]);
  const logOut = async () => {
    await signOutUser();
    clearFamily();
    setOpen(false);
    void navigate({ to: isAdmin ? "/admin" : "/" });
  };
  const isSuper = useQuery(api.siteAdmin.amISuperAdmin, session && isAdmin ? {} : "skip");
  const staffSignedIn = !!session && isStaff;
  const linkCls = "rounded-full px-3.5 py-2 text-sm font-semibold text-foreground/75 transition-colors hover:bg-accent hover:text-accent-foreground";
  const activeCls = { className: "bg-accent text-accent-foreground" };
  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/85 backdrop-blur-xl">
      {SITE.announcementOn && SITE.announcement.trim() && !isAdmin && !bannerHidden && (
        <div className="flex items-center gap-2 bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground sm:text-sm">
          <button type="button" onClick={() => setBannerOpen((o) => !o)} aria-expanded={bannerOpen} className={`min-w-0 flex-1 cursor-pointer text-center ${bannerOpen ? "" : "truncate"}`}>
            {SITE.announcement}
          </button>
          <button type="button" aria-label="Dismiss announcement" onClick={() => { setBannerHidden(true); try { sessionStorage.setItem("top_banner_hidden", SITE.announcement); } catch { /* ignore */ } }} className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full hover:bg-primary-foreground/15">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
      )}
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link to="/" className="shrink-0" aria-label="TOP Sports Registration home">
          <Wordmark />
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {LOCATIONS.map((l) => (
            <Link key={l.slug} to="/$location" params={{ location: l.slug }} className={linkCls} activeProps={activeCls}>
              {l.name}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1">
          {!isAdmin && (
            <Link to="/faq" className={`${linkCls} hidden lg:inline-flex`} activeProps={activeCls}>
              FAQ
            </Link>
          )}
          {staffSignedIn && (
            <Link to="/admin/faq" className={`${linkCls} hidden lg:inline-flex`} activeProps={activeCls}>
              Staff FAQ
            </Link>
          )}
          {staffSignedIn && (
            <Link to="/admin" className={`${linkCls} hidden sm:inline-flex`} activeProps={activeCls} activeOptions={{ exact: true }}>
              Admin
            </Link>
          )}
          {isSuper && (
            <Link to="/admin/settings" className={`${linkCls} hidden sm:inline-flex`} activeProps={activeCls}>
              Settings
            </Link>
          )}
          {signedIn && (
            <Link to="/dashboard" className={`${linkCls} hidden sm:inline-flex`} activeProps={activeCls}>
              My Programs
            </Link>
          )}
          {showFamily && session && (
            <Link to="/account" className={`${linkCls} hidden sm:inline-flex`} activeProps={activeCls}>
              My Family
            </Link>
          )}
          {session ? (
            <button type="button" onClick={() => void logOut()} className={`${linkCls} hidden cursor-pointer sm:inline-flex`}>
              Log Out
            </button>
          ) : (
            <Link to={isAdmin ? "/admin" : "/account"} hash={isAdmin ? undefined : "signin"} className={`${linkCls} hidden sm:inline-flex`}>
              Log In
            </Link>
          )}
          {!isAdmin && <Link
            to="/cart"
            aria-label={`Cart, ${itemCount} registrations`}
            className="relative inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-all duration-200 hover:scale-[1.03] hover:bg-primary/90"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M2.5 3.5h2.6l2.4 11.2a1.6 1.6 0 0 0 1.6 1.3h8.7a1.6 1.6 0 0 0 1.6-1.2l1.6-6.8H6.2" /></svg>
            <span className="hidden sm:inline">Cart</span>
            <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-secondary px-1.5 text-xs font-bold text-secondary-foreground">{itemCount}</span>
          </Link>}
          <button
            type="button"
            className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full hover:bg-accent md:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">{open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}</svg>
          </button>
        </div>
      </div>
      {open && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[70] md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="absolute inset-0 cursor-default bg-black/40" />
          <div className="absolute inset-y-0 right-0 flex w-[85%] max-w-sm flex-col overflow-y-auto bg-background shadow-2xl pb-[env(safe-area-inset-bottom)]">
            <div className="flex h-16 items-center justify-between border-b border-border px-4">
              <Wordmark className="h-9" />
              <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full hover:bg-accent">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            <div className="space-y-6 p-4">
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Locations</p>
                <div className="space-y-2">
                  {LOCATIONS.map((l) => (
                    <Link key={l.slug} to="/$location" params={{ location: l.slug }} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl border border-border bg-card p-2 pr-3.5 hover:bg-accent">
                      <img src={l.image} alt="" loading="lazy" decoding="async" className="h-11 w-14 shrink-0 rounded-lg object-cover" />
                      <span className="flex-1 font-semibold">{l.name}</span>
                      <span aria-hidden className="text-muted-foreground">›</span>
                    </Link>
                  ))}
                </div>
              </div>
              {showFamily && (
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">My Account</p>
                  <div className="divide-y divide-border rounded-xl border border-border bg-card">
                    {signedIn && <Link to="/account" onClick={() => setOpen(false)} className="block px-4 py-3 font-semibold hover:bg-accent">My Family</Link>}
                    {signedIn && <Link to="/dashboard" onClick={() => setOpen(false)} className="block px-4 py-3 font-semibold hover:bg-accent">My Programs</Link>}
                    <Link to="/cart" onClick={() => setOpen(false)} className="block px-4 py-3 font-semibold hover:bg-accent">Cart ({itemCount})</Link>
                  </div>
                </div>
              )}
              {staffSignedIn && (
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Staff</p>
                  <div className="divide-y divide-border rounded-xl border border-border bg-card">
                    <Link to="/admin" onClick={() => setOpen(false)} className="block px-4 py-3 font-semibold hover:bg-accent">Admin</Link>
                    {isSuper && <Link to="/admin/settings" onClick={() => setOpen(false)} className="block px-4 py-3 font-semibold hover:bg-accent">Settings</Link>}
                    <Link to="/admin/faq" onClick={() => setOpen(false)} className="block px-4 py-3 font-semibold hover:bg-accent">Staff FAQ</Link>
                  </div>
                </div>
              )}
              <div className="divide-y divide-border rounded-xl border border-border bg-card">
                {!isAdmin && <Link to="/faq" onClick={() => setOpen(false)} className="block px-4 py-3 font-semibold hover:bg-accent">FAQ</Link>}
                {isSuper && !staffSignedIn && <Link to="/admin/settings" onClick={() => setOpen(false)} className="block px-4 py-3 font-semibold hover:bg-accent">Settings</Link>}
                {session ? (
                  <button type="button" onClick={() => void logOut()} className="block w-full cursor-pointer px-4 py-3 text-left font-semibold text-destructive hover:bg-accent">Log Out</button>
                ) : (
                  <Link to={isAdmin ? "/admin" : "/account"} hash={isAdmin ? undefined : "signin"} onClick={() => setOpen(false)} className="block px-4 py-3 font-semibold hover:bg-accent">Log In</Link>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </header>
  );
}

export function Footer() {
  const { data: session } = useSession();
  const isStaff = useQuery(api.registrationOps.amIStaff, session ? {} : "skip") === true;
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-4 py-14 sm:px-6 md:grid-cols-4 lg:px-8">
        <div className="col-span-2">
          <Wordmark className="h-14 -ml-2" />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
            {SITE.footerBlurb}
          </p>
          <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-1.5 text-xs text-muted-foreground">
            Payments secured by
            <img src="/brand-logo.svg" alt="Stripe" className="h-4 w-4 dark:invert" />
            <span className="font-semibold text-foreground">Stripe</span>
          </div>
        </div>
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider">Locations</h4>
          <ul className="mt-4 space-y-2.5 text-sm">
            {LOCATIONS.map((l) => (
              <li key={l.slug}>
                <Link to="/$location" params={{ location: l.slug }} className="text-muted-foreground transition-colors hover:text-foreground">
                  {l.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider">{isStaff ? "Staff" : "Families"}</h4>
          {isStaff ? (
            <ul className="mt-4 space-y-2.5 text-sm">
              <li><Link to="/admin" className="text-muted-foreground hover:text-foreground">Staff Dashboard</Link></li>
              <li><Link to="/admin/faq" className="text-muted-foreground hover:text-foreground">Staff FAQ</Link></li>
              <li><Link to="/faq" className="text-muted-foreground hover:text-foreground">Parent FAQ</Link></li>
            </ul>
          ) : (
          <ul className="mt-4 space-y-2.5 text-sm">
            {session && <li><Link to="/dashboard" className="text-muted-foreground hover:text-foreground">My Programs</Link></li>}
            <li><Link to="/account" className="text-muted-foreground hover:text-foreground">Family Account</Link></li>
            <li><Link to="/cart" className="text-muted-foreground hover:text-foreground">Cart</Link></li>
            <li><Link to="/faq" className="text-muted-foreground hover:text-foreground">FAQ</Link></li>
          </ul>
          )}
        </div>
      </div>
      <div className="border-t border-border py-5 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} {SITE.orgName}
        {SITE.supportEmail && (
          <> · <a href={`mailto:${SITE.supportEmail}`} className="hover:text-foreground">{SITE.supportEmail}</a></>
        )}
        {SITE.supportPhone && <> · {SITE.supportPhone}</>}
      </div>
    </footer>
  );
}
