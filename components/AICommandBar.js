import { useState } from "react";
import { SectionCard, Button, inputCls, todayISO } from "./ui";

export default function AICommandBar({ students, appointments, invoices, onApply }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState([]);

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
        students: students.map((s) => ({ name: s.name, rate: s.rate })),
        upcomingAppointments: appointments
          .filter((a) => a.date >= todayISO())
          .map((a) => ({ student: nameOf(a.student_id), date: a.date, time: a.time, status: a.status })),
        unpaidInvoices: invoices
          .filter((i) => i.status === "unpaid")
          .map((i) => ({ number: i.number, student: nameOf(i.student_id), amount: i.total })),
      };
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context, instruction }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await onApply(data.actions || []);
      setLog((l) => [{ you: instruction, reply: data.reply || "Done.", ok: true }, ...l].slice(0, 8));
    } catch (err) {
      setLog((l) => [{ you: instruction, reply: "Couldn't process that — try rephrasing.", ok: false }, ...l].slice(0, 8));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard title="Tell it what to do">
      <form onSubmit={run} className="flex gap-2">
        <input
          className={inputCls + " flex-1"}
          placeholder='e.g. "Add a lesson with Amy tomorrow 4pm at Play Studio, RM120"'
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
        />
        <Button type="submit" disabled={busy}>{busy ? "Working…" : "Run"}</Button>
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
