-- Play Studio Manager — v17: let ANY instrument bill per month, not just the first
-- Run this AFTER schema.sql through schema_v16.sql, in Supabase SQL Editor.

alter table student_instruments add column if not exists billing_type text not null default 'per_lesson' check (billing_type in ('per_lesson','per_month'));
alter table student_instruments add column if not exists monthly_rate numeric;
