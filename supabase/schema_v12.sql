-- Play Studio Manager — v12: student payment ledger
-- Run this AFTER schema.sql through schema_v11.sql, in Supabase SQL Editor.

create table if not exists student_payments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  date date not null,
  amount numeric not null,
  notes text,
  created_at timestamptz default now()
);

alter table student_payments enable row level security;
create policy "authenticated read student_payments" on student_payments for select using (auth.role() = 'authenticated');
create policy "admin manage student_payments" on student_payments for all using (is_admin()) with check (is_admin());
