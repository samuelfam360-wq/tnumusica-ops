"use client";
export const dynamic = "force-dynamic";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import {
  COLORS, Badge, Btn, Card, Field, Modal, SegTabs, inputStyle,
  fmtDate, fmtMoney, todayIso, earningsForLesson, resolveEarnings, statusTone, statusLabel,
  addMinutes, isoMonthDays, WEEKDAY_LABELS, findClashes, addDays, summarizeBookOrderItems, SearchableSelect,
} from "../../lib/ui";

function useGuard(role) {
  const router = useRouter();
  const [ok, setOk] = useState(false);
  const [userId, setUserId] = useState(null);
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login"); return; }
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", session.user.id).single();
      if (profile?.role !== role) { router.replace(profile?.role === "admin" ? "/admin" : profile?.role === "teacher" ? "/teacher" : "/login"); return; }
      setUserId(session.user.id); setOk(true);
    })();
  }, [router, role]);
  return { ok, userId };
}

async function loadAll(userId) {
  const [me, s, allTeachers, h, cov, tr, si, lp, bi, bo, boi] = await Promise.all([
    supabase.from("teachers").select("*").eq("user_id", userId).single(),
    supabase.from("students").select("*"),
    supabase.from("teachers").select("*"),
    supabase.from("holidays").select("*"),
    supabase.from("lessons").select("*").eq("status", "needs-cover").order("date").order("time"),
    supabase.from("teacher_rates").select("*"),
    supabase.from("student_instruments").select("*"),
    supabase.from("lesson_plans").select("*").order("date"),
    supabase.from("book_items").select("*").order("name"),
    supabase.from("book_orders").select("*").order("created_at", { ascending: false }),
    supabase.from("book_order_items").select("*").order("created_at"),
  ]);
  const teacherId = me.data?.id;
  const [l, b] = await Promise.all([
    supabase.from("lessons").select("*").eq("teacher_id", teacherId).order("date").order("time"),
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
  const [planModal, setPlanModal] = useState(null);
  const [reason, setReason] = useState("");
  const [planForm, setPlanForm] = useState({ date: "", what: "", remarks: "" });
  const [editingId, setEditingId] = useState(null);
  const lessons = data.lessons.filter((l) => l.date === date).sort((a, b) => a.time.localeCompare(b.time));
  const studentName = (id) => data.students.find((s) => s.id === id)?.name || "—";
  const blocked = data.blockedDates.find((b) => b.date === date);
  const holiday = data.holidays.find((h) => h.date === date);

  const setStatus = async (id, status, reasonText) => {
    await supabase.from("lessons").update({ status, reason: reasonText }).eq("id", id);
    refresh();
  };
  const saveEdit = async (id, form) => {
    await supabase.from("lessons").update({ date: form.date, time: form.time, duration_min: Number(form.duration) }).eq("id", id);
    setEditingId(null); refresh();
  };
  const removeLesson = async (id) => {
    if (!confirm("Remove this lesson? This can't be undone.")) return;
    await supabase.from("lessons").delete().eq("id", id); refresh();
  };
  const addPlan = async (studentId) => {
    if (!planForm.what.trim()) return;
    await supabase.from("lesson_plans").insert({ student_id: studentId, date: planForm.date, what_to_teach: planForm.what.trim(), remarks: planForm.remarks.trim() || null });
    setPlanModal(null); setPlanForm({ date: "", what: "", remarks: "" }); refresh();
  };

  return (
    <Modal title={fmtDate(date)} onClose={onClose} accent={COLORS.teacher}>
      {holiday && <div style={{ marginBottom: 12, padding: "8px 12px", background: COLORS.dangerBg, borderRadius: 8, fontSize: 13, color: COLORS.dangerDark }}>Studio closed{holiday.reason ? ` — ${holiday.reason}` : ""}</div>}
      {blocked && <div style={{ marginBottom: 12, padding: "8px 12px", background: COLORS.amberBg, borderRadius: 8, fontSize: 13, color: COLORS.amberDark }}>You blocked this day{blocked.reason ? ` — ${blocked.reason}` : ""}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {lessons.map((l) => {
          const recentPlans = data.lessonPlans.filter((p) => p.student_id === l.student_id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 2);
          return (
          <div key={l.id} style={{ padding: "10px 0", borderTop: "1px solid " + COLORS.border }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
              <div style={{ fontSize: 13 }}>
                <strong>{l.time.slice(0, 5)}–{addMinutes(l.time, l.duration_min || 30)}</strong> {studentName(l.student_id)}
                {(l.instrument || l.room) && (
                  <div style={{ color: COLORS.inkSoft, fontSize: 12 }}>{l.instrument}{l.instrument && l.room ? " · " : ""}{l.room}</div>
                )}
              </div>
              <Badge tone={statusTone(l.status)}>{statusLabel(l.status)}</Badge>
            </div>
            {recentPlans.length > 0 && (
              <div style={{ fontSize: 11.5, color: COLORS.inkSoft, marginTop: 4 }}>
                {recentPlans.map((p) => (<div key={p.id}>Planned {fmtDate(p.date)}: {p.what_to_teach}{p.remarks ? ` — ${p.remarks}` : ""}</div>))}
              </div>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 6, fontSize: 12, flexWrap: "wrap" }}>
              {l.status === "scheduled" && (
                <>
                  <a href="#" onClick={(e) => { e.preventDefault(); setStatus(l.id, "attended"); }} style={{ color: COLORS.teacher }}>Mark done</a>
                  <a href="#" onClick={(e) => { e.preventDefault(); setAbsentModal(l.id); setCoverModal(null); setEditingId(null); setPlanModal(null); setReason(""); }} style={{ color: COLORS.danger }}>Absent</a>
                  <a href="#" onClick={(e) => { e.preventDefault(); setCoverModal(l.id); setAbsentModal(null); setEditingId(null); setPlanModal(null); setReason(""); }} style={{ color: COLORS.amberDark }}>Ask for cover</a>
                  <a href="#" onClick={(e) => { e.preventDefault(); setEditingId(l.id); setAbsentModal(null); setCoverModal(null); setPlanModal(null); }} style={{ color: COLORS.owner }}>Edit</a>
                  <a href="#" onClick={(e) => { e.preventDefault(); setStatus(l.id, "cancelled"); }} style={{ color: COLORS.inkSoft }}>Cancel</a>
                </>
              )}
              {(l.status === "attended" || l.status === "absent" || l.status === "cancelled" || l.status === "needs-cover") && (
                <a href="#" onClick={(e) => { e.preventDefault(); setStatus(l.id, "scheduled", null); }} style={{ color: COLORS.inkSoft }}>Undo</a>
              )}
              <a href="#" onClick={(e) => { e.preventDefault(); setPlanModal(l.id); setAbsentModal(null); setCoverModal(null); setEditingId(null); setPlanForm({ date: l.date, what: "", remarks: "" }); }} style={{ color: COLORS.teacher }}>Teaching plan</a>
              <a href="#" onClick={(e) => { e.preventDefault(); removeLesson(l.id); }} style={{ color: COLORS.danger }}>Remove</a>
            </div>
            {editingId === l.id && (
              <EditLessonForm lesson={l} data={data} onSave={(form) => saveEdit(l.id, form)} onCancel={() => setEditingId(null)} />
            )}
            {coverModal === l.id && (
              <div style={{ marginTop: 8, padding: 10, border: "1px solid " + COLORS.border, borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 8 }}>This opens the slot for another teacher to pick up. You'll stop seeing it here until claimed.</div>
                <input value={reason} onChange={(e) => setReason(e.target.value)} style={{ ...inputStyle, marginBottom: 8 }} placeholder="Reason (optional)" />
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn small variant="teacher" onClick={() => { setStatus(l.id, "needs-cover", reason); setCoverModal(null); setReason(""); }}>Confirm</Btn>
                  <Btn small onClick={() => setCoverModal(null)}>Cancel</Btn>
                </div>
              </div>
            )}
            {absentModal === l.id && (
              <div style={{ marginTop: 8, padding: 10, border: "1px solid " + COLORS.border, borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 8 }}>What happened? The studio will decide on a replacement.</div>
                <input value={reason} onChange={(e) => setReason(e.target.value)} style={{ ...inputStyle, marginBottom: 8 }} placeholder="Reason (e.g. student sick, I was unwell)" />
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn small variant="danger" onClick={() => { setStatus(l.id, "absent", reason); setAbsentModal(null); setReason(""); }}>Confirm absent</Btn>
                  <Btn small onClick={() => { setAbsentModal(null); setReason(""); }}>Cancel</Btn>
                </div>
              </div>
            )}
            {planModal === l.id && (
              <div style={{ marginTop: 8, padding: 10, border: "1px solid " + COLORS.border, borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 8 }}>What to cover next for {studentName(l.student_id)} — visible to the studio too.</div>
                <Field label="Date"><input type="date" value={planForm.date} onChange={(e) => setPlanForm({ ...planForm, date: e.target.value })} style={{ ...inputStyle, marginBottom: 8 }} /></Field>
                <textarea value={planForm.what} onChange={(e) => setPlanForm({ ...planForm, what: e.target.value })} style={{ ...inputStyle, marginBottom: 8, minHeight: 60 }} placeholder="e.g. C major scale, hands together, review last week's piece" />
                <input value={planForm.remarks} onChange={(e) => setPlanForm({ ...planForm, remarks: e.target.value })} style={{ ...inputStyle, marginBottom: 8 }} placeholder="Remarks (optional)" />
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn small variant="teacher" onClick={() => addPlan(l.student_id)}>Save plan</Btn>
                  <Btn small onClick={() => setPlanModal(null)}>Cancel</Btn>
                </div>
              </div>
            )}
          </div>
        );})}
        {lessons.length === 0 && <div style={{ fontSize: 13, color: COLORS.inkSoft }}>No lessons on this day.</div>}
      </div>
    </Modal>
  );
}

function SelfRescheduleModal({ lesson, data, refresh, onClose }) {
  const studentName = data.students.find((s) => s.id === lesson.student_id)?.name || "—";
  const [form, setForm] = useState({ date: todayIso(), time: "15:00", duration: lesson.duration_min || 30 });
  const clashes = findClashes(data.lessons, { date: form.date, time: form.time, duration: form.duration, teacherId: data.me.id, excludeId: lesson.id });
  const confirm = async () => {
    await supabase.from("lessons").update({ status: "rescheduled" }).eq("id", lesson.id);
    await supabase.from("lessons").insert({
      date: form.date, time: form.time, teacher_id: data.me.id, student_id: lesson.student_id,
      price: 0, duration_min: Number(form.duration), status: "scheduled", replacement_of: lesson.id,
    });
    refresh(); onClose();
  };
  return (
    <Modal title={`Reschedule ${studentName}'s lesson`} onClose={onClose} accent={COLORS.teacher}>
      <Field label="New date"><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={inputStyle} /></Field>
      <Field label="New time"><input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} style={inputStyle} /></Field>
      <Field label="Duration (min)"><input type="number" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} style={inputStyle} /></Field>
      {clashes.length > 0 && <div style={{ fontSize: 12, color: COLORS.danger, marginBottom: 10 }}>Clashes with another lesson of yours at this time.</div>}
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
  const cells = useMemo(() => isoMonthDays(cursor.y, cursor.m), [cursor]);
  const today = todayIso();
  const lessonsByDate = useMemo(() => {
    const m = {};
    data.lessons.forEach((l) => { m[l.date] = (m[l.date] || 0) + 1; });
    return m;
  }, [data.lessons]);
  const blockedSet = useMemo(() => new Set(data.blockedDates.map((b) => b.date)), [data.blockedDates]);
  const holidaySet = useMemo(() => new Set(data.holidays.map((h) => h.date)), [data.holidays]);
  const monthLabel = new Date(cursor.y, cursor.m, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const owedByMe = data.lessons.filter((l) => l.status === "missed-teacher");
  const studentName = (id) => data.students.find((s) => s.id === id)?.name || "—";
  const handOff = async (id) => { await supabase.from("lessons").update({ status: "needs-cover", reason: handoffReason }).eq("id", id); setHandingOff(null); setHandoffReason(""); refresh(); };
  const submitSuggestion = async (id) => {
    await supabase.from("lessons").update({ suggested_date: suggestForm.date, suggested_time: suggestForm.time, suggested_note: suggestForm.note || null }).eq("id", id);
    setSuggesting(null); setSuggestForm({ date: todayIso(), time: "15:00", note: "" }); refresh();
  };

  return (
    <div>
      {(owedByMe.length > 0 || data.openForCover.length > 0) && (
        <Card style={{ marginBottom: 14, background: COLORS.dangerBg, border: "none" }}>
          {owedByMe.length > 0 && (
            <div style={{ marginBottom: data.openForCover.length > 0 ? 10 : 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: COLORS.dangerDark, marginBottom: 6 }}>
                {owedByMe.length} lesson{owedByMe.length > 1 ? "s" : ""} still need{owedByMe.length === 1 ? "s" : ""} a replacement
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {owedByMe.map((l) => (
                  <div key={l.id}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6, fontSize: 12, color: COLORS.dangerDark }}>
                      <span>{fmtDate(l.date)} · {studentName(l.student_id)}</span>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <Btn small variant="teacher" onClick={() => { setSuggesting(l.id); setHandingOff(null); setSuggestForm({ date: todayIso(), time: "15:00", note: "" }); }}>Suggest a time</Btn>
                        <Btn small onClick={() => setRescheduling(l)}>Reschedule myself</Btn>
                        <Btn small onClick={() => { setHandingOff(l.id); setSuggesting(null); setHandoffReason(""); }}>Ask another teacher</Btn>
                      </div>
                    </div>
                    {l.suggested_date && l.suggested_time && (
                      <div style={{ fontSize: 11.5, color: COLORS.dangerDark, marginTop: 2 }}>
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
            const isToday = iso === today;
            const isUnavailable = blockedSet.has(iso) || holidaySet.has(iso);
            return (
              <button key={iso} onClick={() => setOpenDate(iso)} style={{
                aspectRatio: "1", border: "1px solid " + (isUnavailable ? COLORS.dangerBg : COLORS.border), borderRadius: 8, cursor: "pointer",
                background: isToday ? COLORS.ink : isUnavailable ? COLORS.dangerBg : "#fff",
                color: isToday ? "#fff" : isUnavailable ? COLORS.dangerDark : COLORS.ink,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, fontFamily: "inherit",
              }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{Number(iso.slice(8, 10))}</span>
                {count > 0 && <span style={{ width: 4, height: 4, borderRadius: 999, background: isToday ? "#fff" : COLORS.teacher }} />}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 12, fontSize: 11, color: COLORS.inkSoft }}>
          <span>● has lessons</span><span style={{ color: COLORS.dangerDark }}>■ unavailable</span>
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
    }
    setForm({ from: todayIso(), to: "", reason: "" }); refresh();
  };
  const removeBlock = async (ids) => { await supabase.from("blocked_dates").delete().in("id", ids); refresh(); };

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
  const [customName, setCustomName] = useState("");
  const [customQty, setCustomQty] = useState(1);
  const isCancelled = order.status === "cancelled";
  const isSubmitted = order.status === "submitted";
  const canCancel = isSubmitted && items.every((i) => i.status === "requested");

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
            <div style={{ flex: "2 1 180px" }}>
              <Field label="From catalog">
                <select value={catalogItemId} onChange={(e) => setCatalogItemId(e.target.value)} style={inputStyle}>
                  <option value="">—</option>
                  {data.bookItems.map((b) => (<option key={b.id} value={b.id}>{b.name} · {fmtMoney(b.price)} · {b.stock_on_hand} on hand</option>))}
                </select>
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
  const attended = data.lessons.filter((l) => l.status === "attended");
  const pending = attended.filter((l) => !l.paid);
  const paid = attended.filter((l) => l.paid);
  const owedReplacements = data.lessons.filter((l) => l.status === "missed-teacher");
  const studentOf = (id) => data.students.find((s) => s.id === id);
  const earn = (l) => resolveEarnings(l, studentOf(l.student_id), teacher, data.teacherRates, data.lessons, data.studentInstruments);
  const pendingAmt = pending.reduce((sum, l) => sum + earn(l), 0);
  const paidAmt = paid.reduce((sum, l) => sum + earn(l), 0);
  const studentName = (id) => data.students.find((s) => s.id === id)?.name || "—";

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 18 }}>
        <Card style={{ background: COLORS.amberBg, border: "none" }}>
          <div style={{ fontSize: 12, color: COLORS.amberDark, fontWeight: 600 }}>Pending payout</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.amberDark }}>{fmtMoney(pendingAmt)}</div>
        </Card>
        <Card style={{ background: COLORS.successBg, border: "none" }}>
          <div style={{ fontSize: 12, color: COLORS.successDark, fontWeight: 600 }}>Paid to date</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.successDark }}>{fmtMoney(paidAmt)}</div>
        </Card>
        <Card style={{ background: COLORS.dangerBg, border: "none" }}>
          <div style={{ fontSize: 12, color: COLORS.dangerDark, fontWeight: 600 }}>Replacements you owe</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.dangerDark }}>{owedReplacements.length}</div>
        </Card>
      </div>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Attended lessons — not yet counted until marked</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {attended.map((l) => (
          <div key={l.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "8px 12px", background: COLORS.card, border: "1px solid " + COLORS.border, borderRadius: 8 }}>
            <span>{fmtDate(l.date)} · {studentName(l.student_id)}</span>
            <span style={{ display: "flex", gap: 10, alignItems: "center" }}>{fmtMoney(earn(l))}<Badge tone={l.paid ? "success" : "amber"}>{l.paid ? "Paid" : "Pending"}</Badge></span>
          </div>
        ))}
        {attended.length === 0 && <div style={{ fontSize: 13, color: COLORS.inkSoft }}>Nothing marked attended yet.</div>}
      </div>
    </div>
  );
}

export default function TeacherPage() {
  const { ok, userId } = useGuard("teacher");
  const router = useRouter();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("calendar");

  const refresh = useCallback(async () => { if (userId) setData(await loadAll(userId)); }, [userId]);
  useEffect(() => { if (ok) refresh(); }, [ok, refresh]);

  const signOut = async () => { await supabase.auth.signOut(); router.replace("/login"); };

  if (!ok || !data) return <div style={{ padding: 24, fontSize: 14, color: COLORS.inkSoft }}>Loading…</div>;
  if (!data.me) return <div style={{ padding: 24, fontSize: 14, color: COLORS.inkSoft }}>Your login isn't linked to a teacher profile yet — ask the studio admin to link it.</div>;

  const tabs = [
    { key: "calendar", label: "My calendar" }, { key: "cover", label: `Open for cover${data.openForCover.length ? ` (${data.openForCover.length})` : ""}` },
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
      {tab === "cover" && <CoverTab data={data} refresh={refresh} />}
      {tab === "blocked" && <BlockedTab data={data} teacherId={data.me.id} refresh={refresh} />}
      {tab === "books" && <BooksTab data={data} refresh={refresh} teacherId={data.me.id} />}
      {tab === "payment" && <PaymentTab data={data} />}
    </div>
  );
}
