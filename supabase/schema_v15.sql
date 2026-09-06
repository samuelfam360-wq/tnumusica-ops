-- Play Studio Manager — v15: multiple instruments per student
-- Run this AFTER schema.sql through schema_v14.sql, in Supabase SQL Editor.
--
-- The `students` row keeps being the student's *first* instrument (course,
-- level, billing_type, monthly_rate, price, permanent_day, permanent_time —
-- unchanged, still editable via "Edit student"). Every instrument added
-- after that lives here instead, each with its own level/rate/schedule/teacher
-- so it can be edited on its own. Only the primary instrument on `students`
-- supports "per month" billing for now — extra instruments are per-lesson.

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
create policy "authenticated read student_instruments" on student_instruments for select using (auth.role() = 'authenticated');
create policy "admin manage student_instruments" on student_instruments for all using (is_admin()) with check (is_admin());
