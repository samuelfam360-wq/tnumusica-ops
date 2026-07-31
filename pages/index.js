import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import Auth from "../components/Auth";
import CalendarTab from "../components/CalendarTab";
import StudentsTab from "../components/StudentsTab";
import RatesTab from "../components/RatesTab";
import IncomeTab from "../components/IncomeTab";
import InvoicesTab from "../components/InvoicesTab";
import MaterialsTab from "../components/MaterialsTab";
import SettingsTab from "../components/SettingsTab";
import ExpensesTab from "../components/ExpensesTab";
import AICommandBar from "../components/AICommandBar";
import { KeyNav, StatCard, PianoMark, money, todayISO } from "../components/ui";

export default function Home() {
  const [session, setSession] = useState(undefined); // undefined = loading, null = signed out
  const [authorized, setAuthorized] = useState(null); // null = checking, true/false once known
  const [tab, setTab] = useState("calendar");

  const [students, setStudents] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [services, setServices] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [materialSales, setMaterialSales] = useState([]);
  const [businessSettings, setBusinessSettings] = useState(null);
  const [unavailableDates, setUnavailableDates] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [dataLoaded, setDataLoaded] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    (async () => {
      const { data } = await supabase
        .from("allowed_users")
        .select("email")
        .eq("email", session.user.email)
        .maybeSingle();
      setAuthorized(!!data);
    })();
  }, [session]);

  async function refetchAll() {
    const [s, a, inv, svc, mat, matSales, biz, unavail, exp] = await Promise.all([
      supabase.from("students").select("*").order("name"),
      supabase.from("appointments").select("*").order("date").order("time"),
      supabase.from("invoices").select("*").order("date", { ascending: false }),
      supabase.from("services").select("*"),
      supabase.from("materials").select("*").order("name"),
      supabase.from("material_sales").select("*").order("date", { ascending: false }),
      supabase.from("business_settings").select("*").eq("id", "main").maybeSingle(),
      supabase.from("unavailable_dates").select("*"),
      supabase.from("expenses").select("*").order("date", { ascending: false }),
    ]);
    setStudents(s.data || []);
    setAppointments(a.data || []);
    setInvoices(inv.data || []);
    setServices(svc.data || []);
    setMaterials(mat.data || []);
    setMaterialSales(matSales.data || []);
    setBusinessSettings(biz.data || {
      id: "main", company_name: "", address: "", phone: "", email: "",
      bank_name: "", bank_account_name: "", bank_account_number: "",
      license_info: "", payment_terms: "", logo_base64: "",
    });
    setUnavailableDates(unavail.data || []);
    setExpenses(exp.data || []);
    setDataLoaded(true);
  }

  useEffect(() => {
    if (session && authorized) refetchAll();
  }, [session, authorized]);

  const studentMap = useMemo(() => {
    const m = {};
    students.forEach((s) => (m[s.id] = s));
    return m;
  }, [students]);

  // ---- Students ----
  async function addStudent(payload) {
    await supabase.from("students").insert(payload);
    refetchAll();
  }
  async function updateStudent(id, patch) {
    await supabase.from("students").update(patch).eq("id", id);
    refetchAll();
  }
  async function removeStudent(id) {
    await supabase.from("students").delete().eq("id", id);
    refetchAll();
  }

  // ---- Services / rates ----
  async function addService(payload) {
    await supabase.from("services").insert(payload);
    refetchAll();
  }
  async function updateService(id, patch) {
    await supabase.from("services").update(patch).eq("id", id);
    refetchAll();
  }
  async function removeService(id) {
    await supabase.from("services").delete().eq("id", id);
    refetchAll();
  }

  // ---- Appointments ----
  async function addAppointment(payload) {
    await supabase.from("appointments").insert(payload);
    refetchAll();
  }
  async function setAppointmentStatus(id, status) {
    await supabase.from("appointments").update({ status }).eq("id", id);
    refetchAll();
  }
  async function updateAppointment(id, patch) {
    await supabase.from("appointments").update(patch).eq("id", id);
    refetchAll();
  }
  async function updateAppointmentSeries(seriesId, patch) {
    await supabase.from("appointments").update(patch).eq("series_id", seriesId);
    refetchAll();
  }
  async function bulkUpdateAppointments(updates) {
    // updates: [{ id, patch }] — each lesson can get its own patch (e.g. a shifted date)
    await Promise.all(updates.map(({ id, patch }) => supabase.from("appointments").update(patch).eq("id", id)));
    refetchAll();
  }
  async function rescheduleAppointment(original, { reason, slots }) {
    await supabase
      .from("appointments")
      .update({ status: "rescheduled", notes: reason ? `${original.notes ? original.notes + " — " : ""}${reason}` : original.notes })
      .eq("id", original.id);
    await supabase.from("appointments").insert(
      slots.map((slot) => ({
        student_id: original.student_id,
        date: slot.date,
        time: slot.time,
        duration: slot.duration,
        location: original.location,
        rate: slot.rate,
        service_id: original.service_id,
        service_code: original.service_code,
        status: "scheduled",
        invoiced: false,
        series_id: null,
        notes: reason,
        rescheduled_from: original.id,
      }))
    );
    refetchAll();
  }
  async function removeAppointment(id) {
    await supabase.from("appointments").delete().eq("id", id);
    refetchAll();
  }

  // ---- Invoices ----
  function nextInvoiceNumber() {
    return "INV-" + String(invoices.length + 1).padStart(4, "0");
  }
  async function addManualInvoice(payload) {
    await supabase.from("invoices").insert({ ...payload, number: nextInvoiceNumber(), paid_date: null });
    refetchAll();
  }
  async function generateMonthlyInvoice(studentId, period) {
    const eligible = appointments.filter(
      (a) => a.student_id === studentId && a.status === "completed" && !a.invoiced && a.date.slice(0, 7) === period
    );
    if (eligible.length === 0) return;

    const byDuration = {};
    eligible.forEach((a) => {
      const d = a.duration;
      if (!byDuration[d]) byDuration[d] = { duration: d, count: 0, subtotal: 0 };
      byDuration[d].count += 1;
      byDuration[d].subtotal += Number(a.rate) || 0;
    });
    const lines = Object.values(byDuration).sort((x, y) => x.duration - y.duration);
    const total = lines.reduce((sum, l) => sum + l.subtotal, 0);

    await supabase.from("invoices").insert({
      number: nextInvoiceNumber(),
      student_id: studentId,
      period,
      lines,
      total,
      date: todayISO(),
      status: "unpaid",
      paid_date: null,
    });
    await supabase
      .from("appointments")
      .update({ invoiced: true })
      .in("id", eligible.map((e) => e.id));
    refetchAll();
  }

  async function generateCentreInvoice(centre, period) {
    const centreStudentIds = new Set(students.filter((s) => s.centre === centre).map((s) => s.id));
    const eligible = appointments.filter(
      (a) => centreStudentIds.has(a.student_id) && a.status === "completed" && !a.invoiced && a.date.slice(0, 7) === period
    );
    if (eligible.length === 0) return;

    const byDuration = {};
    eligible.forEach((a) => {
      const d = a.duration;
      if (!byDuration[d]) byDuration[d] = { duration: d, count: 0, subtotal: 0 };
      byDuration[d].count += 1;
      byDuration[d].subtotal += Number(a.rate) || 0;
    });
    const lines = Object.values(byDuration).sort((x, y) => x.duration - y.duration);
    const total = lines.reduce((sum, l) => sum + l.subtotal, 0);

    await supabase.from("invoices").insert({
      number: nextInvoiceNumber(),
      student_id: null,
      billed_to: centre,
      period,
      lines,
      total,
      date: todayISO(),
      status: "unpaid",
      paid_date: null,
    });
    await supabase
      .from("appointments")
      .update({ invoiced: true })
      .in("id", eligible.map((e) => e.id));
    refetchAll();
  }
  async function markInvoicePaid(id) {
    await supabase.from("invoices").update({ status: "paid", paid_date: todayISO() }).eq("id", id);
    refetchAll();
  }
  async function markInvoiceUnpaid(id) {
    await supabase.from("invoices").update({ status: "unpaid", paid_date: null }).eq("id", id);
    refetchAll();
  }
  async function removeInvoice(id) {
    await supabase.from("invoices").delete().eq("id", id);
    refetchAll();
  }

  // ---- Materials ----
  async function addMaterial(payload) {
    await supabase.from("materials").insert(payload);
    refetchAll();
  }
  async function removeMaterial(id) {
    await supabase.from("materials").delete().eq("id", id);
    refetchAll();
  }
  async function addMaterialSale(payload) {
    await supabase.from("material_sales").insert(payload);
    refetchAll();
  }
  async function removeMaterialSale(id) {
    await supabase.from("material_sales").delete().eq("id", id);
    refetchAll();
  }

  async function addExpense(payload) {
    await supabase.from("expenses").insert(payload);
    refetchAll();
  }
  async function updateExpense(id, patch) {
    await supabase.from("expenses").update(patch).eq("id", id);
    refetchAll();
  }
  async function removeExpense(id) {
    await supabase.from("expenses").delete().eq("id", id);
    refetchAll();
  }

  async function markUnavailable(date, reason) {
    await supabase.from("unavailable_dates").upsert({ date, reason: reason || "" });
    refetchAll();
  }
  async function unmarkUnavailable(date) {
    await supabase.from("unavailable_dates").delete().eq("date", date);
    refetchAll();
  }

  async function saveBusinessSettings(payload) {
    await supabase.from("business_settings").upsert({ ...payload, id: "main" });
    refetchAll();
  }

  // ---- AI command bar actions ----
  async function applyAIActions(actions) {
    const findStudent = (name) =>
      students.find((s) => s.name.toLowerCase() === String(name || "").toLowerCase());

    for (const act of actions) {
      switch (act.type) {
        case "add_student": {
          if (!findStudent(act.name)) {
            await supabase.from("students").insert({ name: act.name, rate: Number(act.rate) || 0, notes: act.notes || "" });
          }
          break;
        }
        case "update_rate": {
          const s = findStudent(act.studentName);
          if (s) await supabase.from("students").update({ rate: Number(act.rate) || 0 }).eq("id", s.id);
          break;
        }
        case "remove_student": {
          const s = findStudent(act.studentName);
          if (s) await supabase.from("students").delete().eq("id", s.id);
          break;
        }
        case "add_appointment": {
          let s = findStudent(act.studentName);
          if (!s) {
            const { data } = await supabase
              .from("students")
              .insert({ name: act.studentName, rate: Number(act.rate) || 0 })
              .select()
              .single();
            s = data;
          }
          await supabase.from("appointments").insert({
            student_id: s.id,
            date: act.date,
            time: act.time || "15:00",
            duration: Number(act.duration) || 60,
            location: ["Play Studio", "Xecleration", "Online", "Other"].includes(act.location) ? act.location : "Play Studio",
            rate: act.rate != null ? Number(act.rate) : s.rate,
            status: "scheduled",
            invoiced: false,
          });
          break;
        }
        case "set_appointment_status": {
          const s = findStudent(act.studentName);
          if (s) {
            let q = supabase.from("appointments").update({ status: act.status }).eq("student_id", s.id).eq("date", act.date);
            if (act.time) q = q.eq("time", act.time);
            await q;
          }
          break;
        }
        case "remove_appointment": {
          const s = findStudent(act.studentName);
          if (s) {
            let q = supabase.from("appointments").delete().eq("student_id", s.id).eq("date", act.date);
            if (act.time) q = q.eq("time", act.time);
            await q;
          }
          break;
        }
        case "add_invoice": {
          const s = findStudent(act.studentName);
          if (s) {
            await supabase.from("invoices").insert({
              number: nextInvoiceNumber(),
              student_id: s.id,
              description: act.description || "Piano lessons",
              total: Number(act.amount) || 0,
              date: act.date || todayISO(),
              status: "unpaid",
              paid_date: null,
            });
          }
          break;
        }
        case "mark_invoice_paid": {
          const s = act.studentName ? findStudent(act.studentName) : null;
          if (act.invoiceNumber) {
            await supabase.from("invoices").update({ status: "paid", paid_date: todayISO() }).eq("number", act.invoiceNumber);
          } else if (s) {
            await supabase.from("invoices").update({ status: "paid", paid_date: todayISO() }).eq("student_id", s.id).eq("status", "unpaid");
          }
          break;
        }
        default:
          break;
      }
    }
    await refetchAll();
  }

  // ---- Render states ----
  if (session === undefined) {
    return <LoadingScreen />;
  }
  if (!session) {
    return <Auth />;
  }
  if (authorized === null) {
    return <LoadingScreen />;
  }
  if (authorized === false) {
    return <NotAuthorized email={session.user.email} />;
  }
  if (!dataLoaded) {
    return <LoadingScreen />;
  }

  const thisMonth = todayISO().slice(0, 7);
  const monthIncomeFromLessons = appointments
    .filter((a) => a.status === "completed" && a.date.slice(0, 7) === thisMonth)
    .reduce((sum, a) => sum + (Number(a.rate) || 0), 0);
  const unpaidInvoicesTotal = invoices
    .filter((i) => i.status === "unpaid")
    .reduce((sum, i) => sum + (Number(i.total) || 0), 0);
  const upcomingCount = appointments.filter(
    (a) => a.status !== "completed" && a.status !== "cancelled" && a.status !== "rescheduled" && a.date >= todayISO()
  ).length;

  const materialMapForStats = {};
  materials.forEach((m) => (materialMapForStats[m.id] = m));
  function costPerUnitForStats(m) {
    if (!m) return 0;
    return m.cost_mode === "batch" ? (m.batch_quantity > 0 ? m.batch_cost / m.batch_quantity : 0) : m.per_unit_cost;
  }
  const monthMaterialSales = materialSales.filter((s) => s.date.slice(0, 7) === thisMonth);
  const monthMaterialsRevenue = monthMaterialSales.reduce((sum, s) => sum + Number(s.total), 0);
  const monthMaterialsCost = monthMaterialSales.reduce((sum, s) => sum + costPerUnitForStats(materialMapForStats[s.material_id]) * s.quantity, 0);
  const monthMaterialsProfit = monthMaterialsRevenue - monthMaterialsCost;

  return (
    <div className="min-h-screen bg-[#FAF7F0]">
      <header className="border-b border-[#1C1B1A] bg-[#FAF7F0] sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PianoMark />
            <div>
              <div className="text-xl leading-none" style={{ fontFamily: "'Fraunces', serif", fontWeight: 600 }}>T'numusica</div>
              <div className="text-[11px] tracking-wide text-[#8A8272] uppercase mt-0.5">Operations</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-[#8A8272]">{session.user.email}</span>
            <button onClick={() => supabase.auth.signOut()} className="text-xs text-[#6B2C3E] hover:underline">Sign out</button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 py-6 space-y-6">
        <div className="flex flex-wrap gap-3">
          <StatCard label="This month, lessons" value={money(monthIncomeFromLessons)} accent="#7A8B6F" />
          <StatCard label="This month, materials" value={money(monthMaterialsProfit)} accent={monthMaterialsProfit >= 0 ? "#7A8B6F" : "#6B2C3E"} />
          <StatCard label="Unpaid invoices" value={money(unpaidInvoicesTotal)} accent="#6B2C3E" />
          <StatCard label="Upcoming lessons" value={upcomingCount} />
          <StatCard label="Active students" value={students.length} />
        </div>

        <AICommandBar students={students} appointments={appointments} invoices={invoices} onApply={applyAIActions} />

        <KeyNav
          tabs={[
            { id: "calendar", label: "Calendar" },
            { id: "students", label: "Students" },
            { id: "rates", label: "Rates" },
            { id: "materials", label: "Materials" },
            { id: "income", label: "Income" },
            { id: "invoices", label: "Invoices" },
            { id: "expenses", label: "Expenses" },
            { id: "settings", label: "Settings" },
          ]}
          active={tab}
          onChange={setTab}
        />

        {tab === "calendar" && (
          <CalendarTab
            appointments={appointments}
            students={students}
            studentMap={studentMap}
            services={services}
            unavailableDates={unavailableDates}
            onMarkUnavailable={markUnavailable}
            onUnmarkUnavailable={unmarkUnavailable}
            onAdd={addAppointment}
            onUpdate={updateAppointment}
            onUpdateSeries={updateAppointmentSeries}
            onBulkUpdate={bulkUpdateAppointments}
            onReschedule={rescheduleAppointment}
            onSetStatus={setAppointmentStatus}
            onRemove={removeAppointment}
          />
        )}
        {tab === "students" && (
          <StudentsTab
            students={students}
            appointments={appointments}
            services={services}
            onAdd={addStudent}
            onUpdate={updateStudent}
            onRemove={removeStudent}
            onSetAppointmentStatus={setAppointmentStatus}
            onUpdateAppointment={updateAppointment}
            onReschedule={rescheduleAppointment}
            onRemoveAppointment={removeAppointment}
          />
        )}
        {tab === "rates" && (
          <RatesTab services={services} onAdd={addService} onUpdate={updateService} onRemove={removeService} />
        )}
        {tab === "materials" && (
          <MaterialsTab
            materials={materials}
            sales={materialSales}
            students={students}
            studentMap={studentMap}
            onAddMaterial={addMaterial}
            onRemoveMaterial={removeMaterial}
            onAddSale={addMaterialSale}
            onRemoveSale={removeMaterialSale}
          />
        )}
        {tab === "income" && (
          <IncomeTab appointments={appointments} invoices={invoices} studentMap={studentMap} materials={materials} materialSales={materialSales} expenses={expenses} />
        )}
        {tab === "invoices" && (
          <InvoicesTab
            invoices={invoices}
            students={students}
            studentMap={studentMap}
            appointments={appointments}
            businessSettings={businessSettings}
            onAddManual={addManualInvoice}
            onGenerateMonthly={generateMonthlyInvoice}
            onGenerateCentreInvoice={generateCentreInvoice}
            onMarkPaid={markInvoicePaid}
            onMarkUnpaid={markInvoiceUnpaid}
            onRemove={removeInvoice}
          />
        )}
        {tab === "expenses" && (
          <ExpensesTab expenses={expenses} onAdd={addExpense} onUpdate={updateExpense} onRemove={removeExpense} />
        )}
        {tab === "settings" && (
          <SettingsTab settings={businessSettings} onSave={saveBusinessSettings} />
        )}
      </main>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAF7F0]">
      <span className="text-[#8A8272]">Loading…</span>
    </div>
  );
}

function NotAuthorized({ email }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAF7F0] px-4">
      <div className="max-w-sm w-full bg-white border border-[#E7E0D2] rounded-lg p-6 text-center space-y-3">
        <div className="text-lg" style={{ fontFamily: "'Fraunces', serif", fontWeight: 600 }}>Not authorized</div>
        <p className="text-sm text-[#5C564A]">
          <span className="font-medium">{email}</span> isn't on the access list yet. Ask the studio owner to add it in Supabase, under the allowed_users table.
        </p>
        <button onClick={() => supabase.auth.signOut()} className="text-xs text-[#6B2C3E] hover:underline">Sign out</button>
      </div>
    </div>
  );
}
