-- Play Studio Manager — v32: trial lessons + temporary-stop tracking
-- Run this in Supabase SQL Editor. Safe to run more than once.

-- Per-lesson trial pricing by grade/level, separate from the existing
-- default_price_child/adult (which are monthly-rate suggestions). A trial
-- is always a one-off, so it needs its own per-lesson figure.
alter table course_levels add column if not exists trial_price_child numeric;
alter table course_levels add column if not exists trial_price_adult numeric;

-- Marks a student record created from the Trial Lesson form, so they can be
-- told apart from a regular enrolled student (e.g. excluded from normal
-- health checks expecting a full weekly schedule).
alter table students add column if not exists is_trial boolean not null default false;

-- Remembers the month a "Temporary stop" took effect, so Resume can default
-- sensibly and the student's profile can show why their schedule is empty.
alter table students add column if not exists paused_from date;
