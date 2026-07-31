import { useState } from "react";
import { SectionCard, Button, inputCls, todayISO } from "./ui";
import { supabase } from "../lib/supabaseClient";

export default function AICommandBar({ students, appointments, invoices, services = [], materials = [], expenses = [], unavailableDates = [], onApply }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState([]); // display log: {you, reply, ok}
  const [history, setHistory] = useState([]); // raw {role, content} turns sent back to the model

  function nameOf(studentId) {
    return students.find((s) => s.id === studentId)?.name || "Unknown";
  }

  async function run(e) {
    e.preventDefault();
    const instruction = text.trim();
    if (!instruction || busy) return;
    setBusy(true);
    setText("");
    try {
      const context = {
        today: todayISO(),
        students: students.map((s) => ({
          name: s.name, rate: s.rate, age: s.age, grade: s.grade, course: s.course,
          centre: s.centre, lessonDay: s.lesson_day, lessonTime: s.lesson_time,
        })),
        rateCodes: services.map((sv) => ({ code: sv.code, label: sv.label, duration: sv.duration, rate: sv.rate })),
        upcomingAppointments: appointments
          .filter((a) => a.date >= todayISO() && a.status !== "cancelled" && a.status !== "rescheduled")
          .map((a) => ({ student: nameOf(a.student_id), date: a.date, time: a.time, duration: a.duration, status: a.status })),
        unpaidInvoices: invoices
          .filter((i) => i.status === "unpaid")
          .map((i) => ({ number: i.number, student: nameOf(i.student_id), billedTo: i.billed_to, amount: i.total })),
        materials: materials.map((m) => ({ name: m.name })),
        recentExpenses: expenses
          .slice()
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, 10)
          .map((e) => ({ date: e.date, amount: e.amount, description: e.description, category: e.category })),
        upcomingUnavailableDates: unavailableDates
          .filter((u) => u.date >= todayISO())
          .map((u) => ({ date: u.date, reason: u.reason, type: u.reason_type })),
      };
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ context, instruction, history }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await onApply(data.actions || []);
      setHistory((h) => [
        ...h,
        { role: "user", content: `Current data: ${JSON.stringify(context)}\n\nInstruction: ${instruction}` },
        { role: "assistant", content: JSON.stringify(data) },
      ].slice(-12));
      setLog((l) => [{ you: instruction, reply: data.reply || "Done.", ok: true }, ...l].slice(0, 8));
    } catch (err) {
      const msg = String(err.message || err);
      let shown = `Couldn't process that (${msg}) — try rephrasing.`;
      if (msg.includes("credit balance") || msg.includes("ANTHROPIC_API_KEY")) {
        shown = "The AI features need Anthropic credit topped up — check console.anthropic.com → Plans & Billing.";
      } else if (msg.includes("Not signed in") || msg.includes("Session expired") || msg.includes("Not authorized")) {
        shown = "Please sign out and back in, then try again.";
      }
      setLog((l) => [{ you: instruction, reply: shown, ok: false }, ...l].slice(0, 8));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard
      title="Tell it what to do"
      action={
        history.length > 0 && (
          <button onClick={() => { setHistory([]); setLog([]); }} className="text-xs text-[#8A8272] hover:underline">
            New conversation
          </button>
        )
      }
    >
      <form onSubmit={run} className="flex gap-2">
        <input
          className={inputCls + " flex-1"}
          placeholder='e.g. "How many students do I have at Play Studio?" or "Move Amy to 5pm instead"'
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
        />
        <Button type="submit" disabled={busy}>{busy ? "Thinking…" : "Send"}</Button>
      </form>
      {log.length > 0 && (
        <div className="mt-4 space-y-2">
          {log.map((entry, i) => (
            <div key={i} className="text-sm border-l-2 pl-3" style={{ borderColor: entry.ok ? "#B8935F" : "#6B2C3E" }}>
              <div className="text-[#5C564A]">{entry.you}</div>
              <div className={entry.ok ? "text-[#1C1B1A]" : "text-[#6B2C3E]"}>{entry.reply}</div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
