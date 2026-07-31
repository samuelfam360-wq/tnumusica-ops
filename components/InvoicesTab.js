import { useState, useMemo } from "react";
import { jsPDF } from "jspdf";
import { SectionCard, Button, Field, inputCls, money, todayISO, SearchableSelect, SearchBox, CENTRES } from "./ui";

function downloadInvoicePdf(invoice, student, biz = {}) {
  const isPaid = invoice.status === "paid";
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const left = 48;
  let y = 56;

  if (biz.logo_base64) {
    try {
      doc.addImage(biz.logo_base64, "PNG", left, y - 20, 48, 48);
    } catch (e) {
      // fall through silently if image format isn't decodable — text header still prints
    }
  }
  const textLeft = biz.logo_base64 ? left + 60 : left;

  doc.setFont("times", "bold");
  doc.setFontSize(18);
  doc.text(biz.company_name || "T'numusica", textLeft, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  let headerY = y + 14;
  if (biz.address) { doc.text(biz.address, textLeft, headerY); headerY += 12; }
  const contactLine = [biz.phone, biz.email].filter(Boolean).join("  ·  ");
  if (contactLine) { doc.text(contactLine, textLeft, headerY); headerY += 12; }
  if (biz.license_info) { doc.text(`License: ${biz.license_info}`, textLeft, headerY); headerY += 12; }

  y = Math.max(y + 56, headerY + 20);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(isPaid ? "RECEIPT" : "INVOICE", left, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  y += 20;
  doc.text(`${isPaid ? "Receipt" : "Invoice"} #: ${invoice.number}`, left, y);
  y += 14;
  doc.text(`Date: ${invoice.date}`, left, y);
  y += 14;
  if (isPaid) {
    doc.setTextColor(76, 90, 67);
    doc.text(`Payment received on ${invoice.paid_date || invoice.date}`, left, y);
    doc.setTextColor(0);
  } else {
    doc.text("Status: Unpaid", left, y);
  }

  y += 28;
  doc.setFont("helvetica", "bold");
  doc.text(isPaid ? "Received from:" : "Bill to:", left, y);
  doc.setFont("helvetica", "normal");
  y += 14;
  doc.text(student?.name || invoice.billed_to || "Customer", left, y);

  y += 32;
  doc.setDrawColor(200);
  doc.line(left, y, 547, y);
  y += 18;

  doc.setFont("helvetica", "bold");
  doc.text("Description", left, y);
  doc.text("Amount (RM)", 480, y, { align: "right" });
  y += 8;
  doc.line(left, y, 547, y);
  y += 20;
  doc.setFont("helvetica", "normal");

  if (invoice.lines && invoice.lines.length > 0) {
    invoice.lines.forEach((l) => {
      const label = l.description
        ? l.description
        : `${l.count} × ${l.duration} min lesson${invoice.period ? ` (${invoice.period})` : ""}`;
      const amount = l.description ? l.amount : l.subtotal;
      doc.text(label, left, y);
      doc.text(Number(amount).toFixed(2), 480, y, { align: "right" });
      y += 18;
    });
  } else {
    doc.text(invoice.description || "Piano lessons", left, y);
    doc.text(Number(invoice.total).toFixed(2), 480, y, { align: "right" });
    y += 18;
  }

  y += 10;
  doc.line(left, y, 547, y);
  y += 22;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(isPaid ? "Amount received" : "Total", left, y);
  doc.text(`RM ${Number(invoice.total).toFixed(2)}`, 480, y, { align: "right" });

  if (!isPaid && (biz.bank_name || biz.bank_account_number)) {
    y += 40;
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Payment details", left, y);
    doc.setFont("helvetica", "normal");
    y += 14;
    if (biz.bank_name) { doc.text(`Bank: ${biz.bank_name}`, left, y); y += 14; }
    if (biz.bank_account_name) { doc.text(`Account name: ${biz.bank_account_name}`, left, y); y += 14; }
    if (biz.bank_account_number) { doc.text(`Account number: ${biz.bank_account_number}`, left, y); y += 14; }
  }

  if (!isPaid && biz.payment_terms) {
    y += 20;
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(biz.payment_terms, left, y);
    doc.setTextColor(0);
  }
  if (isPaid) {
    y += 30;
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text("Thank you for your payment.", left, y);
    doc.setTextColor(0);
  }

  doc.save(`${isPaid ? "Receipt" : "Invoice"}-${invoice.number}.pdf`);
}

export default function InvoicesTab({ invoices, students, studentMap, appointments, businessSettings, onAddManual, onGenerateMonthly, onGenerateCentreInvoice, onMarkPaid, onMarkUnpaid, onRemove }) {
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [form, setForm] = useState({
    studentId: students[0]?.id || "",
    date: todayISO(),
    items: [{ description: "", amount: "" }],
  });
  const [genForm, setGenForm] = useState({ studentId: students[0]?.id || "", period: todayISO().slice(0, 7) });
  const [centreGenForm, setCentreGenForm] = useState({ centre: CENTRES[0], period: todayISO().slice(0, 7) });

  function updateItem(index, patch) {
    const items = form.items.map((it, i) => (i === index ? { ...it, ...patch } : it));
    setForm({ ...form, items });
  }
  function addItemRow() {
    setForm({ ...form, items: [...form.items, { description: "", amount: "" }] });
  }
  function removeItemRow(index) {
    setForm({ ...form, items: form.items.filter((_, i) => i !== index) });
  }
  const manualTotal = form.items.reduce((sum, it) => sum + (Number(it.amount) || 0), 0);

  function submitManual(e) {
    e.preventDefault();
    if (!form.studentId) return;
    const cleanItems = form.items
      .filter((it) => it.description.trim() || Number(it.amount) > 0)
      .map((it) => ({ description: it.description.trim() || "Item", amount: Number(it.amount) || 0 }));
    if (cleanItems.length === 0) return;
    onAddManual({
      student_id: form.studentId,
      lines: cleanItems,
      total: cleanItems.reduce((sum, it) => sum + it.amount, 0),
      date: form.date,
      status: "unpaid",
    });
    setForm({ studentId: form.studentId, date: todayISO(), items: [{ description: "", amount: "" }] });
  }

  function submitGenerate(e) {
    e.preventDefault();
    onGenerateMonthly(genForm.studentId, genForm.period);
  }

  function submitCentreGenerate(e) {
    e.preventDefault();
    onGenerateCentreInvoice(centreGenForm.centre, centreGenForm.period);
  }

  const sorted = [...invoices]
    .filter((i) => {
      if (!invoiceSearch.trim()) return true;
      const q = invoiceSearch.trim().toLowerCase();
      const studentName = studentMap[i.student_id]?.name || i.billed_to || "";
      return studentName.toLowerCase().includes(q) || i.number.toLowerCase().includes(q);
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  const preview = useMemo(() => {
    const eligible = appointments.filter(
      (a) => a.student_id === genForm.studentId && a.status === "completed" && !a.invoiced && a.date.slice(0, 7) === genForm.period
    );
    const byDuration = {};
    eligible.forEach((a) => {
      byDuration[a.duration] = (byDuration[a.duration] || 0) + 1;
    });
    return { count: eligible.length, byDuration };
  }, [appointments, genForm]);

  const centrePreview = useMemo(() => {
    const centreStudentIds = new Set(students.filter((s) => s.centre === centreGenForm.centre).map((s) => s.id));
    const eligible = appointments.filter(
      (a) => centreStudentIds.has(a.student_id) && a.status === "completed" && !a.invoiced && a.date.slice(0, 7) === centreGenForm.period
    );
    const byDuration = {};
    const byStudentCount = {};
    eligible.forEach((a) => {
      byDuration[a.duration] = (byDuration[a.duration] || 0) + 1;
      byStudentCount[a.student_id] = (byStudentCount[a.student_id] || 0) + 1;
    });
    return { count: eligible.length, byDuration, studentCount: Object.keys(byStudentCount).length };
  }, [appointments, students, centreGenForm]);

  return (
    <div className="space-y-4">
      <SectionCard title="Generate monthly invoice">
        {students.length === 0 ? (
          <p className="text-sm text-[#8A8272]">Add a student first, on the Students tab.</p>
        ) : (
          <form onSubmit={submitGenerate} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Student">
                <SearchableSelect
                  options={students.map((s) => ({ value: s.id, label: s.name }))}
                  value={genForm.studentId}
                  onChange={(v) => setGenForm({ ...genForm, studentId: v })}
                  placeholder="Search student…"
                />
              </Field>
              <Field label="Month">
                <input type="month" className={inputCls} value={genForm.period} onChange={(e) => setGenForm({ ...genForm, period: e.target.value })} />
              </Field>
            </div>
            {preview.count === 0 ? (
              <p className="text-sm text-[#8A8272]">No un-invoiced completed lessons for that student in that month yet.</p>
            ) : (
              <div className="text-sm text-[#5C564A]">
                Will invoice: {Object.entries(preview.byDuration).map(([d, c]) => `${c} × ${d} min`).join(", ")}
              </div>
            )}
            <Button type="submit">Generate invoice</Button>
          </form>
        )}
      </SectionCard>

      <SectionCard title="Bill a whole centre">
        <p className="text-sm text-[#8A8272] mb-3">
          One invoice covering every student tagged to a centre for the month — instead of billing them one by one.
          Tag students with a centre on the Students tab first.
        </p>
        <form onSubmit={submitCentreGenerate} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Centre">
              <select className={inputCls} value={centreGenForm.centre} onChange={(e) => setCentreGenForm({ ...centreGenForm, centre: e.target.value })}>
                {CENTRES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Month">
              <input type="month" className={inputCls} value={centreGenForm.period} onChange={(e) => setCentreGenForm({ ...centreGenForm, period: e.target.value })} />
            </Field>
          </div>
          {centrePreview.count === 0 ? (
            <p className="text-sm text-[#8A8272]">No un-invoiced completed lessons for that centre in that month yet.</p>
          ) : (
            <div className="text-sm text-[#5C564A]">
              Will invoice: {Object.entries(centrePreview.byDuration).map(([d, c]) => `${c} × ${d} min`).join(", ")} — across {centrePreview.studentCount} student(s)
            </div>
          )}
          <Button type="submit">Generate centre invoice</Button>
        </form>
      </SectionCard>

      <SectionCard title="Manual invoice">
        {students.length === 0 ? (
          <p className="text-sm text-[#8A8272]">Add a student first, on the Students tab.</p>
        ) : (
          <form onSubmit={submitManual} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Student">
                <SearchableSelect
                  options={students.map((s) => ({ value: s.id, label: s.name }))}
                  value={form.studentId}
                  onChange={(v) => setForm({ ...form, studentId: v })}
                  placeholder="Search student…"
                />
              </Field>
              <Field label="Date">
                <input type="date" className={inputCls} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </Field>
            </div>

            <div className="space-y-2">
              {form.items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_140px_auto] gap-2 items-center">
                  <input
                    className={inputCls}
                    placeholder="Description — e.g. Piano lessons, July"
                    value={item.description}
                    onChange={(e) => updateItem(idx, { description: e.target.value })}
                  />
                  <input
                    type="number"
                    className={inputCls}
                    placeholder="Amount (RM)"
                    value={item.amount}
                    onChange={(e) => updateItem(idx, { amount: e.target.value })}
                  />
                  {form.items.length > 1 && (
                    <button type="button" onClick={() => removeItemRow(idx)} className="text-xs text-[#6B2C3E] hover:underline">Remove</button>
                  )}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <button type="button" onClick={addItemRow} className="text-xs text-[#1C1B1A] hover:underline">+ Add another item</button>
              <div className="text-sm" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>Total: {money(manualTotal)}</div>
            </div>

            <Button type="submit">Create invoice</Button>
          </form>
        )}
      </SectionCard>

      <SectionCard
        title={`Invoices (${invoices.length})`}
        action={<SearchBox value={invoiceSearch} onChange={setInvoiceSearch} placeholder="Search by student or invoice #…" />}
      >
        {sorted.length === 0 ? (
          <p className="text-sm text-[#8A8272]">No invoices yet.</p>
        ) : (
          <div className="divide-y divide-[#EDE7DB]">
            {sorted.map((i) => (
              <div key={i.id} className="flex items-center justify-between py-2.5">
                <div>
                  <div className="text-sm font-medium">
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{i.number}</span> — {studentMap[i.student_id]?.name || i.billed_to || "Unknown"}
                  </div>
                  <div className="text-xs text-[#8A8272]">
                    {i.lines
                      ? i.lines.map((l) => l.description ? `${l.description} (${money(l.amount)})` : `${l.count} × ${l.duration} min`).join(" + ") + (i.period ? ` · ${i.period}` : "")
                      : `${i.description} · ${i.date}`}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace" }} className="text-sm">{money(i.total)}</span>
                  {i.status === "paid" ? (
                    <>
                      <span className="text-[11px] px-2 py-0.5 rounded-full text-[#4C5A43] bg-[#E7EDE1]">Paid {i.paid_date}</span>
                      <button onClick={() => onMarkUnpaid(i.id)} className="text-xs text-[#8A8272] hover:underline">Undo</button>
                    </>
                  ) : (
                    <button onClick={() => onMarkPaid(i.id)} className="text-xs text-[#4C5A43] hover:underline">Mark paid</button>
                  )}
                  <button onClick={() => downloadInvoicePdf(i, studentMap[i.student_id], businessSettings)} className="text-xs text-[#1C1B1A] hover:underline">
                    {i.status === "paid" ? "Download Receipt" : "Download Invoice"}
                  </button>
                  <button onClick={() => onRemove(i.id)} className="text-xs text-[#8A8272] hover:underline">Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
