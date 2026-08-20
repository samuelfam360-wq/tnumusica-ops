-- Play Studio Manager — v20: teacher-side lesson plans + suggested replacement times
-- Run this in Supabase SQL Editor. Safe to run more than once.

-- Let teachers add/edit/remove teaching-plan notes too (previously admin-only)
drop policy if exists "teacher insert lesson_plans" on lesson_plans;
create policy "teacher insert lesson_plans" on lesson_plans for insert with check (auth.role() = 'authenticated');
drop policy if exists "teacher update lesson_plans" on lesson_plans;
create policy "teacher update lesson_plans" on lesson_plans for update using (auth.role() = 'authenticated');
drop policy if exists "teacher delete lesson_plans" on lesson_plans;
create policy "teacher delete lesson_plans" on lesson_plans for delete using (auth.role() = 'authenticated');

-- A teacher can propose a replacement date/time for a lesson they owe, without
-- committing to it themselves — admin reviews and finalizes via Reschedule.
-- Not blocked by the existing teacher-update trigger (that only guards
-- price/paid/teacher_id/student_id/date/time on the lesson itself).
alter table lessons add column if not exists suggested_date date;
alter table lessons add column if not exists suggested_time text;
alter table lessons add column if not exists suggested_note text;
