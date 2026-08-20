-- Play Studio Manager — v9: student status (paused/terminated/graduated) + expenses
-- Run this AFTER schema.sql through schema_v8.sql, in Supabase SQL Editor.

alter table students add column if not exists status text not null default 'active'
  check (status in ('active','paused','terminated','graduated'));

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  category text not null,
  amount numeric not null,
  notes text,
  created_at timestamptz default now()
);

alter table expenses enable row level security;
create policy "authenticated read expenses" on expenses for select using (auth.role() = 'authenticated');
create policy "admin manage expenses" on expenses for all using (is_admin()) with check (is_admin());
