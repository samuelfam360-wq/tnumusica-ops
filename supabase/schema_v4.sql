-- Play Studio Manager — v4: per-teacher, per-course pay rates
-- Run this AFTER schema.sql, schema_v2.sql, schema_v3.sql, in Supabase SQL Editor.

create table if not exists teacher_rates (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references teachers(id) on delete cascade,
  course text not null,
  pay_type text not null check (pay_type in ('flat','percent')),
  rate numeric not null default 0,
  created_at timestamptz default now(),
  unique (teacher_id, course)
);

alter table teacher_rates enable row level security;
create policy "authenticated read teacher_rates" on teacher_rates for select using (auth.role() = 'authenticated');
create policy "admin manage teacher_rates" on teacher_rates for all using (is_admin()) with check (is_admin());
