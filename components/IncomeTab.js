import { useMemo } from "react";
import { SectionCard, money, todayISO, percentageForCourse } from "./ui";

export default function IncomeTab({ appointments, invoices, studentMap, materials = [], materialSales = [], expenses = [], services = [] }) {
  const months = useMemo(() => {
    const set = new Set();
    appointments.forEach((a) => a.status === "completed" && set.add(a.date.slice(0, 7)));
    invoices.forEach((i) => i.status === "paid" && set.add((i.paid_date || i.date).slice(0, 7)));
    materialSales.forEach((s) => set.add(s.date.slice(0, 7)));
    expenses.forEach((e) => set.add(e.date.slice(0, 7)));
    if (set.size === 0) set.add(todayISO().slice(0, 7));
    return [...set].sort().reverse();
  }, [appointments, invoices, materialSales, expenses]);

  const materialMap = useMemo(() => {
    const m = {};
    materials.forEach((x) => (m[x.id] = x));
    return m;
  }, [materials]);

  function costPerUnit(m) {
    if (!m) return 0;
    return m.cost_mode === "batch"
      ? (m.batch_quantity > 0 ? m.batch_cost / m.batch_quantity : 0)
      : m.per_unit_cost;
  }

  const byMonth = months.map((m) => {
    const lessonIncome = appointments
      .filter((a) => a.status === "completed" && a.date.slice(0, 7) === m)
      .reduce((sum, a) => sum + (Number(a.rate) || 0), 0);
    const invoiceIncome = invoices
      .filter((i) => i.status === "paid" && (i.paid_date || i.date).slice(0, 7) === m)
      .reduce((sum, i) => sum + (Number(i.total) || 0), 0);
    const monthSales = materialSales.filter((s) => s.date.slice(0, 7) === m);
    const materialsRevenue = monthSales.reduce((sum, s) => sum + Number(s.total), 0);
    const materialsCost = monthSales.reduce((sum, s) => sum + costPerUnit(materialMap[s.material_id]) * s.quantity, 0);
    const materialsProfit = materialsRevenue - materialsCost;
    const generalExpenses = expenses.filter((e) => e.date.slice(0, 7) === m).reduce((sum, e) => sum + Number(e.amount), 0);
    return {
      month: m,
      lessonIncome,
      invoiceIncome,
      materialsRevenue,
      materialsCost,
      materialsProfit,
      generalExpenses,
      total: lessonIncome + invoiceIncome + materialsProfit - generalExpenses,
    };
  });

  const cashFlow = useMemo(() => {
    const ascending = [...byMonth].sort((a, b) => a.month.localeCompare(b.month));
    let running = 0;
    return ascending.map((r) => {
      const moneyIn = r.lessonIncome + r.invoiceIncome + r.materialsRevenue;
      const moneyOut = r.materialsCost + r.generalExpenses;
      const net = moneyIn - moneyOut;
      running += net;
      return { month: r.month, moneyIn, moneyOut, net, running };
    });
  }, [byMonth]);

  const maxFlow = Math.max(1, ...cashFlow.map((r) => Math.max(r.moneyIn, r.moneyOut)));

  const splitByCourse = useMemo(() => {
    const byCourse = {};
    appointments
      .filter((a) => a.status === "completed")
      .forEach((a) => {
        const course = studentMap[a.student_id]?.course || "No course set";
        if (!byCourse[course]) byCourse[course] = 0;
        byCourse[course] += Number(a.rate) || 0;
      });
    return Object.entries(byCourse)
      .map(([course, total]) => {
        const pct = course === "No course set" ? 100 : percentageForCourse(course, services);
        return { course, total, pct, yourShare: (total * pct) / 100, schoolShare: total - (total * pct) / 100 };
      })
      .sort((a, b) => b.total - a.total);
  }, [appointments, studentMap, services]);

  const splitTotals = splitByCourse.reduce(
    (acc, r) => ({ total: acc.total + r.total, yourShare: acc.yourShare + r.yourShare, schoolShare: acc.schoolShare + r.schoolShare }),
    { total: 0, yourShare: 0, schoolShare: 0 }
  );

  const byStudent = useMemo(() => {
    const map = {};
    appointments
      .filter((a) => a.status === "completed")
      .forEach((a) => {
        map[a.student_id] = (map[a.student_id] || 0) + (Number(a.rate) || 0);
      });
    return Object.entries(map)
      .map(([id, total]) => ({ name: studentMap[id]?.name || "Unknown", total }))
      .sort((a, b) => b.total - a.total);
  }, [appointments, studentMap]);

  const byCentre = useMemo(() => {
    const map = {};
    appointments
      .filter((a) => a.status === "completed")
      .forEach((a) => {
        const centre = studentMap[a.student_id]?.centre || "Uncategorized";
        map[centre] = (map[centre] || 0) + (Number(a.rate) || 0);
      });
    invoices
      .filter((i) => i.status === "paid")
      .forEach((i) => {
        const centre = i.billed_to || studentMap[i.student_id]?.centre || "Uncategorized";
        map[centre] = (map[centre] || 0) + (Number(i.total) || 0);
      });
    return Object.entries(map)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);
  }, [appointments, invoices, studentMap]);

  return (
    <div className="space-y-4">
      <SectionCard title="Cash flow — money in vs. money out">
        {cashFlow.length === 0 ? (
          <p className="text-sm text-[#8A8272]">Nothing recorded yet.</p>
        ) : (
          <div className="space-y-4">
            {cashFlow.map((r) => (
              <div key={r.month} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{r.month}</span>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace" }} className={r.net >= 0 ? "text-[#4C5A43]" : "text-[#6B2C3E]"}>
                    Net {r.net >= 0 ? "+" : ""}{money(r.net)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[#8A8272] w-8">In</span>
                  <div className="flex-1 bg-[#F3EEE2] rounded h-3 overflow-hidden">
                    <div className="h-full bg-[#7A8B6F]" style={{ width: `${(r.moneyIn / maxFlow) * 100}%` }} />
                  </div>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace" }} className="text-xs w-24 text-right">{money(r.moneyIn)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[#8A8272] w-8">Out</span>
                  <div className="flex-1 bg-[#F3EEE2] rounded h-3 overflow-hidden">
                    <div className="h-full bg-[#6B2C3E]" style={{ width: `${(r.moneyOut / maxFlow) * 100}%` }} />
                  </div>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace" }} className="text-xs w-24 text-right">{money(r.moneyOut)}</span>
                </div>
                <div className="text-[11px] text-[#8A8272]">Running balance: <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{money(r.running)}</span></div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Income by month">
        {byMonth.length === 0 ? (
          <p className="text-sm text-[#8A8272]">No completed lessons or paid invoices yet.</p>
        ) : (
          <table className="w-full text-sm" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
            <thead>
              <tr className="text-left text-[#8A8272] text-xs uppercase" style={{ fontFamily: "'Inter', sans-serif" }}>
                <th className="py-1.5">Month</th>
                <th className="py-1.5">Lessons</th>
                <th className="py-1.5">Invoices</th>
                <th className="py-1.5">Materials</th>
                <th className="py-1.5">Expenses</th>
                <th className="py-1.5">Total</th>
              </tr>
            </thead>
            <tbody>
              {byMonth.map((r) => (
                <tr key={r.month} className="border-t border-[#EDE7DB]">
                  <td className="py-1.5">{r.month}</td>
                  <td className="py-1.5">{money(r.lessonIncome)}</td>
                  <td className="py-1.5">{money(r.invoiceIncome)}</td>
                  <td className="py-1.5">{money(r.materialsProfit)}</td>
                  <td className="py-1.5 text-[#6B2C3E]">-{money(r.generalExpenses)}</td>
                  <td className="py-1.5 font-medium">{money(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      <SectionCard title="Revenue split with the school, by course">
        <p className="text-xs text-[#8A8272] mb-3">
          Based on completed lessons only — invoiced bundles and materials income aren't split by course here, since one invoice can cover several courses at once.
        </p>
        {splitByCourse.length === 0 ? (
          <p className="text-sm text-[#8A8272]">No completed lessons yet.</p>
        ) : (
          <>
            <table className="w-full text-sm" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
              <thead>
                <tr className="text-left text-[#8A8272] text-xs uppercase" style={{ fontFamily: "'Inter', sans-serif" }}>
                  <th className="py-1.5">Course</th>
                  <th className="py-1.5">Total</th>
                  <th className="py-1.5">Your %</th>
                  <th className="py-1.5">Your share</th>
                  <th className="py-1.5">School's share</th>
                </tr>
              </thead>
              <tbody>
                {splitByCourse.map((r) => (
                  <tr key={r.course} className="border-t border-[#EDE7DB]">
                    <td className="py-1.5" style={{ fontFamily: "'Inter', sans-serif" }}>{r.course}</td>
                    <td className="py-1.5">{money(r.total)}</td>
                    <td className="py-1.5">{r.pct}%</td>
                    <td className="py-1.5 text-[#4C5A43]">{money(r.yourShare)}</td>
                    <td className="py-1.5 text-[#6B2C3E]">{money(r.schoolShare)}</td>
                  </tr>
                ))}
                <tr className="border-t border-[#EDE7DB] font-medium">
                  <td className="py-1.5" style={{ fontFamily: "'Inter', sans-serif" }}>Total</td>
                  <td className="py-1.5">{money(splitTotals.total)}</td>
                  <td className="py-1.5"></td>
                  <td className="py-1.5 text-[#4C5A43]">{money(splitTotals.yourShare)}</td>
                  <td className="py-1.5 text-[#6B2C3E]">{money(splitTotals.schoolShare)}</td>
                </tr>
              </tbody>
            </table>
          </>
        )}
      </SectionCard>

      <SectionCard title="Income by centre">
        {byCentre.length === 0 ? (
          <p className="text-sm text-[#8A8272]">Nothing to show yet. Tag students with a centre on the Students tab.</p>
        ) : (
          <div className="space-y-2">
            {byCentre.map((c) => {
              const max = byCentre[0].total || 1;
              return (
                <div key={c.name} className="flex items-center gap-3">
                  <span className="text-sm w-32 truncate">{c.name}</span>
                  <div className="flex-1 bg-[#F3EEE2] rounded h-3 overflow-hidden">
                    <div className="h-full bg-[#8A6D3B]" style={{ width: `${(c.total / max) * 100}%` }} />
                  </div>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace" }} className="text-sm w-24 text-right">{money(c.total)}</span>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Income by student (completed lessons)">
        {byStudent.length === 0 ? (
          <p className="text-sm text-[#8A8272]">Nothing completed yet.</p>
        ) : (
          <div className="space-y-2">
            {byStudent.map((s) => {
              const max = byStudent[0].total || 1;
              return (
                <div key={s.name} className="flex items-center gap-3">
                  <span className="text-sm w-32 truncate">{s.name}</span>
                  <div className="flex-1 bg-[#F3EEE2] rounded h-3 overflow-hidden">
                    <div className="h-full bg-[#B8935F]" style={{ width: `${(s.total / max) * 100}%` }} />
                  </div>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace" }} className="text-sm w-24 text-right">{money(s.total)}</span>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
