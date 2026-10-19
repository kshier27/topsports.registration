import { useState } from "react";
import { requestPasswordReset, signInWithEmail, signUpWithEmail } from "@/lib/auth-client";
import { useFamily } from "@/lib/family";
import { HEARD_ABOUT } from "@/data/registration";

const inputCls = "mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";
const labelCls = "block text-xs font-semibold text-muted-foreground";

export function FamilySignIn({ title = "Sign in to your family account", note }: { title?: string; note?: string }) {
  const [mode, setMode] = useState<"in" | "up" | "forgot">(() => (typeof window !== "undefined" && window.location.hash === "#signin" ? "in" : "up"));
  const [resetSent, setResetSent] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [heard, setHeard] = useState("");
  const family = useFamily();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === "up" && !heard) {
      setError("Please tell us how you heard about us.");
      return;
    }
    if (mode === "forgot") {
      setLoading(true);
      const fr = await requestPasswordReset(email);
      setLoading(false);
      if (fr.success) setResetSent(true);
      else setError("We couldn't send the reset email right now. Please try again in a moment.");
      return;
    }
    setLoading(true);
    const r = mode === "in" ? await signInWithEmail(email, password) : await signUpWithEmail(email, password, name);
    setLoading(false);
    if (!r.success) setError(r.error?.message ?? "Something went wrong. Please try again.");
    else if (mode === "up") family.setHeardAbout(heard);
  };

  if (mode === "forgot") {
    return (
      <form onSubmit={submit} className="space-y-3">
        <p className="font-bold">Forgot Password</p>
        {resetSent ? (
          <p className="rounded-lg bg-accent px-3.5 py-3 text-sm text-accent-foreground">If an account exists for {email}, we've emailed a link to reset your password. The link expires in 1 hour.</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">Enter your account email and we'll send you a reset link.</p>
            {error && <p className="rounded-lg bg-destructive/10 px-3.5 py-2 text-sm text-destructive">{error}</p>}
            <label className={labelCls}>Email<input required type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(null); }} className={inputCls} /></label>
            <button disabled={loading} className="w-full cursor-pointer rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">{loading ? "Please Wait..." : "Send Reset Link"}</button>
          </>
        )}
        <button type="button" onClick={() => { setMode("in"); setResetSent(false); setError(null); }} className="w-full cursor-pointer text-sm text-muted-foreground hover:text-foreground">Back to Sign In</button>
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="font-bold">{mode === "in" ? title : "Create Your Family Account"}</p>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
      {error && <p className="rounded-lg bg-destructive/10 px-3.5 py-2 text-sm text-destructive">{error}</p>}
      {mode === "up" && (
        <label className={labelCls}>Parent / guardian name<input required autoComplete="name" value={name} onChange={(e) => { setName(e.target.value); setError(null); }} className={inputCls} /></label>
      )}
      <label className={labelCls}>Email<input required type="email" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(null); }} className={inputCls} /></label>
      <label className={labelCls}>Password<input required type="password" autoComplete={mode === "in" ? "current-password" : "new-password"} minLength={8} value={password} onChange={(e) => { setPassword(e.target.value); setError(null); }} className={inputCls} /></label>
      {mode === "up" && (
        <label className={labelCls}>How did you hear about us?
          <select required value={heard} onChange={(e) => { setHeard(e.target.value); setError(null); }} className={inputCls}>
            <option value="">Select one</option>
            {HEARD_ABOUT.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </label>
      )}
      <button disabled={loading} className="w-full cursor-pointer rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-60">
        {loading ? "Please wait..." : mode === "in" ? "Sign in" : "Create account"}
      </button>
      {mode === "in" && (
        <button type="button" onClick={() => { setMode("forgot"); setError(null); }} className="w-full cursor-pointer text-sm font-semibold text-primary hover:underline">Forgot Password?</button>
      )}
      <button type="button" onClick={() => { setMode(mode === "in" ? "up" : "in"); setError(null); }} className="w-full cursor-pointer text-sm text-muted-foreground hover:text-foreground">
        {mode === "in" ? "New to TOP Sports? Create an account" : "Already have an account? Sign in"}
      </button>
    </form>
  );
}
