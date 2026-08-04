import { useState } from "react";
import { jsPDF } from "jspdf";
import { SectionCard, Button, Field, inputCls, money, todayISO, toISODate } from "./ui";

function firstOfThisMonth() {
  return todayISO().slice(0, 7) + "-01";
}
function firstOfLastMonth() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function lastOfLastMonth() {
  const d = new Date();
  d.setDate(0); // last day of previous month
  return toISODate(d);
}
function firstOfThisYear() {
  return todayISO().slice(0, 4) + "-01-01";
}

export default function ReportsTab({ students, appointments, invoices, materials, materialSales, expenses, businessSettings, studentMap }) {
  const [range, setRange] = useState({ start: firstOfThisMonth(), end: todayISO() });
  const [sections, setSections] = useState({
    income: true, expenses: true, schedule: true, invoices: true, materials: false, roster: false,
  });
  const [generating, setGenerating] = useState(false);

  function applyPreset(preset) {
    if (preset === "thisMonth") setRange({ start: firstOfThisMonth(), end: todayISO() });
    if (preset === "lastMonth") setRange({ start: firstOfLastMonth(), end: lastOfLastMonth() });
    if (preset === "thisYear") setRange({ start: firstOfThisYear(), end: todayISO() });
    if (preset === "allTime") setRange({ start: "2000-01-01", end: todayISO() });
  }

  function toggle(key) {
    setSections({ ...sections, [key]: !sections[key] });
  }

  function generate() {
    setGenerating(true);
    try {
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const left = 48, right = 547, pageBottom = 780;
      let y = 56;

      function ensureSpace(h) {
        if (y + h > pageBottom) {
          doc.addPage();
          y = 56;
        }
      }
      function sectionTitle(text) {
        ensureSpace(34);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.text(text, left, y);
        y += 8;
        doc.setDrawColor(200);
        doc.line(left, y, right, y);
        y += 16;
      }
      function row(cols, widths, bold) {
        ensureSpace(14);
        doc.setFont("helvetica", bold ? "bold" : "normal");
        doc.setFontSize(9);
        let x = left;
        cols.forEach((c, i) => {
          doc.text(String(c ?? ""), x, y);
          x += widths[i];
        });
        y += 14;
      }

      const inRange = (d) => d && d >= range.start && d <= range.end;

      // ---- Header ----
      if (businessSettings?.logo_base64) {
        try {
          doc.addImage(businessSettings.logo_base64, "PNG", left, y - 20, 40, 40);
        } catch (e) {
          // ignore undecodable logo, header text still prints
        }
      }
      const textLeft = businessSettings?.logo_base64 ? left + 52 : left;
      doc.setFont("times", "bold");
      doc.setFontSize(18);
      doc.text(businessSettings?.company_name || "T'numusica", textLeft, y);
      y += 20;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Business Report — ${range.start} to ${range.end}`, textLeft, y);
      y += 14;
      doc.text(`Generated ${todayISO()}`, textLeft, y);
      y += 28;

      // ---- Income Summary ----
      if (sections.income) {
        sectionTitle("Income Summary");
        const lessonIncome = appointments
          .filter((a) => a.status === "completed" && inRange(a.date))
          .reduce((sum, a) => sum + (Number(a.rate) || 0), 0);
        const invoiceIncome = invoices
          .filter((i) => i.status === "paid" && inRange(i.paid_date || i.date))
          .reduce((sum, i) => sum + (Number(i.total) || 0), 0);
        const inRangeSales = materialSales.filter((s) => inRange(s.date));
        const materialsRevenue = inRangeSales.reduce((sum, s) => sum + Number(s.total), 0);
        const materialMap = {};
        materials.forEach((m) => (materialMap[m.id] = m));
        function costPerUnit(m) {
          if (!m) return 0;
          return m.cost_mode === "batch" ? (m.batch_quantity > 0 ? m.batch_cost / m.batch_quantity : 0) : m.per_unit_cost;
        }
        const materialsCost = inRangeSales.reduce((sum, s) => sum + costPerUnit(materialMap[s.material_id]) * s.quantity, 0);
        const materialsProfit = materialsRevenue - materialsCost;
        const total = lessonIncome + invoiceIncome + materialsProfit;
        row(["Lesson income (completed lessons)", money(lessonIncome)], [340, 150]);
        row(["Invoice income (paid)", money(invoiceIncome)], [340, 150]);
        row(["Materials profit", money(materialsProfit)], [340, 150]);
        row(["Total income", money(total)], [340, 150], true);
        y += 10;
      }

      // ---- Expenses ----
      if (sections.expenses) {
        sectionTitle("Expenses by Category");
        const inRangeExpenses = expenses.filter((e) => inRange(e.date));
        if (inRangeExpenses.length === 0) {
          row(["No expenses in this range."], [500]);
        } else {
          const byCategory = {};
          inRangeExpenses.forEach((e) => {
            byCategory[e.category] = (byCategory[e.category] || 0) + Number(e.amount);
          });
          row(["Category", "Amount"], [340, 150], true);
          Object.entries(byCategory)
            .sort((a, b) => b[1] - a[1])
            .forEach(([cat, amt]) => row([cat, money(amt)], [340, 150]));
          const totalExpenses = inRangeExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
          row(["Total expenses", money(totalExpenses)], [340, 150], true);
        }
        y += 10;
      }

      // ---- Schedule / Attendance ----
      if (sections.schedule) {
        sectionTitle("Schedule / Attendance Log");
        const inRangeAppts = appointments.filter((a) => inRange(a.date)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
        if (inRangeAppts.length === 0) {
          row(["No lessons in this range."], [500]);
        } else {
          row(["Date", "Time", "Student", "Duration", "Status"], [70, 50, 170, 70, 100], true);
          inRangeAppts.forEach((a) => {
            row([a.date, a.time, studentMap[a.student_id]?.name || "Unknown", `${a.duration} min`, a.status], [70, 50, 170, 70, 100]);
          });
        }
        y += 10;
      }

      // ---- Outstanding Invoices ----
      if (sections.invoices) {
        sectionTitle("Outstanding Invoices");
        const unpaid = invoices.filter((i) => i.status === "unpaid");
        if (unpaid.length === 0) {
          row(["No unpaid invoices."], [500]);
        } else {
          row(["Invoice #", "Billed to", "Date", "Amount"], [90, 220, 90, 100], true);
          unpaid.forEach((i) => {
            row([i.number, studentMap[i.student_id]?.name || i.billed_to || "Unknown", i.date, money(i.total)], [90, 220, 90, 100]);
          });
          const totalUnpaid = unpaid.reduce((sum, i) => sum + Number(i.total), 0);
          row(["Total outstanding", "", "", money(totalUnpaid)], [90, 220, 90, 100], true);
        }
        y += 10;
      }

      // ---- Materials ----
      if (sections.materials) {
        sectionTitle("Materials Performance");
        if (materials.length === 0) {
          row(["No products recorded."], [500]);
        } else {
          const materialMap2 = {};
          materials.forEach((m) => (materialMap2[m.id] = m));
          function costPerUnit2(m) {
            if (!m) return 0;
            return m.cost_mode === "batch" ? (m.batch_quantity > 0 ? m.batch_cost / m.batch_quantity : 0) : m.per_unit_cost;
          }
          row(["Product", "Units sold", "Revenue", "Cost", "Profit"], [180, 80, 90, 90, 90], true);
          materials.forEach((m) => {
            const sales = materialSales.filter((s) => s.material_id === m.id && inRange(s.date));
            const units = sales.reduce((sum, s) => sum + s.quantity, 0);
            const revenue = sales.reduce((sum, s) => sum + Number(s.total), 0);
            const cost = costPerUnit2(m) * units;
            row([m.name, units, money(revenue), money(cost), money(revenue - cost)], [180, 80, 90, 90, 90]);
          });
        }
        y += 10;
      }

      // ---- Student Roster ----
      if (sections.roster) {
        sectionTitle("Student Roster");
        if (students.length === 0) {
          row(["No students yet."], [500]);
        } else {
          row(["Name", "Age", "Grade", "Course", "Centre", "Rate"], [120, 40, 70, 110, 90, 80], true);
          students.forEach((s) => {
            row([s.name, s.age ?? "-", s.grade || "-", s.course || "-", s.centre || "-", money(s.rate)], [120, 40, 70, 110, 90, 80]);
          });
        }
      }

      doc.save(`Report_${range.start}_to_${range.end}.pdf`);
    } finally {
      setGenerating(false);
    }
  }

  const anySectionSelected = Object.values(sections).some(Boolean);

  return (
    <div className="space-y-4">
      <SectionCard title="Generate a report">
        <div className="space-y-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-[#8A8272] mb-2">Date range</div>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="From">
                <input type="date" className={inputCls} value={range.start} onChange={(e) => setRange({ ...range, start: e.target.value })} />
              </Field>
              <Field label="To">
                <input type="date" className={inputCls} value={range.end} onChange={(e) => setRange({ ...range, end: e.target.value })} />
              </Field>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => applyPreset("thisMonth")}>This month</Button>
                <Button variant="secondary" onClick={() => applyPreset("lastMonth")}>Last month</Button>
                <Button variant="secondary" onClick={() => applyPreset("thisYear")}>This year</Button>
                <Button variant="secondary" onClick={() => applyPreset("allTime")}>All time</Button>
              </div>
            </div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wide text-[#8A8272] mb-2">Include in report</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                ["income", "Income summary"],
                ["expenses", "Expenses by category"],
                ["schedule", "Schedule / attendance log"],
                ["invoices", "Outstanding invoices"],
                ["materials", "Materials performance"],
                ["roster", "Student roster (current, not date-limited)"],
              ].map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={sections[key]} onChange={() => toggle(key)} />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <Button onClick={generate} disabled={generating || !anySectionSelected}>
            {generating ? "Generating…" : "Download PDF report"}
          </Button>
          {!anySectionSelected && <p className="text-xs text-[#6B2C3E]">Pick at least one section to include.</p>}
        </div>
      </SectionCard>
    </div>
  );
}
