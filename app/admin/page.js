"use client";
export const dynamic = "force-dynamic";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import {
  COLORS, Badge, Btn, Card, Field, Modal, SegTabs, inputStyle,
  fmtDate, fmtMoney, todayIso, addDays, isoDate, earningsForLesson, resolveEarnings, statusTone, statusLabel,
  addMinutes, isoMonthDays, WEEKDAY_LABELS, findClashes, findWeeklyInstrumentClashes, studentBalance, studentOwed, effectiveLessonPrice,
  downloadDoc, generateDocPdf, studentInvoiceSummary, SearchableSelect, summarizeBookOrderItems,
} from "../../lib/ui";

const WEEKDAYS = WEEKDAY_LABELS;
const DAY_OPTIONS = [
  { value: 0, label: "Sunday" }, { value: 1, label: "Monday" }, { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" }, { value: 4, label: "Thursday" }, { value: 5, label: "Friday" }, { value: 6, label: "Saturday" },
];

// Parses messy human-entered time text into 24-hour "HH:MM" — handles clean
// "14:00", but also ranges like "11.00 - 11.30AM", "4.30-5.00PM", "2.00 -2.30PM"
// (only the start time is used; duration comes from its own column). Returns
// null if it genuinely can't make sense of the text, rather than guessing.
function parseTimeToHHMM(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s || s === "-") return null;
  const plain = s.match(/^(\d{1,2}):(\d{2})$/);
  if (plain) {
    const h = Number(plain[1]), m = Number(plain[2]);
    if (h >= 0 && h < 24 && m >= 0 && m < 60) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  const startPart = s.split(/[-/]/)[0];
  const ampm = /am/i.test(startPart) ? "am" : /pm/i.test(startPart) ? "pm" : (/am/i.test(s) ? "am" : /pm/i.test(s) ? "pm" : null);
  const m2 = startPart.match(/(\d{1,2})[.:](\d{2})/);
  if (!m2) return null;
  let hour = Number(m2[1]);
  const minute = Number(m2[2]);
  if (minute < 0 || minute > 59 || hour < 1 || hour > 12 && ampm) return null;
  if (ampm === "pm" && hour < 12) hour += 12;
  if (ampm === "am" && hour === 12) hour = 0;
  if (hour < 0 || hour > 23) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function DocHeader({ settings, docType, meta = [] }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 16, paddingBottom: 16, borderBottom: "2px solid " + COLORS.ink }}>
        {settings.logo_data && <img src={settings.logo_data} alt="Logo" style={{ height: 48, width: 48, objectFit: "contain", flexShrink: 0 }} />}
        <div>
          <div style={{ fontFamily: "Fraunces, Georgia, serif", fontWeight: 700, fontSize: 19 }}>{settings.company_name || "Your Business Name"}</div>
          {settings.address && <div style={{ fontSize: 11.5, color: COLORS.inkSoft, maxWidth: 360, marginTop: 2 }}>{settings.address}</div>}
          {(settings.phone || settings.email) && <div style={{ fontSize: 11.5, color: COLORS.inkSoft }}>{[settings.phone, settings.email].filter(Boolean).join(" · ")}</div>}
          {settings.license_no && <div style={{ fontSize: 11.5, color: COLORS.inkSoft }}>License: {settings.license_no}</div>}
        </div>
      </div>
      <div style={{ fontFamily: "Fraunces, Georgia, serif", fontWeight: 700, fontSize: 17, marginBottom: 6, color: COLORS.owner }}>{docType}</div>
      <div style={{ fontSize: 12.5, color: COLORS.inkSoft, lineHeight: 1.7 }}>
        {meta.map((m, i) => (
          <div key={i}>{m.label}: <span style={{ color: COLORS.ink, fontWeight: 500 }}>{m.value}</span></div>
        ))}
      </div>
    </div>
  );
}

function DocTable({ rows, totalLabel, totalValue, emptyText = "Nothing to show yet." }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", padding: "0 2px 8px", borderBottom: "1.5px solid " + COLORS.ink, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: COLORS.inkSoft }}>
        <span>Description</span><span>Amount (RM)</span>
      </div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 2px", fontSize: 13.5, borderBottom: "1px solid " + COLORS.border }}>
          <span>{r.label}</span><span style={{ whiteSpace: "nowrap" }}>{r.value}</span>
        </div>
      ))}
      {rows.length === 0 && <div style={{ padding: "12px 2px", fontSize: 13, color: COLORS.inkSoft }}>{emptyText}</div>}
      {totalLabel && (
        <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 2px 0", fontWeight: 700, fontSize: 15.5, marginTop: 6, borderTop: "1px solid " + COLORS.border }}>
          <span>{totalLabel}</span><span>{totalValue}</span>
        </div>
      )}
    </div>
  );
}

function DocFooter({ settings }) {
  const hasBank = settings.bank_name || settings.account_number;
  if (!hasBank && !settings.invoice_terms) return null;
  return (
    <div style={{ marginTop: 22, paddingTop: 14, borderTop: "1px solid " + COLORS.border, fontSize: 12, color: COLORS.inkSoft, lineHeight: 1.7 }}>
      {hasBank && (
        <div style={{ marginBottom: settings.invoice_terms ? 10 : 0 }}>
          <div style={{ fontWeight: 700, color: COLORS.ink, marginBottom: 3 }}>Payment details</div>
          {settings.bank_name && <div>Bank: {settings.bank_name}</div>}
          <div>Account name: {settings.account_holder || settings.company_name}</div>
          {settings.account_number && <div>Account number: {settings.account_number}</div>}
        </div>
      )}
      {settings.invoice_terms && <div>{settings.invoice_terms}</div>}
    </div>
  );
}

function useGuard(role) {
  const router = useRouter();
  const [ok, setOk] = useState(false);
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login"); return; }
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", session.user.id).single();
      if (profile?.role !== role) { router.replace(profile?.role === "admin" ? "/admin" : profile?.role === "teacher" ? "/teacher" : "/login"); return; }
      setOk(true);
    })();
  }, [router, role]);
  return ok;
}

async function loadAll() {
  const [t, s, l, b, h, r, p, st, c, ex, cl, sp, inv, invItems, si, bi, bo, boi] = await Promise.all([
    supabase.from("teachers").select("*").order("name"),
    supabase.from("students").select("*").order("name"),
    supabase.from("lessons").select("*").order("date").order("time"),
    supabase.from("blocked_dates").select("*").order("date"),
    supabase.from("holidays").select("*").order("date"),
    supabase.from("teacher_rates").select("*"),
    supabase.from("lesson_plans").select("*").order("date"),
    supabase.from("studio_settings").select("*").eq("id", 1).maybeSingle(),
    supabase.from("courses").select("*").order("name"),
    supabase.from("expenses").select("*").order("date"),
    supabase.from("course_levels").select("*").order("sort_order"),
    supabase.from("student_payments").select("*").order("date"),
    supabase.from("invoices").select("*").order("invoice_no", { ascending: false }),
    supabase.from("invoice_items").select("*").order("sort_order"),
    supabase.from("student_instruments").select("*").order("created_at"),
    supabase.from("book_items").select("*").order("name"),
    supabase.from("book_orders").select("*").order("created_at", { ascending: false }),
    supabase.from("book_order_items").select("*").order("created_at"),
  ]);
  return {
    teachers: t.data || [], students: s.data || [], lessons: l.data || [], blockedDates: b.data || [],
    holidays: h.data || [], teacherRates: r.data || [], lessonPlans: p.data || [], settings: st.data || {},
    courses: c.data || [], expenses: ex.data || [], courseLevels: cl.data || [], studentPayments: sp.data || [],
    invoices: inv.data || [], invoiceItems: invItems.data || [], studentInstruments: si.data || [],
    bookItems: bi.data || [], bookOrders: bo.data || [], bookOrderItems: boi.data || [],
  };
}

const TEACHER_COLOR_PALETTE = ["#0F6E56", "#8A4B08", "#4C3D8F", "#A02B5A", "#1E6091", "#7A5C00", "#B0413E", "#2E7D32"];
function colorForTeacher(id) {
  if (!id) return "#8A8474";
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return TEACHER_COLOR_PALETTE[hash % TEACHER_COLOR_PALETTE.length];
}

function DayModal({ date, data, refresh, onClose }) {
  const [holidayReason, setHolidayReason] = useState("");
  const teacherName = (id) => data.teachers.find((t) => t.id === id)?.name || "Unassigned";
  const studentName = (id) => data.students.find((s) => s.id === id)?.name || "—";
  const lessons = data.lessons.filter((l) => l.date === date).sort((a, b) => a.time.localeCompare(b.time));
  const holiday = data.holidays.find((h) => h.date === date);

  const markDone = async (id) => { await supabase.from("lessons").update({ status: "attended" }).eq("id", id); refresh(); };
  const undo = async (id) => { await supabase.from("lessons").update({ status: "scheduled" }).eq("id", id); refresh(); };
  const remove = async (id) => { await supabase.from("lessons").delete().eq("id", id); refresh(); };
  const markHoliday = async () => {
    await supabase.from("holidays").insert({ date, reason: holidayReason || null });
    refresh();
  };
  const unmarkHoliday = async () => { await supabase.from("holidays").delete().eq("date", date); refresh(); };

  return (
    <Modal title={fmtDate(date)} onClose={onClose}>
      {holiday ? (
        <div style={{ marginBottom: 16, padding: "10px 12px", background: COLORS.dangerBg, borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 13, color: COLORS.dangerDark }}>Marked unavailable{holiday.reason ? ` — ${holiday.reason}` : ""}</div>
          <Btn small onClick={unmarkHoliday}>Undo</Btn>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <input value={holidayReason} onChange={(e) => setHolidayReason(e.target.value)} placeholder="Reason (optional)" style={{ ...inputStyle, flex: 1, minWidth: 140 }} />
          <Btn small onClick={markHoliday}>Mark day unavailable</Btn>
        </div>
      )}

      {lessons.length > 0 && (() => {
        const teacherIds = [...new Set(lessons.map((l) => l.teacher_id || "unassigned"))]
          .sort((a, b) => teacherName(a === "unassigned" ? null : a).localeCompare(teacherName(b === "unassigned" ? null : b)));
        const times = [...new Set(lessons.map((l) => l.time))].sort();
        return (
          <div style={{ overflowX: "auto", marginBottom: 18, border: "1px solid " + COLORS.border, borderRadius: 10 }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12, minWidth: 140 + teacherIds.length * 150 }}>
              <thead>
                <tr style={{ background: "#F8F6F1" }}>
                  <th style={{ position: "sticky", left: 0, background: "#F8F6F1", padding: "8px 10px", textAlign: "left", fontWeight: 700, color: COLORS.inkSoft, borderBottom: "1.5px solid " + COLORS.border, minWidth: 90 }}>Time</th>
                  {teacherIds.map((tid) => (
                    <th key={tid} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 700, color: colorForTeacher(tid === "unassigned" ? null : tid), borderBottom: "1.5px solid " + COLORS.border, borderLeft: "1px solid " + COLORS.border, minWidth: 150 }}>
                      {teacherName(tid === "unassigned" ? null : tid)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {times.map((t) => {
                  const rowLessons = lessons.filter((l) => l.time === t);
                  const room = rowLessons.find((l) => l.room)?.room;
                  return (
                    <tr key={t} style={{ borderTop: "1px solid " + COLORS.border }}>
                      <td style={{ position: "sticky", left: 0, background: "#fff", padding: "7px 10px", fontWeight: 600, verticalAlign: "top", whiteSpace: "nowrap" }}>
                        {t.slice(0, 5)}
                        {room && <div style={{ fontWeight: 400, color: COLORS.inkSoft, fontSize: 11 }}>{room}</div>}
                      </td>
                      {teacherIds.map((tid) => {
                        const l = rowLessons.find((x) => (x.teacher_id || "unassigned") === tid);
                        return (
                          <td key={tid} style={{ padding: "7px 10px", borderLeft: "1px solid " + COLORS.border, verticalAlign: "top" }}>
                            {l ? (
                              <div>
                                <div style={{ fontWeight: 600 }}>{studentName(l.student_id)}</div>
                                <div style={{ color: COLORS.inkSoft, fontSize: 11 }}>{l.instrument || "—"} · {l.duration_min || 30} min · {fmtMoney(l.price)}</div>
                                <Badge tone={statusTone(l.status)}>{statusLabel(l.status)}</Badge>
                              </div>
                            ) : <span style={{ color: COLORS.border }}>—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })()}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {lessons.map((l) => (
          <div key={l.id} style={{ padding: "10px 0", borderTop: "1px solid " + COLORS.border }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
              <div style={{ fontSize: 13 }}>
                <strong>{l.time.slice(0, 5)}–{addMinutes(l.time, l.duration_min || 30)}</strong> {studentName(l.student_id)}
                <div style={{ color: COLORS.inkSoft, fontSize: 12 }}>
                  {l.duration_min || 30} min · <span style={{ color: colorForTeacher(l.teacher_id), fontWeight: 600 }}>{teacherName(l.teacher_id)}</span> · {fmtMoney(l.price)}
                  {l.instrument ? ` · ${l.instrument}` : ""}{l.room ? ` · ${l.room}` : ""}
                </div>
              </div>
              <Badge tone={statusTone(l.status)}>{statusLabel(l.status)}</Badge>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 6, fontSize: 12 }}>
              {l.status === "scheduled" && <a href="#" onClick={(e) => { e.preventDefault(); markDone(l.id); }} style={{ color: COLORS.owner }}>Mark done</a>}
              {["attended", "absent", "needs-cover", "cancelled"].includes(l.status) && <a href="#" onClick={(e) => { e.preventDefault(); undo(l.id); }} style={{ color: COLORS.inkSoft }}>Undo</a>}
              <a href="#" onClick={(e) => { e.preventDefault(); remove(l.id); }} style={{ color: COLORS.danger }}>Remove</a>
            </div>
          </div>
        ))}
        {lessons.length === 0 && <div style={{ fontSize: 13, color: COLORS.inkSoft }}>No lessons on this day.</div>}
      </div>
    </Modal>
  );
}

function RescheduleModal({ lesson, data, refresh, onClose }) {
  const studentName = data.students.find((s) => s.id === lesson.student_id)?.name || "—";
  const teacherName = data.teachers.find((t) => t.id === lesson.teacher_id)?.name || "Unassigned";
  const [slots, setSlots] = useState([{ date: lesson.suggested_date || todayIso(), time: lesson.suggested_time ? lesson.suggested_time.slice(0, 5) : "15:00", duration: lesson.duration_min || 30 }]);

  const updateSlot = (i, patch) => setSlots((s) => s.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const addSlot = () => setSlots((s) => [...s, { date: todayIso(), time: "15:00", duration: 15 }]);
  const removeSlot = (i) => setSlots((s) => s.filter((_, idx) => idx !== i));

  const clashFor = (slot) => data.lessons.some((l) => l.id !== lesson.id && l.teacher_id === lesson.teacher_id && l.date === slot.date && l.time.slice(0, 5) === slot.time && l.status !== "rescheduled");

  const confirm = async () => {
    await supabase.from("lessons").update({ status: "rescheduled" }).eq("id", lesson.id);
    const rows = slots.map((s) => ({
      date: s.date, time: s.time, teacher_id: lesson.teacher_id, student_id: lesson.student_id,
      price: 0, duration_min: Number(s.duration), status: "scheduled", replacement_of: lesson.id,
    }));
    await supabase.from("lessons").insert(rows);
    refresh(); onClose();
  };

  return (
    <Modal title={`Reschedule ${studentName}'s lesson`} onClose={onClose}>
      <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 14 }}>Teacher: <strong>{teacherName}</strong></div>
      {lesson.suggested_date && lesson.suggested_time && (
        <div style={{ fontSize: 12, color: COLORS.owner, marginBottom: 10, padding: "8px 10px", background: COLORS.ownerBg, borderRadius: 8 }}>
          Teacher suggested {fmtDate(lesson.suggested_date)} · {lesson.suggested_time.slice(0, 5)}{lesson.suggested_note ? ` — ${lesson.suggested_note}` : ""}. Pre-filled below — confirm with the student before saving.
        </div>
      )}
      <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 10 }}>Usually one replacement slot. If splitting the missed lesson across two shorter makeup times, add another below.</div>
      {slots.map((slot, i) => (
        <div key={i} style={{ border: "1px solid " + COLORS.border, borderRadius: 8, padding: 12, marginBottom: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="New date"><input type="date" value={slot.date} onChange={(e) => updateSlot(i, { date: e.target.value })} style={inputStyle} /></Field>
            <Field label="New time"><input type="time" value={slot.time} onChange={(e) => updateSlot(i, { time: e.target.value })} style={inputStyle} /></Field>
          </div>
          <Field label="Duration (min)"><input type="number" value={slot.duration} onChange={(e) => updateSlot(i, { duration: e.target.value })} style={inputStyle} /></Field>
          {clashFor(slot) && <div style={{ fontSize: 12, color: COLORS.danger, marginBottom: 4 }}>Clashes with another lesson for this teacher at that time.</div>}
          {slots.length > 1 && <a href="#" onClick={(e) => { e.preventDefault(); removeSlot(i); }} style={{ fontSize: 12, color: COLORS.danger }}>Remove this slot</a>}
        </div>
      ))}
      <a href="#" onClick={(e) => { e.preventDefault(); addSlot(); }} style={{ fontSize: 13, color: COLORS.owner, display: "block", marginBottom: 14 }}>+ Add another replacement slot</a>
      <Btn variant="owner" style={{ width: "100%" }} onClick={confirm}>Confirm reschedule</Btn>
    </Modal>
  );
}

function CalendarTab({ data, refresh }) {
  const [showAdd, setShowAdd] = useState(false);
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [openDate, setOpenDate] = useState(null);
  const [reschedLesson, setReschedLesson] = useState(null);
  const [form, setForm] = useState({ date: todayIso(), time: "15:00", duration: 30, teacherId: "", studentId: "", instrument: "", room: "" });
  useEffect(() => { if (data.teachers[0] && !form.teacherId) setForm((f) => ({ ...f, teacherId: data.teachers[0].id })); if (data.students[0] && !form.studentId) setForm((f) => ({ ...f, studentId: data.students[0].id })); }, [data.teachers, data.students]);

  const cells = useMemo(() => isoMonthDays(cursor.y, cursor.m), [cursor]);
  const today = todayIso();
  const lessonsByDate = useMemo(() => {
    const m = {};
    data.lessons.forEach((l) => { m[l.date] = (m[l.date] || 0) + 1; });
    return m;
  }, [data.lessons]);
  const holidaySet = useMemo(() => new Set(data.holidays.map((h) => h.date)), [data.holidays]);

  const awaitingDecision = data.lessons.filter((l) => l.status === "absent").sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const needsCover = data.lessons.filter((l) => l.status === "needs-cover").sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const needsReschedule = data.lessons
    .filter((l) => l.status === "missed-teacher" || l.status === "missed-student")
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const studentName = (id) => data.students.find((s) => s.id === id)?.name || "—";
  const teacherNameOf = (id) => data.teachers.find((t) => t.id === id)?.name || "Unassigned";

  const decide = async (id, replaceable) => {
    await supabase.from("lessons").update({ status: replaceable ? "missed-teacher" : "missed-student" }).eq("id", id);
    refresh();
  };
  const undoDecide = async (id) => { await supabase.from("lessons").update({ status: "absent" }).eq("id", id); refresh(); };
  const requestCover = async (id, reason) => { await supabase.from("lessons").update({ status: "needs-cover", reason }).eq("id", id); refresh(); };
  const assignCover = async (id, teacherId) => {
    if (!teacherId) return;
    await supabase.from("lessons").update({ status: "scheduled", teacher_id: teacherId }).eq("id", id);
    refresh();
  };
  const undoCoverRequest = async (id) => { await supabase.from("lessons").update({ status: "scheduled", reason: null }).eq("id", id); refresh(); };

  const formClashes = findClashes(data.lessons, { date: form.date, time: form.time, duration: form.duration, teacherId: form.teacherId, studentId: form.studentId });

  const addLesson = async (e) => {
    e.preventDefault();
    const student = data.students.find((s) => s.id === form.studentId);
    await supabase.from("lessons").insert({
      date: form.date, time: form.time, teacher_id: form.teacherId || null, student_id: form.studentId,
      price: student.price, duration_min: Number(form.duration), status: "scheduled",
      instrument: form.instrument || null, room: form.room || null,
    });
    setShowAdd(false); refresh();
  };

  const monthLabel = new Date(cursor.y, cursor.m, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        <Btn variant="owner" onClick={() => setShowAdd(true)}>+ Add lesson</Btn>
      </div>

      <Card style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontFamily: "Fraunces, Georgia, serif", fontWeight: 600, fontSize: 17 }}>{monthLabel}</div>
          <div style={{ display: "flex", gap: 6 }}>
            <Btn small onClick={() => setCursor((c) => c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 })}>‹</Btn>
            <Btn small onClick={() => { const d = new Date(); setCursor({ y: d.getFullYear(), m: d.getMonth() }); }}>Today</Btn>
            <Btn small onClick={() => setCursor((c) => c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 })}>›</Btn>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, fontSize: 11, fontWeight: 700, color: COLORS.inkSoft, textAlign: "center", marginBottom: 4 }}>
          {WEEKDAYS.map((w) => <div key={w}>{w}</div>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 4 }}>
          {cells.map((iso, i) => {
            if (!iso) return <div key={i} />;
            const count = lessonsByDate[iso] || 0;
            const isToday = iso === today;
            const isHoliday = holidaySet.has(iso);
            return (
              <button key={iso} onClick={() => setOpenDate(iso)} style={{
                aspectRatio: "1", border: "1px solid " + (isHoliday ? COLORS.dangerBg : COLORS.border), borderRadius: 8, cursor: "pointer",
                background: isToday ? COLORS.ink : isHoliday ? COLORS.dangerBg : "#fff",
                color: isToday ? "#fff" : isHoliday ? COLORS.dangerDark : COLORS.ink,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, fontFamily: "inherit",
              }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{Number(iso.slice(8, 10))}</span>
                {count > 0 && <span style={{ width: 4, height: 4, borderRadius: 999, background: isToday ? "#fff" : COLORS.owner }} />}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 12, fontSize: 11, color: COLORS.inkSoft }}>
          <span>● has lessons</span><span style={{ color: COLORS.dangerDark }}>■ unavailable</span>
        </div>
      </Card>

      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Awaiting decision ({awaitingDecision.length})</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 24 }}>
        {awaitingDecision.map((l) => (
          <div key={l.id} style={{ padding: "10px 14px", background: COLORS.card, border: "1px solid " + COLORS.border, borderRadius: 8, fontSize: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <span>{fmtDate(l.date)} · <strong>{studentName(l.student_id)}</strong> · {teacherNameOf(l.teacher_id)} · {l.time.slice(0, 5)}–{addMinutes(l.time, l.duration_min || 30)}</span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Btn small variant="owner" onClick={() => decide(l.id, true)}>Replaceable</Btn>
                <Btn small onClick={() => decide(l.id, false)}>Not replaceable</Btn>
                <Btn small onClick={() => requestCover(l.id, l.reason)}>Open for cover</Btn>
              </div>
            </div>
            {l.reason && <div style={{ color: COLORS.inkSoft, marginTop: 4 }}>{l.reason}</div>}
          </div>
        ))}
        {awaitingDecision.length === 0 && <div style={{ fontSize: 13, color: COLORS.inkSoft }}>Nothing awaiting a decision.</div>}
      </div>

      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Needs cover ({needsCover.length})</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 24 }}>
        {needsCover.map((l) => (
          <div key={l.id} style={{ padding: "10px 14px", background: COLORS.card, border: "1px solid " + COLORS.border, borderRadius: 8, fontSize: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <span>{fmtDate(l.date)} · <strong>{studentName(l.student_id)}</strong> · was {teacherNameOf(l.teacher_id)} · {l.time.slice(0, 5)}–{addMinutes(l.time, l.duration_min || 30)}</span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select onChange={(e) => assignCover(l.id, e.target.value)} defaultValue="" style={{ ...inputStyle, width: "auto", padding: "5px 8px", fontSize: 13 }}>
                  <option value="" disabled>Assign to…</option>
                  {data.teachers.filter((t) => t.id !== l.teacher_id).map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
                </select>
                <Btn small onClick={() => undoCoverRequest(l.id)}>Undo</Btn>
              </div>
            </div>
            {l.reason && <div style={{ color: COLORS.inkSoft, marginTop: 4 }}>{l.reason}</div>}
          </div>
        ))}
        {needsCover.length === 0 && <div style={{ fontSize: 13, color: COLORS.inkSoft }}>Nothing open for cover.</div>}
      </div>

      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Needs rescheduling ({needsReschedule.length})</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {needsReschedule.map((l) => (
          <div key={l.id} style={{ padding: "10px 14px", background: COLORS.card, border: "1px solid " + COLORS.border, borderRadius: 8, fontSize: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <span>{fmtDate(l.date)} · <strong>{studentName(l.student_id)}</strong> · {teacherNameOf(l.teacher_id)} · {l.time.slice(0, 5)}–{addMinutes(l.time, l.duration_min || 30)} · <span style={{ color: COLORS.amberDark }}>{statusLabel(l.status)}</span></span>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn small variant="owner" onClick={() => setReschedLesson(l)}>Reschedule</Btn>
                <Btn small onClick={() => undoDecide(l.id)}>Undo</Btn>
              </div>
            </div>
            {l.suggested_date && l.suggested_time && (
              <div style={{ fontSize: 12, color: COLORS.owner, marginTop: 6 }}>
                Teacher suggested {fmtDate(l.suggested_date)} · {l.suggested_time.slice(0, 5)}{l.suggested_note ? ` — ${l.suggested_note}` : ""}
                {" · "}<a href="#" onClick={(e) => { e.preventDefault(); setReschedLesson(l); }} style={{ color: COLORS.owner }}>Use this</a>
              </div>
            )}
          </div>
        ))}
        {needsReschedule.length === 0 && <div style={{ fontSize: 13, color: COLORS.inkSoft }}>Nothing needs rescheduling.</div>}
      </div>

      {openDate && <DayModal date={openDate} data={data} refresh={refresh} onClose={() => setOpenDate(null)} />}
      {reschedLesson && <RescheduleModal lesson={reschedLesson} data={data} refresh={refresh} onClose={() => setReschedLesson(null)} />}

      {showAdd && (
        <Modal title="Add lesson" onClose={() => setShowAdd(false)}>
          <form onSubmit={addLesson}>
            <Field label="Date"><input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={inputStyle} /></Field>
            <Field label="Time"><input type="time" required value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} style={inputStyle} /></Field>
            <Field label="Duration (min)"><input type="number" required value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} style={inputStyle} /></Field>
            <Field label="Teacher">
              <select value={form.teacherId} onChange={(e) => setForm({ ...form, teacherId: e.target.value })} style={inputStyle}>
                <option value="">Unassigned</option>
                {data.teachers.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
              </select>
            </Field>
            <Field label="Student">
              <select value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })} style={inputStyle}>
                {data.students.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
              </select>
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Instrument">
                <select value={form.instrument} onChange={(e) => setForm({ ...form, instrument: e.target.value })} style={inputStyle}>
                  <option value="">—</option>
                  {data.courses.map((c) => (<option key={c.id} value={c.name}>{c.name}</option>))}
                </select>
              </Field>
              <Field label="Room"><input value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} style={inputStyle} placeholder="e.g. Room 2" /></Field>
            </div>
            {formClashes.length > 0 && (
              <div style={{ fontSize: 13, color: COLORS.danger, marginBottom: 12, padding: "8px 10px", background: COLORS.dangerBg, borderRadius: 8 }}>
                Clashes with {formClashes.length} other lesson{formClashes.length > 1 ? "s" : ""} at this time (same teacher or student).
              </div>
            )}
            <Btn type="submit" variant="owner" style={{ width: "100%", marginTop: 4 }}>Add lesson</Btn>
          </form>
        </Modal>
      )}
    </div>
  );
}

function TeachersTab({ data, refresh }) {
  const [showAdd, setShowAdd] = useState(false);
  const [linking, setLinking] = useState(null);
  const [managingRates, setManagingRates] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", payType: "flat", rate: 35 });
  const [linkUid, setLinkUid] = useState("");
  const [linkErr, setLinkErr] = useState("");
  const [rateForm, setRateForm] = useState({ course: "", instrument: "", level: "", payType: "percent", rate: 60 });

  const addTeacher = async (e) => {
    e.preventDefault();
    await supabase.from("teachers").insert({ name: form.name, pay_type: form.payType, rate: Number(form.rate) });
    setForm({ name: "", payType: "flat", rate: 35 }); setShowAdd(false); refresh();
  };
  const saveEdit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await supabase.from("teachers").update({ name: fd.get("name"), pay_type: fd.get("payType"), rate: Number(fd.get("rate")) }).eq("id", editing.id);
    setEditing(null); refresh();
  };
  const removeTeacher = async (id) => {
    if (!confirm("Remove this teacher? Their existing lessons will keep their history but show as unassigned.")) return;
    await supabase.from("teachers").delete().eq("id", id);
    setEditing(null); refresh();
  };
  const linkLogin = async (e) => {
    e.preventDefault(); setLinkErr("");
    const { error: pErr } = await supabase.from("profiles").upsert({ id: linkUid, role: "teacher" });
    if (pErr) { setLinkErr(pErr.message); return; }
    const { error: tErr } = await supabase.from("teachers").update({ user_id: linkUid }).eq("id", linking);
    if (tErr) { setLinkErr(tErr.message); return; }
    setLinking(null); setLinkUid(""); refresh();
  };
  const addRate = async (e) => {
    e.preventDefault();
    await supabase.from("teacher_rates").insert({ teacher_id: managingRates, course: rateForm.course || null, instrument: rateForm.instrument || null, level: rateForm.level || null, pay_type: rateForm.payType, rate: Number(rateForm.rate) });
    setRateForm({ course: "", instrument: "", level: "", payType: "percent", rate: 60 }); refresh();
  };
  const removeRate = async (id) => { await supabase.from("teacher_rates").delete().eq("id", id); refresh(); };

  // A teacher's students should count anyone assigned to them EITHER on the
  // calendar (actual lesson rows) OR on the instrument record itself — an
  // instrument saved without a Day/Time creates zero lessons, so counting
  // lessons alone silently drops students who are assigned but not yet
  // scheduled.
  const studentsForTeacher = (teacherId) => {
    const ids = new Set();
    data.lessons.forEach((l) => { if (l.teacher_id === teacherId) ids.add(l.student_id); });
    data.students.forEach((s) => { if (s.teacher_id === teacherId) ids.add(s.id); });
    data.studentInstruments.forEach((si) => { if (si.teacher_id === teacherId) ids.add(si.student_id); });
    return [...ids].map((id) => data.students.find((s) => s.id === id)).filter(Boolean);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}><Btn variant="owner" onClick={() => setShowAdd(true)}>+ Add teacher</Btn></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        {data.teachers.map((t) => {
          const myLessons = data.lessons.filter((l) => l.teacher_id === t.id);
          const count = myLessons.length;
          const studentCount = studentsForTeacher(t.id).length;
          const pendingCount = myLessons.filter((l) => l.status === "missed-teacher").length;
          const upcomingCount = myLessons.filter((l) => l.replacement_of && l.status === "scheduled").length;
          const rates = data.teacherRates.filter((r) => r.teacher_id === t.id);
          return (
            <Card key={t.id}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{t.name}</div>
              <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 6 }}>Default: {t.pay_type === "flat" ? `${fmtMoney(t.rate)} / lesson` : `${t.rate}% of lesson price`}</div>
              {rates.length > 0 && (
                <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 6 }}>
                  Teaches: {[...new Set(rates.map((r) => r.instrument || r.course))].join(", ")}
                </div>
              )}
              {rates.length > 0 && (
                <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 6 }}>
                  {rates.map((r) => (<div key={r.id}>{r.instrument || r.course}{r.level ? ` (${r.level})` : ""}: {r.pay_type === "flat" ? fmtMoney(r.rate) : `${r.rate}%`}</div>))}
                </div>
              )}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                <button onClick={() => setEditing(t)} style={{ border: "none", background: "none", padding: 0, cursor: "pointer" }}><Badge tone="owner">{studentCount} students</Badge></button>
                {pendingCount > 0 && <button onClick={() => setEditing(t)} style={{ border: "none", background: "none", padding: 0, cursor: "pointer" }}><Badge tone="danger">{pendingCount} pending replacement</Badge></button>}
                {upcomingCount > 0 && <button onClick={() => setEditing(t)} style={{ border: "none", background: "none", padding: 0, cursor: "pointer" }}><Badge tone="amber">{upcomingCount} upcoming replacement</Badge></button>}
                <Badge tone={t.user_id ? "success" : "amber"}>{t.user_id ? "Login linked" : "No login yet"}</Badge>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {!t.user_id && <Btn small onClick={() => setLinking(t.id)}>Link login</Btn>}
                <Btn small onClick={() => setManagingRates(t.id)}>Rates</Btn>
                <Btn small onClick={() => setEditing(t)}>Edit</Btn>
              </div>
            </Card>
          );
        })}
      </div>
      {editing && (() => {
        const t = editing;
        const myLessons = data.lessons.filter((l) => l.teacher_id === t.id);
        const myStudents = studentsForTeacher(t.id);
        const pendingReplacement = myLessons.filter((l) => l.status === "missed-teacher");
        const upcomingReplacement = myLessons.filter((l) => l.replacement_of && l.status === "scheduled").sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
        const studentName = (id) => data.students.find((s) => s.id === id)?.name || "—";
        const taughtCourseIds = new Set(data.teacherRates.filter((r) => r.teacher_id === t.id).map((r) => r.course || r.instrument));

        const toggleCourse = async (course, checked) => {
          if (checked) {
            await supabase.from("teacher_rates").insert({ teacher_id: t.id, instrument: course.name, pay_type: t.pay_type, rate: t.rate });
          } else {
            const row = data.teacherRates.find((r) => r.teacher_id === t.id && (r.instrument === course.name || r.course === course.name));
            if (row) await supabase.from("teacher_rates").delete().eq("id", row.id);
          }
          refresh();
        };

        return (
          <Modal title={`Edit ${t.name}`} onClose={() => setEditing(null)}>
            <form onSubmit={saveEdit}>
              <Field label="Name"><input name="name" required defaultValue={t.name} style={inputStyle} /></Field>
              <Field label="Pay structure">
                <select name="payType" defaultValue={t.pay_type} style={inputStyle}>
                  <option value="flat">Flat rate per lesson</option><option value="percent">Percentage of lesson price</option>
                </select>
              </Field>
              <Field label="Rate"><input name="rate" type="number" min="0" required defaultValue={t.rate} style={inputStyle} /></Field>
              <Btn type="submit" variant="owner" style={{ width: "100%", marginTop: 4 }}>Save changes</Btn>
            </form>

            <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid " + COLORS.border }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Courses taught</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 4 }}>
                {data.courses.map((c) => (
                  <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                    <input type="checkbox" checked={taughtCourseIds.has(c.name)} onChange={(e) => toggleCourse(c, e.target.checked)} />
                    {c.name}
                  </label>
                ))}
                {data.courses.length === 0 && <div style={{ fontSize: 12, color: COLORS.inkSoft }}>No courses in the catalog yet — add some under the Courses tab.</div>}
              </div>
              <div style={{ fontSize: 11, color: COLORS.inkSoft }}>Checking one adds it at their default rate — fine-tune with "Rates" if a course pays differently.</div>
            </div>

            <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid " + COLORS.border }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Students ({myStudents.length})</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {myStudents.map((s) => {
                  const hasLessons = myLessons.some((l) => l.student_id === s.id);
                  return (
                    <Badge key={s.id} tone={hasLessons ? "owner" : "amber"}>
                      {s.name}{!hasLessons ? " (not scheduled)" : ""}
                    </Badge>
                  );
                })}
                {myStudents.length === 0 && <div style={{ fontSize: 12, color: COLORS.inkSoft }}>No students yet.</div>}
              </div>
              {myStudents.some((s) => !myLessons.some((l) => l.student_id === s.id)) && (
                <div style={{ fontSize: 11.5, color: COLORS.amberDark, marginTop: 6 }}>
                  "Not scheduled" students are assigned on an instrument but have no Day/Time set, so no lessons ever got generated for them — open their instrument and fill in Day/Time to put them on the calendar.
                </div>
              )}
            </div>

            <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid " + COLORS.border }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Pending replacement ({pendingReplacement.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {pendingReplacement.map((l) => (
                  <div key={l.id} style={{ fontSize: 12, color: COLORS.dangerDark }}>{fmtDate(l.date)} · {studentName(l.student_id)}</div>
                ))}
                {pendingReplacement.length === 0 && <div style={{ fontSize: 12, color: COLORS.inkSoft }}>None outstanding.</div>}
              </div>
            </div>

            <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid " + COLORS.border }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Upcoming replacement ({upcomingReplacement.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {upcomingReplacement.map((l) => (
                  <div key={l.id} style={{ fontSize: 12, color: COLORS.inkSoft }}>{fmtDate(l.date)} · {l.time.slice(0, 5)} · {studentName(l.student_id)}</div>
                ))}
                {upcomingReplacement.length === 0 && <div style={{ fontSize: 12, color: COLORS.inkSoft }}>None scheduled.</div>}
              </div>
            </div>

            <Btn variant="danger" style={{ width: "100%", marginTop: 18 }} onClick={() => removeTeacher(t.id)}>Remove teacher</Btn>
          </Modal>
        );
      })()}
      {showAdd && (
        <Modal title="Add teacher" onClose={() => setShowAdd(false)}>
          <form onSubmit={addTeacher}>
            <Field label="Name"><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} /></Field>
            <Field label="Pay structure">
              <select value={form.payType} onChange={(e) => setForm({ ...form, payType: e.target.value })} style={inputStyle}>
                <option value="flat">Flat rate per lesson</option><option value="percent">Percentage of lesson price</option>
              </select>
            </Field>
            <Field label={form.payType === "flat" ? "Rate (RM per lesson)" : "Percentage (%)"}>
              <input type="number" min="0" required value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} style={inputStyle} />
            </Field>
            <Btn type="submit" variant="owner" style={{ width: "100%", marginTop: 4 }}>Add teacher</Btn>
          </form>
        </Modal>
      )}
      {linking && (
        <Modal title="Link teacher's login" onClose={() => setLinking(null)}>
          <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 12 }}>Create the login in Supabase (Authentication → Add user) first, then paste their User UID here.</div>
          <form onSubmit={linkLogin}>
            <Field label="User UID"><input required value={linkUid} onChange={(e) => setLinkUid(e.target.value)} style={inputStyle} /></Field>
            {linkErr && <div style={{ fontSize: 13, color: COLORS.danger, marginBottom: 12 }}>{linkErr}</div>}
            <Btn type="submit" variant="owner" style={{ width: "100%" }}>Link</Btn>
          </form>
        </Modal>
      )}
      {managingRates && (() => {
        const t = data.teachers.find((x) => x.id === managingRates);
        const rates = data.teacherRates.filter((r) => r.teacher_id === managingRates);
        return (
          <Modal title={`${t.name} — rates`} onClose={() => setManagingRates(null)}>
            <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 12 }}>Overrides the default rate for lessons matching an instrument or course. Instrument matches take priority. Leave both unset to use the default.</div>
            {rates.map((r) => (
              <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderTop: "1px solid " + COLORS.border, fontSize: 13 }}>
                <span>{r.instrument || r.course}{r.level ? ` (${r.level})` : ""} · {r.pay_type === "flat" ? fmtMoney(r.rate) : `${r.rate}%`}</span>
                <Btn small variant="danger" onClick={() => removeRate(r.id)}>Remove</Btn>
              </div>
            ))}
            <form onSubmit={addRate} style={{ marginTop: 14, borderTop: "1px solid " + COLORS.border, paddingTop: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="Instrument">
                  <select value={rateForm.instrument} onChange={(e) => setRateForm({ ...rateForm, instrument: e.target.value, level: "" })} style={inputStyle}>
                    <option value="">—</option>
                    {data.courses.map((c) => (<option key={c.id} value={c.name}>{c.name}</option>))}
                  </select>
                </Field>
                <Field label="Or course">
                  <select value={rateForm.course} onChange={(e) => setRateForm({ ...rateForm, course: e.target.value })} style={inputStyle}>
                    <option value="">—</option>
                    {data.courses.map((c) => (<option key={c.id} value={c.name}>{c.name}</option>))}
                  </select>
                </Field>
              </div>
              {(() => {
                const selectedCourse = data.courses.find((c) => c.name === rateForm.instrument);
                const levels = selectedCourse ? data.courseLevels.filter((l) => l.course_id === selectedCourse.id) : [];
                if (levels.length === 0) return null;
                return (
                  <Field label="Level (optional — leave blank to cover the whole instrument)">
                    <select value={rateForm.level} onChange={(e) => setRateForm({ ...rateForm, level: e.target.value })} style={inputStyle}>
                      <option value="">All levels</option>
                      {levels.map((l) => (<option key={l.id} value={l.name}>{l.name}</option>))}
                    </select>
                  </Field>
                );
              })()}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="Pay structure">
                  <select value={rateForm.payType} onChange={(e) => setRateForm({ ...rateForm, payType: e.target.value })} style={inputStyle}>
                    <option value="flat">Flat rate</option><option value="percent">Percentage</option>
                  </select>
                </Field>
                <Field label={rateForm.payType === "flat" ? "Rate (RM)" : "Percentage (%)"}>
                  <input type="number" required value={rateForm.rate} onChange={(e) => setRateForm({ ...rateForm, rate: e.target.value })} style={inputStyle} />
                </Field>
              </div>
              <Btn type="submit" variant="owner" style={{ width: "100%" }}>Save rate</Btn>
            </form>
          </Modal>
        );
      })()}
    </div>
  );
}

const emptyStudentForm = {
  firstName: "", lastName: "", age: "", gender: "", grade: "", centre: "Play Studio", notes: "", ageGroup: "", joiningYear: "",
};

const emptySeriesForm = {
  course: "", level: "", billingType: "lesson", monthlyRate: "",
  teacherId: "", price: 80, duration: 30, permanentDay: "", time: "", forHowLong: 3, unit: "months", room: "",
};

function StudentsTab({ data, refresh }) {
  const [showAdd, setShowAdd] = useState(false);
  const [openStudent, setOpenStudent] = useState(null);
  const [editingStudent, setEditingStudent] = useState(null);
  const [editLesson, setEditLesson] = useState(null);
  const [editLessonForm, setEditLessonForm] = useState({ date: "", time: "", duration: 30, price: 0, instrument: "", room: "" });
  const [selectedLessons, setSelectedLessons] = useState([]);
  const [planForm, setPlanForm] = useState({ date: todayIso(), what: "", remarks: "" });
  const [addSeriesOpen, setAddSeriesOpen] = useState(false);
  const [seriesForm, setSeriesForm] = useState(emptySeriesForm);
  const [editingInstrument, setEditingInstrument] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [importing, setImporting] = useState(false);
  const csvFileRef = useRef(null);
  const [form, setForm] = useState(emptyStudentForm);
  const [filters, setFilters] = useState({ day: "", course: "", centre: "", search: "", status: "active", ageGroup: "" });

  const courses = useMemo(() => [...new Set(data.students.map((s) => s.course).filter(Boolean))], [data.students]);
  const centres = useMemo(() => [...new Set(data.students.map((s) => s.centre).filter(Boolean))], [data.students]);

  const upcomingCount = (studentId) => data.lessons.filter((l) => l.student_id === studentId && l.status === "scheduled" && l.date >= todayIso()).length;
  const nextLesson = (studentId) => {
    const l = data.lessons.filter((l) => l.student_id === studentId && l.status === "scheduled" && l.date >= todayIso()).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
    return l ? `${fmtDate(l.date)} · ${l.time.slice(0, 5)}` : null;
  };

  const filtered = data.students.filter((s) => {
    if (filters.status !== "all" && (s.status || "active") !== filters.status) return false;
    if (filters.day !== "" && s.permanent_day !== Number(filters.day)) return false;
    if (filters.course && s.course !== filters.course) return false;
    if (filters.centre && s.centre !== filters.centre) return false;
    if (filters.ageGroup && s.age_group !== filters.ageGroup) return false;
    if (filters.search && !s.name.toLowerCase().includes(filters.search.toLowerCase())) return false;
    return true;
  });

  const generateSeries = async ({ studentId, teacherId, price, duration, permanentDay, time, forHowLong, unit, instrument, room }) => {
    if (permanentDay === "" || !time) return;
    const weeks = unit === "months" ? Math.round((Number(forHowLong) * 30) / 7) : Number(forHowLong);
    const targetDay = Number(permanentDay);
    let firstDate = new Date();
    const diff = (targetDay - firstDate.getDay() + 7) % 7;
    firstDate.setDate(firstDate.getDate() + diff);
    const rows = [];
    let iso = isoDate(firstDate);
    for (let i = 0; i < weeks; i++) {
      rows.push({
        date: iso, time, teacher_id: teacherId || null, student_id: studentId,
        price: Number(price), duration_min: Number(duration), status: "scheduled",
        instrument: instrument || null, room: room || null,
      });
      iso = addDays(iso, 7);
    }
    if (rows.length) await supabase.from("lessons").insert(rows);
  };

  const addStudent = async (e) => {
    e.preventDefault();
    const combinedName = `${form.firstName.trim()} ${form.lastName.trim()}`.trim();
    const { data: inserted, error } = await supabase.from("students").insert({
      name: combinedName, first_name: form.firstName.trim() || null, last_name: form.lastName.trim() || null,
      age: form.age ? Number(form.age) : null, gender: form.gender || null, grade: form.grade || null,
      centre: form.centre || null, notes: form.notes || null, age_group: form.ageGroup || null,
      joining_year: form.joiningYear ? Number(form.joiningYear) : null,
      billing_type: "per_lesson", price: 0,
    }).select().single();
    if (error || !inserted) { return; }
    setForm(emptyStudentForm); setShowAdd(false);
    await refresh();
    setOpenStudent(inserted.id);
    setAddSeriesOpen(true);
  };

  const CSV_HEADERS = ["First name", "Last name", "Age", "Category (child/adult)", "Gender", "Joining year", "Centre", "Notes", "Course", "Level", "Billing (lesson/month)", "Rate (RM)", "Day", "Time (HH:MM)", "Duration (min)", "Teacher", "Room", "For How Long", "Unit (months/weeks)"];

  const downloadCsvTemplate = () => {
    const example = ["Aaron", "Tan", "10", "child", "male", "2026", "Play Studio", "", "Piano", "1", "month", "150", "Sunday", "14:00", "30", "Teacher Samuel", "", "3", "months"];
    const escape = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const csv = [CSV_HEADERS, example].map((row) => row.map(escape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "students-template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const downloadStudentList = () => {
    const escape = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const headers = ["Name", "First name", "Last name", "Age", "Category", "Gender", "Joining year", "Centre", "Status", "Notes", "Instruments"];
    const rows = data.students.map((s) => {
      const instruments = [];
      if (s.course) instruments.push(`${s.course}${s.level ? ` (${s.level})` : ""} — ${s.billing_type === "per_month" ? `${fmtMoney(s.monthly_rate || 0)}/mo` : `${fmtMoney(s.price)}/lesson`}${s.teacher_id ? ` — ${data.teachers.find((t) => t.id === s.teacher_id)?.name || "Unassigned"}` : ""}`);
      data.studentInstruments.filter((si) => si.student_id === s.id).forEach((si) => {
        instruments.push(`${si.course}${si.level ? ` (${si.level})` : ""} — ${si.billing_type === "per_month" ? `${fmtMoney(si.monthly_rate || 0)}/mo` : `${fmtMoney(si.price)}/lesson`}${si.teacher_id ? ` — ${data.teachers.find((t) => t.id === si.teacher_id)?.name || "Unassigned"}` : ""}`);
      });
      return [
        s.name, s.first_name || "", s.last_name || "", s.age ?? "", s.age_group === "adult" ? "Adult" : s.age_group === "child" ? "Child" : "",
        s.gender || "", s.joining_year ?? "", s.centre || "", s.status || "active", s.notes || "",
        instruments.length ? instruments.join(" | ") : "No instruments yet",
      ];
    });
    const csv = [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `students-${todayIso()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const importCsv = async (file) => {
    setImporting(true);
    setImportResult(null);
    const Papa = (await import("papaparse")).default;

    const parseRowInstrument = (row) => {
      const teacherName = (row["Teacher"] || "").trim().toLowerCase();
      const teacher = teacherName ? data.teachers.find((t) => t.name.trim().toLowerCase() === teacherName) : null;
      const dayLabel = (row["Day"] || "").trim().toLowerCase();
      const dayOpt = dayLabel ? DAY_OPTIONS.find((d) => d.label.toLowerCase() === dayLabel) : null;
      const billing = (row["Billing (lesson/month)"] || "lesson").trim().toLowerCase();
      const isMonthly = billing.startsWith("month");
      const rawRate = (row["Rate (RM)"] || "").toString().trim();
      const rateNum = Number(rawRate);
      const rateValid = rawRate !== "" && !Number.isNaN(rateNum);
      const rate = rateValid ? rateNum : 0;
      const course = (row["Course"] || "").trim() || null;
      const rawTime = (row["Time (HH:MM)"] || "").trim();
      const time = parseTimeToHHMM(rawTime);
      const duration = Number(row["Duration (min)"]) || 30;
      const forHowLong = Number(row["For How Long"]) || 3;
      const unit = (row["Unit (months/weeks)"] || "months").trim() || "months";
      const room = (row["Room"] || "").trim() || "";
      return { teacher, teacherName, dayLabel, dayOpt, isMonthly, rate, rawRate, rateValid, course, time, rawTime, duration, forHowLong, unit, room };
    };

    const buildInsert = (p) => ({
      course: p.course, level: null,
      billing_type: p.isMonthly ? "per_month" : "per_lesson",
      monthly_rate: p.isMonthly ? p.rate : null,
      price: p.isMonthly ? 0 : p.rate,
      permanent_day: p.dayOpt ? p.dayOpt.value : null,
      permanent_time: p.dayOpt && p.time ? p.time : null,
      duration_min: p.duration,
      teacher_id: p.teacher?.id || null,
      room: p.room || null,
    });

    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: async (results) => {
        const groups = new Map();
        for (const row of results.data) {
          const firstName = (row["First name"] || "").trim();
          const lastName = (row["Last name"] || "").trim();
          const name = `${firstName} ${lastName}`.trim();
          if (!name) continue;
          const key = name.toLowerCase();
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(row);
        }

        let ok = 0; let instrumentsAdded = 0; const errors = [];
        for (const [, rows] of groups) {
          const first = rows[0];
          const firstName = (first["First name"] || "").trim();
          const lastName = (first["Last name"] || "").trim();
          const name = `${firstName} ${lastName}`.trim();
          const flagRow = (label, p) => {
            if (!p.rateValid) errors.push(`${name} (${label}): rate "${p.rawRate}" isn't a number — imported as RM0, fix manually.`);
            if (p.rawTime && !p.time) errors.push(`${name} (${label}): couldn't read time "${p.rawTime}" — left unscheduled, add manually.`);
            if (p.dayLabel && !p.dayOpt) errors.push(`${name} (${label}): "${first["Day"]}" isn't a single recognized day — left unscheduled, add manually.`);
            if (p.teacherName && !p.teacher) errors.push(`${name} (${label}): teacher "${p.teacherName}" not found — left unassigned.`);
          };
          try {
            const ageGroupRaw = (first["Category (child/adult)"] || "").trim().toLowerCase();
            const ageGroup = ageGroupRaw === "adult" ? "adult" : ageGroupRaw === "child" ? "child" : null;
            const p = parseRowInstrument(first);
            const level = (first["Level"] || "").trim() || null;
            const { data: inserted, error } = await supabase.from("students").insert({
              name, first_name: firstName || null, last_name: lastName || null,
              age: first["Age"] ? Number(first["Age"]) : null, gender: (first["Gender"] || "").trim().toLowerCase() || null,
              joining_year: first["Joining year"] ? Number(first["Joining year"]) : null,
              centre: (first["Centre"] || "").trim() || null, notes: (first["Notes"] || "").trim() || null,
              age_group: ageGroup, level,
              ...buildInsert(p),
            }).select().single();
            if (error || !inserted) throw new Error(error?.message || "insert failed");
            if (p.dayOpt && p.time) {
              await generateSeries({
                studentId: inserted.id, teacherId: p.teacher?.id || "", price: p.isMonthly ? 0 : p.rate,
                duration: p.duration, permanentDay: String(p.dayOpt.value), time: p.time,
                forHowLong: p.forHowLong, unit: p.unit, instrument: p.course || "", room: p.room,
              });
            }
            flagRow(p.course || "primary instrument", p);
            ok += 1;

            for (let i = 1; i < rows.length; i++) {
              const r = rows[i];
              const q = parseRowInstrument(r);
              const qLevel = (r["Level"] || "").trim() || null;
              const { error: siErr } = await supabase.from("student_instruments").insert({
                student_id: inserted.id, course: q.course, level: qLevel,
                price: q.isMonthly ? 0 : q.rate, billing_type: q.isMonthly ? "per_month" : "per_lesson",
                monthly_rate: q.isMonthly ? q.rate : null, teacher_id: q.teacher?.id || null,
                permanent_day: q.dayOpt ? q.dayOpt.value : null, permanent_time: q.dayOpt && q.time ? q.time : null,
                duration_min: q.duration, room: q.room || null,
              });
              if (siErr) throw new Error(siErr.message);
              if (q.dayOpt && q.time) {
                await generateSeries({
                  studentId: inserted.id, teacherId: q.teacher?.id || "", price: q.isMonthly ? 0 : q.rate,
                  duration: q.duration, permanentDay: String(q.dayOpt.value), time: q.time,
                  forHowLong: q.forHowLong, unit: q.unit, instrument: q.course || "", room: q.room,
                });
              }
              flagRow(q.course || `extra instrument ${i + 1}`, q);
              instrumentsAdded += 1;
            }
          } catch (err) {
            errors.push(`${name}: ${err.message || "failed"}`);
          }
        }
        setImportResult({ ok, instrumentsAdded, errors });
        setImporting(false);
        refresh();
      },
      error: (err) => { setImportResult({ ok: 0, instrumentsAdded: 0, errors: [err.message || "Could not read that file"] }); setImporting(false); },
    });
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <Btn onClick={downloadStudentList}>Download student list (CSV)</Btn>
        <Btn onClick={downloadCsvTemplate}>Download CSV template</Btn>
        <input ref={csvFileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) importCsv(f); e.target.value = ""; }} />
        <Btn onClick={() => csvFileRef.current?.click()} disabled={importing}>{importing ? "Importing…" : "Import CSV"}</Btn>
        <Btn variant="owner" onClick={() => setShowAdd(true)}>+ Add student</Btn>
      </div>
      {importResult && (
        <Card style={{ marginBottom: 14, background: importResult.errors.length ? COLORS.dangerBg : COLORS.successBg, border: "none" }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            {importResult.ok} student{importResult.ok === 1 ? "" : "s"} imported{importResult.instrumentsAdded ? `, plus ${importResult.instrumentsAdded} extra instrument${importResult.instrumentsAdded === 1 ? "" : "s"} added to existing rows for the same person` : ""}.
          </div>
          {importResult.errors.length > 0 && (
            <div style={{ fontSize: 12, marginTop: 6 }}>
              {importResult.errors.length} thing{importResult.errors.length > 1 ? "s" : ""} to check:
              <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                {importResult.errors.map((e, i) => (<li key={i}>{e}</li>))}
              </ul>
            </div>
          )}
          <a href="#" onClick={(e) => { e.preventDefault(); setImportResult(null); }} style={{ fontSize: 12, color: COLORS.inkSoft, display: "inline-block", marginTop: 6 }}>Dismiss</a>
        </Card>
      )}

      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input placeholder="Search by name" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} style={{ ...inputStyle, flex: "2 1 160px" }} />
          <select value={filters.day} onChange={(e) => setFilters({ ...filters, day: e.target.value })} style={{ ...inputStyle, flex: "1 1 120px" }}>
            <option value="">All days</option>
            {DAY_OPTIONS.map((d) => (<option key={d.value} value={d.value}>{d.label}</option>))}
          </select>
          <select value={filters.course} onChange={(e) => setFilters({ ...filters, course: e.target.value })} style={{ ...inputStyle, flex: "1 1 120px" }}>
            <option value="">All courses</option>
            {courses.map((c) => (<option key={c} value={c}>{c}</option>))}
          </select>
          <select value={filters.centre} onChange={(e) => setFilters({ ...filters, centre: e.target.value })} style={{ ...inputStyle, flex: "1 1 120px" }}>
            <option value="">All centres</option>
            {centres.map((c) => (<option key={c} value={c}>{c}</option>))}
          </select>
          <select value={filters.ageGroup} onChange={(e) => setFilters({ ...filters, ageGroup: e.target.value })} style={{ ...inputStyle, flex: "1 1 120px" }}>
            <option value="">Children & adults</option>
            <option value="child">Children only</option>
            <option value="adult">Adults only</option>
          </select>
          <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} style={{ ...inputStyle, flex: "1 1 120px" }}>
            <option value="active">Active</option>
            <option value="paused">Temporary stop</option>
            <option value="terminated">Terminated</option>
            <option value="graduated">Graduated</option>
            <option value="all">All statuses</option>
          </select>
        </div>
      </Card>

      <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 8 }}>{filtered.length} student{filtered.length === 1 ? "" : "s"}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {filtered.map((s) => (
          <Card key={s.id} style={{ padding: "10px 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontSize: 13 }}>
                <strong>{s.name}</strong>
                <span style={{ color: COLORS.inkSoft }}>
                  {s.age ? ` · ${s.age}yo` : ""}{s.age_group ? ` · ${s.age_group === "adult" ? "Adult" : "Child"}` : ""}{s.gender ? ` · ${s.gender}` : ""}{s.grade ? ` · ${s.grade}` : ""}{s.centre ? ` · ${s.centre}` : ""}
                </span>
                <div style={{ color: COLORS.inkSoft, fontSize: 12, marginTop: 2 }}>
                  {(() => {
                    const list = [];
                    if (s.course) list.push({ course: s.course, level: s.level, rateLabel: s.billing_type === "per_month" ? `${fmtMoney(s.monthly_rate || 0)}/mo` : `${fmtMoney(s.price)}/lesson` });
                    data.studentInstruments.filter((si) => si.student_id === s.id).forEach((si) => {
                      list.push({ course: si.course, level: si.level, rateLabel: si.billing_type === "per_month" ? `${fmtMoney(si.monthly_rate || 0)}/mo` : `${fmtMoney(si.price)}/lesson` });
                    });
                    if (list.length === 0) return "No instruments yet";
                    return list.map((it, i) => (
                      <span key={i}>{i > 0 ? " · " : ""}{it.course}{it.level ? ` (${it.level})` : ""} — {it.rateLabel}</span>
                    ));
                  })()}
                </div>
                {nextLesson(s.id) && <div style={{ color: COLORS.inkSoft, fontSize: 12 }}>Next: {nextLesson(s.id)}</div>}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {s.status && s.status !== "active" && <Badge tone="amber">{s.status}</Badge>}
                {s.billing_type === "per_month" && !s.monthly_rate && <Badge tone="danger">No monthly rate set</Badge>}
                {(() => {
                  const { owed, settled, invoiceCount } = studentInvoiceSummary(s.id, data.invoices);
                  if (!settled) return <Badge tone="danger">Not settled — {fmtMoney(owed)}</Badge>;
                  if (invoiceCount > 0) return <Badge tone="success">Settled</Badge>;
                  return null;
                })()}
                <Badge tone="owner">{upcomingCount(s.id)} upcoming</Badge>
                <Btn small onClick={() => setOpenStudent(s.id)}>Open</Btn>
              </div>
            </div>
          </Card>
        ))}
        {filtered.length === 0 && <div style={{ fontSize: 13, color: COLORS.inkSoft }}>No students match.</div>}
      </div>

      {showAdd && (
        <Modal title="Add student" onClose={() => setShowAdd(false)}>
          <form onSubmit={addStudent}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Last name"><input required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} style={inputStyle} /></Field>
              <Field label="First name"><input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} style={inputStyle} /></Field>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Age"><input type="number" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} style={inputStyle} /></Field>
              <Field label="Gender">
                <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} style={inputStyle}>
                  <option value="">—</option><option value="male">Male</option><option value="female">Female</option>
                </select>
              </Field>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Category (for pricing)">
                <select value={form.ageGroup} onChange={(e) => setForm({ ...form, ageGroup: e.target.value })} style={inputStyle}>
                  <option value="">—</option><option value="child">Child</option><option value="adult">Adult</option>
                </select>
              </Field>
              <Field label="Joining year"><input type="number" placeholder="e.g. 2026" value={form.joiningYear} onChange={(e) => setForm({ ...form, joiningYear: e.target.value })} style={inputStyle} /></Field>
            </div>
            <Field label="Centre"><input value={form.centre} onChange={(e) => setForm({ ...form, centre: e.target.value })} style={inputStyle} /></Field>
            <Field label="Notes"><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={inputStyle} /></Field>
            <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 12 }}>Just the basics for now — you'll add their instrument, schedule, and teacher right after, on their profile.</div>
            <Btn type="submit" variant="owner" style={{ width: "100%", marginTop: 8 }}>Add student</Btn>
          </form>
        </Modal>
      )}

      {openStudent && (() => {
        const s = data.students.find((x) => x.id === openStudent);
        const lessons = data.lessons.filter((l) => l.student_id === openStudent).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
        const cancelLesson = async (id) => { await supabase.from("lessons").update({ status: "cancelled" }).eq("id", id); refresh(); };
        const uncancelLesson = async (id) => { await supabase.from("lessons").update({ status: "scheduled" }).eq("id", id); refresh(); };
        const removeLesson = async (id) => { await supabase.from("lessons").delete().eq("id", id); refresh(); };
        const toggle = (id) => setSelectedLessons((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
        const allSelected = lessons.length > 0 && lessons.every((l) => selectedLessons.includes(l.id));
        const toggleAll = () => setSelectedLessons(allSelected ? [] : lessons.map((l) => l.id));
        const bulkCancel = async () => { await supabase.from("lessons").update({ status: "cancelled" }).in("id", selectedLessons); setSelectedLessons([]); refresh(); };
        const bulkRemove = async () => {
          if (!confirm(`Remove ${selectedLessons.length} lesson(s)? This can't be undone.`)) return;
          await supabase.from("lessons").delete().in("id", selectedLessons); setSelectedLessons([]); refresh();
        };
        const plans = data.lessonPlans.filter((p) => p.student_id === openStudent).sort((a, b) => a.date.localeCompare(b.date));
        const addPlan = async (e) => {
          e.preventDefault();
          await supabase.from("lesson_plans").insert({ student_id: openStudent, date: planForm.date, what_to_teach: planForm.what, remarks: planForm.remarks || null });
          setPlanForm({ date: todayIso(), what: "", remarks: "" }); refresh();
        };
        const removePlan = async (id) => { await supabase.from("lesson_plans").delete().eq("id", id); refresh(); };
        const otherInstruments = data.studentInstruments.filter((si) => si.student_id === openStudent);
        const isFirstInstrument = !s.course;
        const addInstrument = async (e) => {
          e.preventDefault();
          if (isFirstInstrument) {
            await supabase.from("students").update({
              course: seriesForm.course || null,
              level: seriesForm.level || null,
              billing_type: seriesForm.billingType === "month" ? "per_month" : "per_lesson",
              monthly_rate: seriesForm.billingType === "month" ? Number(seriesForm.monthlyRate || 0) : null,
              price: seriesForm.billingType === "month" ? 0 : Number(seriesForm.price || 0),
              permanent_day: seriesForm.permanentDay !== "" ? Number(seriesForm.permanentDay) : null,
              permanent_time: seriesForm.time || null,
              duration_min: Number(seriesForm.duration) || 30,
              teacher_id: seriesForm.teacherId || null,
              room: seriesForm.room || null,
            }).eq("id", openStudent);
          } else {
            await supabase.from("student_instruments").insert({
              student_id: openStudent, course: seriesForm.course || null, level: seriesForm.level || null,
              price: seriesForm.billingType === "month" ? 0 : Number(seriesForm.price || 0),
              billing_type: seriesForm.billingType === "month" ? "per_month" : "per_lesson",
              monthly_rate: seriesForm.billingType === "month" ? Number(seriesForm.monthlyRate || 0) : null,
              teacher_id: seriesForm.teacherId || null,
              permanent_day: seriesForm.permanentDay !== "" ? Number(seriesForm.permanentDay) : null,
              permanent_time: seriesForm.time || null, duration_min: Number(seriesForm.duration) || 30,
              room: seriesForm.room || null,
            });
          }
          await generateSeries({
            studentId: openStudent, teacherId: seriesForm.teacherId,
            price: seriesForm.billingType === "month" ? 0 : seriesForm.price,
            duration: seriesForm.duration, permanentDay: seriesForm.permanentDay, time: seriesForm.time,
            forHowLong: seriesForm.forHowLong, unit: seriesForm.unit,
            instrument: seriesForm.course, room: seriesForm.room,
          });
          setAddSeriesOpen(false);
          setSeriesForm(emptySeriesForm);
          refresh();
        };
        const saveInstrumentEdit = async (e) => {
          e.preventDefault();
          const oldRecord = editingInstrument === "primary" ? s : data.studentInstruments.find((si) => si.id === editingInstrument);
          const oldCourse = oldRecord?.course;
          if (editingInstrument === "primary") {
            await supabase.from("students").update({
              course: seriesForm.course || null, level: seriesForm.level || null,
              billing_type: seriesForm.billingType === "month" ? "per_month" : "per_lesson",
              monthly_rate: seriesForm.billingType === "month" ? Number(seriesForm.monthlyRate || 0) : null,
              price: seriesForm.billingType === "month" ? 0 : Number(seriesForm.price || 0),
              permanent_day: seriesForm.permanentDay !== "" ? Number(seriesForm.permanentDay) : null,
              permanent_time: seriesForm.time || null,
              duration_min: Number(seriesForm.duration) || 30,
              teacher_id: seriesForm.teacherId || null,
              room: seriesForm.room || null,
            }).eq("id", openStudent);
          } else {
            await supabase.from("student_instruments").update({
              course: seriesForm.course || null, level: seriesForm.level || null,
              price: seriesForm.billingType === "month" ? 0 : Number(seriesForm.price || 0),
              billing_type: seriesForm.billingType === "month" ? "per_month" : "per_lesson",
              monthly_rate: seriesForm.billingType === "month" ? Number(seriesForm.monthlyRate || 0) : null,
              teacher_id: seriesForm.teacherId || null,
              permanent_day: seriesForm.permanentDay !== "" ? Number(seriesForm.permanentDay) : null,
              permanent_time: seriesForm.time || null, duration_min: Number(seriesForm.duration) || 30,
              room: seriesForm.room || null,
            }).eq("id", editingInstrument);
          }
          const teacherChanged = oldRecord && oldRecord.teacher_id !== (seriesForm.teacherId || null);
          const roomChanged = oldRecord && (oldRecord.room || null) !== (seriesForm.room || null);
          const durationChanged = oldRecord && (oldRecord.duration_min || 30) !== (Number(seriesForm.duration) || 30);
          if (oldCourse && (teacherChanged || roomChanged || durationChanged)) {
            const changes = [teacherChanged && "teacher", roomChanged && "room", durationChanged && "duration"].filter(Boolean).join(", ");
            if (confirm(`Also update ${changes} on ${oldCourse}'s upcoming lessons already on the calendar? (Day/time changes never apply retroactively — edit those individually if needed.)`)) {
              await supabase.from("lessons").update({
                teacher_id: seriesForm.teacherId || null,
                room: seriesForm.room || null,
                duration_min: Number(seriesForm.duration) || 30,
              }).eq("student_id", openStudent).eq("instrument", oldCourse).eq("status", "scheduled").gte("date", todayIso());
            }
          }
          setEditingInstrument(null);
          setSeriesForm(emptySeriesForm);
          refresh();
        };
        const levelsFor = (courseName) => {
          const c = data.courses.find((c) => c.name === courseName);
          return c ? data.courseLevels.filter((l) => l.course_id === c.id) : [];
        };
        const editingPrimary = editingInstrument === "primary";
        const billingEditable = true;
        const excludeClashKey = editingPrimary ? `student:${openStudent}` : (editingInstrument ? `instrument:${editingInstrument}` : null);
        const instrumentClashes = findWeeklyInstrumentClashes({
          students: data.students, studentInstruments: data.studentInstruments,
          day: seriesForm.permanentDay, time: seriesForm.time, duration: seriesForm.duration,
          studentId: openStudent, teacherId: seriesForm.teacherId || null, excludeKey: excludeClashKey,
        });
        return (
          <Modal title={s.name} onClose={() => { setOpenStudent(null); setSelectedLessons([]); setAddSeriesOpen(false); setEditingInstrument(null); }}>
            <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 4 }}>
              {s.age ? `${s.age} years old · ` : ""}{s.gender ? `${s.gender} · ` : ""}{s.grade ? `${s.grade} · ` : ""}{s.centre || "—"}
              {" · "}
              {s.age_group ? (
                s.age_group === "adult" ? "Adult" : "Child"
              ) : (
                <span style={{ color: COLORS.dangerDark }}>
                  Category not set —
                  <a href="#" onClick={async (e) => {
                    e.preventDefault();
                    await supabase.from("students").update({ age_group: "child" }).eq("id", s.id);
                    if (seriesForm.level) {
                      const lvl = levelsFor(seriesForm.course).find((l) => l.name === seriesForm.level);
                      if (lvl?.default_price_child != null && billingEditable) setSeriesForm((f) => ({ ...f, billingType: "month", monthlyRate: lvl.default_price_child }));
                    }
                    refresh();
                  }} style={{ marginLeft: 4, color: COLORS.dangerDark, textDecoration: "underline" }}>set Child</a>
                  {" / "}
                  <a href="#" onClick={async (e) => {
                    e.preventDefault();
                    await supabase.from("students").update({ age_group: "adult" }).eq("id", s.id);
                    if (seriesForm.level) {
                      const lvl = levelsFor(seriesForm.course).find((l) => l.name === seriesForm.level);
                      if (lvl?.default_price_adult != null && billingEditable) setSeriesForm((f) => ({ ...f, billingType: "month", monthlyRate: lvl.default_price_adult }));
                    }
                    refresh();
                  }} style={{ color: COLORS.dangerDark, textDecoration: "underline" }}>Adult</a>
                </span>
              )}
              {s.notes && <div style={{ marginTop: 6 }}>{s.notes}</div>}
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              <Btn small onClick={() => setEditingStudent(s)}>Edit student</Btn>
            </div>

            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Instruments</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
              {s.course ? (
                <div style={{ border: "1px solid " + COLORS.border, borderRadius: 8, padding: "9px 12px", fontSize: 13 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div>
                      <strong>{s.course}</strong>{s.level ? ` · ${s.level}` : ""}
                      <div style={{ color: COLORS.inkSoft, fontSize: 12 }}>
                        {s.billing_type === "per_month" ? `${fmtMoney(s.monthly_rate || 0)}/month` : `${fmtMoney(s.price)}/lesson`}
                        {s.permanent_day != null && s.permanent_time ? ` · ${DAY_OPTIONS.find((d) => d.value === Number(s.permanent_day))?.label || ""} ${s.permanent_time.slice(0, 5)}${s.duration_min ? `–${addMinutes(s.permanent_time, s.duration_min)}` : ""}` : ""}
                        {s.teacher_id ? ` · ${data.teachers.find((t) => t.id === s.teacher_id)?.name || "Unassigned"}` : ""}
                        {s.room ? ` · ${s.room}` : ""}
                      </div>
                    </div>
                    <a href="#" onClick={(e) => {
                      e.preventDefault();
                      setAddSeriesOpen(false);
                      setEditingInstrument("primary");
                      setSeriesForm({
                        ...emptySeriesForm, course: s.course || "", level: s.level || "",
                        billingType: s.billing_type === "per_month" ? "month" : "lesson",
                        monthlyRate: s.monthly_rate ?? "", price: s.price ?? 80,
                        teacherId: s.teacher_id || "", permanentDay: s.permanent_day != null ? String(s.permanent_day) : "",
                        time: s.permanent_time ? s.permanent_time.slice(0, 5) : "", duration: s.duration_min || 30, room: s.room || "",
                      });
                    }} style={{ color: COLORS.owner, fontSize: 12, flexShrink: 0 }}>Edit</a>
                  </div>
                  {s.billing_type === "per_month" && !s.monthly_rate && (
                    <div style={{ fontSize: 12, color: COLORS.dangerDark, marginTop: 4 }}>No monthly rate set — fill it in via Edit above.</div>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: COLORS.inkSoft }}>No instruments yet — add one below.</div>
              )}
              {otherInstruments.map((si) => (
                <div key={si.id} style={{ border: "1px solid " + COLORS.border, borderRadius: 8, padding: "9px 12px", fontSize: 13 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div>
                      <strong>{si.course}</strong>{si.level ? ` · ${si.level}` : ""}
                      <div style={{ color: COLORS.inkSoft, fontSize: 12 }}>
                        {si.billing_type === "per_month" ? `${fmtMoney(si.monthly_rate || 0)}/month` : `${fmtMoney(si.price)}/lesson`}
                        {si.permanent_day != null && si.permanent_time ? ` · ${DAY_OPTIONS.find((d) => d.value === Number(si.permanent_day))?.label || ""} ${si.permanent_time.slice(0, 5)}${si.duration_min ? `–${addMinutes(si.permanent_time, si.duration_min)}` : ""}` : ""}
                        {si.teacher_id ? ` · ${data.teachers.find((t) => t.id === si.teacher_id)?.name || "Unassigned"}` : ""}
                        {si.room ? ` · ${si.room}` : ""}
                      </div>
                    </div>
                    <a href="#" onClick={(e) => {
                      e.preventDefault();
                      setAddSeriesOpen(false);
                      setEditingInstrument(si.id);
                      setSeriesForm({ ...emptySeriesForm, course: si.course || "", level: si.level || "", billingType: si.billing_type === "per_month" ? "month" : "lesson", monthlyRate: si.monthly_rate ?? "", price: si.price, teacherId: si.teacher_id || "", permanentDay: si.permanent_day != null ? String(si.permanent_day) : "", time: si.permanent_time ? si.permanent_time.slice(0, 5) : "", duration: si.duration_min || 30, room: si.room || "" });
                    }} style={{ color: COLORS.owner, fontSize: 12, flexShrink: 0 }}>Edit</a>
                  </div>
                </div>
              ))}
            </div>
            <Btn small onClick={() => { setEditingInstrument(null); setSeriesForm(emptySeriesForm); setAddSeriesOpen((v) => !v); }} style={{ marginBottom: 14 }}>
              {addSeriesOpen ? "Cancel" : `+ Add ${s.course ? "another " : ""}instrument`}
            </Btn>

            {(addSeriesOpen || editingInstrument) && (
              <form onSubmit={editingInstrument ? saveInstrumentEdit : addInstrument} style={{ border: "1px solid " + COLORS.border, borderRadius: 8, padding: 12, marginBottom: 16 }}>
                <Field label="Instrument / course">
                  <select required value={seriesForm.course} onChange={(e) => setSeriesForm({ ...seriesForm, course: e.target.value, level: "" })} style={inputStyle}>
                    <option value="">—</option>
                    {data.courses.map((c) => (<option key={c.id} value={c.name}>{c.name}</option>))}
                  </select>
                </Field>
                {(() => {
                  const levels = levelsFor(seriesForm.course);
                  if (levels.length === 0) return null;
                  const priceForLevel = (lvl) => (s.age_group === "adult" ? lvl.default_price_adult : s.age_group === "child" ? lvl.default_price_child : null);
                  const levelLabel = (l) => {
                    const parts = [];
                    if (l.default_price_child != null) parts.push(`Child ${fmtMoney(l.default_price_child)}/mo`);
                    if (l.default_price_adult != null) parts.push(`Adult ${fmtMoney(l.default_price_adult)}/mo`);
                    return parts.length ? `${l.name} (${parts.join(" · ")})` : l.name;
                  };
                  return (
                    <Field label="Level">
                      <select value={seriesForm.level} onChange={(e) => {
                        const lvl = levels.find((l) => l.name === e.target.value);
                        const price = lvl ? priceForLevel(lvl) : null;
                        if (billingEditable && price != null) {
                          setSeriesForm({ ...seriesForm, level: e.target.value, billingType: "month", monthlyRate: price });
                        } else {
                          setSeriesForm({ ...seriesForm, level: e.target.value });
                        }
                      }} style={inputStyle}>
                        <option value="">—</option>
                        {levels.map((l) => (<option key={l.id} value={l.name}>{levelLabel(l)}</option>))}
                      </select>
                      {!s.age_group && levels.some((l) => l.default_price_child != null || l.default_price_adult != null) && (
                        <div style={{ fontSize: 11.5, color: COLORS.dangerDark, marginTop: 4 }}>Set this student's Category (Edit student) to auto-fill the right rate for a level.</div>
                      )}
                    </Field>
                  );
                })()}
                {billingEditable && (
                  <Field label="Billing">
                    <select value={seriesForm.billingType} onChange={(e) => setSeriesForm({ ...seriesForm, billingType: e.target.value })} style={inputStyle}>
                      <option value="lesson">Per lesson</option>
                      <option value="month">Per month (flat fee)</option>
                    </select>
                  </Field>
                )}
                {billingEditable && seriesForm.billingType === "month" ? (() => {
                  const lvl = levelsFor(seriesForm.course).find((l) => l.name === seriesForm.level);
                  const suggested = lvl ? (s.age_group === "adult" ? lvl.default_price_adult : s.age_group === "child" ? lvl.default_price_child : null) : null;
                  const mismatch = suggested != null && Number(seriesForm.monthlyRate || 0) !== Number(suggested);
                  return (
                    <Field label="Monthly rate (RM/month)">
                      <div style={{ display: "flex", gap: 8 }}>
                        <input type="number" value={seriesForm.monthlyRate} onChange={(e) => setSeriesForm({ ...seriesForm, monthlyRate: e.target.value })} style={{ ...inputStyle, flex: 1 }} placeholder="Can fill in later" />
                        {mismatch && (
                          <Btn small type="button" variant="owner" onClick={() => setSeriesForm((f) => ({ ...f, monthlyRate: suggested }))}>Use {fmtMoney(suggested)}</Btn>
                        )}
                      </div>
                      {mismatch && <div style={{ fontSize: 11.5, color: COLORS.inkSoft, marginTop: 4 }}>Doesn't match {s.age_group === "adult" ? "Adult" : "Child"} rate for this level yet — tap to apply it.</div>}
                    </Field>
                  );
                })() : (
                  <Field label="Rate (RM/lesson)"><input type="number" value={seriesForm.price} onChange={(e) => setSeriesForm({ ...seriesForm, price: e.target.value })} style={inputStyle} /></Field>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Field label="Day">
                    <select value={seriesForm.permanentDay} onChange={(e) => setSeriesForm({ ...seriesForm, permanentDay: e.target.value })} style={inputStyle}>
                      <option value="">—</option>
                      {DAY_OPTIONS.map((d) => (<option key={d.value} value={d.value}>{d.label}</option>))}
                    </select>
                  </Field>
                  <Field label="Time"><input type="time" value={seriesForm.time} onChange={(e) => setSeriesForm({ ...seriesForm, time: e.target.value })} style={inputStyle} /></Field>
                </div>
                {(!seriesForm.permanentDay || !seriesForm.time) && (
                  <div style={{ fontSize: 11.5, color: COLORS.inkSoft, marginTop: -6, marginBottom: 10 }}>
                    Day and Time are optional — leave them blank to save the instrument (billing, teacher, etc.) without putting anything on the calendar yet. Come back and edit this instrument once the schedule's decided.
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Field label="Duration (min)"><input type="number" value={seriesForm.duration} onChange={(e) => setSeriesForm({ ...seriesForm, duration: e.target.value })} style={inputStyle} /></Field>
                  <Field label="Teacher">
                    <select value={seriesForm.teacherId} onChange={(e) => setSeriesForm({ ...seriesForm, teacherId: e.target.value })} style={inputStyle}>
                      <option value="">Unassigned</option>
                      {data.teachers.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
                    </select>
                  </Field>
                </div>
                {seriesForm.time && seriesForm.duration && (
                  <div style={{ fontSize: 12, color: COLORS.inkSoft, marginTop: -6, marginBottom: 10 }}>
                    Ends at {addMinutes(seriesForm.time, Number(seriesForm.duration) || 0)}
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Field label="Room"><input value={seriesForm.room} onChange={(e) => setSeriesForm({ ...seriesForm, room: e.target.value })} style={inputStyle} /></Field>
                  {!editingInstrument && (
                    <Field label="For how long">
                      <div style={{ display: "flex", gap: 6 }}>
                        <input type="number" value={seriesForm.forHowLong} onChange={(e) => setSeriesForm({ ...seriesForm, forHowLong: e.target.value })} style={inputStyle} />
                        <select value={seriesForm.unit} onChange={(e) => setSeriesForm({ ...seriesForm, unit: e.target.value })} style={inputStyle}>
                          <option value="months">Months</option><option value="weeks">Weeks</option>
                        </select>
                      </div>
                    </Field>
                  )}
                </div>
                {editingInstrument && <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 10 }}>If you change teacher, room, or duration, you'll be asked whether to also apply it to this instrument's upcoming lessons. Day/time changes only apply going forward — edit already-generated lessons individually for those.</div>}
                {instrumentClashes.length > 0 && (
                  <div style={{ fontSize: 13, color: COLORS.danger, marginBottom: 12, padding: "8px 10px", background: COLORS.dangerBg, borderRadius: 8 }}>
                    Clashes with {instrumentClashes.length} other weekly schedule{instrumentClashes.length > 1 ? "s" : ""} at this time:
                    <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                      {instrumentClashes.map((c) => (
                        <li key={c.key}>
                          {c.studentName} — {c.course}
                          {c.sameTeacher && c.sameStudent ? " (same teacher & student)" : c.sameTeacher ? " (same teacher)" : " (same student)"}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn type="submit" small variant="owner">{editingInstrument ? "Save changes" : "Save instrument & generate lessons"}</Btn>
                  {editingInstrument && <Btn small onClick={() => { setEditingInstrument(null); setSeriesForm(emptySeriesForm); }}>Cancel</Btn>}
                </div>
              </form>
            )}

            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Teaching plan</div>
            <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 8 }}>What to cover on each date, planned ahead — independent of whether that lesson is on the calendar yet.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
              {plans.map((p) => (
                <div key={p.id} style={{ padding: "8px 10px", background: COLORS.card, border: "1px solid " + COLORS.border, borderRadius: 8, fontSize: 13 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <strong>{fmtDate(p.date)}</strong>
                    <a href="#" onClick={(e) => { e.preventDefault(); removePlan(p.id); }} style={{ color: COLORS.danger, fontSize: 12 }}>Remove</a>
                  </div>
                  <div>{p.what_to_teach}</div>
                  {p.remarks && <div style={{ color: COLORS.inkSoft, fontSize: 12 }}>{p.remarks}</div>}
                </div>
              ))}
              {plans.length === 0 && <div style={{ fontSize: 13, color: COLORS.inkSoft }}>Nothing planned yet — add the first item below.</div>}
            </div>
            <form onSubmit={addPlan} style={{ border: "1px solid " + COLORS.border, borderRadius: 8, padding: 10, marginBottom: 20 }}>
              <Field label="Date"><input type="date" required value={planForm.date} onChange={(e) => setPlanForm({ ...planForm, date: e.target.value })} style={inputStyle} /></Field>
              <Field label="What to teach"><textarea required value={planForm.what} onChange={(e) => setPlanForm({ ...planForm, what: e.target.value })} style={{ ...inputStyle, minHeight: 60 }} placeholder="e.g. C major scale, hands together, review last week's piece" /></Field>
              <Field label="Remarks"><textarea value={planForm.remarks} onChange={(e) => setPlanForm({ ...planForm, remarks: e.target.value })} style={{ ...inputStyle, minHeight: 40 }} placeholder="Optional" /></Field>
              <Btn type="submit" small variant="owner">Add</Btn>
            </form>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700 }}>
                <input type="checkbox" checked={allSelected} onChange={toggleAll} /> Lesson history ({lessons.length})
              </label>
              {selectedLessons.length > 0 && (
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn small onClick={bulkCancel}>Cancel {selectedLessons.length}</Btn>
                  <Btn small variant="danger" onClick={bulkRemove}>Remove {selectedLessons.length}</Btn>
                </div>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto" }}>
              {lessons.map((l) => (
                <div key={l.id} style={{ padding: "8px 0", borderTop: "1px solid " + COLORS.border, display: "flex", gap: 8 }}>
                  <input type="checkbox" checked={selectedLessons.includes(l.id)} onChange={() => toggle(l.id)} style={{ marginTop: 3 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                      <span>{fmtDate(l.date)} · {l.time.slice(0, 5)}–{addMinutes(l.time, l.duration_min || 30)}{l.instrument ? ` · ${l.instrument}` : ""}{l.room ? ` · ${l.room}` : ""}</span>
                      <Badge tone={statusTone(l.status)}>{statusLabel(l.status)}</Badge>
                    </div>
                    <div style={{ display: "flex", gap: 10, marginTop: 4, fontSize: 12 }}>
                      <a href="#" onClick={(e) => { e.preventDefault(); setEditLesson(l); setEditLessonForm({ date: l.date, time: l.time.slice(0, 5), duration: l.duration_min || 30, price: l.price, instrument: l.instrument || "", room: l.room || "" }); }} style={{ color: COLORS.owner }}>Edit</a>
                      {l.status !== "cancelled" && <a href="#" onClick={(e) => { e.preventDefault(); cancelLesson(l.id); }} style={{ color: COLORS.amberDark }}>Cancel</a>}
                      {l.status === "cancelled" && <a href="#" onClick={(e) => { e.preventDefault(); uncancelLesson(l.id); }} style={{ color: COLORS.inkSoft }}>Undo</a>}
                      <a href="#" onClick={(e) => { e.preventDefault(); if (confirm("Remove this lesson? This can't be undone.")) removeLesson(l.id); }} style={{ color: COLORS.danger }}>Remove</a>
                    </div>
                  </div>
                </div>
              ))}
              {lessons.length === 0 && <div style={{ fontSize: 13, color: COLORS.inkSoft }}>No lessons on file.</div>}
            </div>
          </Modal>
        );
      })()}

      {editingStudent && (() => {
        const s = editingStudent;
        const save = async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          const firstName = (fd.get("first_name") || "").trim();
          const lastName = (fd.get("last_name") || "").trim();
          await supabase.from("students").update({
            name: `${firstName} ${lastName}`.trim(), first_name: firstName || null, last_name: lastName || null,
            age: fd.get("age") ? Number(fd.get("age")) : null,
            gender: fd.get("gender") || null, centre: fd.get("centre") || null, notes: fd.get("notes") || null,
            age_group: fd.get("age_group") || null, joining_year: fd.get("joining_year") ? Number(fd.get("joining_year")) : null,
          }).eq("id", s.id);
          setEditingStudent(null); refresh();
        };
        const removeStudent = async () => {
          if (!confirm(`Remove ${s.name} and all their lessons? This can't be undone.`)) return;
          await supabase.from("students").delete().eq("id", s.id);
          setEditingStudent(null); setOpenStudent(null); refresh();
        };
        const setStatus = async (status) => {
          await supabase.from("students").update({ status }).eq("id", s.id);
          setEditingStudent({ ...s, status }); refresh();
        };
        return (
          <Modal title={`Edit ${s.name}`} onClose={() => setEditingStudent(null)}>
            <form onSubmit={save}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Student data</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                <Btn small type="button" variant={s.status === "active" || !s.status ? "teacher" : "default"} onClick={() => setStatus("active")}>Active</Btn>
                <Btn small type="button" variant={s.status === "paused" ? "teacher" : "default"} onClick={() => setStatus("paused")}>Temporary stop</Btn>
                <Btn small type="button" variant={s.status === "terminated" ? "teacher" : "default"} onClick={() => setStatus("terminated")}>Terminated</Btn>
                <Btn small type="button" variant={s.status === "graduated" ? "teacher" : "default"} onClick={() => setStatus("graduated")}>Graduated</Btn>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="Last name"><input name="last_name" required defaultValue={s.last_name || ""} style={inputStyle} /></Field>
                <Field label="First name"><input name="first_name" required defaultValue={s.first_name || ""} style={inputStyle} /></Field>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="Age"><input name="age" type="number" defaultValue={s.age || ""} style={inputStyle} /></Field>
                <Field label="Gender">
                  <select name="gender" defaultValue={s.gender || ""} style={inputStyle}>
                    <option value="">—</option><option value="male">Male</option><option value="female">Female</option>
                  </select>
                </Field>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="Category (for pricing)">
                  <select name="age_group" defaultValue={s.age_group || ""} style={inputStyle}>
                    <option value="">—</option><option value="child">Child</option><option value="adult">Adult</option>
                  </select>
                </Field>
                <Field label="Joining year"><input name="joining_year" type="number" placeholder="e.g. 2026" defaultValue={s.joining_year || ""} style={inputStyle} /></Field>
              </div>
              <Field label="Centre"><input name="centre" defaultValue={s.centre || ""} style={inputStyle} /></Field>
              <Field label="Notes"><input name="notes" defaultValue={s.notes || ""} style={inputStyle} /></Field>
              <div style={{ fontSize: 11.5, color: COLORS.inkSoft, marginTop: 4, marginBottom: 4 }}>Instrument, level, billing, and schedule are edited from the Instruments section on the student's profile, not here.</div>

              <Btn type="submit" variant="owner" style={{ width: "100%", marginTop: 16 }}>Save changes</Btn>
            </form>
            <Btn variant="danger" style={{ width: "100%", marginTop: 10 }} onClick={removeStudent}>Remove student</Btn>
          </Modal>
        );
      })()}

      {editLesson && (() => {
        const l = editLesson;
        const [ef, setEf] = [editLessonForm, setEditLessonForm];
        const save = async (e) => {
          e.preventDefault();
          await supabase.from("lessons").update({
            date: ef.date, time: ef.time, duration_min: Number(ef.duration), price: Number(ef.price),
            instrument: ef.instrument || null, room: ef.room || null,
          }).eq("id", l.id);
          setEditLesson(null); refresh();
        };
        const clashes = findClashes(data.lessons, { date: ef.date, time: ef.time, duration: ef.duration, teacherId: l.teacher_id, studentId: l.student_id, excludeId: l.id });
        return (
          <Modal title="Edit lesson" onClose={() => setEditLesson(null)}>
            <form onSubmit={save}>
              <Field label="Date"><input type="date" required value={ef.date} onChange={(e) => setEf({ ...ef, date: e.target.value })} style={inputStyle} /></Field>
              <Field label="Time"><input type="time" required value={ef.time} onChange={(e) => setEf({ ...ef, time: e.target.value })} style={inputStyle} /></Field>
              <Field label="Duration (min)"><input type="number" required value={ef.duration} onChange={(e) => setEf({ ...ef, duration: e.target.value })} style={inputStyle} /></Field>
              <Field label="Rate (RM)"><input type="number" required value={ef.price} onChange={(e) => setEf({ ...ef, price: e.target.value })} style={inputStyle} /></Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="Instrument">
                  <select value={ef.instrument} onChange={(e) => setEf({ ...ef, instrument: e.target.value })} style={inputStyle}>
                    <option value="">—</option>
                    {data.courses.map((c) => (<option key={c.id} value={c.name}>{c.name}</option>))}
                  </select>
                </Field>
                <Field label="Room"><input value={ef.room} onChange={(e) => setEf({ ...ef, room: e.target.value })} style={inputStyle} /></Field>
              </div>
              {clashes.length > 0 && (
                <div style={{ fontSize: 13, color: COLORS.danger, marginBottom: 12, padding: "8px 10px", background: COLORS.dangerBg, borderRadius: 8 }}>
                  Clashes with {clashes.length} other lesson{clashes.length > 1 ? "s" : ""} at this time.
                </div>
              )}
              <Btn type="submit" variant="owner" style={{ width: "100%", marginTop: 4 }}>Save changes</Btn>
            </form>
          </Modal>
        );
      })()}
    </div>
  );
}

function PaymentsTab({ data, refresh }) {
  const [voucherTeacher, setVoucherTeacher] = useState(null);
  const markPaid = async (lessonId, paid) => { await supabase.from("lessons").update({ paid }).eq("id", lessonId); refresh(); };
  const markAllPending = async (teacherId) => {
    const ids = data.lessons.filter((l) => l.teacher_id === teacherId && l.status === "attended" && !l.paid).map((l) => l.id);
    if (ids.length) { await supabase.from("lessons").update({ paid: true }).in("id", ids); refresh(); }
  };
  const studentOf = (id) => data.students.find((s) => s.id === id);
  const earn = (l, t) => resolveEarnings(l, studentOf(l.student_id), t, data.teacherRates, data.lessons, data.studentInstruments);
  const missingRateStudents = data.students.filter((s) => s.billing_type === "per_month" && !s.monthly_rate && data.lessons.some((l) => l.student_id === s.id && l.status === "attended"));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {missingRateStudents.length > 0 && (
        <Card style={{ background: COLORS.dangerBg, border: "none" }}>
          <div style={{ fontSize: 13, color: COLORS.dangerDark, fontWeight: 600 }}>
            {missingRateStudents.map((s) => s.name).join(", ")} {missingRateStudents.length === 1 ? "has" : "have"} attended lessons but no monthly rate set — payouts for {missingRateStudents.length === 1 ? "them" : "these"} will show RM 0 until you fill it in (Students tab → Edit).
          </div>
        </Card>
      )}
      {data.teachers.map((t) => {
        const attended = data.lessons.filter((l) => l.teacher_id === t.id && l.status === "attended");
        const pending = attended.filter((l) => !l.paid);
        const paid = attended.filter((l) => l.paid);
        const pendingAmt = pending.reduce((sum, l) => sum + earn(l, t), 0);
        const paidAmt = paid.reduce((sum, l) => sum + earn(l, t), 0);
        const rates = data.teacherRates.filter((r) => r.teacher_id === t.id);
        return (
          <Card key={t.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{t.name}</div>
                <div style={{ fontSize: 12, color: COLORS.inkSoft }}>Default: {t.pay_type === "flat" ? `${fmtMoney(t.rate)} / lesson` : `${t.rate}% of lesson price`}</div>
                {rates.length > 0 && (
                  <div style={{ fontSize: 12, color: COLORS.inkSoft, marginTop: 2 }}>
                    {rates.map((r) => (<span key={r.id} style={{ marginRight: 8 }}>{r.instrument || r.course}{r.level ? ` (${r.level})` : ""}: {r.pay_type === "flat" ? fmtMoney(r.rate) : `${r.rate}%`}</span>))}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 18 }}>
                <div><div style={{ fontSize: 12, color: COLORS.inkSoft }}>Pending</div><div style={{ fontWeight: 700, color: COLORS.amber }}>{fmtMoney(pendingAmt)}</div></div>
                <div><div style={{ fontSize: 12, color: COLORS.inkSoft }}>Paid</div><div style={{ fontWeight: 700, color: COLORS.success }}>{fmtMoney(paidAmt)}</div></div>
              </div>
            </div>
            {pending.length > 0 && (
              <div>
                {pending.map((l) => (
                  <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderTop: "1px solid " + COLORS.border, fontSize: 13 }}>
                    <span>{fmtDate(l.date)} · {studentOf(l.student_id)?.name}{studentOf(l.student_id)?.course ? ` (${studentOf(l.student_id).course})` : ""}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ color: COLORS.inkSoft, fontSize: 12 }}>{fmtMoney(effectiveLessonPrice(l, studentOf(l.student_id), data.lessons, data.studentInstruments))} lesson</span>
                      <strong>{fmtMoney(earn(l, t))}</strong>
                      <Btn small onClick={() => markPaid(l.id, true)}>Mark paid</Btn>
                    </span>
                  </div>
                ))}
                <Btn small variant="owner" style={{ marginTop: 8 }} onClick={() => markAllPending(t.id)}>Mark all as paid</Btn>
              </div>
            )}
            {pending.length === 0 && attended.length > 0 && <div style={{ fontSize: 13, color: COLORS.inkSoft }}>All caught up — nothing pending.</div>}
            {attended.length === 0 && <div style={{ fontSize: 13, color: COLORS.inkSoft }}>No attended lessons yet.</div>}
            {paid.length > 0 && (
              <details style={{ marginTop: 10 }}>
                <summary style={{ fontSize: 12, color: COLORS.owner, cursor: "pointer" }}>Paid lessons ({paid.length})</summary>
                <div style={{ marginTop: 6 }}>
                  {paid.map((l) => (
                    <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderTop: "1px solid " + COLORS.border, fontSize: 13 }}>
                      <span>{fmtDate(l.date)} · {studentOf(l.student_id)?.name}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ color: COLORS.inkSoft, fontSize: 12 }}>{fmtMoney(effectiveLessonPrice(l, studentOf(l.student_id), data.lessons, data.studentInstruments))} lesson</span>
                        <strong>{fmtMoney(earn(l, t))}</strong>
                        <Btn small onClick={() => markPaid(l.id, false)}>Undo</Btn>
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            )}
            {paid.length > 0 && <Btn small style={{ marginTop: 10 }} onClick={() => setVoucherTeacher(t.id)}>Payment voucher</Btn>}
          </Card>
        );
      })}

      {voucherTeacher && (() => {
        const t = data.teachers.find((x) => x.id === voucherTeacher);
        const paidLessons = data.lessons.filter((l) => l.teacher_id === voucherTeacher && l.status === "attended" && l.paid);
        const total = paidLessons.reduce((sum, l) => sum + earn(l, t), 0);
        const rows = paidLessons.map((l) => ({ label: `${fmtDate(l.date)} · ${studentOf(l.student_id)?.name}`, value: fmtMoney(earn(l, t)) }));
        const meta = [{ label: "Paid to", value: t.name }, { label: "Date", value: fmtDate(todayIso()) }];
        return (
          <Modal title="Payment Voucher" onClose={() => setVoucherTeacher(null)}>
            <div style={{ border: "1px solid " + COLORS.border, borderRadius: 10, padding: 18, background: "#FCFBF8" }}>
            <DocHeader settings={data.settings} docType="PAYMENT VOUCHER" meta={meta} />
            <DocTable rows={rows} totalLabel="Total paid" totalValue={fmtMoney(total)} emptyText="No paid lessons yet." />
            <DocFooter settings={data.settings} />
            </div>
            <Btn variant="owner" style={{ width: "100%", marginTop: 16 }} onClick={() => generateDocPdf({ settings: data.settings, docType: "PAYMENT VOUCHER", meta, rows, totalLabel: "Total paid", totalValue: fmtMoney(total), filename: `Payment-Voucher-${t.name}-${todayIso()}` })}>Download PDF</Btn>
          </Modal>
        );
      })()}
    </div>
  );
}

function ReplacementsTab({ data, refresh }) {
  const [teacherFilter, setTeacherFilter] = useState("");
  const owed = data.lessons.filter((l) => l.status === "missed-teacher" && (!teacherFilter || l.teacher_id === teacherFilter));
  const noReplacementOwed = data.lessons.filter((l) => l.status === "missed-student" && (!teacherFilter || l.teacher_id === teacherFilter));
  const teacherName = (id) => data.teachers.find((t) => t.id === id)?.name || "Unassigned";
  const studentName = (id) => data.students.find((s) => s.id === id)?.name || "—";

  const groupByTeacher = (rows) => {
    const groups = {};
    rows.forEach((l) => { const key = l.teacher_id || "none"; groups[key] = groups[key] || []; groups[key].push(l); });
    return Object.entries(groups).sort((a, b) => teacherName(a[0]).localeCompare(teacherName(b[0])));
  };

  return (
    <div>
      <Field label="Filter by teacher">
        <select value={teacherFilter} onChange={(e) => setTeacherFilter(e.target.value)} style={{ ...inputStyle, maxWidth: 240 }}>
          <option value="">All teachers</option>
          {data.teachers.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
        </select>
      </Field>

      <div style={{ fontWeight: 700, fontSize: 14, margin: "18px 0 8px" }}>Owed to students · not yet rescheduled</div>
      {owed.length === 0 && <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 20 }}>Nothing outstanding.</div>}
      {groupByTeacher(owed).map(([teacherId, rows]) => (
        <div key={teacherId} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.owner, marginBottom: 6 }}>{teacherName(teacherId === "none" ? null : teacherId)}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {rows.map((l) => (
              <div key={l.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: COLORS.card, border: "1px solid " + COLORS.border, borderRadius: 8, fontSize: 13 }}>
                <span><strong>{studentName(l.student_id)}</strong> · {fmtDate(l.date)} · {l.time.slice(0, 5)}</span>
                <span style={{ color: COLORS.inkSoft }}>{l.reason}</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div style={{ fontWeight: 700, fontSize: 14, margin: "18px 0 8px" }}>Missed by student · no replacement owed</div>
      {noReplacementOwed.length === 0 && <div style={{ fontSize: 13, color: COLORS.inkSoft }}>None on record.</div>}
      {groupByTeacher(noReplacementOwed).map(([teacherId, rows]) => (
        <div key={teacherId} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.owner, marginBottom: 6 }}>{teacherName(teacherId === "none" ? null : teacherId)}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {rows.map((l) => (
              <div key={l.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: COLORS.card, border: "1px solid " + COLORS.border, borderRadius: 8, fontSize: 13 }}>
                <span><strong>{studentName(l.student_id)}</strong> · {fmtDate(l.date)} · {l.time.slice(0, 5)}</span>
                <span style={{ color: COLORS.inkSoft }}>{l.reason}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      <div style={{ fontSize: 12, color: COLORS.inkSoft, marginTop: 8 }}>Reschedule these from the Calendar tab's "Needs rescheduling" list.</div>
    </div>
  );
}

function MaterialsTab({ data, refresh }) {
  const [form, setForm] = useState({ name: "", price: "", stock: "" });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", price: "", stock: "" });
  const [teacherFilter, setTeacherFilter] = useState("");
  const [orderSort, setOrderSort] = useState("date");

  const addItem = async (e) => {
    e.preventDefault();
    await supabase.from("book_items").insert({ name: form.name, price: Number(form.price) || 0, stock_on_hand: Number(form.stock) || 0 });
    setForm({ name: "", price: "", stock: "" }); refresh();
  };
  const saveItem = async (id) => {
    await supabase.from("book_items").update({ name: editForm.name, price: Number(editForm.price) || 0, stock_on_hand: Number(editForm.stock) || 0 }).eq("id", id);
    setEditingId(null); refresh();
  };
  const removeItem = async (id) => {
    const usedCount = data.bookOrderItems.filter((i) => i.book_item_id === id).length;
    if (usedCount > 0) {
      alert(`Can't remove this item — ${usedCount} past order${usedCount > 1 ? "s reference" : " references"} it, and deleting it would break their record. Leave it in the catalog (you can still ignore it going forward).`);
      return;
    }
    if (!confirm("Remove this item from the catalog?")) return;
    await supabase.from("book_items").delete().eq("id", id); refresh();
  };

  const catalogFileRef = useRef(null);
  const [catalogImporting, setCatalogImporting] = useState(false);
  const [catalogImportResult, setCatalogImportResult] = useState(null);

  const downloadCatalogTemplate = () => {
    const rows = [["Name", "Price (RM)", "Starting stock"], ["Piano Method Book 1", "45", "10"]];
    const escape = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const csv = rows.map((row) => row.map(escape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "book-catalog-template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const importCatalogCsv = async (file) => {
    setCatalogImporting(true);
    setCatalogImportResult(null);
    const Papa = (await import("papaparse")).default;
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: async (results) => {
        let added = 0; let updated = 0; const errors = [];
        for (const row of results.data) {
          const name = (row["Name"] || "").trim();
          if (!name) continue;
          try {
            const price = Number(row["Price (RM)"] ?? row["Price"]) || 0;
            const stock = Number(row["Starting stock"] ?? row["Stock"]) || 0;
            const existing = data.bookItems.find((b) => b.name.trim().toLowerCase() === name.toLowerCase());
            if (existing) {
              const { error } = await supabase.from("book_items").update({ price, stock_on_hand: stock }).eq("id", existing.id);
              if (error) throw new Error(error.message);
              updated += 1;
            } else {
              const { error } = await supabase.from("book_items").insert({ name, price, stock_on_hand: stock });
              if (error) throw new Error(error.message);
              added += 1;
            }
          } catch (err) {
            errors.push(`${name}: ${err.message || "failed"}`);
          }
        }
        setCatalogImportResult({ added, updated, errors });
        setCatalogImporting(false);
        refresh();
      },
      error: (err) => { setCatalogImportResult({ added: 0, updated: 0, errors: [err.message || "Could not read that file"] }); setCatalogImporting(false); },
    });
  };

  const studentName = (id) => data.students.find((s) => s.id === id)?.name || "—";
  const teacherName = (id) => data.teachers.find((t) => t.id === id)?.name || "—";
  const submittedOrders = [...data.bookOrders]
    .filter((o) => o.status === "submitted")
    .filter((o) => !teacherFilter || o.teacher_id === teacherFilter)
    .sort((a, b) => {
      if (orderSort === "teacher") {
        const cmp = teacherName(a.teacher_id).localeCompare(teacherName(b.teacher_id));
        if (cmp !== 0) return cmp;
      }
      return (b.submitted_at || "").localeCompare(a.submitted_at || "");
    });
  const submittedOrderIds = new Set(submittedOrders.map((o) => o.id));
  const orderSummary = summarizeBookOrderItems(data.bookOrderItems.filter((i) => submittedOrderIds.has(i.order_id)), data.bookItems);
  const NEXT_STATUS = { requested: "ordered", ordered: "received", received: "given" };

  const [busyId, setBusyId] = useState(null);
  const advanceStatus = async (item) => {
    const next = NEXT_STATUS[item.status];
    if (!next || busyId === item.id) return;
    const order = data.bookOrders.find((o) => o.id === item.order_id);
    const isStudentOrder = order?.order_type === "student" && order.student_id;
    if (next === "given" && isStudentOrder && Number(item.price) * item.quantity <= 0) {
      alert("This item has no price yet, so marking it Given would hand it out without billing the student. Set a price first — use \"Add to catalog\" for a not-in-list item, or edit the price on an existing catalog item.");
      return;
    }
    setBusyId(item.id);
    try {
      const bi = item.book_item_id ? data.bookItems.find((b) => b.id === item.book_item_id) : null;
      if (next === "ordered" && bi) {
        await supabase.from("book_items").update({ stock_on_order: (bi.stock_on_order || 0) + item.quantity }).eq("id", bi.id);
      }
      if (next === "received" && bi) {
        await supabase.from("book_items").update({
          stock_on_order: Math.max(0, (bi.stock_on_order || 0) - item.quantity),
          stock_on_hand: (bi.stock_on_hand || 0) + item.quantity,
        }).eq("id", bi.id);
      }
      if (next === "given") {
        if (bi) await supabase.from("book_items").update({ stock_on_hand: Math.max(0, (bi.stock_on_hand || 0) - item.quantity) }).eq("id", bi.id);
        if (isStudentOrder) {
          const name = bi ? bi.name : item.custom_name;
          const amount = Number(item.price) * item.quantity;
          const { data: inv, error } = await supabase.from("invoices").insert({ student_id: order.student_id, date: todayIso(), total: amount }).select().single();
          if (error || !inv) { alert("Couldn't create the invoice: " + (error?.message || "unknown error")); return; }
          await supabase.from("invoice_items").insert({ invoice_id: inv.id, description: `${name} × ${item.quantity}`, amount, sort_order: 0 });
          await supabase.from("book_order_items").update({ status: next, invoice_id: inv.id }).eq("id", item.id);
          refresh();
          return;
        }
      }
      await supabase.from("book_order_items").update({ status: next }).eq("id", item.id);
      refresh();
    } finally {
      setBusyId(null);
    }
  };
  const setItemPrice = async (item) => {
    const priceStr = prompt(`Set the price for "${item.custom_name || "this item"}" (RM), for this order only:`, item.price || "0");
    if (priceStr === null) return;
    await supabase.from("book_order_items").update({ price: Number(priceStr) || 0 }).eq("id", item.id);
    refresh();
  };
  const rejectItem = async (item) => {
    if (item.status === "given" || item.status === "rejected" || busyId === item.id) return;
    const reason = prompt("Reason for rejecting this item (optional):", "");
    if (reason === null) return;
    setBusyId(item.id);
    try {
      const bi = item.book_item_id ? data.bookItems.find((b) => b.id === item.book_item_id) : null;
      if (bi) {
        if (item.status === "ordered") {
          await supabase.from("book_items").update({ stock_on_order: Math.max(0, (bi.stock_on_order || 0) - item.quantity) }).eq("id", bi.id);
        } else if (item.status === "received") {
          await supabase.from("book_items").update({ stock_on_hand: Math.max(0, (bi.stock_on_hand || 0) - item.quantity) }).eq("id", bi.id);
        }
      }
      await supabase.from("book_order_items").update({ status: "rejected", note: reason || null }).eq("id", item.id);
      refresh();
    } finally {
      setBusyId(null);
    }
  };
  const unrejectItem = async (item) => {
    if (busyId === item.id) return;
    setBusyId(item.id);
    try {
      await supabase.from("book_order_items").update({ status: "requested", note: null }).eq("id", item.id);
      refresh();
    } finally {
      setBusyId(null);
    }
  };

  const addToCatalog = async (item) => {
    const priceStr = prompt(`Set the price for "${item.custom_name}" (RM):`, "0");
    if (priceStr === null) return;
    const { data: created, error } = await supabase.from("book_items").insert({ name: item.custom_name, price: Number(priceStr) || 0 }).select().single();
    if (!error && created) {
      await supabase.from("book_order_items").update({ book_item_id: created.id, price: created.price }).eq("id", item.id);
      refresh();
    }
  };

  // Undoes whatever an item's current status already did — stock moved into
  // "on order"/"on hand", or an invoice created — so removing it (whether on
  // its own or as part of removing a whole order) doesn't leave stock counts
  // or a student's invoices out of sync.
  const reverseItemEffects = async (item) => {
    const bi = item.book_item_id ? data.bookItems.find((b) => b.id === item.book_item_id) : null;
    if (bi) {
      if (item.status === "ordered") {
        await supabase.from("book_items").update({ stock_on_order: Math.max(0, (bi.stock_on_order || 0) - item.quantity) }).eq("id", bi.id);
      } else if (item.status === "received") {
        await supabase.from("book_items").update({ stock_on_hand: Math.max(0, (bi.stock_on_hand || 0) - item.quantity) }).eq("id", bi.id);
      } else if (item.status === "given") {
        await supabase.from("book_items").update({ stock_on_hand: (bi.stock_on_hand || 0) + item.quantity }).eq("id", bi.id);
      }
    }
    if (item.invoice_id) {
      await supabase.from("invoice_items").delete().eq("invoice_id", item.invoice_id);
      await supabase.from("invoices").delete().eq("id", item.invoice_id);
    }
  };

  const removeOrderItem = async (item) => {
    const name = item.book_item_id ? data.bookItems.find((b) => b.id === item.book_item_id)?.name : item.custom_name;
    if (!confirm(`Remove "${name}" from this order?${item.invoice_id ? " This will also delete the invoice it created." : ""} Can't be undone.`)) return;
    await reverseItemEffects(item);
    await supabase.from("book_order_items").delete().eq("id", item.id);
    refresh();
  };

  const removeOrder = async (order) => {
    const items = data.bookOrderItems.filter((i) => i.order_id === order.id);
    const hasInvoices = items.some((i) => i.invoice_id);
    if (!confirm(`Remove this whole order (${items.length} item${items.length === 1 ? "" : "s"})?${hasInvoices ? " Any invoices it created will also be deleted." : ""} Can't be undone.`)) return;
    for (const item of items) await reverseItemEffects(item);
    await supabase.from("book_orders").delete().eq("id", order.id);
    refresh();
  };
  const approveCancel = async (order) => {
    if (!confirm("Approve this cancellation? The order will be marked cancelled — items already ordered/received/given stay as they are, so reject or otherwise wind down any that need it separately.")) return;
    await supabase.from("book_orders").update({ status: "cancelled", cancel_requested: false, note: order.cancel_reason || null }).eq("id", order.id);
    refresh();
  };
  const dismissCancelRequest = async (order) => {
    await supabase.from("book_orders").update({ cancel_requested: false, cancel_reason: null }).eq("id", order.id);
    refresh();
  };

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Book & materials catalog</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn small onClick={downloadCatalogTemplate}>Download CSV template</Btn>
            <input ref={catalogFileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) importCatalogCsv(f); e.target.value = ""; }} />
            <Btn small onClick={() => catalogFileRef.current?.click()} disabled={catalogImporting}>{catalogImporting ? "Importing…" : "Import CSV"}</Btn>
          </div>
        </div>
        {catalogImportResult && (
          <div style={{ marginBottom: 12, padding: "8px 10px", borderRadius: 8, background: catalogImportResult.errors.length ? COLORS.dangerBg : COLORS.successBg, fontSize: 12.5 }}>
            <div>{catalogImportResult.added} added, {catalogImportResult.updated} updated (matched by name).</div>
            {catalogImportResult.errors.length > 0 && (
              <div style={{ marginTop: 4 }}>
                {catalogImportResult.errors.length} row{catalogImportResult.errors.length > 1 ? "s" : ""} skipped:
                <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{catalogImportResult.errors.map((e, i) => (<li key={i}>{e}</li>))}</ul>
              </div>
            )}
            <a href="#" onClick={(e) => { e.preventDefault(); setCatalogImportResult(null); }} style={{ fontSize: 12, color: COLORS.inkSoft, display: "inline-block", marginTop: 4 }}>Dismiss</a>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
          {data.bookItems.map((b) => (
            <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", border: "1px solid " + COLORS.border, borderRadius: 8, fontSize: 13, gap: 8, flexWrap: "wrap" }}>
              {editingId === b.id ? (
                <>
                  <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} style={{ ...inputStyle, flex: 1, minWidth: 100 }} />
                  <input type="number" value={editForm.price} onChange={(e) => setEditForm({ ...editForm, price: e.target.value })} style={{ ...inputStyle, width: 90 }} placeholder="Price" />
                  <input type="number" value={editForm.stock} onChange={(e) => setEditForm({ ...editForm, stock: e.target.value })} style={{ ...inputStyle, width: 90 }} placeholder="Stock on hand" />
                  <a href="#" onClick={(e) => { e.preventDefault(); saveItem(b.id); }} style={{ color: COLORS.owner }}>Save</a>
                  <a href="#" onClick={(e) => { e.preventDefault(); setEditingId(null); }} style={{ color: COLORS.inkSoft }}>Cancel</a>
                </>
              ) : (
                <>
                  <span><strong>{b.name}</strong> · {fmtMoney(b.price)} · {b.stock_on_hand} on hand{b.stock_on_order ? ` · ${b.stock_on_order} on order` : ""}</span>
                  <span style={{ display: "flex", gap: 8 }}>
                    <a href="#" onClick={(e) => { e.preventDefault(); setEditingId(b.id); setEditForm({ name: b.name, price: b.price, stock: b.stock_on_hand }); }} style={{ color: COLORS.owner }}>Edit</a>
                    <a href="#" onClick={(e) => { e.preventDefault(); removeItem(b.id); }} style={{ color: COLORS.danger }}>Remove</a>
                  </span>
                </>
              )}
            </div>
          ))}
          {data.bookItems.length === 0 && <div style={{ fontSize: 13, color: COLORS.inkSoft }}>No items in the catalog yet.</div>}
        </div>
        <form onSubmit={addItem} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ ...inputStyle, flex: 1, minWidth: 120 }} placeholder="Item name" />
          <input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} style={{ ...inputStyle, width: 100 }} placeholder="Price (RM)" />
          <input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} style={{ ...inputStyle, width: 110 }} placeholder="Starting stock" />
          <Btn small type="submit" variant="owner">Add item</Btn>
        </form>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Order summary — shopping list</div>
        <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 12 }}>Totals across every submitted order. "To order" is what's still sitting unactioned — that's your supplier list.</div>
        {orderSummary.length === 0 ? (
          <div style={{ fontSize: 13, color: COLORS.inkSoft }}>Nothing submitted yet.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5, minWidth: 480 }}>
              <thead>
                <tr style={{ background: "#F8F6F1", textAlign: "left" }}>
                  {["Book", "To order", "On order", "Ready to give", "Given", "Total"].map((h) => (
                    <th key={h} style={{ padding: "7px 9px", fontWeight: 700, color: COLORS.inkSoft, borderBottom: "1.5px solid " + COLORS.border, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orderSummary.map((row) => (
                  <tr key={row.key} style={{ borderTop: "1px solid " + COLORS.border }}>
                    <td style={{ padding: "7px 9px" }}>{row.name}{!row.inCatalog ? " (not in catalog)" : ""}</td>
                    <td style={{ padding: "7px 9px", fontWeight: row.requested ? 700 : 400, color: row.requested ? COLORS.dangerDark : COLORS.inkSoft }}>{row.requested || "-"}</td>
                    <td style={{ padding: "7px 9px", color: COLORS.inkSoft }}>{row.ordered || "-"}</td>
                    <td style={{ padding: "7px 9px", color: COLORS.inkSoft }}>{row.received || "-"}</td>
                    <td style={{ padding: "7px 9px", color: COLORS.inkSoft }}>{row.given || "-"}</td>
                    <td style={{ padding: "7px 9px", fontWeight: 600 }}>{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Submitted orders ({submittedOrders.length})</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select value={teacherFilter} onChange={(e) => setTeacherFilter(e.target.value)} style={{ ...inputStyle, width: "auto", padding: "5px 8px", fontSize: 13 }}>
              <option value="">All teachers</option>
              {data.teachers.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
            </select>
            <select value={orderSort} onChange={(e) => setOrderSort(e.target.value)} style={{ ...inputStyle, width: "auto", padding: "5px 8px", fontSize: 13 }}>
              <option value="date">Sort: Newest first</option>
              <option value="teacher">Sort: By teacher</option>
            </select>
          </div>
        </div>
        <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 12 }}>Requested → Ordered → Received → Given. Marking a student's item as Given creates their invoice automatically.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {submittedOrders.map((order) => {
            const items = data.bookOrderItems.filter((i) => i.order_id === order.id);
            return (
              <div key={order.id} style={{ border: "1px solid " + (order.cancel_requested ? COLORS.amberDark : COLORS.border), borderRadius: 8, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {teacherName(order.teacher_id)} · {order.order_type === "student" ? `For ${studentName(order.student_id)}` : "Personal use"}{order.submitted_at ? ` · ${fmtDate(order.submitted_at.slice(0, 10))}` : ""}
                  </div>
                  <Btn small variant="danger" onClick={() => removeOrder(order)}>Remove order</Btn>
                </div>
                {order.cancel_requested && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10, padding: "8px 10px", background: COLORS.amberBg, borderRadius: 8 }}>
                    <div style={{ fontSize: 12.5, color: COLORS.amberDark }}>Teacher requested cancellation{order.cancel_reason ? ` — "${order.cancel_reason}"` : ""}</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Btn small variant="danger" onClick={() => approveCancel(order)}>Approve cancel</Btn>
                      <Btn small onClick={() => dismissCancelRequest(order)}>Dismiss</Btn>
                    </div>
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {items.map((item) => {
                    const bi = item.book_item_id ? data.bookItems.find((b) => b.id === item.book_item_id) : null;
                    return (
                      <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, gap: 8, flexWrap: "wrap" }}>
                        <span>
                          {bi ? bi.name : item.custom_name}{!bi ? " (not in catalog)" : ""} × {item.quantity}
                          {" · "}
                          {Number(item.price) > 0
                            ? fmtMoney(Number(item.price) * item.quantity)
                            : <span style={{ color: COLORS.dangerDark }}>no price set</span>}
                          {item.status === "rejected" && item.note && <span style={{ color: COLORS.inkSoft }}> — {item.note}</span>}
                        </span>
                        <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <Badge tone={item.status === "given" ? "success" : item.status === "received" ? "owner" : item.status === "ordered" ? "amber" : item.status === "rejected" ? "danger" : "gray"}>{item.status}</Badge>
                          {item.status !== "given" && item.status !== "rejected" && <Btn small disabled={busyId === item.id} onClick={() => advanceStatus(item)}>{busyId === item.id ? "Working…" : `Mark ${NEXT_STATUS[item.status]}`}</Btn>}
                          {item.status !== "given" && item.status !== "rejected" && <Btn small variant="danger" disabled={busyId === item.id} onClick={() => rejectItem(item)}>Reject</Btn>}
                          {item.status === "rejected" && <Btn small disabled={busyId === item.id} onClick={() => unrejectItem(item)}>Un-reject</Btn>}
                          {!bi && item.status !== "rejected" && <Btn small onClick={() => addToCatalog(item)}>Add to catalog</Btn>}
                          {!bi && item.status !== "rejected" && <Btn small onClick={() => setItemPrice(item)}>Set price only</Btn>}
                          <a href="#" onClick={(e) => { e.preventDefault(); removeOrderItem(item); }} style={{ color: COLORS.danger, fontSize: 12 }}>Remove</a>
                        </span>
                      </div>
                    );
                  })}
                  {items.length === 0 && <div style={{ fontSize: 12, color: COLORS.inkSoft }}>No items.</div>}
                </div>
              </div>
            );
          })}
          {submittedOrders.length === 0 && <div style={{ fontSize: 13, color: COLORS.inkSoft }}>No submitted orders yet.</div>}
        </div>
      </Card>

      {(() => {
        const cancelledOrders = [...data.bookOrders].filter((o) => o.status === "cancelled").sort((a, b) => (b.submitted_at || "").localeCompare(a.submitted_at || ""));
        if (cancelledOrders.length === 0) return null;
        return (
          <Card style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Cancelled orders ({cancelledOrders.length})</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {cancelledOrders.map((order) => {
                const items = data.bookOrderItems.filter((i) => i.order_id === order.id);
                return (
                  <div key={order.id} style={{ fontSize: 12.5, color: COLORS.inkSoft, padding: "8px 10px", border: "1px solid " + COLORS.border, borderRadius: 8 }}>
                    {teacherName(order.teacher_id)} · {order.order_type === "student" ? `For ${studentName(order.student_id)}` : "Personal use"}
                    {order.note ? ` — ${order.note}` : ""}
                    <div>{items.map((i) => (i.book_item_id ? data.bookItems.find((b) => b.id === i.book_item_id)?.name : i.custom_name)).join(", ")}</div>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })()}
    </div>
  );
}

function HealthTab({ data }) {
  const teacherName = (id) => data.teachers.find((t) => t.id === id)?.name || "Unassigned";

  // Every instrument a student has, whether it's their primary (on the
  // student row) or an extra one (student_instruments), flattened so all
  // the checks below can treat them the same way.
  const allInstruments = [];
  data.students.forEach((s) => {
    if (s.course) allInstruments.push({ studentId: s.id, studentName: s.name, course: s.course, level: s.level, billingType: s.billing_type, monthlyRate: s.monthly_rate, price: s.price, day: s.permanent_day, time: s.permanent_time, teacherId: s.teacher_id, isPrimary: true });
  });
  data.studentInstruments.forEach((si) => {
    const s = data.students.find((x) => x.id === si.student_id);
    allInstruments.push({ studentId: si.student_id, studentName: s?.name || "—", course: si.course, level: si.level, billingType: si.billing_type, monthlyRate: si.monthly_rate, price: si.price, day: si.permanent_day, time: si.permanent_time, teacherId: si.teacher_id, isPrimary: false });
  });

  const noRate = allInstruments.filter((i) => i.billingType === "per_month" ? !i.monthlyRate : !i.price);
  const notScheduled = allInstruments.filter((i) => i.day == null || !i.time);
  const noTeacher = allInstruments.filter((i) => !i.teacherId);

  // Same course name used with different capitalization anywhere (courses
  // catalog, or typed directly on a student/instrument) — these look like
  // separate courses to any filter or grouping even though they're the same.
  const courseCasings = new Map();
  const noteCasing = (name) => {
    if (!name) return;
    const key = name.trim().toLowerCase();
    if (!courseCasings.has(key)) courseCasings.set(key, new Set());
    courseCasings.get(key).add(name.trim());
  };
  data.courses.forEach((c) => noteCasing(c.name));
  allInstruments.forEach((i) => noteCasing(i.course));
  const casingIssues = [...courseCasings.entries()].filter(([, variants]) => variants.size > 1);

  // Same full name used on more than one student record — usually means a
  // duplicate got created (e.g. an import before rows were grouped by name).
  const nameCounts = new Map();
  data.students.forEach((s) => { const key = s.name.trim().toLowerCase(); nameCounts.set(key, (nameCounts.get(key) || 0) + 1); });
  const possibleDuplicates = [...nameCounts.entries()].filter(([, count]) => count > 1);

  const levelsNoPrice = data.courseLevels.filter((l) => !l.default_price_child && !l.default_price_adult);

  const Section = ({ title, blurb, count, children }) => (
    <Card style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{title}</div>
        <Badge tone={count > 0 ? "amber" : "success"}>{count}</Badge>
      </div>
      {blurb && <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: count > 0 ? 10 : 0 }}>{blurb}</div>}
      {children}
    </Card>
  );

  return (
    <div>
      <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 16 }}>A periodic sanity check — nothing here breaks the app, but each of these can quietly cause wrong bills, missed lessons, or confusing filters.</div>

      <Section title="Instruments with no rate set" blurb="Will bill RM0 until fixed." count={noRate.length}>
        {noRate.map((i, idx) => (<div key={idx} style={{ fontSize: 13, padding: "5px 0", borderTop: idx ? "1px solid " + COLORS.border : "none" }}>{i.studentName} — {i.course}{i.level ? ` (${i.level})` : ""}</div>))}
      </Section>

      <Section title="Instruments with no schedule" blurb="Never generated any calendar lessons — set Day/Time on the instrument." count={notScheduled.length}>
        {notScheduled.map((i, idx) => (<div key={idx} style={{ fontSize: 13, padding: "5px 0", borderTop: idx ? "1px solid " + COLORS.border : "none" }}>{i.studentName} — {i.course}{i.level ? ` (${i.level})` : ""}</div>))}
      </Section>

      <Section title="Instruments with no teacher assigned" blurb="Might be intentional, but worth a glance." count={noTeacher.length}>
        {noTeacher.map((i, idx) => (<div key={idx} style={{ fontSize: 13, padding: "5px 0", borderTop: idx ? "1px solid " + COLORS.border : "none" }}>{i.studentName} — {i.course}{i.level ? ` (${i.level})` : ""}</div>))}
      </Section>

      <Section title="Course names with mismatched capitalization" blurb="e.g. 'Piano' and 'piano' are treated as two different courses by every filter and group." count={casingIssues.length}>
        {casingIssues.map(([key, variants], idx) => (<div key={idx} style={{ fontSize: 13, padding: "5px 0", borderTop: idx ? "1px solid " + COLORS.border : "none" }}>{[...variants].join(" / ")}</div>))}
      </Section>

      <Section title="Possible duplicate students" blurb="Same full name on more than one student record." count={possibleDuplicates.length}>
        {possibleDuplicates.map(([name, count], idx) => (<div key={idx} style={{ fontSize: 13, padding: "5px 0", borderTop: idx ? "1px solid " + COLORS.border : "none" }}>{name} ({count} records)</div>))}
      </Section>

      <Section title="Course levels with no price set" blurb="Neither a Child nor Adult rate — picking this level won't auto-fill anything." count={levelsNoPrice.length}>
        {levelsNoPrice.map((l, idx) => {
          const course = data.courses.find((c) => c.id === l.course_id);
          return <div key={idx} style={{ fontSize: 13, padding: "5px 0", borderTop: idx ? "1px solid " + COLORS.border : "none" }}>{course?.name || "—"} — {l.name}</div>;
        })}
      </Section>
    </div>
  );
}

function SettingsTab({ data, refresh }) {
  const s = data.settings || {};
  const [form, setForm] = useState({
    company_name: s.company_name || "", license_no: s.license_no || "", address: s.address || "",
    phone: s.phone || "", email: s.email || "", logo_data: s.logo_data || "",
    bank_name: s.bank_name || "", account_holder: s.account_holder || "", account_number: s.account_number || "",
    invoice_terms: s.invoice_terms || "",
  });
  const [saved, setSaved] = useState(false);

  const onLogoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, logo_data: reader.result }));
    reader.readAsDataURL(file);
  };

  const save = async (e) => {
    e.preventDefault();
    await supabase.from("studio_settings").upsert({ id: 1, ...form });
    setSaved(true); refresh();
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
    <form onSubmit={save}>
      <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 16 }}>Fill this in once — it's used to fill in your logo, contact details, and bank info on every invoice, receipt, and payment voucher automatically.</div>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Company details</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Company name"><input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} style={inputStyle} /></Field>
          <Field label="Trading / business license no."><input value={form.license_no} onChange={(e) => setForm({ ...form, license_no: e.target.value })} style={inputStyle} /></Field>
        </div>
        <Field label="Address"><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} style={inputStyle} /></Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Phone"><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={inputStyle} /></Field>
          <Field label="Email"><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={inputStyle} /></Field>
        </div>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Logo</div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {form.logo_data && <img src={form.logo_data} alt="Logo" style={{ height: 44, border: "1px solid " + COLORS.border, borderRadius: 6, padding: 4 }} />}
          <div>
            <input type="file" accept="image/*" onChange={onLogoChange} />
            {form.logo_data && <div><a href="#" onClick={(e) => { e.preventDefault(); setForm({ ...form, logo_data: "" }); }} style={{ fontSize: 12, color: COLORS.danger }}>Remove logo</a></div>}
          </div>
        </div>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Bank details</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Bank name"><input value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} style={inputStyle} /></Field>
          <Field label="Account holder name"><input value={form.account_holder} onChange={(e) => setForm({ ...form, account_holder: e.target.value })} style={inputStyle} /></Field>
        </div>
        <Field label="Account number"><input value={form.account_number} onChange={(e) => setForm({ ...form, account_number: e.target.value })} style={inputStyle} /></Field>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Invoice terms (optional)</div>
        <Field label="Note shown at the bottom of every invoice">
          <input value={form.invoice_terms} onChange={(e) => setForm({ ...form, invoice_terms: e.target.value })} style={inputStyle} placeholder="Payment due within 7 days" />
        </Field>
      </Card>

      <Btn type="submit" variant="owner">{saved ? "Saved ✓" : "Save settings"}</Btn>
      </form>
    </div>
  );
}

function CourseLevels({ course, data, refresh }) {
  const [name, setName] = useState("");
  const [priceChild, setPriceChild] = useState("");
  const [priceAdult, setPriceAdult] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [editingPriceChild, setEditingPriceChild] = useState("");
  const [editingPriceAdult, setEditingPriceAdult] = useState("");
  const levels = data.courseLevels.filter((l) => l.course_id === course.id);
  const addLevel = async (e) => {
    e.preventDefault();
    await supabase.from("course_levels").insert({
      course_id: course.id, name, sort_order: levels.length,
      default_price_child: priceChild ? Number(priceChild) : null,
      default_price_adult: priceAdult ? Number(priceAdult) : null,
    });
    setName(""); setPriceChild(""); setPriceAdult(""); refresh();
  };
  const removeLevel = async (id) => { await supabase.from("course_levels").delete().eq("id", id); refresh(); };
  const saveLevel = async (id) => {
    await supabase.from("course_levels").update({
      name: editingName,
      default_price_child: editingPriceChild ? Number(editingPriceChild) : null,
      default_price_adult: editingPriceAdult ? Number(editingPriceAdult) : null,
    }).eq("id", id);
    setEditingId(null); refresh();
  };
  return (
    <details style={{ marginTop: 6 }}>
      <summary style={{ fontSize: 12, color: COLORS.owner, cursor: "pointer" }}>Levels ({levels.length})</summary>
      <div style={{ fontSize: 11, color: COLORS.inkSoft, margin: "6px 0" }}>Prices here are the monthly rate for that level (not per lesson) — separate rates for children and adults.</div>
      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
        {levels.map((l) => (
          <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, padding: "4px 8px", background: "#F8F6F1", borderRadius: 6, gap: 6, flexWrap: "wrap" }}>
            {editingId === l.id ? (
              <>
                <input value={editingName} onChange={(e) => setEditingName(e.target.value)} style={{ ...inputStyle, fontSize: 12, padding: "3px 6px", flex: 1, minWidth: 70 }} />
                <input type="number" value={editingPriceChild} onChange={(e) => setEditingPriceChild(e.target.value)} style={{ ...inputStyle, fontSize: 12, padding: "3px 6px", width: 80 }} placeholder="Child RM/mo" />
                <input type="number" value={editingPriceAdult} onChange={(e) => setEditingPriceAdult(e.target.value)} style={{ ...inputStyle, fontSize: 12, padding: "3px 6px", width: 80 }} placeholder="Adult RM/mo" />
                <a href="#" onClick={(e) => { e.preventDefault(); saveLevel(l.id); }} style={{ color: COLORS.owner }}>Save</a>
                <a href="#" onClick={(e) => { e.preventDefault(); setEditingId(null); }} style={{ color: COLORS.inkSoft }}>Cancel</a>
              </>
            ) : (
              <>
                <span>{l.name}{l.default_price_child ? ` · Child ${fmtMoney(l.default_price_child)}/mo` : ""}{l.default_price_adult ? ` · Adult ${fmtMoney(l.default_price_adult)}/mo` : ""}</span>
                <span style={{ display: "flex", gap: 8 }}>
                  <a href="#" onClick={(e) => { e.preventDefault(); setEditingId(l.id); setEditingName(l.name); setEditingPriceChild(l.default_price_child || ""); setEditingPriceAdult(l.default_price_adult || ""); }} style={{ color: COLORS.owner }}>Edit</a>
                  <a href="#" onClick={(e) => { e.preventDefault(); removeLevel(l.id); }} style={{ color: COLORS.danger }}>Remove</a>
                </span>
              </>
            )}
          </div>
        ))}
        {levels.length === 0 && <div style={{ fontSize: 12, color: COLORS.inkSoft }}>No levels yet.</div>}
      </div>
      <form onSubmit={addLevel} style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
        <input required value={name} onChange={(e) => setName(e.target.value)} style={{ ...inputStyle, fontSize: 12, padding: "5px 8px", flex: 1, minWidth: 90 }} placeholder="e.g. Level 1" />
        <input type="number" value={priceChild} onChange={(e) => setPriceChild(e.target.value)} style={{ ...inputStyle, fontSize: 12, padding: "5px 8px", width: 90 }} placeholder="Child RM/mo" />
        <input type="number" value={priceAdult} onChange={(e) => setPriceAdult(e.target.value)} style={{ ...inputStyle, fontSize: 12, padding: "5px 8px", width: 90 }} placeholder="Adult RM/mo" />
        <Btn small type="submit">Add</Btn>
      </form>
    </details>
  );
}

function CoursesCard({ data, refresh }) {
  const [form, setForm] = useState({ name: "", price: "", type: "" });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", type: "", price: "" });
  const add = async (e) => {
    e.preventDefault();
    await supabase.from("courses").insert({ name: form.name, default_price: form.price ? Number(form.price) : null, type: form.type || null });
    setForm({ name: "", price: "", type: "" }); refresh();
  };
  const remove = async (id) => { await supabase.from("courses").delete().eq("id", id); refresh(); };
  const startEdit = (c) => { setEditingId(c.id); setEditForm({ name: c.name, type: c.type || "", price: c.default_price || "" }); };
  const saveEdit = async (e) => {
    e.preventDefault();
    await supabase.from("courses").update({ name: editForm.name, type: editForm.type || null, default_price: editForm.price ? Number(editForm.price) : null }).eq("id", editingId);
    setEditingId(null); refresh();
  };
  return (
    <Card style={{ marginTop: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Courses & instruments</div>
      <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 12 }}>Preset list — pick from these when adding/editing students, and when setting a teacher's per-course rate. Add levels under each one (e.g. Level 1–10) if it applies.</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        {data.courses.map((c) => (
          <div key={c.id} style={{ padding: "8px 10px", background: COLORS.card, border: "1px solid " + COLORS.border, borderRadius: 8, fontSize: 13 }}>
            {editingId === c.id ? (
              <form onSubmit={saveEdit} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div style={{ flex: "2 1 120px" }}><Field label="Name"><input required value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} style={inputStyle} /></Field></div>
                <div style={{ flex: "1 1 100px" }}><Field label="Type"><input value={editForm.type} onChange={(e) => setEditForm({ ...editForm, type: e.target.value })} style={inputStyle} /></Field></div>
                <div style={{ flex: "1 1 90px" }}><Field label="Rate (RM)"><input type="number" value={editForm.price} onChange={(e) => setEditForm({ ...editForm, price: e.target.value })} style={inputStyle} /></Field></div>
                <Btn small variant="owner" type="submit" style={{ marginBottom: 12 }}>Save</Btn>
                <Btn small type="button" onClick={() => setEditingId(null)} style={{ marginBottom: 12 }}>Cancel</Btn>
              </form>
            ) : (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{c.name}{c.type ? ` · ${c.type}` : ""}{c.default_price ? ` · ${fmtMoney(c.default_price)}` : ""}</span>
                <span style={{ display: "flex", gap: 10 }}>
                  <a href="#" onClick={(e) => { e.preventDefault(); startEdit(c); }} style={{ color: COLORS.owner, fontSize: 12 }}>Edit</a>
                  <a href="#" onClick={(e) => { e.preventDefault(); remove(c.id); }} style={{ color: COLORS.danger, fontSize: 12 }}>Remove</a>
                </span>
              </div>
            )}
            <CourseLevels course={c} data={data} refresh={refresh} />
          </div>
        ))}
        {data.courses.length === 0 && <div style={{ fontSize: 13, color: COLORS.inkSoft }}>None yet — add your first below.</div>}
      </div>
      <form onSubmit={add} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: "2 1 140px" }}><Field label="Name"><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} placeholder="e.g. Piano" /></Field></div>
        <div style={{ flex: "1 1 120px" }}><Field label="Type"><input value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} style={inputStyle} placeholder="e.g. Instrument" /></Field></div>
        <div style={{ flex: "1 1 100px" }}><Field label="Default rate (RM)"><input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} style={inputStyle} /></Field></div>
        <Btn type="submit" variant="owner" style={{ marginBottom: 12 }}>Add</Btn>
      </form>
    </Card>
  );
}

function quickRange(kind) {
  const d = new Date();
  if (kind === "month") {
    const from = new Date(d.getFullYear(), d.getMonth(), 1);
    return { from: isoDate(from), to: todayIso() };
  }
  if (kind === "lastMonth") {
    const from = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const to = new Date(d.getFullYear(), d.getMonth(), 0);
    return { from: isoDate(from), to: isoDate(to) };
  }
  if (kind === "year") {
    const from = new Date(d.getFullYear(), 0, 1);
    return { from: isoDate(from), to: todayIso() };
  }
  return { from: "2000-01-01", to: "2100-01-01" };
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function invoiceNoLabel(n) { return `INV-${String(n).padStart(4, "0")}`; }

function FeesTab({ data, refresh }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [monthlyForm, setMonthlyForm] = useState({ studentId: data.students[0]?.id || "", month: todayIso().slice(0, 7) });
  const [monthlyMaterials, setMonthlyMaterials] = useState([]);
  const addMonthlyMaterial = () => setMonthlyMaterials((m) => [...m, { description: "", amount: "" }]);
  const updateMonthlyMaterial = (i, patch) => setMonthlyMaterials((m) => m.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const removeMonthlyMaterial = (i) => setMonthlyMaterials((m) => m.filter((_, idx) => idx !== i));
  const [manualForm, setManualForm] = useState({ studentId: data.students[0]?.id || "", date: todayIso(), items: [{ description: "", amount: "" }] });
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [viewInvoice, setViewInvoice] = useState(null);

  const rows = data.students
    .filter((s) => (s.status || "active") === "active")
    .filter((s) => !search || s.name.toLowerCase().includes(search.toLowerCase()))
    .map((s) => ({ student: s, ...studentInvoiceSummary(s.id, data.invoices) }))
    .filter((r) => {
      if (filter === "unsettled") return r.unpaidCount > 0;
      if (filter === "no-invoices") return r.invoiceCount === 0;
      if (filter === "unset") return r.student.billing_type === "per_month" && !r.student.monthly_rate;
      return true;
    })
    .sort((a, b) => b.owed - a.owed);

  const totalOwed = data.invoices.filter((inv) => inv.status !== "paid").reduce((sum, inv) => sum + Number(inv.total), 0);
  const totalCollectedThisMonth = data.studentPayments.filter((p) => p.date.slice(0, 7) === todayIso().slice(0, 7)).reduce((sum, p) => sum + Number(p.amount), 0);
  const daysOverdue = (dateStr) => Math.floor((new Date(todayIso()) - new Date(dateStr)) / 86400000);
  const overdueInvoices = data.invoices
    .filter((inv) => inv.status !== "paid" && daysOverdue(inv.date) >= 14)
    .map((inv) => ({ ...inv, days: daysOverdue(inv.date) }))
    .sort((a, b) => b.days - a.days);

  // --- Generate monthly invoice ---
  const monthlyStudent = data.students.find((s) => s.id === monthlyForm.studentId);
  const [y, m] = monthlyForm.month.split("-");
  const monthLabel = `${MONTH_NAMES[Number(m) - 1]} ${y}`;
  const billableInstruments = monthlyStudent
    ? [
        { key: "primary", course: monthlyStudent.course, level: monthlyStudent.level, billing_type: monthlyStudent.billing_type, monthly_rate: monthlyStudent.monthly_rate },
        ...data.studentInstruments.filter((si) => si.student_id === monthlyForm.studentId).map((si) => ({ key: si.id, course: si.course, level: si.level, billing_type: si.billing_type || "per_lesson", monthly_rate: si.monthly_rate })),
      ].filter((b) => b.course)
    : [];
  const instrumentBreakdown = billableInstruments.map((b) => {
    const lessonsForThis = data.lessons.filter((l) =>
      l.student_id === monthlyForm.studentId && l.date.slice(0, 7) === monthlyForm.month &&
      (l.status === "attended" || l.status === "scheduled") &&
      (l.instrument || monthlyStudent.course) === b.course
    );
    const amount = b.billing_type === "per_month" ? Number(b.monthly_rate || 0) : lessonsForThis.reduce((sum, l) => sum + Number(l.price), 0);
    return { ...b, lessons: lessonsForThis, amount };
  });
  const lessonsTotal = instrumentBreakdown.reduce((sum, b) => sum + b.amount, 0);
  const validMonthlyMaterials = monthlyMaterials.filter((it) => it.description && Number(it.amount) > 0);
  const materialsTotal = validMonthlyMaterials.reduce((sum, it) => sum + Number(it.amount), 0);
  const monthlyTotal = lessonsTotal + materialsTotal;

  const generateMonthlyInvoice = async () => {
    if (!monthlyStudent) return;
    const { data: inv, error } = await supabase.from("invoices").insert({ student_id: monthlyForm.studentId, date: todayIso(), month: monthlyForm.month, total: monthlyTotal }).select().single();
    if (error || !inv) return;
    const items = [];
    instrumentBreakdown.forEach((b) => {
      if (b.billing_type === "per_month") {
        const desc = `${b.course}${b.level ? ` (${b.level})` : ""} — ${monthLabel} (monthly fee${b.lessons.length ? `, ${b.lessons.length} lesson${b.lessons.length > 1 ? "s" : ""} logged` : ""})`;
        items.push({ invoice_id: inv.id, description: desc, amount: b.amount, sort_order: items.length });
      } else if (b.lessons.length > 0) {
        const byDuration = {};
        b.lessons.forEach((l) => { const d = l.duration_min || 30; byDuration[d] = (byDuration[d] || 0) + 1; });
        const desc = `${b.course} — ${monthLabel} (${b.lessons.length} × ${Object.keys(byDuration).join("/")} min)`;
        items.push({ invoice_id: inv.id, description: desc, amount: b.amount, sort_order: items.length });
      }
    });
    validMonthlyMaterials.forEach((it) => items.push({ invoice_id: inv.id, description: it.description, amount: Number(it.amount), sort_order: items.length }));
    await supabase.from("invoice_items").insert(items);
    setMonthlyMaterials([]);
    refresh();
  };

  // --- Manual invoice ---
  const manualTotal = manualForm.items.reduce((sum, it) => sum + (Number(it.amount) || 0), 0);
  const addManualItem = () => setManualForm({ ...manualForm, items: [...manualForm.items, { description: "", amount: "" }] });
  const updateManualItem = (i, patch) => setManualForm({ ...manualForm, items: manualForm.items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) });
  const removeManualItem = (i) => setManualForm({ ...manualForm, items: manualForm.items.filter((_, idx) => idx !== i) });
  const createManualInvoice = async () => {
    if (!manualForm.studentId || manualTotal <= 0) return;
    const { data: inv, error } = await supabase.from("invoices").insert({ student_id: manualForm.studentId, date: manualForm.date, total: manualTotal }).select().single();
    if (error || !inv) return;
    const rows = manualForm.items.filter((it) => it.description && it.amount).map((it, i) => ({ invoice_id: inv.id, description: it.description, amount: Number(it.amount), sort_order: i }));
    if (rows.length) await supabase.from("invoice_items").insert(rows);
    setManualForm({ studentId: data.students[0]?.id || "", date: todayIso(), items: [{ description: "", amount: "" }] });
    refresh();
  };

  // --- Invoice list ---
  const studentName = (id) => data.students.find((s) => s.id === id)?.name || "—";
  const itemsFor = (invId) => data.invoiceItems.filter((it) => it.invoice_id === invId);
  const filteredInvoices = data.invoices.filter((inv) =>
    !invoiceSearch ||
    studentName(inv.student_id).toLowerCase().includes(invoiceSearch.toLowerCase()) ||
    invoiceNoLabel(inv.invoice_no).toLowerCase().includes(invoiceSearch.toLowerCase())
  );

  const markInvoicePaid = async (inv) => {
    const { data: payment } = await supabase.from("student_payments").insert({ student_id: inv.student_id, date: todayIso(), amount: inv.total, notes: `${invoiceNoLabel(inv.invoice_no)}`, invoice_id: inv.id }).select().single();
    await supabase.from("invoices").update({ status: "paid", paid_date: todayIso() }).eq("id", inv.id);
    refresh();
  };
  const undoInvoicePaid = async (inv) => {
    const linked = data.studentPayments.find((p) => p.invoice_id === inv.id);
    if (linked) await supabase.from("student_payments").delete().eq("id", linked.id);
    await supabase.from("invoices").update({ status: "unpaid", paid_date: null }).eq("id", inv.id);
    refresh();
  };
  const removeInvoice = async (inv) => {
    if (!confirm(`Remove ${invoiceNoLabel(inv.invoice_no)}? This can't be undone.`)) return;
    const linked = data.studentPayments.find((p) => p.invoice_id === inv.id);
    if (linked) await supabase.from("student_payments").delete().eq("id", linked.id);
    await supabase.from("invoices").delete().eq("id", inv.id);
    refresh();
  };

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
        <Card style={{ background: COLORS.dangerBg, border: "none" }}>
          <div style={{ fontSize: 12, color: COLORS.dangerDark, fontWeight: 600 }}>Total outstanding</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.dangerDark }}>{fmtMoney(totalOwed)}</div>
        </Card>
        <Card style={{ background: COLORS.successBg, border: "none" }}>
          <div style={{ fontSize: 12, color: COLORS.successDark, fontWeight: 600 }}>Collected this month</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.successDark }}>{fmtMoney(totalCollectedThisMonth)}</div>
        </Card>
        <Card style={{ background: overdueInvoices.length ? COLORS.dangerBg : "#F8F6F1", border: "none" }}>
          <div style={{ fontSize: 12, color: overdueInvoices.length ? COLORS.dangerDark : COLORS.inkSoft, fontWeight: 600 }}>Overdue 14+ days</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: overdueInvoices.length ? COLORS.dangerDark : COLORS.ink }}>{overdueInvoices.length}</div>
        </Card>
      </div>

      {overdueInvoices.length > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Overdue invoices</div>
          <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 12 }}>Unpaid and dated 14+ days ago, oldest first.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {overdueInvoices.map((inv) => (
              <div key={inv.id} onClick={() => setViewInvoice(inv)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 12px", background: COLORS.card, border: "1px solid " + COLORS.border, borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
                <span>{invoiceNoLabel(inv.invoice_no)} · <strong>{studentName(inv.student_id)}</strong> · {fmtDate(inv.date)}</span>
                <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span style={{ fontWeight: 700 }}>{fmtMoney(inv.total)}</span>
                  <Badge tone="danger">{inv.days} days</Badge>
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Student balances</div>
        <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 12 }}>Owed and settled are based on invoices — a student only owes once an invoice is generated below, and is settled once that invoice is marked paid.</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          <input placeholder="Search by name" value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...inputStyle, flex: "2 1 160px" }} />
          <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ ...inputStyle, flex: "1 1 140px" }}>
            <option value="all">All active students</option>
            <option value="unsettled">Has unpaid invoice</option>
            <option value="no-invoices">No invoices yet</option>
            <option value="unset">No rate set</option>
          </select>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {rows.map(({ student: s, owed, paid, invoiceCount, settled }) => (
            <Card key={s.id} style={{ padding: "10px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div style={{ fontSize: 13 }}>
                  <strong>{s.name}</strong>
                  <span style={{ color: COLORS.inkSoft }}>
                    {" · "}
                    {(() => {
                      const list = [];
                      if (s.course) list.push({ course: s.course, level: s.level, rateLabel: s.billing_type === "per_month" ? (s.monthly_rate ? `${fmtMoney(s.monthly_rate)}/mo` : "no rate set") : `${fmtMoney(s.price)}/lesson` });
                      data.studentInstruments.filter((si) => si.student_id === s.id).forEach((si) => {
                        list.push({ course: si.course, level: si.level, rateLabel: si.billing_type === "per_month" ? (si.monthly_rate ? `${fmtMoney(si.monthly_rate)}/mo` : "no rate set") : `${fmtMoney(si.price)}/lesson` });
                      });
                      if (list.length === 0) return "No instruments yet";
                      return list.map((it, i) => (
                        <span key={i}>{i > 0 ? " · " : ""}{it.course}{it.level ? ` (${it.level})` : ""} — {it.rateLabel}</span>
                      ));
                    })()}
                  </span>
                  <div style={{ color: COLORS.inkSoft, fontSize: 12 }}>{invoiceCount === 0 ? "No invoices yet" : `Unpaid ${fmtMoney(owed)} · Paid ${fmtMoney(paid)}`}</div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {!settled && <Badge tone="danger">Not settled — {fmtMoney(owed)}</Badge>}
                  {settled && invoiceCount > 0 && <Badge tone="success">Settled</Badge>}
                  {invoiceCount === 0 && <Badge tone="gray">No invoices</Badge>}
                  <Btn small onClick={() => setInvoiceSearch(s.name)}>View invoices</Btn>
                </div>
              </div>
            </Card>
          ))}
          {rows.length === 0 && <div style={{ fontSize: 13, color: COLORS.inkSoft }}>No students match.</div>}
        </div>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Generate monthly invoice</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Student">
            <select value={monthlyForm.studentId} onChange={(e) => setMonthlyForm({ ...monthlyForm, studentId: e.target.value })} style={inputStyle}>
              {data.students.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
            </select>
          </Field>
          <Field label="Month"><input type="month" value={monthlyForm.month} onChange={(e) => setMonthlyForm({ ...monthlyForm, month: e.target.value })} style={inputStyle} /></Field>
        </div>
        <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 12 }}>
          {instrumentBreakdown.length === 0 ? "This student has no instruments set up yet." : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {instrumentBreakdown.map((b) => (
                <li key={b.key}>
                  {b.course}{b.level ? ` (${b.level})` : ""} — {b.billing_type === "per_month"
                    ? `monthly fee ${fmtMoney(b.amount)}${b.lessons.length ? ` (${b.lessons.length} lesson${b.lessons.length > 1 ? "s" : ""} logged)` : " (no lessons logged yet)"}`
                    : (b.lessons.length === 0 ? "no lessons this month" : `${b.lessons.length} lesson${b.lessons.length > 1 ? "s" : ""} — ${fmtMoney(b.amount)}`)}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.inkSoft, marginBottom: 6 }}>Materials (optional add-on)</div>
        {monthlyMaterials.map((it, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-end" }}>
            <div style={{ flex: 3 }}>
              <Field label={i === 0 ? "Item" : ""}>
                <input value={it.description} onChange={(e) => updateMonthlyMaterial(i, { description: e.target.value })} style={inputStyle} placeholder="e.g. Grade 3 workbook" />
              </Field>
            </div>
            <div style={{ flex: 1 }}>
              <Field label={i === 0 ? "Amount (RM)" : ""}>
                <input type="number" value={it.amount} onChange={(e) => updateMonthlyMaterial(i, { amount: e.target.value })} style={inputStyle} />
              </Field>
            </div>
            <a href="#" onClick={(e) => { e.preventDefault(); removeMonthlyMaterial(i); }} style={{ color: COLORS.danger, fontSize: 12, marginBottom: 12 }}>Remove</a>
          </div>
        ))}
        <a href="#" onClick={(e) => { e.preventDefault(); addMonthlyMaterial(); }} style={{ fontSize: 13, color: COLORS.owner, display: "inline-block", marginBottom: 12 }}>+ Add material</a>

        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 14, marginBottom: 10, paddingTop: 8, borderTop: "1px solid " + COLORS.border }}>
          <span>Invoice total</span><span>{fmtMoney(monthlyTotal)}</span>
        </div>
        <Btn variant="owner" disabled={monthlyTotal <= 0} onClick={generateMonthlyInvoice}>Generate invoice</Btn>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Manual invoice</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Student">
            <select value={manualForm.studentId} onChange={(e) => setManualForm({ ...manualForm, studentId: e.target.value })} style={inputStyle}>
              {data.students.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
            </select>
          </Field>
          <Field label="Date"><input type="date" value={manualForm.date} onChange={(e) => setManualForm({ ...manualForm, date: e.target.value })} style={inputStyle} /></Field>
        </div>
        {manualForm.items.map((it, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-end" }}>
            <div style={{ flex: 3 }}><Field label={i === 0 ? "Description" : ""}><input value={it.description} onChange={(e) => updateManualItem(i, { description: e.target.value })} style={inputStyle} placeholder="e.g. Piano lessons, July" /></Field></div>
            <div style={{ flex: 1 }}><Field label={i === 0 ? "Amount (RM)" : ""}><input type="number" value={it.amount} onChange={(e) => updateManualItem(i, { amount: e.target.value })} style={inputStyle} /></Field></div>
            {manualForm.items.length > 1 && <a href="#" onClick={(e) => { e.preventDefault(); removeManualItem(i); }} style={{ color: COLORS.danger, fontSize: 12, marginBottom: 12 }}>Remove</a>}
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <a href="#" onClick={(e) => { e.preventDefault(); addManualItem(); }} style={{ fontSize: 13, color: COLORS.owner }}>+ Add another item</a>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Total: {fmtMoney(manualTotal)}</div>
        </div>
        <Btn variant="owner" disabled={manualTotal <= 0} onClick={createManualInvoice}>Create invoice</Btn>
      </Card>

      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Invoices ({data.invoices.length})</div>
          <input placeholder="Search by student or invoice #..." value={invoiceSearch} onChange={(e) => setInvoiceSearch(e.target.value)} style={{ ...inputStyle, maxWidth: 220 }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filteredInvoices.map((inv) => {
            const items = itemsFor(inv.id);
            return (
              <div key={inv.id} style={{ padding: "10px 12px", background: COLORS.card, border: "1px solid " + COLORS.border, borderRadius: 8, fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <strong>{invoiceNoLabel(inv.invoice_no)} — {studentName(inv.student_id)}</strong>
                    <div style={{ color: COLORS.inkSoft, fontSize: 12 }}>{items.map((it) => `${it.description} (${fmtMoney(it.amount)})`).join(" + ")}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <strong>{fmtMoney(inv.total)}</strong>
                    {inv.status === "paid" ? <Badge tone="success">Paid {inv.paid_date}</Badge> : <Badge tone="amber">Unpaid</Badge>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 6, fontSize: 12 }}>
                  {inv.status === "unpaid" ? (
                    <a href="#" onClick={(e) => { e.preventDefault(); markInvoicePaid(inv); }} style={{ color: COLORS.owner }}>Mark paid</a>
                  ) : (
                    <a href="#" onClick={(e) => { e.preventDefault(); undoInvoicePaid(inv); }} style={{ color: COLORS.inkSoft }}>Undo</a>
                  )}
                  <a href="#" onClick={(e) => { e.preventDefault(); setViewInvoice(inv); }} style={{ color: COLORS.owner }}>Download receipt</a>
                  <a href="#" onClick={(e) => { e.preventDefault(); removeInvoice(inv); }} style={{ color: COLORS.danger }}>Remove</a>
                </div>
              </div>
            );
          })}
          {filteredInvoices.length === 0 && <div style={{ fontSize: 13, color: COLORS.inkSoft }}>No invoices yet.</div>}
        </div>
      </Card>

      {viewInvoice && (() => {
        const meta = [
          { label: "Invoice #", value: invoiceNoLabel(viewInvoice.invoice_no) },
          { label: "Date", value: fmtDate(viewInvoice.date) },
          { label: "Status", value: viewInvoice.status === "paid" ? `Paid ${fmtDate(viewInvoice.paid_date)}` : "Unpaid" },
          { label: "Bill to", value: studentName(viewInvoice.student_id) },
        ];
        const rows = itemsFor(viewInvoice.id).map((it) => ({ label: it.description, value: fmtMoney(it.amount) }));
        return (
          <Modal title={invoiceNoLabel(viewInvoice.invoice_no)} onClose={() => setViewInvoice(null)}>
            <div style={{ border: "1px solid " + COLORS.border, borderRadius: 10, padding: 18, background: "#FCFBF8" }}>
            <DocHeader settings={data.settings} docType="INVOICE" meta={meta} />
            <DocTable rows={rows} totalLabel="Total" totalValue={fmtMoney(viewInvoice.total)} />
            <DocFooter settings={data.settings} />
            </div>
            <Btn variant="owner" style={{ width: "100%", marginTop: 16 }} onClick={() => generateDocPdf({ settings: data.settings, docType: "INVOICE", meta, rows, totalLabel: "Total", totalValue: fmtMoney(viewInvoice.total), filename: `${invoiceNoLabel(viewInvoice.invoice_no)}-${studentName(viewInvoice.student_id)}` })}>Download PDF</Btn>
          </Modal>
        );
      })()}
    </div>
  );
}

function ReportsTab({ data, refresh }) {
  const reportPrintRef = useRef(null);
  const [range, setRange] = useState({ from: quickRange("month").from, to: todayIso() });
  const [sections, setSections] = useState({ income: true, outstanding: false, expenses: false, materials: false, schedule: false, roster: false });
  const [expenseForm, setExpenseForm] = useState({ date: todayIso(), category: "", amount: "", notes: "" });
  const toggle = (key) => setSections((s) => ({ ...s, [key]: !s[key] }));
  const anyPicked = Object.values(sections).some(Boolean);

  const inRange = (d) => d >= range.from && d <= range.to;
  const earn = (l, t) => resolveEarnings(l, data.students.find((s) => s.id === l.student_id), t, data.teacherRates, data.lessons, data.studentInstruments);
  const lessonsInRange = data.lessons.filter((l) => inRange(l.date));
  const attendedInRange = lessonsInRange.filter((l) => l.status === "attended");
  const totalRevenue = attendedInRange.reduce((sum, l) => sum + Number(l.price), 0);
  const pendingPayouts = data.teachers.reduce((sum, t) => sum + attendedInRange.filter((l) => l.teacher_id === t.id && !l.paid).reduce((s, l) => s + earn(l, t), 0), 0);
  const paidPayouts = data.teachers.reduce((sum, t) => sum + attendedInRange.filter((l) => l.teacher_id === t.id && l.paid).reduce((s, l) => s + earn(l, t), 0), 0);

  const expensesInRange = data.expenses.filter((e) => inRange(e.date));
  const expenseTotal = expensesInRange.reduce((sum, e) => sum + Number(e.amount), 0);
  const expenseByCategory = useMemo(() => {
    const m = {};
    expensesInRange.forEach((e) => { m[e.category] = (m[e.category] || 0) + Number(e.amount); });
    return Object.entries(m);
  }, [expensesInRange]);

  const outstandingRows = data.students.map((s) => {
    const value = data.lessons.filter((l) => l.student_id === s.id && inRange(l.date) && (l.status === "attended" || l.status === "scheduled")).reduce((sum, l) => sum + Number(l.price), 0);
    return { name: s.name, value };
  }).filter((r) => r.value > 0);

  const addExpense = async (e) => {
    e.preventDefault();
    await supabase.from("expenses").insert({ date: expenseForm.date, category: expenseForm.category, amount: Number(expenseForm.amount), notes: expenseForm.notes || null });
    setExpenseForm({ date: todayIso(), category: "", amount: "", notes: "" }); refresh();
  };
  const removeExpense = async (id) => { await supabase.from("expenses").delete().eq("id", id); refresh(); };

  return (
    <div>
      <Card style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Generate a report</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.inkSoft, marginBottom: 6 }}>Date range</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: COLORS.inkSoft }}>From</div>
            <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: COLORS.inkSoft }}>To</div>
            <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} style={inputStyle} />
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
            <Btn small onClick={() => setRange({ ...quickRange("month"), to: todayIso() })}>This month</Btn>
            <Btn small onClick={() => setRange(quickRange("lastMonth"))}>Last month</Btn>
            <Btn small onClick={() => setRange({ ...quickRange("year"), to: todayIso() })}>This year</Btn>
            <Btn small onClick={() => setRange(quickRange("all"))}>All time</Btn>
          </div>
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.inkSoft, marginBottom: 6 }}>Include in report</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 6, marginBottom: 14 }}>
          <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={sections.income} onChange={() => toggle("income")} /> Income summary</label>
          <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={sections.expenses} onChange={() => toggle("expenses")} /> Expenses by category</label>
          <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={sections.schedule} onChange={() => toggle("schedule")} /> Schedule / attendance log</label>
          <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={sections.outstanding} onChange={() => toggle("outstanding")} /> Lesson value by student</label>
          <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center", opacity: 0.5 }}><input type="checkbox" disabled /> Materials performance (not tracked yet)</label>
          <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={sections.roster} onChange={() => toggle("roster")} /> Student roster (current, not date-limited)</label>
        </div>
        <Btn variant="owner" disabled={!anyPicked} onClick={() => downloadDoc(reportPrintRef.current, `Business-Report-${range.from}-to-${range.to}`)}>Download PDF report</Btn>
        {!anyPicked && <div style={{ fontSize: 12, color: COLORS.danger, marginTop: 8 }}>Pick at least one section to include.</div>}
      </Card>

      {anyPicked && (
        <div style={{ border: "1px solid " + COLORS.border, borderRadius: 10, padding: 18, background: "#FCFBF8" }}>
        <div className="print-area" ref={reportPrintRef}>
          <DocHeader settings={data.settings} docType="BUSINESS REPORT" meta={[{ label: "Period", value: `${fmtDate(range.from)} to ${fmtDate(range.to)}` }, { label: "Generated", value: fmtDate(todayIso()) }]} />
          {sections.income && (
            <div style={{ marginBottom: 22 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Income summary</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 10 }}>
                <Card style={{ background: COLORS.successBg, border: "none" }}>
                  <div style={{ fontSize: 12, color: COLORS.successDark, fontWeight: 600 }}>Revenue</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.successDark }}>{fmtMoney(totalRevenue)}</div>
                </Card>
                <Card style={{ background: COLORS.amberBg, border: "none" }}>
                  <div style={{ fontSize: 12, color: COLORS.amberDark, fontWeight: 600 }}>Payouts pending</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.amberDark }}>{fmtMoney(pendingPayouts)}</div>
                </Card>
                <Card style={{ background: COLORS.ownerBg, border: "none" }}>
                  <div style={{ fontSize: 12, color: COLORS.ownerDark, fontWeight: 600 }}>Payouts paid</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.ownerDark }}>{fmtMoney(paidPayouts)}</div>
                </Card>
              </div>
              <div style={{ fontSize: 13, color: COLORS.inkSoft }}>{attendedInRange.length} attended lessons in range · {data.students.length} students on file</div>
            </div>
          )}

          {sections.expenses && (
            <div style={{ marginBottom: 22 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Expenses by category — total {fmtMoney(expenseTotal)}</div>
              <div style={{ border: "1px solid " + COLORS.border, borderRadius: 8, overflow: "hidden", marginBottom: 10 }}>
                {expenseByCategory.map(([cat, total], i) => (
                  <div key={cat} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", fontSize: 13, borderTop: i === 0 ? "none" : "1px solid " + COLORS.border }}>
                    <span>{cat}</span><span>{fmtMoney(total)}</span>
                  </div>
                ))}
                {expenseByCategory.length === 0 && <div style={{ padding: 12, fontSize: 13, color: COLORS.inkSoft }}>No expenses logged in this range.</div>}
              </div>
              <details>
                <summary style={{ fontSize: 12, color: COLORS.owner, cursor: "pointer", marginBottom: 8 }}>Log an expense</summary>
                <form onSubmit={addExpense} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginTop: 8 }}>
                  <div style={{ flex: "1 1 120px" }}><Field label="Date"><input type="date" required value={expenseForm.date} onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })} style={inputStyle} /></Field></div>
                  <div style={{ flex: "1 1 120px" }}><Field label="Category"><input required value={expenseForm.category} onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })} style={inputStyle} placeholder="e.g. Rent" /></Field></div>
                  <div style={{ flex: "1 1 100px" }}><Field label="Amount (RM)"><input type="number" required value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} style={inputStyle} /></Field></div>
                  <Btn small variant="owner" type="submit" style={{ marginBottom: 12 }}>Add</Btn>
                </form>
                {expensesInRange.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    {expensesInRange.map((e) => (
                      <div key={e.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "4px 0", color: COLORS.inkSoft }}>
                        <span>{fmtDate(e.date)} · {e.category}</span>
                        <span>{fmtMoney(e.amount)} <a href="#" onClick={(ev) => { ev.preventDefault(); removeExpense(e.id); }} style={{ color: COLORS.danger, marginLeft: 8 }}>Remove</a></span>
                      </div>
                    ))}
                  </div>
                )}
              </details>
            </div>
          )}

          {sections.schedule && (
            <div style={{ marginBottom: 22 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Schedule / Attendance Log</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid " + COLORS.border, textAlign: "left" }}>
                    <th style={{ padding: "6px 8px" }}>Date</th>
                    <th style={{ padding: "6px 8px" }}>Time</th>
                    <th style={{ padding: "6px 8px" }}>Student</th>
                    <th style={{ padding: "6px 8px" }}>Duration</th>
                    <th style={{ padding: "6px 8px" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {lessonsInRange.map((l) => (
                    <tr key={l.id} style={{ borderBottom: "1px solid " + COLORS.border }}>
                      <td style={{ padding: "6px 8px" }}>{l.date}</td>
                      <td style={{ padding: "6px 8px" }}>{l.time.slice(0, 5)}</td>
                      <td style={{ padding: "6px 8px" }}>{data.students.find((s) => s.id === l.student_id)?.name}</td>
                      <td style={{ padding: "6px 8px" }}>{l.duration_min || 30} min</td>
                      <td style={{ padding: "6px 8px" }}>{statusLabel(l.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {lessonsInRange.length === 0 && <div style={{ padding: 12, fontSize: 13, color: COLORS.inkSoft }}>No lessons in this range.</div>}
            </div>
          )}

          {sections.outstanding && (
            <div style={{ marginBottom: 22 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Lesson value by student (in range)</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid " + COLORS.border, textAlign: "left" }}>
                    <th style={{ padding: "6px 8px" }}>Student</th>
                    <th style={{ padding: "6px 8px" }}>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {outstandingRows.map((r) => (
                    <tr key={r.name} style={{ borderBottom: "1px solid " + COLORS.border }}>
                      <td style={{ padding: "6px 8px" }}>{r.name}</td>
                      <td style={{ padding: "6px 8px" }}>{fmtMoney(r.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {outstandingRows.length === 0 && <div style={{ padding: 12, fontSize: 13, color: COLORS.inkSoft }}>Nothing in this range.</div>}
              <div style={{ fontSize: 11, color: COLORS.inkSoft, marginTop: 6 }}>This is lesson value on the calendar, not a confirmed-received-payment record — student payment receipt isn't tracked separately from teacher payout yet.</div>
            </div>
          )}

          {sections.roster && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Student Roster</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid " + COLORS.border, textAlign: "left" }}>
                    <th style={{ padding: "6px 8px" }}>Name</th>
                    <th style={{ padding: "6px 8px" }}>Age</th>
                    <th style={{ padding: "6px 8px" }}>Category</th>
                    <th style={{ padding: "6px 8px" }}>Centre</th>
                    <th style={{ padding: "6px 8px" }}>Instruments</th>
                  </tr>
                </thead>
                <tbody>
                  {data.students.filter((s) => (s.status || "active") === "active").map((s) => {
                    const instruments = [];
                    if (s.course) instruments.push(`${s.course}${s.level ? ` (${s.level})` : ""} — ${s.billing_type === "per_month" ? `${fmtMoney(s.monthly_rate || 0)}/mo` : `${fmtMoney(s.price)}/lesson`}`);
                    data.studentInstruments.filter((si) => si.student_id === s.id).forEach((si) => {
                      instruments.push(`${si.course}${si.level ? ` (${si.level})` : ""} — ${si.billing_type === "per_month" ? `${fmtMoney(si.monthly_rate || 0)}/mo` : `${fmtMoney(si.price)}/lesson`}`);
                    });
                    return (
                      <tr key={s.id} style={{ borderBottom: "1px solid " + COLORS.border }}>
                        <td style={{ padding: "6px 8px" }}>{s.name}</td>
                        <td style={{ padding: "6px 8px" }}>{s.age || "-"}</td>
                        <td style={{ padding: "6px 8px" }}>{s.age_group === "adult" ? "Adult" : s.age_group === "child" ? "Child" : "-"}</td>
                        <td style={{ padding: "6px 8px" }}>{s.centre || "-"}</td>
                        <td style={{ padding: "6px 8px" }}>{instruments.length ? instruments.join("; ") : "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <DocFooter settings={data.settings} />
        </div>
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  const ok = useGuard("admin");
  const router = useRouter();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("calendar");

  const refresh = useCallback(async () => { setData(await loadAll()); }, []);
  useEffect(() => { if (ok) refresh(); }, [ok, refresh]);

  const signOut = async () => { await supabase.auth.signOut(); router.replace("/login"); };

  if (!ok || !data) return <div style={{ padding: 24, fontSize: 14, color: COLORS.inkSoft }}>Loading…</div>;

  const tabs = [
    { key: "calendar", label: "Calendar" }, { key: "teachers", label: "Teachers" },
    { key: "students", label: "Students" }, { key: "courses", label: "Courses" },
    { key: "materials", label: "Materials" },
    { key: "fees", label: "Invoices" }, { key: "payments", label: "Payments" },
    { key: "replacements", label: "Replacements" },
    { key: "reports", label: "Reports" }, { key: "health", label: "Health check" }, { key: "settings", label: "Settings" },
  ];

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "22px 18px", color: COLORS.ink }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "Fraunces, Georgia, serif", fontWeight: 700, fontSize: 24 }}>Play Studio Manager</div>
          <div style={{ fontSize: 13, color: COLORS.inkSoft }}>Main — full oversight</div>
        </div>
        <Btn small onClick={signOut}>Sign out</Btn>
      </div>
      <div style={{ marginBottom: 16 }}><SegTabs tabs={tabs} active={tab} onChange={setTab} accent={COLORS.owner} /></div>
      {tab === "calendar" && <CalendarTab data={data} refresh={refresh} />}
      {tab === "teachers" && <TeachersTab data={data} refresh={refresh} />}
      {tab === "students" && <StudentsTab data={data} refresh={refresh} />}
      {tab === "courses" && <CoursesCard data={data} refresh={refresh} />}
      {tab === "materials" && <MaterialsTab data={data} refresh={refresh} />}
      {tab === "fees" && <FeesTab data={data} refresh={refresh} />}
      {tab === "payments" && <PaymentsTab data={data} refresh={refresh} />}
      {tab === "replacements" && <ReplacementsTab data={data} refresh={refresh} />}
      {tab === "reports" && <ReportsTab data={data} refresh={refresh} />}
      {tab === "health" && <HealthTab data={data} />}
      {tab === "settings" && <SettingsTab data={data} refresh={refresh} />}
    </div>
  );
}
