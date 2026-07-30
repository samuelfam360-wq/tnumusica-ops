import { useState, useMemo } from "react";
import {
  SectionCard, Button, Field, inputCls, money, todayISO, SearchBox,
  EXPENSE_CATEGORIES, categorizeExpense,
} from "./ui";
import { supabase } from "../lib/supabaseClient";

export default function ExpensesTab({ expenses, onAdd, onUpdate, onRemove }) {
  const [form, setForm] = useState({
    date: todayISO(),
    amount: "",
    description: "",
    category: "",
    categoryTouched: false,
    paidVia: "Company",
    notes: "",
  });
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");

  // Resize/compress the photo client-side before sending — keeps uploads fast
  // and the per-scan API cost low, while staying readable enough for OCR.
  function resizeImage(file, maxWidth = 1400) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, maxWidth / img.width);
          const canvas = document.createElement("canvas");
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
          resolve(dataUrl.split(",")[1]);
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function scanReceipt(file) {
    setScanning(true);
    setScanError("");
    try {
      const imageBase64 = await resizeImage(file);
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      const res = await fetch("/api/receipt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ imageBase64, mediaType: "image/jpeg" }),
      });
      const result = await res.json();
      if (result.error) throw new Error(result.error);
      setForm((f) => ({
        ...f,
        description: result.merchant || f.description,
        amount: result.amount != null ? String(result.amount) : f.amount,
        date: result.date || f.date,
        category: result.category || f.category,
        categoryTouched: true,
        notes: result.notes || f.notes,
      }));
    } catch (err) {
      setScanError("Couldn't read that receipt — please fill in the details manually.");
    } finally {
      setScanning(false);
    }
  }

  function onDescriptionChange(value) {
    setForm((f) => ({
      ...f,
      description: value,
      category: f.categoryTouched ? f.category : categorizeExpense(value),
    }));
  }

  function submit(e) {
    e.preventDefault();
    if (!form.description.trim() || !form.amount) return;
    onAdd({
      date: form.date,
      amount: Number(form.amount) || 0,
      description: form.description.trim(),
      category: form.category || categorizeExpense(form.description),
      paid_via: form.paidVia,
      reimbursed: form.paidVia === "Company", // company-paid needs no reimbursement
      notes: form.notes.trim(),
    });
    setForm({ date: form.date, amount: "", description: "", category: "", categoryTouched: false, paidVia: "Company", notes: "" });
  }

  const filtered = useMemo(() => {
    return expenses
      .filter((e) => !categoryFilter || e.category === categoryFilter)
      .filter((e) => {
        if (!search.trim()) return true;
        const q = search.trim().toLowerCase();
        return e.description.toLowerCase().includes(q) || e.category.toLowerCase().includes(q);
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [expenses, search, categoryFilter]);

  const byCategory = useMemo(() => {
    const map = {};
    expenses.forEach((e) => {
      map[e.category] = (map[e.category] || 0) + Number(e.amount);
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  const totalAll = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const outstandingClaims = expenses.filter((e) => e.paid_via === "Personal" && !e.reimbursed);
  const outstandingTotal = outstandingClaims.reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <div className="space-y-4">
      <SectionCard title="Add expense / claim">
        <div className="mb-4 pb-4 border-b border-[#EDE7DB]">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <span className={"px-3.5 py-2 rounded-md text-sm font-medium border border-[#D8D0BE] hover:bg-[#F3EEE2]" + (scanning ? " opacity-50" : "")}>
              {scanning ? "Reading receipt…" : "📷 Scan a receipt photo"}
            </span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              disabled={scanning}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) scanReceipt(f); e.target.value = ""; }}
            />
          </label>
          <p className="text-xs text-[#8A8272] mt-1">Fills in the description, amount, date, and category below — double-check before saving.</p>
          {scanError && <p className="text-xs text-[#6B2C3E] mt-1">{scanError}</p>}
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="Date">
              <input type="date" className={inputCls} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </Field>
            <Field label="Amount (RM)">
              <input type="number" className={inputCls} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </Field>
            <div className="col-span-2">
              <Field label="What is it">
                <input
                  className={inputCls}
                  placeholder="e.g. Printed 50 workbooks, Grab to Play Studio"
                  value={form.description}
                  onChange={(e) => onDescriptionChange(e.target.value)}
                />
              </Field>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-end">
            <Field label="Category (auto-suggested — change if wrong)">
              <select
                className={inputCls}
                value={form.category || categorizeExpense(form.description)}
                onChange={(e) => setForm({ ...form, category: e.target.value, categoryTouched: true })}
              >
                {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Paid via">
              <select className={inputCls} value={form.paidVia} onChange={(e) => setForm({ ...form, paidVia: e.target.value })}>
                <option value="Company">Company account</option>
                <option value="Personal">Personal (needs reimbursing)</option>
              </select>
            </Field>
            <Field label="Notes (optional)">
              <input className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
          </div>
          <Button type="submit">Add expense</Button>
        </form>
      </SectionCard>

      {outstandingClaims.length > 0 && (
        <SectionCard title="Outstanding personal claims">
          <p className="text-sm text-[#6B2C3E] mb-2">
            {outstandingClaims.length} expense(s) paid personally, not yet reimbursed — {money(outstandingTotal)} total.
          </p>
          <div className="space-y-1">
            {outstandingClaims.map((e) => (
              <div key={e.id} className="flex items-center justify-between text-sm">
                <span>{e.date} — {e.description}</span>
                <div className="flex items-center gap-3">
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{money(e.amount)}</span>
                  <button onClick={() => onUpdate(e.id, { reimbursed: true, reimbursed_date: todayISO() })} className="text-xs text-[#4C5A43] hover:underline">Mark reimbursed</button>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard title="By category (for your accountant)">
        {byCategory.length === 0 ? (
          <p className="text-sm text-[#8A8272]">No expenses logged yet.</p>
        ) : (
          <div className="space-y-2">
            {byCategory.map(([cat, total]) => {
              const max = byCategory[0][1] || 1;
              return (
                <div key={cat} className="flex items-center gap-3">
                  <span className="text-sm w-48 truncate">{cat}</span>
                  <div className="flex-1 bg-[#F3EEE2] rounded h-3 overflow-hidden">
                    <div className="h-full bg-[#6B2C3E]" style={{ width: `${(total / max) * 100}%` }} />
                  </div>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace" }} className="text-sm w-24 text-right">{money(total)}</span>
                </div>
              );
            })}
            <div className="pt-2 border-t border-[#EDE7DB] flex items-center justify-between text-sm font-medium">
              <span>Total expenses</span>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{money(totalAll)}</span>
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title={`All expenses (${expenses.length})`}
        action={
          <div className="flex items-center gap-2">
            <select className={inputCls} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">All categories</option>
              {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <SearchBox value={search} onChange={setSearch} placeholder="Search…" />
          </div>
        }
      >
        {filtered.length === 0 ? (
          <p className="text-sm text-[#8A8272]">No expenses match.</p>
        ) : (
          <div className="divide-y divide-[#EDE7DB]">
            {filtered.map((e) => (
              <div key={e.id} className="flex items-center justify-between py-2.5">
                <div>
                  <div className="text-sm font-medium">{e.description}</div>
                  <div className="text-xs text-[#8A8272]">
                    {e.date} · {e.category} · {e.paid_via === "Personal" ? (e.reimbursed ? `Personal (reimbursed ${e.reimbursed_date || ""})` : "Personal — unreimbursed") : "Company"}
                    {e.notes && ` · ${e.notes}`}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace" }} className="text-sm">{money(e.amount)}</span>
                  <button onClick={() => onRemove(e.id)} className="text-xs text-[#8A8272] hover:underline">Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
