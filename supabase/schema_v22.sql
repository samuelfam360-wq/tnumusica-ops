-- Play Studio Manager — v22: first/last name split + joining year
-- Run this in Supabase SQL Editor. Safe to run more than once.
--
-- `name` (not null) stays as-is and keeps working everywhere it's already
-- used (invoices, calendar, lists) — the app now computes it from
-- first_name + last_name whenever a student is added or edited, instead of
-- asking for one combined field.

alter table students add column if not exists first_name text;
alter table students add column if not exists last_name text;
alter table students add column if not exists joining_year int;
