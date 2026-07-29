import { useState } from "react";
import { SectionCard, Button, Field, inputCls } from "./ui";

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function StudentsTab({ students, appointments = [], onAdd, onUpdate, onRemove }) {
  const [form, setForm] = useState({ name: "", rate: "", age: "", grade: "", course: "", notes: "" });
  const [expanded, setExpanded] = useState(null);

  function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    onAdd({
      name: form.name.trim(),
      rate: Number(form.rate) || 0,
      age: form.age === "" ? null : Number(form.age),
      grade: form.grade.trim(),
      course: form.course.trim(),
      notes: form.notes.trim(),
    });
    setForm({ name: "", rate: "", age: "", grade: "", course: "", notes: "" });
  }

  function scheduleFor(studentId) {
    return appointments
      .filter((a) => a.student_id === studentId && a.status !== "cancelled")
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  }

  return (
    <div className="space-y-4">
      <SectionCard title="Add student">
        <form onSubmit={submit} className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-end">
          <Field label="Name">
            <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Age">
            <input type="number" className={inputCls} value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} />
          </Field>
          <Field label="Grade">
            <input className={inputCls} placeholder="G2" value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} />
          </Field>
          <Field label="Course">
            <input className={inputCls} placeholder="Classical" value={form.course} onChange={(e) => setForm({ ...form, course: e.target.value })} />
          </Field>
          <Field label="Default rate (RM/lesson)">
            <input type="number" className={inputCls} value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} />
          </Field>
          <Field label="Notes">
            <input className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          <div className="col-span-2 sm:col-span-3">
            <Button type="submit">Add student</Button>
          </div>
        </form>
      </SectionCard>

      <SectionCard title={`Students (${students.length})`}>
        {students.length === 0 ? (
          <p className="text-sm text-[#8A8272]">No students yet.</p>
        ) : (
          <div className="divide-y divide-[#EDE7DB]">
            {students.map((s) => {
              const schedule = scheduleFor(s.id);
              const isOpen = expanded === s.id;
              return (
                <div key={s.id} className="py-2.5">
                  <div className="flex items-center justify-between">
                    <button onClick={() => setExpanded(isOpen ? null : s.id)} className="text-left flex-1">
                      <div className="text-sm font-medium">
                        {s.name}
                        {s.age != null && <span className="text-[#8A8272] font-normal"> · {s.age}yo</span>}
                        {s.grade && <span className="text-[#8A8272] font-normal"> · {s.grade}</span>}
                        {s.course && <span className="text-[#8A8272] font-normal"> · {s.course}</span>}
                      </div>
                      {s.notes && <div className="text-xs text-[#8A8272]">{s.notes}</div>}
                    </button>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-[#8A8272]">RM</span>
                        <input
                          type="number"
                          className={inputCls + " w-20"}
                          value={s.rate}
                          onChange={(e) => onUpdate(s.id, { rate: Number(e.target.value) || 0 })}
                        />
                      </div>
                      <button onClick={() => setExpanded(isOpen ? null : s.id)} className="text-xs text-[#1C1B1A] hover:underline">
                        {isOpen ? "Hide schedule" : "Show schedule"}
                      </button>
                      <button onClick={() => onRemove(s.id)} className="text-xs text-[#6B2C3E] hover:underline">Remove</button>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="mt-3 pl-1 space-y-3">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <Field label="Age">
                          <input type="number" className={inputCls} value={s.age ?? ""} onChange={(e) => onUpdate(s.id, { age: e.target.value === "" ? null : Number(e.target.value) })} />
                        </Field>
                        <Field label="Grade">
                          <input className={inputCls} value={s.grade || ""} onChange={(e) => onUpdate(s.id, { grade: e.target.value })} />
                        </Field>
                        <Field label="Course">
                          <input className={inputCls} value={s.course || ""} onChange={(e) => onUpdate(s.id, { course: e.target.value })} />
                        </Field>
                        <Field label="Notes">
                          <input className={inputCls} value={s.notes || ""} onChange={(e) => onUpdate(s.id, { notes: e.target.value })} />
                        </Field>
                      </div>

                      <div>
                        <div className="text-xs uppercase tracking-wide text-[#8A8272] mb-1">Lesson schedule</div>
                        {schedule.length === 0 ? (
                          <p className="text-xs text-[#8A8272]">No lessons on the calendar for this student yet.</p>
                        ) : (
                          <div className="space-y-1">
                            {schedule.map((a) => (
                              <div key={a.id} className="flex items-center gap-3 text-xs" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                                <span className="w-24">{WEEKDAY_NAMES[new Date(a.date + "T00:00:00").getDay()].slice(0, 3)} {a.date}</span>
                                <span className="w-14">{a.time}</span>
                                <span className="text-[#8A8272]">{a.duration} min · {a.location}</span>
                                {a.status === "completed" && <span className="text-[#4C5A43]">done</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
