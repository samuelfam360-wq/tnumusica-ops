-- Play Studio Manager — v3 addition: a 'cancelled' lesson status
-- Run this AFTER schema.sql and schema_v2.sql, in Supabase SQL Editor.

alter table lessons drop constraint if exists lessons_status_check;
alter table lessons add constraint lessons_status_check
  check (status in ('scheduled','attended','missed-teacher','missed-student','rescheduled','cancelled'));
