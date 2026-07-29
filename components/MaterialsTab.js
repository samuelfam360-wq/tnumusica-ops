import { useState, useMemo } from "react";
import { SectionCard, Button, Field, inputCls, money, todayISO } from "./ui";

export default function MaterialsTab({ materials, sales, students, studentMap, onAddMaterial, onRemoveMaterial, onAddSale, onRemoveSale }) {
  const [form, setForm] = useState({
    name: "",
    notes: "",
    costMode: "batch",
    batchCost: "",
    batchQuantity: "",
    perUnitCost: "",
  });

  const [saleForm, setSaleForm] = useState({
    materialId: materials[0]?.id || "",
    saleType: "individual",
    studentId: students[0]?.id || "",
    quantity: 1,
    unitPrice: "",
    date: todayISO(),
  });

  function submitMaterial(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    onAddMaterial({
      name: form.name.trim(),
      notes: form.notes.trim(),
      cost_mode: form.costMode,
      batch_cost: Number(form.batchCost) || 0,
      batch_quantity: Number(form.batchQuantity) || 0,
      per_unit_cost: Number(form.perUnitCost) || 0,
    });
    setForm({ name: "", notes: "", costMode: "batch", batchCost: "", batchQuantity: "", perUnitCost: "" });
  }

  function submitSale(e) {
    e.preventDefault();
    if (!saleForm.materialId || !saleForm.unitPrice) return;
    const quantity = Number(saleForm.quantity) || 1;
    const unitPrice = Number(saleForm.unitPrice) || 0;
    onAddSale({
      material_id: saleForm.materialId,
      student_id: saleForm.saleType === "individual" ? saleForm.studentId || null : null,
      sale_type: saleForm.saleType,
      quantity,
      unit_price: unitPrice,
      total: quantity * unitPrice,
      date: saleForm.date,
    });
    setSaleForm({ ...saleForm, quantity: 1, unitPrice: "" });
  }

  const summaries = useMemo(() => {
    return materials.map((m) => {
      const costPerUnit = m.cost_mode === "batch"
        ? (m.batch_quantity > 0 ? m.batch_cost / m.batch_quantity : 0)
        : m.per_unit_cost;
      const productionCost = m.cost_mode === "batch" ? m.batch_cost : null; // batch cost is a fixed sunk cost
      const materialSales = sales.filter((s) => s.material_id === m.id);
      const unitsSold = materialSales.reduce((sum, s) => sum + s.quantity, 0);
      const revenue = materialSales.reduce((sum, s) => sum + Number(s.total), 0);
      const costIncurred = m.cost_mode === "batch" ? m.batch_cost : costPerUnit * unitsSold;
      const profit = revenue - costIncurred;
      return { material: m, costPerUnit, unitsSold, revenue, costIncurred, profit };
    });
  }, [materials, sales]);

  const sortedSales = [...sales].sort((a, b) => b.date.localeCompare(a.date));
  const materialMap = useMemo(() => {
    const m = {};
    materials.forEach((x) => (m[x.id] = x));
    return m;
  }, [materials]);

  return (
    <div className="space-y-4">
      <SectionCard title="Add a product">
        <form onSubmit={submitMaterial} className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
          <Field label="Name">
            <input className={inputCls} placeholder="Chord Chart Workbook" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Cost basis">
            <select className={inputCls} value={form.costMode} onChange={(e) => setForm({ ...form, costMode: e.target.value })}>
              <option value="batch">Total batch cost</option>
              <option value="per_unit">Cost per unit</option>
            </select>
          </Field>
          {form.costMode === "batch" ? (
            <>
              <Field label="Total production cost (RM)">
                <input type="number" className={inputCls} value={form.batchCost} onChange={(e) => setForm({ ...form, batchCost: e.target.value })} />
              </Field>
              <Field label="Units produced">
                <input type="number" className={inputCls} value={form.batchQuantity} onChange={(e) => setForm({ ...form, batchQuantity: e.target.value })} />
              </Field>
            </>
          ) : (
            <Field label="Cost per unit (RM)">
              <input type="number" className={inputCls} value={form.perUnitCost} onChange={(e) => setForm({ ...form, perUnitCost: e.target.value })} />
            </Field>
          )}
          <Field label="Notes (optional)">
            <input className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          <div className="col-span-2 sm:col-span-4">
            <Button type="submit">Add product</Button>
          </div>
        </form>
      </SectionCard>

      <SectionCard title="Log a sale">
        {materials.length === 0 ? (
          <p className="text-sm text-[#8A8272]">Add a product first, above.</p>
        ) : (
          <form onSubmit={submitSale} className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
            <Field label="Product">
              <select className={inputCls} value={saleForm.materialId} onChange={(e) => setSaleForm({ ...saleForm, materialId: e.target.value })}>
                {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </Field>
            <Field label="Sale type">
              <select className={inputCls} value={saleForm.saleType} onChange={(e) => setSaleForm({ ...saleForm, saleType: e.target.value })}>
                <option value="individual">Individual</option>
                <option value="bulk">Bulk</option>
              </select>
            </Field>
            {saleForm.saleType === "individual" && students.length > 0 && (
              <Field label="Student (optional)">
                <select className={inputCls} value={saleForm.studentId} onChange={(e) => setSaleForm({ ...saleForm, studentId: e.target.value })}>
                  <option value="">—</option>
                  {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
            )}
            <Field label="Quantity">
              <input type="number" min="1" className={inputCls} value={saleForm.quantity} onChange={(e) => setSaleForm({ ...saleForm, quantity: e.target.value })} />
            </Field>
            <Field label="Price per unit (RM)">
              <input type="number" className={inputCls} value={saleForm.unitPrice} onChange={(e) => setSaleForm({ ...saleForm, unitPrice: e.target.value })} />
            </Field>
            <Field label="Date">
              <input type="date" className={inputCls} value={saleForm.date} onChange={(e) => setSaleForm({ ...saleForm, date: e.target.value })} />
            </Field>
            <div className="col-span-2 sm:col-span-4">
              <Button type="submit">Log sale</Button>
            </div>
          </form>
        )}
      </SectionCard>

      <SectionCard title={`Products (${materials.length})`}>
        {summaries.length === 0 ? (
          <p className="text-sm text-[#8A8272]">No products yet.</p>
        ) : (
          <div className="divide-y divide-[#EDE7DB]">
            {summaries.map(({ material: m, unitsSold, revenue, costIncurred, profit }) => (
              <div key={m.id} className="py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">{m.name}</div>
                    {m.notes && <div className="text-xs text-[#8A8272]">{m.notes}</div>}
                  </div>
                  <button onClick={() => onRemoveMaterial(m.id)} className="text-xs text-[#6B2C3E] hover:underline">Remove</button>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-3 text-xs" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                  <div><span className="text-[#8A8272]">Sold: </span>{unitsSold}</div>
                  <div><span className="text-[#8A8272]">Cost: </span>{money(costIncurred)}</div>
                  <div><span className="text-[#8A8272]">Revenue: </span>{money(revenue)}</div>
                  <div style={{ color: profit >= 0 ? "#4C5A43" : "#6B2C3E" }}>
                    <span className="text-[#8A8272]">Profit: </span>{money(profit)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title={`Sales log (${sales.length})`}>
        {sortedSales.length === 0 ? (
          <p className="text-sm text-[#8A8272]">No sales logged yet.</p>
        ) : (
          <div className="divide-y divide-[#EDE7DB]">
            {sortedSales.map((s) => (
              <div key={s.id} className="flex items-center justify-between py-2.5">
                <div>
                  <div className="text-sm font-medium">
                    {materialMap[s.material_id]?.name || "Unknown product"} — {s.quantity} × {money(s.unit_price)}
                  </div>
                  <div className="text-xs text-[#8A8272]">
                    {s.sale_type === "individual" ? (studentMap[s.student_id]?.name || "Individual sale") : "Bulk sale"} · {s.date}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace" }} className="text-sm">{money(s.total)}</span>
                  <button onClick={() => onRemoveSale(s.id)} className="text-xs text-[#8A8272] hover:underline">Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
