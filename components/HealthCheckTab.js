import { useState } from "react";
import { SectionCard, Button } from "./ui";
import { supabase } from "../lib/supabaseClient";

// Idempotent per-table fix SQL — safe to run any number of times, whether
// the table is entirely missing, or just its policy/grant is missing.
// (Uses "drop policy if exists" first so re-running never errors with
// "policy already exists", which is the exact issue we've hit before.)
const TABLE_FIX_SQL = {
  allowed_users: `create table if not exists allowed_users (
  email text primary key
);
alter table allowed_users enable row level security;
drop policy if exists "read own allowlist row" on allowed_users;
create policy "read own allowlist row" on allowed_users for select using (email = auth.email());
grant select, insert, update, delete on allowed_users to authenticated;`,

  students: `create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rate numeric not null default 0,
  notes text default '',
  age int,
  grade text default '',
  course text default '',
  centre text default '',
  lesson_day text default '',
  lesson_time text default '',
  lesson_duration int,
  rate_type text default 'lesson',
  status text default 'active',
  created_at timestamptz default now()
);
alter table students enable row level security;
drop policy if exists "allowed users full access" on students;
create policy "allowed users full access" on students for all
  using (exists (select 1 from allowed_users au where au.email = auth.email()))
  with check (exists (select 1 from allowed_users au where au.email = auth.email()));
grant select, insert, update, delete on students to authenticated;`,

  services: `create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  label text not null,
  duration int not null,
  rate numeric not null default 0,
  created_at timestamptz default now()
);
alter table services enable row level security;
drop policy if exists "allowed users full access" on services;
create policy "allowed users full access" on services for all
  using (exists (select 1 from allowed_users au where au.email = auth.email()))
  with check (exists (select 1 from allowed_users au where au.email = auth.email()));
grant select, insert, update, delete on services to authenticated;`,

  appointments: `create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) on delete cascade,
  date date not null,
  time text not null,
  duration int not null default 60,
  location text default 'Play Studio',
  rate numeric not null default 0,
  service_id uuid references services(id) on delete set null,
  service_code text,
  status text not null default 'scheduled',
  invoiced boolean not null default false,
  series_id uuid,
  notes text default '',
  rescheduled_from uuid references appointments(id) on delete set null,
  created_at timestamptz default now()
);
alter table appointments enable row level security;
drop policy if exists "allowed users full access" on appointments;
create policy "allowed users full access" on appointments for all
  using (exists (select 1 from allowed_users au where au.email = auth.email()))
  with check (exists (select 1 from allowed_users au where au.email = auth.email()));
grant select, insert, update, delete on appointments to authenticated;`,

  invoices: `create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  number text not null,
  student_id uuid references students(id) on delete cascade,
  billed_to text,
  description text,
  total numeric not null default 0,
  date date not null,
  period text,
  lines jsonb,
  status text not null default 'unpaid',
  paid_date date,
  created_at timestamptz default now()
);
alter table invoices enable row level security;
drop policy if exists "allowed users full access" on invoices;
create policy "allowed users full access" on invoices for all
  using (exists (select 1 from allowed_users au where au.email = auth.email()))
  with check (exists (select 1 from allowed_users au where au.email = auth.email()));
grant select, insert, update, delete on invoices to authenticated;`,

  materials: `create table if not exists materials (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  notes text default '',
  cost_mode text not null default 'batch',
  batch_cost numeric not null default 0,
  batch_quantity int not null default 0,
  per_unit_cost numeric not null default 0,
  created_at timestamptz default now()
);
alter table materials enable row level security;
drop policy if exists "allowed users full access" on materials;
create policy "allowed users full access" on materials for all
  using (exists (select 1 from allowed_users au where au.email = auth.email()))
  with check (exists (select 1 from allowed_users au where au.email = auth.email()));
grant select, insert, update, delete on materials to authenticated;`,

  material_sales: `create table if not exists material_sales (
  id uuid primary key default gen_random_uuid(),
  material_id uuid references materials(id) on delete cascade,
  student_id uuid references students(id) on delete set null,
  sale_type text not null default 'individual',
  quantity int not null default 1,
  unit_price numeric not null default 0,
  total numeric not null default 0,
  date date not null,
  created_at timestamptz default now()
);
alter table material_sales enable row level security;
drop policy if exists "allowed users full access" on material_sales;
create policy "allowed users full access" on material_sales for all
  using (exists (select 1 from allowed_users au where au.email = auth.email()))
  with check (exists (select 1 from allowed_users au where au.email = auth.email()));
grant select, insert, update, delete on material_sales to authenticated;`,

  business_settings: `create table if not exists business_settings (
  id text primary key default 'main',
  company_name text default '',
  address text default '',
  phone text default '',
  email text default '',
  bank_name text default '',
  bank_account_name text default '',
  bank_account_number text default '',
  license_info text default '',
  payment_terms text default '',
  logo_base64 text default '',
  updated_at timestamptz default now()
);
insert into business_settings (id) values ('main') on conflict do nothing;
alter table business_settings enable row level security;
drop policy if exists "allowed users full access" on business_settings;
create policy "allowed users full access" on business_settings for all
  using (exists (select 1 from allowed_users au where au.email = auth.email()))
  with check (exists (select 1 from allowed_users au where au.email = auth.email()));
grant select, insert, update, delete on business_settings to authenticated;`,

  unavailable_dates: `create table if not exists unavailable_dates (
  date date primary key,
  reason text default '',
  reason_type text default 'personal',
  created_at timestamptz default now()
);
alter table unavailable_dates enable row level security;
drop policy if exists "allowed users full access" on unavailable_dates;
create policy "allowed users full access" on unavailable_dates for all
  using (exists (select 1 from allowed_users au where au.email = auth.email()))
  with check (exists (select 1 from allowed_users au where au.email = auth.email()));
grant select, insert, update, delete on unavailable_dates to authenticated;`,

  expenses: `create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  amount numeric not null default 0,
  description text not null,
  category text not null default 'Other / Miscellaneous',
  paid_via text not null default 'Company',
  reimbursed boolean not null default false,
  reimbursed_date date,
  notes text default '',
  created_at timestamptz default now()
);
alter table expenses enable row level security;
drop policy if exists "allowed users full access" on expenses;
create policy "allowed users full access" on expenses for all
  using (exists (select 1 from allowed_users au where au.email = auth.email()))
  with check (exists (select 1 from allowed_users au where au.email = auth.email()));
grant select, insert, update, delete on expenses to authenticated;`,

  lesson_plan_items: `create table if not exists lesson_plan_items (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) on delete cascade,
  position int not null default 0,
  lesson_date date,
  topic text not null,
  remarks text default '',
  status text not null default 'planned',
  created_at timestamptz default now()
);
alter table lesson_plan_items enable row level security;
drop policy if exists "allowed users full access" on lesson_plan_items;
create policy "allowed users full access" on lesson_plan_items for all
  using (exists (select 1 from allowed_users au where au.email = auth.email()))
  with check (exists (select 1 from allowed_users au where au.email = auth.email()));
grant select, insert, update, delete on lesson_plan_items to authenticated;`,
};

// [table, primary select column, extra columns to verify exist, human label]
const TABLE_CHECKS = [
  ["allowed_users", "email", [], "Allowed users (login access list)"],
  ["students", "id", ["centre", "lesson_day", "lesson_time", "lesson_duration", "rate_type", "grade", "course", "status"], "Students"],
  ["services", "id", [], "Rates / grade codes"],
  ["appointments", "id", ["series_id", "notes", "rescheduled_from", "invoiced", "service_code"], "Calendar / appointments"],
  ["invoices", "id", ["billed_to", "lines", "period", "paid_date"], "Invoices"],
  ["materials", "id", [], "Materials"],
  ["material_sales", "id", [], "Material sales"],
  ["business_settings", "id", [], "Business settings"],
  ["unavailable_dates", "date", ["reason_type"], "Unavailable days"],
  ["expenses", "id", [], "Expenses"],
  ["lesson_plan_items", "id", ["lesson_date"], "Teaching plan"],
];

function ALTER_COLUMN_SQL(table, column) {
  // Best-effort single-column patch for when only one column is missing —
  // faster than re-running the whole table's fix block.
  const known = {
    "students.centre": "text default ''",
    "students.lesson_day": "text default ''",
    "students.lesson_time": "text default ''",
    "students.lesson_duration": "int",
    "students.rate_type": "text default 'lesson'",
    "students.grade": "text default ''",
    "students.course": "text default ''",
    "students.status": "text default 'active'",
    "appointments.series_id": "uuid",
    "appointments.notes": "text default ''",
    "appointments.rescheduled_from": "uuid references appointments(id) on delete set null",
    "appointments.invoiced": "boolean not null default false",
    "appointments.service_code": "text",
    "invoices.billed_to": "text",
    "invoices.lines": "jsonb",
    "invoices.period": "text",
    "invoices.paid_date": "date",
    "unavailable_dates.reason_type": "text default 'personal'",
    "lesson_plan_items.lesson_date": "date",
  };
  const type = known[`${table}.${column}`] || "text";
  return `alter table ${table} add column if not exists ${column} ${type};`;
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="text-xs text-[#1C1B1A] hover:underline whitespace-nowrap"
    >
      {copied ? "Copied!" : "Copy SQL"}
    </button>
  );
}

export default function HealthCheckTab({ userEmail }) {
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);
  const [businessSettingsFixed, setBusinessSettingsFixed] = useState(false);

  async function runChecks() {
    setRunning(true);
    const out = [];

    // Server config
    try {
      const res = await fetch("/api/health");
      const data = await res.json();
      out.push({
        name: "Anthropic API key (AI command bar & receipt scanning)",
        status: data.anthropicKeyConfigured ? "pass" : "warn",
        message: data.anthropicKeyConfigured
          ? "Configured on the server."
          : "Not set in Vercel yet — the AI command bar and receipt scanning won't work until it is. Everything else in the app is unaffected.",
      });
    } catch (e) {
      out.push({ name: "Server connection", status: "fail", message: `Couldn't reach the app's own server: ${String(e)}` });
    }

    // You're logged in and allowed — confirm it plainly
    out.push({ name: "Your account access", status: "pass", message: `Signed in as ${userEmail}, and on the allowed-users list (otherwise you wouldn't see this page).` });

    // Table + column checks
    for (const [table, pk, extraCols, label] of TABLE_CHECKS) {
      const { error } = await supabase.from(table).select(pk).limit(1);
      if (error) {
        const msg = error.message || "";
        if (msg.includes("does not exist") && msg.toLowerCase().includes("relation")) {
          out.push({
            name: label,
            status: "fail",
            message: `The "${table}" table doesn't exist yet in Supabase.`,
            fixSql: TABLE_FIX_SQL[table],
          });
        } else if (msg.toLowerCase().includes("permission") || error.code === "42501") {
          out.push({
            name: label,
            status: "fail",
            message: `The "${table}" table exists, but this app isn't allowed to read/write it (missing permissions).`,
            fixSql: TABLE_FIX_SQL[table],
          });
        } else {
          out.push({ name: label, status: "fail", message: `Unexpected error reading "${table}": ${msg}`, fixSql: TABLE_FIX_SQL[table] });
        }
        continue;
      }

      // Table is reachable — now check any columns that were added after the original table
      let missingCols = [];
      for (const col of extraCols) {
        const { error: colError } = await supabase.from(table).select(col).limit(1);
        if (colError && colError.message?.toLowerCase().includes("does not exist")) {
          missingCols.push(col);
        }
      }
      if (missingCols.length > 0) {
        out.push({
          name: label,
          status: "fail",
          message: `Missing column(s) on "${table}": ${missingCols.join(", ")}.`,
          fixSql: missingCols.map((c) => ALTER_COLUMN_SQL(table, c)).join("\n"),
        });
      } else {
        out.push({ name: label, status: "pass", message: "Table and columns look correct." });
      }
    }

    // business_settings row exists (separate from the table-level check above)
    const { data: bizRow } = await supabase.from("business_settings").select("id").eq("id", "main").maybeSingle();
    if (!bizRow) {
      out.push({
        name: "Business settings row",
        status: "fail",
        message: "The business_settings table exists, but its one settings row is missing (this holds your logo, bank info, etc.).",
        fixAction: "createBusinessSettingsRow",
      });
    } else {
      out.push({ name: "Business settings row", status: "pass", message: "Present." });
    }

    setResults(out);
    setRunning(false);
  }

  async function fixBusinessSettingsRow() {
    await supabase.from("business_settings").insert({ id: "main" });
    setBusinessSettingsFixed(true);
    runChecks();
  }

  const failCount = results ? results.filter((r) => r.status === "fail").length : 0;
  const warnCount = results ? results.filter((r) => r.status === "warn").length : 0;

  return (
    <div className="space-y-4">
      <SectionCard title="Health check">
        <p className="text-sm text-[#8A8272] mb-3">
          Runs real checks against your live database and server — catches the exact issues that used to need a back-and-forth to diagnose (a missing table, a missing column, a missing permission). For anything it can't fix directly, it gives you the exact SQL to paste into Supabase.
        </p>
        <Button onClick={runChecks} disabled={running}>{running ? "Checking…" : results ? "Run again" : "Run health check"}</Button>
        {results && (
          <p className="text-sm mt-2" style={{ color: failCount > 0 ? "#6B2C3E" : warnCount > 0 ? "#8A6D3B" : "#4C5A43" }}>
            {failCount > 0
              ? `${failCount} issue(s) found that need fixing.`
              : warnCount > 0
              ? `Everything critical is fine — ${warnCount} optional item to know about.`
              : "Everything checks out."}
          </p>
        )}
      </SectionCard>

      {results && (
        <SectionCard title="Results">
          <div className="space-y-3">
            {results.map((r, i) => (
              <div
                key={i}
                className="border rounded-md p-3"
                style={{
                  borderColor: r.status === "fail" ? "#6B2C3E" : r.status === "warn" ? "#8A6D3B" : "#E7E0D2",
                  background: r.status === "fail" ? "#F6EBEE" : r.status === "warn" ? "#F5EDDD" : "#FAF7F0",
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium">
                    {r.status === "pass" ? "✓" : r.status === "warn" ? "⚠" : "✗"} {r.name}
                  </div>
                  {r.fixSql && <CopyButton text={r.fixSql} />}
                  {r.fixAction === "createBusinessSettingsRow" && (
                    <Button onClick={fixBusinessSettingsRow}>{businessSettingsFixed ? "Created" : "Create it now"}</Button>
                  )}
                </div>
                <div className="text-xs text-[#5C564A] mt-1">{r.message}</div>
                {r.fixSql && (
                  <pre className="text-[10px] bg-white border border-[#E7E0D2] rounded mt-2 p-2 overflow-x-auto whitespace-pre-wrap">{r.fixSql}</pre>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
