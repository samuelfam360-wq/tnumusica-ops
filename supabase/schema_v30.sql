-- Play Studio Manager — v30: prevent duplicate lesson rows at the database level
-- Run this in Supabase SQL Editor. Safe to run more than once.
--
-- Why this exists: v29 fixed one specific cause of duplicate lessons (two live
-- deployments both running the auto-top-up on the same day). But that only
-- closes that one path — any other bug, retry, or race condition that inserts
-- the same lesson twice would still get through, because nothing in the
-- database itself was stopping it. This adds that stop: a partial unique index
-- so the database rejects a second "live" lesson for the same
-- student + teacher + date + time + instrument, no matter what code path
-- tried to create it. Cancelled and rescheduled rows are excluded on purpose —
-- those are meant to sit alongside a replacement in the same slot.
--
-- IMPORTANT: run the cleanup in the app's Health Check tab ("Duplicate lesson
-- rows") FIRST, before running this — if any duplicates still exist in the
-- table, this index creation will fail until they're removed.

create unique index if not exists lessons_no_duplicates
  on lessons (student_id, teacher_id, date, time, coalesce(instrument, ''))
  where status not in ('cancelled', 'rescheduled');
