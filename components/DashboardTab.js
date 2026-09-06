import { useState, useMemo } from "react";
import { SectionCard, StatCard, Button, money, todayISO, percentageForCourse } from "./ui";

export default function DashboardTab({ students, appointments, invoices, materials, materialSales, expenses, studentMap, services = [] }) {
  const [viewMonth, setViewMonth] = useState(() => {
    const t = new Date();
    return { year: t.getFullYear(), month: t.getMonth() };
  });

  const period = `${viewMonth.year}-${String(viewMonth.month + 1).padStart(2, "0")}`;
  const monthLabel = new Date(viewMonth.year, viewMonth.month, 1).toLocaleDateString("en-MY", { month: "long", year: "numeric" });
  const isCurrentMonth = period === todayISO().slice(0, 7);

  function goMonth(delta) {
    const d = new Date(viewMonth.year, viewMonth.month + delta, 1);
    setViewMonth({ year: d.getFullYear(), month: d.getMonth() });
  }
  function jumpToday() {
    const t = new Date();
    setViewMonth({ year: t.getFullYear(), month: t.getMonth() });
  }

  const stats = useMemo(() => {
    const monthAppts = appointments.filter((a) => a.date.slice(0, 7) === period);
    const completed = monthAppts.filter((a) => a.status === "completed");
    const absent = monthAppts.filter((a) => a.status === "absent");
    const cancelled = monthAppts.filter((a) => a.status === "cancelled");

    const lessonIncome = completed.reduce((sum, a) => sum + (Number(a.rate) || 0), 0);
    const yourShare = completed.reduce((sum, a) => {
      const course = studentMap[a.student_id]?.course;
      const pct = course ? percentageForCourse(course, services) : 100;
      return sum + ((Number(a.rate) || 0) * pct) / 100;
    }, 0);
    const schoolShare = lessonIncome - yourShare;
    const invoiceIncome = invoices
      .filter((i) => i.status === "paid" && (i.paid_date || i.date).slice(0, 7) === period)
      .reduce((sum, i) => sum + (Number(i.total) || 0), 0);

    const monthSales = materialSales.filter((s) => s.date.slice(0, 7) === period);
    const materialMap = {};
    materials.forEach((m) => (materialMap[m.id] = m));
    function costPerUnit(m) {
      if (!m) return 0;
      return m.cost_mode === "batch" ? (m.batch_quantity > 0 ? m.batch_cost / m.batch_quantity : 0) : m.per_unit_cost;
    }
    const materialsRevenue = monthSales.reduce((sum, s) => sum + Number(s.total), 0);
    const materialsCost = monthSales.reduce((sum, s) => sum + costPerUnit(materialMap[s.material_id]) * s.quantity, 0);
    const materialsProfit = materialsRevenue - materialsCost;

    const monthExpenses = expenses.filter((e) => e.date.slice(0, 7) === period);
    const totalExpenses = monthExpenses.reduce((sum, e) => sum + Number(e.amount), 0);

    const totalIncome = lessonIncome + invoiceIncome + materialsProfit;
    const netProfit = totalIncome - totalExpenses;

    const byCentre = {};
    completed.forEach((a) => {
      const centre = studentMap[a.student_id]?.centre || "Uncategorized";
      byCentre[centre] = (byCentre[centre] || 0) + (Number(a.rate) || 0);
    });

    return {
      lessonIncome, invoiceIncome, materialsProfit, totalExpenses, totalIncome, netProfit,
      yourShare, schoolShare,
      completedCount: completed.length, absentCount: absent.length, cancelledCount: cancelled.length,
      byCentre: Object.entries(byCentre).sort((a, b) => b[1] - a[1]),
    };
  }, [appointments, invoices, materials, materialSales, expenses, studentMap, services, period]);

  const now = useMemo(() => {
    const unpaidTotal = invoices.filter((i) => i.status === "unpaid").reduce((sum, i) => sum + Number(i.total), 0);
    const upcoming = appointments.filter(
      (a) => a.status !== "completed" && a.status !== "cancelled" && a.status !== "rescheduled" && a.status !== "absent" && a.date >= todayISO()
    ).length;
    const outstandingClaims = expenses.filter((e) => e.paid_via === "Personal" && !e.reimbursed).reduce((sum, e) => sum + Number(e.amount), 0);
    return { unpaidTotal, upcoming, outstandingClaims, activeStudents: students.filter((s) => (s.status || "active") === "active").length };
  }, [invoices, appointments, expenses, students]);

  return (
    <div className="space-y-4">
      <SectionCard
        title={monthLabel}
        action={
          <div className="flex items-center gap-2">
            <button onClick={() => goMonth(-1)} className="text-sm px-2 py-1 border border-[#D8D0BE] rounded hover:bg-[#F3EEE2]">‹</button>
            {!isCurrentMonth && (
              <button onClick={jumpToday} className="text-xs px-2 py-1 border border-[#D8D0BE] rounded hover:bg-[#F3EEE2]">This month</button>
            )}
            <button onClick={() => goMonth(1)} className="text-sm px-2 py-1 border border-[#D8D0BE] rounded hover:bg-[#F3EEE2]">›</button>
          </div>
        }
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total income" value={money(stats.totalIncome)} accent="#7A8B6F" />
          <StatCard label="Expenses" value={money(stats.totalExpenses)} accent="#6B2C3E" />
          <StatCard label="Net profit" value={money(stats.netProfit)} accent={stats.netProfit >= 0 ? "#7A8B6F" : "#6B2C3E"} />
          <StatCard label="Lessons completed" value={stats.completedCount} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
          <StatCard label="Lesson income" value={money(stats.lessonIncome)} />
          <StatCard label="Invoice income" value={money(stats.invoiceIncome)} />
          <StatCard label="Materials profit" value={money(stats.materialsProfit)} />
          <StatCard label="Absent / cancelled" value={`${stats.absentCount} / ${stats.cancelledCount}`} />
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <StatCard label="Your share (of lesson income)" value={money(stats.yourShare)} accent="#4C5A43" />
          <StatCard label="School's share" value={money(stats.schoolShare)} accent="#6B2C3E" />
        </div>
      </SectionCard>

      {stats.byCentre.length > 0 && (
        <SectionCard title={`Income by centre — ${monthLabel}`}>
          <div className="space-y-2">
            {stats.byCentre.map(([centre, total]) => {
              const max = stats.byCentre[0][1] || 1;
              return (
                <div key={centre} className="flex items-center gap-3">
                  <span className="text-sm w-32 truncate">{centre}</span>
                  <div className="flex-1 bg-[#F3EEE2] rounded h-3 overflow-hidden">
                    <div className="h-full bg-[#8A6D3B]" style={{ width: `${(total / max) * 100}%` }} />
                  </div>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace" }} className="text-sm w-24 text-right">{money(total)}</span>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      <SectionCard title="Right now">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Unpaid invoices" value={money(now.unpaidTotal)} accent="#6B2C3E" />
          <StatCard label="Upcoming lessons" value={now.upcoming} />
          <StatCard label="Active students" value={now.activeStudents} />
          <StatCard label="Unreimbursed claims" value={money(now.outstandingClaims)} accent={now.outstandingClaims > 0 ? "#6B2C3E" : undefined} />
        </div>
      </SectionCard>
    </div>
  );
}
