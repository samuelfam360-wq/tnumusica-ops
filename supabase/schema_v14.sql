-- Play Studio Manager — v14: real invoices (monthly-generated or manual, multi-line)
-- Run this AFTER schema.sql through schema_v13.sql, in Supabase SQL Editor.

create sequence if not exists invoice_no_seq start 1;

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no int not null default nextval('invoice_no_seq'),
  student_id uuid not null references students(id) on delete cascade,
  date date not null,
  month text,
  status text not null default 'unpaid' check (status in ('unpaid','paid')),
  paid_date date,
  total numeric not null default 0,
  created_at timestamptz default now()
);

create table if not exists invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  description text not null,
  amount numeric not null,
  sort_order int default 0
);

alter table invoices enable row level security;
alter table invoice_items enable row level security;
create policy "authenticated read invoices" on invoices for select using (auth.role() = 'authenticated');
create policy "admin manage invoices" on invoices for all using (is_admin()) with check (is_admin());
create policy "authenticated read invoice_items" on invoice_items for select using (auth.role() = 'authenticated');
create policy "admin manage invoice_items" on invoice_items for all using (is_admin()) with check (is_admin());

-- link a recorded student payment back to the invoice it settled, so marking
-- an invoice paid/unpaid can keep the balance ledger in sync automatically
alter table student_payments add column if not exists invoice_id uuid references invoices(id) on delete set null;
