-- Play Studio Manager — v28: per-instrument status (active / temporary stop / terminated / graduated)
-- Run this in Supabase SQL Editor. Safe to run more than once.
--
-- students.status already tracks the student's overall standing. This adds
-- the same concept at the instrument level, since a student can have one
-- instrument active and another paused/stopped/graduated independently.

alter table students add column if not exists instrument_status text not null default 'active'
  check (instrument_status in ('active','paused','terminated','graduated'));
alter table student_instruments add column if not exists status text not null default 'active'
  check (status in ('active','paused','terminated','graduated'));
