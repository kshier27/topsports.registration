import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { signOutUser } from "@/lib/auth-client";

const DEVICE_KEY = "top-staff-device";
/** Staff Portal signs out after this long with no activity. */
export const IDLE_MINUTES = 30;

export function staffDeviceId(): string {
  if (typeof window === "undefined") return "server";
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

/** Two-step check: staff enter a code emailed to them before the portal opens. */
export function StaffTwoStep({ email, children }: { email: string; children: ReactNode }) {
  const [deviceId] = useState(staffDeviceId);
  const status = useQuery(api.staffVerify.status, { deviceId });
  const request = useMutation(api.staffVerify.requestCode);
  const verify = useMutation(api.staffVerify.verifyCode);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoSent = useRef(false);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await request({ deviceId });
      toast.success(`Code sent to ${email}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send a code");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (status && !status.verified && !status.codeSent && !autoSent.current) {
      autoSent.current = true;
      void send();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  if (status === undefined) return <div className="h-40 animate-pulse rounded-2xl bg-muted" />;
  if (status?.verified) return <>{children}</>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await verify({ deviceId, code });
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^.*?Uncaught Error: /, "").split("\n")[0] : "Wrong code");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-8">
      <h2 className="text-xl font-bold">Two-Step Sign-In</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        For security, we emailed a 6-digit code to <span className="font-semibold text-foreground">{email}</span>. Enter it below. This device stays trusted for 12 hours.
      </p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block text-xs font-semibold text-muted-foreground">Sign-In Code
          <input
            value={code}
            onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(null); }}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="••••••"
            className="mt-1.5 h-12 w-full rounded-lg border border-input bg-card px-3.5 text-center font-mono text-2xl tracking-[0.5em] text-foreground outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
        <button disabled={busy || code.length !== 6} className="h-11 w-full cursor-pointer rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40">{busy ? "Checking…" : "Verify & Open Portal"}</button>
      </form>
      <div className="mt-4 flex flex-wrap justify-between gap-2 text-sm">
        <button type="button" onClick={() => void send()} disabled={busy} className="cursor-pointer font-semibold text-primary hover:underline disabled:opacity-50">Send a new code</button>
        <button type="button" onClick={() => void signOutUser()} className="cursor-pointer font-semibold text-muted-foreground hover:text-foreground">Sign out</button>
      </div>
    </div>
  );
}

/** Signs staff out after IDLE_MINUTES with no activity, with a 60-second warning. */
export function StaffIdleTimeout() {
  const forget = useMutation(api.staffVerify.forgetDevice);
  const [warn, setWarn] = useState(false);
  const last = useRef(Date.now());

  useEffect(() => {
    const bump = () => {
      last.current = Date.now();
      setWarn(false);
    };
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"] as const;
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const t = window.setInterval(() => {
      const idle = Date.now() - last.current;
      const limit = IDLE_MINUTES * 60 * 1000;
      if (idle >= limit) {
        window.clearInterval(t);
        void (async () => {
          try { await forget({ deviceId: staffDeviceId() }); } catch { /* still sign out */ }
          await signOutUser();
          toast.message("Signed out after 30 minutes of inactivity.");
        })();
      } else if (idle >= limit - 60 * 1000) setWarn(true);
    }, 5000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      window.clearInterval(t);
    };
  }, [forget]);

  if (!warn) return null;
  return (
    <div role="alertdialog" className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl print:hidden">
      <p className="font-bold">Still there?</p>
      <p className="mt-1 text-sm text-muted-foreground">You'll be signed out in about a minute for security.</p>
      <button type="button" onClick={() => { last.current = Date.now(); setWarn(false); }} className="mt-3 h-10 cursor-pointer rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Stay Signed In</button>
    </div>
  );
}
