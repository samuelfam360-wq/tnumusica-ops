import { useState } from "react";
import { SectionCard, Button, Field, inputCls } from "./ui";

export default function StudentsTab({ students, onAdd, onUpdateRate, onRemove }) {
  const [form, setForm] = useState({ name: "", rate: "", notes: "" });

  function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    onAdd({ name: form.name.trim(), rate: Number(form.rate) || 0, notes: form.notes.trim() });
    setForm({ name: "", rate: "", notes: "" });
  }

  return (
    <div className="space-y-4">
      <SectionCard title="Add student">
        <form onSubmit={submit} className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
          <Field label="Name">
            <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Default rate (RM/lesson)">
            <input type="number" className={inputCls} value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} />
          </Field>
          <Field label="Notes">
            <input className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          <Button type="submit">Add student</Button>
        </form>
      </SectionCard>

      <SectionCard title={`Students (${students.length})`}>
        {students.length === 0 ? (
          <p className="text-sm text-[#8A8272]">No students yet.</p>
        ) : (
          <div className="divide-y divide-[#EDE7DB]">
            {students.map((s) => (
              <div key={s.id} className="flex items-center justify-between py-2.5">
                <div>
                  <div className="text-sm font-medium">{s.name}</div>
                  {s.notes && <div className="text-xs text-[#8A8272]">{s.notes}</div>}
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-[#8A8272]">RM</span>
                    <input
                      type="number"
                      className={inputCls + " w-20"}
                      value={s.rate}
                      onChange={(e) => onUpdateRate(s.id, e.target.value)}
                    />
                  </div>
                  <button onClick={() => onRemove(s.id)} className="text-xs text-[#6B2C3E] hover:underline">Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
