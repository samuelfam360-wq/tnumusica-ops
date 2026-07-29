import { useState } from "react";
import { SectionCard, Button, Field, inputCls, LOCATIONS, todayISO, money, StatusPill } from "./ui";

export default function CalendarTab({ appointments, students, studentMap, services, onAdd, onSetStatus, onRemove }) {
  const [form, setForm] = useState({
    studentId: students[0]?.id || "",
    date: todayISO(),
    time: "15:00",
    serviceId: "",
    duration: 60,
    location: LOCATIONS[0],
    rate: "",
    repeatWeeks: 1,
  });

  function pickService(serviceId) {
    const svc = services.find((s) => s.id === serviceId);
    setForm({
      ...form,
      serviceId,
      duration: svc ? svc.duration : form.duration,
      rate: svc ? String(svc.rate) : form.rate,
    });
  }

  const sorted = [...appointments].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const grouped = sorted.reduce((acc, a) => {
    (acc[a.date] = acc[a.date] || []).push(a);
    return acc;
  }, {});

  function submit(e) {
    e.preventDefault();
    if (!form.studentId) return;
    const student = studentMap[form.studentId];
    const svc = services.find((s) => s.id === form.serviceId);
    const base = {
      student_id: form.studentId,
      time: form.time,
      duration: Number(form.duration) || 60,
      location: form.location,
      rate: form.rate === "" ? student?.rate || 0 : Number(form.rate),
      service_id: svc ? svc.id : null,
      service_code: svc ? svc.code : null,
      status: "scheduled",
      invoiced: false,
    };
    const weeks = Math.max(1, Number(form.repeatWeeks) || 1);
    const startDate = new Date(form.date + "T00:00:00");
    const rows = Array.from({ length: weeks }, (_, i) => {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i * 7);
      return { ...base, date: d.toISOString().slice(0, 10) };
    });
    onAdd(weeks === 1 ? rows[0] : rows);
    setForm({ ...form, rate: "" });
  }

  return (
    <div className="space-y-4">
      <SectionCard title="Add appointment">
        {students.length === 0 ? (
          <p className="text-sm text-[#8A8272]">Add a student first, on the Students tab.</p>
        ) : (
          <form onSubmit={submit} className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Field label="Student">
              <select className={inputCls} value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })}>
                {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Date">
              <input type="date" className={inputCls} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </Field>
            <Field label="Time">
              <input type="time" className={inputCls} value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
            </Field>
            {services.length > 0 && (
              <Field label="Service / grade code">
                <select className={inputCls} value={form.serviceId} onChange={(e) => pickService(e.target.value)}>
                  <option value="">Custom (set duration/rate manually)</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>{s.code} — {s.label} ({s.duration} min)</option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Duration (min)">
              <input type="number" className={inputCls} value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value, serviceId: "" })} />
            </Field>
            <Field label="Location">
              <select className={inputCls} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}>
                {LOCATIONS.map((l) => <option key={l}>{l}</option>)}
              </select>
            </Field>
            <Field label="Rate (RM, optional)">
              <input
                type="number"
                placeholder={studentMap[form.studentId]?.rate ? String(studentMap[form.studentId].rate) : "0"}
                className={inputCls}
                value={form.rate}
                onChange={(e) => setForm({ ...form, rate: e.target.value })}
              />
            </Field>
            <Field label="Repeat weekly, for how many weeks">
              <input
                type="number"
                min="1"
                max="52"
                className={inputCls}
                value={form.repeatWeeks}
                onChange={(e) => setForm({ ...form, repeatWeeks: e.target.value })}
              />
            </Field>
            <div className="col-span-2 sm:col-span-3">
              <Button type="submit">Add to calendar</Button>
            </div>
          </form>
        )}
      </SectionCard>

      <SectionCard title="Agenda">
        {sorted.length === 0 ? (
          <p className="text-sm text-[#8A8272]">No appointments yet. Add one above.</p>
        ) : (
          <div className="space-y-5">
            {Object.keys(grouped).sort().map((date) => (
              <div key={date}>
                <div className="text-xs uppercase tracking-wide text-[#8A8272] mb-2">
                  {new Date(date + "T00:00:00").toLocaleDateString("en-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </div>
                <div className="space-y-2">
                  {grouped[date].map((a) => (
                    <div key={a.id} className="flex items-center justify-between border border-[#EDE7DB] rounded-md px-3 py-2">
                      <div className="flex items-center gap-3">
                        <span style={{ fontFamily: "'IBM Plex Mono', monospace" }} className="text-sm w-14">{a.time}</span>
                        <div>
                          <div className="text-sm font-medium">{studentMap[a.student_id]?.name || "Unknown student"}</div>
                          <div className="text-xs text-[#8A8272]">
                            {a.service_code ? `(${a.service_code}) ` : ""}{a.duration} min · {a.location} · {money(a.rate)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusPill status={a.status} />
                        {a.status !== "completed" && (
                          <button onClick={() => onSetStatus(a.id, "completed")} className="text-xs text-[#7A8B6F] hover:underline">Mark done</button>
                        )}
                        {a.status !== "cancelled" && a.status !== "completed" && (
                          <button onClick={() => onSetStatus(a.id, "cancelled")} className="text-xs text-[#6B2C3E] hover:underline">Cancel</button>
                        )}
                        <button onClick={() => onRemove(a.id)} className="text-xs text-[#8A8272] hover:underline">Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
