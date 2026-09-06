-- Play Studio Manager — v37: add a 'staff' role (limited-scope admin)
-- Run this in Supabase SQL Editor. Safe to run more than once.
--
-- 'staff' is for someone who mostly contacts parents, arranges
-- replacements, adds students, and updates student data — the same daily
-- work as the Master account, but they only need Calendar, Teachers,
-- Students, Courses, and Replacements, not Payments, Settings, Health
-- Check, Invoices, Materials, or Reports.
--
-- IMPORTANT — the security model here is simple by design: 'staff' is
-- granted the exact same database permissions as 'admin' (is_admin() below
-- returns true for both), so every existing admin-only policy on every
-- table — including ones this role's screens never touch, like payments —
-- already works for them with zero new policies to write or maintain. The
-- actual restriction is enforced by the app only showing them five tabs,
-- not by the database. That's the right tradeoff for a trusted staff
-- member doing front-desk work, not for an account you don't fully trust —
-- if that's ever a concern, this needs real table-level RLS scoping
-- instead, which is a bigger change than this migration makes.

alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('admin','teacher','staff'));
alter table profiles add column if not exists name text;

create or replace function is_admin() returns boolean as $$
  select exists(select 1 from profiles where id = auth.uid() and role in ('admin','staff'));
$$ language sql security definer stable;
