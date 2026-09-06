-- Play Studio Manager — v27: invoice due dates
-- Run this in Supabase SQL Editor. Safe to run more than once.

alter table invoices add column if not exists due_date date;
