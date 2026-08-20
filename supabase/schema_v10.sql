-- Play Studio Manager — v10: course type + per-course levels
-- Run this AFTER schema.sql through schema_v9.sql, in Supabase SQL Editor.

alter table courses add column if not exists type text;

create table if not exists course_levels (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz default now()
);

alter table course_levels enable row level security;
create policy "authenticated read course_levels" on course_levels for select using (auth.role() = 'authenticated');
create policy "admin manage course_levels" on course_levels for all using (is_admin()) with check (is_admin());

alter table students add column if not exists level text;
