import { useState, useMemo, useEffect } from "react";
import {
  SectionCard, Button, Field, inputCls, LOCATIONS, todayISO, money, StatusPill,
  endTime, timeRange, SearchableSelect, WEEKDAY_LABELS, toISODate, addDays,
  weekdayAbbrev, ClashWarning, Modal,
} from "./ui";

function toISO(d) {
  return toISODate(d);
}

function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const WEEKDAY_NAME_TO_INDEX = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
const WEEKDAY_FULL_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const blankForm = (students) => ({
  studentId: students[0]?.id || "",
  date: todayISO(),
  time: "15:00",
  serviceId: "",
  duration: 60,
  location: LOCATIONS[0],
  rate: "",
  repeatWeeks: 1,
  notes: "",
});

export default function CalendarTab({ appointments, students, studentMap, services, unavailableDates, lessonPlans = [], onUpdateLessonPlanItem, onMarkUnavailable, onUnmarkUnavailable, onAdd, onUpdate, onUpdateSeries, onBulkUpdate, onReschedule, onSetStatus, onRemove }) {
  const [form, setForm] = useState(() => blankForm(students));
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [applyToSeries, setApplyToSeries] = useState(false);
  const [reschedulingId, setReschedulingId] = useState(null);
  const [reschedForm, setReschedForm] = useState(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkStudentId, setBulkStudentId] = useState(students[0]?.id || "");
  const [bulkSelected, setBulkSelected] = useState({});
  const [bulkPatch, setBulkPatch] = useState({ time: "", duration: "", location: "", rate: "", shiftDays: "", shiftToWeekday: "" });
  const [unavailReason, setUnavailReason] = useState("");
  const [unavailType, setUnavailType] = useState("personal");

  const [viewMonth, setViewMonth] = useState(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [dayModalOpen, setDayModalOpen] = useState(false);

  function pickService(serviceId, targetForm, setTargetForm) {
    const svc = services.find((s) => s.id === serviceId);
    setTargetForm({
      ...targetForm,
      serviceId,
      duration: svc ? svc.duration : targetForm.duration,
      rate: svc ? String(svc.rate) : targetForm.rate,
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

  const unavailMap = useMemo(() => {
    const map = {};
    (unavailableDates || []).forEach((u) => (map[u.date] = u));
    return map;
  }, [unavailableDates]);

  const selectedUnavail = unavailMap[selectedDate];

  useEffect(() => {
    setUnavailReason(selectedUnavail?.reason || "");
    setUnavailType("personal");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  function findRescheduledTo(id) {
    return appointments.filter((a) => a.rescheduled_from === id);
  }

  const bulkLessons = useMemo(() => {
    return appointments
      .filter((a) => a.student_id === bulkStudentId && a.status === "scheduled" && a.date >= todayISO())
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  }, [appointments, bulkStudentId]);

  useEffect(() => {
    if (!bulkOpen) return;
    const next = {};
    bulkLessons.forEach((a) => (next[a.id] = true));
    setBulkSelected(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulkOpen, bulkStudentId]);

  function openBulkFor(studentId) {
    setDayModalOpen(false);
    setBulkOpen(true);
    setBulkStudentId(studentId);
    setBulkPatch({ time: "", duration: "", location: "", rate: "", shiftDays: "", shiftToWeekday: "" });
  }
  function toggleBulkAll(checked) {
    const next = {};
    bulkLessons.forEach((a) => (next[a.id] = checked));
    setBulkSelected(next);
  }
  function submitBulk(e) {
    e.preventDefault();
    const selectedAppointments = bulkLessons.filter((a) => bulkSelected[a.id]);
    if (selectedAppointments.length === 0) return;
    const sharedPatch = {};
    if (bulkPatch.time) sharedPatch.time = bulkPatch.time;
    if (bulkPatch.duration) sharedPatch.duration = Number(bulkPatch.duration);
    if (bulkPatch.location) sharedPatch.location = bulkPatch.location;
    if (bulkPatch.rate) sharedPatch.rate = Number(bulkPatch.rate);
    const shift = bulkPatch.shiftDays !== "" ? Number(bulkPatch.shiftDays) : 0;
    const targetWeekday = bulkPatch.shiftToWeekday ? WEEKDAY_NAME_TO_INDEX[bulkPatch.shiftToWeekday] : null;
    if (Object.keys(sharedPatch).length === 0 && shift === 0 && targetWeekday === null) return;
    const updates = selectedAppointments.map((a) => {
      let newDate = a.date;
      if (targetWeekday !== null) {
        const currentDay = new Date(a.date + "T00:00:00").getDay();
        const diff = (targetWeekday - currentDay + 7) % 7;
        newDate = addDays(a.date, diff);
      } else if (shift !== 0) {
        newDate = addDays(a.date, shift);
      }
      return { id: a.id, patch: newDate !== a.date ? { ...sharedPatch, date: newDate } : sharedPatch };
    });
    onBulkUpdate(updates);
    setBulkOpen(false);
  }

  function submit(e) {
    e.preventDefault();
    if (!form.studentId) return;
    const student = studentMap[form.studentId];
    const svc = services.find((s) => s.id === form.serviceId);
    const weeks = Math.max(1, Number(form.repeatWeeks) || 1);
    const seriesId = weeks > 1 ? newId() : null;
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
      series_id: seriesId,
      notes: form.notes.trim(),
    };
    const startDate = new Date(form.date + "T00:00:00");
    const rows = Array.from({ length: weeks }, (_, i) => {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i * 7);
      return { ...base, date: toISO(d) };
    });
    onAdd(weeks === 1 ? rows[0] : rows);
    setForm({ ...blankForm(students), studentId: form.studentId, date: form.date });
    setSelectedDate(form.date);
    setDayModalOpen(true);
  }

  function startEdit(a) {
    setEditingId(a.id);
    setApplyToSeries(false);
    setEditForm({
      studentId: a.student_id,
      date: a.date,
      time: a.time,
      serviceId: a.service_id || "",
      duration: a.duration,
      location: a.location,
      rate: String(a.rate),
      notes: a.notes || "",
    });
  }
  function cancelEdit() {
    setEditingId(null);
    setEditForm(null);
  }
  function saveEdit(e, seriesIdOfEditing) {
    e.preventDefault();
    const svc = services.find((s) => s.id === editForm.serviceId);
    const patch = {
      student_id: editForm.studentId,
      time: editForm.time,
      duration: Number(editForm.duration) || 60,
      location: editForm.location,
      rate: Number(editForm.rate) || 0,
      service_id: svc ? svc.id : null,
      service_code: svc ? svc.code : null,
      notes: editForm.notes.trim(),
    };
    if (applyToSeries && seriesIdOfEditing) {
      onUpdateSeries(seriesIdOfEditing, patch);
    } else {
      onUpdate(editingId, { ...patch, date: editForm.date });
    }
    setEditingId(null);
    setEditForm(null);
    setApplyToSeries(false);
  }

  function startReschedule(a) {
    setReschedulingId(a.id);
    setReschedForm({
      reason: "",
      slots: [{ date: a.date, time: a.time, duration: a.duration, rate: a.rate }],
    });
  }
  function cancelReschedule() {
    setReschedulingId(null);
    setReschedForm(null);
  }
  function addReschedSlot() {
    const last = reschedForm.slots[reschedForm.slots.length - 1];
    setReschedForm({ ...reschedForm, slots: [...reschedForm.slots, { ...last }] });
  }
  function removeReschedSlot(idx) {
    setReschedForm({ ...reschedForm, slots: reschedForm.slots.filter((_, i) => i !== idx) });
  }
  function updateReschedSlot(idx, patch) {
    setReschedForm({ ...reschedForm, slots: reschedForm.slots.map((s, i) => (i === idx ? { ...s, ...patch } : s)) });
  }
  function saveReschedule(e, a) {
    e.preventDefault();
    onReschedule(a, {
      reason: reschedForm.reason.trim(),
      slots: reschedForm.slots.map((s) => ({
        date: s.date,
        time: s.time,
        duration: Number(s.duration) || a.duration,
        rate: s.rate === "" || s.rate == null ? a.rate : Number(s.rate),
      })),
    });
    setReschedulingId(null);
    setReschedForm(null);
  }

  // ---- Month grid construction ----
  const firstOfMonth = viewMonth;
  const monthLabel = firstOfMonth.toLocaleDateString("en-MY", { month: "long", year: "numeric" });
  const startWeekday = firstOfMonth.getDay();
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

  const needsReschedule = useMemo(() => {
    return appointments
      .filter((a) =>
        a.status === "absent" ||
        (a.status === "scheduled" && unavailMap[a.date] && unavailMap[a.date].reason_type !== "holiday")
      )
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  }, [appointments, unavailMap]);

  return (
    <div className="space-y-4">
      {needsReschedule.length > 0 && (
        <SectionCard title={`Needs rescheduling (${needsReschedule.length})`}>
          <div className="space-y-4">
            {Object.entries(
              needsReschedule.reduce((groups, a) => {
                (groups[a.date] = groups[a.date] || []).push(a);
                return groups;
              }, {})
            ).map(([date, items]) => (
              <div key={date}>
                <div className="text-xs uppercase tracking-wide text-[#8A8272] mb-1.5">
                  {weekdayAbbrev(date)} {date}
                  {unavailMap[date]?.reason ? ` — ${unavailMap[date].reason}` : ""}
                </div>
                <div className="space-y-2">
                  {items.map((a) => (
                    <div key={a.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 text-sm border-b border-[#EDE7DB] pb-2 last:border-0 last:pb-0">
                      <div>
                        <span className="font-medium">{studentMap[a.student_id]?.name}</span>
                        <span className="text-[#8A8272]"> · {timeRange(a.time, a.duration)}</span>
                        {a.status === "absent" && <span className="text-[#B8563D]"> · Absent</span>}
                      </div>
                      <button
                        onClick={() => { setSelectedDate(a.date); setDayModalOpen(true); startReschedule(a); }}
                        className="text-xs text-[#8A6D3B] hover:underline self-start sm:self-auto"
                      >
                        Reschedule
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard title="Add to schedule">
        {students.length === 0 ? (
          <p className="text-sm text-[#8A8272]">Add a student first, on the Students tab.</p>
        ) : (
          <form onSubmit={submit} className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Field label="Student">
              <SearchableSelect
                options={students.map((s) => ({ value: s.id, label: s.name }))}
                value={form.studentId}
                onChange={(v) => {
                  const picked = studentMap[v];
                  const matchedLocation = picked && LOCATIONS.includes(picked.centre) ? picked.centre : form.location;
                  setForm({ ...form, studentId: v, location: matchedLocation });
                }}
                placeholder="Search student…"
              />
            </Field>
            <Field label="Date">
              <input type="date" className={inputCls} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </Field>
            <Field label={`Time (ends ${endTime(form.time, form.duration)})`}>
              <input type="time" className={inputCls} value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
            </Field>
            {services.length > 0 && (
              <Field label="Service / grade code">
                <select className={inputCls} value={form.serviceId} onChange={(e) => pickService(e.target.value, form, setForm)}>
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
            <Field label="Description / notes (optional)">
              <input className={inputCls} placeholder="e.g. Trial lesson" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
            <div className="col-span-2 sm:col-span-3">
              <ClashWarning appointments={appointments} date={form.date} time={form.time} duration={form.duration} studentMap={studentMap} />
            </div>
            <div className="col-span-2 sm:col-span-3">
              <Button type="submit">Add to schedule</Button>
            </div>
          </form>
        )}
      </SectionCard>

      <SectionCard
        title="Bulk edit a student's upcoming lessons"
        action={
          <button onClick={() => { setDayModalOpen(false); setBulkOpen(true); }} className="text-xs text-[#1C1B1A] hover:underline">
            Open
          </button>
        }
      >
        <p className="text-sm text-[#8A8272]">Fix a wrong time/duration/rate across a student's whole upcoming schedule in one go — useful when something was keyed in wrong for every week.</p>
      </SectionCard>

      <Modal open={bulkOpen} onClose={() => setBulkOpen(false)} title="Bulk edit a student's upcoming lessons">
        <form onSubmit={submitBulk} className="space-y-3">
            <Field label="Student">
              <SearchableSelect
                options={students.map((s) => ({ value: s.id, label: s.name }))}
                value={bulkStudentId}
                onChange={setBulkStudentId}
                placeholder="Search student…"
              />
            </Field>

            {bulkLessons.length === 0 ? (
              <p className="text-sm text-[#8A8272]">No upcoming scheduled lessons for this student.</p>
            ) : (
              <>
                <div className="space-y-1 max-h-48 overflow-y-auto border border-[#EDE7DB] rounded-md p-2">
                  <label className="flex items-center gap-2 text-xs font-medium pb-1 border-b border-[#EDE7DB] mb-1">
                    <input type="checkbox" checked={bulkLessons.every((a) => bulkSelected[a.id])} onChange={(e) => toggleBulkAll(e.target.checked)} />
                    Select all ({bulkLessons.length})
                  </label>
                  {bulkLessons.map((a) => (
                    <label key={a.id} className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={!!bulkSelected[a.id]} onChange={(e) => setBulkSelected({ ...bulkSelected, [a.id]: e.target.checked })} />
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{weekdayAbbrev(a.date)} {a.date} {timeRange(a.time, a.duration)}</span>
                    </label>
                  ))}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                  <Field label="Move to weekday (blank = keep)">
                    <select className={inputCls} value={bulkPatch.shiftToWeekday} disabled={!!bulkPatch.shiftDays} onChange={(e) => setBulkPatch({ ...bulkPatch, shiftToWeekday: e.target.value, shiftDays: "" })}>
                      <option value="">— keep —</option>
                      {WEEKDAY_FULL_NAMES.map((d) => <option key={d}>{d}</option>)}
                    </select>
                  </Field>
                  <Field label="Or shift by (days, blank = keep)">
                    <input
                      type="number"
                      className={inputCls}
                      placeholder="e.g. 7 or -1"
                      value={bulkPatch.shiftDays}
                      disabled={!!bulkPatch.shiftToWeekday}
                      onChange={(e) => setBulkPatch({ ...bulkPatch, shiftDays: e.target.value, shiftToWeekday: "" })}
                    />
                  </Field>
                  <Field label="New time (blank = keep)">
                    <input type="time" className={inputCls} value={bulkPatch.time} onChange={(e) => setBulkPatch({ ...bulkPatch, time: e.target.value })} />
                  </Field>
                  <Field label="New duration (blank = keep)">
                    <input type="number" className={inputCls} value={bulkPatch.duration} onChange={(e) => setBulkPatch({ ...bulkPatch, duration: e.target.value })} />
                  </Field>
                  <Field label="New location (blank = keep)">
                    <select className={inputCls} value={bulkPatch.location} onChange={(e) => setBulkPatch({ ...bulkPatch, location: e.target.value })}>
                      <option value="">— keep —</option>
                      {LOCATIONS.map((l) => <option key={l}>{l}</option>)}
                    </select>
                  </Field>
                  <Field label="New rate RM (blank = keep)">
                    <input type="number" className={inputCls} value={bulkPatch.rate} onChange={(e) => setBulkPatch({ ...bulkPatch, rate: e.target.value })} />
                  </Field>
                </div>
                <p className="text-xs text-[#8A8272]">
                  "Move to weekday" shifts each lesson forward to the next occurrence of that day (e.g. Saturday → Sunday moves it 1 day later). "Shift by days" moves by an exact number instead (7 = one week later, -1 = one day earlier). Use one or the other.
                </p>
                <Button type="submit">Apply to selected lessons</Button>
              </>
            )}
        </form>
      </Modal>

      <SectionCard
        title={monthLabel}
        action={
          <div className="flex items-center gap-2">
            <button onClick={() => goMonth(-1)} className="text-sm px-2 py-1 border border-[#D8D0BE] rounded hover:bg-[#F3EEE2]">‹</button>
            <button
              onClick={() => { const t = new Date(); setViewMonth(new Date(t.getFullYear(), t.getMonth(), 1)); setSelectedDate(todayISO()); setDayModalOpen(true); }}
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
            const dayUnavail = unavailMap[iso];
            const isUnavailable = !!dayUnavail;
            const isHoliday = dayUnavail?.reason_type === "holiday";
            return (
              <button
                key={i}
                onClick={() => { setSelectedDate(iso); setDayModalOpen(true); }}
                className={[
                  "aspect-square rounded-md flex flex-col items-center justify-center text-sm relative transition-colors",
                  isSelected
                    ? "bg-[#1C1B1A] text-[#FAF7F0]"
                    : isHoliday
                    ? "bg-[#F5EDDD] border border-[#8A6D3B] text-[#8A6D3B]"
                    : isUnavailable
                    ? "bg-[#F6EBEE] border border-[#6B2C3E] text-[#6B2C3E]"
                    : isToday
                    ? "bg-[#F3EEE2] border border-[#B8935F]"
                    : "hover:bg-[#F3EEE2]",
                ].join(" ")}
              >
                <span>{d.getDate()}</span>
                {count > 0 && <span className="absolute bottom-1 w-1.5 h-1.5 rounded-full" style={{ background: isHoliday ? "#8A6D3B" : isUnavailable ? "#6B2C3E" : "#B8935F" }} />}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-4 mt-2 text-[11px] text-[#8A8272]">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded border border-[#6B2C3E] bg-[#F6EBEE] inline-block" /> Unavailable</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded border border-[#8A6D3B] bg-[#F5EDDD] inline-block" /> Holiday</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#B8935F] inline-block" /> Has lessons</span>
        </div>
      </SectionCard>

      <Modal
        open={dayModalOpen}
        onClose={() => setDayModalOpen(false)}
        title={new Date(selectedDate + "T00:00:00").toLocaleDateString("en-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
      >
        <div className="mb-4 pb-4 border-b border-[#EDE7DB]">
          {selectedUnavail ? (
            selectedUnavail.reason_type === "holiday" ? (
              <div className="flex items-center justify-between bg-[#F5EDDD] border border-[#8A6D3B] rounded-md px-3 py-2">
                <div className="text-sm text-[#8A6D3B]">
                  <span className="font-medium">Centre / public holiday</span>
                  {selectedUnavail.reason && ` — ${selectedUnavail.reason}`}
                  <span className="text-xs block text-[#8A8272]">No lessons — nothing needs rescheduling.</span>
                </div>
                <button onClick={() => onUnmarkUnavailable(selectedDate)} className="text-xs text-[#8A6D3B] hover:underline">Remove</button>
              </div>
            ) : (
              <div className="flex items-center justify-between bg-[#F6EBEE] border border-[#6B2C3E] rounded-md px-3 py-2">
                <div className="text-sm text-[#6B2C3E]">
                  <span className="font-medium">Marked unavailable</span>
                  {selectedUnavail.reason && ` — ${selectedUnavail.reason}`}
                </div>
                <button onClick={() => onUnmarkUnavailable(selectedDate)} className="text-xs text-[#6B2C3E] hover:underline">Remove</button>
              </div>
            )
          ) : (
            <div className="space-y-2">
              <div className="flex flex-col sm:flex-row gap-2">
                <select className={inputCls} value={unavailType} onChange={(e) => setUnavailType(e.target.value)}>
                  <option value="personal">I'm not available (lessons need rescheduling)</option>
                  <option value="holiday">Centre / public holiday (no reschedule needed)</option>
                </select>
                <input
                  className={inputCls + " flex-1"}
                  placeholder="Reason (optional) — e.g. Out of town, CNY"
                  value={unavailReason}
                  onChange={(e) => setUnavailReason(e.target.value)}
                />
              </div>
              <Button variant="secondary" onClick={() => onMarkUnavailable(selectedDate, unavailReason, unavailType)}>
                {unavailType === "holiday" ? "Mark as holiday" : "Mark this day unavailable"}
              </Button>
            </div>
          )}
          {(() => {
            const pending = scheduleForSelected.filter(
              (a) => a.status === "absent" || (a.status === "scheduled" && selectedUnavail && selectedUnavail.reason_type !== "holiday")
            );
            return pending.length > 0 && (
              <div className="mt-2 text-sm text-[#6B2C3E] font-medium">
                ⚠ {pending.length} lesson(s) below still need to be rescheduled.
              </div>
            );
          })()}
        </div>
        {scheduleForSelected.length === 0 ? (
          <p className="text-sm text-[#8A8272]">Nothing scheduled this day.</p>
        ) : (
          <div className="space-y-2">
            {scheduleForSelected.map((a) => {
              const movedTo = findRescheduledTo(a.id);
              if (editingId === a.id) {
                return (
                  <form key={a.id} onSubmit={(e) => saveEdit(e, a.series_id)} className="border border-[#B8935F] rounded-md p-3 space-y-2">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <Field label="Student">
                        <SearchableSelect
                          options={students.map((s) => ({ value: s.id, label: s.name }))}
                          value={editForm.studentId}
                          onChange={(v) => setEditForm({ ...editForm, studentId: v })}
                          placeholder="Search student…"
                        />
                      </Field>
                      <Field label="Date">
                        <input type="date" className={inputCls} value={editForm.date} disabled={applyToSeries} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })} />
                      </Field>
                      <Field label={`Time (ends ${endTime(editForm.time, editForm.duration)})`}>
                        <input type="time" className={inputCls} value={editForm.time} onChange={(e) => setEditForm({ ...editForm, time: e.target.value })} />
                      </Field>
                      {services.length > 0 && (
                        <Field label="Service / grade code">
                          <select className={inputCls} value={editForm.serviceId} onChange={(e) => pickService(e.target.value, editForm, setEditForm)}>
                            <option value="">Custom</option>
                            {services.map((s) => (
                              <option key={s.id} value={s.id}>{s.code} — {s.label} ({s.duration} min)</option>
                            ))}
                          </select>
                        </Field>
                      )}
                      <Field label="Duration (min)">
                        <input type="number" className={inputCls} value={editForm.duration} onChange={(e) => setEditForm({ ...editForm, duration: e.target.value, serviceId: "" })} />
                      </Field>
                      <Field label="Location">
                        <select className={inputCls} value={editForm.location} onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}>
                          {LOCATIONS.map((l) => <option key={l}>{l}</option>)}
                        </select>
                      </Field>
                      <Field label="Rate (RM)">
                        <input type="number" className={inputCls} value={editForm.rate} onChange={(e) => setEditForm({ ...editForm, rate: e.target.value })} />
                      </Field>
                      <Field label="Description / notes">
                        <input className={inputCls} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
                      </Field>
                    </div>
                    {a.series_id && (
                      <label className="flex items-center gap-2 text-xs text-[#5C564A]">
                        <input type="checkbox" checked={applyToSeries} onChange={(e) => setApplyToSeries(e.target.checked)} />
                        Apply this change to every lesson in this weekly series (keeps each one's own date)
                      </label>
                    )}
                    <ClashWarning appointments={appointments} date={editForm.date} time={editForm.time} duration={editForm.duration} excludeId={a.id} studentMap={studentMap} />
                    <div className="flex gap-2">
                      <Button type="submit">Save</Button>
                      <Button type="button" variant="secondary" onClick={cancelEdit}>Cancel</Button>
                    </div>
                  </form>
                );
              }
              if (reschedulingId === a.id) {
                return (
                  <form key={a.id} onSubmit={(e) => saveReschedule(e, a)} className="border border-[#8A6D3B] rounded-md p-3 space-y-3">
                    <div className="text-sm font-medium">Reschedule {studentMap[a.student_id]?.name}'s lesson</div>
                    <p className="text-xs text-[#8A8272]">
                      Usually one replacement slot. If splitting the missed lesson across two shorter makeup times, add another slot below.
                    </p>
                    {reschedForm.slots.map((slot, idx) => (
                      <div key={idx} className="border border-[#EDE7DB] rounded-md p-2 space-y-1">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
                          <Field label="New date">
                            <input type="date" className={inputCls} value={slot.date} onChange={(e) => updateReschedSlot(idx, { date: e.target.value })} />
                          </Field>
                          <Field label="New time">
                            <input type="time" className={inputCls} value={slot.time} onChange={(e) => updateReschedSlot(idx, { time: e.target.value })} />
                          </Field>
                          <Field label="Duration (min)">
                            <input type="number" className={inputCls} value={slot.duration} onChange={(e) => updateReschedSlot(idx, { duration: e.target.value })} />
                          </Field>
                          <Field label="Rate (RM)">
                            <input type="number" className={inputCls} value={slot.rate} onChange={(e) => updateReschedSlot(idx, { rate: e.target.value })} />
                          </Field>
                        </div>
                        <ClashWarning appointments={appointments} date={slot.date} time={slot.time} duration={slot.duration} excludeId={a.id} studentMap={studentMap} />
                        {reschedForm.slots.length > 1 && (
                          <button type="button" onClick={() => removeReschedSlot(idx)} className="text-xs text-[#6B2C3E] hover:underline">Remove this slot</button>
                        )}
                      </div>
                    ))}
                    <button type="button" onClick={addReschedSlot} className="text-xs text-[#1C1B1A] hover:underline">+ Add another replacement slot</button>
                    <Field label="Reason (optional)">
                      <input className={inputCls} placeholder="e.g. Student absent, teacher away" value={reschedForm.reason} onChange={(e) => setReschedForm({ ...reschedForm, reason: e.target.value })} />
                    </Field>
                    <div className="flex gap-2">
                      <Button type="submit">Confirm reschedule</Button>
                      <Button type="button" variant="secondary" onClick={cancelReschedule}>Cancel</Button>
                    </div>
                  </form>
                );
              }
              return (
                <div key={a.id} className="flex flex-col gap-2 border border-[#EDE7DB] rounded-md px-3 py-2">
                  <div className="flex items-start gap-3">
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace" }} className="text-sm whitespace-nowrap">{timeRange(a.time, a.duration)}</span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{studentMap[a.student_id]?.name || "Unknown student"}</div>
                      <div className="text-xs text-[#8A8272]">
                        {a.service_code ? `(${a.service_code}) ` : ""}{a.duration} min · {a.location} · {money(a.rate)}
                      </div>
                      {a.notes && <div className="text-xs text-[#8A8272] italic">{a.notes}</div>}
                      {a.status === "rescheduled" && movedTo.length > 0 && (
                        <div className="text-xs text-[#8A6D3B]">
                          → moved to {movedTo.map((m) => `${m.date} ${m.time}`).join(", ")}
                        </div>
                      )}
                      {a.rescheduled_from && (
                        <div className="text-xs text-[#8A6D3B]">Rescheduled from an earlier lesson</div>
                      )}
                      {lessonPlans.filter((p) => p.student_id === a.student_id && p.lesson_date === a.date).map((p) => (
                        <div key={p.id} className="mt-1.5 border-l-2 border-[#B8935F] pl-2 py-0.5">
                          <div className={"text-xs " + (p.status === "taught" ? "line-through text-[#8A8272]" : "text-[#1C1B1A]")}>
                            {p.topic}
                          </div>
                          {p.remarks && <div className="text-xs text-[#8A8272]">{p.remarks}</div>}
                          <button
                            onClick={() => onUpdateLessonPlanItem(p.id, { status: p.status === "taught" ? "planned" : "taught" })}
                            className="text-[11px] text-[#8A6D3B] hover:underline"
                          >
                            {p.status === "taught" ? "Mark not taught" : "Mark taught"}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <StatusPill status={a.status} />
                    {a.status !== "completed" && a.status !== "rescheduled" && a.status !== "absent" && (
                      <button onClick={() => onSetStatus(a.id, "completed")} className="text-xs text-[#7A8B6F] hover:underline">Mark done</button>
                    )}
                    {(a.status === "completed" || a.status === "absent") && (
                      <button onClick={() => onSetStatus(a.id, "scheduled")} className="text-xs text-[#8A8272] hover:underline">Undo</button>
                    )}
                    {a.status === "scheduled" && (
                      <button onClick={() => onSetStatus(a.id, "absent")} className="text-xs text-[#B8563D] hover:underline">Absent</button>
                    )}
                    {a.status !== "cancelled" && a.status !== "completed" && a.status !== "rescheduled" && (
                      <>
                        <button onClick={() => startReschedule(a)} className="text-xs text-[#8A6D3B] hover:underline">Reschedule</button>
                        <button onClick={() => onSetStatus(a.id, "cancelled")} className="text-xs text-[#6B2C3E] hover:underline">Cancel</button>
                      </>
                    )}
                    <button onClick={() => startEdit(a)} className="text-xs text-[#1C1B1A] hover:underline">Edit</button>
                    <button onClick={() => openBulkFor(a.student_id)} className="text-xs text-[#1C1B1A] hover:underline">Bulk edit</button>
                    <button onClick={() => onRemove(a.id)} className="text-xs text-[#8A8272] hover:underline">Remove</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Modal>
    </div>
  );
}
