import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import { Button, inputCls } from "./ui";

export default function Auth() {
  const [mode, setMode] = useState("signin"); // signin | reset | resetSent | magic | magicSent | updatePassword
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // A password-reset link lands the user back here signed into a special
  // "recovery" session — catch that and show the set-password form instead
  // of the normal login screen.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setMode("updatePassword");
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signIn(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(error.message);
  }

  async function requestReset(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
    });
    setBusy(false);
    if (error) setError(error.message);
    else setMode("resetSent");
  }

  async function sendMagicLink(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setMode("magicSent");
  }

  async function updatePassword(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setBusy(false);
    if (error) setError(error.message);
    // On success the app's own auth listener picks up the now-active session automatically.
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAF7F0] px-4">
      <div className="max-w-sm w-full bg-white border border-[#E7E0D2] rounded-lg p-6">
        <div className="flex items-center gap-2 mb-6">
          <img src="/logo.png" alt="T'numusica" className="h-12 w-auto" />
        </div>

        {mode === "signin" && (
          <form onSubmit={signIn} className="space-y-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[#5C564A] text-xs uppercase tracking-wide">Email</span>
              <input type="email" required className={inputCls} placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[#5C564A] text-xs uppercase tracking-wide">Password</span>
              <input type="password" required className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            {error && <div className="text-xs text-[#6B2C3E]">{error}</div>}
            <Button type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
            <div className="space-y-1 pt-1">
              <button type="button" onClick={() => { setMode("reset"); setError(""); }} className="text-xs text-[#8A8272] hover:underline block">
                First time here, or forgot your password?
              </button>
              <button type="button" onClick={() => { setMode("magic"); setError(""); }} className="text-xs text-[#8A8272] hover:underline block">
                Email me a one-time sign-in link instead
              </button>
            </div>
            <p className="text-xs text-[#8A8272] pt-1">
              Only email addresses added by the studio owner can access data once signed in.
            </p>
          </form>
        )}

        {mode === "reset" && (
          <form onSubmit={requestReset} className="space-y-3">
            <p className="text-sm text-[#5C564A]">We'll email you a link to set (or reset) your password. You'll only need to do this once — after that, just sign in directly with email and password.</p>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[#5C564A] text-xs uppercase tracking-wide">Email</span>
              <input type="email" required className={inputCls} placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            {error && <div className="text-xs text-[#6B2C3E]">{error}</div>}
            <Button type="submit" disabled={busy}>{busy ? "Sending…" : "Send password link"}</Button>
            <button type="button" onClick={() => { setMode("signin"); setError(""); }} className="text-xs text-[#8A8272] hover:underline block">
              Back to sign in
            </button>
          </form>
        )}

        {mode === "resetSent" && (
          <div className="text-sm text-[#5C564A] space-y-2">
            <p>Check <span className="font-medium">{email}</span> for a link to set your password.</p>
            <p className="text-xs text-[#8A8272]">
              If this email has never signed in before, the link may not arrive — in that case use "Email me a one-time sign-in link instead" below first, and set a password afterward.
            </p>
            <button type="button" onClick={() => { setMode("signin"); setError(""); }} className="text-xs text-[#8A8272] hover:underline block">
              Back to sign in
            </button>
          </div>
        )}

        {mode === "magic" && (
          <form onSubmit={sendMagicLink} className="space-y-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[#5C564A] text-xs uppercase tracking-wide">Email</span>
              <input type="email" required className={inputCls} placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            {error && <div className="text-xs text-[#6B2C3E]">{error}</div>}
            <Button type="submit" disabled={busy}>{busy ? "Sending…" : "Send sign-in link"}</Button>
            <button type="button" onClick={() => { setMode("signin"); setError(""); }} className="text-xs text-[#8A8272] hover:underline block">
              Back to sign in
            </button>
          </form>
        )}

        {mode === "magicSent" && (
          <div className="text-sm text-[#5C564A]">
            Check <span className="font-medium">{email}</span> for a sign-in link. You can close this tab.
          </div>
        )}

        {mode === "updatePassword" && (
          <form onSubmit={updatePassword} className="space-y-3">
            <p className="text-sm text-[#5C564A]">Set your password. You'll use this to sign in from now on.</p>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[#5C564A] text-xs uppercase tracking-wide">New password</span>
              <input type="password" required minLength={6} className={inputCls} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </label>
            {error && <div className="text-xs text-[#6B2C3E]">{error}</div>}
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save password"}</Button>
          </form>
        )}
      </div>
    </div>
  );
}
