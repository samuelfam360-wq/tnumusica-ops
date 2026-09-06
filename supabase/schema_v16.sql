-- Play Studio Manager — v16: give the student's primary (first) instrument
-- the same shape as student_instruments (duration, default teacher, room),
-- so "Instrument 1" on the Edit student form is a full instrument record
-- just like any instrument added afterwards.
-- Run this AFTER schema.sql through schema_v15.sql, in Supabase SQL Editor.

alter table students add column if not exists duration_min int default 30;
alter table students add column if not exists teacher_id uuid references teachers(id) on delete set null;
alter table students add column if not exists room text;
