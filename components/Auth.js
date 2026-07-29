import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Button, PianoMark, inputCls } from "./ui";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function sendLink(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAF7F0] px-4">
      <div className="max-w-sm w-full bg-white border border-[#E7E0D2] rounded-lg p-6">
        <div className="flex items-center gap-2 mb-6">
          <PianoMark />
          <div>
            <div className="text-xl leading-none" style={{ fontFamily: "'Fraunces', serif", fontWeight: 600 }}>
              T'numusica
            </div>
            <div className="text-[11px] tracking-wide text-[#8A8272] uppercase mt-0.5">Operations</div>
          </div>
        </div>

        {sent ? (
          <div className="text-sm text-[#5C564A]">
            Check <span className="font-medium">{email}</span> for a sign-in link. You can close this tab.
          </div>
        ) : (
          <form onSubmit={sendLink} className="space-y-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[#5C564A] text-xs uppercase tracking-wide">Email</span>
              <input
                type="email"
                required
                className={inputCls}
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            {error && <div className="text-xs text-[#6B2C3E]">{error}</div>}
            <Button type="submit" disabled={busy}>{busy ? "Sending…" : "Send sign-in link"}</Button>
            <p className="text-xs text-[#8A8272]">
              Only email addresses added by the studio owner can access data once signed in.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
