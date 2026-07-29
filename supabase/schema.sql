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
  created_at timestamptz default now()
);

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  number text not null,
  student_id uuid references students(id) on delete cascade,
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
