import { useState } from "react";
import { SectionCard, Button, Field, inputCls } from "./ui";

export default function RatesTab({ services, onAdd, onUpdate, onRemove }) {
  const [form, setForm] = useState({ code: "", label: "", duration: 30, rate: "" });

  function submit(e) {
    e.preventDefault();
    if (!form.code.trim() || !form.label.trim()) return;
    onAdd({ code: form.code.trim(), label: form.label.trim(), duration: Number(form.duration) || 30, rate: Number(form.rate) || 0 });
    setForm({ code: "", label: "", duration: 30, rate: "" });
  }

  return (
    <div className="space-y-4">
      <SectionCard title="About this table">
        <p className="text-sm text-[#5C564A]">
          These codes and labels are for your own reference only — they're never printed on an invoice.
          Invoices only ever show duration and amount. Pick a service when booking a lesson and the
          duration + rate fill in automatically.
        </p>
      </SectionCard>

      <SectionCard title="Add service / grade code">
        <form onSubmit={submit} className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
          <Field label="Code">
            <input className={inputCls} placeholder="a" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </Field>
          <Field label="Label (internal)">
            <input className={inputCls} placeholder="Beg" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          </Field>
          <Field label="Duration (min)">
            <input type="number" className={inputCls} value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} />
          </Field>
          <Field label="Rate (RM)">
            <input type="number" className={inputCls} value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} />
          </Field>
          <div className="col-span-2 sm:col-span-4">
            <Button type="submit">Add</Button>
          </div>
        </form>
      </SectionCard>

      <SectionCard title={`Codes (${services.length})`}>
        {services.length === 0 ? (
          <p className="text-sm text-[#8A8272]">No codes yet — add Beg, Prep Test, G1, G2… above.</p>
        ) : (
          <div className="divide-y divide-[#EDE7DB]">
            {services
              .slice()
              .sort((a, b) => a.duration - b.duration || a.code.localeCompare(b.code))
              .map((s) => (
                <div key={s.id} className="flex items-center justify-between py-2.5 gap-3">
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-xs px-1.5 py-0.5 rounded border border-[#D8D0BE]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                      {s.code}
                    </span>
                    <input className={inputCls + " flex-1"} value={s.label} onChange={(e) => onUpdate(s.id, { label: e.target.value })} />
                  </div>
                  <div className="flex items-center gap-1">
                    <input type="number" className={inputCls + " w-16"} value={s.duration} onChange={(e) => onUpdate(s.id, { duration: Number(e.target.value) || 0 })} />
                    <span className="text-xs text-[#8A8272]">min</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-[#8A8272]">RM</span>
                    <input type="number" className={inputCls + " w-20"} value={s.rate} onChange={(e) => onUpdate(s.id, { rate: Number(e.target.value) || 0 })} />
                  </div>
                  <button onClick={() => onRemove(s.id)} className="text-xs text-[#6B2C3E] hover:underline">Remove</button>
                </div>
              ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
