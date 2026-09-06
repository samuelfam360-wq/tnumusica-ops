import { useState, useMemo } from "react";
import { SectionCard, Button, Field, inputCls, DeferredInput, money } from "./ui";

export default function RatesTab({ services, onAdd, onUpdate, onRemove }) {
  const [form, setForm] = useState({ course: "", grade: "", duration: 30, rate: "", percentage: 100 });

  const uniqueCourses = useMemo(
    () => [...new Set(services.map((s) => s.course).filter(Boolean))].sort(),
    [services]
  );

  function percentageForCourse(courseName) {
    const match = services.find((s) => s.course === courseName && s.percentage != null);
    return match ? match.percentage : null;
  }

  function handleCourseChange(value) {
    const existingPercentage = percentageForCourse(value);
    setForm({ ...form, course: value, percentage: existingPercentage != null ? existingPercentage : form.percentage });
  }

  function submit(e) {
    e.preventDefault();
    if (!form.course.trim() || !form.grade.trim()) return;
    onAdd({
      course: form.course.trim(),
      grade: form.grade.trim(),
      // Code is kept only for old-data compatibility — no longer shown or
      // meaningful day-to-day, so we just derive a harmless placeholder.
      code: `${form.course.trim()}-${form.grade.trim()}`.toLowerCase().replace(/\s+/g, "-").slice(0, 40),
      label: form.grade.trim(),
      duration: Number(form.duration) || 30,
      rate: Number(form.rate) || 0,
      percentage: Number(form.percentage) || 0,
    });
    setForm({ course: "", grade: "", duration: 30, rate: "", percentage: 100 });
  }

  const grouped = useMemo(() => {
    const byCourse = {};
    services.forEach((s) => {
      const key = s.course || "(no course set)";
      if (!byCourse[key]) byCourse[key] = [];
      byCourse[key].push(s);
    });
    Object.values(byCourse).forEach((rows) => rows.sort((a, b) => a.duration - b.duration || (a.grade || "").localeCompare(b.grade || "")));
    return Object.entries(byCourse).sort((a, b) => a[0].localeCompare(b[0]));
  }, [services]);

  return (
    <div className="space-y-4">
      <SectionCard title="About this table">
        <p className="text-sm text-[#5C564A]">
          Set up each Course and Grade combination you teach, with its duration, rate, and your percentage split with the school for that course.
          These never appear on invoices — invoices only ever show duration and amount. This is also where "Add student" pulls its Course and Grade choices from.
        </p>
      </SectionCard>

      <SectionCard title="Add course / grade">
        <form onSubmit={submit} className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
          <Field label="Course">
            <input
              className={inputCls}
              placeholder="Classical"
              list="rates-course-list"
              value={form.course}
              onChange={(e) => handleCourseChange(e.target.value)}
            />
            <datalist id="rates-course-list">
              {uniqueCourses.map((c) => <option key={c} value={c} />)}
            </datalist>
          </Field>
          <Field label="Grade">
            <input className={inputCls} placeholder="Beginner" value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} />
          </Field>
          <Field label="Duration (min)">
            <input type="number" className={inputCls} value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} />
          </Field>
          <Field label="Rate (RM)">
            <input type="number" className={inputCls} value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} />
          </Field>
          <Field label="Your % of this course">
            <input type="number" min="0" max="100" className={inputCls} value={form.percentage} onChange={(e) => setForm({ ...form, percentage: e.target.value })} />
          </Field>
          <div className="col-span-2 sm:col-span-5">
            <Button type="submit">Add</Button>
            {uniqueCourses.includes(form.course) && (
              <span className="text-xs text-[#8A8272] ml-3">Percentage auto-filled from this course's other grades — edit if this one's different.</span>
            )}
          </div>
        </form>
      </SectionCard>

      <SectionCard title={`Courses & grades (${services.length})`}>
        {services.length === 0 ? (
          <p className="text-sm text-[#8A8272]">Nothing set up yet — add a Course and Grade above.</p>
        ) : (
          <div className="space-y-4">
            {grouped.map(([courseName, rows]) => (
              <div key={courseName}>
                <div className="text-xs uppercase tracking-wide text-[#8A8272] mb-1.5">
                  {courseName} {rows[0]?.percentage != null && <span>· you keep {rows[0].percentage}%</span>}
                </div>
                <div className="divide-y divide-[#EDE7DB] border border-[#EDE7DB] rounded-md">
                  {rows.map((s) => (
                    <div key={s.id} className="flex flex-wrap items-center gap-3 py-2.5 px-3">
                      <DeferredInput
                        className={inputCls + " flex-1 min-w-[120px]"}
                        placeholder="Course"
                        value={s.course || ""}
                        onCommit={(v) => onUpdate(s.id, { course: v })}
                      />
                      <DeferredInput
                        className={inputCls + " flex-1 min-w-[120px]"}
                        placeholder="Grade"
                        value={s.grade || s.label || ""}
                        onCommit={(v) => onUpdate(s.id, { grade: v })}
                      />
                      <div className="flex items-center gap-1">
                        <DeferredInput type="number" className={inputCls + " w-16"} value={s.duration} onCommit={(v) => onUpdate(s.id, { duration: Number(v) || 0 })} />
                        <span className="text-xs text-[#8A8272]">min</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-[#8A8272]">RM</span>
                        <DeferredInput type="number" className={inputCls + " w-20"} value={s.rate} onCommit={(v) => onUpdate(s.id, { rate: Number(v) || 0 })} />
                      </div>
                      <div className="flex items-center gap-1">
                        <DeferredInput type="number" className={inputCls + " w-16"} value={s.percentage ?? 100} onCommit={(v) => onUpdate(s.id, { percentage: Number(v) || 0 })} />
                        <span className="text-xs text-[#8A8272]">% yours</span>
                      </div>
                      <button onClick={() => onRemove(s.id)} className="text-xs text-[#6B2C3E] hover:underline">Remove</button>
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
