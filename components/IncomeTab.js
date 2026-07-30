import { useMemo } from "react";
import { SectionCard, money, todayISO } from "./ui";

export default function IncomeTab({ appointments, invoices, studentMap, materials = [], materialSales = [] }) {
  const months = useMemo(() => {
    const set = new Set();
    appointments.forEach((a) => a.status === "completed" && set.add(a.date.slice(0, 7)));
    invoices.forEach((i) => i.status === "paid" && set.add((i.paid_date || i.date).slice(0, 7)));
    materialSales.forEach((s) => set.add(s.date.slice(0, 7)));
    if (set.size === 0) set.add(todayISO().slice(0, 7));
    return [...set].sort().reverse();
  }, [appointments, invoices, materialSales]);

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
    return {
      month: m,
      lessonIncome,
      invoiceIncome,
      materialsRevenue,
      materialsCost,
      materialsProfit,
      total: lessonIncome + invoiceIncome + materialsProfit,
    };
  });

  const cashFlow = useMemo(() => {
    const ascending = [...byMonth].sort((a, b) => a.month.localeCompare(b.month));
    let running = 0;
    return ascending.map((r) => {
      const moneyIn = r.lessonIncome + r.invoiceIncome + r.materialsRevenue;
      const moneyOut = r.materialsCost;
      const net = moneyIn - moneyOut;
      running += net;
      return { month: r.month, moneyIn, moneyOut, net, running };
    });
  }, [byMonth]);

  const maxFlow = Math.max(1, ...cashFlow.map((r) => Math.max(r.moneyIn, r.moneyOut)));

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
                  <td className="py-1.5 font-medium">{money(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
