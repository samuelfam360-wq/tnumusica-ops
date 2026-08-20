-- Play Studio Manager — combined v15–v18
-- Safe to run as one script, and safe to run more than once.
-- Run this in Supabase SQL Editor.

-- v15: multiple instruments per student
create table if not exists student_instruments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  course text,
  level text,
  price numeric not null default 0,
  teacher_id uuid references teachers(id) on delete set null,
  permanent_day int,
  permanent_time text,
  duration_min int default 30,
  room text,
  created_at timestamptz default now()
);

alter table student_instruments enable row level security;

drop policy if exists "authenticated read student_instruments" on student_instruments;
create policy "authenticated read student_instruments" on student_instruments for select using (auth.role() = 'authenticated');

drop policy if exists "admin manage student_instruments" on student_instruments;
create policy "admin manage student_instruments" on student_instruments for all using (is_admin()) with check (is_admin());

-- v16: give the primary instrument (on students) the same shape
alter table students add column if not exists duration_min int default 30;
alter table students add column if not exists teacher_id uuid references teachers(id) on delete set null;
alter table students add column if not exists room text;

-- v17: let any instrument bill per month, not just the first
alter table student_instruments add column if not exists billing_type text not null default 'per_lesson' check (billing_type in ('per_lesson','per_month'));
alter table student_instruments add column if not exists monthly_rate numeric;

-- v18: fix "Courses taught" checkbox 400 error (course was NOT NULL)
alter table teacher_rates alter column course drop not null;
