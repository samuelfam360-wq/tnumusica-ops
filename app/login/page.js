"use client";
export const dynamic = "force-dynamic";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import { COLORS, Btn, Field, inputStyle } from "../../lib/ui";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).single();
    if (profile?.role === "admin") router.replace("/admin");
    else if (profile?.role === "teacher") router.replace("/teacher");
    else { setError("No role assigned to this account yet — ask the studio admin to set one up."); setLoading(false); }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 360 }}>
        <div style={{ fontFamily: "Fraunces, Georgia, serif", fontWeight: 700, fontSize: 24, marginBottom: 4, color: COLORS.ink }}>Play Studio Manager</div>
        <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 20 }}>Sign in to continue</div>
        <form onSubmit={submit}>
          <Field label="Email">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
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
