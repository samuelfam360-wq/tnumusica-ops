-- Play Studio Manager — v2 additions (calendar, students, holidays)
-- Run this AFTER schema.sql, in Supabase SQL Editor.

alter table students add column if not exists age int;
alter table students add column if not exists grade text;
alter table students add column if not exists course text;
alter table students add column if not exists centre text;
alter table students add column if not exists notes text;
alter table students add column if not exists permanent_day int;
alter table students add column if not exists permanent_time time;

alter table lessons add column if not exists duration_min int not null default 30;
alter table lessons alter column teacher_id drop not null;

create table if not exists holidays (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  reason text,
  created_at timestamptz default now()
);

alter table holidays enable row level security;
create policy "authenticated read holidays" on holidays for select using (auth.role() = 'authenticated');
create policy "admin manage holidays" on holidays for all using (is_admin()) with check (is_admin());
