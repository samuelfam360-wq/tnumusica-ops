"use client";
export const dynamic = "force-dynamic";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login"); return; }
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", session.user.id).single();
      if (profile?.role === "admin") router.replace("/admin");
      else if (profile?.role === "teacher") router.replace("/teacher");
      else router.replace("/login");
    })();
  }, [router]);

  return <div style={{ padding: 24, fontSize: 14, color: "#6B6862" }}>Loading…</div>;
}
