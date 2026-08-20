import { useState } from "react";

export const COLORS = {
  bg: "#FAF7F2",
  card: "#FFFFFF",
  border: "#E4DFD3",
  borderStrong: "#D2CBB9",
  ink: "#23262B",
  inkSoft: "#6B6862",
  owner: "#0F6E56",
  ownerBg: "#E1F5EE",
  ownerDark: "#04342C",
  teacher: "#993C1D",
  teacherBg: "#FAECE7",
  teacherDark: "#4A1B0C",
  danger: "#A32D2D",
  dangerBg: "#FCEBEB",
  dangerDark: "#501313",
  success: "#3B6D11",
  successBg: "#EAF3DE",
  successDark: "#173404",
  amber: "#854F0B",
  amberBg: "#FAEEDA",
  amberDark: "#412402",
};

export const uid = () =>
  (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2, 10);

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
export function addDays(iso, n) { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return isoDate(d); }
export function fmtDate(iso) { const d = new Date(iso + "T00:00:00"); return `${WEEKDAY_SHORT[d.getDay()]}, ${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`; }
export function fmtMoney(n) { return "RM " + Number(n || 0).toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
export function todayIso() { return isoDate(new Date()); }

export function earningsForLesson(lesson, teacher) {
  if (!teacher) return 0;
  if (teacher.pay_type === "flat") return teacher.rate;
  return Math.round(((lesson.price * teacher.rate) / 100) * 100) / 100;
}

// Figures out which billing config applies to a lesson: the student's primary
// instrument if the lesson matches it (or has no instrument tag), otherwise
// whichever student_instruments row matches the lesson's instrument name.
export function instrumentConfigFor(lesson, student, studentInstruments) {
  if (!student) return null;
  if (!lesson.instrument || lesson.instrument === student.course) {
    return { course: student.course || null, billing_type: student.billing_type, monthly_rate: student.monthly_rate };
  }
  const si = (studentInstruments || []).find((x) => x.student_id === student.id && x.course === lesson.instrument);
  if (si) return { course: si.course, billing_type: si.billing_type || "per_lesson", monthly_rate: si.monthly_rate };
  return { course: lesson.instrument, billing_type: "per_lesson", monthly_rate: null };
}

export function effectiveLessonPrice(lesson, student, allLessons, studentInstruments) {
  const cfg = instrumentConfigFor(lesson, student, studentInstruments);
  if (!cfg || cfg.billing_type !== "per_month") return Number(lesson.price) || 0;
  const monthKey = lesson.date.slice(0, 7);
  const groupKey = lesson.instrument || student.course || null;
  const siblingCount = (allLessons || []).filter((l) =>
    l.student_id === student.id && l.date.slice(0, 7) === monthKey &&
    (l.instrument || student.course || null) === groupKey &&
    (l.status === "attended" || l.status === "scheduled")
  ).length || 1;
  return Math.round(((Number(cfg.monthly_rate) || 0) / siblingCount) * 100) / 100;
}

export function studentOwed(studentId, lessons, students, studentInstruments) {
  const student = students.find((s) => s.id === studentId);
  const myLessons = (lessons || []).filter((l) => l.student_id === studentId && l.status === "attended");
  return myLessons.reduce((sum, l) => sum + effectiveLessonPrice(l, student, lessons, studentInstruments), 0);
}

// Aggregates book order line items into one row per distinct book (matched
// by catalog item, or by lowercased name for one-off custom items), with
// quantities broken out by fulfillment stage — the shape both the admin
// shopping-list summary and the teacher's own-orders summary need.
export function summarizeBookOrderItems(orderItems, bookItems) {
  const map = new Map();
  (orderItems || []).forEach((item) => {
    const key = item.book_item_id || `custom:${(item.custom_name || "").trim().toLowerCase()}`;
    const bi = item.book_item_id ? (bookItems || []).find((b) => b.id === item.book_item_id) : null;
    const name = bi ? bi.name : (item.custom_name || "Unnamed item");
    if (!map.has(key)) map.set(key, { key, name, inCatalog: Boolean(bi), requested: 0, ordered: 0, received: 0, given: 0, total: 0 });
    const row = map.get(key);
    row[item.status] = (row[item.status] || 0) + item.quantity;
    row.total += item.quantity;
  });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function studentInvoiceSummary(studentId, invoices) {
  const mine = (invoices || []).filter((inv) => inv.student_id === studentId);
  const unpaid = mine.filter((inv) => inv.status !== "paid");
  const paidInvoices = mine.filter((inv) => inv.status === "paid");
  const owed = unpaid.reduce((sum, inv) => sum + Number(inv.total), 0);
  const paid = paidInvoices.reduce((sum, inv) => sum + Number(inv.total), 0);
  return { owed, paid, invoiceCount: mine.length, unpaidCount: unpaid.length, settled: unpaid.length === 0 };
}

export function studentBalance(studentId, lessons, students, payments) {
  const owed = studentOwed(studentId, lessons, students);
  const paid = (payments || []).filter((p) => p.student_id === studentId).reduce((sum, p) => sum + Number(p.amount), 0);
  return { owed, paid, balance: Math.round((owed - paid) * 100) / 100 };
}

export function resolveEarnings(lesson, student, teacher, teacherRates, allLessons, studentInstruments) {
  if (!teacher) return 0;
  const rates = teacherRates || [];
  const instrument = lesson?.instrument;
  const level = student?.level;
  const byLevel = instrument && level ? rates.find((r) => r.teacher_id === teacher.id && r.instrument === instrument && r.level === level) : null;
  const byInstrument = !byLevel && instrument ? rates.find((r) => r.teacher_id === teacher.id && r.instrument === instrument && !r.level) : null;
  const byCourse = !byLevel && !byInstrument && student?.course ? rates.find((r) => r.teacher_id === teacher.id && r.course === student.course && !r.instrument && !r.level) : null;
  const override = byLevel || byInstrument || byCourse;
  const payType = override ? override.pay_type : teacher.pay_type;
  const rate = override ? override.rate : teacher.rate;
  if (payType === "flat") return rate;
  const price = allLessons ? effectiveLessonPrice(lesson, student, allLessons, studentInstruments) : (Number(lesson.price) || 0);
  return Math.round(((price * rate) / 100) * 100) / 100;
}

export function addMinutes(time, mins) {
  const [h, m] = time.slice(0, 5).split(":").map(Number);
  const total = h * 60 + m + mins;
  const hh = Math.floor((total % (24 * 60)) / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function isoMonthDays(year, month) {
  const first = new Date(year, month, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push(iso);
  }
  return cells;
}

export function statusTone(status) {
  if (status === "attended") return "success";
  if (status === "absent") return "amber";
  if (status === "needs-cover") return "amber";
  if (status === "missed-teacher") return "danger";
  if (status === "missed-student") return "amber";
  if (status === "rescheduled") return "gray";
  if (status === "cancelled") return "gray";
  return "owner";
}
export function statusLabel(status) {
  return {
    scheduled: "Scheduled",
    attended: "Attended",
    absent: "Absent — awaiting decision",
    "needs-cover": "Needs cover",
    "missed-teacher": "Missed — replaceable",
    "missed-student": "Missed — not replaceable",
    rescheduled: "Rescheduled",
    cancelled: "Cancelled",
  }[status] || status;
}

// Renders a DOM node (the .print-area of a receipt/invoice/report) straight to a
// downloaded PDF file — no browser print dialog involved.
export async function downloadDoc(node, filename) {
  if (!node) return;
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);
  if (typeof document !== "undefined" && document.fonts && document.fonts.ready) {
    try { await document.fonts.ready; } catch (e) { /* ignore */ }
  }
  const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false });
  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 24;
  const imgWidth = pageWidth - margin * 2;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = margin;
  pdf.addImage(imgData, "PNG", margin, position, imgWidth, imgHeight);
  heightLeft -= pageHeight - margin * 2;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight + margin;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", margin, position, imgWidth, imgHeight);
    heightLeft -= pageHeight - margin * 2;
  }

  pdf.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}

// Draws a crisp, real-text invoice/receipt/voucher PDF directly with jsPDF's
// vector text API — no screenshot involved, so it stays sharp and small.
export async function generateDocPdf({ settings = {}, docType, meta = [], rows = [], totalLabel, totalValue, filename }) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const left = 48;
  const right = 547;
  const pageBottom = 760;
  let y = 56;

  const newPageIfNeeded = (need = 20) => {
    if (y + need > pageBottom) { doc.addPage(); y = 56; }
  };

  if (settings.logo_data) {
    try { doc.addImage(settings.logo_data, undefined, left, y - 20, 44, 44); } catch (e) { /* unsupported format, skip */ }
  }
  const textLeft = settings.logo_data ? left + 56 : left;

  doc.setFont("times", "bold");
  doc.setFontSize(18);
  doc.setTextColor(0);
  doc.text(settings.company_name || "Your Business Name", textLeft, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100);
  let headerY = y + 15;
  if (settings.address) {
    const wrapped = doc.splitTextToSize(settings.address, 320);
    wrapped.forEach((line) => { doc.text(line, textLeft, headerY); headerY += 12; });
  }
  const contactLine = [settings.phone, settings.email].filter(Boolean).join("  ·  ");
  if (contactLine) { doc.text(contactLine, textLeft, headerY); headerY += 12; }
  if (settings.license_no) { doc.text(`License: ${settings.license_no}`, textLeft, headerY); headerY += 12; }
  doc.setTextColor(0);

  y = Math.max(y + 40, headerY + 14);
  doc.setDrawColor(30);
  doc.setLineWidth(1.2);
  doc.line(left, y, right, y);
  y += 26;

  doc.setFont("times", "bold");
  doc.setFontSize(15);
  doc.setTextColor(15, 110, 86);
  doc.text(docType, left, y);
  doc.setTextColor(0);
  y += 20;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  meta.forEach((m) => {
    doc.setTextColor(110);
    doc.text(`${m.label}: `, left, y);
    const w = doc.getTextWidth(`${m.label}: `);
    doc.setTextColor(0);
    doc.text(String(m.value), left + w, y);
    y += 15;
  });

  y += 14;
  doc.setDrawColor(30);
  doc.setLineWidth(1);
  doc.line(left, y, right, y);
  y += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text("DESCRIPTION", left, y + 12);
  doc.text("AMOUNT (RM)", right, y + 12, { align: "right" });
  doc.setTextColor(0);
  y += 16;
  doc.setDrawColor(30);
  doc.line(left, y, right, y);
  y += 18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  if (rows.length === 0) {
    doc.setTextColor(130);
    doc.text("Nothing to show yet.", left, y);
    doc.setTextColor(0);
    y += 20;
  } else {
    rows.forEach((r, i) => {
      newPageIfNeeded(24);
      const wrapped = doc.splitTextToSize(String(r.label), 380);
      wrapped.forEach((line, li) => {
        doc.text(line, left, y);
        if (li === 0) doc.text(String(r.value), right, y, { align: "right" });
        y += 15;
      });
      if (i < rows.length - 1) {
        doc.setDrawColor(230);
        doc.setLineWidth(0.5);
        doc.line(left, y - 6, right, y - 6);
      }
    });
  }

  newPageIfNeeded(50);
  y += 6;
  doc.setDrawColor(30);
  doc.setLineWidth(1);
  doc.line(left, y, right, y);
  y += 22;
  if (totalLabel) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(totalLabel, left, y);
    doc.text(String(totalValue), right, y, { align: "right" });
    y += 30;
  }

  const hasBank = settings.bank_name || settings.account_number;
  if (hasBank || settings.invoice_terms) {
    newPageIfNeeded(70);
    doc.setDrawColor(225);
    doc.setLineWidth(0.75);
    doc.line(left, y, right, y);
    y += 20;
    if (hasBank) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(0);
      doc.text("Payment details", left, y);
      y += 14;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(100);
      if (settings.bank_name) { doc.text(`Bank: ${settings.bank_name}`, left, y); y += 13; }
      doc.text(`Account name: ${settings.account_holder || settings.company_name || ""}`, left, y); y += 13;
      if (settings.account_number) { doc.text(`Account number: ${settings.account_number}`, left, y); y += 13; }
      doc.setTextColor(0);
    }
    if (settings.invoice_terms) {
      y += 6;
      doc.setFontSize(9.5);
      doc.setTextColor(100);
      const wrapped = doc.splitTextToSize(settings.invoice_terms, right - left);
      wrapped.forEach((line) => { doc.text(line, left, y); y += 12; });
      doc.setTextColor(0);
    }
  }

  doc.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}

export function timeRangeOverlap(aStart, aMin, bStart, bMin) {
  const toMin = (t) => { const [h, m] = t.slice(0, 5).split(":").map(Number); return h * 60 + m; };
  const aS = toMin(aStart), aE = aS + aMin, bS = toMin(bStart), bE = bS + bMin;
  return aS < bE && bS < aE;
}

export function findClashes(lessons, { date, time, duration, teacherId, studentId, excludeId }) {
  return lessons.filter((l) => {
    if (l.id === excludeId) return false;
    if (l.date !== date) return false;
    if (l.status === "rescheduled" || l.status === "cancelled") return false;
    if (!timeRangeOverlap(time, Number(duration) || 30, l.time, l.duration_min || 30)) return false;
    return (teacherId && l.teacher_id === teacherId) || (studentId && l.student_id === studentId);
  });
}

// Checks a proposed weekly instrument schedule (day-of-week + time, not a
// specific date) against every other student's weekly instrument schedule —
// both the "primary" instrument stored on the student row and any extra
// ones in student_instruments — for the same teacher or the same student.
export function findWeeklyInstrumentClashes({ students, studentInstruments, day, time, duration, studentId, teacherId, excludeKey }) {
  if (day === "" || day == null || !time) return [];
  const commitments = [];
  (students || []).forEach((s) => {
    if (s.course && s.permanent_day != null && s.permanent_time) {
      commitments.push({ key: `student:${s.id}`, studentId: s.id, teacherId: s.teacher_id || null, day: s.permanent_day, time: s.permanent_time, duration: s.duration_min || 30, studentName: s.name, course: s.course });
    }
  });
  (studentInstruments || []).forEach((si) => {
    if (si.course && si.permanent_day != null && si.permanent_time) {
      const student = (students || []).find((s) => s.id === si.student_id);
      commitments.push({ key: `instrument:${si.id}`, studentId: si.student_id, teacherId: si.teacher_id || null, day: si.permanent_day, time: si.permanent_time, duration: si.duration_min || 30, studentName: student?.name || "—", course: si.course });
    }
  });
  return commitments
    .filter((c) => c.key !== excludeKey)
    .filter((c) => Number(c.day) === Number(day))
    .filter((c) => timeRangeOverlap(time, Number(duration) || 30, c.time, c.duration))
    .filter((c) => (teacherId && c.teacherId === teacherId) || (studentId && c.studentId === studentId))
    .map((c) => ({ ...c, sameTeacher: Boolean(teacherId) && c.teacherId === teacherId, sameStudent: Boolean(studentId) && c.studentId === studentId }));
}

export function Badge({ children, tone = "gray" }) {
  const map = {
    gray: { bg: "#F1EFE8", fg: "#5F5E5A" },
    owner: { bg: COLORS.ownerBg, fg: COLORS.ownerDark },
    teacher: { bg: COLORS.teacherBg, fg: COLORS.teacherDark },
    danger: { bg: COLORS.dangerBg, fg: COLORS.dangerDark },
    success: { bg: COLORS.successBg, fg: COLORS.successDark },
    amber: { bg: COLORS.amberBg, fg: COLORS.amberDark },
  };
  const c = map[tone] || map.gray;
  return (
    <span style={{ display: "inline-block", fontSize: 12, fontWeight: 600, padding: "3px 9px", borderRadius: 999, background: c.bg, color: c.fg, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

export function Btn({ children, onClick, variant = "default", small, style, type = "button", disabled }) {
  const base = {
    fontFamily: "inherit", fontSize: small ? 13 : 14, fontWeight: 600,
    padding: small ? "6px 12px" : "9px 16px", borderRadius: 8, cursor: disabled ? "default" : "pointer",
    border: "1px solid " + COLORS.borderStrong, background: COLORS.card, color: COLORS.ink,
    opacity: disabled ? 0.55 : 1,
  };
  const variants = {
    owner: { background: COLORS.owner, color: "#fff", border: "1px solid " + COLORS.owner },
    teacher: { background: COLORS.teacher, color: "#fff", border: "1px solid " + COLORS.teacher },
    ghost: { background: "transparent", border: "1px solid transparent" },
    danger: { background: "transparent", color: COLORS.danger, border: "1px solid " + COLORS.dangerBg },
  };
  return (
    <button type={type} disabled={disabled} onClick={onClick} style={{ ...base, ...(variants[variant] || {}), ...style }}>
      {children}
    </button>
  );
}

export function Card({ children, style }) {
  return <div style={{ background: COLORS.card, border: "1px solid " + COLORS.border, borderRadius: 12, padding: "16px 18px", ...style }}>{children}</div>;
}

export function Field({ label, children }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.inkSoft, marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  );
}

export const inputStyle = {
  width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: 14, fontFamily: "inherit",
  border: "1px solid " + COLORS.borderStrong, borderRadius: 8, background: "#fff", color: COLORS.ink,
};

export function SearchableSelect({ options, value, onChange, placeholder }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  const filtered = query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  return (
    <div style={{ position: "relative" }}>
      <input
        style={inputStyle}
        placeholder={placeholder || "Type to search…"}
        value={open ? query : (selected?.label || "")}
        onFocus={() => { setOpen(true); setQuery(""); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (
        <div style={{ position: "absolute", zIndex: 20, marginTop: 4, width: "100%", maxHeight: 200, overflowY: "auto", background: "#fff", border: "1px solid " + COLORS.borderStrong, borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.12)" }}>
          {filtered.length === 0 ? (
            <div style={{ padding: "8px 12px", fontSize: 13, color: COLORS.inkSoft }}>No matches</div>
          ) : (
            <>
              {!value ? null : (
                <div
                  onMouseDown={() => { onChange(""); setOpen(false); }}
                  style={{ padding: "6px 12px", fontSize: 13, color: COLORS.inkSoft, cursor: "pointer", borderBottom: "1px solid " + COLORS.border }}
                >
                  Clear selection
                </div>
              )}
              {filtered.map((o) => (
                <div
                  key={o.value}
                  onMouseDown={() => { onChange(o.value); setOpen(false); }}
                  style={{ padding: "7px 12px", fontSize: 13.5, cursor: "pointer", background: o.value === value ? COLORS.ownerBg : "transparent" }}
                  onMouseEnter={(e) => { if (o.value !== value) e.currentTarget.style.background = "#F3EEE2"; }}
                  onMouseLeave={(e) => { if (o.value !== value) e.currentTarget.style.background = "transparent"; }}
                >
                  {o.label}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function Modal({ title, onClose, children, accent = COLORS.owner }) {
  return (
    <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(35,38,43,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }} onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: "22px 24px", width: "100%", maxWidth: 440, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.18)" }}>
        <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: 19, fontWeight: 600, color: accent }}>{title}</div>
          <button onClick={onClose} aria-label="Close" style={{ border: "none", background: "none", fontSize: 20, cursor: "pointer", color: COLORS.inkSoft, lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function SegTabs({ tabs, active, onChange, accent }) {
  return (
    <div style={{ display: "flex", gap: 4, background: "#F1EFE8", padding: 4, borderRadius: 10, flexWrap: "wrap" }}>
      {tabs.map((t) => (
        <button key={t.key} onClick={() => onChange(t.key)} style={{ border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, padding: "7px 14px", borderRadius: 7, background: active === t.key ? "#fff" : "transparent", color: active === t.key ? accent : COLORS.inkSoft, boxShadow: active === t.key ? "0 1px 2px rgba(0,0,0,0.08)" : "none" }}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
