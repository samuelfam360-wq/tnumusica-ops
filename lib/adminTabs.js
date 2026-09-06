"use client";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { supabase } from "./supabaseClient";
import {
  COLORS, Badge, Btn, Card, Field, Modal, SegTabs, inputStyle,
  fmtDate, fmtMoney, todayIso, addDays, isoDate, earningsForLesson, resolveEarnings, statusTone, statusLabel, lessonStatusLabel,
  addMinutes, isoMonthDays, WEEKDAY_LABELS, findClashes, findWeeklyInstrumentClashes, studentBalance, studentOwed, effectiveLessonPrice,
  downloadDoc, generateDocPdf, studentInvoiceSummary, SearchableSelect, summarizeBookOrderItems, fetchAllRows, isLessonDelivered, summarizeTeaching, lessonPayLabel, rootLessonFor,
} from "./ui";

// ============================================================================
// SHARED ADMIN/STAFF TABS
// ============================================================================
// This file holds the tabs that BOTH the Master admin app (app/admin/page.js)
// and the Staff portal (app/teacher/page.js, for role:"staff" logins) render:
// Calendar, Teachers, Students, Courses, and Replacements — plus everything
// those five depend on (modals, helper functions, shared constants).
//
// This exists as a single shared file on purpose: Staff needs the *same*
// functionality as Master for these five areas, not a simplified lookalike.
// A fix or feature added here shows up in both places automatically, instead
// of needing to be built twice and inevitably drifting out of sync.
//
// loadAll() here fetches the full, unscoped dataset — same as Master sees.
// Staff gets the same visibility into this data as Master; the only real
// restriction is which tabs each app's navigation exposes (see the two page
// files) — not anything enforced by this file or the database (see
// schema_v37.sql's comment on that tradeoff).

// ==== extracted lines 13-26 ====
const WEEKDAYS = WEEKDAY_LABELS;
const DAY_OPTIONS = [
  { value: 0, label: "Sunday" }, { value: 1, label: "Monday" }, { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" }, { value: 4, label: "Thursday" }, { value: 5, label: "Friday" }, { value: 6, label: "Saturday" },
];

// Monthly fees are due by the 7th. For an invoice tied to a specific billing
// month ("2026-08"), that's simply that month's 7th. For a one-off invoice
// (manual, or a book given to a student) with no billing month, use the 7th
// of the month after it was raised, so there's always at least a few days.
// Pure lesson-row builder shared by every place that needs to (re)generate a
// weekly series from a day/time — the student series form, the "move to new
// schedule" flow, and the Health Check schedule-mismatch fixer. Keeping this
// in one place means all three always agree on how a series is laid out.

// ==== extracted lines 27-49 ====
function buildLessonSeriesRows({ holidays, studentId, teacherId, price, duration, permanentDay, time, forHowLong, unit, instrument, room, startDate }) {
  if (permanentDay === "" || permanentDay == null || !time) return [];
  const weeks = unit === "months" ? Math.round((Number(forHowLong) * 30) / 7) : Number(forHowLong);
  const targetDay = Number(permanentDay);
  let firstDate = startDate ? new Date(startDate + "T00:00:00") : new Date();
  const diff = (targetDay - firstDate.getDay() + 7) % 7;
  firstDate.setDate(firstDate.getDate() + diff);
  const holidaySet = new Set((holidays || []).map((h) => h.date));
  const rows = [];
  let iso = isoDate(firstDate);
  for (let i = 0; i < weeks; i++) {
    if (!holidaySet.has(iso)) {
      rows.push({
        date: iso, time, teacher_id: teacherId || null, student_id: studentId,
        price: Number(price), duration_min: Number(duration), status: "scheduled",
        instrument: instrument || null, room: room || null,
      });
    }
    iso = addDays(iso, 7);
  }
  return rows;
}


// ==== extracted lines 63-84 ====
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


// ==== extracted lines 162-193 ====
async function loadAll() {
  const [t, s, l, b, h, r, p, st, c, ex, cl, sp, inv, invItems, si, bi, bo, boi, staffProf] = await Promise.all([
    supabase.from("teachers").select("*").order("name"),
    supabase.from("students").select("*").order("name"),
    fetchAllRows(supabase.from("lessons").select("*").order("date").order("time")),
    supabase.from("blocked_dates").select("*").order("date"),
    supabase.from("holidays").select("*").order("date"),
    supabase.from("teacher_rates").select("*"),
    supabase.from("lesson_plans").select("*").order("date"),
    supabase.from("studio_settings").select("*").eq("id", 1).maybeSingle(),
    supabase.from("courses").select("*").order("name"),
    fetchAllRows(supabase.from("expenses").select("*").order("date")),
    supabase.from("course_levels").select("*").order("sort_order"),
    fetchAllRows(supabase.from("student_payments").select("*").order("date")),
    fetchAllRows(supabase.from("invoices").select("*").order("invoice_no", { ascending: false })),
    fetchAllRows(supabase.from("invoice_items").select("*").order("sort_order")),
    supabase.from("student_instruments").select("*").order("created_at"),
    supabase.from("book_items").select("*").order("name"),
    fetchAllRows(supabase.from("book_orders").select("*").order("created_at", { ascending: false })),
    fetchAllRows(supabase.from("book_order_items").select("*").order("created_at")),
    supabase.from("profiles").select("*").eq("role", "staff"),
  ]);
  return {
    teachers: t.data || [], students: s.data || [], lessons: l.data || [], blockedDates: b.data || [],
    holidays: h.data || [], teacherRates: r.data || [], lessonPlans: p.data || [], settings: st.data || {},
    courses: c.data || [], expenses: ex.data || [], courseLevels: cl.data || [], studentPayments: sp.data || [],
    invoices: inv.data || [], invoiceItems: invItems.data || [], studentInstruments: si.data || [],
    bookItems: bi.data || [], bookOrders: bo.data || [], bookOrderItems: boi.data || [],
    staffProfiles: staffProf.data || [],
  };
}


// ==== extracted lines 194-201 ====
const TEACHER_COLOR_PALETTE = ["#0F6E56", "#8A4B08", "#4C3D8F", "#A02B5A", "#1E6091", "#7A5C00", "#B0413E", "#2E7D32"];
function colorForTeacher(id) {
  if (!id) return "#8A8474";
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return TEACHER_COLOR_PALETTE[hash % TEACHER_COLOR_PALETTE.length];
}


// ==== extracted lines 202-538 ====
function DayModal({ date, data, refresh, onClose }) {
  const [holidayReason, setHolidayReason] = useState("");
  const [daySearch, setDaySearch] = useState("");
  const [absentModalId, setAbsentModalId] = useState(null);
  const [absentReason, setAbsentReason] = useState("");
  const [reschedLesson, setReschedLesson] = useState(null);
  const [openSlotFor, setOpenSlotFor] = useState(null);
  const teacherName = (id) => data.teachers.find((t) => t.id === id)?.name || "Unassigned";
  const studentName = (id) => data.students.find((s) => s.id === id)?.name || "—";
  const allLessons = data.lessons.filter((l) => l.date === date).sort((a, b) => a.time.localeCompare(b.time));
  const lessons = daySearch.trim()
    ? allLessons.filter((l) => {
        const q = daySearch.trim().toLowerCase();
        return studentName(l.student_id).toLowerCase().includes(q) || teacherName(l.teacher_id).toLowerCase().includes(q);
      })
    : allLessons;
  const holiday = data.holidays.find((h) => h.date === date);
  const blockedTeachersToday = data.blockedDates.filter((b) => b.date === date);

  const markDone = async (id) => { await supabase.from("lessons").update({ status: "attended" }).eq("id", id); refresh(); };
  const undo = async (id) => { await supabase.from("lessons").update({ status: "scheduled" }).eq("id", id); refresh(); };
  const remove = async (id) => { await supabase.from("lessons").delete().eq("id", id); refresh(); };
  const markHoliday = async () => {
    const reason = holidayReason || "Public holiday";
    await supabase.from("holidays").insert({ date, reason: holidayReason || null });
    // Auto-cancel whatever's still sitting on this date as "scheduled" — a
    // holiday is a planned studio-wide closure, not a missed lesson, so it
    // needs no replacement and (via the normal "cancelled" rule) no payment
    // either. The reason is stored on each lesson so un-marking the holiday
    // later can find and revert exactly these, and no others.
    const toCancel = allLessons.filter((l) => l.status === "scheduled");
    if (toCancel.length) await supabase.from("lessons").update({ status: "cancelled", reason }).in("id", toCancel.map((l) => l.id));
    refresh();
  };
  const unmarkHoliday = async () => {
    const reason = holiday?.reason || "Public holiday";
    await supabase.from("holidays").delete().eq("date", date);
    // Only restores lessons this exact holiday cancelled (matched by reason)
    // and only if they're still untouched since — never one that's already
    // moved on to something else (attended, reassigned, etc).
    const toRestore = allLessons.filter((l) => l.status === "cancelled" && l.reason === reason);
    if (toRestore.length) await supabase.from("lessons").update({ status: "scheduled", reason: null }).in("id", toRestore.map((l) => l.id));
    refresh();
  };
  const confirmAbsent = async (id) => {
    await supabase.from("lessons").update({ status: "absent", reason: absentReason || null }).eq("id", id);
    setAbsentModalId(null); setAbsentReason(""); refresh();
  };
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
  // Reverts a reschedule: deletes the replacement slot(s) it created and puts
  // the original back to "missed-teacher" (its state right before Reschedule
  // was used) — not "scheduled", since the underlying problem (teacher was
  // unavailable) is still true and still needs a replacement arranged.
  // Refuses if any replacement has already progressed past "scheduled" (e.g.
  // already taught) — undoing at that point would erase real history rather
  // than just undo a scheduling choice.
  const undoReschedule = async (originalId) => {
    const replacements = data.lessons.filter((r) => r.replacement_of === originalId);
    if (!replacements.length || !replacements.every((r) => r.status === "scheduled")) return;
    await supabase.from("lessons").delete().in("id", replacements.map((r) => r.id));
    await supabase.from("lessons").update({ status: "missed-teacher" }).eq("id", originalId);
    refresh();
  };

  return (
    <Modal title={fmtDate(date)} onClose={onClose} maxWidth={980}>
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

      {blockedTeachersToday.length > 0 && (
        <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 6 }}>
          {blockedTeachersToday.map((b) => (
            <div key={b.id} style={{ padding: "8px 12px", background: COLORS.amberBg, borderRadius: 8, fontSize: 13, color: COLORS.amberDark }}>
              <strong>{teacherName(b.teacher_id)}</strong> is unavailable today{b.reason ? ` — ${b.reason}` : ""}
            </div>
          ))}
        </div>
      )}

      {allLessons.length > 3 && (
        <input value={daySearch} onChange={(e) => setDaySearch(e.target.value)} placeholder="Search by student or teacher" style={{ ...inputStyle, marginBottom: 16, position: "sticky", top: 0, zIndex: 5, boxShadow: "0 2px 6px rgba(0,0,0,0.06)" }} />
      )}

      {lessons.length > 0 && (() => {
        const teacherIds = [...new Set(lessons.map((l) => l.teacher_id || "unassigned"))]
          .sort((a, b) => teacherName(a === "unassigned" ? null : a).localeCompare(teacherName(b === "unassigned" ? null : b)));
        // Real 15-min-stepped timetable (not just times someone happens to
        // start at) — spanning from the earliest lesson to the latest
        // lesson's actual end, so a 30/45/60-min lesson can visually cover
        // the rows it really occupies instead of looking identical to a
        // 15-min one.
        const toMinutes = (t) => { const [h, m] = t.slice(0, 5).split(":").map(Number); return h * 60 + m; };
        const toTimeStr = (mins) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
        const minStart = Math.min(...lessons.map((l) => toMinutes(l.time)));
        const maxEnd = Math.max(...lessons.map((l) => toMinutes(l.time) + (l.duration_min || 30)));
        const times = [];
        for (let m = minStart; m < maxEnd; m += 15) times.push(toTimeStr(m));

        // For each column, tracks the clock-minute its current lesson block
        // spans through — any row before that minute gets no <td> at all
        // for that teacher, since the earlier row's cell already extends
        // down over it via rowSpan.
        const coveredUntil = {};
        const rows = times.map((t) => {
          const tMin = toMinutes(t);
          const cells = {};
          teacherIds.forEach((tid) => {
            if (coveredUntil[tid] > tMin) { cells[tid] = null; return; }
            const l = lessons.find((x) => (x.teacher_id || "unassigned") === tid && x.time.slice(0, 5) === t);
            if (l) {
              const span = Math.max(1, Math.ceil((l.duration_min || 30) / 15));
              coveredUntil[tid] = tMin + span * 15;
              cells[tid] = { lesson: l, span };
            } else {
              cells[tid] = { lesson: null, span: 1 };
            }
          });
          return { time: t, cells };
        });

        return (
          <div style={{ overflowX: "auto", marginBottom: 18, border: "1px solid " + COLORS.border, borderRadius: 10 }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 11.5, minWidth: 120 + teacherIds.length * 130 }}>
              <thead>
                <tr style={{ background: "#F8F6F1" }}>
                  <th style={{ position: "sticky", left: 0, background: "#F8F6F1", padding: "6px 8px", textAlign: "left", fontWeight: 700, color: COLORS.inkSoft, borderBottom: "1.5px solid " + COLORS.border, minWidth: 80 }}>Time</th>
                  {teacherIds.map((tid) => (
                    <th key={tid} style={{ padding: "6px 8px", textAlign: "left", fontWeight: 700, color: colorForTeacher(tid === "unassigned" ? null : tid), borderBottom: "1.5px solid " + COLORS.border, borderLeft: "1px solid " + COLORS.border, minWidth: 128 }}>
                      {teacherName(tid === "unassigned" ? null : tid)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ time: t, cells }) => {
                  const room = lessons.find((l) => l.time.slice(0, 5) === t && l.room)?.room;
                  return (
                    <tr key={t} style={{ borderTop: "1px solid " + COLORS.border }}>
                      <td style={{ position: "sticky", left: 0, background: "#fff", padding: "4px 8px", fontWeight: 600, verticalAlign: "top", whiteSpace: "nowrap", lineHeight: 1.3 }}>
                        {t}
                        {room && <div style={{ fontWeight: 400, color: COLORS.inkSoft, fontSize: 10.5 }}>{room}</div>}
                      </td>
                      {teacherIds.map((tid) => {
                        const cell = cells[tid];
                        if (cell === null) return null;
                        const l = cell.lesson;
                        return (
                          <td key={tid} rowSpan={cell.span} style={{ padding: "4px 8px", borderLeft: "1px solid " + COLORS.border, verticalAlign: "top", lineHeight: 1.3 }}>
                            {l ? (
                              <div>
                                <div style={{ fontWeight: 600 }}>{studentName(l.student_id)}</div>
                                <div style={{ color: COLORS.inkSoft, fontSize: 10.5 }}>{l.instrument || "—"} · {l.duration_min || 30} min · {fmtMoney(l.price)}</div>
                                <Badge tone={statusTone(l.status)}>{lessonStatusLabel(l)}</Badge>
                                {l.status === "rescheduled" && (() => {
                                  const r = data.lessons.find((x) => x.replacement_of === l.id);
                                  return r ? <div style={{ color: COLORS.inkSoft, fontSize: 10, marginTop: 2 }}>→ {fmtDate(r.date)} {r.time.slice(0, 5)}</div> : null;
                                })()}
                                {l.replacement_of && (() => {
                                  const o = data.lessons.find((x) => x.id === l.replacement_of);
                                  return o ? <div style={{ color: COLORS.owner, fontSize: 10, marginTop: 2 }}>Replacing {fmtDate(o.date)} {o.time.slice(0, 5)}</div> : null;
                                })()}
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

      <div style={{ display: "flex", flexDirection: "column", gap: 8, ...(holiday ? { background: "rgba(199, 68, 64, 0.06)", borderRadius: 10, padding: "8px 10px" } : {}) }}>
        {lessons.map((l) => {
          const originalForReplacement = l.replacement_of ? data.lessons.find((o) => o.id === l.replacement_of) : null;
          return (
          <div key={l.id} style={{ padding: "10px 0", borderTop: "1px solid " + COLORS.border }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
              <div style={{ fontSize: 13 }}>
                <strong>{l.time.slice(0, 5)}–{addMinutes(l.time, l.duration_min || 30)}</strong> {studentName(l.student_id)}
                <div style={{ color: COLORS.inkSoft, fontSize: 12 }}>
                  {l.duration_min || 30} min · <span style={{ color: colorForTeacher(l.teacher_id), fontWeight: 600 }}>{teacherName(l.teacher_id)}</span> · {fmtMoney(l.price)}
                  {l.instrument ? ` · ${l.instrument}` : ""}{l.room ? ` · ${l.room}` : ""}
                </div>
                {originalForReplacement && (
                  <div style={{ color: COLORS.owner, fontSize: 11.5, marginTop: 2 }}>Replacing {fmtDate(originalForReplacement.date)} {originalForReplacement.time.slice(0, 5)}</div>
                )}
              </div>
              <Badge tone={statusTone(l.status)}>{lessonStatusLabel(l)}</Badge>
            </div>
            {l.reason && l.status !== "scheduled" && <div style={{ color: COLORS.inkSoft, fontSize: 12, marginTop: 4 }}>{l.reason}</div>}

            {l.status === "scheduled" && (
              <div style={{ display: "flex", gap: 10, marginTop: 6, fontSize: 12, flexWrap: "wrap" }}>
                <a href="#" onClick={(e) => { e.preventDefault(); markDone(l.id); }} style={{ color: COLORS.owner }}>Mark done</a>
                <a href="#" onClick={(e) => { e.preventDefault(); setAbsentModalId(l.id); setAbsentReason(""); }} style={{ color: COLORS.danger }}>Absent</a>
                <a href="#" onClick={(e) => { e.preventDefault(); remove(l.id); }} style={{ color: COLORS.danger }}>Remove</a>
              </div>
            )}
            {absentModalId === l.id && (
              <div style={{ marginTop: 8, padding: 10, border: "1px solid " + COLORS.border, borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 8 }}>What happened?</div>
                <input value={absentReason} onChange={(e) => setAbsentReason(e.target.value)} style={{ ...inputStyle, marginBottom: 8 }} placeholder="Reason (e.g. student sick, teacher unwell)" />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Btn small variant="danger" onClick={() => confirmAbsent(l.id)}>Confirm absent — decide later</Btn>
                  <Btn small onClick={() => setAbsentModalId(null)}>Cancel</Btn>
                </div>
              </div>
            )}

            {l.status === "absent" && (
              <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                <Btn small variant="owner" onClick={() => decide(l.id, true)}>Replaceable</Btn>
                <Btn small onClick={() => decide(l.id, false)}>Not replaceable</Btn>
                <Btn small onClick={() => undo(l.id)}>Undo</Btn>
              </div>
            )}

            {l.status === "missed-teacher" && (() => {
              const replacements = data.lessons.filter((r) => r.replacement_of === l.id);
              const arrangedMin = replacements.reduce((sum, r) => sum + (r.duration_min || 0), 0);
              const remainingMin = Math.max(0, (l.duration_min || 30) - arrangedMin);
              return (
                <div style={{ marginTop: 6 }}>
                  {l.suggested_date && l.suggested_time && (
                    <div style={{ fontSize: 12, color: COLORS.owner, marginBottom: 6 }}>
                      Teacher suggested {fmtDate(l.suggested_date)} · {l.suggested_time.slice(0, 5)}{l.suggested_note ? ` — ${l.suggested_note}` : ""}
                    </div>
                  )}
                  {replacements.length > 0 && (
                    <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 6 }}>
                      Already arranged: {replacements.map((r) => `${fmtDate(r.date)} ${r.time.slice(0, 5)} (${r.duration_min} min)`).join(", ")} — {arrangedMin} of {l.duration_min || 30} min covered
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Btn small variant="owner" onClick={() => setReschedLesson(l)}>
                      {replacements.length > 0 ? `Arrange remaining ${remainingMin} min` : "Arrange replacement"}
                    </Btn>
                    <Btn small onClick={() => requestCover(l.id, l.reason)}>Open for cover instead</Btn>
                    <Btn small onClick={() => undoDecide(l.id)}>Undo</Btn>
                  </div>
                </div>
              );
            })()}

            {l.status === "missed-student" && (
              <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                <Btn small onClick={() => undoDecide(l.id)}>Undo</Btn>
              </div>
            )}

            {l.status === "needs-cover" && (
              <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
                <select onChange={(e) => assignCover(l.id, e.target.value)} defaultValue="" style={{ ...inputStyle, width: "auto", padding: "5px 8px", fontSize: 13 }}>
                  <option value="" disabled>Assign to…</option>
                  {data.teachers.filter((t) => t.id !== l.teacher_id).map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
                </select>
                <Btn small onClick={() => undoCoverRequest(l.id)}>Undo</Btn>
              </div>
            )}

            {["attended", "cancelled"].includes(l.status) && (
              <div style={{ display: "flex", gap: 10, marginTop: 6, fontSize: 12, flexWrap: "wrap" }}>
                {l.status === "cancelled" && holiday && l.reason === (holiday.reason || "Public holiday") ? (
                  <a href="#" onClick={(e) => { e.preventDefault(); setOpenSlotFor(l); }} style={{ color: COLORS.inkSoft }}>Open for replacement</a>
                ) : (
                  <a href="#" onClick={(e) => { e.preventDefault(); undo(l.id); }} style={{ color: COLORS.inkSoft }}>Undo</a>
                )}
                <a href="#" onClick={(e) => { e.preventDefault(); remove(l.id); }} style={{ color: COLORS.danger }}>Remove</a>
              </div>
            )}

            {l.status === "scheduled" && l.replacement_of && (
              <div style={{ display: "flex", gap: 10, marginTop: 4, fontSize: 12 }}>
                <a href="#" onClick={(e) => { e.preventDefault(); undoReschedule(l.replacement_of); }} style={{ color: COLORS.inkSoft }}>Undo this replacement</a>
              </div>
            )}

            {l.status === "rescheduled" && (() => {
              const replacements = data.lessons.filter((r) => r.replacement_of === l.id);
              const canUndo = replacements.length > 0 && replacements.every((r) => r.status === "scheduled");
              const arrangedMin = replacements.reduce((sum, r) => sum + (r.duration_min || 0), 0);
              const remainingMin = Math.max(0, (l.duration_min || 30) - arrangedMin);
              return (
                <div style={{ marginTop: 6 }}>
                  <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 6 }}>
                    {replacements.length > 0
                      ? `Rescheduled to ${replacements.map((r) => `${fmtDate(r.date)} ${r.time.slice(0, 5)} (${r.duration_min} min)`).join(", ")}`
                      : "Rescheduled — the replacement slot can't be found (it may have been removed separately)."}
                  </div>
                  {remainingMin > 0 && (
                    <div style={{ fontSize: 12, color: COLORS.amberDark, marginBottom: 6 }}>Only {arrangedMin} of {l.duration_min || 30} min arranged — {remainingMin} min still owed.</div>
                  )}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    {remainingMin > 0 && <Btn small variant="owner" onClick={() => setReschedLesson(l)}>Arrange remaining {remainingMin} min</Btn>}
                    <Btn small disabled={!canUndo} onClick={() => undoReschedule(l.id)}>Undo</Btn>
                    {replacements.length > 0 && !canUndo && (
                      <span style={{ fontSize: 11.5, color: COLORS.inkSoft }}>Can't undo — the replacement is already {statusLabel(replacements[0].status).toLowerCase()}.</span>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
          );
        })}
        {lessons.length === 0 && <div style={{ fontSize: 13, color: COLORS.inkSoft }}>{daySearch ? `No lessons match "${daySearch}".` : "No lessons on this day."}</div>}
      </div>
      {reschedLesson && <RescheduleModal lesson={reschedLesson} data={data} refresh={refresh} onClose={() => setReschedLesson(null)} />}
      {openSlotFor && <OpenSlotModal slot={openSlotFor} data={data} refresh={refresh} onClose={() => setOpenSlotFor(null)} onRestore={() => { undo(openSlotFor.id); setOpenSlotFor(null); }} />}
    </Modal>
  );
}


// ==== extracted lines 539-637 ====
function RescheduleModal({ lesson, data, refresh, onClose }) {
  const studentName = data.students.find((s) => s.id === lesson.student_id)?.name || "—";
  const teacherName = data.teachers.find((t) => t.id === lesson.teacher_id)?.name || "Unassigned";
  // Any replacement rows already arranged for this exact missed lesson —
  // whether from a previous visit to this modal or (for older data) from
  // before this modal tracked partial coverage at all.
  const existingReplacements = data.lessons.filter((r) => r.replacement_of === lesson.id);
  const alreadyArrangedMin = existingReplacements.reduce((sum, r) => sum + (r.duration_min || 0), 0);
  const remainingMin = Math.max(0, (lesson.duration_min || 30) - alreadyArrangedMin);
  const [slots, setSlots] = useState([{ date: lesson.suggested_date || todayIso(), time: lesson.suggested_time ? lesson.suggested_time.slice(0, 5) : "15:00", duration: remainingMin || lesson.duration_min || 30, teacherId: lesson.teacher_id || "" }]);

  const updateSlot = (i, patch) => setSlots((s) => s.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const addSlot = () => setSlots((s) => [...s, { date: todayIso(), time: "15:00", duration: 15, teacherId: lesson.teacher_id || "" }]);
  const removeSlot = (i) => setSlots((s) => s.filter((_, idx) => idx !== i));

  const clashFor = (slot) => data.lessons.some((l) => l.id !== lesson.id && l.teacher_id === slot.teacherId && l.date === slot.date && l.time.slice(0, 5) === slot.time && l.status !== "rescheduled");

  const newMin = slots.reduce((sum, s) => sum + (Number(s.duration) || 0), 0);
  const totalAfter = alreadyArrangedMin + newMin;
  const stillOwedAfter = Math.max(0, (lesson.duration_min || 30) - totalAfter);

  const confirm = async () => {
    // Only counts as fully resolved once arranged time (old + new) covers
    // the original's full duration — otherwise it stays "missed-teacher" so
    // it's still visible and actionable for whatever time is still owed,
    // instead of silently being treated as done.
    const finalStatus = stillOwedAfter > 0 ? "missed-teacher" : "rescheduled";
    await supabase.from("lessons").update({ status: finalStatus }).eq("id", lesson.id);
    const rows = slots.map((s) => ({
      date: s.date, time: s.time, teacher_id: s.teacherId || lesson.teacher_id, student_id: lesson.student_id,
      // Inherits the original's price rather than hardcoding 0: for
      // per-month students it's recomputed dynamically anyway, but a
      // per-lesson student's payout is read straight off this field, so a
      // covering teacher needs the real figure here to get paid correctly.
      price: lesson.price, duration_min: Number(s.duration), status: "scheduled", replacement_of: lesson.id,
      instrument: lesson.instrument || null, room: lesson.room || null,
    }));
    await supabase.from("lessons").insert(rows);
    refresh(); onClose();
  };

  return (
    <Modal title={`Reschedule ${studentName}'s lesson`} onClose={onClose}>
      <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 14 }}>Teacher: <strong>{teacherName}</strong> · {lesson.status === "cancelled" ? "Holiday-cancelled lesson was" : "Missed lesson was"} {lesson.duration_min || 30} min</div>
      {existingReplacements.length > 0 && (
        <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 10, padding: "8px 10px", background: COLORS.card, border: "1px solid " + COLORS.border, borderRadius: 8 }}>
          Already arranged: {existingReplacements.map((r) => `${fmtDate(r.date)} ${r.time.slice(0, 5)} (${r.duration_min} min)`).join(", ")} — {remainingMin} min still owed.
        </div>
      )}
      {lesson.suggested_date && lesson.suggested_time && (
        <div style={{ fontSize: 12, color: COLORS.owner, marginBottom: 10, padding: "8px 10px", background: COLORS.ownerBg, borderRadius: 8 }}>
          Teacher suggested {fmtDate(lesson.suggested_date)} · {lesson.suggested_time.slice(0, 5)}{lesson.suggested_note ? ` — ${lesson.suggested_note}` : ""}. Pre-filled below — confirm with the student before saving.
        </div>
      )}      <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 10 }}>Usually one replacement slot covering all {remainingMin} remaining minute{remainingMin === 1 ? "" : "s"}. If splitting across shorter makeup times — now or later, doesn't have to be all at once — add another below, or just cover part of it now and come back for the rest.</div>
      {slots.map((slot, i) => (
        <div key={i} style={{ border: "1px solid " + COLORS.border, borderRadius: 8, padding: 12, marginBottom: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="New date"><input type="date" value={slot.date} onChange={(e) => updateSlot(i, { date: e.target.value })} style={inputStyle} /></Field>
            <Field label="New time"><input type="time" value={slot.time} onChange={(e) => updateSlot(i, { time: e.target.value })} style={inputStyle} /></Field>
          </div>
          <Field label="Duration (min)"><input type="number" value={slot.duration} onChange={(e) => updateSlot(i, { duration: e.target.value })} style={inputStyle} /></Field>
          <Field label="Covered by">
            <select value={slot.teacherId} onChange={(e) => updateSlot(i, { teacherId: e.target.value })} style={inputStyle}>
              <option value="">Unassigned</option>
              {data.teachers.map((t) => (<option key={t.id} value={t.id}>{t.name}{t.id === lesson.teacher_id ? " (original)" : ""}</option>))}
            </select>
          </Field>
          {slot.teacherId && slot.teacherId !== lesson.teacher_id && (
            <div style={{ fontSize: 12, color: COLORS.owner, marginBottom: 4 }}>A different teacher from the original — this slot's pay goes to them, not {teacherName}.</div>
          )}
          {clashFor(slot) && <div style={{ fontSize: 12, color: COLORS.danger, marginBottom: 4 }}>Clashes with another lesson for this teacher at that time.</div>}
          {data.holidays.find((h) => h.date === slot.date) && (
            <div style={{ fontSize: 12, color: COLORS.amberDark, marginBottom: 4 }}>
              {fmtDate(slot.date)} is a public holiday ({data.holidays.find((h) => h.date === slot.date).reason}) — only continue if {teacherName} is actually available that day.
            </div>
          )}
          {slots.length > 1 && <a href="#" onClick={(e) => { e.preventDefault(); removeSlot(i); }} style={{ fontSize: 12, color: COLORS.danger }}>Remove this slot</a>}
        </div>
      ))}
      <a href="#" onClick={(e) => { e.preventDefault(); addSlot(); }} style={{ fontSize: 13, color: COLORS.owner, display: "block", marginBottom: 10 }}>+ Add another replacement slot</a>
      {stillOwedAfter > 0 ? (
        <div style={{ fontSize: 12, color: COLORS.amberDark, marginBottom: 10 }}>This covers {newMin} of the {remainingMin} remaining minute(s) — {stillOwedAfter} min will still be owed after saving, and you'll be able to arrange it separately later.</div>
      ) : (
        <div style={{ fontSize: 12, color: COLORS.successDark, marginBottom: 10 }}>This fully covers the missed lesson.</div>
      )}
      <Btn variant="owner" style={{ width: "100%" }} onClick={confirm}>Confirm reschedule</Btn>
    </Modal>
  );
}

// Turns a freed-up slot (currently a holiday-cancelled lesson) into a
// general opening: either hand it back to the student it originally
// belonged to, or use it to satisfy a completely different missed-teacher
// lesson — from any date, past or future — since a teacher volunteering to
// work on a day off is just as useful for clearing an old backlog item as
// for their own cancelled lesson. Filling it with a different lesson reuses
// the exact same partial-coverage math as the normal Reschedule flow, and
// the original cancelled row is left alone as history (nothing to double-
// book against, since a cancelled lesson never counts as a clash).

// ==== extracted lines 638-722 ====
function OpenSlotModal({ slot, data, refresh, onClose, onRestore }) {
  const teacherName = data.teachers.find((t) => t.id === slot.teacher_id)?.name || "Unassigned";
  const studentName = (id) => data.students.find((s) => s.id === id)?.name || "—";
  const owedByThisTeacher = data.lessons.filter((l) => l.status === "missed-teacher" && l.teacher_id === slot.teacher_id);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState({ date: slot.date, time: slot.time.slice(0, 5), duration: slot.duration_min || 30 });
  const chosen = owedByThisTeacher.find((l) => l.id === selectedId);

  const existingReplacements = chosen ? data.lessons.filter((r) => r.replacement_of === chosen.id) : [];
  const alreadyArrangedMin = existingReplacements.reduce((sum, r) => sum + (r.duration_min || 0), 0);
  const remainingMin = chosen ? Math.max(0, (chosen.duration_min || 30) - alreadyArrangedMin) : 0;
  const newMin = Number(form.duration) || 0;
  const stillOwedAfter = Math.max(0, remainingMin - newMin);

  const fillSlot = async () => {
    if (!chosen) return;
    const finalStatus = stillOwedAfter > 0 ? "missed-teacher" : "rescheduled";
    await supabase.from("lessons").update({ status: finalStatus }).eq("id", chosen.id);
    await supabase.from("lessons").insert({
      date: form.date, time: form.time, teacher_id: slot.teacher_id, student_id: chosen.student_id,
      price: chosen.price, duration_min: Number(form.duration), status: "scheduled", replacement_of: chosen.id,
      instrument: chosen.instrument || null, room: chosen.room || null,
    });
    // The old cancelled placeholder this slot came from is now spoken for —
    // leaving it sitting there next to the new replacement made it look like
    // nothing had happened and invited someone to fill the same slot twice.
    await supabase.from("lessons").delete().eq("id", slot.id);
    refresh(); onClose();
  };

  return (
    <Modal title="Open this slot" onClose={onClose}>
      <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 14 }}>
        {fmtDate(slot.date)} {slot.time.slice(0, 5)} · <strong>{teacherName}</strong> · originally {studentName(slot.student_id)}'s {slot.instrument || "lesson"}
      </div>

      <div style={{ padding: 12, border: "1px solid " + COLORS.border, borderRadius: 8, marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Restore {studentName(slot.student_id)}'s own lesson</div>
        <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 10 }}>Puts this exact lesson back on the calendar, as if the holiday never cancelled it.</div>
        <Btn small variant="owner" onClick={onRestore}>Restore this lesson</Btn>
      </div>

      <div style={{ padding: 12, border: "1px solid " + COLORS.border, borderRadius: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Or use it for a different missed lesson</div>
        <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 10 }}>Any lesson {teacherName} still owes a replacement for — from any date, past or future.</div>
        {owedByThisTeacher.length === 0 ? (
          <div style={{ fontSize: 12.5, color: COLORS.inkSoft }}>{teacherName} doesn't have any other lessons waiting on a replacement right now.</div>
        ) : (
          <>
            <SearchableSelect
              options={owedByThisTeacher.map((l) => ({ value: l.id, label: `${fmtDate(l.date)} — ${studentName(l.student_id)}${l.instrument ? ` (${l.instrument})` : ""}` }))}
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


// Rather than bolting a "trial" flag onto the full student-enrollment flow,
// this creates a lightweight student record (is_trial: true) and a single
// lesson tied to it — same underlying tables everything else already uses,
// so it shows up on the calendar and can be marked attended normally, but
// it never enters the weekly recurring-schedule machinery (no permanent
// day/time is set on it).

// ==== extracted lines 723-815 ====
function TrialLessonModal({ data, refresh, onClose }) {
  const [form, setForm] = useState({
    name: "", course: "", levelId: "", ageGroup: "child", teacherId: "", date: todayIso(), time: "15:00", duration: 30, price: "", room: "",
  });
  const levelsForCourse = data.courseLevels.filter((l) => l.course_id === data.courses.find((c) => c.name === form.course)?.id);
  const selectedLevel = levelsForCourse.find((l) => l.id === form.levelId);

  // Trial rate = that grade's monthly rate ÷ 4 — same logic as the rest of
  // the app already uses to think about "roughly one lesson's worth" of a
  // monthly fee, so there's no separate trial rate to remember to keep in
  // sync. Rounded to 2dp since a quarter of an odd monthly figure won't
  // always land on a clean number.
  useEffect(() => {
    if (!selectedLevel) return;
    const monthly = form.ageGroup === "adult" ? selectedLevel.default_price_adult : selectedLevel.default_price_child;
    if (monthly != null) setForm((f) => ({ ...f, price: Math.round((Number(monthly) / 4) * 100) / 100 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.levelId, form.ageGroup]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const { data: student, error } = await supabase.from("students").insert({
      name: form.name.trim(), is_trial: true, status: "active",
      course: form.course || null, level: selectedLevel?.name || null, age_group: form.ageGroup,
      billing_type: "per_lesson", price: Number(form.price) || 0,
      teacher_id: form.teacherId || null, duration_min: Number(form.duration), room: form.room || null,
    }).select().single();
    if (error || !student) return;
    await supabase.from("lessons").insert({
      date: form.date, time: form.time, teacher_id: form.teacherId || null, student_id: student.id,
      price: Number(form.price) || 0, duration_min: Number(form.duration), status: "scheduled",
      instrument: form.course || null, room: form.room || null, is_trial_lesson: true,
    });
    onClose(); refresh();
  };

  return (
    <Modal title="Trial lesson" onClose={onClose}>
      <div style={{ fontSize: 12.5, color: COLORS.inkSoft, marginBottom: 12 }}>For someone who isn't enrolled yet — this creates a one-off lesson only, not a recurring weekly schedule.</div>
      <form onSubmit={submit}>
        <Field label="Trial student's name"><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} /></Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Instrument">
            <select value={form.course} onChange={(e) => setForm({ ...form, course: e.target.value, levelId: "" })} style={inputStyle}>
              <option value="">—</option>
              {data.courses.map((c) => (<option key={c.id} value={c.name}>{c.name}</option>))}
            </select>
          </Field>
          <Field label="Grade / level">
            <select value={form.levelId} onChange={(e) => setForm({ ...form, levelId: e.target.value })} style={inputStyle} disabled={!form.course}>
              <option value="">—</option>
              {levelsForCourse.map((l) => (<option key={l.id} value={l.id}>{l.name}</option>))}
            </select>
          </Field>
        </div>
        <Field label="Category (for pricing)">
          <SegTabs tabs={[{ key: "child", label: "Child" }, { key: "adult", label: "Adult" }]} active={form.ageGroup} onChange={(v) => setForm({ ...form, ageGroup: v })} accent={COLORS.owner} />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Date"><input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={inputStyle} /></Field>
          <Field label="Time"><input type="time" required value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} style={inputStyle} /></Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Duration (min)"><input type="number" required value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} style={inputStyle} /></Field>
          <Field label="Price (RM) for this lesson">
            <input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} style={inputStyle} placeholder={selectedLevel ? "Auto-filled from grade — editable" : "Enter manually"} />
          </Field>
        </div>
        {selectedLevel && (form.ageGroup === "adult" ? selectedLevel.default_price_adult : selectedLevel.default_price_child) == null && (
          <div style={{ fontSize: 11.5, color: COLORS.amberDark, marginTop: -6, marginBottom: 10 }}>
            No {form.ageGroup} monthly rate set for {selectedLevel.name} yet, so there's nothing to divide by 4 — type a price manually, or set the monthly rate for next time in Courses → {form.course} → Levels.
          </div>
        )}
        <Field label="Teacher">
          <select value={form.teacherId} onChange={(e) => setForm({ ...form, teacherId: e.target.value })} style={inputStyle}>
            <option value="">Unassigned</option>
            {data.teachers.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
          </select>
        </Field>
        <Field label="Room"><input value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} style={inputStyle} placeholder="e.g. Room 2" /></Field>
        <Btn type="submit" variant="owner" style={{ width: "100%", marginTop: 4 }}>Book trial lesson</Btn>
      </form>
    </Modal>
  );
}

// A one-off extra lesson for an already-enrolled student — on top of their
// usual weekly schedule, not replacing it. Same per-lesson pricing idea as a
// Trial (that grade's monthly rate ÷ 4), but tied to a real existing student
// instead of creating a new trial one, and the teacher can be anyone, not
// just whoever normally teaches them — covers the case where a different
// teacher picks up the extra session.

// ==== extracted lines 816-935 ====
function ExtraLessonModal({ data, refresh, onClose }) {
  const [form, setForm] = useState({
    studentId: "", course: "", levelId: "", ageGroup: "child", teacherId: "", date: todayIso(), time: "15:00", duration: 30, price: "", room: "",
  });
  const student = data.students.find((s) => s.id === form.studentId);
  const levelsForCourse = data.courseLevels.filter((l) => l.course_id === data.courses.find((c) => c.name === form.course)?.id);
  const selectedLevel = levelsForCourse.find((l) => l.id === form.levelId);

  // If the student already takes this exact instrument, their own real
  // per-lesson rate (or monthly rate ÷ 4, if that's how they're billed) is a
  // far more accurate basis than the grade's generic default — and crucially
  // it gives a real reference duration to scale from. A 30-min lesson priced
  // at RM24 means RM0.80/min, so a 45-min extra session should come to
  // RM36 — three sessions of 30+45+45 correctly total 4 full lessons' worth,
  // instead of being priced as if they were each a separate flat-rate slot.
  const existingInstrument = form.course
    ? (student?.course === form.course
        ? { duration_min: student.duration_min, price: student.price, billing_type: student.billing_type, monthly_rate: student.monthly_rate }
        : data.studentInstruments.find((si) => si.student_id === form.studentId && si.course === form.course))
    : null;
  const referenceDuration = existingInstrument?.duration_min || 30;
  const referencePrice = existingInstrument
    ? (existingInstrument.billing_type === "per_month" ? Number(existingInstrument.monthly_rate || 0) / 4 : Number(existingInstrument.price || 0))
    : null;

  // Once a student's picked, default the pricing category to whatever's
  // already on their profile — editable, since this extra class could be
  // billed differently, but it's a sensible starting point.
  useEffect(() => {
    if (student?.age_group) setForm((f) => ({ ...f, ageGroup: student.age_group }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.studentId]);

  useEffect(() => {
    const perMinute = referencePrice != null ? referencePrice / referenceDuration
      : (selectedLevel && (form.ageGroup === "adult" ? selectedLevel.default_price_adult : selectedLevel.default_price_child) != null)
        ? (Number(form.ageGroup === "adult" ? selectedLevel.default_price_adult : selectedLevel.default_price_child) / 4) / 30
        : null;
    if (perMinute != null) setForm((f) => ({ ...f, price: Math.round(perMinute * Number(f.duration || 0) * 100) / 100 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.levelId, form.ageGroup, form.duration, form.course, form.studentId]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.studentId) return;
    await supabase.from("lessons").insert({
      date: form.date, time: form.time, teacher_id: form.teacherId || null, student_id: form.studentId,
      price: Number(form.price) || 0, duration_min: Number(form.duration), status: "scheduled",
      instrument: form.course || null, room: form.room || null, is_extra: true,
    });
    onClose(); refresh();
  };

  return (
    <Modal title="Extra lesson" onClose={onClose}>
      <div style={{ fontSize: 12.5, color: COLORS.inkSoft, marginBottom: 12 }}>A one-off lesson on top of an existing student's usual schedule — doesn't change their regular weekly booking, and can be with any teacher, not just their usual one.</div>
      <form onSubmit={submit}>
        {existingInstrument && referencePrice != null && (
          <div style={{ fontSize: 11.5, color: COLORS.inkSoft, marginBottom: 10 }}>
            Priced from their usual {referenceDuration}-min {form.course} rate ({fmtMoney(referencePrice)}) — the price below scales automatically with whatever duration you enter.
          </div>
        )}
        <Field label="Student">
          <SearchableSelect
            options={data.students.map((s) => ({ value: s.id, label: s.name }))}
            value={form.studentId}
            onChange={(v) => setForm({ ...form, studentId: v })}
            placeholder="Search by name…"
          />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Instrument">
            <select value={form.course} onChange={(e) => setForm({ ...form, course: e.target.value, levelId: "" })} style={inputStyle}>
              <option value="">—</option>
              {data.courses.map((c) => (<option key={c.id} value={c.name}>{c.name}</option>))}
            </select>
          </Field>
          <Field label="Grade / level">
            <select value={form.levelId} onChange={(e) => setForm({ ...form, levelId: e.target.value })} style={inputStyle} disabled={!form.course}>
              <option value="">—</option>
              {levelsForCourse.map((l) => (<option key={l.id} value={l.id}>{l.name}</option>))}
            </select>
          </Field>
        </div>
        <Field label="Category (for pricing)">
          <SegTabs tabs={[{ key: "child", label: "Child" }, { key: "adult", label: "Adult" }]} active={form.ageGroup} onChange={(v) => setForm({ ...form, ageGroup: v })} accent={COLORS.owner} />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Date"><input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={inputStyle} /></Field>
          <Field label="Time"><input type="time" required value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} style={inputStyle} /></Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Duration (min)"><input type="number" required value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} style={inputStyle} /></Field>
          <Field label="Price (RM) for this lesson">
            <input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} style={inputStyle} placeholder={existingInstrument || selectedLevel ? "Auto-filled — editable" : "Enter manually"} />
          </Field>
        </div>
        {!existingInstrument && selectedLevel && (form.ageGroup === "adult" ? selectedLevel.default_price_adult : selectedLevel.default_price_child) == null && (
          <div style={{ fontSize: 11.5, color: COLORS.amberDark, marginTop: -6, marginBottom: 10 }}>
            No {form.ageGroup} monthly rate set for {selectedLevel.name} yet, so there's nothing to divide by 4 — type a price manually, or set the monthly rate for next time in Courses → {form.course} → Levels.
          </div>
        )}
        <Field label="Teacher">
          <select value={form.teacherId} onChange={(e) => setForm({ ...form, teacherId: e.target.value })} style={inputStyle}>
            <option value="">Unassigned</option>
            {data.teachers.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
          </select>
        </Field>
        <Field label="Room"><input value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} style={inputStyle} placeholder="e.g. Room 2" /></Field>
        <Btn type="submit" variant="owner" style={{ width: "100%", marginTop: 4 }} disabled={!form.studentId}>Book extra lesson</Btn>
      </form>
    </Modal>
  );
}

// A landing-page overview — built specifically to help catch data-entry gaps
// while backfilling a month by hand (missing schedules, lopsided lesson
// counts, forgotten invoices) rather than to replace any of the tabs it
// links out to. Every number here is derived from what's already loaded —
// nothing new is fetched, so it stays cheap to render.

// ==== extracted lines 1043-1375 ====
function CalendarTab({ data, refresh }) {
  const [showTrial, setShowTrial] = useState(false);
  const [showExtra, setShowExtra] = useState(false);
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [openDate, setOpenDate] = useState(null);
  const [reschedLesson, setReschedLesson] = useState(null);
  const [viewConflictsTeacher, setViewConflictsTeacher] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const [flipping, setFlipping] = useState(false);
  const [noticeState, setNoticeState] = useState(null);

  const cells = useMemo(() => isoMonthDays(cursor.y, cursor.m), [cursor]);
  const today = todayIso();
  const lessonsByDate = useMemo(() => {
    const m = {};
    data.lessons.forEach((l) => { m[l.date] = (m[l.date] || 0) + 1; });
    return m;
  }, [data.lessons]);
  const holidaySet = useMemo(() => new Set(data.holidays.map((h) => h.date)), [data.holidays]);
  const blockedTeachersByDate = useMemo(() => {
    const m = {};
    data.blockedDates.forEach((b) => { (m[b.date] = m[b.date] || []).push(b); });
    return m;
  }, [data.blockedDates]);
  const teacherName2 = (id) => data.teachers.find((t) => t.id === id)?.name || "Unassigned";

  const awaitingDecision = data.lessons.filter((l) => l.status === "absent").sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const needsCover = data.lessons.filter((l) => l.status === "needs-cover").sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const needsReschedule = data.lessons
    .filter((l) => l.status === "missed-teacher" || l.status === "missed-student")
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));  // Teachers who've blocked a day that still has one of their own lessons sitting
  // on it — the thing admin actually needs to act on. A teacher blocking a day
  // with nothing scheduled on it needs no action, so those are left out here.
  // Not date-floored to "today" on purpose: a past date where the teacher
  // was blocked and the lesson never got moved off "scheduled" is exactly as
  // real a problem as a future one — arguably more so, since it already
  // happened. Both need the same fix.
  const teacherUnavailableConflicts = useMemo(() => {
    const rows = [];
    data.blockedDates.forEach((b) => {
      const clashing = data.lessons.filter((l) => l.teacher_id === b.teacher_id && l.date === b.date && l.status === "scheduled");
      if (clashing.length) rows.push({ ...b, lessons: clashing });
    });
    return rows.sort((a, b) => a.date.localeCompare(b.date));
  }, [data.blockedDates, data.lessons]);
  const conflictsByTeacher = useMemo(() => {
    const groups = new Map();
    teacherUnavailableConflicts.forEach((c) => {
      const key = c.teacher_id || "none";
      if (!groups.has(key)) groups.set(key, { teacherId: c.teacher_id, days: [] });
      groups.get(key).days.push(c);
    });
    return [...groups.values()].sort((a, b) => teacherName2(a.teacherId).localeCompare(teacherName2(b.teacherId)));
  }, [teacherUnavailableConflicts]);
  const studentName = (id) => data.students.find((s) => s.id === id)?.name || "—";
  const teacherNameOf = (id) => data.teachers.find((t) => t.id === id)?.name || "Unassigned";
  const [viewRescheduleTeacher, setViewRescheduleTeacher] = useState(null);
  const rescheduleByTeacher = useMemo(() => {
    const groups = new Map();
    needsReschedule.forEach((l) => {
      const key = l.teacher_id || "none";
      if (!groups.has(key)) groups.set(key, { teacherId: l.teacher_id, lessons: [] });
      groups.get(key).lessons.push(l);
    });
    return [...groups.values()].sort((a, b) => teacherNameOf(a.teacherId).localeCompare(teacherNameOf(b.teacherId)));
  }, [needsReschedule]);

  // Flips still-"scheduled" lessons sitting on a day their teacher already
  // blocked into "missed-teacher" — the same status the teacher's own "not
  // available" button sets — so they land in the normal pending-replacement
  // queue and "Arrange replacement" is one click away, whenever it happens.
  const flipConflictToMissed = async (lessonIds, reason) => {
    if (!lessonIds.length) return;
    await supabase.from("lessons").update({ status: "missed-teacher", reason: reason || "Teacher unavailable (blocked date)" }).in("id", lessonIds);
  };
  const flipOneDayConflict = (conflict) => {
    setConfirmState({
      message: `Mark ${conflict.lessons.length} lesson(s) on ${fmtDate(conflict.date)} as pending replacement? They'll move to the Replacements queue where you can arrange a substitute whenever you're ready.`,
      onConfirm: async () => {
        setConfirmState(null);
        setFlipping(true);
        await flipConflictToMissed(conflict.lessons.map((l) => l.id), conflict.reason);
        // Waited on, not fire-and-forget — the whole point of this notice is
        // to say "the page now reflects it", so it has to actually be true.
        await refresh();
        setFlipping(false);
        setNoticeState(`Done — ${conflict.lessons.length} lesson(s) marked pending replacement.`);
      },
    });
  };
  const flipAllForTeacher = (group) => {
    const totalLessons = group.days.reduce((n, d) => n + d.lessons.length, 0);
    setConfirmState({
      message: `Mark all ${totalLessons} lesson(s) across ${group.days.length} blocked day(s) for ${teacherName2(group.teacherId)} as pending replacement? They'll move to the Replacements queue where you can arrange substitutes whenever you're ready.`,
      onConfirm: async () => {
        setConfirmState(null);
        setFlipping(true);
        for (const d of group.days) {
          await flipConflictToMissed(d.lessons.map((l) => l.id), d.reason);
        }
        await refresh();
        setFlipping(false);
        setNoticeState(`Done — ${totalLessons} lesson(s) marked pending replacement.`);
      },
    });
  };

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

  const monthLabel = new Date(cursor.y, cursor.m, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <Btn onClick={() => setShowTrial(true)}>+ Trial lesson</Btn>
        <Btn variant="owner" onClick={() => setShowExtra(true)}>+ Extra lesson</Btn>
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
            const blockedTeachers = blockedTeachersByDate[iso] || [];
            return (
              <button key={iso} onClick={() => setOpenDate(iso)} style={{
                aspectRatio: "1", border: "1px solid " + (isHoliday ? COLORS.dangerBg : blockedTeachers.length ? COLORS.amber : COLORS.border), borderRadius: 8, cursor: "pointer",
                background: isToday ? COLORS.ink : isHoliday ? COLORS.dangerBg : "#fff",
                color: isToday ? "#fff" : isHoliday ? COLORS.dangerDark : COLORS.ink,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, fontFamily: "inherit",
              }} title={blockedTeachers.length ? `${blockedTeachers.map((b) => teacherName2(b.teacher_id)).join(", ")} unavailable` : undefined}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{Number(iso.slice(8, 10))}</span>
                <span style={{ display: "flex", gap: 2 }}>
                  {count > 0 && <span style={{ width: 4, height: 4, borderRadius: 999, background: isToday ? "#fff" : COLORS.owner }} />}
                  {blockedTeachers.length > 0 && <span style={{ width: 4, height: 4, borderRadius: 999, background: isToday ? "#fff" : COLORS.amber }} />}
                </span>
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 12, fontSize: 11, color: COLORS.inkSoft, flexWrap: "wrap" }}>
          <span>● has lessons</span><span style={{ color: COLORS.dangerDark }}>■ unavailable</span><span style={{ color: COLORS.amber }}>● teacher unavailable</span>
        </div>
      </Card>

      {teacherUnavailableConflicts.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: COLORS.amberDark }}>Teacher unavailable, lessons still on the calendar ({teacherUnavailableConflicts.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {conflictsByTeacher.map((g) => {
              const totalLessons = g.days.reduce((sum, d) => sum + d.lessons.length, 0);
              return (
                <div key={g.teacherId || "none"} style={{ padding: "10px 14px", background: COLORS.amberBg, border: "1px solid " + COLORS.amber, borderRadius: 8, fontSize: 13 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    <a href="#" onClick={(e) => { e.preventDefault(); setViewConflictsTeacher(g.teacherId); }} style={{ color: COLORS.amberDark, fontWeight: 700 }}>
                      {teacherName2(g.teacherId)}
                    </a>
                    <span style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      {g.days.length} day{g.days.length > 1 ? "s" : ""} blocked · {totalLessons} lesson{totalLessons > 1 ? "s" : ""} still scheduled with them
                      <Btn small variant="danger" disabled={flipping} onClick={() => flipAllForTeacher(g)}>Mark all as pending replacement</Btn>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {confirmState && (
        <Modal title="Please confirm" onClose={() => setConfirmState(null)}>
          <div style={{ fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>{confirmState.message}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="danger" onClick={confirmState.onConfirm}>Confirm</Btn>
            <Btn onClick={() => setConfirmState(null)}>Cancel</Btn>
          </div>
        </Modal>
      )}
      {noticeState && (
        <Modal title="Done" onClose={() => setNoticeState(null)}>
          <div style={{ fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>{noticeState}</div>
          <Btn onClick={() => setNoticeState(null)}>OK</Btn>
        </Modal>
      )}

      {viewConflictsTeacher !== null && (() => {
        const group = conflictsByTeacher.find((g) => g.teacherId === viewConflictsTeacher);
        if (!group) return null;
        return (
          <Modal title={`${teacherName2(group.teacherId)} — unavailable days with lessons still on them`} onClose={() => setViewConflictsTeacher(null)}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {group.days.map((b) => (
                <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid " + COLORS.border, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13 }}>{fmtDate(b.date)}{b.reason ? ` — ${b.reason}` : ""} · {b.lessons.length} lesson{b.lessons.length > 1 ? "s" : ""}</span>
                  <span style={{ display: "flex", gap: 8 }}>
                    <Btn small variant="danger" disabled={flipping} onClick={() => flipOneDayConflict(b)}>Mark pending replacement</Btn>
                    <Btn small variant="owner" onClick={() => { setOpenDate(b.date); setViewConflictsTeacher(null); }}>Open day</Btn>
                  </span>
                </div>
              ))}
            </div>
          </Modal>
        );
      })()}

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
        {rescheduleByTeacher.map((g) => (
          <div key={g.teacherId || "none"} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: COLORS.card, border: "1px solid " + COLORS.border, borderRadius: 8, fontSize: 13 }}>
            <a href="#" onClick={(e) => { e.preventDefault(); setViewRescheduleTeacher(g.teacherId); }} style={{ color: COLORS.owner, fontWeight: 700 }}>
              {teacherNameOf(g.teacherId)}
            </a>
            <span style={{ color: COLORS.inkSoft }}>{g.lessons.length} lesson{g.lessons.length > 1 ? "s" : ""} needing a replacement</span>
          </div>
        ))}
        {needsReschedule.length === 0 && <div style={{ fontSize: 13, color: COLORS.inkSoft }}>Nothing needs rescheduling.</div>}
      </div>

      {viewRescheduleTeacher !== null && (() => {
        const group = rescheduleByTeacher.find((g) => g.teacherId === viewRescheduleTeacher);
        if (!group) return null;
        // Grouped by date within the popup so a teacher with lessons spread
        // across many days is still easy to scan, not just one long list.
        const byDate = new Map();
        group.lessons.forEach((l) => {
          if (!byDate.has(l.date)) byDate.set(l.date, []);
          byDate.get(l.date).push(l);
        });
        const dateGroups = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]));
        return (
          <Modal title={`${teacherNameOf(group.teacherId)} — needs rescheduling`} onClose={() => setViewRescheduleTeacher(null)} maxWidth={560}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {dateGroups.map(([date, lessons]) => (
                <div key={date}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, color: COLORS.inkSoft }}>{fmtDate(date)}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {lessons.map((l) => (
                      <div key={l.id} style={{ padding: "9px 12px", background: COLORS.card, border: "1px solid " + COLORS.border, borderRadius: 8, fontSize: 13 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                          <span><strong>{studentName(l.student_id)}</strong> · {l.time.slice(0, 5)}–{addMinutes(l.time, l.duration_min || 30)} · <span style={{ color: COLORS.amberDark }}>{statusLabel(l.status)}</span></span>
                          <div style={{ display: "flex", gap: 8 }}>
                            <Btn small variant="owner" onClick={() => { setReschedLesson(l); setViewRescheduleTeacher(null); }}>Reschedule</Btn>
                            <Btn small onClick={() => undoDecide(l.id)}>Undo</Btn>
                          </div>
                        </div>
                        {l.suggested_date && l.suggested_time && (
                          <div style={{ fontSize: 12, color: COLORS.owner, marginTop: 6 }}>
                            Teacher suggested {fmtDate(l.suggested_date)} · {l.suggested_time.slice(0, 5)}{l.suggested_note ? ` — ${l.suggested_note}` : ""}
                            {" · "}<a href="#" onClick={(e) => { e.preventDefault(); setReschedLesson(l); setViewRescheduleTeacher(null); }} style={{ color: COLORS.owner }}>Use this</a>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Modal>
        );
      })()}

      {openDate && <DayModal date={openDate} data={data} refresh={refresh} onClose={() => setOpenDate(null)} />}
      {reschedLesson && <RescheduleModal lesson={reschedLesson} data={data} refresh={refresh} onClose={() => setReschedLesson(null)} />}

      {showTrial && <TrialLessonModal data={data} refresh={refresh} onClose={() => setShowTrial(false)} />}

      {showExtra && <ExtraLessonModal data={data} refresh={refresh} onClose={() => setShowExtra(false)} />}
    </div>
  );
}


// ==== extracted lines 1376-1656 ====
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
          <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 12 }}>
            Create the login in Supabase (Authentication → Add user) first, then paste their User UID here.
            For the "Email" field there, teachers don't need a real address — use <code>username@teacherlogin.local</code> (e.g. <code>samuel@teacherlogin.local</code>). They'll then just type <strong>samuel</strong> on the sign-in screen.
          </div>
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
  course: "", level: "", billingType: "lesson", monthlyRate: "", price: "",
};

const emptySeriesForm = {
  course: "", level: "", billingType: "lesson", monthlyRate: "",
  teacherId: "", price: 80, duration: 30, permanentDay: "", time: "", forHowLong: 3, unit: "months", room: "",
  status: "active",
};

// ==== extracted lines 1657-1661 ====
const INSTRUMENT_STATUS_LABEL = { active: "Active", paused: "Temporary stop", terminated: "Terminated", graduated: "Graduated" };

// Inline stop/resume panel for a single instrument — same month-picker
// pattern as the whole-student version, just scoped to one course so a
// student can keep one instrument going while pausing another.

// ==== extracted lines 1662-1691 ====
function InstrumentStopPanel({ stopModal, setStopModal, courseName, onStop, onResume }) {
  return (
    <div style={{ marginTop: 8, padding: 10, border: "1px solid " + COLORS.border, borderRadius: 8, background: "#FAF8F3" }}>
      {stopModal.mode === "stop" ? (
        <>
          <div style={{ fontSize: 12, marginBottom: 8 }}>Stop {courseName} from which month? Every {courseName} lesson from the 1st of that month onward will be removed — scheduled, absent, missed, cancelled, all of it — except any already marked Attended, which stays as history. Its schedule will stop generating new ones until resumed.</div>
          <input type="month" value={stopModal.month} onChange={(e) => setStopModal({ ...stopModal, month: e.target.value })} style={{ ...inputStyle, marginBottom: 8, width: 180 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <Btn small variant="danger" type="button" onClick={() => onStop(stopModal.month)}>Confirm stop</Btn>
            <Btn small type="button" onClick={() => setStopModal(null)}>Cancel</Btn>
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 12, marginBottom: 8 }}>Resume {courseName} from which month? Its weekly schedule (existing day/time) will be regenerated about 4 months ahead starting from the 1st of that month.</div>
          <input type="month" value={stopModal.month} onChange={(e) => setStopModal({ ...stopModal, month: e.target.value })} style={{ ...inputStyle, marginBottom: 8, width: 180 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <Btn small variant="teacher" type="button" onClick={() => onResume(stopModal.month)}>Confirm resume</Btn>
            <Btn small type="button" onClick={() => setStopModal(null)}>Cancel</Btn>
          </div>
        </>
      )}
    </div>
  );
}

// Counts how many times a given weekday falls within a month, optionally
// starting from a specific day-of-month — used to work out both "how many
// lessons does a full month normally have" and "how many are actually left
// from when this student joined."

// ==== extracted lines 1692-1705 ====
function countWeekdayOccurrences(year, monthIdx, weekday, fromDay) {
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  let count = 0;
  for (let d = fromDay || 1; d <= daysInMonth; d++) {
    if (new Date(year, monthIdx, d).getDay() === weekday) count += 1;
  }
  return count;
}

// Resolving a trial covers three real outcomes: it didn't lead anywhere, it
// became a brand new enrollment, or it was an existing student trying out a
// second instrument. Each needs the trial's own placeholder student record
// handled differently — closed off, upgraded in place, or merged away
// entirely — which is why this isn't just "convert to student."

// ==== extracted lines 1706-1936 ====
function ResolveTrialPanel({ student, data, refresh, open, setOpen, onDone }) {
  const [outcome, setOutcome] = useState("");
  const [mergeStudentId, setMergeStudentId] = useState("");
  const [form, setForm] = useState({
    course: student.course || "", levelId: "", teacherId: "", permanentDay: "", time: "15:00", duration: 30, room: "", billingChoice: "full", ageGroup: student.age_group || "child",
  });
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  const trialLesson = data.lessons.find((l) => l.student_id === student.id);
  const joinDate = trialLesson?.date || todayIso();
  const levelsForCourse = data.courseLevels.filter((l) => l.course_id === data.courses.find((c) => c.name === form.course)?.id);
  const selectedLevel = levelsForCourse.find((l) => l.id === form.levelId);
  const monthlyRate = form.ageGroup === "adult" ? selectedLevel?.default_price_adult : selectedLevel?.default_price_child;

  const [jy, jm, jd] = joinDate.split("-").map(Number);
  const weekday = form.permanentDay !== "" ? Number(form.permanentDay) : null;
  const totalThisMonth = weekday != null ? countWeekdayOccurrences(jy, jm - 1, weekday, 1) : 0;
  const remainingThisMonth = weekday != null ? countWeekdayOccurrences(jy, jm - 1, weekday, jd) : 0;
  const missedThisMonth = Math.max(0, totalThisMonth - remainingThisMonth);
  const proratedAmount = monthlyRate != null && totalThisMonth > 0 ? Math.round((Number(monthlyRate) * remainingThisMonth / totalThisMonth) * 100) / 100 : null;

  // First occurrence of the chosen weekday in the month after the trial —
  // used when billing starts clean next month instead of this one.
  const nextMonthDate = (() => {
    if (weekday == null) return null;
    let ny = jy, njs = jm; // jm (1-indexed current month) equals next month's 0-indexed JS month
    if (jm === 12) { njs = 0; ny += 1; }
    for (let day = 1; day <= 7; day++) {
      const dt = new Date(ny, njs, day);
      if (dt.getDay() === weekday) return isoDate(dt);
    }
    return null;
  })();

  const otherStudents = data.students.filter((s) => s.id !== student.id && !s.is_trial);

  const confirmNotContinuing = async () => {
    await supabase.from("students").update({ status: "terminated" }).eq("id", student.id);
    onDone();
  };

  const confirmContinuing = async () => {
    if (!form.course || weekday == null || !form.time) return;
    setSaving(true);
    const targetId = outcome === "existing_student" ? mergeStudentId : student.id;
    const existingTarget = outcome === "existing_student" ? data.students.find((s) => s.id === targetId) : null;

    if (outcome === "new_student") {
      await supabase.from("students").update({
        is_trial: false, course: form.course, level: selectedLevel?.name || null,
        billing_type: "per_month", monthly_rate: monthlyRate != null ? Number(monthlyRate) : null, price: 0,
        permanent_day: weekday, permanent_time: form.time, duration_min: Number(form.duration),
        teacher_id: form.teacherId || null, room: form.room || null, instrument_status: "active",
      }).eq("id", student.id);
    } else {
      // Merging: the trial's own lesson history moves with it, and the new
      // instrument gets added to whichever slot the existing student has
      // free — their own primary course if they don't have one yet,
      // otherwise a new student_instruments row alongside what they
      // already take.
      await supabase.from("lessons").update({ student_id: targetId }).eq("student_id", student.id);
      const isFirstInstrument = existingTarget && !existingTarget.course;
      if (isFirstInstrument) {
        await supabase.from("students").update({
          course: form.course, level: selectedLevel?.name || null,
          billing_type: "per_month", monthly_rate: monthlyRate != null ? Number(monthlyRate) : null, price: 0,
          permanent_day: weekday, permanent_time: form.time, duration_min: Number(form.duration),
          teacher_id: form.teacherId || null, room: form.room || null, instrument_status: "active",
        }).eq("id", targetId);
      } else {
        await supabase.from("student_instruments").insert({
          student_id: targetId, course: form.course, level: selectedLevel?.name || null,
          billing_type: "per_month", monthly_rate: monthlyRate != null ? Number(monthlyRate) : null, price: 0,
          permanent_day: weekday, permanent_time: form.time, duration_min: Number(form.duration),
          teacher_id: form.teacherId || null, room: form.room || null, status: "active",
        });
      }
      await supabase.from("students").delete().eq("id", student.id);
    }

    const rows = buildLessonSeriesRows({
      holidays: data.holidays, studentId: targetId, teacherId: form.teacherId || null, price: 0,
      duration: Number(form.duration), permanentDay: weekday, time: form.time, forHowLong: 4, unit: "months",
      instrument: form.course, room: form.room || null,
      startDate: form.billingChoice === "next_month" ? nextMonthDate : joinDate,
    });
    if (rows.length) await supabase.from("lessons").insert(rows);

    // Full-month billing means the studio is charging for weeks that had
    // already passed before this student joined — those need a real
    // placeholder in the Replacements queue, not just a mental note, or
    // the makeup will quietly get forgotten. Not relevant when starting
    // fresh next month — nothing was missed, since the regular schedule
    // hasn't begun yet.
    if (form.billingChoice === "full" && missedThisMonth > 0) {
      const owedRows = [];
      for (let day = 1; day < jd; day++) {
        const dt = new Date(jy, jm - 1, day);
        if (dt.getDay() === weekday) {
          owedRows.push({
            date: isoDate(dt), time: form.time, teacher_id: form.teacherId || null, student_id: targetId,
            price: 0, duration_min: Number(form.duration), status: "missed-teacher",
            instrument: form.course, room: form.room || null, reason: "Owed — joined mid-month (trial converted to enrollment)",
          });
        }
      }
      if (owedRows.length) await supabase.from("lessons").insert(owedRows);
    }

    setSaving(false);
    setResult(
      form.billingChoice === "full"
        ? `Set up. Billed the full monthly rate (${fmtMoney(monthlyRate || 0)})${missedThisMonth > 0 ? ` — ${missedThisMonth} lesson(s) from before they joined this month were added to Replacements as owed.` : "."}`
        : form.billingChoice === "next_month"
        ? `Set up. Only the trial lesson is charged this month — the regular schedule starts ${fmtDate(nextMonthDate)}, and the full rate (${fmtMoney(monthlyRate || 0)}) applies from then.`
        : `Set up. This first month should be charged ${fmtMoney(proratedAmount || 0)} (${remainingThisMonth} of ${totalThisMonth} lesson(s) remaining) — apply that manually to their first invoice. From next month, the full rate (${fmtMoney(monthlyRate || 0)}) applies automatically.`
    );
  };

  if (!open) {
    return (
      <div style={{ marginBottom: 16, padding: 12, background: COLORS.ownerBg, borderRadius: 8 }}>
        <div style={{ fontSize: 13, color: COLORS.ownerDark, marginBottom: 8 }}>This is a trial lesson record. Once it's happened, resolve what comes next — continuing as a new enrollment, added onto an existing student, or not continuing at all.</div>
        <Btn small variant="owner" onClick={() => setOpen(true)}>Resolve this trial</Btn>
      </div>
    );
  }

  if (result) {
    return (
      <div style={{ marginBottom: 16, padding: 12, background: COLORS.successBg, borderRadius: 8 }}>
        <div style={{ fontSize: 13, color: COLORS.successDark, marginBottom: 8 }}>{result}</div>
        <Btn small onClick={onDone}>Close</Btn>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 16, padding: 12, background: COLORS.ownerBg, borderRadius: 8 }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Resolve this trial</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        <Btn small variant={outcome === "not_continuing" ? "danger" : "default"} onClick={() => setOutcome("not_continuing")}>Didn't continue</Btn>
        <Btn small variant={outcome === "new_student" ? "owner" : "default"} onClick={() => setOutcome("new_student")}>Continuing — new student</Btn>
        <Btn small variant={outcome === "existing_student" ? "owner" : "default"} onClick={() => setOutcome("existing_student")}>Continuing — existing student</Btn>
      </div>

      {outcome === "not_continuing" && (
        <div>
          <div style={{ fontSize: 12.5, color: COLORS.inkSoft, marginBottom: 8 }}>Closes this record out — the trial lesson fee stands as the only charge. It stays on file as a terminated record rather than being deleted.</div>
          <Btn small variant="danger" onClick={confirmNotContinuing}>Confirm — not continuing</Btn>
        </div>
      )}

      {outcome === "existing_student" && (
        <div style={{ marginBottom: 10 }}>
          <Field label="Which existing student is this?">
            <SearchableSelect
              options={otherStudents.map((s) => ({ value: s.id, label: s.name }))}
              value={mergeStudentId} onChange={setMergeStudentId} placeholder="Search by name…"
            />
          </Field>
          {mergeStudentId && <div style={{ fontSize: 11.5, color: COLORS.inkSoft, marginTop: -6 }}>The trial lesson moves onto their history, and this new instrument gets added to their profile. This trial-only record is then removed.</div>}
        </div>
      )}

      {(outcome === "new_student" || (outcome === "existing_student" && mergeStudentId)) && (
        <div style={{ borderTop: "1px solid " + COLORS.border, paddingTop: 10, marginTop: 4 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Instrument">
              <select value={form.course} onChange={(e) => setForm({ ...form, course: e.target.value, levelId: "" })} style={inputStyle}>
                <option value="">—</option>
                {data.courses.map((c) => (<option key={c.id} value={c.name}>{c.name}</option>))}
              </select>
            </Field>
            <Field label="Grade / level">
              <select value={form.levelId} onChange={(e) => setForm({ ...form, levelId: e.target.value })} style={inputStyle} disabled={!form.course}>
                <option value="">—</option>
                {levelsForCourse.map((l) => (<option key={l.id} value={l.id}>{l.name}</option>))}
              </select>
            </Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Day">
              <select value={form.permanentDay} onChange={(e) => setForm({ ...form, permanentDay: e.target.value })} style={inputStyle}>
                <option value="">—</option>
                {WEEKDAY_LABELS.map((label, idx) => (<option key={idx} value={idx}>{label}</option>))}
              </select>
            </Field>
            <Field label="Time"><input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} style={inputStyle} /></Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Duration (min)"><input type="number" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} style={inputStyle} /></Field>
            <Field label="Teacher">
              <select value={form.teacherId} onChange={(e) => setForm({ ...form, teacherId: e.target.value })} style={inputStyle}>
                <option value="">Unassigned</option>
                {data.teachers.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
              </select>
            </Field>
          </div>
          <Field label="Room"><input value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} style={inputStyle} /></Field>

          {weekday != null && (
            <div style={{ fontSize: 12.5, background: "#fff", borderRadius: 8, padding: 10, marginBottom: 10 }}>
              Joined {fmtDate(joinDate)} — that's {remainingThisMonth} of {totalThisMonth} {WEEKDAY_LABELS[weekday]} lesson(s) left in {new Date(jy, jm - 1, 1).toLocaleDateString("en-GB", { month: "long" })}.
              <div style={{ marginTop: 6 }}>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 4 }}>
                  <input type="radio" checked={form.billingChoice === "full"} onChange={() => setForm({ ...form, billingChoice: "full" })} style={{ marginTop: 3 }} />
                  <span>Charge full month ({fmtMoney(monthlyRate || 0)}){missedThisMonth > 0 ? ` — ${missedThisMonth} lesson(s) before joining will be flagged as owed replacements` : ""}</span>
                </label>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 4 }}>
                  <input type="radio" checked={form.billingChoice === "prorated"} onChange={() => setForm({ ...form, billingChoice: "prorated" })} style={{ marginTop: 3 }} />
                  <span>Charge only for what's left this month {proratedAmount != null ? `(${fmtMoney(proratedAmount)})` : ""} — full rate resumes next month</span>
                </label>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                  <input type="radio" checked={form.billingChoice === "next_month"} onChange={() => setForm({ ...form, billingChoice: "next_month" })} style={{ marginTop: 3 }} />
                  <span>Trial class only this month — regular schedule and billing start {nextMonthDate ? fmtDate(nextMonthDate) : "next month"}</span>
                </label>
              </div>
            </div>
          )}

          <Btn small variant="owner" onClick={confirmContinuing} disabled={saving || !form.course || weekday == null || !form.time}>
            {saving ? "Setting up…" : "Confirm and set up schedule"}
          </Btn>
        </div>
      )}
    </div>
  );
}


// ==== extracted lines 1937-3209 ====
function StudentsTab({ data, refresh, setTab, pendingNav, clearPendingNav }) {
  const [showAdd, setShowAdd] = useState(false);
  const [openStudent, setOpenStudent] = useState(null);
  const [editingStudent, setEditingStudent] = useState(null);
  const [stopModal, setStopModal] = useState(null); // { scope: 'student'|'instrument', instrumentKey?, month }
  const [resolveTrialOpen, setResolveTrialOpen] = useState(false);
  const [editLesson, setEditLesson] = useState(null);
  const [editLessonForm, setEditLessonForm] = useState({ date: "", time: "", duration: 30, price: 0, instrument: "", room: "" });
  const [selectedLessons, setSelectedLessons] = useState([]);
  const [planForm, setPlanForm] = useState({ date: todayIso(), what: "", remarks: "" });
  const [planEditId, setPlanEditId] = useState(null);
  const [addSeriesOpen, setAddSeriesOpen] = useState(false);
  const [seriesForm, setSeriesForm] = useState(emptySeriesForm);
  const [editingInstrument, setEditingInstrument] = useState(null);
  const [changingTimeFor, setChangingTimeFor] = useState(null); // "primary" or student_instruments.id
  const [changeTimeForm, setChangeTimeForm] = useState({ day: "", time: "" });
  const [importResult, setImportResult] = useState(null);
  const [importing, setImporting] = useState(false);
  const csvFileRef = useRef(null);
  const [form, setForm] = useState(emptyStudentForm);
  const [newCentreMode, setNewCentreMode] = useState(false);
  const [filters, setFilters] = useState({ day: "", course: "", centre: "", search: "", status: "all", ageGroup: "", instrumentMix: "all", sort: "name" });

  useEffect(() => {
    if (!pendingNav) return;
    if (pendingNav.studentId) setOpenStudent(pendingNav.studentId);
    if (pendingNav.search) setFilters((f) => ({ ...f, search: pendingNav.search, status: "all", course: "", centre: "", ageGroup: "", instrumentMix: "all" }));
    clearPendingNav();
  }, [pendingNav, clearPendingNav]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkStatus, setBulkStatus] = useState("active");
  const toggleSelected = (id) => setSelectedIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const toggleSelectAll = () => setSelectedIds((prev) => (prev.size === filtered.length ? new Set() : new Set(filtered.map((s) => s.id))));
  const applyBulkStatus = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Set ${selectedIds.size} student${selectedIds.size === 1 ? "" : "s"} to "${bulkStatus}"?`)) return;
    await supabase.from("students").update({ status: bulkStatus }).in("id", [...selectedIds]);
    setSelectedIds(new Set());
    refresh();
  };
  const applyBulkRemove = async () => {
    if (selectedIds.size === 0) return;
    const names = data.students.filter((s) => selectedIds.has(s.id)).map((s) => s.name);
    if (!confirm(`Remove ${selectedIds.size} student${selectedIds.size === 1 ? "" : "s"} and all their lessons? This can't be undone.\n\n${names.slice(0, 10).join(", ")}${names.length > 10 ? `, +${names.length - 10} more` : ""}`)) return;
    await supabase.from("students").delete().in("id", [...selectedIds]);
    setSelectedIds(new Set());
    refresh();
  };

  const courses = useMemo(() => [...new Set(data.students.map((s) => s.course).filter(Boolean))], [data.students]);
  const centres = useMemo(() => [...new Set(data.students.map((s) => s.centre).filter(Boolean))], [data.students]);

  const upcomingCount = (studentId) => data.lessons.filter((l) => l.status === "scheduled" && l.student_id === studentId && l.date >= todayIso()).length;
  const nextLesson = (studentId) => {
    const l = data.lessons.filter((l) => l.status === "scheduled" && l.student_id === studentId && l.date >= todayIso()).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
    return l ? `${fmtDate(l.date)} · ${l.time.slice(0, 5)}` : null;
  };

  // "Mix" of instrument statuses on one student — active-only, stopped-only
  // (paused/terminated/graduated), or a mix of both ("partial").
  const instrumentStatusMix = (s) => {
    const statuses = [];
    if (s.course) statuses.push(s.instrument_status || "active");
    data.studentInstruments.filter((si) => si.student_id === s.id).forEach((si) => statuses.push(si.status || "active"));
    if (statuses.length === 0) return "none";
    const activeCount = statuses.filter((st) => st === "active").length;
    if (activeCount === statuses.length) return "all-active";
    if (activeCount === 0) return "all-stopped";
    return "partial";
  };

  const filtered = data.students
    .filter((s) => {
      if (filters.status !== "all" && (s.status || "active") !== filters.status) return false;
      if (filters.day !== "" && s.permanent_day !== Number(filters.day)) return false;
      if (filters.course && s.course !== filters.course) return false;
      if (filters.centre && s.centre !== filters.centre) return false;
      if (filters.ageGroup && s.age_group !== filters.ageGroup) return false;
      if (filters.instrumentMix && filters.instrumentMix !== "all" && instrumentStatusMix(s) !== filters.instrumentMix) return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const matchesCourse = (s.course || "").toLowerCase().includes(q) || data.studentInstruments.some((si) => si.student_id === s.id && (si.course || "").toLowerCase().includes(q));
        if (!s.name.toLowerCase().includes(q) && !matchesCourse) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (filters.sort === "partial-first") {
        const rank = { partial: 0, "all-stopped": 1, "all-active": 2, none: 3 };
        const cmp = rank[instrumentStatusMix(a)] - rank[instrumentStatusMix(b)];
        if (cmp !== 0) return cmp;
      }
      return a.name.localeCompare(b.name);
    });

  const generateSeries = async ({ studentId, teacherId, price, duration, permanentDay, time, forHowLong, unit, instrument, room }) => {
    const rows = buildLessonSeriesRows({ holidays: data.holidays, studentId, teacherId, price, duration, permanentDay, time, forHowLong, unit, instrument, room });
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
      course: form.course || null, level: form.level || null,
      billing_type: form.course ? (form.billingType === "month" ? "per_month" : "per_lesson") : "per_lesson",
      monthly_rate: form.course && form.billingType === "month" ? Number(form.monthlyRate) || 0 : null,
      price: form.course && form.billingType === "lesson" ? Number(form.price) || 0 : 0,
    }).select().single();
    if (error || !inserted) { return; }
    setForm(emptyStudentForm); setShowAdd(false); setNewCentreMode(false);
    await refresh();
    setOpenStudent(inserted.id);
    // If they already picked a course above, they don't need the "add
    // instrument" panel re-opened for the same thing — only pop it open
    // when no course was chosen yet, so there's still a next step to do.
    setAddSeriesOpen(!form.course);
  };

  const CSV_HEADERS = ["First name", "Last name", "Age", "Category (child/adult)", "Gender", "Joining year", "Centre", "Notes", "Status (active/paused/terminated/graduated)", "Course", "Level", "Instrument status (active/paused/terminated/graduated)", "Billing (lesson/month)", "Rate (RM)", "Day", "Time (HH:MM)", "Duration (min)", "Teacher", "Room", "For How Long", "Unit (months/weeks)"];
  const normalizeStatus = (raw) => {
    const s = (raw || "").trim().toLowerCase();
    if (["active", ""].includes(s)) return "active";
    if (["paused", "temporary stop", "temp stop", "stop", "stopped", "pause"].includes(s)) return "paused";
    if (["terminated", "terminate", "term"].includes(s)) return "terminated";
    if (["graduated", "graduate", "grad"].includes(s)) return "graduated";
    return null; // unrecognized — flagged, defaults to active
  };

  const downloadCsvTemplate = () => {
    const example = ["Aaron", "Tan", "10", "child", "male", "2026", "Play Studio", "", "active", "Piano", "1", "active", "month", "150", "Sunday", "14:00", "30", "Teacher Samuel", "", "3", "months"];
    const escape = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const csv = [CSV_HEADERS, example].map((row) => row.map(escape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "students-template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const downloadStudentList = (subset) => {
    const list = subset || data.students;
    const escape = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const headers = ["Name", "First name", "Last name", "Age", "Category", "Gender", "Joining year", "Centre", "Status", "Notes", "Instruments"];
    const rows = list.map((s) => {
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

  const downloadImportReport = (issues) => {
    const escape = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const headers = ["Spreadsheet row", "Student name", "Issue", "Detail"];
    const rows = issues.map((it) => [it.row, it.name, it.issue, it.detail]);
    const csv = [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `student-import-report-${todayIso()}.csv`; a.click();
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
      const rawInstrumentStatus = (row["Instrument status (active/paused/terminated/graduated)"] || "").trim();
      const instrumentStatus = normalizeStatus(rawInstrumentStatus) || "active";
      return { teacher, teacherName, dayLabel, dayOpt, isMonthly, rate, rawRate, rateValid, course, time, rawTime, duration, forHowLong, unit, room, rawInstrumentStatus, instrumentStatus };
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
      instrument_status: p.instrumentStatus,
    });

    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: async (results) => {
        const totalRows = results.data.length;
        const groups = new Map();
        const issues = []; // { row, name, issue, detail }

        results.data.forEach((row, idx) => {
          const rowNum = idx + 2; // +2: header row + 1-based
          const firstName = (row["First name"] || "").trim();
          const lastName = (row["Last name"] || "").trim();
          const name = `${firstName} ${lastName}`.trim();
          if (!name) { issues.push({ row: rowNum, name: "(blank)", issue: "No name", detail: "First name and Last name both blank — row skipped entirely." }); return; }
          const key = name.toLowerCase();
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push({ ...row, __row: rowNum });
        });

        for (const [, rows] of groups) {
          if (rows.length > 1) {
            const nm = `${(rows[0]["First name"] || "").trim()} ${(rows[0]["Last name"] || "").trim()}`.trim();
            issues.push({
              row: rows.map((r) => r.__row).join("/"), name: nm, issue: "Same name as another row",
              detail: `${rows.length} rows grouped as one student with ${rows.length - 1} extra instrument${rows.length > 2 ? "s" : ""}. Check these are really the same person — if not, remove the extra instrument and re-add as a separate student.`,
            });
          }
        }

        let ok = 0; let instrumentsAdded = 0;
        for (const [, rows] of groups) {
          const first = rows[0];
          const firstName = (first["First name"] || "").trim();
          const lastName = (first["Last name"] || "").trim();
          const name = `${firstName} ${lastName}`.trim();
          const flagRow = (rowNum, label, p) => {
            if (!p.rateValid) issues.push({ row: rowNum, name, issue: `Bad rate (${label})`, detail: `Rate "${p.rawRate}" isn't a number — imported as RM0, fix manually.` });
            if (p.rawTime && !p.time) issues.push({ row: rowNum, name, issue: `Bad time (${label})`, detail: `Couldn't read time "${p.rawTime}" — left unscheduled, add manually.` });
            if (p.dayLabel && !p.dayOpt) issues.push({ row: rowNum, name, issue: `Bad day (${label})`, detail: `"${first["Day"]}" isn't a single recognized day — left unscheduled, add manually.` });
            if (p.teacherName && !p.teacher) issues.push({ row: rowNum, name, issue: `Teacher not found (${label})`, detail: `"${p.teacherName}" doesn't match any teacher in the system — left unassigned.` });
            if (p.rawInstrumentStatus && normalizeStatus(p.rawInstrumentStatus) === null) issues.push({ row: rowNum, name, issue: `Bad instrument status (${label})`, detail: `"${p.rawInstrumentStatus}" isn't recognized — left as Active. Use active/paused/terminated/graduated.` });
          };
          try {
            const ageGroupRaw = (first["Category (child/adult)"] || "").trim().toLowerCase();
            const ageGroup = ageGroupRaw === "adult" ? "adult" : ageGroupRaw === "child" ? "child" : null;
            const p = parseRowInstrument(first);
            const level = (first["Level"] || "").trim() || null;
            const rawStudentStatus = (first["Status (active/paused/terminated/graduated)"] || "").trim();
            const studentStatus = normalizeStatus(rawStudentStatus) || "active";
            if (rawStudentStatus && normalizeStatus(rawStudentStatus) === null) {
              issues.push({ row: first.__row, name, issue: "Bad status", detail: `"${rawStudentStatus}" isn't recognized — left as Active. Use active/paused/terminated/graduated.` });
            }
            const { data: inserted, error } = await supabase.from("students").insert({
              name, first_name: firstName || null, last_name: lastName || null,
              age: first["Age"] ? Number(first["Age"]) : null, gender: (first["Gender"] || "").trim().toLowerCase() || null,
              joining_year: first["Joining year"] ? Number(first["Joining year"]) : null,
              centre: (first["Centre"] || "").trim() || null, notes: (first["Notes"] || "").trim() || null,
              age_group: ageGroup, level, status: studentStatus,
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
            flagRow(first.__row, p.course || "primary instrument", p);
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
                duration_min: q.duration, room: q.room || null, status: q.instrumentStatus,
              });
              if (siErr) throw new Error(siErr.message);
              if (q.dayOpt && q.time) {
                await generateSeries({
                  studentId: inserted.id, teacherId: q.teacher?.id || "", price: q.isMonthly ? 0 : q.rate,
                  duration: q.duration, permanentDay: String(q.dayOpt.value), time: q.time,
                  forHowLong: q.forHowLong, unit: q.unit, instrument: q.course || "", room: q.room,
                });
              }
              flagRow(r.__row, q.course || `extra instrument ${i + 1}`, q);
              instrumentsAdded += 1;
            }
          } catch (err) {
            issues.push({ row: rows.map((r) => r.__row).join("/"), name, issue: "Failed to import", detail: err.message || "failed" });
          }
        }
        setImportResult({ ok, instrumentsAdded, issues, totalRows });
        setImporting(false);
        refresh();
      },
      error: (err) => { setImportResult({ ok: 0, instrumentsAdded: 0, issues: [{ row: "-", name: "-", issue: "File error", detail: err.message || "Could not read that file" }], totalRows: 0 }); setImporting(false); },
    });
  };

  const healthIssues = getHealthIssues(data);

  return (
    <div>
      {healthIssues.totalCount > 0 && (
        <Card style={{ marginBottom: 14, background: COLORS.dangerBg, border: "none" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <div style={{ fontSize: 13, color: COLORS.dangerDark }}>
              <strong>{healthIssues.totalCount} thing{healthIssues.totalCount === 1 ? "" : "s"} need{healthIssues.totalCount === 1 ? "s" : ""} attention</strong> — missing teachers, rates, schedules, and more.
            </div>
            <Btn small variant="danger" onClick={() => setTab("health")}>View Health Check</Btn>
          </div>
        </Card>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <Btn onClick={() => downloadStudentList()}>Download student list (CSV)</Btn>
        <Btn onClick={downloadCsvTemplate}>Download CSV template</Btn>
        <input ref={csvFileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) importCsv(f); e.target.value = ""; }} />
        <Btn onClick={() => csvFileRef.current?.click()} disabled={importing}>{importing ? "Importing…" : "Import CSV"}</Btn>
        <Btn variant="owner" onClick={() => setShowAdd(true)}>+ Add student</Btn>
      </div>
      {importResult && (
        <Card style={{ marginBottom: 14, background: importResult.issues.length ? COLORS.dangerBg : COLORS.successBg, border: "none" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {importResult.totalRows > 0 && `Read ${importResult.totalRows} row${importResult.totalRows === 1 ? "" : "s"} from the file. `}
              {importResult.ok} student{importResult.ok === 1 ? "" : "s"} imported{importResult.instrumentsAdded ? `, plus ${importResult.instrumentsAdded} extra instrument${importResult.instrumentsAdded === 1 ? "" : "s"}` : ""}{importResult.issues.length > 0 ? `, ${importResult.issues.length} thing${importResult.issues.length > 1 ? "s" : ""} to check` : ""}.
            </div>
            {importResult.issues.length > 0 && <Btn small variant="danger" onClick={() => downloadImportReport(importResult.issues)}>Download report (CSV)</Btn>}
          </div>
          {importResult.issues.length > 0 && (
            <div style={{ fontSize: 12, marginTop: 8, maxHeight: 220, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left" }}>
                    <th style={{ padding: "3px 6px 3px 0" }}>Row</th>
                    <th style={{ padding: "3px 6px" }}>Name</th>
                    <th style={{ padding: "3px 6px" }}>Issue</th>
                    <th style={{ padding: "3px 6px" }}>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {importResult.issues.map((it, i) => (
                    <tr key={i} style={{ borderTop: "1px solid rgba(0,0,0,0.08)" }}>
                      <td style={{ padding: "3px 6px 3px 0", whiteSpace: "nowrap" }}>{it.row}</td>
                      <td style={{ padding: "3px 6px", whiteSpace: "nowrap" }}>{it.name}</td>
                      <td style={{ padding: "3px 6px", whiteSpace: "nowrap" }}>{it.issue}</td>
                      <td style={{ padding: "3px 6px" }}>{it.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <a href="#" onClick={(e) => { e.preventDefault(); setImportResult(null); }} style={{ fontSize: 12, color: COLORS.inkSoft, display: "inline-block", marginTop: 8 }}>Dismiss</a>
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
          <select value={filters.instrumentMix} onChange={(e) => setFilters({ ...filters, instrumentMix: e.target.value })} style={{ ...inputStyle, flex: "1 1 150px" }}>
            <option value="all">Any instrument mix</option>
            <option value="partial">Partially stopped (mixed)</option>
            <option value="all-active">All instruments active</option>
            <option value="all-stopped">All instruments stopped</option>
          </select>
          <select value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value })} style={{ ...inputStyle, flex: "1 1 130px" }}>
            <option value="name">Sort: Name (A–Z)</option>
            <option value="partial-first">Sort: Partially stopped first</option>
          </select>
        </div>
      </Card>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        <label style={{ fontSize: 13, color: COLORS.inkSoft, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input type="checkbox" checked={filtered.length > 0 && selectedIds.size === filtered.length} onChange={toggleSelectAll} />
          {filtered.length} student{filtered.length === 1 ? "" : "s"}{selectedIds.size > 0 ? ` · ${selectedIds.size} selected` : ""}
        </label>
        {selectedIds.size > 0 && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Btn small onClick={() => downloadStudentList(data.students.filter((s) => selectedIds.has(s.id)))}>Export selected (CSV)</Btn>
            <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)} style={{ ...inputStyle, width: "auto", padding: "5px 8px", fontSize: 13 }}>
              <option value="active">Active</option>
              <option value="paused">Temporary stop</option>
              <option value="terminated">Terminated</option>
              <option value="graduated">Graduated</option>
            </select>
            <Btn small variant="owner" onClick={applyBulkStatus}>Set status</Btn>
            <Btn small variant="danger" onClick={applyBulkRemove}>Remove</Btn>
            <Btn small onClick={() => setSelectedIds(new Set())}>Clear</Btn>
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {filtered.map((s) => (
          <Card key={s.id} style={{ padding: "10px 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontSize: 13, display: "flex", gap: 10 }}>
                <input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleSelected(s.id)} style={{ marginTop: 3, flexShrink: 0 }} />
                <div>
                <strong>{s.name}</strong>
                <span style={{ color: COLORS.inkSoft }}>
                  {s.age ? ` · ${s.age}yo` : ""}{s.age_group ? ` · ${s.age_group === "adult" ? "Adult" : "Child"}` : ""}{s.gender ? ` · ${s.gender}` : ""}{s.grade ? ` · ${s.grade}` : ""}{s.centre ? ` · ${s.centre}` : ""}
                </span>
                <div style={{ color: COLORS.inkSoft, fontSize: 12, marginTop: 2 }}>
                  {(() => {
                    const list = [];
                    if (s.course) list.push({ course: s.course, level: s.level, rateLabel: s.billing_type === "per_month" ? `${fmtMoney(s.monthly_rate || 0)}/mo` : `${fmtMoney(s.price)}/lesson`, status: s.instrument_status });
                    data.studentInstruments.filter((si) => si.student_id === s.id).forEach((si) => {
                      list.push({ course: si.course, level: si.level, rateLabel: si.billing_type === "per_month" ? `${fmtMoney(si.monthly_rate || 0)}/mo` : `${fmtMoney(si.price)}/lesson`, status: si.status });
                    });
                    if (list.length === 0) return "No instruments yet";
                    return list.map((it, i) => (
                      <span key={i}>{i > 0 ? " · " : ""}{it.course}{it.level ? ` (${it.level})` : ""} — {it.rateLabel}{it.status && it.status !== "active" ? ` [${INSTRUMENT_STATUS_LABEL[it.status]}]` : ""}</span>
                    ));
                  })()}
                </div>
                {nextLesson(s.id) && <div style={{ color: COLORS.inkSoft, fontSize: 12 }}>Next: {nextLesson(s.id)}</div>}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {s.status && s.status !== "active" && <Badge tone="amber">{s.status}</Badge>}
                {instrumentStatusMix(s) === "partial" && <Badge tone="amber">Partially stopped</Badge>}
                {healthIssues.noTeacher.some((i) => i.studentId === s.id) && <Badge tone="danger">No teacher</Badge>}
                {healthIssues.noRate.some((i) => i.studentId === s.id) && <Badge tone="danger">No rate</Badge>}
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
        <Modal title="Add student" onClose={() => { setShowAdd(false); setNewCentreMode(false); }}>
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
            <Field label="Centre">
              {newCentreMode ? (
                <div style={{ display: "flex", gap: 6 }}>
                  <input autoFocus placeholder="New centre name" value={form.centre} onChange={(e) => setForm({ ...form, centre: e.target.value })} style={inputStyle} />
                  <Btn small type="button" onClick={() => { setNewCentreMode(false); setForm({ ...form, centre: centres[0] || "" }); }}>Cancel</Btn>
                </div>
              ) : (
                <select
                  value={form.centre}
                  onChange={(e) => { if (e.target.value === "__new__") { setNewCentreMode(true); setForm({ ...form, centre: "" }); } else { setForm({ ...form, centre: e.target.value }); } }}
                  style={inputStyle}
                >
                  <option value="">—</option>
                  {centres.map((c) => (<option key={c} value={c}>{c}</option>))}
                  <option value="__new__">+ Add a new centre</option>
                </select>
              )}
            </Field>
            {(() => {
              const levelsForNewStudent = data.courseLevels.filter((l) => l.course_id === data.courses.find((c) => c.name === form.course)?.id);
              const priceForLevel = (lvl) => (form.ageGroup === "adult" ? lvl.default_price_adult : form.ageGroup === "child" ? lvl.default_price_child : null);
              const levelLabel = (l) => {
                const parts = [];
                if (l.default_price_child != null) parts.push(`Child ${fmtMoney(l.default_price_child)}/mo`);
                if (l.default_price_adult != null) parts.push(`Adult ${fmtMoney(l.default_price_adult)}/mo`);
                return parts.length ? `${l.name} (${parts.join(" · ")})` : l.name;
              };
              return (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <Field label="Instrument / course (optional here)">
                      <select value={form.course} onChange={(e) => setForm({ ...form, course: e.target.value, level: "" })} style={inputStyle}>
                        <option value="">—</option>
                        {data.courses.map((c) => (<option key={c.id} value={c.name}>{c.name}</option>))}
                      </select>
                    </Field>
                    {levelsForNewStudent.length > 0 && (
                      <Field label="Level">
                        <select
                          value={form.level}
                          onChange={(e) => {
                            const lvl = levelsForNewStudent.find((l) => l.name === e.target.value);
                            const price = lvl ? priceForLevel(lvl) : null;
                            if (price != null) {
                              setForm({ ...form, level: e.target.value, billingType: "month", monthlyRate: price });
                            } else {
                              setForm({ ...form, level: e.target.value });
                            }
                          }}
                          style={inputStyle}
                        >
                          <option value="">—</option>
                          {levelsForNewStudent.map((l) => (<option key={l.id} value={l.name}>{levelLabel(l)}</option>))}
                        </select>
                        {!form.ageGroup && levelsForNewStudent.some((l) => l.default_price_child != null || l.default_price_adult != null) && (
                          <div style={{ fontSize: 11.5, color: COLORS.dangerDark, marginTop: 4 }}>Set Category above to auto-fill the right rate for a level.</div>
                        )}
                      </Field>
                    )}
                  </div>
                  {form.course && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <Field label="Billing">
                        <select value={form.billingType} onChange={(e) => setForm({ ...form, billingType: e.target.value })} style={inputStyle}>
                          <option value="lesson">Per lesson</option>
                          <option value="month">Per month (flat fee)</option>
                        </select>
                      </Field>
                      {form.billingType === "month" ? (
                        <Field label="Monthly rate (RM)"><input type="number" value={form.monthlyRate} onChange={(e) => setForm({ ...form, monthlyRate: e.target.value })} style={inputStyle} /></Field>
                      ) : (
                        <Field label="Price per lesson (RM)"><input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} style={inputStyle} /></Field>
                      )}
                    </div>
                  )}
                </>
              );
            })()}
            <Field label="Notes"><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={inputStyle} /></Field>
            <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 12 }}>
              {form.course ? "Their schedule (day, time, teacher) is still set up right after, on their profile." : "Just the basics for now — you'll add their instrument, schedule, and teacher right after, on their profile."}
            </div>
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
        const savePlan = async (e) => {
          e.preventDefault();
          if (planEditId) {
            await supabase.from("lesson_plans").update({ date: planForm.date, what_to_teach: planForm.what, remarks: planForm.remarks || null }).eq("id", planEditId);
          } else {
            await supabase.from("lesson_plans").insert({ student_id: openStudent, date: planForm.date, what_to_teach: planForm.what, remarks: planForm.remarks || null });
          }
          setPlanForm({ date: todayIso(), what: "", remarks: "" }); setPlanEditId(null); refresh();
        };
        const removePlan = async (id) => {
          if (!confirm("Remove this teaching plan entry?")) return;
          await supabase.from("lesson_plans").delete().eq("id", id); refresh();
        };
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
              instrument_status: seriesForm.status || "active",
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
              status: seriesForm.status || "active",
            });
          }
          await generateSeries({
            studentId: openStudent, teacherId: seriesForm.teacherId,
            price: seriesForm.billingType === "month" ? 0 : seriesForm.price,
            duration: seriesForm.duration, permanentDay: seriesForm.permanentDay, time: seriesForm.time,
            forHowLong: 4, unit: "months",
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
              instrument_status: seriesForm.status || "active",
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
              status: seriesForm.status || "active",
            }).eq("id", editingInstrument);
          }
          const teacherChanged = oldRecord && oldRecord.teacher_id !== (seriesForm.teacherId || null);
          const roomChanged = oldRecord && (oldRecord.room || null) !== (seriesForm.room || null);
          const durationChanged = oldRecord && (oldRecord.duration_min || 30) !== (Number(seriesForm.duration) || 30);
          const newDay = seriesForm.permanentDay !== "" ? Number(seriesForm.permanentDay) : null;
          const newTime = seriesForm.time || null;
          const dayChanged = oldRecord && (oldRecord.permanent_day ?? null) !== newDay;
          const timeChanged = oldRecord && (oldRecord.permanent_time ? oldRecord.permanent_time.slice(0, 5) : null) !== newTime;

          if (oldCourse && (dayChanged || timeChanged) && newDay != null && newTime) {
            if (confirm(`Move ${oldCourse}'s upcoming lessons to the new day/time? Existing not-yet-happened lessons on the old slot will be removed and regenerated on the new one, about 4 months ahead. Past/attended lessons are never touched.`)) {
              await supabase.from("lessons").delete().eq("student_id", openStudent).eq("instrument", oldCourse).eq("status", "scheduled").gte("date", todayIso());
              await generateSeries({
                studentId: openStudent, teacherId: seriesForm.teacherId || "", price: seriesForm.billingType === "month" ? 0 : Number(seriesForm.price || 0),
                duration: Number(seriesForm.duration) || 30, permanentDay: String(newDay), time: newTime,
                forHowLong: 4, unit: "months", instrument: seriesForm.course || oldCourse, room: seriesForm.room || "",
              });
            }
          } else if (oldCourse && (teacherChanged || roomChanged || durationChanged)) {
            const changes = [teacherChanged && "teacher", roomChanged && "room", durationChanged && "duration"].filter(Boolean).join(", ");
            if (confirm(`Also update ${changes} on ${oldCourse}'s upcoming lessons already on the calendar?`)) {
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
        const saveChangeTime = async (e) => {
          e.preventDefault();
          const oldRecord = changingTimeFor === "primary" ? s : data.studentInstruments.find((si) => si.id === changingTimeFor);
          const oldCourse = oldRecord?.course;
          const newDay = changeTimeForm.day !== "" ? Number(changeTimeForm.day) : null;
          const newTime = changeTimeForm.time || null;
          if (changingTimeFor === "primary") {
            await supabase.from("students").update({ permanent_day: newDay, permanent_time: newTime }).eq("id", openStudent);
          } else {
            await supabase.from("student_instruments").update({ permanent_day: newDay, permanent_time: newTime }).eq("id", changingTimeFor);
          }
          const dayChanged = oldRecord && (oldRecord.permanent_day ?? null) !== newDay;
          const timeChanged = oldRecord && (oldRecord.permanent_time ? oldRecord.permanent_time.slice(0, 5) : null) !== newTime;
          if (oldCourse && (dayChanged || timeChanged) && newDay != null && newTime) {
            if (confirm(`Move ${oldCourse}'s upcoming lessons to the new day/time? Existing not-yet-happened lessons on the old slot will be removed and regenerated on the new one, about 4 months ahead. Past/attended lessons are never touched.`)) {
              await supabase.from("lessons").delete().eq("student_id", openStudent).eq("instrument", oldCourse).eq("status", "scheduled").gte("date", todayIso());
              await generateSeries({
                studentId: openStudent, teacherId: oldRecord.teacher_id || "", price: oldRecord.billing_type === "per_month" ? 0 : Number(oldRecord.price || 0),
                duration: oldRecord.duration_min || 30, permanentDay: String(newDay), time: newTime,
                forHowLong: 4, unit: "months", instrument: oldCourse, room: oldRecord.room || "",
              });
            }
          }
          setChangingTimeFor(null);
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
        // Same idea as the whole-student Temporary stop, scoped to just one
        // instrument — a student can keep Piano going while pausing Insta-
        // Chord, say. Matches lessons by instrument name, so it only ever
        // touches that one course's future lessons, never the other one's.
        // Removes every non-attended row from the date onward — scheduled,
        // absent, missed, needs-cover, cancelled — since "stop from August"
        // means nothing from August should be left pending, not just the
        // ones that hadn't happened yet. Attended lessons are the one
        // exception: that's real taught work with real pay attached to it,
        // so it's kept as history regardless of the stop date.
        const instrumentStopKey = stopModal?.scope === "instrument" ? stopModal.instrumentKey : null;
        const applyInstrumentStop = async (instrumentKey, fromMonth) => {
          const fromDate = `${fromMonth}-01`;
          const isPrimary = instrumentKey === "primary";
          const course = isPrimary ? s.course : data.studentInstruments.find((si) => si.id === instrumentKey)?.course;
          if (isPrimary) await supabase.from("students").update({ instrument_status: "paused" }).eq("id", s.id);
          else await supabase.from("student_instruments").update({ status: "paused" }).eq("id", instrumentKey);
          const toDelete = data.lessons.filter((l) => l.student_id === s.id && (l.instrument || "") === (course || "") && l.status !== "attended" && l.date >= fromDate);
          if (toDelete.length) await supabase.from("lessons").delete().in("id", toDelete.map((l) => l.id));
          setStopModal(null); refresh();
        };
        const applyInstrumentResume = async (instrumentKey, fromMonth) => {
          const fromDate = `${fromMonth}-01`;
          const isPrimary = instrumentKey === "primary";
          if (isPrimary) {
            await supabase.from("students").update({ instrument_status: "active" }).eq("id", s.id);
            if (s.course && s.permanent_day != null && s.permanent_time) {
              const rows = buildLessonSeriesRows({
                holidays: data.holidays, studentId: s.id, teacherId: s.teacher_id,
                price: s.billing_type === "per_month" ? 0 : Number(s.price || 0), duration: s.duration_min || 30,
                permanentDay: s.permanent_day, time: s.permanent_time.slice(0, 5), forHowLong: 4, unit: "months",
                instrument: s.course, room: s.room, startDate: fromDate,
              });
              if (rows.length) await supabase.from("lessons").insert(rows);
            }
          } else {
            const si = data.studentInstruments.find((x) => x.id === instrumentKey);
            await supabase.from("student_instruments").update({ status: "active" }).eq("id", instrumentKey);
            if (si?.course && si.permanent_day != null && si.permanent_time) {
              const rows = buildLessonSeriesRows({
                holidays: data.holidays, studentId: s.id, teacherId: si.teacher_id,
                price: si.billing_type === "per_month" ? 0 : Number(si.price || 0), duration: si.duration_min || 30,
                permanentDay: si.permanent_day, time: si.permanent_time.slice(0, 5), forHowLong: 4, unit: "months",
                instrument: si.course, room: si.room, startDate: fromDate,
              });
              if (rows.length) await supabase.from("lessons").insert(rows);
            }
          }
          setStopModal(null); refresh();
        };
        return (
          <>
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

            {s.is_trial && (
              <ResolveTrialPanel
                student={s} data={data} refresh={refresh}
                open={resolveTrialOpen} setOpen={setResolveTrialOpen}
                onDone={() => { setOpenStudent(null); refresh(); }}
              />
            )}

            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Instruments</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
              {s.course ? (
                <div style={{ border: "1px solid " + COLORS.border, borderRadius: 8, padding: "9px 12px", fontSize: 13 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div>
                      <strong>{s.course}</strong>{s.level ? ` · ${s.level}` : ""}
                      {s.instrument_status && s.instrument_status !== "active" && <Badge tone="amber" style={{ marginLeft: 6 }}>{INSTRUMENT_STATUS_LABEL[s.instrument_status]}</Badge>}
                      <div style={{ color: COLORS.inkSoft, fontSize: 12 }}>
                        {s.billing_type === "per_month" ? `${fmtMoney(s.monthly_rate || 0)}/month` : `${fmtMoney(s.price)}/lesson`}
                        {s.permanent_day != null && s.permanent_time ? ` · ${DAY_OPTIONS.find((d) => d.value === Number(s.permanent_day))?.label || ""} ${s.permanent_time.slice(0, 5)}${s.duration_min ? `–${addMinutes(s.permanent_time, s.duration_min)}` : ""}` : ""}
                        {s.teacher_id ? ` · ${data.teachers.find((t) => t.id === s.teacher_id)?.name || "Unassigned"}` : ""}
                        {s.room ? ` · ${s.room}` : ""}
                      </div>
                    </div>
                    <span style={{ display: "flex", gap: 10, flexShrink: 0 }}>
                      <a href="#" onClick={(e) => { e.preventDefault(); setChangingTimeFor("primary"); setChangeTimeForm({ day: s.permanent_day != null ? String(s.permanent_day) : "", time: s.permanent_time ? s.permanent_time.slice(0, 5) : "" }); }} style={{ color: COLORS.owner, fontSize: 12 }}>Change time</a>
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
                          status: s.instrument_status || "active",
                        });
                      }} style={{ color: COLORS.owner, fontSize: 12 }}>Edit</a>
                      {s.instrument_status === "paused" ? (
                        <a href="#" onClick={(e) => { e.preventDefault(); setStopModal({ scope: "instrument", instrumentKey: "primary", mode: "resume", month: todayIso().slice(0, 7) }); }} style={{ color: COLORS.owner, fontSize: 12 }}>Resume</a>
                      ) : (
                        <a href="#" onClick={(e) => { e.preventDefault(); setStopModal({ scope: "instrument", instrumentKey: "primary", mode: "stop", month: todayIso().slice(0, 7) }); }} style={{ color: COLORS.amberDark, fontSize: 12 }}>Temporary stop</a>
                      )}
                    </span>
                  </div>
                  {s.billing_type === "per_month" && !s.monthly_rate && (
                    <div style={{ fontSize: 12, color: COLORS.dangerDark, marginTop: 4 }}>No monthly rate set — fill it in via Edit above.</div>
                  )}
                  {stopModal && stopModal.scope === "instrument" && stopModal.instrumentKey === "primary" && (
                    <InstrumentStopPanel stopModal={stopModal} setStopModal={setStopModal} courseName={s.course} onStop={(m) => applyInstrumentStop("primary", m)} onResume={(m) => applyInstrumentResume("primary", m)} />
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
                      {si.status && si.status !== "active" && <Badge tone="amber" style={{ marginLeft: 6 }}>{INSTRUMENT_STATUS_LABEL[si.status]}</Badge>}
                      <div style={{ color: COLORS.inkSoft, fontSize: 12 }}>
                        {si.billing_type === "per_month" ? `${fmtMoney(si.monthly_rate || 0)}/month` : `${fmtMoney(si.price)}/lesson`}
                        {si.permanent_day != null && si.permanent_time ? ` · ${DAY_OPTIONS.find((d) => d.value === Number(si.permanent_day))?.label || ""} ${si.permanent_time.slice(0, 5)}${si.duration_min ? `–${addMinutes(si.permanent_time, si.duration_min)}` : ""}` : ""}
                        {si.teacher_id ? ` · ${data.teachers.find((t) => t.id === si.teacher_id)?.name || "Unassigned"}` : ""}
                        {si.room ? ` · ${si.room}` : ""}
                      </div>
                    </div>
                    <span style={{ display: "flex", gap: 10, flexShrink: 0 }}>
                      <a href="#" onClick={(e) => { e.preventDefault(); setChangingTimeFor(si.id); setChangeTimeForm({ day: si.permanent_day != null ? String(si.permanent_day) : "", time: si.permanent_time ? si.permanent_time.slice(0, 5) : "" }); }} style={{ color: COLORS.owner, fontSize: 12 }}>Change time</a>
                      <a href="#" onClick={(e) => {
                        e.preventDefault();
                        setAddSeriesOpen(false);
                        setEditingInstrument(si.id);
                        setSeriesForm({ ...emptySeriesForm, course: si.course || "", level: si.level || "", billingType: si.billing_type === "per_month" ? "month" : "lesson", monthlyRate: si.monthly_rate ?? "", price: si.price, teacherId: si.teacher_id || "", permanentDay: si.permanent_day != null ? String(si.permanent_day) : "", time: si.permanent_time ? si.permanent_time.slice(0, 5) : "", duration: si.duration_min || 30, room: si.room || "", status: si.status || "active" });
                      }} style={{ color: COLORS.owner, fontSize: 12 }}>Edit</a>
                      {si.status === "paused" ? (
                        <a href="#" onClick={(e) => { e.preventDefault(); setStopModal({ scope: "instrument", instrumentKey: si.id, mode: "resume", month: todayIso().slice(0, 7) }); }} style={{ color: COLORS.owner, fontSize: 12 }}>Resume</a>
                      ) : (
                        <a href="#" onClick={(e) => { e.preventDefault(); setStopModal({ scope: "instrument", instrumentKey: si.id, mode: "stop", month: todayIso().slice(0, 7) }); }} style={{ color: COLORS.amberDark, fontSize: 12 }}>Temporary stop</a>
                      )}
                    </span>
                  </div>
                  {stopModal && stopModal.scope === "instrument" && stopModal.instrumentKey === si.id && (
                    <InstrumentStopPanel stopModal={stopModal} setStopModal={setStopModal} courseName={si.course} onStop={(m) => applyInstrumentStop(si.id, m)} onResume={(m) => applyInstrumentResume(si.id, m)} />
                  )}
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
                  <Field label="Status">
                    <select value={seriesForm.status} onChange={(e) => setSeriesForm({ ...seriesForm, status: e.target.value })} style={inputStyle}>
                      <option value="active">Active</option>
                      <option value="terminated">Terminated</option>
                      <option value="graduated">Graduated</option>
                    </select>
                  </Field>
                </div>
                <div style={{ fontSize: 11.5, color: COLORS.inkSoft, marginTop: -6, marginBottom: 10 }}>For a temporary stop, use the "Temporary stop" link next to this instrument instead — it also handles removing and later regenerating the future lessons.</div>
                {!editingInstrument && <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 10 }}>Schedules stay topped up automatically — no need to pick a duration. Lessons will keep generating a few months ahead on their own.</div>}
                {editingInstrument && <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 10 }}>Changing the day or time will offer to move all of this instrument's upcoming lessons to the new slot. Changing just the teacher, room, or duration offers to update those on the existing lessons instead. Past/attended lessons are never touched either way.</div>}
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
                    <span style={{ display: "flex", gap: 8 }}>
                      <a href="#" onClick={(e) => { e.preventDefault(); setPlanEditId(p.id); setPlanForm({ date: p.date, what: p.what_to_teach, remarks: p.remarks || "" }); }} style={{ color: COLORS.owner, fontSize: 12 }}>Edit</a>
                      <a href="#" onClick={(e) => { e.preventDefault(); removePlan(p.id); }} style={{ color: COLORS.danger, fontSize: 12 }}>Remove</a>
                    </span>
                  </div>
                  <div>{p.what_to_teach}</div>
                  {p.remarks && <div style={{ color: COLORS.inkSoft, fontSize: 12 }}>{p.remarks}</div>}
                </div>
              ))}
              {plans.length === 0 && <div style={{ fontSize: 13, color: COLORS.inkSoft }}>Nothing planned yet — add the first item below.</div>}
            </div>
            <form onSubmit={savePlan} style={{ border: "1px solid " + (planEditId ? COLORS.owner : COLORS.border), borderRadius: 8, padding: 10, marginBottom: 20 }}>
              {planEditId && <div style={{ fontSize: 12, color: COLORS.owner, fontWeight: 600, marginBottom: 8 }}>Editing plan for {fmtDate(planForm.date)}</div>}
              <Field label="Date"><input type="date" required value={planForm.date} onChange={(e) => setPlanForm({ ...planForm, date: e.target.value })} style={inputStyle} /></Field>
              <Field label="What to teach"><textarea required value={planForm.what} onChange={(e) => setPlanForm({ ...planForm, what: e.target.value })} style={{ ...inputStyle, minHeight: 60 }} placeholder="e.g. C major scale, hands together, review last week's piece" /></Field>
              <Field label="Remarks"><textarea value={planForm.remarks} onChange={(e) => setPlanForm({ ...planForm, remarks: e.target.value })} style={{ ...inputStyle, minHeight: 40 }} placeholder="Optional" /></Field>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn type="submit" small variant="owner">{planEditId ? "Update" : "Add"}</Btn>
                {planEditId && <Btn type="button" small onClick={() => { setPlanEditId(null); setPlanForm({ date: todayIso(), what: "", remarks: "" }); }}>Cancel edit</Btn>}
              </div>
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
              {lessons.map((l) => {
                const originalForReplacement = l.replacement_of ? data.lessons.find((o) => o.id === l.replacement_of) : null;
                return (
                <div key={l.id} style={{ padding: "8px 0", borderTop: "1px solid " + COLORS.border, display: "flex", gap: 8 }}>
                  <input type="checkbox" checked={selectedLessons.includes(l.id)} onChange={() => toggle(l.id)} style={{ marginTop: 3 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                      <span>{fmtDate(l.date)} · {l.time.slice(0, 5)}–{addMinutes(l.time, l.duration_min || 30)}{l.instrument ? ` · ${l.instrument}` : ""}{l.room ? ` · ${l.room}` : ""}</span>
                      <Badge tone={statusTone(l.status)}>{lessonStatusLabel(l)}</Badge>
                    </div>
                    {originalForReplacement && (
                      <div style={{ color: COLORS.owner, fontSize: 11.5, marginTop: 2 }}>Replacing {fmtDate(originalForReplacement.date)} {originalForReplacement.time.slice(0, 5)}</div>
                    )}
                    <div style={{ display: "flex", gap: 10, marginTop: 4, fontSize: 12 }}>
                      <a href="#" onClick={(e) => { e.preventDefault(); setEditLesson(l); setEditLessonForm({ date: l.date, time: l.time.slice(0, 5), duration: l.duration_min || 30, price: l.price, instrument: l.instrument || "", room: l.room || "" }); }} style={{ color: COLORS.owner }}>Edit</a>
                      {l.status !== "cancelled" && <a href="#" onClick={(e) => { e.preventDefault(); cancelLesson(l.id); }} style={{ color: COLORS.amberDark }}>Cancel</a>}
                      {l.status === "cancelled" && <a href="#" onClick={(e) => { e.preventDefault(); uncancelLesson(l.id); }} style={{ color: COLORS.inkSoft }}>Undo</a>}
                      <a href="#" onClick={(e) => { e.preventDefault(); if (confirm("Remove this lesson? This can't be undone.")) removeLesson(l.id); }} style={{ color: COLORS.danger }}>Remove</a>
                    </div>
                  </div>
                </div>
                );
              })}
              {lessons.length === 0 && <div style={{ fontSize: 13, color: COLORS.inkSoft }}>No lessons on file.</div>}
            </div>
          </Modal>
          {changingTimeFor && (() => {
            const rec = changingTimeFor === "primary" ? s : data.studentInstruments.find((si) => si.id === changingTimeFor);
            return (
              <Modal title={`Change time — ${rec?.course || s.name}`} onClose={() => setChangingTimeFor(null)}>
                <form onSubmit={saveChangeTime}>
                  <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 12 }}>Upcoming lessons on the old slot will be replaced with new ones on this slot, about 4 months ahead. Past/attended lessons are never touched.</div>
                  <Field label="Day">
                    <select value={changeTimeForm.day} onChange={(e) => setChangeTimeForm({ ...changeTimeForm, day: e.target.value })} style={{ ...inputStyle, marginBottom: 10 }} required>
                      <option value="" disabled>Choose a day</option>
                      {DAY_OPTIONS.map((d) => (<option key={d.value} value={d.value}>{d.label}</option>))}
                    </select>
                  </Field>
                  <Field label="Time">
                    <input type="time" value={changeTimeForm.time} onChange={(e) => setChangeTimeForm({ ...changeTimeForm, time: e.target.value })} style={{ ...inputStyle, marginBottom: 12 }} required />
                  </Field>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Btn type="submit" variant="owner">Save new time</Btn>
                    <Btn type="button" onClick={() => setChangingTimeFor(null)}>Cancel</Btn>
                  </div>
                </form>
              </Modal>
            );
          })()}
          </>
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
          const patch = { status };
          if (status !== "paused") patch.paused_from = null;
          await supabase.from("students").update(patch).eq("id", s.id);
          setEditingStudent({ ...s, ...patch }); refresh();
        };
        // Temporary stop: wipes every non-attended lesson (all of the
        // student's instruments, not just the primary one) from the chosen
        // month onward — scheduled, absent, missed, needs-cover, cancelled,
        // all of it, since "stop from August" means nothing pending from
        // August should be left behind, not just what hadn't happened yet.
        // Attended lessons are kept regardless: that's real taught work with
        // real pay attached, not something a stop should erase. Also pauses
        // every instrument so the auto top-up won't quietly regenerate them.
        // Resume reverses it: flips everything back to active and
        // regenerates each instrument's weekly series fresh, starting from
        // whichever month is chosen — not from today, so a resume booked
        // for next month doesn't create lessons in the gap between now and
        // then.
        const studentInstruments = data.studentInstruments.filter((si) => si.student_id === s.id);
        const applyTemporaryStop = async (fromMonth) => {
          const fromDate = `${fromMonth}-01`;
          await supabase.from("students").update({ status: "paused", instrument_status: "paused", paused_from: fromDate }).eq("id", s.id);
          if (studentInstruments.length) await supabase.from("student_instruments").update({ status: "paused" }).in("id", studentInstruments.map((si) => si.id));
          const toDelete = data.lessons.filter((l) => l.student_id === s.id && l.status !== "attended" && l.date >= fromDate);
          if (toDelete.length) await supabase.from("lessons").delete().in("id", toDelete.map((l) => l.id));
          setStopModal(null); setEditingStudent(null); refresh();
        };
        const applyResume = async (fromMonth) => {
          const fromDate = `${fromMonth}-01`;
          await supabase.from("students").update({ status: "active", instrument_status: "active", paused_from: null }).eq("id", s.id);
          if (studentInstruments.length) await supabase.from("student_instruments").update({ status: "active" }).in("id", studentInstruments.map((si) => si.id));
          const rows = [];
          if (s.course && s.permanent_day != null && s.permanent_time) {
            rows.push(...buildLessonSeriesRows({
              holidays: data.holidays, studentId: s.id, teacherId: s.teacher_id,
              price: s.billing_type === "per_month" ? 0 : Number(s.price || 0), duration: s.duration_min || 30,
              permanentDay: s.permanent_day, time: s.permanent_time.slice(0, 5), forHowLong: 4, unit: "months",
              instrument: s.course, room: s.room, startDate: fromDate,
            }));
          }
          studentInstruments.forEach((si) => {
            if (si.course && si.permanent_day != null && si.permanent_time) {
              rows.push(...buildLessonSeriesRows({
                holidays: data.holidays, studentId: s.id, teacherId: si.teacher_id,
                price: si.billing_type === "per_month" ? 0 : Number(si.price || 0), duration: si.duration_min || 30,
                permanentDay: si.permanent_day, time: si.permanent_time.slice(0, 5), forHowLong: 4, unit: "months",
                instrument: si.course, room: si.room, startDate: fromDate,
              }));
            }
          });
          if (rows.length) await supabase.from("lessons").insert(rows);
          setStopModal(null); setEditingStudent(null); refresh();
        };
        return (
          <Modal title={`Edit ${s.name}`} onClose={() => setEditingStudent(null)}>
            <form onSubmit={save}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Student data</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                <Btn small type="button" variant={s.status === "active" || !s.status ? "teacher" : "default"} onClick={() => setStatus("active")}>Active</Btn>
                {s.status === "paused" ? (
                  <Btn small type="button" variant="teacher" onClick={() => setStopModal({ scope: "student", mode: "resume", month: todayIso().slice(0, 7) })}>Resume</Btn>
                ) : (
                  <Btn small type="button" variant="default" onClick={() => setStopModal({ scope: "student", mode: "stop", month: todayIso().slice(0, 7) })}>Temporary stop</Btn>
                )}
                <Btn small type="button" variant={s.status === "terminated" ? "teacher" : "default"} onClick={() => setStatus("terminated")}>Terminated</Btn>
                <Btn small type="button" variant={s.status === "graduated" ? "teacher" : "default"} onClick={() => setStatus("graduated")}>Graduated</Btn>
              </div>
              {s.status === "paused" && (
                <div style={{ fontSize: 12, color: COLORS.amberDark, marginBottom: 14 }}>
                  Temporarily stopped{s.paused_from ? ` from ${fmtDate(s.paused_from)}` : ""} — lessons from that date were removed (except any already attended) and the schedule is paused. Click Resume to pick it back up.
                </div>
              )}
              {stopModal && stopModal.scope === "student" && (
                <div style={{ marginBottom: 14, padding: 12, border: "1px solid " + COLORS.border, borderRadius: 8, background: "#FAF8F3" }}>
                  {stopModal.mode === "stop" ? (
                    <>
                      <div style={{ fontSize: 12.5, marginBottom: 8 }}>Stop from which month? Every lesson (all instruments) from the 1st of that month onward will be removed — scheduled, absent, missed, cancelled, all of it — except any already marked Attended, which stays as history. The weekly schedule will stop generating new ones until resumed.</div>
                      <input type="month" value={stopModal.month} onChange={(e) => setStopModal({ ...stopModal, month: e.target.value })} style={{ ...inputStyle, marginBottom: 8, width: 180 }} />
                      <div style={{ display: "flex", gap: 8 }}>
                        <Btn small variant="danger" type="button" onClick={() => applyTemporaryStop(stopModal.month)}>Confirm stop</Btn>
                        <Btn small type="button" onClick={() => setStopModal(null)}>Cancel</Btn>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 12.5, marginBottom: 8 }}>Resume from which month? The weekly schedule (all instruments, using their existing day/time) will be regenerated about 4 months ahead starting from the 1st of that month.</div>
                      <input type="month" value={stopModal.month} onChange={(e) => setStopModal({ ...stopModal, month: e.target.value })} style={{ ...inputStyle, marginBottom: 8, width: 180 }} />
                      <div style={{ display: "flex", gap: 8 }}>
                        <Btn small variant="teacher" type="button" onClick={() => applyResume(stopModal.month)}>Confirm resume</Btn>
                        <Btn small type="button" onClick={() => setStopModal(null)}>Cancel</Btn>
                      </div>
                    </>
                  )}
                </div>
              )}
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


// ==== extracted lines 3578-3635 ====
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


// ==== extracted lines 4108-4276 ====
function getHealthIssues(data) {
  const allInstruments = [];
  data.students.forEach((s) => {
    if (s.course) allInstruments.push({ studentId: s.id, studentName: s.name, course: s.course, level: s.level, billingType: s.billing_type, monthlyRate: s.monthly_rate, price: s.price, day: s.permanent_day, time: s.permanent_time, duration: s.duration_min, room: s.room, teacherId: s.teacher_id, isPrimary: true, status: s.instrument_status || "active" });
  });
  data.studentInstruments.forEach((si) => {
    const s = data.students.find((x) => x.id === si.student_id);
    allInstruments.push({ studentId: si.student_id, studentName: s?.name || "—", course: si.course, level: si.level, billingType: si.billing_type, monthlyRate: si.monthly_rate, price: si.price, day: si.permanent_day, time: si.permanent_time, duration: si.duration_min, room: si.room, teacherId: si.teacher_id, isPrimary: false, status: si.status || "active" });
  });

  // Only flag ACTIVE instruments — a paused/terminated/graduated instrument
  // is expected to have no schedule, no teacher, sometimes no rate. That's
  // not a data problem, it's the point of marking it stopped.
  const activeInstruments = allInstruments.filter((i) => i.status === "active");
  const noRate = activeInstruments.filter((i) => i.billingType === "per_month" ? !i.monthlyRate : !i.price);
  const notScheduled = activeInstruments.filter((i) => i.day == null || !i.time);
  const noTeacher = activeInstruments.filter((i) => !i.teacherId);

  // Almost every student is meant to be billed monthly — per-lesson is the
  // rare exception, not the norm. But a couple of places in the app (a
  // form's default value, a fallback when billing_type was never set at
  // all) quietly resolve to "per_lesson" unless someone actively chose
  // "per_month" — an easy thing to miss on a new instrument or an import.
  // This lists every active instrument currently billed per-lesson so it's
  // a quick visual check against how many are actually supposed to be.
  const perLessonInstruments = activeInstruments.filter((i) => i.billingType !== "per_month");

  const noInstrumentsAtAll = data.students.filter((s) => (s.status || "active") === "active" && !s.course && !data.studentInstruments.some((si) => si.student_id === s.id));

  const noPayoutRate = data.teachers.filter((t) => !t.rate || Number(t.rate) <= 0);

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

  const nameCounts = new Map();
  data.students.forEach((s) => { const key = s.name.trim().toLowerCase(); nameCounts.set(key, (nameCounts.get(key) || 0) + 1); });
  const possibleDuplicates = [...nameCounts.entries()].filter(([, count]) => count > 1);

  const levelsNoPrice = data.courseLevels.filter((l) => !l.default_price_child && !l.default_price_adult);

  // An active, scheduled instrument whose calendar lessons run out soon —
  // "For how long" only ever generates a fixed batch up front, so this is
  // the only thing that catches a schedule quietly going empty.
  const runningLow = [];
  activeInstruments.forEach((i) => {
    if (i.day == null || !i.time) return;
    const matching = data.lessons.filter((l) => l.student_id === i.studentId && (l.instrument || "") === i.course && l.status !== "cancelled");
    const lastDate = matching.length ? matching.map((l) => l.date).sort().slice(-1)[0] : null;
    const daysAhead = lastDate ? Math.floor((new Date(lastDate) - new Date(todayIso())) / 86400000) : -1;
    if (daysAhead < 42) runningLow.push({ ...i, lastDate });
  });

  // Duplicate lesson rows — same student, same teacher, same date/time/instrument,
  // more than one row. This is real duplicate data (not a display bug): it can come
  // from historical double-generation before the server-side top-up throttle existed,
  // or from any other retry/race that inserts a lesson twice. We only flag rows still
  // "live" (not cancelled/rescheduled) since a rescheduled original legitimately shares
  // its old slot's identity with nothing — it's been superseded, not duplicated.
  const dupGroups = new Map();
  data.lessons.forEach((l) => {
    if (l.status === "cancelled" || l.status === "rescheduled") return;
    const key = [l.student_id, l.teacher_id || "", l.date, l.time, l.instrument || ""].join("|");
    if (!dupGroups.has(key)) dupGroups.set(key, []);
    dupGroups.get(key).push(l);
  });
  const duplicateLessons = [...dupGroups.values()].filter((g) => g.length > 1);

  // Lessons whose actual date/time don't match the student's set weekly
  // schedule (permanent day/time on the instrument). Catches lessons that
  // got left behind on the wrong slot after a profile edit that wasn't (or
  // couldn't be) pushed through the app's own "move to new day/time" flow —
  // most commonly a bulk CSV update, which changes the profile field
  // directly and has no way to also touch already-generated calendar rows.
  // Deliberately: only looks at plain "scheduled" lessons (a needs-cover
  // request is a separate, actively-tracked thing — not ours to silently
  // touch here) and skips anything tied to a reschedule (replacement_of
  // set), since a makeup lesson is SUPPOSED to sit on a different day/time.
  // Grouped by instrument, not by individual lesson — one profile mismatch
  // can easily touch a dozen+ already-generated weeks, and the studio needs
  // "this instrument's schedule is stale" once, not one line per week.
  //
  // Skips any student+course combo where MORE THAN ONE active instrument
  // shares that exact course name (e.g. two separate weekly "Piano" slots).
  // Lessons only carry the course name, not which specific instrument row
  // they belong to, so there is no reliable way to tell the two schedules'
  // lessons apart — checking (or worse, "fixing") them would misattribute
  // one slot's lessons to the other and can destroy a legitimate second
  // weekly lesson. These need a human to sort out, not an automated check.
  const courseNameCounts = new Map();
  activeInstruments.forEach((i) => {
    const key = `${i.studentId}|${i.course}`;
    courseNameCounts.set(key, (courseNameCounts.get(key) || 0) + 1);
  });
  const mismatchGroups = new Map();
  activeInstruments.forEach((i) => {
    if (i.day == null || !i.time) return;
    if ((courseNameCounts.get(`${i.studentId}|${i.course}`) || 0) > 1) return;
    const expectedTime = (i.time || "").slice(0, 5);
    const future = data.lessons.filter((l) => l.student_id === i.studentId && (l.instrument || "") === i.course && l.status === "scheduled" && !l.replacement_of && !l.is_extra && l.date >= todayIso());
    const mismatched = future.filter((l) => new Date(l.date + "T00:00:00").getDay() !== i.day || (l.time || "").slice(0, 5) !== expectedTime);
    if (mismatched.length) {
      const key = `${i.studentId}|${i.course}|${i.isPrimary ? "primary" : "extra"}`;
      mismatchGroups.set(key, { ...i, expectedTime, lessons: mismatched.sort((a, b) => a.date.localeCompare(b.date)) });
    }
  });
  const scheduleMismatches = [...mismatchGroups.values()];
  // Surfaced separately, read-only — no "Fix" offered, since these can't be
  // safely auto-resolved. The studio can still open the student and use
  // "Change time" manually, which regenerates one slot at a time by hand.
  const ambiguousDuplicateNames = [...courseNameCounts.entries()].filter(([, count]) => count > 1).map(([key]) => {
    const [studentId, course] = key.split("|");
    return { studentId, course };
  });

  // A past bug in the reschedule flow created replacement lessons without
  // copying the original's instrument (and room) over — so a makeup slot for
  // e.g. "Insta-Chord" showed up blank, indistinguishable from a student's
  // other instrument if they take more than one. Fixed going forward; this
  // catches any replacement rows already created that bug's way.
  const replacementsMissingInstrument = data.lessons.filter((l) => {
    if (!l.replacement_of || l.instrument) return false;
    const original = data.lessons.find((o) => o.id === l.replacement_of);
    return original && original.instrument;
  });

  // A past bug in "Open for replacement"/"Fill this slot" left the old
  // cancelled placeholder sitting there instead of removing it once its slot
  // got used to cover a different missed lesson (fixed now — the placeholder
  // is deleted immediately at the time of filling). This can't be detected
  // for old data by any link back to the fill action itself, since that
  // link was never recorded by the old code — but a cancelled lesson and a
  // replacement lesson sharing the exact same student, date, and time is
  // the unambiguous fingerprint of exactly that: the replacement was
  // created FROM that slot, and the cancelled row is the leftover.
  const leftoverCancelledSlots = [];
  data.lessons.forEach((l) => {
    if (l.status !== "cancelled") return;
    const match = data.lessons.find((r) => r.id !== l.id && r.student_id === l.student_id && r.date === l.date && r.time === l.time && r.status === "scheduled" && r.replacement_of);
    if (match) leftoverCancelledSlots.push({ orphan: l, replacement: match });
  });

  // A lesson dated after today cannot possibly have happened yet — so
  // "Attended" on a future date is never legitimate, no matter how it got
  // there (a wrong dropdown choice on Backfill, a bad CSV import, anything).
  // This is a safe, general check rather than a one-off fix: it will catch
  // this same mistake again in the future too.
  const today = todayIso();
  const futureAttended = data.lessons.filter((l) => l.status === "attended" && l.date > today);

  const totalCount = noRate.length + notScheduled.length + noTeacher.length + noInstrumentsAtAll.length + noPayoutRate.length + casingIssues.length + possibleDuplicates.length + levelsNoPrice.length + duplicateLessons.length + scheduleMismatches.length + replacementsMissingInstrument.length + leftoverCancelledSlots.length + futureAttended.length + perLessonInstruments.length;

  return { allInstruments, activeInstruments, noRate, notScheduled, noTeacher, noInstrumentsAtAll, noPayoutRate, casingIssues, possibleDuplicates, levelsNoPrice, runningLow, duplicateLessons, scheduleMismatches, ambiguousDuplicateNames, replacementsMissingInstrument, leftoverCancelledSlots, futureAttended, perLessonInstruments, totalCount };
}

// One-off tool: fills in missing lesson history for a date range, using each
// active instrument's own weekly day/time — for when the app started being
// used partway through a month and the days before that have no lesson rows
// at all (so nothing to mark attended, nothing for payment calculations to
// see). Never touches a date that already has a lesson for that student +
// course — it only fills real gaps, so it's safe to run more than once or
// over a range that partially overlaps existing history.

// ==== extracted lines 5736-5800 ====
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
      <div style={{ fontSize: 11, color: COLORS.inkSoft, margin: "6px 0" }}>Prices here are the monthly rate for that level (not per lesson) — separate rates for children and adults. A Trial lesson booked at this grade automatically uses a quarter of the monthly rate as its one-off price.</div>
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


// ==== extracted lines 5801-5855 ====
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


export {
  loadAll,
  CalendarTab,
  TeachersTab,
  StudentsTab,
  CoursesCard,
  ReplacementsTab,
  getHealthIssues,
};
