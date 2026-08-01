import { useState } from "react";
import {
  SectionCard, Button, Field, inputCls, timeRange, SearchBox, LOCATIONS, CENTRES, COURSES, GRADES,
  weekdayAbbrev, endTime, ClashWarning, StatusPill, money, todayISO, DeferredInput,
} from "./ui";

export default function StudentsTab({
  students, appointments = [], services = [], onAdd, onUpdate, onRemove,
  onBulkRemoveStudents, onBulkUpdateStudents, onExtendSchedule,
  lessonPlans = [], onAddLessonPlanItem, onUpdateLessonPlanItem, onRemoveLessonPlanItem, onMoveLessonPlanItem,
  onSetAppointmentStatus, onUpdateAppointment, onReschedule, onRemoveAppointment,
}) {
  const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const [extendWeeks, setExtendWeeks] = useState({});
  const [planForm, setPlanForm] = useState({});
  const [form, setForm] = useState({
    name: "", rate: "", age: "", gradeChoice: "", gradeOther: "", courseChoice: "", courseOther: "", centre: "",
    lessonDay: "", lessonTime: "", lessonDuration: "", lessonServiceId: "", scheduleValue: "3", scheduleUnit: "months",
    notes: "",
  });
  const [selectedIds, setSelectedIds] = useState({});
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkEditPatch, setBulkEditPatch] = useState({ centre: "", rate: "" });
  const [search, setSearch] = useState("");
  const [centreFilter, setCentreFilter] = useState("");
  const [dayFilter, setDayFilter] = useState("");
  const [courseFilter, setCourseFilter] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [editingApptId, setEditingApptId] = useState(null);
  const [editApptForm, setEditApptForm] = useState(null);
  const [reschedApptId, setReschedApptId] = useState(null);
  const [reschedApptForm, setReschedApptForm] = useState(null);

  function pickStudentService(serviceId) {
    const svc = services.find((sv) => sv.id === serviceId);
    setForm({
      ...form,
      lessonServiceId: serviceId,
      lessonDuration: svc ? String(svc.duration) : form.lessonDuration,
      rate: svc ? String(svc.rate) : form.rate,
    });
  }

  function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const svc = services.find((sv) => sv.id === form.lessonServiceId);
    const grade = form.gradeChoice === "Other" ? form.gradeOther.trim() : form.gradeChoice;
    const course = form.courseChoice === "Other" ? form.courseOther.trim() : form.courseChoice;
    onAdd({
      name: form.name.trim(),
      rate: Number(form.rate) || 0,
      age: form.age === "" ? null : Number(form.age),
      grade,
      course,
      centre: form.centre,
      lesson_day: form.lessonDay,
      lesson_time: form.lessonTime,
      lesson_duration: form.lessonDuration === "" ? null : Number(form.lessonDuration),
      notes: form.notes.trim(),
      // Generation-only — used once to create the recurring lessons, not stored on the student row.
      _scheduleNow: !!(form.lessonDay && form.lessonTime),
      _scheduleValue: form.scheduleValue,
      _scheduleUnit: form.scheduleUnit,
      _serviceId: svc ? svc.id : null,
      _serviceCode: svc ? svc.code : null,
    });
    setForm({
      name: "", rate: "", age: "", gradeChoice: "", gradeOther: "", courseChoice: "", courseOther: "", centre: "",
      lessonDay: "", lessonTime: "", lessonDuration: "", lessonServiceId: "", scheduleValue: "3", scheduleUnit: "months",
      notes: "",
    });
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

  const uniqueCourses = [...new Set(students.map((s) => s.course).filter(Boolean))].sort();
  const uniqueGrades = [...new Set(students.map((s) => s.grade).filter(Boolean))].sort();

  const filtered = students
    .filter((s) => !centreFilter || s.centre === centreFilter)
    .filter((s) => !dayFilter || s.lesson_day === dayFilter)
    .filter((s) => !courseFilter || s.course === courseFilter)
    .filter((s) => !gradeFilter || s.grade === gradeFilter)
    .filter((s) => {
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return (s.name || "").toLowerCase().includes(q) || (s.grade || "").toLowerCase().includes(q) || (s.course || "").toLowerCase().includes(q);
    });

  return (
    <div className="space-y-4">
      <SectionCard title="Add student">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-end">
            <Field label="Name">
              <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Age">
              <input type="number" className={inputCls} value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} />
            </Field>
            <Field label="Grade">
              <select className={inputCls} value={form.gradeChoice} onChange={(e) => setForm({ ...form, gradeChoice: e.target.value })}>
                <option value="">—</option>
                {GRADES.map((g) => <option key={g}>{g}</option>)}
              </select>
            </Field>
            {form.gradeChoice === "Other" && (
              <Field label="Specify grade">
                <input className={inputCls} value={form.gradeOther} onChange={(e) => setForm({ ...form, gradeOther: e.target.value })} />
              </Field>
            )}
            <Field label="Course">
              <select className={inputCls} value={form.courseChoice} onChange={(e) => setForm({ ...form, courseChoice: e.target.value })}>
                <option value="">—</option>
                {COURSES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            {form.courseChoice === "Other" && (
              <Field label="Specify course">
                <input className={inputCls} value={form.courseOther} onChange={(e) => setForm({ ...form, courseOther: e.target.value })} />
              </Field>
            )}
            <Field label="Centre">
              <select className={inputCls} value={form.centre} onChange={(e) => setForm({ ...form, centre: e.target.value })}>
                <option value="">—</option>
                {CENTRES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Default rate (RM/lesson)">
              <input type="number" className={inputCls} value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} />
            </Field>
            <div className="col-span-2 sm:col-span-3">
              <Field label="Notes">
                <input className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </Field>
            </div>
          </div>

          <div className="border-t border-[#EDE7DB] pt-3">
            <div className="text-xs uppercase tracking-wide text-[#8A8272] mb-2">
              Weekly lesson time — fill this in and lessons are added to the calendar automatically, no need to add them separately after
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
              <Field label="Permanent day">
                <select className={inputCls} value={form.lessonDay} onChange={(e) => setForm({ ...form, lessonDay: e.target.value })}>
                  <option value="">—</option>
                  {WEEKDAYS.map((d) => <option key={d}>{d}</option>)}
                </select>
              </Field>
              <Field label={`Time${form.lessonTime && form.lessonDuration ? ` (ends ${endTime(form.lessonTime, form.lessonDuration)})` : ""}`}>
                <input type="time" className={inputCls} value={form.lessonTime} onChange={(e) => setForm({ ...form, lessonTime: e.target.value })} />
              </Field>
              {services.length > 0 && (
                <Field label="Service / grade code">
                  <select className={inputCls} value={form.lessonServiceId} onChange={(e) => pickStudentService(e.target.value)}>
                    <option value="">Custom</option>
                    {services.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.label} ({s.duration} min)</option>)}
                  </select>
                </Field>
              )}
              <Field label="Duration (min)">
                <input type="number" className={inputCls} placeholder="30" value={form.lessonDuration} onChange={(e) => setForm({ ...form, lessonDuration: e.target.value, lessonServiceId: "" })} />
              </Field>
              <Field label="For how long">
                <div className="flex gap-1">
                  <input type="number" min="1" className={inputCls + " w-16"} value={form.scheduleValue} onChange={(e) => setForm({ ...form, scheduleValue: e.target.value })} />
                  <select className={inputCls} value={form.scheduleUnit} onChange={(e) => setForm({ ...form, scheduleUnit: e.target.value })}>
                    <option value="weeks">Weeks</option>
                    <option value="months">Months</option>
                  </select>
                </div>
              </Field>
            </div>
            {form.lessonDay && form.lessonTime && (
              <p className="text-xs text-[#8A8272] mt-2">
                Location will follow the Centre picked above (defaults to Play Studio if Centre is blank or Personal).
              </p>
            )}
          </div>

          <Button type="submit">Add student</Button>
        </form>
      </SectionCard>

      <SectionCard
        title={`Students (${students.length})`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <select className={inputCls} value={centreFilter} onChange={(e) => setCentreFilter(e.target.value)}>
              <option value="">All centres</option>
              {CENTRES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <select className={inputCls} value={dayFilter} onChange={(e) => setDayFilter(e.target.value)}>
              <option value="">All days</option>
              {WEEKDAYS.map((d) => <option key={d}>{d}</option>)}
            </select>
            <select className={inputCls} value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)}>
              <option value="">All courses</option>
              {uniqueCourses.map((c) => <option key={c}>{c}</option>)}
            </select>
            <select className={inputCls} value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)}>
              <option value="">All grades</option>
              {uniqueGrades.map((g) => <option key={g}>{g}</option>)}
            </select>
            <SearchBox value={search} onChange={setSearch} placeholder="Search by name, grade, course…" />
          </div>
        }
      >
        {filtered.length === 0 ? (
          <p className="text-sm text-[#8A8272]">No students match.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 mb-1 border-b border-[#EDE7DB]">
              <label className="flex items-center gap-2 text-xs text-[#5C564A]">
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && filtered.every((s) => selectedIds[s.id])}
                  onChange={(e) => {
                    const next = { ...selectedIds };
                    filtered.forEach((s) => { next[s.id] = e.target.checked; });
                    setSelectedIds(next);
                  }}
                />
                Select all ({filtered.length})
              </label>
              {Object.values(selectedIds).some(Boolean) && (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[#8A8272]">{Object.values(selectedIds).filter(Boolean).length} selected</span>
                  <button onClick={() => setBulkEditOpen(!bulkEditOpen)} className="text-xs text-[#1C1B1A] hover:underline">Bulk edit</button>
                  <button
                    onClick={() => {
                      const ids = Object.entries(selectedIds).filter(([, v]) => v).map(([k]) => k);
                      if (ids.length === 0) return;
                      if (window.confirm(`Remove ${ids.length} student(s)? This also removes their lesson history. This can't be undone.`)) {
                        onBulkRemoveStudents(ids);
                        setSelectedIds({});
                      }
                    }}
                    className="text-xs text-[#6B2C3E] hover:underline"
                  >
                    Remove selected
                  </button>
                </div>
              )}
            </div>

            {bulkEditOpen && (
              <div className="border border-[#B8935F] rounded-md p-3 mb-3 space-y-2">
                <div className="text-sm font-medium">Bulk edit selected students</div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="New centre (blank = keep)">
                    <select className={inputCls} value={bulkEditPatch.centre} onChange={(e) => setBulkEditPatch({ ...bulkEditPatch, centre: e.target.value })}>
                      <option value="">— keep —</option>
                      {CENTRES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </Field>
                  <Field label="New rate RM (blank = keep)">
                    <input type="number" className={inputCls} value={bulkEditPatch.rate} onChange={(e) => setBulkEditPatch({ ...bulkEditPatch, rate: e.target.value })} />
                  </Field>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      const ids = Object.entries(selectedIds).filter(([, v]) => v).map(([k]) => k);
                      const patch = {};
                      if (bulkEditPatch.centre) patch.centre = bulkEditPatch.centre;
                      if (bulkEditPatch.rate !== "") patch.rate = Number(bulkEditPatch.rate) || 0;
                      if (ids.length > 0 && Object.keys(patch).length > 0) onBulkUpdateStudents(ids, patch);
                      setBulkEditOpen(false);
                      setBulkEditPatch({ centre: "", rate: "" });
                    }}
                  >
                    Apply to selected
                  </Button>
                  <Button variant="secondary" onClick={() => setBulkEditOpen(false)}>Cancel</Button>
                </div>
              </div>
            )}

          <div className="divide-y divide-[#EDE7DB]">
            {filtered.map((s) => {
              const schedule = scheduleFor(s.id);
              const upcoming = schedule.filter((a) => a.status === "scheduled" && a.date >= todayISO());
              const isOpen = expanded === s.id;
              return (
                <div key={s.id} className="py-2.5 flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={!!selectedIds[s.id]}
                    onChange={(e) => setSelectedIds({ ...selectedIds, [s.id]: e.target.checked })}
                  />
                  <button onClick={() => setExpanded(isOpen ? null : s.id)} className="w-full flex items-center justify-between text-left">
                    <div>
                      <div className="text-sm font-medium">
                        {s.name}
                        {s.age != null && <span className="text-[#8A8272] font-normal"> · {s.age}yo</span>}
                        {s.grade && <span className="text-[#8A8272] font-normal"> · {s.grade}</span>}
                        {s.course && <span className="text-[#8A8272] font-normal"> · {s.course}</span>}
                        {s.centre && <span className="text-[#8A8272] font-normal"> · {s.centre}</span>}
                        {s.lesson_day && <span className="text-[#8A8272] font-normal"> · {s.lesson_day}</span>}
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
                      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                        <Field label="Name">
                          <DeferredInput className={inputCls} value={s.name} onCommit={(v) => onUpdate(s.id, { name: v })} />
                        </Field>
                        <Field label="Age">
                          <DeferredInput type="number" className={inputCls} value={s.age ?? ""} onCommit={(v) => onUpdate(s.id, { age: v === "" ? null : Number(v) })} />
                        </Field>
                        <Field label="Grade">
                          <select className={inputCls} value={GRADES.includes(s.grade) ? s.grade : (s.grade ? "Other" : "")} onChange={(e) => onUpdate(s.id, { grade: e.target.value === "Other" ? "Other" : e.target.value })}>
                            <option value="">—</option>
                            {GRADES.map((g) => <option key={g}>{g}</option>)}
                          </select>
                        </Field>
                        {(s.grade === "Other" || (s.grade && !GRADES.includes(s.grade))) && (
                          <Field label="Specify grade">
                            <DeferredInput className={inputCls} value={s.grade === "Other" ? "" : s.grade} onCommit={(v) => onUpdate(s.id, { grade: v })} />
                          </Field>
                        )}
                        <Field label="Course">
                          <select className={inputCls} value={COURSES.includes(s.course) ? s.course : (s.course ? "Other" : "")} onChange={(e) => onUpdate(s.id, { course: e.target.value === "Other" ? "Other" : e.target.value })}>
                            <option value="">—</option>
                            {COURSES.map((c) => <option key={c}>{c}</option>)}
                          </select>
                        </Field>
                        {(s.course === "Other" || (s.course && !COURSES.includes(s.course))) && (
                          <Field label="Specify course">
                            <DeferredInput className={inputCls} value={s.course === "Other" ? "" : s.course} onCommit={(v) => onUpdate(s.id, { course: v })} />
                          </Field>
                        )}
                        <Field label="Centre">
                          <select className={inputCls} value={s.centre || ""} onChange={(e) => onUpdate(s.id, { centre: e.target.value })}>
                            <option value="">—</option>
                            {CENTRES.map((c) => <option key={c}>{c}</option>)}
                          </select>
                        </Field>
                        <Field label="Lesson day">
                          <select className={inputCls} value={s.lesson_day || ""} onChange={(e) => onUpdate(s.id, { lesson_day: e.target.value })}>
                            <option value="">—</option>
                            {WEEKDAYS.map((d) => <option key={d}>{d}</option>)}
                          </select>
                        </Field>
                        <Field label="Lesson time">
                          <DeferredInput type="time" className={inputCls} value={s.lesson_time || ""} onCommit={(v) => onUpdate(s.id, { lesson_time: v })} />
                        </Field>
                        <Field label="Lesson duration (min)">
                          <DeferredInput type="number" className={inputCls} value={s.lesson_duration ?? ""} onCommit={(v) => onUpdate(s.id, { lesson_duration: v === "" ? null : Number(v) })} />
                        </Field>
                        <Field label="Rate (RM)">
                          <DeferredInput type="number" className={inputCls} value={s.rate} onCommit={(v) => onUpdate(s.id, { rate: Number(v) || 0 })} />
                        </Field>
                        <div className="col-span-2 sm:col-span-5">
                          <Field label="Notes">
                            <DeferredInput className={inputCls} value={s.notes || ""} onCommit={(v) => onUpdate(s.id, { notes: v })} />
                          </Field>
                        </div>
                      </div>

                      {s.lesson_day && s.lesson_time && (
                        <div className="border border-[#EDE7DB] rounded-md p-3 flex flex-wrap items-end gap-3">
                          <div className="text-xs text-[#5C564A]">
                            Extend recurring {s.lesson_day} {s.lesson_time} lessons further — continues right after their last scheduled one, no gaps or duplicates.
                          </div>
                          <Field label="Add how much more">
                            <div className="flex gap-1">
                              <input
                                type="number"
                                min="1"
                                className={inputCls + " w-16"}
                                value={extendWeeks[s.id]?.value ?? "3"}
                                onChange={(e) => setExtendWeeks({ ...extendWeeks, [s.id]: { ...extendWeeks[s.id], value: e.target.value } })}
                              />
                              <select
                                className={inputCls}
                                value={extendWeeks[s.id]?.unit ?? "months"}
                                onChange={(e) => setExtendWeeks({ ...extendWeeks, [s.id]: { ...extendWeeks[s.id], unit: e.target.value } })}
                              >
                                <option value="weeks">Weeks</option>
                                <option value="months">Months</option>
                              </select>
                            </div>
                          </Field>
                          <Button
                            variant="secondary"
                            onClick={() => onExtendSchedule(s.id, extendWeeks[s.id]?.value ?? "3", extendWeeks[s.id]?.unit ?? "months")}
                          >
                            Generate more lessons
                          </Button>
                        </div>
                      )}

                      <div className="border border-[#EDE7DB] rounded-md p-3 space-y-2">
                        <div className="text-xs uppercase tracking-wide text-[#8A8272]">
                          Teaching plan — what to cover on each lesson date, planned ahead, independent of whether that lesson is on the calendar yet
                        </div>
                        {(() => {
                          const items = lessonPlans.filter((p) => p.student_id === s.id).sort((a, b) => {
                            const aKey = `${a.lesson_date || "9999-99-99"} ${a.lesson_time || "99:99"}`;
                            const bKey = `${b.lesson_date || "9999-99-99"} ${b.lesson_time || "99:99"}`;
                            return aKey === bKey ? a.position - b.position : aKey.localeCompare(bKey);
                          });
                          return items.length === 0 ? (
                            <p className="text-xs text-[#8A8272]">Nothing planned yet — add the first item below.</p>
                          ) : (
                            <div className="space-y-2">
                              {items.map((p) => (
                                <div key={p.id} className="border border-[#EDE7DB] rounded-md px-3 py-2.5 space-y-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <input
                                      type="date"
                                      className={inputCls + " w-40"}
                                      value={p.lesson_date || ""}
                                      onChange={(e) => onUpdateLessonPlanItem(p.id, { lesson_date: e.target.value || null })}
                                    />
                                    <input
                                      type="time"
                                      className={inputCls + " w-28"}
                                      value={p.lesson_time || ""}
                                      onChange={(e) => onUpdateLessonPlanItem(p.id, { lesson_time: e.target.value || null })}
                                    />
                                    <button
                                      onClick={() => onUpdateLessonPlanItem(p.id, { status: p.status === "taught" ? "planned" : "taught" })}
                                      className={"text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap ml-auto " + (p.status === "taught" ? "text-[#4C5A43] bg-[#E7EDE1]" : "text-[#8A8272] bg-[#F3EEE2]")}
                                    >
                                      {p.status === "taught" ? "Taught" : "Planned"}
                                    </button>
                                    <button onClick={() => onRemoveLessonPlanItem(p.id)} className="text-xs text-[#8A8272] hover:underline">Remove</button>
                                  </div>
                                  <Field label="What to teach">
                                    <DeferredInput
                                      multiline
                                      rows={3}
                                      maxLength={1000}
                                      className={inputCls + " w-full resize-y" + (p.status === "taught" ? " line-through text-[#8A8272]" : "")}
                                      value={p.topic}
                                      onCommit={(v) => onUpdateLessonPlanItem(p.id, { topic: v })}
                                    />
                                  </Field>
                                  <Field label="Remarks">
                                    <DeferredInput
                                      multiline
                                      rows={2}
                                      maxLength={1000}
                                      className={inputCls + " w-full resize-y"}
                                      placeholder="Optional"
                                      value={p.remarks || ""}
                                      onCommit={(v) => onUpdateLessonPlanItem(p.id, { remarks: v })}
                                    />
                                  </Field>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                        <form
                          className="border border-[#B8935F] rounded-md p-3 space-y-2"
                          onSubmit={(e) => {
                            e.preventDefault();
                            const topic = (planForm[s.id]?.topic || "").trim();
                            if (!topic) return;
                            onAddLessonPlanItem(s.id, {
                              topic,
                              remarks: (planForm[s.id]?.remarks || "").trim(),
                              lessonDate: planForm[s.id]?.lessonDate || "",
                              lessonTime: planForm[s.id]?.lessonTime || "",
                            });
                            setPlanForm({ ...planForm, [s.id]: { topic: "", remarks: "", lessonDate: "", lessonTime: "" } });
                          }}
                        >
                          <div className="flex flex-wrap gap-2">
                            <input
                              type="date"
                              className={inputCls + " w-40"}
                              value={planForm[s.id]?.lessonDate || ""}
                              onChange={(e) => setPlanForm({ ...planForm, [s.id]: { ...planForm[s.id], lessonDate: e.target.value } })}
                            />
                            <input
                              type="time"
                              className={inputCls + " w-28"}
                              value={planForm[s.id]?.lessonTime || ""}
                              onChange={(e) => setPlanForm({ ...planForm, [s.id]: { ...planForm[s.id], lessonTime: e.target.value } })}
                            />
                          </div>
                          <Field label="What to teach">
                            <textarea
                              rows={3}
                              maxLength={1000}
                              className={inputCls + " w-full resize-y"}
                              placeholder="e.g. C major scale, hands together, review last week's piece"
                              value={planForm[s.id]?.topic || ""}
                              onChange={(e) => setPlanForm({ ...planForm, [s.id]: { ...planForm[s.id], topic: e.target.value } })}
                            />
                          </Field>
                          <Field label="Remarks">
                            <textarea
                              rows={2}
                              maxLength={1000}
                              className={inputCls + " w-full resize-y"}
                              placeholder="Optional"
                              value={planForm[s.id]?.remarks || ""}
                              onChange={(e) => setPlanForm({ ...planForm, [s.id]: { ...planForm[s.id], remarks: e.target.value } })}
                            />
                          </Field>
                          <Button type="submit">Add</Button>
                        </form>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="text-xs uppercase tracking-wide text-[#8A8272]">Lessons ({schedule.length})</div>
                        <button onClick={() => { if (window.confirm(`Remove ${s.name}? This also removes their lesson history.`)) onRemove(s.id); }} className="text-xs text-[#6B2C3E] hover:underline">Remove student</button>
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
          </>
        )}
      </SectionCard>
    </div>
  );
}
