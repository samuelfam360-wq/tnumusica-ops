-- Run this once in Supabase: Project > SQL Editor > New query > paste all > Run

create extension if not exists "pgcrypto";

-- ---------- Access list ----------
-- Only emails in this table can read/write any data below.
-- Add or remove people by editing rows in this table (Table Editor, or SQL).
create table if not exists allowed_users (
  email text primary key
);

-- Seed with your own email so you're not locked out. Add more rows for
-- teammates, e.g. insert into allowed_users (email) values ('someone@x.com');
insert into allowed_users (email) values ('YOUR_EMAIL_HERE@example.com')
on conflict do nothing;

alter table allowed_users enable row level security;

-- Anyone signed in can check ONLY their own email against the list (needed
-- so the app can show "not authorized" correctly) — they cannot see the
-- rest of the list.
create policy "read own allowlist row"
  on allowed_users for select
  using (email = auth.email());

-- ---------- Core tables ----------
create table if not exists students (
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
  created_at timestamptz default now()
);

create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  label text not null,
  duration int not null,
  rate numeric not null default 0,
  created_at timestamptz default now()
);

create table if not exists appointments (
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

create table if not exists invoices (
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

-- ---------- Row-level security: only allowed_users can touch data ----------
alter table students enable row level security;
alter table services enable row level security;
alter table appointments enable row level security;
alter table invoices enable row level security;

create policy "allowed users full access" on students
  for all
  using (exists (select 1 from allowed_users au where au.email = auth.email()))
  with check (exists (select 1 from allowed_users au where au.email = auth.email()));

create policy "allowed users full access" on services
  for all
  using (exists (select 1 from allowed_users au where au.email = auth.email()))
  with check (exists (select 1 from allowed_users au where au.email = auth.email()));

create policy "allowed users full access" on appointments
  for all
  using (exists (select 1 from allowed_users au where au.email = auth.email()))
  with check (exists (select 1 from allowed_users au where au.email = auth.email()));

create policy "allowed users full access" on invoices
  for all
  using (exists (select 1 from allowed_users au where au.email = auth.email()))
  with check (exists (select 1 from allowed_users au where au.email = auth.email()));

grant select, insert, update, delete on allowed_users to authenticated;
grant select, insert, update, delete on students to authenticated;
grant select, insert, update, delete on services to authenticated;
grant select, insert, update, delete on appointments to authenticated;
grant select, insert, update, delete on invoices to authenticated;

-- ---------- Materials / teaching products ----------
create table if not exists materials (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  notes text default '',
  cost_mode text not null default 'batch', -- 'batch' or 'per_unit'
  batch_cost numeric not null default 0,
  batch_quantity int not null default 0,
  per_unit_cost numeric not null default 0,
  created_at timestamptz default now()
);

create table if not exists material_sales (
  id uuid primary key default gen_random_uuid(),
  material_id uuid references materials(id) on delete cascade,
  student_id uuid references students(id) on delete set null,
  sale_type text not null default 'individual', -- 'individual' or 'bulk'
  quantity int not null default 1,
  unit_price numeric not null default 0,
  total numeric not null default 0,
  date date not null,
  created_at timestamptz default now()
);

alter table materials enable row level security;
alter table material_sales enable row level security;

create policy "allowed users full access" on materials
  for all
  using (exists (select 1 from allowed_users au where au.email = auth.email()))
  with check (exists (select 1 from allowed_users au where au.email = auth.email()));

create policy "allowed users full access" on material_sales
  for all
  using (exists (select 1 from allowed_users au where au.email = auth.email()))
  with check (exists (select 1 from allowed_users au where au.email = auth.email()));

grant select, insert, update, delete on materials to authenticated;
grant select, insert, update, delete on material_sales to authenticated;

-- ---------- Business profile (used on invoice PDFs) ----------
create table if not exists business_settings (
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

create policy "allowed users full access" on business_settings
  for all
  using (exists (select 1 from allowed_users au where au.email = auth.email()))
  with check (exists (select 1 from allowed_users au where au.email = auth.email()));

grant select, insert, update, delete on business_settings to authenticated;

-- ---------- Unavailable days (teacher away / blocked out) ----------
create table if not exists unavailable_dates (
  date date primary key,
  reason text default '',
  reason_type text default 'personal',
  created_at timestamptz default now()
);

alter table unavailable_dates enable row level security;

create policy "allowed users full access" on unavailable_dates
  for all
  using (exists (select 1 from allowed_users au where au.email = auth.email()))
  with check (exists (select 1 from allowed_users au where au.email = auth.email()));

grant select, insert, update, delete on unavailable_dates to authenticated;

-- ---------- Expenses / claims (for accountant handoff) ----------
create table if not exists expenses (
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

create policy "allowed users full access" on expenses
  for all
  using (exists (select 1 from allowed_users au where au.email = auth.email()))
  with check (exists (select 1 from allowed_users au where au.email = auth.email()));

grant select, insert, update, delete on expenses to authenticated;
