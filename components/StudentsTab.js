import { useState } from "react";
import {
  SectionCard, Button, Field, inputCls, timeRange, SearchBox, LOCATIONS,
  weekdayAbbrev, endTime, ClashWarning, StatusPill, money, todayISO,
} from "./ui";

export default function StudentsTab({
  students, appointments = [], services = [], onAdd, onUpdate, onRemove,
  onSetAppointmentStatus, onUpdateAppointment, onReschedule, onRemoveAppointment,
}) {
  const [form, setForm] = useState({ name: "", rate: "", age: "", grade: "", course: "", notes: "" });
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [editingApptId, setEditingApptId] = useState(null);
  const [editApptForm, setEditApptForm] = useState(null);
  const [reschedApptId, setReschedApptId] = useState(null);
  const [reschedApptForm, setReschedApptForm] = useState(null);

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
      .filter((a) => a.student_id === studentId)
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  }

  function pickApptService(serviceId, targetForm, setTargetForm) {
    const svc = services.find((s) => s.id === serviceId);
    setTargetForm({
      ...targetForm,
      serviceId,
      duration: svc ? svc.duration : targetForm.duration,
      rate: svc ? String(svc.rate) : targetForm.rate,
    });
  }

  function startApptEdit(a) {
    setEditingApptId(a.id);
    setEditApptForm({
      date: a.date, time: a.time, serviceId: a.service_id || "",
      duration: a.duration, location: a.location, rate: String(a.rate), notes: a.notes || "",
    });
  }
  function saveApptEdit(e, a) {
    e.preventDefault();
    const svc = services.find((s) => s.id === editApptForm.serviceId);
    onUpdateAppointment(a.id, {
      date: editApptForm.date,
      time: editApptForm.time,
      duration: Number(editApptForm.duration) || 60,
      location: editApptForm.location,
      rate: Number(editApptForm.rate) || 0,
      service_id: svc ? svc.id : null,
      service_code: svc ? svc.code : null,
      notes: editApptForm.notes.trim(),
    });
    setEditingApptId(null);
    setEditApptForm(null);
  }

  function startReschedule(a) {
    setReschedApptId(a.id);
    setReschedApptForm({ date: a.date, time: a.time, duration: a.duration, rate: a.rate, reason: "" });
  }
  function saveReschedule(e, a) {
    e.preventDefault();
    onReschedule(a, {
      reason: reschedApptForm.reason.trim(),
      slots: [{
        date: reschedApptForm.date,
        time: reschedApptForm.time,
        duration: Number(reschedApptForm.duration) || a.duration,
        rate: Number(reschedApptForm.rate) || a.rate,
      }],
    });
    setReschedApptId(null);
    setReschedApptForm(null);
  }

  const filtered = students.filter((s) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (s.name || "").toLowerCase().includes(q) || (s.grade || "").toLowerCase().includes(q) || (s.course || "").toLowerCase().includes(q);
  });

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

      <SectionCard
        title={`Students (${students.length})`}
        action={<SearchBox value={search} onChange={setSearch} placeholder="Search by name, grade, course…" />}
      >
        {filtered.length === 0 ? (
          <p className="text-sm text-[#8A8272]">No students match.</p>
        ) : (
          <div className="divide-y divide-[#EDE7DB]">
            {filtered.map((s) => {
              const schedule = scheduleFor(s.id);
              const upcoming = schedule.filter((a) => a.status === "scheduled" && a.date >= todayISO());
              const isOpen = expanded === s.id;
              return (
                <div key={s.id} className="py-2.5">
                  <button onClick={() => setExpanded(isOpen ? null : s.id)} className="w-full flex items-center justify-between text-left">
                    <div>
                      <div className="text-sm font-medium">
                        {s.name}
                        {s.age != null && <span className="text-[#8A8272] font-normal"> · {s.age}yo</span>}
                        {s.grade && <span className="text-[#8A8272] font-normal"> · {s.grade}</span>}
                        {s.course && <span className="text-[#8A8272] font-normal"> · {s.course}</span>}
                      </div>
                      {s.notes && <div className="text-xs text-[#8A8272]">{s.notes}</div>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-[#8A8272]">{upcoming.length} upcoming</span>
                      <span className="text-xs text-[#1C1B1A]">{isOpen ? "Close" : "Open"}</span>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="mt-3 pl-1 space-y-4">
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                        <Field label="Name">
                          <input className={inputCls} value={s.name} onChange={(e) => onUpdate(s.id, { name: e.target.value })} />
                        </Field>
                        <Field label="Age">
                          <input type="number" className={inputCls} value={s.age ?? ""} onChange={(e) => onUpdate(s.id, { age: e.target.value === "" ? null : Number(e.target.value) })} />
                        </Field>
                        <Field label="Grade">
                          <input className={inputCls} value={s.grade || ""} onChange={(e) => onUpdate(s.id, { grade: e.target.value })} />
                        </Field>
                        <Field label="Course">
                          <input className={inputCls} value={s.course || ""} onChange={(e) => onUpdate(s.id, { course: e.target.value })} />
                        </Field>
                        <Field label="Rate (RM)">
                          <input type="number" className={inputCls} value={s.rate} onChange={(e) => onUpdate(s.id, { rate: Number(e.target.value) || 0 })} />
                        </Field>
                        <div className="col-span-2 sm:col-span-5">
                          <Field label="Notes">
                            <input className={inputCls} value={s.notes || ""} onChange={(e) => onUpdate(s.id, { notes: e.target.value })} />
                          </Field>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="text-xs uppercase tracking-wide text-[#8A8272]">Lessons ({schedule.length})</div>
                        <button onClick={() => onRemove(s.id)} className="text-xs text-[#6B2C3E] hover:underline">Remove student</button>
                      </div>

                      {schedule.length === 0 ? (
                        <p className="text-xs text-[#8A8272]">No lessons on the calendar for this student yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {schedule.map((a) => {
                            if (editingApptId === a.id) {
                              return (
                                <form key={a.id} onSubmit={(e) => saveApptEdit(e, a)} className="border border-[#B8935F] rounded-md p-3 space-y-2">
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    <Field label="Date">
                                      <input type="date" className={inputCls} value={editApptForm.date} onChange={(e) => setEditApptForm({ ...editApptForm, date: e.target.value })} />
                                    </Field>
                                    <Field label={`Time (ends ${endTime(editApptForm.time, editApptForm.duration)})`}>
                                      <input type="time" className={inputCls} value={editApptForm.time} onChange={(e) => setEditApptForm({ ...editApptForm, time: e.target.value })} />
                                    </Field>
                                    {services.length > 0 && (
                                      <Field label="Service">
                                        <select className={inputCls} value={editApptForm.serviceId} onChange={(e) => pickApptService(e.target.value, editApptForm, setEditApptForm)}>
                                          <option value="">Custom</option>
                                          {services.map((sv) => <option key={sv.id} value={sv.id}>{sv.code} — {sv.label}</option>)}
                                        </select>
                                      </Field>
                                    )}
                                    <Field label="Duration (min)">
                                      <input type="number" className={inputCls} value={editApptForm.duration} onChange={(e) => setEditApptForm({ ...editApptForm, duration: e.target.value, serviceId: "" })} />
                                    </Field>
                                    <Field label="Location">
                                      <select className={inputCls} value={editApptForm.location} onChange={(e) => setEditApptForm({ ...editApptForm, location: e.target.value })}>
                                        {LOCATIONS.map((l) => <option key={l}>{l}</option>)}
                                      </select>
                                    </Field>
                                    <Field label="Rate (RM)">
                                      <input type="number" className={inputCls} value={editApptForm.rate} onChange={(e) => setEditApptForm({ ...editApptForm, rate: e.target.value })} />
                                    </Field>
                                    <Field label="Notes">
                                      <input className={inputCls} value={editApptForm.notes} onChange={(e) => setEditApptForm({ ...editApptForm, notes: e.target.value })} />
                                    </Field>
                                  </div>
                                  <ClashWarning appointments={appointments} date={editApptForm.date} time={editApptForm.time} duration={editApptForm.duration} excludeId={a.id} studentMap={{ [s.id]: s }} />
                                  <div className="flex gap-2">
                                    <Button type="submit">Save</Button>
                                    <Button type="button" variant="secondary" onClick={() => { setEditingApptId(null); setEditApptForm(null); }}>Cancel</Button>
                                  </div>
                                </form>
                              );
                            }
                            if (reschedApptId === a.id) {
                              return (
                                <form key={a.id} onSubmit={(e) => saveReschedule(e, a)} className="border border-[#8A6D3B] rounded-md p-3 space-y-2">
                                  <div className="text-sm font-medium">Reschedule this lesson</div>
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    <Field label="New date">
                                      <input type="date" className={inputCls} value={reschedApptForm.date} onChange={(e) => setReschedApptForm({ ...reschedApptForm, date: e.target.value })} />
                                    </Field>
                                    <Field label="New time">
                                      <input type="time" className={inputCls} value={reschedApptForm.time} onChange={(e) => setReschedApptForm({ ...reschedApptForm, time: e.target.value })} />
                                    </Field>
                                    <Field label="Duration (min)">
                                      <input type="number" className={inputCls} value={reschedApptForm.duration} onChange={(e) => setReschedApptForm({ ...reschedApptForm, duration: e.target.value })} />
                                    </Field>
                                    <Field label="Rate (RM)">
                                      <input type="number" className={inputCls} value={reschedApptForm.rate} onChange={(e) => setReschedApptForm({ ...reschedApptForm, rate: e.target.value })} />
                                    </Field>
                                  </div>
                                  <ClashWarning appointments={appointments} date={reschedApptForm.date} time={reschedApptForm.time} duration={reschedApptForm.duration} excludeId={a.id} studentMap={{ [s.id]: s }} />
                                  <Field label="Reason (optional)">
                                    <input className={inputCls} placeholder="e.g. Student absent" value={reschedApptForm.reason} onChange={(e) => setReschedApptForm({ ...reschedApptForm, reason: e.target.value })} />
                                  </Field>
                                  <p className="text-xs text-[#8A8272]">Need to split into two shorter makeup times? Use Reschedule from the Calendar tab instead.</p>
                                  <div className="flex gap-2">
                                    <Button type="submit">Confirm reschedule</Button>
                                    <Button type="button" variant="secondary" onClick={() => { setReschedApptId(null); setReschedApptForm(null); }}>Cancel</Button>
                                  </div>
                                </form>
                              );
                            }
                            return (
                              <div key={a.id} className="flex flex-col gap-2 border border-[#EDE7DB] rounded-md px-3 py-2">
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                  <span style={{ fontFamily: "'IBM Plex Mono', monospace" }} className="text-xs whitespace-nowrap">{weekdayAbbrev(a.date)} {a.date}</span>
                                  <span style={{ fontFamily: "'IBM Plex Mono', monospace" }} className="text-xs whitespace-nowrap">{timeRange(a.time, a.duration)}</span>
                                  <span className="text-xs text-[#8A8272]">{a.location} · {money(a.rate)}</span>
                                  {a.notes && <span className="text-xs text-[#8A8272] italic">— {a.notes}</span>}
                                </div>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                  <StatusPill status={a.status} />
                                  {a.status !== "completed" && a.status !== "rescheduled" && (
                                    <button onClick={() => onSetAppointmentStatus(a.id, "completed")} className="text-xs text-[#7A8B6F] hover:underline">Mark done</button>
                                  )}
                                  {a.status === "completed" && (
                                    <button onClick={() => onSetAppointmentStatus(a.id, "scheduled")} className="text-xs text-[#8A8272] hover:underline">Undo</button>
                                  )}
                                  {a.status !== "cancelled" && a.status !== "completed" && a.status !== "rescheduled" && (
                                    <>
                                      <button onClick={() => startReschedule(a)} className="text-xs text-[#8A6D3B] hover:underline">Reschedule</button>
                                      <button onClick={() => onSetAppointmentStatus(a.id, "cancelled")} className="text-xs text-[#6B2C3E] hover:underline">Cancel</button>
                                    </>
                                  )}
                                  <button onClick={() => startApptEdit(a)} className="text-xs text-[#1C1B1A] hover:underline">Edit</button>
                                  <button onClick={() => onRemoveAppointment(a.id)} className="text-xs text-[#8A8272] hover:underline">Remove</button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
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
