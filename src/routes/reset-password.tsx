import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { resetPassword } from "@/lib/auth-client";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (s: Record<string, unknown>) => ({
    token: typeof s.token === "string" ? s.token : undefined,
    error: typeof s.error === "string" ? s.error : undefined,
  }),
  component: ResetPasswordPage,
});

const inputCls = "mt-1.5 h-11 w-full rounded-lg border border-input bg-background px-3.5 text-base text-foreground outline-none focus:ring-2 focus:ring-ring";

function ResetPasswordPage() {
  const { token, error: linkError } = Route.useSearch();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pw.length < 8) return setError("Password must be at least 8 characters.");
    if (pw !== pw2) return setError("Passwords don't match.");
    if (!token) return;
    setLoading(true);
    const r = await resetPassword(token, pw);
    setLoading(false);
    if (r.success) setDone(true);
    else setError("This reset link is invalid, expired or has already been used. Request a new one from the sign-in screen.");
  };

  const bad = !token || !!linkError;

  return (
    <main className="bg-background px-4 py-14">
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <h1 className="display-condensed text-4xl font-black italic md:text-5xl">Reset Your Password</h1>
        {done ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">Your password has been updated. You can now sign in with your new password.</p>
            <Link to="/account" className="inline-flex w-full justify-center rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground">Sign In</Link>
          </div>
        ) : bad ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">This reset link is missing, invalid or has expired (links last 1 hour). Request a new link with Forgot Password on the sign-in screen.</p>
            <Link to="/account" className="inline-flex w-full justify-center rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground">Back to Sign In</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-4">
            {error && <p className="rounded-lg bg-destructive/10 px-3.5 py-2 text-sm text-destructive">{error}</p>}
            <label className="block text-xs font-semibold text-muted-foreground">New Password<input type="password" required minLength={8} value={pw} onChange={(e) => { setPw(e.target.value); setError(null); }} className={inputCls} /></label>
            <label className="block text-xs font-semibold text-muted-foreground">Confirm New Password<input type="password" required minLength={8} value={pw2} onChange={(e) => { setPw2(e.target.value); setError(null); }} className={inputCls} /></label>
            <button disabled={loading} className="w-full cursor-pointer rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60">{loading ? "Please Wait..." : "Set New Password"}</button>
          </form>
        )}
      </div>
    </main>
  );
}
