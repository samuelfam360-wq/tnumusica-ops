-- Play Studio Manager — v7: studio settings for invoices/receipts/vouchers
-- Run this AFTER schema.sql through schema_v6.sql, in Supabase SQL Editor.

create table if not exists studio_settings (
  id int primary key default 1,
  company_name text,
  license_no text,
  address text,
  phone text,
  email text,
  logo_data text,
  bank_name text,
  account_holder text,
  account_number text,
  invoice_terms text,
  updated_at timestamptz default now(),
  constraint studio_settings_singleton check (id = 1)
);

alter table studio_settings enable row level security;
create policy "authenticated read studio_settings" on studio_settings for select using (auth.role() = 'authenticated');
create policy "admin manage studio_settings" on studio_settings for all using (is_admin()) with check (is_admin());
