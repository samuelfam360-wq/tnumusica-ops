"use client";
export const dynamic = "force-dynamic";
import { useEffect, useState, useCallback, useMemo, Fragment } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import {
  COLORS, Badge, Btn, Card, Field, Modal, SegTabs, inputStyle,
  fmtDate, fmtMoney, todayIso, earningsForLesson, resolveEarnings, statusTone, statusLabel, lessonStatusLabel,
  addMinutes, isoMonthDays, WEEKDAY_LABELS, findClashes, addDays, summarizeBookOrderItems, SearchableSelect, fetchAllRows, isLessonDelivered, summarizeTeaching, lessonPayLabel,
} from "../../lib/ui";
import { loadAll as loadAdminData, CalendarTab as StaffCalendarTab, TeachersTab as StaffTeachersTab, StudentsTab as StaffStudentsTab, CoursesCard as StaffCoursesCard, ReplacementsTab as StaffReplacementsTab } from "../../lib/adminTabs";

function useGuard(allowedRoles) {
  const router = useRouter();
  const [ok, setOk] = useState(false);
  const [userId, setUserId] = useState(null);
  const [role, setRole] = useState(null);
  const allowed = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login"); return; }
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", session.user.id).single();
      if (!allowed.includes(profile?.role)) { router.replace(profile?.role === "admin" ? "/admin" : profile?.role ? "/teacher" : "/login"); return; }
      setUserId(session.user.id); setRole(profile.role); setOk(true);
    })();
  }, [router]);
  return { ok, userId, role };
}

async function loadAll(userId) {
  const [me, s, allTeachers, h, cov, tr, si, lp, bi, bo, boi] = await Promise.all([
    supabase.from("teachers").select("*").eq("user_id", userId).single(),
    supabase.from("students").select("*"),
    supabase.from("teachers").select("*"),
    supabase.from("holidays").select("*"),
    fetchAllRows(supabase.from("lessons").select("*").eq("status", "needs-cover").order("date").order("time")),
    supabase.from("teacher_rates").select("*"),
    supabase.from("student_instruments").select("*"),
    supabase.from("lesson_plans").select("*").order("date"),
    supabase.from("book_items").select("*").order("name"),
    fetchAllRows(supabase.from("book_orders").select("*").order("created_at", { ascending: false })),
    fetchAllRows(supabase.from("book_order_items").select("*").order("created_at")),
  ]);
  const teacherId = me.data?.id;
  const [l, b] = await Promise.all([
    fetchAllRows(supabase.from("lessons").select("*").eq("teacher_id", teacherId).order("date").order("time")),
    supabase.from("blocked_dates").select("*").eq("teacher_id", teacherId).order("date"),
  ]);
  return {
    me: me.data, students: s.data || [], teachers: allTeachers.data || [], lessons: l.data || [],
    blockedDates: b.data || [], holidays: h.data || [], openForCover: (cov.data || []).filter((x) => x.teacher_id !== teacherId),
    teacherRates: tr.data || [], studentInstruments: si.data || [], lessonPlans: lp.data || [],
    bookItems: bi.data || [], bookOrders: (bo.data || []).filter((o) => o.teacher_id === teacherId),
    bookOrderItems: boi.data || [],
  };
}

function EditLessonForm({ lesson, data, onSave, onCancel }) {
  const [form, setForm] = useState({ date: lesson.date, time: lesson.time.slice(0, 5), duration: lesson.duration_min || 30 });
  const clashes = findClashes(data.lessons, { date: form.date, time: form.time, duration: form.duration, teacherId: data.me.id, excludeId: lesson.id });
  return (
    <div style={{ marginTop: 8, padding: 10, border: "1px solid " + COLORS.border, borderRadius: 8 }}>
      <Field label="Date"><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={inputStyle} /></Field>
      <Field label="Time"><input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} style={inputStyle} /></Field>
      <Field label="Duration (min)"><input type="number" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} style={inputStyle} /></Field>
      {clashes.length > 0 && <div style={{ fontSize: 12, color: COLORS.danger, marginBottom: 10 }}>Clashes with {clashes.length} other lesson{clashes.length > 1 ? "s" : ""} of yours at this time.</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <Btn small variant="teacher" onClick={() => onSave(form)}>Save</Btn>
        <Btn small onClick={onCancel}>Cancel</Btn>
      </div>
    </div>
  );
}

function DayModal({ date, data, refresh, onClose }) {
  const [absentModal, setAbsentModal] = useState(null);
  const [coverModal, setCoverModal] = useState(null);
  const [notAvailableModal, setNotAvailableModal] = useState(null);
  const [planModal, setPlanModal] = useState(null);
  const [reason, setReason] = useState("");
  const [planForm, setPlanForm] = useState({ date: "", what: "", remarks: "" });
  const [editingId, setEditingId] = useState(null);
  const [openSlotFor, setOpenSlotFor] = useState(null);
  const lessons = data.lessons.filter((l) => l.date === date).sort((a, b) => a.time.localeCompare(b.time));
  const studentName = (id) => data.students.find((s) => s.id === id)?.name || "—";
  const blocked = data.blockedDates.find((b) => b.date === date);
  const holiday = data.holidays.find((h) => h.date === date);

  const setStatus = async (id, status, reasonText) => {
    const { error } = await supabase.from("lessons").update({ status, reason: reasonText }).eq("id", id);
    if (error) { alert(`Couldn't save — ${error.message}`); return; }
    refresh();
  };
  const saveEdit = async (id, form) => {
    const { error } = await supabase.from("lessons").update({ date: form.date, time: form.time, duration_min: Number(form.duration) }).eq("id", id);
    if (error) { alert(`Couldn't save the new time — ${error.message}`); return; }
    setEditingId(null); refresh();
  };
  // Mirrors the admin side: undoing a reschedule deletes the replacement
  // slot(s) it created and puts the original back to "missed-teacher", not
  // "scheduled" — the teacher is still unavailable for it, it just needs a
  // different replacement arranged. Refuses if the replacement has already
  // progressed past "scheduled".
  const undoReschedule = async (originalId) => {
    const replacements = data.lessons.filter((r) => r.replacement_of === originalId);
    if (!replacements.length || !replacements.every((r) => r.status === "scheduled")) return;
    const { error: delErr } = await supabase.from("lessons").delete().in("id", replacements.map((r) => r.id));
    if (delErr) { alert(`Couldn't undo — ${delErr.message}`); return; }
    const { error: updErr } = await supabase.from("lessons").update({ status: "missed-teacher" }).eq("id", originalId);
    if (updErr) { alert(`Couldn't undo — ${updErr.message}`); return; }
    refresh();
  };
  const [editingPlanId, setEditingPlanId] = useState(null);
  const savePlan = async (studentId) => {
    if (!planForm.what.trim()) return;
    if (editingPlanId) {
      await supabase.from("lesson_plans").update({ date: planForm.date, what_to_teach: planForm.what.trim(), remarks: planForm.remarks.trim() || null }).eq("id", editingPlanId);
    } else {
      await supabase.from("lesson_plans").insert({ student_id: studentId, date: planForm.date, what_to_teach: planForm.what.trim(), remarks: planForm.remarks.trim() || null });
    }
    setPlanModal(null); setEditingPlanId(null); setPlanForm({ date: "", what: "", remarks: "" }); refresh();
  };
  const removePlan = async (id) => {
    if (!confirm("Remove this teaching plan entry?")) return;
    await supabase.from("lesson_plans").delete().eq("id", id); refresh();
  };

  const compactBtn = { padding: "3px 8px", fontSize: 11.5, borderRadius: 6 };

  return (
    <>
    <Modal title={fmtDate(date)} onClose={onClose} accent={COLORS.teacher} maxWidth={480}>
      {holiday && <div style={{ marginBottom: 12, padding: "8px 12px", background: COLORS.dangerBg, borderRadius: 8, fontSize: 13, color: COLORS.dangerDark }}>Studio closed{holiday.reason ? ` — ${holiday.reason}` : ""}</div>}
      {blocked && <div style={{ marginBottom: 12, padding: "8px 12px", background: COLORS.amberBg, borderRadius: 8, fontSize: 13, color: COLORS.amberDark }}>You blocked this day{blocked.reason ? ` — ${blocked.reason}` : ""}</div>}

      {lessons.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, ...(holiday ? { background: "rgba(199, 68, 64, 0.06)", borderRadius: 10, padding: "6px 8px" } : {}) }}>
          {lessons.map((l) => {
            const recentPlans = data.lessonPlans.filter((p) => p.student_id === l.student_id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 2);
            const panelOpen = editingId === l.id || coverModal === l.id || absentModal === l.id || notAvailableModal === l.id || planModal === l.id;
            return (
              <div key={l.id} style={{ padding: "9px 4px", borderTop: "1px solid " + COLORS.border }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 4 }}>
                  <div>
                    <div style={{ fontSize: 13 }}>
                      <span style={{ fontWeight: 700 }}>{l.time.slice(0, 5)}–{addMinutes(l.time, l.duration_min || 30)}</span>{" "}
                      <span style={{ fontWeight: 600 }}>{studentName(l.student_id)}</span>
                    </div>
                    {(l.instrument || l.room) && (
                      <div style={{ color: COLORS.inkSoft, fontSize: 11 }}>{l.instrument}{l.instrument && l.room ? " · " : ""}{l.room}</div>
                    )}
                    {l.replacement_of && (() => {
                      const o = data.lessons.find((x) => x.id === l.replacement_of);
                      return o ? <div style={{ color: COLORS.teacher, fontSize: 11 }}>Replacing {fmtDate(o.date)} {o.time.slice(0, 5)}</div> : null;
                    })()}
                  </div>
                  <Badge tone={statusTone(l.status)}>{lessonStatusLabel(l)}</Badge>
                </div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {l.status === "scheduled" && (
                    <>
                      <Btn small variant="teacher" style={compactBtn} onClick={() => setStatus(l.id, "attended")}>Attended</Btn>
                      <Btn small variant="danger" style={compactBtn} onClick={() => { setAbsentModal(l.id); setCoverModal(null); setEditingId(null); setPlanModal(null); setNotAvailableModal(null); setReason(""); }}>Absent</Btn>
                      <Btn small style={compactBtn} onClick={() => { setCoverModal(l.id); setAbsentModal(null); setEditingId(null); setPlanModal(null); setNotAvailableModal(null); setReason(""); }}>Ask for cover</Btn>
                      <Btn small style={compactBtn} onClick={() => { setEditingId(l.id); setAbsentModal(null); setCoverModal(null); setPlanModal(null); setNotAvailableModal(null); }}>Adjust time</Btn>
                      <Btn small variant="danger" style={compactBtn} onClick={() => { setNotAvailableModal(l.id); setAbsentModal(null); setCoverModal(null); setEditingId(null); setPlanModal(null); setReason(""); }}>Not available</Btn>
                    </>
                  )}
                  {(l.status === "attended" || l.status === "absent" || l.status === "missed-teacher" || l.status === "needs-cover") && (
                    <Btn small style={compactBtn} onClick={() => setStatus(l.id, "scheduled", null)}>Undo</Btn>
                  )}
                  {l.status === "cancelled" && (
                    holiday && l.reason === (holiday.reason || "Public holiday") ? (
                      <Btn small style={compactBtn} onClick={() => { setOpenSlotFor(l); setEditingId(null); setAbsentModal(null); setCoverModal(null); setNotAvailableModal(null); setPlanModal(null); }}>Open for replacement</Btn>
                    ) : (
                      <Btn small style={compactBtn} onClick={() => setStatus(l.id, "scheduled", null)}>Undo</Btn>
                    )
                  )}
                  {l.status === "scheduled" && l.replacement_of && (
                    <Btn small style={compactBtn} onClick={() => undoReschedule(l.replacement_of)}>Undo replacement</Btn>
                  )}
                  {l.status === "rescheduled" && (() => {
                    const canUndo = data.lessons.filter((r) => r.replacement_of === l.id).every((r) => r.status === "scheduled") && data.lessons.some((r) => r.replacement_of === l.id);
                    return <Btn small style={compactBtn} disabled={!canUndo} onClick={() => undoReschedule(l.id)}>Undo</Btn>;
                  })()}
                  <Btn small variant="teacher" style={compactBtn} onClick={() => { setPlanModal(l.id); setAbsentModal(null); setCoverModal(null); setEditingId(null); setNotAvailableModal(null); setEditingPlanId(null); setPlanForm({ date: l.date, what: "", remarks: "" }); }}>New plan</Btn>
                </div>
                {l.status === "rescheduled" && (() => {
                  const replacements = data.lessons.filter((r) => r.replacement_of === l.id);
                  return replacements.length > 0 ? (
                    <div style={{ fontSize: 11, color: COLORS.inkSoft, marginTop: 4 }}>Rescheduled to {replacements.map((r) => `${fmtDate(r.date)} ${r.time.slice(0, 5)}`).join(", ")}</div>
                  ) : null;
                })()}
                {recentPlans.length > 0 && (
                  <div style={{ fontSize: 11, color: COLORS.inkSoft, marginTop: 6, display: "flex", flexDirection: "column", gap: 2 }}>
                    {recentPlans.map((p) => (
                      <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                        <span>Planned {fmtDate(p.date)}: {p.what_to_teach}{p.remarks ? ` — ${p.remarks}` : ""}</span>
                        <span style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                          <a href="#" onClick={(e) => { e.preventDefault(); setPlanModal(l.id); setAbsentModal(null); setCoverModal(null); setEditingId(null); setEditingPlanId(p.id); setPlanForm({ date: p.date, what: p.what_to_teach, remarks: p.remarks || "" }); }} style={{ color: COLORS.teacher }}>Edit</a>
                          <a href="#" onClick={(e) => { e.preventDefault(); removePlan(p.id); }} style={{ color: COLORS.danger }}>Remove</a>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {panelOpen && (
                  <div>
                    {editingId === l.id && (
                      <EditLessonForm lesson={l} data={data} onSave={(form) => saveEdit(l.id, form)} onCancel={() => setEditingId(null)} />
                    )}
                    {coverModal === l.id && (
                      <div style={{ marginTop: 4, padding: 10, border: "1px solid " + COLORS.border, borderRadius: 8 }}>
                        <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 8 }}>This opens the slot for another teacher to pick up. You'll stop seeing it here until claimed.</div>
                        <input value={reason} onChange={(e) => setReason(e.target.value)} style={{ ...inputStyle, marginBottom: 8 }} placeholder="Reason (optional)" />
                        <div style={{ display: "flex", gap: 8 }}>
                          <Btn small variant="teacher" onClick={() => { setStatus(l.id, "needs-cover", reason); setCoverModal(null); setReason(""); }}>Confirm</Btn>
                          <Btn small onClick={() => setCoverModal(null)}>Cancel</Btn>
                        </div>
                      </div>
                    )}
                    {absentModal === l.id && (
                      <div style={{ marginTop: 4, padding: 10, border: "1px solid " + COLORS.border, borderRadius: 8 }}>
                        <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 8 }}>What happened? The studio will decide on a replacement.</div>
                        <input value={reason} onChange={(e) => setReason(e.target.value)} style={{ ...inputStyle, marginBottom: 8 }} placeholder="Reason (e.g. student sick, I was unwell)" />
                        <div style={{ display: "flex", gap: 8 }}>
                          <Btn small variant="danger" onClick={() => { setStatus(l.id, "absent", reason); setAbsentModal(null); setReason(""); }}>Confirm absent</Btn>
                          <Btn small onClick={() => { setAbsentModal(null); setReason(""); }}>Cancel</Btn>
                        </div>
                      </div>
                    )}
                    {notAvailableModal === l.id && (
                      <div style={{ marginTop: 4, padding: 10, border: "1px solid " + COLORS.border, borderRadius: 8 }}>
                        <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 8 }}>Marks this as your side, not the student's — the studio will arrange the student a replacement lesson.</div>
                        <input value={reason} onChange={(e) => setReason(e.target.value)} style={{ ...inputStyle, marginBottom: 8 }} placeholder="Reason (optional)" />
                        <div style={{ display: "flex", gap: 8 }}>
                          <Btn small variant="danger" onClick={() => { setStatus(l.id, "missed-teacher", reason); setNotAvailableModal(null); setReason(""); }}>Confirm</Btn>
                          <Btn small onClick={() => { setNotAvailableModal(null); setReason(""); }}>Cancel</Btn>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: COLORS.inkSoft }}>No lessons on this day.</div>
      )}
    </Modal>

    {openSlotFor && <TeacherOpenSlotModal slot={openSlotFor} data={data} refresh={refresh} onClose={() => setOpenSlotFor(null)} onRestore={() => { setStatus(openSlotFor.id, "scheduled", null); setOpenSlotFor(null); }} />}

    {planModal && (() => {
      const l = lessons.find((x) => x.id === planModal);
      if (!l) return null;
      return (
        <Modal title={`${editingPlanId ? "Edit" : "New"} teaching plan — ${studentName(l.student_id)}`} onClose={() => { setPlanModal(null); setEditingPlanId(null); }} accent={COLORS.teacher}>
          <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 12 }}>What to cover next — visible to the studio too.</div>
          <Field label="Date"><input type="date" value={planForm.date} onChange={(e) => setPlanForm({ ...planForm, date: e.target.value })} style={{ ...inputStyle, marginBottom: 10 }} /></Field>
          <Field label="What to teach"><textarea value={planForm.what} onChange={(e) => setPlanForm({ ...planForm, what: e.target.value })} style={{ ...inputStyle, marginBottom: 10, minHeight: 100 }} placeholder="e.g. C major scale, hands together, review last week's piece" /></Field>
          <Field label="Remarks (optional)"><input value={planForm.remarks} onChange={(e) => setPlanForm({ ...planForm, remarks: e.target.value })} style={{ ...inputStyle, marginBottom: 12 }} /></Field>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="teacher" onClick={() => savePlan(l.student_id)}>{editingPlanId ? "Update plan" : "Save plan"}</Btn>
            <Btn onClick={() => { setPlanModal(null); setEditingPlanId(null); }}>Cancel</Btn>
          </div>
        </Modal>
      );
    })()}
    </>
  );
}

// Same idea as the admin version: this slot is free now, so either give it
// back to the student it originally belonged to, or use it to clear a
// different missed lesson (any date, past or future) still owed. Since this
// runs on the teacher's own page, it's already scoped to just their own
// lessons — no need to filter by teacher.
function TeacherOpenSlotModal({ slot, data, refresh, onClose, onRestore }) {
  const studentName = (id) => data.students.find((s) => s.id === id)?.name || "—";
  const owed = data.lessons.filter((l) => l.status === "missed-teacher");
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState({ date: slot.date, time: slot.time.slice(0, 5), duration: slot.duration_min || 30 });
  const chosen = owed.find((l) => l.id === selectedId);

  const existingReplacements = chosen ? data.lessons.filter((r) => r.replacement_of === chosen.id) : [];
  const alreadyArrangedMin = existingReplacements.reduce((sum, r) => sum + (r.duration_min || 0), 0);
  const remainingMin = chosen ? Math.max(0, (chosen.duration_min || 30) - alreadyArrangedMin) : 0;
  const newMin = Number(form.duration) || 0;
  const stillOwedAfter = Math.max(0, remainingMin - newMin);

  const fillSlot = async () => {
    if (!chosen) return;
    const finalStatus = stillOwedAfter > 0 ? "missed-teacher" : "rescheduled";
    const { error: insertError } = await supabase.from("lessons").insert({
      date: form.date, time: form.time, teacher_id: slot.teacher_id, student_id: chosen.student_id,
      price: chosen.price, duration_min: Number(form.duration), status: "scheduled", replacement_of: chosen.id,
      instrument: chosen.instrument || null, room: chosen.room || null,
    });
    if (insertError) { alert("Couldn't save the replacement lesson: " + insertError.message); return; }
    const { error: updateError } = await supabase.from("lessons").update({ status: finalStatus }).eq("id", chosen.id);
    if (updateError) { alert("Replacement was saved, but couldn't update the owed lesson's status: " + updateError.message); }
    // The old cancelled placeholder this slot came from is now spoken for —
    // leaving it sitting there next to the new replacement made it look like
    // nothing had happened and invited filling the same slot twice. Only
    // removed once the replacement is confirmed saved.
    const { error: deleteError } = await supabase.from("lessons").delete().eq("id", slot.id);
    if (deleteError) { alert("Replacement was saved, but couldn't clear the old freed slot: " + deleteError.message); }
    refresh(); onClose();
  };

  return (
    <Modal title="Open this slot" onClose={onClose} accent={COLORS.teacher}>
      <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 14 }}>
        {fmtDate(slot.date)} {slot.time.slice(0, 5)} · originally {studentName(slot.student_id)}'s {slot.instrument || "lesson"}
      </div>
      <div style={{ padding: 12, border: "1px solid " + COLORS.border, borderRadius: 8, marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Restore {studentName(slot.student_id)}'s own lesson</div>
        <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 10 }}>Puts this exact lesson back on the calendar, as if the holiday never cancelled it.</div>
        <Btn small variant="teacher" onClick={onRestore}>Restore this lesson</Btn>
      </div>
      <div style={{ padding: 12, border: "1px solid " + COLORS.border, borderRadius: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Or use it for a different missed lesson</div>
        <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 10 }}>Any lesson you still owe a replacement for — from any date, past or future.</div>
        {owed.length === 0 ? (
          <div style={{ fontSize: 12.5, color: COLORS.inkSoft }}>You don't have any other lessons waiting on a replacement right now.</div>
        ) : (
          <>
            <SearchableSelect
              options={owed.map((l) => ({ value: l.id, label: `${fmtDate(l.date)} — ${studentName(l.student_id)}${l.instrument ? ` (${l.instrument})` : ""}` }))}
              value={selectedId}
              onChange={setSelectedId}
              placeholder="Search by student or date…"
            />
            {chosen && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 8 }}>{remainingMin} min still owed for this lesson{existingReplacements.length > 0 ? ` (${alreadyArrangedMin} min already arranged elsewhere)` : ""}.</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 8 }}>
                  <Field label="Date"><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={inputStyle} /></Field>
                  <Field label="Time"><input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} style={inputStyle} /></Field>
                </div>
                <Field label="Duration (min)"><input type="number" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} style={inputStyle} /></Field>
                {stillOwedAfter > 0 ? (
                  <div style={{ fontSize: 12, color: COLORS.amberDark, marginBottom: 10 }}>This covers {newMin} of the {remainingMin} remaining minute(s) — {stillOwedAfter} min will still be owed after saving.</div>
                ) : (
                  <div style={{ fontSize: 12, color: COLORS.successDark, marginBottom: 10 }}>This fully covers the missed lesson.</div>
                )}
                <Btn variant="danger" style={{ width: "100%" }} onClick={fillSlot}>Fill this slot</Btn>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

function SelfRescheduleModal({ lesson, data, refresh, onClose }) {
  const studentName = data.students.find((s) => s.id === lesson.student_id)?.name || "—";
  const existingReplacements = data.lessons.filter((r) => r.replacement_of === lesson.id);
  const alreadyArrangedMin = existingReplacements.reduce((sum, r) => sum + (r.duration_min || 0), 0);
  const remainingMin = Math.max(0, (lesson.duration_min || 30) - alreadyArrangedMin);
  const [form, setForm] = useState({ date: todayIso(), time: "15:00", duration: remainingMin || lesson.duration_min || 30 });
  const clashes = findClashes(data.lessons, { date: form.date, time: form.time, duration: form.duration, teacherId: data.me.id, excludeId: lesson.id });
  const stillOwedAfter = Math.max(0, remainingMin - (Number(form.duration) || 0));
  const confirm = async () => {
    // Same rule as the admin side: only fully resolved once total arranged
    // time covers the original — otherwise it stays "missed-teacher" so the
    // remaining time is still visible and arrangeable, not silently dropped.
    const finalStatus = stillOwedAfter > 0 ? "missed-teacher" : "rescheduled";
    const { error: insertError } = await supabase.from("lessons").insert({
      date: form.date, time: form.time, teacher_id: data.me.id, student_id: lesson.student_id,
      price: lesson.price, duration_min: Number(form.duration), status: "scheduled", replacement_of: lesson.id,
      instrument: lesson.instrument || null, room: lesson.room || null,
    });
    if (insertError) { alert("Couldn't save the replacement lesson: " + insertError.message); return; }
    const { error: updateError } = await supabase.from("lessons").update({ status: finalStatus }).eq("id", lesson.id);
    if (updateError) alert("Replacement was saved, but couldn't update the original lesson's status: " + updateError.message);
    refresh(); onClose();
  };
  return (
    <Modal title={`Reschedule ${studentName}'s lesson`} onClose={onClose} accent={COLORS.teacher}>
      <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 10 }}>{lesson.status === "cancelled" ? "Holiday-cancelled lesson was" : "Missed lesson was"} {lesson.duration_min || 30} min.</div>
      {existingReplacements.length > 0 && (
        <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 10, padding: "8px 10px", background: COLORS.card, border: "1px solid " + COLORS.border, borderRadius: 8 }}>
          Already arranged: {existingReplacements.map((r) => `${fmtDate(r.date)} ${r.time.slice(0, 5)} (${r.duration_min} min)`).join(", ")} — {remainingMin} min still owed.
        </div>
      )}
      <Field label="New date"><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={inputStyle} /></Field>
      {data.holidays.find((h) => h.date === form.date) && (
        <div style={{ fontSize: 12, color: COLORS.amberDark, marginBottom: 10 }}>
          {fmtDate(form.date)} is a public holiday ({data.holidays.find((h) => h.date === form.date).reason}) — the studio is normally closed. Only continue if you're actually available that day.
        </div>
      )}
      <Field label="New time"><input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} style={inputStyle} /></Field>
      <Field label="Duration (min)"><input type="number" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} style={inputStyle} /></Field>
      {clashes.length > 0 && <div style={{ fontSize: 12, color: COLORS.danger, marginBottom: 10 }}>Clashes with another lesson of yours at this time.</div>}
      {stillOwedAfter > 0 ? (
        <div style={{ fontSize: 12, color: COLORS.amberDark, marginBottom: 10 }}>{stillOwedAfter} min will still be owed after this — you (or the studio) can arrange that separately later.</div>
      ) : (
        <div style={{ fontSize: 12, color: COLORS.successDark, marginBottom: 10 }}>This fully covers the missed lesson.</div>
      )}
      <Btn variant="teacher" style={{ width: "100%" }} onClick={confirm}>Confirm reschedule</Btn>
    </Modal>
  );
}

function CalendarTab({ data, refresh }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [openDate, setOpenDate] = useState(null);
  const [rescheduling, setRescheduling] = useState(null);
  const [handingOff, setHandingOff] = useState(null);
  const [handoffReason, setHandoffReason] = useState("");
  const [suggesting, setSuggesting] = useState(null);
  const [suggestForm, setSuggestForm] = useState({ date: todayIso(), time: "15:00", note: "" });
  const [viewReplaceDate, setViewReplaceDate] = useState(null);
  const cells = useMemo(() => isoMonthDays(cursor.y, cursor.m), [cursor]);
  const today = todayIso();
  const lessonsByDate = useMemo(() => {
    const m = {};
    data.lessons.forEach((l) => { m[l.date] = (m[l.date] || 0) + 1; });
    return m;
  }, [data.lessons]);
  const pendingDates = useMemo(() => {
    const s = new Set();
    data.lessons.forEach((l) => { if (l.status === "absent" || l.status === "needs-cover") s.add(l.date); });
    return s;
  }, [data.lessons]);
  const blockedSet = useMemo(() => new Set(data.blockedDates.map((b) => b.date)), [data.blockedDates]);
  const holidaySet = useMemo(() => new Set(data.holidays.map((h) => h.date)), [data.holidays]);
  const monthLabel = new Date(cursor.y, cursor.m, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const owedByMe = data.lessons.filter((l) => l.status === "missed-teacher");
  const owedByDate = useMemo(() => {
    const groups = new Map();
    owedByMe.forEach((l) => {
      if (!groups.has(l.date)) groups.set(l.date, []);
      groups.get(l.date).push(l);
    });
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [owedByMe]);
  const awaitingDecision = data.lessons.filter((l) => l.status === "absent");
  const studentName = (id) => data.students.find((s) => s.id === id)?.name || "—";
  const handOff = async (id) => { await supabase.from("lessons").update({ status: "needs-cover", reason: handoffReason }).eq("id", id); setHandingOff(null); setHandoffReason(""); refresh(); };
  const submitSuggestion = async (id) => {
    await supabase.from("lessons").update({ suggested_date: suggestForm.date, suggested_time: suggestForm.time, suggested_note: suggestForm.note || null }).eq("id", id);
    setSuggesting(null); setSuggestForm({ date: todayIso(), time: "15:00", note: "" }); refresh();
  };

  return (
    <div>
      {(owedByMe.length > 0 || awaitingDecision.length > 0 || data.openForCover.length > 0) && (
        <Card style={{ marginBottom: 14, background: COLORS.dangerBg, border: "none" }}>
          {awaitingDecision.length > 0 && (
            <div style={{ marginBottom: (owedByMe.length > 0 || data.openForCover.length > 0) ? 10 : 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: COLORS.dangerDark, marginBottom: 6 }}>
                {awaitingDecision.length} lesson{awaitingDecision.length > 1 ? "s" : ""} awaiting the studio's decision
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {awaitingDecision.map((l) => (
                  <div key={l.id} style={{ fontSize: 12, color: COLORS.dangerDark }}>
                    {fmtDate(l.date)} · {studentName(l.student_id)}{l.reason ? ` — ${l.reason}` : ""}
                  </div>
                ))}
              </div>
            </div>
          )}
          {owedByMe.length > 0 && (
            <div style={{ marginBottom: data.openForCover.length > 0 ? 10 : 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: COLORS.dangerDark, marginBottom: 6 }}>
                {owedByMe.length} lesson{owedByMe.length > 1 ? "s" : ""} still need{owedByMe.length === 1 ? "s" : ""} a replacement
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {owedByDate.map(([date, lessons]) => (
                  <a key={date} href="#" onClick={(e) => { e.preventDefault(); setViewReplaceDate(date); }}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: "#fff", borderRadius: 8, fontSize: 12.5, color: COLORS.dangerDark, textDecoration: "none" }}>
                    <span style={{ fontWeight: 600 }}>{fmtDate(date)}</span>
                    <span>{lessons.length} lesson{lessons.length > 1 ? "s" : ""} →</span>
                  </a>
                ))}
              </div>
            </div>
          )}
          {data.openForCover.length > 0 && (
            <div style={{ fontSize: 12, color: COLORS.dangerDark }}>
              {data.openForCover.length} open cover request{data.openForCover.length > 1 ? "s" : ""} from other teachers — see the "Open for cover" tab.
            </div>
          )}
        </Card>
      )}
      {rescheduling && <SelfRescheduleModal lesson={rescheduling} data={data} refresh={refresh} onClose={() => setRescheduling(null)} />}

      {viewReplaceDate && (() => {
        const lessons = (owedByDate.find(([d]) => d === viewReplaceDate) || [null, []])[1];
        return (
          <Modal title={`${fmtDate(viewReplaceDate)} — needs a replacement`} onClose={() => setViewReplaceDate(null)} accent={COLORS.teacher}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {lessons.map((l) => {
                const existingReplacements = data.lessons.filter((r) => r.replacement_of === l.id);
                const arrangedMin = existingReplacements.reduce((sum, r) => sum + (r.duration_min || 0), 0);
                const remainingMin = Math.max(0, (l.duration_min || 30) - arrangedMin);
                return (
                <div key={l.id} style={{ padding: "8px 10px", background: COLORS.dangerBg, borderRadius: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6, fontSize: 12.5, color: COLORS.dangerDark, fontWeight: 600, marginBottom: 6 }}>
                    <span>{studentName(l.student_id)}</span>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <Btn small variant="teacher" onClick={() => { setSuggesting(l.id); setHandingOff(null); setSuggestForm({ date: todayIso(), time: "15:00", note: "" }); }}>Suggest a time</Btn>
                    <Btn small onClick={() => setRescheduling(l)}>{existingReplacements.length > 0 ? `Reschedule remaining ${remainingMin} min` : "Reschedule myself"}</Btn>
                    <Btn small onClick={() => { setHandingOff(l.id); setSuggesting(null); setHandoffReason(""); }}>Ask another teacher</Btn>
                  </div>
                  {existingReplacements.length > 0 && (
                    <div style={{ fontSize: 11.5, color: COLORS.dangerDark, marginTop: 6 }}>
                      Already arranged: {existingReplacements.map((r) => `${fmtDate(r.date)} ${r.time.slice(0, 5)} (${r.duration_min} min)`).join(", ")} — {remainingMin} min still owed.
                    </div>
                  )}
                  {l.suggested_date && l.suggested_time && (
                    <div style={{ fontSize: 11.5, color: COLORS.dangerDark, marginTop: 6 }}>
                      You suggested {fmtDate(l.suggested_date)} · {l.suggested_time.slice(0, 5)}{l.suggested_note ? ` — ${l.suggested_note}` : ""}. Waiting on the studio to confirm with the student.
                    </div>
                  )}
                  {suggesting === l.id && (
                    <div style={{ marginTop: 8, padding: 10, background: "#fff", borderRadius: 8 }}>
                      <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 8 }}>Times you're free for this — the studio will confirm with {studentName(l.student_id)} and finalize it.</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                        <input type="date" value={suggestForm.date} onChange={(e) => setSuggestForm({ ...suggestForm, date: e.target.value })} style={inputStyle} />
                        <input type="time" value={suggestForm.time} onChange={(e) => setSuggestForm({ ...suggestForm, time: e.target.value })} style={inputStyle} />
                      </div>
                      <input value={suggestForm.note} onChange={(e) => setSuggestForm({ ...suggestForm, note: e.target.value })} style={{ ...inputStyle, marginBottom: 8 }} placeholder="Note (optional)" />
                      <div style={{ display: "flex", gap: 8 }}>
                        <Btn small variant="teacher" onClick={() => submitSuggestion(l.id)}>Send suggestion</Btn>
                        <Btn small onClick={() => setSuggesting(null)}>Cancel</Btn>
                      </div>
                    </div>
                  )}
                  {handingOff === l.id && (
                    <div style={{ marginTop: 8, padding: 10, background: "#fff", borderRadius: 8 }}>
                      <input value={handoffReason} onChange={(e) => setHandoffReason(e.target.value)} style={{ ...inputStyle, marginBottom: 8 }} placeholder="Reason (optional)" />
                      <div style={{ display: "flex", gap: 8 }}>
                        <Btn small variant="teacher" onClick={() => handOff(l.id)}>Confirm</Btn>
                        <Btn small onClick={() => setHandingOff(null)}>Cancel</Btn>
                      </div>
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          </Modal>
        );
      })()}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontFamily: "Fraunces, Georgia, serif", fontWeight: 600, fontSize: 17 }}>{monthLabel}</div>
          <div style={{ display: "flex", gap: 6 }}>
            <Btn small onClick={() => setCursor((c) => c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 })}>‹</Btn>
            <Btn small onClick={() => { const d = new Date(); setCursor({ y: d.getFullYear(), m: d.getMonth() }); }}>Today</Btn>
            <Btn small onClick={() => setCursor((c) => c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 })}>›</Btn>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, fontSize: 11, fontWeight: 700, color: COLORS.inkSoft, textAlign: "center", marginBottom: 4 }}>
          {WEEKDAY_LABELS.map((w) => <div key={w}>{w}</div>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 4 }}>
          {cells.map((iso, i) => {
            if (!iso) return <div key={i} />;
            const count = lessonsByDate[iso] || 0;
            const isPending = pendingDates.has(iso);
            const isToday = iso === today;
            const isUnavailable = blockedSet.has(iso) || holidaySet.has(iso);
            return (
              <button key={iso} onClick={() => setOpenDate(iso)} style={{
                aspectRatio: "1", border: "1px solid " + (isPending ? COLORS.amberDark : isUnavailable ? COLORS.dangerBg : COLORS.border), borderRadius: 8, cursor: "pointer",
                background: isToday ? COLORS.ink : isUnavailable ? COLORS.dangerBg : "#fff",
                color: isToday ? "#fff" : isUnavailable ? COLORS.dangerDark : COLORS.ink,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, fontFamily: "inherit",
              }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{Number(iso.slice(8, 10))}</span>
                {isPending && <span style={{ width: 4, height: 4, borderRadius: 999, background: isToday ? "#fff" : COLORS.amberDark }} />}
                {!isPending && count > 0 && <span style={{ width: 4, height: 4, borderRadius: 999, background: isToday ? "#fff" : COLORS.teacher }} />}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 12, fontSize: 11, color: COLORS.inkSoft, flexWrap: "wrap" }}>
          <span>● has lessons</span><span style={{ color: COLORS.amberDark }}>● pending review</span><span style={{ color: COLORS.dangerDark }}>■ unavailable</span>
        </div>
      </Card>

      {openDate && <DayModal date={openDate} data={data} refresh={refresh} onClose={() => setOpenDate(null)} />}
    </div>
  );
}

function CoverTab({ data, refresh }) {
  const studentName = (id) => data.students.find((s) => s.id === id)?.name || "—";
  const teacherName = (id) => data.teachers.find((t) => t.id === id)?.name || "—";
  const claim = async (lessonId) => {
    const { error } = await supabase.from("lessons").update({ status: "scheduled", teacher_id: data.me.id }).eq("id", lessonId);
    if (error) { alert("Couldn't claim this lesson: " + error.message); return; }
    refresh();
  };
  return (
    <div>
      <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 14 }}>Open slots other teachers have asked for help covering. Claim one to take it over.</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {data.openForCover.map((l) => (
          <Card key={l.id} style={{ padding: "12px 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontSize: 13 }}>
                <strong>{fmtDate(l.date)}</strong> · {l.time.slice(0, 5)}–{addMinutes(l.time, l.duration_min || 30)} · {studentName(l.student_id)}
                <div style={{ color: COLORS.inkSoft, fontSize: 12 }}>Originally {teacherName(l.teacher_id)}{l.reason ? ` · ${l.reason}` : ""}</div>
              </div>
              <Btn small variant="teacher" onClick={() => claim(l.id)}>Claim this</Btn>
            </div>
          </Card>
        ))}
        {data.openForCover.length === 0 && <div style={{ fontSize: 13, color: COLORS.inkSoft }}>Nothing open right now.</div>}
      </div>
    </div>
  );
}

function BlockedTab({ data, teacherId, refresh }) {
  const [form, setForm] = useState({ from: todayIso(), to: "", reason: "" });
  // Any of this teacher's plain "scheduled" lessons sitting on a date they
  // just blocked need to become the studio's problem to solve, not silently
  // stay booked as if nothing changed — flipping them to "missed-teacher"
  // puts them in the same pending-replacement queue as any other missed
  // lesson, so admin can arrange a replacement whenever suits them, even
  // months ahead of the actual date.
  const flipToMissedTeacher = async (dates, reasonText) => {
    if (!dates.length) return;
    const candidates = data.lessons.filter((l) => l.teacher_id === teacherId && l.status === "scheduled" && dates.includes(l.date));
    if (candidates.length) {
      await supabase.from("lessons").update({ status: "missed-teacher", reason: reasonText || "Teacher unavailable (blocked date)" }).in("id", candidates.map((l) => l.id));
    }
  };
  // The mirror image: if the block goes away before anything was arranged
  // for the lesson (no replacement created yet), put it back exactly as it
  // was rather than leaving it stuck saying "missed" for no reason.
  const revertToScheduled = async (dates) => {
    if (!dates.length) return;
    const candidates = data.lessons.filter((l) => l.teacher_id === teacherId && l.status === "missed-teacher" && dates.includes(l.date) && !data.lessons.some((r) => r.replacement_of === l.id));
    if (candidates.length) {
      await supabase.from("lessons").update({ status: "scheduled", reason: null }).in("id", candidates.map((l) => l.id));
    }
  };
  const addBlock = async (e) => {
    e.preventDefault();
    const from = form.from;
    const to = form.to || form.from;
    if (to < from) return;
    const dates = [];
    let cur = from;
    let guard = 0;
    while (cur <= to && guard < 366) { dates.push(cur); cur = addDays(cur, 1); guard += 1; }
    const existing = new Set(data.blockedDates.map((b) => b.date));
    const toInsert = dates.filter((d) => !existing.has(d));
    if (toInsert.length > 0) {
      await supabase.from("blocked_dates").insert(toInsert.map((date) => ({ teacher_id: teacherId, date, reason: form.reason || null })));
      await flipToMissedTeacher(toInsert, form.reason);
    }
    setForm({ from: todayIso(), to: "", reason: "" }); refresh();
  };
  const removeBlock = async (ids) => {
    const dates = data.blockedDates.filter((b) => ids.includes(b.id)).map((b) => b.date);
    await supabase.from("blocked_dates").delete().in("id", ids);
    await revertToScheduled(dates);
    refresh();
  };

  // Group consecutive dates sharing the same reason into one range for display.
  const sorted = [...data.blockedDates].sort((a, b) => a.date.localeCompare(b.date));
  const groups = [];
  sorted.forEach((b) => {
    const last = groups[groups.length - 1];
    if (last && last.reason === (b.reason || "") && addDays(last.to, 1) === b.date) {
      last.to = b.date; last.ids.push(b.id);
    } else {
      groups.push({ from: b.date, to: b.date, reason: b.reason || "", ids: [b.id] });
    }
  });

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <form onSubmit={addBlock} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 140px" }}><Field label="From"><input type="date" required value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} style={inputStyle} /></Field></div>
          <div style={{ flex: "1 1 140px" }}><Field label="To (optional)"><input type="date" min={form.from} value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} style={inputStyle} placeholder="Same day if blank" /></Field></div>
          <div style={{ flex: "2 1 200px" }}><Field label="Reason (optional)"><input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} style={inputStyle} /></Field></div>
          <Btn type="submit" variant="teacher" style={{ marginBottom: 12 }}>Block date{form.to && form.to !== form.from ? "s" : ""}</Btn>
        </form>
      </Card>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {groups.map((g) => (
          <Card key={g.ids[0]} style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 13 }}>
              <strong>{g.from === g.to ? fmtDate(g.from) : `${fmtDate(g.from)} – ${fmtDate(g.to)}`}</strong>{g.reason ? ` — ${g.reason}` : ""}
            </div>
            <Btn small variant="danger" onClick={() => removeBlock(g.ids)}>Remove</Btn>
          </Card>
        ))}
        {groups.length === 0 && <div style={{ fontSize: 13, color: COLORS.inkSoft }}>No blocked dates.</div>}
      </div>
    </div>
  );
}

function DraftOrderCard({ order, items, data, refresh, studentName, isDraft }) {
  const [catalogItemId, setCatalogItemId] = useState("");
  const [catalogQty, setCatalogQty] = useState(1);
  const [catalogInstrumentFilter, setCatalogInstrumentFilter] = useState("");
  const [customName, setCustomName] = useState("");
  const [customQty, setCustomQty] = useState(1);
  const isCancelled = order.status === "cancelled";
  const isSubmitted = order.status === "submitted";
  const canCancel = isSubmitted && items.every((i) => i.status === "requested");
  const catalogInstruments = [...new Set(data.bookItems.map((b) => b.instrument).filter(Boolean))].sort();

  const addCatalogItem = async () => {
    const item = data.bookItems.find((b) => b.id === catalogItemId);
    if (!item) return;
    await supabase.from("book_order_items").insert({ order_id: order.id, book_item_id: item.id, quantity: Number(catalogQty) || 1, price: item.price });
    setCatalogItemId(""); setCatalogQty(1); refresh();
  };
  const addCustomItem = async () => {
    if (!customName.trim()) return;
    await supabase.from("book_order_items").insert({ order_id: order.id, custom_name: customName.trim(), quantity: Number(customQty) || 1, price: 0 });
    setCustomName(""); setCustomQty(1); refresh();
  };
  const removeItem = async (id) => { await supabase.from("book_order_items").delete().eq("id", id); refresh(); };
  const submitOrder = async () => {
    if (!confirm("Submit this order? You won't be able to edit or undo it afterward — add a new order for anything else.")) return;
    await supabase.from("book_orders").update({ status: "submitted", submitted_at: new Date().toISOString() }).eq("id", order.id);
    refresh();
  };
  const deleteDraft = async () => {
    if (!confirm("Delete this draft order?")) return;
    await supabase.from("book_orders").delete().eq("id", order.id);
    refresh();
  };
  const cancelOrder = async () => {
    const reason = prompt("Reason for cancelling (optional):", "");
    if (reason === null) return;
    const { error } = await supabase.from("book_orders").update({ status: "cancelled", note: reason || null }).eq("id", order.id);
    if (error) { alert("Couldn't cancel — the studio may have already started on this order. Check with them."); return; }
    refresh();
  };
  const requestCancel = async () => {
    const reason = prompt("Why do you want this order cancelled? The studio will review and confirm.", "");
    if (reason === null) return;
    await supabase.from("book_orders").update({ cancel_requested: true, cancel_reason: reason || null }).eq("id", order.id);
    refresh();
  };
  const withdrawCancelRequest = async () => {
    await supabase.from("book_orders").update({ cancel_requested: false, cancel_reason: null }).eq("id", order.id);
    refresh();
  };

  return (
    <Card style={{ marginBottom: 12, opacity: isCancelled ? 0.7 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {order.order_type === "student" ? `For ${studentName(order.student_id)}` : "Personal use"}
          <Badge tone={isDraft ? "gray" : isCancelled ? "danger" : "owner"}>{isDraft ? "Draft" : isCancelled ? "Cancelled" : "Submitted"}</Badge>
          {isSubmitted && order.cancel_requested && <Badge tone="amber">Cancellation requested</Badge>}
        </div>
        {isDraft && <Btn small variant="danger" onClick={deleteDraft}>Delete draft</Btn>}
        {isSubmitted && canCancel && <Btn small variant="danger" onClick={cancelOrder}>Cancel order</Btn>}
        {isSubmitted && !canCancel && !order.cancel_requested && <Btn small variant="danger" onClick={requestCancel}>Request cancellation</Btn>}
        {isSubmitted && order.cancel_requested && <Btn small onClick={withdrawCancelRequest}>Withdraw request</Btn>}
      </div>
      {isCancelled && order.note && <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 8 }}>Reason: {order.note}</div>}
      {isSubmitted && order.cancel_requested && <div style={{ fontSize: 12, color: COLORS.amberDark, marginBottom: 8 }}>Waiting on the studio to review{order.cancel_reason ? ` — you said: "${order.cancel_reason}"` : ""}.</div>}
      {isSubmitted && !canCancel && !order.cancel_requested && <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 8 }}>The studio has already started on this — request a cancellation and they'll review it.</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: isDraft ? 12 : 0 }}>
        {items.map((item) => {
          const bi = item.book_item_id ? data.bookItems.find((b) => b.id === item.book_item_id) : null;
          return (
            <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
              <span>{bi ? bi.name : item.custom_name}{!bi ? " (not in catalog)" : ""} × {item.quantity}</span>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {!isDraft && <Badge tone={item.status === "given" ? "success" : item.status === "received" ? "owner" : item.status === "ordered" ? "amber" : item.status === "rejected" ? "danger" : "gray"}>{item.status}</Badge>}
                {isDraft && <a href="#" onClick={(e) => { e.preventDefault(); removeItem(item.id); }} style={{ color: COLORS.danger, fontSize: 12 }}>Remove</a>}
              </span>
            </div>
          );
        })}
        {items.length === 0 && <div style={{ fontSize: 12, color: COLORS.inkSoft }}>No items yet.</div>}
      </div>
      {isDraft && (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8, alignItems: "flex-end" }}>
            <div style={{ width: 150 }}>
              <Field label="Instrument">
                <select value={catalogInstrumentFilter} onChange={(e) => { setCatalogInstrumentFilter(e.target.value); setCatalogItemId(""); }} style={inputStyle}>
                  <option value="">All instruments</option>
                  {catalogInstruments.map((ins) => (<option key={ins} value={ins}>{ins}</option>))}
                </select>
              </Field>
            </div>
            <div style={{ flex: "2 1 180px" }}>
              <Field label="From catalog">
                <SearchableSelect
                  options={data.bookItems
                    .filter((b) => !catalogInstrumentFilter || b.instrument === catalogInstrumentFilter)
                    .map((b) => ({ value: b.id, label: `${b.name}${b.instrument ? ` (${b.instrument})` : ""} · ${fmtMoney(b.price)} · ${b.stock_on_hand} on hand` }))}
                  value={catalogItemId}
                  onChange={setCatalogItemId}
                  placeholder="Type to search…"
                />
              </Field>
            </div>
            <div style={{ width: 70 }}><Field label="Qty"><input type="number" min="1" value={catalogQty} onChange={(e) => setCatalogQty(e.target.value)} style={inputStyle} /></Field></div>
            <Btn small onClick={addCatalogItem}>Add</Btn>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "flex-end" }}>
            <div style={{ flex: "2 1 180px" }}><Field label="Not in the list"><input value={customName} onChange={(e) => setCustomName(e.target.value)} style={inputStyle} placeholder="Item name" /></Field></div>
            <div style={{ width: 70 }}><Field label="Qty"><input type="number" min="1" value={customQty} onChange={(e) => setCustomQty(e.target.value)} style={inputStyle} /></Field></div>
            <Btn small onClick={addCustomItem}>Add</Btn>
          </div>
          <Btn variant="teacher" disabled={items.length === 0} onClick={submitOrder}>Submit order</Btn>
        </>
      )}
    </Card>
  );
}

function MyStudentsTab({ data, teacherId }) {
  const [search, setSearch] = useState("");

  // Every instrument this teacher personally teaches, whether it's a
  // student's primary instrument or an extra one — a student with another
  // instrument taught by someone else shouldn't show that part here.
  const myInstruments = [];
  data.students.forEach((s) => {
    if (s.course && s.teacher_id === teacherId) myInstruments.push({ studentId: s.id, course: s.course, level: s.level, billingType: s.billing_type, monthlyRate: s.monthly_rate, price: s.price, day: s.permanent_day, time: s.permanent_time, duration: s.duration_min, room: s.room, status: s.instrument_status || "active" });
  });
  data.studentInstruments.forEach((si) => {
    if (si.course && si.teacher_id === teacherId) myInstruments.push({ studentId: si.student_id, course: si.course, level: si.level, billingType: si.billing_type, monthlyRate: si.monthly_rate, price: si.price, day: si.permanent_day, time: si.permanent_time, duration: si.duration_min, room: si.room, status: si.status || "active" });
  });
  data.lessons.forEach((l) => {
    if (l.teacher_id === teacherId && !myInstruments.some((i) => i.studentId === l.student_id && i.course === l.instrument)) {
      myInstruments.push({ studentId: l.student_id, course: l.instrument || "—", level: null, billingType: "per_lesson", price: l.price, day: null, time: null, duration: l.duration_min, room: l.room, status: "active" });
    }
  });

  const byStudent = new Map();
  myInstruments.forEach((i) => {
    if (!byStudent.has(i.studentId)) byStudent.set(i.studentId, []);
    byStudent.get(i.studentId).push(i);
  });

  const studentName = (id) => data.students.find((s) => s.id === id)?.name || "—";
  const nextLesson = (studentId) => {
    const l = data.lessons.filter((x) => x.student_id === studentId && x.teacher_id === teacherId && x.status === "scheduled" && x.date >= todayIso()).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
    return l ? `${fmtDate(l.date)} · ${l.time.slice(0, 5)}` : null;
  };
  const owedFor = (studentId) => data.lessons.filter((l) => l.student_id === studentId && l.teacher_id === teacherId && l.status === "missed-teacher");

  const rows = [...byStudent.entries()]
    .map(([studentId, instruments]) => ({ student: data.students.find((s) => s.id === studentId), instruments }))
    .filter((r) => r.student)
    .filter((r) => !search.trim() || r.student.name.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => a.student.name.localeCompare(b.student.name));

  return (
    <div>
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name" style={{ ...inputStyle, marginBottom: 14 }} />
      <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 12 }}>{rows.length} student{rows.length === 1 ? "" : "s"}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map(({ student: s, instruments }) => {
          const owed = owedFor(s.id);
          return (
          <Card key={s.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>
                {s.name}
                <span style={{ fontWeight: 400, color: COLORS.inkSoft, fontSize: 12 }}>
                  {s.age ? ` · ${s.age}yo` : ""}{s.age_group ? ` · ${s.age_group === "adult" ? "Adult" : "Child"}` : ""}
                </span>
              </div>
              {nextLesson(s.id) && <div style={{ fontSize: 12, color: COLORS.inkSoft }}>Next: {nextLesson(s.id)}</div>}
            </div>
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
              {instruments.map((i, idx) => (
                <div key={idx} style={{ fontSize: 13, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                  <span>
                    {i.course}{i.level ? ` (${i.level})` : ""}
                    {i.status !== "active" && <Badge tone="amber" style={{ marginLeft: 6 }}>{i.status}</Badge>}
                  </span>
                  <span style={{ color: COLORS.inkSoft }}>
                    {i.billingType === "per_month" ? `${fmtMoney(i.monthlyRate || 0)}/mo` : `${fmtMoney(i.price)}/lesson`}
                    {i.day != null && i.time ? ` · ${WEEKDAY_LABELS[i.day]} ${i.time.slice(0, 5)}` : ""}
                    {i.room ? ` · ${i.room}` : ""}
                  </span>
                </div>
              ))}
            </div>
            {owed.length > 0 && (
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: "pointer", fontSize: 12.5, color: COLORS.dangerDark, fontWeight: 600 }}>
                  {owed.length} lesson{owed.length > 1 ? "s" : ""} still need{owed.length === 1 ? "s" : ""} a replacement
                </summary>
                <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid " + COLORS.border, display: "flex", flexDirection: "column", gap: 4 }}>
                  {owed.sort((a, b) => a.date.localeCompare(b.date)).map((l) => (
                    <div key={l.id} style={{ fontSize: 12, color: COLORS.dangerDark }}>{fmtDate(l.date)}{l.instrument ? ` · ${l.instrument}` : ""}</div>
                  ))}
                </div>
              </details>
            )}
          </Card>
          );
        })}
        {rows.length === 0 && <div style={{ fontSize: 13, color: COLORS.inkSoft }}>{search ? `No students match "${search}".` : "No students assigned to you yet."}</div>}
      </div>
    </div>
  );
}

function BooksTab({ data, refresh, teacherId }) {
  const [newOrderType, setNewOrderType] = useState("student");
  const myStudentIds = useMemo(() => {
    const ids = new Set();
    data.lessons.forEach((l) => { if (l.teacher_id === teacherId) ids.add(l.student_id); });
    data.students.forEach((s) => { if (s.teacher_id === teacherId) ids.add(s.id); });
    data.studentInstruments.forEach((si) => { if (si.teacher_id === teacherId) ids.add(si.student_id); });
    return ids;
  }, [data.lessons, data.students, data.studentInstruments, teacherId]);
  const myStudents = data.students.filter((s) => myStudentIds.has(s.id));
  const [newStudentId, setNewStudentId] = useState(myStudents[0]?.id || "");
  const studentName = (id) => data.students.find((s) => s.id === id)?.name || "—";
  const [search, setSearch] = useState("");

  const startOrder = async () => {
    if (newOrderType === "student" && !newStudentId) return;
    await supabase.from("book_orders").insert({
      order_type: newOrderType, student_id: newOrderType === "student" ? newStudentId : null, teacher_id: teacherId,
    });
    refresh();
  };

  const drafts = data.bookOrders.filter((o) => o.status === "draft");
  const submitted = data.bookOrders.filter((o) => o.status === "submitted");
  const cancelled = data.bookOrders.filter((o) => o.status === "cancelled");
  const submittedIds = new Set(submitted.map((o) => o.id));
  const myOrderSummary = summarizeBookOrderItems(data.bookOrderItems.filter((i) => submittedIds.has(i.order_id)), data.bookItems);
  const allOrders = [...drafts, ...submitted, ...cancelled];
  const visibleOrders = search.trim()
    ? allOrders.filter((o) => {
        const label = o.order_type === "student" ? studentName(o.student_id) : "myself personal use";
        return label.toLowerCase().includes(search.trim().toLowerCase());
      })
    : allOrders;

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Start a new order</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <Field label="For">
            <select value={newOrderType} onChange={(e) => setNewOrderType(e.target.value)} style={inputStyle}>
              <option value="student">A student</option>
              <option value="teacher_personal">Myself (personal use)</option>
            </select>
          </Field>
          {newOrderType === "student" && (
            <div style={{ flex: "1 1 220px", minWidth: 180 }}>
              <Field label="Student">
                <SearchableSelect
                  options={myStudents.map((s) => ({ value: s.id, label: s.name }))}
                  value={newStudentId}
                  onChange={setNewStudentId}
                  placeholder="Type to search…"
                />
              </Field>
            </div>
          )}
          <Btn small variant="teacher" disabled={newOrderType === "student" && !newStudentId} onClick={startOrder}>Start order</Btn>
          {newOrderType === "student" && myStudents.length === 0 && <div style={{ fontSize: 12, color: COLORS.dangerDark }}>None of your students are set up yet.</div>}
        </div>
      </Card>

      {myOrderSummary.length > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Your order summary</div>
          <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 12 }}>Totals across all your submitted orders — check this against what you've actually handed out.</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5, minWidth: 420 }}>
              <thead>
                <tr style={{ background: "#F8F6F1", textAlign: "left" }}>
                  {["Book", "Pending", "Given", "Total"].map((h) => (
                    <th key={h} style={{ padding: "7px 9px", fontWeight: 700, color: COLORS.inkSoft, borderBottom: "1.5px solid " + COLORS.border, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {myOrderSummary.map((row) => (
                  <tr key={row.key} style={{ borderTop: "1px solid " + COLORS.border }}>
                    <td style={{ padding: "7px 9px" }}>{row.name}{!row.inCatalog ? " (not in catalog)" : ""}</td>
                    <td style={{ padding: "7px 9px", color: COLORS.inkSoft }}>{(row.requested + row.ordered + row.received) || "-"}</td>
                    <td style={{ padding: "7px 9px", color: COLORS.inkSoft }}>{row.given || "-"}</td>
                    <td style={{ padding: "7px 9px", fontWeight: 600 }}>{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by student or 'myself'" style={{ ...inputStyle, marginBottom: 12 }} />

      {visibleOrders.map((order) => (
        <DraftOrderCard
          key={order.id} order={order} isDraft={order.status === "draft"}
          items={data.bookOrderItems.filter((i) => i.order_id === order.id)}
          data={data} refresh={refresh} studentName={studentName}
        />
      ))}
      {allOrders.length === 0 && <div style={{ fontSize: 13, color: COLORS.inkSoft }}>No orders yet — start one above.</div>}
      {allOrders.length > 0 && visibleOrders.length === 0 && <div style={{ fontSize: 13, color: COLORS.inkSoft }}>No orders match "{search}".</div>}
    </div>
  );
}

function PaymentTab({ data }) {
  const teacher = data.me;
  const [summaryMonth, setSummaryMonth] = useState(todayIso().slice(0, 7));
  const [summaryAllTime, setSummaryAllTime] = useState(false);
  const studentOf = (id) => data.students.find((s) => s.id === id);
  const studentName = (id) => data.students.find((s) => s.id === id)?.name || "—";
  const earn = (l) => resolveEarnings(l, studentOf(l.student_id), teacher, data.teacherRates, data.lessons, data.studentInstruments);
  const groupByStudent = (lessons) => {
    const map = new Map();
    lessons.forEach((l) => {
      if (!map.has(l.student_id)) map.set(l.student_id, []);
      map.get(l.student_id).push(l);
    });
    return [...map.entries()].map(([studentId, ls]) => ({
      studentId, lessons: ls.sort((a, b) => a.date.localeCompare(b.date)),
      total: ls.reduce((sum, l) => sum + earn(l), 0),
    })).sort((a, b) => (studentName(a.studentId) || "").localeCompare(studentName(b.studentId) || ""));
  };

  // A lesson counts as earned once it's attended, or missed by the student
  // (not your fault — you showed up), judged by that exact row's own
  // status. A lesson you missed and someone else covered shows up under
  // THEM instead — it's their teacher_id on the replacement row, not
  // yours, so it never appears here even though it started as your slot.
  // Conversely, a replacement you covered for someone else does show up
  // here once it's delivered. The original missed-teacher row itself is
  // never directly payable — only relevant for the "blocked" list below,
  // until whoever covers it delivers.
  const ownLessons = data.lessons;
  const payableNow = ownLessons.filter((l) => l.status === "attended" || l.status === "missed-student");
  const pending = payableNow.filter((l) => !l.paid);
  const paid = ownLessons.filter((l) => l.paid);
  const regularPaid = paid.filter((l) => !l.is_upfront_payment);
  const upfrontPaid = paid.filter((l) => l.is_upfront_payment);
  const blocked = ownLessons.filter((l) => !l.paid && (["absent", "cancelled"].includes(l.status) || (l.status === "missed-teacher" && !isLessonDelivered(l, data.lessons))));
  const pendingAmt = pending.reduce((sum, l) => sum + earn(l), 0);
  const paidAmt = paid.reduce((sum, l) => sum + earn(l), 0);
  const upfrontAmt = upfrontPaid.reduce((sum, l) => sum + earn(l), 0);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 10 }}>
        <Card style={{ background: COLORS.amberBg, border: "none" }}>
          <div style={{ fontSize: 12, color: COLORS.amberDark, fontWeight: 600 }}>Pending — going to receive</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.amberDark }}>{fmtMoney(pendingAmt)}</div>
        </Card>
        <Card style={{ background: COLORS.successBg, border: "none" }}>
          <div style={{ fontSize: 12, color: COLORS.successDark, fontWeight: 600 }}>Paid to date</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.successDark }}>{fmtMoney(paidAmt)}</div>
        </Card>
        <Card style={{ background: COLORS.dangerBg, border: "none" }}>
          <div style={{ fontSize: 12, color: COLORS.dangerDark, fontWeight: 600 }}>Waiting on a replacement</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.dangerDark }}>{blocked.filter((l) => l.status === "missed-teacher").length}</div>
        </Card>
      </div>
      {(() => {
        const summaryLessons = [...pending, ...paid].filter((l) => summaryAllTime || l.date.slice(0, 7) === summaryMonth);
        const { byLevel, byDuration, byInstrument, byCategory } = summarizeTeaching(summaryLessons, data.students, data.studentInstruments, data.lessons);
        const MiniTable = ({ label, rows }) => (
          <div style={{ minWidth: 130 }}>
            <div style={{ fontSize: 11, color: COLORS.inkSoft, fontWeight: 600, marginBottom: 3 }}>{label}</div>
            {rows.length === 0 ? <div style={{ fontSize: 12, color: COLORS.inkSoft }}>—</div> : rows.map(([k, c]) => (
              <div key={k} style={{ fontSize: 12.5, display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span>{k}</span><span style={{ color: COLORS.inkSoft }}>×{c}</span>
              </div>
            ))}
          </div>
        );
        return (
          <Card style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Your teaching mix</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="month" value={summaryMonth} onChange={(e) => setSummaryMonth(e.target.value)} disabled={summaryAllTime} style={{ ...inputStyle, width: 150, padding: "4px 8px", fontSize: 12.5, opacity: summaryAllTime ? 0.5 : 1 }} />
                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12.5 }}>
                  <input type="checkbox" checked={summaryAllTime} onChange={(e) => setSummaryAllTime(e.target.checked)} /> All time
                </label>
              </div>
            </div>
            {summaryLessons.length > 0 ? (
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                <MiniTable label="By level" rows={byLevel} />
                <MiniTable label="By duration" rows={byDuration} />
                <MiniTable label="By instrument" rows={byInstrument} />
                <MiniTable label="By category" rows={byCategory} />
              </div>
            ) : (
              <div style={{ fontSize: 12, color: COLORS.inkSoft }}>Nothing taught {summaryAllTime ? "on record" : `in ${summaryMonth}`}.</div>
            )}
          </Card>
        );
      })()}
      {upfrontPaid.length > 0 && (
        <div style={{ fontSize: 12, color: COLORS.amberDark, marginBottom: 18 }}>Includes {upfrontPaid.length} upfront payment{upfrontPaid.length > 1 ? "s" : ""} ({fmtMoney(upfrontAmt)}) — paid ahead of the usual schedule.</div>
      )}

      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Pending — earned, not yet paid ({pending.length})</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
        {groupByStudent(pending).map((g) => (
          <details key={g.studentId} style={{ background: COLORS.card, border: "1px solid " + COLORS.border, borderRadius: 8, padding: "8px 12px" }}>
            <summary style={{ display: "flex", justifyContent: "space-between", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
              <span>{studentName(g.studentId)} <span style={{ color: COLORS.inkSoft, fontWeight: 400 }}>({g.lessons.length})</span></span>
              <span>{fmtMoney(g.total)}</span>
            </summary>
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid " + COLORS.border, display: "flex", flexDirection: "column", gap: 6 }}>
              {g.lessons.map((l) => (
                <div key={l.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                  <span>{fmtDate(l.date)}{l.instrument ? ` · ${l.instrument}` : ""}{l.status === "missed-teacher" && <Badge tone="amber" style={{ marginLeft: 6 }}>Replacement done</Badge>}</span>
                  <strong>{fmtMoney(earn(l))}</strong>
                </div>
              ))}
            </div>
          </details>
        ))}
        {pending.length === 0 && <div style={{ fontSize: 13, color: COLORS.inkSoft }}>Nothing pending right now.</div>}
      </div>

      {blocked.length > 0 && (
        <>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Not counted yet ({blocked.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
            {blocked.sort((a, b) => a.date.localeCompare(b.date)).map((l) => (
              <div key={l.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "8px 12px", background: COLORS.dangerBg, border: "1px solid " + COLORS.border, borderRadius: 8 }}>
                <span>{fmtDate(l.date)} · {studentName(l.student_id)}{l.instrument ? ` · ${l.instrument}` : ""} · <span style={{ color: COLORS.dangerDark }}>{l.status === "missed-teacher" ? "Waiting on the replacement lesson" : statusLabel(l.status)}</span></span>
                <span style={{ color: COLORS.inkSoft }}>{fmtMoney(earn(l))}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {paid.length > 0 && (
        <details>
          <summary style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, cursor: "pointer" }}>Paid ({paid.length})</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {groupByStudent(paid).map((g) => (
              <details key={g.studentId} style={{ background: COLORS.card, border: "1px solid " + COLORS.border, borderRadius: 8, padding: "8px 12px" }}>
                <summary style={{ display: "flex", justifyContent: "space-between", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                  <span>{studentName(g.studentId)} <span style={{ color: COLORS.inkSoft, fontWeight: 400 }}>({g.lessons.length})</span></span>
                  <span>{fmtMoney(g.total)}</span>
                </summary>
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid " + COLORS.border, display: "flex", flexDirection: "column", gap: 6 }}>
                  {g.lessons.map((l) => (
                    <div key={l.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                      <span>{fmtDate(l.date)}{l.instrument ? ` · ${l.instrument}` : ""}{l.is_upfront_payment && <Badge tone="amber" style={{ marginLeft: 6 }}>Upfront</Badge>}</span>
                      <strong>{fmtMoney(earn(l))}</strong>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

export default function TeacherPage() {
  const { ok, userId, role } = useGuard(["teacher", "staff"]);
  const router = useRouter();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("calendar");
  const [staffData, setStaffData] = useState(null);
  const [staffTab, setStaffTab] = useState("calendar");
  const [pendingStudentNav, setPendingStudentNav] = useState(null);

  const refresh = useCallback(async () => { if (userId && role === "teacher") setData(await loadAll(userId)); }, [userId, role]);
  useEffect(() => { if (ok && role === "teacher") refresh(); }, [ok, role, refresh]);

  const staffRefresh = useCallback(async () => { if (role === "staff") setStaffData(await loadAdminData()); }, [role]);
  useEffect(() => { if (ok && role === "staff") staffRefresh(); }, [ok, role, staffRefresh]);

  const signOut = async () => { await supabase.auth.signOut(); router.replace("/login"); };

  if (!ok) return <div style={{ padding: 24, fontSize: 14, color: COLORS.inkSoft }}>Loading…</div>;

  if (role === "staff") {
    if (!staffData) return <div style={{ padding: 24, fontSize: 14, color: COLORS.inkSoft }}>Loading…</div>;
    const staffTabs = [
      { key: "calendar", label: "Calendar" }, { key: "teachers", label: "Teachers" }, { key: "students", label: "Students" },
      { key: "courses", label: "Courses" }, { key: "replacements", label: "Replacements" },
    ];
    return (
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "22px 18px", color: COLORS.ink }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontFamily: "Fraunces, Georgia, serif", fontWeight: 700, fontSize: 24 }}>Play Studio Manager</div>
            <div style={{ fontSize: 13, color: COLORS.inkSoft }}>Staff / Admin</div>
          </div>
          <Btn small onClick={signOut}>Sign out</Btn>
        </div>
        <div style={{ marginBottom: 16 }}><SegTabs tabs={staffTabs} active={staffTab} onChange={setStaffTab} accent={COLORS.owner} /></div>
        {staffTab === "calendar" && <StaffCalendarTab data={staffData} refresh={staffRefresh} />}
        {staffTab === "teachers" && <StaffTeachersTab data={staffData} refresh={staffRefresh} />}
        {staffTab === "students" && <StaffStudentsTab data={staffData} refresh={staffRefresh} setTab={setStaffTab} pendingNav={pendingStudentNav} clearPendingNav={() => setPendingStudentNav(null)} />}
        {staffTab === "courses" && <StaffCoursesCard data={staffData} refresh={staffRefresh} />}
        {staffTab === "replacements" && <StaffReplacementsTab data={staffData} refresh={staffRefresh} />}
      </div>
    );
  }

  if (!data) return <div style={{ padding: 24, fontSize: 14, color: COLORS.inkSoft }}>Loading…</div>;
  if (!data.me) return <div style={{ padding: 24, fontSize: 14, color: COLORS.inkSoft }}>Your login isn't linked to a teacher profile yet — ask the studio admin to link it.</div>;

  const tabs = [
    { key: "calendar", label: "My calendar" }, { key: "students", label: "My students" }, { key: "cover", label: `Open for cover${data.openForCover.length ? ` (${data.openForCover.length})` : ""}` },
    { key: "blocked", label: "Blocked dates" }, { key: "books", label: "Order books" }, { key: "payment", label: "My payment" },
  ];

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "22px 18px", color: COLORS.ink }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "Fraunces, Georgia, serif", fontWeight: 700, fontSize: 24 }}>Play Studio Manager</div>
          <div style={{ fontSize: 13, color: COLORS.inkSoft }}>Sub — {data.me.name}</div>
        </div>
        <Btn small onClick={signOut}>Sign out</Btn>
      </div>
      <div style={{ marginBottom: 16 }}><SegTabs tabs={tabs} active={tab} onChange={setTab} accent={COLORS.teacher} /></div>
      {tab === "calendar" && <CalendarTab data={data} refresh={refresh} />}
      {tab === "students" && <MyStudentsTab data={data} teacherId={data.me.id} />}
      {tab === "cover" && <CoverTab data={data} refresh={refresh} />}
      {tab === "blocked" && <BlockedTab data={data} teacherId={data.me.id} refresh={refresh} />}
      {tab === "books" && <BooksTab data={data} refresh={refresh} teacherId={data.me.id} />}
      {tab === "payment" && <PaymentTab data={data} />}
    </div>
  );
}
