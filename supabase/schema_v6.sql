-- Play Studio Manager — v6: instruments, rooms, absence-decision flow
-- Run this AFTER schema.sql through schema_v5.sql, in Supabase SQL Editor.

alter table lessons add column if not exists instrument text;
alter table lessons add column if not exists room text;

alter table lessons drop constraint if exists lessons_status_check;
alter table lessons add constraint lessons_status_check
  check (status in ('scheduled','attended','absent','missed-teacher','missed-student','rescheduled','cancelled'));

alter table teacher_rates add column if not exists instrument text;
alter table teacher_rates drop constraint if exists teacher_rates_teacher_id_course_key;
