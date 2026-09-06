-- Play Studio Manager — v29: server-side throttle for the schedule auto-top-up
-- Run this in Supabase SQL Editor. Safe to run more than once.
--
-- Why this exists: the auto-top-up's "have I run today" check used to live
-- in each browser's localStorage, which is scoped per-domain. With two
-- separate live deployments pointed at the same database, each one kept its
-- own separate flag and would both independently run a full top-up, causing
-- duplicate lessons no matter how well the single-app logic worked. Moving
-- the flag into the database itself means every deployment checks the same
-- source of truth, regardless of which URL loads it.

alter table studio_settings add column if not exists last_autotopup_date date;
