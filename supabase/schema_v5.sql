-- Play Studio Manager — v5: gender field + teaching plan entries
-- Run this AFTER schema.sql through schema_v4.sql, in Supabase SQL Editor.

alter table students add column if not exists gender text;

create table if not exists lesson_plans (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  date date not null,
  what_to_teach text not null,
  remarks text,
  created_at timestamptz default now()
);

alter table lesson_plans enable row level security;
create policy "authenticated read lesson_plans" on lesson_plans for select using (auth.role() = 'authenticated');
create policy "admin manage lesson_plans" on lesson_plans for all using (is_admin()) with check (is_admin());
