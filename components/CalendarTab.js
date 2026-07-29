import { useState, useMemo } from "react";
import { SectionCard, Button, Field, inputCls, LOCATIONS, todayISO, money, StatusPill } from "./ui";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toISO(d) {
  return d.toISOString().slice(0, 10);
}

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

  const [viewMonth, setViewMonth] = useState(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(todayISO());

  function pickService(serviceId) {
    const svc = services.find((s) => s.id === serviceId);
    setForm({
      ...form,
      serviceId,
      duration: svc ? svc.duration : form.duration,
      rate: svc ? String(svc.rate) : form.rate,
    });
  }

  const countsByDate = useMemo(() => {
    const map = {};
    appointments.forEach((a) => {
      map[a.date] = (map[a.date] || 0) + 1;
    });
    return map;
  }, [appointments]);

  const scheduleForSelected = useMemo(() => {
    return appointments
      .filter((a) => a.date === selectedDate)
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [appointments, selectedDate]);

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
      return { ...base, date: toISO(d) };
    });
    onAdd(weeks === 1 ? rows[0] : rows);
    setForm({ ...form, rate: "" });
    setSelectedDate(form.date);
  }

  // ---- Month grid construction ----
  const firstOfMonth = viewMonth;
  const monthLabel = firstOfMonth.toLocaleDateString("en-MY", { month: "long", year: "numeric" });
  const startWeekday = firstOfMonth.getDay(); // 0 = Sun
  const daysInMonth = new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth() + 1, 0).getDate();

  const gridCells = [];
  for (let i = 0; i < startWeekday; i++) gridCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    gridCells.push(new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth(), d));
  }
  while (gridCells.length % 7 !== 0) gridCells.push(null);

  function goMonth(delta) {
    setViewMonth(new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth() + delta, 1));
  }

  return (
    <div className="space-y-4">
      <SectionCard title="Add to schedule">
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
              <Button type="submit">Add to schedule</Button>
            </div>
          </form>
        )}
      </SectionCard>

      <SectionCard
        title={monthLabel}
        action={
          <div className="flex items-center gap-2">
            <button onClick={() => goMonth(-1)} className="text-sm px-2 py-1 border border-[#D8D0BE] rounded hover:bg-[#F3EEE2]">‹</button>
            <button
              onClick={() => { const t = new Date(); setViewMonth(new Date(t.getFullYear(), t.getMonth(), 1)); setSelectedDate(todayISO()); }}
              className="text-xs px-2 py-1 border border-[#D8D0BE] rounded hover:bg-[#F3EEE2]"
            >
              Today
            </button>
            <button onClick={() => goMonth(1)} className="text-sm px-2 py-1 border border-[#D8D0BE] rounded hover:bg-[#F3EEE2]">›</button>
          </div>
        }
      >
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] uppercase text-[#8A8272] mb-1">
          {WEEKDAY_LABELS.map((w) => <div key={w} className="py-1">{w}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {gridCells.map((d, i) => {
            if (!d) return <div key={i} className="aspect-square" />;
            const iso = toISO(d);
            const count = countsByDate[iso] || 0;
            const isToday = iso === todayISO();
            const isSelected = iso === selectedDate;
            return (
              <button
                key={i}
                onClick={() => setSelectedDate(iso)}
                className={[
                  "aspect-square rounded-md flex flex-col items-center justify-center text-sm relative transition-colors",
                  isSelected ? "bg-[#1C1B1A] text-[#FAF7F0]" : isToday ? "bg-[#F3EEE2] border border-[#B8935F]" : "hover:bg-[#F3EEE2]",
                ].join(" ")}
              >
                <span>{d.getDate()}</span>
                {count > 0 && (
                  <span
                    className="absolute bottom-1 w-1.5 h-1.5 rounded-full"
                    style={{ background: "#B8935F" }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title={`Schedule — ${new Date(selectedDate + "T00:00:00").toLocaleDateString("en-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`}>
        {scheduleForSelected.length === 0 ? (
          <p className="text-sm text-[#8A8272]">Nothing scheduled this day.</p>
        ) : (
          <div className="space-y-2">
            {scheduleForSelected.map((a) => (
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
        )}
      </SectionCard>
    </div>
  );
}
