import { useState, useMemo } from "react";
import { jsPDF } from "jspdf";
import { SectionCard, Button, Field, inputCls, money, todayISO } from "./ui";

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
  doc.text(student?.name || "Unknown student", left, y);

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
      doc.text(`${l.count} × ${l.duration} min lesson${invoice.period ? ` (${invoice.period})` : ""}`, left, y);
      doc.text(l.subtotal.toFixed(2), 480, y, { align: "right" });
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

export default function InvoicesTab({ invoices, students, studentMap, appointments, businessSettings, onAddManual, onGenerateMonthly, onMarkPaid, onRemove }) {
  const [form, setForm] = useState({ studentId: students[0]?.id || "", description: "", amount: "", date: todayISO() });
  const [genForm, setGenForm] = useState({ studentId: students[0]?.id || "", period: todayISO().slice(0, 7) });

  function submitManual(e) {
    e.preventDefault();
    if (!form.studentId || !form.amount) return;
    onAddManual({
      student_id: form.studentId,
      description: form.description || "Piano lessons",
      total: Number(form.amount),
      date: form.date,
      status: "unpaid",
    });
    setForm({ ...form, description: "", amount: "" });
  }

  function submitGenerate(e) {
    e.preventDefault();
    onGenerateMonthly(genForm.studentId, genForm.period);
  }

  const sorted = [...invoices].sort((a, b) => b.date.localeCompare(a.date));

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

  return (
    <div className="space-y-4">
      <SectionCard title="Generate monthly invoice">
        {students.length === 0 ? (
          <p className="text-sm text-[#8A8272]">Add a student first, on the Students tab.</p>
        ) : (
          <form onSubmit={submitGenerate} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Student">
                <select className={inputCls} value={genForm.studentId} onChange={(e) => setGenForm({ ...genForm, studentId: e.target.value })}>
                  {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
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

      <SectionCard title="Manual invoice">
        {students.length === 0 ? (
          <p className="text-sm text-[#8A8272]">Add a student first, on the Students tab.</p>
        ) : (
          <form onSubmit={submitManual} className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
            <Field label="Student">
              <select className={inputCls} value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })}>
                {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Description">
              <input className={inputCls} placeholder="Piano lessons — July" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <Field label="Amount (RM)">
              <input type="number" className={inputCls} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </Field>
            <Field label="Date">
              <input type="date" className={inputCls} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </Field>
            <div className="col-span-2 sm:col-span-4">
              <Button type="submit">Create invoice</Button>
            </div>
          </form>
        )}
      </SectionCard>

      <SectionCard title={`Invoices (${invoices.length})`}>
        {sorted.length === 0 ? (
          <p className="text-sm text-[#8A8272]">No invoices yet.</p>
        ) : (
          <div className="divide-y divide-[#EDE7DB]">
            {sorted.map((i) => (
              <div key={i.id} className="flex items-center justify-between py-2.5">
                <div>
                  <div className="text-sm font-medium">
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{i.number}</span> — {studentMap[i.student_id]?.name || "Unknown"}
                  </div>
                  <div className="text-xs text-[#8A8272]">
                    {i.lines
                      ? i.lines.map((l) => `${l.count} × ${l.duration} min`).join(" + ") + (i.period ? ` · ${i.period}` : "")
                      : `${i.description} · ${i.date}`}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace" }} className="text-sm">{money(i.total)}</span>
                  {i.status === "paid" ? (
                    <span className="text-[11px] px-2 py-0.5 rounded-full text-[#4C5A43] bg-[#E7EDE1]">Paid {i.paid_date}</span>
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
