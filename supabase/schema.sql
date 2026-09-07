-- T'numusica Operations — database schema for Supabase
-- Run this in Supabase: Project > SQL Editor > New query > paste all > Run
-- Every statement here is safe to re-run (uses "if not exists" / "drop policy if exists"),
-- so running this again on an already-set-up project won't cause errors or data loss.

create extension if not exists "pgcrypto";

-- ---------- allowed_users ----------
create table if not exists allowed_users (
  email text primary key
);
alter table allowed_users enable row level security;
drop policy if exists "read own allowlist row" on allowed_users;
create policy "read own allowlist row" on allowed_users for select using (email = auth.email());
grant select, insert, update, delete on allowed_users to authenticated;

-- ---------- students ----------
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
  rate_type text default 'lesson',
  status text default 'active',
  joined_date date,
  stopped_date date,
  is_prospect boolean not null default false,
  first_month_billing text,
  first_month_factor numeric,
  created_at timestamptz default now()
);
alter table students enable row level security;
drop policy if exists "allowed users full access" on students;
create policy "allowed users full access" on students for all
  using (exists (select 1 from allowed_users au where au.email = auth.email()))
  with check (exists (select 1 from allowed_users au where au.email = auth.email()));
grant select, insert, update, delete on students to authenticated;

-- ---------- services ----------
create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  label text not null,
  duration int not null,
  rate numeric not null default 0,
  course text default '',
  grade text default '',
  percentage numeric not null default 100,
  monthly_rate numeric,
  created_at timestamptz default now()
);
alter table services enable row level security;
drop policy if exists "allowed users full access" on services;
create policy "allowed users full access" on services for all
  using (exists (select 1 from allowed_users au where au.email = auth.email()))
  with check (exists (select 1 from allowed_users au where au.email = auth.email()));
grant select, insert, update, delete on services to authenticated;
-- One-time carry-over: old rows had no Grade yet — start them off with
-- their existing Label, which was the closest equivalent. Safe to re-run;
-- only touches rows that still have no Grade set.
update services set grade = label where (grade = '' or grade is null) and label is not null;

-- ---------- appointments ----------
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
  is_trial boolean not null default false,
  is_extra boolean not null default false,
  created_at timestamptz default now()
);
alter table appointments enable row level security;
drop policy if exists "allowed users full access" on appointments;
create policy "allowed users full access" on appointments for all
  using (exists (select 1 from allowed_users au where au.email = auth.email()))
  with check (exists (select 1 from allowed_users au where au.email = auth.email()));
grant select, insert, update, delete on appointments to authenticated;

-- ---------- invoices ----------
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
alter table invoices enable row level security;
drop policy if exists "allowed users full access" on invoices;
create policy "allowed users full access" on invoices for all
  using (exists (select 1 from allowed_users au where au.email = auth.email()))
  with check (exists (select 1 from allowed_users au where au.email = auth.email()));
grant select, insert, update, delete on invoices to authenticated;

-- ---------- materials ----------
create table if not exists materials (
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
grant select, insert, update, delete on materials to authenticated;

-- ---------- material_sales ----------
create table if not exists material_sales (
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
grant select, insert, update, delete on material_sales to authenticated;

-- ---------- business_settings ----------
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
drop policy if exists "allowed users full access" on business_settings;
create policy "allowed users full access" on business_settings for all
  using (exists (select 1 from allowed_users au where au.email = auth.email()))
  with check (exists (select 1 from allowed_users au where au.email = auth.email()));
grant select, insert, update, delete on business_settings to authenticated;

-- ---------- unavailable_dates ----------
create table if not exists unavailable_dates (
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
grant select, insert, update, delete on unavailable_dates to authenticated;

-- ---------- expenses ----------
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
drop policy if exists "allowed users full access" on expenses;
create policy "allowed users full access" on expenses for all
  using (exists (select 1 from allowed_users au where au.email = auth.email()))
  with check (exists (select 1 from allowed_users au where au.email = auth.email()));
grant select, insert, update, delete on expenses to authenticated;

-- ---------- lesson_plan_items ----------
create table if not exists lesson_plan_items (
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
grant select, insert, update, delete on lesson_plan_items to authenticated;
