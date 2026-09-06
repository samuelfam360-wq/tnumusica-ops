"use client";
export const dynamic = "force-dynamic";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import {
  COLORS, Badge, Btn, Card, Field, Modal, SegTabs, inputStyle,
  fmtDate, fmtMoney, todayIso, addDays, isoDate, earningsForLesson, resolveEarnings, statusTone, statusLabel, lessonStatusLabel,
  addMinutes, isoMonthDays, WEEKDAY_LABELS, findClashes, findWeeklyInstrumentClashes, studentBalance, studentOwed, effectiveLessonPrice,
  downloadDoc, generateDocPdf, studentInvoiceSummary, SearchableSelect, summarizeBookOrderItems, fetchAllRows, isLessonDelivered, summarizeTeaching, lessonPayLabel, rootLessonFor,
} from "../../lib/ui";
import { loadAll, CalendarTab, TeachersTab, StudentsTab, CoursesCard, ReplacementsTab } from "../../lib/adminTabs";

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

function monthlyDueDate(monthOrDate) {
  if (/^\d{4}-\d{2}$/.test(monthOrDate)) return `${monthOrDate}-07`;
  const d = new Date(monthOrDate + "T00:00:00");
  d.setMonth(d.getMonth() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-07`;
}

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

function DocTable({ rows, totalLabel, totalValue, note, emptyText = "Nothing to show yet." }) {
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
      {note && <div style={{ padding: "8px 2px 0", fontSize: 12, fontStyle: "italic", color: COLORS.inkSoft }}>{note}</div>}
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

const TEACHER_COLOR_PALETTE = ["#0F6E56", "#8A4B08", "#4C3D8F", "#A02B5A", "#1E6091", "#7A5C00", "#B0413E", "#2E7D32"];
function colorForTeacher(id) {
  if (!id) return "#8A8474";
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return TEACHER_COLOR_PALETTE[hash % TEACHER_COLOR_PALETTE.length];
}

function DashboardTab({ data, setTab, refresh }) {
  const [month, setMonth] = useState(todayIso().slice(0, 7));
  const today = todayIso();

  const monthLessons = data.lessons.filter((l) => l.date.slice(0, 7) === month);
  const statusCounts = {};
  monthLessons.forEach((l) => { statusCounts[l.status] = (statusCounts[l.status] || 0) + 1; });

  const activeStudents = data.students.filter((s) => s.status === "active" || !s.status);
  const studentsWithNoLessonThisMonth = activeStudents.filter((s) => !monthLessons.some((l) => l.student_id === s.id));

  const { totalCount: healthIssueCount } = getHealthIssues(data);

  const needsReschedule = data.lessons.filter((l) => l.status === "missed-teacher" || l.status === "missed-student");
  const awaitingDecision = data.lessons.filter((l) => l.status === "absent");
  const needsCover = data.lessons.filter((l) => l.status === "needs-cover");

  const monthInvoices = data.invoices.filter((i) => i.month === month || (i.date && i.date.slice(0, 7) === month));
  const invoiceDueDate = (i) => i.due_date || monthlyDueDate(i.month || i.date);
  const overdueInvoices = data.invoices.filter((i) => i.status !== "paid" && invoiceDueDate(i) < today);
  const overdueTotal = overdueInvoices.reduce((sum, i) => sum + Number(i.total || 0), 0);
  const unpaidInvoices = data.invoices.filter((i) => i.status !== "paid");
  const unpaidTotal = unpaidInvoices.reduce((sum, i) => sum + Number(i.total || 0), 0);

  const todayLessons = data.lessons.filter((l) => l.date === today);
  const teachersBlockedToday = data.blockedDates.filter((b) => b.date === today);
  const holidayToday = data.holidays.find((h) => h.date === today);

  let pendingAmt = 0; let paidAmt = 0; let blockedAmt = 0;
  data.teachers.forEach((t) => {
    // Every lesson row a teacher's own name sits on is judged by its own
    // status — a replacement lesson someone else covered for them never
    // shows up here (its teacher_id is the covering teacher's), and a
    // replacement lesson THIS teacher covered for someone else does, paid
    // to them. The original missed-teacher row is never itself paid —
    // only used to flag it as blocked until covered.
    const own = data.lessons.filter((l) => l.teacher_id === t.id);
    const earn = (l) => resolveEarnings(l, data.students.find((s) => s.id === l.student_id), t, data.teacherRates, data.lessons, data.studentInstruments);
    own.forEach((l) => {
      if (l.paid) { paidAmt += earn(l); return; }
      if (l.status === "attended" || l.status === "missed-student") { pendingAmt += earn(l); return; }
      if (l.status === "missed-teacher") { if (!isLessonDelivered(l, data.lessons)) blockedAmt += earn(l); return; }
      if (["absent", "cancelled"].includes(l.status)) blockedAmt += earn(l);
    });
  });

  const StatCard = ({ label, value, sub, tone, onClick }) => (
    <div onClick={onClick} style={{ padding: "12px 14px", borderRadius: 10, background: tone ? COLORS[tone + "Bg"] || "#fff" : "#fff", border: "1px solid " + COLORS.border, cursor: onClick ? "pointer" : "default", flex: "1 1 140px" }}>
      <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: tone ? COLORS[tone + "Dark"] || COLORS.ink : COLORS.ink }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: COLORS.inkSoft, marginTop: 2 }}>{sub}</div>}
    </div>
  );

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Today — {fmtDate(today)}</div>
        {holidayToday && <div style={{ fontSize: 13, color: COLORS.dangerDark, marginBottom: 6 }}>Studio closed — {holidayToday.reason || "Public holiday"}</div>}
        {teachersBlockedToday.length > 0 && (
          <div style={{ fontSize: 13, color: COLORS.amberDark, marginBottom: 6 }}>
            Unavailable today: {teachersBlockedToday.map((b) => data.teachers.find((t) => t.id === b.teacher_id)?.name || "—").join(", ")}
          </div>
        )}
        <div style={{ fontSize: 13, color: COLORS.inkSoft }}>{todayLessons.length} lesson{todayLessons.length === 1 ? "" : "s"} on the calendar today</div>
      </Card>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Data-entry check</div>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ ...inputStyle, width: 150, padding: "4px 8px", fontSize: 12.5 }} />
      </div>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 10 }}>{monthLessons.length} lesson row(s) exist for {month}, across {new Set(monthLessons.map((l) => l.student_id)).size} student(s).</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          {Object.entries(statusCounts).sort((a, b) => b[1] - a[1]).map(([status, count]) => (
            <Badge key={status} tone={statusTone(status)}>{statusLabel(status)}: {count}</Badge>
          ))}
          {monthLessons.length === 0 && <span style={{ fontSize: 13, color: COLORS.dangerDark }}>No lessons at all exist for {month} yet.</span>}
        </div>
        {studentsWithNoLessonThisMonth.length > 0 && (
          <div style={{ fontSize: 12.5, color: COLORS.dangerDark }}>
            {studentsWithNoLessonThisMonth.length} active student(s) have no lesson at all in {month} — worth checking they're not missing from the backfill: {studentsWithNoLessonThisMonth.slice(0, 8).map((s) => s.name).join(", ")}{studentsWithNoLessonThisMonth.length > 8 ? `, +${studentsWithNoLessonThisMonth.length - 8} more` : ""}.
          </div>
        )}
        <div style={{ fontSize: 12, color: COLORS.inkSoft, marginTop: 8 }}>{monthInvoices.length} invoice(s) raised for {month}, totaling {fmtMoney(monthInvoices.reduce((sum, i) => sum + Number(i.total || 0), 0))}.</div>
      </Card>

      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Needs attention</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <StatCard label="Health Check issues" value={healthIssueCount} tone={healthIssueCount > 0 ? "danger" : "success"} onClick={() => setTab("health")} />
        <StatCard label="Needs rescheduling" value={needsReschedule.length} tone={needsReschedule.length > 0 ? "amber" : "success"} onClick={() => setTab("calendar")} />
        <StatCard label="Awaiting a decision" value={awaitingDecision.length} tone={awaitingDecision.length > 0 ? "amber" : "success"} onClick={() => setTab("calendar")} />
        <StatCard label="Open for cover" value={needsCover.length} tone={needsCover.length > 0 ? "amber" : "success"} onClick={() => setTab("calendar")} />
      </div>

      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Money</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <StatCard label="Teacher pay — pending" value={fmtMoney(pendingAmt)} tone="amber" onClick={() => setTab("payments")} />
        <StatCard label="Teacher pay — paid" value={fmtMoney(paidAmt)} tone="success" onClick={() => setTab("payments")} />
        <StatCard label="Teacher pay — blocked" value={fmtMoney(blockedAmt)} sub={`${[...new Set(data.lessons.filter((l) => !l.paid && (["absent", "cancelled"].includes(l.status) || (l.status === "missed-teacher" && !isLessonDelivered(l, data.lessons)))).map((l) => l.id))].length} lesson(s)`} tone="danger" onClick={() => setTab("payments")} />
        <StatCard label="Invoices unpaid" value={fmtMoney(unpaidTotal)} sub={`${unpaidInvoices.length} invoice(s)`} tone="amber" onClick={() => setTab("fees")} />
        <StatCard label="Invoices overdue" value={fmtMoney(overdueTotal)} sub={`${overdueInvoices.length} invoice(s)`} tone={overdueInvoices.length > 0 ? "danger" : "success"} onClick={() => setTab("fees")} />
      </div>
    </div>
  );
}

const INSTRUMENT_STATUS_LABEL = { active: "Active", paused: "Temporary stop", terminated: "Terminated", graduated: "Graduated" };

// Inline stop/resume panel for a single instrument — same month-picker
// pattern as the whole-student version, just scoped to one course so a
// student can keep one instrument going while pausing another.
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
function PaymentsTab({ data, refresh }) {
  const [voucherTeacher, setVoucherTeacher] = useState(null);
  const [voucherMonth, setVoucherMonth] = useState(todayIso().slice(0, 7));
  const [voucherAllTime, setVoucherAllTime] = useState(false);
  const [upfrontPickerFor, setUpfrontPickerFor] = useState(null);
  const [upfrontPick, setUpfrontPick] = useState("");
  const [blockedMonth, setBlockedMonth] = useState(todayIso().slice(0, 7));
  const [summaryMonth, setSummaryMonth] = useState(todayIso().slice(0, 7));
  const [summaryAllTime, setSummaryAllTime] = useState(false);
  const markPaid = async (lessonId, paid) => { await supabase.from("lessons").update({ paid, is_upfront_payment: false }).eq("id", lessonId); refresh(); };
  const markUpfront = async (lessonId) => { await supabase.from("lessons").update({ paid: true, is_upfront_payment: true }).eq("id", lessonId); refresh(); };
  const undoUpfront = async (lessonId) => { await supabase.from("lessons").update({ paid: false, is_upfront_payment: false }).eq("id", lessonId); refresh(); };
  const markAllPending = async (teacherId) => {
    const ids = data.lessons.filter((l) => l.teacher_id === teacherId && !l.paid && (l.status === "attended" || l.status === "missed-student")).map((l) => l.id);
    if (ids.length) { await supabase.from("lessons").update({ paid: true }).in("id", ids); refresh(); }
  };
  const markStudentPaid = async (ids) => { if (ids.length) { await supabase.from("lessons").update({ paid: true }).in("id", ids); refresh(); } };
  const studentOf = (id) => data.students.find((s) => s.id === id);
  const teacherName = (id) => data.teachers.find((t) => t.id === id)?.name || "—";
  const earn = (l, t) => resolveEarnings(l, studentOf(l.student_id), t, data.teacherRates, data.lessons, data.studentInstruments);
  const missingRateStudents = data.students.filter((s) => s.billing_type === "per_month" && !s.monthly_rate && data.lessons.some((l) => l.student_id === s.id && ["attended", "missed-student"].includes(l.status)));

  const groupByStudent = (lessons, t) => {
    const map = new Map();
    lessons.forEach((l) => {
      if (!map.has(l.student_id)) map.set(l.student_id, []);
      map.get(l.student_id).push(l);
    });
    return [...map.entries()].map(([studentId, ls]) => ({
      studentId, lessons: ls.sort((a, b) => a.date.localeCompare(b.date)),
      total: ls.reduce((sum, l) => sum + earn(l, t), 0),
    })).sort((a, b) => (studentOf(a.studentId)?.name || "").localeCompare(studentOf(b.studentId)?.name || ""));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {missingRateStudents.length > 0 && (
        <Card style={{ background: COLORS.dangerBg, border: "none" }}>
          <div style={{ fontSize: 13, color: COLORS.dangerDark, fontWeight: 600 }}>
            {missingRateStudents.map((s) => s.name).join(", ")} {missingRateStudents.length === 1 ? "has" : "have"} attended lessons but no monthly rate set — payouts for {missingRateStudents.length === 1 ? "them" : "these"} will show RM 0 until you fill it in (Students tab → Edit).
          </div>
        </Card>
      )}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Teaching summary — each teacher's mix below</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="month" value={summaryMonth} onChange={(e) => setSummaryMonth(e.target.value)} disabled={summaryAllTime} style={{ ...inputStyle, width: 150, padding: "4px 8px", fontSize: 12.5, opacity: summaryAllTime ? 0.5 : 1 }} />
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12.5 }}>
              <input type="checkbox" checked={summaryAllTime} onChange={(e) => setSummaryAllTime(e.target.checked)} /> All time
            </label>
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: COLORS.inkSoft, marginTop: 4 }}>Covers the same lessons the pending/paid totals below are built from — attended and delivered replacements, whichever teacher actually taught them.</div>
      </Card>
      {data.teachers.map((t) => {
        // Normal earnings: any lesson row this teacher's own name is on,
        // judged by that row's own status — attended or missed-student
        // means it was actually delivered, by them, and pays out to them.
        // A lesson they missed and someone else covered shows up under the
        // COVERING teacher instead, on the replacement row that carries
        // their teacher_id — never credited back to the original teacher.
        // The original missed-teacher row itself is never directly paid;
        // it only matters for the "blocked" list below, until covered.
        const payableNow = data.lessons.filter((l) => l.teacher_id === t.id && (l.status === "attended" || l.status === "missed-student"));
        const pending = payableNow.filter((l) => !l.paid);
        const paid = data.lessons.filter((l) => l.teacher_id === t.id && l.paid);
        // "cancelled" here means genuinely needs-a-decision cancellations —
        // a holiday closure isn't a decision pending, it's already fully
        // resolved (no lesson, no replacement, no pay), so those are left
        // out entirely rather than cluttering this list with non-issues.
        const isHolidayCancellation = (l) => l.status === "cancelled" && data.holidays.some((h) => h.date === l.date && l.reason === (h.reason || "Public holiday"));
        const blocked = data.lessons.filter((l) => l.teacher_id === t.id && !l.paid && !isHolidayCancellation(l) && (["absent", "cancelled"].includes(l.status) || (l.status === "missed-teacher" && !isLessonDelivered(l, data.lessons))));
        const blockedAllMonths = [...new Set(blocked.map((l) => l.date.slice(0, 7)))].sort();
        const blockedThisMonth = blocked.filter((l) => l.date.slice(0, 7) === blockedMonth);
        const pendingAmt = pending.reduce((sum, l) => sum + earn(l, t), 0);
        const paidAmt = paid.reduce((sum, l) => sum + earn(l, t), 0);
        const thisYear = todayIso().slice(0, 4);
        const upfrontThisYear = data.lessons.filter((l) => l.teacher_id === t.id && l.is_upfront_payment && l.date.slice(0, 4) === thisYear);
        const rates = data.teacherRates.filter((r) => r.teacher_id === t.id);
        const pendingGroups = groupByStudent(pending, t);
        const paidGroups = groupByStudent(paid, t);
        return (
          <Card key={t.id}>
          <details>
            <summary style={{ cursor: "pointer", listStyle: "none" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{t.name}</div>
                <div style={{ fontSize: 12, color: COLORS.inkSoft }}>Default: {t.pay_type === "flat" ? `${fmtMoney(t.rate)} / lesson` : `${t.rate}% of lesson price`}</div>
                {rates.length > 0 && (
                  <div style={{ fontSize: 12, color: COLORS.inkSoft, marginTop: 2 }}>
                    {rates.map((r) => (<span key={r.id} style={{ marginRight: 8 }}>{r.instrument || r.course}{r.level ? ` (${r.level})` : ""}: {r.pay_type === "flat" ? fmtMoney(r.rate) : `${r.rate}%`}</span>))}
                  </div>
                )}
                {upfrontThisYear.length > 0 && (
                  <div style={{ fontSize: 12, color: COLORS.amberDark, marginTop: 4 }}>{upfrontThisYear.length} upfront payment{upfrontThisYear.length > 1 ? "s" : ""} given in {thisYear} — {fmtMoney(upfrontThisYear.reduce((sum, l) => sum + earn(l, t), 0))}</div>
                )}
              </div>
              <div style={{ display: "flex", gap: 18 }}>
                <div><div style={{ fontSize: 12, color: COLORS.inkSoft }}>Pending</div><div style={{ fontWeight: 700, color: COLORS.amber }}>{fmtMoney(pendingAmt)}</div></div>
                <div><div style={{ fontSize: 12, color: COLORS.inkSoft }}>Paid</div><div style={{ fontWeight: 700, color: COLORS.success }}>{fmtMoney(paidAmt)}</div></div>
              </div>
            </div>
            </summary>
            <div style={{ marginTop: 10 }}>
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
              return summaryLessons.length > 0 ? (
                <div style={{ display: "flex", gap: 20, flexWrap: "wrap", padding: "10px 0", borderTop: "1px solid " + COLORS.border, marginBottom: 4 }}>
                  <MiniTable label="By level" rows={byLevel} />
                  <MiniTable label="By duration" rows={byDuration} />
                  <MiniTable label="By instrument" rows={byInstrument} />
                  <MiniTable label="By category" rows={byCategory} />
                </div>
              ) : (
                <div style={{ fontSize: 12, color: COLORS.inkSoft, padding: "8px 0", borderTop: "1px solid " + COLORS.border, marginBottom: 4 }}>No taught lessons {summaryAllTime ? "on record" : `in ${summaryMonth}`}.</div>
              );
            })()}
            {pendingGroups.length > 0 && (
              <div>
                {pendingGroups.map((g) => {
                  const s = studentOf(g.studentId);
                  const instruments = [...new Set(g.lessons.map((l) => l.instrument).filter(Boolean))];
                  return (
                    <details key={g.studentId} style={{ borderTop: "1px solid " + COLORS.border, padding: "8px 0" }}>
                      <summary style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, listStyle: "none" }}>
                        <span>{s?.name || "—"}{instruments.length ? ` (${instruments.join(", ")})` : ""} · {g.lessons.length} lesson{g.lessons.length > 1 ? "s" : ""}
                          {g.lessons.some((l) => l.replacement_of && rootLessonFor(l, data.lessons).date.slice(0, 7) !== l.date.slice(0, 7)) && (
                            <Badge tone="danger" style={{ marginLeft: 6 }}>Includes early replacement(s) for a different month</Badge>
                          )}
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <strong>{fmtMoney(g.total)}</strong>
                          <Btn small onClick={(e) => { e.preventDefault(); markStudentPaid(g.lessons.map((l) => l.id)); }}>Mark all paid</Btn>
                        </span>
                      </summary>
                      <div style={{ marginTop: 6, paddingLeft: 10 }}>
                        {(() => {
                          // Same date appearing more than once among otherwise
                          // plain, unlabeled lessons is the fingerprint of the
                          // old "+Add lesson" bug (removed now) — a genuine
                          // added session with no record of being extra or a
                          // replacement. Flagged as a guess for a human to
                          // resolve (mark it Extra, or link it as a
                          // replacement), never auto-corrected.
                          const dateCounts = new Map();
                          g.lessons.forEach((l) => {
                            if (l.replacement_of || l.is_extra || l.is_trial_lesson) return;
                            const key = l.date + "|" + (l.instrument || "");
                            dateCounts.set(key, (dateCounts.get(key) || 0) + 1);
                          });
                          return g.lessons.map((l) => {
                            const cat = lessonPayLabel(l, data.lessons);
                            const root = l.replacement_of ? rootLessonFor(l, data.lessons) : null;
                            const rootMonth = root ? root.date.slice(0, 7) : null;
                            const ownMonth = l.date.slice(0, 7);
                            const countsElsewhere = root && rootMonth !== ownMonth;
                            const dateKey = l.date + "|" + (l.instrument || "");
                            const possiblyUnlabeledExtra = !l.replacement_of && !l.is_extra && !l.is_trial_lesson && (dateCounts.get(dateKey) || 0) > 1;
                            return (
                              <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", fontSize: 12.5 }}>
                                <span>
                                  {fmtDate(l.date)}{l.instrument && instruments.length > 1 ? ` · ${l.instrument}` : ""}
                                  {l.replacement_of && <Badge tone={cat === "Cover" ? "owner" : "gray"} style={{ marginLeft: 6 }}>{cat === "Cover" ? `Cover for ${teacherName(root?.teacher_id)}, replacing ${fmtDate(root?.date)}` : `Replacement for ${fmtDate(root?.date)}`}</Badge>}
                                  {cat === "Extra" && <Badge tone="success" style={{ marginLeft: 6 }}>Extra</Badge>}
                                  {cat === "Trial" && <Badge tone="amber" style={{ marginLeft: 6 }}>Trial</Badge>}
                                  {countsElsewhere && <Badge tone="danger" style={{ marginLeft: 6 }}>Counts toward {new Date(rootMonth + "-01").toLocaleDateString("en-GB", { month: "short", year: "numeric" })}</Badge>}
                                  {possiblyUnlabeledExtra && <Badge tone="danger" style={{ marginLeft: 6 }}>Unlabeled — likely an old added lesson, check it</Badge>}
                                  {l.status === "missed-teacher" && <Badge tone="amber" style={{ marginLeft: 6 }}>Replacement completed</Badge>}
                                  {l.status === "missed-student" && <Badge tone="amber" style={{ marginLeft: 6 }}>Student missed</Badge>}
                                </span>
                                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  <span style={{ color: COLORS.inkSoft }}>{fmtMoney(effectiveLessonPrice(l, s, data.lessons, data.studentInstruments))} lesson</span>
                                  <strong>{fmtMoney(earn(l, t))}</strong>
                                  <Btn small onClick={() => markPaid(l.id, true)}>Mark paid</Btn>
                                </span>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </details>
                  );
                })}
                <Btn small variant="owner" style={{ marginTop: 8 }} onClick={() => markAllPending(t.id)}>Mark all as paid</Btn>
              </div>
            )}
            {pendingGroups.length === 0 && payableNow.length > 0 && <div style={{ fontSize: 13, color: COLORS.inkSoft }}>All caught up — nothing pending.</div>}
            {payableNow.length === 0 && <div style={{ fontSize: 13, color: COLORS.inkSoft }}>No earned lessons yet.</div>}

            {blocked.length > 0 && (
              <div style={{ marginTop: 12, padding: 10, background: COLORS.amberBg, borderRadius: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
                  <div style={{ fontSize: 12.5, color: COLORS.amberDark, fontWeight: 600 }}>Not normally earned yet — not yet paid</div>
                  <input type="month" value={blockedMonth} onChange={(e) => setBlockedMonth(e.target.value)} style={{ ...inputStyle, width: 150, padding: "4px 8px", fontSize: 12.5 }} />
                </div>
                <div style={{ fontSize: 11.5, color: COLORS.amberDark, marginBottom: 8 }}>Absent (awaiting a decision), cancelled, or teacher-missed and still waiting on its replacement to happen — none of these have triggered a normal payment. Pay upfront if management wants to pay the teacher anyway; it's flagged separately on the voucher.</div>
                {blockedThisMonth.length > 0 ? (
                  <>
                    {blockedThisMonth.map((l) => (
                      <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", fontSize: 12.5 }}>
                        <span>{fmtDate(l.date)} · {studentOf(l.student_id)?.name}{l.instrument ? ` (${l.instrument})` : ""} · <span style={{ color: COLORS.inkSoft }}>{statusLabel(l.status)}</span></span>
                        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <strong>{fmtMoney(earn(l, t))}</strong>
                          <Btn small onClick={() => markUpfront(l.id)}>Pay upfront</Btn>
                        </span>
                      </div>
                    ))}
                    <Btn small variant="danger" style={{ marginTop: 8 }} onClick={() => { if (confirm(`Pay upfront for all ${blockedThisMonth.length} lesson(s) shown for ${blockedMonth}?`)) blockedThisMonth.forEach((l) => markUpfront(l.id)); }}>
                      Pay upfront for all {blockedThisMonth.length} shown
                    </Btn>
                  </>
                ) : (
                  <div style={{ fontSize: 12.5, color: COLORS.amberDark }}>
                    Nothing for {blockedMonth}.{blockedAllMonths.length > 0 ? ` Other months with items: ${blockedAllMonths.join(", ")}.` : ""}
                  </div>
                )}
              </div>
            )}

            {upfrontPickerFor === t.id ? (() => {
              const upcoming = data.lessons
                .filter((l) => l.teacher_id === t.id && !l.replacement_of && l.status === "scheduled" && l.date >= todayIso())
                .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
              const picked = upcoming.find((l) => l.id === upfrontPick);
              return (
                <div style={{ marginTop: 12, padding: 10, border: "1px solid " + COLORS.border, borderRadius: 8 }}>
                  <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 8 }}>Pay for a lesson that hasn't happened yet — it'll be marked paid upfront and excluded from the normal pending list once it's taught.</div>
                  <select value={upfrontPick} onChange={(e) => setUpfrontPick(e.target.value)} style={{ ...inputStyle, marginBottom: 8 }}>
                    <option value="">Select an upcoming lesson…</option>
                    {upcoming.map((l) => (
                      <option key={l.id} value={l.id}>{fmtDate(l.date)} {l.time.slice(0, 5)} — {studentOf(l.student_id)?.name}{l.instrument ? ` (${l.instrument})` : ""} — {fmtMoney(earn(l, t))}</option>
                    ))}
                  </select>
                  {upcoming.length === 0 && <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 8 }}>No upcoming scheduled lessons for this teacher.</div>}
                  <div style={{ display: "flex", gap: 8 }}>
                    <Btn small variant="owner" disabled={!picked} onClick={() => { markUpfront(upfrontPick); setUpfrontPickerFor(null); setUpfrontPick(""); }}>Pay upfront{picked ? ` — ${fmtMoney(earn(picked, t))}` : ""}</Btn>
                    <Btn small onClick={() => { setUpfrontPickerFor(null); setUpfrontPick(""); }}>Cancel</Btn>
                  </div>
                </div>
              );
            })() : (
              <a href="#" onClick={(e) => { e.preventDefault(); setUpfrontPickerFor(t.id); setUpfrontPick(""); }} style={{ fontSize: 12, color: COLORS.owner, display: "inline-block", marginTop: 10 }}>Pay upfront for an upcoming lesson…</a>
            )}

            {paidGroups.length > 0 && (
              <details style={{ marginTop: 10 }}>
                <summary style={{ fontSize: 12, color: COLORS.owner, cursor: "pointer" }}>Paid lessons ({paid.length})</summary>
                <div style={{ marginTop: 6 }}>
                  {paidGroups.map((g) => {
                    const s = studentOf(g.studentId);
                    const regular = g.lessons.filter((l) => !l.is_upfront_payment);
                    const upfront = g.lessons.filter((l) => l.is_upfront_payment);
                    return (
                      <div key={g.studentId} style={{ borderTop: "1px solid " + COLORS.border, padding: "8px 0" }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>{s?.name || "—"}</div>
                        {regular.length > 0 && (
                          <div style={{ marginBottom: upfront.length > 0 ? 8 : 0 }}>
                            <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 2 }}>{regular.length} lesson{regular.length > 1 ? "s" : ""} — {fmtMoney(regular.reduce((sum, l) => sum + earn(l, t), 0))}</div>
                            {regular.map((l) => (
                              <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0 4px 10px", fontSize: 12.5 }}>
                                <span>{fmtDate(l.date)}{l.instrument ? ` · ${l.instrument}` : ""}</span>
                                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  <strong>{fmtMoney(earn(l, t))}</strong>
                                  <Btn small onClick={() => markPaid(l.id, false)}>Undo</Btn>
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        {upfront.length > 0 && (
                          <div>
                            <div style={{ fontSize: 12, color: COLORS.amberDark, marginBottom: 2 }}>{upfront.length} upfront payment{upfront.length > 1 ? "s" : ""} — {fmtMoney(upfront.reduce((sum, l) => sum + earn(l, t), 0))}</div>
                            {upfront.map((l) => (
                              <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0 4px 10px", fontSize: 12.5 }}>
                                <span>{fmtDate(l.date)}{l.instrument ? ` · ${l.instrument}` : ""} <Badge tone="amber" style={{ marginLeft: 6 }}>{statusLabel(l.status)}</Badge></span>
                                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  <strong>{fmtMoney(earn(l, t))}</strong>
                                  <Btn small onClick={() => undoUpfront(l.id)}>Undo</Btn>
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </details>
            )}
            {paid.length > 0 && <Btn small style={{ marginTop: 10 }} onClick={() => setVoucherTeacher(t.id)}>Payment voucher</Btn>}
            </div>
          </details>
          </Card>
        );
      })}

      {voucherTeacher && (() => {
        const t = data.teachers.find((x) => x.id === voucherTeacher);
        // A lesson counts toward THIS voucher's month based on the original
        // slot it belongs to (via rootLessonFor) — an early replacement for
        // a future month's missed lesson stays off this voucher even once
        // it's been marked paid, and shows up on that future month's
        // voucher instead. Trial and Extra lessons aren't tied to any
        // particular monthly cycle, so they're matched by their own date.
        const belongsToVoucherMonth = (l) => {
          if (l.is_extra || l.is_trial_lesson) return l.date.slice(0, 7) === voucherMonth;
          return rootLessonFor(l, data.lessons).date.slice(0, 7) === voucherMonth;
        };
        const paidLessons = data.lessons.filter((l) => l.teacher_id === voucherTeacher && l.paid && (voucherAllTime || belongsToVoucherMonth(l)));
        const total = paidLessons.reduce((sum, l) => sum + earn(l, t), 0);
        // The voucher itself stays deliberately high-level: itemized rows for
        // ordinary earned lessons (per student), but upfront payments are
        // never broken out by student/lesson here — just folded into one
        // summary note below the total. Anyone wanting the per-lesson upfront
        // detail uses the in-app breakdown above, not the printed voucher.
        const regularLessons = paidLessons.filter((l) => !l.is_upfront_payment);
        const upfrontLessons = paidLessons.filter((l) => l.is_upfront_payment);
        const grouped = new Map();
        regularLessons.forEach((l) => {
          if (!grouped.has(l.student_id)) grouped.set(l.student_id, []);
          grouped.get(l.student_id).push(l);
        });
        const rows = [...grouped.entries()]
          .sort((a, b) => (studentOf(a[0])?.name || "").localeCompare(studentOf(b[0])?.name || ""))
          .map(([studentId, ls]) => {
            const groupTotal = ls.reduce((sum, l) => sum + earn(l, t), 0);
            const name = studentOf(studentId)?.name || "—";
            return { label: `${name} — ${ls.length} lesson${ls.length > 1 ? "s" : ""}`, value: fmtMoney(groupTotal) };
          });
        const upfrontTotal = upfrontLessons.reduce((sum, l) => sum + earn(l, t), 0);
        const note = upfrontLessons.length > 0
          ? `Includes ${upfrontLessons.length} upfront payment${upfrontLessons.length > 1 ? "s" : ""} (${fmtMoney(upfrontTotal)}) paid ahead of the usual schedule.`
          : null;
        const meta = [{ label: "Paid to", value: t.name }, { label: "Date", value: fmtDate(todayIso()) }, { label: "For", value: voucherAllTime ? "All time" : new Date(voucherMonth + "-01").toLocaleDateString("en-GB", { month: "long", year: "numeric" }) }];
        return (
          <Modal title="Payment Voucher" onClose={() => setVoucherTeacher(null)}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
              <input type="month" value={voucherMonth} onChange={(e) => setVoucherMonth(e.target.value)} disabled={voucherAllTime} style={{ ...inputStyle, width: 150, opacity: voucherAllTime ? 0.5 : 1 }} />
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12.5 }}>
                <input type="checkbox" checked={voucherAllTime} onChange={(e) => setVoucherAllTime(e.target.checked)} /> All time
              </label>
            </div>
            <div style={{ border: "1px solid " + COLORS.border, borderRadius: 10, padding: 18, background: "#FCFBF8" }}>
            <DocHeader settings={data.settings} docType="PAYMENT VOUCHER" meta={meta} />
            <DocTable rows={rows} totalLabel="Total paid" totalValue={fmtMoney(total)} note={note} emptyText="No paid lessons for this period." />
            <DocFooter settings={data.settings} />
            </div>
            <Btn variant="owner" style={{ width: "100%", marginTop: 16 }} onClick={() => generateDocPdf({ settings: data.settings, docType: "PAYMENT VOUCHER", meta, rows, totalLabel: "Total paid", totalValue: fmtMoney(total), note, filename: `Payment-Voucher-${t.name}-${voucherAllTime ? "all-time" : voucherMonth}` })}>Download PDF</Btn>
          </Modal>
        );
      })()}
    </div>
  );
}

function MaterialsTab({ data, refresh }) {
  const [form, setForm] = useState({ name: "", instrument: "", price: "", stock: "" });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", instrument: "", price: "", stock: "" });
  const [teacherFilter, setTeacherFilter] = useState("");
  const [orderSort, setOrderSort] = useState("date");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogInstrumentFilter, setCatalogInstrumentFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const instrumentOptions = useMemo(() => [...new Set(data.courses.map((c) => c.name).filter(Boolean))].sort(), [data.courses]);

  const addItem = async (e) => {
    e.preventDefault();
    await supabase.from("book_items").insert({ name: form.name, instrument: form.instrument || null, price: Number(form.price) || 0, stock_on_hand: Number(form.stock) || 0 });
    setForm({ name: "", instrument: "", price: "", stock: "" }); refresh();
  };
  const saveItem = async (id) => {
    await supabase.from("book_items").update({ name: editForm.name, instrument: editForm.instrument || null, price: Number(editForm.price) || 0, stock_on_hand: Number(editForm.stock) || 0 }).eq("id", id);
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
  const toggleSelected = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const removeSelected = async () => {
    const ids = [...selectedIds];
    const blocked = ids.filter((id) => data.bookOrderItems.some((i) => i.book_item_id === id));
    const removable = ids.filter((id) => !blocked.includes(id));
    if (removable.length === 0) {
      alert(`None of the ${ids.length} selected item(s) can be removed — they're all referenced by past orders.`);
      return;
    }
    const msg = blocked.length
      ? `Remove ${removable.length} item(s)? ${blocked.length} of your ${ids.length} selected won't be removed since past orders reference them.`
      : `Remove ${removable.length} item(s) from the catalog? This can't be undone.`;
    if (!confirm(msg)) return;
    await supabase.from("book_items").delete().in("id", removable);
    setSelectedIds(new Set());
    refresh();
  };

  const catalogFileRef = useRef(null);
  const [catalogImporting, setCatalogImporting] = useState(false);
  const [catalogImportResult, setCatalogImportResult] = useState(null);

  const downloadCatalogTemplate = () => {
    const rows = [["Name", "Instrument", "Price (RM)", "Starting stock"], ["Piano Method Book 1", "Piano", "45", "10"]];
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
            const instrument = (row["Instrument"] || "").trim() || null;
            // Tolerate currency prefixes/symbols and stray commas a person
            // might type or paste into a price cell (e.g. "RM143.10",
            // "Rm 143.10", "$143.10", "1,430.10") — Number() on any of
            // those returns NaN and silently zeroes the price otherwise.
            const rawPrice = String(row["Price (RM)"] ?? row["Price"] ?? "").replace(/[^0-9.\-]/g, "");
            const price = Number(rawPrice) || 0;
            const rawStock = String(row["Starting stock"] ?? row["Stock"] ?? "").replace(/[^0-9.\-]/g, "");
            const stock = Number(rawStock) || 0;
            const existing = data.bookItems.find((b) => b.name.trim().toLowerCase() === name.toLowerCase());
            if (existing) {
              const { error } = await supabase.from("book_items").update({ instrument, price, stock_on_hand: stock }).eq("id", existing.id);
              if (error) throw new Error(error.message);
              updated += 1;
            } else {
              const { error } = await supabase.from("book_items").insert({ name, instrument, price, stock_on_hand: stock });
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
          const { data: inv, error } = await supabase.from("invoices").insert({ student_id: order.student_id, date: todayIso(), total: amount, due_date: monthlyDueDate(todayIso()) }).select().single();
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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <input value={catalogSearch} onChange={(e) => setCatalogSearch(e.target.value)} placeholder="Search by name or instrument" style={{ ...inputStyle, flex: "2 1 200px" }} />
          <select value={catalogInstrumentFilter} onChange={(e) => setCatalogInstrumentFilter(e.target.value)} style={{ ...inputStyle, flex: "1 1 140px" }}>
            <option value="">All instruments</option>
            {instrumentOptions.map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
          </select>
        </div>
        {selectedIds.size > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <Btn small variant="danger" onClick={removeSelected}>Remove {selectedIds.size} selected</Btn>
            <a href="#" onClick={(e) => { e.preventDefault(); setSelectedIds(new Set()); }} style={{ fontSize: 12, color: COLORS.inkSoft }}>Clear selection</a>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
          {data.bookItems
            .filter((b) => !catalogSearch.trim() || b.name.toLowerCase().includes(catalogSearch.trim().toLowerCase()) || (b.instrument || "").toLowerCase().includes(catalogSearch.trim().toLowerCase()))
            .filter((b) => !catalogInstrumentFilter || b.instrument === catalogInstrumentFilter)
            .map((b) => (
            <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", border: "1px solid " + COLORS.border, borderRadius: 8, fontSize: 13, gap: 8, flexWrap: "wrap" }}>
              {editingId === b.id ? (
                <>
                  <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} style={{ ...inputStyle, flex: 1, minWidth: 100 }} />
                  <select value={editForm.instrument} onChange={(e) => setEditForm({ ...editForm, instrument: e.target.value })} style={{ ...inputStyle, width: 120 }}>
                    <option value="">General</option>
                    {instrumentOptions.map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
                  </select>
                  <input type="number" value={editForm.price} onChange={(e) => setEditForm({ ...editForm, price: e.target.value })} style={{ ...inputStyle, width: 90 }} placeholder="Price" />
                  <input type="number" value={editForm.stock} onChange={(e) => setEditForm({ ...editForm, stock: e.target.value })} style={{ ...inputStyle, width: 90 }} placeholder="Stock on hand" />
                  <a href="#" onClick={(e) => { e.preventDefault(); saveItem(b.id); }} style={{ color: COLORS.owner }}>Save</a>
                  <a href="#" onClick={(e) => { e.preventDefault(); setEditingId(null); }} style={{ color: COLORS.inkSoft }}>Cancel</a>
                </>
              ) : (
                <>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input type="checkbox" checked={selectedIds.has(b.id)} onChange={() => toggleSelected(b.id)} />
                    <span><strong>{b.name}</strong>{b.instrument ? ` · ${b.instrument}` : ""} · {fmtMoney(b.price)} · {b.stock_on_hand} on hand{b.stock_on_order ? ` · ${b.stock_on_order} on order` : ""}</span>
                  </label>
                  <span style={{ display: "flex", gap: 8 }}>
                    <a href="#" onClick={(e) => { e.preventDefault(); setEditingId(b.id); setEditForm({ name: b.name, instrument: b.instrument || "", price: b.price, stock: b.stock_on_hand }); }} style={{ color: COLORS.owner }}>Edit</a>
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
          <select value={form.instrument} onChange={(e) => setForm({ ...form, instrument: e.target.value })} style={{ ...inputStyle, width: 130 }}>
            <option value="">General</option>
            {instrumentOptions.map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
          </select>
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

// Shared by HealthTab and the alert banner on the Students list, so the
// numbers never disagree between the two places that show them.
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
function BackfillTool({ data, refresh }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(todayIso().slice(0, 8) + "01");
  const [to, setTo] = useState(todayIso());
  const [status, setStatus] = useState("attended");
  const [running, setRunning] = useState(false);
  const [confirmState, setConfirmState] = useState(null);
  const [resultMsg, setResultMsg] = useState(null);

  const computeRows = () => {
    const { activeInstruments } = getHealthIssues(data);
    const holidaySet = new Set(data.holidays.map((h) => h.date));
    const existingKeys = new Set(data.lessons.map((l) => `${l.student_id}|${l.instrument || ""}|${l.date}`));
    const rows = [];
    activeInstruments.forEach((i) => {
      if (i.day == null || !i.time) return;
      let d = new Date(from + "T00:00:00");
      while (d.getDay() !== i.day) d.setDate(d.getDate() + 1);
      while (isoDate(d) <= to) {
        const iso = isoDate(d);
        const key = `${i.studentId}|${i.course || ""}|${iso}`;
        if (!holidaySet.has(iso) && !existingKeys.has(key)) {
          rows.push({
            date: iso, time: i.time, teacher_id: i.teacherId || null, student_id: i.studentId,
            price: i.billingType === "per_month" ? 0 : Number(i.price || 0), duration_min: i.duration || 30,
            status, instrument: i.course || null, room: i.room || null,
          });
        }
        d.setDate(d.getDate() + 7);
      }
    });
    return rows;
  };

  const startBackfill = () => {
    const rows = computeRows();
    if (rows.length === 0) {
      setResultMsg(`Nothing to fill — every active instrument's schedule between ${fmtDate(from)} and ${fmtDate(to)} already has a lesson on file.`);
      return;
    }
    const byStudent = new Set(rows.map((r) => r.student_id)).size;
    setConfirmState({
      message: `Create ${rows.length} lesson(s) across ${byStudent} student(s), from ${fmtDate(from)} to ${fmtDate(to)}, marked "${statusLabel(status)}"? This only fills gaps — it will never duplicate a lesson that already exists on a given date for a student+course.`,
      onConfirm: async () => {
        setConfirmState(null);
        setRunning(true);
        const batchSize = 200;
        let failed = false;
        for (let i = 0; i < rows.length; i += batchSize) {
          const { error } = await supabase.from("lessons").insert(rows.slice(i, i + batchSize));
          if (error) { failed = true; break; }
        }
        setRunning(false);
        setResultMsg(failed ? "Something failed partway through — check the calendar for the range and re-run if needed; already-created rows won't be duplicated." : `Done — ${rows.length} lesson(s) created.`);
        refresh();
      },
    });
  };

  return (
    <Card style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: open ? 12 : 0 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Backfill missing lessons</div>
          <div style={{ fontSize: 12, color: COLORS.inkSoft, marginTop: 2 }}>For a date range with no lesson rows at all yet (e.g. before the app was in daily use) — fills each student's normal weekly schedule in, so payment calculations have something to work with.</div>
        </div>
        <Btn small onClick={() => setOpen((v) => !v)}>{open ? "Close" : "Open"}</Btn>
      </div>
      {open && (
        <div style={{ marginTop: 4 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 10 }}>
            <Field label="From"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inputStyle} /></Field>
            <Field label="To"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inputStyle} /></Field>
            <Field label="Mark as">
              <select value={status} onChange={(e) => setStatus(e.target.value)} style={inputStyle}>
                <option value="attended">Attended</option>
                <option value="scheduled">Scheduled (review before marking done)</option>
              </select>
            </Field>
            <Btn variant="danger" onClick={startBackfill} disabled={running}>{running ? "Creating…" : "Preview & run"}</Btn>
          </div>
          <div style={{ fontSize: 12, color: COLORS.inkSoft }}>Only creates lessons for instruments that are currently active and have a day/time set. Public holidays are skipped automatically. Won't touch any date that already has a lesson for that student.</div>
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
      {resultMsg && (
        <Modal title="Backfill" onClose={() => setResultMsg(null)}>
          <div style={{ fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>{resultMsg}</div>
          <Btn onClick={() => setResultMsg(null)}>OK</Btn>
        </Modal>
      )}
    </Card>
  );
}

function HealthTab({ data, setTab, goToStudent, goToStudentSearch, refresh, autoTopUpError }) {
  const {
    noRate, notScheduled, noTeacher, noInstrumentsAtAll, noPayoutRate, casingIssues, possibleDuplicates, levelsNoPrice, runningLow, duplicateLessons, scheduleMismatches, ambiguousDuplicateNames, replacementsMissingInstrument, leftoverCancelledSlots, futureAttended, perLessonInstruments,
  } = getHealthIssues(data);
  const [removingDupes, setRemovingDupes] = useState(false);
  const [fixingKey, setFixingKey] = useState(null);
  const [fixingReplacements, setFixingReplacements] = useState(false);
  const [fixingLeftovers, setFixingLeftovers] = useState(false);
  // Native window.confirm()/alert() block the whole page silently until
  // dismissed — on some setups that popup is easy to miss entirely, which
  // makes the app look frozen rather than just waiting. Everything
  // destructive in this tab confirms through this in-app dialog instead,
  // which is impossible to miss since it's part of the page itself.
  const [confirmState, setConfirmState] = useState(null); // { message, onConfirm }
  const [noticeState, setNoticeState] = useState(null); // string
  const studentName = (id) => data.students.find((s) => s.id === id)?.name || "—";
  const teacherName = (id) => data.teachers.find((t) => t.id === id)?.name || "Unassigned";

  const applyScheduleFix = async (group) => {
    const idsToDelete = group.lessons.map((l) => l.id);
    const { error: delErr } = await supabase.from("lessons").delete().in("id", idsToDelete);
    if (delErr) return false;
    const rows = buildLessonSeriesRows({
      holidays: data.holidays, studentId: group.studentId, teacherId: group.teacherId,
      price: group.billingType === "per_month" ? 0 : Number(group.price || 0),
      duration: group.duration || 30, permanentDay: group.day, time: group.time, forHowLong: 4, unit: "months",
      instrument: group.course, room: group.room,
    });
    if (rows.length) await supabase.from("lessons").insert(rows);
    return true;
  };
  const fixSchedule = (group) => {
    const key = `${group.studentId}|${group.course}`;
    setConfirmState({
      message: `Move ${studentName(group.studentId)}'s ${group.course} lessons to the correct slot (${WEEKDAYS[group.day]} ${group.expectedTime})? The ${group.lessons.length} wrongly-placed lesson(s) will be removed and regenerated correctly, about 4 months ahead. Past/attended lessons are never touched.`,
      onConfirm: async () => {
        setConfirmState(null);
        setFixingKey(key);
        await applyScheduleFix(group);
        setFixingKey(null);
        refresh();
      },
    });
  };

  const [unifyingKey, setUnifyingKey] = useState(null);
  const unifyCasing = (variants, canonicalName) => {
    const otherSpellings = [...variants].filter((v) => v !== canonicalName);
    if (otherSpellings.length === 0) return;
    setConfirmState({
      message: `Rename every "${otherSpellings.join('" / "')}" to "${canonicalName}" — course definitions, student records, and existing lesson rows? Anything already spelled "${canonicalName}" is left alone. This can't be undone, but it's a rename, nothing is deleted.`,
      onConfirm: async () => {
        setConfirmState(null);
        setUnifyingKey(canonicalName);
        for (const spelling of otherSpellings) {
          await Promise.all([
            supabase.from("courses").update({ name: canonicalName }).eq("name", spelling),
            supabase.from("students").update({ course: canonicalName }).eq("course", spelling),
            supabase.from("student_instruments").update({ course: canonicalName }).eq("course", spelling),
            supabase.from("lessons").update({ instrument: canonicalName }).eq("instrument", spelling),
            supabase.from("teacher_rates").update({ instrument: canonicalName }).eq("instrument", spelling),
          ]);
        }
        setUnifyingKey(null);
        refresh();
      },
    });
  };
  const fixAllSchedules = () => {
    const totalLessons = scheduleMismatches.reduce((n, g) => n + g.lessons.length, 0);
    setConfirmState({
      message: `Fix all ${scheduleMismatches.length} instrument(s) — ${totalLessons} wrongly-placed lesson(s) total? Each will be regenerated on its own correct day/time, about 4 months ahead. Past/attended lessons are never touched.`,
      onConfirm: async () => {
        setConfirmState(null);
        setFixingKey("__all__");
        for (const group of scheduleMismatches) {
          await applyScheduleFix(group);
        }
        setFixingKey(null);
        refresh();
      },
    });
  };

  const removeDuplicateLessons = () => {
    const idsToDelete = [];
    duplicateLessons.forEach((group) => {
      const sorted = [...group].sort((a, b) => (a.created_at || "").localeCompare(b.created_at || "") || a.id.localeCompare(b.id));
      sorted.slice(1).forEach((l) => idsToDelete.push(l.id));
    });
    setConfirmState({
      message: `Remove ${idsToDelete.length} duplicate lesson row(s), keeping the oldest of each? This can't be undone.`,
      onConfirm: async () => {
        setConfirmState(null);
        setRemovingDupes(true);
        // Batched, not one giant .in() — this can realistically be hundreds of
        // rows spread across many months (leftover from the old double-generation
        // bug), and a single request with that many IDs risks hitting request
        // size limits and failing silently partway through.
        const batchSize = 200;
        let failed = false;
        for (let i = 0; i < idsToDelete.length; i += batchSize) {
          const batch = idsToDelete.slice(i, i + batchSize);
          const { error } = await supabase.from("lessons").delete().in("id", batch);
          if (error) { failed = true; break; }
        }
        setRemovingDupes(false);
        if (failed) setNoticeState("Some duplicates failed to delete — check your connection and try again. Already-removed rows stay removed.");
        refresh();
      },
    });
  };

  const fixReplacementInstruments = () => {
    setConfirmState({
      message: `Copy the instrument (and room) across from the original lesson onto ${replacementsMissingInstrument.length} replacement lesson(s) that are currently missing it? This only fills in what should already be there — nothing else changes.`,
      onConfirm: async () => {
        setConfirmState(null);
        setFixingReplacements(true);
        for (const l of replacementsMissingInstrument) {
          const original = data.lessons.find((o) => o.id === l.replacement_of);
          if (original) await supabase.from("lessons").update({ instrument: original.instrument, room: original.room }).eq("id", l.id);
        }
        setFixingReplacements(false);
        setNoticeState(`Done — ${replacementsMissingInstrument.length} replacement lesson(s) fixed.`);
        refresh();
      },
    });
  };

  const fixLeftoverCancelledSlots = () => {
    setConfirmState({
      message: `Remove ${leftoverCancelledSlots.length} leftover cancelled lesson(s)? Each one has a real replacement already sitting at the exact same student, date, and time — so it's confirmed to be an orphan from before the fix, not a lesson still waiting to be handled. Only the leftover copy is removed; the real replacement is untouched.`,
      onConfirm: async () => {
        setConfirmState(null);
        setFixingLeftovers(true);
        const ids = leftoverCancelledSlots.map((x) => x.orphan.id);
        const batchSize = 200;
        let failed = false;
        for (let i = 0; i < ids.length; i += batchSize) {
          const { error } = await supabase.from("lessons").delete().in("id", ids.slice(i, i + batchSize));
          if (error) { failed = true; break; }
        }
        setFixingLeftovers(false);
        setNoticeState(failed ? "Something failed partway through — already-removed rows stay removed, re-run to pick up the rest." : `Done — ${ids.length} leftover lesson(s) removed.`);
        refresh();
      },
    });
  };

  const [fixingFutureAttended, setFixingFutureAttended] = useState(false);

  const fixFutureAttended = () => {
    const dates = futureAttended.map((l) => l.date).sort();
    const todayLabel = fmtDate(todayIso());
    setConfirmState({
      message: `Set ${futureAttended.length} lesson(s) back to "Scheduled"? These are all dated after today (${todayLabel}) but are currently marked "Attended" — a lesson can't have happened yet if its date hasn't arrived, so this is always safe to revert. Range: ${fmtDate(dates[0])} to ${fmtDate(dates[dates.length - 1])}.`,
      onConfirm: async () => {
        setConfirmState(null);
        setFixingFutureAttended(true);
        const ids = futureAttended.map((l) => l.id);
        const batchSize = 200;
        let failed = false;
        for (let i = 0; i < ids.length; i += batchSize) {
          const { error } = await supabase.from("lessons").update({ status: "scheduled" }).in("id", ids.slice(i, i + batchSize));
          if (error) { failed = true; break; }
        }
        setFixingFutureAttended(false);
        setNoticeState(failed ? "Something failed partway through — already-fixed rows stay fixed, re-run to pick up the rest." : `Done — ${ids.length} lesson(s) set back to Scheduled.`);
        refresh();
      },
    });
  };

  // One-time import: August 2026 attendance confirmed from teacher Google Sheets
  // (Samuel, An An, Natasha only — plain unambiguous dates from those three
  // sheets specifically). Everything else from the other 9 sheets is
  // deliberately left out here — those had blank-cell/column-alignment risk,
  // so they went into a separate confirmation spreadsheet for the teachers
  // to fill in by hand instead of being guessed at.
  const AUGUST_2026_CONFIRMED_ATTENDANCE = [
    { teacher: "Samuel", student: "Lai Hong Jian", days: [1, 8, 22] },
    { teacher: "Samuel", student: "Deo Ethan", days: [1, 8, 4, 22] },
    { teacher: "Samuel", student: "Alonzo", days: [1, 8, 7, 22] },
    { teacher: "Samuel", student: "Seth", days: [1, 22] },
    { teacher: "Samuel", student: "Hanna", days: [1, 7, 22] },
    { teacher: "Samuel", student: "Aaron", days: [1, 8, 22] },
    { teacher: "Samuel", student: "Eiden", days: [1, 22] },
    { teacher: "Samuel", student: "Luissa", days: [1, 22] },
    { teacher: "Samuel", student: "Isaac Idriss", days: [1, 8, 7, 22] },
    { teacher: "Samuel", student: "Arielle", days: [22] },
    { teacher: "Samuel", student: "Ruth", days: [4, 11, 18] },
    { teacher: "Samuel", student: "Ethan", days: [4, 11, 18] },
    { teacher: "Samuel", student: "Nathan", days: [4, 11, 18] },
    { teacher: "Samuel", student: "Jayden Tang", days: [4, 11, 18] },
    { teacher: "Samuel", student: "Lucas Moh", days: [4, 11, 18] },
    { teacher: "Samuel", student: "Megan Voon", days: [21] },
    { teacher: "Samuel", student: "Feodora", days: [1] },
    { teacher: "An An", student: "Angel", days: [3, 17] },
    { teacher: "An An", student: "Marius Wong", days: [3, 10, 17, 24] },
    { teacher: "An An", student: "Loveyna", days: [10, 24] },
    { teacher: "An An", student: "Koyee Tam", days: [3, 17, 24] },
    { teacher: "An An", student: "Mikayla", days: [3, 24] },
    { teacher: "An An", student: "Eva Carole", days: [3, 10, 24] },
    { teacher: "An An", student: "Putri", days: [3, 10, 24] },
    { teacher: "An An", student: "Eyrina", days: [5, 12, 26] },
    { teacher: "An An", student: "Milan", days: [5, 12, 26] },
    { teacher: "An An", student: "James", days: [5, 12, 21, 26] },
    { teacher: "An An", student: "Clayrissa", days: [7, 14, 21, 28] },
    { teacher: "An An", student: "Luke", days: [7, 14, 21, 28] },
    { teacher: "An An", student: "Renee", days: [7, 14, 21, 28] },
    { teacher: "An An", student: "Chase", days: [7, 14, 21, 28] },
    { teacher: "An An", student: "Cherish", days: [7, 14, 21, 28] },
    { teacher: "An An", student: "Mandy", days: [14, 21, 28] },
    { teacher: "An An", student: "Lai Hong Jian", days: [1, 8, 15, 22] },
    { teacher: "An An", student: "Asher", days: [1, 8, 15, 22] },
    { teacher: "An An", student: "Darla", days: [1, 8, 15, 22] },
    { teacher: "An An", student: "Cara Amelia", days: [1, 8, 15, 22] },
    { teacher: "An An", student: "Ashley", days: [1, 8, 15, 22] },
    { teacher: "An An", student: "Maia", days: [1, 8] },
    { teacher: "An An", student: "Jezebell", days: [1, 15, 22] },
    { teacher: "An An", student: "Marianne", days: [1, 8, 15] },
    { teacher: "An An", student: "Caylee", days: [1, 8, 22] },
    { teacher: "An An", student: "Kayden", days: [1, 15, 22] },
    { teacher: "An An", student: "Xenia", days: [1, 15, 22] },
    { teacher: "An An", student: "Feodora Freddy", days: [1, 22] },
    { teacher: "An An", student: "Breevia", days: [8, 15, 22] },
    { teacher: "An An", student: "Michelle", days: [1, 22] },
    { teacher: "Natasha", student: "Lola", days: [12] },
    { teacher: "Natasha", student: "Pia Carissa", days: [12, 26] },
    { teacher: "Natasha", student: "Lo Yu Chen", days: [5, 12, 26] },
    { teacher: "Natasha", student: "Affiqah", days: [5, 12, 26] },
    { teacher: "Natasha", student: "Alicia", days: [5, 12, 26] },
    { teacher: "Natasha", student: "Lau", days: [5] },
    { teacher: "Natasha", student: "Nur Asmitha", days: [5, 12, 26] },
    { teacher: "Natasha", student: "Serena", days: [12, 26] },
  ];

  const [augImportRunning, setAugImportRunning] = useState(false);
  const [augImportResult, setAugImportResult] = useState(null);

  const runAugustAttendanceImport = () => {
    const totalDates = AUGUST_2026_CONFIRMED_ATTENDANCE.reduce((s, e) => s + e.days.length, 0);
    setConfirmState({
      message: `Mark ${totalDates} lesson(s) across ${AUGUST_2026_CONFIRMED_ATTENDANCE.length} student-teacher pairs as Attended for August 2026, based on the confirmed dates from Samuel, An An, and Natasha's sheets? Anything that doesn't match an existing lesson is skipped and listed afterward — nothing is created blind.`,
      onConfirm: async () => {
        setConfirmState(null);
        setAugImportRunning(true);
        const norm = (s) => (s || "").toLowerCase().trim();
        let updated = 0; let alreadyAttended = 0;
        const unmatched = []; // { teacher, student, date, reason }
        const toUpdate = [];

        for (const entry of AUGUST_2026_CONFIRMED_ATTENDANCE) {
          const teacher = data.teachers.find((t) => norm(t.name) === norm(entry.teacher) || norm(t.name).includes(norm(entry.teacher)));
          if (!teacher) { entry.days.forEach((d) => unmatched.push({ teacher: entry.teacher, student: entry.student, date: `2026-08-${String(d).padStart(2, "0")}`, reason: "No teacher found with this name" })); continue; }
          for (const d of entry.days) {
            const iso = `2026-08-${String(d).padStart(2, "0")}`;
            const candidates = data.lessons.filter((l) => l.teacher_id === teacher.id && l.date === iso);
            const matches = candidates.filter((l) => {
              const sName = norm(studentName(l.student_id));
              return sName === norm(entry.student) || sName.includes(norm(entry.student)) || norm(entry.student).includes(sName);
            });
            if (matches.length === 0) { unmatched.push({ teacher: entry.teacher, student: entry.student, date: iso, reason: "No lesson found for this teacher/student/date" }); continue; }
            if (matches.length > 1) { unmatched.push({ teacher: entry.teacher, student: entry.student, date: iso, reason: `${matches.length} possible matches — ambiguous, skipped` }); continue; }
            const lesson = matches[0];
            if (lesson.status === "attended") { alreadyAttended++; continue; }
            toUpdate.push(lesson.id);
          }
        }

        let failed = false;
        for (const id of toUpdate) {
          const { error } = await supabase.from("lessons").update({ status: "attended" }).eq("id", id);
          if (error) { failed = true; break; }
          updated++;
        }

        setAugImportRunning(false);
        setAugImportResult({ updated, alreadyAttended, unmatched, failed });
        refresh();
      },
    });
  };

  const AUGUST_2026_REMAINING_ENTRIES = [
    { teacher: "Ivonne", student: "Chie", date: "2026-08-04", action: "attended" },
    { teacher: "Ivonne", student: "Chie", date: "2026-08-18", action: "attended" },
    { teacher: "Ivonne", student: "Chie", date: "2026-08-18", action: "attended" },
    { teacher: "Ivonne", student: "Qunicy", date: "2026-08-04", action: "attended" },
    { teacher: "Ivonne", student: "Qunicy", date: "2026-08-11", action: "attended" },
    { teacher: "Ivonne", student: "Qunicy", date: "2026-08-18", action: "attended" },
    { teacher: "Ivonne", student: "Queenera", date: "2026-08-04", action: "attended" },
    { teacher: "Ivonne", student: "Queenera", date: "2026-08-11", action: "attended" },
    { teacher: "Ivonne", student: "Queenera", date: "2026-08-18", action: "attended" },
    { teacher: "Ivonne", student: "Omis", date: "2026-08-04", action: "attended" },
    { teacher: "Ivonne", student: "Omis", date: "2026-08-11", action: "attended" },
    { teacher: "Ivonne", student: "Omis", date: "2026-08-18", action: "attended" },
    { teacher: "Ivonne", student: "Catelyn", date: "2026-08-04", action: "attended" },
    { teacher: "Ivonne", student: "Catelyn", date: "2026-08-11", action: "attended" },
    { teacher: "Ivonne", student: "Catelyn", date: "2026-08-18", action: "attended" },
    { teacher: "Ivonne", student: "Levi", date: "2026-08-04", action: "attended" },
    { teacher: "Ivonne", student: "Levi", date: "2026-08-11", action: "attended" },
    { teacher: "Ivonne", student: "Natteo", date: "2026-08-04", action: "attended" },
    { teacher: "Ivonne", student: "Natteo", date: "2026-08-18", action: "attended" },
    { teacher: "Ivonne", student: "Chad", date: "2026-08-04", action: "attended" },
    { teacher: "Ivonne", student: "Chad", date: "2026-08-11", action: "attended" },
    { teacher: "Ivonne", student: "Chad", date: "2026-08-18", action: "attended" },
    { teacher: "Ivonne", student: "Charlotte", date: "2026-08-04", action: "attended" },
    { teacher: "Ivonne", student: "Charlotte", date: "2026-08-11", action: "attended" },
    { teacher: "Ivonne", student: "Charlotte", date: "2026-08-18", action: "attended" },
    { teacher: "Ivonne", student: "Bethany", date: "2026-08-05", action: "attended" },
    { teacher: "Ivonne", student: "Bethany", date: "2026-08-12", action: "attended" },
    { teacher: "Ivonne", student: "Bethany", date: "2026-08-19", action: "attended" },
    { teacher: "Ivonne", student: "Bethany", date: "2026-08-26", action: "attended" },
    { teacher: "Ivonne", student: "Allyxandrea", date: "2026-08-05", action: "attended" },
    { teacher: "Ivonne", student: "Allyxandrea", date: "2026-08-12", action: "attended" },
    { teacher: "Ivonne", student: "Allyxandrea", date: "2026-08-19", action: "attended" },
    { teacher: "Ivonne", student: "Allyxandrea", date: "2026-08-26", action: "attended" },
    { teacher: "Ivonne", student: "Yu Yu", date: "2026-08-05", action: "attended" },
    { teacher: "Ivonne", student: "Theodore", date: "2026-08-05", action: "attended" },
    { teacher: "Ivonne", student: "Theodore", date: "2026-08-12", action: "attended" },
    { teacher: "Ivonne", student: "Theodore", date: "2026-08-19", action: "attended" },
    { teacher: "Ivonne", student: "Theodore", date: "2026-08-26", action: "attended" },
    { teacher: "Ivonne", student: "Irene", date: "2026-08-12", action: "attended" },
    { teacher: "Ivonne", student: "Irene", date: "2026-08-19", action: "attended" },
    { teacher: "Ivonne", student: "Irene", date: "2026-08-26", action: "attended" },
    { teacher: "Ivonne", student: "Kristen", date: "2026-08-01", action: "attended" },
    { teacher: "Ivonne", student: "Kristen", date: "2026-08-08", action: "attended" },
    { teacher: "Ivonne", student: "Kristen", date: "2026-08-15", action: "attended" },
    { teacher: "Ivonne", student: "Adrya", date: "2026-08-01", action: "attended" },
    { teacher: "Ivonne", student: "Adrya", date: "2026-08-08", action: "attended" },
    { teacher: "Ivonne", student: "Adrya", date: "2026-08-15", action: "attended" },
    { teacher: "Ivonne", student: "Adrya", date: "2026-08-22", action: "attended" },
    { teacher: "Ivonne", student: "Gracy", date: "2026-08-01", action: "attended" },
    { teacher: "Ivonne", student: "Gracy", date: "2026-08-08", action: "attended" },
    { teacher: "Ivonne", student: "Gracy", date: "2026-08-15", action: "attended" },
    { teacher: "Ivonne", student: "Gracy", date: "2026-08-22", action: "attended" },
    { teacher: "Ivonne", student: "Eva Loverry", date: "2026-08-01", action: "attended" },
    { teacher: "Ivonne", student: "Eva Loverry", date: "2026-08-08", action: "attended" },
    { teacher: "Ivonne", student: "Eva Loverry", date: "2026-08-15", action: "attended" },
    { teacher: "Ivonne", student: "Eva Loverry", date: "2026-08-22", action: "attended" },
    { teacher: "Ivonne", student: "Amelia", date: "2026-08-01", action: "attended" },
    { teacher: "Ivonne", student: "Amelia", date: "2026-08-08", action: "attended" },
    { teacher: "Ivonne", student: "Amelia", date: "2026-08-15", action: "attended" },
    { teacher: "Ivonne", student: "Amelia", date: "2026-08-22", action: "attended" },
    { teacher: "Ivonne", student: "Asher", date: "2026-08-01", action: "attended" },
    { teacher: "Ivonne", student: "Asher", date: "2026-08-08", action: "attended" },
    { teacher: "Ivonne", student: "Asher", date: "2026-08-15", action: "attended" },
    { teacher: "Ivonne", student: "Asher", date: "2026-08-22", action: "attended" },
    { teacher: "Ivonne", student: "Erner", date: "2026-08-01", action: "attended" },
    { teacher: "Ivonne", student: "Erner", date: "2026-08-08", action: "attended" },
    { teacher: "Ivonne", student: "Erner", date: "2026-08-15", action: "attended" },
    { teacher: "Ivonne", student: "Erner", date: "2026-08-23", action: "attended" },
    { teacher: "Ivonne", student: "Kristenbelle", date: "2026-08-01", action: "attended" },
    { teacher: "Ivonne", student: "Kristenbelle", date: "2026-08-08", action: "attended" },
    { teacher: "Ivonne", student: "Kristenbelle", date: "2026-08-15", action: "attended" },
    { teacher: "Ivonne", student: "Kristenbelle", date: "2026-08-22", action: "attended" },
    { teacher: "Ivonne", student: "Jenna", date: "2026-08-01", action: "attended" },
    { teacher: "Ivonne", student: "Jenna", date: "2026-08-08", action: "attended" },
    { teacher: "Ivonne", student: "Jenna", date: "2026-08-15", action: "attended" },
    { teacher: "Ivonne", student: "Athea", date: "2026-08-08", action: "attended" },
    { teacher: "Ivonne", student: "Athea", date: "2026-08-15", action: "attended" },
    { teacher: "Ivonne", student: "Athea", date: "2026-08-22", action: "attended" },
    { teacher: "Ivonne", student: "Elijah", date: "2026-08-01", action: "attended" },
    { teacher: "Ivonne", student: "Elijah", date: "2026-08-08", action: "attended" },
    { teacher: "Ivonne", student: "Elijah", date: "2026-08-15", action: "attended" },
    { teacher: "Ivonne", student: "Elijah", date: "2026-08-22", action: "attended" },
    { teacher: "Ivonne", student: "Janice", date: "2026-08-29", action: "attended" },
    { teacher: "Ivonne", student: "Janice", date: "2026-08-15", action: "attended" },
    { teacher: "Ivonne", student: "Janice", date: "2026-08-22", action: "attended" },
    { teacher: "Ivonne", student: "Kyle", date: "2026-08-15", action: "attended" },
    { teacher: "Ivonne", student: "Kyle", date: "2026-08-22", action: "attended" },
    { teacher: "Bester", student: "Sofia", date: "2026-08-17", action: "attended" },
    { teacher: "Bester", student: "Sofia", date: "2026-08-24", action: "attended" },
    { teacher: "Bester", student: "Natalie", date: "2026-08-20", action: "attended" },
    { teacher: "Bester", student: "Natalie", date: "2026-08-13", action: "attended" },
    { teacher: "Bester", student: "Natalie", date: "2026-08-20", action: "attended" },
    { teacher: "Bester", student: "Natalie", date: "2026-08-27", action: "attended" },
    { teacher: "Bester", student: "Charity", date: "2026-08-13", action: "attended" },
    { teacher: "Bester", student: "Samantha", date: "2026-08-13", action: "attended" },
    { teacher: "Bester", student: "Samantha", date: "2026-08-13", action: "attended" },
    { teacher: "Bester", student: "Samantha", date: "2026-08-20", action: "attended" },
    { teacher: "Bester", student: "Samantha", date: "2026-08-27", action: "attended" },
    { teacher: "Bester", student: "Levi", date: "2026-08-13", action: "attended" },
    { teacher: "Bester", student: "Levi", date: "2026-08-20", action: "attended" },
    { teacher: "Bester", student: "Levi", date: "2026-08-27", action: "attended" },
    { teacher: "Bester", student: "Nur Izreen", date: "2026-08-13", action: "attended" },
    { teacher: "Bester", student: "Nur Izreen", date: "2026-08-27", action: "attended" },
    { teacher: "Bester", student: "Laika", date: "2026-08-27", action: "attended" },
    { teacher: "Bester", student: "Marc", date: "2026-08-07", action: "attended" },
    { teacher: "Bester", student: "Marc", date: "2026-08-14", action: "attended" },
    { teacher: "Bester", student: "Marc", date: "2026-08-21", action: "attended" },
    { teacher: "Bester", student: "Marc", date: "2026-08-28", action: "attended" },
    { teacher: "Bester", student: "Olivia", date: "2026-08-14", action: "attended" },
    { teacher: "Bester", student: "Olivia", date: "2026-08-14", action: "attended" },
    { teacher: "Bester", student: "Olivia", date: "2026-08-21", action: "attended" },
    { teacher: "Bester", student: "Olivia", date: "2026-08-28", action: "attended" },
    { teacher: "Bester", student: "Mandy", date: "2026-08-14", action: "attended" },
    { teacher: "Bester", student: "Mandy", date: "2026-08-21", action: "attended" },
    { teacher: "Bester", student: "Mandy", date: "2026-08-28", action: "attended" },
    { teacher: "Bester", student: "Ms Pang", date: "2026-08-07", action: "attended" },
    { teacher: "Bester", student: "Ms Pang", date: "2026-08-14", action: "attended" },
    { teacher: "Bester", student: "Ms Pang", date: "2026-08-21", action: "attended" },
    { teacher: "Bester", student: "Ms Pang", date: "2026-08-28", action: "attended" },
    { teacher: "Bester", student: "Charlie", date: "2026-08-14", action: "attended" },
    { teacher: "Bester", student: "Charlie", date: "2026-08-21", action: "attended" },
    { teacher: "Bester", student: "Rainie (2)", date: "2026-08-21", action: "attended" },
    { teacher: "Bester", student: "Rainie (2)", date: "2026-08-28", action: "attended" },
    { teacher: "Bester", student: "Loxlay", date: "2026-08-01", action: "attended" },
    { teacher: "Bester", student: "Loxlay", date: "2026-08-15", action: "attended" },
    { teacher: "Bester", student: "Loxlay", date: "2026-08-15", action: "attended" },
    { teacher: "Bester", student: "Loxlay", date: "2026-08-22", action: "attended" },
    { teacher: "Bester", student: "Declan", date: "2026-08-01", action: "attended" },
    { teacher: "Bester", student: "Declan", date: "2026-08-15", action: "attended" },
    { teacher: "Bester", student: "Declan", date: "2026-08-15", action: "attended" },
    { teacher: "Bester", student: "Caylee", date: "2026-08-01", action: "attended" },
    { teacher: "Bester", student: "Caylee", date: "2026-08-15", action: "attended" },
    { teacher: "Bester", student: "Caylee", date: "2026-08-15", action: "attended" },
    { teacher: "Bester", student: "Caylee", date: "2026-08-22", action: "attended" },
    { teacher: "Bester", student: "Cassandra", date: "2026-08-15", action: "attended" },
    { teacher: "Bester", student: "Cassandra", date: "2026-08-22", action: "attended" },
    { teacher: "Bester", student: "Norman", date: "2026-08-15", action: "attended" },
    { teacher: "Bester", student: "Norman", date: "2026-08-29", action: "attended" },
    { teacher: "Bester", student: "Norman", date: "2026-08-15", action: "attended" },
    { teacher: "Bester", student: "Norman", date: "2026-08-22", action: "attended" },
    { teacher: "Bester", student: "Jecyn", date: "2026-08-29", action: "attended" },
    { teacher: "Bester", student: "Jecyn", date: "2026-08-29", action: "attended" },
    { teacher: "Bester", student: "Jecyn", date: "2026-08-15", action: "attended" },
    { teacher: "Bester", student: "Jecyn", date: "2026-08-22", action: "attended" },
    { teacher: "Bester", student: "Shania", date: "2026-08-01", action: "attended" },
    { teacher: "Bester", student: "Shania", date: "2026-08-29", action: "attended" },
    { teacher: "Bester", student: "Shania", date: "2026-08-15", action: "attended" },
    { teacher: "Bester", student: "Shania", date: "2026-08-22", action: "attended" },
    { teacher: "Bester", student: "Ariel", date: "2026-08-01", action: "attended" },
    { teacher: "Bester", student: "Ariel", date: "2026-08-29", action: "attended" },
    { teacher: "Bester", student: "Ariel", date: "2026-08-15", action: "attended" },
    { teacher: "Bester", student: "Ariel", date: "2026-08-22", action: "attended" },
    { teacher: "Bester", student: "Kai Yi", date: "2026-08-01", action: "attended" },
    { teacher: "Bester", student: "Kai Yi", date: "2026-08-15", action: "attended" },
    { teacher: "Bester", student: "Kai Yi", date: "2026-08-22", action: "attended" },
    { teacher: "Bester", student: "Chrisliss", date: "2026-08-01", action: "attended" },
    { teacher: "Bester", student: "Chrisliss", date: "2026-08-15", action: "attended" },
    { teacher: "Bester", student: "Chrisliss", date: "2026-08-15", action: "attended" },
    { teacher: "Bester", student: "Chrisliss", date: "2026-08-22", action: "attended" },
    { teacher: "Debrikah", student: "Audrey", date: "2026-08-07", action: "attended" },
    { teacher: "Debrikah", student: "Audrey", date: "2026-08-14", action: "attended" },
    { teacher: "Debrikah", student: "Audrey", date: "2026-08-21", action: "attended" },
    { teacher: "Debrikah", student: "Kourtney", date: "2026-08-07", action: "attended" },
    { teacher: "Debrikah", student: "Kourtney", date: "2026-08-03", action: "attended" },
    { teacher: "Debrikah", student: "Kourtney", date: "2026-08-03", action: "attended" },
    { teacher: "Debrikah", student: "Kourtney", date: "2026-08-28", action: "attended" },
    { teacher: "Debrikah", student: "Ammar", date: "2026-08-01", action: "attended" },
    { teacher: "Debrikah", student: "Ammar", date: "2026-08-08", action: "attended" },
    { teacher: "Debrikah", student: "Ammar", date: "2026-08-15", action: "attended" },
    { teacher: "Debrikah", student: "Ammar", date: "2026-08-22", action: "attended" },
    { teacher: "Debrikah", student: "Noah Timothy", date: "2026-08-01", action: "attended" },
    { teacher: "Debrikah", student: "Noah Timothy", date: "2026-08-08", action: "attended" },
    { teacher: "Debrikah", student: "Kristine Joy", date: "2026-08-01", action: "attended" },
    { teacher: "Debrikah", student: "Kristine Joy", date: "2026-08-08", action: "attended" },
    { teacher: "Debrikah", student: "Kristine Joy", date: "2026-08-15", action: "attended" },
    { teacher: "Debrikah", student: "Kristine Joy", date: "2026-08-22", action: "attended" },
    { teacher: "Debrikah", student: "Krystal", date: "2026-08-01", action: "attended" },
    { teacher: "Debrikah", student: "Krystal", date: "2026-08-08", action: "attended" },
    { teacher: "Debrikah", student: "Krystal", date: "2026-08-15", action: "attended" },
    { teacher: "Debrikah", student: "Krystal", date: "2026-08-22", action: "attended" },
    { teacher: "Debrikah", student: "Christian", date: "2026-08-01", action: "attended" },
    { teacher: "Debrikah", student: "Christian", date: "2026-08-08", action: "attended" },
    { teacher: "Debrikah", student: "Christian", date: "2026-08-15", action: "attended" },
    { teacher: "Debrikah", student: "Christian", date: "2026-08-22", action: "attended" },
    { teacher: "Debrikah", student: "Maryam 7y", date: "2026-08-01", action: "attended" },
    { teacher: "Debrikah", student: "Maryam 7y", date: "2026-08-10", action: "attended" },
    { teacher: "Debrikah", student: "Maryam 7y", date: "2026-08-15", action: "attended" },
    { teacher: "Debrikah", student: "Maryam 7y", date: "2026-08-22", action: "attended" },
    { teacher: "Debrikah", student: "Maryam 4yo", date: "2026-08-08", action: "attended" },
    { teacher: "Debrikah", student: "Ava", date: "2026-08-01", action: "attended" },
    { teacher: "Debrikah", student: "Ava", date: "2026-08-08", action: "attended" },
    { teacher: "Debrikah", student: "Ava", date: "2026-08-15", action: "attended" },
    { teacher: "Debrikah", student: "Ava", date: "2026-08-22", action: "attended" },
    { teacher: "Debrikah", student: "Crystal Tatiana", date: "2026-08-01", action: "attended" },
    { teacher: "Debrikah", student: "Crystal Tatiana", date: "2026-08-08", action: "attended" },
    { teacher: "Debrikah", student: "Crystal Tatiana", date: "2026-08-15", action: "attended" },
    { teacher: "Debrikah", student: "Sarah Isabel", date: "2026-08-01", action: "attended" },
    { teacher: "Debrikah", student: "Sarah Isabel", date: "2026-08-08", action: "attended" },
    { teacher: "Debrikah", student: "Sarah Isabel", date: "2026-08-15", action: "attended" },
    { teacher: "Debrikah", student: "Sarah Isabel", date: "2026-08-22", action: "attended" },
    { teacher: "Irene", student: "Adriel", date: "2026-08-05", action: "attended" },
    { teacher: "Irene", student: "Adriel", date: "2026-08-20", action: "attended" },
    { teacher: "Irene", student: "Adriel", date: "2026-08-27", action: "attended" },
    { teacher: "Irene", student: "Faye", date: "2026-08-05", action: "attended" },
    { teacher: "Irene", student: "Faye", date: "2026-08-20", action: "attended" },
    { teacher: "Irene", student: "Faye", date: "2026-08-27", action: "attended" },
    { teacher: "Irene", student: "Shaine", date: "2026-08-05", action: "attended" },
    { teacher: "Irene", student: "Shaine", date: "2026-08-07", action: "attended" },
    { teacher: "Irene", student: "Shaine", date: "2026-08-21", action: "attended" },
    { teacher: "Irene", student: "Shaine", date: "2026-08-28", action: "attended" },
    { teacher: "Irene", student: "Luke", date: "2026-08-06", action: "attended" },
    { teacher: "Irene", student: "Luke", date: "2026-08-14", action: "attended" },
    { teacher: "Irene", student: "Luke", date: "2026-08-20", action: "attended" },
    { teacher: "Irene", student: "Luke", date: "2026-08-27", action: "attended" },
    { teacher: "Irene", student: "Koyee", date: "2026-08-06", action: "attended" },
    { teacher: "Irene", student: "Koyee", date: "2026-08-06", action: "attended" },
    { teacher: "Irene", student: "Koyee", date: "2026-08-20", action: "attended" },
    { teacher: "Irene", student: "Koyee", date: "2026-08-27", action: "attended" },
    { teacher: "Irene", student: "Christal", date: "2026-08-06", action: "attended" },
    { teacher: "Irene", student: "Christal", date: "2026-08-14", action: "attended" },
    { teacher: "Irene", student: "Amelia", date: "2026-08-06", action: "attended" },
    { teacher: "Irene", student: "Amelia", date: "2026-08-14", action: "attended" },
    { teacher: "Irene", student: "Amelia", date: "2026-08-20", action: "attended" },
    { teacher: "Irene", student: "Amelia", date: "2026-08-27", action: "attended" },
    { teacher: "Irene", student: "Amanda G4", date: "2026-08-07", action: "attended" },
    { teacher: "Irene", student: "Amanda G4", date: "2026-08-14", action: "attended" },
    { teacher: "Irene", student: "Amanda G4", date: "2026-08-21", action: "attended" },
    { teacher: "Irene", student: "Iris", date: "2026-08-07", action: "attended" },
    { teacher: "Irene", student: "Iris", date: "2026-08-14", action: "attended" },
    { teacher: "Irene", student: "Iris", date: "2026-08-28", action: "attended" },
    { teacher: "Irene", student: "Alicia", date: "2026-08-07", action: "attended" },
    { teacher: "Irene", student: "Alicia", date: "2026-08-14", action: "attended" },
    { teacher: "Irene", student: "Alicia", date: "2026-08-21", action: "attended" },
    { teacher: "Irene", student: "Alicia", date: "2026-08-28", action: "attended" },
    { teacher: "Irene", student: "Jayden Eddie", date: "2026-08-07", action: "attended" },
    { teacher: "Irene", student: "Jayden Eddie", date: "2026-08-14", action: "attended" },
    { teacher: "Irene", student: "Jayden Eddie", date: "2026-08-21", action: "attended" },
    { teacher: "Irene", student: "Jayden Eddie", date: "2026-08-28", action: "attended" },
    { teacher: "Irene", student: "Charis", date: "2026-08-01", action: "attended" },
    { teacher: "Irene", student: "Charis", date: "2026-08-08", action: "attended" },
    { teacher: "Irene", student: "Charis", date: "2026-08-22", action: "attended" },
    { teacher: "Irene", student: "Charis", date: "2026-08-22", action: "attended" },
    { teacher: "Irene", student: "Kyrie", date: "2026-08-01", action: "attended" },
    { teacher: "Irene", student: "Kyrie", date: "2026-08-15", action: "attended" },
    { teacher: "Irene", student: "Kyrie", date: "2026-08-15", action: "attended" },
    { teacher: "Irene", student: "Natalie Thien", date: "2026-08-01", action: "attended" },
    { teacher: "Irene", student: "Natalie Thien", date: "2026-08-08", action: "attended" },
    { teacher: "Irene", student: "Natalie Thien", date: "2026-08-15", action: "attended" },
    { teacher: "Irene", student: "Natalie Thien", date: "2026-08-22", action: "attended" },
    { teacher: "Irene", student: "Maryjane", date: "2026-08-01", action: "attended" },
    { teacher: "Irene", student: "Maryjane", date: "2026-08-08", action: "attended" },
    { teacher: "Irene", student: "Maryjane", date: "2026-08-15", action: "attended" },
    { teacher: "Irene", student: "Maryjane", date: "2026-08-22", action: "attended" },
    { teacher: "Irene", student: "Kamal", date: "2026-08-01", action: "attended" },
    { teacher: "Irene", student: "Kamal", date: "2026-08-08", action: "attended" },
    { teacher: "Irene", student: "Kamal", date: "2026-08-22", action: "attended" },
    { teacher: "Irene", student: "Naeyla", date: "2026-08-01", action: "attended" },
    { teacher: "Irene", student: "Naeyla", date: "2026-08-15", action: "attended" },
    { teacher: "Belinda", student: "Erner", date: "2026-08-10", action: "attended" },
    { teacher: "Belinda", student: "Erner", date: "2026-08-17", action: "attended" },
    { teacher: "Belinda", student: "Erner", date: "2026-08-24", action: "attended" },
    { teacher: "Belinda", student: "Maxine", date: "2026-08-10", action: "attended" },
    { teacher: "Belinda", student: "Maxine", date: "2026-08-24", action: "attended" },
    { teacher: "Belinda", student: "Millan", date: "2026-08-10", action: "attended" },
    { teacher: "Belinda", student: "Millan", date: "2026-08-17", action: "attended" },
    { teacher: "Belinda", student: "Millan", date: "2026-08-24", action: "attended" },
    { teacher: "Belinda", student: "Tiffany", date: "2026-08-10", action: "attended" },
    { teacher: "Belinda", student: "Tiffany", date: "2026-08-17", action: "attended" },
    { teacher: "Belinda", student: "Putri", date: "2026-08-17", action: "attended" },
    { teacher: "Belinda", student: "Putri", date: "2026-08-24", action: "attended" },
    { teacher: "Belinda", student: "Marc Austin", date: "2026-08-04", action: "attended" },
    { teacher: "Belinda", student: "Marc Austin", date: "2026-08-11", action: "attended" },
    { teacher: "Belinda", student: "Marc Austin", date: "2026-08-18", action: "attended" },
    { teacher: "Belinda", student: "Ameera", date: "2026-08-04", action: "attended" },
    { teacher: "Belinda", student: "Ameera", date: "2026-08-11", action: "attended" },
    { teacher: "Belinda", student: "Ameera", date: "2026-08-18", action: "attended" },
    { teacher: "Belinda", student: "Aisyah", date: "2026-08-04", action: "attended" },
    { teacher: "Belinda", student: "Aisyah", date: "2026-08-11", action: "attended" },
    { teacher: "Belinda", student: "Aisyah", date: "2026-08-18", action: "attended" },
    { teacher: "Belinda", student: "Luke", date: "2026-08-06", action: "attended" },
    { teacher: "Belinda", student: "Luke", date: "2026-08-13", action: "attended" },
    { teacher: "Belinda", student: "Luke", date: "2026-08-20", action: "attended" },
    { teacher: "Belinda", student: "Luke", date: "2026-08-27", action: "attended" },
    { teacher: "Belinda", student: "Harris", date: "2026-08-06", action: "attended" },
    { teacher: "Belinda", student: "Harris", date: "2026-08-13", action: "attended" },
    { teacher: "Belinda", student: "Harris", date: "2026-08-20", action: "attended" },
    { teacher: "Belinda", student: "Harris", date: "2026-08-27", action: "attended" },
    { teacher: "Belinda", student: "Megan", date: "2026-08-06", action: "attended" },
    { teacher: "Belinda", student: "Megan", date: "2026-08-20", action: "attended" },
    { teacher: "Belinda", student: "Megan", date: "2026-08-27", action: "attended" },
    { teacher: "Belinda", student: "Chloe", date: "2026-08-06", action: "attended" },
    { teacher: "Belinda", student: "Chloe", date: "2026-08-27", action: "attended" },
    { teacher: "Belinda", student: "Chloe", date: "2026-08-20", action: "attended" },
    { teacher: "Belinda", student: "Chloe", date: "2026-08-27", action: "attended" },
    { teacher: "Belinda", student: "Jeniffer", date: "2026-08-06", action: "attended" },
    { teacher: "Belinda", student: "Jeniffer", date: "2026-08-13", action: "attended" },
    { teacher: "Belinda", student: "Jeniffer", date: "2026-08-20", action: "attended" },
    { teacher: "Belinda", student: "Jeniffer", date: "2026-08-27", action: "attended" },
    { teacher: "Belinda", student: "Princeton", date: "2026-08-06", action: "attended" },
    { teacher: "Belinda", student: "Princeton", date: "2026-08-13", action: "attended" },
    { teacher: "Belinda", student: "Princeton", date: "2026-08-20", action: "attended" },
    { teacher: "Belinda", student: "Rou Rou", date: "2026-08-06", action: "attended" },
    { teacher: "Belinda", student: "Rou Rou", date: "2026-08-13", action: "attended" },
    { teacher: "Belinda", student: "Rou Rou", date: "2026-08-20", action: "attended" },
    { teacher: "Belinda", student: "Rou Rou", date: "2026-08-27", action: "attended" },
    { teacher: "Belinda", student: "Joel Pen", date: "2026-08-06", action: "attended" },
    { teacher: "Belinda", student: "Joel Pen", date: "2026-08-13", action: "attended" },
    { teacher: "Belinda", student: "Serena", date: "2026-08-06", action: "attended" },
    { teacher: "Belinda", student: "Serena", date: "2026-08-13", action: "attended" },
    { teacher: "Belinda", student: "Serena", date: "2026-08-20", action: "attended" },
    { teacher: "Belinda", student: "Serena", date: "2026-08-27", action: "attended" },
    { teacher: "Belinda", student: "Cayden", date: "2026-08-06", action: "attended" },
    { teacher: "Belinda", student: "Cayden", date: "2026-08-13", action: "attended" },
    { teacher: "Belinda", student: "Cayden", date: "2026-08-27", action: "attended" },
    { teacher: "Belinda", student: "Rachel", date: "2026-08-13", action: "attended" },
    { teacher: "Belinda", student: "Megan Voon", date: "2026-08-06", action: "attended" },
    { teacher: "Belinda", student: "Megan Voon", date: "2026-08-13", action: "attended" },
    { teacher: "Belinda", student: "Megan Voon", date: "2026-08-27", action: "attended" },
    { teacher: "Farah", student: "Amber", date: "2026-08-01", action: "attended" },
    { teacher: "Farah", student: "Amber", date: "2026-08-08", action: "attended" },
    { teacher: "Farah", student: "Amber", date: "2026-08-15", action: "attended" },
    { teacher: "Farah", student: "Amber", date: "2026-08-22", action: "attended" },
    { teacher: "Farah", student: "Joelle", date: "2026-08-01", action: "attended" },
    { teacher: "Farah", student: "Joelle", date: "2026-08-15", action: "attended" },
    { teacher: "Farah", student: "Joelle", date: "2026-08-22", action: "attended" },
    { teacher: "Farah", student: "Sofeea", date: "2026-08-01", action: "attended" },
    { teacher: "Farah", student: "Sofeea", date: "2026-08-15", action: "attended" },
    { teacher: "Farah", student: "Sofeea", date: "2026-08-15", action: "attended" },
    { teacher: "Farah", student: "Sofeea", date: "2026-08-22", action: "attended" },
    { teacher: "Dave", student: "Yusuf", date: "2026-08-03", action: "attended" },
    { teacher: "Dave", student: "Yusuf", date: "2026-08-10", action: "attended" },
    { teacher: "Dave", student: "Yusuf", date: "2026-08-17", action: "attended" },
    { teacher: "Dave", student: "Yusuf", date: "2026-08-24", action: "attended" },
    { teacher: "Dave", student: "Levi", date: "2026-08-03", action: "attended" },
    { teacher: "Dave", student: "Levi", date: "2026-08-10", action: "attended" },
    { teacher: "Dave", student: "Levi", date: "2026-08-17", action: "attended" },
    { teacher: "Dave", student: "Levi", date: "2026-08-24", action: "attended" },
    { teacher: "Dave", student: "Noah", date: "2026-08-10", action: "attended" },
    { teacher: "Dave", student: "Noah", date: "2026-08-24", action: "attended" },
    { teacher: "Dave", student: "Hailey", date: "2026-08-04", action: "attended" },
    { teacher: "Dave", student: "Hailey", date: "2026-08-11", action: "attended" },
    { teacher: "Dave", student: "Hailey", date: "2026-08-18", action: "attended" },
    { teacher: "Dave", student: "Tristan", date: "2026-08-04", action: "attended" },
    { teacher: "Dave", student: "Tristan", date: "2026-08-11", action: "attended" },
    { teacher: "Dave", student: "Tristan", date: "2026-08-18", action: "attended" },
    { teacher: "Dave", student: "Shawn Irfan", date: "2026-08-04", action: "attended" },
    { teacher: "Dave", student: "Shawn Irfan", date: "2026-08-11", action: "attended" },
    { teacher: "Dave", student: "Shawn Irfan", date: "2026-08-18", action: "attended" },
    { teacher: "Dave", student: "Crystal", date: "2026-08-06", action: "attended" },
    { teacher: "Dave", student: "Crystal", date: "2026-08-13", action: "attended" },
    { teacher: "Dave", student: "Crystal", date: "2026-08-20", action: "attended" },
    { teacher: "Dave", student: "Crystal", date: "2026-08-27", action: "attended" },
    { teacher: "Dave", student: "Calum", date: "2026-08-06", action: "attended" },
    { teacher: "Dave", student: "Calum", date: "2026-08-13", action: "attended" },
    { teacher: "Dave", student: "Calum", date: "2026-08-20", action: "attended" },
    { teacher: "Dave", student: "Calum", date: "2026-08-27", action: "attended" },
    { teacher: "Dave", student: "Catelyn", date: "2026-08-06", action: "attended" },
    { teacher: "Dave", student: "Catelyn", date: "2026-08-13", action: "attended" },
    { teacher: "Dave", student: "Catelyn", date: "2026-08-20", action: "attended" },
    { teacher: "Dave", student: "Catelyn", date: "2026-08-27", action: "attended" },
    { teacher: "Dave", student: "Lucas", date: "2026-08-06", action: "attended" },
    { teacher: "Dave", student: "Lucas", date: "2026-08-20", action: "attended" },
    { teacher: "Dave", student: "Cassie", date: "2026-08-06", action: "attended" },
    { teacher: "Dave", student: "Cassie", date: "2026-08-13", action: "attended" },
    { teacher: "Dave", student: "Cassie", date: "2026-08-20", action: "attended" },
    { teacher: "Dave", student: "Cassie", date: "2026-08-27", action: "attended" },
    { teacher: "Dave", student: "Jian", date: "2026-08-07", action: "attended" },
    { teacher: "Dave", student: "Jian", date: "2026-08-14", action: "attended" },
    { teacher: "Dave", student: "Jian", date: "2026-08-18", action: "attended" },
    { teacher: "Dave", student: "Jian", date: "2026-08-11", action: "attended" },
    { teacher: "Dave", student: "Dahee", date: "2026-08-07", action: "attended" },
    { teacher: "Dave", student: "Dahee", date: "2026-08-14", action: "attended" },
    { teacher: "Dave", student: "Dahee", date: "2026-08-18", action: "attended" },
    { teacher: "Dave", student: "Dahee", date: "2026-08-11", action: "attended" },
    { teacher: "Dave", student: "Ivan", date: "2026-08-07", action: "attended" },
    { teacher: "Dave", student: "Ivan", date: "2026-08-14", action: "attended" },
    { teacher: "Dave", student: "Christopher", date: "2026-08-01", action: "attended" },
    { teacher: "Dave", student: "Christopher", date: "2026-08-08", action: "attended" },
    { teacher: "Dave", student: "Daniel Shawn", date: "2026-08-08", action: "attended" },
    { teacher: "Dave", student: "Daniel Shawn", date: "2026-08-15", action: "attended" },
    { teacher: "Dave", student: "Janice", date: "2026-08-01", action: "attended" },
    { teacher: "Dave", student: "Janice", date: "2026-08-08", action: "attended" },
    { teacher: "Dave", student: "Janice", date: "2026-08-15", action: "attended" },
    { teacher: "Dave", student: "Cody", date: "2026-08-01", action: "attended" },
    { teacher: "Dave", student: "Cody", date: "2026-08-08", action: "attended" },
    { teacher: "Dave", student: "Cody", date: "2026-08-15", action: "attended" },
    { teacher: "Dave", student: "Jayden", date: "2026-08-01", action: "attended" },
    { teacher: "Dave", student: "Jayden", date: "2026-08-08", action: "attended" },
    { teacher: "Dave", student: "Jayden", date: "2026-08-15", action: "attended" },
    { teacher: "Dave", student: "Elon", date: "2026-08-01", action: "attended" },
    { teacher: "Dave", student: "Elon", date: "2026-08-08", action: "attended" },
    { teacher: "Dave", student: "Elon", date: "2026-08-15", action: "attended" },
    { teacher: "Dave", student: "Iman", date: "2026-08-01", action: "attended" },
    { teacher: "Dave", student: "Iman", date: "2026-08-15", action: "attended" },
    { teacher: "Yezelinne", student: "Onna", date: "2026-08-04", action: "attended" },
    { teacher: "Yezelinne", student: "Onna", date: "2026-08-11", action: "attended" },
    { teacher: "Yezelinne", student: "Onna", date: "2026-08-18", action: "attended" },
    { teacher: "Yezelinne", student: "Clayrissa", date: "2026-08-04", action: "attended" },
    { teacher: "Yezelinne", student: "Clayrissa", date: "2026-08-11", action: "attended" },
    { teacher: "Yezelinne", student: "Clayrissa", date: "2026-08-18", action: "attended" },
    { teacher: "Yezelinne", student: "Marissa", date: "2026-08-04", action: "attended" },
    { teacher: "Yezelinne", student: "Marissa", date: "2026-08-11", action: "attended" },
    { teacher: "Yezelinne", student: "Bryson", date: "2026-08-04", action: "attended" },
    { teacher: "Yezelinne", student: "Bryson", date: "2026-08-11", action: "attended" },
    { teacher: "Yezelinne", student: "Bryson", date: "2026-08-18", action: "attended" },
    { teacher: "Yezelinne", student: "Maxine (violin)", date: "2026-08-04", action: "attended" },
    { teacher: "Yezelinne", student: "Maxine (violin)", date: "2026-08-11", action: "attended" },
    { teacher: "Yezelinne", student: "Maxine (violin)", date: "2026-08-18", action: "attended" },
    { teacher: "Yezelinne", student: "Dhaniah", date: "2026-08-04", action: "attended" },
    { teacher: "Yezelinne", student: "Dhaniah", date: "2026-08-28", action: "attended" },
    { teacher: "Yezelinne", student: "Dhaniah", date: "2026-08-18", action: "attended" },
    { teacher: "Yezelinne", student: "Aidan", date: "2026-08-05", action: "attended" },
    { teacher: "Yezelinne", student: "Aidan", date: "2026-08-12", action: "attended" },
    { teacher: "Yezelinne", student: "Aidan", date: "2026-08-19", action: "attended" },
    { teacher: "Yezelinne", student: "Aidan", date: "2026-08-26", action: "attended" },
    { teacher: "Yezelinne", student: "Afnan", date: "2026-08-05", action: "attended" },
    { teacher: "Yezelinne", student: "Afnan", date: "2026-08-12", action: "attended" },
    { teacher: "Yezelinne", student: "Afnan", date: "2026-08-19", action: "attended" },
    { teacher: "Yezelinne", student: "Afnan", date: "2026-08-26", action: "attended" },
    { teacher: "Yezelinne", student: "Affiqah Vocal", date: "2026-08-05", action: "attended" },
    { teacher: "Yezelinne", student: "Affiqah Vocal", date: "2026-08-12", action: "attended" },
    { teacher: "Yezelinne", student: "Affiqah Vocal", date: "2026-08-19", action: "attended" },
    { teacher: "Yezelinne", student: "Affiqah Vocal", date: "2026-08-26", action: "attended" },
    { teacher: "Yezelinne", student: "Eva", date: "2026-08-07", action: "attended" },
    { teacher: "Yezelinne", student: "Eva", date: "2026-08-14", action: "attended" },
    { teacher: "Yezelinne", student: "Eva", date: "2026-08-21", action: "attended" },
    { teacher: "Yezelinne", student: "Soyoun", date: "2026-08-07", action: "attended" },
    { teacher: "Yezelinne", student: "Soyoun", date: "2026-08-14", action: "attended" },
    { teacher: "Yezelinne", student: "Soyoun", date: "2026-08-28", action: "attended" },
    { teacher: "Yezelinne", student: "Jian", date: "2026-08-07", action: "attended" },
    { teacher: "Yezelinne", student: "Jian", date: "2026-08-14", action: "attended" },
    { teacher: "Yezelinne", student: "Jian", date: "2026-08-18", action: "attended" },
    { teacher: "Yezelinne", student: "Jian", date: "2026-08-11", action: "attended" },
    { teacher: "Yezelinne", student: "Megan", date: "2026-08-07", action: "attended" },
    { teacher: "Yezelinne", student: "Megan", date: "2026-08-14", action: "attended" },
    { teacher: "Yezelinne", student: "Megan", date: "2026-08-21", action: "attended" },
    { teacher: "Yezelinne", student: "Megan", date: "2026-08-28", action: "attended" },
    { teacher: "Yezelinne", student: "nathaniel", date: "2026-08-01", action: "attended" },
    { teacher: "Yezelinne", student: "nathaniel", date: "2026-08-08", action: "attended" },
    { teacher: "Yezelinne", student: "heaven", date: "2026-08-01", action: "attended" },
    { teacher: "Yezelinne", student: "heaven", date: "2026-08-08", action: "attended" },
    { teacher: "Ivonne", student: "Natteo", date: "2026-08-11", action: "missed-student" },
    { teacher: "Ivonne", student: "Yu Yu", date: "2026-08-12", action: "missed-student" },
    { teacher: "Ivonne", student: "Yu Yu", date: "2026-08-19", action: "missed-student" },
    { teacher: "Ivonne", student: "Yu Yu", date: "2026-08-26", action: "missed-student" },
    { teacher: "Ivonne", student: "Irene", date: "2026-08-05", action: "missed-student" },
    { teacher: "Ivonne", student: "Athea", date: "2026-08-01", action: "missed-student" },
    { teacher: "Ivonne", student: "Kyle", date: "2026-08-01", action: "missed-student" },
    { teacher: "Irene", student: "Valerine", date: "2026-08-06", action: "missed-student" },
    { teacher: "Irene", student: "Valerine", date: "2026-08-13", action: "missed-student" },
    { teacher: "Irene", student: "Christal", date: "2026-08-20", action: "missed-student" },
    { teacher: "Irene", student: "Christal", date: "2026-08-27", action: "missed-student" },
    { teacher: "Irene", student: "Amanda G4", date: "2026-08-28", action: "missed-student" },
    { teacher: "Irene", student: "Kyrie", date: "2026-08-08", action: "missed-student" },
    { teacher: "Irene", student: "Kamal", date: "2026-08-15", action: "missed-student" },
    { teacher: "Belinda", student: "Tiffany", date: "2026-08-24", action: "missed-student" },
    { teacher: "Belinda", student: "Princeton", date: "2026-08-27", action: "missed-student" },
    { teacher: "Belinda", student: "Joel Pen", date: "2026-08-27", action: "missed-student" },
    { teacher: "Belinda", student: "Rachel", date: "2026-08-06", action: "missed-student" },
    { teacher: "Belinda", student: "Rachel", date: "2026-08-20", action: "missed-student" },
    { teacher: "Belinda", student: "Rachel", date: "2026-08-27", action: "missed-student" },
    { teacher: "Dave", student: "Iman", date: "2026-08-08", action: "missed-student" },
    { teacher: "Dave", student: "Leo", date: "2026-08-15", action: "missed-student" },
    { teacher: "Yezelinne", student: "Marissa", date: "2026-08-18", action: "absent" },
    { teacher: "Yezelinne", student: "Soyoun", date: "2026-08-21", action: "absent" },
  ];

  const [aug2ImportRunning, setAug2ImportRunning] = useState(false);
  const [aug2ImportResult, setAug2ImportResult] = useState(null);

  const runAugustReconciliationV2 = () => {
    const counts = AUGUST_2026_REMAINING_ENTRIES.reduce((acc, e) => { acc[e.action] = (acc[e.action] || 0) + 1; return acc; }, {});
    setConfirmState({
      message: `Apply ${AUGUST_2026_REMAINING_ENTRIES.length} status update(s) across Ivonne, Bester, Debrikah, Irene, Belinda, Farah, Dave, and Yezelinne's students — ${counts["attended"] || 0} marked Attended, ${counts["missed-student"] || 0} marked Student missed (X), ${counts["absent"] || 0} marked Absent (A) — based on their reconciled August 2026 sheets? Anything that doesn't match an existing lesson is skipped and listed afterward — nothing is created blind, and nothing already correctly set is touched.`,
      onConfirm: async () => {
        setConfirmState(null);
        setAug2ImportRunning(true);
        const norm = (s) => (s || "").toLowerCase().trim();
        let updated = 0; let alreadyCorrect = 0;
        const unmatched = [];
        const toUpdate = [];

        for (const entry of AUGUST_2026_REMAINING_ENTRIES) {
          const teacher = data.teachers.find((t) => norm(t.name) === norm(entry.teacher) || norm(t.name).includes(norm(entry.teacher)));
          if (!teacher) { unmatched.push({ ...entry, reason: "No teacher found with this name" }); continue; }
          const candidates = data.lessons.filter((l) => l.teacher_id === teacher.id && l.date === entry.date);
          const matches = candidates.filter((l) => {
            const sName = norm(studentName(l.student_id));
            return sName === norm(entry.student) || sName.includes(norm(entry.student)) || norm(entry.student).includes(sName);
          });
          if (matches.length === 0) { unmatched.push({ ...entry, reason: "No lesson found for this teacher/student/date" }); continue; }
          if (matches.length > 1) { unmatched.push({ ...entry, reason: `${matches.length} possible matches — ambiguous, skipped` }); continue; }
          const lesson = matches[0];
          if (lesson.status === entry.action) { alreadyCorrect++; continue; }
          toUpdate.push({ id: lesson.id, status: entry.action });
        }

        let failed = false;
        for (const { id, status } of toUpdate) {
          const { error } = await supabase.from("lessons").update({ status }).eq("id", id);
          if (error) { failed = true; break; }
          updated++;
        }

        setAug2ImportRunning(false);
        setAug2ImportResult({ updated, alreadyCorrect, unmatched, failed, total: AUGUST_2026_REMAINING_ENTRIES.length });
        refresh();
      },
    });
  };

  // Remove wrongly-added lessons for a month: month + optional teacher/
  // student narrowing, defaults to only "scheduled" rows so nothing
  // already attended, paid, or otherwise touched is ever swept up by
  // accident — those need to be reviewed individually, not bulk-removed.
  const [removeMonth, setRemoveMonth] = useState(todayIso().slice(0, 7));
  const [removeTeacherId, setRemoveTeacherId] = useState("");
  const [removeStudentId, setRemoveStudentId] = useState("");
  const [removeIncludeTouched, setRemoveIncludeTouched] = useState(false);
  const [removeResult, setRemoveResult] = useState(null);

  const removeMatches = data.lessons.filter((l) => {
    if (l.date.slice(0, 7) !== removeMonth) return false;
    if (removeTeacherId && l.teacher_id !== removeTeacherId) return false;
    if (removeStudentId && l.student_id !== removeStudentId) return false;
    if (!removeIncludeTouched && l.status !== "scheduled") return false;
    return true;
  }).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  const runRemoveLessons = () => {
    if (removeMatches.length === 0) return;
    const untouchedCount = removeMatches.filter((l) => l.status === "scheduled").length;
    const touchedCount = removeMatches.length - untouchedCount;
    const isSweeping = !removeTeacherId && !removeStudentId;
    setConfirmState({
      message: `Delete ${removeMatches.length} lesson(s) in ${removeMonth}${removeTeacherId ? ` for ${teacherName(removeTeacherId)}` : ""}${removeStudentId ? ` · ${studentName(removeStudentId)}` : ""}?${isSweeping ? ` This is every teacher and every student for the month, not a narrowed set.` : ""} ${touchedCount > 0 ? `${touchedCount} of these are already attended/paid/otherwise touched, not just plain scheduled — ` : ""}This can't be undone.`,
      onConfirm: async () => {
        setConfirmState(null);
        // Supabase's .in() filter is passed as a URL query param, which
        // has a length limit — a few hundred UUIDs comfortably fits, a
        // few thousand doesn't, so this batches the delete into chunks
        // rather than sending every id in one request.
        const CHUNK = 150;
        const ids = removeMatches.map((l) => l.id);
        let removed = 0; let firstError = null;
        for (let i = 0; i < ids.length; i += CHUNK) {
          const chunk = ids.slice(i, i + CHUNK);
          const { error } = await supabase.from("lessons").delete().in("id", chunk);
          if (error) { firstError = error.message; break; }
          removed += chunk.length;
        }
        setRemoveResult(firstError ? { error: `${firstError} (${removed} of ${ids.length} deleted before this failed)` } : { removed });
        refresh();
      },
    });
  };

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

  const IssueRow = ({ idx, onClick, children }) => (
    <div
      onClick={onClick}
      style={{ fontSize: 13, padding: "7px 4px", borderTop: idx ? "1px solid " + COLORS.border : "none", cursor: onClick ? "pointer" : "default", color: onClick ? COLORS.owner : COLORS.ink, display: "flex", justifyContent: "space-between", alignItems: "center" }}
    >
      <span>{children}</span>
      {onClick && <span style={{ fontSize: 12 }}>Open →</span>}
    </div>
  );

  return (
    <div>
      <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 16 }}>A periodic sanity check — nothing here breaks the app, but each of these can quietly cause wrong bills, missed lessons, or confusing filters. Click any item to jump straight to it.</div>

      <BackfillTool data={data} refresh={refresh} />

      <Card style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>August 2026 reconciliation — Samuel, An An, Natasha</div>
        <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 10 }}>One-time import from the confirmed attendance sheets. Marks the listed lessons Attended — skips anything that doesn't match an existing lesson exactly, and never touches a lesson already correctly set.</div>
        <Btn small variant="owner" onClick={runAugustAttendanceImport} disabled={augImportRunning}>
          {augImportRunning ? "Running…" : `Run import (${AUGUST_2026_CONFIRMED_ATTENDANCE.reduce((s, e) => s + e.days.length, 0)} entries)`}
        </Btn>
        {augImportResult && (
          <div style={{ marginTop: 10, fontSize: 12.5 }}>
            {augImportResult.failed && <div style={{ color: COLORS.dangerDark, marginBottom: 6 }}>Stopped partway through due to an error — {augImportResult.updated} update(s) went through before that; re-run to pick up the rest.</div>}
            <div>Updated: {augImportResult.updated} · Already correct: {augImportResult.alreadyAttended} · Unmatched: {augImportResult.unmatched.length}</div>
            {augImportResult.unmatched.length > 0 && (
              <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid " + COLORS.border, borderRadius: 8, marginTop: 6 }}>
                {augImportResult.unmatched.map((u, i) => (
                  <div key={i} style={{ padding: "4px 8px", borderTop: i ? "1px solid " + COLORS.border : "none" }}>{u.teacher} · {u.student} · {fmtDate(u.date)} — {u.reason}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>August 2026 reconciliation — remaining 8 teachers</div>
        <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 10 }}>Ivonne, Bester, Debrikah, Irene, Belinda, Farah, Dave, Yezelinne — using the now-confirmed symbol meanings (CH = holiday, R = still owed, X = absent not replaceable, A = absent replaceable, */** = replacement 15/30min, S- = covered by Samuel). Marks Attended, Student missed, or Absent accordingly — skips anything that doesn't match an existing lesson, never touches one already correctly set.</div>
        <Btn small variant="owner" onClick={runAugustReconciliationV2} disabled={aug2ImportRunning}>
          {aug2ImportRunning ? "Running…" : `Run import (${AUGUST_2026_REMAINING_ENTRIES.length} entries)`}
        </Btn>
        {aug2ImportResult && (
          <div style={{ marginTop: 10, fontSize: 12.5 }}>
            {aug2ImportResult.failed && <div style={{ color: COLORS.dangerDark, marginBottom: 6 }}>Stopped partway through due to an error — {aug2ImportResult.updated} update(s) went through before that; re-run to pick up the rest.</div>}
            <div>Updated: {aug2ImportResult.updated} of {aug2ImportResult.total} · Already correct: {aug2ImportResult.alreadyCorrect} · Unmatched: {aug2ImportResult.unmatched.length}</div>
            {aug2ImportResult.unmatched.length > 0 && (
              <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid " + COLORS.border, borderRadius: 8, marginTop: 6 }}>
                {aug2ImportResult.unmatched.map((u, i) => (
                  <div key={i} style={{ padding: "4px 8px", borderTop: i ? "1px solid " + COLORS.border : "none" }}>{u.teacher} · {u.student} · {fmtDate(u.date)} · {u.action} — {u.reason}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Remove wrongly-added lessons for a month</div>
        <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 10 }}>For cleaning up an accidental bulk-add — e.g. a whole month generated for the wrong period. Only plain "scheduled" lessons are matched by default, so nothing already attended, paid, or otherwise touched gets swept up without you seeing it first.</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <div style={{ width: 150 }}>
            <Field label="Month">
              <input type="month" value={removeMonth} onChange={(e) => { setRemoveMonth(e.target.value); setRemoveResult(null); }} style={inputStyle} />
            </Field>
          </div>
          <div style={{ width: 180 }}>
            <Field label="Teacher (optional)">
              <select value={removeTeacherId} onChange={(e) => { setRemoveTeacherId(e.target.value); setRemoveResult(null); }} style={inputStyle}>
                <option value="">All teachers</option>
                {data.teachers.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
              </select>
            </Field>
          </div>
          <div style={{ width: 220 }}>
            <Field label="Student (optional)">
              <SearchableSelect
                options={data.students.map((s) => ({ value: s.id, label: s.name }))}
                value={removeStudentId} onChange={(v) => { setRemoveStudentId(v); setRemoveResult(null); }} placeholder="All students"
              />
            </Field>
          </div>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, marginBottom: 10 }}>
          <input type="checkbox" checked={removeIncludeTouched} onChange={(e) => { setRemoveIncludeTouched(e.target.checked); setRemoveResult(null); }} />
          Also include lessons already marked attended/absent/paid/etc — not just plain scheduled
        </label>

        {removeMatches.length > 0 && (
          <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid " + COLORS.border, borderRadius: 8, marginBottom: 10 }}>
            {removeMatches.slice(0, 100).map((l) => (
              <div key={l.id} style={{ padding: "6px 10px", fontSize: 12.5, borderBottom: "1px solid " + COLORS.border, display: "flex", justifyContent: "space-between" }}>
                <span>{fmtDate(l.date)} {l.time?.slice(0, 5)} · {studentName(l.student_id)} · {teacherName(l.teacher_id)}</span>
                <span style={{ color: COLORS.inkSoft }}>{statusLabel(l.status)}</span>
              </div>
            ))}
            {removeMatches.length > 100 && <div style={{ padding: "6px 10px", fontSize: 12, color: COLORS.inkSoft }}>+{removeMatches.length - 100} more not shown here, all included in the delete.</div>}
          </div>
        )}

        <Btn small variant="danger" onClick={runRemoveLessons} disabled={removeMatches.length === 0}>
          {removeMatches.length === 0 ? "No matching lessons" : `Delete ${removeMatches.length} lesson(s)`}
        </Btn>
        {removeResult && (
          <div style={{ marginTop: 10, fontSize: 12.5, color: removeResult.error ? COLORS.dangerDark : COLORS.successDark }}>
            {removeResult.error ? `Couldn't delete: ${removeResult.error}` : `Removed ${removeResult.removed} lesson(s).`}
          </div>
        )}
      </Card>

      <Card style={{ marginBottom: 14, background: runningLow.length > 0 ? COLORS.dangerBg : undefined, border: runningLow.length > 0 ? "none" : undefined }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Schedules — auto-kept 4 months ahead</div>
          <Badge tone={runningLow.length > 0 ? "amber" : "success"}>{runningLow.length > 0 ? `${runningLow.length} pending` : "All caught up"}</Badge>
        </div>
        <div style={{ fontSize: 12, color: COLORS.inkSoft, marginTop: 4 }}>
          Every active, scheduled instrument's calendar tops itself up automatically each time the app loads — nothing to click here anymore. If the pending count above doesn't reach 0 within a minute of loading the app, something's not right — let Claude know.
        </div>
        {autoTopUpError && (
          <div style={{ marginTop: 10, padding: "8px 10px", background: "#fff", border: "1px solid " + COLORS.dangerDark, borderRadius: 8, fontSize: 12, color: COLORS.dangerDark }}>
            <strong>Last attempt failed:</strong> {autoTopUpError}
          </div>
        )}
      </Card>

      <Section title="Students with no instrument at all" blurb="Never got a course/instrument set up — they're active but invisible to billing and the calendar." count={noInstrumentsAtAll.length}>
        {noInstrumentsAtAll.map((s, idx) => (
          <IssueRow key={idx} idx={idx} onClick={() => { goToStudent(s.id); setTab("students"); }}>{s.name}</IssueRow>
        ))}
      </Section>

      <Section title="Instruments with no rate set" blurb="Will bill RM0 until fixed." count={noRate.length}>
        {noRate.map((i, idx) => (
          <IssueRow key={idx} idx={idx} onClick={() => { goToStudent(i.studentId); setTab("students"); }}>{i.studentName} — {i.course}{i.level ? ` (${i.level})` : ""}</IssueRow>
        ))}
      </Section>

      <Section title="Instruments billed per-lesson" blurb="Almost everyone is meant to be billed monthly — per-lesson is the rare, deliberate exception. Worth a quick scan to confirm this list is only the students actually meant to be here, since a couple of spots in the app quietly default to per-lesson when billing type was never explicitly set." count={perLessonInstruments.length}>
        {perLessonInstruments.map((i, idx) => (
          <IssueRow key={idx} idx={idx} onClick={() => { goToStudent(i.studentId); setTab("students"); }}>{i.studentName} — {i.course}{i.level ? ` (${i.level})` : ""} · {fmtMoney(i.price || 0)}/lesson</IssueRow>
        ))}
      </Section>

      <Section title="Instruments with no schedule" blurb="Never generated any calendar lessons — set Day/Time on the instrument." count={notScheduled.length}>
        {notScheduled.map((i, idx) => (
          <IssueRow key={idx} idx={idx} onClick={() => { goToStudent(i.studentId); setTab("students"); }}>{i.studentName} — {i.course}{i.level ? ` (${i.level})` : ""}</IssueRow>
        ))}
      </Section>

      <Section title="Instruments with no teacher assigned" blurb="Might be intentional, but worth a glance." count={noTeacher.length}>
        {noTeacher.map((i, idx) => (
          <IssueRow key={idx} idx={idx} onClick={() => { goToStudent(i.studentId); setTab("students"); }}>{i.studentName} — {i.course}{i.level ? ` (${i.level})` : ""}</IssueRow>
        ))}
      </Section>

      <Section title="Teachers with no payout rate set" blurb="Whatever their pay structure, the rate itself is 0 or blank — every lesson they teach will pay out RM0." count={noPayoutRate.length}>
        {noPayoutRate.map((t, idx) => (
          <IssueRow key={idx} idx={idx} onClick={() => setTab("teachers")}>{t.name}</IssueRow>
        ))}
      </Section>

      <Section title="Course names with mismatched capitalization" blurb="e.g. 'Piano' and 'piano' are treated as two different courses by every filter and group." count={casingIssues.length}>
        {casingIssues.map(([key, variants], idx) => (
          <div key={idx} style={{ padding: "8px 0", borderBottom: idx < casingIssues.length - 1 ? "1px solid " + COLORS.border : "none" }}>
            <IssueRow idx={idx} onClick={() => { goToStudentSearch(key); setTab("students"); }}>{[...variants].join(" / ")}</IssueRow>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4, marginLeft: 28 }}>
              {[...variants].map((v) => (
                <Btn key={v} small onClick={() => unifyCasing(variants, v)} disabled={unifyingKey === v}>
                  {unifyingKey === v ? "Unifying…" : `Unify to "${v}"`}
                </Btn>
              ))}
            </div>
          </div>
        ))}
      </Section>

      <Section title="Possible duplicate students" blurb="Same full name on more than one student record." count={possibleDuplicates.length}>
        {possibleDuplicates.map(([name, count], idx) => (
          <IssueRow key={idx} idx={idx} onClick={() => { goToStudentSearch(name); setTab("students"); }}>{name} ({count} records)</IssueRow>
        ))}
      </Section>

      <Section title="Course levels with no price set" blurb="Neither a Child nor Adult rate — picking this level won't auto-fill anything." count={levelsNoPrice.length}>
        {levelsNoPrice.map((l, idx) => {
          const course = data.courses.find((c) => c.id === l.course_id);
          return <div key={idx} style={{ fontSize: 13, padding: "5px 0", borderTop: idx ? "1px solid " + COLORS.border : "none" }}>{course?.name || "—"} — {l.name}</div>;
        })}
      </Section>

      <Section title="Duplicate lesson rows" blurb="Same student, teacher, date/time and instrument booked more than once — usually leftover from an old double-generation, not a new one." count={duplicateLessons.length}>
        {duplicateLessons.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <Btn small variant="danger" onClick={removeDuplicateLessons} disabled={removingDupes}>
              {removingDupes ? "Removing…" : `Remove ${duplicateLessons.reduce((n, g) => n + g.length - 1, 0)} duplicate row(s)`}
            </Btn>
          </div>
        )}
        {duplicateLessons.map((group, idx) => (
          <div key={idx} style={{ fontSize: 13, padding: "5px 0", borderTop: idx ? "1px solid " + COLORS.border : "none" }}>
            {studentName(group[0].student_id)} — {fmtDate(group[0].date)} {group[0].time.slice(0, 5)} · {teacherName(group[0].teacher_id)}{group[0].instrument ? ` · ${group[0].instrument}` : ""} ({group.length} copies)
          </div>
        ))}
      </Section>

      <Section title="Lessons on the wrong day/time" blurb="Already-generated calendar lessons that no longer match the student's set schedule — most often from a profile change (e.g. a bulk import) that couldn't also touch the calendar. Each 'Fix' regenerates that instrument's upcoming lessons on its current schedule." count={scheduleMismatches.length}>
        {scheduleMismatches.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <Btn small variant="danger" onClick={fixAllSchedules} disabled={fixingKey !== null}>
              {fixingKey === "__all__" ? "Fixing all…" : `Fix all ${scheduleMismatches.length}`}
            </Btn>
          </div>
        )}
        {scheduleMismatches.map((group, idx) => {
          const key = `${group.studentId}|${group.course}`;
          return (
            <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "7px 0", borderTop: idx ? "1px solid " + COLORS.border : "none" }}>
              <div style={{ fontSize: 13 }}>
                <a href="#" onClick={(e) => { e.preventDefault(); goToStudent(group.studentId); }} style={{ color: COLORS.owner, fontWeight: 600 }}>{studentName(group.studentId)}</a> — {group.course}
                <div style={{ color: COLORS.inkSoft, fontSize: 12 }}>
                  Set for {WEEKDAYS[group.day]} {group.expectedTime} · {group.lessons.length} lesson(s) sitting on the wrong slot (earliest {fmtDate(group.lessons[0].date)} {group.lessons[0].time.slice(0, 5)})
                </div>
              </div>
              <Btn small variant="danger" onClick={() => fixSchedule(group)} disabled={fixingKey !== null}>
                {fixingKey === key ? "Fixing…" : "Fix schedule"}
              </Btn>
            </div>
          );
        })}
      </Section>

      <Section title="Students with two lessons under the same course name" blurb="e.g. two separate weekly 'Piano' slots. Calendar lessons only record the course name, not which of the two they belong to, so their schedules can't be safely auto-checked or auto-fixed — the wrong-day/time check above skips these on purpose. Use 'Change time' on the student's profile if one of these needs correcting." count={ambiguousDuplicateNames.length}>
        {ambiguousDuplicateNames.map((d, idx) => (
          <div key={`${d.studentId}|${d.course}`} style={{ fontSize: 13, padding: "5px 0", borderTop: idx ? "1px solid " + COLORS.border : "none" }}>
            <a href="#" onClick={(e) => { e.preventDefault(); goToStudent(d.studentId); }} style={{ color: COLORS.owner, fontWeight: 600 }}>{studentName(d.studentId)}</a> — {d.course}
          </div>
        ))}
      </Section>

      <Section title="Replacement lessons missing their instrument" blurb="A past bug in Reschedule/Arrange replacement didn't carry the instrument (or room) across to the new slot — fixed going forward, but these existing ones still need patching, especially for students who take more than one instrument." count={replacementsMissingInstrument.length}>
        {replacementsMissingInstrument.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <Btn small variant="danger" onClick={fixReplacementInstruments} disabled={fixingReplacements}>
              {fixingReplacements ? "Fixing…" : `Fix ${replacementsMissingInstrument.length} lesson(s)`}
            </Btn>
          </div>
        )}
        {replacementsMissingInstrument.map((l, idx) => {
          const original = data.lessons.find((o) => o.id === l.replacement_of);
          return (
            <div key={l.id} style={{ fontSize: 13, padding: "5px 0", borderTop: idx ? "1px solid " + COLORS.border : "none" }}>
              {studentName(l.student_id)} — {fmtDate(l.date)} {l.time.slice(0, 5)} (replacing {original ? `${fmtDate(original.date)} ${original.time.slice(0, 5)}` : "a missed lesson"}, should be "{original?.instrument}")
            </div>
          );
        })}
      </Section>

      <Section title="Leftover cancelled slots from the old 'Open for replacement' bug" blurb="A past bug left the old cancelled placeholder behind instead of removing it once its slot was used to cover a different missed lesson — fixed going forward, this only catches leftovers from before the fix. Only flagged when a real replacement is confirmed sitting at the exact same student, date, and time, so this never touches a cancelled lesson that's still genuinely waiting to be handled." count={leftoverCancelledSlots.length}>
        {leftoverCancelledSlots.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <Btn small variant="danger" onClick={fixLeftoverCancelledSlots} disabled={fixingLeftovers}>
              {fixingLeftovers ? "Removing…" : `Remove ${leftoverCancelledSlots.length} leftover(s)`}
            </Btn>
          </div>
        )}
        {leftoverCancelledSlots.map(({ orphan, replacement }, idx) => (
          <div key={orphan.id} style={{ fontSize: 13, padding: "5px 0", borderTop: idx ? "1px solid " + COLORS.border : "none" }}>
            {studentName(orphan.student_id)} — {fmtDate(orphan.date)} {orphan.time.slice(0, 5)} · leftover from filling the slot for {studentName(replacement.student_id)}'s {replacement.replacement_of ? (data.lessons.find((o) => o.id === replacement.replacement_of)?.date ? `${fmtDate(data.lessons.find((o) => o.id === replacement.replacement_of).date)} lesson` : "missed lesson") : "missed lesson"}
          </div>
        ))}
      </Section>

      <Section title="Future lessons already marked as Attended" blurb="A lesson dated after today can't have happened yet, so 'Attended' here is always a mistake — usually from Backfill run with the wrong 'Mark as' option, or a bad import. Safe to revert in bulk: this never touches a lesson dated today or earlier." count={futureAttended.length}>
        {futureAttended.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <Btn small variant="danger" onClick={fixFutureAttended} disabled={fixingFutureAttended}>
              {fixingFutureAttended ? "Fixing…" : `Set ${futureAttended.length} back to Scheduled`}
            </Btn>
          </div>
        )}
        {futureAttended.slice(0, 300).map((l, idx) => (
          <div key={l.id} style={{ fontSize: 13, padding: "5px 0", borderTop: idx ? "1px solid " + COLORS.border : "none" }}>
            {studentName(l.student_id)} — {fmtDate(l.date)} {l.time.slice(0, 5)} · {teacherName(l.teacher_id)}
          </div>
        ))}
        {futureAttended.length > 300 && <div style={{ fontSize: 12.5, color: COLORS.inkSoft, marginTop: 6 }}>+{futureAttended.length - 300} more not shown — the fix button above still covers all of them.</div>}
      </Section>

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
        <Modal title="Heads up" onClose={() => setNoticeState(null)}>
          <div style={{ fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>{noticeState}</div>
          <Btn onClick={() => setNoticeState(null)}>OK</Btn>
        </Modal>
      )}
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
  const [staffUid, setStaffUid] = useState("");
  const [staffName, setStaffName] = useState("");
  const [staffErr, setStaffErr] = useState("");

  const linkStaff = async (e) => {
    e.preventDefault();
    setStaffErr("");
    const { error } = await supabase.from("profiles").upsert({ id: staffUid.trim(), role: "staff", name: staffName.trim() || null });
    if (error) { setStaffErr(error.message); return; }
    setStaffUid(""); setStaffName(""); refresh();
  };
  const removeStaff = async (id) => {
    if (!confirm("Remove this staff login? They'll no longer be able to sign in — this only removes their access, not the Supabase Auth user itself (delete that separately in Supabase if you want it fully gone).")) return;
    await supabase.from("profiles").delete().eq("id", id);
    refresh();
  };

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

      <SabahHolidaysTool data={data} refresh={refresh} />

      <Card style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Staff / Admin logins</div>
        <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 12 }}>
          For someone who needs the same day-to-day access as this Master account — arranging replacements, adding students, updating student data — but doesn't need Payments, Settings, Health Check, Invoices, Materials, or Reports. They get Calendar, Teachers, Students, Courses, and Replacements only.
          Create the login in Supabase (Authentication → Add user) first — for the email field there, they don't need a real address, use <code>username@teacherlogin.local</code> — then paste their User UID here. They'll then just type their username on the sign-in screen, same as a teacher does.
        </div>
        {data.staffProfiles.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            {data.staffProfiles.map((p) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderTop: "1px solid " + COLORS.border, fontSize: 13 }}>
                <span>{p.name || "(no name set)"} <span style={{ color: COLORS.inkSoft, fontSize: 12 }}>{p.id}</span></span>
                <Btn small variant="danger" onClick={() => removeStaff(p.id)}>Remove</Btn>
              </div>
            ))}
          </div>
        )}
        <form onSubmit={linkStaff} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 160px" }}><Field label="Name (for your own reference)"><input value={staffName} onChange={(e) => setStaffName(e.target.value)} style={inputStyle} placeholder="e.g. Aina" /></Field></div>
          <div style={{ flex: "2 1 240px" }}><Field label="User UID"><input required value={staffUid} onChange={(e) => setStaffUid(e.target.value)} style={inputStyle} /></Field></div>
          <Btn type="submit" variant="owner">Link staff login</Btn>
        </form>
        {staffErr && <div style={{ fontSize: 13, color: COLORS.danger, marginTop: 8 }}>{staffErr}</div>}
      </Card>
    </div>
  );
}

// Sabah's public holiday calendar — national holidays plus the Sabah-specific
// ones (Governor's Birthday, Good Friday, Pesta Kaamatan, Christmas Eve) that
// most other Malaysian states don't observe. Source: official Sabah
// government gazette, cross-checked against public-holidays.com.my. Only
// blocks the automatic weekly lesson generator, same as any other date
// marked here — a specific teacher can still be manually booked for a
// lesson on one of these dates if they're actually available; nothing in
// the app prevents that.
const SABAH_HOLIDAYS_2026 = [
  { date: "2026-01-01", reason: "New Year's Day" },
  { date: "2026-02-17", reason: "Chinese New Year" },
  { date: "2026-02-18", reason: "Chinese New Year (Day 2)" },
  { date: "2026-03-21", reason: "Hari Raya Aidilfitri" },
  { date: "2026-03-22", reason: "Hari Raya Aidilfitri (Day 2)" },
  { date: "2026-03-23", reason: "Hari Raya Aidilfitri (observed)" },
  { date: "2026-03-30", reason: "Sabah Governor's Birthday" },
  { date: "2026-04-03", reason: "Good Friday" },
  { date: "2026-05-01", reason: "Labour Day" },
  { date: "2026-05-27", reason: "Hari Raya Haji" },
  { date: "2026-05-30", reason: "Pesta Kaamatan (Harvest Festival)" },
  { date: "2026-05-31", reason: "Pesta Kaamatan (Day 2) / Wesak Day" },
  { date: "2026-06-01", reason: "Harvest Festival & Wesak Day (observed) / Agong's Birthday" },
  { date: "2026-06-17", reason: "Awal Muharram" },
  { date: "2026-08-25", reason: "Prophet Muhammad's Birthday" },
  { date: "2026-08-31", reason: "Merdeka Day" },
  { date: "2026-09-16", reason: "Malaysia Day" },
  { date: "2026-11-08", reason: "Deepavali" },
  { date: "2026-11-09", reason: "Deepavali (observed)" },
  { date: "2026-12-24", reason: "Christmas Eve" },
  { date: "2026-12-25", reason: "Christmas Day" },
];

function SabahHolidaysTool({ data, refresh }) {
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const existingDates = new Set(data.holidays.map((h) => h.date));
  const missing = SABAH_HOLIDAYS_2026.filter((h) => !existingDates.has(h.date));

  const runImport = async () => {
    setImporting(true);
    const { error } = await supabase.from("holidays").insert(missing);
    // Same rule as marking a single day: any lesson still sitting as
    // "scheduled" on one of these newly-added dates gets auto-cancelled —
    // no replacement owed, no payment owed, since it's a planned closure.
    let cancelledCount = 0;
    if (!error) {
      const missingDates = new Set(missing.map((h) => h.date));
      const reasonByDate = new Map(missing.map((h) => [h.date, h.reason || "Public holiday"]));
      const toCancel = data.lessons.filter((l) => l.status === "scheduled" && missingDates.has(l.date));
      cancelledCount = toCancel.length;
      for (const l of toCancel) {
        await supabase.from("lessons").update({ status: "cancelled", reason: reasonByDate.get(l.date) }).eq("id", l.id);
      }
    }
    setImporting(false);
    setResult(error ? "Something went wrong — try again in a moment." : `Added ${missing.length} holiday(s)${cancelledCount ? `, and cancelled ${cancelledCount} lesson(s) already sitting on those dates (no replacement or payment owed for them — open any back up individually if a teacher's available that day)` : ""}.`);
    refresh();
  };

  return (
    <Card style={{ marginTop: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>Sabah public holidays (2026)</div>
      <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 10 }}>
        Adds the full gazetted Sabah calendar — national holidays plus Sabah-only ones like Pesta Kaamatan, Good Friday, and the Governor's Birthday — as studio-closed days. Any lesson already sitting on one of these dates gets auto-cancelled (no replacement or payment owed), shown with a light red wash in that day's schedule. If a teacher is actually available that day, open that one lesson back up individually with "Open for replacement."
      </div>
      {missing.length === 0 ? (
        <div style={{ fontSize: 13, color: COLORS.successDark }}>All 2026 Sabah public holidays are already on your calendar.</div>
      ) : (
        <Btn variant="owner" onClick={runImport} disabled={importing}>
          {importing ? "Adding…" : `Add ${missing.length} missing holiday(s)`}
        </Btn>
      )}
      {result && <div style={{ fontSize: 12.5, color: COLORS.inkSoft, marginTop: 8 }}>{result}</div>}
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
  const [monthlyForm, setMonthlyForm] = useState({ studentId: data.students[0]?.id || "", month: todayIso().slice(0, 7) });
  const [monthlyMaterials, setMonthlyMaterials] = useState([]);
  const addMonthlyMaterial = () => setMonthlyMaterials((m) => [...m, { description: "", amount: "" }]);
  const updateMonthlyMaterial = (i, patch) => setMonthlyMaterials((m) => m.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const removeMonthlyMaterial = (i) => setMonthlyMaterials((m) => m.filter((_, idx) => idx !== i));
  const [manualForm, setManualForm] = useState({ studentId: data.students[0]?.id || "", date: todayIso(), items: [{ description: "", amount: "" }] });
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [viewInvoice, setViewInvoice] = useState(null);
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const [viewStudentInvoices, setViewStudentInvoices] = useState(null);
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState("all");
  const [invoiceCourseFilter, setInvoiceCourseFilter] = useState("");
  const [invoiceSortBy, setInvoiceSortBy] = useState("name");
  const [invoiceGroupBy, setInvoiceGroupBy] = useState("student");
  const [invoiceShowAll, setInvoiceShowAll] = useState(false);
  const [invoiceMonthFilter, setInvoiceMonthFilter] = useState("all");
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState(new Set());

  const studentName = (id) => data.students.find((s) => s.id === id)?.name || "—";
  const itemsFor = (invId) => data.invoiceItems.filter((it) => it.invoice_id === invId);
  const downloadInvoicePdf = (inv) => {
    const dueDate = inv.due_date || monthlyDueDate(inv.month || inv.date);
    const meta = [
      { label: "Invoice #", value: invoiceNoLabel(inv.invoice_no) },
      { label: "Date", value: fmtDate(inv.date) },
      { label: "Due", value: fmtDate(dueDate) },
      { label: "Status", value: inv.status === "paid" ? `Paid ${fmtDate(inv.paid_date)}` : "Unpaid" },
      { label: "Bill to", value: studentName(inv.student_id) },
    ];
    const rows = itemsFor(inv.id).map((it) => ({ label: it.description, value: fmtMoney(it.amount) }));
    generateDocPdf({ settings: data.settings, docType: inv.status === "paid" ? "RECEIPT" : "INVOICE", meta, rows, totalLabel: "Total", totalValue: fmtMoney(inv.total), filename: `${invoiceNoLabel(inv.invoice_no)}-${studentName(inv.student_id)}` });
  };

  const totalOwed = data.invoices.filter((inv) => inv.status !== "paid").reduce((sum, inv) => sum + Number(inv.total), 0);
  const totalCollectedThisMonth = data.studentPayments.filter((p) => p.date.slice(0, 7) === todayIso().slice(0, 7)).reduce((sum, p) => sum + Number(p.amount), 0);
  const daysOverdue = (dateStr) => Math.floor((new Date(todayIso()) - new Date(dateStr)) / 86400000);

  const studentCourseNames = (studentId) => {
    const s = data.students.find((x) => x.id === studentId);
    const names = [];
    if (s?.course) names.push(s.course);
    data.studentInstruments.filter((si) => si.student_id === studentId).forEach((si) => { if (si.course) names.push(si.course); });
    return names;
  };
  const courseOptions = [...new Set(
    data.students.flatMap((s) => [s.course, ...data.studentInstruments.filter((si) => si.student_id === s.id).map((si) => si.course)]).filter(Boolean)
  )].sort();

  const enrichedInvoices = data.invoices.map((inv) => {
    const dueDate = inv.due_date || monthlyDueDate(inv.month || inv.date);
    const days = inv.status === "paid" ? 0 : daysOverdue(dueDate);
    return { ...inv, dueDate, daysLate: days, isOverdue: inv.status !== "paid" && days > 0 };
  });

  const invoiceMatchesFilters = (inv) => {
    if (invoiceStatusFilter === "unpaid" && inv.status === "paid") return false;
    if (invoiceStatusFilter === "paid" && inv.status !== "paid") return false;
    if (invoiceStatusFilter === "overdue" && !inv.isOverdue) return false;
    if (invoiceCourseFilter && !studentCourseNames(inv.student_id).includes(invoiceCourseFilter)) return false;
    if (invoiceMonthFilter !== "all" && (inv.month || inv.date.slice(0, 7)) !== invoiceMonthFilter) return false;
    if (invoiceSearch) {
      const q = invoiceSearch.toLowerCase();
      if (!studentName(inv.student_id).toLowerCase().includes(q) && !invoiceNoLabel(inv.invoice_no).toLowerCase().includes(q)) return false;
    }
    return true;
  };

  const monthOptions = [...new Set(data.invoices.map((inv) => inv.month || inv.date.slice(0, 7)))].sort().reverse();
  const formatMonthLabel = (ym) => { const [yy, mm] = ym.split("-"); return `${MONTH_NAMES[Number(mm) - 1]} ${yy}`; };

  const filteredInvoices = enrichedInvoices.filter(invoiceMatchesFilters).sort((a, b) => {
    if (invoiceSortBy === "amount") return Number(b.total) - Number(a.total);
    if (invoiceSortBy === "newest") return (b.date || "").localeCompare(a.date || "");
    if (invoiceSortBy === "oldest") return (a.date || "").localeCompare(b.date || "");
    if (invoiceSortBy === "overdue") return b.daysLate - a.daysLate;
    return studentName(a.student_id).localeCompare(studentName(b.student_id));
  });

  const groupedByStudent = (() => {
    const map = new Map();
    filteredInvoices.forEach((inv) => {
      if (!map.has(inv.student_id)) map.set(inv.student_id, []);
      map.get(inv.student_id).push(inv);
    });
    return [...map.entries()].map(([studentId, invs]) => {
      const owed = invs.filter((i) => i.status !== "paid").reduce((sum, i) => sum + Number(i.total), 0);
      const paid = invs.filter((i) => i.status === "paid").reduce((sum, i) => sum + Number(i.total), 0);
      const maxOverdueDays = Math.max(0, ...invs.map((i) => i.daysLate));
      return { studentId, invoices: invs, owed, paid, maxOverdueDays };
    }).sort((a, b) => {
      if (invoiceSortBy === "amount") return b.owed - a.owed;
      if (invoiceSortBy === "overdue") return b.maxOverdueDays - a.maxOverdueDays;
      return studentName(a.studentId).localeCompare(studentName(b.studentId));
    });
  })();

  // --- Generate monthly invoice ---
  const monthlyStudent = data.students.find((s) => s.id === monthlyForm.studentId);
  const [y, m] = monthlyForm.month.split("-");
  const monthLabel = `${MONTH_NAMES[Number(m) - 1]} ${y}`;
  const computeInstrumentBreakdown = (studentId, month) => {
    const student = data.students.find((s) => s.id === studentId);
    if (!student) return [];
    const billable = [
      { key: "primary", course: student.course, level: student.level, billing_type: student.billing_type, monthly_rate: student.monthly_rate },
      ...data.studentInstruments.filter((si) => si.student_id === studentId).map((si) => ({ key: si.id, course: si.course, level: si.level, billing_type: si.billing_type || "per_lesson", monthly_rate: si.monthly_rate })),
    ].filter((b) => b.course);
    return billable.map((b) => {
      const lessonsForThis = data.lessons.filter((l) =>
        l.student_id === studentId && l.date.slice(0, 7) === month &&
        (l.status === "attended" || l.status === "scheduled") &&
        (l.instrument || student.course) === b.course
      );
      const amount = b.billing_type === "per_month" ? Number(b.monthly_rate || 0) : lessonsForThis.reduce((sum, l) => sum + Number(l.price), 0);
      return { ...b, lessons: lessonsForThis, amount };
    });
  };
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

  const generateInvoiceForStudent = async (studentId, month) => {
    const breakdown = computeInstrumentBreakdown(studentId, month);
    const total = breakdown.reduce((sum, b) => sum + b.amount, 0);
    if (total <= 0) return { skipped: true };
    const [yy, mm] = month.split("-");
    const label = `${MONTH_NAMES[Number(mm) - 1]} ${yy}`;
    const { data: inv, error } = await supabase.from("invoices").insert({ student_id: studentId, date: todayIso(), month, total, due_date: monthlyDueDate(month) }).select().single();
    if (error || !inv) return { skipped: true, error: error?.message };
    const items = [];
    breakdown.forEach((b) => {
      if (b.billing_type === "per_month") {
        items.push({ invoice_id: inv.id, description: `${b.course}${b.level ? ` (${b.level})` : ""} — ${label} (monthly fee${b.lessons.length ? `, ${b.lessons.length} lesson${b.lessons.length > 1 ? "s" : ""} logged` : ""})`, amount: b.amount, sort_order: items.length });
      } else if (b.lessons.length > 0) {
        const byDuration = {};
        b.lessons.forEach((l) => { const d = l.duration_min || 30; byDuration[d] = (byDuration[d] || 0) + 1; });
        items.push({ invoice_id: inv.id, description: `${b.course} — ${label} (${b.lessons.length} × ${Object.keys(byDuration).join("/")} min)`, amount: b.amount, sort_order: items.length });
      }
    });
    if (items.length) await supabase.from("invoice_items").insert(items);
    return { skipped: false };
  };
  const hasMonthlyInstrument = (s) => s.billing_type === "per_month" || data.studentInstruments.some((si) => si.student_id === s.id && si.billing_type === "per_month");
  const [bulkGenerateMonth, setBulkGenerateMonth] = useState(todayIso().slice(0, 7));
  const generateThisMonthForEveryone = async () => {
    const month = bulkGenerateMonth;
    const eligible = data.students.filter((s) => (s.status || "active") === "active" && hasMonthlyInstrument(s));
    const alreadyInvoiced = new Set(data.invoices.filter((inv) => inv.month === month).map((inv) => inv.student_id));
    const toGenerate = eligible.filter((s) => !alreadyInvoiced.has(s.id));
    if (toGenerate.length === 0) { setBulkResult({ generated: 0, skipped: 0, alreadyDone: alreadyInvoiced.size }); return; }
    if (!confirm(`Generate ${month} invoices for ${toGenerate.length} student${toGenerate.length === 1 ? "" : "s"}? (${alreadyInvoiced.size} already have one for that month — skipped automatically.)`)) return;
    setBulkGenerating(true);
    let generated = 0; let skipped = 0;
    for (const s of toGenerate) {
      const result = await generateInvoiceForStudent(s.id, month);
      if (result.skipped) skipped += 1; else generated += 1;
    }
    setBulkResult({ generated, skipped, alreadyDone: alreadyInvoiced.size });
    setBulkGenerating(false);
    refresh();
  };

  const generateMonthlyInvoice = async () => {
    if (!monthlyStudent) return;
    const { data: inv, error } = await supabase.from("invoices").insert({ student_id: monthlyForm.studentId, date: todayIso(), month: monthlyForm.month, total: monthlyTotal, due_date: monthlyDueDate(monthlyForm.month) }).select().single();
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
    const { data: inv, error } = await supabase.from("invoices").insert({ student_id: manualForm.studentId, date: manualForm.date, total: manualTotal, due_date: monthlyDueDate(manualForm.date) }).select().single();
    if (error || !inv) return;
    const rows = manualForm.items.filter((it) => it.description && it.amount).map((it, i) => ({ invoice_id: inv.id, description: it.description, amount: Number(it.amount), sort_order: i }));
    if (rows.length) await supabase.from("invoice_items").insert(rows);
    setManualForm({ studentId: data.students[0]?.id || "", date: todayIso(), items: [{ description: "", amount: "" }] });
    refresh();
  };

  // --- Invoice list ---
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
    if (!confirm(`Remove ${invoiceNoLabel(inv.invoice_no)}? This can't be undone — the billing period goes back to "not yet invoiced," so you'd need to generate it again (manually, or next time you run "Generate this month for everyone") if you want it billed.`)) return;
    const linked = data.studentPayments.find((p) => p.invoice_id === inv.id);
    if (linked) await supabase.from("student_payments").delete().eq("id", linked.id);
    await supabase.from("invoices").delete().eq("id", inv.id);
    refresh();
  };

  const toggleInvoiceSelected = (id) => setSelectedInvoiceIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const toggleStudentGroupSelected = (invoiceIds) => setSelectedInvoiceIds((prev) => {
    const allSelected = invoiceIds.every((id) => prev.has(id));
    const next = new Set(prev);
    invoiceIds.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
    return next;
  });
  const bulkMarkPaid = async () => {
    const ids = [...selectedInvoiceIds];
    const targets = data.invoices.filter((inv) => ids.includes(inv.id) && inv.status !== "paid");
    if (targets.length === 0) { alert("Nothing selected is unpaid."); return; }
    if (!confirm(`Mark ${targets.length} invoice${targets.length === 1 ? "" : "s"} as paid?`)) return;
    const paidDate = todayIso();
    await supabase.from("student_payments").insert(targets.map((inv) => ({ student_id: inv.student_id, date: paidDate, amount: inv.total, notes: invoiceNoLabel(inv.invoice_no), invoice_id: inv.id })));
    await supabase.from("invoices").update({ status: "paid", paid_date: paidDate }).in("id", targets.map((inv) => inv.id));
    setSelectedInvoiceIds(new Set());
    refresh();
  };
  const bulkRemove = async () => {
    const ids = [...selectedInvoiceIds];
    if (ids.length === 0) return;
    if (!confirm(`Remove ${ids.length} invoice${ids.length === 1 ? "" : "s"}? This can't be undone — those billing periods go back to "not yet invoiced" and would need generating again.`)) return;
    await supabase.from("student_payments").delete().in("invoice_id", ids);
    await supabase.from("invoices").delete().in("id", ids);
    setSelectedInvoiceIds(new Set());
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
        <Card style={{ background: enrichedInvoices.some((i) => i.isOverdue) ? COLORS.dangerBg : "#F8F6F1", border: "none" }}>
          <div style={{ fontSize: 12, color: enrichedInvoices.some((i) => i.isOverdue) ? COLORS.dangerDark : COLORS.inkSoft, fontWeight: 600 }}>Overdue</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: enrichedInvoices.some((i) => i.isOverdue) ? COLORS.dangerDark : COLORS.ink }}>{enrichedInvoices.filter((i) => i.isOverdue).length}</div>
        </Card>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Generate for everyone</div>
            <div style={{ fontSize: 12, color: COLORS.inkSoft }}>One click for every active student with a per-month instrument who doesn't already have an invoice for the chosen month. Due dates set automatically to the 7th.</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="month" value={bulkGenerateMonth} onChange={(e) => setBulkGenerateMonth(e.target.value)} style={{ ...inputStyle, width: "auto" }} />
            <Btn variant="owner" disabled={bulkGenerating} onClick={generateThisMonthForEveryone}>{bulkGenerating ? "Generating…" : `Generate ${formatMonthLabel(bulkGenerateMonth)}`}</Btn>
          </div>
        </div>
        {bulkResult && (
          <div style={{ marginTop: 10, fontSize: 13, padding: "8px 10px", background: COLORS.successBg, borderRadius: 8 }}>
            {bulkResult.generated} invoice{bulkResult.generated === 1 ? "" : "s"} generated
            {bulkResult.skipped > 0 ? `, ${bulkResult.skipped} skipped (nothing to bill)` : ""}
            {bulkResult.alreadyDone > 0 ? `. ${bulkResult.alreadyDone} already had one for that month.` : "."}
            <a href="#" onClick={(e) => { e.preventDefault(); setBulkResult(null); }} style={{ marginLeft: 8, color: COLORS.inkSoft }}>Dismiss</a>
          </div>
        )}
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
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Invoices ({data.invoices.length})</div>
        <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 12 }}>One list — search, filter, sort, and group however's useful right now.</div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <input placeholder="Search by student or invoice #" value={invoiceSearch} onChange={(e) => setInvoiceSearch(e.target.value)} style={{ ...inputStyle, flex: "2 1 200px" }} />
          <select value={invoiceStatusFilter} onChange={(e) => setInvoiceStatusFilter(e.target.value)} style={{ ...inputStyle, flex: "1 1 130px" }}>
            <option value="all">All statuses</option>
            <option value="unpaid">Unpaid</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue only</option>
          </select>
          <select value={invoiceCourseFilter} onChange={(e) => setInvoiceCourseFilter(e.target.value)} style={{ ...inputStyle, flex: "1 1 130px" }}>
            <option value="">All instruments</option>
            {courseOptions.map((c) => (<option key={c} value={c}>{c}</option>))}
          </select>
          <select value={invoiceMonthFilter} onChange={(e) => setInvoiceMonthFilter(e.target.value)} style={{ ...inputStyle, flex: "1 1 130px" }}>
            <option value="all">All months</option>
            {monthOptions.map((ym) => (<option key={ym} value={ym}>{formatMonthLabel(ym)}</option>))}
          </select>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          <select value={invoiceSortBy} onChange={(e) => setInvoiceSortBy(e.target.value)} style={{ ...inputStyle, flex: "1 1 170px" }}>
            <option value="name">Sort: Name (A–Z)</option>
            <option value="newest">Sort: Newest first</option>
            <option value="oldest">Sort: Oldest first</option>
            <option value="amount">Sort: Highest amount first</option>
            <option value="overdue">Sort: Most overdue first</option>
          </select>
          <select value={invoiceGroupBy} onChange={(e) => setInvoiceGroupBy(e.target.value)} style={{ ...inputStyle, flex: "1 1 170px" }}>
            <option value="student">Group by student</option>
            <option value="invoice">One row per invoice</option>
          </select>
        </div>

        {(() => {
          const allIds = invoiceGroupBy === "student" ? groupedByStudent.flatMap((g) => g.invoices.map((i) => i.id)) : filteredInvoices.map((i) => i.id);
          const allSelected = allIds.length > 0 && allIds.every((id) => selectedInvoiceIds.has(id));
          const toggleSelectAll = () => setSelectedInvoiceIds(allSelected ? new Set() : new Set(allIds));
          return (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
              <label style={{ fontSize: 13, color: COLORS.inkSoft, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
                {selectedInvoiceIds.size > 0 ? `${selectedInvoiceIds.size} selected` : "Select all"}
              </label>
              {selectedInvoiceIds.size > 0 && (
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn small variant="owner" onClick={bulkMarkPaid}>Mark paid</Btn>
                  <Btn small variant="danger" onClick={bulkRemove}>Remove</Btn>
                  <Btn small onClick={() => setSelectedInvoiceIds(new Set())}>Clear</Btn>
                </div>
              )}
            </div>
          );
        })()}

        {invoiceGroupBy === "student" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(invoiceShowAll ? groupedByStudent : groupedByStudent.slice(0, 20)).map((g) => {
              const ids = g.invoices.map((i) => i.id);
              const checked = ids.every((id) => selectedInvoiceIds.has(id));
              return (
                <Card key={g.studentId} style={{ padding: "10px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    <div style={{ fontSize: 13, display: "flex", gap: 10 }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleStudentGroupSelected(ids)} style={{ marginTop: 3 }} />
                      <div>
                        <strong>{studentName(g.studentId)}</strong>
                        <div style={{ color: COLORS.inkSoft, fontSize: 12 }}>{g.invoices.length} invoice{g.invoices.length > 1 ? "s" : ""} · Unpaid {fmtMoney(g.owed)} · Paid {fmtMoney(g.paid)}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {g.owed > 0 ? <Badge tone="danger">Not settled — {fmtMoney(g.owed)}</Badge> : <Badge tone="success">Settled</Badge>}
                      {g.maxOverdueDays > 0 && <Badge tone="amber">{g.maxOverdueDays}d overdue</Badge>}
                      <Btn small onClick={() => setViewStudentInvoices(g.studentId)}>View invoices</Btn>
                    </div>
                  </div>
                </Card>
              );
            })}
            {groupedByStudent.length === 0 && <div style={{ fontSize: 13, color: COLORS.inkSoft }}>No invoices match.</div>}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(invoiceShowAll ? filteredInvoices : filteredInvoices.slice(0, 20)).map((inv) => {
              const items = itemsFor(inv.id);
              return (
                <div key={inv.id} style={{ padding: "10px 12px", background: COLORS.card, border: "1px solid " + COLORS.border, borderRadius: 8, fontSize: 13, display: "flex", gap: 10 }}>
                  <input type="checkbox" checked={selectedInvoiceIds.has(inv.id)} onChange={() => toggleInvoiceSelected(inv.id)} style={{ marginTop: 3, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                      <div>
                        <strong>{invoiceNoLabel(inv.invoice_no)} — {studentName(inv.student_id)}</strong>
                        <div style={{ color: COLORS.inkSoft, fontSize: 12 }}>{items.map((it) => `${it.description} (${fmtMoney(it.amount)})`).join(" + ")}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <strong>{fmtMoney(inv.total)}</strong>
                        {inv.status === "paid" ? <Badge tone="success">Paid {inv.paid_date}</Badge> : inv.isOverdue ? <Badge tone="danger">{inv.daysLate}d overdue</Badge> : <Badge tone="amber">Unpaid</Badge>}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 10, marginTop: 6, fontSize: 12, flexWrap: "wrap" }}>
                      {inv.status === "unpaid" ? (
                        <a href="#" onClick={(e) => { e.preventDefault(); markInvoicePaid(inv); }} style={{ color: COLORS.owner }}>Mark paid</a>
                      ) : (
                        <a href="#" onClick={(e) => { e.preventDefault(); undoInvoicePaid(inv); }} style={{ color: COLORS.inkSoft }}>Undo</a>
                      )}
                      <a href="#" onClick={(e) => { e.preventDefault(); downloadInvoicePdf(inv); }} style={{ color: COLORS.owner }}>Download {inv.status === "paid" ? "Receipt" : "invoice"}</a>
                      <a href="#" onClick={(e) => { e.preventDefault(); setViewInvoice(inv); }} style={{ color: COLORS.owner }}>View {inv.status === "paid" ? "Receipt" : "invoice"}</a>
                      <a href="#" onClick={(e) => { e.preventDefault(); removeInvoice(inv); }} style={{ color: COLORS.danger }}>Remove</a>
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredInvoices.length === 0 && <div style={{ fontSize: 13, color: COLORS.inkSoft }}>No invoices match.</div>}
          </div>
        )}

        {(() => {
          const total = invoiceGroupBy === "student" ? groupedByStudent.length : filteredInvoices.length;
          if (total <= 20) return null;
          return (
            <Btn small style={{ marginTop: 12 }} onClick={() => setInvoiceShowAll((v) => !v)}>
              {invoiceShowAll ? "Show fewer" : `Show all ${total}`}
            </Btn>
          );
        })()}
      </Card>

      {viewStudentInvoices && (() => {
        const student = data.students.find((s) => s.id === viewStudentInvoices);
        const studentInvoices = data.invoices.filter((inv) => inv.student_id === viewStudentInvoices).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        return (
          <Modal title={`Invoices — ${student?.name || "—"}`} onClose={() => setViewStudentInvoices(null)}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {studentInvoices.map((inv) => (
                <div key={inv.id} style={{ padding: "9px 12px", border: "1px solid " + COLORS.border, borderRadius: 8, fontSize: 13 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    <span>{invoiceNoLabel(inv.invoice_no)} · {fmtDate(inv.date)}</span>
                    <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <span style={{ fontWeight: 700 }}>{fmtMoney(inv.total)}</span>
                      <Badge tone={inv.status === "paid" ? "success" : "danger"}>{inv.status === "paid" ? "Paid" : "Unpaid"}</Badge>
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 5, fontSize: 12 }}>
                    {inv.status === "unpaid" ? (
                      <a href="#" onClick={(e) => { e.preventDefault(); markInvoicePaid(inv); }} style={{ color: COLORS.owner }}>Mark paid</a>
                    ) : (
                      <a href="#" onClick={(e) => { e.preventDefault(); undoInvoicePaid(inv); }} style={{ color: COLORS.inkSoft }}>Undo</a>
                    )}
                    <a href="#" onClick={(e) => { e.preventDefault(); downloadInvoicePdf(inv); }} style={{ color: COLORS.owner }}>Download {inv.status === "paid" ? "Receipt" : "invoice"}</a>
                    <a href="#" onClick={(e) => { e.preventDefault(); setViewInvoice(inv); setViewStudentInvoices(null); }} style={{ color: COLORS.owner }}>View {inv.status === "paid" ? "Receipt" : "invoice"}</a>
                  </div>
                </div>
              ))}
              {studentInvoices.length === 0 && <div style={{ fontSize: 13, color: COLORS.inkSoft }}>No invoices yet.</div>}
            </div>
          </Modal>
        );
      })()}

      {viewInvoice && (() => {
        const dueDate = viewInvoice.due_date || monthlyDueDate(viewInvoice.month || viewInvoice.date);
        const meta = [
          { label: "Invoice #", value: invoiceNoLabel(viewInvoice.invoice_no) },
          { label: "Date", value: fmtDate(viewInvoice.date) },
          { label: "Due", value: fmtDate(dueDate) },
          { label: "Status", value: viewInvoice.status === "paid" ? `Paid ${fmtDate(viewInvoice.paid_date)}` : "Unpaid" },
          { label: "Bill to", value: studentName(viewInvoice.student_id) },
        ];
        const rows = itemsFor(viewInvoice.id).map((it) => ({ label: it.description, value: fmtMoney(it.amount) }));
        return (
          <Modal title={`${invoiceNoLabel(viewInvoice.invoice_no)} ${viewInvoice.status === "paid" ? "(Receipt)" : ""}`} onClose={() => setViewInvoice(null)}>
            <div style={{ border: "1px solid " + COLORS.border, borderRadius: 10, padding: 18, background: "#FCFBF8" }}>
            <DocHeader settings={data.settings} docType={viewInvoice.status === "paid" ? "RECEIPT" : "INVOICE"} meta={meta} />
            <DocTable rows={rows} totalLabel="Total" totalValue={fmtMoney(viewInvoice.total)} />
            <DocFooter settings={data.settings} />
            </div>
            <Btn variant="owner" style={{ width: "100%", marginTop: 16 }} onClick={() => downloadInvoicePdf(viewInvoice)}>Download {viewInvoice.status === "paid" ? "Receipt" : "PDF"}</Btn>
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
  const [tab, setTab] = useState("dashboard");
  const [pendingStudentNav, setPendingStudentNav] = useState(null); // { studentId?, search? }
  const autoToppedUp = useRef(false);
  const [autoTopUpError, setAutoTopUpError] = useState(null);

  const refresh = useCallback(async () => { setData(await loadAll()); }, []);
  useEffect(() => { if (ok) refresh(); }, [ok, refresh]);

  // Keeps every active, scheduled instrument's calendar a few months ahead
  // automatically — this is what replaced the old manual "extend selected"
  // step. Throttle lives in the database (studio_settings.last_autotopup_date),
  // not localStorage — with two separate live deployments pointed at the same
  // database, a per-browser localStorage flag doesn't stop them from each
  // independently thinking they haven't run yet today. A database-backed flag
  // is the same source of truth no matter which URL loads the app. The claim
  // is written *before* doing the actual work, to shrink the window where two
  // near-simultaneous loads could both slip through, and released again if
  // the run fails, so a genuine failure is retryable today rather than
  // silently blocked until tomorrow.
  useEffect(() => {
    if (!data || autoToppedUp.current) return;
    autoToppedUp.current = true;
    (async () => {
      try {
        const { data: settingsRow } = await supabase.from("studio_settings").select("last_autotopup_date").eq("id", 1).maybeSingle();
        if (settingsRow?.last_autotopup_date === todayIso()) { setAutoTopUpError(null); return; }
        await supabase.from("studio_settings").upsert({ id: 1, last_autotopup_date: todayIso() });

        const { runningLow } = getHealthIssues(data);
        if (runningLow.length === 0) { setAutoTopUpError(null); return; }
        const holidaySet = new Set(data.holidays.map((h) => h.date));
        const existingKeys = new Set(data.lessons.filter((l) => l.status !== "cancelled").map((l) => `${l.student_id}::${l.instrument || ""}::${l.date}`));
        const targetDate = addDays(todayIso(), 120);
        const allRows = [];
        for (const inst of runningLow) {
          let iso = inst.lastDate ? addDays(inst.lastDate, 7) : todayIso();
          let guard = 0;
          while (iso <= targetDate && guard < 30) {
            const key = `${inst.studentId}::${inst.course || ""}::${iso}`;
            if (!holidaySet.has(iso) && !existingKeys.has(key)) {
              allRows.push({
                date: iso, time: inst.time, teacher_id: inst.teacherId || null, student_id: inst.studentId,
                price: inst.billingType === "per_month" ? 0 : Number(inst.price || 0), duration_min: inst.duration || 30,
                status: "scheduled", instrument: inst.course || null, room: inst.room || null,
              });
              existingKeys.add(key);
            }
            iso = addDays(iso, 7);
            guard += 1;
          }
        }
        // One fast batched insert instead of one call per instrument — with
        // 265+ instruments, sequential one-at-a-time inserts could take many
        // minutes, which is long enough that a page reload partway through
        // would restart the whole thing and risk overlapping with itself.
        let extended = 0;
        const errors = [];
        const CHUNK = 500;
        for (let i = 0; i < allRows.length; i += CHUNK) {
          const chunk = allRows.slice(i, i + CHUNK);
          const { error } = await supabase.from("lessons").insert(chunk);
          if (error) { console.error("Auto top-up batch insert failed", error); errors.push(error.message || String(error)); }
          else extended += chunk.length;
        }
        if (errors.length > 0) {
          setAutoTopUpError(`${errors.length} batch(es) failed: ${errors[0]}`);
          // Release the claim so a real failure is retryable today, not
          // silently skipped until tomorrow.
          await supabase.from("studio_settings").update({ last_autotopup_date: null }).eq("id", 1);
        } else {
          setAutoTopUpError(null);
        }
        if (extended > 0) refresh();
      } catch (err) {
        console.error("Auto top-up crashed", err);
        setAutoTopUpError(err?.message || String(err));
        try { await supabase.from("studio_settings").update({ last_autotopup_date: null }).eq("id", 1); } catch { /* best effort */ }
      }
    })();
  }, [data, refresh]);

  const signOut = async () => { await supabase.auth.signOut(); router.replace("/login"); };

  if (!ok || !data) return <div style={{ padding: 24, fontSize: 14, color: COLORS.inkSoft }}>Loading…</div>;

  const tabs = [
    { key: "dashboard", label: "Dashboard" },
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
      {tab === "dashboard" && <DashboardTab data={data} setTab={setTab} refresh={refresh} />}
      {tab === "calendar" && <CalendarTab data={data} refresh={refresh} />}
      {tab === "teachers" && <TeachersTab data={data} refresh={refresh} />}
      {tab === "students" && <StudentsTab data={data} refresh={refresh} setTab={setTab} pendingNav={pendingStudentNav} clearPendingNav={() => setPendingStudentNav(null)} />}
      {tab === "courses" && <CoursesCard data={data} refresh={refresh} />}
      {tab === "materials" && <MaterialsTab data={data} refresh={refresh} />}
      {tab === "fees" && <FeesTab data={data} refresh={refresh} />}
      {tab === "payments" && <PaymentsTab data={data} refresh={refresh} />}
      {tab === "replacements" && <ReplacementsTab data={data} refresh={refresh} />}
      {tab === "reports" && <ReportsTab data={data} refresh={refresh} />}
      {tab === "health" && <HealthTab data={data} setTab={setTab} goToStudent={(studentId) => { setPendingStudentNav({ studentId }); setTab("students"); }} goToStudentSearch={(search) => { setPendingStudentNav({ search }); setTab("students"); }} refresh={refresh} autoTopUpError={autoTopUpError} />}
      {tab === "settings" && <SettingsTab data={data} refresh={refresh} />}
    </div>
  );
}
