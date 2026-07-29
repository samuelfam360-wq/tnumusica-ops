import { useState, useEffect } from "react";
import { SectionCard, Button, Field, inputCls } from "./ui";

export default function SettingsTab({ settings, onSave }) {
  const [form, setForm] = useState(settings);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  function handleLogoFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 400 * 1024) {
      alert("Please use a smaller image (under 400KB) — a simple logo, not a full-resolution photo.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm({ ...form, logo_base64: reader.result });
    reader.readAsDataURL(file);
  }

  function submit(e) {
    e.preventDefault();
    onSave(form);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  }

  return (
    <div className="space-y-4">
      <SectionCard title="About this page">
        <p className="text-sm text-[#5C564A]">
          Fill this in once — it's used to fill in your logo, contact details, bank info, and
          license number on every invoice PDF automatically.
        </p>
      </SectionCard>

      <form onSubmit={submit} className="space-y-4">
        <SectionCard title="Company details">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Company name">
              <input className={inputCls} value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
            </Field>
            <Field label="Trading / business license no.">
              <input className={inputCls} value={form.license_info} onChange={(e) => setForm({ ...form, license_info: e.target.value })} />
            </Field>
            <Field label="Address">
              <input className={inputCls} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </Field>
            <Field label="Phone">
              <input className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="Email">
              <input className={inputCls} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
          </div>
        </SectionCard>

        <SectionCard title="Logo">
          <div className="flex items-center gap-4">
            {form.logo_base64 ? (
              <img src={form.logo_base64} alt="Logo preview" className="h-16 border border-[#E7E0D2] rounded" />
            ) : (
              <div className="h-16 w-16 border border-dashed border-[#D8D0BE] rounded flex items-center justify-center text-xs text-[#8A8272]">
                No logo
              </div>
            )}
            <div className="flex flex-col gap-2">
              <input type="file" accept="image/*" onChange={handleLogoFile} className="text-sm" />
              {form.logo_base64 && (
                <button type="button" onClick={() => setForm({ ...form, logo_base64: "" })} className="text-xs text-[#6B2C3E] hover:underline text-left">
                  Remove logo
                </button>
              )}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Bank details">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Bank name">
              <input className={inputCls} value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} />
            </Field>
            <Field label="Account holder name">
              <input className={inputCls} value={form.bank_account_name} onChange={(e) => setForm({ ...form, bank_account_name: e.target.value })} />
            </Field>
            <Field label="Account number">
              <input className={inputCls} value={form.bank_account_number} onChange={(e) => setForm({ ...form, bank_account_number: e.target.value })} />
            </Field>
          </div>
        </SectionCard>

        <SectionCard title="Invoice terms (optional)">
          <Field label="Note shown at the bottom of every invoice">
            <input className={inputCls} placeholder="Payment due within 7 days" value={form.payment_terms} onChange={(e) => setForm({ ...form, payment_terms: e.target.value })} />
          </Field>
        </SectionCard>

        <div className="flex items-center gap-3">
          <Button type="submit">Save settings</Button>
          {savedFlash && <span className="text-sm text-[#4C5A43]">Saved.</span>}
        </div>
      </form>
    </div>
  );
}
