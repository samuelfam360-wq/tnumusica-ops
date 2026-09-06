-- Play Studio Manager — v18: fix "Courses taught" checkbox failing with a 400
--
-- teacher_rates.course was created NOT NULL in schema_v4.sql, before the
-- instrument column existed. The "Courses taught" checkboxes only set
-- `instrument`, so the insert has always violated that NOT NULL constraint —
-- that's the 400 error in the console. Dropping it here since course is
-- optional now that instrument-based rates exist too.
-- Run this in Supabase SQL Editor.

alter table teacher_rates alter column course drop not null;
