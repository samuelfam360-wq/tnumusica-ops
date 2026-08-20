-- Play Studio Manager — v11: level-based teacher rates + monthly billing option
-- Run this AFTER schema.sql through schema_v10.sql, in Supabase SQL Editor.

alter table teacher_rates add column if not exists level text;

alter table students add column if not exists billing_type text not null default 'per_lesson'
  check (billing_type in ('per_lesson','per_month'));
alter table students add column if not exists monthly_rate numeric;
