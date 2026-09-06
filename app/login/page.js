"use client";
export const dynamic = "force-dynamic";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import { COLORS, Btn, Field, inputStyle } from "../../lib/ui";

// Teachers don't need a real, deliverable email — Supabase's password auth
// just needs something shaped like one. So a plain username (no "@") gets a
// fixed fake domain appended before we ever talk to Supabase; typing a real
// email (with "@") — e.g. the studio owner's own login — passes through
// unchanged. This keeps both login styles working on the same form.
const TEACHER_LOGIN_DOMAIN = "teacherlogin.local";
function resolveIdentifier(raw) {
  const trimmed = raw.trim();
  return trimmed.includes("@") ? trimmed : `${trimmed.toLowerCase()}@${TEACHER_LOGIN_DOMAIN}`;
}

export default function Login() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const email = resolveIdentifier(identifier);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).single();
    if (profile?.role === "admin") router.replace("/admin");
    else if (profile?.role === "teacher" || profile?.role === "staff") router.replace("/teacher");
    else { setError("No role assigned to this account yet — ask the studio admin to set one up."); setLoading(false); }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 360 }}>
        <div style={{ fontFamily: "Fraunces, Georgia, serif", fontWeight: 700, fontSize: 24, marginBottom: 4, color: COLORS.ink }}>Play Studio Manager</div>
        <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 20 }}>Sign in to continue</div>
        <form onSubmit={submit}>
          <Field label="Username or email">
            <input type="text" required value={identifier} onChange={(e) => setIdentifier(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Password">
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
          </Field>
          {error && <div style={{ fontSize: 13, color: COLORS.danger, marginBottom: 12 }}>{error}</div>}
          <Btn type="submit" variant="owner" disabled={loading} style={{ width: "100%" }}>{loading ? "Signing in…" : "Sign in"}</Btn>
        </form>
      </div>
    </div>
  );
}
